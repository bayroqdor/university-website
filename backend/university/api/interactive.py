"""Interaktiv API: professor testlari (onlayn / qog'oz), natijalar va javob varaqlari, «Bilimdon» jonli viktorinasi.

Barcha onlayn testlar va o'yinlar faqat tizimga kirgan foydalanuvchilar uchun (qisqa havola: /t/<kod>, /b/<PIN>).
"""
from __future__ import annotations

import hashlib
import hmac
import io
import re
import secrets
import time
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from .. import interactive as I
from .. import mail as M
from ..render import RenderError
from .deps import current_teacher, current_user, ok, svc

router = APIRouter()


def _store() -> I.Store:
    s = svc()
    st = getattr(s, "_iq", None)
    if st is None or st.st is not s.st:
        st = s._iq = I.Store(s.st)
        s._iq_games = I.Games(st)
    return st


def _games() -> I.Games:
    _store()
    return svc()._iq_games


def _own(tid: str, u: dict) -> dict:
    t = _store().test(tid)
    if not t:
        raise HTTPException(404, "not_found")
    if t["owner_id"] != u["id"] and u["role"] != "admin":
        raise HTTPException(403, "forbidden")
    return t


def _users_min(ids) -> dict[str, dict]:
    """id → {id, role, group_id} — kirish huquqini tekshirish uchun (bitta so'rov)."""
    ids = [x for x in set(ids) if x]
    if not ids:
        return {}
    return {r["id"]: dict(r) for r in svc().st._q("SELECT id, role, group_id FROM users WHERE id = ANY(%s)", (ids,))}


def _allowed_ids(t: dict, ids) -> set[str]:
    """Berilgan foydalanuvchilardan testga hozir ruxsati borlari (bloklangan / guruhdan tashqari — chiqarib tashlanadi)."""
    return {uid for uid, x in _users_min(ids).items() if I.access_ok(t, x)}


def _guard(t: dict, u: dict) -> None:
    if not I.access_ok(t, u):
        raise HTTPException(403, "not_allowed")


def _teacher_groups(u: dict) -> list[dict]:
    """Professorga biriktirilgan guruhlar (joriy semestr dars jadvali bo'yicha); administrator — barcha guruhlar."""
    st = svc().st
    if u["role"] == "admin":
        return [{"id": g["id"], "name": g["name"]} for g in st.acad_list("groups")]
    sem = st.current_semester()
    out: dict[str, dict] = {}
    for c in st.teacher_courses(u["id"], sem["id"]) if sem else []:
        out.setdefault(c["group_id"], {"id": c["group_id"], "name": c["group_name"]})
    return sorted(out.values(), key=lambda g: g["name"])


def _check_groups(u: dict, data: dict, cur: dict | None) -> None:
    """Professor faqat o'ziga biriktirilgan guruhlarni tanlay oladi (avval saqlangan guruhlar o'zgarishsiz qolishi mumkin)."""
    if u["role"] == "admin" or not isinstance(data.get("settings"), dict) or "group_ids" not in data["settings"]:
        return
    new = {str(x) for x in (data["settings"].get("group_ids") or []) if x} - set(((cur or {}).get("settings") or {}).get("group_ids") or [])
    if new - {g["id"] for g in _teacher_groups(u)}:
        raise HTTPException(403, "group_not_assigned")


def _summary(t: dict) -> dict:
    atts = _store().attempts(t["id"])
    ok_ids = _allowed_ids(t, {a["user_id"] for a in atts})
    atts = [a for a in atts if a["user_id"] in ok_ids]
    fin = [a for a in atts if a["finished"]]
    return {k: v for k, v in t.items() if k != "questions"} | {
        "count": len(t["questions"]), "attempts": len(atts), "finished": len(fin),
        "avg": round(sum(a["percent"] or 0 for a in fin) / len(fin), 1) if fin else None, "open": _store().is_open(t)}


# ================================================================== professor: testlar
@router.get("/api/iq/tests")
def iq_tests(u: dict = Depends(current_teacher)):
    return ok({"items": [_summary(t) for t in _store().tests(u["id"])], "groups": _teacher_groups(u)})


@router.get("/api/iq/access-groups")
def iq_access_groups(test: str = "", u: dict = Depends(current_teacher)):
    """Kirish sozlamalari uchun: professorning guruhlari va ulardagi talabalar (rasm bilan).
    Testda avval tanlangan, lekin hozir biriktirilmagan guruh — faqat nomi (olib tashlash uchun), talabalarsiz."""
    st = svc().st
    mine = _teacher_groups(u)
    out = [g | {"assigned": True, "students": [{"id": x["id"], "name": x["name"], "login": x["login"], "photo": (x.get("data") or {}).get("photo") or ""}
                                              for x in st.group_students(g["id"])]} for g in mine]
    if test:
        t = _own(test, u)
        names = {g["id"]: g["name"] for g in st.acad_list("groups")}
        out += [{"id": gid, "name": names.get(gid, "—"), "assigned": False, "students": []}
                for gid in t["settings"].get("group_ids") or [] if gid not in {g["id"] for g in mine}]
    return ok({"items": out})


@router.post("/api/iq/tests")
def iq_create(data: dict = Body(...), u: dict = Depends(current_teacher)):
    _check_groups(u, data, None)
    try:
        return ok(_store().save_test(u["id"], data))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/api/iq/tests/{tid}")
def iq_get(tid: str, u: dict = Depends(current_teacher)):
    return ok(_own(tid, u) | {"open": _store().is_open(_own(tid, u))})


@router.put("/api/iq/tests/{tid}")
def iq_update(tid: str, data: dict = Body(...), u: dict = Depends(current_teacher)):
    t = _own(tid, u)
    _check_groups(u, data, t)
    try:
        return ok(_store().save_test(u["id"], data, t["id"]))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.delete("/api/iq/tests/{tid}")
def iq_delete(tid: str, u: dict = Depends(current_teacher)):
    _store().delete_test(_own(tid, u)["id"])
    return ok({"ok": True})


@router.post("/api/iq/tests/{tid}/status")
def iq_status(tid: str, data: dict = Body(...), u: dict = Depends(current_teacher)):
    t = _own(tid, u)
    st = data.get("status")
    if st not in ("draft", "open", "closed"):
        raise HTTPException(400, "invalid_status")
    if st == "open" and not t["questions"]:
        raise HTTPException(400, "no_questions")
    if st == "closed":  # tugallanmagan urinishlar yopiladi (baholanadi)
        for a in _store().attempts(t["id"]):
            if not a["finished"]:
                _store().finish(t, a)
    return ok(_summary(_store().set_status(t["id"], st)))


@router.get("/api/iq/template.xlsx")
def iq_template(u: dict = Depends(current_teacher)):
    return Response(I.template_xlsx(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="savollar-namuna.xlsx"'})


@router.post("/api/iq/import")
async def iq_import(file: UploadFile = File(...), u: dict = Depends(current_teacher)):
    """Excel dan savollar (saqlanmaydi — muharrirga qaytariladi, professor ko'rib chiqib saqlaydi)."""
    raw = await file.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(400, "too_large")
    try:
        qs, errors = I.import_xlsx(raw)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, "bad_excel") from e
    return ok({"questions": qs, "errors": errors})


def _people(ids: set[str]) -> dict[str, dict]:
    st = svc().st
    groups = {g["id"]: g["name"] for g in st.acad_list("groups")}
    out = {}
    for uid in ids:
        x = st.get_user(uid)
        if x:
            out[uid] = {"id": x["id"], "name": x["name"], "login": x["login"], "group": groups.get(x.get("group_id") or "", ""), "photo": (x.get("data") or {}).get("photo") or "",
                        "email": x.get("email") or ""}
    return out


@router.get("/api/iq/tests/{tid}/results")
def iq_results(tid: str, u: dict = Depends(current_teacher)):
    return ok(_results(tid, u))


def _results(tid: str, u: dict) -> dict:
    t = _own(tid, u)
    s = _store()
    atts = [s.check_deadline(t, a) for a in s.attempts(t["id"])]
    ok_ids = _allowed_ids(t, {a["user_id"] for a in atts})
    atts = [a for a in atts if a["user_id"] in ok_ids]  # bloklangan / guruhdan chiqarilgan talabalar natijalarda ko'rinmaydi
    ppl = _people({a["user_id"] for a in atts})
    rows = []
    for a in atts:
        correct = sum(1 for o in a["ord"] if (q := next((x for x in t["questions"] if x["id"] == o["q"]), None)) and I.grade_one(q, a["answers"].get(q["id"]))[1])
        rows.append({"id": a["id"], "user": ppl.get(a["user_id"]) or {"id": a["user_id"], "name": "—"}, "started": a["started"], "finished": a["finished"],
                     "score": a["score"], "max_score": a["max_score"], "percent": a["percent"], "correct": correct, "total": len(a["ord"]), "sent": a["sent"],
                     "answered": len(a["answers"]), "violations": a["violations"], "closed_reason": a.get("closed_reason"),
                     "events": [e["k"] for e in a["events"]][-50:]})
    rows.sort(key=lambda r: (r["finished"] is None, -(r["percent"] or 0)))
    # hali boshlamaganlar: tanlangan guruhlardagi ruxsat etilgan talabalar
    pending = []
    if t["settings"].get("access") == "groups":
        st, started = svc().st, {a["user_id"] for a in atts}
        blocked = set(t["settings"].get("blocked_student_ids") or [])
        names = {g["id"]: g["name"] for g in st.acad_list("groups")}
        for gid in t["settings"].get("group_ids") or []:
            for x in st.group_students(gid):
                if x["id"] not in started and x["id"] not in blocked:
                    pending.append({"id": x["id"], "name": x["name"], "login": x["login"], "group": names.get(gid, ""), "photo": (x.get("data") or {}).get("photo") or ""})
    return {"test": _summary(t), "rows": rows, "questions": s.stats(t, ok_ids), "pending": pending}


@router.get("/api/iq/tests/{tid}/results.xlsx")
def iq_results_xlsx(tid: str, u: dict = Depends(current_teacher)):
    from openpyxl import Workbook  # noqa: PLC0415
    from openpyxl.styles import Font  # noqa: PLC0415

    data = _results(tid, u)
    t = data["test"]
    wb = Workbook()
    ws = wb.active
    ws.title = "Natijalar"
    ws.append(["№", "Talaba", "Login", "Guruh", "To'g'ri", "Savollar", "Ball", "Maks.", "Foiz", "Boshlangan", "Tugatgan", "Sahifadan chiqish", "Izoh"])
    for c in ws[1]:
        c.font = Font(bold=True)
    for i, r in enumerate(data["rows"], 1):
        ws.append([i, r["user"]["name"], r["user"].get("login", ""), r["user"].get("group", ""), r["correct"], r["total"], r["score"], r["max_score"], r["percent"],
                   (r["started"] or "")[:16].replace("T", " "), (r["finished"] or "")[:16].replace("T", " "), r["violations"],
                   "Qoidabuzarlik sababli yopilgan" if r["closed_reason"] == "violations" else ""])
    for col, w in zip("ABCDEFGHIJKLM", (5, 32, 16, 12, 9, 9, 8, 8, 8, 18, 18, 10, 30)):
        ws.column_dimensions[col].width = w
    buf = io.BytesIO()
    wb.save(buf)
    safe = "".join(ch if ch.isalnum() else "-" for ch in t["title"])[:60] or "test"
    return Response(buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="natijalar-{safe}.xlsx"'})


def _paper_data(t: dict, n: int, teacher: str, only: int | None = None) -> dict:
    uni = svc().uni_l(None)
    variants = I.paper_variants(t, n)
    return {"test": {"id": t["id"], "title": t["title"], "subject": t["settings"].get("subject") or "", "description": t.get("description") or "",
                     "count": len(t["questions"]), "max_score": sum(float(q.get("points") or 1) for q in t["questions"])},
            "university": uni.get("name") or "", "logo": uni.get("logo") or "", "teacher": teacher, "variants": variants, "only": only}


@router.get("/api/iq/tests/{tid}/paper")
def iq_paper(tid: str, variants: int = 2, u: dict = Depends(current_teacher)):
    t = _own(tid, u)
    return ok(_paper_data(t, max(1, min(int(variants or 1), 30)), u["name"]))


# --- qog'oz variantlarini PDF qilib yuklash: server o'zi /print/iq sahifasini Chromium'da chizadi.
# Sahifa ma'lumotni qisqa muddatli imzo bilan oladi (brauzerda sessiya yo'q).
def _paper_secret() -> bytes:
    st = svc().st
    k = st.kv_get("iq_paper_secret")
    if not k:
        k = secrets.token_hex(32)
        st.kv_put("iq_paper_secret", k)
    return str(k).encode()


def _paper_sig(tid: str, n: int, exp: int) -> str:
    return hmac.new(_paper_secret(), f"{tid}:{n}:{exp}".encode(), hashlib.sha256).hexdigest()[:40]


@router.get("/api/iq/paper-print/{tid}")
def iq_paper_print(tid: str, variants: int = 2, exp: int = 0, tk: str = ""):
    n = max(1, min(int(variants or 1), 30))
    if exp < time.time() or not hmac.compare_digest(str(tk), _paper_sig(tid, n, exp)):
        raise HTTPException(403, "forbidden")
    t = _store().test(tid)
    if not t:
        raise HTTPException(404, "not_found")
    owner = _people({t["owner_id"]}).get(t["owner_id"]) or {}
    return ok(_paper_data(t, n, owner.get("name") or ""))


def _safe_name(s: str) -> str:
    s = re.sub(r"[\\/:*?\"<>|\x00-\x1f]+", "", s or "").strip()
    return re.sub(r"\s+", "_", s)[:80] or "test"


@router.get("/api/iq/tests/{tid}/paper.pdf")
def iq_paper_pdf(request: Request, tid: str, variants: int = 2, group: int = 1, u: dict = Depends(current_teacher)):
    """group=K — K-guruh (variant) testi; group=0 — barcha variantlar uchun javoblar kaliti."""
    from .main import _internal_base  # noqa: PLC0415 — aylanma importdan qochish

    t = _own(tid, u)
    n = max(1, min(int(variants or 1), 30))
    g = max(0, min(int(group or 0), n))
    s = svc()
    exp = int(time.time()) + 600
    url = f"{_internal_base(request)}/print/iq/{tid}?v={n}&only={g}&exp={exp}&tk={_paper_sig(tid, n, exp)}"
    key = hashlib.sha1(f"{t['updated']}:{t.get('paper_seed') or ''}".encode()).hexdigest()[:16]
    try:
        data = s.render.cached("pdf", f"iq-{tid}-{n}-{g}", key, "pdf", lambda: s.render.pdf(url))
    except RenderError as e:
        print(f"iq pdf: {e}", flush=True)
        raise HTTPException(503, "pdf_unavailable") from e
    base = _safe_name(t["title"])
    fname = f"{base}_{g}guruh(variant).pdf" if g else f"{base}_javoblar_kaliti.pdf"
    ascii_name = re.sub(r"[^A-Za-z0-9_().-]+", "_", fname)
    return Response(data, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(fname)}", "Cache-Control": "no-cache",
    })


@router.get("/api/iq/attempts/{aid}/sheet")
def iq_attempt_sheet(aid: str, u: dict = Depends(current_teacher)):
    a = _store().attempt(aid)
    if not a:
        raise HTTPException(404, "not_found")
    t = _own(a["test_id"], u)
    return ok(_store().sheet(t, a) | {"user": _people({a["user_id"]}).get(a["user_id"])})


def _sheet_html(sheet: dict, name: str, base: str) -> str:
    rows = []
    for r in sheet["rows"]:
        opts = {o["id"]: o for o in r["options"]}
        letter = {o["id"]: chr(65 + i) for i, o in enumerate(r["options"])}
        if r["type"] == "text":
            mine = escape(str(r["answer"] or "—"))
            right = escape(" / ".join(r["accepted"]))
        else:
            sel = r["answer"] if isinstance(r["answer"], list) else ([r["answer"]] if r["answer"] else [])
            mine = ", ".join(f"{letter.get(x, '?')}) {escape(opts[x]['text'])}" for x in sel if x in opts) or "—"
            right = ", ".join(f"{letter.get(x, '?')}) {escape(opts[x]['text'])}" for x in r["correct"] if x in opts)
        color = "#16a34a" if r["ok"] else "#dc2626"
        rows.append(f'<tr><td style="padding:10px;border-bottom:1px solid #e5e9f2;vertical-align:top;font-weight:700;color:#6b7487;">{r["n"]}</td>'
                    f'<td style="padding:10px;border-bottom:1px solid #e5e9f2;"><div style="font-weight:600;color:#0e1a33;">{escape(r["text"])}</div>'
                    f'<div style="margin-top:6px;color:{color};">{"✓" if r["ok"] else "✗"} Sizning javobingiz: {mine}</div>'
                    + ("" if r["ok"] else f'<div style="color:#16a34a;">To‘g‘ri javob: {right}</div>')
                    + f'</td><td style="padding:10px;border-bottom:1px solid #e5e9f2;text-align:right;white-space:nowrap;color:{color};font-weight:700;">{r["got"]:g}</td></tr>')
    return (f'<p style="font:15px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#33405a;">Hurmatli {escape(name)}! «{escape(sheet["test"]["title"])}» testi bo‘yicha '
            f'natijangiz: <b>{sheet["score"]:g} / {sheet["max_score"]:g}</b> ({sheet["percent"]:g}%).</p>'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;">'
            + "".join(rows) + "</table>"
            f'<p style="margin-top:18px;font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;"><a href="{base}/student/tests">Kabinetda ko‘rish →</a></p>')


@router.post("/api/iq/tests/{tid}/release")
def iq_release(tid: str, u: dict = Depends(current_teacher)):
    """Natijalarni yuborish: har bir talabaga faqat o'zining javob varag'i (kabinetda bildirishnoma + pochta)."""
    from ..mailer import render  # noqa: PLC0415
    from ..storage import _now  # noqa: PLC0415

    s, sv = _store(), svc()
    t = _own(tid, u)
    if t["status"] == "open":
        s.set_status(t["id"], "closed")
    cfg = M.config(sv.st)
    sent = mailed = 0
    atts = s.attempts(t["id"])
    ok_ids = _allowed_ids(t, {a["user_id"] for a in atts})
    for a in atts:
        if a["user_id"] not in ok_ids:
            continue
        a = s.finish(t, a) if not a["finished"] else a
        user = sv.st.get_user(a["user_id"])
        if not user:
            continue
        sheet = s.sheet(t, a)
        sv.st.personal_notice(user["id"], f"Test natijasi: {t['title']} — {sheet['score']:g}/{sheet['max_score']:g} ({sheet['percent']:g}%)",
                              f"«{t['title']}» testi natijalari e’lon qilindi. Javob varag‘ingiz: Kabinet → Testlar.", u["id"])
        addr = user.get("email") or (M.mail_address(user, cfg["domain"]) if M.ready(cfg) else "")
        if addr:
            c = sv.mail.base_ctx(None)
            html = render("notice.html", **c, title=f"Test natijasi: {t['title']}", text="", preheader=f"{sheet['percent']:g}%")
            html = html.replace("<!--extra-->", "")
            body = _sheet_html(sheet, user["name"], c["url"])
            html = html.replace("</h1>", "</h1>" + body, 1)
            sv.mail._async(sv.mail._deliver, "test_result", addr, f"Test natijasi: {t['title']}", html)
            mailed += 1
        with sv.st._tx() as cx:
            cx.execute("UPDATE iq_attempts SET sent=%s WHERE id=%s", (_now(), a["id"]))
        sent += 1
    s.mark(t["id"], released=_now())
    return ok({"sent": sent, "mailed": mailed})


# ================================================================== talaba: test yechish
def _student_test(code: str, u: dict) -> dict:
    t = _store().by_code(code)
    if not t or t["settings"].get("kind") == "game":  # Bilimdon faqat PIN orqali o'ynaladi
        raise HTTPException(404, "not_found")
    _guard(t, u)
    return t


def _attempt_view(t: dict, a: dict) -> dict:
    by = {q["id"]: q for q in t["questions"]}
    qs = [I.public_question(by[o["q"]], o["o"]) for o in a["ord"] if o["q"] in by]
    return {"id": a["id"], "deadline": a.get("deadline"), "started": a["started"], "finished": a["finished"], "answers": a["answers"], "questions": qs,
            "score": a["score"] if (a["finished"] and t["settings"].get("show_score")) or t.get("released") else None,
            "max_score": a["max_score"], "percent": a["percent"] if (a["finished"] and t["settings"].get("show_score")) or t.get("released") else None,
            "secure": I.secure_on(t), "max_leaves": int(t["settings"].get("max_leaves") or 3), "violations": a["violations"], "closed_reason": a.get("closed_reason")}


@router.get("/api/iq/t/{code}")
def iq_public(code: str, u: dict = Depends(current_user)):
    t = _student_test(code, u)
    s = _store()
    mine = [s.check_deadline(t, a) for a in s.attempts(t["id"], u["id"])]
    owner = svc().st.get_user(t["owner_id"])
    return ok({"code": t["code"], "title": t["title"], "description": t.get("description") or "", "subject": t["settings"].get("subject") or "",
               "teacher": (owner or {}).get("name") or "", "count": len(t["questions"]), "time_limit": t["settings"]["time_limit"],
               "attempts_allowed": t["settings"]["attempts"], "open": s.is_open(t), "secure": I.secure_on(t), "max_leaves": int(t["settings"].get("max_leaves") or 3), "status": t["status"], "closes": t.get("closes"), "released": bool(t.get("released")),
               "mine": [{"id": a["id"], "finished": a["finished"], "percent": a["percent"] if t.get("released") or t["settings"].get("show_score") else None} for a in mine]})


@router.post("/api/iq/t/{code}/start")
def iq_start(code: str, u: dict = Depends(current_user)):
    t = _student_test(code, u)
    s = _store()
    live = next((a for a in s.attempts(t["id"], u["id"]) if not a["finished"]), None)
    if not live and not s.is_open(t):
        raise HTTPException(400, "test_closed")
    try:
        a = s.start(t, u["id"])
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return ok(_attempt_view(t, a))


def _my_attempt(aid: str, u: dict) -> tuple[dict, dict]:
    a = _store().attempt(aid)
    if not a or a["user_id"] != u["id"]:
        raise HTTPException(404, "not_found")
    t = _store().test(a["test_id"])
    if not t:
        raise HTTPException(404, "not_found")
    _guard(t, u)  # professor talabani test davomida bloklasa — keyingi javoblar qabul qilinmaydi
    return t, _store().check_deadline(t, a)


@router.put("/api/iq/attempts/{aid}/answers")
def iq_answers(aid: str, data: dict = Body(...), u: dict = Depends(current_user)):
    t, a = _my_attempt(aid, u)
    if a["finished"]:
        raise HTTPException(400, "already_finished")
    a = _store().save_answers(a, data.get("answers") or {})
    return ok({"ok": True, "saved": len(a["answers"])})


@router.post("/api/iq/attempts/{aid}/violation")
def iq_violation(aid: str, data: dict = Body(default={}), u: dict = Depends(current_user)):
    """Himoyalangan rejim: talaba sahifadan chiqdi / skrinshot tugmasini bosdi / nusxalashga urindi.
    Sahifa yopilayotganda ham yuboriladi (fetch keepalive), shuning uchun javob ixcham."""
    t, a = _my_attempt(aid, u)
    if not a["finished"] and isinstance(data.get("answers"), dict):  # test yopilsa ham oxirgi javoblar yo'qolmasin
        a = _store().save_answers(a, data["answers"])
    a = _store().violation(t, a, str(data.get("kind") or "")[:20])
    return ok(_attempt_view(t, a))


@router.post("/api/iq/attempts/{aid}/submit")
def iq_submit(aid: str, data: dict = Body(default={}), u: dict = Depends(current_user)):
    t, a = _my_attempt(aid, u)
    if not a["finished"]:
        if data.get("answers"):
            a = _store().save_answers(a, data["answers"])
        a = _store().finish(t, a)
    return ok(_attempt_view(t, a))


@router.get("/api/iq/my")
def iq_my(u: dict = Depends(current_user)):
    s = _store()
    out = []
    for a in s.attempts(user_id=u["id"]):
        t = s.test(a["test_id"])
        if not t or not I.access_ok(t, u):
            continue
        a = s.check_deadline(t, a)
        vis = bool(t.get("released")) or (a["finished"] and t["settings"].get("show_score"))
        out.append({"id": a["id"], "code": t["code"], "title": t["title"], "subject": t["settings"].get("subject") or "", "started": a["started"],
                    "finished": a["finished"], "released": bool(t.get("released")), "percent": a["percent"] if vis else None,
                    "score": a["score"] if vis else None, "max_score": a["max_score"] if vis else None, "open": s.is_open(t),
                    "closed_reason": a.get("closed_reason")})
    return ok({"items": out})


@router.get("/api/iq/available")
def iq_available(u: dict = Depends(current_user)):
    """Talabaga ochilgan testlar: professor guruhini tanlagan, talaba bloklanmagan, test ochiq va vaqt oralig'ida.
    «Kod orqali hamma» rejimidagi testlar bu ro'yxatga chiqmaydi (ularga havola / kod bilan kiriladi)."""
    return ok({"items": available_tests(u)})


def available_tests(u: dict) -> list[dict]:
    """Talabaga hozir ochiq testlar (kabinet «Testlar» va Telegram bot uchun umumiy)."""
    if u.get("role") != "student" or not u.get("group_id"):
        return []
    s, st = _store(), svc().st
    out = []
    for r in st._q("SELECT * FROM iq_tests WHERE status='open' ORDER BY updated DESC"):
        t = s._t(r)
        cfg = t["settings"]
        if cfg.get("kind") == "game" or cfg.get("access") != "groups" or not s.is_open(t) or not I.access_ok(t, u):
            continue
        mine = [s.check_deadline(t, a) for a in s.attempts(t["id"], u["id"])]
        live = any(not a["finished"] for a in mine)
        if not live and len(mine) >= cfg["attempts"]:
            continue  # urinishlar tugagan — «Mening testlarim» tarixida ko'rinadi
        owner = st.get_user(t["owner_id"])
        out.append({"code": t["code"], "title": t["title"], "subject": cfg.get("subject") or "", "teacher": (owner or {}).get("name") or "",
                    "count": len(t["questions"]), "time_limit": cfg["time_limit"], "closes": t.get("closes"), "attempts_left": cfg["attempts"] - len(mine) + (1 if live else 0),
                    "in_progress": live})
    return out


@router.get("/api/iq/my/{aid}/sheet")
def iq_my_sheet(aid: str, u: dict = Depends(current_user)):
    t, a = _my_attempt(aid, u)
    if not t.get("released"):
        raise HTTPException(403, "not_released")
    return ok(_store().sheet(t, a))


# ================================================================== QR kod (qisqa havolalar uchun)
@router.get("/api/qr.svg")
def qr_svg(request: Request, text: str = ""):
    """Saytning o'z sahifasi uchun QR. Proksi (nginx, Cloudflare) orqasida ichki manzil (127.0.0.1) brauzerdagi domendan farq qiladi —
    shuning uchun domen brauzer ko'rgan Host / X-Forwarded-Host / SITE_URL bilan solishtiriladi; nisbiy yo'l — shu domenga ulanadi."""
    import os  # noqa: PLC0415
    from urllib.parse import urlparse  # noqa: PLC0415

    import segno  # noqa: PLC0415

    from .office import _host, _scheme  # noqa: PLC0415

    text = (text or "").strip()
    if not text or len(text) > 300:
        raise HTTPException(400, "invalid_text")
    if text.startswith("/") and not text.startswith("//"):
        url = f"{_scheme(request)}://{_host(request) or request.url.netloc}{text}"
    else:
        p = urlparse(text)
        hosts = {x.lower() for x in (_host(request), request.headers.get("host") or "", request.url.netloc, urlparse(os.environ.get("SITE_URL", "")).netloc) if x}
        if p.scheme not in ("http", "https") or (p.netloc or "").lower() not in hosts:
            raise HTTPException(400, "invalid_text")
        url = text
    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="svg", border=1, scale=10, dark="#0b1a30", xmldecl=False)
    return Response(buf.getvalue(), media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})


# ================================================================== «Bilimdon» — jonli viktorina
@router.post("/api/iq/tests/{tid}/live")
def live_create(tid: str, u: dict = Depends(current_teacher)):
    t = _own(tid, u)
    try:
        g = _games().create(t, u["id"])
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return ok({"id": g["id"], "pin": g["pin"]})


@router.get("/api/iq/live")
def live_list(u: dict = Depends(current_teacher)):
    gs = _games()
    return ok({"items": [{"id": g["id"], "pin": g["pin"], "test_id": g.get("test_id"), "title": g["state"].get("title"), "phase": g["state"]["phase"], "players": len(g["players"]),
                          "created": g["created"], "finished": g["finished"],
                          "top": gs.ranking(g)[:3]} for g in gs.list_for(u["id"])]})


def _host_game(gid: str, u: dict) -> dict:
    g = _games().get(gid)
    if not g:
        raise HTTPException(404, "not_found")
    if g["host_id"] != u["id"] and u["role"] != "admin":
        raise HTTPException(403, "forbidden")
    return g


@router.get("/api/iq/live/{gid}")
def live_host(gid: str, u: dict = Depends(current_teacher)):
    return ok(_games().view(_host_game(gid, u), None, host=True))


@router.post("/api/iq/live/{gid}/{action}")
def live_action(gid: str, action: str, data: dict = Body(default={}), u: dict = Depends(current_teacher)):
    g = _host_game(gid, u)
    if action == "kick":
        _games().kick(g, str((data or {}).get("user_id") or ""))
    elif action in ("start", "next", "end"):
        _games().advance(g, action)
    else:
        raise HTTPException(400, "invalid_action")
    return ok(_games().view(g, None, host=True))


def _player_game(pin: str, u: dict, player_id: str | None = None) -> dict:
    g = _games().by_pin(pin.strip(), player_id)
    if not g:
        raise HTTPException(404, "game_not_found")
    t = _store().test(g["test_id"])
    if t:  # o'yin testining kirish sozlamalari (guruhlar, bloklangan talabalar) PIN bilan kirishda ham amal qiladi
        _guard(t, u)
    return g


@router.get("/api/iq/play/{pin}")
def play_state(pin: str, u: dict = Depends(current_user)):
    g = _player_game(pin, u, u["id"])
    return ok(_games().view(g, u["id"], host=False) | {"joined": u["id"] in g["players"]})


@router.post("/api/iq/play/{pin}/join")
def play_join(pin: str, u: dict = Depends(current_user)):
    g = _player_game(pin, u)
    try:
        _games().join(g, u)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return ok(_games().view(g, u["id"], host=False) | {"joined": True})


@router.post("/api/iq/play/{pin}/answer")
def play_answer(pin: str, data: dict = Body(...), u: dict = Depends(current_user)):
    g = _player_game(pin, u)
    try:
        res = _games().answer(g, u, data.get("value"))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return ok({"ok": True, "result": {"submitted": True}} | {"me_answer": {"t": res["t"]}})
