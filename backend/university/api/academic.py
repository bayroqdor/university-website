"""O'quv jarayoni API: admin/o'quv bo'limi (dars jadvali), o'qituvchi kabineti, talaba kabineti. Dars jadvali faqat tizimga kirganlarga."""
from __future__ import annotations

import re
import secrets
from datetime import date, timedelta

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, Response, UploadFile

from .. import mail as M
from .. import xlsx_users as XU
from ..academic import ATT_STATUS, TABLES, WEEKDAYS
from ..storage import PORTAL_ROLES, ROLES, verify_password
from .mail import on_user_deleted, on_user_saved
from .deps import save_item
from .deps import current_staff, current_student, current_teacher, current_user, ip_of, ok, public_user, rate_limit, s_, svc

router = APIRouter()
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
LOGIN_RE = re.compile(r"[a-z0-9._@-]{3,60}")


def _semester(sem_id: str | None = None) -> dict:
    st = svc().st
    sem = st.acad_get("semesters", sem_id) if sem_id else st.current_semester()
    if not sem:
        raise HTTPException(404, "no_semester")
    return sem


def _week(v: str | None) -> date:
    try:
        d = date.fromisoformat((v or "")[:10]) if v else date.today()
    except ValueError:
        d = date.today()
    return d - timedelta(days=d.weekday())


def _group_of(u: dict) -> dict | None:
    return svc().st.acad_get("groups", u["group_id"]) if u.get("group_id") else None


# ================================================================== foydalanuvchilar: professor-o'qituvchilar, xodimlar, talabalar
# Admin panel hisoblari bu yerda emas — «Administratorlar» bo'limida (main.py: /api/admin/admins).
DEFAULT_SECTIONS = [{"id": "study", "name": "O‘quv bo‘limi"}]
PROF_CATEGORIES = ("leadership", "professor", "teacher", "visiting")
PROFILE_BASE = ("position", "department_id", "faculty_id", "photo", "status", "featured", "sort", "hours")
PROFILE_PROF = ("category", "degree", "bio", "education", "experience", "interests", "spoken", "subjects", "publications", "links")
PROF_ONLY_EMPTY = {"degree": "", "bio": "", "education": "", "experience": "", "interests": [], "subjects": [], "publications": "", "spoken": [], "links": []}


def _can_manage(actor: dict, role: str) -> None:
    if role not in PORTAL_ROLES:
        raise HTTPException(400, "invalid_role")  # admin hisoblari — «Administratorlar» bo'limida


def sections(st) -> list[dict]:
    v = st.kv_get("user_sections")
    return v if isinstance(v, list) and v else [dict(x) for x in DEFAULT_SECTIONS]


@router.get("/api/admin/sections")
def sections_get(a: dict = Depends(current_staff)):
    st = svc().st
    counts: dict[str, int] = {}
    for u in st.list_users():
        for sid in (u.get("data") or {}).get("sections") or []:
            counts[sid] = counts.get(sid, 0) + 1
    return ok({"items": [x | {"users": counts.get(x["id"], 0)} for x in sections(st)]})


@router.put("/api/admin/sections")
def sections_put(data: dict = Body(...), a: dict = Depends(current_staff)):
    st = svc().st
    out, seen = [], set()
    for x in data.get("items") or []:
        if not isinstance(x, dict):
            continue
        name = str(x.get("name") or "").strip()[:80]
        sid = str(x.get("id") or "").strip()[:40] or "s" + secrets.token_hex(4)
        if not name or sid in seen or not re.fullmatch(r"[a-z0-9_-]{1,40}", sid):
            continue
        seen.add(sid)
        out.append({"id": sid, "name": name})
    st.kv_put("user_sections", out)
    return sections_get(a)


def _list_out(st, items: list[dict]) -> list[dict]:
    groups = {g["id"]: g["name"] for g in st.acad_list("groups")}
    secs = {x["id"]: x["name"] for x in sections(st)}
    profs = st.get_items((u.get("data") or {}).get("staff_id") for u in items)
    out = []
    for u in items:
        d = u.get("data") or {}
        prof = profs.get(d.get("staff_id") or "")
        out.append(public_user(u) | {
            "group_name": groups.get(u.get("group_id") or ""),
            "section_names": [secs[x] for x in d.get("sections") or [] if x in secs],
            "photo": (prof or {}).get("photo") or d.get("photo") or "",
            "profile": {"id": prof["id"], "status": prof["status"], "category": prof.get("category"), "slug": prof.get("slug"), "featured": prof.get("featured")} if prof else None,
        })
    return out


@router.get("/api/admin/users")
def users_list(role: str = "", group: str = "", q: str = "", section: str = "", a: dict = Depends(current_staff)):
    st = svc().st
    items = [u for u in st.list_users(role or None, group or None, q[:80]) if u["role"] in PORTAL_ROLES]
    if section:
        items = [u for u in items if section in ((u.get("data") or {}).get("sections") or [])]
    return ok({"items": _list_out(st, items), "me": a["id"], "sections": sections(st)})


def _user_payload(data: dict) -> dict:
    out = {}
    if "login" in data:
        login = s_(data, "login", 60).lower()
        if not LOGIN_RE.fullmatch(login):
            raise HTTPException(400, "invalid_login")
        out["login"] = login
    if "name" in data:
        out["name"] = s_(data, "name", 160)
    if "email" in data:
        email = s_(data, "email", 160)
        if email and not EMAIL_RE.match(email):
            raise HTTPException(400, "invalid_email")
        out["email"] = email
    if "group_id" in data:
        out["group_id"] = s_(data, "group_id", 40) or None
    if "active" in data:
        out["active"] = bool(data["active"])
    if isinstance(data.get("data"), dict):
        d = data["data"]
        out["data"] = {k: str(v)[:300] for k, v in d.items() if k in ("phone", "position", "department", "student_no", "photo", "birth", "address", "note")}
        if isinstance(d.get("faculty_ids"), list):  # o'qituvchi biriktirilgan fakultetlar
            out["data"]["faculty_ids"] = [str(x)[:40] for x in d["faculty_ids"][:10] if x]
        if isinstance(d.get("sections"), list):  # bo'limlar (o'quv bo'limi va boshqalar) — bir kishi bir nechtasida bo'lishi mumkin
            valid = {x["id"] for x in sections(svc().st)}
            out["data"]["sections"] = [str(x) for x in d["sections"][:20] if str(x) in valid]
    return out


def _sync_profile(st, u: dict, prof: dict | None) -> dict | None:
    """Xodim (professor-o'qituvchi yoki boshqa xodim) — saytdagi profili (staff yozuvi) bilan bog'langan.
    Professor uchun ilmiy daraja, biografiya, ilmiy ishlar va h.k.; oddiy xodimda bu maydonlar bo'lmaydi."""
    d = u.get("data") or {}
    sid = d.get("staff_id")
    cur = st.get_item(sid) if sid else None
    if cur and cur["kind"] != "staff":
        cur = None
    if not cur and prof and prof.get("staff_id"):  # mavjud (hisobsiz) profilni bog'lash
        ex = st.get_item(str(prof["staff_id"]))
        if ex and ex["kind"] == "staff" and not ex.get("user_id"):
            cur = ex
    if u["role"] not in ("teacher", "staff"):
        if cur:
            save_item("staff", {"status": "draft", "user_id": ""}, cur["id"])
            st.update_user(u["id"], data={"staff_id": ""})
        return None
    prof = prof or {}
    body: dict = {"title": u["name"], "user_id": u["id"], "email": u.get("email") or (cur or {}).get("email") or "", "phone": d.get("phone") or (cur or {}).get("phone") or ""}
    for k in PROFILE_BASE:
        if k in prof:
            body[k] = prof[k]
    if "position" not in prof and d.get("position"):
        body["position"] = d["position"]
    if u["role"] == "teacher":
        for k in PROFILE_PROF:
            if k in prof:
                body[k] = prof[k]
        cat = body.get("category") or (cur or {}).get("category")
        body["category"] = cat if cat in PROF_CATEGORIES else "teacher"
    else:
        body.update(PROF_ONLY_EMPTY, category="staff")
    if "i18n" in prof and isinstance(prof["i18n"], dict):
        body["i18n"] = prof["i18n"]
    if not cur:
        body.setdefault("status", "published" if u["role"] == "teacher" else "draft")
    item = save_item("staff", body, cur["id"] if cur else None)
    upd: dict = {}
    if sid != item["id"]:
        upd["staff_id"] = item["id"]
    if item.get("position") != d.get("position"):
        upd["position"] = item.get("position") or ""
    dep = st.get_item(item["department_id"]) if item.get("department_id") else None
    if dep and dep.get("title") != d.get("department"):
        upd["department"] = dep["title"]
    if item.get("photo") and item.get("photo") != d.get("photo"):
        upd["photo"] = item["photo"]
    if upd:
        st.update_user(u["id"], data=upd)
    return item


def teacher_faculties(u: dict) -> list[str]:
    """O'qituvchi ko'radigan fakultetlar: admin biriktirganlari + dars o'tadigan guruhlarining fakultetlari."""
    st = svc().st
    ids = list((u.get("data") or {}).get("faculty_ids") or [])
    groups = {g["id"]: g for g in st.acad_list("groups")}
    for l in st.lessons(teacher_id=u["id"]):
        f = (groups.get(l["group_id"]) or {}).get("faculty_id")
        if f and f not in ids:
            ids.append(f)
    return ids


@router.get("/api/admin/users/suggest")
def users_suggest(name: str = "", a: dict = Depends(current_staff)):
    """Ism-familiya kiritilganda: bo'sh login va universitet pochtasi manzili (login@domen) takliflari."""
    from .. import names as N  # noqa: PLC0415

    st = svc().st
    cfg = M.config(st)
    domain = cfg.get("domain") or ""
    items = [{"login": x, "email": M.mail_address({"login": x}, domain) if domain else ""}
             for x in N.suggest(name[:120], lambda lg: bool(st.find_user(lg)))]
    return ok({"items": items, "domain": domain, "mail_ready": M.ready(cfg)})


@router.get("/api/admin/users/login-free")
def users_login_free(login: str = "", exclude: str = "", a: dict = Depends(current_staff)):
    ex = svc().st.find_user(login.strip().lower()) if login.strip() else None
    return ok({"free": not ex or ex["id"] == exclude})


@router.post("/api/admin/users")
def users_add(data: dict = Body(...), a: dict = Depends(current_staff)):
    st = svc().st
    role = s_(data, "role", 20) or "student"
    _can_manage(a, role)
    p = _user_payload(data)
    if not p.get("login"):
        raise HTTPException(400, "invalid_login")
    if st.find_user(p["login"]):
        raise HTTPException(409, "login_taken")
    pw = str(data.get("password") or "")
    if len(pw) < 8:
        raise HTTPException(400, "weak_password")
    u = st.create_user(p["login"], p.get("name") or p["login"], pw, role=role, email=p.get("email", ""), group_id=p.get("group_id") if role == "student" else None, data=p.get("data"))
    if role in ("teacher", "staff"):
        _sync_profile(st, u, data.get("profile") if isinstance(data.get("profile"), dict) else {})
    on_user_saved(st.get_user(u["id"]), pw)
    return ok(_list_out(st, [st.get_user(u["id"])])[0])


@router.put("/api/admin/users/{uid}")
def users_update(uid: str, data: dict = Body(...), a: dict = Depends(current_staff)):
    st = svc().st
    u = st.get_user(uid)
    if not u:
        raise HTTPException(404, "not_found")
    _can_manage(a, u["role"])
    p = _user_payload(data)
    if "role" in data:
        _can_manage(a, data["role"])
        p["role"] = data["role"]
        if data["role"] != "student":
            p["group_id"] = None
    if p.get("login") and p["login"] != u["login"]:
        ex = st.find_user(p["login"])
        if ex and ex["id"] != uid:
            raise HTTPException(409, "login_taken")
    if data.get("password"):
        if len(str(data["password"])) < 8:
            raise HTTPException(400, "weak_password")
        p["password"] = str(data["password"])
    nu = st.update_user(uid, **p)
    if nu["role"] in ("teacher", "staff") or (u.get("data") or {}).get("staff_id"):
        if isinstance(data.get("profile"), dict) or {"name", "email", "role"} & set(p) or "data" in p:
            _sync_profile(st, nu, data.get("profile") if isinstance(data.get("profile"), dict) else None)
    nu = st.get_user(uid)
    if p.get("password") or (p.get("login") and p["login"] != u["login"]) or p.get("active") or "name" in p:
        on_user_saved(nu, p.get("password"), u["login"])
    return ok(_list_out(st, [nu])[0])


@router.delete("/api/admin/users/{uid}")
def users_delete(uid: str, a: dict = Depends(current_staff)):
    st = svc().st
    u = st.get_user(uid)
    if not u:
        raise HTTPException(404, "not_found")
    if uid == a["id"]:
        raise HTTPException(400, "cannot_delete_self")
    _can_manage(a, u["role"])
    sid = (u.get("data") or {}).get("staff_id")
    if sid and st.get_item(sid):  # saytdagi profil yashiriladi (surat va ma'lumotlar saqlanadi, «Professorlar» bo'limida o'chirish mumkin)
        save_item("staff", {"status": "draft", "user_id": ""}, sid)
    st.delete_user(uid)
    on_user_deleted(u)
    from .library import remove_user_files  # noqa: PLC0415

    remove_user_files(uid)  # kutubxona tarixi anonimlashtiriladi
    from .community import comm  # noqa: PLC0415

    comm().user_deleted(uid)  # shaxsiy kalendar va eslatmalar
    return ok({"ok": True})


@router.get("/api/admin/people")
def people_list(kind: str = "professors", q: str = "", a: dict = Depends(current_staff)):
    """«Professorlar» bo'limi: professor-o'qituvchilar (foydalanuvchilardan) va hisobi yo'q eski profillar."""
    st = svc().st
    role = "teacher" if kind == "professors" else "staff"
    users = [u for u in st.list_users(role, q=q[:80])]
    linked = {(u.get("data") or {}).get("staff_id") for u in users}
    orphans = []
    for it in st.list_items("staff"):
        if it["id"] in linked or it.get("user_id") and st.get_user(it["user_id"]):
            continue
        if (it.get("category") == "staff") == (role == "staff") and (not q or q.lower() in it["title"].lower()):
            orphans.append({"id": it["id"], "title": it["title"], "position": it.get("position"), "photo": it.get("photo"), "status": it["status"], "category": it.get("category")})
    return ok({"items": _list_out(st, users), "orphans": orphans, "sections": sections(st)})


XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx(data: bytes, name: str) -> Response:
    return Response(data, media_type=XLSX, headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


@router.get("/api/admin/users/template.xlsx")
def users_template(role: str = "student", a: dict = Depends(current_staff)):
    """Excel namuna fayl: to'ldiriladigan varaq (namuna qatorlar bilan), yo'riqnoma, mavjud guruh va fakultetlar ro'yxati."""
    role = "teacher" if role == "teacher" else "student"
    st = svc().st
    groups = [g["name"] for g in sorted(st.acad_list("groups"), key=lambda g: ((g.get("course") or 0), g["name"]))]
    faculties = [f["title"] for f in st.list_items("faculty")]
    return _xlsx(XU.build_template(role, groups, faculties), f"users-{'students' if role == 'student' else 'teachers'}-template.xlsx")


@router.post("/api/admin/users/import")
async def users_import(file: UploadFile = File(...), role: str = Form("student"), a: dict = Depends(current_staff)):
    """Excel (.xlsx) orqali ommaviy qo'shish. Sarlavhalar bo'yicha ustunlar aniqlanadi; «namuna.» bilan boshlanuvchi qatorlar o'tkaziladi.
    Parol bo'sh bo'lsa — tasodifiy (javobda qaytadi). Talabalar uchun mavjud bo'lmagan guruh avtomatik yaratiladi."""
    role = "teacher" if role == "teacher" else "student"
    _can_manage(a, role)
    raw = await file.read(5_000_001)
    if len(raw) > 5_000_000:
        raise HTTPException(400, "too_large")
    try:
        rows = XU.read_rows(raw)
    except XU.SheetError as e:
        raise HTTPException(400, f"xlsx_{e}") from e
    st = svc().st
    groups = {g["name"].lower(): g["id"] for g in st.acad_list("groups")}
    facs = {}
    for f in st.list_items("faculty"):
        facs[f["title"].lower()] = f["id"]
        if f.get("slug"):
            facs[f["slug"].lower()] = f["id"]
    added, skipped, created = 0, [], []
    for rec in rows:
        if XU.is_hint_row(rec):
            continue
        n = rec["row"]
        login, name = (rec.get("login") or "").lower(), (rec.get("name") or "").strip()
        if not login and name:  # login bo'sh — ism-familiyadan (pochta manzili ham shu bo'ladi)
            from .. import names as N  # noqa: PLC0415

            login = (N.suggest(name, lambda lg: bool(st.find_user(lg)), limit=1) or [""])[0]
        if not LOGIN_RE.fullmatch(login):
            skipped.append({"row": n, "login": login, "reason": "login noto‘g‘ri (lotin harflari, raqam, . _ -; 3–60 belgi)"})
            continue
        if not name:
            skipped.append({"row": n, "login": login, "reason": "F.I.Sh. bo‘sh"})
            continue
        if st.find_user(login):
            skipped.append({"row": n, "login": login, "reason": "bu login band"})
            continue
        email = rec.get("email") or ""
        if email and not EMAIL_RE.match(email):
            email = ""
        pw = rec.get("password") or ""
        if pw and len(pw) < 6:
            skipped.append({"row": n, "login": login, "reason": "parol 6 belgidan qisqa"})
            continue
        pw = pw or secrets.token_urlsafe(8)
        extra = ""
        if role == "student":
            gname = rec.get("group") or ""
            gid = groups.get(gname.lower()) if gname else None
            if gname and not gid:
                g = st.acad_save("groups", {"name": gname, "course": 1})
                groups[gname.lower()] = gid = g["id"]
            data = {"student_no": rec.get("student_no", ""), "phone": rec.get("phone", "")}
            extra = gname
        else:
            gid = None
            fids, unknown = [], []
            for part in re.split(r"[;,\n]+", rec.get("faculties") or ""):
                part = part.strip()
                if not part:
                    continue
                fid = facs.get(part.lower())
                (fids if fid else unknown).append(fid or part)
            data = {"position": rec.get("position", ""), "department": rec.get("department", ""), "phone": rec.get("phone", ""), "faculty_ids": fids}
            extra = rec.get("position", "")
            if unknown:
                skipped.append({"row": n, "login": login, "reason": f"fakultet topilmadi: {', '.join(unknown)} (hisob fakultetsiz yaratildi)", "warning": True})
        u = st.create_user(login, name, pw, role=role, email=email, group_id=gid, data=data)
        if role == "teacher":
            _sync_profile(st, u, {"position": rec.get("position", ""), "faculty_id": fids[0] if fids else ""})
        on_user_saved(st.get_user(u["id"]), pw)
        created.append({"login": login, "name": name, "password": pw, "extra": extra, "mail": _mail_address(u)})
        added += 1
    return ok({"added": added, "skipped": skipped, "created": created, "rows": len(rows)})


@router.post("/api/admin/users/credentials.xlsx")
def users_credentials(data: dict = Body(...), a: dict = Depends(current_staff)):
    """Import natijasidagi login/parollarni Excel faylda yuklab olish (tarqatish yoki chop etish uchun)."""
    items = [{k: str(x.get(k) or "")[:200] for k in ("name", "login", "password", "extra", "mail")} for x in (data.get("items") or [])[:5000] if isinstance(x, dict)]
    return _xlsx(XU.credentials_xlsx(items), "user-credentials.xlsx")


@router.get("/api/admin/users/{uid}")
def users_get(uid: str, a: dict = Depends(current_staff)):
    st = svc().st
    u = st.get_user(uid)
    if not u or u["role"] not in PORTAL_ROLES:
        raise HTTPException(404, "not_found")
    sid = (u.get("data") or {}).get("staff_id")
    prof = st.get_item(sid) if sid else None
    return ok(_list_out(st, [u])[0] | {"profile_full": prof})


# ================================================================== fakultet o'qituvchilari va kabinetdan fakultetni tahrirlash
def _faculty(fid: str) -> dict:
    it = svc().st.get_item(fid)
    if not it or it["kind"] != "faculty":
        raise HTTPException(404, "not_found")
    return it


def _is_member(st, u: dict, fid: str) -> bool:
    d = u.get("data") or {}
    prof = st.get_item(d["staff_id"]) if d.get("staff_id") else None
    return fid in (d.get("faculty_ids") or []) or (prof or {}).get("faculty_id") == fid


def _faculty_candidates(st) -> list[dict]:
    """Fakultetga biriktiriladigan xodimlar: professor-o'qituvchilar va xodimlar (foydalanuvchilardan)."""
    return [u for u in st.list_users("teacher") + st.list_users("staff")]


@router.get("/api/admin/faculties/{fid}/people")
def faculty_people(fid: str, a: dict = Depends(current_staff)):
    """Fakultet xodimlari (foydalanuvchilardan), dekan va kabinetdan fakultet sahifasini tahrirlay oladiganlar."""
    st = svc().st
    fac = _faculty(fid)
    editors = set(fac.get("editor_ids") or [])
    out = []
    for u in _faculty_candidates(st):
        d = u.get("data") or {}
        sid = d.get("staff_id") or ""
        out.append({"id": u["id"], "name": u["name"], "login": u["login"], "role": u["role"], "position": d.get("position") or "", "photo": d.get("photo") or "",
                    "staff_id": sid, "member": _is_member(st, u, fid), "editor": u["id"] in editors,
                    "dean": bool(sid) and sid == fac.get("dean_staff_id"), "active": bool(u.get("active", True))})
    out.sort(key=lambda x: (not x["dean"], not x["member"], x["name"]))
    return ok({"items": out, "faculty": {"id": fac["id"], "title": fac["title"], "dean": fac.get("dean") or "", "dean_staff_id": fac.get("dean_staff_id") or ""}})


@router.put("/api/admin/faculties/{fid}/people")
def faculty_people_put(fid: str, data: dict = Body(...), a: dict = Depends(current_staff)):
    st = svc().st
    fac = _faculty(fid)
    members = {str(x) for x in data.get("members") or []}
    editors = [str(x) for x in data.get("editors") or [] if str(x) in members]
    dean_uid = str(data.get("dean") or "") if "dean" in data else None
    if dean_uid and dean_uid not in members:
        raise HTTPException(400, "dean_not_member")
    for u in _faculty_candidates(st):
        d = u.get("data") or {}
        ids = list(d.get("faculty_ids") or [])
        prof = st.get_item(d["staff_id"]) if d.get("staff_id") else None
        if u["id"] in members and not _is_member(st, u, fid):
            st.update_user(u["id"], data={"faculty_ids": [*ids, fid][:10]})
            if prof and not prof.get("faculty_id"):
                save_item("staff", {"faculty_id": fid}, prof["id"])
        elif u["id"] not in members and _is_member(st, u, fid):
            st.update_user(u["id"], data={"faculty_ids": [x for x in ids if x != fid]})
            if prof and prof.get("faculty_id") == fid:
                save_item("staff", {"faculty_id": ""}, prof["id"])
    patch: dict = {"editor_ids": editors}
    if dean_uid is not None:
        du = st.get_user(dean_uid) if dean_uid else None
        sid = ((du or {}).get("data") or {}).get("staff_id") or ""
        if dean_uid and not sid:
            raise HTTPException(400, "dean_no_profile")
        prof = st.get_item(sid) if sid else None
        patch |= {"dean_staff_id": sid, "dean": (prof or {}).get("title") or (du or {}).get("name") or ""}
        if prof and not prof.get("faculty_id"):
            save_item("staff", {"faculty_id": fid}, prof["id"])
    save_item("faculty", patch, fac["id"])
    return faculty_people(fid, a)


@router.get("/api/admin/faculty-staff")
def faculty_staff_overview(a: dict = Depends(current_staff)):
    """«Fakultet xodimlari» sahifasi: fakultetlar, har birida nechta xodim va dekan."""
    st = svc().st
    people = _faculty_candidates(st)
    out = []
    for f in st.list_items("faculty"):
        n = sum(1 for u in people if _is_member(st, u, f["id"]))
        dean = st.get_item(f["dean_staff_id"]) if f.get("dean_staff_id") else None
        out.append({"id": f["id"], "title": f["title"], "slug": f.get("slug"), "status": f["status"], "accent": f.get("accent") or "", "members": n,
                    "dean": (dean or {}).get("title") or f.get("dean") or "", "dean_photo": (dean or {}).get("photo") or ""})
    return ok({"items": out})


PORTAL_FACULTY_FIELDS = ("summary", "content", "html", "text", "cover", "email", "phone", "dean", "dean_staff_id", "i18n")


def _editable(u: dict) -> list[dict]:
    return [f for f in svc().st.list_items("faculty") if u["id"] in (f.get("editor_ids") or [])]


@router.get("/api/portal/faculties")
def portal_faculties(u: dict = Depends(current_teacher)):
    """O'qituvchi tahrirlay oladigan fakultetlar (admin fakultet sahifasida ruxsat bergan)."""
    return ok({"items": [{"id": f["id"], "title": f["title"], "slug": f.get("slug"), "status": f["status"], "updated": f.get("updated")} for f in _editable(u)]})


@router.get("/api/portal/faculty/{fid}")
def portal_faculty(fid: str, u: dict = Depends(current_teacher)):
    st = svc().st
    fac = _faculty(fid)
    if fac["id"] not in {f["id"] for f in _editable(u)}:
        raise HTTPException(403, "forbidden")
    teachers = [{"id": x["id"], "name": x["name"], "position": (x.get("data") or {}).get("position") or "", "photo": (x.get("data") or {}).get("photo") or ""}
                for x in st.list_users("teacher", active=True) if _is_member(st, x, fid)]
    return ok({"item": {k: v for k, v in fac.items() if k != "editor_ids"}, "teachers": teachers})


@router.put("/api/portal/faculty/{fid}")
def portal_faculty_put(fid: str, data: dict = Body(...), u: dict = Depends(current_teacher)):
    fac = _faculty(fid)
    if fac["id"] not in {f["id"] for f in _editable(u)}:
        raise HTTPException(403, "forbidden")
    body = {k: data[k] for k in PORTAL_FACULTY_FIELDS if k in data}
    it = save_item("faculty", body, fid)
    return ok({"item": {k: v for k, v in it.items() if k != "editor_ids"}})


def _mail_address(u: dict) -> str:
    cfg = M.config(svc().st)
    return M.mail_address(u, cfg["domain"]) if M.ready(cfg) else ""


# ================================================================== lug'atlar: semestrlar, vaqtlar, guruhlar, fanlar, auditoriyalar
@router.get("/api/admin/acad/{table}")
def acad_list(table: str, a: dict = Depends(current_staff)):
    if table not in TABLES:
        raise HTTPException(404, "not_found")
    return ok({"items": svc().st.acad_list(table)})


@router.post("/api/admin/acad/{table}")
def acad_create(table: str, data: dict = Body(...), a: dict = Depends(current_staff)):
    if table not in TABLES:
        raise HTTPException(404, "not_found")
    try:
        return ok(svc().st.acad_save(table, data))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:  # noqa: BLE001 — UNIQUE (guruh/auditoriya nomi)
        if "UNIQUE" in str(e):
            raise HTTPException(409, "name_taken") from e
        raise


@router.put("/api/admin/acad/{table}/{rid}")
def acad_update(table: str, rid: str, data: dict = Body(...), a: dict = Depends(current_staff)):
    if table not in TABLES or not svc().st.acad_get(table, rid):
        raise HTTPException(404, "not_found")
    try:
        return ok(svc().st.acad_save(table, data, rid))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:  # noqa: BLE001
        if "UNIQUE" in str(e):
            raise HTTPException(409, "name_taken") from e
        raise


@router.delete("/api/admin/acad/{table}/{rid}")
def acad_delete(table: str, rid: str, a: dict = Depends(current_staff)):
    if table not in TABLES:
        raise HTTPException(404, "not_found")
    svc().st.acad_delete(table, rid)
    return ok({"ok": True})


@router.get("/api/admin/acad-overview")
def acad_overview(a: dict = Depends(current_staff)):
    st = svc().st
    sem = st.current_semester()
    return ok({"counts": st.academic_counts(), "semester": sem, "semesters": st.acad_list("semesters"), "groups": st.acad_list("groups"),
               "subjects": st.acad_list("subjects"), "rooms": st.acad_list("rooms"), "slots": st.acad_list("time_slots"),
               "teachers": [public_user(u) for u in st.list_users("teacher", active=True)], "weekdays": WEEKDAYS})


# ================================================================== dars jadvali (admin / o'quv bo'limi)
@router.get("/api/admin/lessons")
def lessons_list(semester: str = "", group: str = "", teacher: str = "", room: str = "", a: dict = Depends(current_staff)):
    sem = _semester(semester or None)
    return ok({"items": svc().st.lessons(semester_id=sem["id"], group_id=group or None, teacher_id=teacher or None, room_id=room or None), "semester": sem})


def _watch(*group_ids):
    """Guruh(lar) jadvali o'zgarishi — bog'langan talabalarga Telegram orqali (yaqin 7 kun farqi)."""
    from ..tg_student import ScheduleWatch  # noqa: PLC0415

    return ScheduleWatch(svc().st, [g for g in group_ids if g])


def _save_lesson(data: dict, lid: str | None):
    st = svc().st
    try:
        d = st.clean_lesson(data)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    _no_conflicts(d, lid)
    cur = st.get_lesson(lid) if lid else None
    with _watch(d["group_id"], (cur or {}).get("group_id")):
        saved = st.save_lesson(d, lid)
    return ok(saved)


def _no_conflicts(d: dict, lid: str | None) -> None:
    """To'qnashuv bo'lsa saqlanmaydi (majburan saqlash yo'q): guruh, o'qituvchi yoki auditoriya o'sha vaqtda band."""
    conflicts = svc().st.lesson_conflicts(d, exclude=lid)
    if conflicts:
        raise HTTPException(409, {"code": "conflict", "conflicts": [{"kind": c["kind"], "lesson": {k: c["lesson"].get(k) for k in ("id", "group_name", "subject", "teacher", "room", "parity", "type")}} for c in conflicts]})


@router.post("/api/admin/lessons")
def lessons_create(data: dict = Body(...), a: dict = Depends(current_staff)):
    return _save_lesson(data, None)


@router.put("/api/admin/lessons/{lid}")
def lessons_update(lid: str, data: dict = Body(...), a: dict = Depends(current_staff)):
    if not svc().st.get_lesson(lid):
        raise HTTPException(404, "not_found")
    return _save_lesson(data, lid)


@router.delete("/api/admin/lessons/{lid}")
def lessons_delete(lid: str, a: dict = Depends(current_staff)):
    cur = svc().st.get_lesson(lid)
    with _watch((cur or {}).get("group_id")):
        svc().st.delete_lesson(lid)
    return ok({"ok": True})


@router.post("/api/admin/lessons/check")
def lessons_check(data: dict = Body(...), a: dict = Depends(current_staff)):
    st = svc().st
    try:
        d = st.clean_lesson(data)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return ok({"conflicts": [{"kind": c["kind"], "lesson": c["lesson"]} for c in st.lesson_conflicts(d, exclude=data.get("id"))]})


@router.post("/api/admin/lessons/{lid}/move")
def lessons_move(lid: str, data: dict = Body(...), a: dict = Depends(current_staff)):
    """Sudrab ko'chirish: darsni boshqa kun/juftlikka (va ixtiyoriy boshqa guruh ustuniga) o'tkazish. Band bo'lsa — 409."""
    st = svc().st
    cur = st.get_lesson(lid)
    if not cur:
        raise HTTPException(404, "not_found")
    patch = {k: data[k] for k in ("weekday", "slot_id", "group_id", "room_id") if k in data}
    try:
        d = st.clean_lesson({**cur, **patch})
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    _no_conflicts(d, lid)
    with _watch(cur["group_id"], d["group_id"]):
        saved = st.save_lesson(d, lid)
    return ok(saved)


@router.post("/api/admin/lessons/availability")
def lessons_availability(data: dict = Body(...), a: dict = Depends(current_staff)):
    """Har bir katak uchun to'qnashuvlar xaritasi (sudrab ko'chirishda bo'sh/band kataklarni bo'yash)."""
    st = svc().st
    base = st.get_lesson(s_(data, "id", 40)) if data.get("id") else None
    try:
        d = st.clean_lesson({**(base or {}), **{k: v for k, v in data.items() if k != "id"}, "weekday": 0, "slot_id": (st.acad_list("time_slots") or [{"id": ""}])[0]["id"]})
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return ok({"cells": st.availability(d, exclude=base["id"] if base else None)})


FORM_DEFAULT = {
    "approver_title": "O‘quv ishlari bo‘yicha prorektor", "approver_name": "", "head_title": "O‘quv-uslubiy boshqarma boshlig‘i", "head_name": "",
    "dean_title": "Fakultet dekani", "dean_name": "", "note": "",
}


def _form_settings() -> dict:
    return {**FORM_DEFAULT, **(svc().st.kv_get("schedule_form", {}) or {})}


@router.get("/api/admin/form-settings")
def form_settings_get(a: dict = Depends(current_staff)):
    return ok(_form_settings())


@router.put("/api/admin/form-settings")
def form_settings_put(data: dict = Body(...), a: dict = Depends(current_staff)):
    svc().st.kv_put("schedule_form", {k: s_(data, k, 200) for k in FORM_DEFAULT})
    return ok(_form_settings())


def _form(sem: dict, groups: list[dict], lessons: list[dict], title: str = "") -> dict:
    st = svc().st
    uni = svc().uni()
    return {"semester": sem, "slots": st.acad_list("time_slots"), "groups": [{k: g.get(k) for k in ("id", "name", "course", "faculty_id", "program_id", "lang")} for g in groups],
            "lessons": lessons, "weekdays": WEEKDAYS[:6], "settings": _form_settings(), "title": title,
            "uni": {"name": uni.get("name"), "abbr": uni.get("abbr"), "logo": uni.get("logo")},
            "faculties": {f["id"]: f["title"] for f in st.list_items("faculty")}}


def _groups_sorted() -> list[dict]:
    return sorted(svc().st.acad_list("groups"), key=lambda g: ((g.get("course") or 0), g.get("name") or ""))


@router.get("/api/admin/form")
def admin_form(semester: str = "", course: int = 0, faculty: str = "", groups: str = "", group: str = "", teacher: str = "", a: dict = Depends(current_staff)):
    """Davlat shaklidagi dars jadvali: umumiy, fakultet, kurs, guruh yoki o'qituvchi bo'yicha."""
    st = svc().st
    sem = _semester(semester or None)
    if teacher:
        t = st.get_user(teacher)
        if not t:
            raise HTTPException(404, "not_found")
        ls = st.lessons(semester_id=sem["id"], teacher_id=teacher)
        gids = {l["group_id"] for l in ls}
        return ok(_form(sem, [g for g in _groups_sorted() if g["id"] in gids], ls, t["name"]))
    gs = _groups_sorted()
    if group:
        gs = [g for g in gs if g["id"] == group]
    ids = [x for x in groups.split(",") if x]
    if ids:
        gs = [g for g in gs if g["id"] in ids]
    if course:
        gs = [g for g in gs if (g.get("course") or 0) == course]
    if faculty:
        gs = [g for g in gs if g.get("faculty_id") == faculty]
    gids = {g["id"] for g in gs}
    lessons = [l for l in st.lessons(semester_id=sem["id"]) if l["group_id"] in gids]
    return ok(_form(sem, gs, lessons))


@router.get("/api/portal/form")
def portal_form(semester: str = "", faculty: str = "", u: dict = Depends(current_user)):
    """Kabinet: talaba — o'z guruhi; o'qituvchi — o'z darslari (guruhlar ustunlarda)."""
    st = svc().st
    sem = _semester(semester or None)
    if u["role"] == "student":
        g = _group_of(u)
        if not sem.get("published") or not g:
            return ok(_form(sem, [], []) | {"unpublished": not sem.get("published"), "no_group": not g})
        return ok(_form(sem, [g], st.lessons(semester_id=sem["id"], group_id=g["id"])))
    if u["role"] == "teacher":
        allowed = teacher_faculties(u)
        if faculty:
            # fakultet jadvali — faqat o'qituvchiga biriktirilgan fakultetlar
            if faculty not in allowed:
                raise HTTPException(403, "not_your_faculty")
            gs = [g for g in _groups_sorted() if g.get("faculty_id") == faculty]
            gids = {g["id"] for g in gs}
            return ok(_form(sem, gs, [l for l in st.lessons(semester_id=sem["id"]) if l["group_id"] in gids]))
        ls = st.lessons(semester_id=sem["id"], teacher_id=u["id"])
        gids = {l["group_id"] for l in ls}
        return ok(_form(sem, [g for g in _groups_sorted() if g["id"] in gids], ls, u["name"]))
    gs = st.acad_list("groups")
    return ok(_form(sem, gs, st.lessons(semester_id=sem["id"])))


@router.post("/api/admin/lessons/copy")
def lessons_copy(data: dict = Body(...), a: dict = Depends(current_staff)):
    st = svc().st
    src, dst = s_(data, "from", 40), s_(data, "to", 40)
    if not (st.acad_get("semesters", src) and st.acad_get("semesters", dst)) or src == dst:
        raise HTTPException(400, "invalid_semesters")
    return ok({"copied": st.copy_semester_schedule(src, dst)})


@router.get("/api/admin/changes")
def changes_list(semester: str = "", a: dict = Depends(current_staff)):
    return ok({"items": svc().st.list_changes(semester or None)})


@router.post("/api/admin/changes")
def changes_add(data: dict = Body(...), a: dict = Depends(current_staff)):
    st = svc().st
    les = st.get_lesson(s_(data, "lesson_id", 40))
    if not les:
        raise HTTPException(404, "not_found")
    try:
        with _watch(les["group_id"]):
            ch = st.save_change(s_(data, "lesson_id", 40), s_(data, "date", 10), s_(data, "kind", 10), s_(data, "room_id", 40) or None, s_(data, "slot_id", 40) or None, s_(data, "teacher_id", 40) or None, s_(data, "note", 300), a["id"])
        return ok(ch)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.delete("/api/admin/changes/{cid}")
def changes_delete(cid: str, a: dict = Depends(current_staff)):
    st = svc().st
    r = st._q("SELECT l.group_id FROM schedule_changes c JOIN lessons l ON l.id=c.lesson_id WHERE c.id=%s", (cid,))
    with _watch(r[0]["group_id"] if r else None):
        st.delete_change(cid)
    return ok({"ok": True})


@router.get("/api/admin/week")
def admin_week(semester: str = "", group: str = "", teacher: str = "", room: str = "", week: str = "", a: dict = Depends(current_staff)):
    sem = _semester(semester or None)
    return ok(svc().st.week_schedule(sem, _week(week), group_id=group or None, teacher_id=teacher or None, room_id=room or None))


@router.get("/api/admin/notices")
def admin_notices(a: dict = Depends(current_staff)):
    return ok({"items": svc().st.notices_for("admin")})


@router.post("/api/admin/notices")
def admin_notice_add(data: dict = Body(...), a: dict = Depends(current_staff)):
    try:
        return ok(svc().st.save_notice(data, a["id"], s_(data, "id", 40) or None))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/api/admin/notices/send")
def admin_notice_send(data: dict = Body(...), a: dict = Depends(current_staff)):
    """«Foydalanuvchilar → Talabalar»dan bildirishnoma: tanlangan talabalarga (shaxsiy), guruhga yoki barcha talabalarga.
    Ixtiyoriy: talabaning emailiga ham xat (sayt dizaynidagi shablon, «Kabinetda ochish» tugmasi bilan)."""
    st = svc().st
    title, body = s_(data, "title", 300), str(data.get("body") or "")[:10000]
    if not title:
        raise HTTPException(400, "empty_title")
    target = data.get("target")
    if target == "selected":
        ids = [str(x)[:40] for x in (data.get("user_ids") or [])][:2000]
        users = [u for u in (st.get_user(i) for i in ids) if u and u.get("role") == "student"]
        if not users:
            raise HTTPException(400, "no_recipients")
        for u in users:
            st.personal_notice(u["id"], title, body, a["id"])
    elif target == "group":
        gid = s_(data, "group_id", 40)
        if not gid:
            raise HTTPException(400, "missing_group")
        st.save_notice({"title": title, "body": body, "audience": "group", "group_id": gid, "pinned": data.get("pinned")}, a["id"])
        users = st.list_users("student", group_id=gid, active=True)
    elif target == "students":
        st.save_notice({"title": title, "body": body, "audience": "students", "pinned": data.get("pinned")}, a["id"])
        users = st.list_users("student", active=True)
    else:
        raise HTTPException(400, "bad_target")
    mailed = 0
    if data.get("email"):
        to = [u["email"] for u in users if u.get("active") and u.get("email")]
        if to:
            svc().mail.portal_notice(to, title, body, "/student/notices")
            mailed = len(to)
    return ok({"ok": True, "recipients": len(users), "mailed": mailed})


@router.delete("/api/admin/notices/{nid}")
def admin_notice_delete(nid: str, a: dict = Depends(current_staff)):
    svc().st.delete_notice(nid)
    return ok({"ok": True})


# ================================================================== umumiy kabinet (talaba va o'qituvchi)
@router.get("/api/portal/me")
def portal_me(u: dict = Depends(current_user)):
    st = svc().st
    sem = st.current_semester()
    out = {"user": public_user(u), "semester": sem, "semesters": [s for s in st.acad_list("semesters") if s["published"] or u["role"] != "student"], "weekdays": WEEKDAYS, "slots": st.acad_list("time_slots")}
    if u["role"] == "student":
        g = _group_of(u)
        out["group"] = g
        if g:
            prog = st.get_item(g["program_id"]) if g.get("program_id") else None
            fac = st.get_item(g["faculty_id"]) if g.get("faculty_id") else None
            out["program"] = {"id": prog["id"], "title": prog["title"], "slug": prog.get("slug")} if prog else None
            out["faculty"] = {"id": fac["id"], "title": fac["title"], "slug": fac.get("slug")} if fac else None
            out["curator"] = public_user(st.get_user(g["curator_id"])) if g.get("curator_id") and st.get_user(g["curator_id"]) else None
    if u["role"] == "teacher":
        if sem:
            out["courses"] = st.teacher_courses(u["id"], sem["id"])
        out["faculties"] = [{"id": f["id"], "title": f["title"]} for f in (st.get_item(x) for x in teacher_faculties(u)) if f]
        out["editable_faculties"] = [{"id": f["id"], "title": f["title"]} for f in _editable(u)]
    if u["role"] in ("teacher", "staff"):
        secs = {x["id"]: x["name"] for x in sections(st)}
        out["sections"] = [secs[x] for x in (u.get("data") or {}).get("sections") or [] if x in secs]
        out["section_ids"] = [x for x in (u.get("data") or {}).get("sections") or [] if x in secs]
    return ok(out)


@router.put("/api/portal/profile")
def portal_profile(data: dict = Body(...), u: dict = Depends(current_user)):
    st = svc().st
    fields: dict = {}
    email = s_(data, "email", 160)
    if "email" in data:
        if email and not EMAIL_RE.match(email):
            raise HTTPException(400, "invalid_email")
        fields["email"] = email
    # surat faqat /api/portal/photo orqali (yuz tekshiruvidan o'tgan holda) o'rnatiladi
    extra = {k: str(v)[:300] for k, v in (data.get("data") or {}).items() if k in ("phone", "address", "birth")} if isinstance(data.get("data"), dict) else {}
    if extra:
        fields["data"] = extra
    return ok(public_user(st.update_user(u["id"], **fields)))


# ================================================================== profil surati (yuz aniqlash bilan)
FACE_ERR = {"not_image": "photo_not_image", "no_face": "photo_no_face", "face_small": "photo_face_small", "many_faces": "photo_many_faces", "unavailable": "photo_unavailable"}


async def _portrait(file: UploadFile) -> str:
    """Rasmda bitta odam yuzi bo'lishi shart (hayvon, manzara, buyum, guruh surati — rad etiladi). Natija: yuz markazidagi 512×512 surat."""
    from .. import faces  # noqa: PLC0415
    from ..media import MediaError, store_media  # noqa: PLC0415

    raw = await file.read(12_000_001)
    if len(raw) > 12_000_000:
        raise HTTPException(400, "too_large")
    try:
        jpg = faces.portrait(raw)
    except faces.FaceError as e:
        raise HTTPException(400, FACE_ERR.get(str(e), "photo_no_face")) from e
    try:
        return store_media(svc().st, jpg, "avatar.jpg")["url"]
    except MediaError as e:
        raise HTTPException(400, str(e)) from e


def _set_photo(u: dict, url: str) -> dict:
    st = svc().st
    nu = st.update_user(u["id"], data={"photo": url})
    sid = (u.get("data") or {}).get("staff_id")
    if sid and st.get_item(sid):
        save_item("staff", {"photo": url}, sid)  # saytdagi profil ham shu surat bilan
    return nu


@router.post("/api/portal/photo")
async def portal_photo(file: UploadFile = File(...), u: dict = Depends(current_user)):
    rate_limit("photo:" + u["id"], 20, 3600)
    return ok(public_user(_set_photo(u, await _portrait(file))))


@router.delete("/api/portal/photo")
def portal_photo_delete(u: dict = Depends(current_user)):
    return ok(public_user(_set_photo(u, "")))


@router.post("/api/admin/photo/check")
async def admin_photo_check(file: UploadFile = File(...), a: dict = Depends(current_staff)):
    """Admin: foydalanuvchi surati — yuz tekshiruvi va kesishdan keyin URL (formada saqlanadi)."""
    return ok({"url": await _portrait(file)})


@router.post("/api/portal/password")
def portal_password(request: Request, data: dict = Body(...), u: dict = Depends(current_user)):
    st = svc().st
    rate_limit("pw:" + ip_of(request), 10, 600)
    if not verify_password(str(data.get("current") or ""), st.user_pw_hash(u["id"]) or ""):
        raise HTTPException(400, "wrong_password")
    new = str(data.get("new") or "")
    if len(new) < 8:
        raise HTTPException(400, "weak_password")
    st.update_user(u["id"], password=new)
    on_user_saved(u, new)
    token = st.create_session(u["id"], ip_of(request), request.headers.get("user-agent"))
    resp = ok({"ok": True})
    from .deps import set_cookie

    set_cookie(resp, token)
    return resp


@router.get("/api/portal/schedule")
def portal_schedule(week: str = "", semester: str = "", u: dict = Depends(current_user)):
    st = svc().st
    sem = _semester(semester or None)
    if u["role"] == "student":
        if not sem.get("published"):
            return ok({"days": [], "semester": sem, "unpublished": True})
        if not u.get("group_id"):
            return ok({"days": [], "semester": sem, "no_group": True})
        return ok(st.week_schedule(sem, _week(week), group_id=u["group_id"]))
    if u["role"] == "teacher":
        return ok(st.week_schedule(sem, _week(week), teacher_id=u["id"]))
    if u["role"] == "staff" and "study" not in ((u.get("data") or {}).get("sections") or []):
        return ok({"days": [], "semester": sem})  # umumiy jadval — faqat o'quv bo'limi xodimlariga
    return ok(st.week_schedule(sem, _week(week)))


@router.get("/api/portal/notices")
def portal_notices(u: dict = Depends(current_user)):
    return ok({"items": svc().st.notices_for(u["role"], u.get("group_id"), author_id=None, user_id=u["id"])})


@router.get("/api/portal/notifications")
def portal_notifications(u: dict = Depends(current_user)):
    """Yuqori paneldagi qo'ng'iroqcha: shaxsiy o'qilmagan bildirishnomalar (forumda yoqtirish, javob, iqtibos)."""
    return ok(svc().st.notifications(u["id"]))


@router.post("/api/portal/notifications/seen")
def portal_notifications_seen(data: dict = Body(default={}), u: dict = Depends(current_user)):
    ids = data.get("ids")
    n = svc().st.notifications_seen(u["id"], [str(x)[:40] for x in ids] if isinstance(ids, list) else None)
    return ok({"ok": True, "updated": n})


@router.get("/api/portal/today")
def portal_today(u: dict = Depends(current_user)):
    """Kabinet bosh sahifasi: bugungi darslar, yaqin topshiriqlar, so'nggi bildirishnomalar va qisqa ko'rsatkichlar."""
    st = svc().st
    sem = st.current_semester()
    today = date.today()
    out: dict = {"date": today.isoformat(), "weekday": today.weekday(), "semester": sem, "lessons": [], "notices": st.notices_for(u["role"], u.get("group_id"), user_id=u["id"], limit=5, personal_kinds=False)}
    if sem:
        flt = {"group_id": u.get("group_id")} if u["role"] == "student" else {"teacher_id": u["id"]} if u["role"] == "teacher" else {}
        if u["role"] in ("teacher", "admin") or (u["role"] == "student" and u.get("group_id") and sem.get("published")):
            wk = st.week_schedule(sem, today, **flt)
            out["lessons"] = next((d["lessons"] for d in wk["days"] if d["date"] == today.isoformat()), [])
            out["week"] = {"number": wk["week_number"], "parity": wk["parity"]}
    if u["role"] == "student" and sem:
        gr = st.student_grades(u["id"], sem["id"])
        att = st.student_attendance(u["id"], sem["id"])
        subs = st.student_submissions(u["id"])
        asg = [a for a in st.assignments(group_id=u.get("group_id")) if a["id"] not in subs and (not a["due"] or a["due"] >= today.isoformat())]
        out.update(gpa=st.gpa(gr["subjects"]), subjects=gr["subjects"], attendance={"pct": att["pct"], "absent": att["absent"], "total": att["total"]}, pending_assignments=asg[:5], pending_count=len(asg))
    if u["role"] == "teacher" and sem:
        courses = st.teacher_courses(u["id"], sem["id"])
        asg = st.assignments(teacher_id=u["id"])
        out.update(courses=courses, groups=len({c["group_id"] for c in courses}), students=sum(c["students"] for c in {c["group_id"]: c for c in courses}.values()),
                   to_grade=sum(a["submissions"] - a["graded"] for a in asg), assignments=len(asg))
    return ok(out)


# ================================================================== talaba
@router.get("/api/student/grades")
def student_grades(semester: str = "", u: dict = Depends(current_student)):
    st = svc().st
    sem = st.acad_get("semesters", semester) if semester else st.current_semester()
    gr = st.student_grades(u["id"], sem["id"] if sem else None)
    return ok(gr | {"gpa": st.gpa(gr["subjects"]), "semester": sem})


@router.get("/api/student/attendance")
def student_attendance(semester: str = "", u: dict = Depends(current_student)):
    st = svc().st
    sem = st.acad_get("semesters", semester) if semester else st.current_semester()
    return ok(st.student_attendance(u["id"], sem["id"] if sem else None) | {"semester": sem})


@router.get("/api/student/assignments")
def student_assignments(u: dict = Depends(current_student)):
    st = svc().st
    if not u.get("group_id"):
        return ok({"items": []})
    subs = st.student_submissions(u["id"])
    items = [a | {"submission": subs.get(a["id"])} for a in st.assignments(group_id=u["group_id"])]
    return ok({"items": items})


@router.post("/api/student/assignments/{aid}/submit")
def student_submit(aid: str, data: dict = Body(...), u: dict = Depends(current_student)):
    st = svc().st
    a = st.get_assignment(aid)
    if not a or a["group_id"] != u.get("group_id"):
        raise HTTPException(404, "not_found")
    cur = st.student_submissions(u["id"]).get(aid)
    if cur and cur.get("score") is not None:
        raise HTTPException(400, "already_graded")
    text = str(data.get("text") or "")
    att = data.get("attachments") or []
    if not text.strip() and not att:
        raise HTTPException(400, "empty_submission")
    return ok(st.submit(aid, u["id"], text, att))


@router.get("/api/student/materials")
def student_materials(u: dict = Depends(current_student)):
    st = svc().st
    if not u.get("group_id"):
        return ok({"items": []})
    sem = st.current_semester()
    subject_ids = sorted({l["subject_id"] for l in st.lessons(semester_id=sem["id"] if sem else None, group_id=u["group_id"])}) if sem else []
    return ok({"items": st.materials(group_id=u["group_id"], subject_ids=subject_ids)})


# ================================================================== o'qituvchi
def _own_course(u: dict, group_id: str, subject_id: str | None = None) -> None:
    if u["role"] == "admin":
        return
    if not svc().st.teacher_has(u["id"], group_id, subject_id):
        raise HTTPException(403, "not_your_group")


@router.get("/api/teacher/courses")
def teacher_courses(semester: str = "", u: dict = Depends(current_teacher)):
    sem = _semester(semester or None)
    return ok({"items": svc().st.teacher_courses(u["id"], sem["id"]), "semester": sem})


@router.get("/api/teacher/groups/{gid}/students")
def teacher_students(gid: str, u: dict = Depends(current_teacher)):
    _own_course(u, gid)
    st = svc().st
    return ok({"group": st.acad_get("groups", gid), "items": st.group_students(gid)})


@router.get("/api/teacher/lessons/{lid}/attendance")
def teacher_attendance_get(lid: str, date_: str = "", u: dict = Depends(current_teacher)):
    st = svc().st
    les = st.get_lesson(lid)
    if not les or (u["role"] != "admin" and les["teacher_id"] != u["id"]):
        raise HTTPException(404, "not_found")
    day = date_ or date.today().isoformat()
    marks = {m["student_id"]: m for m in st.attendance_for(lid, day)}
    students = st.group_students(les["group_id"])
    return ok({"lesson": les, "date": day, "students": [s | {"mark": marks.get(s["id"])} for s in students], "dates": st.attendance_dates(lid), "statuses": ATT_STATUS})


@router.put("/api/teacher/lessons/{lid}/attendance")
def teacher_attendance_put(lid: str, data: dict = Body(...), u: dict = Depends(current_teacher)):
    st = svc().st
    les = st.get_lesson(lid)
    if not les or (u["role"] != "admin" and les["teacher_id"] != u["id"]):
        raise HTTPException(404, "not_found")
    try:
        n = st.set_attendance(lid, s_(data, "date", 10) or date.today().isoformat(), data.get("marks") or [], u["id"])
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return ok({"ok": True, "saved": n})


@router.get("/api/teacher/journal")
def teacher_journal(group: str, subject: str, semester: str = "", u: dict = Depends(current_teacher)):
    _own_course(u, group, subject)
    st = svc().st
    sem = _semester(semester or None)
    return ok(st.journal(group, subject, sem["id"]) | {"group": st.acad_get("groups", group), "subject": st.acad_get("subjects", subject), "semester": sem})


@router.post("/api/teacher/grades")
def teacher_grade_add(data: dict = Body(...), u: dict = Depends(current_teacher)):
    st = svc().st
    stu = st.get_user(s_(data, "student_id", 40))
    if not stu or stu["role"] != "student" or not stu.get("group_id"):
        raise HTTPException(404, "student_not_found")
    _own_course(u, stu["group_id"], s_(data, "subject_id", 40))
    if not data.get("semester_id"):
        data["semester_id"] = _semester()["id"]
    try:
        return ok(st.add_grade(data, u["id"]))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/api/teacher/grades/bulk")
def teacher_grade_bulk(data: dict = Body(...), u: dict = Depends(current_teacher)):
    """Bir ustun: bir xil fan/tur/sana uchun ko'p talabaga baho."""
    st = svc().st
    group, subject = s_(data, "group_id", 40), s_(data, "subject_id", 40)
    _own_course(u, group, subject)
    sem_id = s_(data, "semester_id", 40) or _semester()["id"]
    students = {s["id"] for s in st.group_students(group)}
    out = []
    for m in (data.get("marks") or [])[:300]:
        if not isinstance(m, dict) or m.get("student_id") not in students or m.get("score") in (None, ""):
            continue
        try:
            out.append(st.add_grade({"student_id": m["student_id"], "subject_id": subject, "semester_id": sem_id, "kind": data.get("kind"), "title": data.get("title"),
                                     "score": m["score"], "max": data.get("max"), "date": data.get("date"), "comment": m.get("comment")}, u["id"]))
        except ValueError:
            continue
    return ok({"added": len(out), "items": out})


@router.put("/api/teacher/grades/{gid}")
def teacher_grade_update(gid: str, data: dict = Body(...), u: dict = Depends(current_teacher)):
    st = svc().st
    g = st.acad_get("grades", gid)
    if not g or (u["role"] != "admin" and g["teacher_id"] != u["id"]):
        raise HTTPException(404, "not_found")
    try:
        return ok(st.update_grade(gid, data))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.delete("/api/teacher/grades/{gid}")
def teacher_grade_delete(gid: str, u: dict = Depends(current_teacher)):
    st = svc().st
    g = st.acad_get("grades", gid)
    if not g or (u["role"] != "admin" and g["teacher_id"] != u["id"]):
        raise HTTPException(404, "not_found")
    st.delete_grade(gid)
    return ok({"ok": True})


@router.get("/api/teacher/assignments")
def teacher_assignments(u: dict = Depends(current_teacher)):
    return ok({"items": svc().st.assignments(teacher_id=u["id"])})


@router.post("/api/teacher/assignments")
def teacher_assignment_add(data: dict = Body(...), u: dict = Depends(current_teacher)):
    _own_course(u, s_(data, "group_id", 40), s_(data, "subject_id", 40))
    try:
        return ok(svc().st.save_assignment({**data, "semester_id": data.get("semester_id") or (svc().st.current_semester() or {}).get("id")}, u["id"]))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.put("/api/teacher/assignments/{aid}")
def teacher_assignment_update(aid: str, data: dict = Body(...), u: dict = Depends(current_teacher)):
    st = svc().st
    a = st.get_assignment(aid)
    if not a or (u["role"] != "admin" and a["teacher_id"] != u["id"]):
        raise HTTPException(404, "not_found")
    try:
        return ok(st.save_assignment({**a, **data}, a["teacher_id"], aid))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.delete("/api/teacher/assignments/{aid}")
def teacher_assignment_delete(aid: str, u: dict = Depends(current_teacher)):
    st = svc().st
    a = st.get_assignment(aid)
    if not a or (u["role"] != "admin" and a["teacher_id"] != u["id"]):
        raise HTTPException(404, "not_found")
    st.delete_assignment(aid)
    return ok({"ok": True})


@router.get("/api/teacher/assignments/{aid}/submissions")
def teacher_submissions(aid: str, u: dict = Depends(current_teacher)):
    st = svc().st
    a = st.get_assignment(aid)
    if not a or (u["role"] != "admin" and a["teacher_id"] != u["id"]):
        raise HTTPException(404, "not_found")
    subs = {s["student_id"]: s for s in st.submissions(aid)}
    return ok({"assignment": a, "items": [s | {"submission": subs.get(s["id"])} for s in st.group_students(a["group_id"])]})


@router.put("/api/teacher/submissions/{sid}")
def teacher_grade_submission(sid: str, data: dict = Body(...), u: dict = Depends(current_teacher)):
    st = svc().st
    r = st._q("SELECT x.*, a.teacher_id, a.max, a.subject_id, a.semester_id, a.title FROM submissions x JOIN assignments a ON a.id=x.assignment_id WHERE x.id=%s", (sid,))
    if not r or (u["role"] != "admin" and r[0]["teacher_id"] != u["id"]):
        raise HTTPException(404, "not_found")
    row = dict(r[0])
    score = data.get("score")
    try:
        score = None if score in (None, "") else float(score)
    except (TypeError, ValueError) as e:
        raise HTTPException(400, "invalid_score") from e
    if score is not None and not 0 <= score <= float(row["max"]):
        raise HTTPException(400, "invalid_score")
    out = st.grade_submission(sid, score, s_(data, "feedback", 2000), u["id"])
    # topshiriq bahosi jurnalga ham yoziladi (bir topshiriq — bir yozuv)
    if score is not None and data.get("to_journal", True):
        ex = st._q("SELECT id FROM grades WHERE student_id=%s AND subject_id=%s AND kind='assignment' AND title=%s", (row["student_id"], row["subject_id"], row["title"]))
        if ex:
            st.update_grade(ex[0]["id"], {"score": score, "max": row["max"]})
        else:
            st.add_grade({"student_id": row["student_id"], "subject_id": row["subject_id"], "semester_id": row["semester_id"] or (st.current_semester() or {}).get("id"),
                          "kind": "assignment", "title": row["title"], "score": score, "max": row["max"]}, u["id"])
    return ok(out)


@router.get("/api/teacher/materials")
def teacher_materials(u: dict = Depends(current_teacher)):
    return ok({"items": svc().st.materials(teacher_id=u["id"])})


@router.post("/api/teacher/materials")
def teacher_material_add(data: dict = Body(...), u: dict = Depends(current_teacher)):
    try:
        return ok(svc().st.save_material(data, u["id"]))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.put("/api/teacher/materials/{mid}")
def teacher_material_update(mid: str, data: dict = Body(...), u: dict = Depends(current_teacher)):
    st = svc().st
    m = st.acad_get("materials", mid)
    if not m or (u["role"] != "admin" and m["teacher_id"] != u["id"]):
        raise HTTPException(404, "not_found")
    try:
        return ok(st.save_material({**m, **data}, m["teacher_id"], mid))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.delete("/api/teacher/materials/{mid}")
def teacher_material_delete(mid: str, u: dict = Depends(current_teacher)):
    st = svc().st
    m = st.acad_get("materials", mid)
    if not m or (u["role"] != "admin" and m["teacher_id"] != u["id"]):
        raise HTTPException(404, "not_found")
    st.delete_material(mid)
    return ok({"ok": True})


@router.get("/api/teacher/notices")
def teacher_notices(u: dict = Depends(current_teacher)):
    return ok({"items": svc().st.notices_for("teacher", author_id=u["id"])})


@router.post("/api/teacher/notices")
def teacher_notice_add(data: dict = Body(...), u: dict = Depends(current_teacher)):
    """O'qituvchi faqat o'z guruhlariga bildirishnoma yuboradi."""
    gid = s_(data, "group_id", 40)
    if not gid:
        raise HTTPException(400, "missing_group")
    _own_course(u, gid)
    try:
        return ok(svc().st.save_notice({**data, "audience": "group"}, u["id"]))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.delete("/api/teacher/notices/{nid}")
def teacher_notice_delete(nid: str, u: dict = Depends(current_teacher)):
    st = svc().st
    n = st.acad_get("notices", nid)
    if not n or (u["role"] != "admin" and n["author_id"] != u["id"]):
        raise HTTPException(404, "not_found")
    st.delete_notice(nid)
    return ok({"ok": True})
