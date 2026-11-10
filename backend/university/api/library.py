"""Kutubxona API.

/api/lib/*            — katalog (mehmon ham ko'radi), o'quvchi amallari (bron, uzaytirish, baho, izoh, javon, o'qish/tinglash),
                        o'qituvchi tavsiya ro'yxatlari. Elektron fayllar faqat vaqtinchalik tokenli manzil orqali ochiladi.
/api/admin/library/*  — kutubxonachi («library» ruxsati): fond, nusxalar, fayllar, berish/qaytarish, navbat, jarimalar,
                        izohlar moderatsiyasi, inventarizatsiya, statistika, hisobotlar; sozlamalar va audit — «library_settings».
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import threading
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response

from .. import lib_files as LF
from .. import lib_xlsx as LX
from .. import roles as R
from ..library import LibError, Library, access_value, is_teacher
from .deps import current_admin, current_user, ip_of, ok, optional_user, rate_limit, svc

router = APIRouter()


def lib() -> Library:
    s = svc()
    lb = getattr(s, "_library", None)
    if lb is None or lb.st is not s.st:
        lb = s._library = Library(s.st)
    return lb


def _err(e: LibError) -> HTTPException:
    return HTTPException(400, str(e))


def _files_dir() -> Path:
    p = svc().st.dir / "library"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _can(a: dict, perm: str) -> bool:
    perms = R.perms_of(svc().st, a)
    return perm in perms


def _need_settings(a: dict) -> None:
    if not _can(a, "library_settings"):
        raise HTTPException(403, "no_permission")


# ------------------------------------------------------------------ foydalanuvchi ma'lumotlari
def _user_faculties(u: dict) -> set[str]:
    st = svc().st
    out = set((u.get("data") or {}).get("faculty_ids") or [])
    if u.get("group_id"):
        r = st._q("SELECT faculty_id FROM groups WHERE id=%s", (u["group_id"],))
        if r and r[0]["faculty_id"]:
            out.add(r[0]["faculty_id"])
    return out


def _file_allowed(u: dict | None, f: dict) -> bool:
    """Kirish huquqi: «public» — hamma (mehmon ham); «registered» — har kirgan foydalanuvchi; «teachers» — faqat o'qituvchilar;
    «faculty» — faqat ko'rsatilgan kafedra(lar)."""
    acc = access_value(f.get("access"))
    if acc == "public":
        return True
    if not u:
        return False
    if u.get("role") == "admin":
        return True
    if acc == "teachers":
        return is_teacher(u)
    if acc == "faculty":
        fids = set(_jl(f.get("faculty_ids")))
        return not fids or bool(_user_faculties(u) & fids)
    return True


def _jl(v) -> list:
    import json  # noqa: PLC0415

    if isinstance(v, list):
        return v
    try:
        return json.loads(v or "[]")
    except ValueError:
        return []


def _file(fid: str) -> dict:
    r = svc().st._q("SELECT * FROM lib_files WHERE id=%s", (fid,))
    if not r:
        raise HTTPException(404, "not_found")
    return dict(r[0]) | {"faculty_ids": _jl(r[0]["faculty_ids"]), "toc": _jl(r[0]["toc"])}


def _public_file(f: dict, u: dict | None) -> dict:
    """Ochiq JSON: access ∈ {"public", "registered"} (o'qish uchun kirish kerakmi), audience ∈ {"all", "teachers", "faculty"}
    (kirganlar orasida kim), can_read — hozirgi ko'ruvchi (mehmon yoki foydalanuvchi) o'qiy oladimi."""
    acc = access_value(f.get("access"))
    can = _file_allowed(u, f)
    return {"id": f["id"], "kind": f["kind"], "title": f["title"] or "", "pages": f["pages"], "duration": f["duration"], "size": f["size"],
            "access": "public" if acc == "public" else "registered", "audience": acc if acc in ("teachers", "faculty") else "all",
            "allowed": can, "can_read": can, "sort": f["sort"]}


# ------------------------------------------------------------------ tokenli fayl manzili (15 daqiqa)
TOKEN_TTL = 15 * 60
ANON = "anon"  # mehmon (tizimga kirmagan) uchun berilgan token — faqat «public» fayllarga
ANON_OPEN_LIMIT = (40, 300.0)  # mehmon: 5 daqiqada ko'pi bilan 40 marta fayl ochish (IP bo'yicha)


def _secret() -> bytes:
    st = svc().st
    k = st.kv_get("lib_token_secret")
    if not k:
        import secrets  # noqa: PLC0415

        k = secrets.token_hex(32)
        st.kv_put("lib_token_secret", k)
    return str(k).encode()


def _sign(fid: str, uid: str, exp: int) -> str:
    return hmac.new(_secret(), f"{fid}:{uid}:{exp}".encode(), hashlib.sha256).hexdigest()[:32]


def file_token(fid: str, uid: str) -> str:
    exp = int(time.time()) + TOKEN_TTL
    return f"{fid}.{uid}.{exp}.{_sign(fid, uid, exp)}"


@router.get("/api/lib/stream/{token}")
def lib_stream(token: str, request: Request):
    """Fayl oqimi (Range so'rovlari bilan — PDF.js va audio qism-qism yuklaydi).
    Token 15 daqiqa amal qiladi; muddati o'tgach faqat o'sha foydalanuvchining o'z sessiyasi bilan davom etadi (havolani boshqaga berib bo'lmaydi)."""
    try:
        fid, uid, exp_s, sig = token.split(".")
        exp = int(exp_s)
    except ValueError as e:
        raise HTTPException(404, "not_found") from e
    if not hmac.compare_digest(sig, _sign(fid, uid, exp)):
        raise HTTPException(403, "forbidden")
    f = _file(fid)
    if uid == ANON:
        # mehmon tokeni: fayl hamon «hammaga ochiq» bo'lsa amal qiladi (muddati o'tsa ham — fayl baribir ochiq), yopilsa — darhol bekor
        if access_value(f["access"]) != "public":
            raise HTTPException(403, "file_forbidden")
    elif exp < time.time():
        u = optional_user(request)
        if not u or u["id"] != uid:
            raise HTTPException(403, "token_expired")
    path = _files_dir() / f["path"]
    if not path.exists():
        raise HTTPException(404, "not_found")
    ext = f["path"].rsplit(".", 1)[-1]
    return FileResponse(path, media_type=LF.MIME.get(ext, "application/octet-stream"), headers={
        "Cache-Control": "private, max-age=900", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes"})


# ------------------------------------------------------------------ bildirishnomalar
TEXTS = {
    "issued": ("Kitob berildi: {title}", "«{title}» sizga berildi. Qaytarish muddati: {due}."),
    "due3": ("Qaytarish muddati yaqin: {title}", "«{title}» kitobini {due} gacha qaytaring (3 kun qoldi). Navbat bo'lmasa kabinetdan muddatni uzaytirishingiz mumkin."),
    "due1": ("Ertaga qaytarish kerak: {title}", "«{title}» kitobini ertaga ({due}) qaytaring."),
    "overdue": ("Muddat o'tdi: {title}", "«{title}» kitobini qaytarish muddati {due} da tugagan ({days} kun kechikish). Har kechikkan kun uchun jarima hisoblanadi."),
    "reservation_ready": ("Bron qilingan kitob tayyor: {title}", "«{title}» siz uchun ajratildi. {expires} gacha kutubxonadan olib keting, aks holda navbat keyingisiga o'tadi."),
    "reservation_expired": ("Bron muddati tugadi: {title}", "«{title}» uchun bron muddati tugadi, navbat keyingi o'quvchiga o'tdi."),
    "review_approved": ("Izohingiz tasdiqlandi", "«{title}» kitobiga yozgan izohingiz e'lon qilindi."),
    "review_rejected": ("Izohingiz rad etildi", "«{title}» kitobiga yozgan izohingiz e'lon qilinmadi. Sabab: {reason}"),
}


def notify(uid: str, kind: str, **kw) -> None:
    """Foydalanuvchi tanlagan kanallar: tizim ichida (kabinet bildirishnomalari), email, Telegram."""
    s = svc()
    u = s.st.get_user(uid)
    if not u or kind not in TEXTS:
        return
    title, body = (x.format(**{k: v for k, v in kw.items()}) for x in TEXTS[kind])
    p = lib().prefs(uid)
    ch = set(p["channels"])
    try:
        if "inapp" in ch:
            s.st.personal_notice(uid, "📚 " + title, body, push=False)  # Telegram — quyidagi alohida kanal (foydalanuvchi tanlovi)
        if "email" in ch:
            _email(u, title, body)
        if "telegram" in ch and p.get("tg_chat"):
            from .desk import bot  # noqa: PLC0415

            bot().send(p["tg_chat"], f"📚 <b>{title}</b>\n{body}")
    except Exception as e:  # noqa: BLE001 — bildirishnoma xatosi asosiy amalni to'xtatmasin
        print(f"library notify: {e}", flush=True)


def _email(u: dict, title: str, body: str) -> None:
    from .. import mail as M  # noqa: PLC0415
    from ..mailer import render  # noqa: PLC0415

    s = svc()
    cfg = M.config(s.st)
    addr = u.get("email") or (M.mail_address(u, cfg["domain"]) if M.ready(cfg) else "")
    if not addr:
        return
    c = s.mail.base_ctx(None)
    html = render("notice.html", **c, title=title, text=body, preheader=body[:90]).replace("<!--extra-->", "")
    s.mail._async(s.mail._deliver, "library", addr, title, html)


def _librarians() -> list[dict]:
    st = svc().st
    return [u for u in st.list_users("admin", active=True) if "library" in R.perms_of(st, u)]


def flush_events() -> None:
    L = lib()
    for kind, uid, data in L.take_events():
        b = L.book(data.get("book_id") or "") or {}
        title = b.get("title") or ""
        if kind == "reservation_ready" and uid:
            notify(uid, "reservation_ready", title=title, expires=_fmt_dt(data.get("expires")))
        elif kind == "reservation_expired" and uid:
            notify(uid, "reservation_expired", title=title)
        elif kind == "review_moderated" and uid:
            notify(uid, "review_approved" if data.get("status") == "approved" else "review_rejected", title=title, reason=data.get("reason") or "—")
        elif kind in ("review_pending", "review_reported"):
            for lb in _librarians():
                if lb.get("email"):
                    _email(lb, "Yangi izoh moderatsiyada" if kind == "review_pending" else "Izohga shikoyat",
                           f"«{title}» kitobiga {'yangi izoh yozildi' if kind == 'review_pending' else 'izohga shikoyat tushdi'}. Admin panel → Kutubxona → Izohlar.")


def _fmt_dt(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        d = datetime.fromisoformat(iso)
        return d.astimezone().strftime("%d.%m.%Y %H:%M")
    except ValueError:
        return iso[:10]


def _fmt_d(iso: str) -> str:
    try:
        return date.fromisoformat(iso[:10]).strftime("%d.%m.%Y")
    except ValueError:
        return iso


def _after(fn):
    threading.Thread(target=fn, daemon=True).start()


# ------------------------------------------------------------------ fon vazifalari: eslatmalar, navbat muhlati, ertalabki ro'yxat
def run_jobs() -> dict:
    L = lib()
    res = {"expired": L.expire_reservations(), "due3": 0, "due1": 0, "overdue": 0, "digest": False}
    for days, kind in ((3, "due3"), (1, "due1")):
        for ln in L.due_soon(days):
            if L.sent_once(f"{kind}:{ln['id']}"):
                notify(ln["user_id"], kind, title=ln["title"], due=_fmt_d(ln["due"]))
                res[kind] += 1
    for ln in L.overdue():
        n = ln["days"]
        if n >= 1 and L.sent_once(f"over:{ln['id']}:{(n - 1) // 3}"):  # muddat o'tgan kun va keyin har 3 kunda
            notify(ln["user_id"], "overdue", title=ln["title"], due=_fmt_d(ln["due"]), days=n)
            res["overdue"] += 1
    now = datetime.now().astimezone()
    if now.hour >= 8 and L.sent_once(f"digest:{now.date().isoformat()}"):
        od = L.overdue()
        if od:
            lines = "\n".join(f"• {x['title']} — {x['user']['name']} ({x['inv']}), {x['days']} kun" for x in od[:100])
            for lb in _librarians():
                if lb.get("email"):
                    _email(lb, f"Muddati o'tgan kitoblar: {len(od)} ta", lines)
        res["digest"] = True
    flush_events()
    res["covers"] = L.backfill_covers(limit=300)  # muqovasiz kitoblar (masalan, Excel importdan keyin) — avtomatik muqova
    return res


_JOB = {"thread": None, "stop": threading.Event()}
_COVERS = {"thread": None}


def backfill_covers_async() -> None:
    """Muqovasiz kitoblarga avtomatik muqova — fon oqimida (bir vaqtda bittadan)."""
    t = _COVERS["thread"]
    if t and t.is_alive():
        return

    def run():
        try:
            n = lib().backfill_covers()
            if n:
                print(f"library covers: {n} ta avtomatik muqova", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"library covers: {e}", flush=True)

    _COVERS["thread"] = threading.Thread(target=run, daemon=True, name="library-covers")
    _COVERS["thread"].start()


def start_jobs(interval: int = 900) -> None:
    if os.environ.get("SITE_LIBRARY_JOBS", "1") == "0" or (_JOB["thread"] and _JOB["thread"].is_alive()):
        return

    def loop():
        while not _JOB["stop"].wait(30):
            try:
                run_jobs()
                from .. import backup  # noqa: PLC0415

                backup.daily(svc().st, lib())
            except Exception as e:  # noqa: BLE001
                print(f"library jobs: {e}", flush=True)
            _JOB["stop"].wait(interval)

    _JOB["stop"].clear()
    backfill_covers_async()  # bir martalik: avvalgi bazalardagi muqovasiz kitoblar
    _JOB["thread"] = threading.Thread(target=loop, daemon=True, name="library-jobs")
    _JOB["thread"].start()


def stop_jobs() -> None:
    _JOB["stop"].set()


# ================================================================== KATALOG (hamma uchun)
@router.get("/api/lib/home")
def lib_home(request: Request):
    u = optional_user(request)
    L = lib()
    out = {"facets": L.facets(), "popular": L.popular(), "newest": L.newest(), "top_rated": L.top_rated(), "teacher_picks": L.teacher_picks(), "user": None}
    if u:
        out["user"] = {"id": u["id"], "name": u["name"], "role": u["role"]}
        out["for_you"] = L.for_user(u["id"])
        out["continue"] = L.continue_reading(u["id"])
        # fakultet va kurs bo'yicha eng mashhurlar
        st = svc().st
        if u.get("group_id"):
            g = st._q("SELECT faculty_id, course FROM groups WHERE id=%s", (u["group_id"],))
            if g:
                peers = [r["id"] for r in st._q("SELECT u.id FROM users u JOIN groups g ON g.id=u.group_id WHERE g.faculty_id IS NOT DISTINCT FROM %s AND g.course=%s", (g[0]["faculty_id"], g[0]["course"]))]
                out["peers"] = L.popular(user_ids=peers)
    return ok(out)


@router.get("/api/lib/search")
def lib_search(q: str = "", category: str = "", faculty: str = "", lang: str = "", year_from: int | None = None, year_to: int | None = None,
               format: str = "", available: bool = False, sort: str = "", page: int = 1, size: int = 24):
    t0 = time.time()
    res = lib().search(q[:200], category, faculty, lang, year_from, year_to, format, available, sort, page, size)
    return ok(res | {"ms": round((time.time() - t0) * 1000)})


@router.get("/api/lib/books/{bid}")
def lib_book(bid: str, request: Request):
    u = optional_user(request)
    L = lib()
    b = L.book(bid)
    if not b:
        raise HTTPException(404, "not_found")
    files = [_public_file(dict(r) | {"faculty_ids": _jl(r["faculty_ids"])}, u) for r in svc().st._q("SELECT * FROM lib_files WHERE book_id=%s ORDER BY kind, sort, created", (bid,))]
    out = {"book": {k: v for k, v in b.items() if k not in ("created_by", "sort_title", "price", "cover_sig")}, "availability": L.availability(bid), "files": files,
           "rating": L.rating_info(bid, u["id"] if u else None), "also": L.also_taken(bid), "similar": L.similar(bid), "me": None,
           "lists": [{"teacher": x["teacher"], "subject": x["subject_name"]} for x in L.course_lists() if any(i["book"]["id"] == bid for i in x["items"])][:10]}
    if u:
        st = svc().st
        loan = st._q("SELECT id, due, renewals FROM lib_loans WHERE book_id=%s AND user_id=%s AND returned IS NULL", (bid, u["id"]))
        res = st._q("SELECT id, status, created, expires, book_id FROM lib_reservations WHERE book_id=%s AND user_id=%s AND status IN ('waiting','ready')", (bid, u["id"]))
        progress = {r["file_id"]: {"percent": r["percent"], "loc": r["loc"]} for r in st._q("SELECT * FROM lib_progress WHERE user_id=%s AND book_id=%s", (u["id"], bid))}
        out["me"] = {"loan": dict(loan[0]) if loan else None, "reservation": (dict(res[0]) | {"position": L.position(dict(res[0]))}) if res else None,
                     "shelves": L.book_shelves(u["id"], bid), "progress": progress, "problems": L.check_can_borrow(u)}
    return ok(out)


@router.get("/api/lib/books/{bid}/reviews")
def lib_reviews(bid: str, request: Request):
    return ok({"items": lib().reviews(bid, optional_user(request))})


# ================================================================== O'QUVCHI AMALLARI
def _act(fn):
    try:
        return fn()
    except LibError as e:
        raise _err(e) from e


@router.post("/api/lib/books/{bid}/reserve")
def lib_reserve(bid: str, u: dict = Depends(current_user)):
    r = _act(lambda: lib().reserve(u, bid))
    _after(flush_events)
    return ok(r)


@router.delete("/api/lib/reservations/{rid}")
def lib_reserve_cancel(rid: str, u: dict = Depends(current_user)):
    _act(lambda: lib().cancel_reservation(u, rid))
    _after(flush_events)
    return ok({"ok": True})


@router.post("/api/lib/loans/{lid}/renew")
def lib_renew(lid: str, u: dict = Depends(current_user)):
    return ok(_act(lambda: lib().renew(u, lid)))


@router.post("/api/lib/books/{bid}/rate")
def lib_rate(bid: str, data: dict = Body(...), u: dict = Depends(current_user)):
    return ok(_act(lambda: lib().rate(u["id"], bid, int(data.get("stars") or 0))) | {"mine": int(data.get("stars") or 0)})


@router.post("/api/lib/books/{bid}/reviews")
def lib_review_add(bid: str, data: dict = Body(...), u: dict = Depends(current_user)):
    r = _act(lambda: lib().add_review(u, bid, data.get("text") or "", int(data["stars"]) if data.get("stars") else None,
                                       data.get("parent_id") or None, bool(data.get("anonymous"))))
    _after(flush_events)
    return ok(r)


@router.put("/api/lib/reviews/{rid}")
def lib_review_edit(rid: str, data: dict = Body(...), u: dict = Depends(current_user)):
    return ok(_act(lambda: lib().edit_review(u, rid, data.get("text") or "")))


@router.delete("/api/lib/reviews/{rid}")
def lib_review_delete(rid: str, u: dict = Depends(current_user)):
    _act(lambda: lib().delete_review(u, rid))
    return ok({"ok": True})


@router.post("/api/lib/reviews/{rid}/vote")
def lib_review_vote(rid: str, data: dict = Body(...), u: dict = Depends(current_user)):
    r = _act(lambda: lib().vote(u["id"], rid, data.get("kind") or "", data.get("note") or ""))
    _after(flush_events)
    return ok(r)


def _my_subjects(u: dict) -> tuple[list[str], list[str]]:
    st = svc().st
    sem = st.current_semester() if hasattr(st, "current_semester") else None
    if not sem:
        return [], []
    if u["role"] == "student" and u.get("group_id"):
        ls = st.lessons(semester_id=sem["id"], group_id=u["group_id"])
    elif is_teacher(u):
        ls = st.lessons(semester_id=sem["id"], teacher_id=u["id"])
    else:
        ls = []
    ids = sorted({x["subject_id"] for x in ls})
    names = [r["name"] for r in st._q("SELECT name FROM subjects WHERE id = ANY(%s)", (ids,))] if ids else []
    return ids, names


@router.get("/api/lib/me")
def lib_me(u: dict = Depends(current_user)):
    L = lib()
    ids, names = _my_subjects(u)
    lists = [x for x in L.course_lists() if x["subject_id"] in ids or (not x["subject_id"] and x["subject_name"].lower() in {n.lower() for n in names})] if (ids or names) else []
    s = L.settings()
    return ok({"loans": L.user_loans(u["id"]), "reservations": L.user_reservations(u["id"]), "fines": L.fines(uid=u["id"]),
               "unpaid": L.unpaid(u["id"]), "shelves": L.shelves(u["id"]), "continue": L.continue_reading(u["id"]), "stats": L.reading_stats(u["id"]),
               "for_you": L.for_user(u["id"]), "course_lists": lists, "prefs": L.prefs(u["id"]), "problems": L.check_can_borrow(u),
               "rules": {"limit": L.limit_of(u), "days": L.loan_days(u), "renew_days": s["renew_days"], "max_renewals": s["max_renewals"],
                         "fine_per_day": s["fine_per_day"], "currency": s["currency"], "hold_days": s["hold_days"]},
               "telegram_bot": _tg_username()})


@router.get("/api/lib/me/history")
def lib_me_history(u: dict = Depends(current_user)):
    return ok(lib().history(u["id"]) | {"marks": lib().all_marks(u["id"])})


@router.post("/api/lib/shelves")
def lib_shelf_create(data: dict = Body(...), u: dict = Depends(current_user)):
    return ok(_act(lambda: lib().shelf_create(u["id"], data.get("name") or "")))


@router.delete("/api/lib/shelves/{sid}")
def lib_shelf_delete(sid: str, u: dict = Depends(current_user)):
    lib().shelf_delete(u["id"], sid)
    return ok({"ok": True})


@router.post("/api/lib/shelves/{sid}/items")
def lib_shelf_add(sid: str, data: dict = Body(...), u: dict = Depends(current_user)):
    _act(lambda: lib().shelf_add(u["id"], sid, str(data.get("book_id") or "")))
    return ok({"shelves": lib().book_shelves(u["id"], str(data.get("book_id") or ""))})


@router.delete("/api/lib/shelves/{sid}/items/{bid}")
def lib_shelf_remove(sid: str, bid: str, u: dict = Depends(current_user)):
    lib().shelf_remove(u["id"], sid, bid)
    return ok({"shelves": lib().book_shelves(u["id"], bid)})


@router.put("/api/lib/prefs")
def lib_prefs(data: dict = Body(...), u: dict = Depends(current_user)):
    return ok(lib().save_prefs(u["id"], data))


def _tg_username() -> str:
    from .. import telegram as TG  # noqa: PLC0415

    cfg = TG.config(svc().st)
    return cfg.get("username") or "" if cfg.get("enabled") else ""


@router.post("/api/lib/prefs/telegram")
def lib_prefs_telegram(u: dict = Depends(current_user)):
    name = _tg_username()
    if not name:
        raise HTTPException(400, "telegram_not_configured")
    from .. import tg_student  # noqa: PLC0415

    tok = tg_student.issue(svc().st, u["id"])["token"]  # umumiy bog'lash (kabinet → Telegram bilan bir xil)
    return ok({"url": f"https://t.me/{name}?start=link_{tok}"})


# ------------------------------------------------------------------ elektron fayl: ochish, o'qish joyi, belgilar, yuklab olish
@router.post("/api/lib/files/{fid}/open")
def lib_file_open(fid: str, request: Request):
    """O'qish/tinglashni boshlash: vaqtinchalik tokenli oqim manzili. «public» fayl — mehmonga ham (IP bo'yicha cheklov bilan),
    qolganlari — faqat tizimga kirganlarga (401 login_required)."""
    u = optional_user(request)
    f = _file(fid)
    if not u:
        if access_value(f["access"]) != "public":
            raise HTTPException(401, "login_required")
        rate_limit(f"libopen:{ip_of(request)}", *ANON_OPEN_LIMIT)
        return ok(_anon_open(f))
    if not _file_allowed(u, f):
        raise HTTPException(403, "file_forbidden")
    L = lib()
    b = L.book(f["book_id"]) or {}
    siblings = [_public_file(dict(r) | {"faculty_ids": _jl(r["faculty_ids"])}, u) for r in svc().st._q(
        "SELECT * FROM lib_files WHERE book_id=%s AND kind=%s ORDER BY sort, created", (f["book_id"], f["kind"]))]
    if not L.progress(u["id"], fid):
        L.save_progress(u["id"], f, "", 0)
    return ok({"file": _public_file(f, u) | {"toc": f["toc"]}, "url": f"/api/lib/stream/{file_token(fid, u['id'])}", "ttl": TOKEN_TTL,
               "book": {"id": b.get("id"), "title": b.get("title"), "authors": b.get("authors"), "cover": b.get("cover")},
               "progress": L.progress(u["id"], fid), "marks": L.marks(u["id"], fid), "siblings": siblings,
               "download": bool(L.settings()["allow_download"]) and f["kind"] == "pdf",
               "progress_all": {r["file_id"]: {"loc": r["loc"], "percent": r["percent"]} for r in svc().st._q(
                   "SELECT * FROM lib_progress WHERE user_id=%s AND book_id=%s", (u["id"], f["book_id"]))}})


def _anon_open(f: dict) -> dict:
    L = lib()
    b = L.book(f["book_id"]) or {}
    siblings = [_public_file(dict(r) | {"faculty_ids": _jl(r["faculty_ids"])}, None) for r in svc().st._q(
        "SELECT * FROM lib_files WHERE book_id=%s AND kind=%s ORDER BY sort, created", (f["book_id"], f["kind"]))]
    return {"file": _public_file(f, None) | {"toc": f["toc"]}, "url": f"/api/lib/stream/{file_token(f['id'], ANON)}", "ttl": TOKEN_TTL,
            "book": {"id": b.get("id"), "title": b.get("title"), "authors": b.get("authors"), "cover": b.get("cover")},
            "progress": None, "marks": [], "siblings": siblings, "guest": True,
            "download": bool(L.settings()["allow_download"]) and f["kind"] == "pdf", "progress_all": {}}


@router.put("/api/lib/files/{fid}/progress")
def lib_file_progress(fid: str, data: dict = Body(...), u: dict = Depends(current_user)):
    f = _file(fid)
    if not _file_allowed(u, f):
        raise HTTPException(403, "file_forbidden")
    p = lib().save_progress(u["id"], f, str(data.get("loc") or ""), float(data.get("percent") or 0), int(data.get("seconds") or 0), int(data.get("pages") or 0))
    return ok(p)


@router.get("/api/lib/files/{fid}/marks")
def lib_marks(fid: str, u: dict = Depends(current_user)):
    return ok({"items": lib().marks(u["id"], fid)})


@router.post("/api/lib/files/{fid}/marks")
def lib_mark_add(fid: str, data: dict = Body(...), u: dict = Depends(current_user)):
    f = _file(fid)
    if not _file_allowed(u, f):
        raise HTTPException(403, "file_forbidden")
    return ok(_act(lambda: lib().add_mark(u["id"], fid, data)))


@router.put("/api/lib/marks/{mid}")
def lib_mark_edit(mid: str, data: dict = Body(...), u: dict = Depends(current_user)):
    return ok(_act(lambda: lib().update_mark(u["id"], mid, data)))


@router.delete("/api/lib/marks/{mid}")
def lib_mark_delete(mid: str, u: dict = Depends(current_user)):
    lib().delete_mark(u["id"], mid)
    return ok({"ok": True})


@router.get("/api/lib/files/{fid}/download")
def lib_file_download(fid: str, request: Request):
    u = optional_user(request)
    f = _file(fid)
    if not u and access_value(f["access"]) != "public":
        raise HTTPException(401, "login_required")
    if not _file_allowed(u, f):
        raise HTTPException(403, "file_forbidden")
    if f["kind"] != "pdf" or not lib().settings()["allow_download"]:
        raise HTTPException(403, "download_disabled")
    if not u:
        rate_limit(f"libdl:{ip_of(request)}", 10, 600.0)
    # suv belgisi: kirgan foydalanuvchi — ismi bilan; mehmon — umumiy yozuv
    uni = svc().uni()
    label = f"{u['name'] if u else (uni.get('abbr') or 'University')} · {date.today().strftime('%d.%m.%Y')} · {(uni.get('abbr') or 'University')} kutubxonasi"
    try:
        data = LF.watermark_pdf(str(_files_dir() / f["path"]), label)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, "watermark_failed") from e
    b = lib().book(f["book_id"]) or {}
    lib().audit(u, "file.download", "file", fid, None, {"user": u["id"] if u else ANON})
    name = re.sub(r"[^\w.-]+", "_", (b.get("title") or "kitob"))[:80] + ".pdf"
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=\"kitob.pdf\"; filename*=UTF-8''{quote(name)}"})


# ------------------------------------------------------------------ o'qituvchi tavsiya ro'yxatlari
def _teacher(u: dict = Depends(current_user)) -> dict:
    if not is_teacher(u):
        raise HTTPException(403, "forbidden")
    return u


@router.get("/api/lib/course-lists")
def lib_lists(u: dict = Depends(_teacher)):
    st = svc().st
    sem = st.current_semester()
    courses = st.teacher_courses(u["id"], sem["id"]) if sem else []
    subjects = {c["subject_id"]: c["subject"] for c in courses}
    semesters = [dict(r) for r in st._q("SELECT id, name FROM semesters ORDER BY created DESC LIMIT 20")] if st.has_table("semesters") else []
    return ok({"items": lib().course_lists(teacher_id=u["id"]), "subjects": [{"id": k, "name": v} for k, v in subjects.items()],
               "semester": sem, "semesters": semesters})


@router.post("/api/lib/course-lists")
def lib_list_add(data: dict = Body(...), u: dict = Depends(_teacher)):
    return ok(_act(lambda: lib().save_course_list(u, data)))


@router.put("/api/lib/course-lists/{lid}")
def lib_list_save(lid: str, data: dict = Body(...), u: dict = Depends(_teacher)):
    return ok(_act(lambda: lib().save_course_list(u, data, lid)))


@router.post("/api/lib/course-lists/{lid}/copy")
def lib_list_copy(lid: str, data: dict = Body(...), u: dict = Depends(_teacher)):
    return ok(_act(lambda: lib().copy_course_list(u, lid, str(data.get("semester_id") or ""))))


@router.delete("/api/lib/course-lists/{lid}")
def lib_list_delete(lid: str, u: dict = Depends(_teacher)):
    lib().delete_course_list(u, lid)
    return ok({"ok": True})


# ================================================================== KUTUBXONACHI
@router.get("/api/admin/library/books")
def adm_books(q: str = "", category: str = "", faculty: str = "", lang: str = "", format: str = "", sort: str = "new", page: int = 1, a: dict = Depends(current_admin)):
    return ok(lib().search(q, category, faculty, lang, None, None, format, False, sort, page, 50) | {"facets": lib().facets()})


@router.get("/api/admin/library/books/{bid}")
def adm_book(bid: str, a: dict = Depends(current_admin)):
    L = lib()
    b = L.book(bid)
    if not b:
        raise HTTPException(404, "not_found")
    st = svc().st
    copies = L.copies(bid)
    holders = {}
    for r in st._q("SELECT l.copy_id, l.id, l.user_id, l.issued, l.due FROM lib_loans l WHERE l.book_id=%s AND l.returned IS NULL", (bid,)):
        u = st.get_user(r["user_id"]) or {}
        holders[r["copy_id"]] = {"loan_id": r["id"], "issued": r["issued"], "due": r["due"], "user": {"id": u.get("id"), "name": u.get("name") or "—", "login": u.get("login") or ""}}
    if holders:
        L.audit(a, "view.holders", "book", bid, None, {"copies": len(holders)})  # kimda ekanini ko'rish jurnalga yoziladi
    files = [dict(r) | {"faculty_ids": _jl(r["faculty_ids"]), "toc": None} for r in st._q("SELECT * FROM lib_files WHERE book_id=%s ORDER BY kind, sort", (bid,))]
    return ok({"book": b, "copies": [c | {"holder": holders.get(c["id"])} for c in copies], "files": files, "availability": L.availability(bid),
               "rating": L.rating_info(bid), "queue": [x for x in L.queue_all() if x["book_id"] == bid]})


def _fetch_cover(data: dict, cur: dict | None = None) -> dict:
    """Muqova havola bo'lib kelsa (masalan, ISBN bo'yicha to'ldirishdan) — rasm yuklab olinib media sifatida saqlanadi;
    yuklab bo'lmasa — muqova bo'sh qoladi va avtomatik chiziladi."""
    url = str(data.get("cover") or "").strip()
    if not re.match(r"^https?://", url, re.I) or url == ((cur or {}).get("cover") or ""):
        return data
    from .. import lib_cover as LC  # noqa: PLC0415
    from ..media import FetchError, MediaError, safe_fetch, store_media  # noqa: PLC0415

    try:
        raw, _name = safe_fetch(url, timeout=15)
        data = data | {"cover": store_media(svc().st, LC.normalize(raw), "muqova.jpg")["url"]}
    except (FetchError, MediaError, LC.CoverError, OSError) as e:
        print(f"library cover fetch: {e}", flush=True)
        data = data | {"cover": (cur or {}).get("cover") or ""}
    return data


@router.post("/api/admin/library/books")
def adm_book_add(data: dict = Body(...), a: dict = Depends(current_admin)):
    data = _fetch_cover(data)
    b = _act(lambda: lib().save_book(data, a))
    if int(data.get("copies") or 0) > 0:
        _act(lambda: lib().add_copies(b["id"], int(data["copies"]), location=str(data.get("location") or ""), price=b.get("price"), actor=a))
    return ok(b)


@router.put("/api/admin/library/books/{bid}")
def adm_book_save(bid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    data = _fetch_cover(data, lib().book(bid))
    return ok(_act(lambda: lib().save_book(data, a, bid)))


@router.delete("/api/admin/library/books/{bid}")
def adm_book_delete(bid: str, a: dict = Depends(current_admin)):
    paths = _act(lambda: lib().delete_book(bid, a))
    for p in paths:
        (_files_dir() / p).unlink(missing_ok=True)
    return ok({"ok": True})


# --- muqova: rasm yuklash, elektron nashr sahifasi (PDF) / EPUB muqovasi, avtomatik (kitob ma'lumotidan)
def _store_cover(raw: bytes, bid: str, a: dict, how: str) -> dict:
    from .. import lib_cover as LC  # noqa: PLC0415
    from ..media import MediaError, store_media  # noqa: PLC0415

    try:
        m = store_media(svc().st, LC.normalize(raw), "muqova.jpg")
    except (MediaError, LC.CoverError) as e:
        raise HTTPException(400, str(e)) from e
    return _act(lambda: lib().set_cover(bid, m["url"], a, how=how))


def _page_image(f: dict, page: int, width: int) -> tuple[bytes, str]:
    """Elektron nashrdan muqova uchun rasm: PDF — tanlangan sahifa (1 dan), EPUB — ichidagi muqova rasmi."""
    from .. import lib_cover as LC  # noqa: PLC0415

    path = _files_dir() / f["path"]
    if not path.exists():
        raise HTTPException(404, "not_found")
    if f["kind"] == "pdf":
        pages = int(f.get("pages") or 0)
        if page < 1 or (pages and page > pages):
            raise HTTPException(400, "bad_page")
        try:
            return LC.pdf_page(str(path), page, width), "page"
        except LC.CoverError as e:
            raise HTTPException(422 if str(e) != "render_unavailable" else 503, str(e)) from e
    if f["kind"] == "epub":
        raw = LF.epub_cover(str(path))
        if not raw:
            raise HTTPException(404, "epub_no_cover")
        try:
            return LC.normalize(raw), "epub"
        except LC.CoverError as e:
            raise HTTPException(422, str(e)) from e
    raise HTTPException(400, "not_ebook")


@router.post("/api/admin/library/books/{bid}/cover")
async def adm_book_cover(bid: str, file: UploadFile = File(...), a: dict = Depends(current_admin)):
    """Muqova sifatida rasm yuklash (JPG/PNG/WEBP…): EXIF bo'yicha buriladi, ko'pi bilan 900 px, JPEG; kesilmaydi."""
    if not lib().book(bid):
        raise HTTPException(404, "not_found")
    raw = await file.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(400, "too_large")
    return ok(_store_cover(raw, bid, a, "upload"))


@router.post("/api/admin/library/books/{bid}/cover/page")
def adm_book_cover_page(bid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    """Muqova — kitobning elektron nashridan: {"file_id", "page"} (PDF sahifasi; EPUB uchun sahifa e'tiborsiz — ichki muqova)."""
    f = _file(str(data.get("file_id") or ""))
    if f["book_id"] != bid:
        raise HTTPException(404, "not_found")
    try:
        page = int(data.get("page") or 1)
    except (TypeError, ValueError) as e:
        raise HTTPException(400, "bad_page") from e
    raw, how = _page_image(f, page, 1000)
    return ok(_store_cover(raw, bid, a, f"{how}:{page}" if how == "page" else how))


@router.post("/api/admin/library/books/{bid}/cover/auto")
def adm_book_cover_auto(bid: str, a: dict = Depends(current_admin)):
    """Muqovani kitob ma'lumotidan (nom, kichik sarlavha, muallif, yil, nashriyot, janr) chizish; keyin nom/muallif o'zgarsa — o'zi yangilanadi."""
    from .. import lib_cover as LC  # noqa: PLC0415
    from ..media import MediaError, store_media  # noqa: PLC0415

    L = lib()
    b = L.book(bid)
    if not b:
        raise HTTPException(404, "not_found")
    try:
        m = store_media(svc().st, LC.render(b), "kutubxona-muqova.jpg")
    except (MediaError, OSError, ValueError) as e:
        raise HTTPException(500, "cover_failed") from e
    out = L.set_cover(bid, m["url"], a, auto=True, sig=LC.signature(b))
    L.audit(a, "book.cover", "book", bid, {"cover": b.get("cover")}, {"cover": out["cover"], "how": "auto"})
    return ok(out)


@router.get("/api/admin/library/files/{fid}/preview")
def adm_file_preview(fid: str, page: int = 1, a: dict = Depends(current_admin)):
    """Muqova tanlash oynasi uchun kichik ko'rinish: PDF sahifasi yoki EPUB muqovasi (JPEG)."""
    raw, _how = _page_image(_file(fid), page, 420)
    return Response(raw, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=600"})


ISBN_TRANSPORT = None  # testlarda httpx.MockTransport


@router.get("/api/admin/library/isbn/{isbn}")
def adm_isbn(isbn: str, a: dict = Depends(current_admin)):
    """ISBN bo'yicha avtomatik to'ldirish: avval Google Books, topilmasa OpenLibrary."""
    import httpx  # noqa: PLC0415

    from ..library import isbn_clean  # noqa: PLC0415

    code = isbn_clean(isbn)
    if not code:
        raise HTTPException(400, "bad_isbn")
    out: dict = {}
    kw = {"timeout": 12.0, "follow_redirects": True}
    if ISBN_TRANSPORT is not None:
        kw["transport"] = ISBN_TRANSPORT
    try:
        with httpx.Client(**kw) as c:
            r = c.get("https://www.googleapis.com/books/v1/volumes", params={"q": f"isbn:{code}"})
            items = (r.json().get("items") or []) if r.status_code == 200 else []
            if items:
                v = items[0].get("volumeInfo") or {}
                out = {"title": v.get("title") or "", "subtitle": v.get("subtitle") or "", "authors": v.get("authors") or [], "publisher": v.get("publisher") or "",
                       "year": int(str(v.get("publishedDate") or "0")[:4] or 0) or None, "pages": v.get("pageCount"), "lang": (v.get("language") or "")[:2],
                       "annotation": re.sub(r"<[^>]+>", "", v.get("description") or ""), "categories": v.get("categories") or [],
                       "cover": ((v.get("imageLinks") or {}).get("thumbnail") or "").replace("http://", "https://"), "source": "Google Books"}
            if not out.get("title"):
                r = c.get("https://openlibrary.org/api/books", params={"bibkeys": f"ISBN:{code}", "format": "json", "jscmd": "data"})
                d = (r.json() or {}).get(f"ISBN:{code}") if r.status_code == 200 else None
                if d:
                    out = {"title": d.get("title") or "", "subtitle": d.get("subtitle") or "", "authors": [x.get("name") for x in d.get("authors") or [] if x.get("name")],
                           "publisher": ", ".join(x.get("name") for x in d.get("publishers") or [] if x.get("name")),
                           "year": int(m.group(0)) if (m := re.search(r"\d{4}", d.get("publish_date") or "")) else None,
                           "pages": d.get("number_of_pages"), "categories": [x.get("name") for x in (d.get("subjects") or [])[:5] if x.get("name")],
                           "cover": (d.get("cover") or {}).get("large") or (d.get("cover") or {}).get("medium") or "", "source": "OpenLibrary"}
    except (httpx.HTTPError, ValueError) as e:
        raise HTTPException(502, "isbn_lookup_failed") from e
    if not out.get("title"):
        raise HTTPException(404, "isbn_not_found")
    return ok(out | {"isbn": code})


# --- nusxalar
@router.post("/api/admin/library/books/{bid}/copies")
def adm_copies_add(bid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    invs = [x.strip() for x in re.split(r"[;,\n]+", str(data.get("invs") or "")) if x.strip()]
    out = _act(lambda: lib().add_copies(bid, int(data.get("count") or 0) or (0 if invs else 1), invs, str(data.get("location") or ""), data.get("price"), a))
    _after(flush_events)
    return ok({"items": out})


@router.put("/api/admin/library/copies/{cid}")
def adm_copy_save(cid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    r = _act(lambda: lib().update_copy(cid, data, a))
    _after(flush_events)
    return ok(r)


@router.delete("/api/admin/library/copies/{cid}")
def adm_copy_delete(cid: str, a: dict = Depends(current_admin)):
    _act(lambda: lib().delete_copy(cid, a))
    return ok({"ok": True})


@router.get("/api/admin/library/copies/{cid}/history")
def adm_copy_history(cid: str, a: dict = Depends(current_admin)):
    lib().audit(a, "view.copy_history", "copy", cid)
    return ok({"items": lib().copy_history(cid)})


@router.get("/api/admin/library/copy")
def adm_copy_lookup(code: str, a: dict = Depends(current_admin)):
    L = lib()
    cp = L.copy_by_code(code)
    if not cp:
        raise HTTPException(404, "copy_not_found")
    b = L.book(cp["book_id"]) or {}
    loan = svc().st._q("SELECT * FROM lib_loans WHERE copy_id=%s AND returned IS NULL", (cp["id"],))
    holder = None
    if loan:
        u = svc().st.get_user(loan[0]["user_id"]) or {}
        holder = {"loan": dict(loan[0]), "user": {"id": u.get("id"), "name": u.get("name") or "—", "login": u.get("login") or ""}}
    res = svc().st._q("SELECT * FROM lib_reservations WHERE copy_id=%s AND status='ready'", (cp["id"],))
    reserved_for = None
    if res:
        u = svc().st.get_user(res[0]["user_id"]) or {}
        reserved_for = {"id": u.get("id"), "name": u.get("name") or "—", "expires": res[0]["expires"]}
    return ok({"copy": cp, "book": {"id": b.get("id"), "title": b.get("title"), "authors": b.get("authors"), "cover": b.get("cover")}, "holder": holder, "reserved_for": reserved_for})


# --- elektron fayllar
def register_file(bid: str, fid: str, kind: str, dest: Path, size: int, title: str, orig: str, sort: int = 0, duration: float | None = None,
                  access: str = "registered", fids: list[str] | None = None, actor: dict | None = None, wait_index: bool = False) -> None:
    """Saqlangan faylni fondga qo'shadi: sahifa/mundarija, EPUB muqovasi (kitob muqovasi yo'q yoki avtomatik bo'lsa), matn indeksi.
    Fayl `_files_dir()/<bid>/<fid>.<ext>` da turadi; xato bo'lsa — o'chiriladi va LF.FileError ko'tariladi."""
    import json  # noqa: PLC0415

    L = lib()
    pages, toc, text, cover = None, [], "", None
    try:
        if kind == "pdf":
            info = LF.pdf_info(str(dest))
            pages, toc = info["pages"], info["toc"]
        elif kind == "epub":
            info = LF.epub_info(str(dest))
            pages, toc, text, cover = info["chapters"], info["toc"], info["text"], info["cover"]
    except LF.FileError:
        dest.unlink(missing_ok=True)
        raise
    name = dest.relative_to(_files_dir()).as_posix()
    with svc().st._tx() as c:
        c.execute("INSERT INTO lib_files(id, book_id, kind, title, sort, path, orig, size, pages, duration, access, faculty_ids, toc, created) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                  (fid, bid, kind, title[:200], sort, name, orig[:200], size, pages, duration or None,
                   access_value(access), json.dumps(fids or []), json.dumps(toc, ensure_ascii=False), datetime.now(timezone.utc).isoformat(timespec="seconds")))
    b = L.book(bid) or {}
    if cover and (not b.get("cover") or b.get("cover_auto")):
        from .. import lib_cover as LC  # noqa: PLC0415
        from ..media import MediaError, store_media  # noqa: PLC0415

        try:
            m = store_media(svc().st, LC.normalize(cover), "muqova.jpg")
            L.set_cover(bid, m["url"], actor, how="epub")
        except (MediaError, LC.CoverError):
            pass
    L.audit(actor, "file.upload", "book", bid, None, {"file": fid, "kind": kind, "size": size})

    def index():
        try:
            t = text
            if kind == "pdf":
                t = LF.pdf_text(LF.pdf_info(str(dest)))
            L.index_file_text(bid, fid, t)
        except Exception as e:  # noqa: BLE001
            print(f"library index: {e}", flush=True)

    if kind == "epub" or (kind == "pdf" and wait_index):
        index()
    elif kind == "pdf":
        threading.Thread(target=index, daemon=True).start()  # katta PDF matni fon rejimida indekslanadi


@router.post("/api/admin/library/books/{bid}/files")
async def adm_file_upload(bid: str, file: UploadFile = File(...), title: str = Form(""), access: str = Form("registered"), faculty_ids: str = Form(""),
                          duration: float = Form(0), sort: int = Form(0), a: dict = Depends(current_admin)):
    import json  # noqa: PLC0415
    import uuid  # noqa: PLC0415

    L = lib()
    if not L.book(bid):
        raise HTTPException(404, "not_found")
    limit = int(L.settings()["max_file_mb"]) * 1024 * 1024
    head = await file.read(512)
    try:
        kind, ext = LF.sniff(head, file.filename or "")
    except LF.FileError as e:
        raise HTTPException(400, str(e)) from e
    fid = uuid.uuid4().hex[:12]
    name = f"{bid}/{fid}.{ext}"
    dest = _files_dir() / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    size = len(head)
    with open(dest, "wb") as out:
        out.write(head)
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(400, "file_too_large")
            out.write(chunk)
    fids = [x for x in re.split(r"[;,]+", faculty_ids) if x.strip()]
    try:
        register_file(bid, fid, kind, dest, size, title.strip()[:200] or (file.filename or "")[:200], file.filename or "", sort, duration, access, fids, a)
    except LF.FileError as e:
        raise HTTPException(400, str(e)) from e
    return ok(_file(fid) | {"toc": None})


@router.put("/api/admin/library/files/{fid}")
def adm_file_save(fid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    import json  # noqa: PLC0415

    f = _file(fid)
    acc = access_value(data.get("access"), access_value(f["access"])) if data.get("access") else access_value(f["access"])
    with svc().st._tx() as c:
        c.execute("UPDATE lib_files SET title=%s, access=%s, faculty_ids=%s, sort=%s, duration=COALESCE(%s, duration) WHERE id=%s",
                  (str(data.get("title", f["title"]) or "")[:200], acc, json.dumps([str(x) for x in (data.get("faculty_ids", f["faculty_ids"]) or [])][:20]),
                   int(data.get("sort", f["sort"]) or 0), data.get("duration"), fid))
    lib().audit(a, "file.update", "file", fid, {"access": f["access"]}, {"access": acc})
    return ok(_file(fid) | {"toc": None})


@router.delete("/api/admin/library/files/{fid}")
def adm_file_delete(fid: str, a: dict = Depends(current_admin)):
    f = _file(fid)
    with svc().st._tx() as c:
        c.execute("DELETE FROM lib_files WHERE id=%s", (fid,))
        c.execute("DELETE FROM lib_progress WHERE file_id=%s", (fid,))
        c.execute("DELETE FROM lib_marks WHERE file_id=%s", (fid,))
        c.execute("DELETE FROM lib_fts WHERE book_id=%s AND src=%s", (f["book_id"], f"file:{fid}"))
    (_files_dir() / f["path"]).unlink(missing_ok=True)
    lib().audit(a, "file.delete", "file", fid, {"kind": f["kind"], "title": f["title"]}, None)
    return ok({"ok": True})


@router.post("/api/admin/library/files/{fid}/open")
def adm_file_open(fid: str, a: dict = Depends(current_admin)):
    f = _file(fid)
    b = lib().book(f["book_id"]) or {}
    siblings = [_public_file(dict(r) | {"faculty_ids": _jl(r["faculty_ids"])}, a) for r in svc().st._q(
        "SELECT * FROM lib_files WHERE book_id=%s AND kind=%s ORDER BY sort, created", (f["book_id"], f["kind"]))]
    return ok({"file": _public_file(f, a) | {"toc": f["toc"]}, "url": f"/api/lib/stream/{file_token(fid, a['id'])}", "ttl": TOKEN_TTL,
               "book": {"id": b.get("id"), "title": b.get("title"), "authors": b.get("authors"), "cover": b.get("cover")},
               "progress": None, "marks": [], "siblings": siblings, "download": False, "preview": True, "progress_all": {}})


# --- berish / qaytarish: kitob nomi bo'yicha takliflar
@router.get("/api/admin/library/desk/suggest")
def adm_desk_suggest(q: str = "", mode: str = "issue", user_id: str = "", prefer: str = "", a: dict = Depends(current_admin)):
    """Kamida 3 belgi; lotin/kirill farqsiz (katalog qidiruvi kabi), ko'pi bilan 8 ta kitob.
    mode=issue — bo'sh (yoki shu o'quvchiga ajratilgan) nusxalar; mode=return — qo'lda turgan nusxalar (user_id — faqat shu o'quvchidagilar,
    prefer — barchasi, lekin shu o'quvchidagilar birinchi)."""
    mode = "return" if mode == "return" else "issue"
    return ok({"items": lib().suggest(q[:200], mode, user_id.strip() or None, 8, prefer.strip() or None)})


# --- o'quvchini topish va berish / qaytarish
def _reader_summary(u: dict) -> dict:
    L = lib()
    st = svc().st
    grp = st._q("SELECT name, course FROM groups WHERE id=%s", (u["group_id"],)) if u.get("group_id") else []
    return {"user": {"id": u["id"], "name": u["name"], "login": u["login"], "role": u["role"], "email": u.get("email") or "",
                     "photo": (u.get("data") or {}).get("photo") or "", "student_no": (u.get("data") or {}).get("student_no") or "",
                     "group": grp[0]["name"] if grp else "", "course": grp[0]["course"] if grp else None, "active": bool(u.get("active", 1))},
            "loans": L.user_loans(u["id"]), "reservations": L.user_reservations(u["id"]), "unpaid": L.unpaid(u["id"]),
            "fines": [f for f in L.fines(uid=u["id"]) if f["status"] == "unpaid"], "problems": L.check_can_borrow(u),
            "limit": L.limit_of(u), "days": L.loan_days(u)}


@router.get("/api/admin/library/readers")
def adm_readers(q: str = "", a: dict = Depends(current_admin)):
    q = q.strip()
    st = svc().st
    if not q:
        return ok({"items": []})
    rows = st._q("SELECT * FROM users WHERE role IN ('student','teacher','staff') AND (lower(name) LIKE %s OR lower(login) LIKE %s OR lower(email) LIKE %s "
                 "OR data::jsonb->>'student_no'=%s OR id=%s) ORDER BY name LIMIT 20",
                 (f"%{q.lower()}%", f"%{q.lower()}%", f"%{q.lower()}%", q, q))
    out = []
    for r in rows:
        u = st.get_user(r["id"])
        grp = st._q("SELECT name FROM groups WHERE id=%s", (u["group_id"],)) if u.get("group_id") else []
        out.append({"id": u["id"], "name": u["name"], "login": u["login"], "role": u["role"], "group": grp[0]["name"] if grp else "",
                    "student_no": (u.get("data") or {}).get("student_no") or "", "photo": (u.get("data") or {}).get("photo") or ""})
    return ok({"items": out})


@router.get("/api/admin/library/readers/{uid}")
def adm_reader(uid: str, a: dict = Depends(current_admin)):
    u = svc().st.get_user(uid)
    if not u:
        raise HTTPException(404, "not_found")
    lib().audit(a, "view.reader", "user", uid)
    return ok(_reader_summary(u))


@router.get("/api/admin/library/readers/{uid}/history")
def adm_reader_history(uid: str, a: dict = Depends(current_admin)):
    u = svc().st.get_user(uid)
    if not u:
        raise HTTPException(404, "not_found")
    lib().audit(a, "view.history", "user", uid)
    return ok(lib().history(uid))


@router.post("/api/admin/library/issue")
def adm_issue(data: dict = Body(...), a: dict = Depends(current_admin)):
    u = svc().st.get_user(str(data.get("user_id") or ""))
    if not u:
        raise HTTPException(404, "user_not_found")
    ln = _act(lambda: lib().issue(u, str(data.get("code") or ""), a, bool(data.get("force"))))
    _after(lambda: notify(u["id"], "issued", title=ln["title"], due=_fmt_d(ln["due"])))
    return ok({"loan": ln, "reader": _reader_summary(u)})


@router.post("/api/admin/library/return")
def adm_return(data: dict = Body(...), a: dict = Depends(current_admin)):
    r = _act(lambda: lib().return_copy(str(data.get("code") or ""), a, bool(data.get("lost"))))
    _after(flush_events)
    u = svc().st.get_user(r["loan"]["user_id"]) if r.get("loan") else None
    return ok(r | {"reader": {"id": u["id"], "name": u["name"]} if u else None,
                   "reserved_for_name": (svc().st.get_user(r["reserved_for"]) or {}).get("name") if r.get("reserved_for") else None})


@router.get("/api/admin/library/loans")
def adm_loans(kind: str = "active", a: dict = Depends(current_admin)):
    L = lib()
    if kind == "overdue":
        return ok({"items": L.overdue()})
    return ok({"items": L.active_loans()})


@router.get("/api/admin/library/queue")
def adm_queue(a: dict = Depends(current_admin)):
    return ok({"items": lib().queue_all()})


@router.post("/api/admin/library/reservations/{rid}/cancel")
def adm_res_cancel(rid: str, a: dict = Depends(current_admin)):
    _act(lambda: lib().cancel_reservation(a, rid, actor=a))
    _after(flush_events)
    return ok({"ok": True})


@router.get("/api/admin/library/fines")
def adm_fines(status: str = "", a: dict = Depends(current_admin)):
    st = svc().st
    items = lib().fines(status=status)
    names = {}
    for f in items:
        if f["user_id"] not in names:
            u = st.get_user(f["user_id"]) or {}
            names[f["user_id"]] = {"id": u.get("id"), "name": u.get("name") or "(anonim)", "login": u.get("login") or ""}
        f["user"] = names[f["user_id"]]
    return ok({"items": items, "currency": lib().settings()["currency"]})


@router.post("/api/admin/library/fines/{fid}")
def adm_fine_resolve(fid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    return ok(_act(lambda: lib().resolve_fine(fid, str(data.get("status") or ""), str(data.get("note") or ""), a)))


@router.get("/api/admin/library/reviews")
def adm_reviews(a: dict = Depends(current_admin)):
    return ok({"items": lib().moderation_queue()})


@router.post("/api/admin/library/reviews/{rid}")
def adm_review_moderate(rid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    r = _act(lambda: lib().moderate(rid, str(data.get("status") or ""), str(data.get("reason") or ""), a))
    _after(flush_events)
    return ok(r)


@router.get("/api/admin/library/locations")
def adm_locations(a: dict = Depends(current_admin)):
    return ok({"items": lib().locations(), "last": svc().st.kv_get("lib_inventory_last")})


@router.post("/api/admin/library/inventory")
def adm_inventory(data: dict = Body(...), a: dict = Depends(current_admin)):
    return ok(lib().inventory(str(data.get("location") or ""), [str(x) for x in (data.get("codes") or [])][:20000], a))


@router.get("/api/admin/library/stats")
def adm_stats(days: int = 30, a: dict = Depends(current_admin)):
    return ok(lib().stats(max(1, min(days, 730))))


@router.post("/api/admin/library/jobs")
def adm_jobs(a: dict = Depends(current_admin)):
    _need_settings(a)
    return ok(run_jobs())


# --- import / namuna
@router.get("/api/admin/library/template.xlsx")
def adm_template(a: dict = Depends(current_admin)):
    return Response(LX.template(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="kutubxona-fond-namuna.xlsx"'})


@router.post("/api/admin/library/import")
async def adm_import(file: UploadFile = File(...), a: dict = Depends(current_admin)):
    raw = await file.read()
    if len(raw) > 30 * 1024 * 1024:
        raise HTTPException(400, "file_too_large")
    try:
        rows = LX.read_rows(raw, file.filename or "")
    except LX.SheetError as e:
        raise HTTPException(400, str(e)) from e
    L = lib()
    st = svc().st
    added_books = added_copies = merged = 0
    skipped = []
    for rec in rows[:20000]:
        title = (rec.get("title") or "").strip()
        if not title or title.lower().startswith("kitob nomi"):
            skipped.append({"row": rec["row"], "reason": "nomi bo‘sh"})
            continue
        from ..library import isbn_clean  # noqa: PLC0415

        isbn = isbn_clean(rec.get("isbn") or "")
        existing = st._q("SELECT id FROM lib_books WHERE isbn=%s", (isbn,)) if isbn else []
        try:
            if existing:
                bid = existing[0]["id"]
                merged += 1
            else:
                data = {k: rec.get(k) for k in ("title", "authors", "isbn", "publisher", "year", "lang", "pages", "categories", "faculties", "keywords",
                                                 "udc", "bbk", "annotation", "price", "cover") if rec.get(k)}
                bid = L.save_book(data, a, auto_cover=False)["id"]  # muqova — keyin fon oqimida
                added_books += 1
            invs = [x.strip() for x in re.split(r"[;,\n]+", rec.get("invs") or "") if x.strip()]
            cnt = int(float(rec.get("copies") or 0) or 0)
            if cnt or invs:
                made = L.add_copies(bid, cnt, invs, rec.get("location") or "", float(str(rec.get("price") or "0").replace(" ", "") or 0) or None, a)
                added_copies += len(made)
        except (LibError, ValueError) as e:
            skipped.append({"row": rec["row"], "reason": str(e)})
    L.audit(a, "import", "fund", "", None, {"books": added_books, "copies": added_copies, "merged": merged, "skipped": len(skipped)})
    if added_books:
        backfill_covers_async()
    return ok({"rows": len(rows), "books": added_books, "copies": added_copies, "merged": merged, "skipped": skipped})


# --- hisobotlar (Excel)
@router.get("/api/admin/library/reports/{kind}.xlsx")
def adm_report(kind: str, days: int = 30, uid: str = "", q: str = "", category: str = "", a: dict = Depends(current_admin)):
    L = lib()
    st = svc().st
    since = (datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 3650)))).isoformat()
    if kind == "debtors":
        rows = [[x["user"]["name"], x["user"]["login"], x["user"]["phone"], x["title"], x["inv"], _fmt_d(x["issued"]), _fmt_d(x["due"]), x["days"]] for x in L.overdue()]
        data = LX.table("Qarzdorlar ro'yxati", ["F.I.Sh.", "Login", "Telefon", "Kitob", "Inventar", "Berilgan", "Muddat", "Kechikish (kun)"], rows, [28, 16, 16, 40, 14, 12, 12, 14])
    elif kind == "fines":
        rows = []
        for f in L.fines():
            u = st.get_user(f["user_id"]) or {}
            rows.append([_fmt_d(f["created"]), u.get("name") or "(anonim)", f.get("title") or "", f["kind"], f["amount"], f["status"], f.get("note") or ""])
        data = LX.table("Jarimalar jurnali", ["Sana", "O'quvchi", "Kitob", "Turi", "Summa", "Holat", "Izoh"], rows, [12, 28, 40, 10, 12, 12, 50])
    elif kind == "fund":
        res = L.search(q, category, "", "", None, None, "", False, "alpha", 1, 100000)
        rows = []
        for b in res["items"]:
            full = L.book(b["id"]) or {}
            rows.append([b["title"], "; ".join(b["authors"]), full.get("isbn") or "", full.get("publisher") or "", b.get("year") or "", b.get("lang") or "",
                         "; ".join(full.get("categories") or []), b["copies"], b["free"], ", ".join(b["formats"])])
        data = LX.table("Fond ro'yxati", ["Nomi", "Muallif(lar)", "ISBN", "Nashriyot", "Yil", "Til", "Fan", "Nusxalar", "Bo'sh", "Formatlar"], rows,
                        [40, 28, 16, 20, 8, 6, 22, 10, 8, 18])
    elif kind == "circulation":
        rows = []
        for r in st._q("SELECT l.*, b.title, c.inv FROM lib_loans l JOIN lib_books b ON b.id=l.book_id JOIN lib_copies c ON c.id=l.copy_id WHERE l.issued>=%s ORDER BY l.issued", (since,)):
            u = st.get_user(r["user_id"]) or {}
            rows.append([_fmt_d(r["issued"]), u.get("name") or "(anonim)", r["title"], r["inv"], _fmt_d(r["due"]), _fmt_d(r["returned"]) if r["returned"] else "—", r["renewals"]])
        data = LX.table(f"Aylanma ({days} kun)", ["Berilgan", "O'quvchi", "Kitob", "Inventar", "Muddat", "Qaytarilgan", "Uzaytirish"], rows, [12, 28, 40, 14, 12, 12, 10])
    elif kind == "inventory":
        last = st.kv_get("lib_inventory_last") or {}
        rows = [["Topilmadi (javonda yo'q)", x] for x in last.get("missing") or []] + [["Boshqa joyga tegishli", x] for x in last.get("foreign") or []] + \
               [["Noma'lum kod", x] for x in last.get("unknown") or []]
        data = LX.table(f"Inventarizatsiya: {last.get('location') or '—'} ({_fmt_dt(last.get('at'))})", ["Natija", "Inventar / kod"], rows, [30, 30])
    elif kind == "user" and uid:
        u = st.get_user(uid) or {}
        L.audit(a, "view.history", "user", uid)
        h = L.history(uid)
        rows = [["Qog'oz", r["title"], _fmt_d(r["issued"]), _fmt_d(r["returned"]) if r["returned"] else "—"] for r in h["loans"]] + \
               [["Elektron", r["title"], _fmt_d(r["opened"]), f"{round(r['percent'])}%"] for r in h["reading"]]
        data = LX.table(f"O'quvchi tarixi: {u.get('name') or uid}", ["Tur", "Kitob", "Sana", "Holat"], rows, [12, 44, 14, 14])
    else:
        raise HTTPException(404, "not_found")
    return Response(data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="kutubxona-{kind}-{date.today().isoformat()}.xlsx"'})


# --- sozlamalar va audit (faqat «library_settings»)
@router.get("/api/admin/library/settings")
def adm_settings(a: dict = Depends(current_admin)):
    return ok(lib().settings() | {"can_edit": _can(a, "library_settings")})


@router.put("/api/admin/library/settings")
def adm_settings_save(data: dict = Body(...), a: dict = Depends(current_admin)):
    _need_settings(a)
    return ok(lib().save_settings(data, a))


@router.get("/api/admin/library/audit")
def adm_audit(q: str = "", a: dict = Depends(current_admin)):
    _need_settings(a)
    return ok({"items": lib().audit_list(q)})


def remove_user_files(uid: str) -> None:
    """Foydalanuvchi o'chirilganda kutubxona tarixi anonimlashtiriladi."""
    try:
        lib().anonymize_user(uid)
    except Exception as e:  # noqa: BLE001
        print(f"library anonymize: {e}", flush=True)

