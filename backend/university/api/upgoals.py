"""BRM sahifasi (/upgoals): institutning Barqaror rivojlanish maqsadlariga hissasi.

Maqsadlarning o'zi (nomi, mohiyati, raqamlar, «nima qila olaman») — frontend/src/site/upgoals/data.ts da (3 tilda, BMTTD risolasi asosida).
Bu yerda — admin to'ldiradigan qism (kv «upgoals»): ustuvor maqsadlar, kirish matni, har bir maqsad bo'yicha institut hissasi,
faoliyat/tadbirlar (sarlavha, matn, sana, rasm, havola) va hujjatlar (siyosat, hisobot — PDF yoki havola, bir nechta maqsadga bog'lanadi).
"""
from __future__ import annotations

import re
import secrets

from fastapi import APIRouter, Body, Depends

from ..content import LANGS
from .deps import current_admin, ok, svc

router = APIRouter()
KV = "upgoals"
GOALS = range(1, 18)


def _l(v, n: int) -> dict:
    return {lang: str((v or {}).get(lang) or "").strip()[:n] for lang in LANGS if str((v or {}).get(lang) or "").strip()}


def _url(v) -> str:
    v = str(v or "").strip()[:500]
    return v if re.match(r"^(https?://|/)[^\s<>\"']*$", v) and not v.startswith("//") else ""


def _id(v) -> str:
    return re.sub(r"[^a-z0-9]", "", str(v or ""))[:16] or secrets.token_hex(5)


def _goals(v) -> list[int]:
    out = []
    for x in v or []:
        try:
            n = int(x)
        except (TypeError, ValueError):
            continue
        if n in GOALS and n not in out:
            out.append(n)
    return out


def clean(data: dict) -> dict:
    out: dict = {"intro": _l(data.get("intro"), 2000), "goals": {}, "docs": []}
    if data.get("priority") is not None:
        out["priority"] = _goals(data.get("priority"))
    for k, g in (data.get("goals") or {}).items():
        try:
            n = int(k)
        except ValueError:
            continue
        if n not in GOALS or not isinstance(g, dict):
            continue
        items = []
        for it in (g.get("items") or [])[:60]:
            title = _l(it.get("title"), 200)
            if not title:
                continue
            date = str(it.get("date") or "")[:10]
            items.append({"id": _id(it.get("id")), "title": title, "body": _l(it.get("body"), 3000),
                          "date": date if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) else "", "image": _url(it.get("image")), "url": _url(it.get("url"))})
        items.sort(key=lambda x: x["date"], reverse=True)
        entry = {"text": _l(g.get("text"), 3000), "items": items}
        if entry["text"] or items:
            out["goals"][str(n)] = entry
    for d in (data.get("docs") or [])[:100]:
        title, url = _l(d.get("title"), 200), _url(d.get("url"))
        if title and url:
            out["docs"].append({"id": _id(d.get("id")), "title": title, "url": url, "goals": _goals(d.get("goals"))})
    return out


def load(st) -> dict:
    v = st.kv_get(KV)
    return v if isinstance(v, dict) else {"intro": {}, "goals": {}, "docs": []}


@router.get("/api/upgoals")
def upgoals_public():
    return ok(load(svc().st))


@router.get("/api/admin/upgoals")
def upgoals_admin(a: dict = Depends(current_admin)):
    return ok(load(svc().st))


@router.put("/api/admin/upgoals")
def upgoals_save(data: dict = Body(...), a: dict = Depends(current_admin)):
    v = clean(data)
    svc().st.kv_put(KV, v)
    return ok(v)
