"""Rasmiy bo'limlar (official.py): turlar CRUD va ruxsatlar, bo'sh bo'lim yashirinishi, rahbariyat qabuliga yozilish (jadvalga moslik,
«Murojaatlar»dagi chipta, cheklov), ochiq ma'lumotlar (avtomatik ko'rsatkichlar, qo'lda qiymat / yashirish, CSV/XLSX/JSON, API),
hujjatlar turlari, rektor murojaati, maxfiylik siyosati, sayt xaritasi va SEO meta, qidiruv."""
import importlib
import io
import json
from datetime import timedelta

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
        c = TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126", "x-forwarded-for": "10.31.0.1"})
        assert c.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
        c.headers["x-admin-realm"] = "admin"
        _ADMIN[id(m)] = c
    return _ADMIN[id(m)]


def guest(m, ip="10.31.1.1"):
    return TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126", "x-forwarded-for": ip}, follow_redirects=False)


KINDS = {
    "ranking": ("/api/rankings", "/rankings", {"title": "Test reytingi", "year": 2025, "place": "12", "total": 100, "category": "Umumiy"}),
    "milestone": ("/api/history", "/history", {"title": "Muhim voqea", "year": 2024, "body": "Matn"}),
    "mention": ("/api/media-mentions", "/media-mentions", {"title": "Maqola", "outlet": "Gazeta", "type": "video", "date": "2026-03-01T12:00:00+05:00",
                                                           "url": "https://www.youtube.com/watch?v=abcdefghijk"}),
    "dataset": ("/api/open-data", "/open-data", {"title": "To‘plam", "table": {"columns": ["Kurs", "Soni"], "rows": [["1-kurs", 10], ["2-kurs", 12]]}}),
    "reception": ("/api/reception", "/reception", {"title": "Rahbar", "slots": [{"day": 1, "start": "10:00", "end": "12:00"}]}),
}


# ------------------------------------------------------------------ bo'sh bo'limlar, CRUD, ruxsatlar
def test_seeded_facts_only(m):
    g = guest(m)
    h = g.get("/api/history").json()["items"]
    assert len(h) == 1 and h[0]["year"] == 2023 and "PQ-22" in h[0]["body"]  # faqat import qilingan fakt
    assert g.get("/api/history?lang=ru").json()["items"][0]["title"] == "Основание института"
    rec = g.get("/api/reception").json()["items"]
    assert rec and all(r["slots"] for r in rec) and any("rektor" in r["position"].lower() for r in rec)
    for path in ("/api/rankings", "/api/media-mentions", "/api/rector"):
        assert g.get(path).json()["detail"] == "empty"
    # maxfiylik siyosati — sahifa sifatida, /privacy → 301
    p = g.get("/api/pages/maxfiylik-siyosati").json()["item"]
    assert "Shaxsga doir ma’lumotlar" in p["html"] and "localStorage" in p["html"]
    r = g.get("/privacy?lang=ru")
    assert r.status_code == 301 and r.headers["location"] == "/about/maxfiylik-siyosati?lang=ru"


def test_crud_hidden_when_empty(m):
    a, g = admin(m), guest(m)
    # ochiq ma'lumotlar va qabul — boshlang'ich holatda ham ma'lumot bor; qolganlari bo'sh
    for kind in ("ranking", "mention"):
        api, page, data = KINDS[kind]
        assert g.get(api).status_code == 404
        assert g.get(page).status_code == 404 and "noindex" in g.get(page).text
        assert g.get("/api/official/sections").json()[page] is False
        draft = a.post(f"/api/admin/items/{kind}", json=data | {"status": "draft"}).json()
        assert g.get(api).status_code == 404  # qoralama saytda ko'rinmaydi
        r = a.put(f"/api/admin/items/{kind}/{draft['id']}", json={"status": "published"})
        assert r.status_code == 200, r.text
        assert g.get(api).status_code == 200 and g.get(page).status_code == 200
        assert g.get("/api/official/sections").json()[page] is True
        assert any(x["id"] == draft["id"] for x in a.get(f"/api/admin/items/{kind}").json()["items"])
    rk = g.get("/api/rankings").json()["groups"][0]
    assert rk["title"] == "Test reytingi" and rk["entries"][0]["place"] == "12" and rk["entries"][0]["total"] == 100
    mm = g.get("/api/media-mentions").json()
    assert mm["items"][0]["video_id"] == "abcdefghijk" and mm["years"] == [2026] and mm["types"] == ["video"]
    # o'chirish → yana yashirin
    for x in a.get("/api/admin/items/mention").json()["items"]:
        assert a.delete(f"/api/admin/items/mention/{x['id']}").status_code == 200
    assert g.get("/api/media-mentions").status_code == 404
    # translations
    it = a.post("/api/admin/items/ranking", json=KINDS["ranking"][2] | {"year": 2024, "status": "published", "i18n": {"en": {"title": "Test ranking"}}}).json()
    assert {e["year"] for e in g.get("/api/rankings").json()["groups"][0]["entries"]} == {2024, 2025}
    assert g.get("/api/rankings?lang=en").json()["groups"][0]["title"] in ("Test ranking", "Test reytingi")
    a.delete(f"/api/admin/items/ranking/{it['id']}")


def test_permissions(m):
    a = admin(m)
    import university.roles as R

    assert R.required("/api/admin/items/reception", "POST") == ("reception",)
    assert R.required("/api/admin/items/dataset", "PUT") == ("opendata",)
    assert R.required("/api/admin/items/milestone", "DELETE") == ("history",)
    assert R.required("/api/admin/items/mention", "POST") == ("mentions",)
    assert R.required("/api/admin/items/ranking", "POST") == ("rankings",)
    assert R.required("/api/admin/official/opendata", "PUT") == ("opendata",)
    assert {"reception", "opendata", "rankings", "history", "mentions"} <= set(R.PERM_KEYS)
    # tizimga kirmagan — 401
    assert guest(m).post("/api/admin/items/ranking", json={"title": "x"}).status_code == 401
    assert guest(m).get("/api/admin/official/opendata").status_code == 401
    # faqat «Tarix» ruxsati bor rol
    roles = a.get("/api/admin/roles").json()["items"]
    roles.append({"id": "histonly", "name": "Tarix muharriri", "perms": ["history"]})
    assert a.put("/api/admin/roles", json={"items": roles}).status_code == 200
    assert a.post("/api/admin/admins", json={"login": "histeditor", "name": "Tarix", "password": "Tarix-parol-123", "role_id": "histonly"}).status_code == 200
    c = TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126", "x-forwarded-for": "10.31.9.9"})
    assert c.post("/api/admin/login", json={"login": "histeditor", "password": "Tarix-parol-123"}).status_code == 200
    c.headers["x-admin-realm"] = "admin"
    assert c.post("/api/admin/items/milestone", json={"title": "Voqea", "year": 2025, "status": "draft"}).status_code == 200
    for kind in ("ranking", "mention", "dataset", "reception"):
        assert c.post(f"/api/admin/items/{kind}", json={"title": "x"}).json()["detail"] == "no_permission"
    assert c.put("/api/admin/official/opendata", json={"indicators": {}}).status_code == 403
    assert c.put("/api/admin/uni", json={"rector_speech_html": "<p>x</p>"}).status_code == 403


# ------------------------------------------------------------------ rahbariyat qabuli
def _next(weekday: int):
    from university.storage import local_today

    d = local_today() + timedelta(days=1)
    while d.isoweekday() != weekday:
        d += timedelta(days=1)
    return d


def test_reception_booking(m):
    a = admin(m)
    staff = next(x for x in a.get("/api/admin/items/staff").json()["items"] if x["status"] == "published" and x.get("category") == "leadership")
    e = a.post("/api/admin/items/reception", json={"title": "", "staff_id": staff["id"], "status": "published", "place": "Bosh bino", "room": "214",
                                                   "slots": [{"day": 2, "start": "10:00", "end": "12:00"}, {"day": 9, "start": "x", "end": "y"},
                                                             {"day": 3, "start": "15:00", "end": "14:00"}]})
    assert e.status_code == 400 and e.json()["detail"] == "empty_title"  # ism bo'sh — frontend xodim nomini qo'yadi
    e = a.post("/api/admin/items/reception", json={"title": staff["title"], "staff_id": staff["id"], "status": "published", "place": "Bosh bino", "room": "214",
                                                   "slots": [{"day": 2, "start": "10:00", "end": "12:00"}, {"day": 9, "start": "x", "end": "y"},
                                                             {"day": 3, "start": "15:00", "end": "14:00"}]}).json()
    pub = next(x for x in guest(m).get("/api/reception").json()["items"] if x["id"] == e["id"])
    assert pub["slots"] == [{"day": 2, "start": "10:00", "end": "12:00"}]  # noto'g'ri vaqtlar tashlanadi
    assert pub["name"] == staff["title"] and pub["photo"] == staff.get("photo", "")
    tue, wed = _next(2), _next(3)
    base = {"id": e["id"], "name": "Aliyev Vali", "email": "vali@example.uz", "phone": "+998901112233", "message": "Yotoqxona masalasi bo‘yicha."}
    for i, bad in enumerate(({"date": tue.isoformat(), "time": "12:00"}, {"date": tue.isoformat(), "time": "09:30"}, {"date": wed.isoformat(), "time": "10:30"},
                {"date": (tue - timedelta(days=14)).isoformat(), "time": "10:30"}, {"date": (tue + timedelta(days=70)).isoformat(), "time": "10:30"},
                {"date": "2026-13-01", "time": "10:30"})):
        r = guest(m, f"10.31.3.{i}").post("/api/reception/book", json=base | bad)
        assert r.status_code == 400 and r.json()["detail"] == "invalid_slot", bad
    assert guest(m, "10.31.2.1").post("/api/reception/book", json=base | {"date": tue.isoformat(), "time": "10:30", "email": "x"}).json()["detail"] == "invalid_email"
    r = guest(m, "10.31.2.2").post("/api/reception/book", json=base | {"date": tue.isoformat(), "time": "10:30"})
    assert r.status_code == 200, r.text
    num = r.json()["ticket"]
    assert guest(m, "10.31.2.2").post("/api/reception/book", json=base | {"id": "nope", "date": tue.isoformat(), "time": "10:30"}).status_code == 404
    # «Murojaatlar»: «Rahbariyat qabuli» bo'limi, manba, maydonlar
    board = a.get("/api/admin/desk").json()
    t = next(x for x in board["tickets"] if x["number"] == num)
    assert t["source"] == "reception" and t["category"]["title"] == "Rahbariyat qabuli"
    assert staff["title"] in t["title"] and tue.strftime("%d.%m.%Y") in t["title"]
    full = a.get(f"/api/admin/desk/tickets/{t['id']}").json()
    meta = full["events"][0]["meta"]
    meta = json.loads(meta) if isinstance(meta, str) else meta
    assert meta["reception"]["date"] == tue.isoformat() and meta["reception"]["time"] == "10:30" and meta["reception"]["place"] == "Bosh bino, 214"
    assert "Sana va vaqt" in full["ticket"]["body"] and full["ticket"]["requester_email"] == "vali@example.uz"
    # ikkinchi yozilish o'sha bo'limga tushadi (yangi bo'lim yaratilmaydi)
    guest(m, "10.31.2.3").post("/api/reception/book", json=base | {"date": tue.isoformat(), "time": "11:00"})
    cats = [c for c in a.get("/api/admin/desk/categories").json()["items"] if c["title"] == "Rahbariyat qabuli"]
    assert len(cats) == 1
    # cheklov: bir IP dan 10 daqiqada 5 ta urinish
    g2 = guest(m, "10.31.2.9")
    codes = [g2.post("/api/reception/book", json=base | {"date": wed.isoformat(), "time": "10:30"}).status_code for _ in range(6)]
    assert codes[:5] == [400] * 5 and codes[5] == 429
    # honeypot
    assert guest(m, "10.31.2.10").post("/api/reception/book", json=base | {"hp": "bot"}).json() == {"ok": True}


def test_slot_helpers():
    from datetime import date, datetime

    from university import official as O

    s = O.clean_slots([{"day": 1, "start": "09:00", "end": "15:00"}, {"day": 1, "start": "09:00", "end": "10:00"}, {"day": "6", "start": "9:00", "end": "10:00"}])
    assert s == [{"day": 1, "start": "09:00", "end": "15:00"}]
    mon = date(2026, 10, 12)
    assert O.slot_ok(s, mon, "14:30") and not O.slot_ok(s, mon, "15:00") and not O.slot_ok(s, mon, "08:59")
    assert not O.slot_ok(s, mon, "10:00", datetime(2026, 10, 12, 11, 0)) and O.slot_ok(s, mon, "12:00", datetime(2026, 10, 12, 11, 0))
    assert O.yt_id("https://youtu.be/abcdefghijk?t=3") == "abcdefghijk" and O.yt_id("https://example.org") == ""


# ------------------------------------------------------------------ ochiq ma'lumotlar
def test_open_data_indicators(m):
    a, g = admin(m), guest(m)
    from university.api.deps import svc

    st = svc().st
    students = len(st.list_users("student", active=True))
    d = g.get("/api/open-data").json()
    ind = {x["key"]: x for x in d["indicators"]}
    if students:
        assert ind["students_total"]["value"] == students and ind["students_total"]["source"] == "auto"
        assert ind["students_total"]["updated"]
    assert ind["programs_total"]["value"] == len(st.list_items("program", public=True))
    assert sum(r["value"] for r in ind["programs_by_degree"]["breakdown"]) == ind["programs_total"]["value"]
    assert "students_by_gender" not in ind  # HEMIS profilida jins yo'q — ko'rsatkich chiqmaydi
    # qo'lda qiymat va yashirish
    r = a.put("/api/admin/official/opendata", json={"indicators": {"faculties_total": {"value": 7}, "programs_total": {"hidden": True},
                                                                   "students_by_course": {"rows": [{"label": "1-kurs", "value": 400}, {"label": "", "value": 3}]}}})
    assert r.status_code == 200
    adm = {x["key"]: x for x in r.json()["indicators"]}
    assert adm["programs_total"]["hidden"] and adm["programs_total"]["has_data"]
    ind = {x["key"]: x for x in g.get("/api/open-data").json()["indicators"]}
    assert ind["faculties_total"]["value"] == 7 and ind["faculties_total"]["source"] == "manual"
    assert "programs_total" not in ind
    assert ind["students_by_course"]["breakdown"] == [{"label": "1-kurs", "value": 400}] and ind["students_by_course"]["value"] == 400
    # avtomatikka qaytarish
    a.put("/api/admin/official/opendata", json={"indicators": {"faculties_total": {"value": None}, "programs_total": {"hidden": False}, "students_by_course": {}}})
    ind = {x["key"]: x for x in g.get("/api/open-data").json()["indicators"]}
    assert ind["faculties_total"]["source"] == "auto" and "programs_total" in ind
    # ko'rsatkichlar fayllari
    c = g.get("/api/open-data/indicators.csv")
    assert c.status_code == 200 and c.content.startswith("﻿".encode()) and "Ko‘rsatkich" in c.content.decode("utf-8-sig")
    j = g.get("/api/open-data/indicators.json?lang=en").json()
    assert j["indicators"][0]["label"] and g.get("/api/open-data/indicators.xml").status_code == 404


def test_datasets(m):
    a, g = admin(m), guest(m)
    parsed = a.post("/api/admin/official/datasets/parse", files={"file": ("d.csv", "Kurs;Talabalar\n1-kurs;420\n2-kurs;380,5\n\n".encode("utf-8"))}).json()
    assert parsed == {"columns": ["Kurs", "Talabalar"], "rows": [["1-kurs", 420], ["2-kurs", 380.5]]}
    from openpyxl import Workbook

    wb = Workbook()
    wb.active.append(["Yil", "Soni"])
    wb.active.append([2025, 10])
    buf = io.BytesIO()
    wb.save(buf)
    assert a.post("/api/admin/official/datasets/parse", files={"file": ("d.xlsx", buf.getvalue())}).json()["rows"] == [[2025, 10]]
    assert a.post("/api/admin/official/datasets/parse", files={"file": ("d.csv", b"")}).json()["detail"] == "empty_file"
    ds = a.post("/api/admin/items/dataset", json={"title": "Talabalar kurslar bo‘yicha", "period": "2025/2026", "source": "Registrator ofisi",
                                                 "status": "published", "table": parsed}).json()
    d = g.get("/api/open-data").json()
    s = next(x for x in d["datasets"] if x["id"] == ds["id"])
    assert s["rows_count"] == 2 and s["columns"] == ["Kurs", "Talabalar"] and "table" not in s
    assert s["downloads"]["csv"] == f"/api/open-data/datasets/{ds['id']}.csv"
    full = g.get(f"/api/open-data/datasets/{ds['id']}").json()
    assert full["table"]["rows"][1] == ["2-kurs", 380.5]
    c = g.get(f"/api/open-data/datasets/{ds['id']}.csv")
    assert c.status_code == 200 and "text/csv" in c.headers["content-type"] and "attachment" in c.headers["content-disposition"]
    assert c.content.decode("utf-8-sig").splitlines() == ["Kurs,Talabalar", "1-kurs,420", "2-kurs,380.5"]
    x = g.get(f"/api/open-data/datasets/{ds['id']}.xlsx")
    from openpyxl import load_workbook

    ws = load_workbook(io.BytesIO(x.content)).active
    assert ws["A1"].value == "Kurs" and ws["B2"].value == 420
    j = json.loads(g.get(f"/api/open-data/datasets/{ds['id']}.json").content)
    assert j["rows"][0] == {"Kurs": "1-kurs", "Talabalar": 420} and j["source"] == "Registrator ofisi"
    a.put(f"/api/admin/items/dataset/{ds['id']}", json={"status": "draft"})
    assert g.get(f"/api/open-data/datasets/{ds['id']}.csv").status_code == 404


# ------------------------------------------------------------------ hujjatlar, rektor, SEO, qidiruv
def test_documents_categories(m):
    a, g = admin(m), guest(m)
    up = a.post("/api/admin/media", files={"file": ("nizom.pdf", b"%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF", "application/pdf")}).json()
    a.post("/api/admin/items/document", json={"title": "Ichki tartib qoidalari", "category": "regulation", "status": "published", "file": up["url"]})
    a.post("/api/admin/items/document", json={"title": "Odob-axloq kodeksi", "category": "ethics", "number": "12", "date": "2025-09-01",
                                              "status": "published", "url": "https://lex.uz/x"})
    a.post("/api/admin/items/document", json={"title": "Ustav", "category": "charter", "status": "published"})
    a.post("/api/admin/items/document", json={"title": "Eski buyruq", "category": "order", "status": "draft"})
    d = g.get("/api/official/documents").json()
    cats = [c["id"] for c in d["categories"]]
    assert cats.index("charter") < cats.index("ethics") and "order" not in cats
    eth = next(x for x in d["items"] if x["category"] == "ethics")
    assert eth["number"] == "12" and eth["date"].startswith("2025-09-01") and eth["year"] == 2025 and eth["file_size"] is None
    doc_f = next(x for x in d["items"] if x.get("file") == up["url"])
    assert doc_f["file_ext"] == "pdf" and doc_f["file_size"] > 0
    assert d["items"][0]["category"] == "charter"  # tartib: ustav birinchi


def test_rector(m):
    a, g = admin(m), guest(m)
    assert g.get("/api/rector").status_code == 404 and g.get("/rector").status_code == 404
    a.post("/api/admin/items/staff", json={"title": "Rektorov Alisher", "category": "leadership", "position": "Rektor", "status": "published"})
    assert a.put("/api/admin/uni", json={"rector_speech_html": "<p>Hurmatli talabalar!</p>", "rector_signature": "/media/x.png",
                                         "i18n": {"en": {"rector_speech_html": "<p>Dear students!</p>"}}}).status_code == 200
    r = g.get("/api/rector").json()
    assert r["html"] == "<p>Hurmatli talabalar!</p>" and r["signature"] == "/media/x.png"
    assert "rektor" in r["title"].lower() and r["name"] and r["staff_slug"]  # xodimlar ro'yxatidagi rektordan
    assert g.get("/api/rector?lang=en").json()["html"] == "<p>Dear students!</p>"
    page = g.get("/rector")
    assert page.status_code == 200 and "Rektor murojaati" in page.text


def test_seo_and_sitemap(m):
    a, g = admin(m), guest(m)
    a.post("/api/admin/items/milestone", json={"title": "Yangi bino", "year": 2026, "status": "published"})
    sm = g.get("/sitemap.xml").text
    for p in ("/reception", "/open-data", "/history", "/about/maxfiylik-siyosati"):
        assert f"https://site.example{p}<" in sm or f"https://site.example{p}</loc>" in sm, p
    assert "https://site.example/media-mentions<" not in sm  # bo'sh bo'lim
    h = g.get("/history?lang=en")
    assert h.status_code == 200 and "<title>History of the institute" in h.text and "BreadcrumbList" in h.text
    od = g.get("/open-data").text
    assert "Ochiq ma’lumotlar" in od
    meta = g.get("/api/meta?path=/reception&lang=ru").json()
    assert meta["status"] == 200 and meta["title"].startswith("График приёма граждан")
    assert g.get("/api/meta?path=/media-mentions").json()["status"] == 404


def test_search(m):
    a = admin(m)
    a.post("/api/admin/items/mention", json={"title": "Yangi laboratoriya haqida reportaj", "outlet": "Campus TV", "type": "tv", "status": "published"})
    r = guest(m).get("/api/search?q=reportaj").json()["items"]
    assert any(x["type"] == "mention" and x["to"] == "/media-mentions" for x in r)
    r = guest(m).get("/api/search?q=tashkil etildi").json()["items"]
    assert any(x["type"] == "milestone" and x["to"].startswith("/history#y-") for x in r)


# ------------------------------------------------------------------ QA regressiyalari
def test_milestone_year_must_match_date(m):
    """Kalendar joriy oyda ochiladi: «Yil» 2024, «Aniq sana» esa 2026 tanlanib qolsa — saytda «2024 · 15-oktabr, 2026» chiqardi. Endi 400."""
    a = admin(m)
    bad = a.post("/api/admin/items/milestone", json={"title": "Bitiruv", "year": 2024, "date": "2026-10-15T12:00:00+05:00", "status": "published"})
    assert bad.status_code == 400 and bad.json()["detail"] == "milestone_year_mismatch"
    ok = a.post("/api/admin/items/milestone", json={"title": "Bitiruv", "year": 2024, "date": "2024-06-15T12:00:00+05:00", "status": "published"})
    assert ok.status_code == 200 and ok.json()["year"] == 2024
    # yil bo'sh — sanadan olinadi
    auto = a.post("/api/admin/items/milestone", json={"title": "Akkreditatsiya", "year": None, "date": "2025-03-01T12:00:00+05:00", "status": "draft"}).json()
    assert auto["year"] == 2025
    # tahrirlashda ham tekshiriladi
    assert a.put(f"/api/admin/items/milestone/{ok.json()['id']}", json={"date": "2023-01-01T12:00:00+05:00"}).json()["detail"] == "milestone_year_mismatch"
    for x in (ok.json(), auto):
        a.delete(f"/api/admin/items/milestone/{x['id']}")


def test_admin_site_sections_status(m):
    """Admin bo'lim sahifasidagi holat qatori: bo'sh bo'lim «saytda ko'rinmaydi» (keshsiz — saqlangandan keyin darhol), menyuda bormi."""
    a, g = admin(m), guest(m)
    assert g.get("/api/admin/site-sections").status_code in (401, 403)
    for x in a.get("/api/admin/items/mention").json()["items"]:
        a.delete(f"/api/admin/items/mention/{x['id']}")
    s = a.get("/api/admin/site-sections").json()
    assert s["/media-mentions"] == {"visible": False, "in_menu": True}
    assert s["/career-center"]["visible"] is True and "/gallery" in s and "/startups" in s
    it = a.post("/api/admin/items/mention", json=KINDS["mention"][2] | {"status": "draft"}).json()
    assert a.get("/api/admin/site-sections").json()["/media-mentions"]["visible"] is False  # qoralama — hali ko'rinmaydi
    a.put(f"/api/admin/items/mention/{it['id']}", json={"status": "published"})
    assert a.get("/api/admin/site-sections").json()["/media-mentions"]["visible"] is True
    # saytdagi menyu ham darhol yangilanadi (admin saqlagach kesh tozalanadi)
    menu = g.get("/api/site").json()["site"]["menu"]
    assert any((c.get("url") or "") == "/media-mentions" for x in menu for c in x.get("children") or [])
    a.delete(f"/api/admin/items/mention/{it['id']}")
    menu = g.get("/api/site").json()["site"]["menu"]
    assert not any((c.get("url") or "") == "/media-mentions" for x in menu for c in x.get("children") or [])
