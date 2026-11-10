"""Telegram kanal/guruh — admin paneldan qo'lda yoziladigan postlar.

Post: Telegram HTML matn (faqat Telegram qo'llaydigan teglar: b, i, u, s, tg-spoiler, code, pre, blockquote [expandable], a),
media (1 rasm / 2–10 rasm-video albom / 1 video / 1 hujjat), inline URL tugmalar, maqsad chatlar (tasdiqlangan guruh/kanallar),
«post osti matni» (sozlamalarda bir marta yoziladi — avtomatik postlarga ham qo'shiladi), ovozsiz yuborish, havola ko'rinishi.

Yuborilgan post tahrirlansa — yangi xabar emas, o'sha xabar tahrirlanadi: editMessageText / editMessageCaption / editMessageMedia
(har bir chat uchun xabar id'lari `tg_mpost_msgs` da). Telegram o'zgartira olmaydigan holat (matnli xabar → rasmli, albom soni
o'zgardi va h.k.) — `Incompatible`: admin panel buni ko'rsatadi va yangi xabar sifatida qayta yuborishni taklif qiladi.
Rejalashtirilgan postlar fon oqimida (tg_publish.Publisher, 60 s) — bazada atomar band qilinadi (bir nechta jarayonda ham bir marta).
"""
from __future__ import annotations

import html as _html
import json
import re
import uuid
import weakref
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser

TEXT_MAX = 4096
CAPTION_MAX = 1024
ALBUM_MAX = 10
FOOTER_MAX = 512
ROWS_MAX = 8
ROW_BUTTONS_MAX = 4
UPLOAD_MAX = 50 * 1024 * 1024  # Bot API: bot yuboradigan fayl chegarasi
PHOTO_EXT = ("png", "jpg", "jpeg", "webp", "gif")
STALE_SENDING = 15 * 60  # soniya: «yuborilmoqda»da qotib qolgan post (jarayon to'xtagan) — xato deb belgilanadi


class Incompatible(Exception):
    """Telegram mavjud xabarni bunday o'zgartira olmaydi (masalan, matnli xabarga rasm qo'shish)."""

    def __init__(self, chats: list[dict]):
        super().__init__("telegram_edit_incompatible")
        self.chats = chats


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


_ready: "weakref.WeakSet" = weakref.WeakSet()


def ensure_schema(st) -> None:
    if st in _ready:
        return
    with st._tx() as c:
        c.execute("CREATE TABLE IF NOT EXISTS tg_mposts (id TEXT PRIMARY KEY, html TEXT, doc TEXT, media TEXT, buttons TEXT, targets TEXT, "
                  "footer INTEGER, silent INTEGER, preview INTEGER, status TEXT, scheduled_at TEXT, sent_at TEXT, claimed_at TEXT, "
                  "author TEXT, created TEXT, updated TEXT)")
        c.execute("CREATE TABLE IF NOT EXISTS tg_mpost_msgs (post_id TEXT, chat_id TEXT, message_ids TEXT, status TEXT, error TEXT, shape TEXT, "
                  "sent_at TEXT, edited_at TEXT, updated TEXT, PRIMARY KEY(post_id, chat_id))")
        c.execute("CREATE INDEX IF NOT EXISTS tg_mposts_due ON tg_mposts(status, scheduled_at)")
    _ready.add(st)


# ------------------------------------------------------------------ Telegram HTML: tozalash
TAG_MAP = {"b": "b", "strong": "b", "i": "i", "em": "i", "u": "u", "ins": "u", "s": "s", "strike": "s", "del": "s", "tg-spoiler": "tg-spoiler",
           "a": "a", "code": "code", "pre": "pre", "blockquote": "blockquote"}
LINK_RE = re.compile(r"^(https?://[^\s<>\"]+|tg://[^\s<>\"]+|mailto:[^\s<>\"]+)$", re.I)
LANG_RE = re.compile(r"^language-[A-Za-z0-9_+#.-]{1,32}$")
DROP_WITH_CONTENT = {"script", "style", "head", "title", "template", "iframe", "object", "noscript"}
BREAK_AFTER = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr"}


def _escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class _San(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.stack: list[tuple[str, str]] = []  # (teg, ochilish matni)
        self.src: dict[str, list[str | None]] = {}  # manba teg nomi → chiqishdagi teg (yoki None — tashlab yuborilgan)
        self.drop = 0

    def _inside(self, *tags: str) -> bool:
        return any(t in tags for t, _ in self.stack)

    def _map(self, tag: str, attrs: dict) -> tuple[str, str] | None:
        if tag == "span":
            return ("tg-spoiler", "<tg-spoiler>") if "tg-spoiler" in (attrs.get("class") or "").split() else None
        out = TAG_MAP.get(tag)
        if not out:
            return None
        if self._inside("code") or (self._inside("pre") and out != "code"):
            return None  # pre/code ichida boshqa formatlash bo'lmaydi
        if out == "code" and self._inside("pre"):
            if self.stack[-1][0] != "pre":
                return None
            lang = (attrs.get("class") or "").strip()
            return "code", f'<code class="{lang}">' if LANG_RE.match(lang) else "<code>"
        if out == "a":
            href = (attrs.get("href") or "").strip()
            if self._inside("a") or not LINK_RE.match(href) or len(href) > 2048:
                return None
            return "a", f'<a href="{_html.escape(href, quote=True)}">'
        if out == "blockquote":
            if self._inside("blockquote"):
                return None
            exp = "expandable" in attrs or (attrs.get("data-expandable") or "").lower() == "true"
            return "blockquote", "<blockquote expandable>" if exp else "<blockquote>"
        if out == "pre" and self._inside("blockquote"):
            return None
        if self._inside(out):
            return None  # bir xil formatni ichma-ich ochish shart emas
        return out, f"<{out}>"

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag in DROP_WITH_CONTENT:
            self.drop += 1
            return
        if self.drop:
            return
        if tag == "br":
            self.out.append("\n")
            return
        m = self._map(tag, a)
        self.src.setdefault(tag, []).append(m[0] if m else None)
        if m:
            self.stack.append(m)
            self.out.append(m[1])

    def handle_startendtag(self, tag, attrs):
        if tag.lower() == "br" and not self.drop:
            self.out.append("\n")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in DROP_WITH_CONTENT:
            self.drop = max(0, self.drop - 1)
            return
        if self.drop:
            return
        if tag in BREAK_AFTER:
            self.out.append("\n")
        opened = self.src.get(tag)
        if not opened:
            return
        out = opened.pop()
        if not out:
            return
        idx = max(i for i, (t, _) in enumerate(self.stack) if t == out) if any(t == out for t, _ in self.stack) else -1
        if idx < 0:
            return
        above = self.stack[idx + 1:]
        for t, _ in reversed(above):
            self.out.append(f"</{t}>")
        self.out.append(f"</{out}>")
        del self.stack[idx:]
        for t, o in above:  # ichidagi teglar qayta ochiladi (to'g'ri ichma-ichlik)
            self.stack.append((t, o))
            self.out.append(o)

    def handle_data(self, data):
        if not self.drop:
            self.out.append(_escape(data))

    def result(self) -> str:
        for t, _ in reversed(self.stack):
            self.out.append(f"</{t}>")
        self.stack = []
        s = "".join(self.out).replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
        s = re.sub(r"<(b|i|u|s|tg-spoiler|code)></\1>", "", s)
        return s.strip("\n ")


def sanitize(html: str) -> str:
    """Faqat Telegram HTML teglari va atributlari qoladi; qatorlar, bo'shliqlar va emoji o'zgarmaydi."""
    p = _San()
    p.feed(str(html or ""))
    p.close()
    return p.result()


def plain(html: str) -> str:
    return _html.unescape(re.sub(r"<[^>]+>", "", html or ""))


def visible_len(html: str) -> int:
    """Telegram hisoblaganidek: teglarsiz matn uzunligi (UTF-16 birliklarida)."""
    return len(plain(html).strip().encode("utf-16-le")) // 2


# ------------------------------------------------------------------ post osti matni (footer)
def footer_default(svc) -> str:
    from .tg_publish import socials_line  # noqa: PLC0415

    return socials_line(svc)


def footer_custom(st) -> str | None:
    v = st.kv_get("tg_footer")
    return v.get("html", "") if isinstance(v, dict) and "html" in v else None


def footer_html(svc) -> str:
    """Saqlangan post osti matni; hali yozilmagan bo'lsa — institut ijtimoiy tarmoqlari (Telegram | Instagram | YouTube)."""
    v = footer_custom(svc.st)
    return footer_default(svc) if v is None else v


def save_footer(st, html: str | None) -> None:
    if html is None:  # standart (institut ijtimoiy tarmoqlari) ga qaytarish
        st.kv_put("tg_footer", {})
        return
    clean = sanitize(html)
    if visible_len(clean) > FOOTER_MAX:
        raise ValueError("telegram_footer_too_long")
    if re.search(r"<(pre|blockquote)", clean):
        raise ValueError("telegram_footer_blocks")
    st.kv_put("tg_footer", {"html": clean})


def footer_payload(svc) -> dict:
    cust = footer_custom(svc.st)
    return {"html": footer_default(svc) if cust is None else cust, "default": footer_default(svc), "custom": cust is not None}


# ------------------------------------------------------------------ post: tekshirish va saqlash
def _media_type(url: str, want: str = "") -> str:
    ext = url.rsplit(".", 1)[-1].lower() if "." in url else ""
    if want == "document":
        return "document"
    if ext in PHOTO_EXT:
        return "photo"
    if ext == "mp4":
        return "video"
    return "document"


MEDIA_URL_RE = re.compile(r"^(?:https?://[^/]+)?/(media/[a-f0-9]{16}\.[a-z0-9]{2,5})$")


def _clean_media(raw) -> list[dict]:
    out = []
    for m in (raw or [])[:ALBUM_MAX + 1]:
        if not isinstance(m, dict):
            continue
        url = str(m.get("url") or "").strip()
        mm = MEDIA_URL_RE.match(url)
        if not mm:
            raise ValueError("telegram_bad_media")
        url = "/" + mm.group(1)
        size = m.get("size")
        out.append({"url": url, "type": _media_type(url, str(m.get("type") or "")), "name": str(m.get("name") or "")[:200],
                    "size": int(size) if isinstance(size, (int, float)) and size > 0 else 0})
    if len(out) > ALBUM_MAX:
        raise ValueError("telegram_album_max")
    if len(out) > 1 and any(m["type"] == "document" for m in out):
        raise ValueError("telegram_album_types")
    return out


def _clean_buttons(raw) -> list[list[dict]]:
    rows = []
    for row in (raw or [])[:ROWS_MAX]:
        btns = []
        for b in (row or [])[:ROW_BUTTONS_MAX]:
            if not isinstance(b, dict):
                continue
            text = re.sub(r"\s+", " ", str(b.get("text") or "")).strip()[:64]
            url = str(b.get("url") or "").strip()
            if not text and not url:
                continue
            if not text or not re.match(r"^(https?|tg)://\S+$", url, re.I) or len(url) > 2048:
                raise ValueError("telegram_bad_button")
            btns.append({"text": text, "url": url})
        if btns:
            rows.append(btns)
    return rows


def _iso(v) -> str | None:
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError as e:
        raise ValueError("bad_date") from e
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def clean(data: dict) -> dict:
    data = data or {}
    doc = data.get("doc")
    doc_s = json.dumps(doc, ensure_ascii=False) if isinstance(doc, dict) else ""
    if len(doc_s) > 400_000:
        doc_s = ""
    out = {
        "html": sanitize(str(data.get("html") or "")[:200_000]),
        "doc": doc_s,
        "media": _clean_media(data.get("media")),
        "buttons": _clean_buttons(data.get("buttons")),
        "targets": list(dict.fromkeys(str(x) for x in (data.get("targets") or []) if re.fullmatch(r"-?\d{1,20}", str(x))))[:50],
        "footer": bool(data.get("footer", True)),
        "silent": bool(data.get("silent", False)),
        "preview": bool(data.get("preview", False)),
        "scheduled_at": _iso(data.get("scheduled_at")),
    }
    if len(out["media"]) > 1 and out["buttons"]:
        raise ValueError("telegram_album_buttons")
    return out


def compose(svc, p: dict) -> str:
    """Yuboriladigan yakuniy matn: post matni + (yoqilgan bo'lsa) post osti matni."""
    body = (p.get("html") or "").strip()
    foot = footer_html(svc).strip() if p.get("footer") else ""
    return f"{body}\n\n{foot}" if body and foot else (body or foot)


def check_limits(svc, p: dict) -> None:
    final = compose(svc, p)
    limit = CAPTION_MAX if p.get("media") else TEXT_MAX
    if not visible_len(final) and not p.get("media"):
        raise ValueError("telegram_empty")
    if visible_len(final) > limit:
        raise ValueError("telegram_caption_too_long" if p.get("media") else "telegram_text_too_long")


def _row(r) -> dict:
    d = dict(r)
    for k, dv in (("media", []), ("buttons", []), ("targets", [])):
        d[k] = json.loads(d.get(k) or "null") or dv
    d["doc"] = json.loads(d["doc"]) if d.get("doc") else None
    for k in ("footer", "silent", "preview"):
        d[k] = bool(d.get(k))
    return d


def get(st, pid: str) -> dict | None:
    ensure_schema(st)
    r = st._q("SELECT * FROM tg_mposts WHERE id=%s", (pid,))
    return _row(r[0]) if r else None


def msgs(st, pid: str) -> list[dict]:
    out = []
    for r in st._q("SELECT * FROM tg_mpost_msgs WHERE post_id=%s ORDER BY chat_id", (pid,)):
        d = dict(r)
        d["message_ids"] = json.loads(d.get("message_ids") or "[]")
        d["shape"] = json.loads(d.get("shape") or "null")
        out.append(d)
    return out


def _link(g: dict | None, cid: str, mid: int) -> str:
    if g and g.get("username"):
        return f"https://t.me/{g['username']}/{mid}"
    if cid.startswith("-100"):
        return f"https://t.me/c/{cid[4:]}/{mid}"
    return ""


def public(st, p: dict) -> dict:
    from .tg_publish import groups  # noqa: PLC0415

    gs = {g["chat_id"]: g for g in groups(st)}
    rows = {m["chat_id"]: m for m in msgs(st, p["id"])}
    chats = []
    for cid in dict.fromkeys(list(p["targets"]) + list(rows)):
        g, m = gs.get(cid), rows.get(cid) or {}
        ids = m.get("message_ids") or []
        chats.append({"chat_id": cid, "title": (g or {}).get("title") or cid, "type": (g or {}).get("type") or "", "status": m.get("status") or "pending",
                      "message_ids": ids, "error": m.get("error") or "", "sent_at": m.get("sent_at"), "edited_at": m.get("edited_at"),
                      "link": _link(g, cid, ids[0]) if ids else ""})
    return {k: p[k] for k in ("id", "html", "doc", "media", "buttons", "targets", "footer", "silent", "preview", "status", "scheduled_at", "sent_at",
                              "created", "updated", "author")} | {"chats": chats}


def list_posts(st, limit: int = 200) -> list[dict]:
    ensure_schema(st)
    rows = st._q("SELECT * FROM tg_mposts ORDER BY COALESCE(sent_at, scheduled_at, updated) DESC LIMIT %s", (limit,))
    return [public(st, _row(r)) for r in rows]


def save(st, data: dict, pid: str | None = None, author: str = "") -> dict:
    ensure_schema(st)
    now = _now()
    cols = {"html": data["html"], "doc": data["doc"], "media": json.dumps(data["media"], ensure_ascii=False),
            "buttons": json.dumps(data["buttons"], ensure_ascii=False), "targets": json.dumps(data["targets"]), "footer": int(data["footer"]),
            "silent": int(data["silent"]), "preview": int(data["preview"]), "scheduled_at": data["scheduled_at"]}
    with st._tx() as c:
        if pid:
            sets = ", ".join(f"{k}=%s" for k in cols)
            c.execute(f"UPDATE tg_mposts SET {sets}, updated=%s WHERE id=%s", (*cols.values(), now, pid))
        else:
            pid = uuid.uuid4().hex[:16]
            c.execute(f"INSERT INTO tg_mposts(id, {', '.join(cols)}, status, author, created, updated) VALUES(%s, {', '.join(['%s'] * len(cols))}, 'draft', %s, %s, %s)",
                      (pid, *cols.values(), author, now, now))
    return get(st, pid)


def set_status(st, pid: str, status: str, **extra) -> None:
    cols = {"status": status, "updated": _now()} | extra
    with st._tx() as c:
        c.execute(f"UPDATE tg_mposts SET {', '.join(f'{k}=%s' for k in cols)} WHERE id=%s", (*cols.values(), pid))


def remove(st, pid: str) -> None:
    with st._tx() as c:
        c.execute("DELETE FROM tg_mpost_msgs WHERE post_id=%s", (pid,))
        c.execute("DELETE FROM tg_mposts WHERE id=%s", (pid,))


def has_sent(st, pid: str) -> bool:
    return any(m["status"] == "sent" for m in msgs(st, pid))


# ------------------------------------------------------------------ media fayllari
def load_media(st, m: dict) -> tuple[str, bytes, str]:
    """('nom', bayt, mime) — saytning media kutubxonasidan; rasm Telegram talabiga moslanadi."""
    from .media import get_blob  # noqa: PLC0415
    from .tg_publish import _photo_bytes  # noqa: PLC0415

    url = m["url"]
    name = url.rsplit("/", 1)[-1]
    data = get_blob(st, name)
    if not data:
        raise RuntimeError(f"telegram: media topilmadi ({name})")
    if len(data) > UPLOAD_MAX:
        raise RuntimeError("telegram: fayl 50 MB dan katta — Telegram bot orqali yuborib bo'lmaydi")
    ext = name.rsplit(".", 1)[-1].lower()
    if m["type"] == "photo":
        return _photo_bytes(name.replace(".jpeg", ".jpg"), data)
    mime = {"mp4": "video/mp4", "webm": "video/webm", "pdf": "application/pdf",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}.get(ext, "application/octet-stream")
    nice = m.get("name") or name
    if not nice.lower().endswith("." + ext):
        nice = f"{nice}.{ext}"
    return nice, data, mime


def kind_of(media: list[dict]) -> str:
    if not media:
        return "text"
    return "album" if len(media) > 1 else media[0]["type"]


def _markup(buttons: list) -> dict | None:
    return {"inline_keyboard": [[{"text": b["text"], "url": b["url"]} for b in row] for row in buttons]} if buttons else None


def _not_modified(e: Exception) -> bool:
    return "message is not modified" in str(e).lower()


def _gone(e: Exception) -> bool:
    s = str(e).lower()
    return "message to delete not found" in s or "message to edit not found" in s


# ------------------------------------------------------------------ yuborish
def _send_one(api, st, cid: str, final: str, p: dict, files: list) -> list[int]:
    from .tg_publish import _call  # noqa: PLC0415

    mk = _markup(p["buttons"])
    silent = True if p["silent"] else None
    media = p["media"]
    if not media:
        r = _call(api.call, "sendMessage", chat_id=cid, text=final, parse_mode="HTML", link_preview_options={"is_disabled": not p["preview"]},
                  disable_notification=silent, reply_markup=mk)
        return [int((r or {}).get("message_id") or 0)]
    up_silent = "true" if p["silent"] else None
    if len(media) == 1:
        t = media[0]["type"]
        field = {"photo": "photo", "video": "video", "document": "document"}[t]
        method = {"photo": "sendPhoto", "video": "sendVideo", "document": "sendDocument"}[t]
        extra = {"supports_streaming": "true"} if t == "video" else {}
        r = _call(api.upload, method, {field: files[0]}, chat_id=cid, caption=final or None, parse_mode="HTML", disable_notification=up_silent,
                  reply_markup=mk, **extra)
        return [int((r or {}).get("message_id") or 0)]
    items = []
    for i, m in enumerate(media):
        it = {"type": m["type"], "media": f"attach://m{i}"}
        if i == 0 and final:
            it |= {"caption": final, "parse_mode": "HTML"}
        if m["type"] == "video":
            it["supports_streaming"] = True
        items.append(it)
    r = _call(api.upload, "sendMediaGroup", {f"m{i}": f for i, f in enumerate(files)}, chat_id=cid, media=items, disable_notification=up_silent)
    return [int(x.get("message_id") or 0) for x in (r or [])]


def _shape(p: dict, final: str) -> dict:
    return {"kind": kind_of(p["media"]), "media": [m["url"] for m in p["media"]], "types": [m["type"] for m in p["media"]], "text": final,
            "buttons": p["buttons"], "preview": p["preview"]}


def _put_msg(st, pid: str, cid: str, **cols) -> None:
    cols["updated"] = _now()
    for k in ("message_ids", "shape"):
        if k in cols and not isinstance(cols[k], str):
            cols[k] = json.dumps(cols[k], ensure_ascii=False)
    keys = list(cols)
    with st._tx() as c:
        c.execute(f"INSERT INTO tg_mpost_msgs(post_id, chat_id, {', '.join(keys)}) VALUES(%s,%s,{', '.join(['%s'] * len(keys))}) "
                  f"ON CONFLICT(post_id, chat_id) DO UPDATE SET {', '.join(f'{k}=excluded.{k}' for k in keys)}", (pid, cid, *cols.values()))


def _targets_ok(st, targets: list[str]) -> dict[str, dict]:
    from .tg_publish import groups  # noqa: PLC0415

    return {g["chat_id"]: g for g in groups(st) if g["chat_id"] in targets and g.get("confirmed") and g["can_post"]}


def deliver(st, svc, api, pid: str, log=None) -> dict:
    """Post → hali yuborilmagan maqsad chatlarga (yuborilganlari tegilmaydi). Holat: sent / partial / error."""
    p = get(st, pid)
    if not p:
        return {"sent": 0, "failed": 0}
    final = compose(svc, p)
    ok = _targets_ok(st, p["targets"])
    done = {m["chat_id"]: m for m in msgs(st, pid)}
    sent = failed = 0
    files: list | None = None
    file_err = ""
    for cid in p["targets"]:
        if (done.get(cid) or {}).get("status") == "sent":
            continue
        if cid not in ok:
            _put_msg(st, pid, cid, status="error", error="Chat tasdiqlanmagan yoki bot u yerga yoza olmaydi", message_ids=[])
            failed += 1
            continue
        try:
            if files is None and not file_err:
                try:
                    files = [load_media(st, m) for m in p["media"]]
                except RuntimeError as e:
                    file_err = str(e)
            if file_err:
                raise RuntimeError(file_err)
            ids = _send_one(api, st, cid, final, p, files or [])
            now = _now()
            _put_msg(st, pid, cid, status="sent", error="", message_ids=ids, shape=_shape(p, final), sent_at=now, edited_at=None)
            with st._tx() as c:
                c.execute("UPDATE tg_groups SET last_post=%s WHERE chat_id=%s", (now, cid))
            sent += 1
        except Exception as e:  # noqa: BLE001
            err = (f"{e}" if isinstance(e, RuntimeError) else f"{type(e).__name__}: {e}")[:300]
            _put_msg(st, pid, cid, status="error", error=err, message_ids=[])
            if log:
                log(f"telegram kanal post {pid} → {cid}: {err}")
            failed += 1
    rows = msgs(st, pid)
    n_ok = sum(1 for m in rows if m["status"] == "sent")
    status = "sent" if n_ok and n_ok == len(p["targets"]) else "partial" if n_ok else "error"
    set_status(st, pid, status, sent_at=p.get("sent_at") or (_now() if n_ok else None), claimed_at=None)
    return {"sent": sent, "failed": failed}


def claim(st, pid: str, from_status: tuple[str, ...]) -> bool:
    """Atomar band qilish: post faqat bitta jarayon tomonidan yuboriladi."""
    r = st._q("UPDATE tg_mposts SET status='sending', claimed_at=%s WHERE id=%s AND status = ANY(%s) RETURNING id", (_now(), pid, list(from_status)))
    return bool(r)


def run_due(st, svc, api, log=None) -> int:
    """Vaqti kelgan rejalashtirilgan postlar (fon oqimi har daqiqada chaqiradi)."""
    ensure_schema(st)
    now = _now()
    stale = (datetime.now(timezone.utc) - timedelta(seconds=STALE_SENDING)).isoformat(timespec="seconds")
    with st._tx() as c:  # jarayon yuborish o'rtasida to'xtagan — qayta yubormaymiz (takror bo'lmasin), admin ko'radi
        c.execute("UPDATE tg_mposts SET status='error', claimed_at=NULL WHERE status='sending' AND claimed_at<%s", (stale,))
    n = 0
    for r in st._q("SELECT id FROM tg_mposts WHERE status='scheduled' AND scheduled_at<=%s ORDER BY scheduled_at", (now,)):
        if claim(st, r["id"], ("scheduled",)):
            deliver(st, svc, api, r["id"], log=log)
            n += 1
    return n


# ------------------------------------------------------------------ tahrirlash
def _compatible(old: dict | None, new_kind: str, new_n: int) -> bool:
    if not old:
        return False
    k = old.get("kind")
    if k == "text":
        return new_kind == "text"
    if k == "album":
        return new_kind == "album" and new_n == len(old.get("media") or [])
    return new_kind in ("photo", "video", "document")


def plan_edit(st, svc, p: dict) -> list[dict]:
    """Tahrirlash mumkinmi: mos kelmaydigan chatlar ro'yxati (bo'sh — hammasi tahrirlanadi)."""
    from .tg_publish import groups  # noqa: PLC0415

    names = {g["chat_id"]: g.get("title") or g["chat_id"] for g in groups(st)}
    nk, nn = kind_of(p["media"]), len(p["media"])
    return [{"chat_id": m["chat_id"], "title": names.get(m["chat_id"], m["chat_id"]), "from": (m["shape"] or {}).get("kind") or "", "to": nk}
            for m in msgs(st, p["id"]) if m["status"] == "sent" and not _compatible(m["shape"], nk, nn)]


def _edit_one(api, st, cid: str, ids: list[int], old: dict, final: str, p: dict) -> None:
    from .tg_publish import _call  # noqa: PLC0415

    mk = _markup(p["buttons"]) or {"inline_keyboard": []}
    kind = old.get("kind")
    text_changed = old.get("text") != final or old.get("buttons") != p["buttons"]

    def safe(fn, *a, **kw):
        try:
            return _call(fn, *a, **kw)
        except RuntimeError as e:
            if _not_modified(e):
                return None
            raise

    if kind == "text":
        if text_changed or old.get("preview") != p["preview"]:
            safe(api.call, "editMessageText", chat_id=cid, message_id=ids[0], text=final, parse_mode="HTML",
                 link_preview_options={"is_disabled": not p["preview"]}, reply_markup=mk)
        return
    media = p["media"]
    old_urls, old_types = old.get("media") or [], old.get("types") or []
    first_done = False
    for i, m in enumerate(media):
        if i < len(old_urls) and old_urls[i] == m["url"] and (old_types[i] if i < len(old_types) else m["type"]) == m["type"]:
            continue
        f = load_media(st, m)
        im = {"type": m["type"], "media": "attach://f0"}
        if i == 0:
            im |= {"caption": final, "parse_mode": "HTML"}
            first_done = True
        if m["type"] == "video":
            im["supports_streaming"] = True
        kw = {"reply_markup": mk} if len(media) == 1 else {}
        safe(api.upload, "editMessageMedia", {"f0": f}, chat_id=cid, message_id=ids[i], media=im, **kw)
    if not first_done and text_changed:
        kw = {"reply_markup": mk} if len(media) == 1 else {}
        safe(api.call, "editMessageCaption", chat_id=cid, message_id=ids[0], caption=final, parse_mode="HTML", **kw)


def apply_edit(st, svc, api, pid: str, log=None) -> dict:
    """Saqlangan post → yuborilgan xabarlar tahrirlanadi (yangi xabar yuborilmaydi). Avval plan_edit bilan tekshiriladi."""
    p = get(st, pid)
    bad = plan_edit(st, svc, p)
    if bad:
        raise Incompatible(bad)
    final = compose(svc, p)
    edited = failed = 0
    for m in msgs(st, pid):
        if m["status"] != "sent" or not m["message_ids"]:
            continue
        try:
            _edit_one(api, st, m["chat_id"], m["message_ids"], m["shape"] or {}, final, p)
            _put_msg(st, pid, m["chat_id"], status="sent", error="", shape=_shape(p, final), edited_at=_now())
            edited += 1
        except Exception as e:  # noqa: BLE001
            err = (f"{e}" if isinstance(e, RuntimeError) else f"{type(e).__name__}: {e}")[:300]
            _put_msg(st, pid, m["chat_id"], status="sent", error=f"Tahrirlanmadi: {err}")
            if log:
                log(f"telegram kanal post {pid} → {m['chat_id']} tahrir: {err}")
            failed += 1
    return {"edited": edited, "failed": failed}


# ------------------------------------------------------------------ o'chirish
def delete_messages(st, api, pid: str) -> list[dict]:
    """Yuborilgan xabarlarni Telegram'dan o'chirish. Qaytadi: o'chirilmagan chatlar (sababi bilan)."""
    from .tg_publish import groups  # noqa: PLC0415

    names = {g["chat_id"]: g.get("title") or g["chat_id"] for g in groups(st)}
    failed = []
    for m in msgs(st, pid):
        if m["status"] != "sent" or not m["message_ids"]:
            continue
        ids = [i for i in m["message_ids"] if i]
        try:
            try:
                if len(ids) > 1:
                    api.call("deleteMessages", chat_id=m["chat_id"], message_ids=ids)
                else:
                    api.call("deleteMessage", chat_id=m["chat_id"], message_id=ids[0])
            except RuntimeError as e:
                if not _gone(e):
                    raise
            _put_msg(st, pid, m["chat_id"], status="deleted", error="")
        except Exception as e:  # noqa: BLE001
            err = (f"{e}" if isinstance(e, RuntimeError) else f"{type(e).__name__}: {e}")[:300]
            _put_msg(st, pid, m["chat_id"], error=f"O‘chirilmadi: {err}")
            failed.append({"chat_id": m["chat_id"], "title": names.get(m["chat_id"], m["chat_id"]), "error": err})
    return failed
