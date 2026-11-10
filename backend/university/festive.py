"""Bayram bezaklari: O'zbekiston bayramlari, ularning sanalari va saytda qancha vaqt turishi.

Har bir bayram uchun: sana qoidasi (har yili bir xil kun yoki oy kalendari bo'yicha yillar jadvali), necha kun oldin
boshlanib, necha kun keyin tugashi, bezak uslubi (`style` — frontend shu bo'yicha animatsiya tanlaydi) va 3 tilda (uz / ru / en) tabrik.
Yangi o'rnatishda bezaklar o'chiq. Admin bezaklarni va har bir bayramni yoqadi/o'chiradi, kunlar sonini yoki aniq boshlanish/tugash sanasini belgilaydi, o'z tadbirini qo'shadi.

Oy kalendari bo'yicha sanalar (Ramazon va Qurbon hayiti) — taxminiy jadval; har yili rasmiy e'londan keyin
admin aniq sanani kiritadi (`overrides`).
"""
from __future__ import annotations

import re
import secrets
from datetime import date, timedelta

LANGS = ("uz", "ru", "en")

# (oy, kun) yoki {yil: "OY-KUN"}
PRESETS: list[dict] = [
    # --- O'zbekiston
    {"id": "newyear", "region": "uz", "style": "newyear", "date": (1, 1), "before": 12, "after": 6, "countdown": True,
     "name": {"uz": "Yangi yil", "ru": "Новый год", "en": "New Year"},
     "greeting": {"uz": "Yangi yilingiz muborak bo‘lsin!", "ru": "С Новым годом!", "en": "Happy New Year!"}},
    {"id": "womens_day", "region": "uz", "style": "flowers", "date": (3, 8), "before": 2, "after": 1,
     "name": {"uz": "Xalqaro xotin-qizlar kuni", "ru": "Международный женский день", "en": "International Women’s Day"},
     "greeting": {"uz": "Aziz ayollar, bayramingiz muborak!", "ru": "С 8 Марта, дорогие женщины!", "en": "Happy Women’s Day!"}},
    {"id": "navruz", "region": "uz", "style": "navruz", "date": (3, 21), "before": 5, "after": 4,
     "name": {"uz": "Navro‘z", "ru": "Навруз", "en": "Navruz"},
     "greeting": {"uz": "Navro‘zi olam muborak bo‘lsin!", "ru": "С праздником Навруз!", "en": "Happy Navruz!"}},
    {"id": "remembrance", "region": "uz", "style": "remembrance", "date": (5, 9), "before": 1, "after": 0,
     "name": {"uz": "Xotira va qadrlash kuni", "ru": "День памяти и почестей", "en": "Day of Remembrance and Honour"},
     "greeting": {"uz": "Xotira — abadiy, qadr — muqaddas", "ru": "Помним и чтим", "en": "We remember and honour"}},
    {"id": "independence", "region": "uz", "style": "independence", "date": (9, 1), "before": 3, "after": 2,
     "name": {"uz": "Mustaqillik kuni", "ru": "День независимости", "en": "Independence Day"},
     "greeting": {"uz": "Mustaqillik bayrami muborak!", "ru": "С Днём независимости!", "en": "Happy Independence Day!"}},
    {"id": "teachers_day", "region": "uz", "style": "teachers", "date": (10, 1), "before": 1, "after": 1,
     "name": {"uz": "O‘qituvchi va murabbiylar kuni", "ru": "День учителя и наставника", "en": "Teachers’ Day"},
     "greeting": {"uz": "Ustozlar, bayramingiz muborak!", "ru": "С Днём учителя!", "en": "Happy Teachers’ Day!"}},
    {"id": "constitution", "region": "uz", "style": "constitution", "date": (12, 8), "before": 1, "after": 0,
     "name": {"uz": "Konstitutsiya kuni", "ru": "День Конституции", "en": "Constitution Day"},
     "greeting": {"uz": "Konstitutsiya kuni muborak!", "ru": "С Днём Конституции!", "en": "Happy Constitution Day!"}},
    {"id": "eid_fitr", "region": "uz", "style": "eid", "before": 1, "after": 2,
     "date": {2025: "03-30", 2026: "03-20", 2027: "03-10", 2028: "02-27", 2029: "02-15", 2030: "02-05"},
     "name": {"uz": "Ramazon hayiti", "ru": "Рамазан хайит", "en": "Eid al-Fitr"},
     "greeting": {"uz": "Ramazon hayitingiz muborak bo‘lsin!", "ru": "С праздником Рамазан хайит!", "en": "Eid Mubarak!"}},
    {"id": "eid_adha", "region": "uz", "style": "eid", "before": 1, "after": 3,
     "date": {2025: "06-06", 2026: "05-27", 2027: "05-17", 2028: "05-05", 2029: "04-24", 2030: "04-13"},
     "name": {"uz": "Qurbon hayiti", "ru": "Курбан хайит", "en": "Eid al-Adha"},
     "greeting": {"uz": "Qurbon hayitingiz muborak bo‘lsin!", "ru": "С праздником Курбан хайит!", "en": "Eid al-Adha Mubarak!"}},
]

STYLES = ("newyear", "navruz", "flowers", "remembrance", "independence", "teachers", "constitution", "eid")
EFFECTS = ("particles", "garland", "banner", "click", "cursor", "fireworks", "buttons")

# yangi o'rnatishda bezaklar o'chiq (sayt dizayni keskin effektlarsiz) — admin «Bayram bezaklari»da yoqadi
DEFAULT = {"enabled": False, "intensity": 2, "effects": {e: True for e in EFFECTS}, "holidays": {}, "custom": [], "force": None}


def _img(v) -> str | None:
    """Sahna surati: sayt media kutubxonasidagi fayl yoki https manzil."""
    v = str(v or "").strip()[:500]
    return v if re.fullmatch(r"(/media/|https://)[^\s\"'<>]+", v) else None


def _d(s) -> date | None:
    try:
        return date.fromisoformat(str(s)[:10]) if s else None
    except ValueError:
        return None


def settings(st) -> dict:
    raw = st.kv_get("festive") or {}
    out = {**DEFAULT, **{k: v for k, v in raw.items() if k in DEFAULT}}
    out["effects"] = {e: bool((raw.get("effects") or {}).get(e, True)) for e in EFFECTS}
    return out


def clean(data: dict) -> dict:
    """Admin yuborgan sozlamalarni tekshirish."""
    out = {"enabled": bool(data.get("enabled", DEFAULT["enabled"])), "intensity": max(1, min(3, int(data.get("intensity") or 2))),
           "effects": {e: bool((data.get("effects") or {}).get(e, True)) for e in EFFECTS}, "holidays": {}, "custom": [], "force": None}
    ids = {p["id"] for p in PRESETS}
    for hid, h in (data.get("holidays") or {}).items():
        if hid not in ids or not isinstance(h, dict):
            continue
        out["holidays"][hid] = {
            "enabled": bool(h.get("enabled", True)),
            "before": max(0, min(60, int(h.get("before") if h.get("before") not in (None, "") else _preset(hid)["before"]))),
            "after": max(0, min(60, int(h.get("after") if h.get("after") not in (None, "") else _preset(hid)["after"]))),
            "dates": {str(int(y)): d for y, d in (h.get("dates") or {}).items() if re.fullmatch(r"\d{4}", str(y)) and re.fullmatch(r"\d{2}-\d{2}", str(d or ""))},
            "start": str(_d(h.get("start")) or "") or None, "end": str(_d(h.get("end")) or "") or None,
            "greeting": {lang: str((h.get("greeting") or {}).get(lang) or "")[:200] for lang in LANGS if (h.get("greeting") or {}).get(lang)},
            "image": _img(h.get("image")),
        }
    for c in (data.get("custom") or [])[:30]:
        if not isinstance(c, dict) or not _d(c.get("start")) or not _d(c.get("end")):
            continue
        cid = re.sub(r"[^a-z0-9_]", "", str(c.get("id") or "")) or "c" + secrets.token_hex(4)
        out["custom"].append({"id": cid[:24], "enabled": bool(c.get("enabled", True)), "style": c.get("style") if c.get("style") in STYLES else "newyear",
                              "start": str(_d(c["start"])), "end": str(_d(c["end"])),
                              "name": {lang: str((c.get("name") or {}).get(lang) or "")[:120] for lang in LANGS},
                              "greeting": {lang: str((c.get("greeting") or {}).get(lang) or "")[:200] for lang in LANGS},
                              "image": _img(c.get("image"))})
    f = data.get("force")
    out["force"] = f if f in ids or any(c["id"] == f for c in out["custom"]) else None
    return out


def _preset(hid: str) -> dict:
    return next(p for p in PRESETS if p["id"] == hid)


def occurrence(p: dict, year: int, cfg: dict | None = None) -> date | None:
    """Bayramning shu yildagi sanasi (admin kiritgan sana jadvaldan ustun)."""
    dates = (cfg or {}).get("dates") or {}
    if str(year) in dates:
        m, d = map(int, dates[str(year)].split("-"))
        return date(year, m, d)
    rule = p["date"]
    if isinstance(rule, tuple):
        return date(year, *rule)
    s = rule.get(year)
    if not s:
        return None
    m, d = map(int, s.split("-"))
    return date(year, m, d)


def windows(p: dict, cfg: dict, today: date) -> list[tuple[date, date, date]]:
    """(boshlanish, tugash, bayram kuni) — o'tgan, joriy va keyingi yil uchun."""
    before = cfg.get("before", p["before"])
    after = cfg.get("after", p["after"])
    out = []
    for y in (today.year - 1, today.year, today.year + 1):
        day = occurrence(p, y, cfg)
        if day:
            out.append((day - timedelta(days=before), day + timedelta(days=after), day))
    s, e = _d(cfg.get("start")), _d(cfg.get("end"))
    if s and e and e >= s:
        # aniq sana berilgan — o'sha davrdagi hisoblangan oynaning o'rniga
        out = [w for w in out if w[1] < s or w[0] > e] + [(s, e, next((w[2] for w in out if s <= w[2] <= e), s))]
    return sorted(out)


def _loc(d: dict, lang: str) -> str:
    return (d or {}).get(lang) or (d or {}).get("uz") or next((v for v in (d or {}).values() if v), "")


def _public(item: dict, lang: str, cfg: dict, start: date, end: date, day: date, s: dict) -> dict:
    greeting = (cfg.get("greeting") or {}).get(lang) or _loc(item.get("greeting") or {}, lang)
    return {"id": item["id"], "style": item["style"], "name": _loc(item.get("name") or {}, lang), "greeting": greeting,
            "start": str(start), "end": str(end), "day": str(day), "countdown": bool(item.get("countdown")),
            "intensity": s["intensity"], "effects": s["effects"], "image": cfg.get("image") or item.get("image") or ""}


def active(st, today: date, lang: str = "uz", preview: str | None = None) -> dict | None:
    """Bugun saytda ko'rinadigan bezak (yo'q bo'lsa — None). `preview` — admin ko'rib chiqishi uchun (`?festive=id`)."""
    s = settings(st)
    want = preview or s.get("force")
    if want:
        p = next((x for x in PRESETS if x["id"] == want), None)
        if p:
            cfg = s["holidays"].get(p["id"], {})
            w = min(windows(p, cfg, today) or [(today, today, today)], key=lambda w: abs((w[2] - today).days))
            return _public(p, lang, cfg, w[0], w[1], w[2], s) | {"preview": bool(preview)}
        c = next((x for x in s["custom"] if x["id"] == want), None)
        if c:
            return _public(c, lang, {}, _d(c["start"]), _d(c["end"]), _d(c["start"]), s) | {"preview": bool(preview)}
        if preview in STYLES:  # uslubni ko'rish
            p = next(x for x in PRESETS if x["style"] == preview)
            return _public(p, lang, {}, today, today, today, s) | {"preview": True}
    if not s["enabled"]:
        return None
    # ustuvorlik: o'z tadbiri → bayram kuniga yaqinrog'i → oynasi qisqarog'i
    hits: list[tuple[int, int, dict]] = []
    for c in s["custom"]:
        if c["enabled"] and _d(c["start"]) <= today <= _d(c["end"]):
            hits.append((-1, (_d(c["end"]) - _d(c["start"])).days, _public(c, lang, {}, _d(c["start"]), _d(c["end"]), _d(c["start"]), s)))
    for p in PRESETS:
        cfg = s["holidays"].get(p["id"], {})
        if not cfg.get("enabled", True):
            continue
        for a, b, day in windows(p, cfg, today):
            if a <= today <= b:
                hits.append((abs((day - today).days), (b - a).days, _public(p, lang, cfg, a, b, day, s)))
    return min(hits, key=lambda h: (h[0], h[1]))[2] if hits else None


def overview(st, today: date) -> dict:
    """Admin sahifasi uchun: har bir bayram, uning keyingi sanasi va oynasi."""
    s = settings(st)
    items = []
    for p in PRESETS:
        cfg = s["holidays"].get(p["id"], {})
        ws = windows(p, cfg, today)
        nxt = next((w for w in ws if w[1] >= today), None)
        items.append({"id": p["id"], "region": p["region"], "style": p["style"], "name": p["name"], "greeting": p["greeting"],
                      "fixed": isinstance(p["date"], tuple), "default_before": p["before"], "default_after": p["after"],
                      "table": {str(k): v for k, v in p["date"].items()} if isinstance(p["date"], dict) else None,
                      "next": {"start": str(nxt[0]), "end": str(nxt[1]), "day": str(nxt[2]), "now": nxt[0] <= today <= nxt[1]} if nxt else None})
    return {"settings": s, "holidays": items, "styles": list(STYLES), "effects": list(EFFECTS), "today": str(today),
            "active": active(st, today, "uz")}
