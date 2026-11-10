"""Integratsiyalar: HEMIS (sozlama, sinxronlash, kabinetdagi HEMIS ma'lumotlari) va S3 fayl saqlash."""
from __future__ import annotations

import threading
from datetime import date, datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException

from .. import content as C
from .. import hemis as H
from .. import roles as R
from .. import search as SR
from .. import s3 as S3
from .deps import current_admin, current_user, ok, svc
from .desk import _desk
from .mail import on_user_saved

router = APIRouter()


# ================================================================== HEMIS
def _hemis_sync() -> H.AutoSync:
    s = svc()
    a = getattr(s, "_hemis_sync", None)
    if a is None or a.st is not s.st:
        a = s._hemis_sync = H.AutoSync(s.st, on_user=on_user_saved)
    return a


def start_hemis() -> None:
    _hemis_sync().start()


def _hemis_status() -> dict:
    st = svc().st
    users = st.list_users()
    linked = {r: sum(1 for u in users if u["role"] == r and (u.get("data") or {}).get("hemis_id")) for r in ("teacher", "student")}
    return {"last": st.kv_get("hemis_last_sync") or None, "state": st.kv_get("hemis_sync_state") or {"running": False},
            "running": _hemis_sync().running, "linked": linked, "groups": len(st.kv_get("hemis_groups") or {})}


@router.get("/api/admin/hemis")
def hemis_get(a: dict = Depends(current_admin)):
    return ok({"config": H.public(H.config(svc().st)), "status": _hemis_status()})


@router.put("/api/admin/hemis")
def hemis_put(data: dict = Body(...), a: dict = Depends(current_admin)):
    s = svc()
    cfg = H.clean(data, H.config(s.st))
    s.st.kv_put("hemis", cfg)
    # saytdagi «HEMIS» havolasi (menyu, tezkor havolalar) shu manzilga
    uni = dict(s.st.kv_get("uni", {}) or {})
    if cfg.get("portal_url") and uni.get("hemis_url") != cfg["portal_url"]:
        s.st.kv_put("uni", uni | {"hemis_url": cfg["portal_url"]})
    H.cache_clear(s.st)
    return hemis_get(a)


@router.post("/api/admin/hemis/test")
def hemis_test(data: dict = Body(default={}), a: dict = Depends(current_admin)):
    cfg = H.clean(data or {}, H.config(svc().st)) | {"enabled": True}
    if not cfg.get("api_url"):
        raise HTTPException(400, "hemis_no_url")
    try:
        return ok(H.Client(cfg, timeout=15).test())
    except H.HemisError as e:
        raise HTTPException(502, f"hemis:{e}") from e


@router.post("/api/admin/hemis/sync")
def hemis_sync(a: dict = Depends(current_admin)):
    try:
        started = _hemis_sync().run_now()
    except H.HemisError as e:
        raise HTTPException(400, f"hemis:{e}") from e
    return ok({"started": started} | {"status": _hemis_status()})


@router.get("/api/admin/hemis/status")
def hemis_status(a: dict = Depends(current_admin)):
    return ok(_hemis_status())


@router.get("/api/portal/hemis")
def portal_hemis(force: bool = False, week: str = "", u: dict = Depends(current_user)):
    """Kabinet: HEMIS dagi ma'lumotlar (talaba — profil, GPA, davomat, baholar, jadval; o'qituvchi — haftalik jadval)."""
    st = svc().st
    cfg = H.config(st)
    if not H.ready(cfg):
        return ok({"enabled": False, "portal_url": cfg.get("portal_url") or ""})
    try:
        wk = date.fromisoformat(week) if week else None
    except ValueError:
        wk = None
    base = {"enabled": True, "portal_url": cfg.get("portal_url") or ""}
    try:
        if u["role"] == "student":
            return ok(base | H.student_data(st, cfg, u, force=force, week=wk))
        if u["role"] in ("teacher", "staff"):
            return ok(base | {"schedule": H.teacher_schedule(st, cfg, u, wk)})
    except H.HemisError as e:
        return ok(base | {"error": str(e)})
    return ok(base)


def hemis_student_login(login: str, password: str) -> dict | None:
    """Sayt paroli mos kelmaganda: talaba HEMIS logini (ID raqami) va paroli bilan. Muvaffaqiyatli bo'lsa — sayt hisobi bog'lanadi/yaratiladi."""
    st = svc().st
    cfg = H.config(st)
    if not (H.ready(cfg) and cfg.get("student_auth") and login and password):
        return None
    c = H.Client(cfg, timeout=15)
    try:
        tok = c.student_login(login, password)
        me = c.get("account/me", token=tok) or {}
    except H.HemisError:
        return None
    hid = str(me.get("id") or "")
    num = str(me.get("student_id_number") or login).strip().lower()
    users = st.list_users("student")
    u = next((x for x in users if hid and str((x.get("data") or {}).get("hemis_id")) == hid), None) or next((x for x in users if x["login"] == num), None)
    prof = H._student_profile(me)  # noqa: SLF001
    gid = (st.kv_get("hemis_groups") or {}).get(str((me.get("group") or {}).get("id") if isinstance(me.get("group"), dict) else ""))
    data = {"hemis_id": hid, "student_no": me.get("student_id_number") or "", "hemis": prof} | ({"phone": me["phone"]} if me.get("phone") else {})
    if u:
        if not u.get("active", True):
            return None
        u = st.update_user(u["id"], password=password, data=data, **({"group_id": gid} if gid else {}))
    else:
        if st.find_user(num):
            return None  # login boshqa rolga band
        u = st.create_user(num, (me.get("full_name") or num)[:120], password, role="student", email=(me.get("email") or "")[:160], group_id=gid, data=data)
    on_user_saved(u, password)
    return st.get_user(u["id"])


# ================================================================== S3
_migr: dict = {"running": False}


@router.get("/api/admin/storage")
def storage_get(a: dict = Depends(current_admin)):
    st = svc().st
    media = st.list_media()
    local = sum(1 for m in media if (st.media_dir / m["filename"]).exists())
    return ok({"config": S3.public(S3.config(st)), "media": {"total": len(media), "local": local}, "migration": st.kv_get("s3_migration") or _migr})


@router.put("/api/admin/storage")
def storage_put(data: dict = Body(...), a: dict = Depends(current_admin)):
    st = svc().st
    cfg = S3.clean(data, S3.config(st))
    if cfg.get("enabled") and not S3.ready(cfg):
        raise HTTPException(400, "s3_incomplete")
    st.kv_put("s3", cfg)
    return storage_get(a)


@router.post("/api/admin/storage/test")
def storage_test(data: dict = Body(default={}), a: dict = Depends(current_admin)):
    cfg = S3.clean(data or {}, S3.config(svc().st)) | {"enabled": True}
    if not S3.ready(cfg):
        raise HTTPException(400, "s3_incomplete")
    try:
        return ok(S3.Client(cfg, timeout=15).test())
    except S3.S3Error as e:
        raise HTTPException(502, f"s3:{e}") from e


@router.post("/api/admin/storage/migrate")
def storage_migrate(a: dict = Depends(current_admin)):
    """Diskdagi barcha media fayllarni S3 ga ko'chirish (fon rejimida); keep_local o'chiq bo'lsa lokal nusxa o'chiriladi."""
    st = svc().st
    cfg = S3.config(st)
    if not S3.ready(cfg):
        raise HTTPException(400, "s3_not_ready")
    if _migr.get("running"):
        return ok({"started": False, "migration": _migr})
    files = [m for m in st.list_media() if (st.media_dir / m["filename"]).exists()]
    private = [p for p in (st.dir / "private").rglob("*") if p.is_file()] if (st.dir / "private").exists() else []

    def run():
        c = S3.Client(cfg)
        _migr.update(running=True, total=len(files) + len(private), done=0, failed=0, error="", started=datetime.now(timezone.utc).isoformat(timespec="seconds"))
        for m in files:
            p = st.media_dir / m["filename"]
            try:
                c.put("media/" + m["filename"], p.read_bytes(), m.get("mime") or "application/octet-stream")
                if not cfg.get("keep_local"):
                    p.unlink()
                _migr["done"] += 1
            except (S3.S3Error, OSError) as e:
                _migr["failed"] += 1
                _migr["error"] = str(e)
        for p in private:
            rel = p.relative_to(st.dir / "private").as_posix()
            try:
                c.put("private/" + rel, p.read_bytes(), "application/octet-stream", "private, no-store")
                if not cfg.get("keep_local"):
                    p.unlink()
                _migr["done"] += 1
            except (S3.S3Error, OSError) as e:
                _migr["failed"] += 1
                _migr["error"] = str(e)
        _migr.update(running=False, finished=datetime.now(timezone.utc).isoformat(timespec="seconds"))
        st.kv_put("s3_migration", dict(_migr))

    threading.Thread(target=run, daemon=True).start()
    return ok({"started": True, "total": len(files) + len(private)})


# ================================================================== yuqori paneldagi qidiruv
@router.get("/api/admin/search")
def admin_search(q: str = "", a: dict = Depends(current_admin)):
    s = svc()
    perms = set(R.perms_of(s.st, a))
    return ok({"items": SR.admin_search(s, a, q[:100], perms, desk=_desk() if ("messages" in perms or "*" in perms) else None)})


@router.get("/api/portal/search")
def portal_search(q: str = "", lang: str = "uz", u: dict = Depends(current_user)):
    s = svc()
    return ok({"items": SR.portal_search(s, u, q[:100], lang if lang in C.LANGS else "uz")})
