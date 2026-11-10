"""Saytdagi nashrlar — universitet Telegram guruh va kanallarida.

Murojaatlar boti guruhga qo'shilsa yoki kanalga administrator qilinsa, Telegram `my_chat_member` yuboradi — chat «Guruh va kanallar»
ro'yxatiga tushadi. Administrator uni tasdiqlaydi va qaysi turlar (yangilik, e'lon, tadbir, vakansiya) yuborilishini belgilaydi.

Nashr qilingan (rejalashtirilgan bo'lsa — vaqti kelgan) element har bir tasdiqlangan chatga bir marta yuboriladi: muqova rasmi va ostida
HTML izoh (qalin sarlavha, qisqa matn, vakansiya/tadbir ma'lumotlari, «Batafsil» havolasi va post osti matni — tg_channel.footer_html,
standart: Telegram | Instagram | YouTube).
Faqat chat tasdiqlangandan (tur yoqilgandan) keyin nashr qilinganlar yuboriladi — eski elementlar guruhga to'kilmaydi.
Tahrirlash qayta yubormaydi: (element, chat) juftligi `tg_posts` jadvalida bir marta band qilinadi. Saytda ochiq turgan element
tahrirlansa — yuborilgan xabarning o'zi tahrirlanadi (editMessageCaption / editMessageText, muqova o'zgarsa — editMessageMedia);
nashrdan olingan yoki o'chirilgan element Telegram'da o'zgarmaydi (xabar o'chirilmaydi).
"""
from __future__ import annotations

import hashlib
import html as _html
import io
import json
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from .tg_net import BotClient, TgError  # noqa: E402
CAPTION = 1024
EXCERPT_MAX = 700  # matn qismi qisqa bo'lsin — to'liq matn saytda
MAX_ATTEMPTS = 3
RETRY_AFTER = 120  # soniya × urinish
SYNC = False  # testlar: kick() shu oqimda darhol bajaradi
EMPLOYMENT = {"full_time": "To‘liq stavka", "part_time": "Yarim stavka", "contract": "Shartnoma asosida", "internship": "Stajirovka", "remote": "Masofaviy"}
SOCIAL_LINKS = (("telegram", "Telegram"), ("instagram", "Instagram"), ("youtube", "YouTube"))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _now_us() -> str:
    """Tasdiqlash va nashr vaqtlarini solishtirish uchun — bir soniya ichidagi ketma-ketlik ham farqlansin."""
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def ensure_schema(st) -> None:
    with st._tx() as c:
        c.execute("CREATE TABLE IF NOT EXISTS tg_groups (chat_id TEXT PRIMARY KEY, title TEXT, type TEXT, username TEXT, status TEXT, can_post INTEGER, "
                  "added TEXT, confirmed TEXT, kinds TEXT, last_error TEXT, last_error_at TEXT, last_post TEXT, updated TEXT, source TEXT)")
        c.execute("CREATE TABLE IF NOT EXISTS tg_posts (item_id TEXT, chat_id TEXT, message_id TEXT, status TEXT, error TEXT, attempts INTEGER, "
                  "created TEXT, updated TEXT, PRIMARY KEY(item_id, chat_id))")
        # tahrirni Telegram'ga yetkazish: xabar turi (photo/text), oxirgi yuborilgan izoh+rasm imzosi, «tahrirlash kerak» belgisi
        for col, typ in (("kind", "TEXT"), ("sig", "TEXT"), ("photo", "TEXT"), ("dirty", "INTEGER DEFAULT 0"), ("edit_error", "TEXT"), ("edited", "TEXT")):
            c.execute(f"ALTER TABLE tg_posts ADD COLUMN IF NOT EXISTS {col} {typ}")
    from . import tg_channel  # noqa: PLC0415

    tg_channel.ensure_schema(st)


# ------------------------------------------------------------------ guruh va kanallar ro'yxati
def _group(r) -> dict:
    d = dict(r)
    d["kinds"] = json.loads(d.get("kinds") or "{}")
    d["can_post"] = bool(d.get("can_post"))
    return d


def groups(st) -> list[dict]:
    return [_group(r) for r in st._q("SELECT * FROM tg_groups ORDER BY (confirmed IS NULL), added DESC")]


def group(st, cid: str) -> dict | None:
    r = st._q("SELECT * FROM tg_groups WHERE chat_id=%s", (str(cid),))
    return _group(r[0]) if r else None


def public(g: dict) -> dict:
    return {"chat_id": g["chat_id"], "title": g.get("title") or "", "type": g.get("type") or "", "username": g.get("username") or "",
            "status": g.get("status") or "", "can_post": g["can_post"], "added": g.get("added"), "confirmed": g.get("confirmed"),
            "kinds": [k for k in KINDS if k in g["kinds"]], "last_error": g.get("last_error") or "", "last_error_at": g.get("last_error_at"),
            "last_post": g.get("last_post")}


def can_post_of(chat_type: str, m: dict) -> bool:
    """getChatMember / my_chat_member natijasidan: bot shu chatga xabar yubora oladimi."""
    s = m.get("status") or ""
    if chat_type == "channel":
        return s == "creator" or (s == "administrator" and bool(m.get("can_post_messages")))
    if s in ("creator", "administrator", "member"):
        return True
    return s == "restricted" and bool(m.get("is_member", True)) and bool(m.get("can_send_messages")) and m.get("can_send_photos", True) is not False


def upsert(st, chat: dict, member: dict, source: str = "telegram") -> dict | None:
    """Chatni ro'yxatga yozish yoki holatini yangilash (tasdiq va tanlangan turlar saqlanadi)."""
    ctype = chat.get("type") or ""
    if ctype not in ("group", "supergroup", "channel"):
        return None
    cid = str(chat["id"])
    status = member.get("status") or ""
    title = (chat.get("title") or chat.get("username") or cid)[:200]
    now = _now()
    can = can_post_of(ctype, member)
    if status in ("left", "kicked") and not group(st, cid):
        return None
    with st._tx() as c:
        c.execute("INSERT INTO tg_groups(chat_id, title, type, username, status, can_post, added, confirmed, kinds, last_error, updated, source) "
                  "VALUES(%s,%s,%s,%s,%s,%s,%s,NULL,'{}','',%s,%s) ON CONFLICT(chat_id) DO UPDATE SET title=excluded.title, type=excluded.type, "
                  "username=excluded.username, status=excluded.status, can_post=excluded.can_post, updated=excluded.updated",
                  (cid, title, ctype, chat.get("username") or "", status, int(can), now, now, source))
    return group(st, cid)


def on_member(st, upd: dict) -> dict | None:
    """`my_chat_member`: bot guruhga qo'shildi / chiqarildi / kanalda huquqlari o'zgardi."""
    return upsert(st, upd.get("chat") or {}, upd.get("new_chat_member") or {})


def migrate(st, old: str, new: str) -> None:
    """Guruh superguruhga aylanganda chat id o'zgaradi."""
    old, new = str(old), str(new)
    if not group(st, old) or group(st, new):
        return
    with st._tx() as c:
        c.execute("UPDATE tg_groups SET chat_id=%s, type='supergroup', updated=%s WHERE chat_id=%s", (new, _now(), old))
        c.execute("UPDATE tg_posts SET chat_id=%s WHERE chat_id=%s", (new, old))


def _save(st, cid: str, **cols) -> None:
    if "kinds" in cols:
        cols["kinds"] = json.dumps(cols["kinds"])
    sets = ", ".join(f"{k}=%s" for k in cols)
    with st._tx() as c:
        c.execute(f"UPDATE tg_groups SET {sets}, updated=%s WHERE chat_id=%s", (*cols.values(), _now(), str(cid)))


def confirm(st, cid: str, on: bool = True) -> dict:
    """Tasdiqlash: shu paytdan keyin nashr qilinganlar yuboriladi (turlar avval tanlanmagan bo'lsa — yangilik, e'lon, vakansiya)."""
    g = group(st, cid)
    if not g:
        raise KeyError(cid)
    now = _now_us()
    if on:
        kinds = {k: now for k in (g["kinds"] or DEFAULT_KINDS)}
        _save(st, cid, confirmed=now, kinds=kinds)
    else:
        _save(st, cid, confirmed=None)
    return group(st, cid)


def set_kinds(st, cid: str, kinds: list[str]) -> dict:
    g = group(st, cid)
    if not g:
        raise KeyError(cid)
    now = _now_us()
    out = {k: g["kinds"].get(k) or now for k in KINDS if k in kinds}
    _save(st, cid, kinds=out)
    return group(st, cid)


def remove(st, cid: str) -> None:
    with st._tx() as c:
        c.execute("DELETE FROM tg_groups WHERE chat_id=%s", (str(cid),))
        c.execute("DELETE FROM tg_posts WHERE chat_id=%s", (str(cid),))


def retry(st, cid: str) -> int:
    """Xato bilan qolgan yuborishlar — qaytadan (urinishlar soni nolga)."""
    with st._tx() as c:
        n = c.execute("UPDATE tg_posts SET attempts=0, updated=%s WHERE chat_id=%s AND status='error'", ("1970-01-01T00:00:00+00:00", str(cid))).rowcount
    _save(st, cid, last_error="", last_error_at=None)
    return n


def check(st, api, ref: str) -> dict:
    """Qo'lda qo'shish: @username yoki chat id → getChat + getChatMember (bot) → ro'yxatga."""
    ref = (ref or "").strip()
    m = re.match(r"^(?:https?://)?t\.me/([A-Za-z0-9_]{4,64})/?$", ref)
    if m:
        ref = "@" + m.group(1)
    if not re.fullmatch(r"@[A-Za-z0-9_]{4,64}|-?\d{5,20}", ref):
        raise ValueError("telegram_bad_chat")
    chat = api.call("getChat", chat_id=ref) or {}
    bot_id = int(api.base.rsplit("/bot", 1)[1].split(":", 1)[0])
    member = api.call("getChatMember", chat_id=chat.get("id") or ref, user_id=bot_id) or {}
    g = upsert(st, chat, member, source="manual")
    if not g:
        raise ValueError("telegram_not_group")
    return g


# ------------------------------------------------------------------ e'lon matni
def _attr(v: str) -> str:
    return _html.escape(v or "", quote=True)


def esc(v) -> str:
    return _html.escape(str(v or ""), quote=False)


BLOCK_RE = re.compile(r"(?is)<\s*(br|/p|/div|/h[1-6]|/li|/blockquote|/tr|/ul|/ol|/figure|/pre)\b[^>]*>")


def plain_text(html: str) -> str:
    """Rich-matn HTML → toza matn: teglar olib tashlanadi, bo'shliqlar yig'iladi, paragraflar orasida bitta bo'sh qator."""
    s = re.sub(r"(?is)<(script|style|figure|figcaption|table)\b.*?</\1\s*>", " ", html or "")
    s = BLOCK_RE.sub("\n", s)
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    s = _html.unescape(s).replace("\xa0", " ")
    lines = [re.sub(r"[ \t\r\f\v​]+", " ", x).strip() for x in s.split("\n")]
    return "\n\n".join(x for x in lines if x)


def fit(text: str, budget: int) -> str:
    """Matnni HTML-ekranlangan holda `budget` belgiga sig'diradi: gap oxirida (yarmidan keyin bo'lsa) yoki so'z chegarasida «…» bilan."""
    text = (text or "").strip()
    if budget <= 1 or not text:
        return ""
    if len(esc(text)) <= budget:
        return esc(text)
    lo, hi = 0, min(len(text), budget - 1)  # eng uzun prefiks: ekranlangan uzunligi ≤ budget-1 («…» uchun joy)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if len(esc(text[:mid])) <= budget - 1:
            lo = mid
        else:
            hi = mid - 1
    n = lo
    cut = text[:n]
    ends = [m.end() for m in re.finditer(r"[.!?…](?=\s)", cut)]
    if ends and ends[-1] >= n * 0.6:
        return esc(cut[: ends[-1]].rstrip())
    sp = max(cut.rfind(" "), cut.rfind("\n"))
    if sp >= n * 0.5:
        cut = cut[:sp]
    return esc(cut.rstrip(" ,;:—–-\n")) + "…"


def _local(iso: str | None, with_time: bool = False) -> str:
    if not iso:
        return ""
    from .storage import _tz  # noqa: PLC0415

    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return str(iso)[:10]
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(_tz())
    return dt.strftime("%d.%m.%Y, %H:%M" if with_time and (dt.hour or dt.minute) else "%d.%m.%Y")


def item_url(svc, it: dict) -> str:
    from .content import SECTION_OF  # noqa: PLC0415

    return f"{svc.base_url()}/{SECTION_OF.get(it['kind'], 'news')}/{it.get('slug') or ''}"


def facts(st, it: dict) -> list[str]:
    """Qisqa ma'lumot qatorlari (ekranlangan)."""
    kind, out = it["kind"], []
    if kind == "vacancy":
        dep = it.get("department") or ""
        if not dep and it.get("faculty_id"):
            dep = (st.get_item(it["faculty_id"]) or {}).get("title") or ""
        pairs = [("Bo‘lim", dep), ("Ish turi", EMPLOYMENT.get(it.get("employment") or "", "")), ("Ish haqi", it.get("salary")),
                 ("Joylashuv", it.get("location")), ("Ariza muddati", _local(it.get("deadline")))]
    elif kind == "event":
        when = _local(it.get("starts"), True)
        if when and it.get("ends"):
            end = _local(it["ends"], True)
            when += " — " + (end.split(", ", 1)[1] if end[:10] == when[:10] and ", " in end else end)
        pairs = [("Sana", when), ("Joy", it.get("place"))]
    elif kind == "announce":
        pairs = [("Muddat", _local(it.get("deadline"), True))]
    else:
        pairs = []
    for label, v in pairs:
        v = re.sub(r"\s+", " ", str(v or "")).strip()
        if v:
            out.append(f"{label}: {esc(v[:160])}")
    return out


def body_text(it: dict) -> str:
    if it["kind"] in ("vacancy", "event") and (it.get("summary") or "").strip():
        return plain_text(it["summary"]) if "<" in it["summary"] else re.sub(r"[ \t]+", " ", it["summary"]).strip()
    t = plain_text(it.get("html") or "") or re.sub(r"[ \t]+", " ", (it.get("text") or "")).strip()
    return t or (it.get("excerpt") or it.get("summary") or "").strip()


def socials_line(svc) -> str:
    soc = svc.uni().get("socials") or {}
    links = [f'<a href="{_attr(soc[k])}">{label}</a>' for k, label in SOCIAL_LINKS if (soc.get(k) or "").startswith(("https://", "http://"))]
    return " | ".join(links)


def caption(svc, it: dict, limit: int = CAPTION) -> str:
    """Telegram uchun HTML izoh — butun matn `limit` belgidan oshmaydi."""
    title = re.sub(r"\s+", " ", it.get("title") or "").strip()
    head = f"<b>{esc(title[:250])}</b>"
    info = "\n".join(facts(svc.st, it))
    link = f'<a href="{_attr(item_url(svc, it))}">Batafsil →</a>'
    from .tg_channel import footer_html  # noqa: PLC0415

    soc = footer_html(svc).strip()
    parts_fixed = [head] + ([info] if info else []) + [link] + ([soc] if soc else [])
    fixed_len = len("\n\n".join(parts_fixed))
    budget = min(EXCERPT_MAX, limit - fixed_len - 2)
    text = fit(body_text(it), budget)
    parts = [head] + ([info] if info else []) + ([text] if text else []) + [link] + ([soc] if soc else [])
    out = "\n\n".join(parts)
    if len(out) > limit:  # juda uzun sarlavha — oxirgi chora
        out = out[: limit - 1] + "…"
    return out


# ------------------------------------------------------------------ rasm
def _image_srcs(it: dict) -> list[str]:
    """Muqova nomzodlari tartib bilan: asosiy rasm, og-rasm, galereya, matndagi birinchi rasmlar."""
    out = [it.get("feature_image"), it.get("cover"), it.get("og_image")]
    for g in it.get("gallery") or []:
        out.append(g.get("url") or g.get("src") if isinstance(g, dict) else g)
    out += re.findall(r"<img[^>]+src=[\"']([^\"']+)", it.get("html") or "")[:3]
    seen, res = set(), []
    for u in out:
        u = (u or "").strip() if isinstance(u, str) else ""
        if u and u not in seen:
            seen.add(u)
            res.append(u)
    return res


def _fetch_bytes(url: str) -> bytes | None:
    """Tashqi rasm serverning o'zida yuklab olinadi (Telegram URL orqali olishda ko'p xato beradi)."""
    import httpx  # noqa: PLC0415

    try:
        with httpx.Client(timeout=20, follow_redirects=True) as c:
            r = c.get(url, headers={"User-Agent": "Mozilla/5.0 (UniversitySite Telegram publisher)"})
        ct = r.headers.get("content-type", "")
        if r.status_code == 200 and ct.startswith("image/") and len(r.content) <= 15 * 1024 * 1024:
            return r.content
    except Exception as e:  # noqa: BLE001
        _log(f"telegram publisher: rasm yuklanmadi {url}: {type(e).__name__}: {e}")
    return None


def _one_photo(st, src: str):
    from .media import get_blob  # noqa: PLC0415

    path = re.sub(r"^https?://[^/]+", "", src).split("?", 1)[0].split("#", 1)[0]
    m = re.fullmatch(r"/media/([a-f0-9]{16}\.(?:png|jpg|webp|gif))", path)
    if m:  # saytning o'z media fayli — qaysi domen bilan yozilgan bo'lmasin
        data = get_blob(st, m.group(1))
        return ("file",) + _photo_bytes(m.group(1), data) if data else None
    if src.startswith(("https://", "http://")):
        data = _fetch_bytes(src)
        if data:
            ext = "png" if data[:8] == b"\x89PNG\r\n\x1a\n" else "webp" if data[8:12] == b"WEBP" else "gif" if data[:3] == b"GIF" else "jpg"
            return ("file",) + _photo_bytes(f"rasm.{ext}", data)
        return ("url", src)
    return None


def photo_of(st, svc, it: dict):
    """Muqova: ('file', nom, bayt, mime) — fayl serverdan yuklanadi (Cloudflare ortida ham ishonchli); ('url', manzil) — oxirgi chora; None."""
    return photo_with_src(st, it)[0]


def photo_with_src(st, it: dict):
    """(muqova, manba manzili) — manba tahrirda muqova o'zgarganini aniqlash uchun saqlanadi."""
    for src in _image_srcs(it):
        try:
            ph = _one_photo(st, src)
        except Exception as e:  # noqa: BLE001
            _log(f"telegram publisher: rasm o'qilmadi {src}: {type(e).__name__}: {e}")
            ph = None
        if ph:
            return ph, src
    return None, ""


def _photo_bytes(name: str, data: bytes) -> tuple[str, bytes, str]:
    """JPEG/PNG (≤10 MB, tomonlar yig'indisi ≤10000) bo'lmasa — JPEG ga aylantiriladi."""
    ext = name.rsplit(".", 1)[1]
    if ext in ("jpg", "png") and len(data) <= 9 * 1024 * 1024:
        try:
            from PIL import Image  # noqa: PLC0415

            with Image.open(io.BytesIO(data)) as im:
                if im.width + im.height <= 9000 and max(im.width, im.height) <= 20 * min(im.width, im.height):
                    return name, data, "image/jpeg" if ext == "jpg" else "image/png"
        except Exception:  # noqa: BLE001
            return name, data, "image/jpeg" if ext == "jpg" else "image/png"
    try:
        from PIL import Image  # noqa: PLC0415

        with Image.open(io.BytesIO(data)) as im:
            im.seek(0)
            rgb = im.convert("RGBA")
            bg = Image.new("RGB", rgb.size, (255, 255, 255))
            bg.paste(rgb, mask=rgb.split()[3])
            bg.thumbnail((2560, 2560))
            buf = io.BytesIO()
            bg.save(buf, "JPEG", quality=88, optimize=True)
            return name.rsplit(".", 1)[0] + ".jpg", buf.getvalue(), "image/jpeg"
    except Exception:  # noqa: BLE001
        return name, data, {"webp": "image/webp", "gif": "image/gif", "png": "image/png"}.get(ext, "image/jpeg")


# ------------------------------------------------------------------ yuborish
def _photo_problem(e: Exception) -> bool:
    s = str(e).lower()
    return "bad request" in s and any(w in s for w in ("photo", "file", "url", "image", "dimension", "web page content", "wrong type"))


def _retry_after(e: Exception) -> int:
    m = re.search(r"retry after (\d+)", str(e), re.I)
    return int(m.group(1)) if m else 0


def _call(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except RuntimeError as e:
        wait = _retry_after(e)
        if not wait or wait > 30:
            raise
        time.sleep(wait)
        return fn(*a, **kw)


def _sig(cap: str, src: str) -> str:
    return hashlib.sha1(f"{cap}\x00{src}".encode()).hexdigest()


def send_item(api, svc, it: dict, chat_id: str) -> int:
    """Bitta element → bitta chat. Qaytadi: message_id."""
    return send_item_ex(api, svc, it, chat_id)[0]


def send_item_ex(api, svc, it: dict, chat_id: str) -> tuple[int, str, str, str]:
    """Qaytadi: (message_id, xabar turi «photo»/«text», muqova manbasi, imzo)."""
    cap = caption(svc, it)
    photo, src = photo_with_src(svc.st, it)
    if photo:
        try:
            if photo[0] == "file":
                r = _call(api.upload, "sendPhoto", {"photo": (photo[1], photo[2], photo[3])}, chat_id=chat_id, caption=cap, parse_mode="HTML")
            else:
                r = _call(api.call, "sendPhoto", chat_id=chat_id, photo=photo[1], caption=cap, parse_mode="HTML")
            return int((r or {}).get("message_id") or 0), "photo", src, _sig(cap, src)
        except RuntimeError as e:
            if not _photo_problem(e):
                raise
            _log(f"telegram publisher: rasm qabul qilinmadi, matn yuboriladi: {e}")
    r = _call(api.call, "sendMessage", chat_id=chat_id, text=cap, parse_mode="HTML", link_preview_options={"is_disabled": True},
              disable_web_page_preview=True)
    return int((r or {}).get("message_id") or 0), "text", "", _sig(cap, "")


def _live(it: dict) -> str:
    return it.get("tg_live") or it.get("published_at") or ""


def due(st, item_id: str | None = None, force: bool = False) -> list[tuple[dict, dict]]:
    """(element, chat) juftliklari: tasdiqlangan chat, tur yoqilgan, element ochiq va chat/tur tasdiqlangandan keyin nashr qilingan,
    hali yuborilmagan (yoki xato bilan qolgan, urinishlar tugamagan). force=True — vaqt shartisiz (qo'lda yuborish)."""
    gs = [g for g in groups(st) if g.get("confirmed") and g["can_post"] and g["kinds"]]
    if not gs:
        return []
    now = _now_us()
    kinds = sorted({k for g in gs for k in g["kinds"]})
    since = min(v for g in gs for v in g["kinds"].values())
    sql = ("SELECT * FROM items WHERE kind = ANY(%s) AND status IN ('published','scheduled') AND (published_at IS NULL OR published_at<=%s)")
    args: tuple = (kinds, now)
    if item_id:
        sql += " AND id=%s"
        args += (item_id,)
    else:
        sql += " AND (updated>=%s OR published_at>=%s)"
        args += (since[:19], since[:19])
    items = [st._item(r) for r in st._q(sql, args)]
    if not items:
        return []
    rows = {(r["item_id"], r["chat_id"]): dict(r) for r in st._q("SELECT * FROM tg_posts WHERE item_id = ANY(%s)", ([x["id"] for x in items],))}
    old = (datetime.now(timezone.utc) - timedelta(seconds=RETRY_AFTER)).isoformat(timespec="seconds")
    out = []
    for it in sorted(items, key=_live):
        live = _live(it)
        for g in gs:
            k_since = g["kinds"].get(it["kind"])
            if not k_since or (not force and not (live and k_since <= live <= now)):
                continue
            row = rows.get((it["id"], g["chat_id"]))
            if row and not (row["status"] == "error" and int(row["attempts"] or 0) < MAX_ATTEMPTS and (force or (row["updated"] or "") <= old)):
                continue
            out.append((it, g))
    return out


def _claim(st, iid: str, cid: str, force: bool = False) -> bool:
    now = _now()
    old = "9999" if force else (datetime.now(timezone.utc) - timedelta(seconds=RETRY_AFTER)).isoformat(timespec="seconds")
    r = st._q("INSERT INTO tg_posts(item_id, chat_id, message_id, status, error, attempts, created, updated) VALUES(%s,%s,'','sending','',1,%s,%s) "
              "ON CONFLICT(item_id, chat_id) DO UPDATE SET status='sending', attempts=tg_posts.attempts+1, updated=excluded.updated "
              "WHERE tg_posts.status='error' AND tg_posts.attempts<%s AND tg_posts.updated<=%s RETURNING item_id",
              (iid, cid, now, now, MAX_ATTEMPTS, old))
    return bool(r)


def run(st, svc, api, item_id: str | None = None, force: bool = False, log=None) -> dict:
    """Navbatdagilarni yuborish. Qaytadi: {sent, failed}."""
    sent = failed = 0
    for i, (it, g) in enumerate(due(st, item_id, force)):
        if not _claim(st, it["id"], g["chat_id"], force):
            continue
        if i and not SYNC:
            time.sleep(1.0)  # Telegram: bitta guruhga daqiqasiga ~20 xabar
        try:
            mid, kind, src, sig = send_item_ex(api, svc, it, g["chat_id"])
            now = _now()
            with st._tx() as c:
                c.execute("UPDATE tg_posts SET status='sent', message_id=%s, error='', updated=%s, kind=%s, photo=%s, sig=%s WHERE item_id=%s AND chat_id=%s",
                          (str(mid), now, kind, src, sig, it["id"], g["chat_id"]))
                c.execute("UPDATE tg_groups SET last_post=%s, last_error='', last_error_at=NULL WHERE chat_id=%s", (now, g["chat_id"]))
            sent += 1
        except Exception as e:  # noqa: BLE001
            err = (f"{e}" if isinstance(e, RuntimeError) else f"{type(e).__name__}: {e}")[:300]
            now = _now()
            with st._tx() as c:
                c.execute("UPDATE tg_posts SET status='error', error=%s, updated=%s WHERE item_id=%s AND chat_id=%s", (err, now, it["id"], g["chat_id"]))
                c.execute("UPDATE tg_groups SET last_error=%s, last_error_at=%s WHERE chat_id=%s", (f"{it['title'][:80]}: {err}", now, g["chat_id"]))
            if log:
                log(f"telegram post {it['id']} → {g['chat_id']}: {err}")
            failed += 1
    return {"sent": sent, "failed": failed}


# ------------------------------------------------------------------ tahrirni Telegram'ga yetkazish
def is_live(it: dict, now: str | None = None) -> bool:
    now = now or _now_us()
    return it.get("status") in ("published", "scheduled") and (not it.get("published_at") or it["published_at"] <= now)


def mark_dirty(st, iid: str) -> int:
    """Element saqlandi (saytda ochiq): yuborilgan xabarlar fon oqimida tahrirlanadi."""
    with st._tx() as c:
        return c.execute("UPDATE tg_posts SET dirty=1 WHERE item_id=%s AND status IN ('sent','sending')", (iid,)).rowcount


def _edit_item(api, svc, it: dict, row: dict) -> tuple[str, str, str]:
    """Bitta yuborilgan xabarni tahrirlash. Qaytadi: (tur, muqova manbasi, imzo)."""
    from .tg_channel import _gone, _not_modified  # noqa: PLC0415

    cap = caption(svc, it)
    photo, src = photo_with_src(svc.st, it)
    cid, mid = row["chat_id"], int(row["message_id"] or 0)
    kind = row.get("kind") or ""

    def safe(fn, *a, **kw):
        try:
            return _call(fn, *a, **kw)
        except RuntimeError as e:
            if _not_modified(e):
                return None
            raise

    def as_text():
        safe(api.call, "editMessageText", chat_id=cid, message_id=mid, text=cap, parse_mode="HTML", link_preview_options={"is_disabled": True})
        return "text", row.get("photo") or "", _sig(cap, row.get("photo") or "")

    def as_caption():
        safe(api.call, "editMessageCaption", chat_id=cid, message_id=mid, caption=cap, parse_mode="HTML")
        return "photo", row.get("photo") or "", _sig(cap, row.get("photo") or "")

    if kind == "text":
        return as_text()  # matnli xabarga rasm qo'shib bo'lmaydi — faqat matn yangilanadi
    if kind == "photo":
        if photo and src != (row.get("photo") or "") and photo[0] == "file":
            try:
                safe(api.upload, "editMessageMedia", {"f0": (photo[1], photo[2], photo[3])}, chat_id=cid, message_id=mid,
                     media={"type": "photo", "media": "attach://f0", "caption": cap, "parse_mode": "HTML"})
                return "photo", src, _sig(cap, src)
            except RuntimeError as e:
                if not _photo_problem(e) or _gone(e):
                    raise
                _log(f"telegram publisher: yangi muqova qabul qilinmadi, faqat izoh yangilanadi: {e}")
        return as_caption()  # muqova olib tashlangan bo'lsa ham rasmni o'chirib bo'lmaydi — izoh yangilanadi
    try:  # oldingi versiyada yuborilgan (turi saqlanmagan) xabar
        return as_caption()
    except RuntimeError as e:
        if _gone(e) or "bad request" not in str(e).lower():
            raise
        return as_text()


def sync_edits(st, svc, api, log=None) -> int:
    """«Tahrirlash kerak» belgili xabarlar: element hali saytda ochiq bo'lsa va izoh/muqova o'zgargan bo'lsa — o'sha xabar tahrirlanadi."""
    rows = st._q("SELECT * FROM tg_posts WHERE dirty=1 AND status='sent'")
    n = 0
    for r in rows:
        r = dict(r)
        if not st._q("UPDATE tg_posts SET dirty=0 WHERE item_id=%s AND chat_id=%s AND dirty=1 RETURNING item_id", (r["item_id"], r["chat_id"])):
            continue  # boshqa jarayon oldi
        it = st.get_item(r["item_id"])
        if not it or not is_live(it):
            continue  # nashrdan olingan / o'chirilgan — Telegram'da hech narsa qilinmaydi
        cap = caption(svc, it)
        _ph, src = photo_with_src(st, it)
        eff = src if r.get("kind") == "photo" and src else (r.get("photo") or "")  # matnli xabarda muqova ahamiyatsiz
        if r.get("sig") and r["sig"] == _sig(cap, eff):
            continue  # Telegram'dagi xabar bilan bir xil
        try:
            kind, photo, sig = _edit_item(api, svc, it, r)
            with st._tx() as c:
                c.execute("UPDATE tg_posts SET kind=%s, photo=%s, sig=%s, edit_error='', edited=%s WHERE item_id=%s AND chat_id=%s",
                          (kind, photo, sig, _now(), r["item_id"], r["chat_id"]))
            n += 1
        except Exception as e:  # noqa: BLE001
            err = (f"{e}" if isinstance(e, RuntimeError) else f"{type(e).__name__}: {e}")[:300]
            with st._tx() as c:
                c.execute("UPDATE tg_posts SET edit_error=%s WHERE item_id=%s AND chat_id=%s", (err, r["item_id"], r["chat_id"]))
            if log:
                log(f"telegram post tahriri {r['item_id']} → {r['chat_id']}: {err}")
    return n


def item_status(st, iid: str) -> list[dict]:
    names = {g["chat_id"]: g.get("title") or g["chat_id"] for g in groups(st)}
    return [{"chat_id": r["chat_id"], "title": names.get(r["chat_id"], r["chat_id"]), "status": r["status"], "error": r["error"] or "", "at": r["updated"],
             "edited": r.get("edited"), "edit_error": r.get("edit_error") or ""}
            for r in st._q("SELECT * FROM tg_posts WHERE item_id=%s ORDER BY created", (iid,))]


def live_marker(cur: dict | None, cols: dict, now: str | None = None) -> str | None:
    """Element qachon ommaga chiqdi (yoki chiqadi): saqlashda hisoblanadi; allaqachon ochiq elementni tahrirlash — o'zgarmaydi."""
    now = now or _now_us()
    status, pub = cols.get("status"), cols.get("published_at")
    if status not in ("published", "scheduled"):
        return (cur or {}).get("tg_live")
    was_live = bool(cur) and cur.get("status") in ("published", "scheduled") and (not cur.get("published_at") or cur["published_at"] <= now)
    if was_live:
        return cur.get("tg_live")
    return max(now, pub or now)


# ------------------------------------------------------------------ fon oqimi
class Publisher:
    def __init__(self, st, svc_fn, api_fn):
        self.st = st
        self.svc_fn = svc_fn
        self.api_fn = api_fn  # () -> Api | None (bot sozlanmagan bo'lsa None)
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._t: threading.Thread | None = None

    def run_once(self, item_id: str | None = None, force: bool = False) -> dict:
        api = self.api_fn()
        if api is None:
            return {"sent": 0, "failed": 0}
        with self._lock:
            svc = self.svc_fn()
            r = run(self.st, svc, api, item_id, force, log=_log)
            if item_id is None:  # fon tekshiruvi: tahrirlar va rejalashtirilgan qo'lda yozilgan postlar
                from . import tg_channel  # noqa: PLC0415

                for fn in (lambda: sync_edits(self.st, svc, api, log=_log), lambda: tg_channel.run_due(self.st, svc, api, log=_log)):
                    try:
                        fn()
                    except Exception as e:  # noqa: BLE001
                        _log(f"telegram publisher: {type(e).__name__}: {e}")
            return r

    def kick(self) -> None:
        if SYNC:
            self.run_once()
            return
        self.start()
        self._wake.set()

    def start(self) -> None:
        if self._t and self._t.is_alive():
            return
        self._stop.clear()

        def loop():
            while not self._stop.is_set():
                self._wake.wait(60)  # rejalashtirilgan nashrlar uchun har daqiqada tekshiriladi
                self._wake.clear()
                if self._stop.is_set():
                    break
                try:
                    self.run_once()
                except Exception as e:  # noqa: BLE001
                    _log(f"telegram publisher: {type(e).__name__}: {e}")

        self._t = threading.Thread(target=loop, daemon=True, name="tg-publisher")
        self._t.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()


def _log(msg: str) -> None:
    import logging  # noqa: PLC0415

    logging.getLogger("university.telegram").warning(msg)

