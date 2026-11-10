"""SEO: sahifa meta teglari (server tomonida), JSON-LD, RSS, sitemap va robots.txt."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from email.utils import format_datetime
from html import escape
from xml.sax.saxutils import escape as xesc

from . import tuition as T
from .content import KIND_OF_SECTION, LANGS, SECTION_OF

try:
    import nh3
except ImportError:  # pragma: no cover
    nh3 = None


def abs_url(base: str, u: str) -> str:
    if not u:
        return ""
    return u if u.startswith(("http://", "https://")) else base + u


def clean_html(html: str) -> str:
    """RSS uchun xavfsiz HTML (skriptlar, hodisa atributlari olib tashlanadi)."""
    if nh3 is None:
        return escape(re.sub(r"<[^>]+>", " ", html or ""))
    return nh3.clean(html or "", url_schemes={"http", "https", "mailto"})


LOCALES = {"uz": "uz_UZ", "ru": "ru_RU", "en": "en_US"}

LABELS = {
    "uz": {"about": "Institut haqida", "programs": "Ta’lim yo‘nalishlari", "faculties": "Kafedralar", "structure": "Tuzilma", "staff": "Professor-o‘qituvchilar",
           "news": "Yangiliklar", "announcements": "E’lonlar", "events": "Tadbirlar", "admission": "Qabul", "documents": "Hujjatlar", "partners": "Hamkorlar",
           "contact": "Aloqa", "schedule": "Dars jadvali", "links": "Foydali havolalar", "login": "Kirish", "student": "Talaba kabineti", "teacher": "O‘qituvchi kabineti", "forum": "Forum", "pages": "Sahifa",
           "notfound": "Sahifa topilmadi", "students": "Talabalar uchun", "careers": "Vakansiyalar", "faq": "Ko‘p so‘raladigan savollar", "library": "Kutubxona", "symbols": "Davlat ramzlari", "search": "Qidiruv", "upgoals": "Barqaror rivojlanish maqsadlari", "grant-redistribution": "Grant taqsimoti"},
    "ru": {"about": "Об институте", "programs": "Направления обучения", "faculties": "Кафедры", "structure": "Структура", "staff": "Преподаватели",
           "news": "Новости", "announcements": "Объявления", "events": "Мероприятия", "admission": "Приём", "documents": "Документы", "partners": "Партнёры",
           "contact": "Контакты", "schedule": "Расписание", "links": "Полезные ссылки", "login": "Вход", "student": "Кабинет студента", "teacher": "Кабинет преподавателя", "forum": "Форум", "pages": "Страница",
           "notfound": "Страница не найдена", "students": "Студентам", "careers": "Вакансии", "faq": "Часто задаваемые вопросы", "library": "Библиотека", "symbols": "Государственные символы", "search": "Поиск", "upgoals": "Цели устойчивого развития", "grant-redistribution": "Перераспределение грантов"},
    "en": {"about": "About", "programs": "Programmes", "faculties": "Departments", "structure": "Structure", "staff": "Faculty & Staff",
           "news": "News", "announcements": "Announcements", "events": "Events", "admission": "Admission", "documents": "Documents", "partners": "Partners",
           "contact": "Contact", "schedule": "Timetable", "links": "Useful links", "login": "Sign in", "student": "Student portal", "teacher": "Teacher portal", "forum": "Forum", "pages": "Page",
           "notfound": "Page not found", "students": "For students", "careers": "Careers", "faq": "FAQ", "library": "Library", "symbols": "State symbols", "search": "Search", "upgoals": "Sustainable Development Goals", "grant-redistribution": "Grant redistribution"},
}
STATIC = ("about", "programs", "faculties", "structure", "staff", "news", "announcements", "events", "admission", "documents", "partners", "contact", "links", "login",
          "students", "careers", "symbols", "upgoals", "grant-redistribution")
# BRM nomlari (sahifa sarlavhasi va sayt xaritasi uchun; to'liq matnlar — frontend/src/site/upgoals/data.ts)
SDG_TITLES = [
    {"uz": "Qashshoqlikka barham berish", "ru": "Ликвидация нищеты", "en": "No poverty"},
    {"uz": "Ochlikka barham berish", "ru": "Ликвидация голода", "en": "Zero hunger"},
    {"uz": "Sog‘lik va farovonlik", "ru": "Хорошее здоровье и благополучие", "en": "Good health and well-being"},
    {"uz": "Sifatli ta’lim", "ru": "Качественное образование", "en": "Quality education"},
    {"uz": "Gender tengligi", "ru": "Гендерное равенство", "en": "Gender equality"},
    {"uz": "Toza suv va sanitariya", "ru": "Чистая вода и санитария", "en": "Clean water and sanitation"},
    {"uz": "Arzon va toza energiya", "ru": "Недорогостоящая и чистая энергия", "en": "Affordable and clean energy"},
    {"uz": "Munosib mehnat va iqtisodiy o‘sish", "ru": "Достойная работа и экономический рост", "en": "Decent work and economic growth"},
    {"uz": "Sanoat, innovatsiya va infratuzilma", "ru": "Индустриализация, инновации и инфраструктура", "en": "Industry, innovation and infrastructure"},
    {"uz": "Tengsizlikni qisqartirish", "ru": "Уменьшение неравенства", "en": "Reduced inequalities"},
    {"uz": "Barqaror shaharlar va aholi punktlari", "ru": "Устойчивые города и населённые пункты", "en": "Sustainable cities and communities"},
    {"uz": "Mas’uliyatli iste’mol va ishlab chiqarish", "ru": "Ответственное потребление и производство", "en": "Responsible consumption and production"},
    {"uz": "Iqlim o‘zgarishiga qarshi kurash", "ru": "Борьба с изменением климата", "en": "Climate action"},
    {"uz": "Suv osti hayoti", "ru": "Сохранение морских экосистем", "en": "Life below water"},
    {"uz": "Quruqlikdagi hayot", "ru": "Сохранение экосистем суши", "en": "Life on land"},
    {"uz": "Tinchlik, adolat va samarali institutlar", "ru": "Мир, правосудие и эффективные институты", "en": "Peace, justice and strong institutions"},
    {"uz": "Maqsadlar yo‘lida hamkorlik", "ru": "Партнёрство в интересах устойчивого развития", "en": "Partnerships for the goals"},
]

# Qidiruv tizimlari uchun asosiy kalit so'zlar (har tilda; admin → Universitet ma'lumotlaridagi kalit so'zlar va
# Sayt sozlamalari → SEO dagi qo'shimchalar bilan birlashtiriladi).
KEYWORDS = {
    "uz": ["universitet", "oliy ta’lim", "qabul", "bakalavriat", "magistratura", "doktorantura", "PhD", "kontrakt", "talabalar yotoqxonasi", "barqaror rivojlanish"],
    "ru": ["университет", "высшее образование", "приём", "бакалавриат", "магистратура", "докторантура", "PhD", "стоимость обучения", "общежитие", "устойчивое развитие"],
    "en": ["university", "higher education", "admission", "bachelor's degree", "master's degree", "doctoral programme", "PhD", "tuition fees", "student residence", "sustainable development"],
}
# Schema.org knowsAbout — universitet faoliyat sohalari
TOPICS = {
    "uz": ["Oliy ta’lim", "Ilmiy tadqiqot", "Bakalavriat", "Magistratura", "Doktorantura", "Barqaror rivojlanish"],
    "ru": ["Высшее образование", "Научные исследования", "Бакалавриат", "Магистратура", "Докторантура", "Устойчивое развитие"],
    "en": ["Higher education", "Research", "Bachelor's programmes", "Master's programmes", "Doctoral programmes", "Sustainable development"],
}
# Universitetning boshqa nomlari (Schema.org alternateName, futerdagi yozuv). Admin → SEO bo'limida o'zgartiriladi.
DEFAULT_ALT_NAMES: list[str] = []
# Avvalgi domenlar (301 yo'naltirish uchun) — standart ro'yxat bo'sh; admin → SEO bo'limida qo'shiladi
DEFAULT_OLD_DOMAINS: list[str] = []


def alt_names(svc) -> list[str]:
    v = (svc.site().get("seo") or {}).get("alt_names")
    return list(DEFAULT_ALT_NAMES if v is None else v)


def old_domains(svc) -> list[str]:
    v = (svc.site().get("seo") or {}).get("old_domains")
    return [d.lower() for d in (DEFAULT_OLD_DOMAINS if v is None else v)]


def keywords(svc, lang: str, extra: list | None = None) -> str:
    u, site = svc.uni_l(lang), svc.site()
    own = [*(extra or []), *(u.get("keywords") or []), *(((site.get("seo") or {}).get("keywords") or {}).get(lang) or [])]
    seen, out = set(), []
    for k in [*own, *KEYWORDS.get(lang, KEYWORDS["uz"])]:
        kl = k.strip().lower()
        if kl and kl not in seen:
            seen.add(kl)
            out.append(k.strip())
    return ", ".join(out[:48])
# kabinet / xizmat sahifalari: qidiruvga kiritilmaydi (noindex), mazmuni server tomonida chiqarilmaydi; /forum/<id> — ichki forum
# yozuviga ulashiladigan havola (faqat tizimga kirganlarga ochiladi)
PORTAL = ("student", "teacher", "xodim", "admin", "subscribe", "unsubscribe", "request", "print", "schedule", "t", "b", "live", "telegram", "document", "forum")


def _lang_url(base: str, path: str, lang: str, base_lang: str) -> str:
    return base + path + ("" if lang == base_lang else f"?lang={lang}")


HOME_SHORT = {
    "uz": "{abbr} — {name} | Qabul {year}",
    "ru": "{abbr} — {name} | Приём {year}",
    "en": "{abbr} — {name} | Admission {year}",
}
# bo'lim sahifalari uchun alohida tavsif (har sahifada bir xil tavsif bo'lmasin) — {abbr} universitet qisqa nomi
SECTION_DESC = {
    "uz": {
        "about": "{abbr} haqida: missiya, rahbariyat, fakultetlar, kafedralar va universitet hayoti.",
        "faculties": "{abbr} fakultet va kafedralari: ta’lim yo‘nalishlari va professor-o‘qituvchilar.",
        "structure": "{abbr} tuzilmasi: fakultetlar, kafedralar, markazlar va bo‘limlar — rahbarlar va aloqa ma’lumotlari.",
        "staff": "{abbr} professor-o‘qituvchilari va xodimlari.",
        "news": "{abbr} yangiliklari: universitet hayoti, ilmiy tadbirlar, hamkorlik va talabalar yutuqlari.",
        "announcements": "{abbr} e’lonlari: qabul, imtihonlar, grantlar, tanlovlar va muhim xabarlar.",
        "events": "{abbr} tadbirlari: ochiq eshiklar kuni, konferensiya, seminar va uchrashuvlar.",
        "documents": "{abbr} me’yoriy hujjatlari: ustav, ichki tartib qoidalari, nizomlar va buyruqlar — ko‘rish va yuklab olish.",
        "partners": "{abbr} hamkorlari: hamkor universitetlar, sanoat korxonalari va xalqaro tashkilotlar.",
        "contact": "{abbr} bilan bog‘lanish: manzil, telefon, email, virtual qabulxona va ko‘p so‘raladigan savollar.",
        "links": "Foydali havolalar: ta’lim portallari va {abbr} talabalari uchun resurslar.",
        "students": "{abbr} talabalari uchun: dars jadvali, kabinet, kutubxona, yotoqxona va talabalar hayoti.",
        "careers": "{abbr} vakansiyalari: professor-o‘qituvchi va xodim lavozimlari, talablar va onlayn ariza topshirish.",
        "grant-redistribution": "{abbr}: grant o‘rinlarini qayta taqsimlash uchun onlayn ariza va komissiya natijalari.",
        "upgoals": "{abbr} va BMTning 17 ta Barqaror rivojlanish maqsadi: universitet hissasi, faoliyat va hujjatlar.",
        "library": "{abbr} kutubxonasi: elektron katalog, PDF/EPUB kitoblarni onlayn o‘qish va bron qilish.",
        "admission": "{abbr} qabul {year}: bakalavriat, magistratura va doktorantura — hujjatlar, muddatlar va talablar.",
    },
    "ru": {
        "about": "О {abbr}: миссия, руководство, факультеты, кафедры и жизнь университета.",
        "faculties": "Факультеты и кафедры {abbr}: направления обучения и преподаватели.",
        "structure": "Структура {abbr}: факультеты, кафедры, центры и отделы — руководители и контакты.",
        "staff": "Преподаватели и сотрудники {abbr}.",
        "news": "Новости {abbr}: жизнь университета, научные события, партнёрство и достижения студентов.",
        "announcements": "Объявления {abbr}: приём, экзамены, гранты, конкурсы и важная информация.",
        "events": "Мероприятия {abbr}: дни открытых дверей, конференции, семинары и встречи.",
        "documents": "Нормативные документы {abbr}: устав, правила внутреннего распорядка, положения и приказы — просмотр и скачивание.",
        "partners": "Партнёры {abbr}: университеты-партнёры, предприятия и международные организации.",
        "contact": "Контакты {abbr}: адрес, телефон, email, виртуальная приёмная и часто задаваемые вопросы.",
        "links": "Полезные ссылки: образовательные порталы и ресурсы для студентов {abbr}.",
        "students": "Студентам {abbr}: расписание, личный кабинет, библиотека, общежитие и студенческая жизнь.",
        "careers": "Вакансии {abbr}: должности преподавателей и сотрудников, требования и онлайн-заявка.",
        "grant-redistribution": "{abbr}: онлайн-заявка на перераспределение грантов и результаты комиссии.",
        "upgoals": "{abbr} и 17 Целей устойчивого развития ООН: вклад университета, деятельность и документы.",
        "library": "Библиотека {abbr}: электронный каталог, чтение PDF/EPUB онлайн и бронирование.",
        "admission": "Приём {year} в {abbr}: бакалавриат, магистратура и докторантура — документы, сроки и требования.",
    },
    "en": {
        "about": "About {abbr}: mission, leadership, faculties, departments, and university life.",
        "faculties": "{abbr} faculties and departments: academic programmes and teaching staff.",
        "structure": "{abbr} structure: faculties, departments, centres, and offices — heads and contacts.",
        "staff": "{abbr} faculty and staff.",
        "news": "{abbr} news: campus life, research events, partnerships, and student achievements.",
        "announcements": "{abbr} announcements: admissions, exams, grants, competitions, and notices.",
        "events": "{abbr} events: open days, conferences, seminars, and meetings.",
        "documents": "{abbr} official documents: charter, regulations, policies, and orders — view and download.",
        "partners": "{abbr} partners: partner universities, industry partners, and international organisations.",
        "contact": "Contact {abbr}: address, phone, email, virtual reception, and frequently asked questions.",
        "links": "Useful links: education portals and student resources for {abbr}.",
        "students": "For {abbr} students: timetable, portal, library, residence, and campus life.",
        "careers": "Careers at {abbr}: faculty and staff vacancies, requirements, and online application.",
        "grant-redistribution": "{abbr}: online application for grant redistribution and committee results.",
        "upgoals": "{abbr} and the 17 UN Sustainable Development Goals: university contribution, activities, and documents.",
        "library": "{abbr} library: online catalogue, PDF/EPUB reader, audiobooks, and reservations.",
        "admission": "{abbr} admission {year}: bachelor’s, master’s, and doctoral programmes — documents, deadlines, and requirements.",
    },
}


def _fit(options: list[str], n: int = 70) -> str:
    """Birinchi n belgidan oshmaydigan variant (hammasi uzun bo'lsa — eng qisqasi)."""
    opts = [o for o in options if o]
    return next((o for o in opts if len(o) <= n), min(opts, key=len) if opts else "")


HOME_TITLE = {
    "uz": "{abbr} — {name} | Qabul {year}",
    "ru": "{abbr} — {name} | Приём {year}",
    "en": "{abbr} — {name} | Admission {year}",
}


def _admission_year(svc=None) -> int:
    """Qabul yili: admin → Bosh sahifa → «Qabul yili» (bo'sh bo'lsa — sentyabrdan keyingi yil)."""
    from .storage import local_now  # noqa: PLC0415

    y = (svc.site().get("admission_year") if svc is not None else None) or 0
    if 2000 <= int(y) <= 2100:
        return int(y)
    n = local_now()
    return n.year if n.month < 9 else n.year + 1


def _org(svc, lang: str, base: str) -> dict:
    u = svc.uni_l(lang)
    addr = {"@type": "PostalAddress", "streetAddress": u.get("address")} if u.get("address") else None
    return {k: v for k, v in {
        "@type": ["CollegeOrUniversity", "EducationalOrganization"], "@id": base + "/#org", "name": u.get("name"),
        "alternateName": list(dict.fromkeys(x for x in (u.get("abbr"), u.get("short_name"), *alt_names(svc)) if x and x != u.get("name"))) or None,
        "url": base, "logo": abs_url(base, u.get("logo") or "") or None, "image": abs_url(base, u.get("logo") or "") or None, "foundingDate": u.get("founded") or None,
        "description": u.get("short_about") or u.get("tagline") or None, "slogan": u.get("tagline") or None, "address": addr,
        "telephone": (u.get("phones") or [None])[0], "email": u.get("email") or None,
        "sameAs": [v for v in (u.get("socials") or {}).values() if v] or None,
        "knowsAbout": TOPICS.get(lang, TOPICS["uz"]), "inLanguage": lang,
    }.items() if v is not None}


def _crumbs(base: str, items: list[tuple[str, str]]) -> dict:
    return {"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(items)]}


def page_meta(svc, path: str, lang: str | None = None, preview: bool = False) -> tuple[dict, int]:
    """Yo'l bo'yicha meta ma'lumotlar va HTTP holati (tanlangan tilda). preview — admin ko'rib chiqishi (hozircha /journal: journal.page_meta)."""
    lang = svc.lang(lang)
    base_lang = svc.base_lang()
    u, s = svc.uni_l(lang), svc.site_l(lang)
    base = svc.base_url()
    name = u.get("name") or ""
    site_name = s.get("title") or u.get("abbr") or name
    labels = LABELS.get(lang, LABELS["uz"])
    seo_cfg = svc.site().get("seo") or {}
    abbr = u.get("abbr") or site_name
    custom = (seo_cfg.get("title") or {}).get(lang)
    fmt = dict(abbr=abbr, name=name, year=_admission_year(svc), site=site_name)
    # qidiruv natijasida ~60–70 belgi ko'rinadi: uzun bo'lsa qisqaroq variant olinadi (admin o'zi yozgan sarlavha — o'zgarmaydi)
    home_title = custom.format(**fmt) if custom else _fit([HOME_TITLE.get(lang, HOME_TITLE["uz"]).format(**fmt), HOME_SHORT.get(lang, HOME_SHORT["uz"]).format(**fmt),
                                                        f"{abbr} — {name}", name])
    org = _org(svc, lang, base)
    meta = {
        "title": home_title,
        "description": s.get("description") or u.get("tagline") or "",
        "image": abs_url(base, s.get("og_image") or "") or f"{base}/og/site.png?lang={lang}&v={svc.doc_version(None, lang)}",
        "image_alt": site_name,
        "url": _lang_url(base, path, lang, base_lang),
        "alternates": [(x, _lang_url(base, path, x, base_lang)) for x in LANGS],
        "x_default": base + path,
        "type": "website",
        "site_name": site_name,
        "lang": lang,
        "noindex": False,
        "keywords": keywords(svc, lang),
        "verify": {k: v for k, v in (seo_cfg.get("verify") or {}).items() if v},
        "jsonld": {"@context": "https://schema.org", "@graph": [org, {"@type": "WebSite", "@id": base + "/#website", "url": base, "name": site_name,
                                                                      "alternateName": [name, *alt_names(svc)[:4]], "publisher": {"@id": base + "/#org"}, "inLanguage": list(LANGS)}]},
        "rss": f"{base}/rss.xml" + ("" if lang == base_lang else f"?lang={lang}"),
        "accent": s.get("accent") or "#1E4FA3",
        "favicon": s.get("favicon") or "",
        "ssr": {"h1": name, "text": u.get("short_about") or u.get("tagline") or "", "links": []},
    }
    status = 200
    seg = [x for x in path.strip("/").split("/") if x]
    home = (labels.get("home") or name, base + "/")
    if not seg:
        progs = [svc.loc(p, lang) for p in svc.st.list_items("program", public=True)]
        if progs:
            org["hasOfferCatalog"] = {"@type": "OfferCatalog", "name": labels["programs"], "itemListElement": [
                {"@type": "Offer", **_price(p), "itemOffered": {"@type": "EducationalOccupationalProgram", "name": p["title"],
                                                                "url": _lang_url(base, f"/programs/{p['slug']}", lang, base_lang),
                                                                "educationalCredentialAwarded": CREDENTIAL.get(p.get("degree") or "bachelor"),
                                                                "provider": {"@id": base + "/#org"}}} for p in progs[:30]]}
        meta["ssr"]["links"] = [(labels[k], _lang_url(base, "/" + k, lang, base_lang)) for k in ("about", "programs", "faculties", "admission", "news", "announcements", "events", "careers", "contact")] + \
            [(p["title"], _lang_url(base, f"/programs/{p['slug']}", lang, base_lang)) for p in progs[:30]]
    elif seg[0] in PORTAL:
        meta.update(title=f"{labels.get(seg[0], seg[0].title())} — {site_name}", noindex=True, jsonld=None, alternates=[])
    elif "/" + "/".join(seg) in EXTRA_PAGES:
        status = _extra_page(svc, meta, "/" + "/".join(seg), lang, base, base_lang, home, name, site_name, labels)
    elif seg[0] in STATIC and len(seg) == 1:
        meta["title"] = _fit([f"{labels[seg[0]]} — {name or site_name}", f"{labels[seg[0]]} — {abbr}"])
        sd = SECTION_DESC.get(lang, SECTION_DESC["uz"]).get(seg[0])
        if sd:
            meta["description"] = sd.format(abbr=abbr, year=_admission_year(svc))
        meta["ssr"] = {"h1": labels[seg[0]], "text": meta["description"], "links": _section_links(svc, seg[0], lang, base, base_lang)}
        meta["jsonld"]["@graph"].append(_crumbs(base, [home, (labels[seg[0]], meta["url"])]))
        if seg[0] in ("programs", "admission"):
            _programs_meta(svc, meta, seg[0], lang, base, base_lang, abbr, labels)
        if seg[0] == "contact":
            faq = [svc.loc(x, lang) for x in svc.st.list_items("faq", public=True)]
            if faq:
                meta["jsonld"]["@graph"].append({"@type": "FAQPage", "mainEntity": [
                    {"@type": "Question", "name": q["title"], "acceptedAnswer": {"@type": "Answer", "text": q.get("answer") or ""}} for q in faq]})
                meta["ssr"]["faq"] = [(q["title"], q.get("answer") or "") for q in faq]
    elif seg[0] == "journal":  # ilmiy jurnal: Google Scholar (citation_*), Dublin Core, JSON-LD — journal.py
        from . import journal as J  # noqa: PLC0415

        status = J.page_meta(svc, meta, seg, lang, labels, home, preview)
    elif seg[0] == "upgoals" and len(seg) == 2:
        n = int(seg[1]) if seg[1].isdigit() else 0
        if not 1 <= n <= 17:
            meta.update(title=f"{labels['notfound']} — {site_name}", noindex=True, jsonld=None)
            status = 404
        else:
            gt = SDG_TITLES[n - 1].get(lang) or SDG_TITLES[n - 1]["uz"]
            word = {"uz": "maqsad", "ru": "Цель", "en": "Goal"}.get(lang, "maqsad")
            head = f"{n}-{word}: {gt}" if lang == "uz" else f"{word} {n}: {gt}"
            meta["title"] = _fit([f"{head} — {abbr}", head])
            meta["description"] = f"{head}. " + SECTION_DESC.get(lang, SECTION_DESC["uz"])["upgoals"].format(abbr=abbr, year=_admission_year(svc))
            up = _lang_url(base, "/upgoals", lang, base_lang)
            meta["jsonld"]["@graph"].append(_crumbs(base, [home, (labels["upgoals"], up), (head, meta["url"])]))
            meta["ssr"] = {"h1": head, "text": meta["description"], "links": [(labels["upgoals"], up)]}
    elif seg[0] == "library":
        # kutubxona: katalog va kitob sahifasi indekslanadi; o'quvchi va pleyer — yo'q
        if len(seg) == 1:
            meta["title"] = _fit([f"{labels['library']} — {name or site_name}", f"{labels['library']} — {abbr}"])
            meta["description"] = SECTION_DESC.get(lang, SECTION_DESC["uz"])["library"].format(abbr=abbr, year=_admission_year(svc))
            meta["jsonld"]["@graph"].append(_crumbs(base, [home, (labels["library"], meta["url"])]))
        elif len(seg) == 3 and seg[1] == "book":
            b = svc.st._q("SELECT * FROM lib_books WHERE id=%s", (seg[2],)) if svc.st.has_table("lib_books") else []
            if not b:
                meta.update(title=f"{labels['notfound']} — {site_name}", noindex=True, jsonld=None)
                status = 404
            else:
                b = dict(b[0])
                authors = [a for a in json.loads(b.get("authors") or "[]") if a]
                meta.update(title=f"{b['title']}{' — ' + ', '.join(authors[:2]) if authors else ''} | {labels['library']}", type="book",
                            description=(b.get("annotation") or "")[:300] or meta["description"])
                if b.get("cover"):
                    meta["image"] = abs_url(base, b["cover"])
                meta["image_alt"] = b["title"]
                book = {"@type": "Book", "name": b["title"], "url": meta["url"], "inLanguage": b.get("lang") or None,
                        "author": [{"@type": "Person", "name": a} for a in authors] or None, "isbn": b.get("isbn") or None,
                        "publisher": {"@type": "Organization", "name": b["publisher"]} if b.get("publisher") else None,
                        "datePublished": str(b["year"]) if b.get("year") else None, "numberOfPages": b.get("pages") or None,
                        "image": meta["image"] if b.get("cover") else None, "description": (b.get("annotation") or "")[:500] or None}
                meta["jsonld"]["@graph"].append({k: v for k, v in book.items() if v is not None})
                meta["jsonld"]["@graph"].append(_crumbs(base, [home, (labels["library"], _lang_url(base, "/library", lang, base_lang)), (b["title"], meta["url"])]))
        else:
            meta.update(title=f"{labels['library']} — {site_name}", noindex=True, jsonld=None, alternates=[])
    elif seg[0] == "about" and len(seg) == 2:
        _detail(svc, meta, "page", seg[1], labels, site_name, name, base, path, lang, base_lang)
        if meta.get("noindex"):
            status = 404
    elif len(seg) == 2 and seg[0] in KIND_OF_SECTION:
        kind = KIND_OF_SECTION[seg[0]]
        if not _detail(svc, meta, kind, seg[1], labels, site_name, name, base, path, lang, base_lang):
            status = 404
        elif seg[0] in labels:
            meta["jsonld"]["@graph"].append(_crumbs(base, [home, (labels[seg[0]], _lang_url(base, "/" + seg[0], lang, base_lang)), (meta["image_alt"], meta["url"])]))
    elif (ext := _extra_meta(svc, meta, seg, lang, base, base_lang, home)) is not None:
        status = ext
    else:
        meta.update(title=f"{labels['notfound']} — {site_name}", noindex=True, alternates=[], jsonld=None)
        status = 404
    if meta.get("noindex"):
        meta["alternates"] = []
    return meta, status


# bo'lim + tafsilot sahifalari kengaytmalari (career.py: /career-center, /partners/<slug>, /alumni, /startups, /articles):
# EXTRA_META — fn(svc, meta, seg, lang, base, base_lang, home) -> HTTP holati yoki None (yo'l unga tegishli emas);
# EXTRA_SITEMAP — fn(svc) -> [(yo'l, o'zgargan, tillar, chastota, ustuvorlik, rasm)]
EXTRA_META: list = []
EXTRA_SITEMAP: list = []


def _extra_meta(svc, meta: dict, seg: list[str], lang: str, base: str, base_lang: str, home: tuple) -> int | None:
    for fn in EXTRA_META:
        st = fn(svc, meta, seg, lang, base, base_lang, home)
        if st is not None:
            return st
    return None


# boshqa modullar qo'shadigan ochiq sahifalar: yo'l → fn(svc, path, lang) -> {title, description, text, links, jsonld, lastmod} yoki None
# (None — bo'lim bo'sh/yashirin: 404 + noindex, sayt xaritasiga kirmaydi). official.py: /reception, /open-data, /rankings, /history, /rector, /media-mentions
EXTRA_PAGES: dict = {}


def _extra_page(svc, meta: dict, path: str, lang: str, base: str, base_lang: str, home: tuple, name: str, site_name: str, labels: dict) -> int:
    info = EXTRA_PAGES[path](svc, path, lang)
    if not info:
        meta.update(title=f"{labels['notfound']} — {site_name}", noindex=True, alternates=[], jsonld=None)
        return 404
    meta["title"] = _fit([f"{info['title']} — {name or site_name}", f"{info['title']} — {svc.uni_l(lang).get('abbr') or site_name}", info["title"]])
    meta["description"] = info.get("description") or meta["description"]
    meta["ssr"] = {"h1": info["title"], "text": info.get("text") or meta["description"], "links": list(info.get("links") or [])}
    graph = meta["jsonld"]["@graph"]
    graph.append(_crumbs(base, [home, (info["title"], meta["url"])]))
    for x in info.get("jsonld") or []:
        graph.append(json.loads(json.dumps(x).replace('"/#org"', json.dumps(base + "/#org")).replace('"contentUrl": "/', f'"contentUrl": "{base}/')))
    return 200


def _section_links(svc, section: str, lang: str, base: str, base_lang: str) -> list[tuple[str, str]]:
    kind = KIND_OF_SECTION.get(section) or ("page" if section == "about" else None)
    if not kind:
        return []
    sec = "about" if kind == "page" else section
    return [(svc.loc(x, lang)["title"], _lang_url(base, f"/{sec}/{x['slug']}", lang, base_lang)) for x in svc.st.list_items(kind, public=True)[:60] if x.get("slug")]


def _detail(svc, meta: dict, kind: str, slug: str, labels: dict, site_name: str, org: str, base: str, path: str, lang: str, base_lang: str) -> bool:
    raw = svc.st.get_item_by_slug(kind, slug)
    if not raw:
        meta.update(title=f"{labels['notfound']} — {site_name}", noindex=True, jsonld=None)
        return False
    it = svc.loc(raw, lang)
    served = it["lang"]
    desc = it.get("meta_description") or it.get("excerpt") or it.get("summary") or it.get("bio") or it.get("position") or meta["description"]
    if kind == "staff":
        # har bir professor sahifasining tavsifi alohida: ism, lavozim, daraja va qisqa biografiya
        head = ", ".join(x for x in (it.get("position"), it.get("degree")) if x)
        desc = f"{it['title']}{' — ' + head if head else ''}. {it.get('bio') or ''}".strip()
    elif not it.get("meta_description") and len(desc or "") < 110 and it.get("text"):
        # qisqa izoh — sahifa matnining boshi bilan to'ldiriladi (qidiruv natijasida ~150 belgi ko'rinadi)
        body = re.sub(r"\s+", " ", it["text"]).strip()
        if desc and body.startswith(desc[:40]):
            body = body[len(desc):].strip()
        desc = (f"{desc} {body}" if desc else body)[:240]
        desc = desc.rsplit(" ", 1)[0] + "…" if len(desc) >= 240 else desc
    if len(desc or "") < 90 and org and org not in (desc or ""):
        desc = f"{(desc or '').rstrip('. ')}. {org}." if desc else org
    section = SECTION_OF[kind]
    img_own = it.get("og_image") or it.get("feature_image") or it.get("cover") or it.get("photo") or ""
    img = abs_url(base, img_own) or f"{base}/og/{section}/{it['slug']}.png?lang={served}&v={svc.doc_version(raw, served)}"
    meta.update(title=f"{it.get('meta_title') or it['title']} — {site_name}", description=re.sub(r"\s+", " ", desc or "")[:300], image=img, image_alt=it["title"],
                type="article" if kind in ("news", "announce") else "website", lang=served, url=_lang_url(base, path, served, base_lang),
                alternates=[(x, _lang_url(base, path, x, base_lang)) for x in it["langs"]],
                keywords=keywords(svc, served, [it["title"], *(it.get("tags") or [])]),
                ssr={"h1": it["title"], "text": (it.get("text") or desc or "")[:4000], "links": []})
    graph = meta["jsonld"]["@graph"]
    org_ref = {"@id": base + "/#org"}
    ld = None
    if kind in ("news", "announce"):
        meta["published"] = it.get("published_at")
        ld = {"@type": "NewsArticle", "headline": it["title"], "description": meta["description"], "image": img or None, "datePublished": it.get("published_at"),
              "dateModified": it.get("updated"), "author": org_ref, "publisher": org_ref, "mainEntityOfPage": meta["url"],
              "keywords": ", ".join(it.get("tags") or []) or None, "inLanguage": served}
    elif kind == "event":
        ld = {"@type": "EducationEvent", "name": it["title"], "description": meta["description"], "startDate": it.get("starts"), "endDate": it.get("ends"),
              "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode", "eventStatus": "https://schema.org/EventScheduled", "image": img or None,
              "location": {"@type": "Place", "name": it.get("place") or org, "address": {"@type": "PostalAddress", "addressLocality": svc.uni_l(served).get("address") or None}},
              "organizer": org_ref}
    elif kind == "program":
        ld = {"@type": "EducationalOccupationalProgram", "name": it["title"], "description": meta["description"], "url": meta["url"], "provider": org_ref,
              "educationalCredentialAwarded": CREDENTIAL.get(it.get("degree") or "", None),
              "timeToComplete": DURATION.get(it.get("degree") or "bachelor"), "inLanguage": _lang_codes(it.get("languages")) or None,
              "programPrerequisites": PREREQ.get(it.get("degree") or "bachelor", "Secondary education"), "occupationalCategory": it.get("careers") or None,
              "educationalProgramMode": "full-time" if any(f.get("form") == "day" for f in it.get("fees") or []) else None,
              "offers": [{"@type": "Offer", "category": "Tuition", "price": f["amount"], "priceCurrency": "UZS",
                          "name": T.FORM_LABEL["en"].get(f["form"], f["form"]),
                          "priceSpecification": {"@type": "UnitPriceSpecification", "price": f["amount"], "priceCurrency": "UZS", "unitText": "YEAR",
                                                 "referenceQuantity": {"@type": "QuantitativeValue", "value": 1, "unitCode": "ANN"}}}
                         for f in it.get("fees") or []] or None}
        fee = T.fee_sentence(it, served)
        if fee:
            if not it.get("meta_description"):
                meta["description"] = (fee + " " + meta["description"])[:300].strip() if meta["description"] else fee
            meta["ssr"]["text"] = fee + " " + meta["ssr"]["text"]
    elif kind == "faculty":
        ld = {"@type": "CollegeOrUniversity", "name": it["title"], "description": meta["description"], "url": meta["url"], "parentOrganization": org_ref}
    elif kind == "staff":
        ld = {"@type": "Person", "name": it["title"], "jobTitle": it.get("position"), "worksFor": org_ref, "image": abs_url(base, it.get("photo") or "") or None,
              "honorificSuffix": it.get("degree") or None, "knowsAbout": it.get("interests") or None}
    elif kind == "vacancy":
        ld = {"@type": "JobPosting", "title": it["title"], "description": it.get("html") or meta["description"], "datePosted": (it.get("published_at") or it.get("created") or "")[:10],
              "validThrough": it.get("deadline"), "hiringOrganization": {"@type": "Organization", "name": org, "sameAs": base, "logo": abs_url(base, svc.uni().get("logo") or "") or None},
              "employmentType": {"full_time": "FULL_TIME", "part_time": "PART_TIME", "contract": "CONTRACTOR", "internship": "INTERN", "remote": "FULL_TIME"}.get(it.get("employment") or "", "FULL_TIME"),
              "jobLocation": {"@type": "Place", "address": {"@type": "PostalAddress", "streetAddress": svc.uni_l(served).get("address")}},
              "directApply": True, "industry": "Higher education"}
        if it.get("employment") == "remote":
            ld["jobLocationType"] = "TELECOMMUTE"
    if ld:
        graph.append({k: v for k, v in ld.items() if v not in (None, "", [])})
    return True


# Schema.org: daraja → diplom, o'qish muddati (ISO 8601) va kirish talabi
CREDENTIAL = {"bachelor": "Bachelor's degree", "master": "Master's degree", "joint": "Two state master's degrees (1+1 joint programme)",
              "phd": "Doctor of Philosophy (PhD)"}
DURATION = {"bachelor": "P4Y", "master": "P2Y", "joint": "P2Y", "phd": "P3Y"}
PREREQ = {"bachelor": "Secondary education", "master": "Bachelor's degree", "joint": "Bachelor's degree", "phd": "Master's degree"}

_LANG_CODE = {"o‘zbek": "uz", "o'zbek": "uz", "uzbek": "uz", "узбекский": "uz", "ingliz": "en", "english": "en", "английский": "en",
              "rus": "ru", "russian": "ru", "русский": "ru"}


def _lang_codes(names) -> list[str]:
    """«O‘zbek, Rus» → ["uz", "ru"] (Schema.org inLanguage — BCP 47 kodlari)."""
    out = []
    for n in names or []:
        c = _LANG_CODE.get(str(n).strip().lower().replace("’", "'").replace("‘", "'")) or _LANG_CODE.get(str(n).strip().lower())
        if c and c not in out:
            out.append(c)
    return out


def _price(p: dict) -> dict:
    m = T.min_fee(p)
    return {"price": m, "priceCurrency": "UZS", "category": "Tuition"} if m else {}


PROGRAMS_TITLE = {
    "uz": "Ta’lim yo‘nalishlari va kontrakt narxlari {year} — {name}",
    "ru": "Направления обучения и стоимость контракта {year} — {name}",
    "en": "Programmes and tuition fees {year} — {name}",
}
# narxlar kiritilmagan yoki yashirilgan bo'lsa
PROGRAMS_TITLE_NOFEE = {
    "uz": "Ta’lim dasturlari {year}: bakalavriat, magistratura, PhD — {name}",
    "ru": "Программы {year}: бакалавриат, магистратура, докторантура — {name}",
    "en": "Programmes {year}: bachelor’s, master’s and doctoral — {name}",
}
ADMISSION_TITLE = {
    "uz": "Qabul {adm}: hujjat topshirish, kontrakt narxlari — {name}",
    "ru": "Приём {adm}: подача документов, стоимость контракта — {name}",
    "en": "Admission {adm}: how to apply, tuition fees — {name}",
}
ADMISSION_TITLE_NOFEE = {
    "uz": "Qabul {adm}: hujjat topshirish, yo‘nalishlar va muddatlar — {name}",
    "ru": "Приём {adm}: подача документов, направления и сроки — {name}",
    "en": "Admission {adm}: how to apply, programmes and deadlines — {name}",
}
PROGRAMS_DESC = {
    "uz": "{n} ta ta’lim dasturi — bakalavriat, magistratura va doktorantura.",
    "ru": "Образовательные программы ({n}) — бакалавриат, магистратура и докторантура.",
    "en": "{n} academic programmes — bachelor’s, master’s and doctoral studies.",
}
# narx oralig'i — faqat admin narxlarni kiritib, ko'rsatishni yoqqan bo'lsa
PROGRAMS_FEE = {
    "uz": "Kontrakt {lo} – {hi} yiliga.",
    "ru": "Контракт {lo} – {hi} в год.",
    "en": "Tuition {lo} – {hi} per year.",
}


def _programs_meta(svc, meta: dict, page: str, lang: str, base: str, base_lang: str, org_name: str, labels: dict) -> None:
    """Yo'nalishlar va Qabul sahifalari: narxlar ko'rsatilsa — sarlavhada «kontrakt narxlari», tavsifda narx oralig'i; ItemList va havolalar."""
    progs = [svc.loc(p, lang) for p in svc.st.list_items("program", public=True)]
    year = (T.public(svc.st, lang) or {}).get("year") or T.academic_year()
    fees = [m for m in (T.min_fee(p) for p in progs) if m]
    if page == "programs":
        meta["title"] = (PROGRAMS_TITLE if fees else PROGRAMS_TITLE_NOFEE).get(lang, PROGRAMS_TITLE["uz"] if fees else PROGRAMS_TITLE_NOFEE["uz"]).format(year=year, name=org_name)
        if progs:
            desc = PROGRAMS_DESC.get(lang, PROGRAMS_DESC["uz"]).format(n=len(progs))
            if fees:
                desc += " " + PROGRAMS_FEE.get(lang, PROGRAMS_FEE["uz"]).format(lo=T.fmt(min(fees), lang), hi=T.fmt(max(fees), lang))
            meta["description"] = desc
        meta["jsonld"]["@graph"].append({"@type": "ItemList", "name": labels["programs"], "numberOfItems": len(progs), "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": _lang_url(base, f"/programs/{p['slug']}", lang, base_lang), "name": p["title"]} for i, p in enumerate(progs)]})
    else:
        tpl = ADMISSION_TITLE if fees else ADMISSION_TITLE_NOFEE
        meta["title"] = tpl.get(lang, tpl["uz"]).format(adm=_admission_year(svc), name=org_name)
    meta["ssr"]["text"] = meta["description"]
    meta["ssr"]["links"] = [(f"{p['title']} — {T.fee_sentence(p, lang)}" if p.get("fees") else p["title"], _lang_url(base, f"/programs/{p['slug']}", lang, base_lang))
                            for p in progs] + (meta["ssr"].get("links") or [] if page == "admission" else [])


def inject(index_html: str, meta: dict) -> str:
    e = lambda v: escape(str(v or ""), quote=True)  # noqa: E731
    tags = [
        f"<title>{e(meta['title'])}</title>",
        f'<meta name="description" content="{e(meta["description"])}">',
        f'<link rel="canonical" href="{e(meta["url"])}">',
        f'<meta property="og:type" content="{e(meta["type"])}">',
        f'<meta property="og:title" content="{e(meta["title"])}">',
        f'<meta property="og:description" content="{e(meta["description"])}">',
        f'<meta property="og:url" content="{e(meta["url"])}">',
        f'<meta property="og:locale" content="{LOCALES.get(meta["lang"], "uz_UZ")}">',
        f'<meta property="og:site_name" content="{e(meta["site_name"])}">',
        f'<meta name="twitter:card" content="{"summary_large_image" if meta.get("image") else "summary"}">',
        f'<meta name="theme-color" content="{e(meta["accent"])}">',
        f'<link rel="alternate" type="application/rss+xml" title="{e(meta["site_name"])}" href="{e(meta["rss"])}">',
    ]
    if meta.get("keywords") and not meta.get("noindex"):
        tags.append(f'<meta name="keywords" content="{e(meta["keywords"])}">')
        tags.append('<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">')
    for k, name in (("google", "google-site-verification"), ("yandex", "yandex-verification"), ("bing", "msvalidate.01"), ("naver", "naver-site-verification")):
        if (meta.get("verify") or {}).get(k):
            tags.append(f'<meta name="{name}" content="{e(meta["verify"][k])}">')
    if meta.get("image"):
        tags.append(f'<meta property="og:image" content="{e(meta["image"])}">')
        tags.append(f'<meta name="twitter:image" content="{e(meta["image"])}">')
        if "/og/" in meta["image"]:
            tags += ['<meta property="og:image:type" content="image/png">', '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">']
        if meta.get("image_alt"):
            tags.append(f'<meta property="og:image:alt" content="{e(meta["image_alt"])}">')
    if meta.get("published"):
        tags.append(f'<meta property="article:published_time" content="{e(meta["published"])}">')
    if meta.get("favicon"):
        tags.append(f'<link rel="icon" href="{e(meta["favicon"])}">')
    if meta.get("noindex"):
        tags.append('<meta name="robots" content="noindex, nofollow">')
    alts = meta.get("alternates") or []
    if len(alts) > 1:
        tags += [f'<link rel="alternate" hreflang="{x}" href="{e(u)}">' for x, u in alts]
        tags.append(f'<link rel="alternate" hreflang="x-default" href="{e(meta.get("x_default") or alts[0][1])}">')
        tags += [f'<meta property="og:locale:alternate" content="{LOCALES[x]}">' for x, _ in alts if x != meta["lang"]]
    tags += meta.get("head_extra") or []  # tayyor (escape qilingan) teglar: ilmiy maqolaning citation_* / DC.* meta teglari
    if meta.get("jsonld"):
        tags.append('<script type="application/ld+json">' + json.dumps(_prune(meta["jsonld"]), ensure_ascii=False).replace("</", "<\\/") + "</script>")
    html = re.sub(r"<title>.*?</title>", "", index_html, count=1, flags=re.S)
    html = html.replace('<html lang="uz">', f'<html lang="{e(meta["lang"])}">', 1)
    html = html.replace("</head>", "\n    " + "\n    ".join(tags) + "\n  </head>", 1)
    ssr = meta.get("ssr") if not meta.get("noindex") else None
    if ssr:
        # JavaScript bajarmaydigan qidiruv botlari uchun sahifa matni va ichki havolalar (brauzerda ko'rinmaydi)
        parts = [ssr["html"]] if ssr.get("html") else [f"<h1>{e(ssr.get('h1'))}</h1>", f"<p>{e(ssr.get('text'))}</p>"]  # html — tayyor, escape qilingan
        for q, a in ssr.get("faq") or []:
            parts.append(f"<h3>{e(q)}</h3><p>{e(a)}</p>")
        if ssr.get("links"):
            parts.append("<ul>" + "".join(f'<li><a href="{e(u)}">{e(t)}</a></li>' for t, u in ssr["links"]) + "</ul>")
        html = html.replace('<div id="root"></div>', '<div id="root"></div>\n    <noscript><main>' + "".join(parts) + "</main></noscript>", 1)
    return html


def _prune(v):
    if isinstance(v, dict):
        return {k: _prune(x) for k, x in v.items() if x not in (None, "", [], {})}
    if isinstance(v, list):
        return [_prune(x) for x in v]
    return v


def rss(svc, lang: str | None = None) -> str:
    base = svc.base_url()
    lang = svc.lang(lang)
    base_lang = svc.base_lang()
    u, s = svc.uni_l(lang), svc.site_l(lang)
    title = s.get("title") or u.get("abbr") or "UNI"
    items = []
    rows = [("news", it) for it in svc.st.list_items("news", public=True)] + [("announce", it) for it in svc.st.list_items("announce", public=True)]
    rows.sort(key=lambda x: x[1].get("published_at") or "", reverse=True)
    for kind, raw in rows[:40]:
        it = svc.loc(raw, lang)
        link = _lang_url(base, f"/{SECTION_OF[kind]}/{it['slug']}", it["lang"], base_lang)
        pub = datetime.fromisoformat(it["published_at"]) if it.get("published_at") else datetime.now(timezone.utc)
        body = clean_html(it.get("html") or "") or xesc(it.get("excerpt") or "")
        cats = "".join(f"<category>{xesc(t)}</category>" for t in it.get("tags") or [])
        items.append(
            f"<item><title>{xesc(it['title'])}</title><link>{link}</link><guid isPermaLink=\"true\">{link}</guid>"
            f"<pubDate>{format_datetime(pub)}</pubDate><description>{xesc(it.get('excerpt') or '')}</description>"
            f"<content:encoded><![CDATA[{body.replace(']]>', ']]]]><![CDATA[>')}]]></content:encoded>{cats}</item>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
        f"<title>{xesc(title)}</title><link>{base}/news</link><description>{xesc(s.get('description') or '')}</description>"
        f"<language>{lang}</language><atom:link href=\"{xesc(_lang_url(base, '/rss.xml', lang, base_lang))}\" rel=\"self\" type=\"application/rss+xml\"/>"
        + "".join(items) + "</channel></rss>"
    )


def sitemap(svc) -> str:
    base = svc.base_url()
    base_lang = svc.base_lang()

    def alts(path: str, langs) -> str:
        if len(langs) < 2:
            return ""
        return "".join(f'<xhtml:link rel="alternate" hreflang="{x}" href="{xesc(_lang_url(base, path, x, base_lang))}"/>' for x in langs) + \
            f'<xhtml:link rel="alternate" hreflang="x-default" href="{xesc(base + path)}"/>'

    static = [("/", "daily", "1.0"), ("/admission", "weekly", "0.9"), ("/programs", "weekly", "0.9"), ("/faculties", "weekly", "0.8"), ("/about", "monthly", "0.8"),
              ("/news", "daily", "0.8"), ("/announcements", "daily", "0.7"), ("/events", "weekly", "0.6"), ("/careers", "weekly", "0.6"), ("/contact", "monthly", "0.7"),
              ("/students", "monthly", "0.5"), ("/structure", "monthly", "0.5"), ("/documents", "monthly", "0.4"), ("/partners", "monthly", "0.5"), ("/links", "monthly", "0.3"),
              ("/library", "daily", "0.7"), ("/upgoals", "monthly", "0.6"), ("/grant-redistribution", "weekly", "0.6")] + [(f"/upgoals/{n}", "monthly", "0.4") for n in range(1, 18)]
    urls = [(p, None, LANGS, f, pr, "") for p, f, pr in static]
    for p, fn in EXTRA_PAGES.items():
        info = fn(svc, p, base_lang)
        if info:
            urls.append((p, info.get("lastmod"), LANGS, "monthly", "0.5", ""))
    for fn in EXTRA_SITEMAP:
        urls += fn(svc)
    from . import journal as J  # noqa: PLC0415

    urls += J.sitemap_urls(svc)  # ilmiy jurnal: bosh sahifa, sonlar, maqolalar va ularning PDF'lari
    if svc.st.has_table("lib_books"):
        for r in svc.st._q("SELECT id, updated, cover FROM lib_books ORDER BY updated DESC LIMIT 5000"):
            urls.append((f"/library/book/{r['id']}", r["updated"], LANGS, "monthly", "0.4", abs_url(base, r["cover"] or "")))
    prio = {"program": "0.8", "faculty": "0.7", "page": "0.7", "news": "0.6", "announce": "0.6", "event": "0.5", "vacancy": "0.5", "staff": "0.4", "department": "0.4"}
    for kind, section in SECTION_OF.items():
        for it in svc.st.list_items(kind, public=True):
            if it.get("slug"):
                sec = "about" if kind == "page" else section
                img = it.get("feature_image") or it.get("cover") or it.get("photo") or ""
                urls.append((f"/{sec}/{it['slug']}", it.get("updated"), svc.loc(it, base_lang)["langs"], "weekly", prio.get(kind, "0.5"), abs_url(base, img)))
    body = "".join(
        f"<url><loc>{xesc(_lang_url(base, path, x, base_lang))}</loc>{f'<lastmod>{m[:10]}</lastmod>' if m else ''}<changefreq>{f}</changefreq><priority>{pr}</priority>"
        f"{alts(path, langs)}{f'<image:image><image:loc>{xesc(img)}</image:loc></image:image>' if img else ''}</url>"
        for path, m, langs, f, pr, img in urls for x in langs
    )
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
            'xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' + body + "</urlset>")


def robots(svc) -> str:
    return (f"User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /print/\nDisallow: /student\nDisallow: /teacher\nDisallow: /xodim\nDisallow: /forum\n"
            f"Disallow: /unsubscribe\n\nSitemap: {svc.base_url()}/sitemap.xml\nSitemap: {svc.base_url()}/rss.xml\n")


# ------------------------------------------------------------------ IndexNow: yangi/yangilangan sahifani qidiruv tizimlariga darhol xabar qilish
def indexnow_key(svc) -> str:
    k = svc.st.kv_get("indexnow_key")
    if not k:
        import secrets  # noqa: PLC0415

        k = secrets.token_hex(16)
        svc.st.kv_put("indexnow_key", k)
    return k


def _public_host(base: str) -> str | None:
    from urllib.parse import urlparse  # noqa: PLC0415

    h = urlparse(base).hostname or ""
    if not h or h in ("localhost",) or h.startswith(("127.", "10.", "192.168.", "172.")) or "." not in h or h.endswith((".local", ".test", ".lan", ".example", ".invalid", ".localhost")):
        return None
    return h


def indexnow(svc, paths: list[str]) -> None:
    """Fon oqimida IndexNow ga yuborish (sozlamada o'chirilmagan va sayt ommaviy domenda bo'lsa). Xatolar e'tiborsiz."""
    base = svc.base_url()
    host = _public_host(base)
    if not host or not paths or (svc.site().get("seo") or {}).get("indexnow") is False:
        return
    import threading  # noqa: PLC0415

    import httpx  # noqa: PLC0415

    key = indexnow_key(svc)
    base_lang = svc.base_lang()
    urls = [_lang_url(base, p, x, base_lang) for p in paths for x in LANGS]

    def go():
        try:
            httpx.post("https://api.indexnow.org/indexnow", json={"host": host, "key": key, "keyLocation": f"{base}/indexnow.txt", "urlList": urls[:100]}, timeout=10)
        except Exception:  # noqa: BLE001
            pass
    threading.Thread(target=go, daemon=True).start()
