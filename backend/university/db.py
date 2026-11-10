"""Ma'lumotlar bazasi: faqat PostgreSQL (`SITE_DATABASE_URL`).

* Ulanishlar puli (`psycopg_pool`): har bir so'rov o'z ulanishida — parallel so'rovlar bir-birini kutmaydi.
* Tranzaksiya oqim (thread) bo'yicha: `db.transaction()` ichidagi barcha so'rovlar bitta ulanishda; ichma-ich chaqirilsa —
  eng tashqi blok yakunlaydi (COMMIT / ROLLBACK). Tranzaksiyadan tashqaridagi so'rov — avtomatik commit.
* SQL — PostgreSQL'ning o'z sintaksisida (`%s` parametrlar, `ON CONFLICT`, `= ANY(%s)`, `jsonb`…); tarjima qilinmaydi.
* Takrorlanadigan so'rovlar avtomatik «prepared statement» bo'ladi (psycopg `prepare_threshold`).
* Parametr turi ustundan/kontekstdan olinadi (`unknown`): masalan INTEGER ustunga '5' yoki True yozish mumkin.
* Qatorlar: `r["ustun"]`, `r[0]`, `dict(r)`, `r.keys()`.
"""
from __future__ import annotations

import hashlib
import os
import re
import threading
import time
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path

COUNTER = [0]  # bajarilgan so'rovlar soni (profil va testlar uchun)


class DatabaseNotConfigured(RuntimeError):
    pass


def database_url() -> str:
    """`SITE_DATABASE_URL` (postgresql://…); parol alohida faylda bo'lishi mumkin (`SITE_DATABASE_PASSWORD_FILE`, Docker)."""
    url = (os.environ.get("SITE_DATABASE_URL") or "").strip()
    if not url.startswith(("postgres://", "postgresql://")):
        raise DatabaseNotConfigured(
            "PostgreSQL manzili berilmagan: SITE_DATABASE_URL=postgresql://user:parol@host:5432/university "
            "(Docker'da avtomatik; ./run.sh lokal PostgreSQL'ni o'zi ishga tushiradi)")
    pw_file = os.environ.get("SITE_DATABASE_PASSWORD_FILE") or ""
    if pw_file and "@" in url and ":" not in url.split("://", 1)[1].split("@", 1)[0]:
        # parol fayli bazaning o'zi tomonidan yaratiladi (docker-compose) — tayyor bo'lishini kutamiz
        for _ in range(120):
            p = Path(pw_file)
            if p.exists() and p.read_text().strip():
                from urllib.parse import quote  # noqa: PLC0415

                scheme, rest = url.split("://", 1)
                user, host = rest.split("@", 1)
                url = f"{scheme}://{user}:{quote(p.read_text().strip(), safe='')}@{host}"
                break
            time.sleep(1)
    return url


def schema_for(data_dir: Path) -> str:
    """Testlar uchun: har bir ma'lumotlar papkasi — alohida PostgreSQL sxemasi (`SITE_DATABASE_SCHEMA=auto`)."""
    v = (os.environ.get("SITE_DATABASE_SCHEMA") or "").strip()
    if v == "auto":
        return "t_" + hashlib.sha1(str(data_dir).encode()).hexdigest()[:16]
    return re.sub(r"[^a-z0-9_]", "", v.lower())


# ====================================================================== qatorlar
class Row(tuple):
    """Indeks, ustun nomi (katta-kichik harfsiz), `keys()`, `dict(row)`."""

    def __new__(cls, values, keys, index):
        r = tuple.__new__(cls, values)
        r._k = keys
        r._i = index
        return r

    def __getitem__(self, key):
        if isinstance(key, str):
            i = self._i.get(key)
            if i is None:
                i = self._i.get(key.lower())
            if i is None:
                raise IndexError(f"No item with that key: {key}")
            return tuple.__getitem__(self, i)
        return tuple.__getitem__(self, key)

    def keys(self):
        return list(self._k)

    def get(self, key, default=None):
        try:
            return self[key]
        except IndexError:
            return default


def _row_factory(cursor):
    keys = [d.name for d in (cursor.description or [])]
    index: dict[str, int] = {}
    for i, k in enumerate(keys):
        index.setdefault(k, i)
        index.setdefault(k.lower(), i)
    return lambda values: Row(values, keys, index)


class Result:
    """Bajarilgan so'rov natijasi (ulanish pulga qaytgandan keyin ham o'qiladi)."""

    __slots__ = ("_rows", "rowcount")

    def __init__(self, rows: list, rowcount: int):
        self._rows = rows
        self.rowcount = rowcount

    def fetchall(self) -> list:
        r, self._rows = self._rows, []
        return r

    def fetchone(self):
        return self._rows.pop(0) if self._rows else None

    def __iter__(self):
        return iter(self.fetchall())


# ====================================================================== turlar
def _adapters(conn) -> None:
    from psycopg.adapt import Dumper, Loader  # noqa: PLC0415

    class _Unknown(Dumper):
        oid = 0  # «unknown» — turni PostgreSQL ustun/kontekstdan aniqlaydi

        def dump(self, obj):
            if isinstance(obj, bool):
                return b"1" if obj else b"0"
            return str(obj).encode()

    class _Num(Loader):
        # SUM/AVG (numeric) → int yoki float (Decimal emas — JSON va arifmetika uchun)
        def load(self, data):
            v = Decimal(bytes(data).decode())
            return int(v) if v == v.to_integral_value() and abs(v) < 2**63 else float(v)

    for t in (int, float, str, bool, Decimal):
        conn.adapters.register_dumper(t, _Unknown)
    conn.adapters.register_loader("numeric", _Num)


# ====================================================================== ulanishlar puli
class Database:
    def __init__(self, url: str, schema: str = ""):
        from psycopg_pool import ConnectionPool  # noqa: PLC0415

        import psycopg  # noqa: PLC0415

        self._errors = psycopg
        self.url = url
        self.schema = schema
        self._listeners: list[threading.Thread] = []
        self._stop = threading.Event()
        self._local = threading.local()
        if schema:  # sxema birinchi ulanishdan oldin bo'lishi kerak (search_path)
            self._ensure_schema(url, schema)
        size = max(2, int(os.environ.get("SITE_DATABASE_POOL", "20") or 20))
        self.pool = ConnectionPool(
            url, min_size=1, max_size=size, timeout=60, max_idle=300, open=False, name="university",
            kwargs={"autocommit": True, "row_factory": _row_factory, "connect_timeout": 5},
            configure=self._configure)
        last = None
        for _ in range(60):  # konteynerlar bir vaqtda ishga tushadi — baza tayyor bo'lguncha kutiladi
            try:
                self.pool.open(wait=True, timeout=5)
                break
            except Exception as e:  # noqa: BLE001
                last = e
                time.sleep(1)
        else:
            raise RuntimeError(f"PostgreSQL'ga ulanib bo'lmadi: {last}")

    @staticmethod
    def _ensure_schema(url: str, schema: str) -> None:
        import psycopg  # noqa: PLC0415

        for _ in range(60):
            try:
                with psycopg.connect(url, autocommit=True, connect_timeout=5) as c:
                    c.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
                return
            except psycopg.OperationalError:
                time.sleep(1)

    def _configure(self, conn) -> None:
        _adapters(conn)
        conn.execute("SET TIME ZONE 'UTC'")
        if self.schema:
            conn.execute(f'SET search_path TO "{self.schema}"')

    def close(self) -> None:
        self._stop.set()
        try:
            self.pool.close(timeout=5)
        except Exception:  # noqa: BLE001
            pass

    # ---------------------------------------------------------------- tranzaksiya
    @contextmanager
    def transaction(self, snapshot: bool = False):
        """Yozish tranzaksiyasi (oqim bo'yicha). `snapshot=True` — butun tranzaksiya davomida bir xil holat (zaxira nusxa)."""
        loc = self._local
        if getattr(loc, "conn", None) is not None:
            loc.depth += 1
            try:
                yield self
            finally:
                loc.depth -= 1
            return
        hooks: list = []
        with self.pool.connection() as conn:
            conn.execute("BEGIN ISOLATION LEVEL REPEATABLE READ" if snapshot else "BEGIN")
            loc.conn, loc.depth, loc.hooks = conn, 1, hooks
            try:
                yield self
            except BaseException:
                loc.conn = None
                try:
                    conn.execute("ROLLBACK")
                except Exception:  # noqa: BLE001
                    pass
                raise
            else:
                loc.conn = None
                conn.execute("COMMIT")
            finally:
                loc.conn, loc.depth, loc.hooks = None, 0, None
        for fn in hooks:
            fn()

    def after_commit(self, fn) -> None:
        """`fn` tranzaksiya muvaffaqiyatli yakunlangandan keyin chaqiriladi (tranzaksiyadan tashqarida — darhol; ROLLBACK'da — chaqirilmaydi)."""
        hooks = getattr(self._local, "hooks", None)
        if self.in_transaction and hooks is not None:
            hooks.append(fn)
        else:
            fn()

    # ---------------------------------------------------------------- LISTEN / NOTIFY
    def channel(self, name: str) -> str:
        """Kanal nomi sxema bo'yicha alohida (bir bazada bir nechta o'rnatish yoki test sxemalari bo'lsa)."""
        return f"uni_{name}_{self.schema}" if self.schema else f"uni_{name}"

    def notify(self, channel: str, payload: str = "") -> None:
        """Tranzaksiya ichida — COMMIT bo'lganda yetkaziladi (barcha jarayonlarga, shu jarayonning o'ziga ham)."""
        self.execute("SELECT pg_notify(%s, %s)", (channel, payload))

    def listen(self, channel: str, on_message, on_reset, ready: threading.Event) -> None:
        """Alohida ulanishda `LISTEN`. Ulanish uzilsa (xabarlar yo'qolgan bo'lishi mumkin) — `on_reset()`, `ready` tushiriladi, qayta ulanadi."""
        import psycopg  # noqa: PLC0415

        def run():
            while not self._stop.is_set():
                try:
                    with psycopg.connect(self.url, autocommit=True, connect_timeout=5) as conn:
                        conn.execute(f'LISTEN "{channel}"')
                        on_reset()
                        ready.set()
                        while not self._stop.is_set():
                            for n in conn.notifies(timeout=2):
                                on_message(n.payload)
                except Exception:  # noqa: BLE001
                    pass
                ready.clear()
                on_reset()
                self._stop.wait(1)

        t = threading.Thread(target=run, name=f"pg-listen-{channel}", daemon=True)
        t.start()
        self._listeners.append(t)

    @property
    def in_transaction(self) -> bool:
        return getattr(self._local, "conn", None) is not None

    @contextmanager
    def _conn(self):
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            yield conn
        else:
            with self.pool.connection() as c:
                yield c

    # ---------------------------------------------------------------- so'rovlar
    def execute(self, sql: str, args=None) -> Result:
        COUNTER[0] += 1
        if self.in_transaction:
            return self._run(self._local.conn, sql, args)
        for attempt in (0, 1):
            with self.pool.connection() as conn:
                try:
                    return self._run(conn, sql, args)
                except self._errors.OperationalError:
                    # pulda turgan ulanishni server yopgan bo'lsa (qayta ishga tushish, tarmoq) — pul uni tashlaydi, bir marta qayta urinamiz.
                    # Har olishda tekshirish (`check=`) har bir so'rovga qo'shimcha aylanma yo'l qo'shardi.
                    if attempt or not conn.broken:
                        raise
        raise AssertionError("unreachable")

    @staticmethod
    def _run(conn, sql: str, args) -> Result:
        cur = conn.execute(sql, args if args else None)
        return Result(cur.fetchall() if cur.description else [], cur.rowcount)

    def executescript(self, script: str) -> Result:
        """Bir nechta so'rov (parametrsiz, `;` bilan) — sxema yaratish uchun."""
        COUNTER[0] += 1
        with self._conn() as conn:
            conn.execute(script)
        return Result([], -1)

    def executemany(self, sql: str, seq) -> Result:
        seq = list(seq)
        if not seq:
            return Result([], 0)
        COUNTER[0] += 1
        with self._conn() as conn, conn.cursor() as cur:
            cur.executemany(sql, seq)
            return Result([], cur.rowcount)

    def copy_to(self, table: str, cols: list[str], out) -> int:
        """Jadvalni CSV ko'rinishida yozish (COPY … TO STDOUT) — zaxira nusxa uchun."""
        qc = ", ".join(f'"{c}"' for c in cols)
        n = 0
        with self._conn() as conn, conn.cursor() as cur, cur.copy(f'COPY "{table}" ({qc}) TO STDOUT WITH (FORMAT csv, HEADER true)') as cp:
            for chunk in cp:
                out.write(bytes(chunk))
                n += 1
        return n

    def copy_from(self, table: str, cols: list[str], src) -> None:
        """CSV'dan jadvalga yozish (COPY … FROM STDIN) — zaxiradan tiklash va eski bazani ko'chirish uchun."""
        qc = ", ".join(f'"{c}"' for c in cols)
        with self._conn() as conn, conn.cursor() as cur, cur.copy(f'COPY "{table}" ({qc}) FROM STDIN WITH (FORMAT csv, HEADER true)') as cp:
            while True:
                buf = src.read(1 << 20)
                if not buf:
                    break
                cp.write(buf)

    def copy_rows(self, table: str, cols: list[str], rows) -> int:
        """Ko'p qatorni tez yozish (COPY, binar emas — turlar ustundan)."""
        qc = ", ".join(f'"{c}"' for c in cols)
        n = 0
        with self._conn() as conn, conn.cursor() as cur, cur.copy(f'COPY "{table}" ({qc}) FROM STDIN') as cp:
            for r in rows:
                cp.write_row([(int(v) if isinstance(v, bool) else v) for v in r])
                n += 1
        return n

    # ---------------------------------------------------------------- sxema
    def columns(self, table: str) -> list[str]:
        """Yoziladigan ustunlar (hisoblanadigan — GENERATED — ustunlar kirmaydi), jadvaldagi tartibda."""
        return [r[0] for r in self.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = %s "
            "AND is_generated = 'NEVER' ORDER BY ordinal_position",
            (table.lower(),)).fetchall()]

    def has_table(self, name: str) -> bool:
        return bool(self.execute("SELECT to_regclass(%s) IS NOT NULL", (name.lower(),)).fetchone()[0])

    def tables(self) -> list[str]:
        return [r[0] for r in self.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type='BASE TABLE' ORDER BY table_name").fetchall()]

    def reset_sequence(self, table: str, col: str = "id") -> None:
        self.execute(f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), COALESCE((SELECT MAX({col}) FROM {table}), 0) + 1, false)")
