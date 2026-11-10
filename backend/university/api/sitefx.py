"""Sayt effektlari: kirishda chiqadigan e'lon oynasi (popup) va bayram bezaklari.

E'lon oynasi — admin «E'lon oynasi» bo'limida: sarlavha va matn (3 tilda: uz / ru / en), rasm, video (yuklangan MP4/WebM yoki YouTube/Vimeo),
tugmalar, ko'rinish davri, qanchalik tez-tez chiqishi va qaysi sahifalarda chiqishi.
Bayram bezaklari — ../festive.py.
"""
from __future__ import annotations

import re
import secrets
from datetime import datetime

from fastapi import APIRouter, Body, Depends

from .. import festive as F
from ..content import LANGS
from ..storage import local_now, local_today
from .deps import current_admin, ok, svc

router = APIRouter()
FREQ = ("always", "session", "daily", "once")
LAYOUTS = ("stack", "split", "cover")


def _url(v) -> str:
    v = str(v or "").strip()[:500]
    return v if re.match(r"^(https?://|/)[^\s<>\"']*$", v) and not v.startswith("//") else ""


def _dt(v) -> str | None:
    v = str(v or "").strip()[:16]
    try:
        return datetime.fromisoformat(v).strftime("%Y-%m-%dT%H:%M") if v else None
    except ValueError:
        return None


def _lang_map(v, n: int) -> dict:
    return {lang: str((v or {}).get(lang) or "").strip()[:n] for lang in LANGS if str((v or {}).get(lang) or "").strip()}


def _clean_popup(p: dict, old: dict | None) -> dict:
    out = {
        "id": re.sub(r"[^a-z0-9]", "", str(p.get("id") or ""))[:16] or secrets.token_hex(5),
        "active": bool(p.get("active")),
        "name": str(p.get("name") or "").strip()[:120],
        "title": _lang_map(p.get("title"), 160),
        "body": _lang_map(p.get("body"), 3000),
        "badge": _lang_map(p.get("badge"), 40),
        "image": _url(p.get("image")),
        "video": _url(p.get("video")),
        "layout": p.get("layout") if p.get("layout") in LAYOUTS else "stack",
        "accent": p.get("accent") if re.fullmatch(r"#[0-9a-fA-F]{6}", str(p.get("accent") or "")) else "",
        "buttons": [],
        "start": _dt(p.get("start")),
        "end": _dt(p.get("end")),
        "frequency": p.get("frequency") if p.get("frequency") in FREQ else "session",
        "delay": max(0, min(60, int(p.get("delay") or 0))),
        "pages": p.get("pages") if p.get("pages") in ("all", "home", "list") else "all",
        "paths": [x for x in (re.sub(r"[^\w/\-]", "", str(s)).strip()[:120] for s in (p.get("paths") or [])[:20]) if x.startswith("/")],
    }
    for b in (p.get("buttons") or [])[:3]:
        url = _url(b.get("url"))
        label = _lang_map(b.get("label"), 60)
        if url and label:
            out["buttons"].append({"label": label, "url": url, "style": "ghost" if b.get("style") == "ghost" else "primary", "new_tab": bool(b.get("new_tab"))})
    # mazmuni o'zgarsa versiya oshadi — «bir marta» ko'rsatilgan e'lon yangilangach yana ko'rinadi
    sig = {k: out[k] for k in ("title", "body", "image", "video", "buttons", "layout", "badge")}
    ver = int((old or {}).get("version") or 0)
    out["version"] = ver + 1 if not old or old.get("sig") != sig else ver
    out["sig"] = sig
    return out


def popups(st) -> list[dict]:
    v = st.kv_get("popups")
    return v if isinstance(v, list) else []


def _loc(d: dict, lang: str) -> str:
    return (d or {}).get(lang) or (d or {}).get("uz") or next((x for x in (d or {}).values() if x), "")


def public_popups(st, lang: str) -> list[dict]:
    """Hozir ko'rinadigan e'lonlar (tanlangan tilda)."""
    now = local_now().strftime("%Y-%m-%dT%H:%M")
    out = []
    for p in popups(st):
        if not p.get("active") or (p.get("start") and now < p["start"]) or (p.get("end") and now > p["end"]):
            continue
        if not (_loc(p.get("title"), lang) or _loc(p.get("body"), lang) or p.get("image") or p.get("video")):
            continue
        out.append({"id": p["id"], "version": p.get("version", 1), "title": _loc(p.get("title"), lang), "body": _loc(p.get("body"), lang),
                    "badge": _loc(p.get("badge"), lang), "image": p.get("image") or "", "video": p.get("video") or "", "layout": p.get("layout") or "stack",
                    "accent": p.get("accent") or "", "frequency": p.get("frequency") or "session", "delay": p.get("delay") or 0,
                    "pages": p.get("pages") or "all", "paths": p.get("paths") or [], "end": p.get("end"),
                    "buttons": [{"label": _loc(b["label"], lang), "url": b["url"], "style": b["style"], "new_tab": b.get("new_tab")} for b in p.get("buttons") or []]})
    return out


def public_festive(lang: str, preview: str | None = None) -> dict | None:
    return F.active(svc().st, local_today(), lang, preview)


# ------------------------------------------------------------------ e'lon oynasi (admin)
@router.get("/api/admin/popups")
def adm_popups(a: dict = Depends(current_admin)):
    return ok({"items": [{k: v for k, v in p.items() if k != "sig"} for p in popups(svc().st)]})


@router.put("/api/admin/popups")
def adm_popups_save(data: dict = Body(...), a: dict = Depends(current_admin)):
    st = svc().st
    old = {p["id"]: p for p in popups(st)}
    items = [_clean_popup(p, old.get(str(p.get("id") or ""))) for p in (data.get("items") or [])[:20] if isinstance(p, dict)]
    st.kv_put("popups", items)
    return ok({"items": [{k: v for k, v in p.items() if k != "sig"} for p in items]})


# ------------------------------------------------------------------ bayram bezaklari
@router.get("/api/admin/festive")
def adm_festive(a: dict = Depends(current_admin)):
    return ok(F.overview(svc().st, local_today()))


@router.put("/api/admin/festive")
def adm_festive_save(data: dict = Body(...), a: dict = Depends(current_admin)):
    st = svc().st
    st.kv_put("festive", F.clean(data))
    return ok(F.overview(st, local_today()))


@router.get("/api/festive")
def festive_public(lang: str = "", preview: str = ""):
    """Saytdagi bezak; `preview` — bayram yoki uslub nomi (admin «Ko'rish» tugmasi `/?festive=navruz` ochadi)."""
    s = svc()
    return ok({"festive": public_festive(s.lang(lang), re.sub(r"[^a-z0-9_]", "", preview)[:30] or None)})
