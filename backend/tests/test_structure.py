"""Tuzilma (bo'limlar) sahifasi: rahbar alohida, xodimlar ro'yxati; Vakansiyalar menyuda (seed va eski bazalar migratsiyasi)."""
import importlib

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


def _careers(menu: list) -> list:
    return [(m.get("label"), c) for m in menu for c in [m, *(m.get("children") or [])] if (c.get("url") or "").startswith("/careers")]


def test_department_head_and_members(m):
    a = TestClient(m.app, headers={"x-forwarded-for": "10.55.0.1"})
    assert a.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
    a.headers["x-admin-realm"] = "admin"
    f1 = a.post("/api/admin/items/faculty", json={"title": "Muhandislik fakulteti", "slug": "muhandislik-fakulteti", "category": "faculty", "status": "published", "i18n": {"ru": {"title": "Инженерный факультет"}}}).json()
    f2 = a.post("/api/admin/items/faculty", json={"title": "Bo‘sh bo‘lim", "slug": "bosh-bolim", "category": "center", "status": "published"}).json()
    up = a.post("/api/admin/media", files={"file": ("head.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde", "image/png")}).json()
    head = a.post("/api/admin/items/staff", json={"title": "Aliyev Anvar", "position": "Dekan", "hours": "09:00–12:00", "photo": up["url"], "faculty_id": f1["id"], "is_head": True, "status": "published"}).json()
    a.post("/api/admin/items/staff", json={"title": "Karimova Dilbar", "position": "Dotsent", "faculty_id": f1["id"], "status": "published"})
    assert f2["id"]
    c = TestClient(m.app)
    items = c.get("/api/structure").json()["items"]
    fac = next(x for x in items if x["slug"] == "muhandislik-fakulteti")
    assert fac["head"] == "Aliyev Anvar" and fac["head_photo"] == up["url"] and fac["staff_count"] >= 2
    empty = next(x for x in items if x["staff_count"] == 0)
    assert empty["head"] == "" and empty["head_photo"] == ""
    d = c.get(f"/api/structure/{fac['slug']}").json()
    assert d["head"]["id"] == head["id"] and d["head"]["hours"] and d["head"]["slug"]
    assert d["staff"] and all(x["id"] != d["head"]["id"] for x in d["staff"])  # rahbar xodimlar ro'yxatida takrorlanmaydi
    assert all("bio" not in x for x in [d["head"], *d["staff"]])
    ru = c.get(f"/api/structure/{fac['slug']}?lang=ru").json()
    assert ru["head"]["id"] == d["head"]["id"]
    # rahbari yo'q bo'lim: karta yo'q, xato ham yo'q
    none = c.get(f"/api/structure/{empty['slug']}").json()
    assert none["head"] is None and none["staff"] == []


def test_seed_menu_has_careers(m):
    from university import content as C

    found = _careers(C.MENU)
    assert len(found) == 1 and found[0][0] == "Universitet"
    assert found[0][1]["labels"] == {"ru": "Вакансии", "en": "Vacancies"} and found[0][1]["group"] == "Institut"
    menu = TestClient(m.app).get("/api/site?lang=ru").json()["site"]["menu"]
    assert any(c["url"] == "/careers" and c["label"] == "Вакансии" for x in menu for c in x.get("children") or [])


def test_careers_menu_migration(m):
    import university.api.deps as deps

    st = m.svc().st
    site = st.kv_get("site") or {}
    old = [
        {"label": "Institut haqida", "url": "/about/institut-haqida", "labels": {}, "group": "", "children": [
            {"label": "Biz haqimizda", "url": "/about/institut-haqida", "labels": {}, "group": "Institut"},
            {"label": "Markazlar", "url": "/structure", "labels": {}, "group": "Institut"},
            {"label": "Hujjatlar", "url": "/documents", "labels": {}, "group": "Ochiqlik"},
        ]},
        {"label": "Aloqa", "url": "/contact", "labels": {}, "group": "", "children": []},
    ]
    st.kv_put("site", site | {"menu": old})
    st.kv_put("menu_careers_v1", None)
    deps.reset_service()
    menu = m.svc().st.kv_get("site")["menu"]
    kids = menu[0]["children"]
    assert [k["url"] for k in kids] == ["/about/institut-haqida", "/structure", "/careers", "/documents"]
    assert kids[2]["group"] == "Institut" and len(_careers(menu)) == 1 and len(menu) == 2
    en = TestClient(m.app).get("/api/site?lang=en").json()["site"]["menu"]
    assert en[0]["children"][2]["label"] == "Vacancies"
    # qayta ishga tushirish — takrorlanmaydi
    deps.reset_service()
    assert len(_careers(m.svc().st.kv_get("site")["menu"])) == 1
    # admin olib tashlasa — qaytib kelmaydi
    st = m.svc().st
    st.kv_put("site", st.kv_get("site") | {"menu": old})
    deps.reset_service()
    assert _careers(m.svc().st.kv_get("site")["menu"]) == []
    # admin o'zi qo'ygan havola (yuqori darajada) — ikkinchisi qo'shilmaydi, admin tahriri o'zgarmaydi
    own = [old[0], {"label": "Ish o‘rinlari", "url": "/careers", "labels": {}, "group": "", "children": []}]
    st = m.svc().st
    st.kv_put("site", st.kv_get("site") | {"menu": own})
    st.kv_put("menu_careers_v1", None)
    deps.reset_service()
    menu = m.svc().st.kv_get("site")["menu"]
    assert menu == own
    # tuzilma havolasi yo'q menyu — «Aloqa» oldidan yuqori darajada
    st = m.svc().st
    st.kv_put("site", st.kv_get("site") | {"menu": [{"label": "Talabalar", "url": "/students", "labels": {}, "group": "", "children": []}, old[1]]})
    st.kv_put("menu_careers_v1", None)
    deps.reset_service()
    assert [x["url"] for x in m.svc().st.kv_get("site")["menu"]] == ["/students", "/careers", "/contact"]
    st = m.svc().st
    st.kv_put("site", st.kv_get("site") | {"menu": []})
