"""BRM sahifasi (/upgoals): admin ma'lumotlari (tozalash, saqlash), ochiq API, SEO (sarlavha, 404, sayt xaritasi), menyu migratsiyasi."""
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


def admin(m):
    c = TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126"})
    assert c.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
    c.headers["x-admin-realm"] = "admin"
    return c


def test_upgoals_data_and_seo(m):
    g = TestClient(m.app)
    assert g.get("/api/upgoals").json()["goals"] == {}
    assert g.put("/api/admin/upgoals", json={}).status_code in (401, 403)
    a = admin(m)
    r = a.put("/api/admin/upgoals", json={
        "intro": {"uz": "Kirish", "xx": "?"}, "priority": [2, "4", 99, 2],
        "goals": {"2": {"text": {"uz": "Ta'lim sifati va tadqiqot"}, "items": [
            {"title": {"uz": "Seminar"}, "date": "2026-03-01", "url": "javascript:alert(1)", "image": "/media/a.jpg"},
            {"title": {"uz": "Hakaton"}, "date": "2026-05-10"}, {"title": {}}]},
                  "40": {"text": {"uz": "yo'q"}}, "5": {"text": {}, "items": []}},
        "docs": [{"title": {"uz": "Barqarorlik siyosati"}, "url": "/media/policy.pdf", "goals": [12, 13, 0]}, {"title": {"uz": "Havolasiz"}, "url": ""}],
    })
    assert r.status_code == 200 and "intro" in r.json(), (r.status_code, r.text[:300])
    r = r.json()
    assert r["intro"] == {"uz": "Kirish"} and r["priority"] == [2, 4]
    assert list(r["goals"]) == ["2"] and [x["title"]["uz"] for x in r["goals"]["2"]["items"]] == ["Hakaton", "Seminar"]  # yangisi tepada
    assert r["goals"]["2"]["items"][1]["url"] == "" and r["goals"]["2"]["items"][1]["image"] == "/media/a.jpg"
    assert r["docs"] == [{"id": r["docs"][0]["id"], "title": {"uz": "Barqarorlik siyosati"}, "url": "/media/policy.pdf", "goals": [12, 13]}]
    assert g.get("/api/upgoals").json()["goals"]["2"]["text"]["uz"] == "Ta'lim sifati va tadqiqot"

    p = g.get("/upgoals")
    assert p.status_code == 200 and "Barqaror rivojlanish maqsadlari" in p.text
    p = g.get("/upgoals/2")
    assert p.status_code == 200 and "2-maqsad: Ochlikka barham berish" in p.text
    assert "Ликвидация голода" in g.get("/upgoals/2?lang=ru").text
    assert g.get("/upgoals/18").status_code == 404
    sm = g.get("/sitemap.xml").text
    assert "/upgoals</loc>" in sm and "/upgoals/17</loc>" in sm


def test_upgoals_menu_migration(m):
    st = m.svc().st
    site = st.kv_get("site") or {}
    site["menu"] = [{"label": "Tadqiqot", "url": "/science", "children": [{"label": "BRM", "url": "/about/barqaror-rivojlanish"}]}]
    st.kv_put("site", site)
    st.kv_put("menu_upgoals_v1", None)
    import university.api.deps as deps

    deps.reset_service()
    m.svc()
    assert m.svc().st.kv_get("site")["menu"][0]["children"][0]["url"] == "/upgoals"


def test_site_chat_answers_and_handoff(m):
    """Sayt chati: ism/telefonsiz boshlanmaydi; yo'nalishlar, aloqa, FAQ va yangi qo'shilgan kontentdan javob beradi (rus/kirillda ham);
    javob topilmasa — «Murojaatlar»da suhbat tarixi bilan chipta, keyingi javobsiz savol shu chiptaga qo'shiladi."""
    g = TestClient(m.app)
    assert g.post("/api/chat/start", json={"name": "A", "phone": "901234567"}).status_code == 400
    assert g.post("/api/chat/start", json={"name": "Ali Valiyev", "phone": "12"}).status_code == 400
    r = g.post("/api/chat/start", json={"name": "Ali Valiyev", "phone": "90 123-45-67", "lang": "uz"}).json()
    sid = r["sid"]
    assert r["phone"] == "+998901234567" and r["messages"][0]["from"] == "bot" and r["quick"]

    def ask(q):
        res = g.post(f"/api/chat/{sid}", json={"text": q})
        assert res.status_code == 200, res.text
        return res.json()["message"]

    a = ask("Qanday yo'nalishlar bor?")
    assert a["intent"] == "programs" and any(x["to"].startswith("/programs/") for x in a["links"])
    assert ask("Какие направления?")["intent"] == "programs"
    c = ask("Manzil va telefon")
    assert c["intent"] == "contacts" and "Manzil" in c["text"]
    # admin yangi FAQ qo'shsa — chat darhol biladi
    adm = admin(m)
    assert adm.post("/api/admin/items/faq", json={"title": "Sport zalida basseyn bormi?", "answer": "Ha, institutda yopiq suzish havzasi bor.", "status": "published"}).status_code == 200
    f = ask("Basseyn bormi?")
    assert f["intent"] == "faq" and "suzish havzasi" in f["text"]
    h = ask("Marsga uchish narxi qancha?")
    assert h["intent"] == "handoff"
    h2 = ask("Kosmonavtlar tayyorlanadimi?")
    assert h2["intent"] == "handoff" and "№" in h2["text"]
    st = m.svc().st
    rows = st._q("SELECT * FROM desk_tickets WHERE source='chat'")
    assert len(rows) == 1
    t = rows[0]
    assert t["requester_phone"] == "+998901234567" and "Ali Valiyev: Qanday yo'nalishlar bor?" in t["body"] and "Marsga" in t["body"]
    ev = st._q("SELECT content FROM desk_events WHERE ticket_id=%s AND kind='message_in'", (t["id"],))
    assert any("Kosmonavt" in e["content"] for e in ev)
    hist = g.get(f"/api/chat/{sid}").json()
    assert hist["ticket"] and len(hist["messages"]) >= 13
    # operator javobi sayt chatiga: «Yangi» → «Jarayonda» (holat xabarisiz); «Jarayonda»ga izoh bilan — faqat izoh, boshqa bosqich — holat xabari
    n0 = len(hist["messages"])
    d = adm.post(f"/api/admin/desk/tickets/{t['id']}/reply", data={"body": "Mutaxassis javobi", "channel": "chat"}).json()
    assert d["ticket"]["stage"] == "in_progress" and d["events"][-1]["meta"]["via"] == "reply"
    adm.post(f"/api/admin/desk/tickets/{t['id']}/move", json={"stage": "waiting", "reason": "Pasport kerak"})
    adm.post(f"/api/admin/desk/tickets/{t['id']}/move", json={"stage": "in_progress", "reason": "Ko‘rib chiqyapmiz"})
    adm.post(f"/api/admin/desk/tickets/{t['id']}/move", json={"stage": "new"})
    adm.post(f"/api/admin/desk/tickets/{t['id']}/move", json={"stage": "in_progress"})
    got = [x["text"] for x in g.get(f"/api/chat/{sid}").json()["messages"][n0:]]
    assert got[0] == "Mutaxassis javobi" and "Javob kutilmoqda" in got[1] and "Pasport kerak" in got[1] and got[2] == "Ko‘rib chiqyapmiz"
    assert len(got) == 4 and "Yangi" in got[3]
    assert g.get("/api/chat/" + "0" * 32).status_code == 404


def test_qr_behind_proxy(m):
    """QR (testlar va «Bilimdon»): brauzer domeni proksi orqali kelganda ham ishlaydi; begona domen — rad."""
    g = TestClient(m.app, base_url="http://127.0.0.1:8000")
    h = {"x-forwarded-host": "example.edu", "x-forwarded-proto": "https"}
    r = g.get("/api/qr.svg", params={"text": "https://example.edu/iq/AB12"}, headers=h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/svg")
    assert g.get("/api/qr.svg", params={"text": "/iq/AB12"}, headers=h).status_code == 200
    assert g.get("/api/qr.svg", params={"text": "https://evil.example/x"}, headers=h).status_code == 400
