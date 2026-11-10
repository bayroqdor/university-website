"""Talaba va o'qituvchilarni Excel (.xlsx) orqali ommaviy qo'shish: namuna fayl, o'qish va login/parollar ro'yxati."""
from __future__ import annotations

import io
import re
from datetime import datetime

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

ACCENT = "0F3D8C"
EXAMPLE_PREFIX = "namuna."

# ustun kaliti → (sarlavha, kenglik, izoh)
STUDENT_COLS = [
    ("login", "Login", 18, "bo‘sh qolsa — ism-familiyadan (a.karimova); pochta: login@domen"),
    ("name", "F.I.Sh. *", 30, "to'liq ism familiya"),
    ("email", "Email", 26, "ixtiyoriy"),
    ("group", "Guruh", 14, "mavjud bo'lmasa avtomatik yaratiladi"),
    ("student_no", "Talaba ID", 16, "HEMIS yoki ichki raqam"),
    ("phone", "Telefon", 18, "+998..."),
    ("password", "Parol", 16, "bo'sh qolsa — tasodifiy parol yaratiladi"),
]
TEACHER_COLS = [
    ("login", "Login", 18, "bo‘sh qolsa — ism-familiyadan (n.salimova); pochta: login@domen"),
    ("name", "F.I.Sh. *", 30, "to'liq ism familiya"),
    ("email", "Email", 26, "ixtiyoriy"),
    ("position", "Lavozim", 26, "masalan: dotsent, katta o'qituvchi"),
    ("department", "Kafedra", 28, "kafedra yoki bo'lim nomi"),
    ("faculties", "Fakultet(lar)", 30, "fakultet nomi; bir nechta bo'lsa nuqtali vergul bilan"),
    ("phone", "Telefon", 18, "+998..."),
    ("password", "Parol", 16, "bo'sh qolsa — tasodifiy parol yaratiladi"),
]

# sarlavha → kalit (o'zbek, rus, ingliz yozuvlari ham tanilsin)
HEADER_ALIASES = {
    "login": ("login", "логин", "username", "foydalanuvchi"),
    "name": ("f.i.sh", "fish", "fio", "ф.и.о", "фио", "ism", "ism familiya", "name", "full name", "talaba", "o'qituvchi"),
    "email": ("email", "e-mail", "pochta", "почта"),
    "group": ("guruh", "группа", "group"),
    "student_no": ("talaba id", "id", "student id", "student_no", "hemis", "номер"),
    "phone": ("telefon", "телефон", "phone", "tel"),
    "password": ("parol", "пароль", "password"),
    "position": ("lavozim", "должность", "position"),
    "department": ("kafedra", "кафедра", "department", "bo'lim"),
    "faculties": ("fakultet", "fakultet(lar)", "факультет", "faculty", "faculties"),
}

THIN = Side(style="thin", color="C9D3E3")


def _norm(v) -> str:
    return re.sub(r"[\s*]+", " ", str(v or "")).strip().lower().replace("‘", "'").replace("’", "'").replace("ʻ", "'")


def build_template(role: str, groups: list[str], faculties: list[str]) -> bytes:
    """Namuna fayl: 1-varaq — to'ldiriladigan jadval (2 ta namuna qator bilan), 2-varaq — yo'riqnoma va mavjud guruh/fakultetlar."""
    cols = STUDENT_COLS if role == "student" else TEACHER_COLS
    wb = Workbook()
    ws = wb.active
    ws.title = "Talabalar" if role == "student" else "O'qituvchilar"
    head_fill = PatternFill("solid", fgColor=ACCENT)
    for c, (_key, title, width, _hint) in enumerate(cols, start=1):
        cell = ws.cell(row=1, column=c, value=title)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = head_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)
        ws.column_dimensions[get_column_letter(c)].width = width
        hint = ws.cell(row=2, column=c, value=_hint)
        hint.font = Font(italic=True, size=9, color="6B7891")
        hint.alignment = Alignment(wrap_text=True, vertical="top")
    ws.row_dimensions[1].height = 24
    ws.row_dimensions[2].height = 30
    g1 = groups[0] if groups else "CS-25-1"
    f1 = faculties[0] if faculties else "Dasturiy injiniring kafedrasi"
    if role == "student":
        examples = [
            [f"{EXAMPLE_PREFIX}talaba1", "Karimova Aziza Akmalovna", "aziza@example.edu", g1, "UNI20250001", "+998901234567", ""],
            [f"{EXAMPLE_PREFIX}talaba2", "Toshmatov Bekzod Olimovich", "", g1, "UNI20250002", "", "Parol2025"],
        ]
    else:
        examples = [
            [f"{EXAMPLE_PREFIX}oqituvchi1", "Salimova Nigina", "nigina@example.edu", "Katta o'qituvchi", "Dasturiy injiniring kafedrasi", f1, "+998901112233", ""],
            [f"{EXAMPLE_PREFIX}oqituvchi2", "Qodirov Sherzod", "", "Professor", "Iqtisodiyot va boshqaruv kafedrasi", "; ".join(faculties[:2]) or f1, "", "Parol2025"],
        ]
    ex_font = Font(italic=True, color="8A96AB")
    for r, row in enumerate(examples, start=3):
        for c, v in enumerate(row, start=1):
            cell = ws.cell(row=r, column=c, value=v)
            cell.font = ex_font
    ws.freeze_panes = "A3"
    if groups and role == "student":
        dv = DataValidation(type="list", formula1="=Ro'yxatlar!$A$2:$A$" + str(len(groups) + 1), allow_blank=True, showErrorMessage=False)
        ws.add_data_validation(dv)
        dv.add(f"D3:D2000")
    # yo'riqnoma
    info = wb.create_sheet("Yo'riqnoma")
    lines = [
        "Qanday to'ldiriladi",
        "",
        f"1. «{ws.title}» varag'ida 3-qatordan boshlab har bir {'talaba' if role == 'student' else 'o‘qituvchi'} uchun bitta qator to'ldiring.",
        f"2. «{EXAMPLE_PREFIX}…» bilan boshlanuvchi namuna qatorlar import qilinmaydi — ularni o'chirsangiz ham, qoldirsangiz ham bo'ladi.",
        "3. * belgili ustunlar majburiy. Login faqat lotin harflari, raqamlar va . _ - belgilaridan iborat bo'lsin (3–60 belgi). Login bo'sh qolsa — ism-familiyadan avtomatik yaratiladi (masalan, aziza.karimova) va institut pochtasi shu manzilda ochiladi.",
        "4. Parol bo'sh qolsa tasodifiy parol yaratiladi. Import tugagach barcha login va parollarni Excel faylda yuklab olasiz.",
        "5. Mavjud login bilan qator o'tkazib yuboriladi (hisob o'zgarmaydi).",
        "6. Guruh ro'yxatda bo'lmasa avtomatik yaratiladi (1-kurs); keyin «Guruhlar» bo'limida kursi va fakultetini to'g'rilang." if role == "student"
        else "6. Fakultet nomi «Ro'yxatlar» varag'idagi nomlardan biri bo'lishi kerak; o'qituvchi kabinetida shu fakultetlar jadvali ko'rinadi.",
        "7. Faylni saqlab, admin panel → Foydalanuvchilar → «Excel orqali qo'shish» oynasida yuklang.",
    ]
    for i, t in enumerate(lines, start=1):
        c = info.cell(row=i, column=1, value=t)
        if i == 1:
            c.font = Font(bold=True, size=14, color=ACCENT)
    info.column_dimensions["A"].width = 120
    lists = wb.create_sheet("Ro'yxatlar")
    lists.cell(row=1, column=1, value="Mavjud guruhlar").font = Font(bold=True)
    lists.cell(row=1, column=2, value="Fakultetlar").font = Font(bold=True)
    for i, g in enumerate(groups, start=2):
        lists.cell(row=i, column=1, value=g)
    for i, f in enumerate(faculties, start=2):
        lists.cell(row=i, column=2, value=f)
    lists.column_dimensions["A"].width = 22
    lists.column_dimensions["B"].width = 46
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


class SheetError(ValueError):
    pass


def read_rows(raw: bytes) -> list[dict]:
    """Excel faylning birinchi varag'ini o'qiydi: sarlavhalar bo'yicha ustunlar aniqlanadi. Qaytaradi: [{"row": n, ...maydonlar}]."""
    try:
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except Exception as e:  # noqa: BLE001
        raise SheetError("not_xlsx") from e
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise SheetError("empty")
    header_idx, mapping = None, {}
    for hi, row in enumerate(rows[:10]):
        m = {}
        for ci, v in enumerate(row):
            n = _norm(v)
            if not n:
                continue
            for key, aliases in HEADER_ALIASES.items():
                if key not in m and (n in aliases or any(n.startswith(a) for a in aliases if len(a) > 3)):
                    m[key] = ci
                    break
        if "name" in m and ("login" in m or len(m) >= 2):  # login ustuni ixtiyoriy
            header_idx, mapping = hi, m
            break
    if header_idx is None:
        raise SheetError("no_header")
    out = []
    for ri in range(header_idx + 1, len(rows)):
        row = rows[ri]
        rec = {"row": ri + 1}
        for key, ci in mapping.items():
            v = row[ci] if ci < len(row) else None
            if isinstance(v, float) and v.is_integer():
                v = int(v)
            if isinstance(v, datetime):
                v = v.date().isoformat()
            rec[key] = str(v).strip() if v is not None else ""
        if not any(rec.get(k) for k in mapping):
            continue
        out.append(rec)
    return out


def is_hint_row(rec: dict) -> bool:
    """Namuna fayldagi izoh qatori (2-qator) va namuna qatorlar."""
    login = (rec.get("login") or "").lower()
    return login.startswith(EXAMPLE_PREFIX) or login.startswith(("lotin harflari", "bo‘sh qolsa", "bo'sh qolsa"))


def credentials_xlsx(items: list[dict], title: str = "Login va parollar") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Hisoblar"
    head = ["F.I.Sh.", "Login", "Parol", "Guruh / lavozim", "Pochta"]
    for c, t in enumerate(head, start=1):
        cell = ws.cell(row=1, column=c, value=t)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor=ACCENT)
    for r, it in enumerate(items, start=2):
        for c, k in enumerate(("name", "login", "password", "extra", "mail"), start=1):
            ws.cell(row=r, column=c, value=it.get(k, ""))
    for c, w in enumerate((32, 20, 16, 24, 30), start=1):
        ws.column_dimensions[get_column_letter(c)].width = w
    ws.freeze_panes = "A2"
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
