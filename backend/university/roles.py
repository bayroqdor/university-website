"""Boshqaruv paneli rollari: har bir rol — admin panel bo'limlari (menyulari) ro'yxati.

- Admin panelga faqat «Administratorlar» bo'limida ochilgan hisoblar kiradi (users.role = "admin").
- Har bir admin hisobiga bitta rol biriktiriladi (`data.role_id`); «Bosh administrator» — barcha bo'limlar.
- Ruxsati bo'lmagan bo'lim menyuda ko'rinmaydi va uning API so'rovlari 403 «no_permission» qaytaradi.
"""
from __future__ import annotations

import re
import secrets

SUPER = "superadmin"

# (kalit, guruh, nom) — admin panel menyusi bilan bir xil tartibda
PERMS: list[tuple[str, str, str]] = [
    ("stats", "Umumiy", "Statistika"),
    ("menu", "Sayt tuzilishi", "Menyu"),
    ("home", "Sayt tuzilishi", "Bosh sahifa"),
    ("pages", "Sayt tuzilishi", "Sahifalar"),
    ("media", "Sayt tuzilishi", "Media"),
    ("news", "Kontent", "Yangiliklar"),
    ("announcements", "Kontent", "E’lonlar"),
    ("events", "Kontent", "Tadbirlar"),
    ("programs", "Institut", "Yo‘nalishlar"),
    ("faculties", "Institut", "Kafedralar"),
    ("structure", "Institut", "Tuzilma"),
    ("professors", "Institut", "Professorlar"),
    ("faculty_staff", "Institut", "Kafedra xodimlari (biriktirish, mudir)"),
    ("career_center", "Hamkorlik va karyera", "Karyera markazi: imkoniyatlar, kompaniyalar arizalari (moderatsiya), ma’lumot bloki"),
    ("partners", "Hamkorlik va karyera", "Hamkorlar va amaliyot bazalari"),
    ("alumni", "Hamkorlik va karyera", "Bitiruvchilar: hikoyalar, ro‘yxat (shaxsiy ma’lumotlar), bandlik statistikasi"),
    ("startups", "Hamkorlik va karyera", "Startaplar va innovatsiyalar"),
    ("articles", "Hamkorlik va karyera", "Foydali maqolalar"),
    ("documents", "Institut", "Hujjatlar"),
    ("links", "Institut", "Foydali havolalar"),
    ("reception", "Institut", "Rahbariyat qabuli jadvali"),
    ("opendata", "Institut", "Ochiq ma’lumotlar"),
    ("rankings", "Institut", "Reytinglar"),
    ("history", "Institut", "Tarix (vaqt chizig‘i)"),
    ("mentions", "Institut", "OAV biz haqimizda"),
    ("careers", "Institut", "Vakansiyalar (Careers)"),
    ("grants", "Institut", "Grant taqsimoti (arizalar, natijalar)"),
    ("journal", "Ilm-fan", "Ilmiy jurnal (sozlamalar, tahrir hay’ati, sonlar, maqolalar, yuborilgan qo‘lyozmalar)"),
    ("student_life", "Talabalar hayoti", "Klublar, sport, yotoqxona, stipendiyalar"),
    ("gallery", "Talabalar hayoti", "Galereya (albomlar, suratlar, videolar)"),
    ("admission", "Abituriyent", "Qabul bosqichlari, o‘tish ballari, ota-onalar sahifasi, kampus xaritasi, virtual tur"),
    ("faq", "Sayt tuzilishi", "Ko‘p so‘raladigan savollar"),
    ("popups", "Sayt tuzilishi", "E’lon oynasi (saytga kirganda chiqadigan)"),
    ("festive", "Sayt tuzilishi", "Bayram bezaklari"),
    ("schedule", "O‘quv jarayoni", "Dars jadvali"),
    ("academic", "O‘quv jarayoni", "Guruhlar, fanlar, semestrlar"),
    ("users", "O‘quv jarayoni", "Foydalanuvchilar"),
    ("subscribers", "Auditoriya", "Obunachilar"),
    ("messages", "Auditoriya", "Murojaatlar (service desk)"),
    ("blog", "Auditoriya", "Ichki blog (moderatsiya, izohlar)"),
    ("library", "Kutubxona", "Kutubxona: fond, berish/qaytarish, navbat, jarimalar, izohlar, hisobotlar"),
    ("library_settings", "Kutubxona", "Kutubxona sozlamalari (muddatlar, jarima stavkasi) va audit jurnali"),
    ("mail", "Pochta", "Mening pochtam"),
    ("mail_server", "Pochta", "Pochta serveri"),
    ("uni", "Sozlamalar", "Institut ma’lumotlari"),
    ("site", "Sozlamalar", "Sayt sozlamalari"),
    ("roles", "Boshqaruv", "Rollar"),
    ("admins", "Boshqaruv", "Administratorlar"),
]
PERM_KEYS = [p[0] for p in PERMS]

DEFAULT_ROLES = [
    {"id": SUPER, "name": "Bosh administrator", "description": "Barcha bo‘limlar va sozlamalar", "perms": ["*"], "builtin": True},
    {"id": "study", "name": "O‘quv bo‘limi", "description": "Dars jadvali, guruhlar, fanlar, foydalanuvchilar", "perms": ["schedule", "academic", "users", "mail"]},
    {"id": "editor", "name": "Kontent muharriri", "description": "Yangiliklar, e’lonlar, tadbirlar, sahifalar", "perms": ["news", "announcements", "events", "pages", "media", "mail"]},
    {"id": "librarian", "name": "Kutubxonachi", "description": "Fond va nusxalar, berish/qaytarish, bron va navbat, jarimalar, izohlar moderatsiyasi, hisobotlar",
     "perms": ["library", "mail"]},
    {"id": "career", "name": "Karyera markazi", "description": "Imkoniyatlar va moderatsiya, hamkorlar va amaliyot bazalari, bitiruvchilar, startaplar, maqolalar",
     "perms": ["career_center", "partners", "alumni", "startups", "articles", "media", "mail"]},
]

# kontent turi → bo'lim
ITEM_PERM = {"news": "news", "announce": "announcements", "event": "events", "page": "pages", "program": "programs", "faculty": "faculties",
             "department": "structure", "staff": "professors", "partner": "partners", "document": "documents", "link": "links",
             "vacancy": "careers", "faq": "faq",
             # hamkorlik va karyera (career.py)
             "opportunity": "career_center", "alumni": "alumni", "startup": "startups", "insight": "articles",
             # talabalar hayoti, galereya, abituriyent (campus_schema.ITEM_PERM)
             "club": "student_life", "achievement": "student_life", "facility": "student_life", "dorm": "student_life", "scholarship": "student_life",
             "album": "gallery", "adm_step": "admission", "campus_spot": "admission", "tour_scene": "admission",
             "reception": "reception", "dataset": "opendata", "ranking": "rankings", "milestone": "history", "mention": "mentions"}


def roles(st) -> list[dict]:
    saved = st.kv_get("roles")
    if not isinstance(saved, list) or not saved:
        saved = [dict(r) for r in DEFAULT_ROLES]
    elif not st.kv_get("roles_librarian_v1") and not any(r.get("id") == "librarian" for r in saved):
        saved.append(next(dict(r) for r in DEFAULT_ROLES if r["id"] == "librarian"))  # yangi standart rol (bir marta)
        st.kv_put("roles", saved)
        st.kv_put("roles_librarian_v1", True)
    if not any(r.get("id") == SUPER for r in saved):
        saved.insert(0, dict(DEFAULT_ROLES[0]))
    for r in saved:
        if r.get("id") == SUPER:
            r.update(perms=["*"], builtin=True)
    return saved


def clean_roles(items: list, current: list[dict]) -> list[dict]:
    out, seen = [], set()
    for r in items if isinstance(items, list) else []:
        if not isinstance(r, dict):
            continue
        rid = str(r.get("id") or "").strip()[:40]
        name = str(r.get("name") or "").strip()[:80]
        if not name:
            continue
        if not rid or not re.fullmatch(r"[a-z0-9_-]{2,40}", rid):
            rid = "r" + secrets.token_hex(4)
        if rid in seen:
            continue
        seen.add(rid)
        if rid == SUPER:
            out.append(next((dict(x) for x in DEFAULT_ROLES if x["id"] == SUPER)) | {"name": name})
            continue
        perms = [p for p in (r.get("perms") or []) if p in PERM_KEYS]
        out.append({"id": rid, "name": name, "description": str(r.get("description") or "").strip()[:200], "perms": perms})
    if SUPER not in seen:
        out.insert(0, dict(DEFAULT_ROLES[0]))
    return out


def role_of(st, u: dict) -> dict:
    rid = (u.get("data") or {}).get("role_id") or SUPER
    rs = roles(st)
    return next((r for r in rs if r["id"] == rid), None) or {"id": rid, "name": "?", "perms": []}


def perms_of(st, u: dict) -> list[str]:
    if u.get("role") != "admin":
        return []
    r = role_of(st, u)
    return PERM_KEYS[:] if "*" in r.get("perms", []) else [p for p in r.get("perms", []) if p in PERM_KEYS]


def is_super(st, u: dict) -> bool:
    return u.get("role") == "admin" and "*" in role_of(st, u).get("perms", [])


# ------------------------------------------------------------------ API yo'li → kerakli bo'lim(lar)
ANY = "*"  # admin panelga kirgan har qanday hisob
RULES: list[tuple[str, str | None, tuple[str, ...] | str]] = [
    # (regex, method yoki None — hammasi, bo'limlar)
    (r"^/api/admin/(login|logout|me|password)$", None, ANY),
    (r"^/api/admin/(stats|export)", None, ("stats",)),
    (r"^/api/admin/roles", None, ("roles",)),
    (r"^/api/admin/perms$", "GET", ANY),
    (r"^/api/admin/search$", "GET", ANY),  # natijalar ruxsatlarga qarab filtrlanadi
    (r"^/api/admin/admins", "GET", ("admins", "roles")),
    (r"^/api/admin/admins", None, ("admins",)),
    (r"^/api/admin/media", "GET", ANY),
    (r"^/api/admin/media$", "POST", ANY),
    (r"^/api/admin/media/from-url$", "POST", ANY),
    (r"^/api/admin/media/openimg/", None, ANY),  # muharrirdagi ochiq rasm qidiruvi (rasm qo'yish — har bir muharrirga)
    (r"^/api/admin/media", None, ("media",)),
    (r"^/api/admin/site", "GET", ANY),
    (r"^/api/admin/site", None, ("site", "home", "menu")),
    (r"^/api/admin/uni", "GET", ANY),
    (r"^/api/admin/uni", None, ("uni",)),
    (r"^/api/admin/(smtp|email-log)", None, ("site",)),
    (r"^/api/admin/newsletters", None, ("subscribers", "news")),
    (r"^/api/admin/posts/", None, ("subscribers", "news", "announcements")),
    (r"^/api/admin/subscribers", None, ("subscribers",)),
    (r"^/api/admin/(messages|desk)", None, ("messages",)),
    (r"^/api/admin/blog", None, ("blog",)),
    (r"^/api/admin/mail", None, ("mail_server",)),
    (r"^/api/admin/sections", "GET", ("users", "professors", "academic")),
    (r"^/api/admin/sections", None, ("users",)),
    (r"^/api/admin/users", "GET", ("users", "professors", "academic", "schedule", "faculties")),
    (r"^/api/admin/users", None, ("users", "professors")),
    (r"^/api/admin/people", None, ("users", "professors")),
    (r"^/api/admin/photo/", None, ("users", "professors")),
    (r"^/api/admin/faculties/", None, ("faculties", "faculty_staff")),
    (r"^/api/admin/faculty-staff", None, ("faculty_staff",)),
    (r"^/api/admin/careers", None, ("careers",)),
    (r"^/api/admin/career-center/", None, ("career_center",)),
    (r"^/api/admin/alumni/", None, ("alumni",)),
    (r"^/api/admin/popups", None, ("popups",)),
    (r"^/api/admin/festive", None, ("festive",)),
    (r"^/api/admin/upgoals", None, ("pages",)),
    (r"^/api/admin/grants", None, ("grants",)),
    (r"^/api/admin/journal", None, ("journal",)),
    (r"^/api/admin/life/", None, ("student_life",)),
    (r"^/api/admin/gallery/", None, ("gallery",)),
    (r"^/api/admin/applicant/", None, ("admission",)),
    (r"^/api/admin/eventreg", None, ("events",)),
    (r"^/api/admin/official/opendata", None, ("opendata",)),
    (r"^/api/admin/official/datasets", None, ("opendata",)),
    (r"^/api/admin/official/reception", None, ("reception",)),
    (r"^/api/admin/tuition", None, ("programs",)),
    (r"^/api/admin/(hemis|storage|telegram|system|office)", None, ("site",)),
    (r"^/api/admin/library/(audit|jobs)", None, ("library_settings",)),
    (r"^/api/admin/library/settings", "GET", ("library", "library_settings")),
    (r"^/api/admin/library/settings", None, ("library_settings",)),
    (r"^/api/admin/library", None, ("library", "library_settings")),
    (r"^/api/admin/(lessons|changes|form|form-settings|week)", None, ("schedule",)),
    (r"^/api/admin/(acad|acad-overview)", "GET", ("academic", "schedule", "users")),
    (r"^/api/admin/(acad|acad-overview)", None, ("academic",)),
    (r"^/api/admin/notices", None, ("academic", "schedule", "users")),
    (r"^/api/mail/", None, ("mail",)),
]


def required(path: str, method: str) -> tuple[str, ...] | str | None:
    m = re.match(r"^/api/admin/items/([a-z_]+)", path)  # tur nomida pastki chiziq bo'lishi mumkin (adm_step, tour_scene)
    if m:
        if method == "GET":
            return ANY  # ro'yxatlar boshqa bo'limlarda tanlov uchun kerak
        return (ITEM_PERM.get(m.group(1), "__none__"),)
    for rx, meth, perms in RULES:
        if (meth is None or meth == method) and re.match(rx, path):
            return perms
    return ("__none__",) if path.startswith("/api/admin/") else None


def allowed(st, u: dict, path: str, method: str) -> bool:
    need = required(path, method)
    if need is None or need == ANY:
        return True
    have = perms_of(st, u)
    return any(p in have for p in need)
