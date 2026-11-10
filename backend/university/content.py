"""Kontent sxemalari, tozalash (sanitize), slug, standart sozlamalar va boshlang'ich kontent.

Institut sayti kontent turlari (`items` jadvali):
  news        — yangiliklar (muharrir, slug, muqova, teglar, tarqatma)
  announce    — e'lonlar (kategoriya, muddat)
  page        — statik sahifalar (institut haqida, tarix, rektor murojaati, madhiya, qabul qoidalari…)
  program     — ta'lim yo'nalishlari (bakalavriat, magistratura, 1+1 qo'shma magistratura, doktorantura…)
  faculty     — kafedralar (sayt tuzilmasida «faculty» turi)
  department  — bo'limlar va markazlar
  staff       — rahbariyat, professor-o'qituvchilar va xodimlar
  partner     — hamkor universitetlar va tashkilotlar
  event       — tadbirlar (sana, joy)
  document    — me'yoriy hujjatlar (PDF)
  link        — foydali havolalar (davlat portallari, ta'lim resurslari)
  vacancy     — vakansiyalar (Careers: ish o'rinlari, talablar, imtiyozlar, ariza)
  faq         — ko'p so'raladigan savollar (Aloqa sahifasi, FAQPage JSON-LD)
"""
from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

# ------------------------------------------------------------------ yordamchilar
CYR = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k",
    "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "", "ы": "i", "ь": "", "э": "e", "ю": "yu", "я": "ya", "ў": "o", "қ": "q", "ғ": "g", "ҳ": "h",
}


def slugify(s: str, maxlen: int = 90) -> str:
    s = (s or "").strip().lower()
    s = "".join(CYR.get(ch, ch) for ch in s)
    s = re.sub(r"[’‘ʻʼ'`]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:maxlen].strip("-")


def safe_url(v, allow_relative: bool = True) -> str:
    v = str(v or "").strip()[:1000]
    if not v:
        return ""
    low = v.lower()
    if low.startswith(("http://", "https://", "mailto:", "tel:")):
        return v
    if allow_relative and v.startswith("/") and not v.startswith("//"):
        return v
    if allow_relative and v.startswith("#"):
        return v
    return ""


def _str(v, n: int) -> str:
    return str(v if v is not None else "").strip()[:n]


def _num(v, cast=float, default=None):
    try:
        x = cast(v)
    except (TypeError, ValueError):
        return default
    if isinstance(x, float) and not math.isfinite(x):
        return default
    return x


def _iso(v) -> str | None:
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def reading_minutes(text: str) -> int:
    words = len(re.findall(r"\w+", text or ""))
    return max(1, round(words / 200))


# ------------------------------------------------------------------ sxemalar
# (tur, parametr): str n | text n | bool | int | float | url | enum [...] | list n,len | json bytes | links | metrics | iso | color | slug
RICH = {"content": ("json", 3_000_000), "html": ("text", 3_000_000), "text": ("text", 1_000_000)}
SEO = {"meta_title": ("str", 200), "meta_description": ("str", 400), "og_image": ("url",)}

NEWS = {
    "title": ("str", 300), "slug": ("slug",), "excerpt": ("text", 1000), **RICH, "feature_image": ("url",), "feature_alt": ("str", 300),
    "feature_caption": ("str", 400), "tags": ("list", 12, 40), "status": ("enum", ["draft", "published", "scheduled"]), "featured": ("bool",),
    "published_at": ("iso",), **SEO, "send_newsletter": ("bool",), "show_toc": ("bool",), "sort": ("int",), "src": ("str", 300), "gallery": ("list", 40, 500),
}
ANNOUNCE = {
    "title": ("str", 300), "slug": ("slug",), "excerpt": ("text", 1000), **RICH, "feature_image": ("url",),
    "category": ("enum", ["general", "admission", "exam", "event", "vacancy", "students"]), "deadline": ("iso",),
    "tags": ("list", 12, 40), "status": ("enum", ["draft", "published", "scheduled"]), "featured": ("bool",), "published_at": ("iso",), **SEO, "sort": ("int",),
    "send_newsletter": ("bool",),
}
PAGE = {
    "title": ("str", 300), "slug": ("slug",), "excerpt": ("text", 1000), **RICH, "cover": ("url",),
    "section": ("enum", ["about", "admission", "students", "science", "other"]), "status": ("enum", ["draft", "published"]),
    "featured": ("bool",), "published_at": ("iso",), **SEO, "sort": ("int",), "show_toc": ("bool",), "src": ("str", 300),
    "contact_ids": ("list", 8, 40),  # sahifa uchun mas'ul xodim(lar): rasm, F.I.Sh., lavozim, qabul vaqti, aloqa
    "news_tag": ("str", 60),  # sahifa ostida shu tegdagi so'nggi yangiliklar
}
PROGRAM = {
    "title": ("str", 300), "slug": ("slug",), "code": ("str", 40), "degree": ("enum", ["bachelor", "master", "joint", "phd", "course"]),
    "faculty_id": ("str", 40), "duration": ("str", 60), "languages": ("list", 5, 30), "credits": ("int",), "tuition": ("str", 120),
    "fees": ("fees",), "fee_note": ("str", 200),  # kontrakt narxi: ta'lim shakli bo'yicha yillik summa (so'm)
    "quota": ("int",), "form": ("list", 4, 30), "summary": ("text", 1200), **RICH, "cover": ("url",), "careers": ("list", 12, 120),
    "partner": ("str", 200), "subjects": ("list", 30, 120), "status": ("enum", ["draft", "published"]), "featured": ("bool",), "sort": ("int",),
    "accent": ("color",), "published_at": ("iso",), **SEO,
}
FACULTY = {
    "title": ("str", 300), "slug": ("slug",), "summary": ("text", 1200), **RICH, "dean": ("str", 200), "dean_staff_id": ("str", 40), "cover": ("url",),
    "email": ("str", 160), "phone": ("str", 60), "status": ("enum", ["draft", "published"]), "sort": ("int",), "accent": ("color",), "featured": ("bool",),
    "editor_ids": ("list", 50, 40),  # fakultet sahifasini kabinetdan tahrirlay oladigan o'qituvchilar
}
DEPARTMENT = {
    "title": ("str", 300), "slug": ("slug",), "summary": ("text", 1500), **RICH, "head": ("str", 200), "head_staff_id": ("str", 40),
    "category": ("enum", ["department", "center", "office", "council"]), "email": ("str", 160), "phone": ("str", 60), "room": ("str", 60), "faculty_id": ("str", 40),
    "status": ("enum", ["draft", "published"]), "sort": ("int",), "featured": ("bool",), "cover": ("url",), "src": ("str", 300),
}
STAFF = {
    "title": ("str", 200), "slug": ("slug",), "position": ("str", 300), "category": ("enum", ["leadership", "professor", "teacher", "visiting", "staff"]),
    "department_id": ("str", 40), "faculty_id": ("str", 40), "photo": ("url",), "email": ("str", 160), "phone": ("str", 60), "degree": ("str", 200),
    "bio": ("text", 6000), "education": ("text", 3000), "experience": ("text", 3000), "spoken": ("list", 8, 40), "interests": ("list", 15, 80),
    "links": ("links",), "status": ("enum", ["draft", "published"]), "sort": ("int",), "featured": ("bool",), "user_id": ("str", 40),
    "subjects": ("list", 20, 120), "publications": ("text", 6000), "src": ("str", 300), "hours": ("str", 200),
}
PARTNER = {
    "title": ("str", 300), "slug": ("slug",), "logo": ("url",), "url": ("url",), "country": ("str", 80), "city": ("str", 120),
    # turi: sanoat / xalqaro / akademik / davlat (eski qiymatlar — university, company, organization — KIND_RULES'da yangisiga o'tkaziladi)
    "category": ("enum", ["industry", "international", "academic", "government", "university", "company", "organization"]),
    "summary": ("text", 800), "description": ("text", 6000), "areas": ("list", 12, 160), "agreement_date": ("str", 20),
    "practice_base": ("bool",), "program_ids": ("list", 40, 40), "capacity": ("int",), "lat": ("float",), "lng": ("float",),
    "status": ("enum", ["draft", "published"]), "sort": ("int",), "featured": ("bool",), "since": ("str", 20), "src": ("str", 300),
}
EVENT = {
    "title": ("str", 300), "slug": ("slug",), "summary": ("text", 1200), **RICH, "starts": ("iso",), "ends": ("iso",), "place": ("str", 300),
    "cover": ("url",), "category": ("enum", ["event", "conference", "openday", "exam", "holiday", "meeting"]), "url": ("url",),
    "status": ("enum", ["draft", "published"]), "featured": ("bool",), "sort": ("int",), "published_at": ("iso",), "send_newsletter": ("bool",),
}
DOCUMENT = {
    "title": ("str", 400), "file": ("url",), "url": ("url",),
    # turi (Me'yoriy hujjatlar sahifasidagi guruhlar): internal — ichki tartib qoidalari, ethics — odob-axloq kodeksi (official.py)
    "category": ("enum", ["charter", "license", "regulation", "order", "report", "plan", "curriculum", "other", "internal", "ethics"]),
    "year": ("int",), "date": ("iso",), "number": ("str", 80), "summary": ("text", 800), "status": ("enum", ["draft", "published"]), "sort": ("int",), "featured": ("bool",),
}
LINK = {
    "title": ("str", 200), "url": ("url",), "logo": ("url",), "category": ("enum", ["gov", "edu", "service", "intl", "other"]),
    "summary": ("str", 300), "status": ("enum", ["draft", "published"]), "sort": ("int",), "featured": ("bool",), "src": ("str", 300),
}
VACANCY = {
    "title": ("str", 300), "slug": ("slug",), "summary": ("text", 1200), **RICH, "faculty_id": ("str", 40), "department": ("str", 200),
    "employment": ("enum", ["full_time", "part_time", "contract", "internship", "remote"]),
    "category": ("enum", ["academic", "administrative", "research", "technical", "other"]),
    "location": ("str", 200), "salary": ("str", 120), "deadline": ("iso",), "requirements": ("list", 20, 300), "duties": ("list", 20, 300),
    "benefits": ("list", 20, 200), "contact_email": ("str", 160), "cover": ("url",),
    "status": ("enum", ["draft", "published", "closed"]), "featured": ("bool",), "sort": ("int",), "published_at": ("iso",), **SEO,
}
FAQ = {
    "title": ("str", 400), "answer": ("text", 6000), "category": ("enum", ["admission", "study", "tuition", "intl", "campus", "other"]),
    "status": ("enum", ["published", "draft"]), "sort": ("int",), "featured": ("bool",),
}
SCHEMAS = {
    "news": NEWS, "announce": ANNOUNCE, "page": PAGE, "program": PROGRAM, "faculty": FACULTY, "department": DEPARTMENT,
    "staff": STAFF, "partner": PARTNER, "event": EVENT, "document": DOCUMENT, "link": LINK,
    "vacancy": VACANCY, "faq": FAQ,
}
KINDS_WITH_SLUG = {"news", "announce", "page", "program", "faculty", "department", "staff", "event", "vacancy"}
# muharrir (rich) bilan tahrirlanadigan turlar — ro'yxatda og'ir maydonlar yuborilmaydi
RICH_KINDS = {"news", "announce", "page", "program", "faculty", "department", "event", "vacancy"}
# saytdagi bo'lim yo'li (SEO, statistika, PDF)
SECTION_OF = {"news": "news", "announce": "announcements", "page": "pages", "program": "programs", "faculty": "faculties",
              "department": "structure", "staff": "staff", "event": "events", "vacancy": "careers"}
KIND_OF_SECTION = {v: k for k, v in SECTION_OF.items()}

# ------------------------------------------------------------------ hamkorlik va karyera (career.py): karyera markazi imkoniyatlari, bitiruvchilar
# hikoyalari, startaplar, foydali maqolalar. Hamkorlar (partner) — yuqoridagi PARTNER sxemasi (amaliyot bazasi bilan).
OPPORTUNITY = {
    "title": ("str", 300), "slug": ("slug",), "company": ("str", 200), "partner_id": ("str", 40), "logo": ("url",),
    "type": ("enum", ["internship", "full_time", "part_time", "traineeship", "project"]), "program_ids": ("list", 40, 40),
    "city": ("str", 120), "remote": ("bool",), "salary": ("str", 120), "summary": ("text", 1200), **RICH, "requirements": ("list", 20, 300),
    "apply_url": ("url",), "apply_email": ("str", 160), "apply_phone": ("str", 60), "deadline": ("iso",),
    "status": ("enum", ["draft", "pending", "published", "expired", "rejected"]), "featured": ("bool",), "sort": ("int",), "published_at": ("iso",),
    "silent": ("bool",), "submitter": ("json", 4000), "ticket_id": ("str", 40), "reject_reason": ("text", 1000), **SEO,
}
ALUMNI = {
    "title": ("str", 200), "slug": ("slug",), "year": ("int",), "program_id": ("str", 40), "program_text": ("str", 200), "position": ("str", 200),
    "company": ("str", 200), "photo": ("url",), "quote": ("text", 600), **RICH, "consent": ("bool",), "registry_id": ("str", 40),
    "status": ("enum", ["draft", "published"]), "featured": ("bool",), "sort": ("int",), "published_at": ("iso",),
}
STARTUP = {
    "title": ("str", 300), "slug": ("slug",), "summary": ("text", 1200), **RICH, "stage": ("enum", ["idea", "prototype", "pilot", "market"]),
    "category": ("enum", ["food_tech", "packaging", "processing", "agro", "ecology", "digital", "equipment", "other"]),
    "team": ("json", 20000), "images": ("list", 20, 500), "cover": ("url",), "video": ("url",), "awards": ("list", 20, 300),
    "partner_ids": ("list", 12, 40), "partners": ("list", 12, 200), "contact_email": ("str", 160), "contact_phone": ("str", 60), "website": ("url",),
    "year": ("int",), "status": ("enum", ["draft", "published"]), "featured": ("bool",), "sort": ("int",), "published_at": ("iso",),
}
ARTICLE = {
    "title": ("str", 300), "slug": ("slug",), "excerpt": ("text", 1000), **RICH, "cover": ("url",), "cover_alt": ("str", 300),
    "author_id": ("str", 40), "author_name": ("str", 200), "topics": ("list", 8, 40), "tags": ("list", 12, 40), "sources": ("json", 20000),
    "status": ("enum", ["draft", "published", "scheduled"]), "featured": ("bool",), "sort": ("int",), "published_at": ("iso",), **SEO, "show_toc": ("bool",),
}
ARTICLE_TOPICS = ("food_safety", "nutrition", "technology", "quality", "processing", "ecology", "economics", "other")
SCHEMAS.update(opportunity=OPPORTUNITY, alumni=ALUMNI, startup=STARTUP, insight=ARTICLE)
KINDS_WITH_SLUG |= {"partner", "opportunity", "alumni", "startup", "insight"}
RICH_KINDS |= {"opportunity", "alumni", "startup", "insight"}
_PARTNER_LEGACY = {"university": "academic", "company": "industry", "organization": "international"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _rule_partner(m: dict, status: str) -> str:
    m["category"] = _PARTNER_LEGACY.get(m.get("category") or "", m.get("category") or "industry")
    if not m.get("practice_base"):
        m["capacity"] = None
    for k, lo, hi in (("lat", -90, 90), ("lng", -180, 180)):
        if m.get(k) is not None and not lo <= m[k] <= hi:
            m[k] = None
    return status


def _rule_opportunity(m: dict, status: str) -> str:
    """Muddati o'tgan nashr — «expired» (saytda ko'rinmaydi); arizachi ma'lumoti — faqat lug'at."""
    if not isinstance(m.get("submitter"), dict):
        m["submitter"] = None
    if status in ("published", "scheduled") and m.get("deadline") and m["deadline"] < _now_iso():
        return "expired"
    return status


def _rule_alumni(m: dict, status: str) -> str:
    """Bitiruvchi hikoyasi faqat rozilik bilan nashr qilinadi: rozilik belgilanmay «nashr» so'ralsa — 400 (jimgina qoralamaga o'tkazilmaydi)."""
    if status in ("published", "scheduled") and not m.get("consent"):
        raise ValueError("alumni_consent")
    return status


def _rule_startup(m: dict, status: str) -> str:
    team = []
    for x in (m.get("team") or [])[:30] if isinstance(m.get("team"), list) else []:
        if isinstance(x, dict) and _str(x.get("name"), 160):
            team.append({"name": _str(x.get("name"), 160), "role": _str(x.get("role"), 160), "staff_id": _str(x.get("staff_id"), 40),
                         "kind": x.get("kind") if x.get("kind") in ("student", "teacher", "graduate", "other") else "student"})
    m["team"] = team
    m["images"] = [u for u in (safe_url(x) for x in m.get("images") or []) if u]
    return status


def _rule_article(m: dict, status: str) -> str:
    m["topics"] = [t for t in m.get("topics") or [] if t in ARTICLE_TOPICS]
    src = []
    for x in (m.get("sources") or [])[:30] if isinstance(m.get("sources"), list) else []:
        if isinstance(x, dict) and (_str(x.get("title"), 400) or safe_url(x.get("url"), allow_relative=False)):
            src.append({"title": _str(x.get("title"), 400), "url": safe_url(x.get("url"), allow_relative=False)})
    m["sources"] = src
    m["reading_time"] = reading_minutes(m.get("text") or "")
    if not m.get("excerpt"):
        m["excerpt"] = re.sub(r"\s+", " ", m.get("text") or "")[:240].strip()
    if status == "scheduled" and m.get("published_at") and m["published_at"] <= _now_iso():
        status = "published"
    return status


# tur bo'yicha qo'shimcha qoidalar: clean_item ichida (merged, status) → yangi status
KIND_RULES = {"partner": _rule_partner, "opportunity": _rule_opportunity, "alumni": _rule_alumni, "startup": _rule_startup, "insight": _rule_article}


def _money(v) -> int | None:
    """Summa (so'm): «18 500 000», «18,5 mln» emas — faqat raqam; 1 … 10 mlrd oralig'ida."""
    try:
        x = float(re.sub(r"[\s\u00a0_,]", "", str(v))) if v not in (None, "") else 0
    except (TypeError, ValueError):
        return None
    return int(x) if math.isfinite(x) and 0 < x <= 10_000_000_000 else None


# kontrakt narxi qaysi ta'lim shakli uchun: kunduzgi, sirtqi, kechki, masofaviy, ikkinchi oliy ta'lim
FEE_FORMS = ("day", "extramural", "evening", "distance", "second")


def clean_field(spec: tuple, v):
    t = spec[0]
    if t == "str":
        return _str(v, spec[1])
    if t == "text":
        return str(v if v is not None else "")[: spec[1]]
    if t == "slug":
        return slugify(str(v or ""))
    if t == "bool":
        return bool(v)
    if t == "int":
        return _num(v, lambda x: int(float(x)), None) if v not in (None, "") else None
    if t == "float":
        return _num(v, float, None)
    if t == "url":
        return safe_url(v)
    if t == "color":
        v = str(v or "")
        return v if re.fullmatch(r"#[0-9a-fA-F]{6}", v) else ""
    if t == "enum":
        return v if v in spec[1] else spec[1][0]
    if t == "iso":
        return _iso(v)
    if t == "list":
        if isinstance(v, str):
            v = [x for x in re.split(r"[,;\n]", v)]
        return [s for s in (_str(x, spec[2]) for x in (v or [])[: spec[1]]) if s]
    if t == "links":
        out = []
        for x in (v or [])[:10]:
            if isinstance(x, dict) and safe_url(x.get("url")):
                out.append({"label": _str(x.get("label"), 80) or "Link", "url": safe_url(x.get("url"))})
        return out
    if t == "fees":
        out, seen = [], set()
        for x in (v or [])[:5]:
            if not isinstance(x, dict) or x.get("form") not in FEE_FORMS or x["form"] in seen:
                continue
            amount = _money(x.get("amount"))
            if not amount:
                continue
            old = _money(x.get("old"))
            seen.add(x["form"])
            out.append({"form": x["form"], "amount": amount, **({"old": old} if old and old > amount else {})})
        return out
    if t == "metrics":
        out = []
        for x in (v or [])[:6]:
            if isinstance(x, dict) and (x.get("value") or x.get("label")):
                out.append({"value": _str(x.get("value"), 24), "label": _str(x.get("label"), 80)})
        return out
    if t == "json":
        if v is None:
            return None
        s = json.dumps(v, ensure_ascii=False)
        if len(s) > spec[1]:
            raise ValueError("too_large")
        return v
    return None


# ------------------------------------------------------------------ tarjimalar (uz / ru / en)
LANGS = ("uz", "ru", "en")
# qaysi maydonlar har tilda alohida yoziladi; qolganlari (slug, teglar, sana, rasm…) umumiy
_R = ("content", "html", "text")
TRANSLATABLE = {
    "news": ("title", "excerpt", *_R, "feature_alt", "feature_caption", "meta_title", "meta_description"),
    "announce": ("title", "excerpt", *_R, "meta_title", "meta_description"),
    "page": ("title", "excerpt", *_R, "meta_title", "meta_description"),
    "program": ("title", "summary", *_R, "duration", "tuition", "fee_note", "careers", "partner", "subjects", "meta_title", "meta_description"),
    "faculty": ("title", "summary", *_R, "dean"),
    "department": ("title", "summary", *_R, "head"),
    "staff": ("title", "position", "degree", "bio", "education", "experience", "interests", "subjects", "publications", "hours"),
    "partner": ("title", "country", "city", "summary", "description", "areas"),
    "opportunity": ("title", "summary", *_R, "city", "salary", "requirements", "meta_title", "meta_description"),
    "alumni": ("position", "quote", *_R, "program_text"),
    "startup": ("title", "summary", *_R, "awards"),
    "insight": ("title", "excerpt", *_R, "cover_alt", "meta_title", "meta_description"),
    "event": ("title", "summary", *_R, "place"),
    "document": ("title", "summary"),
    "link": ("title", "summary"),
    "vacancy": ("title", "summary", *_R, "department", "location", "salary", "requirements", "duties", "benefits", "meta_title", "meta_description"),
    "faq": ("title", "answer"),
}
UNI_I18N = ("name", "short_name", "tagline", "short_about", "mission", "address", "hours", "rector_name", "rector_title", "rector_speech", "rector_speech_html",
            "stats", "keywords", "license", "founder", "values")
SITE_I18N = ("title", "description", "footer_text", "hero", "newsletter_footer", "admission_text", "portal_text")


def _empty(v) -> bool:
    return v is None or v == "" or v == [] or v == {} or (isinstance(v, dict) and not any(not _empty(x) for x in v.values()))


def lang_or(lang: str | None, default: str) -> str:
    return lang if lang in LANGS else default


def _clean_item_i18n(kind: str, v) -> dict:
    schema, out = SCHEMAS[kind], {}
    if not isinstance(v, dict):
        return out
    for lang in LANGS:
        tr = v.get(lang)
        if not isinstance(tr, dict):
            continue
        c = {f: clean_field(schema[f], tr[f]) for f in TRANSLATABLE[kind] if f in tr and f in schema}
        c = {k: x for k, x in c.items() if not _empty(x)}
        if kind in ("news", "announce", "page", "insight") and c.get("title"):
            c["reading_time"] = reading_minutes(c.get("text") or "")
            if not c.get("excerpt") and c.get("text"):
                c["excerpt"] = re.sub(r"\s+", " ", c["text"])[:240].strip()
        if c:
            out[lang] = c
    return out


def item_langs(it: dict, base: str) -> list[str]:
    """Yozuv qaysi tillarda mavjud: asosiy til + sarlavhasi yozilgan tarjimalar."""
    tr = it.get("i18n") or {}
    return [base] + [lang for lang in LANGS if lang != base and (tr.get(lang) or {}).get("title")]


def localize(obj: dict, lang: str, base: str, fields: tuple, meta: bool = True) -> dict:
    """Tarjimani asosiy maydonlar ustiga qo'yadi (bo'sh tarjima maydonlari asl tilda qoladi).

    meta=True bo'lsa: `lang` — ko'rsatilgan til, `langs` — mavjud tillar."""
    out = {k: v for k, v in obj.items() if k != "i18n"}
    tr_all = obj.get("i18n") or {}
    tr = tr_all.get(lang) if lang != base else None
    served = base
    if isinstance(tr, dict) and any(not _empty(tr.get(f)) for f in fields):
        for f in (*fields, "reading_time"):
            v = tr.get(f)
            if _empty(v):
                continue
            if isinstance(v, dict) and isinstance(out.get(f), dict) and f == "hero":
                out[f] = {**out[f], **{a: b for a, b in v.items() if b}}
            else:
                out[f] = v
        served = lang
    if meta:
        out["lang"] = served
        out["langs"] = [base] + [x for x in LANGS if x != base and isinstance(tr_all.get(x), dict) and any(not _empty(tr_all[x].get(f)) for f in fields)]
    return out


def clean_item(kind: str, data: dict, current: dict | None = None) -> tuple[dict, dict]:
    """Qaytaradi: (jadval ustunlari, qolgan ma'lumotlar)."""
    schema = SCHEMAS[kind]
    merged = dict(current or {})
    for k, spec in schema.items():
        if k in data:
            merged[k] = clean_field(spec, data[k])
    for k, spec in schema.items():
        if k not in merged:
            merged[k] = clean_field(spec, None) if spec[0] not in ("json", "iso", "int") else None
    if "i18n" in data:
        merged["i18n"] = _clean_item_i18n(kind, data["i18n"])
    elif not isinstance(merged.get("i18n"), dict):
        merged["i18n"] = {}
    title = merged.get("title") or ""
    if kind in KINDS_WITH_SLUG:
        merged["slug"] = merged.get("slug") or slugify(title) or "item"
    status = merged.get("status") or "draft"
    pub = merged.get("published_at") if "published_at" in schema else None
    if "published_at" in schema and status in ("published", "scheduled") and not pub:
        pub = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if kind in ("news", "announce", "page"):
        if status == "scheduled" and pub and pub <= datetime.now(timezone.utc).isoformat(timespec="seconds"):
            status = "published"
        merged["reading_time"] = reading_minutes(merged.get("text") or "")
        if not merged.get("excerpt"):
            merged["excerpt"] = re.sub(r"\s+", " ", merged.get("text") or "")[:240].strip()
    if kind in KIND_RULES:
        merged["published_at"] = pub
        status = KIND_RULES[kind](merged, status)
    cols = {
        "slug": merged.get("slug") if kind in KINDS_WITH_SLUG else None,
        "status": status,
        "title": title,
        "sort": merged.get("sort") or 0,
        "featured": bool(merged.get("featured")),
        "published_at": pub,
    }
    for k in ("slug", "status", "title", "sort", "featured", "published_at", "id", "kind", "created", "updated"):
        merged.pop(k, None)
    return cols, merged


# ------------------------------------------------------------------ universitet profili va sayt sozlamalari
SOCIALS = ["telegram", "facebook", "instagram", "youtube", "linkedin", "x", "website"]
SECTIONS = ["hero", "stats", "programs", "about", "news", "announcements", "faculties", "rector", "staff", "events", "partners", "links", "admission", "contact"]

DEFAULT_UNI = {
    "name": "Universitet",
    "short_name": "Universitet",
    "abbr": "UNI",
    "tagline": "Zamonaviy ta’lim, ilmiy tadqiqotlar va talabalar hayoti.",
    "short_about": "Bakalavriat, magistratura va doktorantura dasturlari, zamonaviy laboratoriyalar va xalqaro hamkorlik.",
    "mission": "Bilimli, amaliy ko‘nikmaga ega mutaxassislar tayyorlash va ilmiy tadqiqotlarni rivojlantirish.",
    "values": ["Sifatli ta’lim", "Ilmiy tadqiqot", "Barqarorlik", "Xalqaro hamkorlik"],
    "founded": "",
    "founder": "",
    "license": "",
    "rector_name": "",
    "rector_title": "Rektor",
    "rector_photo": "",
    "rector_speech": None,
    "rector_speech_html": "",
    "address": "",
    "phones": [],
    "email": "",
    "hours": "",
    "map_url": "",
    "logo": "",
    "logo_light": "",
    "hemis_url": "",
    "moodle_url": "",
    "mail_url": "",
    "anticorruption_url": "/about/anti-corruption",
    "library_url": "",
    "admission_url": "",
    "socials": {k: "" for k in SOCIALS},
    # qiymat kiritilmagan bo'lsa saytda «[RAQAM]» ko'rinadi
    "stats": [
        {"value": "", "suffix": "", "label": "talaba"},
        {"value": "", "suffix": "", "label": "professor-o‘qituvchi"},
        {"value": "", "suffix": "", "label": "kitob — ilmiy kutubxona"},
        {"value": "", "suffix": "", "label": "laboratoriya"},
    ],
    "keywords": ["universitet", "oliy ta’lim", "bakalavriat", "magistratura", "doktorantura", "qabul"],
    "i18n": {
        "ru": {"name": "Университет", "short_name": "Университет",
               "tagline": "Современное образование, научные исследования и студенческая жизнь.",
               "short_about": "Программы бакалавриата, магистратуры и докторантуры, современные лаборатории и международное сотрудничество.",
               "mission": "Подготовка специалистов с практическими знаниями и развитие научных исследований.",
               "values": ["Качественное образование", "Научные исследования", "Устойчивость", "Международное сотрудничество"],
               "address": "", "hours": "",
               "stats": [{"label": "студентов"}, {"label": "преподавателей"}, {"label": "книг в научной библиотеке"}, {"label": "лабораторий"}],
               "keywords": ["университет", "высшее образование", "бакалавриат", "магистратура", "докторантура", "приём"]},
        "en": {"name": "University", "short_name": "University",
               "tagline": "Modern education, research, and campus life.",
               "short_about": "Bachelor’s, master’s, and doctoral programmes, research laboratories, and international partnerships.",
               "mission": "To prepare skilled specialists and advance research and innovation.",
               "values": ["Quality education", "Research", "Sustainability", "International cooperation"],
               "address": "", "hours": "",
               "stats": [{"label": "students"}, {"label": "teaching staff"}, {"label": "books in the research library"}, {"label": "laboratories"}],
               "keywords": ["university", "higher education", "bachelor's degree", "master's degree", "doctoral programme", "admissions"]},
    },
}

# bosh sahifa suratlari (admin → Sayt → Bosh sahifa): bo'sh bo'lsa — neytral joy egallovchi ko'rsatiladi
HOME_IMAGES = ("hero", "green", "auditorium", "library", "dormitory", "student_life")
HERO_MAX = 8  # bosh ekranda almashinadigan suratlar soni


def hero_list(site: dict) -> list[str]:
    """Bosh ekran suratlari tartib bilan: avval «Bosh rasm» (home_images.hero — eski bitta surat sozlamasi), keyin hero_images.
    Takrorlar va bo'sh qiymatlar tashlanadi."""
    out: list[str] = []
    for u in [((site.get("home_images") or {}).get("hero") or ""), *(site.get("hero_images") or [])]:
        if isinstance(u, str) and u and u not in out:
            out.append(u)
    return out[:HERO_MAX]


def with_hero_list(site: dict) -> dict:
    """hero_images — to'liq ro'yxat, home_images.hero — uning birinchisi (eski bitta surat sozlamasi bilan moslik)."""
    lst = hero_list(site)
    return {**site, "hero_images": lst, "home_images": {**(site.get("home_images") or {}), "hero": lst[0] if lst else ""}}


DEFAULT_SITE = {
    "title": "University",
    "description": "Rasmiy universitet veb-sayti: ta’lim dasturlari, qabul, yangiliklar, ilmiy tadqiqotlar va shaxsiy kabinet.",
    "lang": "uz",
    "accent": "#0A2E73",
    "accent2": "#1E4A38",
    "palette_auto": False,
    "hero_images": [],
    "home_images": {k: "" for k in HOME_IMAGES},
    "theme": "light",
    "logo_text": "UNI",
    "favicon": "",
    "og_image": "",
    "footer_text": "",
    "url": "",
    "sections": [{"id": s, "enabled": True} for s in SECTIONS],
    "hero": {"eyebrow": "2026/2027 o‘quv yili", "heading": "Bilim, tadqiqot va kelajak.",
             "subheading": "Bakalavriat, magistratura va doktorantura dasturlari.",
             "cta_primary": "Qabul 2026", "cta_primary_url": "/admission", "cta_secondary": "", "cta_secondary_url": ""},
    "admission_text": "Bakalavriat, magistratura va doktoranturaga hujjatlar qabul bo‘limida va onlayn qabul qilinadi. Muddatlar va talablar e’lonlar bo‘limida.",
    "portal_text": "Talabalar va o‘qituvchilar uchun shaxsiy kabinet: dars jadvali, davomat, baholar va materiallar.",
    "cursor": False,
    "animations": True,
    "smooth_scroll": False,
    "contact_email": "",
    "double_opt_in": True,
    "notify_contact": True,
    "notify_subscribe": False,
    "newsletter_footer": "",
    "posts_per_page": 9,
    "portal_enabled": True,
    # sarlavhadagi «Qabul ____» tugmasi va qabul yili (tugma matni, SEO sarlavhalari)
    "admission_cta": True,
    "admission_year": 2026,
    "menu": [],  # seed.MENU bilan to'ldiriladi (fayl oxirida)
    "i18n": {
        "ru": {"description": "Официальный сайт университета: образовательные программы, приём, новости, исследования и личный кабинет.",
               "hero": {"eyebrow": "2026/2027 учебный год", "heading": "Образование, наука и развитие.",
                        "subheading": "Программы бакалавриата, магистратуры и докторантуры.",
                        "cta_primary": "Приём 2026", "cta_secondary": ""},
               "admission_text": "Документы в бакалавриат, магистратуру и докторантуру принимаются в приёмной комиссии и онлайн. Сроки и требования — в объявлениях.",
               "portal_text": "Личный кабинет студентов и преподавателей: расписание, посещаемость, оценки и материалы."},
        "en": {"description": "Official university website: academic programmes, admissions, news, research, and personal portal.",
               "hero": {"eyebrow": "Academic year 2026/2027", "heading": "Education, research, and discovery.",
                        "subheading": "Bachelor’s, master’s, and doctoral programmes.",
                        "cta_primary": "Admission 2026", "cta_secondary": ""},
               "admission_text": "Applications for bachelor’s, master’s, and doctoral programmes are accepted at the Admissions Office and online. Deadlines and requirements are in Announcements.",
               "portal_text": "Personal portal for students and faculty: timetable, attendance, grades, and course materials."},
    },
}

DEFAULT_SMTP = {"host": "", "port": 587, "security": "starttls", "username": "", "password": "", "from_email": "", "from_name": "", "reply_to": "", "enabled": False}

UNI_SPEC = {
    "name": ("str", 200), "short_name": ("str", 160), "abbr": ("str", 12), "tagline": ("str", 400), "short_about": ("text", 3000), "mission": ("text", 2000),
    "founded": ("str", 20), "founder": ("str", 200), "license": ("str", 400), "rector_name": ("str", 200), "rector_title": ("str", 200), "rector_photo": ("url",),
    "rector_speech": ("json", 1_000_000), "rector_speech_html": ("text", 1_000_000), "address": ("str", 300), "email": ("str", 160), "hours": ("str", 160),
    "rector_signature": ("url",), "rector_staff_id": ("str", 40),  # rektor murojaati: imzo rasmi, xodimlar ro'yxatidagi rektor (official.py)
    "map_url": ("url",), "logo": ("url",), "logo_light": ("url",), "library_url": ("url",), "hemis_url": ("url",), "admission_url": ("url",),
    "moodle_url": ("url",), "mail_url": ("url",), "anticorruption_url": ("url",), "keywords": ("list", 30, 60), "values": ("list", 12, 120),
    "phones": ("list", 6, 40),
}
SITE_SPEC = {
    "title": ("str", 120), "description": ("str", 400), "lang": ("enum", list(LANGS)), "accent": ("color",), "accent2": ("color",), "palette_auto": ("bool",),
    "theme": ("enum", ["system", "light", "dark"]), "logo_text": ("str", 12), "favicon": ("url",), "og_image": ("url",),
    "footer_text": ("str", 400), "url": ("url",), "cursor": ("bool",), "animations": ("bool",), "smooth_scroll": ("bool",),
    "contact_email": ("str", 160), "double_opt_in": ("bool",), "notify_contact": ("bool",), "notify_subscribe": ("bool",),
    "newsletter_footer": ("str", 400), "posts_per_page": ("int",), "admission_text": ("text", 1500), "portal_text": ("text", 800),
    "portal_enabled": ("bool",), "admission_cta": ("bool",), "admission_year": ("int",),
}
HERO_KEYS = ("eyebrow", "heading", "subheading", "cta_primary", "cta_primary_url", "cta_secondary", "cta_secondary_url")


def clean_uni(data: dict, current: dict) -> dict:
    out = dict(current)
    for k, spec in UNI_SPEC.items():
        if k in data:
            out[k] = clean_field(spec, data[k])
    if "socials" in data and isinstance(data["socials"], dict):
        out["socials"] = {k: safe_url(data["socials"].get(k), allow_relative=False) for k in SOCIALS}
    if "stats" in data and isinstance(data["stats"], list):
        out["stats"] = [{"value": _str(g.get("value"), 12), "suffix": _str(g.get("suffix"), 6), "label": _str(g.get("label"), 80)} for g in data["stats"][:8] if isinstance(g, dict)]
    if isinstance(data.get("i18n"), dict):
        tr_out = {}
        for lang in LANGS:
            tr = data["i18n"].get(lang)
            if isinstance(tr, dict):
                tr = {k: v for k, v in tr.items() if k in UNI_I18N}
                c = {k: v for k, v in clean_uni(tr, {}).items() if k in tr and not _empty(v)}
                if c:
                    tr_out[lang] = c
        out["i18n"] = tr_out
    return out


def _menu_item(x: dict, depth: int) -> dict | None:
    if not isinstance(x, dict):
        return None
    label = _str(x.get("label"), 80)
    url = safe_url(x.get("url"))
    if not label:
        return None
    labels = {lang: _str((x.get("labels") or {}).get(lang), 80) for lang in LANGS if isinstance(x.get("labels"), dict) and _str((x.get("labels") or {}).get(lang), 80)}
    out = {"label": label, "url": url, "labels": labels}
    if depth == 0:
        out["children"] = [c for c in (_menu_item(c, 1) for c in (x.get("children") or [])[:16]) if c]
        out["group"] = _str(x.get("group"), 60)
    else:
        out["group"] = _str(x.get("group"), 60)  # ochiluvchi menyudagi ustun nomi (ixtiyoriy)
    return out


def clean_menu(items: list) -> list:
    """Sayt menyusi: [{label, url, labels{ru,en}, children:[{label, url, labels, group}]}] — 9 tagacha bo'lim."""
    return [m for m in (_menu_item(x, 0) for x in items[:9]) if m]


def clean_site(data: dict, current: dict) -> dict:
    out = dict(current)
    for k, spec in SITE_SPEC.items():
        if k in data:
            out[k] = clean_field(spec, data[k])
    if "admission_year" in data:
        try:
            y = int(data.get("admission_year") or 0)
        except (TypeError, ValueError):
            y = 0
        out["admission_year"] = y if 2000 <= y <= 2100 else DEFAULT_SITE["admission_year"]
    if out.get("posts_per_page") is not None:
        out["posts_per_page"] = min(max(int(out["posts_per_page"] or 9), 3), 30)
    if not out.get("accent"):
        out["accent"] = DEFAULT_SITE["accent"]
    if not out.get("accent2"):
        out["accent2"] = DEFAULT_SITE["accent2"]
    if "menu" in data and isinstance(data["menu"], list):
        out["menu"] = clean_menu(data["menu"])
    if "home_images" in data and isinstance(data["home_images"], dict):
        out["home_images"] = {k: safe_url(data["home_images"].get(k)) for k in HOME_IMAGES}
    if "hero_images" in data and isinstance(data["hero_images"], list):
        out["hero_images"] = [u for u in (safe_url(x) for x in data["hero_images"][:HERO_MAX]) if u]
        # ro'yxat — asosiy manba: birinchi surat «Bosh rasm» bilan bir xil (ro'yxat bo'sh kelsa — «Bosh rasm» o'zi qoladi, eski mijoz uchun)
        if out["hero_images"]:
            out["home_images"] = {**(out.get("home_images") or {}), "hero": out["hero_images"][0]}
    if "hero_images" in data or "home_images" in data:
        out = with_hero_list(out)
    out.pop("public_schedule", None)
    if "sections" in data and isinstance(data["sections"], list):
        seen, secs = set(), []
        for s in data["sections"]:
            if isinstance(s, dict) and s.get("id") in SECTIONS and s["id"] not in seen:
                seen.add(s["id"])
                secs.append({"id": s["id"], "enabled": bool(s.get("enabled", True))})
        # yangi versiyada qo'shilgan bo'limlar standart tartibdagi o'rniga qo'yiladi (oxiriga emas)
        for n, sid in enumerate(SECTIONS):
            if sid in seen:
                continue
            prev = next((SECTIONS[k] for k in range(n - 1, -1, -1) if SECTIONS[k] in seen), None)
            pos = next((i + 1 for i, x in enumerate(secs) if x["id"] == prev), 0)
            secs.insert(pos, {"id": sid, "enabled": True})
            seen.add(sid)
        out["sections"] = secs
    if "hero" in data and isinstance(data["hero"], dict):
        out["hero"] = {k: (safe_url(data["hero"].get(k)) if k.endswith("_url") else _str(data["hero"].get(k), 300)) for k in HERO_KEYS}
    if isinstance(data.get("seo"), dict):
        out["seo"] = clean_seo(data["seo"])
    if isinstance(data.get("i18n"), dict):
        tr_out = {}
        for lang in LANGS:
            tr = data["i18n"].get(lang)
            if isinstance(tr, dict):
                tr = {k: v for k, v in tr.items() if k in SITE_I18N}
                c = {k: v for k, v in clean_site(tr, {}).items() if k in tr and not _empty(v)}
                if c:
                    tr_out[lang] = c
        out["i18n"] = tr_out
    return out


def clean_seo(v: dict) -> dict:
    """SEO: bosh sahifa sarlavhasi va qo'shimcha kalit so'zlar (har tilda), qidiruv tizimlari tasdiqlash kodlari, IndexNow."""
    title = {lang: _str((v.get("title") or {}).get(lang), 200) for lang in LANGS if isinstance(v.get("title"), dict) and _str((v.get("title") or {}).get(lang), 200)}
    kw = {}
    for lang in LANGS:
        x = (v.get("keywords") or {}).get(lang) if isinstance(v.get("keywords"), dict) else None
        if isinstance(x, str):
            x = re.split(r"[,;\n]", x)
        items = [s for s in (_str(t, 80) for t in (x or [])[:40]) if s]
        if items:
            kw[lang] = items
    verify = {k: re.sub(r"[^A-Za-z0-9_\-]", "", _str((v.get("verify") or {}).get(k), 120)) for k in ("google", "yandex", "bing", "naver")
              if isinstance(v.get("verify"), dict)}
    out = {"title": title, "keywords": kw, "verify": {k: x for k, x in verify.items() if x}, "indexnow": bool(v.get("indexnow", True))}
    # universitetning boshqa nomlari va avvalgi domenlari (yo'q bo'lsa — standart ro'yxat ishlatiladi)
    if isinstance(v.get("alt_names"), (list, str)):
        x = v["alt_names"].split(",") if isinstance(v["alt_names"], str) else v["alt_names"]
        out["alt_names"] = [s for s in (_str(t, 120) for t in x[:12]) if s]
    if isinstance(v.get("old_domains"), (list, str)):
        x = re.split(r"[,\s]+", v["old_domains"]) if isinstance(v["old_domains"], str) else v["old_domains"]
        doms = []
        for d in x[:8]:
            d = re.sub(r"^https?://", "", str(d or "").strip().lower()).split("/")[0]
            if re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", d) and d not in doms:
                doms.append(d)
        out["old_domains"] = doms
    return out


def clean_smtp(data: dict, current: dict) -> dict:
    out = dict(current)
    for k in ("host", "username", "from_email", "from_name", "reply_to"):
        if k in data:
            out[k] = _str(data[k], 200)
    if "port" in data:
        out["port"] = min(max(_num(data["port"], int, 587) or 587, 1), 65535)
    if "security" in data:
        out["security"] = data["security"] if data["security"] in ("ssl", "starttls", "none") else "starttls"
    if data.get("password"):
        out["password"] = str(data["password"])[:300]
    if data.get("clear_password"):
        out["password"] = ""
    if "enabled" in data:
        out["enabled"] = bool(data["enabled"])
    return out


# ------------------------------------------------------------------ boshlang'ich kontent (birinchi ishga tushishda)
# Boshlang'ich kontent: admin panelda tahrirlanadi, rasmlar media kutubxonasi orqali qo'shiladi.
def _p(*parts) -> dict:
    content = []
    for x in parts:
        if isinstance(x, str):
            content.append({"type": "text", "text": x})
        else:
            content.append(x)
    return {"type": "paragraph", "content": content} if content else {"type": "paragraph"}


def _t(text: str, *marks: str) -> dict:
    return {"type": "text", "text": text, "marks": [{"type": m} for m in marks]}


def _h(level: int, text: str) -> dict:
    return {"type": "heading", "attrs": {"level": level}, "content": [{"type": "text", "text": text}]}


def _ul(*items: str) -> dict:
    return {"type": "bulletList", "content": [{"type": "listItem", "content": [_p(x)]} for x in items]}


def _doc(*nodes) -> dict:
    return {"type": "doc", "content": list(nodes)}


def _html(doc: dict) -> str:
    """Boshlang'ich kontent uchun sodda HTML (saytda muharrir HTML'i ishlatiladi)."""
    def node(n: dict) -> str:
        t = n.get("type")
        if t == "text":
            s = n.get("text", "").replace("&", "&amp;").replace("<", "&lt;")
            for m in n.get("marks") or []:
                s = {"bold": f"<strong>{s}</strong>", "italic": f"<em>{s}</em>"}.get(m["type"], s)
            return s
        inner = "".join(node(c) for c in n.get("content") or [])
        if t == "paragraph":
            return f"<p>{inner}</p>"
        if t == "heading":
            lv = n.get("attrs", {}).get("level", 2)
            return f"<h{lv}>{inner}</h{lv}>"
        if t == "bulletList":
            return f"<ul>{inner}</ul>"
        if t == "listItem":
            return f"<li>{inner}</li>"
        return inner
    return "".join(node(c) for c in doc.get("content") or [])


def _text(doc: dict) -> str:
    def node(n: dict) -> str:
        if n.get("type") == "text":
            return n.get("text", "")
        return " ".join(node(c) for c in n.get("content") or [])
    return re.sub(r"\s+", " ", node(doc)).strip()


def _rich(kind: str, data: dict, doc: dict, i18n: dict | None = None) -> dict:
    d = {**data, "content": doc, "html": _html(doc), "text": _text(doc), "status": data.get("status", "published")}
    if i18n:
        for lang, tr in i18n.items():
            if isinstance(tr.get("content"), dict):
                tr["html"] = _html(tr["content"])
                tr["text"] = _text(tr["content"])
        d["i18n"] = i18n
    return {"kind": kind, "data": d}


# ------------------------------------------------------------------ stock boshlang'ich kontenti (seed.py)
from .seed import MENU, MENU_GROUPS, SEED, demo_fees  # noqa: E402,F401

SEED_V2: list[dict] = []
SEED_V3: list[dict] = []
SEED_V4: list[dict] = []
FACULTY_MOVES_V3: dict = {}
SEED_VERSION = 4
HERO_SEED: list[str] = []
DEFAULT_SITE["menu"] = __import__("university.menu_sections", fromlist=["add_to_menu"]).add_to_menu(MENU)
# tarjimadagi ko'rsatkichlar: qiymat asl tildan, nom — tarjimadan
for _tr in DEFAULT_UNI["i18n"].values():
    _tr["stats"] = [{**b, "label": t["label"]} for b, t in zip(DEFAULT_UNI["stats"], _tr["stats"])]

# rasmiy bo'limlar (official.py): qabul jadvali, ochiq ma'lumotlar, reytinglar, tarix, OAV — kontent turlari
from . import official as _official  # noqa: E402

_official.register()

# talabalar hayoti, abituriyent, galereya, kampus xaritasi va virtual tur (campus_schema.py) — kontent turlari
from . import campus_schema as _campus  # noqa: E402

_campus.register()
