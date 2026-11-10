"""Talabalar hayoti, abituriyent va galereya: kontent turlari (`items` jadvali) — faqat ma'lumot (content.py oxirida ro'yxatga olinadi).

  club         — to'garak va klublar (ilmiy, sport, ijodiy, volontyorlik, boshqa); sport seksiyalari — category=sport
  achievement  — yutuqlar (sport musobaqalari va boshqalar): yil, musobaqa, natija, sportchi/jamoa, surat
  facility     — inshootlar (sport zali, maydonlar…)
  dorm         — talabalar turar joyi binolari
  scholarship  — stipendiyalar va imtiyozlar
  album        — galereya albomlari (suratlar alt matni bilan, YouTube videolar)
  adm_step     — qabul bosqichlari (qabul yili bo'yicha)
  campus_spot  — kampus xaritasidagi nuqtalar
  tour_scene   — virtual tur sahnalari (ekvirektangulyar panorama + nuqtalar)

Bu modul content.py ni import qilmaydi (u bizni import qiladi); tozalash funksiyalari kerakli yordamchilarni chaqirilganda oladi.
"""
from __future__ import annotations

import math
import re

_RICH = {"content": ("json", 3_000_000), "html": ("text", 3_000_000), "text": ("text", 1_000_000)}
_VIS = ("enum", ["draft", "published"])

CLUB_CATS = ["science", "sport", "creative", "volunteer", "other"]
SCHOLAR_TAGS = ["course1", "course2", "course3", "course4", "master", "phd", "excellence", "sport", "creative", "research", "social"]
FORMS = ("day", "extramural", "evening", "distance", "second")

SCHEMAS = {
    "club": {
        "title": ("str", 300), "slug": ("slug",), "category": ("enum", CLUB_CATS), "summary": ("text", 600), **_RICH,
        "leader_staff_id": ("str", 40), "leader": ("str", 200), "schedule": ("str", 200), "place": ("str", 200), "contact": ("str", 160),
        "telegram": ("url",), "join_url": ("url",), "join_form": ("bool",), "cover": ("url",), "cover_alt": ("str", 300), "photos": ("json", 200_000),
        "news_tag": ("str", 60), "status": _VIS, "sort": ("int",), "featured": ("bool",),
    },
    "achievement": {
        "title": ("str", 300), "year": ("int",), "result": ("str", 200), "athlete": ("str", 300), "category": ("enum", ["sport", "science", "creative", "other"]),
        "photo": ("url",), "photo_alt": ("str", 300), "url": ("url",), "status": _VIS, "sort": ("int",), "featured": ("bool",),
    },
    "facility": {
        "title": ("str", 200), "category": ("enum", ["sport", "study", "living", "other"]), "summary": ("text", 1200), "place": ("str", 200),
        "hours": ("str", 200), "photo": ("url",), "photo_alt": ("str", 300), "status": _VIS, "sort": ("int",), "featured": ("bool",),
    },
    "dorm": {
        "title": ("str", 200), "summary": ("text", 1200), "address": ("str", 300), "map_url": ("url",), "capacity": ("int",), "rooms": ("list", 10, 120),
        "amenities": ("list", 20, 120), "price": ("str", 120), "price_period": ("enum", ["month", "semester", "year"]), "phone": ("str", 60),
        "photos": ("json", 200_000), "status": _VIS, "sort": ("int",), "featured": ("bool",),
    },
    "scholarship": {
        "title": ("str", 300), "summary": ("text", 600), "amount": ("str", 160), "eligibility": ("text", 1500), "criteria": ("list", 15, 300),
        "period": ("str", 200), "documents": ("list", 15, 300), "url": ("url",), "tags": ("list", 11, 20), "status": _VIS, "sort": ("int",), "featured": ("bool",),
    },
    "album": {
        "title": ("str", 300), "slug": ("slug",), "date": ("iso",), "summary": ("text", 1200), "cover": ("url",), "photos": ("json", 600_000),
        "videos": ("list", 12, 300), "news_id": ("str", 40), "tags": ("list", 12, 40), "status": _VIS, "sort": ("int",), "featured": ("bool",),
    },
    "adm_step": {
        "title": ("str", 200), "year": ("int",), "starts": ("iso",), "ends": ("iso",), "summary": ("text", 1000), "url": ("url",), "button": ("str", 60),
        "status": _VIS, "sort": ("int",), "featured": ("bool",),
    },
    "campus_spot": {
        "title": ("str", 200), "number": ("int",), "summary": ("text", 1200), "inside": ("list", 20, 160), "photo": ("url",), "photo_alt": ("str", 300),
        "x": ("float",), "y": ("float",), "scene_id": ("str", 40), "url": ("url",), "status": _VIS, "sort": ("int",), "featured": ("bool",),
    },
    "tour_scene": {
        "title": ("str", 200), "summary": ("text", 600), "panorama": ("url",), "yaw": ("float",), "pitch": ("float",), "hfov": ("float",),
        "hotspots": ("json", 200_000), "status": _VIS, "sort": ("int",), "featured": ("bool",),
    },
}
_R = ("content", "html", "text")
TRANSLATABLE = {
    "club": ("title", "summary", *_R, "leader", "schedule", "place", "cover_alt"),
    "achievement": ("title", "result", "athlete", "photo_alt"),
    "facility": ("title", "summary", "place", "hours", "photo_alt"),
    "dorm": ("title", "summary", "address", "rooms", "amenities", "price"),
    "scholarship": ("title", "summary", "amount", "eligibility", "criteria", "period", "documents"),
    "album": ("title", "summary"),
    "adm_step": ("title", "summary", "button"),
    "campus_spot": ("title", "summary", "inside", "photo_alt"),
    "tour_scene": ("title", "summary"),
}
WITH_SLUG = {"club", "album"}
SECTION_OF = {"club": "clubs", "album": "gallery"}  # saytdagi yo'l (SEO, sayt xaritasi — campus_seo.py; content.SECTION_OF ga qo'shilmaydi)

# kontent turi → admin ruxsati (roles.ITEM_PERM bilan bir xil)
ITEM_PERM = {"club": "student_life", "achievement": "student_life", "facility": "student_life", "dorm": "student_life", "scholarship": "student_life",
             "album": "gallery", "adm_step": "admission", "campus_spot": "admission", "tour_scene": "admission"}
# qidiruv: (admin ruxsati, admin yo'li, saytdagi yo'li)
SEARCH_KINDS = {
    "club": ("student_life", "/admin/clubs?id={id}", "/clubs/{slug}"),
    "album": ("gallery", "/admin/gallery?id={id}", "/gallery/{slug}"),
    "scholarship": ("student_life", "/admin/scholarships?id={id}", "/scholarships"),
    "dorm": ("student_life", "/admin/dormitory?id={id}", "/dormitory"),
}
SITE_SEARCH = ("club", "album", "scholarship", "dorm")


# ------------------------------------------------------------------ «photos» maydoni
def clean_photos(v, limit: int) -> list[dict]:
    """[{url, alt, caption, w?, h?, i18n: {ru: {alt, caption}, en: {...}}}] — bo'sh/xavfli manzillar tashlanadi, takrorlar olib tashlanadi."""
    from .content import LANGS, _num, _str, safe_url  # noqa: PLC0415

    out, seen = [], set()
    for x in (v or [])[:limit] if isinstance(v, list) else []:
        if isinstance(x, str):
            x = {"url": x}
        if not isinstance(x, dict):
            continue
        url = safe_url(x.get("url"))
        if not url or url in seen:
            continue
        seen.add(url)
        p = {"url": url, "alt": _str(x.get("alt"), 300), "caption": _str(x.get("caption"), 500)}
        for k in ("w", "h"):
            n = _num(x.get(k), int, None)
            if n and 0 < n < 100_000:
                p[k] = n
        tr = {}
        for lang in LANGS:
            t = (x.get("i18n") or {}).get(lang) if isinstance(x.get("i18n"), dict) else None
            if isinstance(t, dict):
                c = {k: _str(t.get(k), n) for k, n in (("alt", 300), ("caption", 500)) if _str(t.get(k), n)}
                if c:
                    tr[lang] = c
        if tr:
            p["i18n"] = tr
        out.append(p)
    return out


def photo_l(p: dict, lang: str) -> dict:
    """Surat tanlangan tilda: tarjima bo'lsa — alt/izoh tarjimadan."""
    tr = (p.get("i18n") or {}).get(lang) or {}
    return {k: v for k, v in p.items() if k != "i18n"} | {k: v for k, v in tr.items() if v}


# ------------------------------------------------------------------ tekshiruvlar (content.KIND_RULES orqali): ValueError → 400
YT = re.compile(r"^https://(www\.|m\.)?(youtube\.com/(watch\?v=|embed/|shorts/|live/)|youtu\.be/)([\w-]{11})")


def youtube_id(u: str) -> str:
    m = YT.match(str(u or "").strip())
    return m.group(4) if m else ""


def _need_alts(merged: dict, status: str) -> None:
    if status != "published":
        return
    for p in merged.get("photos") or []:
        if not (p.get("alt") or "").strip():
            raise ValueError("photo_alt_required")
    for img, alt in (("cover", "cover_alt"), ("photo", "photo_alt")):
        if alt in merged and merged.get(img) and not (merged.get(alt) or "").strip():
            # muqova galereyadagi surat bo'lsa — uning alt matni olinadi
            same = next((p for p in merged.get("photos") or [] if p.get("url") == merged.get(img)), None)
            if same and same.get("alt"):
                merged[alt] = same["alt"]
                continue
            raise ValueError("photo_alt_required")


def _finite(v, lo: float, hi: float, default=None):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    return min(max(x, lo), hi) if math.isfinite(x) else default


def clean_hotspots(v) -> list[dict]:
    from .content import LANGS, _str  # noqa: PLC0415

    out = []
    for h in (v or [])[:60] if isinstance(v, list) else []:
        if not isinstance(h, dict) or h.get("type") not in ("scene", "info"):
            continue
        yaw, pitch = _finite(h.get("yaw"), -180, 180), _finite(h.get("pitch"), -90, 90)
        if yaw is None or pitch is None:
            continue
        x = {"type": h["type"], "yaw": round(yaw, 2), "pitch": round(pitch, 2), "text": _str(h.get("text"), 200)}
        if h["type"] == "scene":
            x["target"] = _str(h.get("target"), 40)
            if not x["target"]:
                continue
        tr = {lang: _str((h.get("i18n") or {}).get(lang), 200) for lang in LANGS if isinstance(h.get("i18n"), dict) and _str(h["i18n"].get(lang), 200)}
        if tr:
            x["i18n"] = tr
        if not x["text"] and h["type"] == "info":
            continue
        out.append(x)
    return out


def _v_photos(merged: dict, status: str) -> None:
    _need_alts(merged, status)


def _v_album(merged: dict, status: str) -> None:
    vids = []
    for u in merged.get("videos") or []:
        vid = youtube_id(u)
        if vid and vid not in vids:
            vids.append(vid)
    merged["videos"] = [f"https://www.youtube.com/watch?v={v}" for v in vids]
    if merged.get("cover") and not any(p["url"] == merged["cover"] for p in merged.get("photos") or []):
        merged["cover"] = ""  # muqova — albomdagi suratlardan biri
    _need_alts(merged, status)
    if status == "published" and not merged.get("photos") and not merged.get("videos"):
        raise ValueError("album_empty")


def _v_step(merged: dict, status: str) -> None:
    y = merged.get("year")
    if not y or not 2000 <= int(y) <= 2100:
        raise ValueError("year_required")
    if merged.get("starts") and merged.get("ends") and merged["ends"] < merged["starts"]:
        raise ValueError("bad_dates")


def _v_spot(merged: dict, status: str) -> None:
    for k in ("x", "y"):
        if merged.get(k) is not None:
            merged[k] = _finite(merged[k], 0, 100)
    _need_alts(merged, status)


def _v_scene(merged: dict, status: str) -> None:
    merged["hotspots"] = clean_hotspots(merged.get("hotspots"))
    merged["yaw"] = _finite(merged.get("yaw"), -180, 180, 0.0)
    merged["pitch"] = _finite(merged.get("pitch"), -90, 90, 0.0)
    merged["hfov"] = _finite(merged.get("hfov"), 30, 120, 100.0)
    if status == "published" and not merged.get("panorama"):
        raise ValueError("panorama_required")


VALIDATORS = {"club": _v_photos, "achievement": _v_photos, "facility": _v_photos, "dorm": _v_photos, "album": _v_album, "adm_step": _v_step,
              "campus_spot": _v_spot, "tour_scene": _v_scene}
PHOTO_LIMIT = {"club": 60, "dorm": 40, "album": 300}


def _rule(kind: str):
    def rule(merged: dict, status: str) -> str:
        if kind in PHOTO_LIMIT:
            merged["photos"] = clean_photos(merged.get("photos"), PHOTO_LIMIT[kind])
        VALIDATORS[kind](merged, status)
        return status
    return rule


def register() -> None:
    """Turlarni umumiy kontent tizimiga qo'shadi (content.py oxirida chaqiriladi)."""
    from . import content as C  # noqa: PLC0415

    C.SCHEMAS.update(SCHEMAS)
    C.TRANSLATABLE.update(TRANSLATABLE)
    C.KINDS_WITH_SLUG |= WITH_SLUG
    C.KIND_RULES.update({k: _rule(k) for k in VALIDATORS})
