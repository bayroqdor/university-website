"""Ilmiy jurnal: CRUD va ruxsatlar, qoralama/e'lon ko'rinishi, maqola sahifasining server HTML'idagi Google Scholar (citation_*) teglari,
PDF (application/pdf, inline, kirishsiz), sitemap va robots, OAI-PMH 2.0 (fe'llar, resumptionToken, xatolar, from/until),
BibTeX/RIS, maqola yuborish formasi (fayl turi/hajmi, cheklov, «Murojaatlar»ga tushishi), sayt qidiruvi, botlar hisoblanmasligi."""
import importlib
import io
import re
import xml.etree.ElementTree as ET
import zipfile

import pytest
from fastapi.testclient import TestClient

ADMIN_PW = "Admin-parol-123"
BASE = "https://site.example"
OAI_NS = {"o": "http://www.openarchives.org/OAI/2.0/", "dc": "http://purl.org/dc/elements/1.1/", "oai_dc": "http://www.openarchives.org/OAI/2.0/oai_dc/"}
UA = {"user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"}


def make_pdf(lines: list[str] | None) -> bytes:
    """Kichik, haqiqiy PDF: lines berilsa — matn qatlami bilan (Helvetica), None — bo'sh (skanerga o'xshash, matnsiz) bet."""
    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content = b""
    if lines:
        content = ("BT /F1 14 Tf 16 TL 50 790 Td " + " ".join(f"({esc(x)}) Tj T*" for x in lines) + " ET").encode("latin-1")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offs = []
    for n, o in enumerate(objs, 1):
        offs.append(out.tell())
        out.write(b"%d 0 obj\n" % n + o + b"\nendobj\n")
    x = out.tell()
    out.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % o for o in offs))
    out.write(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, x))
    return out.getvalue()


PDF_TEXT = make_pdf(["UDC 664.1", "Demo article on sugar beet drying kinetics", "A. Testov, B. Namunova",
                     "Abstract: This is a demonstration abstract used only in automated tests.", "Keywords: drying; kinetics; demo"])


def make_docx() -> bytes:
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", "<w:document/>")
    return b.getvalue()


@pytest.fixture(scope="module")
def m(tmp_path_factory):
    import os

    static = tmp_path_factory.mktemp("static")
    (static / "index.html").write_text('<!doctype html><html lang="uz"><head><title>x</title></head><body><div id="root"></div></body></html>', encoding="utf-8")
    os.environ["SITE_DATA_DIR"] = str(tmp_path_factory.mktemp("data"))
    os.environ["SITE_STATIC_DIR"] = str(static)
    os.environ["SITE_ADMIN_PASSWORD"] = ADMIN_PW
    os.environ["SITE_URL"] = BASE
    os.environ["SITE_PREWARM"] = "0"
    import university.api.deps as deps
    import university.api.main as main

    importlib.reload(main)
    deps.reset_service()
    return main


_ADMIN: dict = {}


def admin(m):
    if id(m) not in _ADMIN:
        c = TestClient(m.app, headers={**UA, "x-forwarded-for": "10.77.0.1"})
        assert c.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
        c.headers["x-admin-realm"] = "admin"
        _ADMIN[id(m)] = c
    return _ADMIN[id(m)]


def guest(ip: str = "10.77.1.1", ua: dict | None = None) -> TestClient:
    import university.api.main as main

    return TestClient(main.app, headers={**(ua or UA), "x-forwarded-for": ip})


SETTINGS = {
    "enabled": True, "title": {"uz": "Demo ilmiy jurnal", "en": "Demo Scientific Journal"}, "abbr": "Demo J.", "issn_print": "0317-8471",
    "issn_online": "2049-3630", "publisher": {"uz": "Demo nashriyot"}, "founded": 2024, "frequency": {"uz": "Yiliga 4 marta"},
    "license": "CC BY 4.0", "email": "editor@site.example", "submission_email": "editor@site.example",
    "sections": [{"id": "food", "title": {"uz": "Oziq-ovqat texnologiyasi", "en": "Food technology"}}],
    "texts": {"about": {"uz": "Jurnal haqida demo matn.\n\n## Maqsad\n\n- birinchi\n- ikkinchi"}, "guidelines": {"uz": "Talablar: https://example.org"}},
    "board": [{"name": "Demo Muharrir", "role": "editor_in_chief", "affiliation": "University", "orcid": "https://orcid.org/0000-0002-1825-0097", "email": "x@y.uz"}],
}


@pytest.fixture(scope="module")
def data(m):
    """Yoqilgan jurnal, bitta e'lon qilingan son va unda e'lon qilingan maqola (+ qoralama son va qoralama maqola)."""
    a = admin(m)
    r = a.put("/api/admin/journal/settings", json=SETTINGS)
    assert r.status_code == 200, r.text
    up = a.post("/api/admin/journal/pdf", files={"file": ("demo.pdf", PDF_TEXT, "application/pdf")}).json()
    assert up["check"]["has_text"] and up["check"]["pages"] == 1
    iss = a.post("/api/admin/journal/issues", json={"volume": 2, "number": 1, "year": 2026, "status": "published", "published_on": "2026-03-15"}).json()
    draft_iss = a.post("/api/admin/journal/issues", json={"volume": 2, "number": 2, "year": 2026}).json()
    art = {
        "issue_id": iss["id"], "section_id": "food", "lang": "en", "title": "Demo article on sugar beet drying kinetics",
        "title_i18n": {"uz": "Qand lavlagini quritish kinetikasi (demo)"},
        "authors": [
            {"given": "Aziz", "family": "Testov", "affiliations": ["Demo Institute of Food Engineering", "Second Demo Lab"], "country": "Uzbekistan",
             "email": "secret.author@example.com", "orcid": "0000-0002-1825-0097", "corresponding": True},
            {"given": "Bonu", "family": "Namunova", "affiliations": ["Demo Institute of Food Engineering"], "country": "Uzbekistan"},
        ],
        "abstract": {"en": "This is a demonstration abstract used only in automated tests.", "uz": "Bu faqat testlar uchun namunaviy annotatsiya."},
        "keywords": {"en": ["drying", "kinetics", "demo"], "uz": ["quritish"]}, "first_page": "12", "last_page": "20", "doi": "https://doi.org/10.1234/demo.2026.1",
        "udc": "664.1", "received": "2026-01-10", "accepted": "2026-02-20", "published_on": "2026-03-10",
        "pdf": up["url"], "pdf_name": up["name"], "pdf_size": up["size"], "pdf_check": up["check"],
        "references": "1. Reference one, 2020.\n2. Reference two (2021).", "status": "published",
    }
    r = a.post("/api/admin/journal/articles", json=art)
    assert r.status_code == 200, r.text
    pub = r.json()
    hidden = a.post("/api/admin/journal/articles", json=art | {"title": "Draft only article title", "status": "draft"}).json()
    in_draft_issue = a.post("/api/admin/journal/articles", json=art | {"title": "Article in draft issue", "issue_id": draft_iss["id"]}).json()
    return {"issue": iss, "draft_issue": draft_iss, "article": pub, "hidden": hidden, "in_draft_issue": in_draft_issue, "pdf": up}


# ---------------------------------------------------------------------------------------------- holat va ruxsatlar
def test_disabled_journal_is_hidden(m):
    g = guest()
    assert g.get("/api/journal").status_code == 404
    r = g.get("/journal")
    assert r.status_code == 404 and "noindex" in r.text
    assert "/journal" not in g.get("/sitemap.xml").text
    assert g.get("/journal/oai?verb=Identify").status_code == 404


def test_permissions(m):
    from university import roles as R

    assert R.required("/api/admin/journal/articles", "POST") == ("journal",)
    assert "journal" in R.PERM_KEYS
    assert guest().get("/api/admin/journal", headers={"x-admin-realm": "admin"}).status_code in (401, 403)
    a = admin(m)
    r = a.post("/api/admin/admins", json={"login": "jeditor", "name": "Muharrir", "password": "Muharrir-parol-1", "role_id": "editor"})
    assert r.status_code == 200, r.text
    e = TestClient(m.app, headers={**UA, "x-forwarded-for": "10.77.0.9"})
    assert e.post("/api/admin/login", json={"login": "jeditor", "password": "Muharrir-parol-1"}).status_code == 200
    e.headers["x-admin-realm"] = "admin"
    assert e.get("/api/admin/journal").json()["detail"] == "no_permission"


def test_settings_validation(m):
    a = admin(m)
    assert a.put("/api/admin/journal/settings", json={"issn_print": "1234-5678"}).json()["detail"] == "invalid_issn"
    assert a.put("/api/admin/journal/settings", json={"board": [{"name": "X", "orcid": "0000-0002-1825-0098"}]}).json()["detail"] == "invalid_orcid"
    s = a.put("/api/admin/journal/settings", json={"issn_online": "20493630"}).json()
    assert s["issn_online"] == "2049-3630"


def test_crud_and_visibility(m, data):
    a = admin(m)
    art, hidden, ind = data["article"], data["hidden"], data["in_draft_issue"]
    assert art["num"] >= 1 and art["slug"] == "demo-article-on-sugar-beet-drying-kinetics" and art["doi"] == "10.1234/demo.2026.1"
    assert art["references"] == ["Reference one, 2020.", "Reference two (2021)."]
    # e'lon qilish uchun PDF majburiy
    r = a.post("/api/admin/journal/articles", json={"title": "No pdf", "issue_id": data["issue"]["id"], "authors": [{"given": "A", "family": "B"}],
                                                   "abstract": {"en": "x"}, "status": "published"})
    assert r.status_code == 400 and "pdf" in r.json()["detail"]
    lst = a.get(f"/api/admin/journal/articles?issue={data['issue']['id']}").json()["items"]
    assert {x["id"] for x in lst} >= {art["id"], hidden["id"]}
    assert a.get("/api/admin/journal/articles?q=draft only").json()["items"][0]["id"] == hidden["id"]
    g = guest()
    j = g.get("/api/journal").json()
    assert j["journal"]["issn_print"] == "0317-8471" and j["current"]["volume"] == 2 and j["current"]["number"] == 1
    assert [x["id"] for x in j["current"]["articles"]] == [art["id"]]
    assert "email" not in j["journal"]["board"][0]
    assert g.get(f"/api/journal/article/{hidden['num']}").status_code == 404
    assert g.get(f"/api/journal/article/{ind['num']}").status_code == 404
    assert g.get(f"/journal/article/{hidden['num']}/{hidden['slug']}").status_code == 404
    assert g.get("/api/journal/issue/2-2").status_code == 404
    full = g.get(f"/api/journal/article/{art['num']}").json()["article"]
    assert "secret.author@example.com" not in str(full)
    assert full["affiliations"] == ["Demo Institute of Food Engineering", "Second Demo Lab"] and full["authors"][1]["aff"] == [1]
    assert full["cite"]["apa"].startswith("Testov, A., & Namunova, B. (2026). Demo article on sugar beet drying kinetics. Demo ilmiy jurnal, 2(1), 12–20.")
    assert "Testov A., Namunova B. Demo article" in full["cite"]["gost"] and "Vol. 2, no. 1. P. 12–20." in full["cite"]["gost"]
    assert full["cite"]["mla"].startswith("Testov, Aziz, and Bonu Namunova. “Demo article on sugar beet drying kinetics.” Demo ilmiy jurnal, vol. 2, no. 1, 2026, pp. 12–20.")
    # sarlavha o'zgarsa ham URL o'zgarmaydi
    r = a.put(f"/api/admin/journal/articles/{art['id']}", json={"title": "Demo article on sugar beet drying kinetics (revised)"})
    assert r.json()["slug"] == art["slug"]
    a.put(f"/api/admin/journal/articles/{art['id']}", json={"title": art["title"]})
    # e'lon qilingan sonning raqami o'zgarmaydi; bo'sh bo'lmagan son o'chirilmaydi
    assert a.put(f"/api/admin/journal/issues/{data['issue']['id']}", json={"number": 9}).json()["detail"] == "issue_locked"
    assert a.delete(f"/api/admin/journal/issues/{data['issue']['id']}").json()["detail"] == "issue_not_empty"
    assert a.post("/api/admin/journal/issues", json={"volume": 2, "number": 1, "year": 2026}).json()["detail"] == "issue_exists"


# ---------------------------------------------------------------------------------------------- Google Scholar
def _metas(html: str) -> list[tuple[str, str]]:
    return [(n, c.replace("&amp;", "&").replace("&#x27;", "'").replace("&quot;", '"')) for n, c in re.findall(r'<meta name="([^"]+)" content="([^"]*)"', html)]


def test_article_html_has_scholar_tags(m, data):
    art = data["article"]
    r = guest(ua={"user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)"}).get(f"/journal/article/{art['num']}/{art['slug']}")
    assert r.status_code == 200
    html = r.text
    head = html.split("</head>")[0]
    tags = _metas(head)
    one = {n: c for n, c in tags}
    many = lambda n: [c for k, c in tags if k == n]  # noqa: E731
    assert one["citation_title"] == "Demo article on sugar beet drying kinetics" and len(many("citation_title")) == 1
    assert many("citation_author") == ["Testov, Aziz", "Namunova, Bonu"]
    # muassasa va ORCID — o'z muallifidan keyin
    names = [n for n, _ in tags if n.startswith("citation_author")]
    assert names[:5] == ["citation_author", "citation_author_institution", "citation_author_institution", "citation_author_orcid", "citation_author"]
    assert many("citation_author_orcid") == ["https://orcid.org/0000-0002-1825-0097"]
    assert one["citation_publication_date"] == "2026/03/15" and re.fullmatch(r"\d{4}/\d{2}/\d{2}", one["citation_online_date"])
    assert one["citation_journal_title"] == "Demo ilmiy jurnal" and one["citation_journal_abbrev"] == "Demo J."
    assert many("citation_issn") == ["0317-8471", "2049-3630"]
    assert (one["citation_volume"], one["citation_issue"], one["citation_firstpage"], one["citation_lastpage"]) == ("2", "1", "12", "20")
    assert one["citation_doi"] == "10.1234/demo.2026.1" and one["citation_language"] == "en" and one["citation_publisher"] == "Demo nashriyot"
    assert many("citation_keywords") == ["drying", "kinetics", "demo"]
    assert one["citation_abstract_html_url"] == f"{BASE}/journal/article/{art['num']}/{art['slug']}"
    assert one["citation_pdf_url"] == f"{BASE}/journal/pdf/{art['num']}/{art['slug']}.pdf"
    assert "secret.author@example.com" not in html and "citation_author_email" not in html
    assert one["DC.title"] == art["title"] and one["DC.rights"] == "https://creativecommons.org/licenses/by/4.0/" and one["prism.eIssn"] == "2049-3630"
    assert f'<link rel="canonical" href="{BASE}/journal/article/{art["num"]}/{art["slug"]}">' in head
    assert '"@type": "ScholarlyArticle"' in head and '"@type": "PublicationIssue"' in head and '"@type": "Periodical"' in head
    assert '<html lang="en">' in html
    body = html.split("<noscript>")[1]
    assert "This is a demonstration abstract" in body and "Testov" in body and f'/journal/pdf/{art["num"]}/{art["slug"]}.pdf' in body
    assert "<sup>1,2</sup>" in body and "Reference two (2021)." in body
    # noto'g'ri slug → kanonik manzilga 301; issue va arxiv sahifalari ham ochiq havolalar bilan
    rr = guest().get(f"/journal/article/{art['num']}/eski-nom", follow_redirects=False)
    assert rr.status_code == 301 and rr.headers["location"] == f"/journal/article/{art['num']}/{art['slug']}"
    iss = guest().get("/journal/issue/2-1").text
    assert f'href="{BASE}/journal/article/{art["num"]}/{art["slug"]}"' in iss and f"/journal/pdf/{art['num']}/" in iss
    assert "/journal/issue/2-1" in guest().get("/journal/archive").text
    assert guest().get("/journal/issue/2-2").status_code == 404
    home = guest().get("/journal").text
    assert "Demo ilmiy jurnal" in home and "<h2>Maqsad</h2>" in home and f"/journal/article/{art['num']}" in home


def test_pdf_endpoint(m, data):
    art = data["article"]
    g = TestClient(m.app)  # cookie'siz, kirishsiz
    r = g.get(f"/journal/pdf/{art['num']}/{art['slug']}.pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.headers["content-disposition"].startswith("inline") and r.content[:5] == b"%PDF-"
    assert g.head(f"/journal/pdf/{art['num']}/{art['slug']}.pdf").status_code == 200
    rr = g.get(f"/journal/pdf/{art['num']}/x.pdf", follow_redirects=False)
    assert rr.status_code == 301 and rr.headers["location"] == f"/journal/pdf/{art['num']}/{art['slug']}.pdf"
    assert g.get(f"/journal/pdf/{data['hidden']['num']}/{data['hidden']['slug']}.pdf").status_code == 404


def test_sitemap_and_robots(m, data):
    art = data["article"]
    sm = guest().get("/sitemap.xml").text
    assert f"<loc>{BASE}/journal</loc>" in sm and f"<loc>{BASE}/journal/issue/2-1</loc>" in sm
    assert f"<loc>{BASE}/journal/article/{art['num']}/{art['slug']}</loc>" in sm and f"<loc>{BASE}/journal/pdf/{art['num']}/{art['slug']}.pdf</loc>" in sm
    assert data["hidden"]["slug"] + "</loc>" not in sm.replace(art["slug"] + "</loc>", "") or data["hidden"]["slug"] == art["slug"]
    assert f"/journal/article/{data['hidden']['num']}/" not in sm
    # jurnal menyusi: 4 bo'lim — eski alohida sahifalar (301 bilan /journal/about#…) va /journal/search sitemap'da yo'q
    for k in ("archive", "about", "guidelines", "submit"):
        assert f"<loc>{BASE}/journal/{k}</loc>" in sm, k
    for k in ("board", "peer-review", "ethics", "open-access", "indexing", "contacts", "search"):
        assert f"/journal/{k}<" not in sm and f"/journal/{k}?" not in sm, k
    robots = guest().get("/robots.txt").text
    dis = [ln.split(":", 1)[1].strip() for ln in robots.splitlines() if ln.lower().startswith("disallow:")]
    for path in ("/journal", "/journal/archive", "/journal/about", "/journal/guidelines", "/journal/submit", "/journal/board", "/journal/search",
                 f"/journal/article/{art['num']}/{art['slug']}", f"/journal/pdf/{art['num']}/{art['slug']}.pdf", "/journal/oai", "/media/x.pdf"):
        assert not any(d and path.startswith(d) for d in dis), path  # 301 manbalari ham yopilmaydi — bot yo'naltirishni ko'rishi kerak


def test_legacy_pages_redirect_to_about_anchors(m, data):
    g = guest("10.77.8.1")
    for k in ("board", "peer-review", "ethics", "open-access", "indexing", "contacts"):
        r = g.get(f"/journal/{k}", follow_redirects=False)
        assert r.status_code == 301 and r.headers["location"] == f"/journal/about#{k}", k
        r = g.get(f"/journal/{k}/?lang=ru", follow_redirects=False)
        assert r.status_code == 301 and r.headers["location"] == f"/journal/about?lang=ru#{k}", k
        meta = g.get(f"/api/meta?path=/journal/{k}").json()  # SPA ichidagi o'tish: yangi sahifaning meta'si va canonical'i
        assert meta["status"] == 200 and meta["url"] == f"{BASE}/journal/about", k
    r = g.get("/journal/search?q=sugar+beet&year=2026", follow_redirects=False)
    assert r.status_code == 301 and r.headers["location"] == "/journal/archive?q=sugar+beet&year=2026"
    r = g.get("/journal/search", follow_redirects=False)
    assert r.status_code == 301 and r.headers["location"] == "/journal/archive"
    assert g.get("/api/meta?path=/journal/search").json()["url"] == f"{BASE}/journal/archive"
    assert g.get("/journal/board").status_code == 200  # yo'naltirishdan keyin — «Jurnal haqida»
    # yangi sahifalar va noma'lum manzil (yo'naltirilmaydi)
    for k in ("about", "guidelines", "submit", "archive"):
        assert g.get(f"/journal/{k}", follow_redirects=False).status_code == 200, k
    assert g.get("/journal/nimadir", follow_redirects=False).status_code == 404
    assert g.get("/journal/about/board", follow_redirects=False).status_code == 404


def test_about_guidelines_and_ssr_nav(m, data):
    g = guest("10.77.8.2")
    about = g.get("/journal/about").text
    head, body = about.split("</head>")[0], about.split("<noscript>")[1]
    # bitta sahifa: jurnal haqida + tahrir hay'ati + litsenziya + aloqa (mazmuni yo'q bo'limlar — chiqmaydi)
    for k in ("about", "board", "open-access", "contacts"):
        assert f'<section id="{k}">' in body, k
    for k in ("peer-review", "ethics", "indexing"):
        assert f'<section id="{k}">' not in body, k
    assert "Demo Muharrir" in body and "Jurnal haqida demo matn." in body and "editor@site.example" in body and 'rel="license"' in body
    desc = re.search(r'<meta name="description" content="([^"]*)"', head).group(1)
    assert desc.startswith("Jurnal haqida demo matn.") and "Tahrir hay’ati" in desc and "Aloqa" in desc and "0317-8471" in desc
    assert f'<link rel="canonical" href="{BASE}/journal/about">' in head
    guide = g.get("/journal/guidelines").text.split("<noscript>")[1]
    assert "Talablar:" in guide and f'href="{BASE}/journal/submit"' in guide
    assert "/journal/about#peer-review" not in guide  # taqriz siyosati matni yo'q — havola ham yo'q
    # JavaScript'siz menyu: 4 bo'lim + «Maqola yuborish»; eski sahifalarga havola yo'q
    for page in ("/journal", "/journal/archive", "/journal/about", "/journal/guidelines"):
        html = g.get(page).text.split("<noscript>")[1]
        nav = re.search(r'<nav aria-label="Ilmiy jurnal"><ul>(.*?)</ul></nav>', html).group(1)
        assert re.findall(r'href="([^"]+)"', nav) == [f"{BASE}/journal", f"{BASE}/journal/archive", f"{BASE}/journal/about", f"{BASE}/journal/guidelines",
                                                     f"{BASE}/journal/submit"], page
        assert not re.search(r"/journal/(board|peer-review|ethics|open-access|indexing|contacts|search)\b", html), page
    a = admin(m)
    a.put("/api/admin/journal/settings", json={"submissions_open": False})
    try:
        nav = re.search(r'<nav aria-label="Ilmiy jurnal"><ul>(.*?)</ul></nav>', g.get("/journal").text).group(1)
        assert "/journal/submit" not in nav
    finally:
        a.put("/api/admin/journal/settings", json={"submissions_open": True})


def test_cite_exports(m, data):
    art = data["article"]
    bib = guest().get(f"/journal/cite/{art['num']}.bib")
    assert bib.status_code == 200 and "bibtex" in bib.headers["content-type"]
    t = bib.text
    assert t.startswith("@article{testov2026_") and "author = {Testov, Aziz and Namunova, Bonu}" in t and "pages = {12--20}" in t
    assert "doi = {10.1234/demo.2026.1}" in t and "journal = {Demo ilmiy jurnal}" in t and "volume = {2}" in t
    ris = guest().get(f"/journal/cite/{art['num']}.ris")
    assert "research-info-systems" in ris.headers["content-type"]
    lines = ris.text.split("\r\n")
    assert lines[0] == "TY  - JOUR" and "AU  - Testov, Aziz" in lines and "SP  - 12" in lines and "EP  - 20" in lines and "DO  - 10.1234/demo.2026.1" in lines
    assert f"L1  - {BASE}/journal/pdf/{art['num']}/{art['slug']}.pdf" in lines and lines[-2] == "ER  - "
    assert guest().get(f"/journal/cite/{data['hidden']['num']}.bib").status_code == 404


# ---------------------------------------------------------------------------------------------- OAI-PMH
def oai(params: dict | None = None, raw: str = "") -> ET.Element:
    g = guest("10.77.2.1")
    r = g.get("/journal/oai" + (("?" + raw) if raw else ""), params=params)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/xml")
    return ET.fromstring(r.content)


def err(root: ET.Element) -> str | None:
    e = root.find("o:error", OAI_NS)
    return e.get("code") if e is not None else None


def test_oai_identify_formats_sets(m, data):
    root = oai({"verb": "Identify"})
    assert root.find("o:Identify/o:baseURL", OAI_NS).text == f"{BASE}/journal/oai"
    assert root.find("o:Identify/o:protocolVersion", OAI_NS).text == "2.0"
    assert root.find("o:Identify/o:granularity", OAI_NS).text == "YYYY-MM-DDThh:mm:ssZ"
    assert root.find("o:request", OAI_NS).get("verb") == "Identify"
    root = oai({"verb": "ListMetadataFormats"})
    assert [x.text for x in root.iter("{http://www.openarchives.org/OAI/2.0/}metadataPrefix")] == ["oai_dc"]
    assert err(oai({"verb": "ListMetadataFormats", "identifier": "oai:site.example:journal/99999"})) == "idDoesNotExist"
    sets = [x.text for x in oai({"verb": "ListSets"}).iter("{http://www.openarchives.org/OAI/2.0/}setSpec")]
    assert "issue-2-1" in sets and "section-food" in sets and "issue-2-2" not in sets


def test_oai_records_and_tokens(m, data, monkeypatch):
    from university import journal_oai

    a = admin(m)
    # ikkinchi ochiq maqola — resumptionToken sahifalashini tekshirish uchun
    second = a.post("/api/admin/journal/articles", json={
        "issue_id": data["issue"]["id"], "lang": "uz", "title": "Ikkinchi demo maqola & <test>", "authors": [{"given": "Demo", "family": "Muallif"}],
        "abstract": {"uz": "Ikkinchi namunaviy annotatsiya."}, "first_page": "21", "last_page": "30", "pdf": data["pdf"]["url"], "status": "published"}).json()
    monkeypatch.setattr(journal_oai, "PAGE", 1)
    root = oai({"verb": "ListRecords", "metadataPrefix": "oai_dc"})
    recs = root.findall("o:ListRecords/o:record", OAI_NS)
    tok = root.find("o:ListRecords/o:resumptionToken", OAI_NS)
    assert len(recs) == 1 and tok is not None and tok.get("completeListSize") == "2" and tok.get("cursor") == "0" and tok.text
    root2 = oai({"verb": "ListRecords", "resumptionToken": tok.text})
    recs2 = root2.findall("o:ListRecords/o:record", OAI_NS)
    tok2 = root2.find("o:ListRecords/o:resumptionToken", OAI_NS)
    assert len(recs2) == 1 and tok2 is not None and not (tok2.text or "").strip() and tok2.get("cursor") == "1"
    ids = {r.find("o:header/o:identifier", OAI_NS).text for r in recs + recs2}
    assert ids == {f"oai:site.example:journal/{data['article']['num']}", f"oai:site.example:journal/{second['num']}"}
    titles = [t.text for r in recs + recs2 for t in r.iter("{http://purl.org/dc/elements/1.1/}title")]
    assert "Ikkinchi demo maqola & <test>" in titles  # XML escape to'g'ri: ElementTree o'qiy oldi
    rec = next(r for r in recs + recs2 if r.find("o:header/o:identifier", OAI_NS).text.endswith(f"/{data['article']['num']}"))
    dc = rec.find("o:metadata/oai_dc:dc", OAI_NS)
    creators = [x.text for x in dc.findall("dc:creator", OAI_NS)]
    assert creators == ["Testov, Aziz", "Namunova, Bonu"]
    assert f"{BASE}/journal/pdf/{data['article']['num']}/{data['article']['slug']}.pdf" in [x.text for x in dc.findall("dc:relation", OAI_NS)]
    assert "https://doi.org/10.1234/demo.2026.1" in [x.text for x in dc.findall("dc:identifier", OAI_NS)]
    assert "secret.author@example.com" not in ET.tostring(root).decode() + ET.tostring(root2).decode()
    # ListIdentifiers + set + from/until
    li = oai({"verb": "ListIdentifiers", "metadataPrefix": "oai_dc", "set": "issue-2-1", "from": "2000-01-01", "until": "2099-12-31"})
    assert li.find("o:ListIdentifiers/o:header", OAI_NS) is not None
    assert err(oai({"verb": "ListIdentifiers", "metadataPrefix": "oai_dc", "from": "2099-01-01"})) == "noRecordsMatch"
    assert err(oai({"verb": "ListIdentifiers", "metadataPrefix": "oai_dc", "until": "2000-01-01T00:00:00Z"})) == "noRecordsMatch"
    assert err(oai({"verb": "ListIdentifiers", "metadataPrefix": "oai_dc", "from": "2026-01-01", "until": "2025-01-01"})) == "badArgument"
    assert err(oai({"verb": "ListIdentifiers", "metadataPrefix": "oai_dc", "from": "2026-01-01", "until": "2026-12-31T00:00:00Z"})) == "badArgument"
    assert err(oai({"verb": "ListIdentifiers", "metadataPrefix": "oai_dc", "from": "2026-13-45"})) == "badArgument"
    assert err(oai({"verb": "ListIdentifiers", "metadataPrefix": "oai_dc", "set": "issue-9-9"})) == "noRecordsMatch"
    # GetRecord
    g = oai({"verb": "GetRecord", "metadataPrefix": "oai_dc", "identifier": f"oai:site.example:journal/{data['article']['num']}"})
    assert g.find("o:GetRecord/o:record/o:header/o:datestamp", OAI_NS).text.endswith("Z")
    assert err(oai({"verb": "GetRecord", "metadataPrefix": "oai_dc", "identifier": "oai:site.example:journal/99999"})) == "idDoesNotExist"
    assert err(oai({"verb": "GetRecord", "metadataPrefix": "oai_dc", "identifier": f"oai:site.example:journal/{data['hidden']['num']}"})) == "idDoesNotExist"
    assert err(oai({"verb": "GetRecord", "metadataPrefix": "marc21", "identifier": f"oai:site.example:journal/{data['article']['num']}"})) == "cannotDisseminateFormat"
    # xatolar
    bad = oai({"verb": "Nope"})
    assert err(bad) == "badVerb" and bad.find("o:request", OAI_NS).attrib == {}
    assert err(oai({})) == "badVerb"
    assert err(oai({"verb": "ListRecords"})) == "badArgument"
    assert err(oai({"verb": "ListRecords", "metadataPrefix": "oai_dc", "foo": "1"})) == "badArgument"
    assert err(oai({"verb": "ListRecords", "metadataPrefix": "nope"})) == "cannotDisseminateFormat"
    assert err(oai({"verb": "ListRecords", "resumptionToken": "garbage!!"})) == "badResumptionToken"
    assert err(oai({"verb": "ListRecords", "resumptionToken": tok.text, "metadataPrefix": "oai_dc"})) == "badArgument"
    assert err(oai({"verb": "ListIdentifiers", "resumptionToken": tok.text})) == "badResumptionToken"
    assert err(oai(raw="verb=Identify&verb=Identify")) == "badVerb"
    assert err(oai(raw="verb=ListRecords&metadataPrefix=oai_dc&metadataPrefix=oai_dc")) == "badArgument"
    # POST ham ishlaydi
    r = guest("10.77.2.2").post("/journal/oai", data={"verb": "Identify"})
    assert ET.fromstring(r.content).find("o:Identify", OAI_NS) is not None
    a.delete(f"/api/admin/journal/articles/{second['id']}")


# ---------------------------------------------------------------------------------------------- yuborish formasi
FORM = {"name": "Demo Muallif", "email": "demo.author@example.com", "affiliation": "Demo universiteti", "title": "Demo qo‘lyozma sarlavhasi",
        "abstract": "Bu qo‘lyozma annotatsiyasi testlar uchun yozilgan va kamida ellik belgidan iborat bo‘lishi kerak."}


def test_submission(m, data, monkeypatch):
    from university import journal as J

    g = guest("10.77.3.1")
    r = g.post("/api/journal/submit", data=FORM, files={"file": ("virus.exe", b"MZ....", "application/octet-stream")})
    assert r.status_code == 400 and r.json()["detail"] == "bad_file_type"
    r = guest("10.77.3.2").post("/api/journal/submit", data=FORM, files={"file": ("fake.pdf", b"not a pdf", "application/pdf")})
    assert r.json()["detail"] == "bad_file_type"
    monkeypatch.setattr(J, "SUBMIT_MAX", 100)
    r = guest("10.77.3.3").post("/api/journal/submit", data=FORM, files={"file": ("big.pdf", PDF_TEXT, "application/pdf")})
    assert r.json()["detail"] == "too_large"
    monkeypatch.setattr(J, "SUBMIT_MAX", 20 * 1024 * 1024)
    r = guest("10.77.3.4").post("/api/journal/submit", data=FORM | {"abstract": "qisqa"}, files={"file": ("a.docx", make_docx(), "application/octet-stream")})
    assert r.status_code == 400 and r.json()["detail"]["fields"] == ["abstract"]
    g = guest("10.77.3.5")
    r = g.post("/api/journal/submit", data=FORM, files={"file": ("Maqola.docx", make_docx(), "application/octet-stream")})
    assert r.status_code == 200, r.text
    num = r.json()["ticket"]
    # honeypot — jim qabul (chipta yaratilmaydi)
    assert guest("10.77.3.6").post("/api/journal/submit", data=FORM | {"hp": "bot"}).json() == {"ok": True}
    # cheklov: 10 daqiqada 3 ta
    for _ in range(2):
        g.post("/api/journal/submit", data=FORM, files={"file": ("Maqola.pdf", PDF_TEXT, "application/pdf")})
    assert g.post("/api/journal/submit", data=FORM, files={"file": ("Maqola.pdf", PDF_TEXT, "application/pdf")}).status_code == 429
    a = admin(m)
    subs = a.get("/api/admin/journal/submissions").json()["items"]
    mine = next(x for x in subs if x["number"] == num)
    assert mine["title"] == FORM["title"] and mine["files"][0]["name"] == "Maqola.docx"
    f = a.get(mine["files"][0]["url"])
    assert f.status_code == 200 and f.content[:2] == b"PK"
    board = a.get("/api/admin/desk").json()
    t = next(x for x in board["tickets"] if x["number"] == num)
    assert t["category"]["title"] == "Jurnal tahririyati" and t["source"] == "journal"
    assert guest("10.77.3.7").get(mine["files"][0]["url"]).status_code in (401, 403)


# ---------------------------------------------------------------------------------------------- qidiruv va hisoblagichlar
def test_search(m, data):
    items = guest("10.77.4.1").get("/api/search?q=sugar beet").json()["items"]
    hit = next(x for x in items if x["type"] == "article")
    assert hit["to"] == f"/journal/article/{data['article']['num']}/{data['article']['slug']}"
    assert not any("Draft only" in x["title"] for x in guest("10.77.4.1").get("/api/search?q=draft only article").json()["items"])
    g = guest("10.77.4.2")
    assert g.get("/api/journal/search?author=namunova").json()["total"] == 1
    assert g.get("/api/journal/search?keyword=kinetics&year=2026").json()["total"] == 1
    assert g.get("/api/journal/search?year=2025").json()["total"] == 0
    assert g.get("/api/journal/search?q=quritish").json()["total"] == 1


def test_counters_ignore_bots(m, data):
    art = data["article"]
    a = admin(m)
    before = a.get(f"/api/admin/journal/articles/{art['id']}").json()
    bot = guest("10.77.5.1", ua={"user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"})
    bot.get(f"/journal/pdf/{art['num']}/{art['slug']}.pdf")
    assert bot.post(f"/api/journal/article/{art['num']}/view").json()["counted"] is False
    person = guest("10.77.5.2")
    person.get(f"/journal/pdf/{art['num']}/{art['slug']}.pdf")
    person.get(f"/journal/pdf/{art['num']}/{art['slug']}.pdf")  # bir kunda bir marta
    assert person.post(f"/api/journal/article/{art['num']}/view").json()["counted"] is True
    assert person.post(f"/api/journal/article/{art['num']}/view").json()["counted"] is False
    after = a.get(f"/api/admin/journal/articles/{art['id']}").json()
    assert after["downloads"] == before["downloads"] + 1 and after["views"] == before["views"] + 1


def test_pdf_check_and_hints(m):
    from university import journal as J

    c = J.analyze_pdf(PDF_TEXT)
    assert c["has_text"] and c["pages"] == 1 and "sugar beet" in c["first_text"]
    assert c["hints"]["title"] == "Demo article on sugar beet drying kinetics"
    assert c["hints"]["udc"] == "664.1" and "demonstration abstract" in c["hints"]["abstract"] and c["hints"]["keywords"] == ["drying", "kinetics", "demo"]
    blank = J.analyze_pdf(make_pdf(None))
    assert blank["pages"] == 1 and blank["has_text"] is False
    assert J.title_similarity("Demo article on sugar beet drying kinetics", c["first_text"]) == 1.0
    assert admin(m).post("/api/admin/journal/pdf", files={"file": ("x.pdf", b"hello", "application/pdf")}).json()["detail"] == "not_pdf"
    assert J.norm_issn("0317847-1") == "0317-8471"
    assert J.norm_orcid("https://orcid.org/0000-0002-1694-233X") == "0000-0002-1694-233X"
    with pytest.raises(ValueError):
        J.norm_doi("doi.org/11.1/x")


# ---------------------------------------------------------------------------------------------- admin ko'rib chiqishi va saytda ko'rinish holati
def test_settings_default_enabled_on_first_title():
    """Regressiya: o'chirgich standart holatda «o'chiq» edi — admin nom yozib saqlagach ham jurnal 404 berardi.
    Endi hali hal qilinmagan (None) holat birinchi nom bilan saqlanganda yoqiladi; admin o'chirgan bo'lsa — tegilmaydi."""
    import copy

    from university import journal as J

    fresh = copy.deepcopy(J.DEFAULT)
    assert fresh["enabled"] is None
    assert J.clean_settings({"publisher": {"uz": "N"}}, fresh)["enabled"] is None  # nomsiz — hali hal qilinmagan
    assert J.clean_settings({"title": {"uz": "Jurnal"}}, fresh)["enabled"] is True
    assert J.clean_settings({"title": {"uz": "Jurnal"}, "enabled": None}, fresh)["enabled"] is True
    assert J.clean_settings({"title": {"uz": "Jurnal"}, "enabled": False}, fresh)["enabled"] is False
    assert J.clean_settings({"title": {"uz": "Jurnal"}}, fresh | {"enabled": False})["enabled"] is False  # eski o'rnatish: admin qarori saqlanadi


def _admin_client(m, login: str, role: str, ip: str) -> TestClient:
    a = admin(m)
    r = a.post("/api/admin/admins", json={"login": login, "name": login, "password": "Parol-uchun-12345", "role_id": role})
    assert r.status_code == 200, r.text
    c = TestClient(m.app, headers={**UA, "x-forwarded-for": ip})
    assert c.post("/api/admin/login", json={"login": login, "password": "Parol-uchun-12345"}).status_code == 200
    return c  # realm sarlavhasisiz — ochiq saytni ochgan brauzer kabi (faqat cookie)


def test_admin_preview_hidden_and_draft_pages(m, data):
    """«Saytda» havolasi admin uchun hech qachon 404 bermaydi: yashirin jurnal, qoralama son va maqola admin sessiyasida (cookie) ochiladi —
    sabablar («preview») va noindex bilan; oddiy tashrif buyuruvchi va «journal» ruxsati yo'q admin — 404."""
    a = admin(m)
    site = TestClient(m.app, headers={**UA, "x-forwarded-for": "10.77.0.1"}, cookies=dict(a.cookies))  # o'sha admin brauzeri, ochiq sayt
    anon = guest("10.77.6.1")
    editor = _admin_client(m, "jprev_editor", "editor", "10.77.6.2")
    hidden, ind = data["hidden"], data["in_draft_issue"]

    # qoralama maqola (jurnal yoqilgan)
    r = site.get(f"/api/journal/article/{hidden['num']}")
    assert r.status_code == 200 and r.json()["article"]["draft"] is True
    assert [x["code"] for x in r.json()["preview"]] == ["article_draft"] and r.json()["preview"][0]["fix"] == f"/admin/journal/articles/{hidden['id']}"
    assert "no-store" in r.headers["cache-control"]
    assert anon.get(f"/api/journal/article/{hidden['num']}").status_code == 404
    assert editor.get(f"/api/journal/article/{hidden['num']}").status_code == 404
    page = site.get(f"/journal/article/{hidden['num']}/{hidden['slug']}")
    assert page.status_code == 200 and 'name="robots" content="noindex' in page.text and "Draft only article title" in page.text
    assert anon.get(f"/journal/article/{hidden['num']}/{hidden['slug']}").status_code == 404
    # e'lon qilingan maqola, lekin soni qoralama
    r = site.get(f"/api/journal/article/{ind['num']}").json()
    assert [x["code"] for x in r["preview"]] == ["issue_draft"] and "2-jild, 2-son" in r["preview"][0]["text"]
    assert site.get(f"/journal/pdf/{ind['num']}/{ind['slug']}.pdf").status_code == 200
    assert anon.get(f"/journal/pdf/{ind['num']}/{ind['slug']}.pdf").status_code == 404
    assert site.get(f"/journal/cite/{ind['num']}.bib").status_code == 200 and anon.get(f"/journal/cite/{ind['num']}.bib").status_code == 404
    # qoralama son va arxiv/bosh sahifadagi qoralamalar
    iss = site.get("/api/journal/issue/2-2").json()
    assert iss["issue"]["draft"] is True and iss["preview"][0]["code"] == "issue_draft" and {x["id"] for x in iss["articles"]} == {ind["id"]}
    assert anon.get("/api/journal/issue/2-2").status_code == 404
    assert site.get("/journal/issue/2-2").status_code == 200 and anon.get("/journal/issue/2-2").status_code == 404
    arch = site.get("/api/journal/archive").json()
    assert {i["key"] for i in arch["issues"]} == {"2-1", "2-2"} and arch["preview"][0]["code"] == "drafts_listed"
    assert {i["key"] for i in anon.get("/api/journal/archive").json()["issues"]} == {"2-1"}
    # ochiq sahifa admin uchun ham o'zgarishsiz: sabab yo'q, noindex yo'q, Scholar teglari bor
    art = data["article"]
    pub = site.get(f"/api/journal/article/{art['num']}").json()
    assert "preview" not in pub and pub["article"]["draft"] is False
    html = site.get(f"/journal/article/{art['num']}/{art['slug']}").text
    assert "noindex" not in html and 'name="citation_title"' in html
    # muharrir ko'rishi hisoblanmaydi
    assert site.post(f"/api/journal/article/{art['num']}/view").json()["counted"] is False
    assert site.post(f"/api/journal/article/{hidden['num']}/view").json()["counted"] is False  # qoralama ham — 404 emas

    # jurnal butunlay yashirin: admin — 200 + sabab, boshqalar — 404
    a.put("/api/admin/journal/settings", json={"enabled": False})
    try:
        r = site.get("/api/journal")
        assert r.status_code == 200 and r.json()["preview"][0]["code"] == "journal_off" and r.json()["journal"]["title"] == "Demo ilmiy jurnal"
        assert anon.get("/api/journal").status_code == 404 and editor.get("/api/journal").status_code == 404
        home = site.get("/journal")
        assert home.status_code == 200 and 'name="robots" content="noindex' in home.text
        assert anon.get("/journal").status_code == 404 and editor.get("/journal").status_code == 404
        for pth in ("/journal/about", "/journal/guidelines", "/journal/board"):
            assert site.get(f"/api/meta?path={pth}").json()["status"] == 200, pth
            assert anon.get(f"/api/meta?path={pth}").json()["status"] == 404, pth
        page = site.get("/journal/about")
        assert page.status_code == 200 and 'name="robots" content="noindex' in page.text and "Jurnal haqida — Demo ilmiy jurnal" in page.text
        assert anon.get("/journal/about").status_code == 404
        assert site.get("/api/journal/search?q=demo").json()["total"] >= 1
        assert "/journal" not in anon.get("/sitemap.xml").text  # sitemap va OAI yozuvlari — faqat ochiq
    finally:
        a.put("/api/admin/journal/settings", json={"enabled": True})
    assert anon.get("/api/journal").status_code == 200


def test_admin_status_panel_and_article_visibility(m, data):
    a = admin(m)
    d = a.get("/api/admin/journal").json()["status"]
    assert d["visible"] is True and d["ready"] is True and d["counts"]["articles"] == 1
    stuck = [w for w in d["warnings"] if w["action"]["kind"] == "publish_issue"]
    assert stuck and stuck[0]["action"]["id"] == data["draft_issue"]["id"] and "2-jild, 2-son" in stuck[0]["text"]
    v = a.get(f"/api/admin/journal/articles/{data['in_draft_issue']['id']}").json()["visibility"]
    assert v["public"] is False and [x["code"] for x in v["reasons"]] == ["issue_draft"] and v["issue_status"] == "draft"
    assert a.get(f"/api/admin/journal/articles/{data['article']['id']}").json()["visibility"] == {"public": True, "reasons": [], "issue_status": "published"}
    a.put("/api/admin/journal/settings", json={"enabled": False})
    try:
        d = a.get("/api/admin/journal").json()["status"]
        assert d["visible"] is False and d["prompt"] is True  # nomi bor, e'lon qilingan maqola bor, lekin o'chiq — «Saytda ko'rsatish» taklifi
        step = next(x for x in d["steps"] if x["code"] == "enabled")
        assert step["ok"] is False and step["action"]["kind"] == "enable"
        v = a.get(f"/api/admin/journal/articles/{data['article']['id']}").json()["visibility"]
        assert [x["code"] for x in v["reasons"]] == ["journal_off"]
    finally:
        a.put("/api/admin/journal/settings", json={"enabled": True})


def test_diagnose_steps_for_new_journal():
    """Yangi jurnal: qadamlar tartibi va bir bosishda tuzatish amallari (bo'sh baza o'rniga soxta storage)."""
    from university import journal as J

    class St:
        def __init__(self, kv, iss, arts):
            self.kv, self.iss, self.arts = kv, iss, arts

    calls = {}

    def run(kv, iss, arts):
        st = St(kv, iss, arts)
        orig = (J.settings, J.issues, J.articles)
        J.settings = lambda s: {**J.DEFAULT, **s.kv}  # noqa: E731
        J.issues = lambda s, public=False: [i for i in s.iss if not public or i["status"] == "published"]  # noqa: E731
        J.articles = lambda s, **kw: s.arts  # noqa: E731
        try:
            return J.diagnose(st)
        finally:
            J.settings, J.issues, J.articles = orig
            calls["n"] = calls.get("n", 0) + 1

    d = run({}, [], [])
    assert [x["ok"] for x in d["steps"]] == [False, False, False, False] and d["steps"][0]["action"]["kind"] == "settings"
    assert d["steps"][1]["action"] is None and "avtomatik" in d["steps"][1]["text"]  # nomi saqlangach o'zi yoqiladi
    assert d["steps"][2]["action"]["kind"] == "new_issue" and d["steps"][3]["action"] == {"kind": "new_article", "label": "Maqola qo‘shish", "disabled": True}
    issue = {"id": "i1", "volume": 1, "number": 1, "year": 2026, "status": "draft"}
    art = {"id": "a1", "num": 1, "title": "T", "status": "published", "issue_id": "i1", "authors": [{"family": "A"}], "pdf": "/media/x.pdf", "abstract": {"uz": "x"}}
    d = run({"title": {"uz": "J"}, "enabled": False}, [issue], [art])
    assert d["prompt"] is True and d["steps"][1]["action"]["kind"] == "enable"
    assert d["steps"][2]["action"] == {"kind": "publish_issue", "label": "Sonni nashr qilish", "id": "i1"}
    assert d["steps"][3]["action"] is None and "qoralama" in d["steps"][3]["text"]  # o'sha son — tugma takrorlanmaydi
    d = run({"title": {"uz": "J"}, "enabled": True}, [issue | {"status": "published"}], [art])
    assert d["ready"] is True and d["visible"] is True and not d["warnings"]


def test_menu_updates_immediately_after_admin_change(m, data):
    """Regressiya: menyu keshi (60 s) admin o'zgarishidan keyin tozalanmasdi — yoqilgan jurnal/yangi bo'lim menyuda darhol ko'rinmasdi."""
    from university import menu_sections as MS

    a = admin(m)
    g = guest("10.77.7.1")

    def urls() -> set[str]:
        menu = g.get("/api/site").json()["site"]["menu"]
        return {x.get("url") for top in menu for x in [top, *(top.get("children") or [])]}

    a.put("/api/admin/journal/settings", json={"enabled": False})
    try:
        MS.reset()
        assert "/journal" not in urls()  # kesh to'ldi (jurnal yashirin)
        a.put("/api/admin/journal/settings", json={"enabled": True})
        assert "/journal" in urls()  # TTL kutilmaydi
        a.put("/api/admin/journal/settings", json={"enabled": False})
        assert "/journal" not in urls()
    finally:
        a.put("/api/admin/journal/settings", json={"enabled": True})
    # umumiy: istalgan admin saqlashi (masalan, /api/admin/items) — birinchi startap qo'shilishi bilan /startups menyuda
    from university.api.deps import svc as _svc

    if not _svc().st.list_items("startup", public=True):
        assert "/startups" not in urls()
        r = a.post("/api/admin/items/startup", json={"title": "Menyu testi startapi", "summary": "Qisqa.", "status": "published"})
        assert r.status_code == 200, r.text
        assert "/startups" in urls()
        a.delete(f"/api/admin/items/startup/{r.json()['id']}")
        assert "/startups" not in urls()
