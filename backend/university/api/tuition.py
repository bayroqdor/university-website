"""Kontrakt narxlari: barcha yo'nalishlar narxini bitta jadvalda tahrirlash va umumiy sozlamalar (admin → «Kontrakt narxlari»)."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends

from .. import content as C
from .. import tuition as T
from .deps import current_admin, ok, svc

router = APIRouter()


def _overview() -> dict:
    s = svc()
    facs = {f["id"]: f["title"] for f in s.st.list_items("faculty")}
    progs = []
    for it in s.st.list_items("program"):
        progs.append({"id": it["id"], "title": it["title"], "slug": it.get("slug"), "status": it.get("status"), "faculty_id": it.get("faculty_id"),
                      "faculty": facs.get(it.get("faculty_id") or "", ""), "fees": it.get("fees") or [], "fee_note": it.get("fee_note") or "",
                      "fee_note_i18n": {lang: (it.get("i18n") or {}).get(lang, {}).get("fee_note", "") for lang in C.LANGS}})
    return {"settings": T.settings(s.st), "programs": progs, "forms": list(C.FEE_FORMS), "academic_year": T.academic_year(),
            "defaults": {"note": T.DEFAULT_NOTE, "highlights": T.DEFAULT_HIGHLIGHTS}}


@router.get("/api/admin/tuition")
def adm_tuition(a: dict = Depends(current_admin)):
    return ok(_overview())


@router.put("/api/admin/tuition")
def adm_tuition_save(data: dict = Body(...), a: dict = Depends(current_admin)):
    s = svc()
    if isinstance(data.get("settings"), dict):
        s.st.kv_put("tuition", T.clean(data["settings"], T.settings(s.st)))
    for p in (data.get("programs") or [])[:200]:
        it = s.st.get_item(str(p.get("id") or ""))
        if not it or it.get("kind") != "program":
            continue
        patch: dict = {"fees": T.clean_fees(p.get("fees"))}
        if "fee_note" in p:
            patch["fee_note"] = C._str(p.get("fee_note"), 200)
        if isinstance(p.get("fee_note_i18n"), dict):
            i18n = dict(it.get("i18n") or {})
            for lang, v in p["fee_note_i18n"].items():
                if lang in C.LANGS and lang != s.base_lang():
                    i18n[lang] = {**(i18n.get(lang) or {}), "fee_note": C._str(v, 200)}
            patch["i18n"] = i18n
        s.st.patch_item_data(it["id"], **patch)
    return ok(_overview())
