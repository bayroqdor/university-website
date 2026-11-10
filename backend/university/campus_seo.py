"""Talabalar hayoti va abituriyent sahifalari uchun server tomonidagi meta teglar (seo.page_meta dan chaqiriladi) va sayt xaritasi.

Bo'lim yashirin bo'lsa (mazmuni yo'q) — 404 + noindex. Batafsil sahifalar (/clubs/<slug>, /gallery/<slug>) seo._detail orqali.
"""
from __future__ import annotations

import re

from . import campus as K

# yo'l → (bo'lim kaliti visible() da, sarlavha kaliti)
ROUTES = {
    ("student-life",): "life", ("clubs",): "clubs", ("sport",): "sport", ("dormitory",): "dormitory", ("scholarships",): "scholarships",
    ("gallery",): "gallery", ("admission", "steps"): "steps", ("admission", "calculator"): "calculator", ("parents",): "parents",
    ("campus-map",): "map", ("virtual-tour",): "tour",
}
PATHS = {v: "/" + "/".join(k) for k, v in ROUTES.items()}
PARENT = {"clubs": "life", "sport": "life", "dormitory": "life", "scholarships": "life", "gallery": "life",
          "steps": "admission", "calculator": "admission", "parents": "admission", "map": "admission", "tour": "admission"}

LABELS = {
    "uz": {"life": "Talabalar hayoti", "clubs": "To‘garaklar va klublar", "sport": "Sport", "dormitory": "Talabalar turar joyi", "scholarships": "Stipendiyalar va imtiyozlar",
           "gallery": "Galereya", "steps": "Qabul bosqichlari", "calculator": "Qaysi yo‘nalishga kira olaman?", "parents": "Ota-onalar uchun",
           "map": "Kampus xaritasi", "tour": "Virtual tur", "admission": "Abituriyentlarga"},
    "ru": {"life": "Студенческая жизнь", "clubs": "Кружки и клубы", "sport": "Спорт", "dormitory": "Студенческое общежитие", "scholarships": "Стипендии и льготы",
           "gallery": "Галерея", "steps": "Этапы приёма", "calculator": "Куда я могу поступить?", "parents": "Родителям",
           "map": "Карта кампуса", "tour": "Виртуальный тур", "admission": "Абитуриентам"},
    "en": {"life": "Student life", "clubs": "Clubs and societies", "sport": "Sport", "dormitory": "Student residence", "scholarships": "Scholarships and benefits",
           "gallery": "Gallery", "steps": "Admission timeline", "calculator": "Which programme can I get into?", "parents": "For parents",
           "map": "Campus map", "tour": "Virtual tour", "admission": "Applicants"},
}
DESC = {
    "uz": {"life": "{abbr} talabalar hayoti: to‘garak va klublar, sport, talabalar turar joyi, stipendiyalar va fotogalereya.",
           "clubs": "{abbr} to‘garak va klublari: ilmiy, sport, ijodiy va volontyorlik — rahbar, mashg‘ulot vaqti, joyi va qo‘shilish.",
           "sport": "{abbr} sport hayoti: sport seksiyalari, yutuqlar va sport inshootlari.",
           "dormitory": "{abbr} talabalar turar joyi: binolar, xonalar, qoidalar, joylashish tartibi va ariza berish.",
           "scholarships": "{abbr} stipendiyalari va imtiyozlari: kimlar olishi mumkin, mezonlar, hujjatlar va muddatlar.",
           "gallery": "{abbr} fotogalereyasi: institut hayoti, tadbirlar va talabalar — albomlar va videolar.",
           "steps": "{abbr} qabul {year}: qabul bosqichlari va muddatlari — hujjat topshirishdan o‘qishga qabulgacha.",
           "calculator": "{abbr} qabul kalkulyatori: test balingiz bo‘yicha grant va kontrakt asosida qaysi yo‘nalishlarga kirish mumkinligini o‘tgan yillar o‘tish ballari bilan solishtiring.",
           "parents": "{abbr} ota-onalar uchun: institut haqida, o‘qish narxi, yotoqxona, talabalarni qo‘llab-quvvatlash va aloqa.",
           "map": "{abbr} kampus xaritasi: binolar, auditoriyalar, kutubxona va boshqa joylar.",
           "tour": "{abbr} virtual turi: kampusni 360° panoramalarda ko‘ring."},
    "ru": {"life": "Студенческая жизнь {abbr}: кружки и клубы, спорт, общежитие, стипендии и фотогалерея.",
           "clubs": "Кружки и клубы {abbr}: научные, спортивные, творческие и волонтёрские — руководитель, расписание, место и как вступить.",
           "sport": "Спорт в {abbr}: спортивные секции, достижения и спортивные объекты.",
           "dormitory": "Студенческое общежитие {abbr}: корпуса, комнаты, правила, порядок заселения и подача заявки.",
           "scholarships": "Стипендии и льготы {abbr}: кто может получить, критерии, документы и сроки.",
           "gallery": "Фотогалерея {abbr}: жизнь института, мероприятия и студенты — альбомы и видео.",
           "steps": "Приём {year} в {abbr}: этапы и сроки приёма — от подачи документов до зачисления.",
           "calculator": "Калькулятор поступления {abbr}: сравните свой балл с проходными баллами прошлых лет на грант и контракт по направлениям.",
           "parents": "{abbr} для родителей: об институте, стоимость обучения, общежитие, поддержка студентов и контакты.",
           "map": "Карта кампуса {abbr}: корпуса, аудитории, библиотека и другие места.",
           "tour": "Виртуальный тур по {abbr}: кампус в панорамах 360°."},
    "en": {"life": "Student life at {abbr}: clubs and societies, sport, student residence, scholarships and photo gallery.",
           "clubs": "{abbr} clubs and societies: research, sport, creative and volunteering — leader, meeting times, place and how to join.",
           "sport": "Sport at {abbr}: sports sections, achievements and facilities.",
           "dormitory": "{abbr} student residence: buildings, rooms, rules, how to apply.",
           "scholarships": "{abbr} scholarships and benefits: who is eligible, criteria, documents and deadlines.",
           "gallery": "{abbr} photo gallery: institute life, events and students — albums and videos.",
           "steps": "{abbr} admission {year}: admission timeline and deadlines — from applying to enrolment.",
           "calculator": "{abbr} admission calculator: compare your test score with previous years’ grant and contract passing scores for each programme.",
           "parents": "{abbr} for parents: about the institute, tuition fees, student residence, student support and contacts.",
           "map": "{abbr} campus map: buildings, classrooms, library and other places.",
           "tour": "{abbr} virtual tour: see the campus in 360° panoramas."},
}


def _key(seg: list[str]) -> str | None:
    if len(seg) == 1 and (seg[0],) in ROUTES:
        return ROUTES[(seg[0],)]
    if len(seg) == 2 and (seg[0], seg[1]) in ROUTES:
        return ROUTES[(seg[0], seg[1])]
    if len(seg) == 2 and seg[0] in ("clubs", "gallery"):
        return seg[0] + "/"
    return None


def page_meta(svc, seg: list[str], path: str, meta: dict, lang: str, labels: dict, site_name: str, name: str, home: tuple) -> int | None:
    """Mos yo'l bo'lmasa — None; aks holda meta to'ldiriladi va HTTP holati qaytadi."""
    key = _key(seg)
    if key is None:
        return None
    from . import seo  # noqa: PLC0415

    base, base_lang = svc.base_url(), svc.base_lang()
    L = LABELS.get(lang, LABELS["uz"])
    abbr = svc.uni_l(lang).get("abbr") or site_name
    vis = K.visible(svc)
    url = lambda p: seo._lang_url(base, p, lang, base_lang)  # noqa: E731

    def notfound() -> int:
        meta.update(title=f"{labels['notfound']} — {site_name}", noindex=True, alternates=[], jsonld=None)
        return 404

    def crumbs(items: list[tuple[str, str]]) -> None:
        meta["jsonld"]["@graph"].append(seo._crumbs(base, [home, *items]))

    def parent_crumb(k: str) -> list[tuple[str, str]]:
        par = PARENT.get(k)
        if par == "life" and vis.get("life"):
            return [(L["life"], url(PATHS["life"]))]
        if par == "admission":
            return [(labels.get("admission") or L["admission"], url("/admission"))]
        return []

    if key.endswith("/"):  # batafsil sahifa: klub yoki albom
        sec = key[:-1]
        kind = "club" if sec == "clubs" else "album"
        raw = svc.st.get_item_by_slug(kind, seg[1])
        if not raw or (kind == "album" and not (raw.get("photos") or raw.get("videos"))):
            return notfound()
        it = svc.loc(raw, lang)
        served = it["lang"]
        desc = re.sub(r"\s+", " ", it.get("summary") or it.get("text") or "").strip()[:300] or DESC.get(served, DESC["uz"])[sec].format(abbr=abbr, year="")
        photos = K.photos_l(raw, served)
        img = it.get("cover") or (photos[0]["url"] if photos else "")
        meta.update(title=seo._fit([f"{it['title']} — {L[sec]} — {abbr}", f"{it['title']} — {abbr}", it["title"]]), description=desc, lang=served,
                    url=seo._lang_url(base, path, served, base_lang), alternates=[(x, seo._lang_url(base, path, x, base_lang)) for x in it["langs"]],
                    keywords=seo.keywords(svc, served, [it["title"], *(it.get("tags") or [])]),
                    ssr={"h1": it["title"], "text": (it.get("text") or desc)[:4000], "links": [(L[sec], url(PATHS[sec]))]})
        if img:
            meta.update(image=seo.abs_url(base, img), image_alt=next((p.get("alt") for p in photos if p["url"] == img), "") or it.get("cover_alt") or it["title"])
        if kind == "album":
            meta["jsonld"]["@graph"].append({"@type": "ImageGallery", "name": it["title"], "url": meta["url"], "description": desc,
                                             "datePublished": (it.get("date") or "")[:10] or None,
                                             "image": [{"@type": "ImageObject", "contentUrl": seo.abs_url(base, p["url"]), "description": p.get("alt") or None,
                                                        "caption": p.get("caption") or None} for p in photos[:60]] or None})
        else:
            meta["jsonld"]["@graph"].append({"@type": "Organization", "name": it["title"], "url": meta["url"], "description": desc,
                                             "parentOrganization": {"@id": base + "/#org"}, "image": meta["image"] if img else None})
        crumbs([*parent_crumb(sec), (L[sec], url(PATHS[sec])), (it["title"], meta["url"])])
        return 200

    if not vis.get(key):
        return notfound()
    year = seo._admission_year(svc)
    title = L[key]
    meta["title"] = seo._fit([f"{title} — {name or site_name}", f"{title} — {abbr}", title])
    meta["description"] = DESC.get(lang, DESC["uz"])[key].format(abbr=abbr, year=year)
    meta["ssr"] = {"h1": title, "text": meta["description"], "links": []}
    crumbs([*parent_crumb(key), (title, meta["url"])])
    links = meta["ssr"]["links"]
    if key == "life":
        links += [(L[k], url(PATHS[k])) for k in ("clubs", "sport", "dormitory", "scholarships", "gallery") if vis.get(k)]
    elif key in ("clubs", "gallery"):
        kind = "club" if key == "clubs" else "album"
        links += [(x["title"], url(f"{PATHS[key]}/{x['slug']}")) for x in K.pub(svc, kind, lang) if x.get("slug")][:60]
    faq = []
    if key == "dormitory":
        faq = K.settings_l(svc.st, "dormitory", lang, base_lang).get("faq") or []
        photo = K.settings(svc.st, "dormitory").get("photo")
        if photo:
            meta["image"] = seo.abs_url(base, photo)
    elif key == "parents":
        faq = K.settings_l(svc.st, "parents", lang, base_lang).get("faq") or []
    if faq:
        meta["jsonld"]["@graph"].append({"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q["q"], "acceptedAnswer": {"@type": "Answer", "text": q.get("a") or ""}}
                                                                           for q in faq if q.get("q")]})
        meta["ssr"]["faq"] = [(q["q"], q.get("a") or "") for q in faq if q.get("q")]
    return 200


def extra_meta(svc, meta: dict, seg: list[str], lang: str, base: str, base_lang: str, home: tuple) -> int | None:
    """seo.EXTRA_META ilmog'i."""
    if _key(seg) is None:
        return None
    from . import seo  # noqa: PLC0415

    u, s = svc.uni_l(lang), svc.site_l(lang)
    name = u.get("name") or ""
    site_name = s.get("title") or u.get("abbr") or name
    return page_meta(svc, seg, "/" + "/".join(seg), meta, lang, seo.LABELS.get(lang, seo.LABELS["uz"]), site_name, name, home)


def sitemap_urls(svc) -> list[tuple]:
    """(yo'l, o'zgargan, tillar, chastota, ustuvorlik, rasm) — faqat ko'rinadigan bo'limlar."""
    from .content import LANGS  # noqa: PLC0415

    vis = K.visible(svc)
    freq = {"life": ("monthly", "0.6"), "clubs": ("weekly", "0.6"), "sport": ("monthly", "0.5"), "dormitory": ("monthly", "0.6"), "scholarships": ("monthly", "0.6"),
            "gallery": ("weekly", "0.5"), "steps": ("weekly", "0.8"), "calculator": ("monthly", "0.8"), "parents": ("monthly", "0.6"), "map": ("monthly", "0.4"),
            "tour": ("monthly", "0.4")}
    from .seo import abs_url  # noqa: PLC0415

    out = [(PATHS[k], None, LANGS, f, p, "") for k, (f, p) in freq.items() if vis.get(k)]
    base, base_lang = svc.base_url(), svc.base_lang()
    for kind, sec in (("club", "clubs"), ("album", "gallery")):
        for it in svc.st.list_items(kind, public=True):
            if it.get("slug") and (kind == "club" or it.get("photos") or it.get("videos")):
                img = it.get("cover") or ((it.get("photos") or [{}])[0].get("url") or "")
                out.append((f"/{sec}/{it['slug']}", it.get("updated"), svc.loc(it, base_lang)["langs"], "weekly", "0.5", abs_url(base, img)))
    return out
