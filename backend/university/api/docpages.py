"""PDF sahifalari rasm ko'rinishida (university/docpages.py): /api/docpages — hujjat haqida, /api/docpages/img/<kalit>/<n>.webp — sahifa.

Manba faqat saytning o'zidagi PDF: /media/<nom>.pdf, Drive arxivi ichidagi PDF (/api/gdrive/archive/<id>/f/<yo'l>)
va kabinetdagi o'z hujjati (/api/docs/<id>/download). Boshqa hech qanday yo'l qabul qilinmaydi.
"""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from .. import docpages as D
from .. import gdrive_archive as A
from .deps import ip_of, rate_limit, session_user, svc

router = APIRouter()

MEDIA_RE = re.compile(r"[a-f0-9]{16}\.pdf")
ARCH_RE = re.compile(r"/api/gdrive/archive/([\w-]{10,120})/f/(.+)")
DOC_RE = re.compile(r"/api/docs/([a-f0-9]{16})/download")


def _media_file(name: str) -> Path | None:
    """/media/<nom>.pdf — diskdan; S3'da saqlangan bo'lsa — bir marta keshga olinadi."""
    from ..media import get_blob  # noqa: PLC0415

    st = svc().st
    p = st.media_dir / name
    if p.is_file():
        return p
    if not st.get_media(name.split(".")[0]):
        return None
    c = D.base_dir() / "src" / name
    if c.is_file():
        return c
    raw = get_blob(st, name)
    if raw is None:
        return None
    D._atomic_write(c, raw)  # noqa: SLF001
    return c


def resolve(src: str, request: Request) -> tuple[Path, bool] | None:
    """src (saytdagi yo'l) → (diskdagi PDF, yopiqmi). Noto'g'ri yoki ruxsatsiz yo'l — None."""
    if not src or len(src) > 2000:
        return None
    u = urlparse(src)
    if u.scheme or u.netloc or u.query or u.fragment:
        return None
    path = u.path
    if "\\" in path or "\x00" in path:
        return None
    if path.startswith("/media/"):
        name = path[len("/media/"):]
        return (p, False) if MEDIA_RE.fullmatch(name) and (p := _media_file(name)) else None
    m = ARCH_RE.fullmatch(path)
    if m:
        inner = unquote(m.group(2))
        if not inner.lower().endswith(".pdf") or A.clean_path(inner) != inner:
            return None
        hit = A.entry_file(m.group(1), inner)  # faqat arxiv index'ida bor yo'llar
        return (hit[0], False) if hit else None
    m = DOC_RE.fullmatch(path)
    if m:
        from .office import _docs  # noqa: PLC0415

        u_ = session_user(request)
        d = _docs().get(m.group(1))
        if not u_ or not d or d["owner_id"] != u_["id"] or d["ext"] != "pdf":
            return None
        p = _docs().path(d)
        return (p, True) if p.is_file() else None
    return None


def _err(e: D.DocError) -> JSONResponse:
    return JSONResponse({"detail": e.code}, status_code=e.status, headers={"Cache-Control": "no-store"})


@router.get("/api/docpages")
def docpages_meta(request: Request, src: str = "", w: int = D.DEFAULT_W):
    """{pages, sizes: [[en, bo'y], ...] (pt), version, widths}; birinchi sahifalar shu javobdan oldin tayyorlanadi."""
    rate_limit(f"docpages:{ip_of(request)}", 240, 60)
    hit = resolve(src, request)
    if not hit:
        raise HTTPException(404, "not_found")
    path, private = hit
    try:
        body = D.meta(path, private=private, w=w)
    except D.DocError as e:
        return _err(e)
    return JSONResponse(body, headers={"Cache-Control": "private, no-store" if private else "public, max-age=60"})


@router.get("/api/docpages/img/{key}/{n}.webp")
def docpages_img(key: str, n: int, w: int = D.DEFAULT_W):
    try:
        p, private = D.page_image(key, w, n)
    except D.DocError as e:
        return _err(e)
    # kalit fayl mazmuniga bog'liq (o'zgarsa — yangi kalit): rasm o'zgarmaydi — Cloudflare va brauzer bir yil saqlaydi
    cc = "private, max-age=31536000, immutable" if private else "public, max-age=31536000, immutable"
    return FileResponse(p, media_type="image/webp", headers={"Cache-Control": cc, "X-Content-Type-Options": "nosniff"})
