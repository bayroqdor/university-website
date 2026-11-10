"""Hamkorlik va karyera: imkoniyatlar CRUD va ruxsatlar, muddati o'tganlarni yopish, kompaniya arizasi → moderatsiya (murojaat, xat),
JobPosting JSON-LD, talaba kabineti (mos yo'nalish birinchi) va kunlik jamlangan xabar, hamkorlar filtrlari va amaliyot bazalari,
bitiruvchilar (rozilik, ro'yxat, Excel), startaplar, maqolalar va RSS, sayt xaritasi, SEO va qidiruv."""
import importlib
import io
import json
import re
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


_C: dict = {}


def admin(m):
    if "a" not in _C:
        c = TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126"})
        assert c.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
        c.headers["x-admin-realm"] = "admin"
        _C["a"] = c
    return _C["a"]


def student(m):
    if "s" not in _C:
        c = TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126"})
        assert c.post("/api/auth/login", json={"login": "student", "password": "demo2025"}).status_code == 200
        _C["s"] = c
    return _C["s"]


def svc(m):
    from university.api.deps import svc as s

    return s()


def progs(m):
    st = svc(m).st
    cur = {p["slug"]: p["id"] for p in st.list_items("program")}
    if "dasturiy-injiniring" not in cur or "iqtisodiyot" not in cur:
        a = admin(m)
        for slug, title, code, deg in (
            ("dasturiy-injiniring", "Dasturiy injiniring", "60610200", "bachelor"),
            ("iqtisodiyot", "Iqtisodiyot", "60310100", "bachelor"),
        ):
            if slug not in cur:
                r = a.post("/api/admin/items/program", json={"title": title, "slug": slug, "code": code, "degree": deg, "status": "published"}).json()
                cur[slug] = r["id"]
    return cur


def future(days=10):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(timespec="seconds")


def past(days=1):
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")


def test_hidden_when_empty(m):
    g = TestClient(m.app)
    r = g.get("/api/career").json()
    assert r["items"] == [] and r["info"] == "" and r["contacts"]["staff"] == []
    assert g.get("/api/startups").json()["items"] == []
    a = g.get("/api/articles").json()
    assert a["items"] == [] and "food_safety" in a["topics"]
    al = g.get("/api/alumni").json()
    assert al["items"] == [] and al["stats"] == []
    # bo'sh bo'limlar qidiruvga chiqarilmaydi va sayt xaritasida yo'q; karyera markazi va bitiruvchilar (formalar) — bor
    html = g.get("/startups").text
    assert "noindex" in html
    sm = g.get("/sitemap.xml").text
    assert "/career-center<" in sm and "/alumni<" in sm and "/startups<" not in sm and "/articles<" not in sm


def test_partners_and_practice_bases(m):
    a = admin(m)
    g = TestClient(m.app)
    pid = progs(m)["dasturiy-injiniring"]
    u_partner = a.post("/api/admin/items/partner", json={"title": "Partner Tech University", "category": "academic", "country": "Germany", "city": "Berlin", "areas": ["Qo‘shma ilmiy tadqiqotlar"], "practice_base": True, "status": "published", "i18n": {"ru": {"title": "Университет-партнёр", "country": "Германия", "areas": ["Совместные научные исследования"]}}}).json()
    a.post("/api/admin/items/partner", json={"title": "Sanoat Korxonasi", "category": "industry", "status": "published"})
    a.post("/api/admin/items/partner", json={"title": "Davlat Agentligi", "category": "government", "status": "published"})
    n1 = a.post("/api/admin/items/news", json={"title": "Partner Tech University bilan memorandum", "status": "published"}).json()
    assert n1["id"]
    d = g.get("/api/cooperation/partners").json()
    by = {x["title"]: x for x in d["items"]}
    assert by["Partner Tech University"]["category"] == "academic"
    assert by["Davlat Agentligi"]["category"] == "government"
    assert by["Sanoat Korxonasi"]["category"] == "industry"
    assert all(x["slug"] for x in d["items"])
    assert d["programs"]
    # detail + ru tarjima
    w = g.get(f"/api/cooperation/partners/{u_partner['slug']}?lang=ru").json()
    assert w["item"]["country"] == "Германия" and "Совместные научные исследования" in w["item"]["areas"]
    assert any("Partner Tech University" in n["title"] for n in w["news"])
    # amaliyot bazasi + yo'nalish
    r = a.put(f"/api/admin/items/partner/{u_partner['id']}", json={"program_ids": [pid], "capacity": 20, "lat": 52.52, "lng": 13.40})
    assert r.status_code == 200, r.text
    pb = g.get("/api/cooperation/practice-bases?program=dasturiy-injiniring").json()["items"]
    assert [x["title"] for x in pb] == ["Partner Tech University"] and pb[0]["capacity"] == 20
    assert g.get("/api/cooperation/practice-bases?program=iqtisodiyot").json()["items"] == []
    # amaliyot bazasi belgisi olib tashlansa — sig'im ham tozalanadi
    r = a.post("/api/admin/items/partner", json={"title": "Test MChJ", "category": "industry", "capacity": 5, "lat": 999, "status": "published"}).json()
    assert r["capacity"] is None and r["lat"] is None and r["slug"] == "test-mchj"
    # detail SEO: Organization + geo; sayt xaritasida
    html = g.get(f"/partners/{u_partner['slug']}").text
    assert '"@type": "Organization"' in html and "GeoCoordinates" in html
    assert f"/partners/{u_partner['slug']}" in g.get("/sitemap.xml").text


def test_opportunity_crud_permissions_expiry(m):
    a = admin(m)
    pid = progs(m)["dasturiy-injiniring"]
    # ruxsatlar: faqat «career_center» roli bilan
    roles = a.get("/api/admin/roles").json()
    assert any(p["key"] == "career_center" and p["group"] == "Hamkorlik va karyera" for p in roles["perms"])
    assert any(r["id"] == "career" for r in roles["items"])
    from university import roles as R

    st = svc(m).st
    editor = {"role": "admin", "data": {"role_id": "editor"}}
    career = {"role": "admin", "data": {"role_id": "career"}}
    assert not R.allowed(st, editor, "/api/admin/items/opportunity", "POST")
    assert R.allowed(st, career, "/api/admin/items/opportunity", "POST")
    assert not R.allowed(st, editor, "/api/admin/career-center/opportunities/x/approve", "POST")
    assert R.allowed(st, career, "/api/admin/alumni/registry", "GET")
    assert not R.allowed(st, editor, "/api/admin/alumni/registry", "GET")
    assert R.allowed(st, career, "/api/admin/items/insight", "PUT")

    r = a.post("/api/admin/items/opportunity", json={"title": "Texnolog-amaliyotchi", "company": "Farg‘ona sut zavodi", "type": "internship",
                                                      "program_ids": [pid], "city": "Farg‘ona", "deadline": future(), "status": "published",
                                                      "html": "<p>Sut mahsulotlari sifat nazorati.</p>", "text": "Sut mahsulotlari sifat nazorati."})
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["status"] == "published" and o["slug"]
    r2 = a.post("/api/admin/items/opportunity", json={"title": "Buxgalter yordamchisi", "company": "Agro MChJ", "type": "part_time", "remote": True,
                                                       "program_ids": [progs(m)["buxgalteriya-hisobi"]], "status": "published"}).json()
    g = TestClient(m.app)
    items = g.get("/api/career").json()["items"]
    assert {x["title"] for x in items} >= {"Texnolog-amaliyotchi", "Buxgalter yordamchisi"}
    # muddati o'tgan e'lon saqlashda «expired» bo'ladi
    old = a.post("/api/admin/items/opportunity", json={"title": "Eski e’lon", "company": "X", "type": "project", "city": "Toshkent",
                                                        "deadline": past(), "status": "published"}).json()
    assert old["status"] == "expired"
    # nashrdan keyin muddat o'tsa — tekshiruv (sweep) yopadi
    st.patch_item_data(r2["id"], deadline=past(2))
    from university import career as K

    assert K.sweep(st, force=True) >= 1
    assert st.get_item(r2["id"])["status"] == "expired"
    titles = {x["title"] for x in g.get("/api/career").json()["items"]}
    assert "Buxgalter yordamchisi" not in titles and "Eski e’lon" not in titles
    # muddati o'tgan e'lon sahifasi: ochiladi (expired: true), lekin noindex va JobPosting yo'q
    d = g.get(f"/api/career/{old['slug']}").json()
    assert d["item"]["expired"] is True
    html = g.get(f"/career-center/{old['slug']}").text
    assert "noindex" in html and "JobPosting" not in html
    # ochiq e'lon: JobPosting (Google Jobs)
    html = g.get(f"/career-center/{o['slug']}").text
    ld = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S).group(1))
    jp = next(x for x in ld["@graph"] if x.get("@type") == "JobPosting")
    assert jp["hiringOrganization"]["name"] == "Farg‘ona sut zavodi" and jp["employmentType"] == "INTERN"
    assert jp["jobLocation"]["address"]["addressLocality"] == "Farg‘ona" and jp["validThrough"]
    assert any(x.get("@type") == "BreadcrumbList" for x in ld["@graph"])
    # qidiruv va sayt xaritasi
    found = g.get("/api/search?q=texnolog-amaliyotchi").json()["items"]
    assert any(x["to"] == f"/career-center/{o['slug']}" for x in found)
    sm = g.get("/sitemap.xml").text
    assert f"/career-center/{o['slug']}" in sm and f"/career-center/{old['slug']}" not in sm
    # o'chirish
    assert a.delete(f"/api/admin/items/opportunity/{old['id']}").status_code == 200
    assert g.get(f"/api/career/{old['slug']}").status_code == 404


def _wait_mail(st, to, n=1):
    for _ in range(40):
        rows = st._q("SELECT * FROM email_log WHERE recipient=%s AND kind='career'", (to,))
        if len(rows) >= n:
            return rows
        time.sleep(0.1)
    return st._q("SELECT * FROM email_log WHERE recipient=%s AND kind='career'", (to,))


def test_public_submission_moderation(m):
    g = TestClient(m.app, headers={"x-forwarded-for": "10.7.7.1"})
    pid = progs(m)["dasturiy-injiniring"]
    bad = g.post("/api/career/submit", json={"company": "", "email": "x", "title": "ab", "type": "zzz", "description": "qisqa"})
    assert bad.status_code == 400
    f = bad.json()["detail"]["fields"]
    assert {"company", "contact_name", "email", "title", "type", "city", "description", "apply", "agree"} <= set(f)
    good = {"company": "Tech Solutions MChJ", "contact_name": "Aliyev Vali", "email": "hr@techcorp.example", "phone": "+998 90 111 22 33",
            "title": "Dasturchi (stajirovka)", "type": "traineeship", "city": "Toshkent", "salary": "kelishiladi",
            "description": "Dasturiy tizimlar ishlab chiqish va sinovdan o‘tkazish bo‘yicha stajirovka.",
            "requirements": "Dasturiy injiniring talabasi\nJamoada ishlash", "apply_email": "hr@techcorp.example",
            "deadline": (datetime.now() + timedelta(days=20)).date().isoformat(), "program_ids": [pid, "nope"], "agree": True, "lang": "ru"}
    r = g.post("/api/career/submit", json=good)
    assert r.status_code == 200, r.text
    assert r.json()["ticket"] > 0
    st = svc(m).st
    it = next(x for x in st.list_items("opportunity") if x["title"] == good["title"])
    assert it["status"] == "pending" and it["program_ids"] == [pid] and it["requirements"] == ["Dasturiy injiniring talabasi", "Jamoada ishlash"]
    assert it["submitter"]["email"] == "hr@techcorp.example" and it["deadline"].startswith(good["deadline"])
    # saytda ko'rinmaydi
    assert good["title"] not in {x["title"] for x in g.get("/api/career").json()["items"]}
    assert g.get(f"/api/career/{it['slug']}").status_code == 404
    # murojaat: «Karyera markazi» bo'limida (bo'lim bir marta yaratiladi)
    from university.api.desk import _desk

    d = _desk()
    cats = [c for c in d.categories() if c["title"] == "Karyera markazi"]
    assert len(cats) == 1
    t = d.get(it["ticket_id"])
    assert t["category_id"] == cats[0]["id"] and "Tech Solutions" in t["body"]
    from university import career as K

    assert K.desk_category(d)["id"] == cats[0]["id"]
    a = admin(m)
    # rad etish: sabab majburiy, xat yuboriladi, murojaat «Rad etildi»
    assert a.post(f"/api/admin/career-center/opportunities/{it['id']}/reject", json={"reason": ""}).status_code == 400
    r = a.post(f"/api/admin/career-center/opportunities/{it['id']}/reject", json={"reason": "Aloqa ma’lumotlari to‘liq emas"}).json()
    assert r["item"]["status"] == "rejected" and r["mailed"] is True
    assert d.get(it["ticket_id"])["stage"] == "failed"
    rows = _wait_mail(st, "hr@techcorp.example")
    assert rows and "не опубликовано" in rows[0]["subject"]
    # tasdiqlash: nashr, xat, murojaat «Hal qilindi»
    r = a.post(f"/api/admin/career-center/opportunities/{it['id']}/approve").json()
    assert r["item"]["status"] == "published" and r["item"]["published_at"]
    assert d.get(it["ticket_id"])["stage"] == "resolved"
    rows = _wait_mail(st, "hr@techcorp.example", 2)
    assert len(rows) == 2
    assert good["title"] in {x["title"] for x in g.get("/api/career").json()["items"]}
    # honeypot
    assert g.post("/api/career/submit", json=good | {"hp": "bot"}).json()["ticket"] == 0
    s = a.get("/api/admin/career-center/settings").json()
    assert s["counts"]["published"] >= 1


def test_portal_relevance_and_digest(m):
    st = svc(m).st
    from university import career as K

    p = progs(m)
    s = student(m)
    d = s.get("/api/portal/career").json()
    assert d["program"]["id"] == p["dasturiy-injiniring"]
    assert d["items"] and d["items"][0]["match"] is True
    assert [x["match"] for x in d["items"]] == sorted([x["match"] for x in d["items"]], reverse=True)
    # kunlik jamlangan xabar: mos yo'nalish talabalariga bitta bildirishnoma, 20 soat ichida takrorlanmaydi
    st.kv_put("career_notify_since", past(30))
    with st._tx() as c:
        c.execute("DELETE FROM career_notify")
    n = K.run_digest(st)
    assert n >= 1
    me = st.find_user("student")
    notes = [x for x in st.notices_for("student", me["group_id"], user_id=me["id"]) if x.get("link") == "/student/career"]
    assert len(notes) == 1 and "Karyera markazi" in notes[0]["title"]
    # qo'ng'iroqchada (yuqori panel) ham ko'rinadi — avval faqat «Bildirishnomalar» ro'yxatida edi
    bell = s.get("/api/portal/notifications").json()
    assert any(x["kind"] == "career" and x["link"] == "/student/career" for x in bell["items"]) and bell["unread"] >= 1
    a = admin(m)
    a.post("/api/admin/items/opportunity", json={"title": "Yana bir amaliyot", "company": "Z", "type": "internship", "city": "Farg‘ona",
                                                 "program_ids": [p["dasturiy-injiniring"]], "status": "published"})
    assert K.run_digest(st) == 0  # bugun allaqachon yuborilgan
    later = datetime.now(timezone.utc) + timedelta(hours=21)
    assert K.run_digest(st, now=later) >= 1
    notes = [x for x in st.notices_for("student", me["group_id"], user_id=me["id"]) if x.get("link") == "/student/career"]
    assert len(notes) == 2 and any("Yana bir amaliyot" in x["title"] + x["body"] for x in notes)
    # boshqa yo'nalish talabasi (IQ guruhi) bu xabarni olmaydi
    other = st.find_user("student4") or st.find_user("student5")
    if other and other.get("group_id") != me["group_id"]:
        assert not [x for x in st.notices_for("student", other["group_id"], user_id=other["id"]) if x.get("link") == "/student/career"]
    # xabarni o'chirish
    assert s.put("/api/portal/career/notify", json={"on": False}).json()["muted"] is True
    assert s.get("/api/portal/career").json()["muted"] is True
    a.post("/api/admin/items/opportunity", json={"title": "Uchinchi amaliyot", "company": "Z", "type": "internship", "city": "Farg‘ona",
                                                 "program_ids": [p["dasturiy-injiniring"]], "status": "published"})
    K.run_digest(st, now=later + timedelta(days=2))
    assert len([x for x in st.notices_for("student", me["group_id"], user_id=me["id"]) if x.get("link") == "/student/career"]) == 2
    s.put("/api/portal/career/notify", json={"on": True})


def test_alumni_consent_registry_stats(m):
    a = admin(m)
    g = TestClient(m.app, headers={"x-forwarded-for": "10.7.7.2"})
    pid = progs(m)["iqtisodiyot"]
    # roziliksiz hikoya nashr qilinmaydi: «nashr» so'ralsa — aniq xato (avval jimgina qoralama bo'lib «Saqlandi» deyilardi), qoralama — saqlanadi
    body = {"title": "Test Bitiruvchi", "year": 2025, "program_id": pid, "position": "Iqtisodchi", "quote": "Rahmat!", "consent": False}
    bad = a.post("/api/admin/items/alumni", json=body | {"status": "published"})
    assert bad.status_code == 400 and bad.json()["detail"] == "alumni_consent"
    r = a.post("/api/admin/items/alumni", json=body | {"status": "draft"}).json()
    assert r["status"] == "draft"
    assert a.put(f"/api/admin/items/alumni/{r['id']}", json={"status": "published"}).json()["detail"] == "alumni_consent"
    assert g.get("/api/alumni").json()["items"] == []
    r = a.put(f"/api/admin/items/alumni/{r['id']}", json={"consent": True, "status": "published"}).json()
    assert r["status"] == "published"
    al = g.get("/api/alumni").json()
    assert al["items"][0]["program"] == "Iqtisodiyot"
    assert g.get(f"/api/alumni/{r['slug']}").json()["item"]["title"] == "Test Bitiruvchi"
    html = g.get(f"/alumni/{r['slug']}").text
    assert '"alumniOf"' in html
    # ro'yxatga olish formasi
    bad = g.post("/api/alumni/register", json={"name": "Ali", "year": 1800})
    assert set(bad.json()["detail"]["fields"]) >= {"name", "year", "program_id", "contact", "agree"}
    ok = {"name": "Karimova Dilnoza Akmal qizi", "year": 2025, "program_id": pid, "job": "Buxgalter", "company": "Agro MChJ", "city": "Farg‘ona",
          "email": "dilnoza@example.com", "consent_contact": True, "consent_publish": False, "agree": True}
    assert g.post("/api/alumni/register", json=ok).status_code == 200
    assert g.post("/api/alumni/register", json=ok).json()["detail"] == "duplicate"
    # ochiq saytda ko'rinmaydi, admin ro'yxatida bor
    assert "Dilnoza" not in json.dumps(g.get("/api/alumni").json(), ensure_ascii=False)
    lst = a.get("/api/admin/alumni/registry?q=dilnoza").json()
    assert lst["items"][0]["consent_contact"] is True and lst["items"][0]["consent_publish"] is False
    assert a.get("/api/admin/alumni/registry?year=2024").json()["items"] == []
    x = a.get("/api/admin/alumni/registry.xlsx")
    assert x.status_code == 200 and x.headers["content-type"].startswith("application/vnd.openxmlformats")
    from openpyxl import load_workbook

    ws = load_workbook(io.BytesIO(x.content)).active
    assert any("Karimova Dilnoza" in str(c.value) for row in ws.iter_rows() for c in row)
    # ro'yxatdan hikoya qoralamasi: nashrga rozilik yo'q → qoralama, nashr qilib bo'lmaydi
    rid = lst["items"][0]["id"]
    sid = a.post(f"/api/admin/alumni/registry/{rid}/story").json()["id"]
    story = a.put(f"/api/admin/items/alumni/{sid}", json={"status": "published"})
    assert story.status_code == 400 and story.json()["detail"] == "alumni_consent"
    story = a.get(f"/api/admin/items/alumni/{sid}").json()
    assert story["status"] == "draft" and story["consent"] is False
    assert a.put(f"/api/admin/alumni/registry/{rid}", json={"status": "contacted", "note": "Qo‘ng‘iroq qilindi"}).status_code == 200
    assert a.delete(f"/api/admin/alumni/registry/{rid}").status_code == 200
    # bandlik statistikasi: faqat admin kiritgan to'g'ri qiymatlar
    rows = a.put("/api/admin/alumni/stats", json={"rows": [{"year": 2025, "program_id": pid, "graduates": 40, "employed_pct": 85},
                                                          {"year": 2025, "program_id": "", "graduates": "", "employed_pct": 140},
                                                          {"year": 1900, "graduates": 3}]}).json()["rows"]
    assert rows == [{"year": 2025, "program_id": pid, "graduates": 40, "employed_pct": 85.0}]
    assert g.get("/api/alumni").json()["stats"][0]["program"] == "Iqtisodiyot"
    # registr API ruxsatsiz — yopiq
    assert g.get("/api/admin/alumni/registry").status_code in (401, 403)


def test_startups(m):
    a = admin(m)
    st = svc(m).st
    staff = st.list_items("staff", public=True)[0]
    partner = next(x for x in st.list_items("partner") if x.get("slug"))
    r = a.post("/api/admin/items/startup", json={"title": "Quruq meva qadoqlash yechimi", "stage": "prototype", "category": "packaging",
                                                  "summary": "Biologik parchalanadigan qadoq.", "team": [{"name": "Talaba A", "role": "muallif"},
                                                                                                      {"name": staff["title"], "staff_id": staff["id"], "kind": "teacher"}, {"x": 1}],
                                                  "images": ["/media/a.jpg", "javascript:alert(1)"], "awards": ["Tanlov g‘olibi"], "partner_ids": [partner["id"]],
                                                  "status": "published"}).json()
    assert len(r["team"]) == 2 and r["images"] == ["/media/a.jpg"]
    g = TestClient(m.app)
    lst = g.get("/api/startups").json()["items"]
    assert lst[0]["stage"] == "prototype"
    d = g.get(f"/api/startups/{r['slug']}").json()
    assert d["item"]["team"][1]["slug"] == staff["slug"] and d["item"]["partner_cards"][0]["title"]
    html = g.get(f"/startups/{r['slug']}").text
    assert '"CreativeWork"' in html and '"award"' in html
    assert "noindex" not in g.get("/startups").text
    assert "/startups<" in g.get("/sitemap.xml").text


def test_articles_rss_jsonld(m):
    a = admin(m)
    st = svc(m).st
    staff = st.list_items("staff", public=True)[0]
    body = "Dasturiy injiniring " * 450
    r = a.post("/api/admin/items/insight", json={"title": "Muzlatilgan mahsulotlarni to‘g‘ri saqlash", "author_id": staff["id"],
                                                  "topics": ["food_safety", "bogus"], "tags": ["saqlash"], "html": f"<p>{body}</p>", "text": body,
                                                  "sources": [{"title": "Codex Alimentarius", "url": "https://www.fao.org/fao-who-codexalimentarius"}, {"title": ""}],
                                                  "status": "published"}).json()
    assert r["topics"] == ["food_safety"] and r["reading_time"] >= 4 and len(r["sources"]) == 1 and r["excerpt"]
    r2 = a.post("/api/admin/items/insight", json={"title": "Sog‘lom nonushta", "topics": ["nutrition", "food_safety"], "author_name": "Mehmon muallif",
                                                   "html": "<p>Matn</p>", "text": "Matn", "status": "published"}).json()
    draft = a.post("/api/admin/items/insight", json={"title": "Qoralama maqola", "status": "draft"}).json()
    g = TestClient(m.app)
    lst = g.get("/api/articles").json()["items"]
    assert {x["title"] for x in lst} == {r["title"], r2["title"]}
    assert next(x for x in lst if x["id"] == r["id"])["author"]["slug"] == staff["slug"]
    d = g.get(f"/api/articles/{r['slug']}").json()
    assert d["author"]["title"] == staff["title"] and d["related"][0]["id"] == r2["id"]
    assert g.get(f"/api/articles/{draft['slug']}").status_code == 404
    html = g.get(f"/articles/{r['slug']}").text
    ld = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S).group(1))
    art = next(x for x in ld["@graph"] if x.get("@type") == "Article")
    assert art["author"]["name"] == staff["title"] and art["citation"] == ["https://www.fao.org/fao-who-codexalimentarius"]
    assert 'property="og:type" content="article"' in html and "/articles/rss.xml" in g.get("/articles").text
    rss = g.get("/articles/rss.xml")
    assert rss.status_code == 200 and "application/rss+xml" in rss.headers["content-type"]
    assert r["title"] in rss.text and "<dc:creator>" in rss.text and draft["title"] not in rss.text
    assert "/articles<" in g.get("/sitemap.xml").text
    assert any(x["to"] == f"/articles/{r['slug']}" for x in g.get("/api/search?q=muzlatilgan").json()["items"])


def test_seo_sections(m):
    g = TestClient(m.app)
    for path, word in (("/career-center", "Karyera markazi"), ("/alumni", "Bitiruvchilar"), ("/partners", "Hamkorlar")):
        r = g.get(path)
        assert r.status_code == 200 and word in r.text
    assert g.get("/career-center/yoq-sahifa").status_code == 404
    assert g.get("/articles/yoq").status_code == 404
    html = g.get("/career-center?lang=en").text
    assert "Career Centre" in html
