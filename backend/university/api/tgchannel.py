"""Admin → Telegram kanal: qo'lda yoziladigan postlar (yozish, rejalashtirish, yuborish, tahrirlash, o'chirish) va post osti matni."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException

from .. import tg_channel as TC
from .. import tg_publish as TP
from .deps import current_admin, ok, svc
from .desk import _tg_api

router = APIRouter()
log = logging.getLogger("university.telegram")


def _targets() -> list[dict]:
    st = svc().st
    return [TP.public(g) for g in TP.groups(st) if g.get("confirmed") and g["can_post"]]


def _post_or_404(pid: str) -> dict:
    p = TC.get(svc().st, pid)
    if not p:
        raise HTTPException(404, "not_found")
    return p


def _out(pid: str, **extra) -> dict:
    st = svc().st
    return {"post": TC.public(st, TC.get(st, pid))} | extra


@router.get("/api/admin/telegram/posts")
def posts_list(a: dict = Depends(current_admin)):
    s = svc()
    TC.ensure_schema(s.st)
    return ok({"posts": TC.list_posts(s.st), "groups": _targets(), "footer": TC.footer_payload(s), "enabled": _tg_api() is not None,
               "limits": {"text": TC.TEXT_MAX, "caption": TC.CAPTION_MAX, "album": TC.ALBUM_MAX, "footer": TC.FOOTER_MAX}})


@router.get("/api/admin/telegram/posts/{pid}")
def post_get(pid: str, a: dict = Depends(current_admin)):
    _post_or_404(pid)
    return ok(_out(pid))


def _write(data: dict, pid: str | None, a: dict) -> dict:
    s = svc()
    st = s.st
    TC.ensure_schema(st)
    action = str((data or {}).get("action") or "draft")
    if action not in ("draft", "send", "schedule"):
        raise HTTPException(400, "bad_action")
    try:
        cl = TC.clean(data)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    cur = _post_or_404(pid) if pid else None
    if cur and cur["status"] == "sending":
        raise HTTPException(409, "telegram_busy")
    sent = bool(cur) and TC.has_sent(st, pid)
    if sent and action == "schedule":
        raise HTTPException(400, "telegram_already_sent")
    if action in ("send", "schedule") or sent:
        try:
            TC.check_limits(s, cl)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        if not cl["targets"]:
            raise HTTPException(400, "telegram_no_targets")
    if action == "schedule" and (not cl["scheduled_at"] or cl["scheduled_at"] <= datetime.now(timezone.utc).isoformat(timespec="seconds")):
        raise HTTPException(400, "telegram_bad_schedule")
    api = _tg_api()
    if (action == "send" or sent) and api is None:
        raise HTTPException(400, "telegram_disabled")
    if sent:
        bad = TC.plan_edit(st, s, cur | cl)
        if bad:  # Telegram bunday o'zgartira olmaydi — saqlanmaydi, admin yangi xabar sifatida yuborishni tanlaydi
            raise HTTPException(409, {"code": "telegram_edit_incompatible", "chats": bad})
    p = TC.save(st, cl, pid, author=a.get("name") or a.get("login") or "")
    extra: dict = {}
    if sent:
        extra["edit"] = TC.apply_edit(st, s, api, p["id"], log=log.warning)
    if action == "send":
        if not TC.claim(st, p["id"], ("draft", "scheduled", "error", "partial", "sent")):
            raise HTTPException(409, "telegram_busy")
        extra["send"] = TC.deliver(st, s, api, p["id"], log=log.warning)
    elif action == "schedule":
        TC.set_status(st, p["id"], "scheduled")
    elif not sent and p["status"] == "scheduled":
        TC.set_status(st, p["id"], "draft")  # «Qoralama sifatida saqlash» — reja bekor qilinadi
    return _out(p["id"], **extra)


@router.post("/api/admin/telegram/posts")
def post_create(data: dict = Body(...), a: dict = Depends(current_admin)):
    return ok(_write(data, None, a))


@router.put("/api/admin/telegram/posts/{pid}")
def post_update(pid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    return ok(_write(data, pid, a))


@router.post("/api/admin/telegram/posts/{pid}/resend")
def post_resend(pid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    """Telegram tahrirlay olmaydigan o'zgarish: yangi xabar sifatida yuborish (eskisi — tanlansa — o'chiriladi)."""
    s = svc()
    st = s.st
    cur = _post_or_404(pid)
    if cur["status"] == "sending":
        raise HTTPException(409, "telegram_busy")
    try:
        cl = TC.clean(data)
        TC.check_limits(s, cl)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if not cl["targets"]:
        raise HTTPException(400, "telegram_no_targets")
    api = _tg_api()
    if api is None:
        raise HTTPException(400, "telegram_disabled")
    TC.save(st, cl, pid, author=a.get("name") or "")
    failed = TC.delete_messages(st, api, pid) if data.get("delete_old") else []
    with st._tx() as c:
        c.execute("DELETE FROM tg_mpost_msgs WHERE post_id=%s", (pid,))
    if not TC.claim(st, pid, ("draft", "scheduled", "error", "partial", "sent")):
        raise HTTPException(409, "telegram_busy")
    TC.set_status(st, pid, "sending", sent_at=None)
    r = TC.deliver(st, s, api, pid, log=log.warning)
    return ok(_out(pid, send=r, delete_failed=failed))


@router.delete("/api/admin/telegram/posts/{pid}")
def post_delete(pid: str, force: int = 0, a: dict = Depends(current_admin)):
    st = svc().st
    p = _post_or_404(pid)
    if p["status"] == "sending" and not force:
        raise HTTPException(409, "telegram_busy")
    if TC.has_sent(st, pid):
        api = _tg_api()
        if api is None and not force:
            raise HTTPException(400, "telegram_disabled")
        failed = TC.delete_messages(st, api, pid) if api else []
        if failed and not force:
            raise HTTPException(409, {"code": "telegram_delete_failed", "chats": failed})
    TC.remove(st, pid)
    return ok({"ok": True})


@router.put("/api/admin/telegram/footer")
def footer_put(data: dict = Body(...), a: dict = Depends(current_admin)):
    s = svc()
    try:
        TC.save_footer(s.st, None if data.get("reset") else str(data.get("html") or ""))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return ok({"footer": TC.footer_payload(s)})
