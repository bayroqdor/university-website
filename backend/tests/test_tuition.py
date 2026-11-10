"""Kontrakt narxlari, SEO (narxlar, institut nomlari, sarlavha uzunligi) va eski domendan 301 yo'naltirish."""
from __future__ import annotations

import importlib
import json
import re

import pytest
from fastapi.testclient import TestClient

from university import content as C
from university import tuition as T

ADMIN_PW = "Admin-Tu-12345"


def test_fees_field_and_sentence():
    v = C.clean_field(("fees",), [{"form": "day", "amount": "18 500 000", "old": "20000000"}, {"form": "day", "amount": 5},
                                  {"form": "night", "amount": 5}, {"form": "evening", "amount": "inf"}, {"form": "extramural", "amount": 12_000_000, "old": 100}])
    assert v == [{"form": "day", "amount": 18_500_000, "old": 20_000_000}, {"form": "extramural", "amount": 12_000_000}]
    assert T.min_fee({"fees": v}) == 12_000_000
    assert T.fee_sentence({"fees": v[:1]}, "uz") == "Kontrakt: yiliga 18 500 000 so‘m (kunduzgi)."
    assert T.fee_sentence({"fees": v[:1]}, "en") == "Tuition: UZS 18,500,000 per year (full-time)."
    assert re.fullmatch(r"\d{4}/\d{4}", T.academic_year())
    s = T.clean({"show": True, "usd_rate": "12800", "highlights": {"uz": "Bir\n\nIkki"}, "note": {"ru": "x"}}, {})
    assert s["usd_rate"] == 12800 and s["highlights"]["uz"] == ["Bir", "Ikki"] and s["demo"] is False


@pytest.fixture(scope="module")
def m(tmp_path_factory):
    import os

    static = tmp_path_factory.mktemp("static")
    (static / "index.html").write_text('<!doctype html><html lang="uz"><head><title>x</title></head><body><div id="root"></div></body></html>', encoding="utf-8")
    os.environ["SITE_DATA_DIR"] = str(tmp_path_factory.mktemp("data"))
    os.environ["SITE_STATIC_DIR"] = str(static)
    os.environ["SITE_ADMIN_PASSWORD"] = ADMIN_PW
    os.environ["SITE_PREWARM"] = "0"
    import university.api.deps as deps
    import university.api.main as main

    importlib.reload(main)
    deps.reset_service()
    return main


def _ld(html: str) -> list[dict]:
    return json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S).group(1))["@graph"]


PROG = "dasturiy-injiniring"


def _title(html: str) -> str:
    return re.search(r"<title>(.*?)</title>", html).group(1)


def test_tuition_api_and_seo(m):
    a = TestClient(m.app, headers={"x-forwarded-for": "10.98.1.1"})
    assert a.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
    a.headers["x-admin-realm"] = "admin"
    # Boshlang'ich holatda dasturlar yo'q — test uchun fakultet va yo'nalishlar yaratamiz
    fac = a.post("/api/admin/items/faculty", json={"title": "Muhandislik fakulteti", "slug": "muhandislik", "status": "published"}).json()
    for slug, title, ru_title, en_title, deg, langs in (
        (PROG, "Dasturiy injiniring", "Программная инженерия", "Software Engineering", "bachelor", ["uz", "ru"]),
        ("dasturiy-injiniring-1-1", "Dasturiy injiniring (1+1)", "Программная инженерия (1+1)", "Software Engineering (1+1)", "joint", ["uz", "ru"]),
        ("suniy-intellekt-phd", "Sun’iy intellekt", "Искусственный интеллект", "Artificial Intelligence", "phd", ["uz"]),
    ):
        a.post("/api/admin/items/program", json={
            "title": title, "slug": slug, "faculty_id": fac["id"], "degree": deg, "languages": langs, "status": "published",
            "i18n": {"ru": {"title": ru_title}, "en": {"title": en_title}},
        })
    g = TestClient(m.app)
    # yangi baza: taxminiy narx yo'q, narxlar bloki saytda yashirin (admin haqiqiy summalarni kiritadi)
    ov = a.get("/api/admin/tuition").json()
    assert ov["settings"]["show"] is False and ov["settings"]["demo"] and len(ov["programs"]) == 3
    assert all(x["fees"] == [] for x in ov["programs"])
    assert {x["slug"] for x in ov["programs"]} >= {PROG, "dasturiy-injiniring-1-1", "suniy-intellekt-phd"}
    site = g.get("/api/site?lang=ru").json()
    assert site["tuition"] is None and site["former_domains"] == [] and site["langs"] == ["uz", "ru", "en"]
    # narxsiz: sarlavha va tavsifda «kontrakt» yo'q, lekin yo'nalishlar ro'yxati bor
    for lang in ("uz", "ru", "en"):
        hp = g.get(f"/programs?lang={lang}").text
        t = _title(hp)
        assert len(t) <= 70 and "kontrakt" not in t.lower() and "контракт" not in t.lower() and "fees" not in t.lower()
        assert any(n.get("@type") == "ItemList" for n in _ld(hp))
        assert len(_title(g.get(f"/admission?lang={lang}").text)) <= 70
    desc = re.search(r'<meta name="description" content="([^"]+)"', g.get("/programs").text).group(1)
    assert "3 ta ta’lim dasturi" in desc and "Kontrakt" not in desc
    prog = next(n for n in _ld(g.get(f"/programs/{PROG}").text) if n.get("@type") == "EducationalOccupationalProgram")
    assert "offers" not in prog and prog["educationalCredentialAwarded"] == "Bachelor's degree" and prog["timeToComplete"] == "P4Y"
    phd = next(n for n in _ld(g.get("/programs/suniy-intellekt-phd").text) if n.get("@type") == "EducationalOccupationalProgram")
    assert phd["educationalCredentialAwarded"].endswith("(PhD)") and phd["timeToComplete"] == "P3Y" and phd["programPrerequisites"] == "Master's degree"
    joint = next(n for n in _ld(g.get("/programs/dasturiy-injiniring-1-1").text) if n.get("@type") == "EducationalOccupationalProgram")
    assert "1+1" in joint["educationalCredentialAwarded"] and joint["timeToComplete"] == "P2Y"
    # admin narxni kiritadi va ko'rsatishni yoqadi + izoh tarjimasi
    p = next(x for x in ov["programs"] if x["slug"] == PROG)
    p["fees"] = [{"form": "day", "amount": 21_000_000, "old": 24_000_000}]
    p["fee_note"] = "Grant o‘rinlari bor"
    p["fee_note_i18n"] = {"ru": "Есть грантовые места"}
    r = a.put("/api/admin/tuition", json={"settings": {**ov["settings"], "show": True, "usd_rate": 12800}, "programs": [p]}).json()
    assert r["settings"]["demo"] is False and r["settings"]["show"] is True and r["settings"]["usd_rate"] == 12800
    site = g.get("/api/site?lang=ru").json()
    assert site["tuition"]["year"] and site["tuition"]["highlights"] == T.DEFAULT_HIGHLIGHTS["ru"]
    it = g.get(f"/api/programs/{PROG}?lang=ru").json()["item"]
    assert it["fees"] == [{"form": "day", "amount": 21_000_000, "old": 24_000_000}] and it["fee_note"] == "Есть грантовые места"
    # SEO: narx JSON-LD'da, tavsifda, yo'nalishlar sahifasi sarlavhasida
    h = g.get(f"/programs/{PROG}").text
    prog = next(n for n in _ld(h) if n.get("@type") == "EducationalOccupationalProgram")
    assert prog["offers"][0]["price"] == 21_000_000 and prog["offers"][0]["priceCurrency"] == "UZS" and prog["inLanguage"] == ["uz", "ru"]
    assert 'content="Kontrakt: yiliga 21 000 000 so‘m (kunduzgi).' in h
    hp = g.get("/programs").text
    title = _title(hp)
    assert "kontrakt narxlari" in title and len(title) <= 70
    assert any(n.get("@type") == "ItemList" for n in _ld(hp))
    assert "21 000 000" in hp  # JS'siz botlar uchun matnda ham
    assert "Kontrakt 21 000 000 so‘m – 21 000 000 so‘m yiliga." in re.search(r'<meta name="description" content="([^"]+)"', hp).group(1)
    # bosh sahifa: sarlavha <= 70 belgi (har tilda), eski institut nomlari yo'q
    for lang in ("uz", "ru", "en"):
        assert len(_title(g.get(f"/?lang={lang}").text)) <= 70
    home = g.get("/").text
    org = _ld(home)[0]
    assert not org.get("alternateName")
    assert "Dasturiy injiniring" in org["knowsAbout"]
    kw = re.search(r'<meta name="keywords" content="([^"]+)"', home).group(1).lower()
    assert "bakalavriat" in kw and "magistratura" in kw
    assert not re.search(r"iifte|kore|ukiu|topik", home, re.I)
    assert not re.search(r"iifte|kore|ukiu", g.get("/?lang=ru").text + g.get("/?lang=en").text, re.I)
    offers = org["hasOfferCatalog"]["itemListElement"]
    assert any(o.get("price") == 21_000_000 for o in offers)
    assert {o["itemOffered"]["educationalCredentialAwarded"] for o in offers} >= {"Bachelor's degree", "Doctor of Philosophy (PhD)"}
    assert g.get("/api/meta", params={"path": f"/programs/{PROG}"}).json()["title"].startswith("Dasturiy injiniring")
    # bo'lim sahifalari tavsifi har xil
    d1 = re.search(r'<meta name="description" content="([^"]+)"', g.get("/news").text).group(1)
    d2 = re.search(r'<meta name="description" content="([^"]+)"', g.get("/faculties").text).group(1)
    assert d1 != d2 and "kafedralari" in d2
    # narxlar yashirilsa — API, sayt va JSON-LD'da yo'q
    a.put("/api/admin/tuition", json={"settings": {**r["settings"], "show": False}})
    assert g.get("/api/site").json()["tuition"] is None
    assert "fees" not in g.get(f"/api/programs/{PROG}").json()["item"]
    assert all("fees" not in x for x in g.get("/api/programs").json()["items"])
    prog = next(n for n in _ld(g.get(f"/programs/{PROG}").text) if n.get("@type") == "EducationalOccupationalProgram")
    assert "offers" not in prog
    # admin uchun narxlar saqlanib qoladi
    assert next(x for x in a.get("/api/admin/tuition").json()["programs"] if x["slug"] == PROG)["fees"][0]["amount"] == 21_000_000
    a.put("/api/admin/tuition", json={"settings": {**r["settings"], "show": True}})
    assert TestClient(m.app).get("/api/admin/tuition").status_code in (401, 403)


def test_old_domain_redirect_and_demo_migration(m, monkeypatch):
    monkeypatch.delenv("SITE_URL", raising=False)
    a = TestClient(m.app, headers={"x-forwarded-for": "10.98.1.2"})
    assert a.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
    a.headers["x-admin-realm"] = "admin"
    g = TestClient(m.app, follow_redirects=False)
    # standart holatda eski domen yo'q — hech narsa yo'naltirilmaydi
    assert a.put("/api/admin/site", json={"url": "https://example.edu"}).status_code == 200
    assert g.get("/uz/qabul/", headers={"host": "old-example.edu"}).status_code != 301
    assert g.get("/api/site").json()["former_domains"] == []
    # admin eski domenlarni kiritadi; sayt manzili ko'rsatilmaguncha yo'naltirilmaydi
    a.put("/api/admin/site", json={"url": "", "seo": {"old_domains": "old-example.edu, www.old-example.edu"}})
    assert g.get("/uz/qabul/", headers={"host": "old-example.edu"}).status_code != 301
    assert g.get("/api/site").json()["former_domains"] == ["old-example.edu"]
    assert a.put("/api/admin/site", json={"url": "https://example.edu"}).status_code == 200
    r = g.get("/uz/qabul/", headers={"host": "old-example.edu"})
    assert r.status_code == 301 and r.headers["location"] == "https://example.edu/admission"
    assert g.get("/ru/study/22/", headers={"host": "www.old-example.edu"}).headers["location"] == "https://example.edu/programs?lang=ru"
    assert g.get("/", headers={"host": "old-example.edu"}).headers["location"] == "https://example.edu/"
    assert g.get("/uz/qabul/", headers={"host": "example.edu"}).status_code != 301
    # admin eski domenlar ro'yxatini o'zgartirsa
    a.put("/api/admin/site", json={"seo": {"old_domains": "https://old.example.uz/"}})
    assert g.get("/", headers={"host": "old-example.edu"}).status_code != 301
    assert g.get("/", headers={"host": "old.example.uz"}).status_code == 301
    a.put("/api/admin/site", json={"url": "", "seo": {}})
    # ishlab turgan bazada: standart holatda namunaviy narx yo'q — yo'nalish narxsiz qoladi, sozlama yaratilmaydi
    s = m.svc()
    s.st.kv_put("tuition", None)
    p = next(x for x in s.st.list_items("program") if x.get("slug") == PROG)
    s.st.patch_item_data(p["id"], fees=[])
    s._fill_demo_fees()
    assert s.st.get_item(p["id"])["fees"] == []
    assert s.st.kv_get("tuition") is None and T.settings(s.st)["show"] is False and T.settings(s.st)["demo"] is True
    # namunaviy narx manbasi bo'lsa — narx qo'yiladi, lekin saytda ko'rsatish o'chiq
    monkeypatch.setattr(C, "demo_fees", lambda slug, fac: [{"form": "day", "amount": 14_465_000}] if slug == PROG else [])
    s._fill_demo_fees()
    assert s.st.get_item(p["id"])["fees"] == [{"form": "day", "amount": 14_465_000}]
    assert T.settings(s.st)["show"] is False and T.settings(s.st)["demo"] is True
