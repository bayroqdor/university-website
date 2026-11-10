"""Universitet sayti API (FastAPI): ochiq sahifalar, statistika, obuna, aloqa, administrator paneli, kabinetlar."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import secrets
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from fastapi import Body, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response

from .. import menu_sections as MS
from .. import content as C
from .. import bootstrap, seo
from ..mailer import can_send, configured
from ..media import MAX_MEDIA, FetchError, MediaError, blob_url, get_blob, put_blob, safe_fetch, store_media
from ..palette import palette_from_image
from ..render import RenderError
from ..service import VERSION, is_bot, parse_ua
from .. import roles as R
from ..storage import PORTAL_ROLES, ROLES, local_now, local_today, verify_password
from .. import mail as M
from .academic import router as academic_router
from .mail import on_user_deleted, on_user_saved
from .mail import router as mail_router
from .desk import router as desk_router
from .integrations import hemis_student_login, start_hemis
from .integrations import router as integrations_router
from .interactive import router as interactive_router
from .library import router as library_router
from .library_seed import router as library_seed_router
from .upgoals import router as upgoals_router
from .chat import router as chat_router
from .grants import router as grants_router
from . import library_seed
from .sitefx import public_festive, public_popups
from .tuition import router as tuition_router
from .community import router as community_router
from .office import router as office_router
from .gdrive import router as gdrive_router
from .docpages import router as docpages_router
from .tglink import router as tglink_router
from .tgchannel import router as tgchannel_router
from .openimg import router as openimg_router
from .campus import router as campus_router, startup as _campus_start
from .official import router as official_router
from .. import a11y_page  # noqa: F401  /accessibility — seo.EXTRA_PAGES ga ro'yxatdan o'tadi
from .journal import router as journal_router
from .career import router as career_router, startup as _career_start
from .static_gz import gzipped
from .. import tuition as TU
from .. import gdrive_archive
from .sitefx import router as sitefx_router
from .library import start_jobs as start_library_jobs
from .library import stop_jobs as stop_library_jobs
from .desk import on_item_saved, start_poller, ticket_from_application, ticket_from_contact
from .deps import save_item
from .deps import ADMIN_COOKIE, COOKIE, COOKIE_SECURE, VID, is_admin_realm, session_user, current_admin, current_staff, current_user, ip_of, ok, public_user, rate_limit, s_, set_cookie, svc

__all__ = ["app", "svc"]


@asynccontextmanager
async def _lifespan(_app):
    s = svc()
    bootstrap.start()  # kutubxonalar, yuz modeli, Chromium — yetishmasa o'zi o'rnatadi (fon oqimida)
    s.start_scheduler()
    start_poller()  # murojaatlar: bo'lim pochtalarini har daqiqada tekshirish
    _campus_start()  # talabalar hayoti / abituriyent: «Klublar» va «Yotoqxona» murojaat bo'limlari
    start_hemis()  # HEMIS: avtomatik sinxronlash (sozlamada soat belgilansa)
    _career_start()  # karyera markazi: muddati o'tganlarni yopish, talabalarga kunlik jamlangan xabar; hamkorlar migratsiyasi
    start_library_jobs()  # kutubxona: eslatmalar, navbat muhlati, ertalabki qarzdorlar ro'yxati; kunlik zaxira
    library_seed.autostart()  # ochiq fond (erkin litsenziyali kitoblar, audiokitoblar) — birinchi ishga tushishda
    if gdrive_archive.warm_enabled():
        gdrive_archive.warm(delay=30)  # sahifalardagi Drive arxivlari (RAR/ZIP) fonda oldindan ochib qo'yiladi
    if os.environ.get("SITE_MAIL_SYNC_ON_START", "1") != "0":
        M.sync_when_ready(s.st)  # pochta serveri tayyor bo'lgach: domen, xizmat hisobi va barcha foydalanuvchilar
    yield
    library_seed.stop()
    stop_library_jobs()
    s.stop()


app = FastAPI(title="University Website API", version=VERSION, lifespan=_lifespan, docs_url=None, redoc_url=None)


# eski domenlar (admin → SEO → «Avvalgi domenlar»; standart ro'yxat bo'sh): DNS shu serverga yo'naltirilsa, har bir so'rov asosiy domendagi mos sahifaga 301 bilan o'tadi —
# qidiruv tizimlari eski sahifalar obro'sini yangi saytga ko'chiradi
OLD_PATHS = {"qabul": "/admission", "admission": "/admission", "abiturient": "/admission", "study": "/programs", "yonalishlar": "/programs", "programs": "/programs",
             "directions": "/programs", "faculty": "/faculties", "faculties": "/faculties", "fakultetlar": "/faculties", "news": "/news", "blog": "/news",
             "yangiliklar": "/news", "events": "/events", "contact": "/contact", "contacts": "/contact", "aloqa": "/contact", "about": "/about",
             "biz-haqimizda": "/about", "university": "/about", "teachers": "/staff", "staff": "/staff", "library": "/library", "vacancy": "/careers",
             "vacancies": "/careers", "careers": "/careers", "documents": "/documents", "partners": "/partners"}


def old_domain_target(host: str, path: str) -> str | None:
    s = svc()
    configured = (s.site().get("url") or os.environ.get("SITE_URL") or "").rstrip("/")
    if not configured or host not in seo.old_domains(s):
        return None
    from urllib.parse import urlparse  # noqa: PLC0415

    if (urlparse(configured).hostname or "").lower() == host:
        return None
    seg = [x for x in path.split("/") if x]
    lang = ""
    if seg and seg[0] in C.LANGS:
        lang = seg.pop(0)
    target = OLD_PATHS.get(seg[0].lower(), "/") if seg else "/"
    if lang and lang != s.base_lang():
        target += f"?lang={lang}"
    return configured + target


@app.middleware("http")
async def _old_domain_redirect(request: Request, call_next):
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].split(":")[0].strip().lower()
    if host and "." in host and not host.startswith(("127.", "localhost")):
        target = old_domain_target(host, request.url.path)
        if target:
            return RedirectResponse(target, status_code=301)
    return await call_next(request)


@app.middleware("http")
async def _section_guard(request: Request, call_next):
    """Admin panel: rolda ruxsat berilmagan bo'lim API'si — 403 «no_permission» (menyuda ham ko'rinmaydi)."""
    path = request.url.path
    if path.startswith(("/api/admin/", "/api/mail/")) and not path.endswith(("/login", "/logout")):
        st = svc().st
        u = session_user(request)
        if u and u["role"] == "admin" and not R.allowed(st, u, path, request.method):
            return JSONResponse({"detail": "no_permission"}, status_code=403)
    resp = await call_next(request)
    if path.startswith("/api/admin/") and request.method not in ("GET", "HEAD", "OPTIONS") and resp.status_code < 400:
        MS.reset()  # admin biror bo'limni o'zgartirdi — saytdagi menyu (bo'sh bo'limlar yashiriladi) darhol yangilanadi, 60 s kutilmaydi
    return resp
app.include_router(academic_router)
app.include_router(mail_router)
app.include_router(desk_router)
app.include_router(integrations_router)
app.include_router(interactive_router)
app.include_router(library_router)
app.include_router(library_seed_router)
app.include_router(upgoals_router)
app.include_router(chat_router)
app.include_router(grants_router)
app.include_router(sitefx_router)
app.include_router(tuition_router)
app.include_router(community_router)
app.include_router(office_router)
app.include_router(gdrive_router)
app.include_router(docpages_router)
app.include_router(tglink_router)
app.include_router(tgchannel_router)
app.include_router(openimg_router)
app.include_router(campus_router)  # talabalar hayoti, abituriyent, galereya, tadbirga ro'yxat
app.include_router(official_router)
app.include_router(journal_router)
app.include_router(career_router)

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
_s = s_
_ip = ip_of
_rate_limit = rate_limit


def _remember_base(request: Request) -> None:
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if host:
        svc().base_url_seen = f"{proto}://{host}"


# ------------------------------------------------------------------ autentifikatsiya (barcha rollar uchun bitta kirish)
HOME_OF = {"admin": "/admin", "teacher": "/teacher", "staff": "/xodim", "student": "/student"}


@app.get("/api/health")
def health():
    return {"status": "ok", "version": VERSION}


def _login(request: Request, data: dict, roles: tuple[str, ...]):
    _rate_limit("login:" + _ip(request), 8, 600)
    row = svc().st.find_user(_s(data, "login", 120))
    if not row or not row["active"] or not verify_password(str(data.get("password") or ""), row["pw_hash"]):
        raise HTTPException(401, "invalid_credentials")
    if row["role"] not in roles:
        # parol to'g'ri bo'lsa ham sessiya ochilmaydi: admin /admin dan, talaba/o'qituvchi /login dan kiradi
        raise HTTPException(403, "use_admin_login" if row["role"] == "admin" else "use_portal_login")
    token = svc().st.create_session(row["id"], _ip(request), request.headers.get("user-agent"))
    u = svc().st.get_user(row["id"])
    resp = ok({"user": public_user(u), "admin": public_user(u), "home": HOME_OF[u["role"]]})
    set_cookie(resp, token, admin=u["role"] == "admin")
    return resp


@app.post("/api/auth/login")
def auth_login(request: Request, data: dict = Body(...)):
    """Talaba, o'qituvchi va xodimlar kabineti. Administratorlar faqat /admin orqali kiradi.
    HEMIS sozlamasida «talabalar HEMIS paroli bilan kiradi» yoqilgan bo'lsa — sayt paroli mos kelmasa HEMIS orqali tekshiriladi."""
    try:
        return _login(request, data, PORTAL_ROLES)
    except HTTPException as e:
        if e.status_code != 401:
            raise
        u = hemis_student_login(_s(data, "login", 120), str(data.get("password") or ""))
        if not u:
            raise
        token = svc().st.create_session(u["id"], _ip(request), request.headers.get("user-agent"))
        resp = ok({"user": public_user(u), "admin": public_user(u), "home": HOME_OF[u["role"]], "via": "hemis"})
        set_cookie(resp, token)
        return resp


@app.post("/api/admin/login")
def admin_login(request: Request, data: dict = Body(...)):
    """Faqat «Administratorlar» bo'limida ochilgan hisoblar (o'qituvchi va talabalar kira olmaydi)."""
    return _login(request, data, ("admin",))


@app.post("/api/auth/logout")
def auth_logout(request: Request):
    """Faqat kabinetdan chiqish — admin paneldagi sessiya saqlanadi (admin ilovasidan chaqirilsa — admin chiqadi)."""
    if is_admin_realm(request):
        return admin_logout(request)
    t = request.cookies.get(COOKIE)
    if t:
        u = svc().st.session_user(t)
        if not u or u["role"] != "admin":
            svc().st.delete_session(t)
    resp = ok({"ok": True})
    resp.delete_cookie(COOKIE, path="/")
    return resp


@app.post("/api/admin/logout")
def admin_logout(request: Request):
    """Faqat admin paneldan chiqish — kabinetdagi sessiya saqlanadi."""
    resp = ok({"ok": True})
    for name in (ADMIN_COOKIE, COOKIE):
        t = request.cookies.get(name)
        u = svc().st.session_user(t) if t else None
        if t and (name == ADMIN_COOKIE or (u and u["role"] == "admin")):
            svc().st.delete_session(t)
            resp.delete_cookie(name, path="/")
    return resp


@app.get("/api/auth/me")
def auth_me(u: dict = Depends(current_user)):
    return ok({"user": public_user(u), "home": HOME_OF[u["role"]], "version": VERSION})


@app.get("/api/admin/me")
def admin_me(a: dict = Depends(current_staff)):
    out = _admin_out(svc().st, a)
    return ok({"admin": out, "user": out, "version": VERSION})


@app.put("/api/admin/me")
def admin_me_put(data: dict = Body(...), a: dict = Depends(current_staff)):
    fields = {k: _s(data, k, 120) for k in ("name", "email", "login") if k in data}
    if "login" in fields:
        fields["login"] = fields["login"].lower()
        if len(fields["login"]) < 3:
            raise HTTPException(400, "invalid_login")
        ex = svc().st.find_user(fields["login"])
        if ex and ex["id"] != a["id"]:
            raise HTTPException(409, "login_taken")
    if "email" in fields and fields["email"] and not EMAIL_RE.match(fields["email"]):
        raise HTTPException(400, "invalid_email")
    return ok({"admin": public_user(svc().st.update_user(a["id"], **fields))})


@app.post("/api/admin/password")
def admin_password(request: Request, data: dict = Body(...), a: dict = Depends(current_staff)):
    st = svc().st
    if not verify_password(str(data.get("current") or ""), st.user_pw_hash(a["id"]) or ""):
        raise HTTPException(400, "wrong_password")
    new = str(data.get("new") or "")
    if len(new) < 8:
        raise HTTPException(400, "weak_password")
    st.update_user(a["id"], password=new)
    on_user_saved(a, new)
    token = st.create_session(a["id"], _ip(request), request.headers.get("user-agent"))
    resp = ok({"ok": True})
    set_cookie(resp, token, admin=True)
    return resp


def _admin_out(st, u: dict) -> dict:
    r = R.role_of(st, u)
    return public_user(u) | {"role_id": r["id"], "role_name": r.get("name", ""), "perms": R.perms_of(st, u)}


@app.get("/api/admin/admins")
def admins_list(a: dict = Depends(current_admin)):
    st = svc().st
    return ok({"items": [_admin_out(st, u) for u in st.list_users("admin")], "me": a["id"], "roles": R.roles(st)})


def _role_id(st, data: dict, actor: dict) -> str:
    rid = _s(data, "role_id", 40) or R.SUPER
    if not any(r["id"] == rid for r in R.roles(st)):
        raise HTTPException(400, "invalid_role")
    if rid == R.SUPER and not R.is_super(st, actor):
        raise HTTPException(403, "no_permission")  # bosh administratorni faqat bosh administrator tayinlaydi
    return rid


@app.post("/api/admin/admins")
def admins_add(data: dict = Body(...), a: dict = Depends(current_admin)):
    """Admin panel hisobi: faqat shu yerda ochiladi (talaba va o'qituvchilar /admin ga kira olmaydi)."""
    st = svc().st
    login = _s(data, "login", 60).lower()
    if len(login) < 3 or not re.fullmatch(r"[a-z0-9._@-]+", login):
        raise HTTPException(400, "invalid_login")
    if st.find_user(login):
        raise HTTPException(409, "login_taken")
    if len(str(data.get("password") or "")) < 8:
        raise HTTPException(400, "weak_password")
    email = _s(data, "email", 160)
    if email and not EMAIL_RE.match(email):
        raise HTTPException(400, "invalid_email")
    nu = st.create_user(login, _s(data, "name", 120) or login, str(data["password"]), role="admin", email=email, data={"role_id": _role_id(st, data, a)})
    on_user_saved(nu, str(data["password"]))
    return ok(_admin_out(st, nu))


def _supers(st) -> list[dict]:
    return [u for u in st.list_users("admin", active=True) if R.is_super(st, u)]


@app.put("/api/admin/admins/{aid}")
def admins_update(aid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    st = svc().st
    u = st.get_user(aid)
    if not u or u["role"] != "admin":
        raise HTTPException(404, "not_found")
    if R.is_super(st, u) and not R.is_super(st, a):
        raise HTTPException(403, "no_permission")
    fields: dict = {}
    for k in ("name", "email"):
        if k in data:
            fields[k] = _s(data, k, 160)
    if fields.get("email") and not EMAIL_RE.match(fields["email"]):
        raise HTTPException(400, "invalid_email")
    if "login" in data:
        login = _s(data, "login", 60).lower()
        if len(login) < 3 or not re.fullmatch(r"[a-z0-9._@-]+", login):
            raise HTTPException(400, "invalid_login")
        ex = st.find_user(login)
        if ex and ex["id"] != aid:
            raise HTTPException(409, "login_taken")
        fields["login"] = login
    if data.get("password"):
        if len(str(data["password"])) < 8:
            raise HTTPException(400, "weak_password")
        fields["password"] = str(data["password"])
    if "active" in data:
        if aid == a["id"] and not data["active"]:
            raise HTTPException(400, "cannot_deactivate_self")
        fields["active"] = bool(data["active"])
    if "role_id" in data:
        rid = _role_id(st, data, a)
        if aid == a["id"] and rid != R.role_of(st, a)["id"]:
            raise HTTPException(400, "cannot_change_own_role")
        fields["data"] = {"role_id": rid}
    was_super = R.is_super(st, u)
    nu = st.update_user(aid, **fields)
    if was_super and not R.is_super(st, nu) or (was_super and not nu["active"]):
        if not _supers(st):
            st.update_user(aid, data={"role_id": R.SUPER}, active=True)
            raise HTTPException(400, "last_superadmin")
    if fields.get("password") or "login" in fields:
        on_user_saved(nu, fields.get("password"), u["login"])
    return ok(_admin_out(st, st.get_user(aid)))


@app.delete("/api/admin/admins/{aid}")
def admins_delete(aid: str, a: dict = Depends(current_admin)):
    st = svc().st
    if aid == a["id"]:
        raise HTTPException(400, "cannot_delete_self")
    victim = st.get_user(aid)
    if not victim or victim["role"] != "admin":
        raise HTTPException(404, "not_found")
    if R.is_super(st, victim):
        if not R.is_super(st, a):
            raise HTTPException(403, "no_permission")
        if len(_supers(st)) <= 1:
            raise HTTPException(400, "last_superadmin")
    st.delete_user(aid)
    on_user_deleted(victim)
    return ok({"ok": True})


# ------------------------------------------------------------------ rollar
@app.get("/api/admin/perms")
def admin_perms(a: dict = Depends(current_admin)):
    return ok({"perms": [{"key": k, "group": g, "label": n} for k, g, n in R.PERMS]})


@app.get("/api/admin/roles")
def roles_get(a: dict = Depends(current_admin)):
    st = svc().st
    counts: dict[str, int] = {}
    for u in st.list_users("admin"):
        rid = R.role_of(st, u)["id"]
        counts[rid] = counts.get(rid, 0) + 1
    return ok({"items": [r | {"users": counts.get(r["id"], 0)} for r in R.roles(st)], "perms": [{"key": k, "group": g, "label": n} for k, g, n in R.PERMS]})


@app.put("/api/admin/roles")
def roles_put(data: dict = Body(...), a: dict = Depends(current_admin)):
    st = svc().st
    items = R.clean_roles(data.get("items") or [], R.roles(st))
    ids = {r["id"] for r in items}
    used = {R.role_of(st, u)["id"] for u in st.list_users("admin")}
    missing = used - ids
    if missing:
        raise HTTPException(400, "role_in_use")
    st.kv_put("roles", items)
    return roles_get(a)


# ------------------------------------------------------------------ ochiq ma'lumotlar
PUBLIC_SITE_KEYS = ("title", "description", "lang", "accent", "theme", "logo_text", "favicon", "og_image", "footer_text", "sections", "hero",
                    "cursor", "animations", "smooth_scroll", "posts_per_page", "admission_text", "portal_text", "portal_enabled", "accent2", "hero_images", "home_images",
                    "admission_cta", "admission_year")
LIGHT_DROP = ("content", "html", "text", "bio", "education", "experience")


def _light(it: dict) -> dict:
    return {k: v for k, v in it.items() if k not in LIGHT_DROP and k not in ("send_newsletter", "newsletter_sent", "tg_live", "i18n", "user_id", "editor_ids")}


def _pub_items(kind: str, lang: str) -> list[dict]:
    """Ochiq ro'yxat: tanlangan tilga tarjima qilingan (tarjima bo'lmasa — asl tilda, `lang` maydoni bilan)."""
    s = svc()
    return [s.loc(x, lang) for x in s.st.list_items(kind, public=True)]


def _pub_items_of(kinds, lang: str) -> dict[str, list[dict]]:
    """Bir nechta tur bitta so'rovda (bosh sahifa)."""
    s = svc()
    return {k: [s.loc(x, lang) for x in v] for k, v in s.st.list_items_of(kinds, public=True).items()}


def _by_date(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda x: x.get("published_at") or x.get("created") or "", reverse=True)


def _norm(s: str) -> str:
    """Taqqoslash uchun: kichik harf, o‘/g‘ va tutuq belgisining barcha shakllari bitta belgiga."""
    return re.sub(r"\s+", " ", re.sub(r"[ʻʼ'`‘’]", "'", (s or "").strip().lower()))


_PHRASES: dict = {_norm(k): v for k, v in json.loads((Path(__file__).resolve().parents[1] / "menu_phrases.json").read_text(encoding="utf-8")).items()}
_SECTION_LABEL = {"/" + k: k for k in seo.STATIC} | {"/careers": "careers", "/schedule": "schedule"}


def _menu_label(label: str, url: str, lang: str, base: str) -> str:
    """Menyu yorlig'i tanlangan tilda: 1) admin kiritgan tarjima (chaqiruvchida), 2) havola qilingan sahifa/yozuv sarlavhasi,
    3) bo'lim nomi (/programs, /news…), 4) ma'lum iboralar jadvali; topilmasa — asl yorliq."""
    if lang == base:
        return label
    path = urlparse(url).path if url else ""
    seg = [x for x in path.strip("/").split("/") if x]
    s = svc()
    if len(seg) == 2:
        kind = "page" if seg[0] in ("about", "pages") else C.KIND_OF_SECTION.get(seg[0])
        if kind:
            raw = s.st.get_item_by_slug(kind, seg[1])
            if raw and _norm(raw["title"]) == _norm(label):
                tr = (raw.get("i18n") or {}).get(lang) or {}
                if tr.get("title"):
                    return tr["title"]
    ph = _PHRASES.get(_norm(label))
    if ph and ph.get(lang):
        return ph[lang]
    if len(seg) == 1 and path in _SECTION_LABEL and not urlparse(url).query:
        key = _SECTION_LABEL[path]
        uz = seo.LABELS.get(base, {}).get(key)
        if uz and _norm(uz) == _norm(label):
            return seo.LABELS.get(lang, {}).get(key) or label
    return label


def _menu_l(menu: list, lang: str) -> list:
    """Admin tuzgan menyu: yorliqlar tanlangan tilda (admin tarjimasi bo'lmasa — avtomatik, so'ng asl tilda)."""
    base = svc().base_lang()

    def one(x: dict) -> dict:
        own = (x.get("labels") or {}).get(lang)
        label = own or _menu_label(x.get("label") or "", x.get("url") or "", lang, base)
        group = x.get("group") or ""
        if group and lang != base:
            group = (_PHRASES.get(_norm(group)) or C.MENU_GROUPS.get(group) or {}).get(lang) or group
        return {"label": label, "url": x.get("url") or "", "group": group}
    return [one(m) | {"children": [one(c) for c in m.get("children") or []]} for m in menu]


def _tg_link() -> str:
    from .. import telegram as TG  # noqa: PLC0415

    cfg = TG.config(svc().st)
    return f"https://t.me/{cfg['username']}" if TG.ready(cfg) and cfg.get("username") else ""


def _public_site(lang: str = "") -> dict:
    s = svc()
    u = s.uni_l(lang)
    site = s.site_l(lang)
    counts = s.st.count_items()
    tags: dict[str, int] = {}
    for it in s.st.list_items("news", public=True):
        for t in it.get("tags") or []:
            tags[t] = tags.get(t, 0) + 1
    public_uni = {k: v for k, v in u.items() if k not in ("rector_speech",)}
    sem = s.st.current_semester()
    return {
        "uni": public_uni,
        "site": {k: site.get(k) for k in PUBLIC_SITE_KEYS} | {"logo_text": site.get("logo_text") or u.get("abbr") or "UNI", "menu": _menu_l(MS.filter_menu(s.site().get("menu") or [], MS.hidden_paths(s)), s.lang(lang))},
        "counts": {k: v["published"] for k, v in counts.items()},
        "tags": sorted(tags.items(), key=lambda kv: -kv[1]),
        "menu_pages": [{"title": x["title"], "slug": x["slug"], "section": x.get("section")} for x in _pub_items("page", lang)],
        "faculties": [{"id": x["id"], "title": x["title"], "slug": x["slug"]} for x in _pub_items("faculty", lang)],
        "semester": {"name": sem["name"]} if sem and sem.get("published") else None,
        "subscribe": True,
        "telegram_bot": _tg_link(),
        "popups": public_popups(s.st, s.lang(lang)),
        "festive": public_festive(s.lang(lang)),
        "tuition": TU.public(s.st, s.lang(lang)),
        "former_domains": [d for d in seo.old_domains(s) if not d.startswith("www.")],
        "version": VERSION,
        "lang": s.lang(lang),
        "default_lang": s.base_lang(),
        "langs": list(C.LANGS),
    }


@app.get("/api/site")
def site_public(request: Request, lang: str = ""):
    _remember_base(request)
    return ok(_public_site(lang))


@app.get("/api/search")
def site_search_public(request: Request, q: str = "", lang: str = ""):
    """Saytdagi qidiruv (yuqori menyudagi qidiruv oynasi): barcha ochiq materiallar, joriy tilda."""
    from .. import search as SR  # noqa: PLC0415

    rate_limit(f"search:{ip_of(request)}", 120, 60)
    s = svc()
    lang = lang if lang in C.LANGS else s.base_lang()
    return ok({"items": SR.site_search(s, q[:80], lang)})


@app.get("/api/home")
def home_public(lang: str = ""):
    pub = _pub_items_of(("program", "news", "announce", "event", "partner", "staff", "faculty", "link", "department"), lang)
    programs = pub["program"]
    news = _by_date(pub["news"])
    ann = _by_date(pub["announce"])
    events = sorted(pub["event"], key=lambda x: x.get("starts") or "")
    today = local_now().isoformat(timespec="seconds")
    upcoming = [e for e in events if (e.get("ends") or e.get("starts") or "") >= today] or events[-3:]
    partners = pub["partner"]
    staff = pub["staff"]
    teachers = [x for x in staff if x.get("category") in ("professor", "visiting")]
    s = svc()
    return ok({
        "programs": [_light(x) for x in ([p for p in programs if p.get("featured")] or programs)[:24]],
        "faculties": [_light(x) for x in pub["faculty"]],
        "news": [_light(x) for x in news[:4]],
        "announcements": [_light(x) for x in ann[:5]],
        "events": [_light(x) for x in upcoming[:4]],
        "partners": [_light(x) for x in ([p for p in partners if p.get("featured")] or partners)[:12]],
        "staff": [_light(x) for x in ([p for p in staff if p.get("featured")] or staff)[:4]],
        "professors": [_light(x) for x in sorted(teachers, key=lambda x: (not x.get("photo"), not x.get("featured"), x.get("sort") or 0))[:12]],
        "links": [_light(x) for x in pub["link"]],
        "counts": {"staff": len(staff), "professors": len(teachers), "departments": len([d for d in pub["department"] if d.get("category") == "department"])},
        "rector": {k: s.uni_l(lang).get(k) for k in ("rector_name", "rector_title", "rector_photo", "rector_speech_html")},
    })


def _paged(items: list[dict], page: int, limit: int) -> dict:
    total = len(items)
    page = max(page, 1)
    return {"items": items[(page - 1) * limit : page * limit], "total": total, "page": page, "pages": max(1, -(-total // limit))}


def _search(items: list[dict], q: str, fields=("title", "excerpt", "summary", "text", "position")) -> list[dict]:
    ql = q.lower().strip()[:100]
    return [x for x in items if any(ql in str(x.get(f) or "").lower() for f in fields)] if ql else items


@app.get("/api/news")
def news_public(tag: str = "", q: str = "", page: int = 1, limit: int = 0, lang: str = ""):
    s = svc()
    limit = min(max(limit or int(s.site().get("posts_per_page") or 9), 1), 50)
    items = _by_date(_pub_items("news", lang))
    if tag:
        items = [x for x in items if tag in (x.get("tags") or [])]
    items = _search(items, q)
    out = _paged(items, page, limit)
    counters = s.st.counters_by_item([x["id"] for x in out["items"]])
    out["items"] = [_light(x) | {"views": counters.get(x["id"], {}).get("views", 0)} for x in out["items"]]
    return ok(out)


@app.get("/api/news/{slug}")
def news_item(slug: str, lang: str = ""):
    s, st = svc(), svc().st
    it = st.get_item_by_slug("news", slug)
    if not it:
        raise HTTPException(404, "not_found")
    it = s.loc(it, lang)
    items = _by_date(_pub_items("news", lang))
    idx = next((i for i, x in enumerate(items) if x["id"] == it["id"]), 0)
    newer = items[idx - 1] if idx > 0 else None
    older = items[idx + 1] if idx + 1 < len(items) else None
    tags = set(it.get("tags") or [])
    related = sorted((x for x in items if x["id"] != it["id"]), key=lambda x: (x.get("lang") != it.get("lang"), -len(tags & set(x.get("tags") or []))))[:3]
    body = {k: v for k, v in it.items() if k not in ("send_newsletter", "newsletter_sent", "tg_live", "text")}
    return ok({"item": body | st.item_counters(it["id"]), "newer": newer and _light(newer), "older": older and _light(older), "related": [_light(x) for x in related]})


@app.get("/api/announcements")
def announcements_public(category: str = "", q: str = "", page: int = 1, limit: int = 12, lang: str = ""):
    items = _by_date(_pub_items("announce", lang))
    if category:
        items = [x for x in items if x.get("category") == category]
    items = _search(items, q)
    out = _paged(items, page, min(max(limit, 1), 50))
    out["items"] = [_light(x) for x in out["items"]]
    return ok(out)


@app.get("/api/announcements/{slug}")
def announcement_item(slug: str, lang: str = ""):
    it = svc().st.get_item_by_slug("announce", slug)
    if not it:
        raise HTTPException(404, "not_found")
    it = svc().loc(it, lang)
    others = [_light(x) for x in _by_date(_pub_items("announce", lang)) if x["id"] != it["id"]][:4]
    return ok({"item": {k: v for k, v in it.items() if k != "text"}, "others": others})


@app.get("/api/pages")
def pages_public(section: str = "", lang: str = ""):
    items = _pub_items("page", lang)
    if section:
        items = [x for x in items if x.get("section") == section]
    return ok({"items": [_light(x) for x in items]})


@app.get("/api/pages/{slug}")
def page_item(slug: str, lang: str = ""):
    it = svc().st.get_item_by_slug("page", slug)
    if not it:
        raise HTTPException(404, "not_found")
    it = svc().loc(it, lang)
    siblings = [_light(x) for x in _pub_items("page", lang) if x.get("section") == it.get("section")]
    news = []
    if it.get("news_tag"):
        news = [_light(x) for x in _by_date(_pub_items("news", lang)) if it["news_tag"] in (x.get("tags") or [])][:6]
    return ok({"item": {k: v for k, v in it.items() if k != "text"}, "siblings": siblings, "contacts": _contacts(it.get("contact_ids") or [], lang), "news": news})


def _contacts(ids: list, lang: str) -> list[dict]:
    """Sahifaga biriktirilgan mas'ul xodimlar (faqat nashr qilingan profillar): kartada ko'rinadigan maydonlar."""
    s, out = svc(), []
    for sid in ids[:8]:
        d = s.st.get_item(sid)
        if not d or d["kind"] != "staff" or d.get("status") != "published":
            continue
        d = s.loc(d, lang)
        out.append({k: d.get(k) or "" for k in ("id", "title", "slug", "position", "degree", "photo", "email", "phone", "hours")})
    return out


@app.get("/api/programs")
def programs_public(faculty: str = "", degree: str = "", lang: str = ""):
    items = _pub_items("program", lang)
    if faculty:
        items = [x for x in items if x.get("faculty_id") == faculty]
    if degree:
        items = [x for x in items if x.get("degree") == degree]
    facs = {f["id"]: f["title"] for f in _pub_items("faculty", lang)}
    return ok({"items": [_light(x) | {"faculty": facs.get(x.get("faculty_id") or "")} for x in items], "faculties": [_light(x) for x in _pub_items("faculty", lang)]})


@app.get("/api/programs/{slug}")
def program_item(slug: str, lang: str = ""):
    s = svc()
    it = s.st.get_item_by_slug("program", slug)
    if not it:
        raise HTTPException(404, "not_found")
    it = s.loc(it, lang)
    fac = s.st.get_item(it["faculty_id"]) if it.get("faculty_id") else None
    others = [_light(x) for x in _pub_items("program", lang) if x["id"] != it["id"] and x.get("faculty_id") == it.get("faculty_id")][:4]
    return ok({"item": {k: v for k, v in it.items() if k != "text"}, "faculty": _light(s.loc(fac, lang)) if fac else None, "others": others})


@app.get("/api/faculties")
def faculties_public(lang: str = ""):
    progs = _pub_items("program", lang)
    return ok({"items": [_light(x) | {"programs": [{"title": p["title"], "slug": p["slug"]} for p in progs if p.get("faculty_id") == x["id"]]} for x in _pub_items("faculty", lang)]})


@app.get("/api/faculties/{slug}")
def faculty_item(slug: str, lang: str = ""):
    s = svc()
    it = s.st.get_item_by_slug("faculty", slug)
    if not it:
        raise HTTPException(404, "not_found")
    it = s.loc(it, lang)
    members = {(u.get("data") or {}).get("staff_id") for u in s.st.list_users("teacher", active=True) + s.st.list_users("staff", active=True)
               if it["id"] in (u.get("data") or {}).get("faculty_ids", [])}
    staff = [x for x in _pub_items("staff", lang) if x.get("faculty_id") == it["id"] or x["id"] in members]
    dean = next((x for x in staff if x["id"] == it.get("dean_staff_id")), None)
    if not dean and it.get("dean_staff_id"):
        d = s.st.get_item(it["dean_staff_id"])
        dean = s.loc(d, lang) if d and d["kind"] == "staff" and d["status"] == "published" else None
    staff = [x for x in staff if not dean or x["id"] != dean["id"]]
    staff.sort(key=lambda x: ({"leadership": 0, "professor": 1, "visiting": 1, "teacher": 2}.get(x.get("category") or "", 3), x.get("sort") or 0, x["title"]))
    return ok({"item": {k: v for k, v in it.items() if k not in ("text", "editor_ids")},
               "programs": [_light(x) for x in _pub_items("program", lang) if x.get("faculty_id") == it["id"]],
               "dean": _light(dean) | {"bio": (dean.get("bio") or "")[:600], "email": dean.get("email") or "", "phone": dean.get("phone") or ""} if dean else None,
               "staff": [_light(x) for x in staff]})


@app.get("/api/structure")
def structure_public(lang: str = ""):
    staff = _pub_items("staff", lang)
    facs = {f["id"]: {"title": f["title"], "slug": f["slug"]} for f in _pub_items("faculty", lang)}

    def card(d: dict) -> dict:
        members = [m for m in staff if m.get("department_id") == d["id"]]
        head = next((m for m in staff if d.get("head_staff_id") and m["id"] == d["head_staff_id"]), None)
        return _light(d) | {"staff_count": len(members), "faculty": facs.get(d.get("faculty_id") or ""),
                            "head": head["title"] if head else d.get("head") or "", "head_photo": head.get("photo") or "" if head else "",
                            "faces": [{"title": m["title"], "photo": m.get("photo") or ""} for m in sorted(members, key=lambda m: (not m.get("photo"), m.get("sort") or 0))[:5]]}

    return ok({"items": [card(x) for x in _pub_items("department", lang)]})


@app.get("/api/structure/{slug}")
def department_item(slug: str, lang: str = ""):
    s = svc()
    it = s.st.get_item_by_slug("department", slug)
    if not it:
        raise HTTPException(404, "not_found")
    it = s.loc(it, lang)
    staff = sorted((x for x in _pub_items("staff", lang) if x.get("department_id") == it["id"]),
                   key=lambda x: ({"leadership": 0, "visiting": 1, "professor": 1, "teacher": 2}.get(x.get("category") or "", 3), x.get("sort") or 0))
    fac = s.st.get_item(it["faculty_id"]) if it.get("faculty_id") else None
    # bo'lim rahbari alohida karta: biriktirilgan xodim (boshqa bo'limda bo'lsa ham), bo'lmasa — birinchi rahbariyat a'zosi
    hid = it.get("head_staff_id") or ""
    head = next((x for x in staff if hid and x["id"] == hid), None)
    if not head and hid:
        h = s.st.get_item(hid)
        head = s.loc(h, lang) if h and h["kind"] == "staff" and h["status"] == "published" else None
    if not head and not it.get("head"):
        head = next((x for x in staff if x.get("category") == "leadership"), None)
    staff = [x for x in staff if not head or x["id"] != head["id"]]
    return ok({"item": {k: v for k, v in it.items() if k != "text"}, "staff": [_light(x) for x in staff],
               "head": _light(head) if head else None,
               "faculty": _light(s.loc(fac, lang)) if fac else None,
               "others": [_light(x) for x in _pub_items("department", lang) if x["id"] != it["id"]]})


@app.get("/api/staff")
def staff_public(kind: str = "", faculty: str = "", department: str = "", q: str = "", lang: str = ""):
    items = _pub_items("staff", lang)
    if kind:
        items = [x for x in items if x.get("category") == kind]
    if faculty:
        items = [x for x in items if x.get("faculty_id") == faculty]
    if department:
        items = [x for x in items if x.get("department_id") == department]
    items = _search(items, q, ("title", "position", "degree"))
    facs = {f["id"]: f["title"] for f in _pub_items("faculty", lang)}
    deps = {d["id"]: d for d in _pub_items("department", lang)}
    out = []
    for x in items:
        d = deps.get(x.get("department_id") or "")
        out.append(_light(x) | {"faculty": facs.get(x.get("faculty_id") or ""), "department": d["title"] if d else None, "department_slug": d["slug"] if d else None})
    return ok({"items": out, "departments": [{"id": d["id"], "title": d["title"], "slug": d["slug"], "category": d.get("category")} for d in deps.values()]})


@app.get("/api/staff/{slug}")
def staff_item(slug: str, lang: str = ""):
    s = svc()
    it = s.st.get_item_by_slug("staff", slug)
    if not it:
        raise HTTPException(404, "not_found")
    it = s.loc(it, lang)
    fac = s.st.get_item(it["faculty_id"]) if it.get("faculty_id") else None
    dep = s.st.get_item(it["department_id"]) if it.get("department_id") else None
    same = (lambda x: x.get("department_id") == it["department_id"]) if it.get("department_id") else (lambda x: bool(it.get("faculty_id")) and x.get("faculty_id") == it["faculty_id"])
    colleagues = [_light(x) for x in _pub_items("staff", lang) if same(x) and x["id"] != it["id"]][:8]
    is_dean = bool(fac and fac.get("dean_staff_id") == it["id"])
    it = {k: v for k, v in it.items() if k != "user_id"}
    return ok({"item": it, "faculty": _light(s.loc(fac, lang)) if fac else None, "department": _light(s.loc(dep, lang)) if dep else None, "colleagues": colleagues,
               "is_dean": is_dean})


@app.get("/api/events")
def events_public(upcoming: int = 0, lang: str = ""):
    items = sorted(_pub_items("event", lang), key=lambda x: x.get("starts") or "")
    now = local_now().isoformat(timespec="seconds")
    if upcoming:
        items = [e for e in items if (e.get("ends") or e.get("starts") or "") >= now]
    return ok({"items": [_light(x) for x in items], "now": now})


@app.get("/api/events/{slug}")
def event_item(slug: str, lang: str = ""):
    it = svc().st.get_item_by_slug("event", slug)
    if not it:
        raise HTTPException(404, "not_found")
    it = svc().loc(it, lang)
    return ok({"item": {k: v for k, v in it.items() if k != "text"}})


@app.get("/api/documents")
def documents_public(lang: str = ""):
    return ok({"items": [_light(x) for x in _pub_items("document", lang)]})


@app.get("/api/partners")
def partners_public(lang: str = ""):
    return ok({"items": [_light(x) for x in _pub_items("partner", lang)]})


@app.get("/api/links")
def links_public(lang: str = ""):
    return ok({"items": [_light(x) for x in _pub_items("link", lang)]})


# ------------------------------------------------------------------ vakansiyalar (Careers) va ko'p so'raladigan savollar
def _vacancy_card(x: dict, facs: dict) -> dict:
    today = local_now().isoformat(timespec="seconds")
    return _light(x) | {"faculty": facs.get(x.get("faculty_id") or ""), "open": not x.get("deadline") or x["deadline"] >= today}


@app.get("/api/careers")
def careers_public(lang: str = ""):
    facs = {f["id"]: {"title": f["title"], "slug": f["slug"]} for f in _pub_items("faculty", lang)}
    items = sorted(_pub_items("vacancy", lang), key=lambda x: (not x.get("featured"), x.get("sort") or 0, -(len(x.get("published_at") or ""))))
    return ok({"items": [_vacancy_card(x, facs) for x in items]})


@app.get("/api/careers/{slug}")
def career_item(slug: str, lang: str = ""):
    s = svc()
    it = s.st.get_item_by_slug("vacancy", slug)
    if not it:
        raise HTTPException(404, "not_found")
    it = s.loc(it, lang)
    facs = {f["id"]: {"title": f["title"], "slug": f["slug"]} for f in _pub_items("faculty", lang)}
    others = [_vacancy_card(x, facs) for x in _pub_items("vacancy", lang) if x["id"] != it["id"]][:3]
    return ok({"item": {k: v for k, v in it.items() if k != "text"} | {"faculty": facs.get(it.get("faculty_id") or ""), "open": _vacancy_card(it, facs)["open"]},
               "others": others})


CV_EXT = {".pdf": "application/pdf", ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


@app.post("/api/careers/{slug}/apply")
async def career_apply(request: Request, slug: str, name: str = Form(""), email: str = Form(""), phone: str = Form(""), message: str = Form(""),
                       hp: str = Form(""), cv: UploadFile | None = File(None)):
    """Vakansiyaga ariza: «Murojaatlar»da «Kadrlar bo'limi» chiptasi, rezyume fayli yopiq saqlanadi (faqat admin ko'radi)."""
    if hp:
        return ok({"ok": True})
    _rate_limit("apply:" + _ip(request), 4, 600)
    s = svc()
    vac = s.st.get_item_by_slug("vacancy", slug)
    if not vac:
        raise HTTPException(404, "not_found")
    name, email, phone, message = name.strip()[:120], email.strip()[:160], phone.strip()[:40], message.strip()[:5000]
    if len(name) < 2:
        raise HTTPException(400, "invalid_name")
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "invalid_email")
    files = []
    if cv is not None and cv.filename:
        ext = Path(cv.filename).suffix.lower()
        if ext not in CV_EXT:
            raise HTTPException(400, "bad_file_type")
        blob = await cv.read(10 * 1024 * 1024 + 1)
        if len(blob) > 10 * 1024 * 1024:
            raise HTTPException(400, "too_large")
        token = secrets.token_hex(16)
        put_blob(s.st, f"cv/{token}{ext}", blob, CV_EXT[ext], private=True)
        files.append({"name": re.sub(r"[^\w.\- ]+", "_", cv.filename)[:120], "url": f"/api/admin/desk/files/{token}{ext}", "size": len(blob)})
    t = ticket_from_application(vac, name, email, phone, message, files, _ip(request))
    return ok({"ok": True, "ticket": t["number"]})


@app.get("/api/faq")
def faq_public(lang: str = ""):
    return ok({"items": [{"id": x["id"], "q": x["title"], "a": x.get("answer") or "", "category": x.get("category") or "other"}
                         for x in sorted(_pub_items("faq", lang), key=lambda x: (x.get("sort") or 0))]})


# ------------------------------------------------------------------ statistika (tashrif)
def _visitor(request: Request) -> tuple[str | None, bool]:
    ua = request.headers.get("user-agent") or ""
    if is_bot(ua) or any(svc().st.session_user(request.cookies.get(c)) for c in (COOKIE, ADMIN_COOKIE)):
        return None, False
    vid = request.cookies.get(VID) if _stats_ok(request) else None
    if vid and re.fullmatch(r"[a-f0-9]{24}", vid):
        return vid, False
    salt = svc().st.kv_get("vid_salt")
    if not salt:
        salt = secrets.token_hex(16)
        svc().st.kv_put("vid_salt", salt)
    day = local_today().isoformat()
    return hashlib.sha256(f"{salt}|{_ip(request)}|{ua}|{day}".encode()).hexdigest()[:24], True


CONSENT = "uni_consent"  # saytdagi cookie oynasi: «v1:necessary,stats» — JS yozadi


def _stats_ok(request: Request) -> bool:
    """Statistika cookie'si (vid) faqat tashrif buyuruvchi rozilik bergan bo'lsa qo'yiladi.
    Rozilik bo'lmasa ham tashrif hisoblanadi — kunlik anonim identifikator bilan, cookie'siz."""
    return "stats" in (request.cookies.get(CONSENT) or "").split(":")[-1].split(",")


def _with_vid(resp: Response, vid: str | None, new: bool, request: Request | None = None) -> Response:
    if request is not None and not _stats_ok(request):
        if request.cookies.get(VID):
            resp.delete_cookie(VID, path="/")
        return resp
    if vid and new:
        resp.set_cookie(VID, vid, max_age=400 * 86400, httponly=True, samesite="lax", secure=COOKIE_SECURE, path="/")
    return resp


def _ref_host(ref: str, request: Request) -> str:
    try:
        h = urlparse(ref).hostname or ""
    except ValueError:
        return ""
    own = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(":")[0]
    h = h.removeprefix("www.")
    return "" if not h or h == own.removeprefix("www.") else h[:120]


PRIVATE_PREFIX = ("/admin", "/student", "/teacher", "/xodim", "/print")


@app.post("/api/t/pv")
def track_pv(request: Request, data: dict = Body(...)):
    vid, new = _visitor(request)
    if not vid:
        return ok({"ok": True, "counted": False})
    path = "/" + _s(data, "path", 300).lstrip("/")
    path = re.sub(r"[?#].*$", "", path) or "/"
    if path.startswith(PRIVATE_PREFIX):
        return ok({"ok": True, "counted": False})
    kind, item_id = None, None
    m = re.fullmatch(r"/(news|announcements|programs|faculties|structure|staff|events|about|pages)/([a-z0-9-]+)/?", path)
    if m:
        kind = "page" if m[1] in ("about", "pages") else C.KIND_OF_SECTION[m[1]]
        it = svc().st.get_item_by_slug(kind, m[2])
        item_id = it["id"] if it else None
    ua = parse_ua(request.headers.get("user-agent") or "")
    lang = (_s(data, "lang", 10) or (request.headers.get("accept-language") or "")[:2]).split("-")[0].lower()[:5]
    utm = _s(data, "utm", 60)
    res = svc().st.track_pageview(vid, path, kind, item_id, _ref_host(_s(data, "ref", 500), request), {**ua, "lang": lang, "utm": utm})
    return _with_vid(ok({"ok": True, "counted": res["counted"]}), vid, new, request)


@app.post("/api/t/ping")
def track_ping(request: Request):
    vid, _new = _visitor(request)  # cookie'siz (rozilik yo'q) ham — kunlik anonim identifikator
    if vid:
        svc().st.track_ping(vid)
    return ok({"ok": True})


@app.post("/api/t/read")
def track_read(request: Request, data: dict = Body(...)):
    vid, _new = _visitor(request)
    if not vid:
        return ok({"ok": True, "counted": False})
    it = svc().st.get_item_by_slug(_s(data, "kind", 20) if _s(data, "kind", 20) in ("news", "announce", "page") else "news", _s(data, "slug", 120))
    if not it:
        return ok({"ok": True, "counted": False})
    seconds = int(min(max(float(data.get("seconds") or 0), 0), 7200))
    depth = min(max(float(data.get("depth") or 0), 0.0), 1.0)
    min_sec = max(15, int((it.get("reading_time") or 1) * 60 * 0.3))
    return ok({"ok": True, "counted": svc().st.track_read(vid, it["id"], seconds, depth, min_sec)})


# ------------------------------------------------------------------ obuna va aloqa
@app.post("/api/subscribe")
def subscribe(request: Request, data: dict = Body(...)):
    _remember_base(request)
    if data.get("hp"):
        return ok({"status": "pending"})
    _rate_limit("sub:" + _ip(request), 6, 600)
    email = _s(data, "email", 160).lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "invalid_email")
    s = svc()
    site = s.site()
    ex = s.st.subscriber_by_email(email)
    if ex and ex["status"] == "active":
        return ok({"status": "active"})
    double = bool(site.get("double_opt_in")) and can_send(s.st)
    sub = s.st.add_subscriber(email, _s(data, "name", 80), "pending" if double else "active", _s(data, "source", 40) or "site", s.lang(_s(data, "lang", 5)))
    if double:
        s.mail.confirm(sub)
        return ok({"status": "pending"})
    s.mail.welcome(sub)
    if site.get("notify_subscribe") and site.get("contact_email"):
        s.mail.new_subscriber_notify(email, site["contact_email"])
    return ok({"status": "active"})


@app.get("/api/subscribe/confirm")
def subscribe_confirm(token: str = ""):
    s = svc()
    sub = s.st.subscriber_by_token("token", token) if token else None
    if not sub:
        return RedirectResponse("/subscribe/invalid", status_code=303)
    if sub["status"] != "active":
        s.st.set_subscriber_status(sub["id"], "active")
        s.mail.welcome(sub)
        site = s.site()
        if site.get("notify_subscribe") and site.get("contact_email"):
            s.mail.new_subscriber_notify(sub["email"], site["contact_email"])
    return RedirectResponse("/subscribe/confirmed", status_code=303)


@app.get("/api/unsubscribe")
def unsubscribe_get(token: str = ""):
    return RedirectResponse(f"/unsubscribe?token={token}", status_code=303)


@app.post("/api/unsubscribe")
async def unsubscribe_post(request: Request, token: str = ""):
    if not token:
        try:
            token = str((await request.json()).get("token") or "")
        except Exception:  # noqa: BLE001
            token = ""
    sub = svc().st.subscriber_by_token("unsub_token", token) if token else None
    if not sub:
        raise HTTPException(404, "not_found")
    svc().st.set_subscriber_status(sub["id"], "unsubscribed")
    return ok({"ok": True, "email": sub["email"]})


@app.post("/api/contact")
def contact(request: Request, data: dict = Body(...)):
    _remember_base(request)
    if data.get("hp"):
        return ok({"ok": True})
    _rate_limit("contact:" + _ip(request), 5, 600)
    name, email, body = _s(data, "name", 120), _s(data, "email", 160), str(data.get("message") or "").strip()[:5000]
    if len(name) < 2:
        raise HTTPException(400, "invalid_name")
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "invalid_email")
    if len(body) < 5:
        raise HTTPException(400, "empty_message")
    s = svc()
    # murojaat — «Murojaatlar» (service desk) da yangi chipta
    t = ticket_from_contact(name, email, _s(data, "phone", 40), _s(data, "subject", 200), body, _ip(request), _s(data, "lang", 5))
    msg = {"id": t["id"], "name": name, "email": email, "phone": _s(data, "phone", 40), "subject": f"[UNI-{t['number']}] {t['title']}", "body": body, "created": t["created"]}
    site = s.site()
    if site.get("notify_contact") and site.get("contact_email"):
        s.mail.contact_notify(msg, site["contact_email"])
    return ok({"ok": True, "ticket": t["number"]})


# ------------------------------------------------------------------ admin: statistika va kontent
@app.get("/api/admin/system")
def admin_system(a: dict = Depends(current_admin)):
    """Avtomatik sozlash holati: kutubxonalar, yuzni aniqlash, Chromium."""
    from .. import faces  # noqa: PLC0415

    return ok(bootstrap.STATUS | {"missing": bootstrap.missing_modules(), "faces": faces.available()})


@app.get("/api/admin/stats")
def admin_stats(days: int = 30, a: dict = Depends(current_admin)):
    return ok(svc().st.stats(days))


KINDS = set(C.SCHEMAS)


def _kind(kind: str) -> str:
    if kind not in KINDS:
        raise HTTPException(404, "not_found")
    return kind


@app.get("/api/admin/items/{kind}")
def admin_items(kind: str, a: dict = Depends(current_admin)):
    st = svc().st
    items = st.list_items(_kind(kind))
    counters = st.counters_by_item([x["id"] for x in items])
    base = svc().base_lang()
    heavy = _kind(kind) in C.RICH_KINDS
    return ok({"items": [_light(x) | counters.get(x["id"], {"views": 0, "reads": 0}) | {"send_newsletter": x.get("send_newsletter"), "newsletter_sent": x.get("newsletter_sent"),
                                                                                        "langs": C.item_langs(x, base)} | ({} if heavy else {"i18n": x.get("i18n") or {}})
                         for x in items]})


@app.get("/api/admin/items/{kind}/{iid}")
def admin_item(kind: str, iid: str, a: dict = Depends(current_admin)):
    it = svc().st.get_item(iid)
    if not it or it["kind"] != _kind(kind):
        raise HTTPException(404, "not_found")
    return ok(it | svc().st.item_counters(iid))


_save = save_item


def _after_save(request: Request, it: dict) -> dict:
    on_item_saved(it)  # Telegram guruh/kanallari: nashr qilingan bo'lsa — fon oqimida
    section = C.SECTION_OF.get(it["kind"])
    if section and it.get("slug") and svc().st.get_item_by_slug(it["kind"], it["slug"]):
        _prewarm_og(request, [(section, it)])
        sec = "about" if it["kind"] == "page" else section
        seo.indexnow(svc(), [f"/{sec}/{it['slug']}"] + ([f"/{sec}"] if it["kind"] in ("news", "announce", "event", "vacancy") else []))
    return it


@app.post("/api/admin/items/{kind}")
def admin_item_create(request: Request, kind: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    return ok(_after_save(request, _save(_kind(kind), data, None)))


@app.put("/api/admin/items/{kind}/{iid}")
def admin_item_update(request: Request, kind: str, iid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    return ok(_after_save(request, _save(_kind(kind), data, iid)))


@app.post("/api/admin/items/{kind}/{iid}/duplicate")
def admin_item_duplicate(kind: str, iid: str, a: dict = Depends(current_admin)):
    it = svc().st.get_item(iid)
    if not it or it["kind"] != _kind(kind):
        raise HTTPException(404, "not_found")
    data = {k: v for k, v in it.items() if k not in ("id", "created", "updated", "newsletter_sent")}
    data.update(title=f"{it['title']} (nusxa)", status="draft", slug=f"{it.get('slug') or ''}-nusxa" if it.get("slug") else None, published_at=None, featured=False)
    return ok(_save(kind, data, None))


@app.delete("/api/admin/items/{kind}/{iid}")
def admin_item_delete(kind: str, iid: str, a: dict = Depends(current_admin)):
    it = svc().st.get_item(iid)
    if not it or it["kind"] != _kind(kind):
        raise HTTPException(404, "not_found")
    svc().st.delete_item(iid)
    return ok({"ok": True})


@app.post("/api/admin/items/{kind}/reorder")
def admin_reorder(kind: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    ids = [str(x) for x in (data.get("ids") or [])][:1000]
    svc().st.reorder(_kind(kind), ids)
    return ok({"ok": True})


NEWSLETTER_KINDS = ("news", "announce", "event")


@app.post("/api/admin/posts/{iid}/send")
def admin_send_post(request: Request, iid: str, data: dict = Body(default={}), a: dict = Depends(current_admin)):
    _remember_base(request)
    s = svc()
    it = s.st.get_item(iid)
    if not it or it["kind"] not in NEWSLETTER_KINDS:
        raise HTTPException(404, "not_found")
    if not can_send(s.st):
        raise HTTPException(400, "smtp_not_configured")
    test = _s(data or {}, "test_email", 160)
    if test:
        if not EMAIL_RE.match(test):
            raise HTTPException(400, "invalid_email")
        from ..mailer import send

        try:
            send(s.smtp(), test, f"[Test] {it['title']}", s.mail.post_html(it))
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"smtp_error:{type(e).__name__}: {e}") from e
        return ok({"ok": True, "test": True})
    if not s.st.get_item_by_slug(it["kind"], it.get("slug") or ""):
        raise HTTPException(400, "not_published")
    nid = s.send_newsletter(it)
    return ok({"ok": True, "newsletter": nid, "recipients": len(s.st.list_subscribers("active"))})


@app.get("/api/admin/posts/{iid}/email-preview")
def admin_email_preview(iid: str, a: dict = Depends(current_admin)):
    it = svc().st.get_item(iid)
    if not it or it["kind"] not in NEWSLETTER_KINDS:
        raise HTTPException(404, "not_found")
    return HTMLResponse(svc().mail.post_html(it))


@app.get("/api/admin/newsletters")
def admin_newsletters(a: dict = Depends(current_admin)):
    return ok({"items": svc().st.list_newsletters()})


# ------------------------------------------------------------------ admin: institut profili va sayt sozlamalari
@app.get("/api/admin/uni")
def admin_uni(a: dict = Depends(current_admin)):
    return ok(svc().uni())


@app.put("/api/admin/uni")
def admin_uni_put(request: Request, data: dict = Body(...), a: dict = Depends(current_admin)):
    s = svc()
    try:
        p = C.clean_uni(data, s.uni())
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    old_logo = s.uni().get("logo")
    s.st.kv_put("uni", p)
    if p.get("logo") and p.get("logo") != old_logo:
        _palette_from_logo(p["logo"])
    _prewarm_og(request, [(None, None)])
    return ok(s.uni())


def _palette_from_logo(url: str) -> None:
    """Yangi logotip yuklanganda uning asosiy ranglari sayt palitrasiga aylanadi (Sayt sozlamalari → «Ranglarni logotipdan olish» yoqilgan bo'lsa)."""
    s = svc()
    site = s.site()
    if not site.get("palette_auto", True) or not url.startswith("/media/"):
        return
    raw = get_blob(s.st, url.rsplit("/", 1)[-1])
    if not raw:
        return
    pal = palette_from_image(raw)
    if pal:
        stored = dict(s.st.kv_get("site", {}) or {})
        stored["accent"] = pal["accent"]
        if pal.get("accent2"):
            stored["accent2"] = pal["accent2"]
        s.st.kv_put("site", stored)


@app.get("/api/admin/site")
def admin_site(a: dict = Depends(current_staff)):
    return ok(svc().site())


@app.put("/api/admin/site")
def admin_site_put(request: Request, data: dict = Body(...), a: dict = Depends(current_admin)):
    s = svc()
    s.st.kv_put("site", C.clean_site(data, s.site()))
    _prewarm_og(request, [(None, None)])
    return ok(s.site())


def _smtp_public(sm: dict) -> dict:
    # «configured» — xat yuborish mumkinmi: alohida SMTP yoki universitetning o'z pochta serveri orqali
    return {k: v for k, v in sm.items() if k != "password"} | {"has_password": bool(sm.get("password")), "configured": configured(sm) or can_send(svc().st),
                                                               "smtp_configured": configured(sm)}


@app.get("/api/admin/smtp")
def admin_smtp(a: dict = Depends(current_admin)):
    return ok(_smtp_public(svc().smtp()))


@app.put("/api/admin/smtp")
def admin_smtp_put(data: dict = Body(...), a: dict = Depends(current_admin)):
    s = svc()
    sm = C.clean_smtp(data, s.smtp())
    if sm.get("from_email") and not EMAIL_RE.match(sm["from_email"]):
        raise HTTPException(400, "invalid_email")
    s.st.kv_put("smtp", sm)
    return ok(_smtp_public(sm))


@app.post("/api/admin/smtp/test")
def admin_smtp_test(request: Request, data: dict = Body(...), a: dict = Depends(current_admin)):
    _remember_base(request)
    to = _s(data, "to", 160)
    if not EMAIL_RE.match(to):
        raise HTTPException(400, "invalid_email")
    good, err = svc().mail.test(to)
    return ok({"ok": good, "error": err})


@app.get("/api/admin/email-log")
def admin_email_log(a: dict = Depends(current_admin)):
    return ok({"items": svc().st.list_email_log(200)})


# ------------------------------------------------------------------ admin: obunachilar va xabarlar
@app.get("/api/admin/subscribers")
def admin_subs(a: dict = Depends(current_admin)):
    items = svc().st.list_subscribers()
    for x in items:
        x.pop("token", None)
        x.pop("unsub_token", None)
    return ok({"items": items})


@app.post("/api/admin/subscribers")
def admin_subs_add(data: dict = Body(...), a: dict = Depends(current_admin)):
    emails = [e.strip().lower() for e in re.split(r"[\s,;]+", str(data.get("emails") or data.get("email") or "")) if e.strip()]
    added, bad = 0, []
    for e in emails[:1000]:
        if EMAIL_RE.match(e):
            svc().st.add_subscriber(e, _s(data, "name", 80), "active", "admin")
            added += 1
        else:
            bad.append(e)
    return ok({"added": added, "invalid": bad})


@app.put("/api/admin/subscribers/{sid}")
def admin_subs_status(sid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    st = data.get("status")
    if st not in ("active", "unsubscribed", "pending"):
        raise HTTPException(400, "invalid")
    svc().st.set_subscriber_status(sid, st)
    return ok({"ok": True})


@app.post("/api/admin/subscribers/{sid}/resend")
def admin_subs_resend(request: Request, sid: str, a: dict = Depends(current_admin)):
    _remember_base(request)
    sub = next((x for x in svc().st.list_subscribers() if x["id"] == sid), None)
    if not sub:
        raise HTTPException(404, "not_found")
    if not can_send(svc().st):
        raise HTTPException(400, "smtp_not_configured")
    svc().mail.confirm(sub)
    return ok({"ok": True})


@app.delete("/api/admin/subscribers/{sid}")
def admin_subs_delete(sid: str, a: dict = Depends(current_admin)):
    svc().st.delete_subscriber(sid)
    return ok({"ok": True})


@app.get("/api/admin/subscribers.csv")
def admin_subs_csv(a: dict = Depends(current_admin)):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["email", "name", "status", "created", "confirmed", "unsubscribed", "source"])
    for x in svc().st.list_subscribers():
        w.writerow([x["email"], x.get("name") or "", x["status"], x["created"], x.get("confirmed") or "", x.get("unsubscribed") or "", x.get("source") or ""])
    return Response(buf.getvalue().encode("utf-8-sig"), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="obunachilar.csv"'})


@app.get("/api/admin/messages")
def admin_messages(a: dict = Depends(current_admin)):
    return ok({"items": svc().st.list_messages()})


@app.put("/api/admin/messages/{mid}")
def admin_message_mark(mid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    svc().st.mark_message(mid, bool(data.get("read", True)))
    return ok({"ok": True})


@app.delete("/api/admin/messages/{mid}")
def admin_message_delete(mid: str, a: dict = Depends(current_admin)):
    svc().st.delete_message(mid)
    return ok({"ok": True})


# ------------------------------------------------------------------ media
def _store_media(raw: bytes, filename: str, allow_video: bool = False) -> dict:
    try:
        return store_media(svc().st, raw, filename, allow_video)
    except MediaError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/admin/media")
async def media_upload(file: UploadFile = File(...), a: dict = Depends(current_user)):
    if a["role"] == "student":
        raise HTTPException(403, "forbidden")
    return ok(_store_media(await file.read(), file.filename or "", allow_video=a["role"] == "admin"))


@app.post("/api/portal/upload")
async def portal_upload(file: UploadFile = File(...), u: dict = Depends(current_user)):
    """Kabinet: topshiriq fayllari (talaba) va materiallar (o'qituvchi). 15 MB gacha."""
    return ok(_store_media(await file.read(), file.filename or ""))


@app.post("/api/admin/media/from-url")
def media_from_url(data: dict = Body(...), a: dict = Depends(current_admin)):
    """Rasm/PDF ni tashqi URL dan yuklab olib media kutubxonaga saqlash (muharrirga nusxalangan rasmlar ham shu yerda
    o'z serverimizga ko'chiriladi — manba o'chsa ham sahifada buzilmaydi). Ichki tarmoq manzillari rad etiladi."""
    rate_limit(f"mfu:{a['id']}", 120, 600)
    try:
        raw, name = safe_fetch(_s(data, "url", 2000))
    except FetchError as e:
        raise HTTPException(400, str(e)) from e
    return ok(_store_media(raw, name))


@app.get("/api/admin/media")
def media_list(a: dict = Depends(current_staff)):
    return ok({"items": [m | {"url": f"/media/{m['filename']}"} for m in svc().st.list_media()]})


@app.delete("/api/admin/media/{mid}")
def media_delete(mid: str, a: dict = Depends(current_admin)):
    svc().st.delete_media(mid)
    return ok({"ok": True})


@app.get("/media/{name}")
def media_get(name: str):
    if not re.fullmatch(r"[a-f0-9]{16}\.(png|jpg|webp|gif|pdf|docx|xlsx|pptx|mp4|webm)", name):
        raise HTTPException(404, "not_found")
    p = svc().st.media_dir / name
    if not p.exists():
        # S3 da saqlangan fayl: ochiq manzil yoki qisqa muddatli imzolangan havolaga yo'naltirish
        url = blob_url(svc().st, name) if svc().st.get_media(name.split(".")[0]) else None
        if not url:
            raise HTTPException(404, "not_found")
        return RedirectResponse(url, status_code=302, headers={"Cache-Control": "public, max-age=600"})
    m = svc().st.get_media(name.split(".")[0]) or {}
    headers = {"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"}
    if not name.endswith((".png", ".jpg", ".webp", ".gif", ".mp4", ".webm")) and m.get("original"):
        safe = re.sub(r"[^\w.\- ]+", "_", m["original"])[:100]
        headers["Content-Disposition"] = f'{"inline" if name.endswith(".pdf") else "attachment"}; filename="{safe}"'
    return FileResponse(p, media_type=m.get("mime"), headers=headers)


# ------------------------------------------------------------------ zaxira nusxa
@app.get("/api/admin/export")
def admin_export(a: dict = Depends(current_admin)):
    s = svc()
    st = s.st
    data = {
        "version": VERSION, "uni": s.uni(), "site": s.site(),
        "items": {k: st.list_items(k) for k in C.SCHEMAS}, "subscribers": [{k: v for k, v in x.items() if k not in ("token",)} for x in st.list_subscribers()],
        "media": st.list_media(), "users": [public_user(u) for u in st.list_users()],
        "academic": {t: st.acad_list(t) for t in ("semesters", "time_slots", "groups", "subjects", "rooms")} | {"lessons": st.lessons()},
    }
    return Response(json.dumps(data, ensure_ascii=False, indent=1, default=str).encode(), media_type="application/json", headers={"Content-Disposition": 'attachment; filename="site-backup.json"'})


# ------------------------------------------------------------------ PDF va ijtimoiy tarmoq kartalari (og:image)
PRINT_SECTIONS = C.KIND_OF_SECTION
PRINT_UNI_KEYS = ("name", "short_name", "abbr", "tagline", "logo", "address", "email", "phones", "keywords", "founded")


def _internal_base(request: Request) -> str:
    env = os.environ.get("SITE_INTERNAL_URL")
    if env:
        base = env.rstrip("/")
    else:
        srv = request.scope.get("server")
        base = f"http://127.0.0.1:{srv[1] if srv and srv[1] else 8000}"
    svc().internal_base = base
    return base


def _stamp() -> None:
    _index_html()
    c = _index_cache.get("i")
    svc().static_stamp = str(c[0]) if c else ""


def _qr_svg(url: str) -> str:
    import segno

    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="svg", border=0, dark="#161512", xmldecl=False, svgns=True, omitsize=True, nl=False)
    return buf.getvalue().decode("utf-8")


def _print_item(section: str, slug: str) -> tuple[str, dict]:
    kind = PRINT_SECTIONS.get(section)
    it = svc().st.get_item_by_slug(kind, slug) if kind else None
    if not it:
        raise HTTPException(404, "not_found")
    return kind, it


def _lq(lang: str) -> str:
    return "" if lang == svc().base_lang() else f"?lang={lang}"


def _print_ctx(section: str | None, it: dict | None, lang: str = "") -> dict:
    s = svc()
    lang = s.lang(lang)
    u, site = s.uni_l(lang), s.site_l(lang)
    base = s.base_url()
    loc = s.loc(it, lang) if it else None
    url = (f"{base}/{section}/{it['slug']}" if it else f"{base}/") + _lq(lang)
    return {
        "section": section, "url": url, "base": base, "host": urlparse(base).netloc or base, "lang": lang,
        "qr": _qr_svg(url),
        "item": {k: v for k, v in loc.items() if k not in ("text", "send_newsletter", "newsletter_sent", "tg_live")} if loc else None,
        "uni": {k: u.get(k) for k in PRINT_UNI_KEYS},
        "site": {"title": site.get("title") or u.get("abbr") or "UNI", "accent": site.get("accent") or "#1E4FA3", "lang": lang,
                 "logo_text": site.get("logo_text") or u.get("abbr") or "UNI", "description": site.get("description") or u.get("tagline") or ""},
        "counts": {k: v["published"] for k, v in s.st.count_items().items()},
        "generated": local_now().isoformat(timespec="minutes"),
    }


@app.get("/api/print/site")
def print_site(lang: str = ""):
    return ok(_print_ctx(None, None, lang))


@app.get("/api/print/{section}/{slug}")
def print_item(section: str, slug: str, lang: str = ""):
    _, it = _print_item(section, slug)
    return ok(_print_ctx(section, it, lang))


def _og_bytes(base: str, section: str | None, it: dict | None, lang: str) -> bytes:
    s = svc()
    prefix = f"{it['kind']}-{it['id']}.{lang}" if it else f"site.{lang}"
    path = f"/print/og/{section}/{it['slug']}" if it else "/print/og"
    return s.render.cached("og", prefix, s.doc_version(it, lang), "png", lambda: s.render.png(f"{base}{path}?lang={lang}"))


def _prewarm_og(request: Request, targets: list[tuple[str | None, dict | None]]) -> None:
    s = svc()
    if not s.render.available() or os.environ.get("SITE_PREWARM", "1") == "0":
        return
    base = _internal_base(request)
    _stamp()
    base_lang = s.base_lang()
    jobs = [(section, it, lang) for section, it in targets for lang in (C.item_langs(it, base_lang) if it else C.LANGS)]

    def run():
        for section, it, lang in jobs:
            try:
                _og_bytes(base, section, it, lang)
            except Exception as e:  # noqa: BLE001
                print(f"og prewarm: {e}", flush=True)

    threading.Thread(target=run, daemon=True).start()


@app.get("/api/pdf/{section}/{slug}")
def pdf_download(request: Request, section: str, slug: str, lang: str = ""):
    kind, it = _print_item(section, slug)
    _remember_base(request)
    s = svc()
    _stamp()
    lang = s.loc(it, lang)["lang"]
    key = s.doc_version(it, lang)
    prefix = f"{kind}-{it['id']}.{lang}"
    if not s.render.is_cached("pdf", prefix, key, "pdf"):
        _rate_limit("render:" + _ip(request), 12, 600)
    base = _internal_base(request)
    try:
        data = s.render.cached("pdf", prefix, key, "pdf", lambda: s.render.pdf(f"{base}/print/{section}/{slug}?lang={lang}"))
    except RenderError as e:
        print(f"pdf: {e}", flush=True)
        raise HTTPException(503, "pdf_unavailable") from e
    fname = it["slug"] + ("" if lang == s.base_lang() else f"-{lang}") + ".pdf"
    return Response(data, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{fname}"', "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff",
    })


def _og_response(request: Request, section: str | None, it: dict | None, lang: str) -> Response:
    _stamp()
    s = svc()
    lang = s.loc(it, lang)["lang"] if it else s.lang(lang)
    try:
        data = _og_bytes(_internal_base(request), section, it, lang)
    except RenderError as e:
        print(f"og: {e}", flush=True)
        fallback = (it or {}).get("feature_image") or (it or {}).get("cover") or (it or {}).get("photo") or s.site().get("og_image") or s.uni().get("logo")
        if fallback and C.safe_url(fallback):
            return RedirectResponse(fallback, status_code=302)
        raise HTTPException(404, "not_found") from e
    return Response(data, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/og/site.png")
def og_site(request: Request, lang: str = ""):
    return _og_response(request, None, None, lang)


@app.get("/og/{section}/{name}")
def og_item(request: Request, section: str, name: str, lang: str = ""):
    if not name.endswith(".png"):
        raise HTTPException(404, "not_found")
    _, it = _print_item(section, name[:-4])
    return _og_response(request, section, it, lang)


@app.get("/rss.xml")
def rss(request: Request, lang: str = ""):
    _remember_base(request)
    return Response(seo.rss(svc(), lang), media_type="application/rss+xml; charset=utf-8")


@app.get("/sitemap.xml")
def sitemap(request: Request):
    _remember_base(request)
    return Response(seo.sitemap(svc()), media_type="application/xml; charset=utf-8")


@app.get("/indexnow.txt")
def indexnow_key():
    """IndexNow (Bing, Yandex, Naver, Seznam…): sayt egaligini tasdiqlovchi kalit."""
    return Response(seo.indexnow_key(svc()), media_type="text/plain; charset=utf-8")


@app.get("/robots.txt")
def robots(request: Request):
    _remember_base(request)
    return Response(seo.robots(svc()), media_type="text/plain; charset=utf-8")


# ------------------------------------------------------------------ frontend (SPA + meta teglar)
STATIC_DIR = Path(os.environ.get("SITE_STATIC_DIR", Path(__file__).resolve().parents[3] / "frontend" / "dist")).resolve()
_index_cache: dict[str, tuple[float, str]] = {}


def _index_html() -> str | None:
    p = STATIC_DIR / "index.html"
    if not p.exists():
        return None
    mt = p.stat().st_mtime
    c = _index_cache.get("i")
    if not c or c[0] != mt:
        _index_cache["i"] = (mt, p.read_text(encoding="utf-8"))
    return _index_cache["i"][1]


def _journal_preview(request: Request, path: str) -> bool:
    """Ilmiy jurnal: «journal» ruxsatli admin yashirin/qoralama sahifalarni ko'rib chiqadi (api/journal.py)."""
    if not (path == "/journal" or path.startswith("/journal/")):
        return False
    from .journal import preview_allowed  # noqa: PLC0415

    return preview_allowed(request)


@app.get("/api/meta")
def page_meta_api(request: Request, path: str = "/", lang: str = ""):
    """SPA ichida sahifa almashganda: brauzer sarlavhasi, tavsif va canonical (server bergan meta bilan bir xil)."""
    path = "/" + path.lstrip("/")[:300]
    meta, status = seo.page_meta(svc(), path, svc().lang(lang), preview=_journal_preview(request, path))
    return ok({"title": meta["title"], "description": meta["description"], "url": meta["url"], "noindex": bool(meta.get("noindex")), "status": status,
               "image": meta.get("image") or "", "alternates": (meta.get("alternates") or []) + ([("x-default", meta.get("x_default"))] if len(meta.get("alternates") or []) > 1 else [])})


@app.get("/{path:path}")
def spa(request: Request, path: str):
    if path.startswith("api/"):
        raise HTTPException(404, "not_found")
    f = (STATIC_DIR / path).resolve()
    if path and f.is_file() and f.is_relative_to(STATIC_DIR):
        headers = {"Cache-Control": "public, max-age=31536000, immutable"} if path.startswith("assets/") else {}
        return (path.startswith("assets/") and gzipped(f, request, headers)) or FileResponse(f, headers=headers)
    html = _index_html()
    if html is None:
        raise HTTPException(404, "frontend_not_built")
    if not path.startswith("print/"):
        _remember_base(request)
    _stamp()
    lang = svc().lang(request.query_params.get("lang") or request.cookies.get("lang"))
    if path.startswith("journal/article/"):  # ilmiy jurnal: noto'g'ri slug → kanonik manzil (bitta maqola — bitta URL)
        from .. import journal as _J  # noqa: PLC0415

        target = _J.redirect_for(svc(), "/" + path)
        if target:
            return RedirectResponse(target + (f"?{request.url.query}" if request.url.query else ""), status_code=301)
    elif path.startswith("journal/"):  # ilmiy jurnal: eski bo'lim sahifalari → /journal/about#…, /journal/search → /journal/archive
        from .. import journal as _J  # noqa: PLC0415

        target = _J.legacy_redirect("/" + path, request.url.query)
        if target:
            return RedirectResponse(target, status_code=301)
    meta, status = seo.page_meta(svc(), "/" + path, lang, preview=_journal_preview(request, "/" + path))
    if path.rstrip("/") == "docs/view":  # ONLYOFFICE ko'ruvchisi — xizmat sahifasi (qidiruvga kiritilmaydi)
        status, meta = 200, meta | {"noindex": True}
    return HTMLResponse(seo.inject(html, meta), status_code=status, headers={"Cache-Control": "no-cache"})


# eksport (testlar va boshqa modullar uchun)
ROLES = ROLES
date = date
