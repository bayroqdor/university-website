"""Murojaatlar (service desk):

- Saytdagi «Aloqa» formasi va bo'lim pochtasiga (masalan, info@example.edu) kelgan xatlar — chiptaga aylanadi (#UNI-123).
- Bosqichlar: Yangi → Jarayonda → Javob kutilmoqda → Hal qilindi / Rad etildi. Bosqich — ish jarayoni: uni operator o'zgartiradi;
  operator murojaatchiga javob yuborsa — ochiq murojaat (Yangi, Javob kutilmoqda) avtomatik «Jarayonda»ga o'tadi (hal qilingan /
  rad etilgani o'zgarmaydi); murojaatchi yopilgan murojaatga yozsa — qayta ochiladi.
- Bosqich o'zgarsa murojaatchiga kanal orqali (Telegram / pochta / sayt chati) xabar boradi: yangi holat + operator izohi;
  «Jarayonda» bundan mustasno — holat xabari yuborilmaydi (operator javobining o'zi aloqa), faqat izoh yozilgan bo'lsa u oddiy
  xabar bo'lib boradi; o'zgarish murojaatchiga «Mening murojaatlarim» va /request/<kalit> tarixida ko'rinadi.
  «Hal qilindi»da — baholash so'rovi (1–5 yulduz, ixtiyoriy izoh; bitta murojaatga bitta baho).
- Ilovalar (rasm, hujjat, video, ovozli xabar): Telegram va pochtadan kelganlari saqlanadi, operator ilovalari kanal orqali yuboriladi.
- «Boshlash» bosgan administrator chiptaga mas'ul bo'ladi; boshqasiga o'tkazish mumkin (sabab bilan).
- Javob pochta orqali — chipta bo'limiga biriktirilgan manzildan yuboriladi; murojaatchi javob qaytarsa, xat shu chiptaga tushadi
  (mavzudagi [UNI-123] belgisi yoki In-Reply-To/References bo'yicha). Hal qilingan chiptaga yangi xat kelsa — qayta ochiladi.
- Ichki izohlar faqat administratorlarga ko'rinadi. Barcha harakatlar tarixi chipta tafsilotida.
"""
from __future__ import annotations

import json
import logging
import mimetypes
import re
import secrets
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from email import message_from_bytes, policy
from email.utils import getaddresses

from . import mail as M
from . import media as MD

log = logging.getLogger("university.desk")

STAGES = [
    {"id": "new", "title": "Yangi", "color": "#3b82f6"},
    {"id": "in_progress", "title": "Jarayonda", "color": "#f59e0b"},
    {"id": "waiting", "title": "Javob kutilmoqda", "color": "#8b5cf6"},
    {"id": "resolved", "title": "Hal qilindi", "color": "#16a34a"},
    {"id": "failed", "title": "Rad etildi", "color": "#dc2626"},
]
STAGE_IDS = [s["id"] for s in STAGES]
TERMINAL = ("resolved", "failed")
WORKING = "in_progress"  # operator javobi shu bosqichga o'tkazadi; unga o'tish murojaatchiga holat xabari bilan bildirilmaydi
PRIORITIES = ("low", "medium", "high", "critical")
TAG = "UNI"
TAG_RE = re.compile(r"\[" + TAG + r"-(\d+)\]")
DESK_FOLDER = "Murojaatlar"

DEFAULT_CATEGORIES = [
    {"title": "Umumiy savollar", "color": "#3b82f6", "local": "info"},
    {"title": "Qabul komissiyasi", "color": "#16a34a", "local": "qabul"},
    {"title": "O‘quv bo‘limi", "color": "#f59e0b", "local": "study"},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ------------------------------------------------------------------ murojaatchiga xabarlar (uz / ru / en)
LANGS = ("uz", "ru", "en")
STAGE_L = {
    "uz": {"new": "Yangi", "in_progress": "Jarayonda", "waiting": "Javob kutilmoqda", "resolved": "Hal qilindi", "failed": "Rad etildi"},
    "ru": {"new": "Новое", "in_progress": "В работе", "waiting": "Ожидается ответ", "resolved": "Решено", "failed": "Отклонено"},
    "en": {"new": "New", "in_progress": "In progress", "waiting": "Awaiting reply", "resolved": "Resolved", "failed": "Declined"},
}
NOTE = {
    "uz": {"status": "Murojaatingiz holati: {stage}", "comment": "Izoh", "resolved": "Murojaatingiz hal qilindi.",
           "rate": "Iltimos, xizmat sifatini 1 dan 5 gacha baholang:", "rate_link": "Baholash va murojaat tarixi: {url}",
           "view": "Murojaat holati va tarixi: {url}", "subject": "Murojaat holati: {stage}", "hello": "Assalomu alaykum, {name}!"},
    "ru": {"status": "Статус вашего обращения: {stage}", "comment": "Комментарий", "resolved": "Ваше обращение решено.",
           "rate": "Пожалуйста, оцените качество обслуживания от 1 до 5:", "rate_link": "Оценка и история обращения: {url}",
           "view": "Статус и история обращения: {url}", "subject": "Статус обращения: {stage}", "hello": "Здравствуйте, {name}!"},
    "en": {"status": "Your request status: {stage}", "comment": "Comment", "resolved": "Your request has been resolved.",
           "rate": "Please rate our service from 1 to 5:", "rate_link": "Rate and view the request history: {url}",
           "view": "Request status and history: {url}", "subject": "Request status: {stage}", "hello": "Hello, {name}!"},
}
TZ = timezone(timedelta(hours=5))  # Toshkent (yozgi vaqt yo'q)


def lang_of(v) -> str:
    return v if v in LANGS else "uz"


def local_dt(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        return datetime.fromisoformat(iso).astimezone(TZ).strftime("%d.%m.%Y %H:%M")
    except ValueError:
        return iso[:16]


def status_text(lang: str, stage: str, comment: str, *, rate_url: str = "", view_url: str = "") -> str:
    """Bosqich o'zgargani haqida murojaatchiga oddiy matn (pochta va sayt chati uchun)."""
    L = NOTE[lang_of(lang)]
    lines = [L["status"].format(stage=STAGE_L[lang_of(lang)].get(stage, stage))]
    if stage == "resolved":
        lines.insert(0, L["resolved"])
    if comment:
        lines += ["", f"{L['comment']}: {comment}"]
    if rate_url:
        lines += ["", L["rate"], L["rate_link"].format(url=rate_url)]
    elif view_url:
        lines += ["", L["view"].format(url=view_url)]
    return "\n".join(lines)


# ------------------------------------------------------------------ ilovalar (yopiq saqlanadi: faqat «Murojaatlar» administratorlari ko'radi)
MAX_ATT = 20 * 1024 * 1024
ATT_RE = re.compile(r"[a-f0-9]{32}\.[a-z0-9]{1,8}")
IMAGE_EXT = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}
VIDEO_EXT = {"mp4": "video/mp4", "webm": "video/webm", "mov": "video/quicktime", "m4v": "video/mp4"}
AUDIO_EXT = {"mp3": "audio/mpeg", "m4a": "audio/mp4", "ogg": "audio/ogg", "oga": "audio/ogg", "opus": "audio/ogg", "wav": "audio/wav", "aac": "audio/aac"}
INLINE_EXT = IMAGE_EXT | VIDEO_EXT | AUDIO_EXT | {"pdf": "application/pdf"}
MIME_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm",
            "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/ogg": "ogg", "audio/wav": "wav",
            "application/pdf": "pdf", "text/plain": "txt"}


def att_kind(ext: str) -> str:
    return "image" if ext in IMAGE_EXT else "video" if ext in VIDEO_EXT else "audio" if ext in AUDIO_EXT else "file"


def att_mime(ext: str) -> str:
    return INLINE_EXT.get(ext) or mimetypes.types_map.get("." + ext) or "application/octet-stream"


def save_attachment(st, name: str, data: bytes, mime: str = "") -> dict:
    """Fayl yopiq saqlanadi (diskda `private/desk/`, S3 da `private/desk/`); qaytadi: {name, url, size, mime, kind}."""
    name = re.sub(r"[\x00-\x1f/\\]+", "_", (name or "").strip())[:150] or "fayl"
    ext = name.rsplit(".", 1)[1].lower() if "." in name else ""
    if not re.fullmatch(r"[a-z0-9]{1,8}", ext):
        ext = MIME_EXT.get((mime or "").split(";")[0].strip().lower()) or "bin"
    token = secrets.token_hex(16)
    m = att_mime(ext)
    MD.put_blob(st, f"desk/{token}.{ext}", data, m, private=True)
    return {"name": name, "url": f"/api/admin/desk/att/{token}.{ext}", "size": len(data), "mime": m, "kind": att_kind(ext)}


def load_attachment(st, f: dict) -> bytes | None:
    key = str(f.get("url") or "").rsplit("/", 1)[-1]
    return MD.get_blob(st, f"desk/{key}", private=True) if ATT_RE.fullmatch(key) else None


class Desk:
    def __init__(self, st):
        self.st = st
        self._init()

    # ------------------------------------------------------------------ jadval
    def _init(self) -> None:
        with self.st._tx() as c:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS desk_categories (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, color TEXT, mailbox TEXT, member_ids TEXT NOT NULL DEFAULT '[]',
                    sort BIGINT NOT NULL DEFAULT 0, active BIGINT NOT NULL DEFAULT 1);
                CREATE TABLE IF NOT EXISTS desk_tickets (
                    id TEXT PRIMARY KEY, number BIGINT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
                    stage TEXT NOT NULL DEFAULT 'new', priority TEXT NOT NULL DEFAULT 'medium', category_id TEXT,
                    requester_name TEXT, requester_email TEXT, requester_phone TEXT, source TEXT NOT NULL DEFAULT 'web', ip TEXT,
                    assignee_id TEXT, created TEXT NOT NULL, updated TEXT NOT NULL, first_response_at TEXT, resolved_at TEXT,
                    last_in_at TEXT, unread BIGINT NOT NULL DEFAULT 1, msg_ids TEXT NOT NULL DEFAULT '[]');
                CREATE INDEX IF NOT EXISTS ix_desk_stage ON desk_tickets(stage, updated);
                CREATE TABLE IF NOT EXISTS desk_events (
                    id BIGSERIAL PRIMARY KEY, ticket_id TEXT NOT NULL, kind TEXT NOT NULL, author_id TEXT, author_name TEXT,
                    content TEXT NOT NULL DEFAULT '', meta TEXT NOT NULL DEFAULT '{}', created TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS ix_desk_events ON desk_events(ticket_id, id);
                """
            )
        self.st.add_column("desk_tickets", "tg_chat", "TEXT")  # Telegram bot orqali kelgan murojaat: javob shu chatga yuboriladi
        for col, decl in (("lang", "TEXT"), ("rating", "BIGINT"), ("rating_comment", "TEXT"), ("rated_at", "TEXT"), ("rating_agent_id", "TEXT"),
                          ("public_token", "TEXT"), ("chat_sid", "TEXT")):
            self.st.add_column("desk_tickets", col, decl)
        if self.st._one("SELECT COUNT(*) FROM desk_tickets WHERE source='chat' AND chat_sid IS NULL"):
            with self.st._tx() as c:  # oldingi versiyada chat suhbati faqat birinchi hodisada saqlangan
                c.execute("UPDATE desk_tickets t SET chat_sid = (e.meta::json->>'chat_id') FROM desk_events e "
                          "WHERE e.ticket_id = t.id AND e.kind = 'created' AND t.source = 'chat' AND t.chat_sid IS NULL")

    # ------------------------------------------------------------------ bo'limlar (toifalar)
    def categories(self) -> list[dict]:
        rows = self.st._q("SELECT * FROM desk_categories ORDER BY sort, title")
        return [dict(r) | {"member_ids": json.loads(r["member_ids"] or "[]"), "active": bool(r["active"])} for r in rows]

    def category(self, cid: str | None) -> dict | None:
        return next((c for c in self.categories() if c["id"] == cid), None) if cid else None

    def ensure_defaults(self, domain: str) -> None:
        if self.categories():
            return
        for i, c in enumerate(DEFAULT_CATEGORIES):
            self.save_category({"title": c["title"], "color": c["color"], "mailbox": f"{c['local']}@{domain}", "sort": i})

    def save_category(self, d: dict, cid: str | None = None) -> dict:
        cid = cid or uuid.uuid4().hex[:10]
        mailbox = str(d.get("mailbox") or "").strip().lower()[:160]
        if mailbox and not M.EMAIL_RE.match(mailbox):
            raise ValueError("invalid_email")
        vals = (str(d.get("title") or "").strip()[:120] or "Bo‘lim", str(d.get("color") or "#3b82f6")[:20], mailbox,
                json.dumps([str(x)[:40] for x in (d.get("member_ids") or [])][:50]), int(d.get("sort") or 0), int(bool(d.get("active", True))))
        with self.st._tx() as c:
            c.execute("INSERT INTO desk_categories(id, title, color, mailbox, member_ids, sort, active) VALUES(%s,%s,%s,%s,%s,%s,%s) "
                      "ON CONFLICT(id) DO UPDATE SET title=excluded.title, color=excluded.color, mailbox=excluded.mailbox, "
                      "member_ids=excluded.member_ids, sort=excluded.sort, active=excluded.active", (cid, *vals))
        return self.category(cid)

    def delete_category(self, cid: str) -> None:
        with self.st._tx() as c:
            c.execute("UPDATE desk_tickets SET category_id=NULL WHERE category_id=%s", (cid,))
            c.execute("DELETE FROM desk_categories WHERE id=%s", (cid,))

    def mailboxes(self) -> list[str]:
        return sorted({c["mailbox"] for c in self.categories() if c["mailbox"] and c["active"]})

    # ------------------------------------------------------------------ chiptalar
    @staticmethod
    def _t(r) -> dict:
        d = dict(r)
        d["msg_ids"] = json.loads(d.get("msg_ids") or "[]")
        d["unread"] = bool(d["unread"])
        return d

    def get(self, tid: str) -> dict | None:
        r = self.st._q("SELECT * FROM desk_tickets WHERE id=%s", (tid,))
        return self._t(r[0]) if r else None

    def by_number(self, n: int) -> dict | None:
        r = self.st._q("SELECT * FROM desk_tickets WHERE number=%s", (n,))
        return self._t(r[0]) if r else None

    def list(self, q: str = "", category: str = "", assignee: str = "", stage: str = "", limit: int = 500) -> list[dict]:
        sql, args = "SELECT * FROM desk_tickets WHERE 1=1", []
        if category:
            sql += " AND category_id=%s"
            args.append(category)
        if assignee == "none":
            sql += " AND assignee_id IS NULL"
        elif assignee:
            sql += " AND assignee_id=%s"
            args.append(assignee)
        if stage:
            sql += " AND stage=%s"
            args.append(stage)
        if q:
            m = re.match(r"^#?(?:uni-)?(\d+)$", q.strip().lower())
            if m:
                sql += " AND number=%s"
                args.append(int(m.group(1)))
            else:
                sql += " AND (lower(title) LIKE %s OR lower(requester_name) LIKE %s OR lower(requester_email) LIKE %s OR requester_phone LIKE %s OR lower(body) LIKE %s)"
                args += [f"%{q.lower()}%"] * 5
        sql += " ORDER BY updated DESC LIMIT %s"
        args.append(limit)
        return [self._t(r) for r in self.st._q(sql, tuple(args))]

    def counts(self) -> dict:
        out = {s: 0 for s in STAGE_IDS}
        for r in self.st._q("SELECT stage, COUNT(*) AS n FROM desk_tickets GROUP BY stage"):
            out[r["stage"]] = r["n"]
        out["unread"] = int(self.st._one("SELECT COUNT(*) FROM desk_tickets WHERE unread=1") or 0)
        return out

    def stats(self, start: datetime, end: datetime) -> dict:
        """G-Guard service desk statistikasi kabi: hajmlar, MTTA (birinchi javob), MTTR (hal qilish), CSAT (1–5 baho),
        operatorlar reytingi, kunlik dinamika va bo'limlar kesimi. Davr — murojaat kelib tushgan vaqt bo'yicha."""
        rows = [self._t(r) for r in self.st._q("SELECT * FROM desk_tickets WHERE created >= %s AND created < %s ORDER BY created",
                                                 (start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds")))]

        def mins(a: str | None, b: str | None) -> float | None:
            if not a or not b:
                return None
            try:
                return max(0.0, (datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds() / 60)
            except ValueError:
                return None

        def avg(xs: list) -> int | None:
            xs = [x for x in xs if x is not None]
            return round(sum(xs) / len(xs)) if xs else None

        def dist(rs: list[int]) -> dict:
            return {str(k): sum(1 for r in rs if r == k) for k in range(1, 6)}

        rated = [t for t in rows if t.get("rating")]
        ratings = [int(t["rating"]) for t in rated]
        overview = {
            "total": len(rows),
            "open": sum(1 for t in rows if t["stage"] not in TERMINAL),
            "by_stage": {s: sum(1 for t in rows if t["stage"] == s) for s in STAGE_IDS},
            "by_source": {},
            "unassigned": sum(1 for t in rows if not t["assignee_id"] and t["stage"] not in TERMINAL),
            "avg_first_response_min": avg([mins(t["created"], t["first_response_at"]) for t in rows]),
            "avg_resolve_min": avg([mins(t["created"], t["resolved_at"]) for t in rows if t["stage"] == "resolved"]),
            "csat": round(sum(ratings) / len(ratings), 2) if ratings else None,
            "ratings": len(ratings),
            "rating_dist": dist(ratings),
            "positive_pct": round(100 * sum(1 for r in ratings if r >= 4) / len(ratings)) if ratings else None,
        }
        for t in rows:
            overview["by_source"][t["source"]] = overview["by_source"].get(t["source"], 0) + 1
        ops: dict[str, dict] = {}
        for t in rows:
            for uid, what in ((t["assignee_id"], "work"), (t.get("rating_agent_id") or (t["assignee_id"] if t.get("rating") else None), "rate")):
                if not uid:
                    continue
                o = ops.setdefault(uid, {"user_id": uid, "assigned": 0, "open": 0, "resolved": 0, "failed": 0, "ratings": [], "mtta": [], "mttr": []})
                if what == "work":
                    o["assigned"] += 1
                    o["open" if t["stage"] not in TERMINAL else t["stage"]] += 1
                    o["mtta"].append(mins(t["created"], t["first_response_at"]))
                    if t["stage"] == "resolved":
                        o["mttr"].append(mins(t["created"], t["resolved_at"]))
                elif t.get("rating"):
                    o["ratings"].append(int(t["rating"]))
        operators = []
        for o in ops.values():
            rs = o.pop("ratings")
            operators.append(o | {"rated": len(rs), "csat": round(sum(rs) / len(rs), 2) if rs else None, "stars": dist(rs),
                                  "avg_first_response_min": avg(o.pop("mtta")), "avg_resolve_min": avg(o.pop("mttr"))})
        operators.sort(key=lambda o: (-(o["csat"] or 0), -o["resolved"], -o["assigned"]))
        days: dict[str, dict] = {}
        d = start.astimezone(TZ).date()
        while d <= (end - timedelta(seconds=1)).astimezone(TZ).date() and len(days) < 400:
            days[d.isoformat()] = {"date": d.isoformat(), "created": 0, "resolved": 0}
            d += timedelta(days=1)
        for t in rows:
            k = datetime.fromisoformat(t["created"]).astimezone(TZ).date().isoformat()
            if k in days:
                days[k]["created"] += 1
        for r in self.st._q("SELECT resolved_at FROM desk_tickets WHERE stage='resolved' AND resolved_at >= %s AND resolved_at < %s",
                            (start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds"))):
            k = datetime.fromisoformat(r["resolved_at"]).astimezone(TZ).date().isoformat()
            if k in days:
                days[k]["resolved"] += 1
        cats = {c["id"]: c for c in self.categories()}
        by_cat: dict[str, dict] = {}
        for t in rows:
            c = cats.get(t["category_id"] or "")
            k = c["id"] if c else ""
            by_cat.setdefault(k, {"id": k, "title": c["title"] if c else "", "color": c["color"] if c else "", "count": 0})["count"] += 1
        return {"overview": overview, "operators": operators, "timeline": list(days.values()),
                "categories": sorted(by_cat.values(), key=lambda x: -x["count"])}

    def create(self, title: str, body: str, *, name: str = "", email: str = "", phone: str = "", category_id: str | None = None,
               source: str = "web", ip: str = "", msg_id: str = "", priority: str = "medium", meta: dict | None = None, lang: str = "",
               tg_chat: str | None = None, chat_sid: str | None = None) -> dict:
        tid = uuid.uuid4().hex[:12]
        now = _now()
        with self.st._tx() as c:
            n = int(c.execute("SELECT COALESCE(MAX(number), 0) + 1 FROM desk_tickets").fetchone()[0])
            c.execute("INSERT INTO desk_tickets(id, number, title, body, stage, priority, category_id, requester_name, requester_email, requester_phone, "
                      "source, ip, created, updated, last_in_at, msg_ids, lang, public_token, tg_chat, chat_sid) "
                      "VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                      (tid, n, (title or "Murojaat").strip()[:300], body[:20000], "new", priority if priority in PRIORITIES else "medium", category_id,
                       name[:160], email.lower()[:160], phone[:40], source, ip[:60], now, now, now, json.dumps([msg_id] if msg_id else []),
                       lang if lang in LANGS else None, secrets.token_urlsafe(18), tg_chat, chat_sid))
        self.event(tid, "created", None, name or email or "—", body, meta or {"source": source})
        return self.get(tid)

    def update(self, tid: str, **f) -> dict:
        allowed = {k: v for k, v in f.items() if k in ("title", "stage", "priority", "category_id", "assignee_id", "first_response_at", "resolved_at", "unread", "msg_ids", "last_in_at", "tg_chat", "lang",
                                                       "rating", "rating_comment", "rated_at", "rating_agent_id", "public_token", "chat_sid")}
        if "msg_ids" in allowed:
            allowed["msg_ids"] = json.dumps(allowed["msg_ids"][-60:])
        if "unread" in allowed:
            allowed["unread"] = int(bool(allowed["unread"]))
        allowed["updated"] = _now()
        with self.st._tx() as c:
            c.execute(f"UPDATE desk_tickets SET {', '.join(k + '=%s' for k in allowed)} WHERE id=%s", (*allowed.values(), tid))
        return self.get(tid)

    def event(self, tid: str, kind: str, author_id: str | None, author_name: str, content: str = "", meta: dict | None = None) -> int:
        with self.st._tx() as c:
            r = c.execute("INSERT INTO desk_events(ticket_id, kind, author_id, author_name, content, meta, created) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                          (tid, kind, author_id, author_name[:160], content[:50000], json.dumps(meta or {}, ensure_ascii=False), _now())).fetchone()
        return int(r[0])

    def event_meta(self, eid: int, extra: dict) -> None:
        """Hodisa meta'siga qo'shimcha (masalan, xabar qaysi kanallarga yetkazilgani)."""
        r = self.st._q("SELECT meta FROM desk_events WHERE id=%s", (eid,))
        if r:
            with self.st._tx() as c:
                c.execute("UPDATE desk_events SET meta=%s WHERE id=%s", (json.dumps(json.loads(r[0]["meta"] or "{}") | extra, ensure_ascii=False), eid))

    def token(self, t: dict) -> str:
        """Murojaatchi uchun ochiq havola kaliti (holat, tarix, baholash) — eski chiptalarga birinchi so'ralganda beriladi."""
        if not t.get("public_token"):
            t["public_token"] = secrets.token_urlsafe(18)
            self.update(t["id"], public_token=t["public_token"])
        return t["public_token"]

    def by_token(self, token: str) -> dict | None:
        if not token or not re.fullmatch(r"[A-Za-z0-9_-]{16,40}", token):
            return None
        r = self.st._q("SELECT * FROM desk_tickets WHERE public_token=%s", (token,))
        return self._t(r[0]) if r else None

    def history(self, tid: str) -> list[dict]:
        """Murojaatchiga ko'rinadigan bosqichlar tarixi: holat + operator izohi + vaqt (ichki izohlar kirmaydi)."""
        out = []
        for e in self.events(tid):
            if e["kind"] == "created":
                out.append({"stage": "new", "comment": "", "at": e["created"]})
            elif e["kind"] in ("transition", "start", "auto") and e["meta"].get("to"):
                out.append({"stage": e["meta"]["to"], "comment": e["content"] if e["kind"] != "auto" else "", "at": e["created"]})
        return out

    def last_comment(self, tid: str) -> str:
        return next((h["comment"] for h in reversed(self.history(tid)) if h["comment"]), "")

    # ------------------------------------------------------------------ baholash (G-Guard kabi: 1–5 yulduz, ixtiyoriy izoh, bitta murojaatga bitta baho)
    def rate(self, t: dict, rating, comment: str = "", by: str = "") -> dict:
        try:
            r = int(rating)
        except (TypeError, ValueError):
            raise ValueError("invalid_rating") from None
        if not 1 <= r <= 5 or str(rating).strip() not in (str(r), f"{r}.0"):
            raise ValueError("invalid_rating")
        if t["stage"] not in TERMINAL:
            raise ValueError("not_resolved")
        if t.get("rating"):
            raise ValueError("already_rated")
        comment = (comment or "").strip()[:2000]
        with self.st._tx() as c:
            n = c.execute("UPDATE desk_tickets SET rating=%s, rating_comment=%s, rated_at=%s, rating_agent_id=assignee_id WHERE id=%s AND rating IS NULL",
                          (r, comment or None, _now(), t["id"])).rowcount
        if not n:
            raise ValueError("already_rated")
        self.event(t["id"], "rating", None, t["requester_name"] or t["requester_email"] or "—", comment, {"rating": r, "via": by})
        return self.get(t["id"])

    def rate_comment(self, t: dict, comment: str) -> dict:
        """Baho qo'yilgandan keyin yozilgan izoh (Telegram: yulduzdan so'ng keyingi xabar). Izoh faqat bir marta."""
        comment = (comment or "").strip()[:2000]
        if not t.get("rating") or t.get("rating_comment") or not comment:
            return t
        self.update(t["id"], rating_comment=comment)
        self.event(t["id"], "rating", None, t["requester_name"] or "—", comment, {"rating": t["rating"], "comment_only": True})
        return self.get(t["id"])

    def events(self, tid: str) -> list[dict]:
        return [dict(r) | {"meta": json.loads(r["meta"] or "{}")} for r in self.st._q("SELECT * FROM desk_events WHERE ticket_id=%s ORDER BY id", (tid,))]

    def delete(self, tid: str) -> None:
        with self.st._tx() as c:
            c.execute("DELETE FROM desk_events WHERE ticket_id=%s", (tid,))
            c.execute("DELETE FROM desk_tickets WHERE id=%s", (tid,))

    # ------------------------------------------------------------------ harakatlar
    def move(self, t: dict, stage: str, actor: dict, reason: str = "", kind: str = "transition") -> dict:
        if stage not in STAGE_IDS or stage == t["stage"]:
            return t
        f: dict = {"stage": stage}
        if stage in TERMINAL:
            f["resolved_at"] = _now()
        elif t["stage"] in TERMINAL:
            f["resolved_at"] = None
        nt = self.update(t["id"], **f)
        nt["event_id"] = self.event(t["id"], kind, actor.get("id"), actor.get("name") or "Tizim", reason, {"from": t["stage"], "to": stage})
        return nt

    def start(self, t: dict, actor: dict) -> dict:
        """«Boshlash»: bosgan administrator mas'ul bo'ladi."""
        if t["assignee_id"] != actor["id"]:
            t = self.update(t["id"], assignee_id=actor["id"])
            self.event(t["id"], "assign", actor["id"], actor["name"], "", {"to": actor["id"], "to_name": actor["name"], "self": True})
        return self.move(t, "in_progress", actor, "", "start") if t["stage"] in ("new", "waiting") or t["stage"] in TERMINAL else t

    def reassign(self, t: dict, actor: dict, assignee: dict | None, reason: str) -> dict:
        nt = self.update(t["id"], assignee_id=assignee["id"] if assignee else None)
        self.event(t["id"], "assign", actor["id"], actor["name"], reason, {"from": t["assignee_id"], "to": assignee["id"] if assignee else None, "to_name": assignee["name"] if assignee else ""})
        return nt

    # ------------------------------------------------------------------ pochta: javob yuborish
    def mailbox_for(self, t: dict) -> str:
        cat = self.category(t["category_id"])
        allowed = self.mailboxes()
        return ((cat or {}).get("mailbox") if (cat or {}).get("mailbox") in allowed else (allowed[0] if allowed else "")) or ""

    def send_mail(self, t: dict, sender_name: str, from_addr: str, cfg: dict, subject: str, body: str, html: str = "",
                  files: list | None = None) -> str:
        """Murojaatchiga xat (bo'lim manzilidan, [UNI-123] belgisi va In-Reply-To bilan — javobi shu chiptaga qaytadi). Message-ID qaytadi."""
        to = t["requester_email"]
        if not to:
            raise ValueError("no_requester_email")
        refs = [x for x in t["msg_ids"] if x]
        data = {"to": [to], "subject": subject, "text": body, "html": html or M.text_to_html(body)}
        if refs:
            data["in_reply_to"] = refs[-1]
            data["references"] = " ".join(refs[-10:-1])
        msg = M.build_message((sender_name, from_addr), data, files or [], cfg["domain"])
        M.smtp_send(cfg, from_addr, msg, [to])
        try:
            with M.Mailbox(cfg, from_addr) as mb:
                mb.append(mb.role_path("sent"), msg.as_bytes(), "(\\Seen)")
        except M.MailError:
            pass
        mid = str(msg["Message-ID"])
        self.update(t["id"], msg_ids=[*t["msg_ids"], mid])
        t["msg_ids"] = [*t["msg_ids"], mid]
        return mid

    def subject(self, t: dict, prefix: str = "Re: ") -> str:
        return f"{prefix}{re.sub(TAG_RE, '', t['title']).strip()} [{TAG}-{t['number']}]"

    def _answered(self, t: dict, actor: dict) -> dict:
        """Operator javobidan keyin: o'qilgan, birinchi javob vaqti, mas'ul (bo'lmasa — javob yozgan operator)."""
        f: dict = {"unread": False}
        if not t["first_response_at"]:
            f["first_response_at"] = _now()
        if not t["assignee_id"]:
            f["assignee_id"] = actor["id"]
        return self.update(t["id"], **f)

    def _to_work(self, t: dict, actor: dict) -> dict:
        """Javob yuborildi: ochiq murojaat (Yangi, Javob kutilmoqda va h.k.) «Jarayonda»ga o'tadi — tarixda hodisa sifatida;
        hal qilingan / rad etilgan murojaat o'zgarmaydi. Murojaatchiga holat xabari yuborilmaydi (javobning o'zi yetarli)."""
        if t["stage"] in TERMINAL or t["stage"] == WORKING:
            return t
        nt = self.move(t, WORKING, actor, "", "transition")
        self.event_meta(nt.pop("event_id"), {"via": "reply"})
        return nt

    def reply(self, t: dict, actor: dict, body: str, from_addr: str, cfg: dict, html: str = "", files: list | None = None,
              saved: list | None = None) -> dict:
        """Murojaatchiga xat (bo'lim manzilidan). Mavzu: «Re: … [UNI-123]» — javob shu chiptaga qaytadi.
        files: [(nom, mime, bayt)] — xatga ilova; saved: shu fayllarning saqlangan nusxalari (yozishmada ko'rsatish uchun)."""
        if not t["requester_email"]:
            raise ValueError("no_requester_email")
        subject = self.subject(t)
        cat = self.category(t["category_id"])
        sender_name = f"{actor['name']} — University" + (f" ({cat['title']})" if cat else "")
        mid = self.send_mail(t, sender_name, from_addr, cfg, subject, body, html, files)
        nt = self._answered(self.get(t["id"]), actor)
        self.event(t["id"], "message_out", actor["id"], actor["name"], body, {"from": from_addr, "to": t["requester_email"], "subject": subject,
                                                                             "message_id": mid, "files": saved if saved is not None else [n for n, _c, _b in (files or [])]})
        return self._to_work(nt, actor)

    # ------------------------------------------------------------------ Telegram
    def reply_telegram(self, t: dict, actor: dict, body: str, send, files: list | None = None, saved: list | None = None) -> dict:
        """Telegram orqali kelgan murojaatga javob: bot shu chatga yozadi (send(chat_id, ticket, text, files)); ilovalar — rasm/hujjat/video/ovoz."""
        if not t.get("tg_chat"):
            raise ValueError("no_telegram_chat")
        send(t["tg_chat"], t, body, files or [])
        nt = self._answered(t, actor)
        self.event(t["id"], "message_out", actor["id"], actor["name"], body, {"channel": "telegram", "chat_id": t["tg_chat"], "files": saved or []})
        return self._to_work(nt, actor)

    def reply_chat(self, t: dict, actor: dict, body: str, deliver, saved: list | None = None) -> dict:
        """Sayt chati orqali kelgan murojaat: javob suhbat oynasiga yoziladi (deliver(sid, text))."""
        if not t.get("chat_sid"):
            raise ValueError("no_chat_session")
        deliver(t["chat_sid"], body)
        nt = self._answered(t, actor)
        self.event(t["id"], "message_out", actor["id"], actor["name"], body, {"channel": "chat", "files": saved or []})
        return self._to_work(nt, actor)

    def reopen_if_closed(self, t: dict) -> dict:
        """Murojaatchi yozdi: bosqich o'zgarmaydi; faqat yopilgan (hal qilingan / rad etilgan) murojaat qayta ochiladi."""
        if t["stage"] in TERMINAL:
            return self.move(t, "in_progress" if t["assignee_id"] else "new", {"id": None, "name": "Tizim"}, "Murojaatchi yopilgan murojaatga yozdi", "auto")
        return t

    def telegram_in(self, t: dict, name: str, text: str, meta: dict | None = None) -> dict:
        """Murojaatchi botda yozgan qo'shimcha xabar (matn va/yoki ilovalar) — shu chiptaga.
        Albom (media_group_id) bitta xabar bo'lib yig'iladi."""
        meta = {"channel": "telegram"} | (meta or {})
        nt = self.update(t["id"], unread=True, last_in_at=_now())
        mg = meta.get("media_group_id")
        last = self.st._q("SELECT * FROM desk_events WHERE ticket_id=%s ORDER BY id DESC LIMIT 1", (t["id"],)) if mg else []
        if last and last[0]["kind"] == "message_in" and json.loads(last[0]["meta"] or "{}").get("media_group_id") == mg:
            lm = json.loads(last[0]["meta"] or "{}")
            lm["files"] = [*(lm.get("files") or []), *(meta.get("files") or [])]
            content = "\n".join(x for x in (last[0]["content"], text) if x)
            with self.st._tx() as c:
                c.execute("UPDATE desk_events SET meta=%s, content=%s WHERE id=%s", (json.dumps(lm, ensure_ascii=False), content[:50000], last[0]["id"]))
        else:
            self.event(t["id"], "message_in", None, name, text, meta)
        self.reopen_if_closed(nt)
        return self.get(t["id"])

    def by_chat(self, chat_id: str, open_only: bool = True) -> list[dict]:
        sql = "SELECT * FROM desk_tickets WHERE tg_chat=%s" + (" AND stage NOT IN ('resolved','failed')" if open_only else "") + " ORDER BY updated DESC LIMIT 10"
        return [self._t(r) for r in self.st._q(sql, (str(chat_id),))]

    # ------------------------------------------------------------------ pochta: kiruvchi xatlar
    def _match(self, msg) -> dict | None:
        m = TAG_RE.search(str(msg.get("Subject") or ""))
        if m:
            t = self.by_number(int(m.group(1)))
            if t:
                return t
        refs = " ".join(str(msg.get(h) or "") for h in ("In-Reply-To", "References"))
        ids = set(re.findall(r"<[^>]+>", refs))
        if ids:
            for r in self.st._q("SELECT * FROM desk_tickets WHERE msg_ids <> '[]' ORDER BY updated DESC LIMIT 2000"):
                t = self._t(r)
                if ids & set(t["msg_ids"]):
                    return t
        return None

    @staticmethod
    def _body(msg) -> str:
        part = msg.get_body(preferencelist=("plain", "html"))
        if part is None:
            return ""
        try:
            txt = part.get_content()
        except Exception:  # noqa: BLE001
            txt = (part.get_payload(decode=True) or b"").decode("utf-8", "replace")
        if part.get_content_subtype() == "html":
            txt = M.html_to_text(txt)
        # iqtibos qilingan eski yozishmani kesish
        lines = []
        for ln in txt.splitlines():
            if re.match(r"^\s*>", ln) or re.match(r"^(On|Le|Am|\d{1,2}[./]\d{1,2}[./]\d{2,4}).{0,120}(wrote|yozdi|написал|schrieb)\s*:\s*$", ln.strip()):
                break
            lines.append(ln)
        return "\n".join(lines).strip() or txt.strip()

    def _attachments(self, msg) -> list[dict]:
        """Xat ilovalari saqlanadi (har biri 20 MB gacha, jami 40 MB); kattalari — faqat nomi va hajmi."""
        out, total = [], 0
        for p in msg.iter_attachments():
            fn = p.get_filename()
            if not fn:
                continue
            try:
                data = p.get_payload(decode=True) or b""
            except Exception:  # noqa: BLE001
                data = b""
            if not data or len(data) > MAX_ATT or total + len(data) > 2 * MAX_ATT:
                out.append({"name": fn[:150], "size": len(data), "error": "too_large" if data else "empty"})
                continue
            total += len(data)
            try:
                out.append(save_attachment(self.st, fn, data, p.get_content_type()))
            except Exception as e:  # noqa: BLE001
                log.warning("desk attachment: %r", e)
                out.append({"name": fn[:150], "size": len(data), "error": "store_failed"})
        return out

    def ingest(self, raw: bytes, mailbox: str) -> tuple[str, dict] | None:
        """Bitta kiruvchi xat: mavjud chiptaga qo'shiladi yoki yangi chipta ochiladi."""
        msg = message_from_bytes(raw, policy=policy.default)
        frm = getaddresses([str(msg.get("From") or "")])
        name, email = (frm[0] if frm else ("", ""))
        email = (email or "").lower()
        if not email or email == mailbox.lower() or str(msg.get("Auto-Submitted") or "no").lower() not in ("", "no"):
            return None  # o'zimiz yuborgan yoki avtomatik javob (otpusk, bounce) — chipta ochilmaydi
        mid = str(msg.get("Message-ID") or "")
        subject = str(msg.get("Subject") or "").strip()
        body = self._body(msg)
        t = self._match(msg)
        if t and mid and mid in t["msg_ids"]:
            return None
        files = self._attachments(msg)
        if t:
            f: dict = {"msg_ids": [*t["msg_ids"], mid] if mid else t["msg_ids"], "unread": True, "last_in_at": _now()}
            nt = self.update(t["id"], **f)
            self.event(t["id"], "message_in", None, name or email, body, {"from": email, "subject": subject, "message_id": mid, "files": files})
            self.reopen_if_closed(nt)
            return "reply", self.get(t["id"])
        cat = next((c for c in self.categories() if c["mailbox"] == mailbox.lower()), None)
        nt = self.create(re.sub(r"^(re|fwd?|fw)\s*:\s*", "", subject, flags=re.I) or "Xat", body, name=name, email=email,
                         category_id=cat["id"] if cat else None, source="email", msg_id=mid, meta={"source": "email", "to": mailbox, "files": files})
        return "new", nt

    def poll(self, cfg: dict) -> dict:
        """Bo'lim pochta qutilaridagi o'qilmagan xatlarni chiptalarga aylantiradi; ko'rib chiqilgan xat «Murojaatlar» papkasiga o'tadi."""
        res = {"new": 0, "reply": 0, "errors": []}
        if not M.ready(cfg):
            return res
        for box in self.mailboxes():
            try:
                with M.Mailbox(cfg, box) as mb:
                    mb.select("INBOX")
                    typ, data = mb.c.uid("SEARCH", "UNSEEN")
                    uids = [int(x) for x in b" ".join(d for d in data if d).split()] if typ == "OK" else []
                    done = []
                    for uid in uids[:200]:
                        try:
                            raw = mb.raw("INBOX", uid)
                        except M.MailError:
                            continue
                        r = self.ingest(raw, box)
                        if r:
                            res[r[0]] += 1
                        done.append(uid)
                    if done:
                        mb.store("INBOX", done, "\\Seen", True)
                        try:
                            if not any(f["path"] == DESK_FOLDER for f in mb.folders(counts=False)):
                                mb.create_folder(DESK_FOLDER)
                            mb.move("INBOX", done, DESK_FOLDER)
                        except M.MailError:
                            pass
            except M.MailError as e:
                res["errors"].append(f"{box}: {e.code}")
        return res


class Poller:
    """Fon oqimi: har daqiqada bo'lim pochtalarini tekshiradi."""

    def __init__(self, st, interval: int = 60):
        self.st, self.interval = st, interval
        self.thread: threading.Thread | None = None
        self.stop = threading.Event()
        self.last: dict = {}

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return

        def loop():
            while not self.stop.wait(self.interval):
                try:
                    cfg = M.config(self.st)
                    if M.ready(cfg):
                        self.last = Desk(self.st).poll(cfg) | {"ts": time.strftime("%H:%M:%S")}
                except Exception as e:  # noqa: BLE001
                    log.warning("desk poll: %r", e)

        self.thread = threading.Thread(target=loop, daemon=True, name="desk-poll")
        self.thread.start()
