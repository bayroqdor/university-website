"""Umumiy bog'liqliklar: servis singleton, sessiya, rollar, IP, cheklovlar."""
from __future__ import annotations

import copy

import os
import re
import threading
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from .. import content as C
from ..service import Service
from ..storage import Storage

COOKIE = "uni_session"  # talaba / o'qituvchi / xodim kabineti
ADMIN_COOKIE = "uni_admin"  # boshqaruv paneli — alohida: bir brauzerda admin va kabinetga bir vaqtda kirish mumkin
VID = "vid"
COOKIE_SECURE = os.environ.get("SITE_COOKIE_SECURE", "").lower() in ("1", "true", "yes")
_service: Service | None = None
_service_lock = threading.Lock()


def svc() -> Service:
    global _service
    if _service is None:
        with _service_lock:
            if _service is None:
                _service = Service(Storage(os.environ.get("SITE_DATA_DIR")))
    return _service


def reset_service() -> None:
    global _service
    old, _service = _service, None
    if old is not None:  # ulanishlar puli yopiladi (testlar va qayta ishga tushirish)
        try:
            old.stop()
        except Exception:  # noqa: BLE001
            pass
        old.st.close()


def ok(data) -> JSONResponse:
    return JSONResponse(data)


def ip_of(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")) or "-"


_attempts: dict[str, deque] = defaultdict(deque)


def rate_limit(key: str, limit: int = 10, window: float = 300.0) -> None:
    now = time.monotonic()
    q = _attempts[key]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "too_many_attempts")
    q.append(now)


def s_(d: dict, k: str, n: int = 200) -> str:
    return str(d.get(k) or "").strip()[:n]


def set_cookie(resp: Response, token: str, admin: bool = False) -> None:
    resp.set_cookie(ADMIN_COOKIE if admin else COOKIE, token, max_age=30 * 86400, httponly=True, samesite="lax", secure=COOKIE_SECURE, path="/")


def is_admin_realm(request: Request) -> bool:
    """So'rov admin panel nomidanmi: /api/admin/* yo'li, admin ilovasining X-Admin-Realm sarlavhasi yoki /admin sahifasidan
    ochilgan havola (masalan, pochta ilovasini yuklab olish)."""
    if request.url.path.startswith("/api/admin/"):
        return True
    if request.headers.get("x-admin-realm") == "admin":
        return True
    ref = request.headers.get("referer") or ""
    m = re.match(r"^https?://[^/]+(/[^?#]*)", ref)
    return bool(m and (m.group(1) == "/admin" or m.group(1).startswith("/admin/")))


def session_token(request: Request) -> str | None:
    return request.cookies.get(ADMIN_COOKIE if is_admin_realm(request) else COOKIE)


def session_user(request: Request) -> dict | None:
    # bitta HTTP so'rov davomida (middleware + endpoint) bir marta o'qiladi
    memo = getattr(request.state, "uni_user", False)
    if memo is not False:
        return copy.deepcopy(memo)
    u = _session_user(request)
    request.state.uni_user = u
    return copy.deepcopy(u)


def _session_user(request: Request) -> dict | None:
    st = svc().st
    if is_admin_realm(request):
        u = st.session_user(request.cookies.get(ADMIN_COOKIE))
        if not u:  # oldingi versiyadagi umumiy cookie (admin bo'lsa)
            u = st.session_user(request.cookies.get(COOKIE))
        return u if u and u["role"] == "admin" else None
    u = st.session_user(request.cookies.get(COOKIE))
    return u if u and u["role"] != "admin" else None


def public_user(u: dict) -> dict:
    return {k: v for k, v in u.items() if k != "pw_hash"}


# ------------------------------------------------------------------ autentifikatsiya
def current_user(request: Request) -> dict:
    u = session_user(request)
    if not u:
        raise HTTPException(401, "unauthorized")
    return u


def optional_user(request: Request) -> dict | None:
    return session_user(request)


def require(*roles: str):
    def dep(u: dict = Depends(current_user)) -> dict:
        if u["role"] not in roles:
            raise HTTPException(403, "forbidden")
        return u
    return dep


current_admin = require("admin")  # kontent, sozlamalar, statistika
current_staff = require("admin")  # admin panel (bo'limlar ruxsati — roles.py, middleware)
current_teacher = require("teacher", "admin")
current_student = require("student")


# ------------------------------------------------------------------ kontent yozuvini saqlash (admin, kabinet va foydalanuvchilar profili uchun umumiy)
def save_item(kind: str, data: dict, iid: str | None) -> dict:
    st = svc().st
    cur = st.get_item(iid) if iid else None
    if iid and (not cur or cur["kind"] != kind):
        raise HTTPException(404, "not_found")
    base = {k: v for k, v in (cur or {}).items() if k not in ("id", "kind", "created", "updated", "views", "reads")}
    try:
        cols, rest = C.clean_item(kind, data, base)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if not cols["title"]:
        raise HTTPException(400, "empty_title")
    if kind in C.KINDS_WITH_SLUG:
        slug, n = cols["slug"], 2
        while st.slug_taken(kind, slug, iid):
            slug = f"{cols['slug']}-{n}"
            n += 1
        cols["slug"] = slug
    for k in ("newsletter_sent",):
        if cur and cur.get(k):
            rest[k] = cur[k]
    from .. import tg_publish  # noqa: PLC0415

    if kind in tg_publish.KINDS:  # Telegram guruhlariga yuborish: element qachon ommaga chiqqani (tahrirlash o'zgartirmaydi)
        rest["tg_live"] = tg_publish.live_marker(cur, cols)
    item = st.save_item(kind, cols, rest, iid)
    from .. import gdrive_archive  # noqa: PLC0415 — sahifadagi yangi Drive arxivlari fonda tayyorlanadi

    gdrive_archive.on_content_saved(rest)
    return item


