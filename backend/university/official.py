"""Rasmiy va «institut ruhi» bo'limlari: me'yoriy hujjatlar, rahbariyatning fuqarolarni qabul qilish jadvali, ochiq ma'lumotlar,
reytinglar, maxfiylik siyosati, tarix (vaqt chizig'i), rektor murojaati, OAV biz haqimizda.

Yangi kontent turlari (`items` jadvali, admin CRUD — /api/admin/items/{kind}):
  reception  — rahbar qabuli: xodim (staff) bilan bog'lanadi, haftalik vaqtlar (slots), joy, xona, telefon, onlayn qabul izohi
  dataset    — ochiq ma'lumotlar to'plami: jadval (ustunlar + qatorlar), davr, manba; CSV / XLSX / JSON yuklab olinadi
  ranking    — reyting natijasi: reyting nomi, yil, toifa, o'rin / jami, havola, logotip
  milestone  — tarix: yil (va sana), sarlavha, matn, rasm
  mention    — OAV: nashr nomi, logotip, sarlavha, sana, havola, turi (maqola / video / TV / radio)

Bo'sh bo'lim saytda ko'rinmaydi: ochiq API 404 «empty» qaytaradi, SEO — 404 + noindex, sayt xaritasiga kirmaydi.
"""
from __future__ import annotations

import csv
import io
import json
import re
from datetime import date, datetime, timedelta

from . import content as C

# ------------------------------------------------------------------ sxemalar
_PUB = ("enum", ["published", "draft"])
RECEPTION = {
    "title": ("str", 200), "staff_id": ("str", 40), "position": ("str", 300), "photo": ("url",), "slots": ("json", 20_000),
    "place": ("str", 300), "room": ("str", 60), "phone": ("str", 60), "note": ("text", 1500), "online_url": ("url",),
    "status": _PUB, "sort": ("int",), "featured": ("bool",),
}
DATASET = {
    "title": ("str", 300), "description": ("text", 3000), "period": ("str", 120), "source": ("str", 300), "table": ("json", 3_000_000),
    "category": ("enum", ["students", "staff", "education", "science", "finance", "library", "other"]), "updated_on": ("iso",),
    "status": _PUB, "sort": ("int",), "featured": ("bool",),
}
RANKING = {
    "title": ("str", 300), "year": ("int",), "category": ("str", 200), "place": ("str", 40), "total": ("int",), "url": ("url",), "logo": ("url",),
    "note": ("text", 800), "status": _PUB, "sort": ("int",), "featured": ("bool",),
}
MILESTONE = {
    "title": ("str", 300), "year": ("int",), "date": ("iso",), "body": ("text", 6000), "image": ("url",), "image_alt": ("str", 300),
    "status": _PUB, "sort": ("int",), "featured": ("bool",),
}
MENTION_TYPES = ["article", "video", "tv", "radio"]
MENTION = {
    "title": ("str", 400), "outlet": ("str", 200), "logo": ("url",), "date": ("iso",), "url": ("url",), "type": ("enum", MENTION_TYPES),
    "summary": ("text", 1000), "status": _PUB, "sort": ("int",), "featured": ("bool",),
}
SCHEMAS = {"reception": RECEPTION, "dataset": DATASET, "ranking": RANKING, "milestone": MILESTONE, "mention": MENTION}
TRANSLATABLE = {
    "reception": ("title", "position", "place", "note"),
    "dataset": ("title", "description", "period", "source"),
    "ranking": ("title", "category", "note"),
    "milestone": ("title", "body", "image_alt"),
    "mention": ("title", "outlet", "summary"),
}
# hujjat turlari (content.DOCUMENT dagi tartib bilan): ustav, ichki tartib qoidalari, odob-axloq kodeksi, nizomlar, buyruqlar…
DOC_CATEGORY_ORDER = ["charter", "internal", "ethics", "regulation", "order", "plan", "report", "curriculum", "license", "other"]


def _rule_milestone(m: dict, status: str) -> str:
    """Tarix: «Aniq sana» berilsa — «Yil» shu sananing yili bo'lishi shart (kalendar joriy oyda ochiladi: noto'g'ri yil tanlanib qolmasin);
    yil bo'sh bo'lsa — sanadan olinadi."""
    d = str(m.get("date") or "")
    if re.match(r"^\d{4}-", d):
        y = int(d[:4])
        if m.get("year") in (None, "", 0):
            m["year"] = y
        elif int(m["year"]) != y:
            raise ValueError("milestone_year_mismatch")
    return status


def register() -> None:
    """Turlarni umumiy kontent tizimiga qo'shadi (content.py oxirida chaqiriladi)."""
    C.SCHEMAS.update(SCHEMAS)
    C.TRANSLATABLE.update(TRANSLATABLE)
    C.KIND_RULES["milestone"] = _rule_milestone


# ------------------------------------------------------------------ yordamchilar
_HM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def clean_slots(v) -> list[dict]:
    """Haftalik qabul vaqtlari: [{day: 1..7 (Dushanba=1), start: "HH:MM", end: "HH:MM"}], tartiblangan, takrorsiz."""
    out, seen = [], set()
    for x in (v if isinstance(v, list) else [])[:21]:
        if not isinstance(x, dict):
            continue
        try:
            day = int(x.get("day"))
        except (TypeError, ValueError):
            continue
        a, b = str(x.get("start") or "").strip(), str(x.get("end") or "").strip()
        if not 1 <= day <= 7 or not _HM.match(a) or not _HM.match(b) or a >= b or (day, a) in seen:
            continue
        seen.add((day, a))
        out.append({"day": day, "start": a, "end": b})
    return sorted(out, key=lambda s: (s["day"], s["start"]))


def slot_ok(slots: list[dict], d: date, hm: str, now: datetime | None = None) -> bool:
    """Tanlangan sana va vaqt rahbarning qabul vaqtiga to'g'ri keladimi (bugun bo'lsa — vaqt o'tib ketmagan)."""
    if not _HM.match(hm or ""):
        return False
    if now is not None and d == now.date() and hm <= now.strftime("%H:%M"):
        return False
    return any(s["day"] == d.isoweekday() and s["start"] <= hm < s["end"] for s in clean_slots(slots))


def yt_id(url: str) -> str:
    """YouTube havolasidan video identifikatori (embed uchun), bo'lmasa ''."""
    m = re.search(r"(?:youtube(?:-nocookie)?\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})", url or "")
    return m.group(1) if m else ""


def file_info(st, url: str) -> dict:
    """Hujjat fayli: kengaytma va hajmi (saytning o'z fayllari uchun; tashqi havola — faqat kengaytma)."""
    from pathlib import Path  # noqa: PLC0415

    path = (url or "").split("?")[0]
    ext = path.rsplit(".", 1)[1].lower() if "." in path.rsplit("/", 1)[-1] else ""
    size = None
    m = re.fullmatch(r"/media/([a-f0-9]{16}\.[a-z0-9]+)", path)
    if m:
        p = st.media_dir / m.group(1)
        if p.is_file():
            size = p.stat().st_size
        else:
            md = st.get_media(m.group(1).split(".")[0])
            size = (md or {}).get("size")
    return {"file_ext": ext if re.fullmatch(r"[a-z0-9]{1,5}", ext) else "", "file_size": size}


# ------------------------------------------------------------------ jadvallar: o'qish (CSV/XLSX) va eksport
MAX_ROWS, MAX_COLS = 5000, 40


def clean_table(v) -> dict:
    """{columns: [str], rows: [[str|number]]} — o'lchami cheklangan, katakchalar matn yoki son."""
    if not isinstance(v, dict):
        return {"columns": [], "rows": []}
    cols = [str(c or "").strip()[:120] for c in (v.get("columns") or [])[:MAX_COLS]]
    n = len(cols)
    rows = []
    for r in (v.get("rows") or [])[:MAX_ROWS]:
        if not isinstance(r, list):
            continue
        cells = []
        for x in (r + [""] * n)[:n]:
            if isinstance(x, bool):
                x = str(x)
            if isinstance(x, (int, float)) and x == x and abs(x) < 1e15:
                cells.append(int(x) if float(x).is_integer() else round(float(x), 6))
            else:
                cells.append(str(x if x is not None else "").strip()[:1000])
        if any(c not in ("", None) for c in cells):
            rows.append(cells)
    return {"columns": cols, "rows": rows}


def _num_or_str(s: str):
    t = s.strip().replace(" ", "").replace(" ", "")
    if re.fullmatch(r"-?\d{1,15}", t):
        return int(t)
    if re.fullmatch(r"-?\d{1,15}[.,]\d{1,6}", t):
        return float(t.replace(",", "."))
    return s.strip()


def parse_table(raw: bytes, filename: str) -> dict:
    """CSV (UTF-8 / UTF-8 BOM / CP1251; vergul, nuqtali vergul yoki tab) yoki XLSX (birinchi varaq): birinchi qator — ustun nomlari."""
    low = (filename or "").lower()
    rows: list[list] = []
    if raw[:4] == b"PK\x03\x04" or low.endswith(".xlsx"):
        from openpyxl import load_workbook  # noqa: PLC0415

        try:
            ws = load_workbook(io.BytesIO(raw), read_only=True, data_only=True).worksheets[0]
        except Exception as e:  # noqa: BLE001
            raise ValueError("bad_file") from e
        for r in ws.iter_rows(values_only=True):
            if len(rows) > MAX_ROWS:
                break
            rows.append([("" if x is None else x.isoformat()[:10] if isinstance(x, (date, datetime)) else x) for x in r[:MAX_COLS]])
    else:
        text = None
        for enc in ("utf-8-sig", "cp1251"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if text is None or "\x00" in text:
            raise ValueError("bad_file")
        sample = text[:4000]
        delim = max((",", ";", "\t"), key=sample.count)
        for r in csv.reader(io.StringIO(text), delimiter=delim):
            if len(rows) > MAX_ROWS:
                break
            rows.append([_num_or_str(x) for x in r[:MAX_COLS]])
    rows = [r for r in rows if any(str(x).strip() for x in r)]
    if not rows:
        raise ValueError("empty_file")
    head = [str(x).strip() or f"#{i + 1}" for i, x in enumerate(rows[0])]
    while head and head[-1].startswith("#") and all(len(r) < len(head) or str(r[len(head) - 1]).strip() == "" for r in rows[1:]):
        head.pop()
    return clean_table({"columns": head, "rows": [list(r) for r in rows[1:]]})


def to_csv(columns: list[str], rows: list[list]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(columns)
    for r in rows:
        w.writerow(["" if x is None else x for x in r])
    return ("﻿" + buf.getvalue()).encode("utf-8")  # Excel UTF-8 ni to'g'ri ochishi uchun BOM


def to_xlsx(title: str, columns: list[str], rows: list[list]) -> bytes:
    from openpyxl import Workbook  # noqa: PLC0415
    from openpyxl.styles import Font  # noqa: PLC0415
    from openpyxl.utils import get_column_letter  # noqa: PLC0415

    wb = Workbook()
    ws = wb.active
    ws.title = re.sub(r"[\[\]:*?/\\]", " ", title or "Data")[:31] or "Data"
    ws.append(columns)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in rows:
        ws.append(["" if x is None else x for x in r])
    for i, col in enumerate(columns, 1):
        width = max([len(str(col))] + [len(str(r[i - 1])) for r in rows[:200] if len(r) >= i])
        ws.column_dimensions[get_column_letter(i)].width = min(max(10, width + 2), 60)
    ws.freeze_panes = "A2"
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def safe_filename(s: str) -> str:
    return (C.slugify(s or "") or "data")[:60]


# ------------------------------------------------------------------ ochiq ma'lumotlar: bazadan avtomatik ko'rsatkichlar
L3 = ("uz", "ru", "en")
INDICATORS: list[tuple[str, tuple[str, str, str]]] = [
    ("students_total", ("Talabalar soni", "Количество студентов", "Number of students")),
    ("students_by_faculty", ("Talabalar: fakultet (yo‘nalish) bo‘yicha", "Студенты по факультетам (направлениям)", "Students by faculty (programme)")),
    ("students_by_course", ("Talabalar: kurslar bo‘yicha", "Студенты по курсам", "Students by year of study")),
    ("students_by_form", ("Talabalar: ta’lim shakli bo‘yicha", "Студенты по форме обучения", "Students by mode of study")),
    ("students_by_payment", ("Talabalar: to‘lov shakli bo‘yicha", "Студенты по форме оплаты", "Students by funding")),
    ("students_by_gender", ("Talabalar: jinsi bo‘yicha", "Студенты по полу", "Students by gender")),
    ("teachers_total", ("Professor-o‘qituvchilar soni", "Количество преподавателей", "Number of teaching staff")),
    ("teachers_by_degree", ("Professor-o‘qituvchilar: ilmiy daraja bo‘yicha", "Преподаватели по учёной степени", "Teaching staff by academic degree")),
    ("teachers_by_rank", ("Professor-o‘qituvchilar: ilmiy unvon bo‘yicha", "Преподаватели по учёному званию", "Teaching staff by academic title")),
    ("programs_total", ("Ta’lim yo‘nalishlari", "Направления обучения", "Study programmes")),
    ("programs_by_degree", ("Ta’lim yo‘nalishlari: bosqich bo‘yicha", "Направления по уровням", "Programmes by level")),
    ("faculties_total", ("Kafedralar", "Кафедры", "Academic departments")),
    ("departments_total", ("Markazlar va bo‘limlar", "Центры и отделы", "Centres and offices")),
    ("library_titles", ("Kutubxona fondi: nomlar", "Фонд библиотеки: наименования", "Library holdings: titles")),
    ("library_copies", ("Kutubxona fondi: bosma nusxalar", "Фонд библиотеки: печатные экземпляры", "Library holdings: print copies")),
    ("library_efiles", ("Kutubxona fondi: elektron nashrlar", "Фонд библиотеки: электронные издания", "Library holdings: e-books")),
]
INDICATOR_KEYS = [k for k, _ in INDICATORS]
_DEG = {"bachelor": ("Bakalavriat", "Бакалавриат", "Bachelor’s"), "master": ("Magistratura", "Магистратура", "Master’s"),
        "joint": ("Qo‘shma magistratura", "Совместная магистратура", "Joint master’s"), "phd": ("Tayanch doktorantura", "Базовая докторантура", "Doctoral"),
        "course": ("Kurslar", "Курсы", "Courses")}
_COURSE = ("{n}-kurs", "{n} курс", "Year {n}")
_UNKNOWN = ("Ko‘rsatilmagan", "Не указано", "Not specified")


def _li(lang: str) -> int:
    return L3.index(lang) if lang in L3 else 0


def _breakdown(counter: dict, lang: str) -> list[dict]:
    rows = [{"label": k or _UNKNOWN[_li(lang)], "value": v} for k, v in counter.items() if v]
    return sorted(rows, key=lambda r: (r["label"] == _UNKNOWN[_li(lang)], -r["value"], r["label"]))


def compute_indicators(svc, lang: str) -> dict[str, dict]:
    """Bazadagi joriy holat: {kalit: {value | breakdown}}; ma'lumot yo'q bo'lsa — kalit bo'lmaydi (saytda chiqmaydi)."""
    st = svc.st
    i = _li(lang)
    out: dict[str, dict] = {}
    students = st.list_users("student", active=True)
    if students:
        out["students_total"] = {"value": len(students)}
        groups = {g["id"]: g for g in st.acad_list("groups")} if hasattr(st, "acad_list") else {}
        facs = {f["id"]: svc.loc(f, lang)["title"] for f in st.list_items("faculty", public=True)}
        by_fac: dict[str, int] = {}
        by_course: dict[str, int] = {}
        by_form: dict[str, int] = {}
        by_pay: dict[str, int] = {}
        by_gender: dict[str, int] = {}
        for u in students:
            h = (u.get("data") or {}).get("hemis") or {}
            g = groups.get(u.get("group_id") or "") or {}
            fac = (h.get("faculty") or "").strip() or facs.get(g.get("faculty_id") or "", "")
            by_fac[fac] = by_fac.get(fac, 0) + 1
            course = g.get("course")
            if not course:
                m = re.search(r"(\d)", str(h.get("level") or ""))
                course = int(m.group(1)) if m else None
            ck = _COURSE[i].format(n=course) if course else ""
            by_course[ck] = by_course.get(ck, 0) + 1
            for src, dst in ((h.get("education_form"), by_form), (h.get("payment_form"), by_pay), (h.get("gender"), by_gender)):
                k = str(src or "").strip()
                dst[k] = dst.get(k, 0) + 1
        for key, cnt in (("students_by_faculty", by_fac), ("students_by_course", by_course), ("students_by_form", by_form),
                         ("students_by_payment", by_pay), ("students_by_gender", by_gender)):
            if any(k for k in cnt):  # hammasi «ko'rsatilmagan» bo'lsa — ko'rsatkich chiqmaydi
                out[key] = {"breakdown": _breakdown(cnt, lang)}
    teachers = st.list_users("teacher", active=True)
    if teachers:
        out["teachers_total"] = {"value": len(teachers)}
        for key, field in (("teachers_by_degree", "academic_degree"), ("teachers_by_rank", "academic_rank")):
            cnt: dict[str, int] = {}
            for u in teachers:
                k = str((u.get("data") or {}).get(field) or "").strip()
                cnt[k] = cnt.get(k, 0) + 1
            if any(k for k in cnt):
                out[key] = {"breakdown": _breakdown(cnt, lang)}
    else:
        staff = [x for x in st.list_items("staff", public=True) if x.get("category") in ("professor", "teacher", "visiting")]
        if staff:
            out["teachers_total"] = {"value": len(staff)}
    progs = st.list_items("program", public=True)
    if progs:
        out["programs_total"] = {"value": len(progs)}
        cnt = {}
        for p in progs:
            k = _DEG.get(p.get("degree") or "", ("", "", ""))[i]
            cnt[k] = cnt.get(k, 0) + 1
        out["programs_by_degree"] = {"breakdown": _breakdown(cnt, lang)}
    for key, kind in (("faculties_total", "faculty"), ("departments_total", "department")):
        n = len(st.list_items(kind, public=True))
        if n:
            out[key] = {"value": n}
    if st.has_table("lib_books"):
        for key, sql in (("library_titles", "SELECT COUNT(*) FROM lib_books"),
                         ("library_copies", "SELECT COUNT(*) FROM lib_copies WHERE status NOT IN ('lost','writtenoff')"),
                         ("library_efiles", "SELECT COUNT(DISTINCT book_id) FROM lib_files")):
            try:
                n = int(st._one(sql) or 0)
            except Exception:  # noqa: BLE001 — jadval hali yaratilmagan
                n = 0
            if n:
                out[key] = {"value": n}
    return out


def opendata_cfg(st) -> dict:
    v = st.kv_get("opendata_cfg") or {}
    return v if isinstance(v, dict) else {}


def clean_opendata_cfg(data: dict, current: dict) -> dict:
    """Admin: har bir ko'rsatkich uchun {hidden, value (qo'lda), rows (qo'lda taqsimot), note, updated}."""
    today = date.today().isoformat()
    out = {}
    src = data.get("indicators") if isinstance(data.get("indicators"), dict) else {}
    for k in INDICATOR_KEYS:
        x = src.get(k) if k in src else current.get(k)
        if not isinstance(x, dict):
            continue
        val = x.get("value")
        try:
            val = int(val) if val not in (None, "") and int(val) >= 0 else None
        except (TypeError, ValueError):
            val = None
        rows = []
        for r in (x.get("rows") or [])[:40]:
            if not isinstance(r, dict) or not str(r.get("label") or "").strip():
                continue
            try:
                n = int(r.get("value"))
            except (TypeError, ValueError):
                continue
            if n >= 0:
                rows.append({"label": str(r["label"]).strip()[:120], "value": n})
        c = {"hidden": bool(x.get("hidden")), "value": val, "rows": rows}
        prev = current.get(k) or {}
        changed = (c["value"], c["rows"]) != (prev.get("value"), prev.get("rows") or [])
        c["updated"] = today if changed and (val is not None or rows) else prev.get("updated") or (today if val is not None or rows else None)
        if c["hidden"] or c["value"] is not None or c["rows"]:
            out[k] = c
    return out


def indicators(svc, lang: str, admin: bool = False) -> list[dict]:
    """Saytda ko'rinadigan ko'rsatkichlar (admin=True — hammasi, yashirinlari va avtomatik qiymatlari bilan)."""
    auto = compute_indicators(svc, lang)
    cfg = opendata_cfg(svc.st)
    today = date.today().isoformat()
    i = _li(lang)
    out = []
    for key, labels in INDICATORS:
        a = auto.get(key) or {}
        c = cfg.get(key) or {}
        kind = "breakdown" if key.split("_")[1] == "by" else "value"
        item = {"key": key, "label": labels[i], "kind": kind, "source": "auto", "updated": today}
        if kind == "value":
            if c.get("value") is not None:
                item.update(value=c["value"], source="manual", updated=c.get("updated") or today)
            else:
                item["value"] = a.get("value")
            has = item["value"] is not None
        else:
            if c.get("rows"):
                item.update(breakdown=c["rows"], source="manual", updated=c.get("updated") or today)
            else:
                item["breakdown"] = a.get("breakdown") or []
            has = bool(item["breakdown"])
            item["value"] = sum(r["value"] for r in item["breakdown"]) if has else None
        item["hidden"] = bool(c.get("hidden"))
        if admin:
            item["auto"] = a.get("value") if kind == "value" else a.get("breakdown") or []
            item["has_data"] = has
            out.append(item)
        elif has and not item["hidden"]:
            out.append(item)
    return out


# ------------------------------------------------------------------ boshlang'ich yozuvlar (faqat import qilingan faktlar asosida)
PRIVACY_SLUG = "maxfiylik-siyosati"


def _privacy_blocks() -> dict[str, list]:
    """Maxfiylik siyosati — loyiha matni (yuridik tekshiruvdan o'tkazilishi kerak). Sayt haqiqatan yig'adigan ma'lumotlar asosida."""
    return {
        "uz": [
            "Ushbu siyosat Universitet rasmiy veb-sayti va unga bog‘liq xizmatlar orqali "
            "qanday shaxsiy ma’lumotlar to‘planishi, ular nima maqsadda ishlatilishi va qanday himoya qilinishini tushuntiradi.",
            ("h", "Qaysi ma’lumotlar to‘planadi"),
            ("ul", [
                "Virtual qabulxona (aloqa formasi) va rahbariyat qabuliga yozilish: ism-familiya, email, telefon, murojaat mavzusi va matni, qabul uchun tanlangan sana va vaqt.",
                "Yangiliklarga obuna: email manzil (obuna email orqali tasdiqlanadi).",
                "Grant taqsimoti arizasi: F.I.Sh., kurs, guruh, yo‘nalish, ta’lim tili, telefon, email va ariza sababi.",
                "Vakansiyaga ariza: ism-familiya, email, telefon, xabar va yuborilgan rezyume fayllari.",
                "Talaba va o‘qituvchi kabineti: login, F.I.Sh., guruh va o‘quv ma’lumotlari (HEMIS axborot tizimidan), kirish sessiyalari.",
                "Telegram bot: Telegram foydalanuvchi identifikatori, ism va foydalanuvchi nomi, bot orqali yuborilgan xabar va fayllar.",
                "Sayt chati: suhbat matni va suhbat identifikatori.",
                "Texnik ma’lumotlar: IP manzil va brauzer turi (xavfsizlik, spamdan himoya va murojaatlarni hisobga olish uchun).",
            ]),
            ("h", "Cookie va brauzer xotirasi"),
            ("ul", [
                "Zarur cookie: tizimga kirish sessiyasi, tanlangan til va cookie bo‘yicha tanlovingiz.",
                "Statistika cookie (faqat roziligingiz bilan): saytga tashriflarni hisoblash uchun anonim identifikator. Statistika Institut serverida yuritiladi, uchinchi tomon tahlil xizmatlari ishlatilmaydi.",
                "Brauzer xotirasi (localStorage): yorug‘/qorong‘i mavzu va til kabi sozlamalar — faqat qurilmangizda saqlanadi.",
                "Sayt pastidagi «Cookie sozlamalari» orqali tanlovingizni istalgan vaqtda o‘zgartirishingiz mumkin.",
            ]),
            ("h", "Ma’lumotlardan foydalanish maqsadlari"),
            ("ul", [
                "Murojaat, ariza va qabulga yozilishni ko‘rib chiqish va javob berish.",
                "Obunachilarga yangiliklarni yuborish (har bir xatda obunani bekor qilish havolasi bor).",
                "Ta’lim jarayonini tashkil etish (kabinet, dars jadvali, kutubxona).",
                "Sayt xavfsizligini ta’minlash va xizmat sifatini yaxshilash.",
            ]),
            ("h", "Ma’lumotlarni uzatish va saqlash"),
            "Shaxsiy ma’lumotlar sotilmaydi va reklama maqsadida uchinchi shaxslarga berilmaydi. Ular qonun hujjatlarida nazarda tutilgan hollarda vakolatli davlat organlariga "
            "berilishi mumkin. Ma’lumotlar maqsadga erishish uchun zarur muddat davomida saqlanadi va ruxsatsiz kirishdan himoya qilinadi.",
            ("h", "Sizning huquqlaringiz"),
            ("ul", [
                "o‘zingizga oid ma’lumotlar qayta ishlanishi haqida axborot olish;",
                "noto‘g‘ri ma’lumotlarni tuzatishni talab qilish;",
                "qonunda belgilangan hollarda ma’lumotlarni o‘chirishni yoki qayta ishlashni to‘xtatishni talab qilish;",
                "rozilikni qaytarib olish (masalan, obunani bekor qilish yoki statistika cookie’sini o‘chirish).",
            ]),
            ("h", "Bog‘lanish"),
            "Shaxsiy ma’lumotlar bo‘yicha savol va talablaringizni virtual qabulxona orqali yuboring.",
            ("a", "Virtual qabulxona", "/contact"),
        ],
        "ru": [
            "Настоящая политика объясняет, какие персональные данные собирает официальный сайт Университета "
            "и связанные с ним сервисы, для чего они используются и как защищаются.",
            ("h", "Какие данные собираются"),
            ("ul", [
                "Виртуальная приёмная (форма обратной связи) и запись на приём к руководству: имя и фамилия, email, телефон, тема и текст обращения, выбранные дата и время приёма.",
                "Подписка на новости: адрес email (подписка подтверждается по email).",
                "Заявление на перераспределение грантов: Ф.И.О., курс, группа, направление, язык обучения, телефон, email и причина.",
                "Отклик на вакансию: имя и фамилия, email, телефон, сообщение и приложенные файлы резюме.",
                "Кабинет студента и преподавателя: логин, Ф.И.О., группа и учебные данные (из информационной системы HEMIS), сессии входа.",
                "Telegram-бот: идентификатор пользователя Telegram, имя и имя пользователя, отправленные боту сообщения и файлы.",
                "Чат сайта: текст переписки и идентификатор диалога.",
                "Технические данные: IP-адрес и тип браузера (для безопасности, защиты от спама и учёта обращений).",
            ]),
            ("h", "Cookie и память браузера"),
            ("ul", [
                "Необходимые cookie: сессия входа, выбранный язык и ваш выбор по cookie.",
                "Статистические cookie (только с вашего согласия): анонимный идентификатор для подсчёта посещений. Статистика ведётся на сервере Института, сторонние сервисы аналитики не используются.",
                "Память браузера (localStorage): настройки темы и языка — хранятся только на вашем устройстве.",
                "Изменить выбор можно в любое время через «Настройки cookie» внизу сайта.",
            ]),
            ("h", "Цели использования данных"),
            ("ul", [
                "Рассмотрение обращений, заявлений и записей на приём и ответ на них.",
                "Рассылка новостей подписчикам (в каждом письме есть ссылка для отписки).",
                "Организация учебного процесса (кабинет, расписание, библиотека).",
                "Обеспечение безопасности сайта и улучшение качества сервисов.",
            ]),
            ("h", "Передача и хранение данных"),
            "Персональные данные не продаются и не передаются третьим лицам в рекламных целях. Они могут быть переданы уполномоченным государственным органам "
            "в случаях, предусмотренных законодательством. Данные хранятся в течение срока, необходимого для достижения цели обработки, и защищены от несанкционированного доступа.",
            ("h", "Ваши права"),
            ("ul", [
                "получать информацию об обработке своих данных;",
                "требовать исправления неточных данных;",
                "в случаях, установленных законом, требовать удаления данных или прекращения их обработки;",
                "отозвать согласие (например, отписаться от рассылки или отключить статистические cookie).",
            ]),
            ("h", "Контакты"),
            "Вопросы и требования по персональным данным направляйте через виртуальную приёмную.",
            ("a", "Виртуальная приёмная", "/contact"),
        ],
        "en": [
            "This policy explains what personal data the official University website and its related "
            "services collect, why it is used, and how it is protected.",
            ("h", "What we collect"),
            ("ul", [
                "Virtual reception (contact form) and booking a meeting with the leadership: name, email, phone, subject and text of the request, the chosen date and time.",
                "Newsletter: your email address (the subscription is confirmed by email).",
                "Grant redistribution application: full name, year, group, programme, language of study, phone, email and the reason.",
                "Job applications: name, email, phone, message and the CV files you attach.",
                "Student and teacher portal: login, full name, group and study records (from the HEMIS information system), sign-in sessions.",
                "Telegram bot: your Telegram user ID, name and username, messages and files you send to the bot.",
                "Site chat: the conversation text and a conversation ID.",
                "Technical data: IP address and browser type (for security, spam protection and handling requests).",
            ]),
            ("h", "Cookies and browser storage"),
            ("ul", [
                "Necessary cookies: sign-in session, selected language and your cookie choice.",
                "Statistics cookie (only with your consent): an anonymous ID used to count visits. Statistics are kept on the Institute’s server; no third-party analytics services are used.",
                "Browser storage (localStorage): settings such as light/dark theme and language — kept only on your device.",
                "You can change your choice at any time via “Cookie settings” at the bottom of the site.",
            ]),
            ("h", "Why we use it"),
            ("ul", [
                "To review and answer requests, applications and meeting bookings.",
                "To send news to subscribers (every email has an unsubscribe link).",
                "To run the study process (portal, timetable, library).",
                "To keep the website secure and improve our services.",
            ]),
            ("h", "Sharing and retention"),
            "Personal data is not sold and is not shared with third parties for advertising. It may be disclosed to competent public authorities where the law requires. "
            "Data is kept only as long as needed for its purpose and is protected against unauthorised access.",
            ("h", "Your rights"),
            ("ul", [
                "to be informed about the processing of your data;",
                "to have inaccurate data corrected;",
                "where the law provides, to have data deleted or its processing stopped;",
                "to withdraw consent (for example, unsubscribe or switch off the statistics cookie).",
            ]),
            ("h", "Contact"),
            "Send questions and requests about personal data through the virtual reception.",
            ("a", "Virtual reception", "/contact"),
        ],
    }


PRIVACY_TITLES = ("Maxfiylik siyosati", "Политика конфиденциальности", "Privacy policy")
PRIVACY_EXCERPTS = ("Sayt qanday shaxsiy ma’lumotlarni to‘plashi, ulardan qanday foydalanilishi va sizning huquqlaringiz.",
                    "Какие персональные данные собирает сайт, как они используются и ваши права.",
                    "What personal data the website collects, how it is used and your rights.")


def privacy_page_seed() -> dict:
    from .seed import _blocks, _rich  # noqa: PLC0415

    blocks = _privacy_blocks()
    return _rich("page", {"title": PRIVACY_TITLES[0], "slug": PRIVACY_SLUG, "section": "other", "sort": 24, "excerpt": PRIVACY_EXCERPTS[0], "show_toc": True},
                 {lang: _blocks(blocks[lang]) for lang in L3},
                 {"ru": {"title": PRIVACY_TITLES[1], "excerpt": PRIVACY_EXCERPTS[1]}, "en": {"title": PRIVACY_TITLES[2], "excerpt": PRIVACY_EXCERPTS[2]}})


def reception_seed(st) -> list[dict]:
    """Rahbariyat qabuli: rahbarlar profillaridagi qabul vaqti asosida."""
    out = []
    days = {"Dushanba": 1, "Seshanba": 2, "Chorshanba": 3, "Payshanba": 4, "Juma": 5, "Shanba": 6, "Yakshanba": 7}
    for s in st.list_items("staff", public=True):
        pos = (s.get("position") or "").lower()
        if s.get("category") != "leadership" or "rektor" not in pos:
            continue
        m = re.search(r"(\w+)\s*[-–]\s*(\w+)\s*\(([\d:]+)\s*[-–]\s*([\d:]+)\)", s.get("hours") or "")
        if not m or m.group(1) not in days or m.group(2) not in days:
            continue
        a, b = days[m.group(1)], days[m.group(2)]
        start, end = (x.zfill(5) for x in (m.group(3), m.group(4)))
        slots = clean_slots([{"day": d, "start": start, "end": end} for d in range(a, b + 1)])
        if slots:
            out.append({"kind": "reception", "data": {"title": s["title"], "staff_id": s["id"], "slots": slots, "status": "published",
                                                      "sort": 0 if "prorektor" not in pos else 10 + len(out)}})
    return out


def bootstrap(st) -> None:
    """Bir marta: maxfiylik siyosati sahifasi va rahbariyat qabuli jadvali."""
    if st.kv_get("official_seed_v1"):
        return
    seeds: list[dict] = []
    if not st.get_item_by_slug("page", PRIVACY_SLUG, public=False):
        seeds.append(privacy_page_seed())
    if not st.list_items("reception"):
        seeds += reception_seed(st)
    for s in seeds:
        cols, rest = C.clean_item(s["kind"], dict(s["data"]))
        st.save_item(s["kind"], cols, rest)
    st.kv_put("official_seed_v1", True)


# ------------------------------------------------------------------ ochiq API uchun ma'lumotlar (SEO, sayt xaritasi, sahifalar umumiy)
def public_items(svc, kind: str, lang: str) -> list[dict]:
    return [svc.loc(x, lang) for x in svc.st.list_items(kind, public=True)]


def rector(svc, lang: str) -> dict | None:
    """Rektor murojaati: admin → «Rektor murojaati» (Institut ma'lumotlari) + xodimlar ro'yxatidagi rektor (ism, lavozim, surat)."""
    u = svc.uni_l(lang)
    html = (u.get("rector_speech_html") or "").strip()
    if not re.sub(r"<[^>]+>|&nbsp;|\s", "", html):
        return None
    staff = None
    sid = svc.uni().get("rector_staff_id") or ""
    if sid:
        staff = svc.st.get_item(sid)
        staff = staff if staff and staff.get("kind") == "staff" and staff.get("status") == "published" else None
    if not staff:
        staff = next((x for x in svc.st.list_items("staff", public=True)
                      if x.get("category") == "leadership" and re.search(r"\brektor", (x.get("position") or "").lower())
                      and "prorektor" not in (x.get("position") or "").lower()), None)
    s = svc.loc(staff, lang) if staff else {}
    return {"name": u.get("rector_name") or s.get("title") or "", "title": (u.get("rector_title") if u.get("rector_name") else "") or s.get("position") or u.get("rector_title") or "",
            "photo": u.get("rector_photo") or s.get("photo") or "", "html": html, "signature": svc.uni().get("rector_signature") or "",
            "staff_slug": s.get("slug") or "", "updated": None}


SEO_LABELS = {
    "/reception": ("Rahbariyatning fuqarolarni qabul qilish jadvali", "График приёма граждан руководством", "Leadership reception schedule"),
    "/open-data": ("Ochiq ma’lumotlar", "Открытые данные", "Open data"),
    "/rankings": ("Reytinglar", "Рейтинги", "Rankings"),
    "/history": ("Institut tarixi", "История института", "History of the institute"),
    "/rector": ("Rektor murojaati", "Обращение ректора", "Rector’s address"),
    "/media-mentions": ("OAV biz haqimizda", "СМИ о нас", "In the media"),
}
SEO_DESC = {
    "/reception": ("{abbr} rahbariyatining fuqarolarni qabul qilish kunlari va vaqtlari, joyi va aloqa ma’lumotlari. Qabulga onlayn yozilish.",
                   "Дни и часы приёма граждан руководством {abbr}, место и контакты. Онлайн-запись на приём.",
                   "{abbr} leadership reception days and hours, location and contacts. Book a meeting online."),
    "/open-data": ("{abbr} ochiq ma’lumotlari: talabalar, professor-o‘qituvchilar, yo‘nalishlar, kutubxona fondi ko‘rsatkichlari va yuklab olinadigan to‘plamlar (CSV, XLSX, JSON).",
                   "Открытые данные {abbr}: показатели по студентам, преподавателям, направлениям, библиотечному фонду и наборы данных (CSV, XLSX, JSON).",
                   "{abbr} open data: indicators on students, teaching staff, programmes and library holdings, plus downloadable datasets (CSV, XLSX, JSON)."),
    "/rankings": ("{abbr} reytinglarda: reyting nomi, yil, toifa va egallangan o‘rin.", "{abbr} в рейтингах: название, год, категория и место.",
                  "{abbr} in rankings: ranking, year, category and position."),
    "/history": ("{abbr} tarixi: tashkil etilishidan bugungacha muhim sanalar.", "История {abbr}: ключевые даты с основания до наших дней.",
                 "History of {abbr}: key dates since its foundation."),
    "/rector": ("{abbr} rektorining murojaati.", "Обращение ректора {abbr}.", "Address by the rector of {abbr}."),
    "/media-mentions": ("{abbr} haqida ommaviy axborot vositalarida: maqolalar, video, teleko‘rsatuv va radio.",
                        "{abbr} в СМИ: статьи, видео, телепередачи и радио.", "{abbr} in the media: articles, videos, TV and radio."),
}


def section_visible(svc, path: str) -> bool:
    if path == "/reception":
        return bool(svc.st.list_items("reception", public=True))
    if path == "/open-data":
        return bool(indicators(svc, svc.base_lang())) or bool(svc.st.list_items("dataset", public=True))
    if path == "/rankings":
        return bool(svc.st.list_items("ranking", public=True))
    if path == "/history":
        return bool(svc.st.list_items("milestone", public=True))
    if path == "/rector":
        return rector(svc, svc.base_lang()) is not None
    if path == "/media-mentions":
        return bool(svc.st.list_items("mention", public=True))
    return False


def seo_page(svc, path: str, lang: str) -> dict | None:
    """seo.EXTRA_PAGES uchun: sarlavha, tavsif, SSR matni va havolalar; bo'lim bo'sh bo'lsa — None (404, noindex)."""
    if path not in SEO_LABELS or not section_visible(svc, path):
        return None
    i = _li(lang)
    abbr = svc.uni_l(lang).get("abbr") or "UNI"
    title = SEO_LABELS[path][i]
    desc = SEO_DESC[path][i].format(abbr=abbr)
    text = desc
    links: list[tuple[str, str]] = []
    jsonld: list[dict] = []
    if path == "/history":
        items = sorted(public_items(svc, "milestone", lang), key=lambda x: (x.get("year") or 0, x.get("date") or ""))
        text = " ".join(f"{x.get('year') or ''} — {x['title']}. {x.get('body') or ''}" for x in items)[:4000]
    elif path == "/rector":
        r = rector(svc, lang) or {}
        text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", r.get("html") or "")).strip()[:4000]
        if r.get("name"):
            title = f"{title}: {r['name']}"
    elif path == "/rankings":
        items = public_items(svc, "ranking", lang)
        text = "; ".join(f"{x['title']} {x.get('year') or ''}: {x.get('place') or ''}" for x in items)[:4000] or desc
    elif path == "/media-mentions":
        items = public_items(svc, "mention", lang)
        links = [(f"{x.get('outlet') or ''}: {x['title']}", x["url"]) for x in items[:40] if x.get("url")]
    elif path == "/open-data":
        ds = public_items(svc, "dataset", lang)
        jsonld = [{"@type": "Dataset", "name": x["title"], "description": (x.get("description") or x["title"])[:500],
                   "temporalCoverage": x.get("period") or None, "creator": {"@id": "/#org"}, "isAccessibleForFree": True,
                   "distribution": [{"@type": "DataDownload", "encodingFormat": f, "contentUrl": f"/api/open-data/datasets/{x['id']}.{e}"}
                                    for e, f in (("csv", "text/csv"), ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), ("json", "application/json"))]}
                  for x in ds[:30]]
        text = desc + " " + "; ".join(x["title"] for x in ds)
    elif path == "/reception":
        items = public_items(svc, "reception", lang)
        text = desc + " " + "; ".join(x["title"] for x in items)
    upd = [x.get("updated") or "" for k in ("reception", "dataset", "ranking", "milestone", "mention") for x in svc.st.list_items(k, public=True)]
    return {"title": title, "description": desc, "text": text, "links": links, "jsonld": jsonld, "lastmod": max(upd) if upd else None}


def today_local() -> date:
    from .storage import local_today  # noqa: PLC0415

    return local_today()


def now_local() -> datetime:
    from .storage import local_now  # noqa: PLC0415

    return local_now()


BOOK_DAYS = 60  # qabulga necha kun oldindan yozilish mumkin


def book_window() -> tuple[date, date]:
    t = today_local()
    return t, t + timedelta(days=BOOK_DAYS)


def json_dumps(v) -> str:
    return json.dumps(v, ensure_ascii=False)
