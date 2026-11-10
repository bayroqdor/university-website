"""Yangi bo'limlar menyuda: bo'sh bo'lim (admin hali to'ldirmagan) havolasi saytda ko'rsatilmaydi.

hidden_paths() — hozir mazmuni yo'q bo'lim yo'llari (qisqa muddat keshlanadi: /api/site har sahifada so'raladi);
filter_menu() — saqlangan menyudan shu havolalarni olib tashlaydi; MENU_V6 — yangi bo'limlarning menyudagi o'rni
(yangi o'rnatishda seed.MENU ga, mavjud saytda add_to_menu() bilan bir marta qo'shiladi)."""

from __future__ import annotations

import threading
import time
from urllib.parse import urlparse

_cache: dict = {"at": 0.0, "paths": frozenset()}
_lock = threading.Lock()
TTL = 60.0

CAMPUS_PATHS = {
    "clubs": "/clubs", "sport": "/sport", "dormitory": "/dormitory", "scholarships": "/scholarships", "gallery": "/gallery",
    "steps": "/admission/steps", "calculator": "/admission/calculator", "parents": "/parents", "map": "/campus-map",
    "tour": "/virtual-tour", "life": "/student-life",
}


def _compute(svc) -> frozenset:
    from . import campus as K, journal as J, official as O  # noqa: PLC0415

    out: set[str] = set()
    for p in O.SEO_LABELS:
        try:
            if not O.section_visible(svc, p):
                out.add(p)
        except Exception:  # noqa: BLE001 — bitta bo'lim xatosi menyuni buzmasin
            out.add(p)
    try:
        for k, v in K.visible(svc).items():
            if not v and k in CAMPUS_PATHS:
                out.add(CAMPUS_PATHS[k])
    except Exception:  # noqa: BLE001
        out.update(CAMPUS_PATHS.values())
    if not J.enabled(svc.st):
        out.add("/journal")
    for kind, path in (("startup", "/startups"), ("insight", "/articles")):
        if not svc.st.list_items(kind, public=True):
            out.add(path)
    return frozenset(out)


def hidden_paths(svc) -> frozenset:
    now = time.monotonic()
    if now - _cache["at"] < TTL:
        return _cache["paths"]
    with _lock:
        if now - _cache["at"] >= TTL:
            _cache["paths"] = _compute(svc)
            _cache["at"] = time.monotonic()
    return _cache["paths"]


def reset() -> None:
    """Admin bo'lim mazmunini o'zgartirganda (yoki testlarda) keshni tozalash."""
    _cache["at"] = 0.0


def _path(url: str) -> str:
    p = urlparse(url or "").path.rstrip("/")
    return p or "/"


def filter_menu(menu: list, hidden: frozenset) -> list:
    if not hidden:
        return menu
    out = []
    for m in menu:
        if _path(m.get("url") or "") in hidden and not m.get("children"):
            continue
        out.append(m | {"children": [c for c in (m.get("children") or []) if _path(c.get("url") or "") not in hidden]})
    return out


def _m(label: str, url: str, ru: str, en: str, group: str) -> dict:
    return {"label": label, "url": url, "labels": {"ru": ru, "en": en}, "group": group}


# (ota bo'lim yo'li, shu havoladan keyin qo'yiladi (yo'q bo'lsa — guruh oxiriga), yangi havola)
MENU_V6: list[tuple[str, str, dict]] = [
    ("/about/about-university", "/about/about-university", _m("Rektor murojaati", "/rector", "Обращение ректора", "Rector’s address", "Universitet")),
    ("/about/about-university", "/rector", _m("Universitet tarixi", "/history", "История университета", "History", "Universitet")),
    ("/about/about-university", "/careers", _m("Reytinglar", "/rankings", "Рейтинги", "Rankings", "Universitet")),
    ("/about/about-university", "/documents", _m("Rahbariyat qabuli", "/reception", "Приём граждан руководством", "Reception hours", "Ochiqlik")),
    ("/about/about-university", "/reception", _m("Ochiq ma’lumotlar", "/open-data", "Открытые данные", "Open data", "Ochiqlik")),
    ("/admission", "/admission", _m("Qabul bosqichlari", "/admission/steps", "Этапы приёма", "Admission steps", "Qabul")),
    ("/admission", "/admission/steps", _m("Qaysi yo‘nalishga kira olaman?", "/admission/calculator", "Куда я могу поступить?", "Which programme can I enter?", "Qabul")),
    ("/admission", "/contact#faq", _m("Ota-onalar uchun", "/parents", "Родителям", "For parents", "Qabul")),
    ("/admission", "/parents", _m("Virtual tur", "/virtual-tour", "Виртуальный тур", "Virtual tour", "Qabul")),
    ("/admission", "/virtual-tour", _m("Kampus xaritasi", "/campus-map", "Карта кампуса", "Campus map", "Qabul")),
    ("/students", "/library", _m("To‘garaklar va klublar", "/clubs", "Кружки и клубы", "Clubs", "Imkoniyatlar")),
    ("/students", "/clubs", _m("Sport", "/sport", "Спорт", "Sport", "Imkoniyatlar")),
    ("/students", "/sport", _m("Yotoqxona", "/dormitory", "Общежитие", "Residence", "Imkoniyatlar")),
    ("/students", "/dormitory", _m("Stipendiyalar", "/scholarships", "Стипендии", "Scholarships", "Imkoniyatlar")),
    ("/students", "/scholarships", _m("Karyera markazi", "/career-center", "Центр карьеры", "Career centre", "Imkoniyatlar")),
    ("/students", "/career-center", _m("Bitiruvchilar", "/alumni", "Выпускники", "Alumni", "Imkoniyatlar")),
    ("/about/research", "/about/research", _m("Ilmiy jurnal", "/journal", "Научный журнал", "Scientific journal", "Fan")),
    ("/about/research", "/journal", _m("Startaplar va innovatsiyalar", "/startups", "Стартапы и инновации", "Startups and innovation", "Fan")),
    ("/news", "/events", _m("Galereya", "/gallery", "Галерея", "Gallery", "Matbuot")),
    ("/news", "/gallery", _m("OAV biz haqimizda", "/media-mentions", "СМИ о нас", "In the media", "Matbuot")),
    ("/news", "/media-mentions", _m("Foydali maqolalar", "/articles", "Полезные статьи", "Expert articles", "Matbuot")),
]
# eski sahifa o'rniga yangi tuzilmali bo'lim (mazmuni import qilingan)
MENU_V6_MOVES = {"/about/yotoqxona": "/dormitory"}


def add_to_menu(menu: list) -> list:
    """Mavjud (admin tahrirlagan bo'lishi mumkin) menyuga yangi havolalarni qo'shadi: allaqachon bor havola, topilmagan ota bo'lim — tegilmaydi."""
    menu = [dict(m) | {"children": [dict(c) for c in (m.get("children") or [])]} for m in menu]
    have = {_path(x.get("url") or "") for m in menu for x in [m, *m["children"]]}
    for m in menu:
        for c in m["children"]:
            new = MENU_V6_MOVES.get(_path(c.get("url") or ""))
            if new and new not in have:
                c["url"] = new
                have.add(new)
    for parent, after, item in MENU_V6:
        if item["url"] in have:
            continue
        host = next((m for m in menu if _path(m.get("url") or "") == parent), None)
        if host is None:
            continue
        kids = host["children"]
        at = next((i + 1 for i, c in enumerate(kids) if (c.get("url") or "") == after or _path(c.get("url") or "") == after), None)
        if at is None:
            at = max((i + 1 for i, c in enumerate(kids) if c.get("group") == item["group"]), default=len(kids))
        kids.insert(at, dict(item))
        have.add(item["url"])
    return menu
