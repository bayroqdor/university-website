"""Grant taqsimoti: /grant-redistribution sahifasi.

Ochiq qism: arizalar qabuli (admin «Qabul ochiq» qilganda), e'lon matni, muddat; natijalar e'lon qilinsa — guruhlangan jadval
(va ixtiyoriy PDF qaror). Admin («grants» ruxsati): arizalar jadvali (holat, izoh, filtr), Excel'ga yuklab olish,
natijalarni Excel'dan yuklash (yoki tasdiqlangan arizalardan yasash), ko'rib chiqish va e'lon qilish.
"""
from __future__ import annotations

import io
import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response

from ..content import LANGS
from .deps import current_admin, ip_of, ok, rate_limit, svc

router = APIRouter()
KV = "grants"
COURSES = ("1", "2", "3", "4", "master")
TLANG = ("uz", "ru", "en")
STATUS = ("new", "review", "approved", "rejected")
DEFAULT = {"open": False, "deadline": "", "notice": {}, "intro": {}, "published": False,
           "results": {"title": {}, "intro": {}, "groups": [], "file": "", "updated": ""}}
COURSE_LABEL = {"1": "1-kurs", "2": "2-kurs", "3": "3-kurs", "4": "4-kurs", "master": "Magistratura"}
LANG_LABEL = {"uz": "O‘zbek", "ru": "Rus", "en": "Ingliz"}
STATUS_LABEL = {"new": "Yangi", "review": "Ko‘rib chiqilmoqda", "approved": "Tasdiqlandi", "rejected": "Rad etildi"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _table() -> None:
    st = svc().st
    if getattr(st, "_grants_ready", False):
        return
    ensure_schema(st)
    st._grants_ready = True


def ensure_schema(st) -> None:
    with st._tx() as c:
        c.execute("CREATE TABLE IF NOT EXISTS grant_apps (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, course TEXT NOT NULL, group_name TEXT NOT NULL, "
                  "field TEXT NOT NULL, edu_lang TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', "
                  "note TEXT, ip TEXT, created TEXT NOT NULL, updated TEXT NOT NULL)")


def _l(v, n: int) -> dict:
    return {lang: str((v or {}).get(lang) or "").strip()[:n] for lang in LANGS if str((v or {}).get(lang) or "").strip()}


def settings() -> dict:
    v = svc().st.kv_get(KV) or {}
    out = {**DEFAULT, **v}
    out["results"] = {**DEFAULT["results"], **(v.get("results") or {})}
    return out


def _clean_groups(groups) -> list[dict]:
    out = []
    for g in (groups or [])[:40]:
        cols = [str(c or "").strip()[:80] for c in (g.get("columns") or [])][:12]
        if not cols:
            continue
        rows = []
        for r in (g.get("rows") or [])[:3000]:
            cells = [str(x if x is not None else "").strip()[:200] for x in (r or [])][: len(cols)]
            if any(cells):
                rows.append(cells + [""] * (len(cols) - len(cells)))
        out.append({"title": str(g.get("title") or "").strip()[:200], "columns": cols, "rows": rows})
    return out


def _public_results(s: dict) -> dict | None:
    if not s.get("published"):
        return None
    r = s["results"]
    return {"title": r.get("title") or {}, "intro": r.get("intro") or {}, "groups": r.get("groups") or [], "file": r.get("file") or "", "updated": r.get("updated") or ""}


def accepting(s: dict) -> bool:
    """Ariza qabul qilinadimi: admin ochgan, natijalar hali e'lon qilinmagan va muddat o'tmagan."""
    if not s.get("open") or s.get("published"):
        return False
    return not (s.get("deadline") and datetime.now().date().isoformat() > s["deadline"])


# ------------------------------------------------------------------ ochiq qism
@router.get("/api/grants")
def grants_public():
    s = settings()
    return ok({"open": accepting(s), "published": bool(s.get("published")), "deadline": s["deadline"], "notice": s["notice"], "intro": s["intro"],
               "results": _public_results(s)})


@router.post("/api/grants/apply")
def grants_apply(request: Request, data: dict = Body(...)):
    _table()
    if not accepting(settings()):
        raise HTTPException(400, "closed")
    rate_limit(f"grant:{ip_of(request)}", 5, 3600)
    f = {k: re.sub(r"\s+", " ", str(data.get(k) or "")).strip() for k in ("full_name", "course", "group", "field", "edu_lang", "phone", "email")}
    reason = str(data.get("reason") or "").strip()[:3000]
    err = {}
    if len(f["full_name"]) < 5 or len(f["full_name"].split()) < 2:
        err["full_name"] = "required"
    if f["course"] not in COURSES:
        err["course"] = "required"
    if not f["group"]:
        err["group"] = "required"
    if len(f["field"]) < 3:
        err["field"] = "required"
    if f["edu_lang"] not in TLANG:
        err["edu_lang"] = "required"
    digits = re.sub(r"\D", "", f["phone"])
    if len(digits) == 9:
        digits = "998" + digits
    if not re.fullmatch(r"998\d{9}", digits):
        err["phone"] = "invalid"
    if f["email"] and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", f["email"]):
        err["email"] = "invalid"
    if len(reason) < 10:
        err["reason"] = "required"
    if err:
        raise HTTPException(400, {"fields": err})
    phone = "+" + digits
    st = svc().st
    if st._one("SELECT COUNT(*) FROM grant_apps WHERE phone=%s AND created>=%s", (phone, datetime.now(timezone.utc).date().isoformat())):
        raise HTTPException(400, "duplicate")
    aid = secrets.token_hex(6)
    with st._tx() as c:
        c.execute("INSERT INTO grant_apps(id, full_name, course, group_name, field, edu_lang, phone, email, reason, status, ip, created, updated) "
                  "VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                  (aid, f["full_name"][:160], f["course"], f["group"][:40], f["field"][:160], f["edu_lang"], phone, f["email"].lower()[:160], reason, "new",
                   ip_of(request)[:60], _now(), _now()))
    return ok({"id": aid, "number": st._one("SELECT COUNT(*) FROM grant_apps")})


# ------------------------------------------------------------------ admin
def _apps(status: str = "", q: str = "", course: str = "") -> list[dict]:
    _table()
    where, args = ["1=1"], []
    if status in STATUS:
        where.append("status=%s")
        args.append(status)
    if course in COURSES:
        where.append("course=%s")
        args.append(course)
    rows = [dict(r) for r in svc().st._q(f"SELECT * FROM grant_apps WHERE {' AND '.join(where)} ORDER BY created DESC", tuple(args))]
    if q:
        n = q.casefold()
        rows = [r for r in rows if n in " ".join(str(r.get(k) or "") for k in ("full_name", "group_name", "field", "phone", "email")).casefold()]
    return rows


@router.get("/api/admin/grants")
def grants_admin(status: str = "", q: str = "", course: str = "", a: dict = Depends(current_admin)):
    rows = _apps(status, q, course)
    all_rows = _apps()
    counts = {k: sum(1 for r in all_rows if r["status"] == k) for k in STATUS}
    return ok({"settings": settings(), "items": rows, "counts": counts, "total": len(all_rows)})


@router.put("/api/admin/grants/settings")
def grants_settings(data: dict = Body(...), a: dict = Depends(current_admin)):
    s = settings()
    dl = str(data.get("deadline") or "")[:10]
    s.update(open=bool(data.get("open")), deadline=dl if re.fullmatch(r"\d{4}-\d{2}-\d{2}", dl) else "", notice=_l(data.get("notice"), 1500),
             intro=_l(data.get("intro"), 1500), published=bool(data.get("published")))
    if s["published"]:
        s["open"] = False  # natijalar e'lon qilingach qabul yopiladi (admin'dagi «Qabul ochiq» belgisi ham to'g'ri tursin)
    r = data.get("results")
    if isinstance(r, dict):
        f = str(r.get("file") or "").strip()[:500]
        s["results"] = {"title": _l(r.get("title"), 300), "intro": _l(r.get("intro"), 3000), "groups": _clean_groups(r.get("groups")),
                        "file": f if re.match(r"^(/media/|https://)", f) else "", "updated": _now()}
    svc().st.kv_put(KV, s)
    return ok(s)


@router.patch("/api/admin/grants/apps/{aid}")
def grants_app_update(aid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    _table()
    st = svc().st
    if not st._q("SELECT id FROM grant_apps WHERE id=%s", (aid,)):
        raise HTTPException(404, "not_found")
    sets, args = [], []
    if data.get("status") in STATUS:
        sets.append("status=%s")
        args.append(data["status"])
    if "note" in data:
        sets.append("note=%s")
        args.append(str(data.get("note") or "").strip()[:1000])
    if sets:
        with st._tx() as c:
            c.execute(f"UPDATE grant_apps SET {', '.join(sets)}, updated=%s WHERE id=%s", (*args, _now(), aid))
    return ok(dict(st._q("SELECT * FROM grant_apps WHERE id=%s", (aid,))[0]))


@router.delete("/api/admin/grants/apps/{aid}")
def grants_app_delete(aid: str, a: dict = Depends(current_admin)):
    _table()
    with svc().st._tx() as c:
        c.execute("DELETE FROM grant_apps WHERE id=%s", (aid,))
    return ok({"ok": True})


XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx(headers: list[str], rows: list[list], widths: list[int], title: str) -> bytes:
    from openpyxl import Workbook  # noqa: PLC0415
    from openpyxl.styles import Alignment, Font, PatternFill  # noqa: PLC0415
    from openpyxl.utils import get_column_letter  # noqa: PLC0415

    wb = Workbook()
    ws = wb.active
    ws.title = title[:31]
    ws.append(headers)
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
        c = ws.cell(row=1, column=i)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="0A2E73")
        c.alignment = Alignment(vertical="center", wrap_text=True)
    for r in rows:
        ws.append(r)
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(vertical="top", wrap_text=True)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@router.get("/api/admin/grants/apps.xlsx")
def grants_export(status: str = "", course: str = "", a: dict = Depends(current_admin)):
    rows = _apps(status, "", course)
    data = [[i, r["full_name"], COURSE_LABEL.get(r["course"], r["course"]), r["group_name"], r["field"], LANG_LABEL.get(r["edu_lang"], r["edu_lang"]),
             r["phone"], r.get("email") or "", r["reason"], STATUS_LABEL.get(r["status"], r["status"]), r.get("note") or "", r["created"][:16].replace("T", " ")]
            for i, r in enumerate(rows, 1)]
    body = _xlsx(["№", "F.I.Sh.", "Kurs", "Guruh", "Ta’lim sohasi", "Ta’lim tili", "Telefon", "Email", "Sabab", "Holat", "Izoh", "Sana"],
                 data, [5, 32, 12, 10, 28, 10, 16, 24, 50, 16, 24, 17], "Arizalar")
    return Response(body, media_type=XLSX, headers={"Content-Disposition": 'attachment; filename="grant-arizalar.xlsx"'})


@router.get("/api/admin/grants/results-template.xlsx")
def grants_template(a: dict = Depends(current_admin)):
    rows = [["Bakalavriat (kunduzgi)", "", ""], [1, "Familiya Ism Sharif", "1-24 Iqtisodiyot"], [2, "Familiya Ism Sharif", "9-24 Dasturiy injiniring"],
            ["Bakalavriat (sirtqi)", "", ""], [1, "Familiya Ism Sharif", "S5-24 Matematika"]]
    body = _xlsx(["№", "Familiya, ismi, sharifi", "Guruhi va yo‘nalish nomi"], rows, [6, 40, 36], "Natijalar")
    return Response(body, media_type=XLSX, headers={"Content-Disposition": 'attachment; filename="grant-natijalar-namuna.xlsx"'})


def parse_results(raw: bytes) -> list[dict]:
    """Excel: har bir varaq — alohida jadval; birinchi to'liq qator — ustun sarlavhalari; faqat birinchi katakchasi to'la
    qator (masalan «Bakalavriat (sirtqi)») — shu varaq ichida yangi guruh sarlavhasi."""
    from openpyxl import load_workbook  # noqa: PLC0415

    try:
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, "bad_xlsx") from e
    groups: list[dict] = []
    for ws in wb.worksheets:
        rows = [["" if v is None else (str(int(v)) if isinstance(v, float) and v.is_integer() else str(v)).strip() for v in r] for r in ws.iter_rows(values_only=True)]
        rows = [r for r in rows if any(r)]
        if not rows:
            continue
        head = rows[0]
        while head and not head[-1]:
            head = head[:-1]
        cols = len(head)
        cur = {"title": ws.title if len(wb.worksheets) > 1 else "", "columns": head, "rows": []}
        for r in rows[1:]:
            r = (r + [""] * cols)[:cols]
            filled = [x for x in r if x]
            if len(filled) == 1 and r[0] and not re.fullmatch(r"\d+", r[0]) and cols > 1:
                if cur["rows"]:
                    groups.append(cur)
                cur = {"title": r[0], "columns": head, "rows": []}
                continue
            cur["rows"].append(r)
        if cur["rows"]:
            groups.append(cur)
    if not groups:
        raise HTTPException(400, "empty_xlsx")
    return _clean_groups(groups)


@router.post("/api/admin/grants/results/parse")
async def grants_results_parse(file: UploadFile = File(...), a: dict = Depends(current_admin)):
    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(400, "file_too_large")
    return ok({"groups": parse_results(raw)})


@router.post("/api/admin/grants/results/from-approved")
def grants_results_from_approved(a: dict = Depends(current_admin)):
    """Tasdiqlangan arizalardan natijalar jadvali: kurs bo'yicha guruhlar."""
    rows = [r for r in _apps("approved") if r]
    groups = []
    for c in COURSES:
        xs = sorted([r for r in rows if r["course"] == c], key=lambda r: r["full_name"])
        if xs:
            groups.append({"title": COURSE_LABEL[c], "columns": ["№", "Familiya, ismi, sharifi", "Guruhi", "Ta’lim sohasi"],
                           "rows": [[str(i), r["full_name"], r["group_name"], r["field"]] for i, r in enumerate(xs, 1)]})
    if not groups:
        raise HTTPException(400, "no_approved")
    return ok({"groups": _clean_groups(groups)})


@router.get("/api/admin/grants/stats")
def grants_stats(a: dict = Depends(current_admin)):
    rows = _apps()
    return ok({"by_course": {c: sum(1 for r in rows if r["course"] == c) for c in COURSES}, "total": len(rows)})
