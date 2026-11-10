"""Murojaatlar (service desk) API: Kanban doska, chipta tafsiloti, harakatlar, pochta orqali javob, bo'limlar."""
from __future__ import annotations

import hmac
import json
import logging
from datetime import date as _date
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, RedirectResponse

from .. import desk as D
from .. import mail as M
from .. import telegram as TG
from .. import tg_publish as TP
from .. import roles as R
from .deps import current_admin, ip_of, ok, rate_limit, s_, svc

router = APIRouter()
log = logging.getLogger("university.desk")


def _desk() -> D.Desk:
    s = svc()
    d = getattr(s, "_desk", None)
    if d is None or d.st is not s.st:
        d = s._desk = D.Desk(s.st)
        d.ensure_defaults(M.config(s.st)["domain"])
        _migrate_messages(d)
    return d


def _migrate_messages(d: D.Desk) -> None:
    """Eski «Xabarlar» (aloqa formasi) — bir marta chiptalarga ko'chiriladi."""
    st = d.st
    if st.kv_get("desk_migrated"):
        return
    cats = d.categories()
    for m in reversed(st.list_messages()):
        t = d.create(m.get("subject") or "Saytdagi aloqa formasi", m["body"], name=m["name"], email=m["email"], phone=m.get("phone") or "",
                     category_id=cats[0]["id"] if cats else None, source="web", ip=m.get("ip") or "")
        with st._tx() as c:
            c.execute("UPDATE desk_tickets SET created=%s, updated=%s, unread=%s WHERE id=%s", (m["created"], m["created"], int(not m["read"]), t["id"]))
            c.execute("UPDATE desk_events SET created=%s WHERE ticket_id=%s", (m["created"], t["id"]))
    st.kv_put("desk_migrated", True)


def _agents() -> list[dict]:
    st = svc().st
    return [u for u in st.list_users("admin", active=True) if "messages" in R.perms_of(st, u)]


def _person(u: dict | None) -> dict | None:
    return {"id": u["id"], "name": u["name"], "photo": (u.get("data") or {}).get("photo") or ""} if u else None


def _ready() -> tuple[bool, bool]:
    st = svc().st
    return TG.ready(TG.config(st)), M.ready(M.config(st)) and bool(_desk().mailboxes())


def _channels(t: dict, ready: tuple[bool, bool]) -> list[dict]:
    """Murojaatchiga javob kanallari (birinchisi — murojaat kelgan kanal) va ularning tayyorligi."""
    out = []
    if t.get("tg_chat"):
        out.append({"id": "telegram", "ready": ready[0]})
    if t.get("chat_sid"):
        out.append({"id": "chat", "ready": True})
    if t.get("requester_email"):
        out.append({"id": "email", "ready": ready[1]})
    return out


def _out(t: dict, users: dict, cats: dict, ready: tuple[bool, bool] | None = None) -> dict:
    t = {k: v for k, v in t.items() if k != "public_token"}
    return t | {"number_label": f"{D.TAG}-{t['number']}", "assignee": _person(users.get(t["assignee_id"] or "")), "category": cats.get(t["category_id"] or ""),
                "channels": _channels(t, ready or _ready())}


def _ticket(tid: str) -> dict:
    t = _desk().get(tid)
    if not t:
        raise HTTPException(404, "not_found")
    return t


def _full(t: dict) -> dict:
    d, st = _desk(), svc().st
    users = {u["id"]: u for u in st.list_users("admin")}
    cats = {c["id"]: c for c in d.categories()}
    ev = d.events(t["id"])
    for e in ev:
        e["author"] = _person(users.get(e["author_id"] or ""))
    history = [{"id": x["id"], "number": x["number"], "title": x["title"], "stage": x["stage"], "created": x["created"]}
               for x in d.list(q=t["requester_email"], limit=20) if x["id"] != t["id"]] if t["requester_email"] else []
    return {"ticket": _out(t, users, cats), "events": ev, "history": history, "public_url": f"{svc().base_url()}/request/{d.token(t)}"}


@router.get("/api/admin/desk")
def desk_board(q: str = "", category: str = "", assignee: str = "", a: dict = Depends(current_admin)):
    d, st = _desk(), svc().st
    users = {u["id"]: u for u in st.list_users("admin")}
    cats = {c["id"]: c for c in d.categories()}
    items = d.list(q=q[:80], category=category, assignee=a["id"] if assignee == "me" else assignee)
    cfg = M.config(st)
    ready = _ready()
    return ok({
        "stages": D.STAGES, "categories": list(cats.values()), "counts": d.counts(), "me": a["id"],
        "tickets": [_out(t, users, cats, ready) for t in items],
        "agents": [_person(u) for u in _agents()],
        "mail_ready": M.ready(cfg), "tg_ready": ready[0], "poll": getattr(svc(), "_desk_poller", None) and svc()._desk_poller.last or {},
    })


@router.get("/api/admin/desk/tickets/{tid}")
def desk_ticket(tid: str, a: dict = Depends(current_admin)):
    t = _ticket(tid)
    if t["unread"] and (not t["assignee_id"] or t["assignee_id"] == a["id"]):
        t = _desk().update(tid, unread=False)
    return ok(_full(t))


@router.post("/api/admin/desk/tickets")
def desk_create(data: dict = Body(...), a: dict = Depends(current_admin)):
    d = _desk()
    title = s_(data, "title", 300)
    if not title:
        raise HTTPException(400, "empty_title")
    email = s_(data, "email", 160)
    if email and not M.EMAIL_RE.match(email):
        raise HTTPException(400, "invalid_email")
    t = d.create(title, str(data.get("body") or "")[:20000], name=s_(data, "name", 160), email=email, phone=s_(data, "phone", 40),
                 category_id=s_(data, "category_id", 40) or None, source="manual", priority=s_(data, "priority", 20) or "medium",
                 meta={"source": "manual", "by": a["name"]})
    return ok(_full(t))


@router.put("/api/admin/desk/tickets/{tid}")
def desk_update(tid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    d = _desk()
    t = _ticket(tid)
    f = {}
    if data.get("priority") in D.PRIORITIES and data["priority"] != t["priority"]:
        f["priority"] = data["priority"]
    if "category_id" in data and (data["category_id"] or None) != t["category_id"]:
        if data["category_id"] and not d.category(data["category_id"]):
            raise HTTPException(400, "invalid_category")
        f["category_id"] = data["category_id"] or None
    if data.get("title"):
        f["title"] = s_(data, "title", 300)
    if f:
        t = d.update(tid, **f)
        d.event(tid, "update", a["id"], a["name"], "", f)
    return ok(_full(t))


@router.delete("/api/admin/desk/tickets/{tid}")
def desk_delete(tid: str, a: dict = Depends(current_admin)):
    _ticket(tid)
    if not R.is_super(svc().st, a):
        raise HTTPException(403, "no_permission")
    _desk().delete(tid)
    return ok({"ok": True})


def _guard_owner(t: dict, a: dict) -> None:
    """Chiptani «boshlagan» administrator javobgar: boshqalar (bosh administratordan tashqari) javob yoza olmaydi."""
    if t["assignee_id"] and t["assignee_id"] != a["id"] and not R.is_super(svc().st, a):
        raise HTTPException(403, "not_assignee")


@router.post("/api/admin/desk/tickets/{tid}/start")
def desk_start(tid: str, a: dict = Depends(current_admin)):
    t = _ticket(tid)
    if t["assignee_id"] and t["assignee_id"] != a["id"] and not R.is_super(svc().st, a):
        raise HTTPException(409, "already_assigned")
    nt = _desk().start(t, a)
    if nt["stage"] != t["stage"]:
        _after_move(nt, "", a)
    return ok(_full(_desk().get(tid)))


@router.post("/api/admin/desk/tickets/{tid}/reassign")
def desk_reassign(tid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    t = _ticket(tid)
    _guard_owner(t, a)
    reason = s_(data, "reason", 1000)
    if not reason:
        raise HTTPException(400, "reason_required")
    uid = s_(data, "assignee_id", 40)
    to = next((u for u in _agents() if u["id"] == uid), None) if uid else None
    if uid and not to:
        raise HTTPException(400, "invalid_assignee")
    return ok(_full(_desk().reassign(t, a, to, reason)))


@router.post("/api/admin/desk/tickets/{tid}/move")
def desk_move(tid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    t = _ticket(tid)
    _guard_owner(t, a)
    stage = s_(data, "stage", 20)
    if stage not in D.STAGE_IDS:
        raise HTTPException(400, "invalid_stage")
    reason = s_(data, "reason", 2000)
    if stage == "failed" and not reason:
        raise HTTPException(400, "reason_required")
    d = _desk()
    if not t["assignee_id"] and stage != "new":
        t = d.update(tid, assignee_id=a["id"])
    nt = d.move(t, stage, a, reason)
    if nt["stage"] != t["stage"]:
        _after_move(nt, reason, a)
    return ok(_full(d.get(tid)))


def _after_move(t: dict, comment: str, actor: dict) -> None:
    """Bosqich o'zgardi — murojaatchiga xabar; qaysi kanallarga yetgani bosqich hodisasiga yoziladi.
    «Jarayonda»ga o'tish (Boshlash, sudrab o'tkazish, holat tanlash) murojaatchiga holat xabari bilan bildirilmaydi:
    operator izoh yozgan bo'lsa — faqat shu izoh oddiy operator xabari bo'lib boradi. O'zgarish tarixda baribir ko'rinadi."""
    if t["stage"] == D.WORKING and not comment:
        return
    try:
        if t["stage"] == D.WORKING:
            res = notify_message(t, comment, actor)
        else:
            res = notify(t, t["stage"], comment, rate=t["stage"] == "resolved" and not t.get("rating"))
    except Exception as e:  # noqa: BLE001 — xabar yetmasa ham bosqich o'zgaradi
        log.warning("desk notify: %r", e)
        res = {"notified": [], "notify_errors": [str(e)[:200]]}
    if t.get("event_id"):
        _desk().event_meta(t["event_id"], res)


def _lang(t: dict) -> str:
    if t.get("lang") in D.LANGS:
        return t["lang"]
    if t.get("tg_chat"):
        return D.lang_of(bot().chat(t["tg_chat"])["lang"])
    return "uz"


def notify(t: dict, stage: str, comment: str = "", rate: bool = False) -> dict:
    """Murojaatchiga bosqich xabari murojaat kelgan kanal orqali: Telegram (tugmalar bilan), sayt chati yoki pochta (bo'lim manzilidan).
    Asosiy kanal ishlamasa va email bo'lsa — pochta. «Hal qilindi»da — baholash (Telegram: yulduz tugmalari; pochta/chat: havola)."""
    d, st = _desk(), svc().st
    sent, errs = [], []
    lang = _lang(t)
    url = f"{svc().base_url()}/request/{d.token(t)}?lang={lang}"
    if t.get("tg_chat"):
        if TG.ready(TG.config(st)):
            try:
                bot().deliver_status(t, stage, comment, rate=rate)
                sent.append("telegram")
            except Exception as e:  # noqa: BLE001
                errs.append(f"telegram: {e}"[:200])
        else:
            errs.append("telegram_disabled")
    if t.get("chat_sid") and not sent:
        try:
            chat_deliver(t["chat_sid"], D.status_text(lang, stage, comment, rate_url=url if rate else "", view_url=url))
            sent.append("chat")
        except Exception as e:  # noqa: BLE001
            errs.append(f"chat: {e}"[:200])
    if t.get("requester_email") and not sent:
        cfg = M.config(st)
        sender = d.mailbox_for(t)
        if M.ready(cfg) and sender:
            L = D.NOTE[lang]
            body = (L["hello"].format(name=t["requester_name"]) + "\n\n" if t["requester_name"] else "") + \
                D.status_text(lang, stage, comment, rate_url=url if rate else "", view_url=url)
            html = M.text_to_html(body)
            if rate:
                links = " ".join(f'<a href="{url}&amp;rate={n}" style="text-decoration:none;font-size:22px;color:#b08d3c">{"★" * n}</a><br>'
                                 for n in range(5, 0, -1))
                html += f"<p>{links}</p>"
            cat = d.category(t["category_id"])
            try:
                d.send_mail(t, "University" + (f" — {cat['title']}" if cat else ""), sender, cfg,
                            d.subject(t, L["subject"].format(stage=D.STAGE_L[lang].get(stage, stage)) + " — "), body, html)
                sent.append("email")
            except (M.MailError, ValueError) as e:
                errs.append(f"email: {getattr(e, 'code', e)}"[:200])
        else:
            errs.append("mail_disabled")
    return {"notified": sent, "notify_errors": errs if not sent else []}


def notify_message(t: dict, text: str, actor: dict) -> dict:
    """Murojaatchiga oddiy operator xabari («holat o'zgardi» sarlavhasisiz) — notify() bilan bir xil kanal tartibida:
    Telegram → sayt chati → pochta (bo'lim manzilidan, «Re: … [UNI-123]» mavzusi bilan)."""
    d, st = _desk(), svc().st
    sent, errs = [], []
    if t.get("tg_chat"):
        if TG.ready(TG.config(st)):
            try:
                bot().deliver_reply(t["tg_chat"], t, text)
                sent.append("telegram")
            except Exception as e:  # noqa: BLE001
                errs.append(f"telegram: {e}"[:200])
        else:
            errs.append("telegram_disabled")
    if t.get("chat_sid") and not sent:
        try:
            chat_deliver(t["chat_sid"], text)
            sent.append("chat")
        except Exception as e:  # noqa: BLE001
            errs.append(f"chat: {e}"[:200])
    if t.get("requester_email") and not sent:
        cfg = M.config(st)
        sender = d.mailbox_for(t)
        if M.ready(cfg) and sender:
            cat = d.category(t["category_id"])
            try:
                d.send_mail(t, f"{actor['name']} — University" + (f" ({cat['title']})" if cat else ""), sender, cfg, d.subject(t), text)
                sent.append("email")
            except (M.MailError, ValueError) as e:
                errs.append(f"email: {getattr(e, 'code', e)}"[:200])
        else:
            errs.append("mail_disabled")
    return {"notified": sent, "notify_errors": errs if not sent else []}


def chat_deliver(sid: str, text: str) -> None:
    """Sayt chati suhbatiga mutaxassis xabari (foydalanuvchi chat oynasini ochganda ko'radi)."""
    from . import chat as CH  # noqa: PLC0415

    s = CH._session(sid)
    s["messages"].append({"from": "bot", "text": text, "at": D._now(), "intent": "desk"})
    CH._save(s)


@router.post("/api/admin/desk/tickets/{tid}/note")
def desk_note(tid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    t = _ticket(tid)
    text = str(data.get("content") or "").strip()[:20000]
    if not text:
        raise HTTPException(400, "empty_message")
    _desk().event(t["id"], "note", a["id"], a["name"], text)
    _desk().update(tid)
    return ok(_full(_desk().get(tid)))


@router.post("/api/admin/desk/tickets/{tid}/reply")
async def desk_reply(tid: str, body: str = Form(""), from_addr: str = Form(""), channel: str = Form("email"), files: list[UploadFile] | None = File(None),
                     a: dict = Depends(current_admin)):
    """Javob murojaat kelgan kanal orqali: pochta (bo'lim manzilidan murojaatchi emailiga), Telegram bot (shu chatga) yoki sayt chati.
    Ilovalar kanal orqali yuboriladi (Telegram: rasm/video/audio/ovoz/hujjat) va yozishmada ko'rinishi uchun saqlanadi.
    Ochiq murojaat (Yangi, Javob kutilmoqda) «Jarayonda»ga o'tadi — murojaatchiga alohida holat xabarisiz."""
    d, st = _desk(), svc().st
    t = _ticket(tid)
    _guard_owner(t, a)
    text = body.strip()[:20000]
    att = []
    total = 0
    for f in files or []:
        blob = await f.read()
        total += len(blob)
        if total > 20 * 1024 * 1024:
            raise HTTPException(400, "too_large")
        att.append(((f.filename or "fayl")[:180], f.content_type or "application/octet-stream", blob))
    if not text and not att:
        raise HTTPException(400, "empty_message")
    if channel == "telegram":
        if not TG.ready(TG.config(st)):
            raise HTTPException(503, "telegram_disabled")
        if not t.get("tg_chat"):
            raise HTTPException(400, "no_telegram_chat")
        saved = [D.save_attachment(st, n, b, m) for n, m, b in att]
        try:
            t = d.reply_telegram(t, a, text, bot().deliver_reply, files=[(x["name"], x["mime"], b) for x, (_n, _m, b) in zip(saved, att)], saved=saved)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        except RuntimeError as e:
            raise HTTPException(502, f"telegram_error:{e}") from e
        return ok(_full(t))
    if channel == "chat":
        if not t.get("chat_sid"):
            raise HTTPException(400, "no_chat_session")
        if att:
            raise HTTPException(400, "chat_no_files")
        try:
            t = d.reply_chat(t, a, text, chat_deliver)
        except HTTPException as e:
            raise HTTPException(400, "no_chat_session") from e
        return ok(_full(t))
    if not t["requester_email"]:
        raise HTTPException(400, "no_requester_email")
    cfg = M.config(st)
    cat = d.category(t["category_id"])
    allowed = d.mailboxes()
    sender = (from_addr or (cat or {}).get("mailbox") or (allowed[0] if allowed else "")).lower()
    if sender not in allowed:
        raise HTTPException(400, "invalid_mailbox")
    if not M.ready(cfg):
        raise HTTPException(503, "mail_disabled")
    saved = [D.save_attachment(st, n, b, m) for n, m, b in att]
    try:
        t = d.reply(t, a, text, sender, cfg, files=att, saved=saved)
    except M.MailError as e:
        raise HTTPException(502, e.code) from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return ok(_full(t))


@router.get("/api/admin/desk/att/{name}")
def desk_att(name: str, dl: str = "", n: str = "", a: dict = Depends(current_admin)):
    """Murojaat ilovasi (yopiq): rasm/video/audio/PDF — brauzerda ochiladi, qolganlari — yuklab olinadi."""
    if not D.ATT_RE.fullmatch(name):
        raise HTTPException(404, "not_found")
    from ..media import blob_url  # noqa: PLC0415

    ext = name.rsplit(".", 1)[1]
    inline = ext in D.INLINE_EXT and not dl
    p = svc().st.dir / "private" / "desk" / name
    if not p.exists():
        url = blob_url(svc().st, f"desk/{name}", private=True)
        if not url:
            raise HTTPException(404, "not_found")
        return RedirectResponse(url, status_code=302, headers={"Cache-Control": "no-store"})
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600"}
    if ext != "pdf":
        headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox"
    fname = (n or f"fayl.{ext}").replace("/", "_")[:150]
    return FileResponse(p, media_type=D.att_mime(ext) if inline else "application/octet-stream", headers=headers,
                        content_disposition_type="inline" if inline else "attachment", filename=fname)


@router.get("/api/admin/desk/stats")
def desk_stats(days: int = 30, start: str = "", end: str = "", a: dict = Depends(current_admin)):
    """Statistika (G-Guard service desk kabi): hajmlar, birinchi javob va hal qilish vaqti, baholar, operatorlar reytingi, dinamika."""
    try:
        if start and end:
            d0, d1 = _date.fromisoformat(start), _date.fromisoformat(end)
        else:
            d1 = datetime.now(D.TZ).date()
            d0 = d1 - timedelta(days=max(1, min(int(days), 366)) - 1)
    except ValueError as e:
        raise HTTPException(400, "invalid_date") from e
    if d1 < d0 or (d1 - d0).days > 400:
        raise HTTPException(400, "invalid_range")
    s0 = datetime(d0.year, d0.month, d0.day, tzinfo=D.TZ)
    s1 = datetime(d1.year, d1.month, d1.day, tzinfo=D.TZ) + timedelta(days=1)
    from datetime import timezone as _tz  # noqa: PLC0415

    r = _desk().stats(s0.astimezone(_tz.utc), s1.astimezone(_tz.utc))
    users = {u["id"]: u for u in svc().st.list_users("admin")}
    for o in r["operators"]:
        o["user"] = _person(users.get(o["user_id"])) or {"id": o["user_id"], "name": "—", "photo": ""}
    return ok(r | {"period": {"start": d0.isoformat(), "end": d1.isoformat()}})


# ------------------------------------------------------------------ murojaatchi uchun ochiq sahifa: holat, tarix, baholash (havola — xatda / chatda)
def _public(t: dict, lang: str) -> dict:
    lang = D.lang_of(lang or t.get("lang"))
    names = D.STAGE_L[lang]
    return {"number": t["number"], "label": f"{D.TAG}-{t['number']}", "title": t["title"], "stage": t["stage"], "stages": names,
            "created": t["created"], "updated": t["updated"], "history": _desk().history(t["id"]), "rating": t.get("rating"),
            "rating_comment": t.get("rating_comment") or "", "can_rate": t["stage"] in D.TERMINAL and not t.get("rating")}


@router.get("/api/desk/public/{token}")
def desk_public(token: str, request: Request, lang: str = ""):
    rate_limit(f"desk-pub:{ip_of(request)}", 120, 600)
    t = _desk().by_token(token)
    if not t:
        raise HTTPException(404, "not_found")
    return ok(_public(t, lang))


@router.post("/api/desk/public/{token}/rate")
def desk_public_rate(token: str, request: Request, data: dict = Body(...)):
    rate_limit(f"desk-rate:{ip_of(request)}", 20, 600)
    d = _desk()
    t = d.by_token(token)
    if not t:
        raise HTTPException(404, "not_found")
    try:
        t = d.rate(t, data.get("rating"), str(data.get("comment") or ""), by="web")
    except ValueError as e:
        raise HTTPException(409 if str(e) == "already_rated" else 400, str(e)) from e
    return ok(_public(t, str(data.get("lang") or "")))


@router.get("/api/admin/desk/categories")
def desk_categories(a: dict = Depends(current_admin)):
    return ok({"items": _desk().categories(), "agents": [_person(u) for u in _agents()], "domain": M.config(svc().st)["domain"]})


@router.put("/api/admin/desk/categories")
def desk_categories_put(data: dict = Body(...), a: dict = Depends(current_admin)):
    d, st = _desk(), svc().st
    keep = set()
    for i, c in enumerate(data.get("items") or []):
        if not isinstance(c, dict) or not str(c.get("title") or "").strip():
            continue
        try:
            saved = d.save_category(c | {"sort": i}, c.get("id") or None)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        keep.add(saved["id"])
        if saved["mailbox"]:
            _provision_mailbox(saved)
    for c in d.categories():
        if c["id"] not in keep:
            d.delete_category(c["id"])
    return desk_categories(a)


def _provision_mailbox(c: dict) -> None:
    """Bo'lim manzili pochta serverida hisob bo'lsin (Stalwart rejimida)."""
    st = svc().st
    cfg = M.config(st)
    if not c["mailbox"].endswith("@" + cfg["domain"]):
        return
    local = c["mailbox"].split("@")[0]

    def ensure_mailbox(sw, local=local, title=c["title"]):
        sw.ensure_account(local, f"Murojaatlar: {title}")

    M.provisioner(st).submit(ensure_mailbox)


@router.post("/api/admin/desk/poll")
def desk_poll(a: dict = Depends(current_admin)):
    cfg = M.config(svc().st)
    if not M.ready(cfg):
        raise HTTPException(503, "mail_disabled")
    return ok(_desk().poll(cfg))


# ------------------------------------------------------------------ boshqa modullardan
def ticket_from_contact(name: str, email: str, phone: str, subject: str, body: str, ip: str, lang: str = "") -> dict:
    d = _desk()
    cats = [c for c in d.categories() if c["active"]]
    return d.create(subject or "Saytdagi aloqa formasi", body, name=name, email=email, phone=phone, category_id=cats[0]["id"] if cats else None,
                    source="web", ip=ip, meta={"source": "web"}, lang=lang)


def ticket_from_application(vac: dict, name: str, email: str, phone: str, message: str, files: list[dict], ip: str) -> dict:
    """Vakansiyaga ariza → «Kadrlar bo'limi» chiptasi (bo'lim bo'lmasa yaratiladi)."""
    d = _desk()
    cat = next((c for c in d.categories() if c["mailbox"].startswith("hr@") or "kadr" in c["title"].lower()), None)
    if not cat:
        cat = d.save_category({"title": "Kadrlar bo‘limi", "color": "#0ea5e9", "mailbox": f"hr@{M.config(svc().st)['domain']}", "sort": 90})
    body = message or "—"
    t = d.create(f"Vakansiya: {vac['title']}", body, name=name, email=email, phone=phone, category_id=cat["id"], source="careers", ip=ip,
                 meta={"source": "careers", "vacancy": {"id": vac["id"], "title": vac["title"], "slug": vac.get("slug")}, "files": files})
    return t


@router.get("/api/admin/desk/files/{name}")
def desk_file(name: str, a: dict = Depends(current_admin)):
    """Arizaga biriktirilgan rezyume (yopiq: faqat «Murojaatlar» ruxsati bor administratorlar)."""
    import re as _re  # noqa: PLC0415

    from fastapi.responses import FileResponse  # noqa: PLC0415

    if not _re.fullmatch(r"[a-f0-9]{32}\.(pdf|docx?|jpe?g|png)", name):
        raise HTTPException(404, "not_found")
    from ..media import blob_url  # noqa: PLC0415
    from fastapi.responses import RedirectResponse  # noqa: PLC0415

    p = svc().st.dir / "private" / "cv" / name
    if not p.exists():
        url = blob_url(svc().st, f"cv/{name}", private=True)
        if not url:
            raise HTTPException(404, "not_found")
        return RedirectResponse(url, status_code=302, headers={"Cache-Control": "no-store"})
    return FileResponse(p, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"},
                        content_disposition_type="attachment", filename=f"rezyume{p.suffix}")


def start_poller() -> None:
    s = svc()
    if getattr(s, "_desk_poller", None) is None:
        s._desk_poller = D.Poller(s.st)
    s._desk_poller.start()
    bot().start()
    publisher().start()
    from .. import tg_student  # noqa: PLC0415

    if getattr(s, "_tg_student_sched", None) is None:
        s._tg_student_sched = tg_student.Scheduler(s.st)  # talabalar: ertalabki/kechki xulosa, dars eslatmasi, yangi testlar
    s._tg_student_sched.start()


# ------------------------------------------------------------------ Telegram bot
def bot() -> TG.Bot:
    s = svc()
    b = getattr(s, "_tg_bot", None)
    if b is None or b.st is not s.st:
        b = s._tg_bot = TG.Bot(s.st, _desk, svc)
    return b


def _tg_api() -> TG.Api | None:
    cfg = TG.config(svc().st)
    return TG.Api(cfg["token"]) if TG.ready(cfg) else None


def publisher() -> TP.Publisher:
    """Nashrlarni tasdiqlangan Telegram guruh/kanallariga yuboruvchi fon oqimi."""
    s = svc()
    p = getattr(s, "_tg_publisher", None)
    if p is None or p.st is not s.st:
        p = s._tg_publisher = TP.Publisher(s.st, svc, _tg_api)
    return p


def on_item_saved(it: dict) -> None:
    """Admin elementni saqladi: nashr qilingan bo'lsa — fon oqimida guruhlarga (sahifani sekinlashtirmaydi)."""
    if it.get("kind") in TP.KINDS and it.get("status") in ("published", "scheduled"):
        try:
            if TP.is_live(it):  # allaqachon yuborilgan bo'lsa — o'sha xabar tahrirlanadi (yangisi yuborilmaydi)
                TP.mark_dirty(svc().st, it["id"])
            publisher().kick()
        except Exception as e:  # noqa: BLE001
            log.warning("telegram publish: %s", e)


@router.get("/api/admin/telegram")
def tg_get(a: dict = Depends(current_admin)):
    return ok(_tg_payload())


def _tg_payload() -> dict:
    st = svc().st
    cfg = TG.config(st)
    from .. import tg_net  # noqa: PLC0415

    base = svc().base_url()
    net = tg_net.state()
    return ({"config": TG.public(cfg), "running": bool(bot()._t and bot()._t.is_alive()), "error": bot().last_error,
               "site_https": base.startswith("https://"), "net": net, "conflict": TG.CONFLICT_TEXT if net["conflict_recent"] else "",
               "chats": int(st._one("SELECT COUNT(*) FROM tg_chats") or 0), "link": f"https://t.me/{cfg['username']}" if cfg.get("username") else "",
               "groups": [TP.public(g) for g in TP.groups(st)]})


def _group_or_404(cid: str) -> dict:
    g = TP.group(svc().st, cid)
    if not g:
        raise HTTPException(404, "not_found")
    return g


@router.post("/api/admin/telegram/groups/check")
def tg_group_check(data: dict = Body(...), a: dict = Depends(current_admin)):
    """Kanal yoki guruhni qo'lda qo'shish: @username / id → getChat + getChatMember."""
    api = _tg_api()
    if api is None:
        raise HTTPException(400, "telegram_disabled")
    try:
        g = TP.check(svc().st, api, str((data or {}).get("chat") or ""))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(400, f"telegram_error:{e}") from e
    return ok({"group": TP.public(g)} | _tg_payload())


@router.post("/api/admin/telegram/groups/{cid}/confirm")
def tg_group_confirm(cid: str, data: dict = Body(default={}), a: dict = Depends(current_admin)):
    g = _group_or_404(cid)
    on = bool((data or {}).get("confirmed", True))
    if on and not g["can_post"]:
        raise HTTPException(400, "telegram_cannot_post")
    TP.confirm(svc().st, cid, on)
    return tg_get(a)


@router.put("/api/admin/telegram/groups/{cid}")
def tg_group_kinds(cid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    _group_or_404(cid)
    TP.set_kinds(svc().st, cid, [str(k) for k in (data.get("kinds") or [])])
    return tg_get(a)


@router.delete("/api/admin/telegram/groups/{cid}")
def tg_group_delete(cid: str, a: dict = Depends(current_admin)):
    _group_or_404(cid)
    TP.remove(svc().st, cid)
    return tg_get(a)


@router.post("/api/admin/telegram/groups/{cid}/retry")
def tg_group_retry(cid: str, a: dict = Depends(current_admin)):
    _group_or_404(cid)
    TP.retry(svc().st, cid)
    publisher().kick()
    return tg_get(a)


@router.get("/api/admin/telegram/items/{iid}")
def tg_item_status(iid: str, a: dict = Depends(current_admin)):
    st = svc().st
    targets = [g for g in TP.groups(st) if g.get("confirmed") and g["can_post"]]
    return ok({"posts": TP.item_status(st, iid), "groups": len(targets)})


@router.post("/api/admin/telegram/items/{iid}/send")
def tg_item_send(iid: str, a: dict = Depends(current_admin)):
    """Qo'lda «Telegramga yuborish»: hali yuborilmagan tasdiqlangan chatlarga (tur yoqilgan bo'lsa), xato bilan qolganlari — qaytadan."""
    st = svc().st
    it = st.get_item(iid)
    if not it or it["kind"] not in TP.KINDS:
        raise HTTPException(404, "not_found")
    if not st.get_item_by_slug(it["kind"], it.get("slug") or ""):
        raise HTTPException(400, "not_published")
    if _tg_api() is None:
        raise HTTPException(400, "telegram_disabled")
    with st._tx() as c:
        c.execute("UPDATE tg_posts SET attempts=0 WHERE item_id=%s AND status='error'", (iid,))
    if not TP.due(st, iid, force=True):
        raise HTTPException(400, "telegram_nothing_to_send")
    r = publisher().run_once(iid, force=True)
    return ok(r | {"posts": TP.item_status(st, iid)})


@router.put("/api/admin/telegram")
def tg_put(data: dict = Body(...), a: dict = Depends(current_admin)):
    st = svc().st
    try:
        cfg = TG.clean(data, TG.config(st))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if cfg.get("token") and (data.get("token") or not cfg.get("username")):
        try:
            me = TG.Api(cfg["token"], timeout=15).call("getMe")
            cfg["username"] = me.get("username") or ""
        except (RuntimeError, httpx.HTTPError) as e:
            raise HTTPException(400, f"telegram_error:{e}") from e
    ipv4_changed = bool(cfg.get("ipv4")) != bool(TG.config(st).get("ipv4"))
    st.kv_put("telegram", cfg)
    if ipv4_changed:  # «faqat IPv4» o'zgardi — keyingi chaqiruvlar yangi ulanishlar bilan
        from .. import tg_net  # noqa: PLC0415

        tg_net.set_forced(bool(cfg.get("ipv4")))
        tg_net.reset()
    if cfg.get("enabled") and cfg.get("mode") == "webhook":
        base = svc().base_url()
        if not base.startswith("https://"):
            raise HTTPException(400, "telegram_webhook_https")
        try:
            bot().set_webhook(f"{base}/api/telegram/webhook")
        except RuntimeError as e:
            raise HTTPException(400, f"telegram_error:{e}") from e
    bot().start()
    return tg_get(a)


@router.post("/api/admin/telegram/test")
def tg_test(data: dict = Body(default={}), a: dict = Depends(current_admin)):
    cfg = TG.config(svc().st)
    tok = str((data or {}).get("token") or cfg.get("token") or "")
    if not tok:
        raise HTTPException(400, "telegram_no_token")
    try:
        me = TG.Api(tok, timeout=15).call("getMe")
    except (RuntimeError, httpx.HTTPError) as e:
        raise HTTPException(400, f"telegram_error:{e}") from e
    return ok({"ok": True, "username": me.get("username"), "name": me.get("first_name")})


def _tg_accept(token: str, raw: bytes) -> bool:
    """Webhook: maxfiy kalit tekshiriladi, yangilanish bot puliga qo'yiladi (ishlov fon oqimida) — javob darhol."""
    st = svc().st
    secret = st.kv_get("telegram_secret") or ""
    if not TG.ready(TG.config(st)) or not secret or not hmac.compare_digest(token.encode(), secret.encode()):
        return False
    try:
        upd = json.loads(raw or b"{}")
    except ValueError:
        return True  # buzuq tana — Telegram qayta yubormasin
    if isinstance(upd, dict) and upd:
        bot().dispatch(upd)
    return True


@router.post("/api/telegram/webhook")
async def tg_webhook(request: Request):
    """Telegram javobni kutadi (kutsa — keyingi yangilanishlarni ushlab turadi, xatoda qayta yuboradi): shuning uchun ishlov
    hodisalar tsiklini ham, Telegram'ni ham kutdirmaydi — tekshiruv thread-pool'da, ishlov bot pulida, 200 darhol."""
    raw = await request.body()
    if not await run_in_threadpool(_tg_accept, request.headers.get("x-telegram-bot-api-secret-token") or "", raw):
        raise HTTPException(403, "forbidden")
    return {"ok": True}


@router.post("/api/admin/telegram/speed")
def tg_speed(a: dict = Depends(current_admin)):
    """«Tezlikni tekshirish»: serverdan Telegram'gacha tarmoq (DNS, IPv4/IPv6, TLS, getMe sovuq/issiq), webhook holati, 409,
    bot ishlovi va Bot API chaqiruvlari vaqtlari (xotiradagi oxirgi oyna) va aniq xulosa."""
    from .. import tg_net  # noqa: PLC0415

    st = svc().st
    cfg = TG.config(st)
    if not cfg.get("token"):
        raise HTTPException(400, "telegram_no_token")
    base = svc().base_url()
    our = f"{base}/api/telegram/webhook" if base.startswith("https://") else ""
    net = tg_net.network_check(cfg["token"])
    info: dict = {}
    try:
        wh = TG.Api(cfg["token"], timeout=15).call("getWebhookInfo") or {}
        info["webhook"] = {k: wh.get(k) for k in ("url", "pending_update_count", "last_error_date", "last_error_message", "max_connections", "ip_address")}
        info["pending"] = int(wh.get("pending_update_count") or 0)
    except Exception as e:  # noqa: BLE001
        info["webhook_error"] = str(e)[:200]
    b = bot()
    running = bool(b._t and b._t.is_alive()) and TG.ready(cfg)  # noqa: SLF001
    stats = tg_net.stats()
    return ok({"at": D._now(), "mode": cfg.get("mode") or "polling", "enabled": bool(cfg.get("enabled")), "running": running, "polling": b.polling,
               "backlog": b.dispatcher.backlog(), "workers": b.dispatcher.workers, "net": net, "webhook": info.get("webhook"),
               "webhook_error": info.get("webhook_error", ""), "our_webhook": our, "state": tg_net.state(), "stats": stats,
               "verdicts": tg_net.verdicts(net, info, stats, cfg.get("mode") or "polling", running, base.startswith("https://"), our)})


def counts_json() -> str:
    return json.dumps(_desk().counts())
