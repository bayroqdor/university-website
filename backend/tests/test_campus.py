"""Talabalar hayoti, abituriyent, galereya, kampus xaritasi, virtual tur va tadbirga ro'yxat.

CRUD va ruxsatlar; bo'sh bo'lim yashirin; kalkulyator (grant/kontrakt chegaralari, ma'lumot yo'q, yil/shakl filtrlari); o'tish ballari Excel
import/eksporti; tadbirga ro'yxat (sig'im, kutish ro'yxati, muddat, takror, cheklov, email + .ics, Excel, eslatma); yotoqxona va klub arizalari
to'g'ri murojaat bo'limiga; galereyada alt matn majburiy; tur sahnalari/nuqtalari tekshiruvi; sayt xaritasi va SEO.
"""
import importlib
import io
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

ADMIN_PW = "Admin-parol-123"


@pytest.fixture(scope="module")
def m(tmp_path_factory):
    import os

    static = tmp_path_factory.mktemp("static")
    (static / "index.html").write_text('<!doctype html><html lang="uz"><head><title>x</title></head><body><div id="root"></div></body></html>', encoding="utf-8")
    os.environ["SITE_DATA_DIR"] = str(tmp_path_factory.mktemp("data"))
    os.environ["SITE_STATIC_DIR"] = str(static)
    os.environ["SITE_ADMIN_PASSWORD"] = ADMIN_PW
    os.environ["SITE_URL"] = "https://site.example"
    os.environ["SITE_PREWARM"] = "0"
    import university.api.deps as deps
    import university.api.main as main

    importlib.reload(main)
    deps.reset_service()
    return main


_ADMIN: dict = {}


def admin(m):
    if id(m) not in _ADMIN:
        c = TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126"})
        assert c.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
        c.headers["x-admin-realm"] = "admin"
        _ADMIN[id(m)] = c
    return _ADMIN[id(m)]


def pub(ip="10.20.0.1"):
    import university.api.main as main

    return TestClient(main.app, headers={"x-forwarded-for": ip})


def iso(days=0, hours=0):
    return (datetime.now(timezone.utc) + timedelta(days=days, hours=hours)).isoformat(timespec="seconds")


# ------------------------------------------------------------------ boshlang'ich holat: bo'sh bo'limlar yashirin
def test_seed_and_hidden_sections(m):
    g = pub()
    v = g.get("/api/campus/sections").json()
    # Boshlang'ich holatda hech narsa kiritilmagan — barcha qo'shimcha bo'limlar yashirin (parents/life static bo'lishi mumkin)
    assert not any(v[k] for k in ("clubs", "dormitory", "calculator", "sport", "scholarships", "gallery", "steps", "map", "tour"))
    for u in ("/api/sport", "/api/scholarships", "/api/gallery", "/api/campus-map", "/api/tour", "/api/clubs", "/api/dormitory"):
        assert g.get(u).status_code == 404, u
    for p in ("/sport", "/scholarships", "/gallery", "/campus-map", "/virtual-tour", "/admission/steps", "/clubs", "/dormitory"):
        r = g.get(p)
        assert r.status_code == 404 and "noindex" in r.text, p
    a = admin(m)
    assert a.get("/api/admin/items/scholarship").json()["items"] == []
    assert a.get("/api/admin/applicant/scores").json()["rows"] == []
    # Seed uchun o'tish ballari + dasturlar qo'shish imkoniyati
    prog = a.post("/api/admin/items/program", json={"title": "Dasturiy injiniring", "slug": "dasturiy-injiniring", "degree": "bachelor", "status": "published"}).json()
    assert prog["id"]
    a.put("/api/admin/applicant/scores", json={"rows": [{"year": 2025, "program_id": prog["id"], "title": "Dasturiy injiniring", "code": "60610200", "form": "day", "edu_lang": "uz", "grant": 140.0, "contract": 95.0, "quota": 50}]})
    assert g.get("/api/campus/sections").json()["calculator"] is True
    # takroriy ishga tushirish — ortiqcha yozuv yaratmaydi
    import university.campus as K
    from university.api.deps import svc

    K.ensure_seed(svc())
    assert a.get("/api/admin/items/club").json()["items"] == []


def test_permissions(m):
    a = admin(m)
    g = pub()
    assert g.post("/api/admin/items/club", json={"title": "X"}).status_code == 401
    import university.roles as R

    assert {"student_life", "gallery", "admission"} <= set(R.PERM_KEYS)
    assert R.required("/api/admin/items/club", "POST") == ("student_life",)
    assert R.required("/api/admin/items/album", "PUT") == ("gallery",)
    assert R.required("/api/admin/items/tour_scene", "POST") == ("admission",)
    assert R.required("/api/admin/applicant/scores", "PUT") == ("admission",)
    assert R.required("/api/admin/life/settings/dormitory", "PUT") == ("student_life",)
    assert R.required("/api/admin/gallery/settings/gallery", "GET") == ("gallery",)
    assert R.required("/api/admin/eventreg/x/regs", "GET") == ("events",)
    # rolda ruxsat yo'q — 403
    roles = a.get("/api/admin/roles").json()["items"]
    roles.append({"id": "galonly", "name": "Galereya", "perms": ["gallery"]})
    assert a.put("/api/admin/roles", json={"items": roles}).status_code == 200
    assert a.post("/api/admin/admins", json={"login": "galeditor", "name": "Galereya muharriri", "password": "Gal-parol-12345", "role_id": "galonly"}).status_code == 200
    c = TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126", "x-forwarded-for": "10.20.9.9"})
    assert c.post("/api/admin/login", json={"login": "galeditor", "password": "Gal-parol-12345"}).status_code == 200
    c.headers["x-admin-realm"] = "admin"
    assert c.post("/api/admin/items/club", json={"title": "Klub"}).json()["detail"] == "no_permission"
    assert c.put("/api/admin/applicant/scores", json={"rows": []}).status_code == 403
    assert c.post("/api/admin/items/album", json={"title": "Albom", "status": "draft"}).status_code == 200
    assert c.get("/api/admin/gallery/settings/gallery").status_code == 200
    assert c.get("/api/admin/gallery/settings/dormitory").status_code == 404  # bo'lim guruhi mos emas


# ------------------------------------------------------------------ klublar: CRUD, filtr, qo'shilish → «Klublar» murojaat bo'limi
def test_clubs_crud_and_join(m):
    a = admin(m)
    staff = next(x for x in a.get("/api/admin/items/staff").json()["items"] if x["status"] == "published")
    r = a.post("/api/admin/items/club", json={"title": "Robototexnika", "category": "science", "summary": "Robotlar", "leader_staff_id": staff["id"],
                                             "schedule": "Seshanba 15:00", "place": "204-xona", "join_form": True, "status": "published",
                                             "photos": [{"url": "/media/aaaaaaaaaaaaaaaa.jpg", "alt": "Robot"}], "cover": "/media/aaaaaaaaaaaaaaaa.jpg",
                                             "i18n": {"ru": {"title": "Робототехника"}}})
    assert r.status_code == 200, r.text
    club = r.json()
    assert club["slug"] == "robototexnika" and club["cover_alt"] == "Robot"  # muqova — galereyadagi surat, alt undan
    g = pub("10.20.1.1")
    lst = g.get("/api/clubs").json()
    assert set(lst["categories"]) == {"science", "volunteer"}
    d = g.get("/api/clubs/robototexnika?lang=ru").json()
    assert d["item"]["title"] == "Робототехника" and d["leader"]["id"] == staff["id"] and d["item"]["photos"][0]["alt"] == "Robot"
    # qo'shilish formasi: tekshiruv, honeypot, chipta
    bad = g.post("/api/clubs/robototexnika/join", json={"name": "Ali", "phone": "12", "group": ""})
    assert bad.status_code == 400 and set(bad.json()["detail"]["fields"]) == {"name", "phone", "group"}
    assert g.post("/api/clubs/robototexnika/join", json={"name": "Bot", "hp": "x"}).json() == {"ok": True}
    ok = g.post("/api/clubs/robototexnika/join", json={"name": "Aliyev Vali", "phone": "90 123 45 67", "email": "v@mail.uz", "group": "2-kurs, 9-24",
                                                       "message": "Qiziqaman"})
    assert ok.status_code == 200, ok.text
    from university.api.deps import svc
    from university.api.desk import _desk

    cats = {c["id"]: c["title"] for c in _desk().categories()}
    tk = _desk().by_number(ok.json()["ticket"])
    assert cats[tk["category_id"]] == "Klublar" and "Robototexnika" in tk["title"] and tk["requester_phone"] == "+998901234567"
    # Formasi yopiq klub — rad etiladi
    a.post("/api/admin/items/club", json={"title": "Eko-klub", "slug": "eko-klub", "status": "published", "apply_open": False})
    assert g.post("/api/clubs/eko-klub/join", json={"name": "Aliyev Vali", "phone": "901234567", "group": "1"}).json()["detail"] == "closed"
    # bo'limlar idempotent: qayta chaqirilsa yangi bo'lim yaratilmaydi
    import university.campus as K

    n = len(_desk().categories())
    K.ensure_desk()
    K.ensure_desk()
    assert len(_desk().categories()) == n
    assert svc() is not None


def test_alt_text_required(m):
    a = admin(m)
    r = a.post("/api/admin/items/album", json={"title": "Bitiruv 2026", "status": "published", "date": "2026-06-20T10:00:00+05:00",
                                              "photos": [{"url": "/media/bbbbbbbbbbbbbbbb.jpg", "alt": "Bitiruvchilar"}, {"url": "/media/cccccccccccccccc.jpg", "alt": ""}]})
    assert r.status_code == 400 and r.json()["detail"] == "photo_alt_required"
    # qoralama — altsiz saqlanadi (keyin to'ldiriladi)
    r = a.post("/api/admin/items/album", json={"title": "Bitiruv 2026", "status": "draft", "photos": [{"url": "/media/cccccccccccccccc.jpg"}]})
    assert r.status_code == 200
    # bo'sh albom nashr qilinmaydi
    assert a.post("/api/admin/items/album", json={"title": "Bo'sh", "status": "published"}).json()["detail"] == "album_empty"
    # yutuq / inshoot surati alt matnsiz — nashr qilinmaydi
    assert a.post("/api/admin/items/achievement", json={"title": "Musobaqa", "status": "published", "photo": "/media/x.jpg"}).json()["detail"] == "photo_alt_required"


def test_gallery_public(m):
    a = admin(m)
    news = a.get("/api/admin/items/news").json()["items"][0]
    r = a.post("/api/admin/items/album", json={
        "title": "Navro‘z 2026", "status": "published", "date": "2026-03-21T10:00:00+05:00", "news_id": news["id"],
        "photos": [{"url": "/media/dddddddddddddddd.jpg", "alt": "Sumalak", "caption": "Bayram", "i18n": {"ru": {"alt": "Сумаляк"}}},
                   {"url": "/media/eeeeeeeeeeeeeeee.jpg", "alt": "Raqs"}],
        "cover": "/media/eeeeeeeeeeeeeeee.jpg", "videos": ["https://youtu.be/dQw4w9WgXcQ", "https://evil.example/v"]})
    assert r.status_code == 200, r.text
    al = r.json()
    assert al["videos"] == ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]
    a.post("/api/admin/items/album", json={"title": "Sport kuni 2025", "status": "published", "date": "2025-05-10T10:00:00+05:00",
                                         "photos": [{"url": "/media/ffffffffffffffff.jpg", "alt": "Yugurish"}]})
    g = pub("10.20.2.1")
    lst = g.get("/api/gallery").json()
    assert lst["years"] == [2026, 2025] and [x["title"] for x in lst["items"]][:2] == ["Navro‘z 2026", "Sport kuni 2025"]
    assert lst["items"][0]["cover_photo"]["alt"] == "Raqs" and lst["items"][0]["count"] == 2
    assert [x["title"] for x in g.get("/api/gallery?year=2025").json()["items"]] == ["Sport kuni 2025"]
    d = g.get(f"/api/gallery/{al['slug']}?lang=ru").json()
    assert d["item"]["photos"][0]["alt"] == "Сумаляк" and d["item"]["videos"] == ["dQw4w9WgXcQ"] and d["news"]["slug"] == news["slug"]
    # yangilikdagi suratlarni olish (alt matnsiz — admin to'ldiradi)
    fr = a.post(f"/api/admin/gallery/{al['id']}/from-news", json={}).json()
    assert all(p["alt"] == "" for p in fr["photos"])
    # SEO: albom sahifasi, ImageGallery, sayt xaritasi
    html = g.get(f"/gallery/{al['slug']}").text
    assert "ImageGallery" in html and "Navro‘z 2026" in html
    sm = g.get("/sitemap.xml").text
    assert "/gallery</loc>" in sm and f"/gallery/{al['slug']}" in sm and "/clubs/robototexnika" in sm and "/admission/calculator" in sm
    assert "/sport</loc>" not in sm and "/virtual-tour" not in sm
    # sayt qidiruvi
    hits = g.get("/api/search?q=Navro").json()["items"]
    assert any(h["to"] == f"/gallery/{al['slug']}" for h in hits)


def test_thumbnails(m):
    from PIL import Image

    a = admin(m)
    buf = io.BytesIO()
    Image.new("RGB", (2000, 1000), (10, 46, 115)).save(buf, "JPEG")
    up = a.post("/api/admin/media", files={"file": ("big.jpg", buf.getvalue(), "image/jpeg")}).json()
    name = up["url"].rsplit("/", 1)[1]
    g = pub()
    r = g.get(f"/img/m/640/{name}")
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp" and "immutable" in r.headers["cache-control"]
    assert Image.open(io.BytesIO(r.content)).size == (640, 320)
    assert g.get(f"/img/m/641/{name}").status_code == 404
    assert g.get("/img/s/480/f33e70e88b2c.jpg").status_code == 200
    assert g.get("/img/m/480/../../etc.jpg").status_code == 404


# ------------------------------------------------------------------ sport va yotoqxona
def test_sport_and_dormitory(m):
    a = admin(m)
    g = pub("10.20.3.1")
    assert g.get("/api/sport").status_code == 404
    a.post("/api/admin/items/achievement", json={"title": "Rektor kubogi", "year": 2025, "result": "1-o‘rin", "athlete": "Futbol jamoasi", "status": "published"})
    a.post("/api/admin/items/facility", json={"title": "Sport zali", "category": "sport", "status": "published"})
    s = g.get("/api/sport").json()
    assert s["achievements"][0]["result"] == "1-o‘rin" and s["facilities"][0]["title"] == "Sport zali"
    # yotoqxona arizasi: yopiq → ochiq → «Yotoqxona» bo'limi chiptasi
    app = {"name": "Karimova Dilnoza", "phone": "+998 93 111 22 33", "program": "Dasturiy injiniring", "course": "1", "group": "3-25", "region": "Namangan viloyati"}
    assert g.post("/api/dormitory/apply", json=app).json()["detail"] == "closed"
    s = a.put("/api/admin/life/settings/dormitory", json={"apply_open": True, "steps": {"uz": [{"title": "Ariza", "text": "Saytda"}, {"title": "", "text": "x"}]},
                                                         "rules": {"uz": "<p></p>", "ru": "<p>Правила</p>"}}).json()["settings"]
    assert s["apply_open"] and s["steps"] == {"uz": [{"title": "Ariza", "text": "Saytda"}]} and s["rules"] == {"ru": "<p>Правила</p>"}
    assert "yotoqxonasi bor" in s["intro"]["uz"]  # boshqa maydonlar saqlanib qoladi
    bad = g.post("/api/dormitory/apply", json=app | {"course": "7", "region": ""})
    assert set(bad.json()["detail"]["fields"]) == {"course", "region"}
    r = g.post("/api/dormitory/apply", json=app)
    assert r.status_code == 200, r.text
    from university.api.desk import _desk

    tk = _desk().by_number(r.json()["ticket"])
    assert {c["id"]: c["title"] for c in _desk().categories()}[tk["category_id"]] == "Yotoqxona" and "Namangan" in tk["body"]
    # bino: alt matn bilan
    assert a.post("/api/admin/items/dorm", json={"title": "1-bino", "capacity": 300, "rooms": ["2 kishilik"], "status": "published",
                                                "photos": [{"url": "/media/1111111111111111.jpg", "alt": "1-bino tashqi ko‘rinishi"}]}).status_code == 200
    d = g.get("/api/dormitory").json()
    assert d["buildings"][0]["capacity"] == 300 and d["steps"][0]["title"] == "Ariza"
    html = g.get("/dormitory").text
    assert "FAQPage" in html and "Talabalar turar joyi" in html


def test_scholarships_filter(m):
    a = admin(m)
    g = pub("10.20.4.1")
    sch = a.get("/api/admin/items/scholarship").json()["items"][0]
    a.put(f"/api/admin/items/scholarship/{sch['id']}", json={**sch, "status": "published"})
    d = g.get("/api/scholarships").json()
    assert len(d["items"]) == 1 and d["tags"] == []  # bitta stipendiya — filtr kerak emas
    for t, tags in (("Sport stipendiyasi", ["sport"]), ("Ijtimoiy yordam", ["social", "course1"])):
        a.post("/api/admin/items/scholarship", json={"title": t, "tags": tags, "status": "published"})
    assert set(g.get("/api/scholarships").json()["tags"]) == {"course1", "excellence", "social", "sport"}


# ------------------------------------------------------------------ kalkulyator
def _prog(m, slug):
    return next(p for p in admin(m).get("/api/admin/items/program").json()["items"] if p["slug"] == slug)


def test_calculator_logic(m):
    g = pub("10.20.5.1")
    r = g.get("/api/admission/calc?score=60&form=day&year=2024").json()
    by = {(x["slug"], x["edu_lang"]): x for x in r["results"]}
    # Ekologiya: grant 78.7, kontrakt 59.9 → 60 — kontrakt uchun yetarli, grantgacha 18.7
    eco = by[("ekologiya-va-atrof-muhit-muhofazasi", "uz")]
    assert eco["status"] == "contract" and eco["gap"] == 0.1 and eco["grant_gap"] == 18.7
    # Iqtisodiyot (uz): kontrakt 88.1 → yetmaydi −28.1
    assert by[("iqtisodiyot", "uz")]["status"] == "short" and by[("iqtisodiyot", "uz")]["gap"] == 28.1
    # Metrologiya (ru): ball e'lon qilinmagan
    assert by[("metrologiya-va-standartlashtirish", "ru")]["status"] == "nodata"
    order = [x["status"] for x in r["results"]]
    assert order == sorted(order, key=["grant", "contract", "short", "nodata"].index)
    # grant chegarasi aynan teng — grant uchun yetarli
    r = g.get("/api/admission/calc?score=141.2&form=day").json()
    assert next(x for x in r["results"] if x["slug"] == "logistika")["status"] == "grant"
    assert r["counts"]["short"] == 0
    # til va shakl filtrlari
    r = g.get("/api/admission/calc?score=100&form=extramural&edu_lang=ru").json()
    assert r["results"] and all(x["form"] == "extramural" and x["edu_lang"] == "ru" for x in r["results"])
    assert not any(x["slug"] is None for x in r["results"])
    # noto'g'ri ball, chegaradan tashqari
    assert g.get("/api/admission/calc?score=abc").status_code == 400
    assert g.get("/api/admission/calc?score=190").json()["detail"] == "bad_score"
    # eng yuqori ball sozlanadi
    a = admin(m)
    a.put("/api/admin/applicant/settings/calculator", json={"max_score": 200})
    assert g.get("/api/admission/calc?score=195").status_code == 200
    a.put("/api/admin/applicant/settings/calculator", json={"max_score": 189})
    # boshqa yil: tanlanmasa — eng oxirgi yil
    rows = a.get("/api/admin/applicant/scores").json()["rows"]
    p = _prog(m, "logistika")
    rows.append({"year": 2025, "program_id": p["id"], "title": "Logistika", "form": "day", "edu_lang": "uz", "quota": 30, "grant": 150, "contract": None})
    assert a.put("/api/admin/applicant/scores", json={"rows": rows}).status_code == 200
    r = g.get("/api/admission/calc?score=100").json()
    assert r["year"] == 2025 and [x["status"] for x in r["results"]] == ["short"] and r["results"][0]["gap"] == 50
    assert g.get("/api/admission/calc?score=100&year=2024").json()["year"] == 2024
    meta = g.get("/api/admission/calculator").json()
    assert [y["year"] for y in meta["years"]] == [2025, 2024] and meta["by_year"]["2024"]["forms"] == ["day", "extramural"]
    # kontrakt narxi — faqat narxlar ko'rsatilsa
    assert r["results"][0]["fee"] is None


def test_scores_excel_roundtrip(m):
    a = admin(m)
    x = a.get("/api/admin/applicant/scores.xlsx?year=2024")
    assert x.status_code == 200 and x.headers["content-type"].startswith("application/vnd.openxmlformats")
    parsed = a.post("/api/admin/applicant/scores/parse", files={"file": ("s.xlsx", x.content)}).json()
    assert len(parsed["rows"]) == 29 and set(parsed["unmatched"]) == {"Menejment", "Turizm va mehmondo‘stlik"}
    eco = next(r for r in parsed["rows"] if r["title"].startswith("Ekologiya") and r["form"] == "day")
    assert eco["grant"] == 78.7 and eco["contract"] == 59.9 and eco["quota"] == 25 and eco["program_id"]
    # o'zbekcha sarlavhali «qo'lda» tuzilgan jadval: vergulli o'nliklar, «-», nomdagi kichik farqlar (xo'jaligi / xo'jalik, ximoyasi / himoyasi)
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["Ma’lumot"])
    ws.append(["T/r", "Shifr", "Ta'lim yo'nalishi", "Ta'lim shakli", "Ta'lim tili", "Ajratilgan kvota", "O'tish bali grant", "O'tish bali kontrakt", "Yil"])
    ws.append([1, "60810700", "Qishloq xo‘jaligi mahsulotlarini saqlash va qayta ishlash texnologiyasi", "kunduzgi", "o'zbek", 50, "68,5", "56,9", 2023])
    ws.append([2, "60810500", "O‘simliklar ximoyasi va karantini", "kunduzgi", "rus", 25, "-", "60,1", 2023])
    ws.append([3, "", "Mutlaqo boshqa yo'nalish", "sirtqi", "o'zbek", 10, "", "55", 2023])
    ws.append([4, "", "", "", "", "", "", "", ""])
    buf = io.BytesIO()
    wb.save(buf)
    p = a.post("/api/admin/applicant/scores/parse", files={"file": ("h.xlsx", buf.getvalue())}).json()
    assert len(p["rows"]) == 3 and p["unmatched"] == ["Mutlaqo boshqa yo'nalish"]
    q, o = p["rows"][0], p["rows"][1]
    assert q["program_id"] == _prog(m, "qishloq-xojalik-mahsulotlarini-saqlash-va-qayta-ishlash")["id"] and q["grant"] == 68.5 and q["year"] == 2023
    assert o["program_id"] == _prog(m, "osimliklar-himoyasi-va-karantini")["id"] and o["grant"] is None and o["contract"] == 60.1 and o["edu_lang"] == "ru"
    assert a.post("/api/admin/applicant/scores/parse", files={"file": ("x.xlsx", b"not excel")}).json()["detail"] == "bad_xlsx"
    # takroriy kalit — bitta qator
    rows = a.get("/api/admin/applicant/scores").json()["rows"]
    n = len(rows)
    assert len(a.put("/api/admin/applicant/scores", json={"rows": rows + [dict(rows[0], id="")]}).json()["rows"]) == n


# ------------------------------------------------------------------ qabul bosqichlari
def test_admission_steps(m):
    a = admin(m)
    g = pub("10.20.6.1")
    assert g.get("/api/admission/steps").json()["steps"] == []
    assert a.post("/api/admin/items/adm_step", json={"title": "X", "status": "published"}).json()["detail"] == "year_required"
    assert a.post("/api/admin/items/adm_step", json={"title": "X", "year": 2026, "starts": iso(5), "ends": iso(1)}).json()["detail"] == "bad_dates"
    for t, s, e in (("Hujjat topshirish", iso(-10), iso(-2)), ("Test sinovlari", iso(-1), iso(3)), ("Natijalar", iso(10), iso(12))):
        assert a.post("/api/admin/items/adm_step", json={"title": t, "year": 2026, "starts": s, "ends": e, "status": "published"}).status_code == 200
    a.post("/api/admin/items/adm_step", json={"title": "Eski", "year": 2025, "starts": iso(-400), "status": "published"})
    d = g.get("/api/admission/steps?year=2026").json()
    assert [s["state"] for s in d["steps"]] == ["done", "now", "next"] and d["current"] == 1 and d["label"] == "2026/2027"
    assert [y["year"] for y in d["years"]] == [2026, 2025]
    assert g.get("/api/admission/steps?year=2025").json()["steps"][0]["title"] == "Eski"
    assert g.get("/admission/steps").status_code == 200


# ------------------------------------------------------------------ tadbirga ro'yxat
@pytest.fixture()
def event(m):
    a = admin(m)
    r = a.post("/api/admin/items/event", json={"title": f"Ochiq eshiklar kuni {time.time_ns()}", "starts": iso(7), "ends": iso(7, 3), "place": "UNI, 204",
                                              "category": "openday", "status": "published"})
    return r.json()


@pytest.fixture()
def sync_mail(monkeypatch):
    """Xatlar sinxron va ushlab olinadi (SMTP o'rniga)."""
    import university.eventreg as E
    from university.api.deps import svc

    sent = []
    monkeypatch.setattr(E, "spawn", lambda fn, *args: fn(*args))
    monkeypatch.setattr(svc().mail, "_deliver", lambda kind, to, subject, html, headers=None: sent.append((kind, to, subject, html)) or True)
    return sent


def test_event_registration_flow(m, event, sync_mail):
    a = admin(m)
    slug, eid = event["slug"], event["id"]
    g = pub("10.20.7.1")
    assert g.get(f"/api/events/{slug}/registration").json()["state"] == "off"
    assert g.post(f"/api/events/{slug}/register", json={"name": "Aliyev Vali", "phone": "901234567"}).json()["detail"] == "closed"
    cfg = {"enabled": True, "capacity": 3, "waitlist": True, "guests_max": 2, "fields": {"email": "optional", "school": "required", "grade": "off"},
           "questions": [{"label": {"uz": "Qaysi yo‘nalish qiziq?", "ru": "Какое направление?"}, "required": True}, {"label": {}}]}
    r = a.put(f"/api/admin/eventreg/{eid}", json=cfg).json()
    qid = r["registration"]["questions"][0]["id"]
    assert len(r["registration"]["questions"]) == 1
    info = g.get(f"/api/events/{slug}/registration?lang=ru").json()
    assert info["state"] == "open" and info["left"] == 3 and info["questions"][0]["label"] == "Какое направление?"
    bad = g.post(f"/api/events/{slug}/register", json={"name": "Vali", "phone": "1", "guests": 5, "email": "x@"})
    assert set(bad.json()["detail"]["fields"]) == {"name", "phone", "guests", "email", "school", f"q_{qid}"}
    base = {"school": "12-maktab", "answers": {qid: "Logistika"}, "lang": "uz"}
    r1 = g.post(f"/api/events/{slug}/register", json=base | {"name": "Aliyev Vali", "phone": "+998 90 123 45 67", "email": "vali@mail.uz", "guests": 1, "grade": "11"})
    assert r1.json() == {"status": "registered", "position": None, "email": True}
    # tasdiqlash xati + .ics havolasi
    kind, to, subj, html = sync_mail[-1]
    assert to == "vali@mail.uz" and "Ro‘yxatdan o‘tdingiz" in subj and f"/api/events/{slug}/calendar.ics" in html
    # takror (bir telefon)
    assert g.post(f"/api/events/{slug}/register", json=base | {"name": "Aliyev Vali", "phone": "901234567"}).json()["detail"] == "duplicate"
    g2 = pub("10.20.7.2")
    assert g2.post(f"/api/events/{slug}/register", json=base | {"name": "Karimova Nodira", "phone": "931112233"}).json()["status"] == "registered"
    # 3 o'rin band (1+1 mehmon, 1) → keyingisi kutish ro'yxatiga
    w = g2.post(f"/api/events/{slug}/register", json=base | {"name": "Sobirov Bekzod", "phone": "941112233", "guests": 1, "email": "b@mail.uz"}).json()
    assert w == {"status": "waitlist", "position": 1, "email": True}
    assert "kutish ro‘yxati" in sync_mail[-1][2].lower()
    info = g.get(f"/api/events/{slug}/registration").json()
    assert info["state"] == "waitlist" and info["left"] == 0 and info["taken"] == 3
    # admin: ro'yxat, qidiruv, kelganini belgilash
    regs = a.get(f"/api/admin/eventreg/{eid}/regs").json()
    assert regs["counts"]["registered"] == 2 and regs["counts"]["waitlist"] == 1 and regs["items"][0]["answers"][qid] == "Logistika"
    assert [x["name"] for x in a.get(f"/api/admin/eventreg/{eid}/regs?q=nodira").json()["items"]] == ["Karimova Nodira"]
    assert [x["name"] for x in a.get(f"/api/admin/eventreg/{eid}/regs?q=93111").json()["items"]] == ["Karimova Nodira"]
    vali = regs["items"][0]
    assert a.patch(f"/api/admin/eventreg/regs/{vali['id']}", json={"checked_in": True}).json()["item"]["checked_in"] is True
    # bekor qilish → kutish ro'yxatidan o'tkaziladi (+ xat)
    r = a.patch(f"/api/admin/eventreg/regs/{vali['id']}", json={"status": "cancelled"}).json()
    assert r["promoted"] == 1 and "Joy ajratildi" in sync_mail[-1][2] and sync_mail[-1][1] == "b@mail.uz"
    # Excel
    x = a.get(f"/api/admin/eventreg/{eid}/regs.xlsx")
    from openpyxl import load_workbook

    ws = load_workbook(io.BytesIO(x.content)).active
    vals = [[c.value for c in row] for row in ws.iter_rows()]
    assert vals[0][7] == "Qaysi yo‘nalish qiziq?" and {v[1] for v in vals[1:]} == {"Aliyev Vali", "Karimova Nodira", "Sobirov Bekzod"}
    # eslatma: SMTP sozlanmagan → 400; sozlangan (soxta) → email borlarga
    assert a.post(f"/api/admin/eventreg/{eid}/remind").json()["detail"] == "smtp_not_configured"
    import university.mailer as MR

    orig = MR.can_send
    MR.can_send = lambda st: True
    try:
        n = len(sync_mail)
        assert a.post(f"/api/admin/eventreg/{eid}/remind").json()["queued"] == 1  # faqat ro'yxatdagi va email kiritganlar
        assert "Eslatma" in sync_mail[n][2] and sync_mail[n][1] == "b@mail.uz"
    finally:
        MR.can_send = orig
    # .ics
    ics = g.get(f"/api/events/{slug}/calendar.ics")
    assert ics.headers["content-type"].startswith("text/calendar") and "BEGIN:VEVENT" in ics.text and "DTSTART:" in ics.text and "DTEND:" in ics.text
    assert "LOCATION:UNI\\, 204" in ics.text
    # honeypot: yozuv saqlanmaydi
    n = len(a.get(f"/api/admin/eventreg/{eid}/regs").json()["items"])
    assert g2.post(f"/api/events/{slug}/register", json={"name": "Bot", "hp": "1"}).json()["status"] == "registered"
    assert len(a.get(f"/api/admin/eventreg/{eid}/regs").json()["items"]) == n


def test_event_registration_full_deadline_ratelimit(m, event, sync_mail):
    a = admin(m)
    slug, eid = event["slug"], event["id"]
    a.put(f"/api/admin/eventreg/{eid}", json={"enabled": True, "capacity": 1, "waitlist": False, "fields": {"email": "off"}})
    g = pub("10.20.8.1")
    assert g.post(f"/api/events/{slug}/register", json={"name": "Aliyev Vali", "phone": "901234567", "email": "ignored@mail.uz"}).json()["email"] is False
    assert g.post(f"/api/events/{slug}/register", json={"name": "Karimov Ali", "phone": "901234568"}).json()["detail"] == "full"
    assert g.get(f"/api/events/{slug}/registration").json()["state"] == "full"
    # sig'im oshirilsa — yana ochiq
    assert a.put(f"/api/admin/eventreg/{eid}", json={"enabled": True, "capacity": 5, "waitlist": False}).json()["state"] == "open"
    # muddat o'tgan
    a.put(f"/api/admin/eventreg/{eid}", json={"enabled": True, "deadline": iso(-1)})
    assert g.get(f"/api/events/{slug}/registration").json()["state"] == "closed"
    assert g.post(f"/api/events/{slug}/register", json={"name": "Karimov Ali", "phone": "901234568"}).json()["detail"] == "closed"
    # IP bo'yicha cheklov (8 ta / 10 daqiqa)
    a.put(f"/api/admin/eventreg/{eid}", json={"enabled": True})
    g3 = pub("10.20.8.9")
    codes = [g3.post(f"/api/events/{slug}/register", json={"name": "Test Odam", "phone": f"9011100{i:02d}"}).status_code for i in range(10)]
    assert codes[:8] == [200] * 8 and codes[-1] == 429
    # admin ro'yxati: tadbirlar va holat
    lst = a.get("/api/admin/eventreg").json()["items"]
    assert any(x["id"] == eid and x["counts"]["registered"] == 9 for x in lst)
    # o'chirish
    rid = a.get(f"/api/admin/eventreg/{eid}/regs").json()["items"][0]["id"]
    assert a.delete(f"/api/admin/eventreg/regs/{rid}").json()["ok"]


# ------------------------------------------------------------------ kampus xaritasi va virtual tur
def test_map_and_tour(m):
    from PIL import Image

    a = admin(m)
    g = pub("10.20.9.1")
    buf = io.BytesIO()
    Image.new("RGB", (800, 600)).save(buf, "JPEG")
    assert a.post("/api/admin/applicant/panorama", files={"file": ("p.jpg", buf.getvalue())}).json()["detail"] == "not_equirectangular"
    buf = io.BytesIO()
    Image.new("RGB", (4000, 2000), (120, 160, 200)).save(buf, "JPEG")
    up = a.post("/api/admin/applicant/panorama", files={"file": ("pano.jpg", buf.getvalue())}).json()
    assert up["url"].startswith("/media/") and up["width"] == 4000
    assert a.post("/api/admin/items/tour_scene", json={"title": "Hovli", "status": "published"}).json()["detail"] == "panorama_required"
    s1 = a.post("/api/admin/items/tour_scene", json={"title": "Hovli", "panorama": up["url"], "status": "published", "hfov": 500}).json()
    s2 = a.post("/api/admin/items/tour_scene", json={"title": "Kutubxona", "panorama": up["url"], "status": "published", "hotspots": [
        {"type": "scene", "yaw": 10, "pitch": -5, "target": s1["id"], "text": "Hovliga"},
        {"type": "scene", "yaw": 20, "pitch": 0, "target": "missing", "text": "Yo'q"},
        {"type": "info", "yaw": "x", "pitch": 0, "text": "Noto'g'ri"},
        {"type": "info", "yaw": -30, "pitch": 95, "text": "Javonlar", "i18n": {"ru": "Стеллажи"}},
        {"type": "teleport", "yaw": 1, "pitch": 1}]}).json()
    assert s1["hfov"] == 120 and len(s2["hotspots"]) == 3 and s2["hotspots"][2]["pitch"] == 90
    t = g.get("/api/tour?lang=ru").json()
    hs = next(x for x in t["scenes"] if x["id"] == s2["id"])["hotspots"]
    assert [h["text"] for h in hs] == ["Hovliga", "Стеллажи"]  # mavjud bo'lmagan sahnaga havola tashlanadi
    assert t["first"] == s1["id"] or t["first"] == s2["id"]
    # xarita: nuqtalar raqam bo'yicha, sahna havolasi
    assert g.get("/api/campus-map").status_code == 404
    a.post("/api/admin/items/campus_spot", json={"title": "Bosh bino", "number": 2, "x": 150, "y": 40, "scene_id": s1["id"], "status": "published"})
    a.post("/api/admin/items/campus_spot", json={"title": "Sport zali", "number": 1, "x": 10, "y": 10, "scene_id": "nope", "status": "published"})
    mp = g.get("/api/campus-map").json()
    assert [s["title"] for s in mp["spots"]] == ["Sport zali", "Bosh bino"] and mp["spots"][1]["x"] == 100 and mp["spots"][1]["scene_id"] == s1["id"]
    assert mp["spots"][0]["scene_id"] == "" and mp["lat"] and mp["tour"] is True
    assert g.get("/virtual-tour").status_code == 200 and g.get("/campus-map").status_code == 200


def test_seo_pages(m):
    g = pub("10.20.10.1")
    r = g.get("/admission/calculator?lang=ru")
    assert r.status_code == 200 and "Куда я могу поступить?" in r.text and "BreadcrumbList" in r.text
    r = g.get("/clubs/eko-klub")
    assert r.status_code == 200 and "Eko-klub" in r.text and '"Organization"' in r.text
    assert g.get("/clubs/nope").status_code == 404
    assert g.get("/parents").status_code == 200
    assert g.get("/student-life").status_code == 200
    meta = g.get("/api/meta?path=/admission/calculator").json()
    assert meta["status"] == 200 and meta["title"]
