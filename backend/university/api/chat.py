"""Sayt chati (o'ng pastki burchakdagi vidjet).

Suhbatdan oldin ism-familiya va telefon so'raladi. Savollarga ../chatbot.py sayt kontentidan javob beradi (sun'iy intellektsiz).
Javob topilmasa yoki mehmon «operator» desa — «Murojaatlar» bo'limida chipta ochiladi (manba: «chat»), ichida butun suhbat tarixi;
keyingi javobsiz savollar shu chiptaga qo'shiladi. Suhbatlar — `chat_sessions` jadvalida (admin chiptadan ko'radi).
"""
from __future__ import annotations

import json
import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Body, HTTPException, Request

from .. import chatbot as B
from .deps import ip_of, ok, rate_limit, svc

router = APIRouter()
MAX_MSG = 120


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ensure_schema(st) -> None:
    with st._tx() as c:
        c.execute("CREATE TABLE IF NOT EXISTS chat_sessions (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, lang TEXT, ip TEXT, "
                  "messages TEXT NOT NULL DEFAULT '[]', ticket_id TEXT, created TEXT NOT NULL, updated TEXT NOT NULL)")


def _table() -> None:
    st = svc().st
    if getattr(st, "_chat_ready", False):
        return
    ensure_schema(st)
    st._chat_ready = True


def _lang(v) -> str:
    return v if v in ("uz", "ru", "en") else svc().base_lang()


def _session(sid: str) -> dict:
    _table()
    if not re.fullmatch(r"[a-f0-9]{32}", sid or ""):
        raise HTTPException(404, "no_session")
    r = svc().st._q("SELECT * FROM chat_sessions WHERE id=%s", (sid,))
    if not r:
        raise HTTPException(404, "no_session")
    s = dict(r[0])
    s["messages"] = json.loads(s["messages"] or "[]")
    return s


def _save(s: dict) -> None:
    with svc().st._tx() as c:
        c.execute("UPDATE chat_sessions SET messages=%s, ticket_id=%s, updated=%s WHERE id=%s", (json.dumps(s["messages"][-MAX_MSG:], ensure_ascii=False), s.get("ticket_id"), _now(), s["id"]))


def _phone(v: str) -> str:
    digits = re.sub(r"\D", "", v or "")
    if not 9 <= len(digits) <= 15:
        raise HTTPException(400, "bad_phone")
    if len(digits) == 9:
        digits = "998" + digits
    return "+" + digits


def _transcript(s: dict) -> str:
    who = {"user": s["name"], "bot": "Chat-bot"}
    lines = [f"Ism: {s['name']}", f"Telefon: {s['phone']}", "", "Suhbat tarixi:"]
    for m in s["messages"]:
        tm = (m.get("at") or "")[11:16]
        txt = m.get("text") or ""
        if m.get("links"):
            txt += "".join(f"\n   • {x.get('title')}" for x in m["links"][:8])
        lines.append(f"[{tm}] {who.get(m['from'], m['from'])}: {txt}")
    return "\n".join(lines)


HANDOFF = {
    "uz": "Bu savolga saytdan aniq javob topa olmadim. Savolingiz va suhbat tarixi murojaatlar bo‘limiga yuborildi (№{n}) — mutaxassis {phone} raqamiga tez orada bog‘lanadi.",
    "ru": "Не нашёл точного ответа на сайте. Ваш вопрос и история переписки переданы в отдел обращений (№{n}) — специалист свяжется с вами по номеру {phone}.",
    "en": "I couldn’t find an exact answer on the site. Your question and the chat history were sent to our help desk (No. {n}) — a specialist will call you at {phone}.",
}
HANDOFF_MORE = {
    "uz": "Bu savol ham №{n} murojaatingizga qo‘shildi — mutaxassis javob beradi.",
    "ru": "Этот вопрос тоже добавлен к обращению №{n} — специалист ответит.",
    "en": "This question was added to your request No. {n} — a specialist will reply.",
}


def _handoff(s: dict, request: Request) -> str:
    from .desk import _desk  # noqa: PLC0415

    d = _desk()
    lang = s.get("lang") or "uz"
    if s.get("ticket_id"):
        t = d.get(s["ticket_id"])
        if t:
            last = next((m["text"] for m in reversed(s["messages"]) if m["from"] == "user"), "")
            d.update(t["id"], unread=True, last_in_at=_now())
            d.event(t["id"], "message_in", None, s["name"], last, {"channel": "chat"})
            return HANDOFF_MORE.get(lang, HANDOFF_MORE["uz"]).format(n=t["number"])
    cats = [c for c in d.categories() if c["active"]]
    last = next((m["text"] for m in reversed(s["messages"]) if m["from"] == "user"), "")
    t = d.create(f"Sayt chati: {last[:120]}" if last else "Sayt chati", _transcript(s), name=s["name"], phone=s["phone"],
                 category_id=cats[0]["id"] if cats else None, source="chat", ip=ip_of(request), meta={"source": "chat", "chat_id": s["id"]},
                 lang=lang, chat_sid=s["id"])
    s["ticket_id"] = t["id"]
    return HANDOFF.get(lang, HANDOFF["uz"]).format(n=t["number"], phone=s["phone"])


@router.get("/api/chat/quick")
def chat_quick(lang: str = ""):
    return ok({"items": B.quick(svc(), _lang(lang))})


@router.post("/api/chat/start")
def chat_start(request: Request, data: dict = Body(...)):
    _table()
    rate_limit(f"chat-start:{ip_of(request)}", 12, 3600)
    name = re.sub(r"\s+", " ", str(data.get("name") or "")).strip()[:120]
    if len(name) < 3:
        raise HTTPException(400, "bad_name")
    phone = _phone(str(data.get("phone") or ""))
    lang = _lang(data.get("lang"))
    sid = secrets.token_hex(16)
    hello = {"from": "bot", "text": B.greeting(lang, name), "at": _now()}
    with svc().st._tx() as c:
        c.execute("INSERT INTO chat_sessions(id, name, phone, lang, ip, messages, created, updated) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
                  (sid, name, phone, lang, ip_of(request)[:60], json.dumps([hello], ensure_ascii=False), _now(), _now()))
    return ok({"sid": sid, "name": name, "phone": phone, "messages": [hello], "quick": B.quick(svc(), lang)})


@router.get("/api/chat/{sid}")
def chat_get(sid: str):
    s = _session(sid)
    return ok({"sid": s["id"], "name": s["name"], "phone": s["phone"], "messages": s["messages"], "ticket": bool(s.get("ticket_id")), "quick": B.quick(svc(), s.get("lang") or "uz")})


@router.post("/api/chat/{sid}")
def chat_send(sid: str, request: Request, data: dict = Body(...)):
    s = _session(sid)
    rate_limit(f"chat:{sid}", 40, 600)
    text = re.sub(r"\s+", " ", str(data.get("text") or "")).strip()[:1000]
    if not text:
        raise HTTPException(400, "empty")
    if data.get("lang") in ("uz", "ru", "en"):
        s["lang"] = data["lang"]
    lang = s.get("lang") or "uz"
    s["messages"].append({"from": "user", "text": text, "at": _now()})
    r = B.answer(svc(), text, lang)
    if r["found"] and (r["text"] or r["links"]):
        msg = {"from": "bot", "text": r["text"], "links": r["links"], "at": _now(), "intent": r["intent"]}
    else:
        msg = {"from": "bot", "text": _handoff(s, request), "at": _now(), "intent": "handoff"}
    s["messages"].append(msg)
    _save(s)
    return ok({"message": msg, "ticket": bool(s.get("ticket_id"))})
