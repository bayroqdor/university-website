"""Grant taqsimoti: qabul yopiq/ochiq, ariza tekshiruvi, admin jadvali va holat, Excel eksport, natijalarni Excel'dan o'qish,
tasdiqlanganlardan yasash, e'lon qilish va saytdagi ko'rinish, ruxsatlar, menyu migratsiyasi."""
import importlib
import io

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
    """Bitta admin sessiyasi butun modul uchun (login so'rovlari IP bo'yicha cheklangan — boshqa test modullariga ta'sir qilmasin)."""
    if id(m) not in _ADMIN:
        c = TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126"})
        assert c.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
        c.headers["x-admin-realm"] = "admin"
        _ADMIN[id(m)] = c
    return _ADMIN[id(m)]


APP = {"full_name": "Karimov Aziz Botir o‘g‘li", "course": "2", "group": "9-24", "field": "Dasturiy injiniring", "edu_lang": "uz",
       "phone": "+998 90 123 45 67", "email": "", "reason": "A’lo baholar va ijtimoiy faollik, oilaviy sharoit."}


def test_grants_flow(m):
    g = TestClient(m.app, headers={"x-forwarded-for": "10.9.9.1"})
    assert g.get("/api/grants").json()["open"] is False
    assert g.post("/api/grants/apply", json=APP).json()["detail"] == "closed"
    a = admin(m)
    s = a.put("/api/admin/grants/settings", json={"open": True, "notice": {"uz": "Diqqat matni"}}).json()
    assert s["open"] and s["notice"] == {"uz": "Diqqat matni"}
    bad = g.post("/api/grants/apply", json=APP | {"full_name": "Aziz", "phone": "123", "reason": "", "course": "9"})
    assert bad.status_code == 400 and set(bad.json()["detail"]["fields"]) >= {"full_name", "phone", "reason", "course"}
    r = g.post("/api/grants/apply", json=APP)
    assert r.status_code == 200, r.text
    assert g.post("/api/grants/apply", json=APP).json()["detail"] == "duplicate"
    g2 = TestClient(m.app, headers={"x-forwarded-for": "10.9.9.2"})
    assert g2.post("/api/grants/apply", json=APP | {"full_name": "Valiyeva Nodira Anvar qizi", "phone": "901112233", "course": "master", "edu_lang": "ru"}).status_code == 200
    # ruxsat
    assert TestClient(m.app).get("/api/admin/grants").status_code in (401, 403)
    d = a.get("/api/admin/grants").json()
    assert d["total"] == 2 and d["counts"]["new"] == 2
    karimov = next(x for x in d["items"] if x["full_name"].startswith("Karimov"))
    assert karimov["phone"] == "+998901234567"
    assert a.patch(f"/api/admin/grants/apps/{karimov['id']}", json={"status": "approved", "note": "Komissiya: ma’qul"}).json()["status"] == "approved"
    assert len(a.get("/api/admin/grants?status=approved").json()["items"]) == 1
    assert len(a.get("/api/admin/grants?q=nodira").json()["items"]) == 1
    x = a.get("/api/admin/grants/apps.xlsx")
    assert x.status_code == 200 and x.content[:2] == b"PK"
    from openpyxl import load_workbook

    ws = load_workbook(io.BytesIO(x.content)).active
    assert ws["B1"].value == "F.I.Sh." and {ws["B2"].value, ws["B3"].value} == {"Karimov Aziz Botir o‘g‘li", "Valiyeva Nodira Anvar qizi"}
    # natijalar: namuna → o'qish (bo'lim sarlavhalari bilan)
    tpl = a.get("/api/admin/grants/results-template.xlsx").content
    groups = a.post("/api/admin/grants/results/parse", files={"file": ("n.xlsx", tpl)}).json()["groups"]
    assert [g_["title"] for g_ in groups] == ["Bakalavriat (kunduzgi)", "Bakalavriat (sirtqi)"] and len(groups[0]["rows"]) == 2
    assert groups[0]["columns"][1] == "Familiya, ismi, sharifi"
    assert a.post("/api/admin/grants/results/parse", files={"file": ("n.xlsx", b"not excel")}).json()["detail"] == "bad_xlsx"
    ap = a.post("/api/admin/grants/results/from-approved").json()["groups"]
    assert ap[0]["title"] == "2-kurs" and ap[0]["rows"][0][1].startswith("Karimov")
    # hali e'lon qilinmagan
    a.put("/api/admin/grants/settings", json={"open": True, "published": False, "results": {"title": {"uz": "Natijalar 2025"}, "groups": groups}})
    assert g.get("/api/grants").json()["results"] is None
    a.put("/api/admin/grants/settings", json={"open": False, "published": True, "results": {"title": {"uz": "Natijalar 2025"}, "groups": groups, "file": "javascript:x"}})
    pub = g.get("/api/grants").json()
    assert pub["open"] is False and pub["results"]["title"]["uz"] == "Natijalar 2025" and pub["results"]["file"] == ""
    assert len(pub["results"]["groups"]) == 2
    page = g.get("/grant-redistribution")
    assert page.status_code == 200 and "Grant taqsimoti" in page.text


def test_grants_closed_after_publish(m):
    """Natijalar e'lon qilingach: ochiq API «yopiq» deydi, yangi ariza rad etiladi; admin «Qabul ochiq»ni yoqib qo'ysa ham."""
    g = TestClient(m.app, headers={"x-forwarded-for": "10.9.9.3"})
    a = admin(m)
    grp = [{"title": "1-kurs", "columns": ["№", "F.I.Sh."], "rows": [["1", "Aliyev Vali"]]}]
    app2 = APP | {"full_name": "Toshmatov Jasur Ali o‘g‘li", "phone": "+998 93 555 66 77"}
    a.put("/api/admin/grants/settings", json={"open": True, "published": False})
    assert g.get("/api/grants").json()["open"] is True
    # e'lon qilish: admin «open» ni ham yuborsa — qabul yopiladi
    s = a.put("/api/admin/grants/settings", json={"open": True, "published": True, "results": {"groups": grp, "file": "/media/qaror.pdf"}}).json()
    assert s["open"] is False and s["published"] is True
    assert a.get("/api/admin/grants").json()["settings"]["open"] is False
    pub = g.get("/api/grants").json()
    assert pub["open"] is False and pub["published"] is True and pub["results"]["file"] == "/media/qaror.pdf"
    r = g.post("/api/grants/apply", json=app2)
    assert r.status_code == 400 and r.json()["detail"] == "closed"
    # eski baza: kv'da open=True va published=True birga saqlangan bo'lsa ham — yopiq
    st = m.svc().st
    st.kv_put("grants", (st.kv_get("grants") or {}) | {"open": True, "published": True})
    assert g.get("/api/grants").json()["open"] is False
    assert g.post("/api/grants/apply", json=app2).json()["detail"] == "closed"
    # e'lon bekor qilinib, qabul qayta ochilsa — yana ariza olinadi
    a.put("/api/admin/grants/settings", json={"open": True, "published": False})
    pub = g.get("/api/grants").json()
    assert pub["open"] is True and pub["published"] is False and pub["results"] is None
    assert g.post("/api/grants/apply", json=app2).status_code == 200
    # muddat o'tgan bo'lsa — API ham yopiq deydi
    a.put("/api/admin/grants/settings", json={"open": True, "deadline": "2000-01-01"})
    assert g.get("/api/grants").json()["open"] is False
    assert g.post("/api/grants/apply", json=app2 | {"phone": "+998 93 555 66 78"}).json()["detail"] == "closed"
    a.put("/api/admin/grants/settings", json={"open": False})


def test_grant_menu_migration(m):
    st = m.svc().st
    site = st.kv_get("site") or {}
    site["menu"] = [{"label": "Talabalar", "url": "/students", "children": [{"label": "Grant", "url": "/about/grantga-qayta-taqsimot"}]}]
    st.kv_put("site", site)
    st.kv_put("menu_grants_v1", None)
    import university.api.deps as deps

    deps.reset_service()
    assert m.svc().st.kv_get("site")["menu"][0]["children"][0]["url"] == "/grant-redistribution"


def test_notices_to_students_from_users_page(m):
    """«Foydalanuvchilar → Talabalar»: belgilangan talabalarga shaxsiy, guruhga va barchaga bildirishnoma; kabinetda ko'rinadi."""
    a = admin(m)
    gid = a.post("/api/admin/acad/groups", json={"name": "N-25"}).json()["id"]
    ids = []
    for i in range(3):
        r = a.post("/api/admin/users", json={"role": "student", "login": f"Not.Talaba{i}", "name": f"Talaba {i}", "password": "Parol-2025x",
                                             "group_id": gid if i < 2 else None})
        assert r.status_code == 200, r.text
        ids.append(r.json()["id"])

    def inbox(i):
        c = TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126"})
        assert c.post("/api/auth/login", json={"login": f"Not.Talaba{i}", "password": "Parol-2025x"}).status_code == 200
        return [n["title"] for n in c.get("/api/portal/notices").json()["items"]]

    assert a.post("/api/admin/notices/send", json={"target": "selected", "title": "", "user_ids": ids}).status_code == 400
    assert a.post("/api/admin/notices/send", json={"target": "selected", "title": "X", "user_ids": []}).status_code == 400
    r = a.post("/api/admin/notices/send", json={"target": "selected", "title": "Shaxsiy xabar", "body": "Dekanatga keling", "user_ids": [ids[0]]}).json()
    assert r["recipients"] == 1 and r["mailed"] == 0
    r = a.post("/api/admin/notices/send", json={"target": "group", "group_id": gid, "title": "Guruhga xabar"}).json()
    assert r["recipients"] == 2
    a.post("/api/admin/notices/send", json={"target": "students", "title": "Hammaga xabar"})
    assert {"Shaxsiy xabar", "Guruhga xabar", "Hammaga xabar"} <= set(inbox(0))
    two = inbox(1)
    assert "Guruhga xabar" in two and "Shaxsiy xabar" not in two
    three = inbox(2)
    assert "Hammaga xabar" in three and "Guruhga xabar" not in three


def test_page_contact_person(m):
    """Maxsus sahifalarda mas'ul xodim kartasi: seed'dan, qabul vaqti alohida maydon; admin o‘zgartira oladi."""
    c = TestClient(m.app)
    d = c.get("/api/pages/tadqiqot-va-innovatsiyalar").json()
    assert len(d["contacts"]) == 1
    p = d["contacts"][0]
    assert p["title"].startswith("Xoshimov") and p["hours"].startswith("Qabul vaqti") and p["photo"] and p["phone"]
    assert "Приём" in c.get("/api/pages/tadqiqot-va-innovatsiyalar?lang=ru").json()["contacts"][0]["hours"]
    assert c.get("/api/pages/korrupsiyaga-qarshi").json()["contacts"][0]["title"].startswith("Kaxxarov")
    a = admin(m)
    page = next(x for x in a.get("/api/admin/items/page").json()["items"] if x["slug"] == "korrupsiyaga-qarshi")
    full = a.get(f"/api/admin/items/page/{page['id']}").json()
    staff = a.get("/api/admin/items/staff").json()["items"]
    other = next(x for x in staff if x["status"] == "published" and x["id"] != p["id"])
    r = a.put(f"/api/admin/items/page/{page['id']}", json=full | {"contact_ids": [p["id"], other["id"]]})
    assert r.status_code == 200, r.text
    assert [x["id"] for x in c.get("/api/pages/korrupsiyaga-qarshi").json()["contacts"]] == [p["id"], other["id"]]


def test_media_from_url_blocks_internal_hosts(m):
    """Muharrirga nusxalangan rasmlarni serverga ko'chirish: ichki tarmoq / localhost / metadata manzillari rad etiladi."""
    a = admin(m)
    for url in ("http://127.0.0.1:8000/api/admin/users", "http://localhost/x.png", "http://169.254.169.254/latest/meta-data/",
                "http://10.0.0.2/a.png", "http://[::1]/a.png", "file:///etc/passwd", "ftp://example.com/a.png"):
        r = a.post("/api/admin/media/from-url", json={"url": url})
        assert r.status_code == 400 and r.json()["detail"] in ("blocked_host", "invalid_url"), (url, r.text)
    assert TestClient(m.app).post("/api/admin/media/from-url", json={"url": "https://example.com/a.png"}).status_code in (401, 403)


def test_blog_doc_keeps_document_block(m):
    from university.community import clean_doc

    d = clean_doc({"type": "doc", "content": [{"type": "docEmbed", "attrs": {"src": "/media/abc.pdf", "title": "Buyruq"}},
                                              {"type": "docEmbed", "attrs": {"src": "javascript:alert(1)", "title": "x"}}]})
    assert d["content"] == [{"type": "docEmbed", "attrs": {"src": "/media/abc.pdf", "title": "Buyruq"}}]


def test_stock_pages_published(m):
    """Boshlang'ich holatda standart sahifalar mavjud va 3 tilda nashr qilingan."""
    c = TestClient(m.app)
    for slug in ("about-university", "research", "anti-corruption", "terms-of-use"):
        d = c.get(f"/api/pages/{slug}").json()
        assert d["item"]["html"] and c.get(f"/api/pages/{slug}?lang=en").json()["item"]["html"], slug
