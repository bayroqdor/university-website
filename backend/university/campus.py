"""Talabalar hayoti va abituriyent bo'limlari: sahifa sozlamalari, ko'rinish qoidalari,
o'tish ballari (kalkulyator) va ularning Excel import/eksporti.

Kontent turlari — campus_schema.py (items jadvali). Bo'lim saytda faqat mazmuni bo'lsa ko'rinadi (`visible`): bo'sh bo'lim menyu, bosh sahifa,
sayt xaritasi va qidiruvda chiqmaydi, sahifasi 404 qaytaradi.
"""
from __future__ import annotations

import difflib
import io
import math
import re
import secrets
from datetime import datetime, timezone

from .campus_schema import FORMS, photo_l
from .content import LANGS, _str, safe_url

KV = "campus"
SCORES_KV = "admission_scores"
SEED_KV = "campus_seed_v1"
MAX_SCORE = 189  # milliy test tizimi: 5 fan bo'yicha eng yuqori ball (admin «Kalkulyator» sozlamasida o'zgartiradi)
GEO = {"lat": 40.3864, "lon": 71.7864, "zoom": 17}  # seo.GEO bilan bir xil (institut manzili)

# ------------------------------------------------------------------ sahifa sozlamalari
# (tur, ...): ltext n — til → matn; lhtml n — til → HTML; lpairs (k1, k2) limit — til → [{k1, k2}]; bool; int lo hi; float lo hi; url; str n; ids n
SPEC: dict[str, dict[str, tuple]] = {
    "life": {"intro": ("ltext", 800)},
    "clubs": {"intro": ("ltext", 800)},
    "sport": {"intro": ("ltext", 800)},
    "dormitory": {"intro": ("ltext", 1500), "rules": ("lhtml", 200_000), "steps": ("lpairs", ("title", "text"), 12), "faq": ("lpairs", ("q", "a"), 30),
                  "apply_open": ("bool",), "photo": ("url",), "photo_alt": ("ltext", 300), "contact_ids": ("ids", 6)},
    "scholarships": {"intro": ("ltext", 800)},
    "gallery": {"intro": ("ltext", 800)},
    "steps": {"intro": ("ltext", 800)},
    "calculator": {"intro": ("ltext", 800), "max_score": ("int", 1, 1000)},
    "parents": {"intro": ("lhtml", 100_000), "pay": ("lhtml", 100_000), "faq": ("lpairs", ("q", "a"), 30), "contact_ids": ("ids", 8)},
    "map": {"image": ("url",), "image_alt": ("ltext", 300), "lat": ("float", -90, 90), "lon": ("float", -180, 180), "zoom": ("int", 10, 19)},
    "tour": {"intro": ("ltext", 800), "first_scene": ("str", 40)},
}
# admin API yo'li (ruxsat): /api/admin/life/… — student_life, /api/admin/gallery/… — gallery, /api/admin/applicant/… — admission
GROUP = {"life": "life", "clubs": "life", "sport": "life", "dormitory": "life", "scholarships": "life", "gallery": "gallery",
         "steps": "applicant", "calculator": "applicant", "parents": "applicant", "map": "applicant", "tour": "applicant"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _default(spec: tuple):
    t = spec[0]
    return {} if t in ("ltext", "lhtml", "lpairs") else False if t == "bool" else [] if t == "ids" else "" if t in ("url", "str") else None


def _clean(spec: tuple, v):
    t = spec[0]
    if t in ("ltext", "lhtml"):
        n = spec[1]
        src = v if isinstance(v, dict) else {}
        out = {}
        for lang in LANGS:
            x = str(src.get(lang) or "").strip()[:n]
            if t == "lhtml" and not re.sub(r"<[^>]+>|&nbsp;|\s", "", x) and "<img" not in x:
                x = ""  # muharrirning bo'sh «<p></p>» — bo'sh
            if x:
                out[lang] = x
        return out
    if t == "lpairs":
        keys, limit = spec[1], spec[2]
        out = {}
        for lang in LANGS:
            rows = []
            for r in ((v or {}).get(lang) or [])[:limit] if isinstance(v, dict) else []:
                if isinstance(r, dict):
                    c = {k: str(r.get(k) or "").strip()[: (300 if i == 0 else 3000)] for i, k in enumerate(keys)}
                    if c[keys[0]]:
                        rows.append(c)
            if rows:
                out[lang] = rows
        return out
    if t == "bool":
        return bool(v)
    if t in ("int", "float"):
        try:
            x = float(v)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(x) or not spec[1] <= x <= spec[2]:
            return None
        return int(x) if t == "int" else x
    if t == "url":
        return safe_url(v)
    if t == "str":
        return _str(v, spec[1])
    if t == "ids":
        return [s for s in (_str(x, 40) for x in (v or [])[: spec[1]] if isinstance(v, list)) if s]
    return None


def settings(st, section: str) -> dict:
    raw = (st.kv_get(KV) or {}).get(section) or {}
    return {k: raw.get(k, _default(spec)) for k, spec in SPEC[section].items()}


def save_settings(st, section: str, data: dict) -> dict:
    cur = settings(st, section)
    for k, spec in SPEC[section].items():
        if k in data:
            cur[k] = _clean(spec, data[k])
    allv = dict(st.kv_get(KV) or {})
    allv[section] = cur
    st.kv_put(KV, allv)
    return cur


def pick(m: dict | None, lang: str, base: str = "uz"):
    """Til → qiymat lug'atidan tanlangan til (bo'lmasa — asosiy til, so'ng mavjud birinchisi)."""
    if not isinstance(m, dict) or not m:
        return m if m not in ({}, None) else ""
    for x in (lang, base, *LANGS):
        if m.get(x):
            return m[x]
    return ""


def settings_l(st, section: str, lang: str, base: str) -> dict:
    s = settings(st, section)
    out = {}
    for k, v in s.items():
        t = SPEC[section][k][0]
        out[k] = (pick(v, lang, base) or ([] if t == "lpairs" else "")) if t in ("ltext", "lhtml", "lpairs") else v
    return out


# ------------------------------------------------------------------ ochiq ro'yxatlar va ko'rinish
def pub(svc, kind: str, lang: str | None = None) -> list[dict]:
    items = svc.st.list_items(kind, public=True)
    return [svc.loc(x, lang) for x in items] if lang else items


def photos_l(it: dict, lang: str) -> list[dict]:
    return [photo_l(p, lang) for p in it.get("photos") or []]


def _has_scores(svc) -> bool:
    progs = {p["id"] for p in svc.st.list_items("program", public=True)}
    return any(r.get("program_id") in progs and (r.get("grant") is not None or r.get("contract") is not None) for r in scores(svc.st)["rows"])


def visible(svc) -> dict[str, bool]:
    """Qaysi bo'limlarda saytda ko'rsatiladigan mazmun bor (bo'sh bo'lim — yashirin: menyu, bosh sahifa, sitemap, qidiruv, 404)."""
    st = svc.st
    by = st.list_items_of(("club", "achievement", "facility", "dorm", "scholarship", "album", "adm_step", "campus_spot", "tour_scene"), public=True)
    dorm = settings(st, "dormitory")
    mp = settings(st, "map")
    v = {
        "clubs": bool(by["club"]),
        "sport": any(c.get("category") == "sport" for c in by["club"]) or any(a.get("category") == "sport" for a in by["achievement"])
        or any(f.get("category") == "sport" for f in by["facility"]),
        "dormitory": bool(by["dorm"]) or bool(dorm.get("intro") or dorm.get("rules") or dorm.get("steps")),
        "scholarships": bool(by["scholarship"]),
        "gallery": any(a.get("photos") or a.get("videos") for a in by["album"]),
        "steps": bool(by["adm_step"]),
        "calculator": _has_scores(svc),
        "parents": True,  # institut haqida, narxlar, yotoqxona va aloqa — mavjud ma'lumotlardan yig'iladi
        "map": bool(by["campus_spot"]),
        "tour": any(s.get("panorama") for s in by["tour_scene"]),
    }
    v["life"] = any(v[k] for k in ("clubs", "sport", "dormitory", "scholarships", "gallery"))
    return v


# ------------------------------------------------------------------ qabul bosqichlari
def year_label(y: int) -> str:
    return f"{y}/{y + 1}"


def steps_public(svc, lang: str, year: int | None = None) -> dict:
    items = pub(svc, "adm_step", lang)
    years = sorted({int(x["year"]) for x in items if x.get("year")}, reverse=True)
    if not years:
        return {"years": [], "year": None, "steps": [], "current": None}
    adm = svc.site().get("admission_year")
    y = year if year in years else (adm if adm in years else years[0])
    rows = sorted([x for x in items if x.get("year") == y], key=lambda x: (x.get("starts") or "9999", x.get("sort") or 0))
    now = _now()
    current = None
    for i, x in enumerate(rows):
        a, b = x.get("starts") or "", x.get("ends") or x.get("starts") or ""
        x["state"] = "done" if b and b < now else "now" if a and a <= now and (not b or now <= b) else "next"
    # joriy bosqich: hozir davom etayotgani; bo'lmasa — eng yaqin keladigani (bosqichlar orasidagi kunlarda)
    current = next((i for i, x in enumerate(rows) if x["state"] == "now"), None)
    if current is None:
        current = next((i for i, x in enumerate(rows) if x["state"] == "next" and (x.get("starts") or "") > now), None)
    out = [{k: x.get(k) for k in ("id", "title", "summary", "starts", "ends", "url", "button", "state")} for x in rows]
    return {"years": [{"year": v, "label": year_label(v)} for v in years], "year": y, "label": year_label(y), "steps": out, "current": current, "now": now}


# ------------------------------------------------------------------ o'tish ballari va kvotalar (kalkulyator)
EDU_LANGS = ("uz", "ru", "en")


def _f(v) -> float | None:
    if v in (None, "", "-", "—", "–"):
        return None
    try:
        x = float(str(v).replace(",", ".").replace(" ", ""))
    except (TypeError, ValueError):
        return None
    return round(x, 2) if math.isfinite(x) and 0 <= x <= 1000 else None


def _i(v) -> int | None:
    x = _f(v)
    return int(x) if x is not None and x == int(x) and x <= 100_000 else None


def clean_row(r: dict) -> dict | None:
    if not isinstance(r, dict):
        return None
    try:
        year = int(r.get("year") or 0)
    except (TypeError, ValueError):
        return None
    if not 2000 <= year <= 2100 or r.get("form") not in FORMS:
        return None
    title, pid = _str(r.get("title"), 300), _str(r.get("program_id"), 40)
    if not title and not pid:
        return None
    return {"id": _str(r.get("id"), 20) or secrets.token_hex(5), "year": year, "program_id": pid, "title": title, "code": _str(r.get("code"), 20),
            "form": r["form"], "edu_lang": r.get("edu_lang") if r.get("edu_lang") in EDU_LANGS else "uz", "quota": _i(r.get("quota")),
            "quota_grant": _i(r.get("quota_grant")), "quota_contract": _i(r.get("quota_contract")), "grant": _f(r.get("grant")), "contract": _f(r.get("contract"))}


def scores(st) -> dict:
    v = st.kv_get(SCORES_KV) or {}
    return {"rows": v.get("rows") or [], "sources": v.get("sources") or {}, "updated": v.get("updated") or ""}


def save_scores(st, rows: list, sources: dict | None = None) -> dict:
    out, seen = [], set()
    for r in rows[:3000] if isinstance(rows, list) else []:
        c = clean_row(r)
        if not c:
            continue
        key = (c["year"], c["program_id"] or c["title"].casefold(), c["form"], c["edu_lang"])
        if key in seen:
            continue  # bir yil, yo'nalish, shakl va til — bitta qator
        seen.add(key)
        out.append(c)
    cur = scores(st)
    src = cur["sources"] if sources is None else {str(k): safe_url(u) for k, u in (sources or {}).items() if re.fullmatch(r"\d{4}", str(k)) and safe_url(u)}
    data = {"rows": out, "sources": src, "updated": _now()}
    st.kv_put(SCORES_KV, data)
    return data


def max_score(st) -> int:
    return settings(st, "calculator").get("max_score") or MAX_SCORE


def calc(svc, score: float, year: int | None, form: str = "", edu_lang: str = "", lang: str = "uz") -> dict:
    """Ball bo'yicha yo'nalishlar: grant / kontrakt uchun yetarli yoki necha ball yetmaydi (tanlangan yil o'tish ballari bo'yicha).

    Faqat saytda nashr qilingan yo'nalishga bog'langan qatorlar. Tartib: grant (zaxira ball katta → kichik), kontrakt, yetmaydi (farq kichik → katta),
    ma'lumot yo'q — oxirida."""
    st = svc.st
    mx = max_score(st)
    if score is None or not 0 <= score <= mx:
        raise ValueError("bad_score")
    progs = {p["id"]: svc.loc(p, lang) for p in st.list_items("program", public=True)}
    rows = [r for r in scores(st)["rows"] if r.get("program_id") in progs]
    years = sorted({r["year"] for r in rows}, reverse=True)
    if not years:
        return {"years": [], "year": None, "results": [], "max_score": mx}
    y = year if year in years else years[0]
    rows = [r for r in rows if r["year"] == y and (not form or r["form"] == form) and (not edu_lang or r["edu_lang"] == edu_lang)]
    from . import tuition as T  # noqa: PLC0415

    show_fees = T.shown(st)
    res = []
    for r in rows:
        g, c = r.get("grant"), r.get("contract")
        if g is not None and score >= g:
            status, gap = "grant", round(score - g, 1)
        elif c is not None and score >= c:
            status, gap = "contract", round(score - c, 1)
        elif g is not None or c is not None:
            need = min(x for x in (g, c) if x is not None)
            status, gap = "short", round(need - score, 1)
        else:
            status, gap = "nodata", None
        p = progs[r["program_id"]]
        fee = next((f["amount"] for f in p.get("fees") or [] if f.get("form") == r["form"]), None) if show_fees else None
        res.append({"id": r["id"], "program_id": p["id"], "title": p["title"], "slug": p.get("slug"), "form": r["form"], "edu_lang": r["edu_lang"],
                    "quota": r.get("quota"), "quota_grant": r.get("quota_grant"), "quota_contract": r.get("quota_contract"), "grant": g, "contract": c,
                    "status": status, "gap": gap, "fee": fee,
                    "grant_gap": round(g - score, 1) if g is not None and score < g else None})
    order = {"grant": 0, "contract": 1, "short": 2, "nodata": 3}
    res.sort(key=lambda x: (order[x["status"]], -(x["gap"] or 0) if x["status"] in ("grant", "contract") else (x["gap"] if x["gap"] is not None else 0), x["title"]))
    forms = sorted({r["form"] for r in scores(st)["rows"] if r.get("program_id") in progs and r["year"] == y}, key=FORMS.index)
    langs = sorted({r["edu_lang"] for r in scores(st)["rows"] if r.get("program_id") in progs and r["year"] == y}, key=EDU_LANGS.index)
    return {"years": [{"year": v, "label": year_label(v)} for v in years], "year": y, "label": year_label(y), "results": res, "max_score": mx,
            "forms": forms, "langs": langs, "source": scores(st)["sources"].get(str(y)) or "", "counts": {k: sum(1 for x in res if x["status"] == k) for k in order}}


def calc_meta(svc) -> dict:
    """Kalkulyator formasi uchun: yillar, shakllar va tillar (yil bo'yicha), eng yuqori ball."""
    st = svc.st
    progs = {p["id"] for p in st.list_items("program", public=True)}
    rows = [r for r in scores(st)["rows"] if r.get("program_id") in progs]
    years = sorted({r["year"] for r in rows}, reverse=True)
    by_year = {str(y): {"forms": sorted({r["form"] for r in rows if r["year"] == y}, key=FORMS.index),
                        "langs": sorted({r["edu_lang"] for r in rows if r["year"] == y}, key=EDU_LANGS.index)} for y in years}
    return {"years": [{"year": y, "label": year_label(y)} for y in years], "by_year": by_year, "max_score": max_score(st),
            "sources": {k: v for k, v in scores(st)["sources"].items() if int(k) in years}}


# ------------------------------------------------------------------ Excel: o'tish ballari
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
FORM_UZ = {"day": "kunduzgi", "extramural": "sirtqi", "evening": "kechki", "distance": "masofaviy", "second": "ikkinchi oliy"}
LANG_UZ = {"uz": "o‘zbek", "ru": "rus", "en": "ingliz"}
COLS = [("year", "Qabul yili", 11), ("code", "Shifr", 12), ("title", "Ta’lim yo‘nalishi", 46), ("form", "Ta’lim shakli", 14), ("edu_lang", "Ta’lim tili", 11),
        ("quota", "Kvota (jami)", 12), ("quota_grant", "Grant kvota", 12), ("quota_contract", "Kontrakt kvota", 14), ("grant", "O‘tish bali: grant", 16),
        ("contract", "O‘tish bali: kontrakt", 19)]
ALIASES = {
    "year": ("yil", "год", "year"), "code": ("shifr", "kod", "шифр", "код", "code"), "title": ("yo‘nalish", "yo'nalish", "yonalish", "направлен", "program", "nomi"),
    "form": ("shakl", "форма", "form", "mode"), "edu_lang": ("til", "язык", "language", "lang"),
    "quota_grant": ("grant kvota", "kvota grant", "квота грант", "grant quota"), "quota_contract": ("kontrakt kvota", "kvota kontrakt", "квота контракт", "contract quota"),
    "quota": ("kvota", "квота", "quota"), "grant": ("grant",), "contract": ("kontrakt", "контракт", "contract", "to‘lov", "to'lov"),
}
FORM_ALIASES = {"day": ("kunduzgi", "очная", "очн", "full", "day"), "extramural": ("sirtqi", "заочн", "part", "extramural"), "evening": ("kechki", "вечер", "evening"),
                "distance": ("masofa", "дистанц", "distance", "online"), "second": ("ikkinchi", "второе", "second")}
LANG_ALIASES = {"uz": ("o‘zbek", "o'zbek", "ozbek", "uzbek", "узбек", "uz"), "ru": ("rus", "рус", "russian", "ru"), "en": ("ingliz", "англ", "english", "en")}


def _norm(s: str) -> str:
    s = re.sub(r"[ʻʼ'`‘’]", "", str(s or "").lower())
    return re.sub(r"[^\wа-яё]+", " ", s).strip()


def _program_index(st) -> list[tuple[dict, list[str]]]:
    out = []
    for p in st.list_items("program"):
        names = [p.get("title") or ""] + [str((tr or {}).get("title") or "") for tr in (p.get("i18n") or {}).values()]
        out.append((p, [_norm(n) for n in names if n]))
    return out


def match_program(index, title: str, code: str = "") -> str:
    """Excel'dagi yo'nalish nomi (yoki shifri) bo'yicha saytdagi yo'nalish: shifr → aynan nom → o'xshashlik ≥ 0.86."""
    if code:
        for p, _n in index:
            if p.get("code") and str(p["code"]).strip() == code.strip():
                return p["id"]
    t = _norm(title)
    if not t:
        return ""
    best, score = "", 0.0
    for p, names in index:
        for n in names:
            if n == t:
                return p["id"]
            r = difflib.SequenceMatcher(None, n, t).ratio()
            if r > score:
                best, score = p["id"], r
    return best if score >= 0.86 else ""


def scores_xlsx(st, year: int | None = None) -> bytes:
    from openpyxl import Workbook  # noqa: PLC0415
    from openpyxl.styles import Alignment, Font, PatternFill  # noqa: PLC0415
    from openpyxl.utils import get_column_letter  # noqa: PLC0415

    progs = {p["id"]: p for p in st.list_items("program")}
    rows = [r for r in scores(st)["rows"] if not year or r["year"] == year]
    rows.sort(key=lambda r: (-r["year"], FORMS.index(r["form"]), (progs.get(r["program_id"]) or {}).get("title") or r["title"], r["edu_lang"]))
    wb = Workbook()
    ws = wb.active
    ws.title = "O‘tish ballari"
    ws.append([c[1] for c in COLS])
    for i, (_k, _h, w) in enumerate(COLS, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
        c = ws.cell(1, i)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="0A2E73")
        c.alignment = Alignment(vertical="center", wrap_text=True)
    for r in rows:
        p = progs.get(r["program_id"]) or {}
        ws.append([r["year"], r.get("code") or p.get("code") or "", p.get("title") or r["title"], FORM_UZ[r["form"]], LANG_UZ.get(r["edu_lang"], r["edu_lang"]),
                   r.get("quota"), r.get("quota_grant"), r.get("quota_contract"), r.get("grant"), r.get("contract")])
    ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _alias(v: str, table: dict) -> str:
    n = str(v or "").strip().lower()
    for k, al in table.items():
        if any(a in n for a in al):
            return k
    return n if n in table else ""


def parse_scores_xlsx(st, raw: bytes, default_year: int | None = None) -> dict:
    """Excel (yoki CSV) → qatorlar. Sarlavha qatori ustun nomlari bo'yicha aniqlanadi (o'zbek/rus/ingliz); «-» — ball yo'q.
    Qaytadi: {rows, unmatched: [nomlar], skipped: n}."""
    from openpyxl import load_workbook  # noqa: PLC0415

    try:
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except Exception as e:  # noqa: BLE001
        raise ValueError("bad_xlsx") from e
    index = _program_index(st)
    out, unmatched, skipped = [], [], 0
    for ws in wb.worksheets:
        grid = [["" if v is None else (str(int(v)) if isinstance(v, float) and v.is_integer() else str(v)).strip() for v in r] for r in ws.iter_rows(values_only=True)]
        head_i, cols = None, {}
        for i, r in enumerate(grid[:15]):
            found = {}
            for j, cell in enumerate(r):
                low = cell.lower()
                for key in ("quota_grant", "quota_contract", "year", "code", "title", "form", "edu_lang", "quota", "grant", "contract"):
                    if key not in found and any(a in low for a in ALIASES[key]):
                        if key in ("grant", "contract") and any(a in low for a in ALIASES["quota"]):
                            continue
                        found[key] = j
                        break
            if "title" in found and ("contract" in found or "grant" in found):
                head_i, cols = i, found
                break
        if head_i is None:
            continue
        for r in grid[head_i + 1:]:
            if not any(r):
                continue
            g = lambda k: r[cols[k]] if k in cols and cols[k] < len(r) else ""  # noqa: E731
            title = g("title")
            form = _alias(g("form"), FORM_ALIASES)
            try:
                year = int(float(g("year"))) if g("year") else default_year
            except ValueError:
                year = default_year
            if not title or not form or not year:
                skipped += 1
                continue
            pid = match_program(index, title, g("code"))
            if not pid and title not in unmatched:
                unmatched.append(title)
            row = clean_row({"year": year, "program_id": pid, "title": title, "code": g("code"), "form": form, "edu_lang": _alias(g("edu_lang"), LANG_ALIASES) or "uz",
                             "quota": g("quota"), "quota_grant": g("quota_grant"), "quota_contract": g("quota_contract"), "grant": g("grant"), "contract": g("contract")})
            if row:
                out.append(row)
            else:
                skipped += 1
    if not out:
        raise ValueError("empty_xlsx")
    return {"rows": out, "unmatched": unmatched, "skipped": skipped}


def merge_rows(cur: list[dict], new: list[dict], replace_years: bool = True) -> list[dict]:
    """Import: yuklangan yillar butunlay almashtiriladi (replace_years) yoki kalit bo'yicha yangilanadi."""
    years = {r["year"] for r in new}
    base = [r for r in cur if not (replace_years and r["year"] in years)]
    key = lambda r: (r["year"], r.get("program_id") or r.get("title", "").casefold(), r["form"], r["edu_lang"])  # noqa: E731
    pos = {key(r): i for i, r in enumerate(base)}
    for r in new:
        if key(r) in pos:
            base[pos[key(r)]] = {**r, "id": base[pos[key(r)]]["id"]}
        else:
            pos[key(r)] = len(base)
            base.append(r)
    return base


def ensure_seed(svc) -> None:
    """Stock rejimda boshlang'ich kampus ma'lumotlari bo'sh — admin paneldan to'ldiriladi."""
    st = svc.st
    if st.kv_get(SEED_KV) is None:
        st.kv_put(SEED_KV, True)


# ------------------------------------------------------------------ murojaatlar bo'limlari (service desk)
DESK = {"clubs": ("Klublar", "#7c3aed"), "dorm": ("Yotoqxona", "#0d9488")}


def ensure_desk() -> dict[str, str]:
    """«Klublar» va «Yotoqxona» bo'limlari (idempotent): avval saqlangan id, so'ng nom bo'yicha, bo'lmasa — yaratiladi."""
    from .api.desk import _desk  # noqa: PLC0415
    from .api.deps import svc  # noqa: PLC0415

    st = svc().st
    d = _desk()
    known = dict(st.kv_get("campus_desk") or {})
    cats = d.categories()
    out = {}
    for key, (title, color) in DESK.items():
        c = next((x for x in cats if x["id"] == known.get(key)), None) or next((x for x in cats if x["title"].strip().lower() == title.lower()), None)
        if not c:
            c = d.save_category({"title": title, "color": color, "mailbox": "", "sort": 80 + len(out)})
        out[key] = c["id"]
    if out != known:
        st.kv_put("campus_desk", out)
    return out
