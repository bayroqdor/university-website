"""Muharrir uchun ochiq rasm bazasi (Openverse) — proksi: qidiruv, kichik rasm va sayt mediasiga import.

Admin panel: /api/admin/media/openimg/*  (admin sessiyasi)
Kabinet (forum / blog): /api/portal/openimg/*  (har qanday tizimga kirgan foydalanuvchi)
Brauzer uchinchi tomon serverlariga murojaat qilmaydi; tanlangan rasm serverga yuklanib, /media/... manzili qaytadi.
"""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import Response

from .. import openimg as O
from ..media import MediaError, store_media
from .deps import current_staff, current_user, ok, rate_limit, svc

router = APIRouter()
# (so'rovlar soni, oyna soniyada) — foydalanuvchi bo'yicha
LIMITS = {"search": (40, 60), "thumb": (400, 60), "import": (30, 600)}


def _limit(kind: str, u: dict) -> None:
    n, w = LIMITS[kind]
    rate_limit(f"openimg:{kind}:{u['id']}", n, w)


def _perr(e: O.ProviderError) -> HTTPException:
    code = str(e)
    return HTTPException(404 if code == "not_found" else 503 if code == "provider_busy" else 502, code)


def _search(q: str, page: int, u: dict):
    q = " ".join(str(q or "").split())
    if not 2 <= len(q) <= 100:
        raise HTTPException(400, "bad_query")
    if not 1 <= page <= O.MAX_PAGE:
        raise HTTPException(400, "bad_page")
    _limit("search", u)
    try:
        return ok(O.search(q, page))
    except O.ProviderError as e:
        raise _perr(e) from e


def _thumb(iid: str, u: dict):
    if not O.ID_RX.match(iid):
        raise HTTPException(404, "not_found")
    _limit("thumb", u)
    try:
        raw, mime = O.thumb(iid)
    except O.ProviderError as e:
        raise _perr(e) from e
    except O.ImageError as e:
        raise HTTPException(502, str(e)) from e
    return Response(raw, media_type=mime, headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff",
                                                   "Content-Security-Policy": "default-src 'none'; sandbox"})


def _import(data: dict, u: dict):
    iid = str(data.get("id") or "").strip()
    if not O.ID_RX.match(iid):
        raise HTTPException(400, "bad_id")
    _limit("import", u)
    try:
        item = O.get_item(iid)
        raw = O.provider().original(item)
    except O.ProviderError as e:
        raise _perr(e) from e
    except O.ImageError as e:
        raise HTTPException(400, str(e)) from e
    kind = O.image_kind(raw)
    if not kind:
        raise HTTPException(400, "not_image")
    name = (item.get("title") or "openverse").strip()[:80] or "openverse"
    try:
        m = store_media(svc().st, raw, f"{name}.{kind[0]}")
    except MediaError as e:
        raise HTTPException(400, str(e)) from e
    pub = O.public(item)
    return ok({"url": m["url"], "media_id": m.get("id"), "width": m.get("width"), "height": m.get("height"), "alt": pub["title"],
               "credit": {k: pub.get(k) for k in ("creator", "creator_url", "source", "source_url", "license", "license_url")},
               "credit_text": O.credit_line(pub)})


# ------------------------------------------------------------------ admin panel
@router.get("/api/admin/media/openimg/search")
def admin_search(q: str = "", page: int = 1, a: dict = Depends(current_staff)):
    return _search(q, page, a)


@router.get("/api/admin/media/openimg/thumb/{iid}")
def admin_thumb(iid: str, a: dict = Depends(current_staff)):
    return _thumb(iid, a)


@router.post("/api/admin/media/openimg/import")
def admin_import(data: dict = Body(...), a: dict = Depends(current_staff)):
    return _import(data, a)


# ------------------------------------------------------------------ kabinet (forum / blog)
@router.get("/api/portal/openimg/search")
def portal_search(q: str = "", page: int = 1, u: dict = Depends(current_user)):
    return _search(q, page, u)


@router.get("/api/portal/openimg/thumb/{iid}")
def portal_thumb(iid: str, u: dict = Depends(current_user)):
    return _thumb(iid, u)


@router.post("/api/portal/openimg/import")
def portal_import(data: dict = Body(...), u: dict = Depends(current_user)):
    return _import(data, u)
