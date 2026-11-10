"""Kutubxona: qog'oz va elektron fond — katalog, nusxalar, berish/qaytarish, bron/navbat, jarimalar,
elektron fayllar (PDF/EPUB/audio), o'qish joyi, xatcho'p/belgilar, baho va izohlar, javonlar, o'qituvchi ro'yxatlari,
statistika va audit jurnali.

Atamalar: kitob (nashr) — lib_books; nusxa (fizik ekzemplyar, inventar raqami bilan) — lib_copies;
berish — lib_loans; bron/navbat — lib_reservations. «5 nusxadan 2 tasi bo'sh» = lib_copies.status='available' soni.
"""
from __future__ import annotations

import json
import re
import secrets
import threading
import uuid
from datetime import date, datetime, timedelta, timezone

from .names import translit

STATUSES = ("available", "loaned", "reserved", "repair", "lost", "writtenoff")
FILE_KINDS = ("pdf", "epub", "audio")
# elektron fayl kimga ochiq: «public» — hammaga (mehmonlar ham o'qiydi), «registered» — tizimga kirganlarga,
# «teachers» — faqat o'qituvchilarga, «faculty» — faqat tanlangan kafedra(lar)ga. Eski «all» = «registered».
ACCESS = ("public", "registered", "teachers", "faculty")


def access_value(v, default: str = "registered") -> str:
    v = str(v or "").strip().lower()
    if v in ("all", "users", "logged"):
        return "registered"
    if v in ("everyone", "guest", "guests", "open"):
        return "public"
    return v if v in ACCESS else default
SHELF_KINDS = ("reading", "want", "done")
LANGS = ("uz", "ru", "en", "ko", "kaa", "tr", "de", "other")

DEFAULTS = {
    "loan_days_student": 14, "loan_days_teacher": 30, "limit_student": 3, "limit_teacher": 7,
    "renew_days": 7, "max_renewals": 1, "fine_per_day": 1000, "lost_coef": 2.0, "hold_days": 2,
    "allow_download": False, "auto_approve": False, "max_file_mb": 200, "currency": "so‘m",
    "review_edit_hours": 24, "rate_min_percent": 10,
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _id() -> str:
    return uuid.uuid4().hex[:12]


def _j(v, default):
    try:
        return json.loads(v) if v else default
    except (TypeError, ValueError):
        return default


def _s(v, n: int = 300) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()[:n]


def _list(v, n: int = 30, ln: int = 200) -> list[str]:
    if isinstance(v, str):
        v = re.split(r"[;,\n]+", v)
    out: list[str] = []
    for x in v or []:
        x = _s(x, ln)
        if x and x not in out:
            out.append(x)
    return out[:n]


def norm(s: str) -> str:
    """Qidiruv uchun: kirill → lotin, apostroflar va registr farqi yo'q («китоб» = «kitob»)."""
    t = translit(s or "")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", t)).strip()


def isbn_clean(v: str) -> str:
    s = re.sub(r"[^0-9Xx]", "", str(v or "")).upper()
    return s if len(s) in (10, 13) else ""


def is_teacher(u: dict) -> bool:
    return u.get("role") in ("teacher", "staff", "admin")


class LibError(ValueError):
    """Foydalanuvchiga ko'rsatiladigan qoida buzilishi (kod frontendda tarjima qilinadi)."""


class Library:
    def __init__(self, st):
        self.st = st
        self.lock = threading.RLock()
        self._init()

    # ------------------------------------------------------------------ sxema
    def _init(self) -> None:
        with self.st._tx() as c:
            c.executescript("""
                CREATE TABLE IF NOT EXISTS lib_books (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, authors TEXT NOT NULL DEFAULT '[]', isbn TEXT, publisher TEXT,
                    year BIGINT, lang TEXT, pages BIGINT, cover TEXT, annotation TEXT, categories TEXT NOT NULL DEFAULT '[]',
                    faculties TEXT NOT NULL DEFAULT '[]', keywords TEXT NOT NULL DEFAULT '[]', udc TEXT, bbk TEXT, price DOUBLE PRECISION,
                    rating_avg DOUBLE PRECISION NOT NULL DEFAULT 0, rating_count BIGINT NOT NULL DEFAULT 0, sort_title TEXT NOT NULL DEFAULT '',
                    created TEXT NOT NULL, updated TEXT NOT NULL, created_by TEXT);
                CREATE INDEX IF NOT EXISTS lib_books_isbn ON lib_books(isbn);
                CREATE INDEX IF NOT EXISTS lib_books_sort ON lib_books(sort_title);
                CREATE TABLE IF NOT EXISTS lib_fts (book_id TEXT, src TEXT, body TEXT);
                CREATE INDEX IF NOT EXISTS lib_fts_book_id_ix ON lib_fts(book_id);
                CREATE TABLE IF NOT EXISTS lib_copies (
                    id TEXT PRIMARY KEY, book_id TEXT NOT NULL, inv TEXT NOT NULL UNIQUE, barcode TEXT, location TEXT, status TEXT NOT NULL DEFAULT 'available',
                    note TEXT, price DOUBLE PRECISION, created TEXT NOT NULL, updated TEXT NOT NULL, seen TEXT);
                CREATE INDEX IF NOT EXISTS lib_copies_book ON lib_copies(book_id, status);
                CREATE INDEX IF NOT EXISTS lib_copies_bar ON lib_copies(barcode);
                CREATE TABLE IF NOT EXISTS lib_loans (
                    id TEXT PRIMARY KEY, copy_id TEXT NOT NULL, book_id TEXT NOT NULL, user_id TEXT NOT NULL, issued TEXT NOT NULL, due TEXT NOT NULL,
                    returned TEXT, renewals BIGINT NOT NULL DEFAULT 0, issued_by TEXT, returned_by TEXT, lost BIGINT NOT NULL DEFAULT 0);
                CREATE INDEX IF NOT EXISTS lib_loans_user ON lib_loans(user_id, returned);
                CREATE INDEX IF NOT EXISTS lib_loans_copy ON lib_loans(copy_id, returned);
                CREATE INDEX IF NOT EXISTS lib_loans_book ON lib_loans(book_id, issued);
                CREATE TABLE IF NOT EXISTS lib_reservations (
                    id TEXT PRIMARY KEY, book_id TEXT NOT NULL, user_id TEXT NOT NULL, created TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting',
                    notified TEXT, expires TEXT, copy_id TEXT, closed TEXT);
                CREATE INDEX IF NOT EXISTS lib_res_book ON lib_reservations(book_id, status, created);
                CREATE TABLE IF NOT EXISTS lib_fines (
                    id TEXT PRIMARY KEY, loan_id TEXT, user_id TEXT NOT NULL, amount DOUBLE PRECISION NOT NULL, kind TEXT NOT NULL DEFAULT 'late',
                    status TEXT NOT NULL DEFAULT 'unpaid', note TEXT, created TEXT NOT NULL, resolved TEXT, resolved_by TEXT);
                CREATE INDEX IF NOT EXISTS lib_fines_user ON lib_fines(user_id, status);
                CREATE TABLE IF NOT EXISTS lib_files (
                    id TEXT PRIMARY KEY, book_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT, sort BIGINT NOT NULL DEFAULT 0, path TEXT NOT NULL,
                    orig TEXT, size BIGINT NOT NULL DEFAULT 0, pages BIGINT, duration DOUBLE PRECISION, access TEXT NOT NULL DEFAULT 'all',
                    faculty_ids TEXT NOT NULL DEFAULT '[]', indexed BIGINT NOT NULL DEFAULT 0, toc TEXT, created TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS lib_files_book ON lib_files(book_id, sort);
                CREATE TABLE IF NOT EXISTS lib_progress (
                    user_id TEXT NOT NULL, file_id TEXT NOT NULL, book_id TEXT NOT NULL, loc TEXT, percent DOUBLE PRECISION NOT NULL DEFAULT 0,
                    seconds BIGINT NOT NULL DEFAULT 0, pages BIGINT NOT NULL DEFAULT 0, opened TEXT NOT NULL, updated TEXT NOT NULL,
                    completed BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(user_id, file_id));
                CREATE INDEX IF NOT EXISTS lib_progress_upd ON lib_progress(user_id, updated);
                CREATE INDEX IF NOT EXISTS lib_progress_book ON lib_progress(book_id, opened);
                CREATE TABLE IF NOT EXISTS lib_activity (user_id TEXT NOT NULL, day TEXT NOT NULL, seconds BIGINT NOT NULL DEFAULT 0,
                    pages BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day));
                CREATE TABLE IF NOT EXISTS lib_marks (
                    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, file_id TEXT NOT NULL, kind TEXT NOT NULL, loc TEXT NOT NULL, text TEXT, note TEXT,
                    color TEXT, created TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS lib_marks_user ON lib_marks(user_id, file_id);
                CREATE TABLE IF NOT EXISTS lib_ratings (user_id TEXT NOT NULL, book_id TEXT NOT NULL, stars BIGINT NOT NULL, updated TEXT NOT NULL,
                    PRIMARY KEY(user_id, book_id));
                CREATE TABLE IF NOT EXISTS lib_reviews (
                    id TEXT PRIMARY KEY, book_id TEXT NOT NULL, user_id TEXT NOT NULL, parent_id TEXT, text TEXT NOT NULL, stars BIGINT,
                    status TEXT NOT NULL DEFAULT 'pending', anonymous BIGINT NOT NULL DEFAULT 0, reason TEXT, created TEXT NOT NULL,
                    edited TEXT, moderated_by TEXT);
                CREATE INDEX IF NOT EXISTS lib_reviews_book ON lib_reviews(book_id, status);
                CREATE TABLE IF NOT EXISTS lib_review_votes (review_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, note TEXT,
                    created TEXT NOT NULL, PRIMARY KEY(review_id, user_id, kind));
                CREATE TABLE IF NOT EXISTS lib_shelves (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'custom',
                    created TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS lib_shelves_user ON lib_shelves(user_id);
                CREATE TABLE IF NOT EXISTS lib_shelf_items (shelf_id TEXT NOT NULL, book_id TEXT NOT NULL, added TEXT NOT NULL, PRIMARY KEY(shelf_id, book_id));
                CREATE TABLE IF NOT EXISTS lib_course_lists (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, subject_id TEXT, subject_name TEXT NOT NULL,
                    semester_id TEXT, title TEXT, created TEXT NOT NULL, updated TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS lib_course_items (list_id TEXT NOT NULL, book_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'main', note TEXT,
                    sort BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(list_id, book_id));
                CREATE TABLE IF NOT EXISTS lib_prefs (user_id TEXT PRIMARY KEY, channels TEXT NOT NULL DEFAULT '["inapp","email"]', tg_chat TEXT,
                    tg_token TEXT, font BIGINT NOT NULL DEFAULT 1, updated TEXT);
                CREATE TABLE IF NOT EXISTS lib_sent (key TEXT PRIMARY KEY, created TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS lib_audit (id TEXT PRIMARY KEY, at TEXT NOT NULL, actor_id TEXT, actor TEXT, action TEXT NOT NULL,
                    entity TEXT, entity_id TEXT, old TEXT, new TEXT);
                CREATE INDEX IF NOT EXISTS lib_audit_at ON lib_audit(at);
            """)
            # to'liq matnli qidiruv: tsvector bir marta hisoblanib saqlanadi (GIN indeks), so'rovda qayta hisoblanmaydi
            c.executescript("""
                ALTER TABLE lib_fts ADD COLUMN IF NOT EXISTS tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(body, ''))) STORED;
                CREATE INDEX IF NOT EXISTS lib_fts_tsv_gin ON lib_fts USING GIN (tsv);
                DROP INDEX IF EXISTS lib_fts_tsv_ix;
            """)
            # muqova: avtomatik chizilganmi (cover_auto) va qaysi ma'lumotdan (cover_sig) — nom/muallif o'zgarsa qayta chiziladi
            c.executescript("""
                ALTER TABLE lib_books ADD COLUMN IF NOT EXISTS cover_auto BIGINT NOT NULL DEFAULT 0;
                ALTER TABLE lib_books ADD COLUMN IF NOT EXISTS cover_sig TEXT;
                UPDATE lib_files SET access='registered' WHERE access IS NULL OR access NOT IN ('public','registered','teachers','faculty');
                ALTER TABLE lib_files ALTER COLUMN access SET DEFAULT 'registered';
            """)

    # ------------------------------------------------------------------ sozlamalar va audit
    def settings(self) -> dict:
        v = self.st.kv_get("lib_settings") or {}
        return DEFAULTS | {k: v[k] for k in DEFAULTS if k in v}

    def save_settings(self, data: dict, actor: dict) -> dict:
        cur = self.settings()
        out = dict(cur)
        for k, dv in DEFAULTS.items():
            if k not in data:
                continue
            v = data[k]
            if isinstance(dv, bool):
                out[k] = bool(v)
            elif isinstance(dv, int):
                out[k] = max(0, min(int(float(v or 0)), 100000000))
            elif isinstance(dv, float):
                out[k] = max(0.0, min(float(v or 0), 1000.0))
            else:
                out[k] = _s(v, 20)
        out["loan_days_student"] = max(1, out["loan_days_student"])
        out["loan_days_teacher"] = max(1, out["loan_days_teacher"])
        out["max_file_mb"] = max(1, min(out["max_file_mb"], 2048))
        self.st.kv_put("lib_settings", out)
        self.audit(actor, "settings", "settings", "", cur, out)
        return out

    def audit(self, actor: dict | None, action: str, entity: str = "", entity_id: str = "", old=None, new=None) -> None:
        with self.st._tx() as c:
            c.execute("INSERT INTO lib_audit(id, at, actor_id, actor, action, entity, entity_id, old, new) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                      (_id(), _now(), (actor or {}).get("id"), (actor or {}).get("name") or (actor or {}).get("login") or "tizim", action, entity, entity_id,
                       json.dumps(old, ensure_ascii=False, default=str)[:20000] if old is not None else None,
                       json.dumps(new, ensure_ascii=False, default=str)[:20000] if new is not None else None))

    def audit_list(self, q: str = "", limit: int = 300) -> list[dict]:
        sql, args = "SELECT * FROM lib_audit", []
        if q:
            sql += " WHERE lower(action) LIKE %s OR lower(actor) LIKE %s OR entity_id=%s"
            args += [f"%{q.lower()}%", f"%{q.lower()}%", q]
        rows = self.st._q(sql + " ORDER BY at DESC LIMIT %s", (*args, limit))
        return [dict(r) | {"old": _j(r["old"], None), "new": _j(r["new"], None)} for r in rows]

    # ------------------------------------------------------------------ kitoblar
    def _book(self, r) -> dict:
        d = dict(r)
        for k in ("authors", "categories", "faculties", "keywords"):
            d[k] = _j(d.get(k), [])
        return d

    def book(self, bid: str) -> dict | None:
        r = self.st._q("SELECT * FROM lib_books WHERE id=%s", (bid,))
        return self._book(r[0]) if r else None

    def clean_book(self, data: dict, cur: dict | None = None) -> dict:
        b = dict(cur or {})
        for k, n in (("title", 400), ("subtitle", 400), ("publisher", 200), ("lang", 10), ("cover", 500), ("udc", 60), ("bbk", 60)):
            if k in data:
                b[k] = _s(data[k], n)
        if "annotation" in data:
            b["annotation"] = str(data["annotation"] or "").strip()[:8000]
        if "isbn" in data:
            b["isbn"] = isbn_clean(data["isbn"]) or _s(data["isbn"], 20)
        for k in ("year", "pages"):
            if k in data:
                try:
                    b[k] = int(str(data[k]).strip()[:6]) if str(data[k] or "").strip() else None
                except ValueError:
                    b[k] = None
        if "price" in data:
            try:
                b["price"] = float(str(data["price"]).replace(" ", "").replace(",", ".")) if str(data["price"] or "").strip() else None
            except ValueError:
                b["price"] = None
        for k in ("authors", "categories", "faculties", "keywords"):
            if k in data:
                b[k] = _list(data[k])
        if not b.get("title"):
            raise LibError("title_required")
        return b

    def save_book(self, data: dict, actor: dict | None, bid: str | None = None, auto_cover: bool = True) -> dict:
        """auto_cover=False — muqova darhol chizilmaydi (ommaviy import), fon vazifasi (backfill_covers) keyin chizadi."""
        cur = self.book(bid) if bid else None
        if bid and not cur:
            raise LibError("not_found")
        b = self.clean_book(data, cur)
        # qo'lda berilgan muqova (yuklangan rasm, sahifa, manzil) avtomatik emas; bo'sh qoldirilsa — avtomatik chiziladi
        manual_cover = "cover" in data and (b.get("cover") or "") != ((cur or {}).get("cover") or "")
        now = _now()
        cols = ("title", "subtitle", "authors", "isbn", "publisher", "year", "lang", "pages", "cover", "annotation", "categories", "faculties",
                "keywords", "udc", "bbk", "price")
        vals = [json.dumps(b.get(k) or [], ensure_ascii=False) if k in ("authors", "categories", "faculties", "keywords") else b.get(k) for k in cols]
        with self.st._tx() as c:
            if cur:
                c.execute(f"UPDATE lib_books SET {', '.join(f'{k}=%s' for k in cols)}, sort_title=%s, updated=%s WHERE id=%s", (*vals, norm(b["title"]), now, bid))
            else:
                bid = _id()
                c.execute(f"INSERT INTO lib_books(id, {', '.join(cols)}, sort_title, created, updated, created_by) VALUES(%s, {', '.join('%s' for _ in cols)}, %s, %s, %s, %s)",
                          (bid, *vals, norm(b["title"]), now, now, (actor or {}).get("id")))
        if manual_cover:
            self._set_cover_flags(bid, auto=False, sig=None, old=cur)
        self._index_meta(bid)
        if auto_cover:
            self.ensure_cover(bid)
        out = self.book(bid)
        self.audit(actor, "book.update" if cur else "book.create", "book", bid, {k: cur.get(k) for k in cols} if cur else None, {k: out.get(k) for k in cols})
        return out

    # ------------------------------------------------------------------ muqova
    def _media_id(self, url: str | None) -> str | None:
        m = re.fullmatch(r"/media/([a-f0-9]{16})\.[a-z0-9]+", url or "")
        return m.group(1) if m else None

    def _set_cover_flags(self, bid: str, auto: bool, sig: str | None, old: dict | None) -> None:
        with self.st._tx() as c:
            c.execute("UPDATE lib_books SET cover_auto=%s, cover_sig=%s WHERE id=%s", (int(auto), sig, bid))
        # eski avtomatik muqova fayli boshqa joyda ishlatilmaydi — o'chiriladi
        if old and old.get("cover_auto") and old.get("cover"):
            cur = self.book(bid) or {}
            mid = self._media_id(old["cover"])
            if mid and cur.get("cover") != old["cover"]:
                try:
                    self.st.delete_media(mid)
                except Exception:  # noqa: BLE001
                    pass

    def set_cover(self, bid: str, url: str, actor: dict | None, auto: bool = False, sig: str | None = None, how: str = "") -> dict:
        """Muqovani o'rnatish (yuklangan rasm, kitob sahifasi, EPUB muqovasi yoki avtomatik)."""
        old = self.book(bid)
        if not old:
            raise LibError("not_found")
        with self.st._tx() as c:
            c.execute("UPDATE lib_books SET cover=%s, updated=%s WHERE id=%s", (url, _now(), bid))
        self._set_cover_flags(bid, auto, sig, old)
        if not auto:
            self.audit(actor, "book.cover", "book", bid, {"cover": old.get("cover")}, {"cover": url, "how": how})
        return self.book(bid)

    def ensure_cover(self, bid: str, force: bool = False) -> bool:
        """Muqova yo'q bo'lsa — kitob ma'lumotidan chiziladi; avtomatik muqova eskirgan bo'lsa (nom, muallif… o'zgargan) — qayta chiziladi.
        Qaytaradi: yangi muqova chizildimi."""
        from . import lib_cover as LC  # noqa: PLC0415
        from .media import MediaError, store_media  # noqa: PLC0415

        with self.lock:
            b = self.book(bid)
            if not b:
                return False
            sig = LC.signature(b)
            if b.get("cover") and not (b.get("cover_auto") and (force or b.get("cover_sig") != sig)):
                return False
            try:
                raw = LC.render(b)
                m = store_media(self.st, raw, "kutubxona-muqova.jpg")
            except (MediaError, OSError, ValueError) as e:
                print(f"library cover: {e}", flush=True)
                return False
            self.set_cover(bid, m["url"], None, auto=True, sig=sig)
            return True

    def backfill_covers(self, limit: int = 100000) -> int:
        """Bir martalik to'ldirish (va keyinchalik fon vazifasida): muqovasiz yoki eskirgan avtomatik muqovali kitoblar."""
        from . import lib_cover as LC  # noqa: PLC0415

        n = 0
        rows = self.st._q("SELECT * FROM lib_books WHERE cover IS NULL OR cover='' OR cover_auto=1 ORDER BY created LIMIT %s", (limit,))
        for r in rows:
            b = self._book(r)
            if b.get("cover") and b.get("cover_sig") == LC.signature(b):
                continue
            if self.ensure_cover(b["id"]):
                n += 1
        return n

    def delete_book(self, bid: str, actor: dict) -> list[str]:
        """Kitob va unga tegishli hamma narsa (berilgan nusxa bo'lsa — rad). Qaytaradi: o'chiriladigan fayl yo'llari."""
        if self.st._one("SELECT COUNT(*) FROM lib_loans WHERE book_id=%s AND returned IS NULL", (bid,)):
            raise LibError("has_active_loans")
        b = self.book(bid)
        paths = [r["path"] for r in self.st._q("SELECT path FROM lib_files WHERE book_id=%s", (bid,))]
        with self.st._tx() as c:
            fids = [r[0] for r in c.execute("SELECT id FROM lib_files WHERE book_id=%s", (bid,)).fetchall()]
            for t in ("lib_copies", "lib_files", "lib_reservations", "lib_ratings", "lib_reviews", "lib_shelf_items", "lib_course_items"):
                c.execute(f"DELETE FROM {t} WHERE book_id=%s", (bid,))
            for fid in fids:
                c.execute("DELETE FROM lib_progress WHERE file_id=%s", (fid,))
                c.execute("DELETE FROM lib_marks WHERE file_id=%s", (fid,))
            c.execute("DELETE FROM lib_fts WHERE book_id=%s", (bid,))
            c.execute("DELETE FROM lib_books WHERE id=%s", (bid,))
        self.audit(actor, "book.delete", "book", bid, {"title": (b or {}).get("title")}, None)
        return paths

    def _index_meta(self, bid: str) -> None:
        b = self.book(bid)
        if not b:
            return
        body = " ".join([b["title"], b.get("subtitle") or "", " ".join(b["authors"]), b.get("isbn") or "", b.get("publisher") or "",
                         " ".join(b["categories"]), " ".join(b["keywords"]), b.get("udc") or "", b.get("bbk") or "", (b.get("annotation") or "")[:3000]])
        with self.st._tx() as c:
            c.execute("DELETE FROM lib_fts WHERE book_id=%s AND src='meta'", (bid,))
            c.execute("INSERT INTO lib_fts(book_id, src, body) VALUES(%s,%s,%s)", (bid, "meta", norm(body)))

    def index_file_text(self, bid: str, fid: str, text: str) -> None:
        with self.st._tx() as c:
            c.execute("DELETE FROM lib_fts WHERE book_id=%s AND src=%s", (bid, f"file:{fid}"))
            if text.strip():
                body = norm(text)[:5_000_000]
                # PostgreSQL: tsvector bitta qiymat uchun ~1 MB bilan cheklangan — matn bo'laklarga bo'linadi
                parts = [body[i:i + 250_000] for i in range(0, len(body), 250_000)]
                for part in parts:
                    c.execute("INSERT INTO lib_fts(book_id, src, body) VALUES(%s,%s,%s)", (bid, f"file:{fid}", part))
            c.execute("UPDATE lib_files SET indexed=1 WHERE id=%s", (fid,))

    # ------------------------------------------------------------------ qidiruv
    @staticmethod
    def _fts_query(q: str) -> str:
        toks = [t for t in norm(q).split(" ") if t][:8]
        return " AND ".join(f'"{t}"*' for t in toks)

    def _pg_fts(self, q: str) -> tuple[dict[str, float], dict[str, str]]:
        """PostgreSQL to'liq matnli qidiruvi (GIN indeks, `simple` lug'at, prefiks bo'yicha): ball — kichik = yaxshi (bm25 kabi)."""
        toks = [re.sub(r"[^\w]", "", t) for t in norm(q).split(" ")]
        toks = [t for t in toks if t][:8]
        if not toks:
            return {}, {}
        tq = " & ".join(f"{t}:*" for t in toks)
        hits: dict[str, float] = {}
        best_file: dict[str, tuple[float, int]] = {}
        rows = self.st._q(
            "SELECT ctid::text AS rid, book_id, src, ts_rank(tsv, q) AS r FROM lib_fts, to_tsquery('simple', %s) q "
            "WHERE tsv @@ q LIMIT 5000", (tq,))
        for r in rows:
            sc = -float(r["r"] or 0) * (1.0 if r["src"] == "meta" else 0.4)
            if r["book_id"] not in hits or sc < hits[r["book_id"]]:
                hits[r["book_id"]] = sc
            if r["src"] != "meta" and (r["book_id"] not in best_file or sc < best_file[r["book_id"]][0]):
                best_file[r["book_id"]] = (sc, r["rid"])
        snippets: dict[str, str] = {}
        top = sorted(best_file.items(), key=lambda x: x[1][0])[:60]  # parcha (snippet) faqat eng yaxshi natijalar uchun — og'ir amal
        for bid, (_sc, rid) in top:
            sn = self.st._one("SELECT ts_headline('simple', body, to_tsquery('simple', %s), 'StartSel=[, StopSel=], MaxWords=14, MinWords=6, MaxFragments=1') "
                              "FROM lib_fts WHERE ctid = CAST(%s AS tid)", (tq, rid))
            if sn:
                snippets[bid] = sn
        return hits, snippets

    def search(self, q: str = "", category: str = "", faculty: str = "", lang: str = "", year_from: int | None = None, year_to: int | None = None,
               fmt: str = "", available: bool = False, sort: str = "", page: int = 1, size: int = 24, ids: list[str] | None = None) -> dict:
        where, args, rank_join, snippets = ["1=1"], [], "", {}
        q = (q or "").strip()
        digits = re.sub(r"[^0-9Xx]", "", q)
        if q:
            fq = self._fts_query(q)
            hits: dict[str, float] = {}
            if fq:
                hits, snippets = self._pg_fts(q)
            if len(digits) >= 10:
                for r in self.st._q("SELECT id FROM lib_books WHERE isbn=%s", (isbn_clean(digits) or digits,)):
                    hits[r["id"]] = -1e9
            if not hits:
                return {"items": [], "total": 0, "page": page, "pages": 0}
            ids = [i for i in hits if ids is None or i in ids]
            rank = hits
        else:
            rank = {}
        if ids is not None:
            if not ids:
                return {"items": [], "total": 0, "page": page, "pages": 0}
            where.append("b.id = ANY(%s)")
            args.append(list(ids))
        if category:
            where.append("b.categories::jsonb ? %s")  # JSON massivda shu qiymat bor
            args.append(category)
        if faculty:
            where.append("b.faculties::jsonb ? %s")
            args.append(faculty)
        if lang:
            where.append("b.lang=%s")
            args.append(lang)
        if year_from:
            where.append("b.year>=%s")
            args.append(int(year_from))
        if year_to:
            where.append("b.year<=%s")
            args.append(int(year_to))
        if fmt == "paper":
            where.append("EXISTS (SELECT 1 FROM lib_copies c WHERE c.book_id=b.id AND c.status NOT IN ('lost','writtenoff'))")
        elif fmt in FILE_KINDS:
            where.append("EXISTS (SELECT 1 FROM lib_files f WHERE f.book_id=b.id AND f.kind=%s)")
            args.append(fmt)
        elif fmt == "ebook":
            where.append("EXISTS (SELECT 1 FROM lib_files f WHERE f.book_id=b.id AND f.kind IN ('pdf','epub'))")
        if available:
            where.append("(EXISTS (SELECT 1 FROM lib_copies c WHERE c.book_id=b.id AND c.status='available') OR EXISTS (SELECT 1 FROM lib_files f WHERE f.book_id=b.id))")
        order = {
            "popular": "pop DESC, b.rating_avg DESC",
            "rating": "b.rating_avg DESC, b.rating_count DESC",
            "new": "b.created DESC",
            "alpha": "b.sort_title ASC",
            "year": "COALESCE(b.year,0) DESC",
        }.get(sort, "")
        sql = (f"SELECT b.*, (SELECT COUNT(*) FROM lib_loans l WHERE l.book_id=b.id) + (SELECT COUNT(*) FROM lib_progress p WHERE p.book_id=b.id) AS pop "
               f"FROM lib_books b WHERE {' AND '.join(where)}")
        rows = self.st._q(sql + (f" ORDER BY {order}" if order else " ORDER BY b.created DESC"), tuple(args))
        if q and not order:
            rows = sorted(rows, key=lambda r: rank.get(r["id"], 0))
        total = len(rows)
        size = max(1, min(size, 100))
        page = max(1, page)
        chunk = rows[(page - 1) * size: page * size]
        items = self.cards([self._book(r) for r in chunk])
        for it in items:
            if it["id"] in snippets:
                it["snippet"] = snippets[it["id"]]
        return {"items": items, "total": total, "page": page, "pages": (total + size - 1) // size}

    def suggest(self, q: str, mode: str = "issue", user_id: str | None = None, limit: int = 8, prefer: str | None = None) -> list[dict]:
        """Berish/qaytarish oynasi uchun: nom (yoki muallif) bo'yicha takliflar — kamida 3 belgi, lotin/kirill farqsiz.
        issue — qog'oz nusxasi bor kitoblar va bo'sh (yoki shu o'quvchiga ajratilgan) nusxalar;
        return — qo'lda turgan nusxalar (user_id berilsa — faqat shu o'quvchidagilar; prefer — shu o'quvchidagilar birinchi)."""
        nq = norm(q)
        if len(nq.replace(" ", "")) < 3:
            return []
        toks = [t for t in (re.sub(r"[^\w]", "", x) for x in nq.split(" ")) if t][:6]
        score: dict[str, tuple] = {}
        if toks:
            tq = " & ".join(f"{t}:*" for t in toks)
            for r in self.st._q("SELECT book_id, MAX(ts_rank(tsv, q)) AS r FROM lib_fts, to_tsquery('simple', %s) q "
                                "WHERE src='meta' AND tsv @@ q GROUP BY book_id ORDER BY 2 DESC LIMIT 300", (tq,)):
                score[r["book_id"]] = (2, -float(r["r"] or 0))
        for r in self.st._q("SELECT id, sort_title FROM lib_books WHERE sort_title LIKE %s LIMIT 300", (f"%{nq}%",)):
            score[r["id"]] = (0 if r["sort_title"].startswith(nq) else 1, score.get(r["id"], (2, 0.0))[1])
        cp = self.copy_by_code(q)
        if cp:
            score[cp["book_id"]] = (-1, 0.0)
        if not score:
            return []
        ids = list(score)
        if mode == "return":
            sql, args = "SELECT DISTINCT book_id FROM lib_loans WHERE returned IS NULL AND book_id = ANY(%s)", [ids]
            if user_id:
                sql += " AND user_id=%s"
                args.append(user_id)
            ids = [r["book_id"] for r in self.st._q(sql, tuple(args))]
            if prefer and not user_id:
                mine = {r["book_id"] for r in self.st._q("SELECT DISTINCT book_id FROM lib_loans WHERE returned IS NULL AND user_id=%s AND book_id = ANY(%s)", (prefer, ids))}
                score = {i: ((0 if i in mine else 1),) + score[i] for i in ids}
        else:
            ids = [r["book_id"] for r in self.st._q("SELECT DISTINCT book_id FROM lib_copies WHERE book_id = ANY(%s) AND status NOT IN ('lost','writtenoff')", (ids,))]
        ids = sorted(ids, key=lambda i: score[i])[:max(1, min(limit, 20))]
        if not ids:
            return []
        books = {r["id"]: self._book(r) for r in self.st._q("SELECT * FROM lib_books WHERE id = ANY(%s)", (ids,))}
        cards = {c["id"]: c for c in self.cards([books[i] for i in ids if i in books])}
        opts: dict[str, list] = {i: [] for i in ids}
        if mode == "return":
            sql = ("SELECT l.id, l.book_id, l.user_id, l.due, l.issued, c.id AS copy_id, c.inv, c.barcode, c.location FROM lib_loans l "
                   "JOIN lib_copies c ON c.id=l.copy_id WHERE l.returned IS NULL AND l.book_id = ANY(%s)")
            args = [ids]
            if user_id:
                sql += " AND l.user_id=%s"
                args.append(user_id)
            today = date.today().isoformat()
            users: dict[str, dict] = {}
            rows = self.st._q(sql + " ORDER BY l.due", tuple(args))
            if prefer:
                rows = sorted(rows, key=lambda r: r["user_id"] != prefer)
            for r in rows:
                if r["user_id"] not in users:
                    u = self.st.get_user(r["user_id"]) or {}
                    users[r["user_id"]] = {"id": u.get("id") or r["user_id"], "name": u.get("name") or "(anonim)", "login": u.get("login") or ""}
                opts[r["book_id"]].append({"copy_id": r["copy_id"], "inv": r["inv"], "barcode": r["barcode"] or "", "location": r["location"] or "",
                                           "status": "loaned", "loan": {"id": r["id"], "due": r["due"], "issued": r["issued"], "overdue": r["due"][:10] < today,
                                                                        "user": users[r["user_id"]]}})
        else:
            ready = {}
            for r in self.st._q("SELECT copy_id, user_id FROM lib_reservations WHERE status='ready' AND book_id = ANY(%s)", (ids,)):
                ready[r["copy_id"]] = r["user_id"]
            for r in self.st._q("SELECT * FROM lib_copies WHERE book_id = ANY(%s) AND status IN ('available','reserved') ORDER BY inv", (ids,)):
                mine = ready.get(r["id"]) == user_id if user_id else False
                if r["status"] == "reserved" and not mine:
                    continue
                if len(opts[r["book_id"]]) < 30:
                    opts[r["book_id"]].append({"copy_id": r["id"], "inv": r["inv"], "barcode": r["barcode"] or "", "location": r["location"] or "",
                                               "status": r["status"], "reserved_for_reader": mine})
        out = []
        for i in ids:
            if i not in cards:
                continue
            c = cards[i]
            out.append({k: c[k] for k in ("id", "title", "subtitle", "authors", "year", "cover", "copies", "free")} | {"options": opts[i]})
        return out

    def cards(self, books: list[dict]) -> list[dict]:
        """Ro'yxat kartochkasi: muqova, nom, muallif, baho, formatlar, «3 nusxadan 1 tasi bo'sh»."""
        if not books:
            return []
        ids = [b["id"] for b in books]
        copies = {r["book_id"]: (r["total"], r["free"]) for r in self.st._q(
            "SELECT book_id, COUNT(*) FILTER (WHERE status NOT IN ('lost','writtenoff')) AS total, "
            "COUNT(*) FILTER (WHERE status='available') AS free FROM lib_copies WHERE book_id = ANY(%s) GROUP BY book_id", (ids,))}
        kinds: dict[str, set] = {}
        for r in self.st._q("SELECT book_id, kind FROM lib_files WHERE book_id = ANY(%s)", (ids,)):
            kinds.setdefault(r["book_id"], set()).add(r["kind"])
        out = []
        for b in books:
            total, free = copies.get(b["id"], (0, 0))
            fm = (["paper"] if total else []) + [k for k in FILE_KINDS if k in kinds.get(b["id"], set())]
            out.append({"id": b["id"], "title": b["title"], "subtitle": b.get("subtitle") or "", "authors": b["authors"], "cover": b.get("cover") or "",
                        "year": b.get("year"), "lang": b.get("lang") or "", "rating": round(b.get("rating_avg") or 0, 2), "ratings": b.get("rating_count") or 0,
                        "formats": fm, "copies": total or 0, "free": free or 0, "categories": b["categories"][:3]})
        return out

    def facets(self) -> dict:
        # sanash bazada (jsonb massiv elementlari bo'yicha) — kitoblar Python'ga yuklanmaydi
        d: dict[str, dict[str, int]] = {"c": {}, "f": {}, "l": {}}
        for r in self.st._q("""
                SELECT 'c', v, COUNT(*) FROM lib_books, jsonb_array_elements_text(COALESCE(NULLIF(categories, ''), '[]')::jsonb) v GROUP BY v
                UNION ALL
                SELECT 'f', v, COUNT(*) FROM lib_books, jsonb_array_elements_text(COALESCE(NULLIF(faculties, ''), '[]')::jsonb) v GROUP BY v
                UNION ALL
                SELECT 'l', lang, COUNT(*) FROM lib_books WHERE lang IS NOT NULL AND lang <> '' GROUP BY lang"""):
            d[r[0]][r[1]] = int(r[2])
        t = self.st._q("""SELECT MIN(year), MAX(year), COUNT(*), (SELECT COUNT(*) FROM lib_copies WHERE status NOT IN ('lost','writtenoff')),
                                 (SELECT COUNT(*) FROM lib_files) FROM lib_books""")[0]
        top = lambda x: [{"name": k, "count": v} for k, v in sorted(x.items(), key=lambda i: (-i[1], i[0]))]  # noqa: E731
        return {"categories": top(d["c"]), "faculties": top(d["f"]), "langs": top(d["l"]),
                "years": [t[0], t[1]] if t[0] else [None, None], "total": int(t[2] or 0), "copies": int(t[3] or 0), "files": int(t[4] or 0)}

    # ------------------------------------------------------------------ nusxalar
    def _copy(self, r) -> dict:
        return dict(r)

    def copies(self, bid: str) -> list[dict]:
        return [self._copy(r) for r in self.st._q("SELECT * FROM lib_copies WHERE book_id=%s ORDER BY inv", (bid,))]

    def copy_by_code(self, code: str) -> dict | None:
        code = (code or "").strip()
        r = self.st._q("SELECT * FROM lib_copies WHERE inv=%s OR barcode=%s LIMIT 1", (code, code))
        return self._copy(r[0]) if r else None

    def next_inv(self) -> str:
        n = int(self.st.kv_get("lib_inv_seq") or 0)
        while True:
            n += 1
            inv = f"UNI-{n:06d}"
            if not self.st._one("SELECT 1 FROM lib_copies WHERE inv=%s", (inv,)):
                self.st.kv_put("lib_inv_seq", n)
                return inv

    def add_copies(self, bid: str, count: int = 1, invs: list[str] | None = None, location: str = "", price=None, actor: dict | None = None) -> list[dict]:
        if not self.book(bid):
            raise LibError("not_found")
        invs = [i for i in (invs or []) if i]
        made = []
        now = _now()
        for i in range(max(count, len(invs))):
            inv = _s(invs[i], 60) if i < len(invs) else self.next_inv()
            if self.st._one("SELECT 1 FROM lib_copies WHERE inv=%s", (inv,)):
                raise LibError(f"inv_taken:{inv}")
            cid = _id()
            with self.st._tx() as c:
                c.execute("INSERT INTO lib_copies(id, book_id, inv, barcode, location, status, price, created, updated) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                          (cid, bid, inv, inv, _s(location, 120), "available", price, now, now))
            made.append(cid)
        self.audit(actor, "copy.create", "book", bid, None, {"count": len(made)})
        out = [self._copy(r) for r in self.st._q("SELECT * FROM lib_copies WHERE id = ANY(%s)", (made,))] if made else []
        for cp in out:
            self._serve_queue(cp["book_id"], cp["id"])
        return out

    def update_copy(self, cid: str, data: dict, actor: dict) -> dict:
        cur = self.st._q("SELECT * FROM lib_copies WHERE id=%s", (cid,))
        if not cur:
            raise LibError("not_found")
        cur = dict(cur[0])
        new = dict(cur)
        for k, n in (("location", 120), ("note", 500), ("barcode", 80), ("inv", 60)):
            if k in data:
                new[k] = _s(data[k], n)
        if "price" in data:
            try:
                new["price"] = float(data["price"]) if str(data["price"] or "").strip() else None
            except ValueError:
                pass
        if "status" in data and data["status"] in STATUSES and data["status"] != cur["status"]:
            if cur["status"] == "loaned" or data["status"] == "loaned":
                raise LibError("use_issue_return")  # berish/qaytarish orqali
            new["status"] = data["status"]
        if new["inv"] != cur["inv"] and self.st._one("SELECT 1 FROM lib_copies WHERE inv=%s AND id<>%s", (new["inv"], cid)):
            raise LibError(f"inv_taken:{new['inv']}")
        with self.st._tx() as c:
            c.execute("UPDATE lib_copies SET inv=%s, barcode=%s, location=%s, status=%s, note=%s, price=%s, updated=%s WHERE id=%s",
                      (new["inv"], new["barcode"], new["location"], new["status"], new["note"], new["price"], _now(), cid))
        self.audit(actor, "copy.update", "copy", cid, cur, new)
        if new["status"] == "available" and cur["status"] != "available":
            self._serve_queue(new["book_id"], cid)
        return self._copy(self.st._q("SELECT * FROM lib_copies WHERE id=%s", (cid,))[0])

    def delete_copy(self, cid: str, actor: dict) -> None:
        cur = self.st._q("SELECT * FROM lib_copies WHERE id=%s", (cid,))
        if not cur:
            raise LibError("not_found")
        if cur[0]["status"] == "loaned":
            raise LibError("has_active_loans")
        with self.st._tx() as c:
            c.execute("DELETE FROM lib_copies WHERE id=%s", (cid,))
        self.audit(actor, "copy.delete", "copy", cid, dict(cur[0]), None)

    def availability(self, bid: str) -> dict:
        """Talabaga: jami / bo'sh, eng yaqin qaytish sanasi, navbat uzunligi (kimdaligi ko'rsatilmaydi)."""
        rows = self.st._q("SELECT status FROM lib_copies WHERE book_id=%s AND status NOT IN ('lost','writtenoff')", (bid,))
        total = len(rows)
        free = sum(1 for r in rows if r["status"] == "available")
        nxt = self.st._one("SELECT MIN(due) FROM lib_loans WHERE book_id=%s AND returned IS NULL", (bid,))
        queue = self.st._one("SELECT COUNT(*) FROM lib_reservations WHERE book_id=%s AND status IN ('waiting','ready')", (bid,)) or 0
        return {"total": total, "free": free, "next_due": nxt, "queue": queue}

    # ------------------------------------------------------------------ o'quvchi holati
    def user_loans(self, uid: str, active: bool | None = True) -> list[dict]:
        sql = ("SELECT l.*, c.inv, c.location, b.title, b.authors, b.cover FROM lib_loans l JOIN lib_copies c ON c.id=l.copy_id "
               "JOIN lib_books b ON b.id=l.book_id WHERE l.user_id=%s")
        if active is True:
            sql += " AND l.returned IS NULL"
        elif active is False:
            sql += " AND l.returned IS NOT NULL"
        out = []
        today = date.today().isoformat()
        for r in self.st._q(sql + " ORDER BY l.issued DESC", (uid,)):
            d = dict(r) | {"authors": _j(r["authors"], [])}
            d["overdue"] = not d["returned"] and d["due"][:10] < today
            out.append(d)
        return out

    def unpaid(self, uid: str) -> float:
        return float(self.st._one("SELECT COALESCE(SUM(amount),0) FROM lib_fines WHERE user_id=%s AND status='unpaid'", (uid,)) or 0)

    def overdue_count(self, uid: str) -> int:
        return int(self.st._one("SELECT COUNT(*) FROM lib_loans WHERE user_id=%s AND returned IS NULL AND substr(due,1,10)<%s", (uid, date.today().isoformat())) or 0)

    def limit_of(self, u: dict) -> int:
        s = self.settings()
        return int(s["limit_teacher"] if is_teacher(u) else s["limit_student"])

    def loan_days(self, u: dict) -> int:
        s = self.settings()
        return int(s["loan_days_teacher"] if is_teacher(u) else s["loan_days_student"])

    def check_can_borrow(self, u: dict) -> list[str]:
        """Qoidalar: qarzdorlik (to'lanmagan jarima yoki muddati o'tgan kitob) yo'q, limit oshmagan."""
        problems = []
        if self.unpaid(u["id"]) > 0:
            problems.append("has_fines")
        if self.overdue_count(u["id"]):
            problems.append("has_overdue")
        if self.st._one("SELECT COUNT(*) FROM lib_loans WHERE user_id=%s AND returned IS NULL", (u["id"],)) >= self.limit_of(u):
            problems.append("limit_reached")
        return problems

    # ------------------------------------------------------------------ berish / qaytarish
    def issue(self, u: dict, code: str, actor: dict, force: bool = False) -> dict:
        with self.lock:
            cp = self.copy_by_code(code)
            if not cp:
                raise LibError("copy_not_found")
            if cp["status"] in ("loaned",):
                raise LibError("copy_loaned")
            if cp["status"] in ("repair", "lost", "writtenoff"):
                raise LibError(f"copy_{cp['status']}")
            problems = self.check_can_borrow(u)
            if problems and not force:
                raise LibError(problems[0])
            res = None
            if cp["status"] == "reserved":
                res = self.st._q("SELECT * FROM lib_reservations WHERE copy_id=%s AND status='ready'", (cp["id"],))
                if res and res[0]["user_id"] != u["id"] and not force:
                    raise LibError("copy_reserved_other")
            else:
                # bo'sh nusxa — lekin navbatda boshqalar bor va bo'sh nusxalar navbatdagilarga yetmasa
                waiting = self.st._q("SELECT user_id FROM lib_reservations WHERE book_id=%s AND status='waiting' ORDER BY created", (cp["book_id"],))
                if waiting and waiting[0]["user_id"] != u["id"] and not force:
                    free = self.st._one("SELECT COUNT(*) FROM lib_copies WHERE book_id=%s AND status='available'", (cp["book_id"],)) or 0
                    if free <= len([w for w in waiting if w["user_id"] != u["id"]]):
                        raise LibError("queue_first")
            now = datetime.now(timezone.utc)
            due = (date.today() + timedelta(days=self.loan_days(u))).isoformat()
            lid = _id()
            with self.st._tx() as c:
                c.execute("INSERT INTO lib_loans(id, copy_id, book_id, user_id, issued, due, issued_by) VALUES(%s,%s,%s,%s,%s,%s,%s)",
                          (lid, cp["id"], cp["book_id"], u["id"], now.isoformat(timespec="seconds"), due, actor.get("id")))
                c.execute("UPDATE lib_copies SET status='loaned', updated=%s WHERE id=%s", (_now(), cp["id"]))
                c.execute("UPDATE lib_reservations SET status='fulfilled', closed=%s WHERE book_id=%s AND user_id=%s AND status IN ('waiting','ready')",
                          (_now(), cp["book_id"], u["id"]))
                if res and res[0]["user_id"] != u["id"]:  # majburan berildi — boshqaning bronini navbatga qaytarish
                    c.execute("UPDATE lib_reservations SET status='waiting', copy_id=NULL, notified=NULL, expires=NULL WHERE id=%s", (res[0]["id"],))
            self.audit(actor, "loan.issue", "copy", cp["id"], None, {"user": u["id"], "due": due, "forced": bool(force and problems)})
            self.mark_shelf(u["id"], cp["book_id"], "reading")
            return self.loan(lid)

    def loan(self, lid: str) -> dict | None:
        r = self.st._q("SELECT l.*, c.inv, b.title FROM lib_loans l JOIN lib_copies c ON c.id=l.copy_id JOIN lib_books b ON b.id=l.book_id WHERE l.id=%s", (lid,))
        return dict(r[0]) if r else None

    def return_copy(self, code: str, actor: dict, lost: bool = False) -> dict:
        with self.lock:
            cp = self.copy_by_code(code)
            if not cp:
                raise LibError("copy_not_found")
            ln = self.st._q("SELECT * FROM lib_loans WHERE copy_id=%s AND returned IS NULL", (cp["id"],))
            if not ln:
                raise LibError("copy_not_loaned")
            ln = dict(ln[0])
            s = self.settings()
            fine = None
            today = date.today()
            late = (today - date.fromisoformat(ln["due"][:10])).days
            with self.st._tx() as c:
                c.execute("UPDATE lib_loans SET returned=%s, returned_by=%s, lost=%s WHERE id=%s", (_now(), actor.get("id"), int(lost), ln["id"]))
                if late > 0 and float(s["fine_per_day"]) > 0:
                    fine = {"id": _id(), "amount": round(late * float(s["fine_per_day"]), 2), "kind": "late", "note": f"{late} kun kechikish"}
                    c.execute("INSERT INTO lib_fines(id, loan_id, user_id, amount, kind, status, note, created) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
                              (fine["id"], ln["id"], ln["user_id"], fine["amount"], "late", "unpaid", fine["note"], _now()))
                if lost:
                    price = cp.get("price") or (self.book(cp["book_id"]) or {}).get("price") or 0
                    amount = round(float(price) * float(s["lost_coef"]), 2)
                    c.execute("INSERT INTO lib_fines(id, loan_id, user_id, amount, kind, status, note, created) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
                              (_id(), ln["id"], ln["user_id"], amount, "lost", "unpaid", f"yo'qolgan kitob: {price} × {s['lost_coef']}", _now()))
                    c.execute("UPDATE lib_copies SET status='lost', updated=%s WHERE id=%s", (_now(), cp["id"]))
                else:
                    c.execute("UPDATE lib_copies SET status='available', updated=%s WHERE id=%s", (_now(), cp["id"]))
            self.audit(actor, "loan.lost" if lost else "loan.return", "copy", cp["id"], {"loan": ln["id"]}, {"late_days": max(late, 0), "fine": fine})
            served = None if lost else self._serve_queue(cp["book_id"], cp["id"])
            self.mark_shelf(ln["user_id"], cp["book_id"], "done")
            return {"loan": self.loan(ln["id"]), "fine": fine, "late_days": max(late, 0), "reserved_for": served}

    def renew(self, u: dict, lid: str) -> dict:
        ln = self.st._q("SELECT * FROM lib_loans WHERE id=%s AND user_id=%s AND returned IS NULL", (lid, u["id"]))
        if not ln:
            raise LibError("not_found")
        ln = dict(ln[0])
        s = self.settings()
        if ln["renewals"] >= int(s["max_renewals"]):
            raise LibError("renew_limit")
        if ln["due"][:10] < date.today().isoformat():
            raise LibError("renew_overdue")
        if self.st._one("SELECT COUNT(*) FROM lib_reservations WHERE book_id=%s AND status IN ('waiting','ready')", (ln["book_id"],)):
            raise LibError("renew_queue")
        due = (date.fromisoformat(ln["due"][:10]) + timedelta(days=int(s["renew_days"]))).isoformat()
        with self.st._tx() as c:
            c.execute("UPDATE lib_loans SET due=%s, renewals=renewals+1 WHERE id=%s", (due, lid))
        self.audit(u, "loan.renew", "loan", lid, {"due": ln["due"]}, {"due": due})
        return self.loan(lid)

    # ------------------------------------------------------------------ bron va navbat
    def reserve(self, u: dict, bid: str) -> dict:
        with self.lock:
            if not self.book(bid):
                raise LibError("not_found")
            if self.st._one("SELECT 1 FROM lib_reservations WHERE book_id=%s AND user_id=%s AND status IN ('waiting','ready')", (bid, u["id"])):
                raise LibError("already_reserved")
            if self.st._one("SELECT 1 FROM lib_loans WHERE book_id=%s AND user_id=%s AND returned IS NULL", (bid, u["id"])):
                raise LibError("already_have")
            if not self.st._one("SELECT COUNT(*) FROM lib_copies WHERE book_id=%s AND status NOT IN ('lost','writtenoff')", (bid,)):
                raise LibError("no_copies")
            if self.unpaid(u["id"]) > 0:
                raise LibError("has_fines")
            rid = _id()
            with self.st._tx() as c:
                c.execute("INSERT INTO lib_reservations(id, book_id, user_id, created, status) VALUES(%s,%s,%s,%s,%s)", (rid, bid, u["id"], _now(), "waiting"))
            # bo'sh nusxa bo'lsa — darhol shu odamga ajratiladi (kutubxonaga kelib olib ketadi)
            free = self.st._q("SELECT id FROM lib_copies WHERE book_id=%s AND status='available' LIMIT 1", (bid,))
            if free:
                self._serve_queue(bid, free[0]["id"])
            self.mark_shelf(u["id"], bid, "want")
            return self.reservation(rid)

    def reservation(self, rid: str) -> dict | None:
        r = self.st._q("SELECT r.*, b.title, b.cover FROM lib_reservations r JOIN lib_books b ON b.id=r.book_id WHERE r.id=%s", (rid,))
        if not r:
            return None
        d = dict(r[0])
        d["position"] = self.position(d) if d["status"] == "waiting" else 0
        return d

    def position(self, res: dict) -> int:
        return int(self.st._one("SELECT COUNT(*) FROM lib_reservations WHERE book_id=%s AND status='waiting' AND created<=%s", (res["book_id"], res["created"])) or 0)

    def user_reservations(self, uid: str) -> list[dict]:
        out = []
        for r in self.st._q("SELECT r.*, b.title, b.cover, b.authors FROM lib_reservations r JOIN lib_books b ON b.id=r.book_id WHERE r.user_id=%s AND r.status IN ('waiting','ready') ORDER BY r.created", (uid,)):
            d = dict(r) | {"authors": _j(r["authors"], [])}
            d["position"] = self.position(d) if d["status"] == "waiting" else 0
            out.append(d)
        return out

    def cancel_reservation(self, u: dict, rid: str, actor: dict | None = None) -> None:
        r = self.st._q("SELECT * FROM lib_reservations WHERE id=%s AND status IN ('waiting','ready')", (rid,))
        if not r or (actor is None and r[0]["user_id"] != u["id"]):
            raise LibError("not_found")
        r = dict(r[0])
        with self.st._tx() as c:
            c.execute("UPDATE lib_reservations SET status='cancelled', closed=%s WHERE id=%s", (_now(), rid))
            if r["status"] == "ready" and r["copy_id"]:
                c.execute("UPDATE lib_copies SET status='available', updated=%s WHERE id=%s AND status='reserved'", (_now(), r["copy_id"]))
        if r["status"] == "ready" and r["copy_id"]:
            self._serve_queue(r["book_id"], r["copy_id"])
        self.audit(actor or u, "reservation.cancel", "reservation", rid, None, None)

    def _serve_queue(self, bid: str, copy_id: str) -> str | None:
        """Nusxa bo'shadi: navbatdagi birinchiga ajratiladi (holat — bron qilingan), unga xabar ketadi, muhlat hold_days."""
        with self.lock:
            cp = self.st._q("SELECT status FROM lib_copies WHERE id=%s", (copy_id,))
            if not cp or cp[0]["status"] != "available":
                return None
            nxt = self.st._q("SELECT * FROM lib_reservations WHERE book_id=%s AND status='waiting' ORDER BY created LIMIT 1", (bid,))
            if not nxt:
                return None
            r = dict(nxt[0])
            exp = (datetime.now(timezone.utc) + timedelta(days=int(self.settings()["hold_days"]))).isoformat(timespec="seconds")
            with self.st._tx() as c:
                c.execute("UPDATE lib_reservations SET status='ready', copy_id=%s, notified=%s, expires=%s WHERE id=%s", (copy_id, _now(), exp, r["id"]))
                c.execute("UPDATE lib_copies SET status='reserved', updated=%s WHERE id=%s", (_now(), copy_id))
            self.events.append(("reservation_ready", r["user_id"], {"book_id": bid, "expires": exp, "reservation": r["id"]}))
            return r["user_id"]

    def expire_reservations(self) -> int:
        """Muhlati o'tgan tayyor bronlar — navbat keyingisiga o'tadi."""
        n = 0
        for r in self.st._q("SELECT * FROM lib_reservations WHERE status='ready' AND expires<%s", (_now(),)):
            with self.st._tx() as c:
                c.execute("UPDATE lib_reservations SET status='expired', closed=%s WHERE id=%s", (_now(), r["id"]))
                c.execute("UPDATE lib_copies SET status='available', updated=%s WHERE id=%s AND status='reserved'", (_now(), r["copy_id"]))
            self.events.append(("reservation_expired", r["user_id"], {"book_id": r["book_id"]}))
            self._serve_queue(r["book_id"], r["copy_id"])
            n += 1
        return n

    # navbatdagi bildirishnomalar (api qatlami yuboradi: tizim ichida / email / Telegram)
    @property
    def events(self) -> list:
        ev = getattr(self, "_events", None)
        if ev is None:
            ev = self._events = []
        return ev

    def take_events(self) -> list:
        with self.lock:
            ev, self._events = self.events, []
            return ev

    # ------------------------------------------------------------------ jarimalar
    def fines(self, status: str = "", uid: str = "") -> list[dict]:
        sql = "SELECT f.*, b.title FROM lib_fines f LEFT JOIN lib_loans l ON l.id=f.loan_id LEFT JOIN lib_books b ON b.id=l.book_id WHERE 1=1"
        args: list = []
        if status:
            sql += " AND f.status=%s"
            args.append(status)
        if uid:
            sql += " AND f.user_id=%s"
            args.append(uid)
        return [dict(r) for r in self.st._q(sql + " ORDER BY f.created DESC LIMIT 2000", tuple(args))]

    def resolve_fine(self, fid: str, status: str, note: str, actor: dict) -> dict:
        if status not in ("paid", "waived"):
            raise LibError("bad_status")
        if not _s(note, 300):
            raise LibError("reason_required")
        cur = self.st._q("SELECT * FROM lib_fines WHERE id=%s", (fid,))
        if not cur:
            raise LibError("not_found")
        with self.st._tx() as c:
            c.execute("UPDATE lib_fines SET status=%s, note=COALESCE(note,'') || %s , resolved=%s, resolved_by=%s WHERE id=%s",
                      (status, f" | {status}: {_s(note, 300)}", _now(), actor.get("id"), fid))
        self.audit(actor, f"fine.{status}", "fine", fid, dict(cur[0]), {"status": status, "note": note})
        return dict(self.st._q("SELECT * FROM lib_fines WHERE id=%s", (fid,))[0])

    # ------------------------------------------------------------------ javonlar
    def shelves(self, uid: str) -> list[dict]:
        have = {r["kind"] for r in self.st._q("SELECT kind FROM lib_shelves WHERE user_id=%s", (uid,))}
        missing = [k for k in SHELF_KINDS if k not in have]
        if missing:
            with self.st._tx() as c:
                for k in missing:
                    c.execute("INSERT INTO lib_shelves(id, user_id, name, kind, created) VALUES(%s,%s,%s,%s,%s)", (_id(), uid, k, k, _now()))
        out = []
        order = {"reading": 0, "want": 1, "done": 2}
        for r in self.st._q("SELECT * FROM lib_shelves WHERE user_id=%s", (uid,)):
            ids = [x["book_id"] for x in self.st._q("SELECT book_id FROM lib_shelf_items WHERE shelf_id=%s ORDER BY added DESC", (r["id"],))]
            books = [self.book(i) for i in ids]
            out.append(dict(r) | {"items": self.cards([b for b in books if b])})
        return sorted(out, key=lambda x: (order.get(x["kind"], 9), x["created"]))

    def mark_shelf(self, uid: str, bid: str, kind: str) -> None:
        """Avtomatik: olindi → «O'qiyapman», qaytarildi/oxirigacha o'qildi → «O'qidim», bron → «O'qimoqchiman»."""
        if not self.st._one("SELECT 1 FROM lib_shelves WHERE user_id=%s AND kind=%s", (uid, kind)):
            self.shelves(uid)  # standart javonlar yaratiladi
        sid = self.st._one("SELECT id FROM lib_shelves WHERE user_id=%s AND kind=%s", (uid, kind))
        with self.st._tx() as c:
            for other in SHELF_KINDS:
                if other != kind:
                    c.execute("DELETE FROM lib_shelf_items WHERE book_id=%s AND shelf_id IN (SELECT id FROM lib_shelves WHERE user_id=%s AND kind=%s)", (bid, uid, other))
            c.execute("INSERT INTO lib_shelf_items(shelf_id, book_id, added) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING", (sid, bid, _now()))

    def shelf_add(self, uid: str, shelf_id: str, bid: str) -> None:
        sh = self.st._q("SELECT * FROM lib_shelves WHERE id=%s AND user_id=%s", (shelf_id, uid))
        if not sh or not self.book(bid):
            raise LibError("not_found")
        if sh[0]["kind"] in SHELF_KINDS:
            self.mark_shelf(uid, bid, sh[0]["kind"])
            return
        with self.st._tx() as c:
            c.execute("INSERT INTO lib_shelf_items(shelf_id, book_id, added) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING", (shelf_id, bid, _now()))

    def shelf_remove(self, uid: str, shelf_id: str, bid: str) -> None:
        with self.st._tx() as c:
            c.execute("DELETE FROM lib_shelf_items WHERE book_id=%s AND shelf_id IN (SELECT id FROM lib_shelves WHERE id=%s AND user_id=%s)", (bid, shelf_id, uid))

    def shelf_create(self, uid: str, name: str) -> dict:
        name = _s(name, 80)
        if not name:
            raise LibError("name_required")
        sid = _id()
        with self.st._tx() as c:
            c.execute("INSERT INTO lib_shelves(id, user_id, name, kind, created) VALUES(%s,%s,%s,%s,%s)", (sid, uid, name, "custom", _now()))
        return dict(self.st._q("SELECT * FROM lib_shelves WHERE id=%s", (sid,))[0]) | {"items": []}

    def shelf_delete(self, uid: str, sid: str) -> None:
        with self.st._tx() as c:
            if c.execute("DELETE FROM lib_shelves WHERE id=%s AND user_id=%s AND kind='custom'", (sid, uid)).rowcount:
                c.execute("DELETE FROM lib_shelf_items WHERE shelf_id=%s", (sid,))

    def book_shelves(self, uid: str, bid: str) -> list[str]:
        return [r["shelf_id"] for r in self.st._q("SELECT i.shelf_id FROM lib_shelf_items i JOIN lib_shelves s ON s.id=i.shelf_id WHERE s.user_id=%s AND i.book_id=%s", (uid, bid))]

    # ------------------------------------------------------------------ baho va izohlar
    def can_rate(self, uid: str, bid: str) -> bool:
        if self.st._one("SELECT 1 FROM lib_loans WHERE user_id=%s AND book_id=%s", (uid, bid)):
            return True
        need = float(self.settings()["rate_min_percent"])
        return bool(self.st._one("SELECT 1 FROM lib_progress WHERE user_id=%s AND book_id=%s AND percent>=%s", (uid, bid, need)))

    def rate(self, uid: str, bid: str, stars: int) -> dict:
        stars = int(stars)
        if not 1 <= stars <= 5:
            raise LibError("bad_stars")
        if not self.can_rate(uid, bid):
            raise LibError("rate_not_allowed")
        with self.st._tx() as c:
            c.execute("INSERT INTO lib_ratings(user_id, book_id, stars, updated) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id, book_id) DO UPDATE SET stars=excluded.stars, updated=excluded.updated",
                      (uid, bid, stars, _now()))
        return self._recalc_rating(bid)

    def _recalc_rating(self, bid: str) -> dict:
        r = self.st._q("SELECT COUNT(*) AS n, AVG(stars) AS a FROM lib_ratings WHERE book_id=%s", (bid,))[0]
        with self.st._tx() as c:
            c.execute("UPDATE lib_books SET rating_avg=%s, rating_count=%s WHERE id=%s", (round(r["a"] or 0, 3), r["n"], bid))
        return self.rating_info(bid)

    def rating_info(self, bid: str, uid: str | None = None) -> dict:
        dist = {i: 0 for i in range(1, 6)}
        for r in self.st._q("SELECT stars, COUNT(*) AS n FROM lib_ratings WHERE book_id=%s GROUP BY stars", (bid,)):
            dist[r["stars"]] = r["n"]
        n = sum(dist.values())
        avg = round(sum(k * v for k, v in dist.items()) / n, 2) if n else 0
        out = {"avg": avg, "count": n, "dist": dist}
        if uid:
            out["mine"] = self.st._one("SELECT stars FROM lib_ratings WHERE user_id=%s AND book_id=%s", (uid, bid))
            out["can_rate"] = self.can_rate(uid, bid)
        return out

    def add_review(self, u: dict, bid: str, text: str, stars: int | None = None, parent_id: str | None = None, anonymous: bool = False) -> dict:
        text = str(text or "").strip()[:2000]
        if len(text) < 2:
            raise LibError("text_required")
        if not self.book(bid):
            raise LibError("not_found")
        if parent_id:
            p = self.st._q("SELECT parent_id, book_id FROM lib_reviews WHERE id=%s", (parent_id,))
            if not p or p[0]["book_id"] != bid or p[0]["parent_id"]:
                raise LibError("bad_parent")  # javob faqat 1 daraja
        if stars:
            self.rate(u["id"], bid, stars)
        status = "approved" if self.settings()["auto_approve"] else "pending"
        rid = _id()
        with self.st._tx() as c:
            c.execute("INSERT INTO lib_reviews(id, book_id, user_id, parent_id, text, stars, status, anonymous, created) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                      (rid, bid, u["id"], parent_id, text, stars if not parent_id else None, status, int(bool(anonymous)), _now()))
        if status == "pending":
            self.events.append(("review_pending", None, {"book_id": bid, "review": rid}))
        return self.review(rid)

    def review(self, rid: str) -> dict | None:
        r = self.st._q("SELECT * FROM lib_reviews WHERE id=%s", (rid,))
        return dict(r[0]) if r else None

    def edit_review(self, u: dict, rid: str, text: str) -> dict:
        r = self.review(rid)
        if not r or r["user_id"] != u["id"]:
            raise LibError("not_found")
        hours = int(self.settings()["review_edit_hours"])
        if datetime.fromisoformat(r["created"]) < datetime.now(timezone.utc) - timedelta(hours=hours):
            raise LibError("edit_window_passed")
        text = str(text or "").strip()[:2000]
        if len(text) < 2:
            raise LibError("text_required")
        status = "approved" if self.settings()["auto_approve"] else "pending"
        with self.st._tx() as c:
            c.execute("UPDATE lib_reviews SET text=%s, edited=%s, status=%s WHERE id=%s", (text, _now(), status if r["status"] != "hidden" else "hidden", rid))
        return self.review(rid)

    def delete_review(self, u: dict, rid: str) -> None:
        r = self.review(rid)
        if not r or r["user_id"] != u["id"]:
            raise LibError("not_found")
        with self.st._tx() as c:
            c.execute("DELETE FROM lib_reviews WHERE id=%s OR parent_id=%s", (rid, rid))
            c.execute("DELETE FROM lib_review_votes WHERE review_id=%s", (rid,))

    def moderate(self, rid: str, status: str, reason: str, actor: dict) -> dict:
        if status not in ("approved", "hidden", "rejected"):
            raise LibError("bad_status")
        r = self.review(rid)
        if not r:
            raise LibError("not_found")
        if status in ("hidden", "rejected") and not _s(reason, 300):
            raise LibError("reason_required")
        with self.st._tx() as c:
            c.execute("UPDATE lib_reviews SET status=%s, reason=%s, moderated_by=%s WHERE id=%s", (status, _s(reason, 300) or None, actor.get("id"), rid))
        self.audit(actor, f"review.{status}", "review", rid, {"status": r["status"]}, {"status": status, "reason": reason})
        if r["status"] == "pending":
            self.events.append(("review_moderated", r["user_id"], {"book_id": r["book_id"], "status": status, "reason": reason}))
        return self.review(rid)

    def vote(self, uid: str, rid: str, kind: str, note: str = "") -> dict:
        if kind not in ("helpful", "report"):
            raise LibError("bad_kind")
        r = self.review(rid)
        if not r or r["status"] != "approved":
            raise LibError("not_found")
        with self.st._tx() as c:
            if c.execute("SELECT 1 FROM lib_review_votes WHERE review_id=%s AND user_id=%s AND kind=%s", (rid, uid, kind)).fetchone() and kind == "helpful":
                c.execute("DELETE FROM lib_review_votes WHERE review_id=%s AND user_id=%s AND kind=%s", (rid, uid, kind))  # qayta bosish — bekor
            else:
                c.execute("INSERT INTO lib_review_votes(review_id, user_id, kind, note, created) VALUES(%s,%s,%s,%s,%s) "
                          "ON CONFLICT (review_id, user_id, kind) DO UPDATE SET note=EXCLUDED.note, created=EXCLUDED.created", (rid, uid, kind, _s(note, 300), _now()))
        if kind == "report":
            self.events.append(("review_reported", None, {"book_id": r["book_id"], "review": rid}))
        return {"helpful": self.st._one("SELECT COUNT(*) FROM lib_review_votes WHERE review_id=%s AND kind='helpful'", (rid,))}

    def reviews(self, bid: str, viewer: dict | None, staff: bool = False) -> list[dict]:
        """Tasdiqlanganlar (+ o'zining moderatsiyadagisi). Anonim izohda ism ko'rinmaydi — kutubxonachiga ko'rinadi."""
        rows = self.st._q("SELECT * FROM lib_reviews WHERE book_id=%s ORDER BY created", (bid,))
        votes: dict[str, dict] = {}
        for v in self.st._q("SELECT review_id, kind, COUNT(*) AS n FROM lib_review_votes WHERE review_id IN (SELECT id FROM lib_reviews WHERE book_id=%s) GROUP BY review_id, kind", (bid,)):
            votes.setdefault(v["review_id"], {})[v["kind"]] = v["n"]
        mine = {v["review_id"] for v in self.st._q("SELECT review_id FROM lib_review_votes WHERE user_id=%s AND kind='helpful'", ((viewer or {}).get("id") or "",))}
        users = {}
        out = []
        for r in rows:
            d = dict(r)
            own = viewer and d["user_id"] == viewer["id"]
            if d["status"] != "approved" and not own and not staff:
                continue
            u = users.get(d["user_id"])
            if u is None:
                u = users[d["user_id"]] = self.st.get_user(d["user_id"]) or {}
            fac = self._faculty_name(u)
            d["author"] = {"name": "Anonim" if d["anonymous"] and not staff else (u.get("name") or "—"), "faculty": "" if d["anonymous"] and not staff else fac,
                           "photo": "" if d["anonymous"] and not staff else ((u.get("data") or {}).get("photo") or ""), "role": u.get("role") or ""}
            if staff and d["anonymous"]:
                d["author"]["real"] = True
            d["helpful"] = votes.get(d["id"], {}).get("helpful", 0)
            d["reports"] = votes.get(d["id"], {}).get("report", 0) if staff else None
            d["voted"] = d["id"] in mine
            d["own"] = bool(own)
            if not staff:
                d.pop("user_id", None)
            out.append(d)
        top = [x for x in out if not x["parent_id"]]
        for t in top:
            t["replies"] = [x for x in out if x["parent_id"] == t["id"]]
        return list(reversed(top))

    def _faculty_name(self, u: dict) -> str:
        gid = u.get("group_id")
        if not gid:
            return ""
        g = self.st._q("SELECT faculty_id FROM groups WHERE id=%s", (gid,)) if self.st.has_table("groups") else []
        if not g or not g[0]["faculty_id"]:
            return ""
        f = self.st.get_item(g[0]["faculty_id"]) if hasattr(self.st, "get_item") else None
        return (f or {}).get("title") or ""

    def moderation_queue(self) -> list[dict]:
        rows = self.st._q("SELECT r.*, b.title AS book_title, (SELECT COUNT(*) FROM lib_review_votes v WHERE v.review_id=r.id AND v.kind='report') AS reports "
                          "FROM lib_reviews r JOIN lib_books b ON b.id=r.book_id WHERE r.status='pending' OR r.id IN (SELECT review_id FROM lib_review_votes WHERE kind='report') "
                          "ORDER BY r.created DESC LIMIT 500")
        out = []
        for r in rows:
            u = self.st.get_user(r["user_id"]) or {}
            out.append(dict(r) | {"author": {"name": u.get("name") or "—", "login": u.get("login") or "", "faculty": self._faculty_name(u)}})
        return out

    # ------------------------------------------------------------------ o'qituvchi tavsiya ro'yxatlari
    def course_lists(self, teacher_id: str | None = None, subject_ids: list[str] | None = None, semester_id: str | None = None) -> list[dict]:
        sql, args = "SELECT * FROM lib_course_lists WHERE 1=1", []
        if teacher_id:
            sql += " AND teacher_id=%s"
            args.append(teacher_id)
        if subject_ids is not None:
            if not subject_ids:
                return []
            sql += " AND subject_id = ANY(%s)"
            args.append(list(subject_ids))
        if semester_id:
            sql += " AND (semester_id=%s OR semester_id IS NULL OR semester_id='')"
            args.append(semester_id)
        out = []
        for r in self.st._q(sql + " ORDER BY updated DESC", tuple(args)):
            items = self.st._q("SELECT * FROM lib_course_items WHERE list_id=%s ORDER BY kind, sort", (r["id"],))
            cards = {c["id"]: c for c in self.cards([b for b in (self.book(i["book_id"]) for i in items) if b])}
            t = self.st.get_user(r["teacher_id"]) or {}
            out.append(dict(r) | {"teacher": t.get("name") or "", "items": [{"kind": i["kind"], "note": i["note"] or "", "book": cards[i["book_id"]]}
                                                                             for i in items if i["book_id"] in cards]})
        return out

    def save_course_list(self, teacher: dict, data: dict, lid: str | None = None) -> dict:
        subj = _s(data.get("subject_name"), 200)
        if not subj:
            raise LibError("subject_required")
        now = _now()
        with self.st._tx() as c:
            if lid:
                if not c.execute("SELECT 1 FROM lib_course_lists WHERE id=%s AND teacher_id=%s", (lid, teacher["id"])).fetchone():
                    raise LibError("not_found")
                c.execute("UPDATE lib_course_lists SET subject_id=%s, subject_name=%s, semester_id=%s, title=%s, updated=%s WHERE id=%s",
                          (_s(data.get("subject_id"), 40) or None, subj, _s(data.get("semester_id"), 40) or None, _s(data.get("title"), 200), now, lid))
                c.execute("DELETE FROM lib_course_items WHERE list_id=%s", (lid,))
            else:
                lid = _id()
                c.execute("INSERT INTO lib_course_lists(id, teacher_id, subject_id, subject_name, semester_id, title, created, updated) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
                          (lid, teacher["id"], _s(data.get("subject_id"), 40) or None, subj, _s(data.get("semester_id"), 40) or None, _s(data.get("title"), 200), now, now))
            for i, it in enumerate((data.get("items") or [])[:200]):
                bid = str(it.get("book_id") or "")
                if bid and c.execute("SELECT 1 FROM lib_books WHERE id=%s", (bid,)).fetchone():
                    c.execute("INSERT INTO lib_course_items(list_id, book_id, kind, note, sort) VALUES(%s,%s,%s,%s,%s) "
                              "ON CONFLICT (list_id, book_id) DO UPDATE SET kind=EXCLUDED.kind, note=EXCLUDED.note, sort=EXCLUDED.sort",
                              (lid, bid, "extra" if it.get("kind") == "extra" else "main", _s(it.get("note"), 300), i))
        return next(x for x in self.course_lists(teacher_id=teacher["id"]) if x["id"] == lid)

    def copy_course_list(self, teacher: dict, lid: str, semester_id: str) -> dict:
        src = next((x for x in self.course_lists(teacher_id=teacher["id"]) if x["id"] == lid), None)
        if not src:
            raise LibError("not_found")
        return self.save_course_list(teacher, {"subject_id": src["subject_id"], "subject_name": src["subject_name"], "semester_id": semester_id, "title": src["title"],
                                               "items": [{"book_id": i["book"]["id"], "kind": i["kind"], "note": i["note"]} for i in src["items"]]})

    def delete_course_list(self, teacher: dict, lid: str) -> None:
        with self.st._tx() as c:
            if c.execute("DELETE FROM lib_course_lists WHERE id=%s AND teacher_id=%s", (lid, teacher["id"])).rowcount:
                c.execute("DELETE FROM lib_course_items WHERE list_id=%s", (lid,))

    # ------------------------------------------------------------------ tavsiyalar
    def also_taken(self, bid: str, limit: int = 8) -> list[dict]:
        """«Shu kitobni olganlar yana buni oldi»: birgalikda olingan/o'qilgan kitoblar."""
        rows = self.st._q("""
            SELECT x.book_id, COUNT(DISTINCT x.user_id) AS n FROM (
                SELECT user_id, book_id FROM lib_loans UNION SELECT user_id, book_id FROM lib_progress) x
            WHERE x.user_id IN (SELECT user_id FROM lib_loans WHERE book_id=%s UNION SELECT user_id FROM lib_progress WHERE book_id=%s) AND x.book_id<>%s
            GROUP BY x.book_id ORDER BY n DESC LIMIT %s""", (bid, bid, bid, limit))
        return self.cards([b for b in (self.book(r["book_id"]) for r in rows) if b])

    def similar(self, bid: str, limit: int = 8) -> list[dict]:
        b = self.book(bid)
        if not b:
            return []
        keys = set(b["categories"]) | {"a:" + a for a in b["authors"]}
        scored = []
        for r in self.st._q("SELECT id, categories, authors FROM lib_books WHERE id<>%s LIMIT 20000", (bid,)):
            k = set(_j(r["categories"], [])) | {"a:" + a for a in _j(r["authors"], [])}
            s = len(keys & k)
            if s:
                scored.append((s, r["id"]))
        scored.sort(key=lambda x: -x[0])
        return self.cards([x for x in (self.book(i) for _s2, i in scored[:limit]) if x])

    def popular(self, days: int = 180, limit: int = 12, user_ids: list[str] | None = None) -> list[dict]:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        cond, args = "", [since, since]
        if user_ids is not None:
            if not user_ids:
                return []
            cond = " AND user_id = ANY(%s)"
        sql = (f"SELECT book_id, COUNT(*) AS n FROM (SELECT book_id, user_id FROM lib_loans WHERE issued>=%s{cond} "
               f"UNION ALL SELECT book_id, user_id FROM lib_progress WHERE opened>=%s{cond}) x GROUP BY book_id ORDER BY n DESC LIMIT %s")
        if user_ids is not None:
            args = [since, list(user_ids), since, list(user_ids)]
        rows = self.st._q(sql, (*args, limit))
        return self.cards([b for b in (self.book(r["book_id"]) for r in rows) if b])

    def newest(self, limit: int = 12) -> list[dict]:
        return self.cards([self._book(r) for r in self.st._q("SELECT * FROM lib_books ORDER BY created DESC LIMIT %s", (limit,))])

    def top_rated(self, limit: int = 12) -> list[dict]:
        return self.cards([self._book(r) for r in self.st._q("SELECT * FROM lib_books WHERE rating_count>0 ORDER BY rating_avg DESC, rating_count DESC LIMIT %s", (limit,))])

    def teacher_picks(self, limit: int = 12) -> list[dict]:
        rows = self.st._q("SELECT book_id, COUNT(*) AS n FROM lib_course_items GROUP BY book_id ORDER BY n DESC LIMIT %s", (limit,))
        return self.cards([b for b in (self.book(r["book_id"]) for r in rows) if b])

    def for_user(self, uid: str, limit: int = 12) -> list[dict]:
        """Javondagi kitoblarning fani/muallifi bo'yicha o'xshashlar."""
        seen = {r["book_id"] for r in self.st._q("SELECT i.book_id FROM lib_shelf_items i JOIN lib_shelves s ON s.id=i.shelf_id WHERE s.user_id=%s", (uid,))}
        seen |= {r["book_id"] for r in self.st._q("SELECT book_id FROM lib_loans WHERE user_id=%s UNION SELECT book_id FROM lib_progress WHERE user_id=%s", (uid, uid))}
        if not seen:
            return []
        keys: dict[str, int] = {}
        for b in (self.book(i) for i in seen):
            for k in (b or {}).get("categories", []) + ["a:" + a for a in (b or {}).get("authors", [])]:
                keys[k] = keys.get(k, 0) + 1
        scored = []
        for r in self.st._q("SELECT id, categories, authors FROM lib_books LIMIT 20000"):
            if r["id"] in seen:
                continue
            s = sum(keys.get(k, 0) for k in _j(r["categories"], []) + ["a:" + a for a in _j(r["authors"], [])])
            if s:
                scored.append((s, r["id"]))
        scored.sort(key=lambda x: -x[0])
        return self.cards([x for x in (self.book(i) for _s2, i in scored[:limit]) if x])

    # ------------------------------------------------------------------ o'qish joyi va belgilar
    def progress(self, uid: str, file_id: str) -> dict | None:
        r = self.st._q("SELECT * FROM lib_progress WHERE user_id=%s AND file_id=%s", (uid, file_id))
        return dict(r[0]) if r else None

    def save_progress(self, uid: str, f: dict, loc: str, percent: float, seconds: int = 0, pages: int = 0) -> dict:
        now = _now()
        percent = max(0.0, min(float(percent or 0), 100.0))
        seconds = max(0, min(int(seconds or 0), 3600))  # bitta so'rovda ko'pi bilan 1 soat
        pages = max(0, min(int(pages or 0), 500))
        day = date.today().isoformat()
        with self.st._tx() as c:
            c.execute("""INSERT INTO lib_progress(user_id, file_id, book_id, loc, percent, seconds, pages, opened, updated, completed) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT(user_id, file_id) DO UPDATE SET loc=excluded.loc, percent=GREATEST(lib_progress.percent, excluded.percent),
                seconds=lib_progress.seconds+excluded.seconds, pages=lib_progress.pages+excluded.pages, updated=excluded.updated,
                completed=GREATEST(lib_progress.completed, excluded.completed)""",
                      (uid, f["id"], f["book_id"], _s(loc, 500), percent, seconds, pages, now, now, int(percent >= 95)))
            if seconds or pages:
                c.execute("INSERT INTO lib_activity(user_id, day, seconds, pages) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id, day) DO UPDATE SET "
                          "seconds=lib_activity.seconds+excluded.seconds, pages=lib_activity.pages+excluded.pages", (uid, day, seconds, pages))
        p = self.progress(uid, f["id"])
        if p and p["completed"]:
            self.mark_shelf(uid, f["book_id"], "done")
        elif p and p["percent"] > 0 and not self.book_shelves(uid, f["book_id"]):
            self.mark_shelf(uid, f["book_id"], "reading")
        return p

    def continue_reading(self, uid: str, limit: int = 3) -> list[dict]:
        rows = self.st._q("SELECT p.*, f.kind, f.title AS file_title, b.title, b.cover, b.authors FROM lib_progress p JOIN lib_files f ON f.id=p.file_id "
                          "JOIN lib_books b ON b.id=p.book_id WHERE p.user_id=%s ORDER BY p.updated DESC LIMIT %s", (uid, limit))
        return [dict(r) | {"authors": _j(r["authors"], [])} for r in rows]

    def reading_stats(self, uid: str) -> dict:
        tot = self.st._q("SELECT COALESCE(SUM(seconds),0) AS s, COALESCE(SUM(pages),0) AS p FROM lib_activity WHERE user_id=%s", (uid,))[0]
        days = [dict(r) for r in self.st._q("SELECT day, seconds, pages FROM lib_activity WHERE user_id=%s ORDER BY day DESC LIMIT 30", (uid,))]
        return {"seconds": tot["s"], "pages": tot["p"], "books_done": self.st._one("SELECT COUNT(DISTINCT book_id) FROM lib_progress WHERE user_id=%s AND completed=1", (uid,)) or 0,
                "loans": self.st._one("SELECT COUNT(*) FROM lib_loans WHERE user_id=%s", (uid,)) or 0, "days": list(reversed(days))}

    def marks(self, uid: str, file_id: str) -> list[dict]:
        return [dict(r) for r in self.st._q("SELECT * FROM lib_marks WHERE user_id=%s AND file_id=%s ORDER BY created", (uid, file_id))]

    def all_marks(self, uid: str) -> list[dict]:
        return [dict(r) for r in self.st._q("SELECT m.*, b.title, f.kind AS file_kind, b.id AS book_id FROM lib_marks m JOIN lib_files f ON f.id=m.file_id "
                                            "JOIN lib_books b ON b.id=f.book_id WHERE m.user_id=%s ORDER BY m.created DESC LIMIT 300", (uid,))]

    def add_mark(self, uid: str, file_id: str, data: dict) -> dict:
        kind = data.get("kind") if data.get("kind") in ("bookmark", "highlight", "note") else "bookmark"
        loc = _s(data.get("loc"), 2000)
        if not loc:
            raise LibError("loc_required")
        mid = _id()
        with self.st._tx() as c:
            c.execute("INSERT INTO lib_marks(id, user_id, file_id, kind, loc, text, note, color, created) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                      (mid, uid, file_id, kind, loc, str(data.get("text") or "")[:3000], str(data.get("note") or "")[:3000], _s(data.get("color"), 20) or "yellow", _now()))
        return dict(self.st._q("SELECT * FROM lib_marks WHERE id=%s", (mid,))[0])

    def update_mark(self, uid: str, mid: str, data: dict) -> dict:
        with self.st._tx() as c:
            c.execute("UPDATE lib_marks SET note=%s, color=COALESCE(%s, color) WHERE id=%s AND user_id=%s",
                      (str(data.get("note") or "")[:3000], _s(data.get("color"), 20) or None, mid, uid))
        r = self.st._q("SELECT * FROM lib_marks WHERE id=%s AND user_id=%s", (mid, uid))
        if not r:
            raise LibError("not_found")
        return dict(r[0])

    def delete_mark(self, uid: str, mid: str) -> None:
        with self.st._tx() as c:
            c.execute("DELETE FROM lib_marks WHERE id=%s AND user_id=%s", (mid, uid))

    # ------------------------------------------------------------------ foydalanuvchi tarixi va anonimlashtirish
    def history(self, uid: str) -> dict:
        return {"loans": self.user_loans(uid, None), "reading": [dict(r) | {"authors": _j(r["authors"], [])} for r in self.st._q(
            "SELECT p.*, b.title, b.authors, f.kind FROM lib_progress p JOIN lib_books b ON b.id=p.book_id JOIN lib_files f ON f.id=p.file_id WHERE p.user_id=%s ORDER BY p.updated DESC", (uid,))],
            "fines": self.fines(uid=uid), "reservations": [dict(r) for r in self.st._q("SELECT r.*, b.title FROM lib_reservations r JOIN lib_books b ON b.id=r.book_id WHERE r.user_id=%s ORDER BY r.created DESC", (uid,))]}

    def anonymize_user(self, uid: str) -> None:
        """Bitirgan/o'chirilgan o'quvchi: tarix statistikada qoladi, lekin shaxsga bog'lanmaydi."""
        anon = "anon:" + secrets.token_hex(6)
        with self.st._tx() as c:
            for t in ("lib_loans", "lib_reservations", "lib_fines", "lib_progress", "lib_ratings", "lib_reviews", "lib_activity"):
                c.execute(f"UPDATE {t} SET user_id=%s WHERE user_id=%s", (anon, uid))
            for t in ("lib_marks", "lib_prefs", "lib_review_votes"):
                c.execute(f"DELETE FROM {t} WHERE user_id=%s", (uid,))
            c.execute("UPDATE lib_reviews SET anonymous=1 WHERE user_id=%s", (anon,))
            sids = [r[0] for r in c.execute("SELECT id FROM lib_shelves WHERE user_id=%s", (uid,)).fetchall()]
            for sid in sids:
                c.execute("DELETE FROM lib_shelf_items WHERE shelf_id=%s", (sid,))
            c.execute("DELETE FROM lib_shelves WHERE user_id=%s", (uid,))

    # ------------------------------------------------------------------ statistika
    def stats(self, days: int = 30) -> dict:
        today = date.today().isoformat()
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        q1 = lambda sql, *a: self.st._one(sql, a) or 0  # noqa: E731
        out = {
            "today": {"issued": q1("SELECT COUNT(*) FROM lib_loans WHERE substr(issued,1,10)=%s", today),
                      "returned": q1("SELECT COUNT(*) FROM lib_loans WHERE substr(returned,1,10)=%s", today),
                      "overdue": q1("SELECT COUNT(*) FROM lib_loans WHERE returned IS NULL AND substr(due,1,10)<%s", today),
                      "queue": q1("SELECT COUNT(*) FROM lib_reservations WHERE status IN ('waiting','ready')"),
                      "on_loan": q1("SELECT COUNT(*) FROM lib_loans WHERE returned IS NULL"),
                      "unpaid": round(float(q1("SELECT COALESCE(SUM(amount),0) FROM lib_fines WHERE status='unpaid'")), 2),
                      "pending_reviews": q1("SELECT COUNT(*) FROM lib_reviews WHERE status='pending'")},
            "fund": {"books": q1("SELECT COUNT(*) FROM lib_books"), "copies": q1("SELECT COUNT(*) FROM lib_copies WHERE status NOT IN ('lost','writtenoff')"),
                     "files": q1("SELECT COUNT(*) FROM lib_files"), "by_status": {r["status"]: r["n"] for r in self.st._q("SELECT status, COUNT(*) AS n FROM lib_copies GROUP BY status")}},
        }
        top = lambda sql: [dict(r) for r in self.st._q(sql, (since,))]  # noqa: E731
        out["top_borrowed"] = top("SELECT b.id, b.title, COUNT(*) AS n FROM lib_loans l JOIN lib_books b ON b.id=l.book_id WHERE l.issued>=%s GROUP BY b.id ORDER BY n DESC LIMIT 10")
        out["top_read"] = top("SELECT b.id, b.title, COUNT(*) AS n FROM lib_progress p JOIN lib_files f ON f.id=p.file_id JOIN lib_books b ON b.id=p.book_id "
                              "WHERE p.opened>=%s AND f.kind IN ('pdf','epub') GROUP BY b.id ORDER BY n DESC LIMIT 10")
        out["top_listened"] = top("SELECT b.id, b.title, COUNT(*) AS n FROM lib_progress p JOIN lib_files f ON f.id=p.file_id JOIN lib_books b ON b.id=p.book_id "
                                  "WHERE p.opened>=%s AND f.kind='audio' GROUP BY b.id ORDER BY n DESC LIMIT 10")
        out["daily"] = [dict(r) for r in self.st._q(
            "SELECT substr(issued,1,10) AS day, COUNT(*) AS issued FROM lib_loans WHERE issued>=%s GROUP BY day ORDER BY day", (since,))]
        # fakultet va kurs bo'yicha faollik (guruh orqali)
        act: dict[str, dict] = {}
        if self.st.has_table("groups"):
            for r in self.st._q("""SELECT g.faculty_id, g.course, COUNT(*) AS n FROM (
                    SELECT user_id FROM lib_loans WHERE issued>=%s UNION ALL SELECT user_id FROM lib_progress WHERE opened>=%s) x
                    JOIN users u ON u.id=x.user_id LEFT JOIN groups g ON g.id=u.group_id GROUP BY g.faculty_id, g.course""", (since, since)):
                fname = ((self.st.get_item(r["faculty_id"]) or {}).get("title") if r["faculty_id"] else None) or "—"
                a = act.setdefault(fname, {"faculty": fname, "total": 0, "courses": {}})
                a["total"] += r["n"]
                a["courses"][str(r["course"] or "—")] = r["n"]
        out["by_faculty"] = sorted(act.values(), key=lambda x: -x["total"])
        out["shortage"] = [dict(r) for r in self.st._q("""
            SELECT * FROM (SELECT b.id, b.title, (SELECT COUNT(*) FROM lib_reservations r WHERE r.book_id=b.id AND r.status IN ('waiting','ready')) AS queue,
                   (SELECT COUNT(*) FROM lib_copies c WHERE c.book_id=b.id AND c.status NOT IN ('lost','writtenoff')) AS copies
            FROM lib_books b) t WHERE queue > copies ORDER BY queue - copies DESC LIMIT 50""")]
        year_ago = (datetime.now(timezone.utc) - timedelta(days=365)).isoformat()
        out["unused"] = [dict(r) for r in self.st._q("""
            SELECT * FROM (SELECT b.id, b.title, b.created, (SELECT COUNT(*) FROM lib_copies c WHERE c.book_id=b.id AND c.status NOT IN ('lost','writtenoff')) AS copies FROM lib_books b
            WHERE b.created<%s AND NOT EXISTS (SELECT 1 FROM lib_loans l WHERE l.book_id=b.id AND l.issued>=%s)
              AND NOT EXISTS (SELECT 1 FROM lib_progress p WHERE p.book_id=b.id AND p.opened>=%s)) t WHERE copies>0 ORDER BY created LIMIT 100""", (year_ago, year_ago, year_ago))]
        out["files"] = [dict(r) for r in self.st._q("""
            SELECT f.id, f.kind, b.title, COUNT(p.user_id) AS opened, SUM(CASE WHEN p.completed=1 THEN 1 ELSE 0 END) AS completed
            FROM lib_files f JOIN lib_books b ON b.id=f.book_id LEFT JOIN lib_progress p ON p.file_id=f.id GROUP BY f.id, f.kind, b.title ORDER BY opened DESC LIMIT 50""")]
        return out

    # ------------------------------------------------------------------ kutubxonachi: o'quvchilar va nusxa tarixi
    def copy_history(self, cid: str) -> list[dict]:
        out = []
        for r in self.st._q("SELECT * FROM lib_loans WHERE copy_id=%s ORDER BY issued DESC", (cid,)):
            u = self.st.get_user(r["user_id"]) or {}
            out.append(dict(r) | {"user": {"id": u.get("id"), "name": u.get("name") or "(anonim)", "login": u.get("login") or ""}})
        return out

    def overdue(self) -> list[dict]:
        today = date.today().isoformat()
        out = []
        for r in self.st._q("SELECT l.*, c.inv, b.title FROM lib_loans l JOIN lib_copies c ON c.id=l.copy_id JOIN lib_books b ON b.id=l.book_id "
                            "WHERE l.returned IS NULL AND substr(l.due,1,10)<%s ORDER BY l.due", (today,)):
            u = self.st.get_user(r["user_id"]) or {}
            out.append(dict(r) | {"days": (date.today() - date.fromisoformat(r["due"][:10])).days,
                                  "user": {"id": u.get("id"), "name": u.get("name") or "—", "login": u.get("login") or "", "phone": (u.get("data") or {}).get("phone") or "",
                                           "email": u.get("email") or ""}})
        return out

    def active_loans(self) -> list[dict]:
        out = []
        today = date.today().isoformat()
        for r in self.st._q("SELECT l.*, c.inv, b.title FROM lib_loans l JOIN lib_copies c ON c.id=l.copy_id JOIN lib_books b ON b.id=l.book_id "
                            "WHERE l.returned IS NULL ORDER BY l.due LIMIT 3000"):
            u = self.st.get_user(r["user_id"]) or {}
            out.append(dict(r) | {"overdue": r["due"][:10] < today, "user": {"id": u.get("id"), "name": u.get("name") or "—", "login": u.get("login") or ""}})
        return out

    def queue_all(self) -> list[dict]:
        out = []
        for r in self.st._q("SELECT r.*, b.title, c.inv FROM lib_reservations r JOIN lib_books b ON b.id=r.book_id LEFT JOIN lib_copies c ON c.id=r.copy_id "
                            "WHERE r.status IN ('waiting','ready') ORDER BY r.book_id, r.created"):
            u = self.st.get_user(r["user_id"]) or {}
            d = dict(r) | {"user": {"id": u.get("id"), "name": u.get("name") or "—", "login": u.get("login") or ""}}
            d["position"] = self.position(d) if d["status"] == "waiting" else 0
            out.append(d)
        return out

    # ------------------------------------------------------------------ inventarizatsiya
    def inventory(self, location: str, scanned: list[str], actor: dict) -> dict:
        """Javondagi skaner qilingan kodlar bilan solishtirish: ro'yxatda bor-u javonda yo'q, javonda bor-u boshqa joyga tegishli."""
        loc = _s(location, 120)
        codes = {str(x).strip() for x in scanned if str(x).strip()}
        expected = [dict(r) for r in self.st._q(
            "SELECT c.*, b.title FROM lib_copies c JOIN lib_books b ON b.id=c.book_id WHERE c.location=%s AND c.status IN ('available','reserved','repair')", (loc,))]
        found, missing = [], []
        exp_codes = set()
        for cp in expected:
            exp_codes |= {cp["inv"], cp["barcode"] or ""}
            (found if (cp["inv"] in codes or (cp["barcode"] and cp["barcode"] in codes)) else missing).append(cp)
        foreign, unknown = [], []
        for code in codes - exp_codes:
            cp = self.copy_by_code(code)
            if cp:
                b = self.book(cp["book_id"]) or {}
                foreign.append(cp | {"title": b.get("title")})
            else:
                unknown.append(code)
        now = _now()
        with self.st._tx() as c:
            for cp in found:
                c.execute("UPDATE lib_copies SET seen=%s WHERE id=%s", (now, cp["id"]))
        res = {"location": loc, "expected": len(expected), "found": found, "missing": missing, "foreign": foreign, "unknown": unknown, "at": now}
        self.audit(actor, "inventory", "location", loc, None, {"expected": len(expected), "found": len(found), "missing": [m["inv"] for m in missing]})
        self.st.kv_put("lib_inventory_last", {k: (v if not isinstance(v, list) else [x.get("inv", x) if isinstance(x, dict) else x for x in v]) for k, v in res.items()})
        return res

    def locations(self) -> list[dict]:
        return [dict(r) for r in self.st._q("SELECT location, COUNT(*) AS n FROM lib_copies WHERE location IS NOT NULL AND location<>'' GROUP BY location ORDER BY location")]

    # ------------------------------------------------------------------ bildirishnoma sozlamalari
    def prefs(self, uid: str) -> dict:
        r = self.st._q("SELECT * FROM lib_prefs WHERE user_id=%s", (uid,))
        if not r:
            return {"channels": ["inapp", "email"], "tg_chat": None, "font": 1}
        d = dict(r[0])
        return {"channels": _j(d["channels"], ["inapp", "email"]), "tg_chat": d["tg_chat"], "font": d["font"]}

    def save_prefs(self, uid: str, data: dict) -> dict:
        cur = self.prefs(uid)
        ch = [c for c in (data.get("channels") or cur["channels"]) if c in ("inapp", "email", "telegram", "sms")]
        font = max(0, min(int(data.get("font", cur["font"]) or 0), 2))
        with self.st._tx() as c:
            c.execute("INSERT INTO lib_prefs(user_id, channels, font, updated) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id) DO UPDATE SET channels=excluded.channels, "
                      "font=excluded.font, updated=excluded.updated", (uid, json.dumps(ch), font, _now()))
        return self.prefs(uid)

    def tg_link_token(self, uid: str) -> str:
        tok = secrets.token_urlsafe(9).replace("-", "x").replace("_", "y")
        with self.st._tx() as c:
            c.execute("INSERT INTO lib_prefs(user_id, tg_token, updated) VALUES(%s,%s,%s) ON CONFLICT(user_id) DO UPDATE SET tg_token=excluded.tg_token, updated=excluded.updated",
                      (uid, tok, _now()))
        return tok

    def tg_link(self, token: str, chat_id: str) -> str | None:
        r = self.st._q("SELECT user_id FROM lib_prefs WHERE tg_token=%s", (token,))
        if not r:
            return None
        uid = r[0]["user_id"]
        p = self.prefs(uid)
        ch = list(dict.fromkeys([*p["channels"], "telegram"]))
        with self.st._tx() as c:
            c.execute("UPDATE lib_prefs SET tg_chat=%s, tg_token=NULL, channels=%s WHERE user_id=%s", (str(chat_id), json.dumps(ch), uid))
        return uid

    def sent_once(self, key: str) -> bool:
        """True — birinchi marta (yuborish kerak); False — avval yuborilgan."""
        with self.st._tx() as c:
            return bool(c.execute("INSERT INTO lib_sent(key, created) VALUES(%s,%s) ON CONFLICT DO NOTHING", (key, _now())).rowcount)

    def due_soon(self, days: int) -> list[dict]:
        d = (date.today() + timedelta(days=days)).isoformat()
        return [dict(r) for r in self.st._q("SELECT l.*, b.title FROM lib_loans l JOIN lib_books b ON b.id=l.book_id WHERE l.returned IS NULL AND substr(l.due,1,10)=%s", (d,))]
