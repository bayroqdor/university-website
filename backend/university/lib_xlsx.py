"""Kutubxona Excel fayllari: fondni ko'chirish uchun namuna (shablon) va import (xlsx yoki csv), hisobotlar eksporti."""
from __future__ import annotations

import csv
import io
import re
from datetime import datetime

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ACCENT = "0F3D8C"

# ustun kaliti → (sarlavha, kenglik, izoh)
COLS = [
    ("title", "Nomi *", 36, "kitob nomi"),
    ("authors", "Muallif(lar)", 28, "bir nechta bo'lsa nuqtali vergul bilan: Karimov A.; Saidova N."),
    ("isbn", "ISBN", 18, "978-... (bo'lsa — bir xil ISBN'li kitobga nusxalar qo'shiladi)"),
    ("publisher", "Nashriyot", 22, ""),
    ("year", "Yil", 8, "2021"),
    ("lang", "Til", 8, "uz, ru, en, kaa, tr, de"),
    ("pages", "Sahifalar", 10, ""),
    ("categories", "Fan / janr", 24, "bir nechta: nuqtali vergul"),
    ("faculties", "Fakultet(lar)", 24, "bir nechta: nuqtali vergul"),
    ("keywords", "Kalit so'zlar", 24, "nuqtali vergul bilan"),
    ("udc", "UDK", 12, ""),
    ("bbk", "BBK", 12, ""),
    ("annotation", "Annotatsiya", 40, "qisqa mazmun"),
    ("price", "Narxi", 10, "so'm (yo'qolganda jarima uchun)"),
    ("copies", "Nusxalar soni", 12, "inventar raqamlari berilmasa — avtomatik (UNI-000123)"),
    ("invs", "Inventar raqamlari", 26, "ixtiyoriy: 10231; 10232; 10233"),
    ("location", "Joylashuv", 16, "zal / javon: A-3"),
    ("cover", "Muqova (URL)", 26, "ixtiyoriy"),
]

ALIASES = {
    "title": ("nomi", "nom", "название", "title", "kitob", "sarlavha"),
    "authors": ("muallif", "автор", "author", "mualliflar"),
    "isbn": ("isbn",),
    "publisher": ("nashriyot", "издательство", "publisher"),
    "year": ("yil", "год", "year", "nashr yili"),
    "lang": ("til", "язык", "language", "lang"),
    "pages": ("sahifa", "страниц", "pages", "bet"),
    "categories": ("fan", "janr", "предмет", "жанр", "category", "subject", "kategoriya"),
    "faculties": ("fakultet", "факультет", "faculty"),
    "keywords": ("kalit", "ключев", "keywords", "teg"),
    "udc": ("udk", "удк", "udc"),
    "bbk": ("bbk", "ббк"),
    "annotation": ("annotatsiya", "аннотация", "annotation", "tavsif", "mazmun"),
    "price": ("narx", "цена", "price"),
    "copies": ("nusxa", "количество", "экз", "copies", "soni"),
    "invs": ("inventar", "инвентар", "inventory", "inv"),
    "location": ("joylashuv", "javon", "место", "полка", "location", "shelf"),
    "cover": ("muqova", "обложка", "cover"),
}

EXAMPLES = [
    ["Umumiy fizika", "Karimov A.; Saidova N.", "978-9943-11-001-2", "O'qituvchi", 2021, "uz", 320,
     "Fizika; Mexanika", "Amaliy fanlar", "mexanika; termodinamika; optika", "530.1", "36", "Fizika asoslari va laboratoriya ishlari.", 85000, 5, "", "A-3"],
    ["Dasturlash asoslari", "Rahimov B.; Yusupova D.", "", "Fan va texnologiya", 2020, "uz", 280, "Informatika",
     "Dasturiy injiniring", "algoritmlar; python; dasturlash", "004.4", "36", "", 95000, 3, "10231; 10232; 10233", "B-1"],
]


def template() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Fond"
    ws.append([c[1] for c in COLS])
    ws.append([c[3] for c in COLS])
    for row in EXAMPLES:
        ws.append(row)
    for i, c in enumerate(COLS, 1):
        ws.column_dimensions[get_column_letter(i)].width = c[2]
        h = ws.cell(1, i)
        h.font = Font(bold=True, color="FFFFFF")
        h.fill = PatternFill("solid", fgColor=ACCENT)
        h.alignment = Alignment(vertical="center", wrap_text=True)
        hint = ws.cell(2, i)
        hint.font = Font(italic=True, color="6B7891", size=9)
        hint.alignment = Alignment(wrap_text=True, vertical="top")
    ws.row_dimensions[1].height = 30
    ws.row_dimensions[2].height = 42
    ws.freeze_panes = "A3"
    g = wb.create_sheet("Yo'riqnoma")
    for line in (
        "Kutubxona fondini Excel orqali ko'chirish",
        "",
        "1. «Fond» varag'ida har qator — bitta kitob (nashr). 2-qator (kulrang izohlar) va namuna qatorlarni o'chirib, o'z ro'yxatingizni kiriting.",
        "2. Faqat «Nomi» majburiy. ISBN bo'lsa va fondda shu ISBN'li kitob mavjud bo'lsa — yangi kitob ochilmaydi, nusxalar qo'shiladi.",
        "3. «Nusxalar soni» — qog'oz nusxalar. Inventar raqamlari berilmasa tizim o'zi beradi (UNI-000123); berilsa — nuqtali vergul bilan.",
        "4. Bir nechta muallif, fan, fakultet, kalit so'z — nuqtali vergul (;) bilan.",
        "5. CSV fayl ham qabul qilinadi (UTF-8, vergul yoki nuqtali vergul bilan ajratilgan, birinchi qator — sarlavhalar).",
        "6. Import tugagach natija: qo'shilgan kitoblar, nusxalar va o'tkazib yuborilgan qatorlar sababi bilan ko'rsatiladi.",
    ):
        g.append([line])
    g.column_dimensions["A"].width = 130
    g["A1"].font = Font(bold=True, size=14, color=ACCENT)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _norm(v) -> str:
    return re.sub(r"[\s*]+", " ", str(v or "")).strip().lower().replace("ʻ", "'").replace("‘", "'").replace("’", "'")


class SheetError(ValueError):
    pass


def read_rows(raw: bytes, filename: str = "") -> list[dict]:
    rows: list[list] = []
    if raw[:4] == b"PK\x03\x04":
        try:
            wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        except Exception as e:  # noqa: BLE001
            raise SheetError("xlsx_bad") from e
        ws = wb.worksheets[0]
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
    else:
        text = raw.decode("utf-8-sig", "ignore")
        if not text.strip():
            raise SheetError("empty")
        dialect = csv.Sniffer().sniff(text[:4000], delimiters=",;\t") if text.strip() else csv.excel
        rows = [list(r) for r in csv.reader(io.StringIO(text), dialect)]
    header_idx, mapping = None, {}
    for hi, row in enumerate(rows[:10]):
        m = {}
        for ci, v in enumerate(row):
            n = _norm(v)
            if not n:
                continue
            for key, aliases in ALIASES.items():
                if key not in m and any(n.startswith(a) or a in n for a in aliases):
                    m[key] = ci
                    break
        if "title" in m:
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
                v = v.year
            rec[key] = str(v).strip() if v is not None else ""
        if not any(rec.get(k) for k in mapping):
            continue
        # namuna fayldagi izoh qatori
        if rec.get("title", "").lower() in ("kitob nomi",):
            continue
        out.append(rec)
    return out


def table(title: str, headers: list[str], rows: list[list], widths: list[int] | None = None) -> bytes:
    """Oddiy hisobot: sarlavha qatori, ma'lumotlar, kengliklar, muzlatilgan sarlavha."""
    wb = Workbook()
    ws = wb.active
    ws.title = re.sub(r"[\\/*?:\[\]]", "", title)[:30] or "Hisobot"
    ws.append([title])
    ws["A1"].font = Font(bold=True, size=13, color=ACCENT)
    ws.append([f"Yaratildi: {datetime.now().strftime('%d.%m.%Y %H:%M')}"])
    ws["A2"].font = Font(italic=True, color="6B7891", size=9)
    ws.append([])
    ws.append(headers)
    for i, _h in enumerate(headers, 1):
        c = ws.cell(4, i)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=ACCENT)
        ws.column_dimensions[get_column_letter(i)].width = (widths[i - 1] if widths and i <= len(widths) else 18)
    for r in rows:
        ws.append(r)
    ws.freeze_panes = "A5"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
