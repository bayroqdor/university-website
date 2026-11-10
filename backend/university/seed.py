"""Stock seed content for a fresh installation (uz / ru / en).

Provides a clean starting menu, column translations, and minimal placeholder
pages so navigation works out of the box without institution-specific data.
"""
from __future__ import annotations

import html as _h
import json
import re

L3 = ("uz", "ru", "en")


def _text(html: str) -> str:
    t = re.sub(r"<br\s*/?>", "\n", html or "")
    t = re.sub(r"</(p|li|h\d)>", "\n", t)
    t = _h.unescape(re.sub(r"<[^>]+>", "", t))
    return re.sub(r"\n{2,}", "\n", t).strip()


def _blocks(blocks: list) -> str:
    """Convert simple block tuples to HTML paragraphs, headings, lists, links, and tables."""
    out = []
    for b in blocks:
        if isinstance(b, str):
            out.append(f"<p>{b}</p>")
        elif b[0] == "h":
            out.append(f"<h2>{b[1]}</h2>")
        elif b[0] in ("ul", "ol"):
            out.append(f"<{b[0]}>" + "".join(f"<li>{x}</li>" for x in b[1]) + f"</{b[0]}>")
        elif b[0] == "a":
            out.append(f'<p><a href="{b[2]}">{b[1]}</a></p>')
        elif b[0] == "img":
            if b[1]:
                out.append(f'<p><img src="{b[1]}" alt="{b[2] if len(b) > 2 else ""}"></p>')
        elif b[0] == "html":
            out.append(b[1])
        elif b[0] == "doc":
            if b[1]:
                out.append(f'<figure data-type="doc" data-src="{b[1]}" data-title="{b[2]}" class="doc-embed"><a href="{b[1]}">{b[2]}</a></figure>')
        elif b[0] == "gallery":
            imgs = [u for u in b[1] if u]
            if imgs:
                data = _h.escape(json.dumps([{"src": u, "alt": b[2] if len(b) > 2 else ""} for u in imgs]), quote=True)
                tags = "".join(f'<img src="{u}" alt="">' for u in imgs)
                out.append(f'<figure data-type="gallery" data-images="{data}" data-ratio="3 / 4" class="gallery-embed"><div class="gallery-static">{tags}</div></figure>')
        elif b[0] == "table":
            head, rows = b[1], b[2]
            out.append(
                "<table><tbody><tr>"
                + "".join(f"<th><p>{c}</p></th>" for c in head)
                + "</tr>"
                + "".join("<tr>" + "".join(f"<td><p>{c}</p></td>" for c in r) + "</tr>" for r in rows)
                + "</tbody></table>"
            )
    return "".join(out)


def _rich(kind: str, data: dict, html: dict[str, str], extra_i18n: dict | None = None) -> dict:
    """Build a multilingual content record from HTML strings."""
    uz = html.get("uz") or ""
    d = {**data, "content": None, "html": uz, "text": _text(uz), "status": data.get("status", "published")}
    i18n = {}
    for lang in ("ru", "en"):
        tr = dict((extra_i18n or {}).get(lang) or {})
        if html.get(lang):
            tr |= {"html": html[lang], "text": _text(html[lang])}
        if tr:
            i18n[lang] = tr
    d["i18n"] = i18n
    return {"kind": kind, "data": d}


def _page(slug: str, section: str, sort: int, titles: tuple, excerpts: tuple, bodies: tuple, toc: bool = False) -> dict:
    return _rich(
        "page",
        {"title": titles[0], "slug": slug, "section": section, "sort": sort, "excerpt": excerpts[0], "show_toc": toc},
        {lang: _blocks(b) for lang, b in zip(L3, bodies)},
        {"ru": {"title": titles[1], "excerpt": excerpts[1]}, "en": {"title": titles[2], "excerpt": excerpts[2]}},
    )


def demo_fees(slug: str, fac: str) -> list[dict]:
    """Tuition fees are configured explicitly in the admin panel."""
    return []


PAGES = [
    _page(
        "about-university",
        "about",
        0,
        ("Universitet haqida", "Об университете", "About the university"),
        (
            "Universitet tarixi, missiyasi va tuzilmasi haqida ma’lumot.",
            "Информация об истории, миссии и структуре университета.",
            "Overview of the university’s history, mission, and structure.",
        ),
        (
            [
                "Ushbu sahifa universitet haqida umumiy ma’lumot, missiya va asosiy yo‘nalishlarni taqdim etish uchun mo‘ljallangan.",
                "Matn, suratlar va mas’ul xodimlarni boshqaruv paneli (/admin) orqali tahrirlashingiz mumkin.",
            ],
            [
                "Эта страница предназначена для размещения общей информации об университете, его миссии и основных направлениях деятельности.",
                "Вы можете отредактировать текст, изображения и ответственных сотрудников в панели управления (/admin).",
            ],
            [
                "This page provides an overview of the university, its mission, and core academic activities.",
                "Edit this text, add photos, or attach contact staff from the admin panel (/admin).",
            ],
        ),
    ),
    _page(
        "research",
        "science",
        1,
        ("Tadqiqot va innovatsiyalar", "Исследования и инновации", "Research and innovation"),
        (
            "Ilmiy loyihalar, anjumanlar va tadqiqot markazlari haqida.",
            "О научных проектах, конференциях и исследовательских центрах.",
            "Research projects, conferences, and innovation activities.",
        ),
        (
            [
                "Ilmiy tadqiqotlar, laboratoriyalar, grantlar va xalqaro anjumanlar haqidagi ma’lumotlarni boshqaruv panelidan to‘ldiring.",
                ("a", "Barqaror rivojlanish maqsadlari", "/upgoals"),
            ],
            [
                "Заполните информацию о научных исследованиях, лабораториях, грантах и международных конференциях в панели управления.",
                ("a", "Цели устойчивого развития", "/upgoals"),
            ],
            [
                "Add details on research groups, laboratories, grants, and conferences from the admin panel.",
                ("a", "Sustainable Development Goals", "/upgoals"),
            ],
        ),
    ),
    _page(
        "anti-corruption",
        "other",
        2,
        ("Korrupsiyaga qarshi kurashish", "Противодействие коррупции", "Anti-corruption"),
        (
            "Shaffoflik, odob-axloq qoidalari va murojaat tartibi.",
            "Прозрачность, правила этики и порядок обращений.",
            "Transparency policies, ethics standards, and reporting channels.",
        ),
        (
            [
                "Korrupsiyaga qarshi kurashish siyosati va komplayens-nazorat bo‘limi haqidagi ma’lumotlarni ushbu sahifaga kiriting.",
                ("a", "Virtual qabulxona", "/contact"),
            ],
            [
                "Разместите на этой странице информацию о политике противодействия коррупции и отделе комплаенс-контроля.",
                ("a", "Виртуальная приёмная", "/contact"),
            ],
            [
                "Publish your institution’s anti-corruption policy and compliance contact details on this page.",
                ("a", "Contact us", "/contact"),
            ],
        ),
    ),
    _page(
        "terms-of-use",
        "other",
        23,
        ("Foydalanish shartlari", "Условия использования", "Terms of use"),
        (
            "Sayt materiallaridan foydalanish va shaxsiy ma’lumotlarni qayta ishlash tartibi.",
            "Порядок использования материалов сайта и обработки персональных данных.",
            "How site materials may be used and how submitted information is handled.",
        ),
        (
            [
                "Sayt materiallaridan manba ko‘rsatilgan holda foydalanish mumkin.",
                "Murojaat shakllari orqali yuborilgan ma’lumotlar faqat murojaatga javob berish uchun ishlatiladi.",
            ],
            [
                "Материалы сайта можно использовать со ссылкой на источник.",
                "Данные, отправленные через формы обращения, используются только для ответа на обращение.",
            ],
            [
                "Site materials may be reused with attribution.",
                "Information submitted through contact forms is used only to respond to the enquiry.",
            ],
        ),
    ),
]

SEED = PAGES


def _m(label: str, url: str, ru: str, en: str, group: str = "", children: list | None = None) -> dict:
    out = {"label": label, "url": url, "labels": {"ru": ru, "en": en}, "group": group}
    if children is not None:
        out["children"] = children
    return out


MENU = [
    _m(
        "Universitet haqida",
        "/about/about-university",
        "Об университете",
        "About",
        children=[
            _m("Biz haqimizda", "/about/about-university", "О нас", "About us", "Universitet"),
            _m("Ma’muriyat", "/staff?kind=leadership", "Администрация", "Leadership", "Universitet"),
            _m("Kafedralar va fakultetlar", "/faculties", "Факультеты и кафедры", "Faculties & Departments", "Universitet"),
            _m("Tuzilma", "/structure", "Структура", "Structure", "Universitet"),
            _m("Vakansiyalar", "/careers", "Вакансии", "Careers", "Universitet"),
            _m("Hujjatlar", "/documents", "Документы", "Documents", "Ochiqlik"),
            _m("Korrupsiyaga qarshi kurashish", "/about/anti-corruption", "Противодействие коррупции", "Anti-corruption", "Ochiqlik"),
        ],
    ),
    _m(
        "Abituriyent",
        "/admission",
        "Абитуриенту",
        "Admissions",
        children=[
            _m("Qabul", "/admission", "Приём", "Admissions", "Qabul"),
            _m("Ta’lim yo‘nalishlari", "/programs", "Направления обучения", "Programmes", "Bosqichlar"),
            _m("Savol-javob", "/contact#faq", "Вопросы и ответы", "FAQ", "Qabul"),
        ],
    ),
    _m(
        "Talabalar uchun",
        "/students",
        "Студентам",
        "Students",
        children=[
            _m("Dars jadvali", "/schedule", "Расписание", "Timetable", "O‘qish"),
            _m("Shaxsiy kabinet", "/login", "Личный кабинет", "Student portal", "O‘qish"),
            _m("Elektron kutubxona", "/library", "Электронная библиотека", "Online library", "O‘qish"),
            _m("Grantga qayta taqsimot", "/grant-redistribution", "Перераспределение грантов", "Grant redistribution", "Imkoniyatlar"),
        ],
    ),
    _m(
        "Tadqiqot",
        "/about/research",
        "Наука",
        "Research",
        children=[
            _m("Tadqiqot va innovatsiyalar", "/about/research", "Исследования и инновации", "Research and innovation", "Fan"),
            _m("Barqaror rivojlanish maqsadlari", "/upgoals", "Цели устойчивого развития", "Sustainable Development Goals", "Barqarorlik"),
        ],
    ),
    _m(
        "Hamkorlik",
        "/partners",
        "Партнёрство",
        "Partners",
        children=[
            _m("Hamkorlar", "/partners", "Партнёры", "Partners", "Hamkorlik"),
        ],
    ),
    _m(
        "Axborot xizmati",
        "/news",
        "Пресс-служба",
        "Newsroom",
        children=[
            _m("Yangiliklar", "/news", "Новости", "News", "Matbuot"),
            _m("E’lonlar", "/announcements", "Объявления", "Announcements", "Matbuot"),
            _m("Tadbirlar", "/events", "Мероприятия", "Events", "Matbuot"),
            _m("Aloqa", "/contact", "Контакты", "Contact", "Murojaat"),
        ],
    ),
]

MENU_GROUPS = {
    "Universitet": {"ru": "Университет", "en": "University"},
    "Ochiqlik": {"ru": "Открытость", "en": "Transparency"},
    "Qabul": {"ru": "Приём", "en": "Admissions"},
    "Bosqichlar": {"ru": "Программы", "en": "Programmes"},
    "O‘qish": {"ru": "Учёба", "en": "Study"},
    "Imkoniyatlar": {"ru": "Возможности", "en": "Opportunities"},
    "Fan": {"ru": "Наука", "en": "Research"},
    "Barqarorlik": {"ru": "Устойчивость", "en": "Sustainability"},
    "Hamkorlik": {"ru": "Сотрудничество", "en": "Partnership"},
    "Matbuot": {"ru": "Пресса", "en": "Press"},
    "Murojaat": {"ru": "Обращения", "en": "Contact"},
}
