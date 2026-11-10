"""Tadbirga ro'yxatdan o'tish (har qanday tadbir — `event` turi; masalan, ochiq eshiklar kuni).

Sozlamalar tadbir yozuvining `registration` maydonida (admin → «Tadbirga ro'yxat»): yoqilgan/o'chirilgan, sig'im (o'rinlar; mehmonlar ham
o'rin egallaydi), muddat, kutish ro'yxati, ixtiyoriy maydonlar (email, maktab, sinf, mehmonlar soni) va 5 tagacha qo'shimcha savol.
Joy tugasa — kutish ro'yxatiga; ro'yxatdagi kishi bekor qilinsa yoki o'chirilsa, kutish ro'yxatidan navbat bo'yicha o'tkaziladi.
Tasdiqlash xati (email kiritilgan bo'lsa) — tadbir ma'lumotlari va taqvimga qo'shish (.ics) havolasi bilan.
"""
from __future__ import annotations

import io
import json
import re
import secrets
import threading
from datetime import datetime, timedelta, timezone

from .content import LANGS, _str

STATUSES = ("registered", "waitlist", "cancelled")
FIELD_MODES = ("off", "optional", "required")
OPT_FIELDS = ("email", "school", "grade")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
DEFAULT = {"enabled": False, "capacity": None, "deadline": None, "waitlist": True, "guests_max": 0,
           "fields": {"email": "optional", "school": "optional", "grade": "optional"}, "questions": []}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ensure_schema(st) -> None:
    if getattr(st, "_eventreg_ready", False):
        return
    with st._tx() as c:
        c.execute("CREATE TABLE IF NOT EXISTS event_regs (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, status TEXT NOT NULL, name TEXT NOT NULL, "
                  "phone TEXT NOT NULL, email TEXT, school TEXT, grade TEXT, guests BIGINT NOT NULL DEFAULT 0, answers TEXT NOT NULL DEFAULT '{}', "
                  "lang TEXT, ip TEXT, checked_in BIGINT NOT NULL DEFAULT 0, checked_at TEXT, reminded_at TEXT, created TEXT NOT NULL, updated TEXT NOT NULL)")
        c.execute("CREATE INDEX IF NOT EXISTS ix_event_regs ON event_regs(event_id, created)")
    st._eventreg_ready = True


# ------------------------------------------------------------------ sozlamalar
def config(event: dict) -> dict:
    raw = event.get("registration") if isinstance(event.get("registration"), dict) else {}
    out = {**DEFAULT, **{k: v for k, v in raw.items() if k in DEFAULT}}
    out["fields"] = {**DEFAULT["fields"], **(raw.get("fields") or {})}
    return out


def clean_config(data: dict) -> dict:
    from .content import _iso  # noqa: PLC0415

    cap = data.get("capacity")
    try:
        cap = int(cap) if cap not in (None, "") else None
    except (TypeError, ValueError):
        cap = None
    try:
        gm = int(data.get("guests_max") or 0)
    except (TypeError, ValueError):
        gm = 0
    fields = {k: (v if v in FIELD_MODES else "optional") for k, v in ((k, (data.get("fields") or {}).get(k)) for k in OPT_FIELDS)}
    qs = []
    for q in (data.get("questions") or [])[:5]:
        if not isinstance(q, dict):
            continue
        label = {lang: _str((q.get("label") or {}).get(lang), 200) for lang in LANGS if isinstance(q.get("label"), dict) and _str(q["label"].get(lang), 200)}
        if not label:
            continue
        qs.append({"id": _str(q.get("id"), 12) if re.fullmatch(r"[a-z0-9]{2,12}", str(q.get("id") or "")) else secrets.token_hex(4),
                   "label": label, "required": bool(q.get("required"))})
    return {"enabled": bool(data.get("enabled")), "capacity": cap if cap and 0 < cap <= 100_000 else None, "deadline": _iso(data.get("deadline")),
            "waitlist": bool(data.get("waitlist", True)), "guests_max": min(max(gm, 0), 10), "fields": fields, "questions": qs}


def _row(r) -> dict:
    d = dict(r)
    d["answers"] = json.loads(d.get("answers") or "{}")
    d["checked_in"] = bool(d["checked_in"])
    return d


def seats(st, eid: str) -> int:
    ensure_schema(st)
    return int(st._one("SELECT COALESCE(SUM(1 + guests), 0) FROM event_regs WHERE event_id=%s AND status='registered'", (eid,)) or 0)


def counts(st, eid: str) -> dict:
    ensure_schema(st)
    out = {s: 0 for s in STATUSES}
    for r in st._q("SELECT status, COUNT(*) AS n FROM event_regs WHERE event_id=%s GROUP BY status", (eid,)):
        out[r["status"]] = int(r["n"])
    out["seats"] = seats(st, eid)
    out["checked_in"] = int(st._one("SELECT COUNT(*) FROM event_regs WHERE event_id=%s AND checked_in=1 AND status='registered'", (eid,)) or 0)
    return out


def _ended(event: dict, now: str) -> bool:
    end = event.get("ends") or event.get("starts")
    return bool(end and end < now)


def state(st, event: dict) -> str:
    """open | full (kutish ro'yxatisiz) | waitlist (joy tugagan, kutish ro'yxati ochiq) | closed (muddat o'tgan / tadbir bo'lib o'tgan) | off"""
    cfg = config(event)
    if not cfg["enabled"]:
        return "off"
    now = _now()
    if (cfg["deadline"] and now > cfg["deadline"]) or _ended(event, now):
        return "closed"
    if cfg["capacity"] and seats(st, event["id"]) >= cfg["capacity"]:
        return "waitlist" if cfg["waitlist"] else "full"
    return "open"


def public(st, event: dict, lang: str, base: str) -> dict:
    cfg = config(event)
    taken = seats(st, event["id"])
    pick = lambda m: m.get(lang) or m.get(base) or next(iter(m.values()), "")  # noqa: E731
    return {"enabled": cfg["enabled"], "state": state(st, event), "capacity": cfg["capacity"], "taken": taken,
            "left": max(cfg["capacity"] - taken, 0) if cfg["capacity"] else None, "deadline": cfg["deadline"], "waitlist": cfg["waitlist"],
            "guests_max": cfg["guests_max"], "fields": cfg["fields"], "questions": [{"id": q["id"], "label": pick(q["label"]), "required": q["required"]} for q in cfg["questions"]]}


# ------------------------------------------------------------------ ro'yxatdan o'tish
def norm_phone(v: str) -> str:
    d = re.sub(r"\D", "", str(v or ""))
    if len(d) == 9:
        d = "998" + d
    return "+" + d if re.fullmatch(r"998\d{9}", d) else ""


def register(st, event: dict, data: dict, ip: str, lang: str) -> dict:
    """Tekshiradi va saqlaydi. Xatolar: ValueError("closed" | "full" | "duplicate") yoki ValueError({"fields": {...}})."""
    ensure_schema(st)
    cfg = config(event)
    s = state(st, event)
    if s in ("off", "closed"):
        raise ValueError("closed")
    f = {k: re.sub(r"\s+", " ", str(data.get(k) or "")).strip() for k in ("name", "phone", "email", "school", "grade")}
    err: dict[str, str] = {}
    if len(f["name"]) < 3 or len(f["name"].split()) < 2:
        err["name"] = "required"
    phone = norm_phone(f["phone"])
    if not phone:
        err["phone"] = "invalid"
    for k in OPT_FIELDS:
        mode = cfg["fields"].get(k, "optional")
        if mode == "off":
            f[k] = ""
        elif mode == "required" and not f[k]:
            err[k] = "required"
    if f["email"] and not EMAIL_RE.match(f["email"]):
        err["email"] = "invalid"
    try:
        guests = int(data.get("guests") or 0)
    except (TypeError, ValueError):
        guests = -1
    if not 0 <= guests <= cfg["guests_max"]:
        err["guests"] = "invalid"
    answers = {}
    raw_a = data.get("answers") if isinstance(data.get("answers"), dict) else {}
    for q in cfg["questions"]:
        a = str(raw_a.get(q["id"]) or "").strip()[:1000]
        if q["required"] and not a:
            err[f"q_{q['id']}"] = "required"
        if a:
            answers[q["id"]] = a
    if err:
        raise ValueError({"fields": err})
    rid = secrets.token_hex(6)
    now = _now()
    with st._tx() as c:
        # bir tadbirga parallel yozilishlar navbat bilan (sig'im oshib ketmasin)
        c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("eventreg:" + event["id"],))
        if c.execute("SELECT 1 FROM event_regs WHERE event_id=%s AND phone=%s AND status<>'cancelled'", (event["id"], phone)).fetchone():
            raise ValueError("duplicate")
        taken = int(c.execute("SELECT COALESCE(SUM(1 + guests), 0) FROM event_regs WHERE event_id=%s AND status='registered'", (event["id"],)).fetchone()[0])
        status = "registered"
        if cfg["capacity"] and taken + 1 + guests > cfg["capacity"]:
            if not cfg["waitlist"]:
                raise ValueError("full")
            status = "waitlist"
        c.execute("INSERT INTO event_regs(id, event_id, status, name, phone, email, school, grade, guests, answers, lang, ip, created, updated) "
                  "VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                  (rid, event["id"], status, f["name"][:160], phone, f["email"].lower()[:160], f["school"][:200], f["grade"][:40], guests,
                   json.dumps(answers, ensure_ascii=False), lang if lang in LANGS else None, ip[:60], now, now))
    pos = None
    if status == "waitlist":
        pos = int(st._one("SELECT COUNT(*) FROM event_regs WHERE event_id=%s AND status='waitlist' AND created<=%s", (event["id"], now)) or 0)
    return get(st, rid) | {"position": pos}


def get(st, rid: str) -> dict | None:
    ensure_schema(st)
    r = st._q("SELECT * FROM event_regs WHERE id=%s", (rid,))
    return _row(r[0]) if r else None


def regs(st, eid: str, q: str = "", status: str = "") -> list[dict]:
    ensure_schema(st)
    sql, args = "SELECT * FROM event_regs WHERE event_id=%s", [eid]
    if status in STATUSES:
        sql += " AND status=%s"
        args.append(status)
    rows = [_row(r) for r in st._q(sql + " ORDER BY created", tuple(args))]
    if q:
        n = q.casefold().strip()
        digits = re.sub(r"\D", "", n)
        rows = [r for r in rows if n in " ".join(str(r.get(k) or "") for k in ("name", "email", "school", "grade")).casefold() or (digits and digits in r["phone"])]
    return rows


def update(st, rid: str, data: dict) -> tuple[dict, list[dict]]:
    """Admin: kelganini belgilash, holatni o'zgartirish. Qaytadi: (yozuv, kutish ro'yxatidan o'tkazilganlar)."""
    cur = get(st, rid)
    if not cur:
        raise KeyError(rid)
    sets, args = [], []
    if "checked_in" in data:
        sets += ["checked_in=%s", "checked_at=%s"]
        args += [int(bool(data["checked_in"])), _now() if data["checked_in"] else None]
    if data.get("status") in STATUSES:
        sets.append("status=%s")
        args.append(data["status"])
    if sets:
        with st._tx() as c:
            c.execute(f"UPDATE event_regs SET {', '.join(sets)}, updated=%s WHERE id=%s", (*args, _now(), rid))
    promoted = promote(st, cur["event_id"]) if data.get("status") and data["status"] != "registered" else []
    return get(st, rid), promoted


def delete(st, rid: str) -> list[dict]:
    ensure_schema(st)
    cur = get(st, rid)
    if not cur:
        return []
    with st._tx() as c:
        c.execute("DELETE FROM event_regs WHERE id=%s", (rid,))
    return promote(st, cur["event_id"])


def promote(st, eid: str) -> list[dict]:
    """Bo'shagan o'ringa kutish ro'yxatidan navbat bilan (sig'imga sig'adiganlar)."""
    ensure_schema(st)
    ev = st.get_item(eid)
    if not ev:
        return []
    cap = config(ev)["capacity"]
    out = []
    with st._tx() as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("eventreg:" + eid,))
        taken = int(c.execute("SELECT COALESCE(SUM(1 + guests), 0) FROM event_regs WHERE event_id=%s AND status='registered'", (eid,)).fetchone()[0])
        for r in c.execute("SELECT id, guests FROM event_regs WHERE event_id=%s AND status='waitlist' ORDER BY created", (eid,)).fetchall():
            need = 1 + int(r[1])
            if cap and taken + need > cap:
                break
            c.execute("UPDATE event_regs SET status='registered', updated=%s WHERE id=%s", (_now(), r[0]))
            taken += need
            out.append(r[0])
    return [get(st, x) for x in out]


# ------------------------------------------------------------------ taqvim (.ics)
def _ics_dt(iso: str) -> str:
    return datetime.fromisoformat(iso).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _ics_esc(s: str) -> str:
    return str(s or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n")


def _fold(line: str) -> str:
    """RFC 5545: 75 baytdan uzun qatorlar bo'linadi."""
    out, cur = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(cur) + len(b) > 73:
            out.append(cur.decode("utf-8"))
            cur = b""
        cur += b
    out.append(cur.decode("utf-8"))
    return "\r\n ".join(out)


def ics(event: dict, url: str, host: str, org: str = "") -> str:
    """Tadbir uchun iCalendar fayli (tugash vaqti kiritilmagan bo'lsa — DTEND yozilmaydi)."""
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//University//Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
             f"UID:event-{event['id']}@{host or 'university'}", f"DTSTAMP:{_ics_dt(_now())}"]
    if event.get("starts"):
        lines.append(f"DTSTART:{_ics_dt(event['starts'])}")
    if event.get("ends"):
        lines.append(f"DTEND:{_ics_dt(event['ends'])}")
    lines.append(f"SUMMARY:{_ics_esc(event.get('title') or '')}")
    if event.get("place"):
        lines.append(f"LOCATION:{_ics_esc(event['place'])}")
    desc = " ".join(x for x in (event.get("summary") or "", url) if x)
    lines.append(f"DESCRIPTION:{_ics_esc(desc)}")
    lines.append(f"URL:{url}")
    if org:
        lines.append(f"ORGANIZER;CN={_ics_esc(org)}:mailto:noreply@{host or 'example.edu'}")
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(_fold(x) for x in lines) + "\r\n"


# ------------------------------------------------------------------ xatlar
TX = {
    "uz": {"ok_s": "Ro‘yxatdan o‘tdingiz", "wait_s": "Kutish ro‘yxatidasiz", "ok": "Siz «{t}» tadbiriga ro‘yxatdan o‘tdingiz.",
           "wait": "«{t}» tadbirida joylar tugagan — siz kutish ro‘yxatidasiz (navbat: {n}). Joy bo‘shasa, xabar beramiz.",
           "promo_s": "Joy ajratildi", "promo": "Kutish ro‘yxatidan o‘tkazildingiz: «{t}» tadbirida siz uchun joy bor.",
           "rem_s": "Eslatma", "rem": "Eslatma: «{t}» tadbiri yaqinlashmoqda.", "when": "Vaqti", "where": "Joyi", "guests": "Mehmonlar", "cal": "Taqvimga qo‘shish (.ics)"},
    "ru": {"ok_s": "Вы зарегистрированы", "wait_s": "Вы в листе ожидания", "ok": "Вы зарегистрированы на мероприятие «{t}».",
           "wait": "Места на мероприятие «{t}» закончились — вы в листе ожидания (номер: {n}). Если место освободится, мы сообщим.",
           "promo_s": "Место подтверждено", "promo": "Вы переведены из листа ожидания: на мероприятии «{t}» для вас есть место.",
           "rem_s": "Напоминание", "rem": "Напоминание: скоро мероприятие «{t}».", "when": "Когда", "where": "Где", "guests": "Гости", "cal": "Добавить в календарь (.ics)"},
    "en": {"ok_s": "You are registered", "wait_s": "You are on the waiting list", "ok": "You are registered for “{t}”.",
           "wait": "“{t}” is full — you are on the waiting list (position {n}). We will let you know if a place becomes available.",
           "promo_s": "Your place is confirmed", "promo": "You have been moved from the waiting list: there is a place for you at “{t}”.",
           "rem_s": "Reminder", "rem": "Reminder: “{t}” is coming up.", "when": "When", "where": "Where", "guests": "Guests", "cal": "Add to calendar (.ics)"},
}


def _when(iso: str | None, lang: str) -> str:
    if not iso:
        return ""
    d = datetime.fromisoformat(iso).astimezone(timezone(timedelta(hours=5)))
    return d.strftime("%d.%m.%Y %H:%M")


def mail_body(svc, event_raw: dict, reg: dict, kind: str) -> tuple[str, str, str]:
    """(mavzu, matn, tugma havolasi) — kind: ok | wait | promo | rem."""
    lang = reg.get("lang") if reg.get("lang") in LANGS else svc.base_lang()
    ev = svc.loc(event_raw, lang)
    L = TX.get(lang, TX["uz"])
    base = svc.base_url()
    q = "" if lang == svc.base_lang() else f"?lang={lang}"
    subj = L[{"ok": "ok_s", "wait": "wait_s", "promo": "promo_s", "rem": "rem_s"}[kind]] + f": {ev['title']}"
    lines = [L[kind].format(t=ev["title"], n=reg.get("position") or "")]
    when = _when(ev.get("starts"), lang) + (f" — {_when(ev.get('ends'), lang)}" if ev.get("ends") else "")
    if when:
        lines.append(f"{L['when']}: {when}")
    if ev.get("place"):
        lines.append(f"{L['where']}: {ev['place']}")
    if reg.get("guests"):
        lines.append(f"{L['guests']}: {reg['guests']}")
    lines.append(f"{base}/events/{ev['slug']}{q}")
    return subj, "\n".join(lines), f"{base}/api/events/{ev['slug']}/calendar.ics{q}"


def send(svc, event_raw: dict, reg: dict, kind: str) -> bool:
    """Bitta xat (sinxron); email bo'lmasa — False."""
    if not reg.get("email"):
        return False
    from .mailer import render  # noqa: PLC0415

    subj, text, cal = mail_body(svc, event_raw, reg, kind)
    c = svc.mail.base_ctx(reg.get("lang"))
    html = render("notice.html", **c, title=subj, text=text, preheader=text[:120], href=cal, button=TX.get(c.get("lang") or "uz", TX["uz"])["cal"])
    return svc.mail._deliver("event", reg["email"], f"{subj} — {c['site_name']}", html)


def spawn(fn, *args) -> None:
    """Fon oqimi (testlarda sinxron chaqiruvga almashtiriladi)."""
    threading.Thread(target=fn, args=args, daemon=True).start()


def remind(svc, event_raw: dict) -> int:
    """Ro'yxatdagilar (kutish ro'yxatisiz) — eslatma xati; email bor yozuvlar soni qaytadi."""
    st = svc.st
    targets = [r for r in regs(st, event_raw["id"], status="registered") if r.get("email")]

    def run():
        for r in targets:
            if send(svc, event_raw, r, "rem"):
                with st._tx() as c:
                    c.execute("UPDATE event_regs SET reminded_at=%s WHERE id=%s", (_now(), r["id"]))

    spawn(run)
    return len(targets)


# ------------------------------------------------------------------ Excel
def xlsx(st, event: dict) -> bytes:
    from openpyxl import Workbook  # noqa: PLC0415
    from openpyxl.styles import Alignment, Font, PatternFill  # noqa: PLC0415
    from openpyxl.utils import get_column_letter  # noqa: PLC0415

    cfg = config(event)
    qs = cfg["questions"]
    label = {"registered": "Ro‘yxatda", "waitlist": "Kutish ro‘yxati", "cancelled": "Bekor qilingan"}
    head = ["№", "F.I.Sh.", "Telefon", "Email", "Maktab / muassasa", "Sinf / kurs", "Mehmonlar", *[q["label"].get("uz") or next(iter(q["label"].values())) for q in qs],
            "Holat", "Keldi", "Ro‘yxatdan o‘tgan vaqt"]
    wb = Workbook()
    ws = wb.active
    ws.title = "Ro‘yxat"
    ws.append(head)
    widths = [5, 30, 16, 26, 26, 12, 10, *[24] * len(qs), 16, 8, 18]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
        c = ws.cell(1, i)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="0A2E73")
        c.alignment = Alignment(vertical="center", wrap_text=True)
    for n, r in enumerate(regs(st, event["id"]), 1):
        ws.append([n, r["name"], r["phone"], r.get("email") or "", r.get("school") or "", r.get("grade") or "", r.get("guests") or 0,
                   *[r["answers"].get(q["id"], "") for q in qs], label.get(r["status"], r["status"]), "✓" if r["checked_in"] else "",
                   _when(r["created"], "uz")])
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
