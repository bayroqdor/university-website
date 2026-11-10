"""Google Drive papkasini saytning o'zida ko'rsatish (API kalitisiz).

Ochiq («havolaga ega har kim ko'ra oladi») papkaning tarkibini Google'ning `embeddedfolderview` sahifasidan o'qiymiz va JSON qilib beramiz:
frontend (DocViewer) uni sayt uslubidagi ro'yxat qilib chizadi — ichki papkalarga o'tish, faylni shu oynaning o'zida ochish.
Google'ning o'z «embedded folder» oynasida faylni bosish faqat nomini nusxalaydi — shuning uchun o'z ro'yxatimiz kerak.

Javoblar xotirada saqlanadi (10 daqiqa); Google javob bermasa — eski nusxa (bo'lsa) qaytariladi, xato 1 daqiqa eslab qolinadi.
"""
from __future__ import annotations

import html
import re
import threading
import time
from datetime import date

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from .. import gdrive_archive as A
from .deps import ip_of, rate_limit

router = APIRouter()

ID_RE = re.compile(r"[\w-]{10,120}")
RK_RE = re.compile(r"[\w-]{1,120}")
TTL = 600  # muvaffaqiyatli javob — 10 daqiqa
ERR_TTL = 60  # xato — 1 daqiqa (Google'ni qayta-qayta so'rovlar bilan band qilmaslik uchun)
KIND_TTL = 86400  # fayl/papka turi o'zgarmaydi — 1 kun
MAX_ENTRIES = 500
MAX_BYTES = 3_000_000
TIMEOUT = httpx.Timeout(8.0, connect=4.0)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

_cache: dict[str, tuple[float, bool, dict]] = {}  # kalit → (vaqt, muvaffaqiyatlimi, ma'lumot)
_locks: dict[str, threading.Lock] = {}
_guard = threading.Lock()

MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}


class DriveError(Exception):
    def __init__(self, code: str, status: int = 502):
        super().__init__(code)
        self.code = code
        self.status = status


# ------------------------------------------------------------------ tahlil (parser)
def _text(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def parse_date(raw: str, today: date | None = None) -> str:
    """«12/15/21», «May 4», «3:45 PM» (hl=en) → ISO sana; tanilmasa — bo'sh."""
    raw = (raw or "").strip()
    today = today or date.today()
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", raw)
    try:
        if m:
            mo, d, y = int(m[1]), int(m[2]), int(m[3])
            return date(y + 2000 if y < 100 else y, mo, d).isoformat()
        m = re.fullmatch(r"([A-Za-z]{3})[a-z]*\.? (\d{1,2})(?:, (\d{4}))?", raw)
        if m and m[1].lower() in MONTHS:
            return date(int(m[3]) if m[3] else today.year, MONTHS[m[1].lower()], int(m[2])).isoformat()
        m = re.fullmatch(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", raw)
        if m:
            return date(int(m[3]), int(m[2]), int(m[1])).isoformat()
        if re.fullmatch(r"\d{1,2}:\d{2}(?:\s?[AP]M)?", raw, re.I):
            return today.isoformat()  # bugun o'zgartirilgan — Google faqat soatni ko'rsatadi
    except ValueError:
        return ""
    return ""


def _kind_of(href: str, chunk: str, mime: str) -> str:
    if "/folders/" in href or "folderview" in href or mime == "application/vnd.google-apps.folder" or 'aria-label="Folder"' in chunk:
        return "folder"
    return "file"


def parse_folder(page: str, today: date | None = None) -> dict:
    """embeddedfolderview HTML → {"title", "items": [{id, name, kind, mime, url, rk, modified, modified_raw}]}.
    Papkalar avval, so'ng fayllar (Google tartibi saqlanadi)."""
    if "flip-entries" not in page and "flip-contents" not in page:
        raise DriveError("private", 403)  # kirish sahifasi yoki boshqa javob — papka ochiq emas
    tm = re.search(r"<title>(.*?)</title>", page, re.S)
    title = _text(tm[1]) if tm else ""
    items = []
    seen = set()
    for chunk in re.split(r'<div\s+class="flip-entry"', page)[1:]:
        im = re.match(r'[^>]*\bid="entry-([\w-]{10,120})"', chunk)
        if not im or im[1] in seen:
            continue
        fid = im[1]
        seen.add(fid)
        hm = re.search(r'<a\s[^>]*href="([^"]+)"', chunk)
        href = html.unescape(hm[1]) if hm else ""
        if href and not href.startswith("https://"):
            href = ""  # faqat Google'ning https havolalari
        nm = re.search(r'class="flip-entry-title"[^>]*>(.*?)</div>', chunk, re.S)
        name = _text(nm[1]) if nm else ""
        mm = re.search(r'/type/([\w.+-]+/[\w.+-]+)', chunk)
        mime = mm[1] if mm else ""
        dm = re.search(r'class="flip-entry-last-modified"[^>]*>\s*<div>(.*?)</div>', chunk, re.S)
        raw_date = _text(dm[1]) if dm else ""
        rk = re.search(r"[?&]resourcekey=([\w-]+)", href)
        kind = _kind_of(href, chunk, mime)
        items.append({"id": fid, "name": name or fid, "kind": kind, "mime": "application/vnd.google-apps.folder" if kind == "folder" else mime,
                      "url": href or (f"https://drive.google.com/drive/folders/{fid}" if kind == "folder" else f"https://drive.google.com/file/d/{fid}/view"),
                      "rk": rk[1] if rk else "", "modified": parse_date(raw_date, today), "modified_raw": raw_date})
    items.sort(key=lambda x: x["kind"] != "folder")  # barqaror saralash: papkalar tepada
    return {"title": title, "items": items}


# ------------------------------------------------------------------ Google'dan olish
def _get(url: str, params: dict) -> httpx.Response:
    """Faqat drive.google.com ga (manzil biz tomonda yasaladi); yo'naltirishga ergashilmaydi — u «yopiq» degani."""
    try:
        with httpx.Client(timeout=TIMEOUT, follow_redirects=False, headers={"User-Agent": UA, "Accept-Language": "en"}) as c:
            r = c.get(url, params=params)
    except httpx.HTTPError as e:
        raise DriveError("unreachable", 504 if isinstance(e, httpx.TimeoutException) else 502) from e
    if len(r.content) > MAX_BYTES:
        raise DriveError("too_large")
    return r


def fetch_folder(fid: str, rk: str = "") -> dict:
    params = {"id": fid, "hl": "en"}
    if rk:
        params["resourcekey"] = rk
    r = _get("https://drive.google.com/embeddedfolderview", params)
    if r.status_code in (301, 302, 303, 307, 308, 401, 403):
        raise DriveError("private", 403)  # kirishni talab qiladi — papka ochiq emas
    if r.status_code == 404:
        raise DriveError("not_found", 404)
    if r.status_code != 200:
        raise DriveError("unreachable", 502)
    return parse_folder(r.text)


def fetch_kind(fid: str) -> str:
    """`open?id=` havolasi papkami yoki faylmi — Google'ning yo'naltirishidan bilib olamiz."""
    r = _get("https://drive.google.com/open", {"id": fid})
    loc = r.headers.get("location", "")
    if "/folders/" in loc:
        return "folder"
    if "/file/d/" in loc or "docs.google.com/" in loc:
        return "file"
    if r.status_code == 404:
        raise DriveError("not_found", 404)
    return "unknown"


def fetch_title(fid: str) -> str:
    """Faylning Drive'dagi nomi: `embeddedfolderview` fayl uchun ham `<title>NOM</title>` qaytaradi (yopiq bo'lsa — bo'sh)."""
    r = _get("https://drive.google.com/embeddedfolderview", {"id": fid, "hl": "en"})
    if r.status_code != 200:
        if r.status_code >= 500:
            raise DriveError("unreachable", 502)
        return ""
    tm = re.search(r"<title>(.*?)</title>", r.text, re.S)
    return _text(tm[1]) if tm else ""


def fetch_meta(fid: str) -> dict:
    """{kind, name, archive}: papkami yoki fayl, fayl bo'lsa — nomi va arxivmi (.zip/.rar/.7z...) — arxivlarni o'zimiz ochamiz."""
    kind = fetch_kind(fid)
    if kind == "folder":
        return {"kind": kind, "name": "", "archive": False}
    name = fetch_title(fid)
    return {"kind": kind, "name": name, "archive": A.is_archive_name(name)}


def _cached(key: str, ttl: int, load, request: Request | None) -> dict:
    """Xotiradagi nusxa (TTL); bir xil kalit uchun bir vaqtda faqat bitta so'rov Google'ga boradi."""
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < (ttl if hit[1] else ERR_TTL):
        if hit[1]:
            return hit[2]
        raise DriveError(hit[2]["code"], hit[2]["status"])
    with _guard:
        lock = _locks.setdefault(key, threading.Lock())
    with lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < (ttl if hit[1] else ERR_TTL):
            if hit[1]:
                return hit[2]
            raise DriveError(hit[2]["code"], hit[2]["status"])
        if request is not None:
            rate_limit(f"gdrive:{ip_of(request)}", 40, 60)  # faqat Google'ga boradigan so'rovlar sanaladi
        try:
            data = load()
        except DriveError as e:
            if hit and hit[1] and e.code == "unreachable":
                return hit[2]  # Google javob bermadi — eski nusxa ham yaxshi
            _store(key, False, {"code": e.code, "status": e.status})
            raise
        _store(key, True, data)
        return data


def _store(key: str, good: bool, data: dict) -> None:
    if len(_cache) >= MAX_ENTRIES:
        for k, _v in sorted(_cache.items(), key=lambda kv: kv[1][0])[: MAX_ENTRIES // 5]:
            _cache.pop(k, None)
            _locks.pop(k, None)
    _cache[key] = (time.time(), good, data)


def _check(fid: str, rk: str) -> None:
    if not ID_RE.fullmatch(fid) or (rk and not RK_RE.fullmatch(rk)):
        raise HTTPException(404, "not_found")


def _err(e: DriveError) -> JSONResponse:
    return JSONResponse({"detail": e.code}, status_code=e.status, headers={"Cache-Control": "no-store"})


@router.get("/api/gdrive/folder/{fid}")
def gdrive_folder(fid: str, request: Request, rk: str = ""):
    """Ochiq Google Drive papkasining tarkibi: {id, title, items: [...]}."""
    _check(fid, rk)
    try:
        data = _cached(f"f:{fid}:{rk}", TTL, lambda: fetch_folder(fid, rk), request)
    except DriveError as e:
        return _err(e)
    return JSONResponse({"id": fid, **data}, headers={"Cache-Control": "public, max-age=300"})


def meta(fid: str, request: Request | None = None) -> dict:
    return _cached(f"k:{fid}", KIND_TTL, lambda: fetch_meta(fid), request)


@router.get("/api/gdrive/kind/{fid}")
def gdrive_kind(fid: str, request: Request):
    """Drive havolasi: {"kind": "folder" | "file" | "unknown", "name", "archive"} — `open?id=` ning turi va arxivni aniqlash uchun."""
    _check(fid, "")
    try:
        data = meta(fid, request)
    except DriveError as e:
        return _err(e)
    return JSONResponse({"id": fid, **data}, headers={"Cache-Control": "public, max-age=86400"})


# ------------------------------------------------------------------ Drive'dagi arxiv (RAR/ZIP) ichidagi hujjatlar
@router.get("/api/gdrive/archive/{fid}")
def gdrive_archive(fid: str, request: Request):
    """Arxiv holati: {"status": "preparing", progress} | {"status": "ready", name, entries: [{path, name, kind, size, mime}]} | {"status": "error", code}.
    Birinchi so'rov fonda yuklash/ochishni boshlaydi; frontend tayyor bo'lguncha so'rab turadi."""
    _check(fid, "")
    st = A.state(fid)
    if st is None:
        # faqat saytdagi sahifalarda havolasi bor va nomi arxiv bo'lgan fayllar — server begona fayllarni yuklamaydi
        if fid not in A.linked_ids() and fid not in A.linked_ids(force=True):
            return _err(DriveError("not_linked", 404))
        try:
            m = meta(fid, request)
        except DriveError as e:
            return _err(e)
        if not m.get("archive"):
            return _err(DriveError("not_archive", 404))
        rate_limit(f"gdrive-arch:{ip_of(request)}", 10, 600)  # yangi ishlar (holatni so'rash sanalmaydi)
        if not A.start(fid, m.get("name", "")):
            return _err(DriveError("busy", 429))
        st = A.state(fid) or {"status": "preparing", "progress": 0}
    cache = "public, max-age=300" if st["status"] == "ready" else "no-store"
    return JSONResponse({"id": fid, **st}, headers={"Cache-Control": cache})


@router.get("/api/gdrive/archive/{fid}/f/{path:path}")
def gdrive_archive_file(fid: str, path: str, dl: int = 0):
    """Arxiv ichidagi fayl (Range so'rovlari bilan — pdf.js kerakli qismlarnigina oladi). Yo'l faqat index'dan qidiriladi."""
    _check(fid, "")
    hit = A.entry_file(fid, path)
    if not hit:
        raise HTTPException(404, "not_found")
    disk, name = hit
    mime = A.mime_of(name)
    inline = not dl and mime in A.INLINE
    if A.UNSAFE.search(mime):
        mime = "application/octet-stream"  # HTML/SVG/JS saytning domenida ishga tushmasin
    headers = {"Cache-Control": "public, max-age=604800", "X-Content-Type-Options": "nosniff"}
    if mime != "application/pdf":
        headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox"
    if mime == "text/plain":
        mime = "text/plain; charset=utf-8"
    return FileResponse(disk, media_type=mime, filename=name, content_disposition_type="inline" if inline else "attachment", headers=headers)


def clear_cache() -> None:
    _cache.clear()
    _locks.clear()


__all__ = ["router", "parse_folder", "parse_date", "fetch_folder", "fetch_kind", "fetch_meta", "meta", "clear_cache", "DriveError"]
