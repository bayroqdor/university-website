"""Kabinet → Telegram: botni foydalanuvchiga bog'lash (bir martalik havola + QR, zaxira 6 xonali kod), holat va uzish."""
from __future__ import annotations

import io

from fastapi import APIRouter, Depends, HTTPException

from .. import telegram as TG
from .. import tg_student as TS
from .deps import current_user, ok, rate_limit, svc

router = APIRouter()


def _bot_name() -> str:
    cfg = TG.config(svc().st)
    return (cfg.get("username") or "") if TG.ready(cfg) else ""


def _qr(url: str) -> str:
    import segno  # noqa: PLC0415

    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="svg", border=0, dark="#0a2e73", xmldecl=False, svgns=True, omitsize=True, nl=False)
    return buf.getvalue().decode("utf-8")


@router.get("/api/portal/telegram")
def tg_status(u: dict = Depends(current_user)):
    st = svc().st
    return ok({"bot": _bot_name(), "linked": TS.public(st, u["id"]), "pending": TS.pending(st, u["id"])})


@router.post("/api/portal/telegram/link")
def tg_link(u: dict = Depends(current_user)):
    name = _bot_name()
    if not name:
        raise HTTPException(400, "telegram_not_configured")
    rate_limit(f"tglink:{u['id']}", 20, 600)
    r = TS.issue(svc().st, u["id"])
    url = f"https://t.me/{name}?start=link_{r['token']}"
    return ok({"url": url, "code": r["code"], "expires": r["expires"], "ttl": r["ttl"], "qr": _qr(url), "bot": name})


@router.delete("/api/portal/telegram")
def tg_unlink(u: dict = Depends(current_user)):
    st = svc().st
    chat = TS.unlink(st, u["id"])
    if chat:
        TS.notify_unlinked(st, chat)
    return ok({"ok": True, "linked": None})
