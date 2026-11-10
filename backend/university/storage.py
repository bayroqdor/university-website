"""Sayt ma'lumotlari (PostgreSQL): kontent, foydalanuvchilar (rollar bilan), obunachilar, xabarlar, media, statistika.

Kontent bitta `items` jadvalida saqlanadi (turlari: news, announce, page, program, faculty, department, staff, partner, event, document).
Foydalanuvchilar `users` jadvalida: admin (boshqaruv paneli; bo'limlar — rol bo'yicha, `roles.py`), teacher (professor-o'qituvchi), staff (xodim), student.
O'quv jarayoni jadvallari (guruhlar, fanlar, dars jadvali, davomat, baholar…) — `academic.py` (AcademicMixin).
Statistika: tashrif buyuruvchi (cookie orqali), tashrif (sessiya, 30 daqiqa faolsizlikkacha),
sahifa ko'rishlar (bir sahifa 30 daqiqa ichida qayta ochilsa — sahifani yangilash — hisoblanmaydi)
va maqolani o'qish (chuqurlik va vaqt bo'yicha, kuniga bir marta).
"""
from __future__ import annotations

import base64
import copy
import hashlib
import hmac
import json
import os
import secrets
import threading
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .academic import AcademicMixin
from .db import Database, Row, database_url, schema_for

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore

SESSION_DAYS = 30
VISIT_GAP_MIN = 30  # shu vaqtdan ko'p faolsizlik — yangi tashrif
PV_DEDUPE_MIN = 30  # shu vaqt ichida bir sahifani qayta ochish (refresh) — yangi ko'rish emas

ROLES = ("admin", "teacher", "staff", "student")
PORTAL_ROLES = ("teacher", "staff", "student")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _now() -> str:
    return now_utc().isoformat(timespec="seconds")


def _tz():
    name = os.environ.get("SITE_TZ", "Asia/Tashkent")
    try:
        return ZoneInfo(name) if ZoneInfo else timezone(timedelta(hours=5))
    except Exception:  # noqa: BLE001
        return timezone(timedelta(hours=5))


def local_now() -> datetime:
    return datetime.now(_tz())


def local_today() -> date:
    return local_now().date()


# ------------------------------------------------------------------ parollar
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    n, r, p = 2**14, 8, 1
    dk = hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, dklen=32)
    return f"scrypt${n}${r}${p}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, dk = stored.split("$")
        calc = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(calc, base64.b64decode(dk))
    except Exception:  # noqa: BLE001
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


USER_FIELDS = ("id", "login", "name", "email", "role", "group_id", "active", "created", "last_login")
ITEM_COLS = ("id", "kind", "slug", "status", "title", "sort", "featured", "published_at", "created", "updated")


class Storage(AcademicMixin):
    def __init__(self, data_dir: str | os.PathLike | None = None):
        self.dir = Path(data_dir or os.environ.get("SITE_DATA_DIR", "./var")).resolve()
        self.dir.mkdir(parents=True, exist_ok=True)
        self.media_dir = self.dir / "media"
        self.media_dir.mkdir(exist_ok=True)
        # PostgreSQL (SITE_DATABASE_URL): ulanishlar puli, oqim bo'yicha tranzaksiyalar
        self.db = Database(database_url(), schema_for(self.dir))
        self._conn = self.db  # so'rovlar: self._conn.execute(…) — joriy tranzaksiyada yoki puldagi ulanishda
        self._kv_start()
        legacy = self.dir / "site.sqlite3"
        if legacy.exists() and not self.db.has_table("kv"):
            # eski o'rnatish: SQLite fayli bir marta PostgreSQL'ga ko'chiriladi (sxema avval yaratiladi)
            self._init()
            self._init_academic()
            from .legacy_sqlite import import_sqlite  # noqa: PLC0415

            import_sqlite(legacy, self)
        self._init()
        self._init_academic()
        self._migrate_roles()

    def close(self) -> None:
        self.db.close()

    def _tx(self, snapshot: bool = False):
        """Yozish tranzaksiyasi: muvaffaqiyatda commit, xatoda rollback. Ichma-ich chaqirilsa — eng tashqi blok yakunlaydi."""
        return self.db.transaction(snapshot)

    def _q(self, sql: str, args: tuple = ()) -> list[Row]:
        return self.db.execute(sql, args).fetchall()

    def _one(self, sql: str, args: tuple = ()):
        r = self.db.execute(sql, args).fetchone()
        return r[0] if r is not None else None

    # ------------------------------------------------------------------ sxema yordamchilari
    def columns(self, table: str) -> set[str]:
        """Jadval ustunlari nomlari (jadval bo'lmasa — bo'sh to'plam)."""
        return set(self.db.columns(table))

    def has_table(self, name: str) -> bool:
        return self.db.has_table(name)

    def add_column(self, table: str, col: str, decl: str) -> None:
        """Mavjud bazaga yangi ustun (bor bo'lsa — hech narsa qilinmaydi)."""
        self.db.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {decl}")

    # ------------------------------------------------------------------ schema
    def _init(self) -> None:
        with self._tx():
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT, role TEXT NOT NULL DEFAULT 'student',
                    group_id TEXT, active BIGINT NOT NULL DEFAULT 1, pw_hash TEXT NOT NULL, created TEXT NOT NULL, last_login TEXT,
                    data TEXT NOT NULL DEFAULT '{}');
                CREATE INDEX IF NOT EXISTS ix_users_role ON users(role, active);
                CREATE INDEX IF NOT EXISTS ix_users_group ON users(group_id);
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created TEXT NOT NULL,
                    expires TEXT NOT NULL, ip TEXT, ua TEXT);
                CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);
                CREATE TABLE IF NOT EXISTS items (
                    id TEXT PRIMARY KEY, kind TEXT NOT NULL, slug TEXT, status TEXT NOT NULL DEFAULT 'draft',
                    title TEXT NOT NULL DEFAULT '', sort BIGINT NOT NULL DEFAULT 0, featured BIGINT NOT NULL DEFAULT 0,
                    published_at TEXT, created TEXT NOT NULL, updated TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}');
                CREATE UNIQUE INDEX IF NOT EXISTS ux_items_slug ON items(kind, slug) WHERE slug IS NOT NULL AND slug <> '';
                CREATE INDEX IF NOT EXISTS ix_items_kind ON items(kind, status, published_at);
                CREATE TABLE IF NOT EXISTS media (
                    id TEXT PRIMARY KEY, filename TEXT NOT NULL, original TEXT, mime TEXT NOT NULL, size BIGINT NOT NULL,
                    width BIGINT, height BIGINT, created TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS subscribers (
                    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, status TEXT NOT NULL,
                    token TEXT NOT NULL, unsub_token TEXT NOT NULL, source TEXT, created TEXT NOT NULL, created_day TEXT NOT NULL,
                    confirmed TEXT, unsubscribed TEXT, lang TEXT);
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT, body TEXT NOT NULL,
                    created TEXT NOT NULL, read BIGINT NOT NULL DEFAULT 0, ip TEXT, phone TEXT);
                CREATE TABLE IF NOT EXISTS newsletters (
                    id TEXT PRIMARY KEY, item_id TEXT, subject TEXT NOT NULL, created TEXT NOT NULL, status TEXT NOT NULL,
                    total BIGINT NOT NULL DEFAULT 0, sent BIGINT NOT NULL DEFAULT 0, failed BIGINT NOT NULL DEFAULT 0, finished TEXT);
                CREATE TABLE IF NOT EXISTS email_log (
                    id BIGSERIAL PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, recipient TEXT NOT NULL,
                    subject TEXT, status TEXT NOT NULL, error TEXT);
                CREATE TABLE IF NOT EXISTS visitors (
                    vid TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, device TEXT, browser TEXT, os TEXT, lang TEXT);
                CREATE TABLE IF NOT EXISTS visits (
                    id BIGSERIAL PRIMARY KEY, vid TEXT NOT NULL, started TEXT NOT NULL, last TEXT NOT NULL,
                    day TEXT NOT NULL, landing TEXT, referrer TEXT, pages BIGINT NOT NULL DEFAULT 0,
                    device TEXT, browser TEXT, os TEXT, lang TEXT, utm TEXT);
                CREATE TABLE IF NOT EXISTS pageviews (
                    id BIGSERIAL PRIMARY KEY, ts TEXT NOT NULL, day TEXT NOT NULL, hour BIGINT NOT NULL, wday BIGINT NOT NULL,
                    vid TEXT NOT NULL, visit_id BIGINT NOT NULL, path TEXT NOT NULL, kind TEXT, item_id TEXT);
                CREATE TABLE IF NOT EXISTS reads (
                    vid TEXT NOT NULL, item_id TEXT NOT NULL, day TEXT NOT NULL, seconds BIGINT NOT NULL DEFAULT 0,
                    depth DOUBLE PRECISION NOT NULL DEFAULT 0, counted BIGINT NOT NULL DEFAULT 0, PRIMARY KEY (vid, item_id, day));
                CREATE INDEX IF NOT EXISTS ix_pv_day ON pageviews(day);
                CREATE INDEX IF NOT EXISTS ix_pv_vid_path ON pageviews(vid, path, ts);
                CREATE INDEX IF NOT EXISTS ix_pv_item ON pageviews(item_id);
                CREATE INDEX IF NOT EXISTS ix_visits_day ON visits(day);
                CREATE INDEX IF NOT EXISTS ix_visits_vid ON visits(vid, last);
                CREATE INDEX IF NOT EXISTS ix_reads_item ON reads(item_id, day);
                CREATE INDEX IF NOT EXISTS ix_reads_day ON reads(day);
                """
            )

    def _migrate_roles(self) -> None:
        """Eski «scheduler» (o'quv bo'limi) hisoblari — «O'quv bo'limi» rolidagi administrator."""
        rows = self._q("SELECT id, data FROM users WHERE role='scheduler'")
        if not rows:
            return
        with self._tx():
            for r in rows:
                d = json.loads(r["data"] or "{}")
                d["role_id"] = "study"
                self._conn.execute("UPDATE users SET role='admin', data=%s WHERE id=%s", (json.dumps(d, ensure_ascii=False), r["id"]))

    # ------------------------------------------------------------------ kv
    # Sozlamalar juda ko'p o'qiladi (har bir sahifada o'nlab marta), kam yoziladi — jarayon xotirasida keshlanadi.
    # Yozilganda: shu jarayonda COMMIT'dan keyin o'chiriladi, boshqa jarayonlarga NOTIFY orqali xabar beriladi.
    # LISTEN ulanishi yo'q bo'lsa (uzilgan) — kesh ishlatilmaydi. Tranzaksiya ichida — har doim bazadan (o'z yozuvini ko'rish uchun).
    def _kv_start(self) -> None:
        self._kv: dict[str, str | None] = {}
        self._kv_gen = 0
        self._kv_lock = threading.Lock()
        self._kv_live = threading.Event()
        self._kv_chan = self.db.channel("kv")
        self.db.listen(self._kv_chan, self._kv_drop, lambda: self._kv_drop("*"), self._kv_live)
        self._kv_live.wait(5)

    def _kv_drop(self, key: str) -> None:
        with self._kv_lock:
            self._kv_gen += 1
            if key == "*":
                self._kv.clear()
            else:
                self._kv.pop(key, None)

    def kv_version(self) -> int:
        """Har qanday sozlama o'zgarganda oshadi — undan hosil qilingan keshlar uchun (masalan, `Service.site()`)."""
        return self._kv_gen if self._kv_live.is_set() and not self.db.in_transaction else -1

    def _kv_raw(self, key: str) -> str | None:
        if self.db.in_transaction or not self._kv_live.is_set():
            return self._one("SELECT value FROM kv WHERE key=%s", (key,))
        try:
            return self._kv[key]
        except KeyError:
            pass
        gen = self._kv_gen
        v = self._one("SELECT value FROM kv WHERE key=%s", (key,))
        with self._kv_lock:
            if gen == self._kv_gen:  # o'qish davomida o'zgarmagan bo'lsa
                self._kv[key] = v
        return v

    def kv_get(self, key: str, default=None):
        v = self._kv_raw(key)
        return json.loads(v) if v is not None else copy.deepcopy(default)

    def kv_put(self, key: str, value) -> None:
        with self._tx():
            self._conn.execute("INSERT INTO kv(key, value) VALUES(%s, %s) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, json.dumps(value, ensure_ascii=False)))
            self.db.notify(self._kv_chan, key)
            self.db.after_commit(lambda: self._kv_drop(key))

    def kv_invalidate(self) -> None:
        """Jadval to'g'ridan-to'g'ri o'zgartirilganda (zaxiradan tiklash, ko'chirish) — barcha jarayonlarda kesh tozalanadi."""
        self.db.notify(self._kv_chan, "*")
        self.db.after_commit(lambda: self._kv_drop("*"))

    # ------------------------------------------------------------------ users (barcha rollar)
    @staticmethod
    def _user(r: Row) -> dict:
        d = {k: r[k] for k in USER_FIELDS}
        d["active"] = bool(d["active"])
        d["data"] = json.loads(r["data"] or "{}")
        return d

    def user_count(self, role: str | None = None) -> int:
        if role:
            return int(self._one("SELECT COUNT(*) FROM users WHERE role=%s", (role,)) or 0)
        return int(self._one("SELECT COUNT(*) FROM users") or 0)

    def create_user(self, login: str, name: str, password: str, role: str = "student", email: str = "", group_id: str | None = None, data: dict | None = None, uid: str | None = None) -> dict:
        uid = uid or uuid.uuid4().hex[:12]
        if role not in ROLES:
            raise ValueError("invalid_role")
        with self._tx():
            self._conn.execute(
                "INSERT INTO users(id, login, name, email, role, group_id, pw_hash, created, data) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (uid, login.strip().lower(), name.strip(), (email or "").strip(), role, group_id or None, hash_password(password), _now(), json.dumps(data or {}, ensure_ascii=False)),
            )
        return self.get_user(uid)

    def get_user(self, uid: str) -> dict | None:
        r = self._q("SELECT * FROM users WHERE id=%s", (uid,))
        return self._user(r[0]) if r else None

    def find_user(self, login: str):
        r = self._q("SELECT * FROM users WHERE login=%s OR (email<>'' AND lower(email)=%s)", (login.lower(), login.lower()))
        return r[0] if r else None

    def list_users(self, role: str | None = None, group_id: str | None = None, q: str = "", active: bool | None = None) -> list[dict]:
        sql, args = "SELECT * FROM users WHERE 1=1", []
        if role:
            sql += " AND role=%s"
            args.append(role)
        if group_id:
            sql += " AND group_id=%s"
            args.append(group_id)
        if active is not None:
            sql += " AND active=%s"
            args.append(int(active))
        if q:
            sql += " AND (lower(name) LIKE %s OR lower(login) LIKE %s OR lower(email) LIKE %s)"
            args += [f"%{q.lower()}%"] * 3
        sql += " ORDER BY role, name"
        return [self._user(r) for r in self._q(sql, tuple(args))]

    def update_user(self, uid: str, **fields) -> dict | None:
        allowed = {k: v for k, v in fields.items() if k in ("name", "email", "login", "role", "group_id", "active")}
        if "active" in allowed:
            allowed["active"] = int(bool(allowed["active"]))
        if "role" in allowed and allowed["role"] not in ROLES:
            raise ValueError("invalid_role")
        if "password" in fields and fields["password"]:
            allowed["pw_hash"] = hash_password(fields["password"])
        if "data" in fields and isinstance(fields["data"], dict):
            cur = self.get_user(uid)
            allowed["data"] = json.dumps({**(cur["data"] if cur else {}), **fields["data"]}, ensure_ascii=False)
        if allowed:
            with self._tx():
                self._conn.execute(f"UPDATE users SET {', '.join(k + '=%s' for k in allowed)} WHERE id=%s", (*allowed.values(), uid))
        if "password" in fields and fields["password"]:
            self.delete_sessions(uid)
        return self.get_user(uid)

    def user_pw_hash(self, uid: str) -> str | None:
        return self._one("SELECT pw_hash FROM users WHERE id=%s", (uid,))

    def delete_user(self, uid: str) -> None:
        with self._tx():
            self._conn.execute("DELETE FROM sessions WHERE user_id=%s", (uid,))
            self._conn.execute("DELETE FROM users WHERE id=%s", (uid,))

    # sessiyalar
    def create_session(self, uid: str, ip: str, ua: str | None) -> str:
        token = secrets.token_urlsafe(32)
        exp = (now_utc() + timedelta(days=SESSION_DAYS)).isoformat(timespec="seconds")
        with self._tx():
            self._conn.execute("INSERT INTO sessions VALUES(%s,%s,%s,%s,%s,%s)", (_token_hash(token), uid, _now(), exp, ip, (ua or "")[:300]))
            self._conn.execute("UPDATE users SET last_login=%s WHERE id=%s", (_now(), uid))
        return token

    def session_user(self, token: str | None) -> dict | None:
        if not token:
            return None
        r = self._q("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash=%s AND s.expires>=%s AND u.active=1",
                    (_token_hash(token), _now()))
        return self._user(r[0]) if r else None

    def delete_session(self, token: str) -> None:
        with self._tx():
            self._conn.execute("DELETE FROM sessions WHERE token_hash=%s", (_token_hash(token),))

    def delete_sessions(self, uid: str) -> None:
        with self._tx():
            self._conn.execute("DELETE FROM sessions WHERE user_id=%s", (uid,))

    # ------------------------------------------------------------------ items
    @staticmethod
    def _item(r: Row) -> dict:
        d = {k: r[k] for k in ITEM_COLS}
        d["featured"] = bool(d["featured"])
        d.update(json.loads(r["data"] or "{}"))
        return d

    def list_items(self, kind: str, public: bool = False) -> list[dict]:
        return self.list_items_of([kind], public)[kind]

    def list_items_of(self, kinds, public: bool = False) -> dict[str, list[dict]]:
        """Bir nechta tur bitta so'rovda: {tur: [elementlar]} (har tur ichida tartib `list_items` bilan bir xil)."""
        kinds = list(kinds)
        out: dict[str, list[dict]] = {k: [] for k in kinds}
        sql = "SELECT * FROM items WHERE kind = ANY(%s)"
        args: tuple = (kinds,)
        if public:
            sql += " AND status IN ('published', 'scheduled') AND (published_at IS NULL OR published_at<=%s)"
            args += (_now(),)
        sql += " ORDER BY sort ASC, COALESCE(published_at, created) DESC"
        for r in self._q(sql, args):
            out[r["kind"]].append(self._item(r))
        return out

    def get_item(self, iid: str) -> dict | None:
        r = self._q("SELECT * FROM items WHERE id=%s", (iid,))
        return self._item(r[0]) if r else None

    def get_items(self, ids) -> dict[str, dict]:
        """Bir nechta element bitta so'rovda: {id: element}."""
        ids = sorted({i for i in ids if i})
        return {r["id"]: self._item(r) for r in self._q("SELECT * FROM items WHERE id = ANY(%s)", (ids,))} if ids else {}

    def get_item_by_slug(self, kind: str, slug: str, public: bool = True) -> dict | None:
        sql = "SELECT * FROM items WHERE kind=%s AND slug=%s"
        args: tuple = (kind, slug)
        if public:
            sql += " AND status IN ('published', 'scheduled') AND (published_at IS NULL OR published_at<=%s)"
            args += (_now(),)
        r = self._q(sql, args)
        return self._item(r[0]) if r else None

    def slug_taken(self, kind: str, slug: str, exclude: str | None = None) -> bool:
        return bool(self._one("SELECT 1 FROM items WHERE kind=%s AND slug=%s AND id<>%s", (kind, slug, exclude or "")))

    def save_item(self, kind: str, cols: dict, data: dict, iid: str | None = None, new_id: str | None = None) -> dict:
        now = _now()
        with self._tx():
            if iid and self._one("SELECT 1 FROM items WHERE id=%s AND kind=%s", (iid, kind)):
                self._conn.execute(
                    "UPDATE items SET slug=%s, status=%s, title=%s, sort=%s, featured=%s, published_at=%s, updated=%s, data=%s WHERE id=%s",
                    (cols.get("slug"), cols["status"], cols["title"], int(cols.get("sort") or 0), int(bool(cols.get("featured"))), cols.get("published_at"), now, json.dumps(data, ensure_ascii=False), iid),
                )
            else:
                iid = new_id or uuid.uuid4().hex[:12]
                self._conn.execute(
                    "INSERT INTO items(id, kind, slug, status, title, sort, featured, published_at, created, updated, data) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (iid, kind, cols.get("slug"), cols["status"], cols["title"], int(cols.get("sort") or 0), int(bool(cols.get("featured"))), cols.get("published_at"), now, now, json.dumps(data, ensure_ascii=False)),
                )
        return self.get_item(iid)

    def reorder(self, kind: str, ids: list[str]) -> None:
        with self._tx():
            for i, iid in enumerate(ids):
                self._conn.execute("UPDATE items SET sort=%s WHERE id=%s AND kind=%s", (i, iid, kind))

    def delete_item(self, iid: str) -> None:
        with self._tx():
            self._conn.execute("DELETE FROM items WHERE id=%s", (iid,))

    def count_items(self) -> dict:
        rows = self._q(
            "SELECT kind, SUM(CASE WHEN status IN ('published','scheduled') AND (published_at IS NULL OR published_at<=%s) THEN 1 ELSE 0 END) AS pub, COUNT(*) AS total FROM items GROUP BY kind",
            (_now(),),
        )
        return {r["kind"]: {"published": int(r["pub"] or 0), "total": int(r["total"])} for r in rows}

    def due_newsletters(self) -> list[dict]:
        """Nashr qilingan (rejalashtirilgan bo'lsa — vaqti kelgan), «obunachilarga yuborish» belgilangan yangilik, e'lon va tadbirlar."""
        out = []
        for r in self._q("SELECT * FROM items WHERE kind IN ('news','announce','event') AND status IN ('published','scheduled') "
                         "AND (published_at IS NULL OR published_at<=%s)", (_now(),)):
            it = self._item(r)
            if it.get("send_newsletter") and not it.get("newsletter_sent"):
                out.append(it)
        return out

    def claim_newsletter(self, iid: str) -> bool:
        """Yuborishni atomar band qilish: rejalashtiruvchi va qo'lda yuborish bir vaqtda kelsa ham xat bir marta ketadi."""
        with self._tx():
            r = self._q("UPDATE items SET data=(data::jsonb || jsonb_build_object('newsletter_sent', %s::text))::text "
                        "WHERE id=%s AND COALESCE(data::jsonb->>'newsletter_sent', '')='' RETURNING id",
                        (datetime.utcnow().isoformat(timespec="seconds"), iid))
        return bool(r)

    def patch_item_data(self, iid: str, **patch) -> None:
        it = self.get_item(iid)
        if not it:
            return
        with self._tx():
            r = self._q("SELECT data FROM items WHERE id=%s", (iid,))
            data = json.loads(r[0]["data"] or "{}")
            data.update(patch)
            self._conn.execute("UPDATE items SET data=%s WHERE id=%s", (json.dumps(data, ensure_ascii=False), iid))

    # ------------------------------------------------------------------ media
    def add_media(self, filename: str, original: str, mime: str, size: int, width: int | None, height: int | None) -> dict:
        mid = filename.split(".")[0]
        with self._tx():
            self._conn.execute("INSERT INTO media VALUES(%s,%s,%s,%s,%s,%s,%s,%s)", (mid, filename, original[:200], mime, size, width, height, _now()))
        return self.get_media(mid)

    def get_media(self, mid: str) -> dict | None:
        r = self._q("SELECT * FROM media WHERE id=%s", (mid,))
        return dict(r[0]) if r else None

    def list_media(self) -> list[dict]:
        return [dict(r) for r in self._q("SELECT * FROM media ORDER BY created DESC")]

    def delete_media(self, mid: str) -> None:
        m = self.get_media(mid)
        if not m:
            return
        with self._tx():
            self._conn.execute("DELETE FROM media WHERE id=%s", (mid,))
        p = self.media_dir / m["filename"]
        if p.exists():
            p.unlink()
        from .media import delete_blob  # noqa: PLC0415

        delete_blob(self, m["filename"])

    # ------------------------------------------------------------------ subscribers
    def subscriber_by_email(self, email: str) -> dict | None:
        r = self._q("SELECT * FROM subscribers WHERE email=%s", (email.lower(),))
        return dict(r[0]) if r else None

    def subscriber_by_token(self, col: str, token: str) -> dict | None:
        assert col in ("token", "unsub_token")
        r = self._q(f"SELECT * FROM subscribers WHERE {col}=%s", (token,))
        return dict(r[0]) if r else None

    def add_subscriber(self, email: str, name: str = "", status: str = "pending", source: str = "site", lang: str | None = None) -> dict:
        email = email.strip().lower()
        ex = self.subscriber_by_email(email)
        with self._tx():
            if ex:
                self._conn.execute(
                    "UPDATE subscribers SET status=%s, token=%s, name=COALESCE(NULLIF(%s, ''), name), lang=COALESCE(%s, lang), unsubscribed=NULL WHERE id=%s",
                    (status if ex["status"] != "active" else "active", secrets.token_urlsafe(24), name, lang, ex["id"]),
                )
            else:
                self._conn.execute(
                    "INSERT INTO subscribers(id, email, name, status, token, unsub_token, source, created, created_day, confirmed, lang) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (uuid.uuid4().hex[:12], email, name, status, secrets.token_urlsafe(24), secrets.token_urlsafe(24), source, _now(), local_today().isoformat(), _now() if status == "active" else None, lang),
                )
        return self.subscriber_by_email(email)

    def set_subscriber_status(self, sid: str, status: str) -> None:
        col = {"active": "confirmed", "unsubscribed": "unsubscribed"}.get(status)
        with self._tx():
            if col:
                self._conn.execute(f"UPDATE subscribers SET status=%s, {col}=%s WHERE id=%s", (status, _now(), sid))
            else:
                self._conn.execute("UPDATE subscribers SET status=%s WHERE id=%s", (status, sid))

    def list_subscribers(self, status: str | None = None) -> list[dict]:
        if status:
            return [dict(r) for r in self._q("SELECT * FROM subscribers WHERE status=%s ORDER BY created DESC", (status,))]
        return [dict(r) for r in self._q("SELECT * FROM subscribers ORDER BY created DESC")]

    def delete_subscriber(self, sid: str) -> None:
        with self._tx():
            self._conn.execute("DELETE FROM subscribers WHERE id=%s", (sid,))

    # ------------------------------------------------------------------ messages
    def add_message(self, name: str, email: str, subject: str, body: str, ip: str, phone: str = "") -> dict:
        mid = uuid.uuid4().hex[:12]
        with self._tx():
            self._conn.execute("INSERT INTO messages(id, name, email, subject, body, created, ip, phone) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)", (mid, name, email, subject, body, _now(), ip, phone))
        return dict(self._q("SELECT * FROM messages WHERE id=%s", (mid,))[0])

    def list_messages(self) -> list[dict]:
        return [{**dict(r), "read": bool(r["read"])} for r in self._q("SELECT * FROM messages ORDER BY created DESC")]

    def mark_message(self, mid: str, read: bool) -> None:
        with self._tx():
            self._conn.execute("UPDATE messages SET read=%s WHERE id=%s", (int(read), mid))

    def delete_message(self, mid: str) -> None:
        with self._tx():
            self._conn.execute("DELETE FROM messages WHERE id=%s", (mid,))

    # ------------------------------------------------------------------ newsletters / email log
    def add_newsletter(self, item_id: str | None, subject: str, total: int) -> str:
        nid = uuid.uuid4().hex[:12]
        with self._tx():
            self._conn.execute("INSERT INTO newsletters(id, item_id, subject, created, status, total) VALUES(%s,%s,%s,%s,%s,%s)", (nid, item_id, subject, _now(), "sending", total))
        return nid

    def update_newsletter(self, nid: str, sent: int, failed: int, done: bool = False) -> None:
        with self._tx():
            self._conn.execute(
                "UPDATE newsletters SET sent=%s, failed=%s, status=%s, finished=%s WHERE id=%s",
                (sent, failed, "done" if done else "sending", _now() if done else None, nid),
            )

    def list_newsletters(self) -> list[dict]:
        return [dict(r) for r in self._q("SELECT * FROM newsletters ORDER BY created DESC LIMIT 100")]

    def log_email(self, kind: str, recipient: str, subject: str, status: str, error: str = "") -> None:
        with self._tx():
            self._conn.execute("INSERT INTO email_log(ts, kind, recipient, subject, status, error) VALUES(%s,%s,%s,%s,%s,%s)", (_now(), kind, recipient, subject[:300], status, error[:500]))

    def list_email_log(self, limit: int = 100) -> list[dict]:
        return [dict(r) for r in self._q("SELECT * FROM email_log ORDER BY id DESC LIMIT %s", (limit,))]

    # ------------------------------------------------------------------ statistika (yozish)
    def track_pageview(self, vid: str, path: str, kind: str | None, item_id: str | None, referrer: str, meta: dict) -> dict:
        """Sahifa ko'rishini qayd etish. Qaytaradi: counted (yangi ko'rish), new_visit, visit_id."""
        now = now_utc()
        ts = now.isoformat(timespec="seconds")
        loc = now.astimezone(_tz())
        day = loc.date().isoformat()
        gap = (now - timedelta(minutes=VISIT_GAP_MIN)).isoformat(timespec="seconds")
        dedupe = (now - timedelta(minutes=PV_DEDUPE_MIN)).isoformat(timespec="seconds")
        with self._tx():
            c = self._conn
            if c.execute("SELECT 1 FROM visitors WHERE vid=%s", (vid,)).fetchone():
                c.execute("UPDATE visitors SET last_seen=%s WHERE vid=%s", (ts, vid))
            else:
                c.execute("INSERT INTO visitors VALUES(%s,%s,%s,%s,%s,%s,%s)", (vid, ts, ts, meta.get("device"), meta.get("browser"), meta.get("os"), meta.get("lang")))
            v = c.execute("SELECT id FROM visits WHERE vid=%s AND last>=%s ORDER BY id DESC LIMIT 1", (vid, gap)).fetchone()
            new_visit = v is None
            if new_visit:
                visit_id = c.execute(
                    "INSERT INTO visits(vid, started, last, day, landing, referrer, device, browser, os, lang, utm) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (vid, ts, ts, day, path, referrer, meta.get("device"), meta.get("browser"), meta.get("os"), meta.get("lang"), meta.get("utm")),
                ).fetchone()[0]
            else:
                visit_id = v["id"]
                c.execute("UPDATE visits SET last=%s WHERE id=%s", (ts, visit_id))
            dup = c.execute("SELECT 1 FROM pageviews WHERE vid=%s AND path=%s AND ts>=%s LIMIT 1", (vid, path, dedupe)).fetchone()
            counted = dup is None
            if counted:
                c.execute(
                    "INSERT INTO pageviews(ts, day, hour, wday, vid, visit_id, path, kind, item_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (ts, day, loc.hour, loc.weekday(), vid, visit_id, path, kind, item_id),
                )
                c.execute("UPDATE visits SET pages=pages+1 WHERE id=%s", (visit_id,))
        return {"counted": counted, "new_visit": new_visit, "visit_id": visit_id}

    def track_ping(self, vid: str) -> None:
        now = now_utc()
        ts = now.isoformat(timespec="seconds")
        gap = (now - timedelta(minutes=VISIT_GAP_MIN)).isoformat(timespec="seconds")
        with self._tx():
            self._conn.execute("UPDATE visitors SET last_seen=%s WHERE vid=%s", (ts, vid))
            self._conn.execute("UPDATE visits SET last=%s WHERE id=(SELECT id FROM visits WHERE vid=%s AND last>=%s ORDER BY id DESC LIMIT 1)", (ts, vid, gap))

    def track_read(self, vid: str, item_id: str, seconds: int, depth: float, min_seconds: int) -> bool:
        day = local_today().isoformat()
        with self._tx():
            c = self._conn
            r = c.execute("SELECT seconds, depth, counted FROM reads WHERE vid=%s AND item_id=%s AND day=%s", (vid, item_id, day)).fetchone()
            sec = max(int(seconds), int(r["seconds"]) if r else 0)
            dep = max(float(depth), float(r["depth"]) if r else 0.0)
            counted = bool(r["counted"]) if r else False
            if not counted and dep >= 0.6 and sec >= min_seconds:
                counted = True
            if r:
                c.execute("UPDATE reads SET seconds=%s, depth=%s, counted=%s WHERE vid=%s AND item_id=%s AND day=%s", (sec, dep, int(counted), vid, item_id, day))
            else:
                c.execute("INSERT INTO reads VALUES(%s,%s,%s,%s,%s,%s)", (vid, item_id, day, sec, dep, int(counted)))
        return counted

    def item_counters(self, item_id: str) -> dict:
        return {
            "views": int(self._one("SELECT COUNT(*) FROM pageviews WHERE item_id=%s", (item_id,)) or 0),
            "reads": int(self._one("SELECT COUNT(*) FROM reads WHERE item_id=%s AND counted=1", (item_id,)) or 0),
        }

    def counters_by_item(self, ids) -> dict:
        """Ko'rishlar va o'qishlar faqat berilgan elementlar uchun (indeks bo'yicha) — butun statistika jadvali sanalmaydi."""
        ids = [i for i in ids if i]
        if not ids:
            return {}
        views = {r[0]: r[1] for r in self._q("SELECT item_id, COUNT(*) FROM pageviews WHERE item_id = ANY(%s) GROUP BY item_id", (ids,))}
        reads = {r[0]: r[1] for r in self._q("SELECT item_id, COUNT(*) FROM reads WHERE item_id = ANY(%s) AND counted=1 GROUP BY item_id", (ids,))}
        return {k: {"views": views.get(k, 0), "reads": reads.get(k, 0)} for k in set(views) | set(reads)}

    # ------------------------------------------------------------------ statistika (o'qish)
    def stats(self, days: int = 30) -> dict:
        days = max(1, min(int(days), 365))
        today = local_today()
        start = (today - timedelta(days=days - 1)).isoformat()
        prev_start = (today - timedelta(days=2 * days - 1)).isoformat()
        q, one = self._q, self._one

        def period(a: str, b: str) -> dict:
            # bitta so'rov: tashriflar jadvali bir marta o'qiladi (FILTER), qolganlari — skalyar ichki so'rovlar
            r = q("""SELECT COUNT(DISTINCT vid), COUNT(*), COUNT(*) FILTER (WHERE pages<=1),
                         AVG(EXTRACT(EPOCH FROM (last::timestamptz - started::timestamptz))) FILTER (WHERE pages>1),
                         (SELECT COUNT(*) FROM pageviews WHERE day>=%s AND day<=%s),
                         (SELECT COUNT(*) FROM reads WHERE day>=%s AND day<=%s AND counted=1),
                         (SELECT COUNT(*) FROM subscribers WHERE created_day>=%s AND created_day<=%s AND status='active')
                     FROM visits WHERE day>=%s AND day<=%s""", (a, b) * 4)[0]
            visitors, visits, bounce, dur, pvs, reads, subs = (int(r[0] or 0), int(r[1] or 0), int(r[2] or 0), r[3], int(r[4] or 0), int(r[5] or 0), int(r[6] or 0))
            return {
                "visitors": visitors, "visits": visits, "pageviews": pvs, "reads": reads, "new_subscribers": subs,
                "bounce_rate": (bounce / visits) if visits else 0.0, "avg_duration": float(dur or 0.0),
                "pages_per_visit": (pvs / visits) if visits else 0.0,
            }

        prev_end = (today - timedelta(days=days)).isoformat()
        cur = period(start, today.isoformat())
        prev = period(prev_start, prev_end)
        day_list = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]

        def series(sql: str) -> list[int]:
            m = {r[0]: r[1] for r in q(sql, (start,))}
            return [int(m.get(d, 0)) for d in day_list]

        ser = {
            "days": day_list,
            "visitors": series("SELECT day, COUNT(DISTINCT vid) FROM visits WHERE day>=%s GROUP BY day"),
            "visits": series("SELECT day, COUNT(*) FROM visits WHERE day>=%s GROUP BY day"),
            "pageviews": series("SELECT day, COUNT(*) FROM pageviews WHERE day>=%s GROUP BY day"),
            "reads": series("SELECT day, COUNT(*) FROM reads WHERE day>=%s AND counted=1 GROUP BY day"),
            "subscribers": series("SELECT created_day, COUNT(*) FROM subscribers WHERE created_day>=%s AND status='active' GROUP BY created_day"),
        }
        top_pages = [
            {"path": r["path"], "views": r["n"], "visitors": r["u"]}
            for r in q("SELECT path, COUNT(*) n, COUNT(DISTINCT vid) u FROM pageviews WHERE day>=%s GROUP BY path ORDER BY n DESC LIMIT 12", (start,))
        ]
        top_rows = q("SELECT item_id, MAX(kind) AS kind, COUNT(*) n, COUNT(DISTINCT vid) u FROM pageviews WHERE day>=%s AND item_id IS NOT NULL "
                     "GROUP BY item_id ORDER BY n DESC LIMIT 20", (start,))
        top_ids = [r["item_id"] for r in top_rows]
        titles = {r["id"]: (r["title"], r["slug"], r["kind"]) for r in q("SELECT id, title, slug, kind FROM items WHERE id = ANY(%s)", (top_ids,))} if top_ids else {}
        read_rows = {r["item_id"]: (r["n"], r["s"]) for r in q(
            "SELECT item_id, SUM(counted) n, AVG(seconds) s FROM reads WHERE day>=%s AND item_id = ANY(%s) GROUP BY item_id", (start, top_ids))} if top_ids else {}
        top_items = []
        for r in top_rows:
            t = titles.get(r["item_id"])
            if not t:
                continue
            rn, rs = read_rows.get(r["item_id"], (0, 0))
            top_items.append({"id": r["item_id"], "kind": t[2], "title": t[0], "slug": t[1], "views": r["n"], "visitors": r["u"], "reads": int(rn or 0), "avg_seconds": float(rs or 0), "read_rate": (float(rn or 0) / r["u"]) if r["u"] else 0.0})

        def dist(col: str) -> list[dict]:
            return [{"name": r[0] or "—", "value": r[1]} for r in q(f"SELECT {col}, COUNT(*) FROM visits WHERE day>=%s GROUP BY {col} ORDER BY 2 DESC LIMIT 8", (start,))]

        referrers = [{"name": r[0], "value": r[1]} for r in q("SELECT referrer, COUNT(*) FROM visits WHERE day>=%s AND referrer IS NOT NULL AND referrer<>'' GROUP BY referrer ORDER BY 2 DESC LIMIT 10", (start,))]
        direct = int(one("SELECT COUNT(*) FROM visits WHERE day>=%s AND (referrer IS NULL OR referrer='')", (start,)) or 0)
        heat = [[r[0], r[1], r[2]] for r in q("SELECT wday, hour, COUNT(*) FROM pageviews WHERE day>=%s GROUP BY wday, hour", (start,))]
        live_since = (now_utc() - timedelta(minutes=5)).isoformat(timespec="seconds")
        live = int(one("SELECT COUNT(*) FROM visitors WHERE last_seen>=%s", (live_since,)) or 0)
        live_pages = [{"path": r[0], "n": r[1]} for r in q(
            "SELECT p.path, COUNT(DISTINCT p.vid) FROM pageviews p JOIN visitors v ON v.vid=p.vid WHERE v.last_seen>=%s AND p.ts>=%s GROUP BY p.path ORDER BY 2 DESC LIMIT 6",
            (live_since, (now_utc() - timedelta(minutes=30)).isoformat(timespec="seconds")),
        )]
        landing = [{"name": r[0], "value": r[1]} for r in q("SELECT landing, COUNT(*) FROM visits WHERE day>=%s GROUP BY landing ORDER BY 2 DESC LIMIT 8", (start,))]
        t = q("""SELECT (SELECT COUNT(*) FROM visitors), (SELECT COUNT(*) FROM pageviews), (SELECT COUNT(*) FROM reads WHERE counted=1),
                        (SELECT COUNT(*) FILTER (WHERE status='active') FROM subscribers), (SELECT COUNT(*) FILTER (WHERE status='pending') FROM subscribers),
                        (SELECT COUNT(*) FROM messages WHERE read=0), (SELECT COUNT(DISTINCT vid) FROM visits WHERE day=%s),
                        (SELECT COUNT(*) FROM pageviews WHERE day=%s), (SELECT COUNT(*) FILTER (WHERE role='student') FROM users),
                        (SELECT COUNT(*) FILTER (WHERE role='teacher') FROM users), (SELECT COUNT(*) FROM groups)""", (today.isoformat(),) * 2)[0]
        totals_all = dict(zip(("visitors", "pageviews", "reads", "subscribers", "pending_subscribers", "messages_unread", "today_visitors",
                               "today_pageviews", "students", "teachers", "groups"), (int(x or 0) for x in t)))
        return {
            "days": days, "current": cur, "previous": prev, "series": ser, "top_pages": top_pages, "top_items": top_items,
            "devices": dist("device"), "browsers": dist("browser"), "os": dist("os"), "langs": dist("lang"),
            "referrers": referrers, "direct": direct, "landing": landing, "heat": heat, "live": live, "live_pages": live_pages,
            "totals": totals_all, "items": self.count_items(), "today": today.isoformat(),
        }

    def export_counts(self) -> dict:
        return {t: int(self._one(f"SELECT COUNT(*) FROM {t}") or 0) for t in ("items", "media", "subscribers", "messages", "pageviews", "visits", "visitors", "users")}
