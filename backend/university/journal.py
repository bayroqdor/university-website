"""Ilmiy jurnal: sozlamalar, sonlar (issues), maqolalar, iqtiboslar (APA, ГОСТ, MLA, BibTeX, RIS), Google Scholar meta teglari,
server tomonida chiqariladigan sahifa (JavaScript bajarmaydigan botlar uchun), sitemap va sayt qidiruvi.

Ma'lumotlar:
  kv["journal"]       — jurnal sozlamalari (nomi, ISSN, nashriyot, tahrir hay'ati, rubrikalar, sahifalar matni, litsenziya, indekslash…)
  journal_issues      — sonlar: jild (volume), raqam (number), yil, nashr sanasi, holat (draft | published), data (JSON: nomi, muqova, PDF)
  journal_articles    — maqolalar: num (URL'dagi o'zgarmas raqam), slug (birinchi e'londan keyin o'zgarmaydi), son, holat, data (JSON)
  journal_hits        — ko'rish/yuklab olish hisoblagichi (kunlik noyob tashrif; botlar hisoblanmaydi)

Ochiq URL'lar (o'zgarmas):
  /journal, /journal/archive, /journal/issue/<jild>-<raqam>, /journal/article/<num>/<slug>, /journal/pdf/<num>/<slug>.pdf,
  /journal/issue-pdf/<jild>-<raqam>.pdf, /journal/cite/<num>.bib|.ris, /journal/oai (OAI-PMH 2.0), /journal/about (jurnal haqida, tahrir hay'ati, siyosatlar, aloqa — bitta sahifa),
  /journal/guidelines (mualliflarga), /journal/submit. Eski /journal/board, /ethics… va /journal/search — 301 (legacy_redirect).
Maqola faqat o'zi ham, soni ham «published» bo'lsa va jurnal yoqilgan bo'lsa ko'rinadi.

Ko'rib chiqish rejimi (preview): «journal» ruxsatli admin (uni_admin cookie) yashirin jurnalni, qoralama son va maqolalarni saytda
ko'radi (noindex; ochiq tashrif buyuruvchiga — 404). Sabablar va tuzatish havolalari — *_reasons(); admin paneldagi holat — diagnose().
"""
from __future__ import annotations

import io
import json
import re
import unicodedata
import uuid
from datetime import date, datetime, timezone
from html import escape

from .content import LANGS, slugify

KV = "journal"
ROUTE = "/journal"
LICENSES = {
    "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
    "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
    "CC BY-NC 4.0": "https://creativecommons.org/licenses/by-nc/4.0/",
    "CC BY-NC-SA 4.0": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    "CC BY-ND 4.0": "https://creativecommons.org/licenses/by-nd/4.0/",
    "CC BY-NC-ND 4.0": "https://creativecommons.org/licenses/by-nc-nd/4.0/",
    "CC0 1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
}
DEFAULT_LICENSE = "CC BY 4.0"
# ochiq saytdagi ma'lumot sahifalari: URL qismi → sozlamadagi kalit
PAGES = {"about": "about", "guidelines": "guidelines", "peer-review": "peer_review", "ethics": "ethics", "open-access": "open_access", "contacts": "contacts"}
TEXTS = (*PAGES.values(), "cfp")
BOARD_ROLES = ("editor_in_chief", "deputy", "secretary", "member", "international")
STATUSES = ("draft", "published")
MB = 1024 * 1024
PDF_MAX = 80 * MB
SUBMIT_MAX = 20 * MB
DEFAULT: dict = {
    # enabled: None — admin hali hal qilmagan: nomi birinchi saqlanganda avtomatik yoqiladi (clean_settings)
    "enabled": None, "title": {}, "abbr": "", "issn_print": "", "issn_online": "", "publisher": {}, "founded": None, "frequency": {},
    "doi_prefix": "", "license": DEFAULT_LICENSE, "cover": "", "email": "", "submission_email": "", "phone": "", "address": {},
    "texts": {k: {} for k in TEXTS}, "indexing": [], "sections": [], "board": [], "submissions_open": True,
}

# ------------------------------------------------------------------ tarjimalar (server sahifasi, sitemap, iqtiboslar)
TX = {
    "uz": {"journal": "Ilmiy jurnal", "archive": "Arxiv", "about": "Jurnal haqida", "board": "Tahrir hay’ati", "guidelines": "Mualliflar uchun talablar",
           "peer-review": "Taqriz siyosati", "ethics": "Nashr etikasi", "open-access": "Ochiq kirish", "indexing": "Indekslash", "contacts": "Aloqa",
           "submit": "Maqola yuborish", "search": "Jurnal bo‘yicha qidiruv", "for_authors": "Mualliflarga", "license": "Litsenziya", "issue": "Son", "vol": "Jild", "no": "№", "pages": "Betlar", "abstract": "Annotatsiya",
           "keywords": "Kalit so‘zlar", "references": "Adabiyotlar", "pdf": "PDF (to‘liq matn)", "authors": "Mualliflar", "current": "Joriy son",
           "articles": "Maqolalar", "full_issue": "Sonning to‘liq PDF fayli"},
    "ru": {"journal": "Научный журнал", "archive": "Архив", "about": "О журнале", "board": "Редакционная коллегия", "guidelines": "Требования к авторам",
           "peer-review": "Политика рецензирования", "ethics": "Публикационная этика", "open-access": "Открытый доступ", "indexing": "Индексирование",
           "contacts": "Контакты", "submit": "Отправить статью", "search": "Поиск по журналу", "for_authors": "Авторам", "license": "Лицензия", "issue": "Выпуск", "vol": "Т.", "no": "№", "pages": "Страницы",
           "abstract": "Аннотация", "keywords": "Ключевые слова", "references": "Литература", "pdf": "PDF (полный текст)", "authors": "Авторы",
           "current": "Текущий выпуск", "articles": "Статьи", "full_issue": "Полный PDF выпуска"},
    "en": {"journal": "Scientific journal", "archive": "Archive", "about": "About the journal", "board": "Editorial board", "guidelines": "Author guidelines",
           "peer-review": "Peer review policy", "ethics": "Publication ethics", "open-access": "Open access", "indexing": "Indexing", "contacts": "Contacts",
           "submit": "Submit a manuscript", "search": "Search the journal", "for_authors": "For authors", "license": "License", "issue": "Issue", "vol": "Vol.", "no": "No.", "pages": "Pages", "abstract": "Abstract",
           "keywords": "Keywords", "references": "References", "pdf": "PDF (full text)", "authors": "Authors", "current": "Current issue",
           "articles": "Articles", "full_issue": "Full issue PDF"},
}
# jurnal menyusi — 4 bo'lim: bosh sahifa, arxiv, «Jurnal haqida» (bitta sahifa, bo'limlar langarlari bilan), «Mualliflarga»
INFO_PAGES = ("about", "guidelines", "submit")
# «Jurnal haqida» sahifasidagi bo'limlar (langar = eski alohida sahifa manzili): /journal/<eski> → 301 /journal/about#<langar>
ABOUT_ANCHORS = ("about", "board", "peer-review", "ethics", "open-access", "indexing", "contacts")
LEGACY = frozenset(ABOUT_ANCHORS[1:])


def tx(lang: str) -> dict:
    return TX.get(lang) or TX["en"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _s(v, n: int) -> str:
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", str(v if v is not None else "")).strip()[:n]


def _t(v, n: int) -> str:
    """Ko'p qatorli matn: qatorlar saqlanadi, boshqaruv belgilari olib tashlanadi."""
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", str(v if v is not None else "")).replace("\r\n", "\n").replace("\r", "\n")
    return s.strip()[:n]


def _l(v, n: int, multiline: bool = False) -> dict:
    """{uz, ru, en} — bo'sh tillar tashlanadi."""
    f = _t if multiline else _s
    return {lang: f((v or {}).get(lang), n) for lang in LANGS if isinstance(v, dict) and f((v or {}).get(lang), n)}


def pick(v: dict | None, lang: str, base: str = "uz") -> str:
    """Tanlangan til → asosiy til → istalgan to'ldirilgan til."""
    if not isinstance(v, dict) or not v:
        return ""
    return v.get(lang) or v.get(base) or next((x for x in v.values() if x), "")


def _date(v) -> str:
    """YYYY-MM-DD yoki bo'sh."""
    s = _s(v, 40)[:10]
    try:
        return date.fromisoformat(s).isoformat() if s else ""
    except ValueError:
        return ""


def _url(v) -> str:
    v = _s(v, 1000)
    if v.lower().startswith(("http://", "https://")) or (v.startswith("/") and not v.startswith("//")):
        return v
    return ""


# ------------------------------------------------------------------ identifikatorlar: ISSN, ORCID, DOI
def norm_issn(v: str) -> str:
    """«12345679» / «1234-5679» → «1234-5679»; nazorat raqami noto'g'ri bo'lsa — ValueError."""
    s = re.sub(r"[\s\-–]", "", str(v or "")).upper()
    if not s:
        return ""
    if not re.fullmatch(r"\d{7}[\dX]", s):
        raise ValueError("invalid_issn")
    total = sum((8 - i) * int(c) for i, c in enumerate(s[:7]))
    check = (11 - total % 11) % 11
    if s[7] != ("X" if check == 10 else str(check)):
        raise ValueError("invalid_issn")
    return f"{s[:4]}-{s[4:]}"


def norm_orcid(v: str) -> str:
    """https://orcid.org/0000-0002-1825-0097 yoki 0000000218250097 → 0000-0002-1825-0097; noto'g'ri — ValueError."""
    s = str(v or "").strip()
    s = re.sub(r"^(https?://)?(www\.)?orcid\.org/", "", s, flags=re.I)
    s = re.sub(r"[\s\-]", "", s).upper()
    if not s:
        return ""
    if not re.fullmatch(r"\d{15}[\dX]", s):
        raise ValueError("invalid_orcid")
    total = 0
    for c in s[:15]:
        total = (total + int(c)) * 2
    check = (12 - total % 11) % 11
    if s[15] != ("X" if check == 10 else str(check)):
        raise ValueError("invalid_orcid")
    return "-".join(s[i:i + 4] for i in range(0, 16, 4))


def norm_doi(v: str) -> str:
    s = str(v or "").strip()
    s = re.sub(r"^(https?://)?(dx\.)?doi\.org/", "", s, flags=re.I)
    s = re.sub(r"^doi:\s*", "", s, flags=re.I).strip()
    if not s:
        return ""
    if not re.fullmatch(r"10\.\d{4,9}/\S{1,300}", s):
        raise ValueError("invalid_doi")
    return s


# ------------------------------------------------------------------ oddiy matn → xavfsiz HTML (sahifalar, annotatsiya)
_URL_RE = re.compile(r"(https?://[^\s<>\"']+[^\s<>\"'.,;:!?)\]])")
_UL = re.compile(r"^\s*[-•*]\s+")
_OL = re.compile(r"^\s*\d{1,3}[.)]\s+")
_MAIL_RE = re.compile(r"(?<![\w.@/])([\w.+-]+@[\w-]+(?:\.[\w-]+)+)")


def _inline(s: str) -> str:
    s = escape(s, quote=True)
    s = _URL_RE.sub(lambda m: f'<a href="{m.group(1)}">{m.group(1)}</a>', s)
    s = _MAIL_RE.sub(lambda m: f'<a href="mailto:{m.group(1)}">{m.group(1)}</a>', s)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)


def text_html(text: str, headings: bool = True) -> str:
    """Bo'sh qator — yangi xatboshi; «- » bilan boshlangan qatorlar — ro'yxat; «1. » — raqamli ro'yxat; «## » — sarlavha (h2), «### » — h3.
    Havola va email avtomatik havolaga aylanadi; **qalin**. Boshqa hech qanday HTML qabul qilinmaydi."""
    out = []
    for block in re.split(r"\n\s*\n", (text or "").strip()):
        lines = [x.rstrip() for x in block.split("\n") if x.strip()]
        if not lines:
            continue
        if headings and len(lines) == 1 and re.match(r"^#{2,3}\s+\S", lines[0]):
            lv = 3 if lines[0].startswith("###") else 2
            out.append(f"<h{lv}>{_inline(lines[0].lstrip('#').strip())}</h{lv}>")
            continue
        if all(_UL.match(x) for x in lines):
            out.append("<ul>" + "".join("<li>" + _inline(_UL.sub("", x)) + "</li>" for x in lines) + "</ul>")
            continue
        if all(_OL.match(x) for x in lines):
            out.append("<ol>" + "".join("<li>" + _inline(_OL.sub("", x)) + "</li>" for x in lines) + "</ol>")
            continue
        out.append("<p>" + "<br>".join(_inline(x.strip()) for x in lines) + "</p>")
    return "".join(out)


def plain(text: str, n: int = 300) -> str:
    s = re.sub(r"\s+", " ", re.sub(r"^#+\s*|\*\*", "", text or "", flags=re.M)).strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


# ------------------------------------------------------------------ sxema
def ensure_schema(st) -> None:
    with st._tx() as c:  # noqa: SLF001
        c.execute("CREATE TABLE IF NOT EXISTS journal_issues (id TEXT PRIMARY KEY, volume INTEGER NOT NULL, number INTEGER NOT NULL, year INTEGER NOT NULL, "
                  "status TEXT NOT NULL DEFAULT 'draft', published_on TEXT, data TEXT NOT NULL DEFAULT '{}', created TEXT NOT NULL, updated TEXT NOT NULL, "
                  "UNIQUE (volume, number))")
        c.execute("CREATE TABLE IF NOT EXISTS journal_articles (id TEXT PRIMARY KEY, num INTEGER NOT NULL UNIQUE, slug TEXT NOT NULL, issue_id TEXT, "
                  "status TEXT NOT NULL DEFAULT 'draft', sort INTEGER NOT NULL DEFAULT 0, published_on TEXT, data TEXT NOT NULL DEFAULT '{}', "
                  "views INTEGER NOT NULL DEFAULT 0, downloads INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL)")
        c.execute("CREATE INDEX IF NOT EXISTS journal_articles_issue ON journal_articles (issue_id)")
        c.execute("CREATE TABLE IF NOT EXISTS journal_hits (article_id TEXT NOT NULL, kind TEXT NOT NULL, vid TEXT NOT NULL, day TEXT NOT NULL, "
                  "PRIMARY KEY (article_id, kind, vid, day))")


def ready(st) -> None:
    if getattr(st, "_journal_ready", False):
        return
    ensure_schema(st)
    st._journal_ready = True  # noqa: SLF001


# ------------------------------------------------------------------ sozlamalar
def settings(st) -> dict:
    v = st.kv_get(KV) or {}
    out = {**json.loads(json.dumps(DEFAULT)), **v}
    out["texts"] = {k: (v.get("texts") or {}).get(k) or {} for k in TEXTS}
    return out


def _person(x: dict) -> dict | None:
    if not isinstance(x, dict) or not _s(x.get("name"), 200):
        return None
    try:
        orcid = norm_orcid(x.get("orcid"))
    except ValueError:
        raise ValueError("invalid_orcid") from None
    return {"id": _s(x.get("id"), 20) or uuid.uuid4().hex[:10], "name": _s(x.get("name"), 200), "role": x.get("role") if x.get("role") in BOARD_ROLES else "member",
            "position": _l(x.get("position"), 200), "affiliation": _s(x.get("affiliation"), 400), "degree": _s(x.get("degree"), 200),
            "country": _s(x.get("country"), 80), "orcid": orcid, "photo": _url(x.get("photo")), "staff_id": _s(x.get("staff_id"), 40),
            "email": _s(x.get("email"), 160)}


def clean_settings(data: dict, cur: dict) -> dict:
    out = dict(cur)
    if data.get("enabled") is not None:
        out["enabled"] = bool(data["enabled"])
    if "submissions_open" in data:
        out["submissions_open"] = bool(data["submissions_open"])
    for k, n in (("title", 300), ("publisher", 300), ("frequency", 120), ("address", 400)):
        if k in data:
            out[k] = _l(data[k], n)
    for k, n in (("abbr", 60), ("email", 160), ("submission_email", 160), ("phone", 60)):
        if k in data:
            out[k] = _s(data[k], n)
    for k in ("email", "submission_email"):
        if out.get(k) and not re.fullmatch(r"[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}", out[k]):
            raise ValueError("invalid_email")
    if "doi_prefix" in data:
        p = _s(data["doi_prefix"], 40).rstrip("/")
        if p and not re.fullmatch(r"10\.\d{4,9}", p):
            raise ValueError("invalid_doi_prefix")
        out["doi_prefix"] = p
    for k in ("issn_print", "issn_online"):
        if k in data:
            out[k] = norm_issn(data[k])
    if "founded" in data:
        try:
            y = int(data["founded"]) if data["founded"] not in (None, "") else None
        except (TypeError, ValueError):
            y = None
        out["founded"] = y if y and 1800 <= y <= 2100 else None
    if "license" in data:
        out["license"] = data["license"] if data["license"] in LICENSES else DEFAULT_LICENSE
    if "cover" in data:
        out["cover"] = _url(data["cover"])
    if isinstance(data.get("texts"), dict):
        out["texts"] = {k: _l(data["texts"].get(k), 60_000, multiline=True) for k in TEXTS}
    if isinstance(data.get("indexing"), list):
        out["indexing"] = [{"title": _s(x.get("title"), 120), "url": _url(x.get("url")), "logo": _url(x.get("logo"))}
                           for x in data["indexing"][:40] if isinstance(x, dict) and _s(x.get("title"), 120)]
    if isinstance(data.get("sections"), list):
        secs, seen = [], set()
        for x in data["sections"][:40]:
            if not isinstance(x, dict):
                continue
            title = _l(x.get("title"), 200)
            if not title:
                continue
            sid = re.sub(r"[^a-z0-9]", "", _s(x.get("id"), 20).lower()) or uuid.uuid4().hex[:8]
            if sid in seen:
                continue
            seen.add(sid)
            secs.append({"id": sid, "title": title})
        out["sections"] = secs
    if isinstance(data.get("board"), list):
        out["board"] = [p for p in (_person(x) for x in data["board"][:120]) if p]
    if out.get("enabled") is None and out.get("title"):
        out["enabled"] = True  # birinchi marta nom bilan saqlanganda — saytda ko'rinadi (admin o'chirib qo'ygan bo'lsa — tegilmaydi)
    return out


def enabled(st) -> bool:
    s = settings(st)
    return bool(s.get("enabled") and s.get("title"))


def journal_title(s: dict, lang: str, base: str) -> str:
    return pick(s.get("title"), lang, base)


# ------------------------------------------------------------------ sonlar
def _issue(r) -> dict:
    d = json.loads(r["data"] or "{}")
    return {"id": r["id"], "volume": r["volume"], "number": r["number"], "year": r["year"], "status": r["status"], "published_on": r["published_on"] or "",
            "title": d.get("title") or {}, "cover": d.get("cover") or "", "pdf": d.get("pdf") or "", "pdf_size": d.get("pdf_size") or 0,
            "created": r["created"], "updated": r["updated"], "key": f"{r['volume']}-{r['number']}"}


def issues(st, public: bool = False) -> list[dict]:
    ready(st)
    rows = st._q("SELECT * FROM journal_issues" + (" WHERE status='published'" if public else "") + " ORDER BY year DESC, volume DESC, number DESC")  # noqa: SLF001
    return [_issue(r) for r in rows]


def get_issue(st, iid: str) -> dict | None:
    ready(st)
    r = st._q("SELECT * FROM journal_issues WHERE id=%s", (iid,))  # noqa: SLF001
    return _issue(r[0]) if r else None


def issue_by_key(st, key: str, public: bool = True) -> dict | None:
    m = re.fullmatch(r"(\d{1,4})-(\d{1,4})", key or "")
    if not m:
        return None
    ready(st)
    r = st._q("SELECT * FROM journal_issues WHERE volume=%s AND number=%s" + (" AND status='published'" if public else ""), (int(m[1]), int(m[2])))  # noqa: SLF001
    return _issue(r[0]) if r else None


def save_issue(st, data: dict, iid: str | None = None) -> dict:
    ready(st)
    cur = get_issue(st, iid) if iid else None
    if iid and not cur:
        raise LookupError("not_found")

    def num(k, lo, hi):
        try:
            v = int(data.get(k) if k in data else (cur or {}).get(k))
        except (TypeError, ValueError):
            raise ValueError(f"invalid_{k}") from None
        if not lo <= v <= hi:
            raise ValueError(f"invalid_{k}")
        return v
    volume, number, year = num("volume", 1, 9999), num("number", 1, 999), num("year", 1900, 2100)
    status = data.get("status") if data.get("status") in STATUSES else (cur or {}).get("status") or "draft"
    if cur and cur["status"] == "published" and (volume, number) != (cur["volume"], cur["number"]) and status == "published":
        raise ValueError("issue_locked")  # e'lon qilingan sonning URL'i o'zgarmasin: avval qoralamaga qaytariladi
    pub_on = _date(data.get("published_on")) if "published_on" in data else (cur or {}).get("published_on") or ""
    if status == "published" and not pub_on:
        pub_on = date.today().isoformat()
    d = {"title": _l(data["title"], 300) if "title" in data else (cur or {}).get("title") or {},
         "cover": _url(data["cover"]) if "cover" in data else (cur or {}).get("cover") or "",
         "pdf": _media_pdf(data["pdf"]) if "pdf" in data else (cur or {}).get("pdf") or "",
         "pdf_size": int(data.get("pdf_size") or 0) if "pdf" in data else (cur or {}).get("pdf_size") or 0}
    now = _now()
    clash = st._q("SELECT id FROM journal_issues WHERE volume=%s AND number=%s AND id<>%s", (volume, number, iid or ""))  # noqa: SLF001
    if clash:
        raise ValueError("issue_exists")
    with st._tx() as c:  # noqa: SLF001
        if cur:
            c.execute("UPDATE journal_issues SET volume=%s, number=%s, year=%s, status=%s, published_on=%s, data=%s, updated=%s WHERE id=%s",
                      (volume, number, year, status, pub_on or None, json.dumps(d, ensure_ascii=False), now, iid))
        else:
            iid = uuid.uuid4().hex[:12]
            c.execute("INSERT INTO journal_issues (id, volume, number, year, status, published_on, data, created, updated) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                      (iid, volume, number, year, status, pub_on or None, json.dumps(d, ensure_ascii=False), now, now))
    return get_issue(st, iid)


def delete_issue(st, iid: str) -> None:
    ready(st)
    if st._q("SELECT 1 FROM journal_articles WHERE issue_id=%s LIMIT 1", (iid,)):  # noqa: SLF001
        raise ValueError("issue_not_empty")
    st.db.execute("DELETE FROM journal_issues WHERE id=%s", (iid,))


def _media_pdf(v) -> str:
    v = _s(v, 200)
    return v if re.fullmatch(r"/media/[a-f0-9]{16}\.pdf", v) else ""


# ------------------------------------------------------------------ maqolalar
def _pages_int(v) -> str:
    v = _s(v, 12)
    return v if re.fullmatch(r"[0-9]{1,6}|[ivxlcdmIVXLCDM]{1,10}|e[0-9]{1,8}", v) else ""


def _kw(v) -> list[str]:
    if isinstance(v, str):
        v = re.split(r"[;,\n]", v)
    seen, out = set(), []
    for x in (v or [])[:30]:
        x = _s(x, 120)
        if x and x.casefold() not in seen:
            seen.add(x.casefold())
            out.append(x)
    return out


def _author(x: dict, i: int) -> dict:
    given, family = _s(x.get("given"), 120), _s(x.get("family"), 120)
    if not family and not given:
        raise ValueError(f"author_name:{i}")
    try:
        orcid = norm_orcid(x.get("orcid"))
    except ValueError:
        raise ValueError(f"invalid_orcid:{i}") from None
    affs = x.get("affiliations")
    if isinstance(affs, str):
        affs = affs.split("\n")
    email = _s(x.get("email"), 160)
    if email and not re.fullmatch(r"[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}", email):
        raise ValueError(f"invalid_email:{i}")
    return {"given": given, "family": family, "given_en": _s(x.get("given_en"), 120), "family_en": _s(x.get("family_en"), 120),
            "affiliations": [a for a in (_s(y, 400) for y in (affs or [])[:6]) if a], "country": _s(x.get("country"), 80),
            "email": email, "orcid": orcid, "corresponding": bool(x.get("corresponding"))}


ART_FIELDS = ("issue_id", "section_id", "lang", "title", "title_i18n", "authors", "abstract", "keywords", "first_page", "last_page", "doi", "udc",
              "received", "revised", "accepted", "published_on", "pdf", "pdf_name", "pdf_size", "pdf_check", "references", "funding", "license", "status", "sort")


def clean_article(data: dict, cur: dict | None) -> dict:
    a = dict(cur or {})
    if "issue_id" in data:
        a["issue_id"] = _s(data["issue_id"], 40) or None
    if "section_id" in data:
        a["section_id"] = _s(data["section_id"], 20)
    if "lang" in data:
        lg = _s(data["lang"], 5).lower()
        a["lang"] = lg if re.fullmatch(r"[a-z]{2,3}", lg) else "uz"
    a.setdefault("lang", "uz")
    if "title" in data:
        a["title"] = _s(data["title"], 600)
    if "title_i18n" in data:
        a["title_i18n"] = {k: v for k, v in _l(data["title_i18n"], 600).items() if k != a["lang"]}
    if "authors" in data:
        a["authors"] = [_author(x, i) for i, x in enumerate((data["authors"] or [])[:40]) if isinstance(x, dict) and (x.get("family") or x.get("given"))]
    if "abstract" in data:
        a["abstract"] = {k: _t(v, 12_000) for k, v in (data["abstract"] or {}).items() if re.fullmatch(r"[a-z]{2,3}", str(k)) and _t(v, 12_000)} \
            if isinstance(data["abstract"], dict) else {}
    if "keywords" in data:
        a["keywords"] = {k: _kw(v) for k, v in (data["keywords"] or {}).items() if re.fullmatch(r"[a-z]{2,3}", str(k)) and _kw(v)} \
            if isinstance(data["keywords"], dict) else {}
    for k in ("first_page", "last_page"):
        if k in data:
            a[k] = _pages_int(data[k])
    if "doi" in data:
        a["doi"] = norm_doi(data["doi"])
    if "udc" in data:
        a["udc"] = _s(data["udc"], 80)
    for k in ("received", "revised", "accepted", "published_on"):
        if k in data:
            a[k] = _date(data[k])
    if "pdf" in data:
        a["pdf"] = _media_pdf(data["pdf"])
        a["pdf_name"] = _s(data.get("pdf_name"), 200)
        a["pdf_size"] = int(data.get("pdf_size") or 0) if str(data.get("pdf_size") or "0").isdigit() else 0
        if isinstance(data.get("pdf_check"), dict):
            pc = data["pdf_check"]
            a["pdf_check"] = {"pages": int(pc.get("pages") or 0), "has_text": bool(pc.get("has_text")), "encrypted": bool(pc.get("encrypted")),
                              "info_title": _s(pc.get("info_title"), 400), "first_text": _t(pc.get("first_text"), 3000)}
    if "references" in data:
        refs = data["references"]
        if isinstance(refs, str):
            refs = refs.split("\n")
        a["references"] = [r for r in (re.sub(r"^\s*\[?\d{1,3}[.)\]]\s+", "", _s(x, 2000)) for x in (refs or [])[:400]) if r]
    if "funding" in data:
        a["funding"] = _t(data["funding"], 3000)
    if "license" in data:
        a["license"] = data["license"] if data["license"] in LICENSES else ""
    if "status" in data:
        a["status"] = data["status"] if data["status"] in STATUSES else "draft"
    if "sort" in data:
        try:
            a["sort"] = int(data["sort"] or 0)
        except (TypeError, ValueError):
            a["sort"] = 0
    a.setdefault("status", "draft")
    if a.get("first_page") and a.get("last_page") and a["first_page"].isdigit() and a["last_page"].isdigit() and int(a["last_page"]) < int(a["first_page"]):
        raise ValueError("invalid_pages")
    return a


def publish_problems(a: dict) -> list[str]:
    """E'lon qilish uchun majburiy: sarlavha, kamida bitta muallif, son, PDF fayl, annotatsiya."""
    out = []
    if not a.get("title"):
        out.append("title")
    if not a.get("authors"):
        out.append("authors")
    if not a.get("issue_id"):
        out.append("issue")
    if not a.get("pdf"):
        out.append("pdf")
    if not (a.get("abstract") or {}):
        out.append("abstract")
    return out


def _article(r) -> dict:
    d = json.loads(r["data"] or "{}")
    return {**d, "id": r["id"], "num": r["num"], "slug": r["slug"], "issue_id": r["issue_id"], "status": r["status"], "sort": r["sort"],
            "published_on": r["published_on"] or "", "views": r["views"], "downloads": r["downloads"], "created": r["created"], "updated": r["updated"]}


def articles(st, issue_id: str | None = None, status: str = "", q: str = "") -> list[dict]:
    ready(st)
    sql, args = "SELECT * FROM journal_articles WHERE 1=1", []
    if issue_id:
        sql += " AND issue_id=%s"
        args.append(issue_id)
    if status in STATUSES:
        sql += " AND status=%s"
        args.append(status)
    rows = [_article(r) for r in st._q(sql, tuple(args))]  # noqa: SLF001
    if q:
        from .search import norm  # noqa: PLC0415

        nq = norm(q)
        rows = [a for a in rows if nq in norm(" ".join([a.get("title") or "", *(a.get("title_i18n") or {}).values(), *_author_names(a)]))]
    return sorted(rows, key=_order)


def _order(a: dict):
    fp = a.get("first_page") or ""
    return (a.get("issue_id") or "", a.get("sort") or 0, int(fp) if fp.isdigit() else 10**7, a.get("created") or "")


def get_article(st, aid: str) -> dict | None:
    ready(st)
    r = st._q("SELECT * FROM journal_articles WHERE id=%s", (aid,))  # noqa: SLF001
    return _article(r[0]) if r else None


def article_by_num(st, num) -> dict | None:
    try:
        n = int(num)
    except (TypeError, ValueError):
        return None
    if not 0 < n < 10**9:
        return None
    ready(st)
    r = st._q("SELECT * FROM journal_articles WHERE num=%s", (n,))  # noqa: SLF001
    return _article(r[0]) if r else None


def _slug_for(a: dict) -> str:
    t = (a.get("title_i18n") or {}).get("en") or a.get("title") or ""
    return slugify(t, 80) or "article"


def save_article(st, data: dict, aid: str | None = None) -> dict:
    ready(st)
    cur = get_article(st, aid) if aid else None
    if aid and not cur:
        raise LookupError("not_found")
    a = clean_article(data, cur)
    if a.get("issue_id") and not get_issue(st, a["issue_id"]):
        raise ValueError("invalid_issue")
    if a["status"] == "published":
        miss = publish_problems(a)
        if miss:
            raise ValueError("cannot_publish:" + ",".join(miss))
        if not a.get("published_on"):
            a["published_on"] = date.today().isoformat()
    # URL o'zgarmasligi: slug birinchi e'londan keyin qotiriladi
    locked = bool(cur and (cur.get("slug_locked") or cur["status"] == "published"))
    slug = cur["slug"] if locked else _slug_for(a)
    a["slug_locked"] = locked or a["status"] == "published"
    body = {k: v for k, v in a.items() if k not in ("id", "num", "slug", "issue_id", "status", "sort", "published_on", "views", "downloads", "created", "updated")}
    now = _now()
    with st._tx() as c:  # noqa: SLF001
        if cur:
            c.execute("UPDATE journal_articles SET slug=%s, issue_id=%s, status=%s, sort=%s, published_on=%s, data=%s, updated=%s WHERE id=%s",
                      (slug, a.get("issue_id"), a["status"], a.get("sort") or 0, a.get("published_on") or None, json.dumps(body, ensure_ascii=False), now, aid))
        else:
            aid = uuid.uuid4().hex[:12]
            c.execute("SELECT pg_advisory_xact_lock(hashtext('journal_articles_num'))")
            num = int(c.execute("SELECT COALESCE(MAX(num), 0) + 1 FROM journal_articles").fetchone()[0])
            c.execute("INSERT INTO journal_articles (id, num, slug, issue_id, status, sort, published_on, data, created, updated) "
                      "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                      (aid, num, slug, a.get("issue_id"), a["status"], a.get("sort") or 0, a.get("published_on") or None, json.dumps(body, ensure_ascii=False), now, now))
    return get_article(st, aid)


def delete_article(st, aid: str) -> None:
    ready(st)
    with st._tx() as c:  # noqa: SLF001
        c.execute("DELETE FROM journal_hits WHERE article_id=%s", (aid,))
        c.execute("DELETE FROM journal_articles WHERE id=%s", (aid,))


# ------------------------------------------------------------------ ochiq ko'rinish
def public_articles(st, issue_id: str | None = None, preview: bool = False) -> list[dict]:
    """Ochiq maqolalar (o'zi ham, soni ham e'lon qilingan). preview — admin ko'rib chiqishi: songa biriktirilgan barcha maqolalar."""
    ready(st)
    sql = "SELECT a.* FROM journal_articles a JOIN journal_issues i ON i.id = a.issue_id " + (
        "WHERE 1=1" if preview else "WHERE a.status='published' AND i.status='published'")
    args: tuple = ()
    if issue_id:
        sql += " AND a.issue_id=%s"
        args = (issue_id,)
    return sorted((_article(r) for r in st._q(sql, args)), key=_order)  # noqa: SLF001


def public_article(st, num, preview: bool = False) -> tuple[dict, dict] | None:
    a = article_by_num(st, num)
    if not a:
        return None
    i = get_issue(st, a["issue_id"]) if a.get("issue_id") else None
    if preview:  # qoralama ham, songa biriktirilmagan maqola ham ochiladi (son o'rnida — bo'sh joy egasi)
        return a, i or _no_issue()
    if a["status"] != "published" or not i or i["status"] != "published":
        return None
    return a, i


def _no_issue() -> dict:
    return {"id": "", "volume": 0, "number": 0, "year": date.today().year, "status": "draft", "published_on": "", "title": {}, "cover": "", "pdf": "",
            "pdf_size": 0, "key": ""}


def is_public(a: dict, i: dict | None) -> bool:
    return a.get("status") == "published" and bool(i) and i.get("status") == "published"


# ------------------------------------------------------------------ ko'rinish sabablari (ko'rib chiqish paneli) va admin paneldagi holat
ADMIN_URL = "/admin/journal"
MISS = {"title": "sarlavha", "authors": "muallif", "issue": "son", "pdf": "PDF fayl", "abstract": "annotatsiya"}


def issue_label(i: dict) -> str:
    return f"{i['volume']}-jild, {i['number']}-son ({i['year']})"


def _reason(code: str, text: str, fix: str, label: str) -> dict:
    return {"code": code, "text": text, "fix": fix, "fix_label": label}


def journal_reasons(st) -> list[dict]:
    """Jurnal butunlay yashirin bo'lishi sabablari (bo'sh — jurnal saytda ko'rinadi)."""
    s = settings(st)
    out = []
    if not s.get("title"):
        out.append(_reason("no_title", "jurnal nomi yozilmagan", f"{ADMIN_URL}?tab=settings", "Nomini yozish"))
    if not s.get("enabled") and (s.get("enabled") is False or s.get("title")):
        out.append(_reason("journal_off", "«Jurnal saytda ko‘rinadi» o‘chirilgan", ADMIN_URL, "Saytda ko‘rsatish"))
    return out


def issue_reasons(i: dict | None, own: bool = True) -> list[dict]:
    if not i or i.get("status") == "published":
        return []
    text = f"{issue_label(i)} qoralama holatida" if own else f"maqola soni ({issue_label(i)}) qoralama holatida"
    return [_reason("issue_draft", text, f"{ADMIN_URL}?tab=issues", "Sonni nashr qilish")]


def article_reasons(a: dict, i: dict | None) -> list[dict]:
    out = []
    edit = f"{ADMIN_URL}/articles/{a['id']}"
    if a.get("status") != "published":
        miss = publish_problems(a)
        out.append(_reason("article_draft", "maqola qoralama holatida" + (f" (e’lon qilish uchun yetishmaydi: {', '.join(MISS.get(x, x) for x in miss)})" if miss else ""),
                           edit, "Maqolani ochish"))
    if not a.get("issue_id") or not i or not i.get("id"):
        out.append(_reason("no_issue", "maqola songa biriktirilmagan", edit, "Son tanlash"))
    else:
        out += issue_reasons(i, own=False)
    return out


def article_visibility(st, a: dict) -> dict:
    """Admin muharriri uchun: maqola saytda ko'rinadimi va nima to'sqinlik qilyapti."""
    i = get_issue(st, a["issue_id"]) if a.get("issue_id") else None
    reasons = journal_reasons(st) + article_reasons(a, i)
    return {"public": not reasons, "reasons": reasons, "issue_status": (i or {}).get("status") or ""}


def diagnose(st) -> dict:
    """Admin paneli tepasidagi holat: saytda ko'rinish uchun qadamlar (✓/✗) va bir bosishda tuzatish amallari.
    action: settings | enable | new_issue | publish_issue(id) | new_article | edit_article(id) | drafts."""
    s = settings(st)
    iss = issues(st)
    arts = articles(st)
    by_id = {i["id"]: i for i in iss}
    pub_ids = {i["id"] for i in iss if i["status"] == "published"}
    published = [a for a in arts if a["status"] == "published"]
    public = [a for a in published if a.get("issue_id") in pub_ids]
    drafts = [a for a in arts if a["status"] != "published"]
    stuck: dict[str, int] = {}  # qoralama son → undagi e'lon qilingan maqolalar soni
    for a in published:
        if a.get("issue_id") in by_id and a["issue_id"] not in pub_ids:
            stuck[a["issue_id"]] = stuck.get(a["issue_id"], 0) + 1
    title = bool(s.get("title"))
    on = bool(s.get("enabled")) and title

    def act(kind: str, label: str, **kw) -> dict:
        return {"kind": kind, "label": label, **kw}

    steps = [{"code": "title", "ok": title, "text": f"Jurnal nomi: «{journal_title(s, 'uz', 'uz')}»" if title else "Jurnal nomi yozilmagan",
              "action": None if title else act("settings", "Nomini yozish")}]
    if on:
        steps.append({"code": "enabled", "ok": True, "text": "Jurnal saytda yoqilgan", "action": None})
    elif s.get("enabled") is None and not title:  # hali hal qilinmagan: nomi saqlanishi bilan yoqiladi
        steps.append({"code": "enabled", "ok": False, "text": "Nomi saqlangach jurnal saytda avtomatik ko‘rsatiladi", "action": None})
    else:
        steps.append({"code": "enabled", "ok": False, "text": "Jurnal saytda ko‘rsatilmayapti («Jurnal saytda ko‘rinadi» o‘chirilgan)",
                      "action": act("enable", "Saytda ko‘rsatish", disabled=not title)})
    if pub_ids:
        steps.append({"code": "issue", "ok": True, "text": f"Nashr qilingan sonlar: {len(pub_ids)}", "action": None})
    elif iss:
        best = max((i for i in iss), key=lambda i: (stuck.get(i["id"], 0), i["year"], i["volume"], i["number"]))
        steps.append({"code": "issue", "ok": False, "text": f"Hali birorta son nashr qilinmagan: {issue_label(best)} — qoralama",
                      "action": act("publish_issue", "Sonni nashr qilish", id=best["id"])})
    else:
        steps.append({"code": "issue", "ok": False, "text": "Hali son yaratilmagan", "action": act("new_issue", "Son yaratish")})
    if public:
        steps.append({"code": "article", "ok": True, "text": f"Saytdagi maqolalar: {len(public)}", "action": None})
    elif stuck:
        iid = max(stuck, key=lambda k: stuck[k])
        same = (steps[-1]["action"] or {}).get("id") == iid  # yuqoridagi qadam o'sha sonni nashr qiladi — tugma takrorlanmaydi
        steps.append({"code": "article", "ok": False, "text": f"{stuck[iid]} ta e’lon qilingan maqola saytda ko‘rinmaydi: soni ({issue_label(by_id[iid])}) qoralama",
                      "action": None if same else act("publish_issue", "Sonni nashr qilish", id=iid)})
    elif drafts:
        a = drafts[0]
        miss = publish_problems(a)
        steps.append({"code": "article", "ok": False, "text": f"Maqola №{a['num']} «{(a.get('title') or 'sarlavhasiz')[:80]}» qoralama holatida"
                      + (f" — e’lon qilish uchun yetishmaydi: {', '.join(MISS.get(x, x) for x in miss)}" if miss else ""),
                      "action": act("edit_article", "Maqolani ochish", id=a["id"])})
    else:
        steps.append({"code": "article", "ok": False, "text": "Hali maqola qo‘shilmagan", "action": act("new_article", "Maqola qo‘shish", disabled=not iss)})
    warnings = []
    if public or pub_ids:  # asosiy qadamlar bajarilgandan keyingi qolgan to'siqlar
        for iid, n in stuck.items():
            warnings.append({"text": f"{issue_label(by_id[iid])} qoralama — undagi {n} ta e’lon qilingan maqola saytda ko‘rinmaydi",
                             "action": act("publish_issue", "Sonni nashr qilish", id=iid)})
    if drafts and public:
        warnings.append({"text": f"Qoralama holatidagi maqolalar: {len(drafts)}", "action": act("drafts", "Ko‘rish"), "info": True})
    return {"visible": on, "ready": all(x["ok"] for x in steps), "steps": steps, "warnings": warnings,
            "prompt": title and not on and bool(published), "counts": {"issues": len(pub_ids), "articles": len(public), "published": len(published),
                                                                    "drafts": len(drafts)}}


def article_path(a: dict) -> str:
    return f"{ROUTE}/article/{a['num']}/{a['slug']}"


def pdf_path(a: dict) -> str:
    return f"{ROUTE}/pdf/{a['num']}/{a['slug']}.pdf"


def issue_path(i: dict) -> str:
    return f"{ROUTE}/issue/{i['volume']}-{i['number']}"


def issue_pdf_path(i: dict) -> str:
    return f"{ROUTE}/issue-pdf/{i['volume']}-{i['number']}.pdf"


def _author_names(a: dict) -> list[str]:
    return [" ".join(x for x in (p.get("given"), p.get("family")) if x) for p in a.get("authors") or []]


def affiliations(a: dict) -> tuple[list[str], list[list[int]]]:
    """Barcha muassasalar (tartib bilan, takrorsiz) va har bir muallif uchun ularning raqamlari (1 dan)."""
    affs: list[str] = []
    idx: list[list[int]] = []
    for p in a.get("authors") or []:
        mine = []
        for x in p.get("affiliations") or []:
            if x not in affs:
                affs.append(x)
            mine.append(affs.index(x) + 1)
        idx.append(mine)
    return affs, idx


def license_of(a: dict, s: dict) -> tuple[str, str]:
    code = a.get("license") or s.get("license") or DEFAULT_LICENSE
    return code, LICENSES.get(code, LICENSES[DEFAULT_LICENSE])


def pub_date(a: dict, i: dict | None) -> str:
    """citation_publication_date manbai: son nashr sanasi, bo'lmasa maqola e'lon qilingan sana, bo'lmasa yil."""
    return (i or {}).get("published_on") or a.get("published_on") or (f"{(i or {}).get('year')}-01-01" if (i or {}).get("year") else "")


def section_title(s: dict, sid: str, lang: str, base: str) -> str:
    sec = next((x for x in s.get("sections") or [] if x["id"] == sid), None)
    return pick(sec["title"], lang, base) if sec else ""


def public_view(svc, a: dict, i: dict, lang: str, full: bool = True) -> dict:
    """Ochiq API uchun maqola (email va ichki maydonlarsiz)."""
    s = settings(svc.st)
    base = svc.base_url()
    bl = svc.base_lang()
    affs, idx = affiliations(a)
    authors = [{"given": p.get("given") or "", "family": p.get("family") or "", "name": " ".join(x for x in (p.get("given"), p.get("family")) if x),
                "aff": idx[n], "country": p.get("country") or "", "orcid": p.get("orcid") or "", "corresponding": bool(p.get("corresponding"))}
               for n, p in enumerate(a.get("authors") or [])]
    out = {"id": a["id"], "num": a["num"], "slug": a["slug"], "url": article_path(a), "pdf_url": pdf_path(a) if a.get("pdf") else "", "lang": a.get("lang") or "uz",
           "title": a.get("title") or "", "title_i18n": a.get("title_i18n") or {}, "authors": authors, "affiliations": affs,
           "pages": {"first": a.get("first_page") or "", "last": a.get("last_page") or ""}, "doi": a.get("doi") or "",
           "section": {"id": a.get("section_id") or "", "title": section_title(s, a.get("section_id") or "", lang, bl)},
           "issue": issue_view(i, lang, bl), "published_on": a.get("published_on") or "", "views": a.get("views") or 0, "downloads": a.get("downloads") or 0,
           "draft": not is_public(a, i)}
    if not full:
        return out
    code, lurl = license_of(a, s)
    out.update({
        "abstract": {k: {"text": v, "html": text_html(v, headings=False)} for k, v in (a.get("abstract") or {}).items()},
        "keywords": a.get("keywords") or {}, "udc": a.get("udc") or "",
        "dates": {k: a.get(k) or "" for k in ("received", "revised", "accepted")} | {"published": a.get("published_on") or ""},
        "pdf_view": a.get("pdf") or "", "pdf_size": a.get("pdf_size") or 0, "pdf_pages": (a.get("pdf_check") or {}).get("pages") or 0,
        "references": a.get("references") or [], "funding": a.get("funding") or "", "license": {"code": code, "url": lurl},
        "cite": citations(a, i, s, base, bl), "bib_url": f"{ROUTE}/cite/{a['num']}.bib", "ris_url": f"{ROUTE}/cite/{a['num']}.ris",
        "abs_url": base + article_path(a),
    })
    return out


def issue_view(i: dict, lang: str, base: str) -> dict:
    return {"id": i["id"], "volume": i["volume"], "number": i["number"], "year": i["year"], "published_on": i.get("published_on") or "",
            "title": pick(i.get("title"), lang, base), "cover": i.get("cover") or "", "url": issue_path(i),
            "pdf_url": issue_pdf_path(i) if i.get("pdf") else "", "key": i["key"], "draft": i.get("status") != "published"}


def public_settings(svc, lang: str) -> dict:
    s = settings(svc.st)
    bl = svc.base_lang()
    code = s.get("license") or DEFAULT_LICENSE
    board = [{k: v for k, v in p.items() if k not in ("email",)} | {"position": pick(p.get("position"), lang, bl)} for p in s.get("board") or []]
    texts = {k: text_html(pick(v, lang, bl)) for k, v in (s.get("texts") or {}).items() if pick(v, lang, bl)}
    return {"title": journal_title(s, lang, bl), "abbr": s.get("abbr") or "", "issn_print": s.get("issn_print") or "", "issn_online": s.get("issn_online") or "",
            "publisher": pick(s.get("publisher"), lang, bl), "founded": s.get("founded"), "frequency": pick(s.get("frequency"), lang, bl),
            "license": {"code": code, "url": LICENSES.get(code, "")}, "cover": s.get("cover") or "", "email": s.get("email") or "",
            "phone": s.get("phone") or "", "address": pick(s.get("address"), lang, bl), "texts": texts,
            "indexing": s.get("indexing") or [], "sections": [{"id": x["id"], "title": pick(x["title"], lang, bl)} for x in s.get("sections") or []],
            "board": board, "submissions_open": bool(s.get("submissions_open", True)), "doi_prefix": s.get("doi_prefix") or ""}


# ------------------------------------------------------------------ iqtiboslar
def _initials(given: str, sep: str = " ") -> str:
    parts = [p for p in re.split(r"[\s]+", given or "") if p]
    out = []
    for p in parts:
        if "-" in p:
            out.append("-".join(x[:1].upper() + "." for x in p.split("-") if x))
        else:
            # o‘zbekcha «Sh», «Ch», «O‘», «G‘» — bir harf sifatida
            m = re.match(r"(Sh|Ch|Ng|O[‘'ʻ`’]|G[‘'ʻ`’])", p, flags=re.I)
            out.append((m.group(1)[0].upper() + m.group(1)[1:].lower() if m else p[:1].upper()) + ".")
    return sep.join(out)


def _range(a: dict, dash: str = "–") -> str:
    f, l_ = a.get("first_page") or "", a.get("last_page") or ""
    return f"{f}{dash}{l_}" if f and l_ and f != l_ else f or l_


def _jt(s: dict, base: str) -> str:
    return journal_title(s, base, base)


def citations(a: dict, i: dict, s: dict, base_url: str, base_lang: str) -> dict:
    au = a.get("authors") or []
    title = (a.get("title") or "").rstrip(".")
    jt = _jt(s, base_lang)
    vol, no, year = i.get("volume"), i.get("number"), i.get("year")
    pages = _range(a)
    doi = a.get("doi") or ""
    link = f"https://doi.org/{doi}" if doi else base_url + article_path(a)
    # APA 7
    names = [f"{p.get('family')}, {_initials(p.get('given') or '')}".strip(", ") for p in au]
    if len(names) == 1:
        apa_a = names[0]
    elif len(names) <= 20:
        apa_a = ", ".join(names[:-1]) + ", & " + names[-1]
    else:
        apa_a = ", ".join(names[:19]) + ", … " + names[-1]
    apa = f"{apa_a} ({year}). {title}. {jt}, {vol}({no})" + (f", {pages}" if pages else "") + f". {link}"
    # ГОСТ Р 7.0.5–2008 (журнал: «Автор И. О. Заглавие // Журнал. Год. Т. N, № N. С. N–N.»)
    lg = a.get("lang") or "uz"
    words = {"ru": ("Т.", "№", "С."), "uz": ("Jild", "№", "B."), "en": ("Vol.", "no.", "P.")}.get(lg, ("Vol.", "no.", "P."))
    gost_a = ", ".join(f"{p.get('family')} {_initials(p.get('given') or '')}".strip() for p in au[:3]) + (" [et al.]" if len(au) > 3 else "")
    gost = f"{gost_a} {title} // {jt}. {year}. {words[0]} {vol}, {words[1]} {no}." + (f" {words[2]} {pages}." if pages else "") + (f" DOI: {doi}." if doi else f" URL: {link}.")
    # MLA 9
    if len(au) == 1:
        mla_a = f"{au[0].get('family')}, {au[0].get('given')}"
    elif len(au) == 2:
        mla_a = f"{au[0].get('family')}, {au[0].get('given')}, and {au[1].get('given')} {au[1].get('family')}"
    elif au:
        mla_a = f"{au[0].get('family')}, {au[0].get('given')}, et al"
    else:
        mla_a = ""
    mla = f"{mla_a}. “{title}.” {jt}, vol. {vol}, no. {no}, {year}" + (f", pp. {pages}" if pages else "") + f". {link}."
    return {"apa": re.sub(r"\s+", " ", apa).strip(), "gost": re.sub(r"\s+", " ", gost).strip(), "mla": re.sub(r"\s+", " ", mla).replace("..", ".").strip()}


def _bib_esc(s: str) -> str:
    s = (s or "").replace("\\", "\\textbackslash{}")
    for ch in "{}":
        s = s.replace(ch, "\\" + ch)
    for ch in "&%$#_":
        s = s.replace(ch, "\\" + ch)
    return s.replace("~", "\\textasciitilde{}").replace("^", "\\textasciicircum{}")


def bibtex(svc, a: dict, i: dict) -> str:
    s = settings(svc.st)
    bl = svc.base_lang()
    first = (a.get("authors") or [{}])[0]
    key = re.sub(r"[^A-Za-z0-9]", "", unicodedata.normalize("NFKD", slugify(first.get("family") or "article"))) + str(i.get("year") or "") + f"_{a['num']}"
    kw = (a.get("keywords") or {}).get(a.get("lang") or "") or next(iter((a.get("keywords") or {}).values()), [])
    absx = (a.get("abstract") or {}).get(a.get("lang") or "") or next(iter((a.get("abstract") or {}).values()), "")
    fields = [
        ("author", " and ".join(f"{_bib_esc(p.get('family') or '')}, {_bib_esc(p.get('given') or '')}".strip(", ") for p in a.get("authors") or [])),
        ("title", "{" + _bib_esc(a.get("title") or "") + "}"),
        ("journal", _bib_esc(_jt(s, bl))),
        ("year", str(i.get("year") or "")),
        ("volume", str(i.get("volume") or "")),
        ("number", str(i.get("number") or "")),
        ("pages", _range(a, "--")),
        ("doi", a.get("doi") or ""),
        ("url", svc.base_url() + article_path(a)),
        ("issn", s.get("issn_online") or s.get("issn_print") or ""),
        ("publisher", _bib_esc(pick(s.get("publisher"), bl, bl))),
        ("language", a.get("lang") or ""),
        ("keywords", _bib_esc(", ".join(kw))),
        ("abstract", _bib_esc(re.sub(r"\s+", " ", absx).strip())),
    ]
    body = ",\n".join(f"  {k} = {{{v}}}" for k, v in fields if v)
    return f"@article{{{key},\n{body}\n}}\n"


def ris(svc, a: dict, i: dict) -> str:
    s = settings(svc.st)
    bl = svc.base_lang()
    lines = [("TY", "JOUR")]
    lines += [("AU", f"{p.get('family')}, {p.get('given')}".strip(", ")) for p in a.get("authors") or []]
    lines += [("TI", a.get("title") or ""), ("T2", _jt(s, bl)), ("JO", s.get("abbr") or ""), ("PY", str(i.get("year") or "")),
              ("DA", (pub_date(a, i) or "").replace("-", "/")), ("VL", str(i.get("volume") or "")), ("IS", str(i.get("number") or "")),
              ("SP", a.get("first_page") or ""), ("EP", a.get("last_page") or ""), ("DO", a.get("doi") or ""),
              ("UR", svc.base_url() + article_path(a)), ("L1", svc.base_url() + pdf_path(a) if a.get("pdf") else ""),
              ("SN", s.get("issn_online") or s.get("issn_print") or ""), ("PB", pick(s.get("publisher"), bl, bl)), ("LA", a.get("lang") or "")]
    kw = (a.get("keywords") or {}).get(a.get("lang") or "") or next(iter((a.get("keywords") or {}).values()), [])
    lines += [("KW", k) for k in kw]
    absx = (a.get("abstract") or {}).get(a.get("lang") or "") or next(iter((a.get("abstract") or {}).values()), "")
    lines.append(("AB", re.sub(r"\s+", " ", absx).strip()))
    lines.append(("ER", ""))
    one = lambda v: re.sub(r"[\r\n]+", " ", v)  # noqa: E731
    return "\r\n".join((f"{k}  - " + one(v)).rstrip() if k != "ER" else "ER  - " for k, v in lines if v or k == "ER") + "\r\n"


# ------------------------------------------------------------------ Google Scholar / Highwire Press, Dublin Core, PRISM, JSON-LD
def scholar_tags(svc, a: dict, i: dict) -> list[tuple[str, str]]:
    """(name, content) juftlari — tartib muhim: citation_author dan keyin o'sha muallifning muassasasi va ORCID'i."""
    s = settings(svc.st)
    base = svc.base_url()
    bl = svc.base_lang()
    lang = a.get("lang") or bl
    tags: list[tuple[str, str]] = [("citation_title", a.get("title") or "")]  # bitta sarlavha — maqola tilida (tarjimalar DC.title.alternative'da)
    for p in a.get("authors") or []:
        tags.append(("citation_author", ", ".join(x for x in (p.get("family"), p.get("given")) if x)))
        for aff in p.get("affiliations") or []:
            tags.append(("citation_author_institution", aff))
        if p.get("orcid"):
            tags.append(("citation_author_orcid", f"https://orcid.org/{p['orcid']}"))
    pd = pub_date(a, i)
    tags += [("citation_publication_date", pd.replace("-", "/")), ("citation_online_date", (a.get("published_on") or pd).replace("-", "/")),
             ("citation_date", pd.replace("-", "/")), ("citation_journal_title", _jt(s, bl))]
    if s.get("abbr"):
        tags.append(("citation_journal_abbrev", s["abbr"]))
    for k in ("issn_print", "issn_online"):
        if s.get(k):
            tags.append(("citation_issn", s[k]))
    tags += [("citation_volume", str(i.get("volume") or "")), ("citation_issue", str(i.get("number") or ""))]
    if a.get("first_page"):
        tags.append(("citation_firstpage", a["first_page"]))
    if a.get("last_page"):
        tags.append(("citation_lastpage", a["last_page"]))
    if a.get("doi"):
        tags.append(("citation_doi", a["doi"]))
    pub = pick(s.get("publisher"), bl, bl)
    if pub:
        tags.append(("citation_publisher", pub))
    tags.append(("citation_language", lang))
    for kw in (a.get("keywords") or {}).get(lang) or next(iter((a.get("keywords") or {}).values()), []):
        tags.append(("citation_keywords", kw))
    tags.append(("citation_abstract_html_url", base + article_path(a)))
    if a.get("pdf"):
        tags.append(("citation_pdf_url", base + pdf_path(a)))
    for r in (a.get("references") or [])[:300]:
        tags.append(("citation_reference", r))
    return [(k, v) for k, v in tags if v]


def dc_tags(svc, a: dict, i: dict) -> list[tuple[str, str, str]]:
    """Dublin Core va PRISM: (name, content, qo'shimcha atributlar)."""
    s = settings(svc.st)
    base = svc.base_url()
    bl = svc.base_lang()
    lang = a.get("lang") or bl
    code, lurl = license_of(a, s)
    out: list[tuple[str, str, str]] = [("DC.title", a.get("title") or "", f' xml:lang="{escape(lang)}"')]
    for k, v in (a.get("title_i18n") or {}).items():
        out.append(("DC.title.alternative", v, f' xml:lang="{escape(k)}"'))
    out += [("DC.creator.personalName", ", ".join(x for x in (p.get("family"), p.get("given")) if x), "") for p in a.get("authors") or []]
    pd = pub_date(a, i)
    absx = (a.get("abstract") or {})
    for k, v in absx.items():
        out.append(("DC.description", plain(v, 2000), f' xml:lang="{escape(k)}"'))
    for kw in (a.get("keywords") or {}).get(lang) or []:
        out.append(("DC.subject", kw, f' xml:lang="{escape(lang)}"'))
    out += [("DC.date.created", pd, ' scheme="ISO8601"'), ("DC.date.issued", pd, ' scheme="ISO8601"'), ("DC.date.modified", (a.get("updated") or "")[:10], ' scheme="ISO8601"'),
            ("DC.identifier", base + article_path(a), ' scheme="URI"'), ("DC.identifier.pageNumber", _range(a, "-"), "")]
    if a.get("doi"):
        out.append(("DC.identifier.DOI", a["doi"], ""))
    out += [("DC.language", lang, ' scheme="ISO639-1"'), ("DC.publisher", pick(s.get("publisher"), bl, bl), ""), ("DC.rights", lurl, ""),
            ("DC.source", _jt(s, bl), ""), ("DC.source.ISSN", s.get("issn_online") or s.get("issn_print") or "", ""),
            ("DC.source.volume", str(i.get("volume") or ""), ""), ("DC.source.issue", str(i.get("number") or ""), ""),
            ("DC.source.URI", base + ROUTE, ""), ("DC.type", "Text.Serial.Journal", ""), ("DC.type.articleType", section_title(s, a.get("section_id") or "", lang, bl), ""),
            ("DC.format", "application/pdf" if a.get("pdf") else "text/html", "")]
    out += [("prism.publicationName", _jt(s, bl), ""), ("prism.issn", s.get("issn_print") or "", ""), ("prism.eIssn", s.get("issn_online") or "", ""),
            ("prism.volume", str(i.get("volume") or ""), ""), ("prism.number", str(i.get("number") or ""), ""),
            ("prism.startingPage", a.get("first_page") or "", ""), ("prism.endingPage", a.get("last_page") or "", ""),
            ("prism.publicationDate", pd, ""), ("prism.doi", a.get("doi") or "", ""), ("prism.url", base + article_path(a), ""),
            ("prism.copyright", code, "")]
    return [(k, v, x) for k, v, x in out if v]


def head_html(svc, a: dict, i: dict) -> list[str]:
    e = lambda v: escape(str(v or ""), quote=True)  # noqa: E731
    out = ['<link rel="schema.DC" href="http://purl.org/dc/elements/1.1/">', '<link rel="schema.DCTERMS" href="http://purl.org/dc/terms/">']
    out += [f'<meta name="{k}" content="{e(v)}">' for k, v in scholar_tags(svc, a, i)]
    out += [f'<meta name="{k}" content="{e(v)}"{x}>' for k, v, x in dc_tags(svc, a, i)]
    if a.get("pdf"):
        out.append(f'<link rel="alternate" type="application/pdf" href="{e(svc.base_url() + pdf_path(a))}">')
    return out


def periodical_ld(svc, lang: str) -> dict:
    s = settings(svc.st)
    base = svc.base_url()
    bl = svc.base_lang()
    return {"@type": "Periodical", "@id": base + ROUTE + "#periodical", "name": journal_title(s, lang, bl), "alternateName": s.get("abbr") or None,
            "issn": [x for x in (s.get("issn_print"), s.get("issn_online")) if x] or None, "url": base + ROUTE,
            "publisher": {"@type": "Organization", "name": pick(s.get("publisher"), lang, bl)} if pick(s.get("publisher"), lang, bl) else {"@id": base + "/#org"},
            "license": LICENSES.get(s.get("license") or DEFAULT_LICENSE), "isAccessibleForFree": True, "inLanguage": list(LANGS),
            "image": (base + s["cover"]) if (s.get("cover") or "").startswith("/") else (s.get("cover") or None)}


def article_ld(svc, a: dict, i: dict) -> dict:
    s = settings(svc.st)
    base = svc.base_url()
    bl = svc.base_lang()
    lang = a.get("lang") or bl
    code, lurl = license_of(a, s)
    affs, idx = affiliations(a)
    per = periodical_ld(svc, bl)
    issue = {"@type": "PublicationIssue", "@id": base + issue_path(i), "issueNumber": str(i["number"]), "datePublished": i.get("published_on") or None,
             "isPartOf": {"@type": "PublicationVolume", "volumeNumber": str(i["volume"]), "isPartOf": per}}
    absx = (a.get("abstract") or {}).get(lang) or next(iter((a.get("abstract") or {}).values()), "")
    return {"@type": "ScholarlyArticle", "@id": base + article_path(a), "url": base + article_path(a), "headline": (a.get("title") or "")[:110],
            "name": a.get("title") or "", "alternativeHeadline": next(iter((a.get("title_i18n") or {}).values()), None),
            "author": [{"@type": "Person", "givenName": p.get("given") or None, "familyName": p.get("family") or None,
                        "name": " ".join(x for x in (p.get("given"), p.get("family")) if x),
                        "sameAs": f"https://orcid.org/{p['orcid']}" if p.get("orcid") else None,
                        "affiliation": [{"@type": "Organization", "name": affs[k - 1]} for k in idx[n]] or None} for n, p in enumerate(a.get("authors") or [])],
            "datePublished": pub_date(a, i) or None, "dateModified": a.get("updated") or None, "inLanguage": lang, "isPartOf": issue,
            "pageStart": a.get("first_page") or None, "pageEnd": a.get("last_page") or None, "pagination": _range(a, "-") or None,
            "abstract": plain(absx, 5000) or None, "keywords": ", ".join((a.get("keywords") or {}).get(lang) or []) or None,
            "identifier": {"@type": "PropertyValue", "propertyID": "DOI", "value": a["doi"]} if a.get("doi") else None,
            "sameAs": f"https://doi.org/{a['doi']}" if a.get("doi") else None, "license": lurl, "isAccessibleForFree": True,
            "encoding": {"@type": "MediaObject", "contentUrl": base + pdf_path(a), "encodingFormat": "application/pdf"} if a.get("pdf") else None,
            "citation": [{"@type": "CreativeWork", "name": r} for r in (a.get("references") or [])[:100]] or None,
            "publisher": per["publisher"]}


# ------------------------------------------------------------------ server sahifasi (seo.page_meta dan chaqiriladi)
def _lu(base: str, path: str, lang: str, base_lang: str) -> str:
    return base + path + ("" if lang == base_lang else f"?lang={lang}")


def page_meta(svc, meta: dict, seg: list[str], lang: str, labels: dict, home: tuple[str, str], preview: bool = False) -> int:
    """/journal/... — meta, JSON-LD va JavaScript'siz ko'rinadigan matn. Qaytaradi: HTTP holati.
    preview — «journal» ruxsatli admin: yashirin jurnal, qoralama son/maqola ham 200 (noindex)."""
    status = _page_meta(svc, meta, seg, lang, labels, home, preview)
    hidden = meta.pop("_hidden", False) or not enabled(svc.st)
    if preview and status == 200 and hidden:  # saytda hali yo'q sahifa — faqat admin ko'radi
        meta.update(noindex=True, alternates=[])
    return status


def _page_meta(svc, meta: dict, seg: list[str], lang: str, labels: dict, home: tuple[str, str], preview: bool) -> int:
    st = svc.st
    base, bl = svc.base_url(), svc.base_lang()
    s = settings(st)
    t = tx(lang)

    def not_found() -> int:
        meta.update(title=f"{labels['notfound']} — {meta['site_name']}", noindex=True, alternates=[], jsonld=None)
        return 404

    if not enabled(st) and not preview:
        return not_found()
    jt = journal_title(s, lang, bl) or t["journal"]
    e = lambda v: escape(str(v or ""), quote=True)  # noqa: E731
    jhome = (jt, _lu(base, ROUTE, lang, bl))
    graph = meta["jsonld"]["@graph"]
    meta["keywords"] = ", ".join(x for x in (jt, s.get("abbr"), t["journal"], s.get("issn_print"), s.get("issn_online"), meta.get("site_name")) if x)
    # jurnal menyusi (JavaScript'siz): 4 bo'lim + «Maqola yuborish» (qabul ochiq bo'lsa)
    nav = [(jt, jhome[1]), *((t[k], _lu(base, f"{ROUTE}/{p}", lang, bl)) for k, p in (("archive", "archive"), ("about", "about"), ("for_authors", "guidelines")))]
    if s.get("submissions_open", True):
        nav.append((t["submit"], _lu(base, f"{ROUTE}/submit", lang, bl)))
    nav_html = f'<nav aria-label="{e(t["journal"])}"><ul>' + "".join(f'<li><a href="{e(u)}">{e(n)}</a></li>' for n, u in nav) + "</ul></nav>"
    issn = " · ".join(x for x in (f"ISSN {s['issn_print']}" if s.get("issn_print") else "", f"eISSN {s['issn_online']}" if s.get("issn_online") else "") if x)
    rest = seg[1:]
    if len(rest) == 1 and (rest[0] in LEGACY or rest[0] == "search"):
        # eski manzil (sayt 301 bilan yo'naltiradi; bu yerga faqat /api/meta orqali keladi) — yangi sahifaning meta'si va canonical'i
        to = "about" if rest[0] in LEGACY else "archive"
        meta.update(url=_lu(base, f"{ROUTE}/{to}", lang, bl), alternates=[(x, _lu(base, f"{ROUTE}/{to}", x, bl)) for x in LANGS], x_default=base + f"{ROUTE}/{to}")
        rest = [to]

    def art_li(a: dict, i: dict | None = None) -> str:
        au = ", ".join(_author_names(a))
        pg = _range(a)
        pdf = f' · <a href="{e(base + pdf_path(a))}">PDF</a>' if a.get("pdf") else ""
        return (f'<li><a href="{e(base + article_path(a))}">{e(a.get("title"))}</a><br>{e(au)}'
                + (f" · {e(t['pages'])} {e(pg)}" if pg else "") + pdf + "</li>")

    if not rest:
        about = pick((s.get("texts") or {}).get("about"), lang, bl)
        meta.update(title=f"{jt} — {meta['site_name']}" if s.get("abbr") != jt else jt, description=plain(about, 300) or f"{jt}. {issn}".strip())
        pubs = issues(st, public=not preview)
        cur = pubs[0] if pubs else None
        arts = public_articles(st, cur["id"], preview) if cur else []
        meta["_hidden"] = bool(cur and cur["status"] != "published") or any(a["status"] != "published" for a in arts)
        html = f"<h1>{e(jt)}</h1>" + (f"<p>{e(issn)}</p>" if issn else "") + text_html(about)
        if cur:
            html += f'<h2><a href="{e(base + issue_path(cur))}">{e(t["current"])}: {e(t["vol"])} {cur["volume"]}, {e(t["no"])} {cur["number"]} ({cur["year"]})</a></h2>'
            html += "<ul>" + "".join(art_li(a) for a in arts) + "</ul>"
        html += nav_html
        meta["ssr"] = {"html": html, "links": []}
        graph.append(periodical_ld(svc, lang))
        graph.append(_crumbs(base, [home, jhome]))
        if s.get("cover"):
            meta["image"] = base + s["cover"] if s["cover"].startswith("/") else s["cover"]
        return 200
    head = rest[0]
    if head == "archive" and len(rest) == 1:
        pubs = issues(st, public=not preview)
        counts: dict[str, int] = {}
        for a in public_articles(st, preview=preview):
            counts[a["issue_id"]] = counts.get(a["issue_id"], 0) + 1
        meta["_hidden"] = any(i["status"] != "published" for i in pubs)
        meta.update(title=f"{t['archive']} — {jt}", description=f"{jt}: {t['archive'].lower()}. {issn}".strip())
        html = f"<h1>{e(t['archive'])} — {e(jt)}</h1>"
        for y in sorted({i["year"] for i in pubs}, reverse=True):
            html += f"<h2>{y}</h2><ul>" + "".join(
                f'<li><a href="{e(base + issue_path(i))}">{e(t["vol"])} {i["volume"]}, {e(t["no"])} {i["number"]} ({i["year"]})'
                f'{(": " + e(pick(i["title"], lang, bl))) if pick(i["title"], lang, bl) else ""}</a> — {counts.get(i["id"], 0)}</li>'
                for i in pubs if i["year"] == y) + "</ul>"
        meta["ssr"] = {"html": html + nav_html, "links": []}
        graph.append(_crumbs(base, [home, jhome, (t["archive"], meta["url"])]))
        return 200
    if head == "issue" and len(rest) == 2:
        i = issue_by_key(st, rest[1], public=not preview)
        if not i:
            return not_found()
        arts = public_articles(st, i["id"], preview)
        meta["_hidden"] = i["status"] != "published" or any(a["status"] != "published" for a in arts)
        name = f"{t['vol']} {i['volume']}, {t['no']} {i['number']} ({i['year']})"
        it = pick(i["title"], lang, bl)
        meta.update(title=f"{name}{': ' + it if it else ''} — {jt}", description=plain(f"{jt}. {name}. " + "; ".join(a.get("title") or "" for a in arts), 300))
        html = f"<h1>{e(jt)}. {e(name)}</h1>" + (f"<p>{e(it)}</p>" if it else "")
        if i.get("pdf"):
            html += f'<p><a href="{e(base + issue_pdf_path(i))}">{e(t["full_issue"])}</a></p>'
        html += "<ul>" + "".join(art_li(a, i) for a in arts) + "</ul>"
        meta["ssr"] = {"html": html, "links": []}
        if i.get("cover"):
            meta["image"] = base + i["cover"] if i["cover"].startswith("/") else i["cover"]
        graph.append({"@type": "PublicationIssue", "@id": base + issue_path(i), "issueNumber": str(i["number"]), "datePublished": i.get("published_on") or None,
                      "name": it or None, "isPartOf": {"@type": "PublicationVolume", "volumeNumber": str(i["volume"]), "isPartOf": periodical_ld(svc, lang)},
                      "hasPart": [{"@type": "ScholarlyArticle", "@id": base + article_path(a), "name": a.get("title")} for a in arts] or None})
        graph.append(_crumbs(base, [home, jhome, (t["archive"], _lu(base, f"{ROUTE}/archive", lang, bl)), (name, meta["url"])]))
        return 200
    if head == "article" and len(rest) in (2, 3):
        hit = public_article(st, rest[1], preview)
        if not hit:
            return not_found()
        a, i = hit
        meta["_hidden"] = not is_public(a, i)
        canon = base + article_path(a)
        alang = a.get("lang") or bl
        absx = (a.get("abstract") or {}).get(alang) or next(iter((a.get("abstract") or {}).values()), "")
        authors = ", ".join(_author_names(a))
        meta.update(title=f"{a.get('title')} | {s.get('abbr') or jt}", description=plain(absx, 300) or a.get("title") or "", url=canon, alternates=[],
                    type="article", published=pub_date(a, i), image_alt=a.get("title") or "",
                    keywords=", ".join([*((a.get("keywords") or {}).get(alang) or []), jt]))
        if alang in LANGS:
            meta["lang"] = alang
        if i.get("cover"):
            meta["image"] = base + i["cover"] if i["cover"].startswith("/") else i["cover"]
        meta["head_extra"] = head_html(svc, a, i)
        affs, idx = affiliations(a)
        ttl = tx(alang if alang in TX else "en")
        html = f'<article lang="{e(alang)}"><h1>{e(a.get("title"))}</h1>'
        for k, v in (a.get("title_i18n") or {}).items():
            html += f'<p lang="{e(k)}"><b>{e(v)}</b></p>'
        html += "<p>" + ", ".join(
            f'{e(n)}{"<sup>" + ",".join(map(str, idx[k])) + "</sup>" if idx[k] else ""}'
            + (f' (<a href="https://orcid.org/{e(p["orcid"])}">ORCID {e(p["orcid"])}</a>)' if p.get("orcid") else "")
            for k, (n, p) in enumerate(zip(_author_names(a), a.get("authors") or []))) + "</p>"
        if affs:
            html += "<ol>" + "".join(f"<li>{e(x)}</li>" for x in affs) + "</ol>"
        html += (f'<p><a href="{e(base + issue_path(i))}">{e(jt)}. {e(ttl["vol"])} {i["volume"]}, {e(ttl["no"])} {i["number"]} ({i["year"]})</a>'
                 + (f". {e(ttl['pages'])} {e(_range(a))}" if _range(a) else "") + "</p>")
        if a.get("doi"):
            html += f'<p>DOI: <a href="https://doi.org/{e(a["doi"])}">{e(a["doi"])}</a></p>'
        for k, v in (a.get("abstract") or {}).items():
            html += f'<section lang="{e(k)}"><h2>{e(tx(k)["abstract"] if k in TX else "Abstract")}</h2>{text_html(v, headings=False)}'
            kws = (a.get("keywords") or {}).get(k) or []
            if kws:
                html += f'<p><b>{e(tx(k)["keywords"] if k in TX else "Keywords")}:</b> {e(", ".join(kws))}</p>'
            html += "</section>"
        if a.get("pdf"):
            html += f'<p><a href="{e(base + pdf_path(a))}">{e(ttl["pdf"])}</a></p>'
        if a.get("references"):
            html += f"<h2>{e(ttl['references'])}</h2><ol>" + "".join(f"<li>{e(r)}</li>" for r in a["references"]) + "</ol>"
        code, lurl = license_of(a, s)
        html += f'<p><a rel="license" href="{e(lurl)}">{e(code)}</a></p></article>'
        meta["ssr"] = {"html": html, "links": []}
        graph.append(article_ld(svc, a, i))
        name = f"{t['vol']} {i['volume']}, {t['no']} {i['number']} ({i['year']})"
        graph.append(_crumbs(base, [home, jhome, (name, base + issue_path(i)), (a.get("title") or "", canon)]))
        if authors:
            meta["author"] = authors
        return 200
    if head in INFO_PAGES and len(rest) == 1:
        texts = s.get("texts") or {}
        if head == "about":
            title = t["about"]
            secs = about_sections(s, lang, bl)
            html = f"<h1>{e(title)} — {e(jt)}</h1>"
            for k, name, body in secs:
                html += f'<section id="{k}">' + (f"<h2>{e(name)}</h2>" if k != "about" else "") + body + "</section>"
            lead = plain(pick(texts.get("about"), lang, bl), 200)
            rest_names = [name for k, name, _ in secs if k != "about"]
            tail = ", ".join(rest_names)
            meta["description"] = plain(" ".join(x for x in (lead, f"{tail}." if tail else "", issn) if x), 300) or f"{jt}: {title}."
        elif head == "guidelines":
            title = t["guidelines"]
            txt = pick(texts.get("guidelines"), lang, bl)
            meta["description"] = plain(txt, 300) or f"{jt}: {title}."
            html = f"<h1>{e(title)}</h1>" + text_html(txt)
            links = [(t[k], _lu(base, f"{ROUTE}/about", lang, bl) + f"#{k}") for k in ("peer-review", "ethics") if pick(texts.get(PAGES[k]), lang, bl)]
            if s.get("submissions_open", True):
                links.append((t["submit"], _lu(base, f"{ROUTE}/submit", lang, bl)))
            html += "<ul>" + "".join(f'<li><a href="{e(u)}">{e(n)}</a></li>' for n, u in links) + "</ul>" if links else ""
        else:  # submit
            title = t["submit"]
            meta["description"] = plain(pick(texts.get("guidelines"), lang, bl), 300) or f"{jt}: {title}."
            html = f"<h1>{e(title)}</h1>"
        meta.update(title=f"{title} — {jt}")
        meta["ssr"] = {"html": html + nav_html, "links": []}
        graph.append(_crumbs(base, [home, jhome, (title, meta["url"])]))
        return 200
    return not_found()


def about_sections(s: dict, lang: str, bl: str) -> list[tuple[str, str, str]]:
    """«Jurnal haqida» sahifasi bo'limlari: (langar, sarlavha, HTML). Mazmuni yo'q bo'lim chiqmaydi (frontend ham shu tartibda)."""
    t = tx(lang)
    texts = s.get("texts") or {}
    e = lambda v: escape(str(v or ""), quote=True)  # noqa: E731
    out: list[tuple[str, str, str]] = []
    for k in ABOUT_ANCHORS:
        body = ""
        if k == "board":
            body = "<ul>" + "".join(f"<li>{e(p['name'])}{', ' + e(p['degree']) if p.get('degree') else ''}{', ' + e(p['affiliation']) if p.get('affiliation') else ''}</li>"
                                    for p in s.get("board") or []) + "</ul>" if s.get("board") else ""
        elif k == "indexing":
            body = "<ul>" + "".join(f'<li><a href="{e(x["url"])}">{e(x["title"])}</a></li>' if x.get("url") else f"<li>{e(x['title'])}</li>"
                                    for x in s.get("indexing") or []) + "</ul>" if s.get("indexing") else ""
        else:
            body = text_html(pick(texts.get(PAGES[k]), lang, bl))
            if k == "open-access":
                code = s.get("license") or DEFAULT_LICENSE
                body += f'<p>{e(t["license"])}: <a rel="license" href="{e(LICENSES.get(code, LICENSES[DEFAULT_LICENSE]))}">{e(code)}</a></p>'
            elif k == "contacts":
                body += "".join(f"<p>{e(x)}</p>" for x in (s.get("email"), s.get("phone"), pick(s.get("address"), lang, bl)) if x)
        if body:
            out.append((k, t[k], body))
    return out


def legacy_redirect(path: str, query: str = "") -> str | None:
    """Eski jurnal manzillari (indekslangan yoki havola qilingan bo'lishi mumkin) → yangi joyi (301).
    /journal/board, /peer-review, /ethics, /open-access, /indexing, /contacts → /journal/about#<langar>; /journal/search → /journal/archive (so'rov saqlanadi)."""
    m = re.fullmatch(r"/journal/([a-z-]+)/?", path)
    if not m:
        return None
    k = m.group(1)
    q = f"?{query}" if query else ""
    if k in LEGACY:
        return f"{ROUTE}/about{q}#{k}"
    if k == "search":
        return f"{ROUTE}/archive{q}"
    return None


def _crumbs(base: str, items: list[tuple[str, str]]) -> dict:
    return {"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": n + 1, "name": x, "item": u} for n, (x, u) in enumerate(items)]}


def redirect_for(svc, path: str) -> str | None:
    """Eski yoki noto'g'ri slug bilan kelgan maqola havolasi → kanonik manzil (301)."""
    m = re.fullmatch(r"/journal/article/(\d{1,9})(?:/([^/]*))?/?", path)
    if not m or not enabled(svc.st):
        return None
    hit = public_article(svc.st, m.group(1))
    if not hit:
        return None
    a = hit[0]
    return None if m.group(2) == a["slug"] and not path.endswith("/") else article_path(a)


# ------------------------------------------------------------------ sitemap
def sitemap_urls(svc) -> list[tuple]:
    """(yo'l, lastmod, tillar, changefreq, priority, rasm) — seo.sitemap formatida."""
    st = svc.st
    if not enabled(st):
        return []
    bl = svc.base_lang()
    s = settings(st)
    out: list[tuple] = [(ROUTE, s.get("updated") or None, LANGS, "weekly", "0.8", ""), (f"{ROUTE}/archive", None, LANGS, "weekly", "0.7", "")]
    for k in ("about", "guidelines", "submit"):  # eski alohida sahifalar (board, ethics…) — 301 bilan /journal/about#… ga, sitemap'da yo'q
        out.append((f"{ROUTE}/{k}", None, LANGS, "monthly", "0.5" if k != "submit" else "0.4", ""))
    base = svc.base_url()
    for i in issues(st, public=True):
        out.append((issue_path(i), i.get("updated"), LANGS, "monthly", "0.6", (base + i["cover"]) if (i.get("cover") or "").startswith("/") else (i.get("cover") or "")))
        if i.get("pdf"):
            out.append((issue_pdf_path(i), i.get("updated"), [bl], "yearly", "0.4", ""))
    for a in public_articles(st):
        out.append((article_path(a), a.get("updated"), [bl], "monthly", "0.7", ""))
        if a.get("pdf"):
            out.append((pdf_path(a), a.get("updated"), [bl], "yearly", "0.6", ""))
    return out


# ------------------------------------------------------------------ qidiruv
def search_hits(svc, q: str, lang: str) -> list[tuple[int, dict]]:
    """Sayt qidiruvi uchun: [(ball, {type, title, sub, to})]."""
    from .search import _score, norm  # noqa: PLC0415

    st = svc.st
    if not enabled(st):
        return []
    nq = norm(q)
    if len(nq) < 2:
        return []
    out = []
    s = settings(st)
    jt = journal_title(s, lang, svc.base_lang())
    for a in public_articles(st):
        title = a.get("title") or ""
        body = " ".join([*(a.get("title_i18n") or {}).values(), *_author_names(a), *[k for v in (a.get("keywords") or {}).values() for k in v],
                         *(a.get("abstract") or {}).values(), a.get("doi") or ""])
        sc = _score(nq, title, body)
        if sc:
            out.append((sc + 4, {"type": "article", "title": title, "sub": f"{', '.join(_author_names(a))[:90]} · {jt}", "to": article_path(a)}))
    return out


def find(svc, lang: str, q: str = "", year: str = "", section: str = "", author: str = "", keyword: str = "", preview: bool = False) -> list[dict]:
    """Jurnal ichida qidiruv: sarlavha, muallif, kalit so'z, yil, rubrika bo'yicha."""
    from .search import norm  # noqa: PLC0415

    st = svc.st
    iss = {i["id"]: i for i in issues(st, public=not preview)}
    nq, na, nk = norm(q), norm(author), norm(keyword)
    out = []
    for a in public_articles(st, preview=preview):
        i = iss.get(a["issue_id"])
        if not i:
            continue
        if year and str(i["year"]) != str(year):
            continue
        if section and a.get("section_id") != section:
            continue
        names = norm(" ".join(_author_names(a) + [" ".join(x for x in (p.get("given_en"), p.get("family_en")) if x) for p in a.get("authors") or []]))
        kws = norm(" ".join(k for v in (a.get("keywords") or {}).values() for k in v))
        if na and na not in names:
            continue
        if nk and nk not in kws:
            continue
        if nq:
            hay = norm(" ".join([a.get("title") or "", *(a.get("title_i18n") or {}).values(), *(a.get("abstract") or {}).values(), a.get("doi") or ""])) + " " + names + " " + kws
            if not all(w in hay for w in nq.split(" ") if w):
                continue
        out.append(public_view(svc, a, i, lang, full=False))
    out.sort(key=lambda x: (x["issue"]["year"], x["issue"]["volume"], x["issue"]["number"]), reverse=True)
    return out


# ------------------------------------------------------------------ hisoblagichlar
def hit(st, article_id: str, kind: str, vid: str) -> bool:
    """Kunlik noyob ko'rish/yuklab olish: yangi bo'lsa hisoblagich oshiriladi."""
    ready(st)
    day = date.today().isoformat()
    col = "views" if kind == "view" else "downloads"
    with st._tx() as c:  # noqa: SLF001
        r = c.execute("INSERT INTO journal_hits (article_id, kind, vid, day) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING", (article_id, kind, vid, day))
        if r.rowcount:
            c.execute(f"UPDATE journal_articles SET {col} = {col} + 1 WHERE id=%s", (article_id,))
            return True
    return False


# ------------------------------------------------------------------ PDF tekshiruvi (Scholar matnli PDF talab qiladi)
def analyze_pdf(raw: bytes) -> dict:
    """{pages, has_text, encrypted, info_title, first_text, hints{title, abstract, keywords, doi, udc}} — xato bo'lsa ham ishlaydi."""
    out = {"pages": 0, "has_text": False, "encrypted": False, "info_title": "", "first_text": "", "hints": {}}
    try:
        from pypdf import PdfReader  # noqa: PLC0415

        r = PdfReader(io.BytesIO(raw), strict=False)
        if r.is_encrypted:
            out["encrypted"] = True
            try:
                r.decrypt("")
            except Exception:  # noqa: BLE001
                return out
        out["pages"] = len(r.pages)
        try:
            out["info_title"] = _s((r.metadata or {}).get("/Title") or "", 400)
        except Exception:  # noqa: BLE001
            pass
        texts = []
        for p in r.pages[:3]:
            try:
                texts.append(p.extract_text() or "")
            except Exception:  # noqa: BLE001
                texts.append("")
        out["has_text"] = sum(len(re.sub(r"\s+", "", x)) for x in texts) >= 80
        out["first_text"] = _t(texts[0] if texts else "", 3000)
        out["hints"] = pdf_hints(texts[0] if texts else "", out["info_title"])
    except Exception:  # noqa: BLE001
        pass
    return out


_ABS = r"(?:abstract|annotatsiya|аннотация|резюме|annotation|summary|аннотатсия|аңдатпа)"
_KW = r"(?:key\s*words|keywords|kalit\s+so[‘'ʻ`’]?zlar|ключевые\s+слова|tayanch\s+so[‘'ʻ`’]?zlar)"


def pdf_hints(text: str, info_title: str = "") -> dict:
    """Birinchi bet matnidan taxminiy: sarlavha, annotatsiya, kalit so'zlar, DOI, UDK (admin tekshirib tasdiqlaydi)."""
    t = text or ""
    h: dict = {}
    m = re.search(r"\b(10\.\d{4,9}/[^\s\"<>]+[^\s\"<>.,;])", t)
    if m:
        h["doi"] = m.group(1)
    m = re.search(r"(?:UDK|УДК|UDC)\s*[:.]?\s*([\d.:/()\-+\s]{1,40}\d)", t)
    if m:
        h["udc"] = re.sub(r"\s+", " ", m.group(1)).strip()
    m = re.search(_ABS + r"\s*[:.\-–—]?\s*(.+?)(?=\n\s*" + _KW + r"|\Z)", t, flags=re.I | re.S)
    if m:
        h["abstract"] = re.sub(r"\s*\n\s*", " ", m.group(1)).strip()[:4000]
    m = re.search(_KW + r"\s*[:.\-–—]\s*(.+?)(?:\n\s*\n|\n[A-ZА-ЯЁ0-9][^\n]{0,40}\n|\Z)", t, flags=re.I | re.S)
    if m:
        kws = [x.strip(" .") for x in re.split(r"[;,]", re.sub(r"\s*\n\s*", " ", m.group(1))) if 1 < len(x.strip(" .")) < 80][:15]
        if kws:
            h["keywords"] = kws
    title = info_title if info_title and len(info_title.split()) >= 3 and not re.search(r"\.(docx?|pdf)$|^microsoft", info_title, re.I) else ""
    if not title:
        lines = [x.strip() for x in t.split("\n")]
        for n, line in enumerate(lines):
            if len(line.split()) >= 4 and not re.match(r"(?:UDK|УДК|UDC|DOI|ISSN|https?://|©)", line, re.I) and not re.search(r"@|\d{4}-\d{3}[\dX]", line):
                title = line
                # sarlavha bir necha qatorga bo'lingan bo'lsa: mualliflar qatori (vergul, raqam), bo'sh qator yoki annotatsiyagacha davom etadi
                for nxt in lines[n + 1: n + 4]:
                    if not nxt or "," in nxt or re.search(r"\d|@", nxt) or re.match(_ABS + "|" + _KW, nxt, re.I) or len(title) + len(nxt) > 400:
                        break
                    title += " " + nxt
                break
    if title:
        h["title"] = title[:600]
    return h


def title_similarity(a: str, b: str) -> float:
    """0..1: sarlavha so'zlarining PDF birinchi beti matnida uchrash ulushi."""
    from .search import norm  # noqa: PLC0415

    words = [w for w in re.findall(r"\w+", norm(a)) if len(w) > 2]
    if not words:
        return 0.0
    hay = set(re.findall(r"\w+", norm(b)))
    return sum(1 for w in words if w in hay) / len(words)
