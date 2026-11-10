"""Kontrakt narxlari: umumiy sozlamalar (o'quv yili, izoh, imtiyozlar, dollar kursi) va narxlarni ko'rsatish/yashirish.

Har bir yo'nalishning summasi yo'nalish yozuvida: `fees = [{"form": "day", "amount": 18500000, "old": 20000000?}, ...]` (so'm/yil).
"""
from __future__ import annotations

from .content import FEE_FORMS, LANGS, _money, _str

DEFAULT_NOTE = {
    "uz": "Narxlar bir o‘quv yili uchun. To‘lov tartibi va aniq summani qabul bo‘limidan aniqlang.",
    "ru": "Стоимость указана за один учебный год. Порядок оплаты и точную сумму уточняйте в приёмной комиссии.",
    "en": "Fees are per academic year. Please confirm the exact amount and payment schedule with the Admissions Office.",
}
DEFAULT_HIGHLIGHTS = {
    "uz": ["Davlat granti va stipendiyalar", "Bo‘lib to‘lash imkoniyati", "Talabalar yotoqxonasi"],
    "ru": ["Государственные гранты и стипендии", "Оплата в рассрочку", "Студенческое общежитие"],
    "en": ["State grants and scholarships", "Instalment payment options", "Student residence"],
}
# yangi o'rnatishda narxlar yashirin — admin «Kontrakt narxlari»da haqiqiy summalarni kiritib, ko'rsatishni yoqadi
DEFAULT = {"show": False, "demo": True, "year": "", "usd_rate": None, "note": {}, "highlights": {}}


def academic_year() -> str:
    from .storage import local_now  # noqa: PLC0415

    n = local_now()
    y = n.year if n.month >= 9 else n.year - 1
    return f"{y}/{y + 1}"


def settings(st) -> dict:
    raw = st.kv_get("tuition") or {}
    return {**DEFAULT, **{k: v for k, v in raw.items() if k in DEFAULT}}


def shown(st) -> bool:
    return bool(settings(st).get("show"))


def clean(data: dict, old: dict) -> dict:
    rate = data.get("usd_rate")
    try:
        rate = float(rate) if rate not in (None, "") else None
    except (TypeError, ValueError):
        rate = None
    hl = {}
    for lang in LANGS:
        v = (data.get("highlights") or {}).get(lang)
        if isinstance(v, str):
            v = v.split("\n")
        items = [x for x in (_str(s, 80) for s in (v or [])[:4]) if x]
        if items:
            hl[lang] = items
    return {
        "show": bool(data.get("show", old.get("show", DEFAULT["show"]))),
        "demo": False,  # admin saqlagach — namunaviy emas
        "year": _str(data.get("year"), 20),
        "usd_rate": rate if rate and 100 < rate < 1_000_000 else None,
        "note": {lang: _str((data.get("note") or {}).get(lang), 300) for lang in LANGS if _str((data.get("note") or {}).get(lang), 300)},
        "highlights": hl,
    }


def public(st, lang: str) -> dict | None:
    s = settings(st)
    if not s["show"]:
        return None
    return {"year": s["year"] or academic_year(), "currency": "UZS", "usd_rate": s["usd_rate"],
            "note": s["note"].get(lang) or DEFAULT_NOTE.get(lang) or DEFAULT_NOTE["uz"],
            "highlights": s["highlights"].get(lang) or DEFAULT_HIGHLIGHTS.get(lang) or DEFAULT_HIGHLIGHTS["uz"]}


def min_fee(item: dict) -> int | None:
    vals = [f["amount"] for f in item.get("fees") or [] if f.get("amount")]
    return min(vals) if vals else None


def clean_fees(v) -> list[dict]:
    from .content import clean_field  # noqa: PLC0415

    return clean_field(("fees",), v)


FORM_LABEL = {
    "uz": {"day": "kunduzgi", "extramural": "sirtqi", "evening": "kechki", "distance": "masofaviy", "second": "ikkinchi oliy ta’lim"},
    "ru": {"day": "очная", "extramural": "заочная", "evening": "вечерняя", "distance": "дистанционная", "second": "второе высшее"},
    "en": {"day": "full-time", "extramural": "part-time", "evening": "evening", "distance": "distance", "second": "second degree"},
}
CURRENCY = {"uz": "so‘m", "ru": "сум", "en": "UZS"}
PER_YEAR = {"uz": "yiliga", "ru": "в год", "en": "per year"}


def fmt(amount: int, lang: str) -> str:
    """18 500 000 so‘m (SEO matni va meta tavsif uchun)."""
    n = f"{amount:,}".replace(",", " " if lang in ("uz", "ru") else ",")
    return f"UZS {n}" if lang == "en" else f"{n} {CURRENCY.get(lang, 'so‘m')}"


def fee_sentence(item: dict, lang: str) -> str:
    """«Kontrakt: 18 500 000 so‘m yiliga (kunduzgi)» — meta tavsif va JS'siz botlar uchun."""
    fees = item.get("fees") or []
    if not fees:
        return ""
    head = {"uz": "Kontrakt", "ru": "Стоимость", "en": "Tuition"}.get(lang, "Kontrakt")
    tpl = {"uz": "yiliga {v} ({f})", "ru": "{v} в год ({f})", "en": "{v} per year ({f})"}.get(lang, "yiliga {v} ({f})")
    labels = FORM_LABEL.get(lang, FORM_LABEL["uz"])
    return f"{head}: " + ", ".join(tpl.format(v=fmt(f["amount"], lang), f=labels.get(f["form"], f["form"])) for f in fees) + "."


__all__ = ["FEE_FORMS", "_money"]
