"""Universitet sayti API testlari: kontent va tillar, statistika, obuna, aloqa, admin, media, SEO, rollar, dars jadvali, kabinetlar."""
import importlib
import io
import time
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

ADMIN_PW = "Admin-parol-123"
DEMO_PW = "demo2025"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63e0f789f90f0002dc01b7e9d63d0a0000000049454e44ae426082"
)
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
SENT: list[dict] = []


@pytest.fixture(scope="module")
def m(tmp_path_factory):
    import os

    static = tmp_path_factory.mktemp("static")
    (static / "index.html").write_text('<!doctype html><html lang="uz"><head><title>x</title></head><body><div id="root"></div></body></html>', encoding="utf-8")
    os.environ["SITE_DATA_DIR"] = str(tmp_path_factory.mktemp("data"))
    os.environ["SITE_STATIC_DIR"] = str(static)
    os.environ["SITE_ADMIN_PASSWORD"] = ADMIN_PW
    os.environ["SITE_DEMO_PASSWORD"] = DEMO_PW
    os.environ["SITE_URL"] = "https://site.example"
    os.environ["SITE_PREWARM"] = "0"
    import university.api.deps as deps
    import university.api.main as main
    import university.mailer as mailer

    importlib.reload(main)
    deps.reset_service()
    mailer.send = lambda smtp, to, subject, html, text=None, headers=None: SENT.append({"to": to, "subject": subject, "html": html, "headers": headers or {}})
    return main


_n = iter(range(1, 250))


def client(m, ua=UA, ip=None):
    return TestClient(m.app, headers={"user-agent": ua, "x-forwarded-for": ip or f"10.9.{next(_n) // 200}.{next(_n) % 200}"})


def login(m, user, pw, panel=False):
    """Talaba/o'qituvchi/xodim — /login (api/auth/login); administratorlar — faqat /admin (api/admin/login)."""
    c = client(m)
    is_admin = panel or user in ("admin", "scheduler")
    r = c.post("/api/admin/login" if is_admin else "/api/auth/login", json={"login": user, "password": pw})
    assert r.status_code == 200, r.text
    if is_admin:
        c.headers["x-admin-realm"] = "admin"  # admin ilovasi kabi: admin va kabinet sessiyalari alohida
    return c, r.json()


def admin(m):
    return login(m, "admin", ADMIN_PW)[0]


def wait_for(cond, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.05)
    return False


# ------------------------------------------------------------------ kontent
def test_public_content_seeded(m):
    c = client(m)
    assert c.get("/api/health").json()["status"] == "ok"
    site = c.get("/api/site").json()
    assert site["uni"]["abbr"] == "UNI" and site["langs"] == ["uz", "ru", "en"]
    assert any(p["slug"] == "about-university" for p in site["menu_pages"])
    assert site["festive"] is None and site["tuition"] is None and site["former_domains"] == []  # bezak va narxlar standart holatda o'chiq
    # Namuna fakultet, yo'nalish, yangilik, xodim va hujjatlar yaratamiz — keyingi testlar ham ulardan foydalanadi
    a = admin(m)
    a.post("/api/admin/items/faculty", json={"id": "fac-eng", "title": "Muhandislik kafedrasi", "slug": "muhandislik-kafedrasi", "category": "faculty", "status": "published", "i18n": {"en": {"title": "Department of Engineering"}}})
    a.post("/api/admin/items/faculty", json={"id": "fac-eco", "title": "Iqtisodiyot va boshqaruv kafedrasi", "slug": "iqtisodiyot-va-boshqaruv", "category": "faculty", "status": "published"})
    a.post("/api/admin/items/faculty", json={"id": "fac-fund", "title": "Fundamental fanlar", "slug": "fundamental-fanlar", "category": "office", "status": "published"})
    p_cs = a.post("/api/admin/items/program", json={"id": "prog-cs", "title": "Dasturiy injiniring", "slug": "dasturiy-injiniring", "faculty_id": "fac-eng", "degree": "bachelor", "status": "published", "i18n": {"ru": {"title": "Программная инженерия"}, "en": {"title": "Software Engineering"}}}).json()
    p_eco = a.post("/api/admin/items/program", json={"id": "prog-eco", "title": "Iqtisodiyot", "slug": "iqtisodiyot", "faculty_id": "fac-eco", "degree": "bachelor", "status": "published"}).json()
    a.post("/api/admin/items/program", json={"title": "Dasturiy injiniring (1+1)", "slug": "dasturiy-injiniring-1-1", "faculty_id": "fac-eng", "degree": "joint", "status": "published"})
    a.post("/api/admin/items/program", json={"title": "Amaliy matematika (PhD)", "slug": "amaliy-matematika-phd", "faculty_id": "fac-eng", "degree": "phd", "status": "published"})
    # Guruhlarga dastur biriktirish — o'qituvchi fakultetlar kesimida jadval ko'rishi uchun
    groups = {g["name"]: g for g in a.get("/api/admin/acad/groups").json()["items"]}
    a.put(f"/api/admin/acad/groups/{groups['CS-25-1']['id']}", json={**groups["CS-25-1"], "program_id": p_cs["id"]})
    a.put(f"/api/admin/acad/groups/{groups['EC-26-1']['id']}", json={**groups["EC-26-1"], "program_id": p_eco["id"]})
    pic = a.post("/api/admin/media", files={"file": ("n.png", PNG, "image/png")}).json()["url"]
    a.post("/api/admin/items/news", json={"title": "Magistratura — qabul 2026", "slug": "magistratura-qabul-2026", "feature_image": pic, "html": "<p>Qabul boshlandi.</p>", "status": "published", "i18n": {"ru": {"title": "Магистратура — приём 2026", "html": "<p>Приём открыт.</p>"}}})
    a.post("/api/admin/items/announce", json={"title": "Qabul e’loni", "category": "admission", "status": "published"})
    a.post("/api/admin/items/staff", json={"title": "Rahimov Anvar", "category": "leadership", "position": "Rektor", "status": "published"})
    a.post("/api/admin/items/event", json={"title": "Ilmiy konferensiya", "status": "published"})
    a.post("/api/admin/items/document", json={"title": "Nizom", "category": "regulation", "status": "published"})
    a.post("/api/admin/items/link", json={"title": "Ta’lim portali", "url": "https://example.edu", "status": "published"})

    site2 = c.get("/api/site").json()
    assert site2["counts"]["program"] == 4 and site2["counts"]["faculty"] == 3 and site2["counts"]["staff"] >= 1
    home = c.get("/api/home").json()
    assert home["programs"] and home["news"] and home["announcements"] and home["faculties"]
    assert c.get("/api/news").json()["total"] >= 1
    news = c.get("/api/news/magistratura-qabul-2026").json()
    assert news["item"]["html"] and "text" not in news["item"]
    assert c.get("/api/news/yoq").status_code == 404
    prog = c.get("/api/programs/dasturiy-injiniring").json()
    assert prog["faculty"]["slug"] == "muhandislik-kafedrasi" and prog["others"] and prog["item"]["degree"] == "bachelor"
    assert c.get("/api/programs/amaliy-matematika-phd").json()["item"]["degree"] == "phd"
    assert c.get("/api/programs/dasturiy-injiniring-1-1").json()["item"]["degree"] == "joint"
    fac = c.get("/api/faculties/muhandislik-kafedrasi").json()
    assert len(fac["programs"]) >= 3 and all(p["faculty_id"] == fac["item"]["id"] for p in fac["programs"])
    staff = c.get("/api/staff?kind=leadership").json()["items"]
    assert staff and all(s["category"] == "leadership" for s in staff) and "bio" not in staff[0]
    assert c.get(f"/api/staff/{staff[0]['slug']}").json()["item"]["position"] == "Rektor"
    assert all(x["category"] == "admission" for x in c.get("/api/announcements?category=admission").json()["items"])
    assert c.get("/api/pages?section=about").json()["items"]
    assert c.get("/api/events").json()["items"] and c.get("/api/documents").json()["items"] and c.get("/api/links").json()["items"]


def test_i18n_three_langs(m):
    c = client(m)
    assert c.get("/api/programs/dasturiy-injiniring?lang=en").json()["item"]["title"] == "Software Engineering"
    ru = c.get("/api/pages/about-university?lang=ru").json()["item"]
    assert ru["title"] == "Об университете" and ru["lang"] == "ru" and set(ru["langs"]) == {"uz", "ru", "en"}
    # tarjimasi yo'q maydon asl tilda qoladi; noma'lum til (masalan, eski «ko») — asosiy tilda
    en = c.get("/api/faculties/muhandislik-kafedrasi?lang=en").json()["item"]
    assert en["title"] == "Department of Engineering"
    assert c.get("/api/faculties/muhandislik-kafedrasi?lang=xx").json()["item"]["title"] == "Muhandislik kafedrasi"
    assert c.get("/api/site?lang=ko").json()["lang"] == "uz" and c.get("/api/site?lang=en").json()["lang"] == "en"
    # SEO: hreflang 3 til, JSON-LD universitet
    html = c.get("/programs/dasturiy-injiniring?lang=ru").text
    assert '<html lang="ru">' in html and "<title>Программная инженерия" in html and 'hreflang="en"' in html and 'og:locale" content="ru_RU"' in html
    assert 'hreflang="ko"' not in html and "ko_KR" not in html
    assert "CollegeOrUniversity" in c.get("/").text and "EducationalOccupationalProgram" in html
    assert "NewsArticle" in c.get("/news/magistratura-qabul-2026").text
    assert c.get("/news/mavjud-emas").status_code == 404 and c.get("/qandaydir-sahifa").status_code == 404
    assert "noindex" in c.get("/admin").text and "noindex" in c.get("/student").text
    sm = c.get("/sitemap.xml").text
    assert "https://site.example/programs/dasturiy-injiniring?lang=en" in sm and "/staff/rahimov-anvar" in sm and "lang=ko" not in sm
    rss = c.get("/rss.xml?lang=ru").text
    assert "<rss" in rss and "Магистратура — приём 2026" in rss and "<script" not in rss
    assert "Disallow: /student" in c.get("/robots.txt").text


# ------------------------------------------------------------------ rollar va kirish
def test_roles_and_login(m):
    c = client(m)
    assert c.get("/api/admin/stats").status_code == 401
    assert c.get("/api/portal/me").status_code == 401
    assert c.post("/api/auth/login", json={"login": "admin", "password": "notogri"}).status_code == 401
    # admin va o'quv bo'limi umumiy /login dan kira olmaydi (to'g'ri parol bilan ham), faqat /admin dan
    r = client(m).post("/api/auth/login", json={"login": "admin", "password": ADMIN_PW})
    assert r.status_code == 403 and r.json()["detail"] == "use_admin_login" and "uni_session" not in r.cookies
    assert client(m).post("/api/auth/login", json={"login": "scheduler", "password": DEMO_PW}).json()["detail"] == "use_admin_login"
    # talaba admin panelga kira olmaydi
    r = client(m).post("/api/admin/login", json={"login": "student", "password": DEMO_PW})
    assert r.status_code == 403 and r.json()["detail"] == "use_portal_login"
    s, r = login(m, "student", DEMO_PW)
    assert r["home"] == "/student" and r["user"]["role"] == "student"
    assert s.get("/api/admin/stats").status_code in (401, 403) and s.get("/api/teacher/courses").status_code == 403
    t, r = login(m, "teacher", DEMO_PW)
    assert r["home"] == "/teacher" and t.get("/api/student/grades").status_code == 403
    sch, r = login(m, "scheduler", DEMO_PW)
    assert r["home"] == "/admin"
    me = sch.get("/api/admin/me").json()["admin"]
    assert me["role_id"] == "study" and "schedule" in me["perms"] and "stats" not in me["perms"]
    assert sch.get("/api/admin/lessons").status_code == 200 and sch.get("/api/admin/stats").status_code == 403
    # ro'yxatlarni o'qish mumkin, lekin ruxsatsiz bo'limda yozish — yo'q
    assert sch.get("/api/admin/items/news").status_code == 200
    assert sch.post("/api/admin/items/news", json={"title": "x"}).json()["detail"] == "no_permission"
    # o'quv bo'limi admin yarata olmaydi: foydalanuvchilarda admin roli yo'q, «Administratorlar» bo'limiga ruxsat yo'q
    assert sch.post("/api/admin/users", json={"login": "hacker", "name": "x", "password": "parol1234", "role": "admin"}).status_code == 400
    assert sch.post("/api/admin/admins", json={"login": "hacker", "name": "x", "password": "parol1234"}).status_code == 403
    assert sch.get("/api/mail/status").status_code == 200  # «Mening pochtam» ruxsati bor
    a = admin(m)
    me = a.get("/api/auth/me").json()
    assert me["user"]["role"] == "admin" and me["home"] == "/admin"
    assert a.post("/api/auth/logout").status_code == 200 and a.get("/api/auth/me").status_code == 401


def test_users_crud_and_import(m):
    a = admin(m)
    r = a.post("/api/admin/users", json={"login": "Yangi.Talaba", "name": "Yangi Talaba", "password": "parol1234", "role": "student", "data": {"student_no": "UNI0001"}})
    assert r.status_code == 200, r.text
    u = r.json()
    assert u["login"] == "yangi.talaba" and "pw_hash" not in u and u["data"]["student_no"] == "UNI0001"
    assert a.post("/api/admin/users", json={"login": "yangi.talaba", "name": "x", "password": "parol1234"}).status_code == 409
    assert a.post("/api/admin/users", json={"login": "qisqa", "name": "x", "password": "123"}).status_code == 400
    groups = a.get("/api/admin/acad/groups").json()["items"]
    g = next(x for x in groups if x["name"] == "CS-25-1")
    a.put(f"/api/admin/users/{u['id']}", json={"group_id": g["id"], "password": "yangi-parol-1"})
    assert login(m, "yangi.talaba", "yangi-parol-1")[1]["user"]["group_id"] == g["id"]
    # Excel: namuna fayl yuklab olinadi — o'zi import qilinsa namuna qatorlar o'tkazib yuboriladi
    tpl = a.get("/api/admin/users/template.xlsx?role=student")
    assert tpl.status_code == 200 and tpl.headers["content-type"].startswith("application/vnd.openxmlformats")
    wb = load_workbook(io.BytesIO(tpl.content))
    assert wb.sheetnames == ["Talabalar", "Yo'riqnoma", "Ro'yxatlar"] and wb["Talabalar"]["A1"].value == "Login"
    assert "CS-25-1" in [c.value for c in wb["Ro'yxatlar"]["A"]]
    r = a.post("/api/admin/users/import", data={"role": "student"}, files={"file": ("t.xlsx", tpl.content, XLSX)}).json()
    assert r["added"] == 0 and r["skipped"] == []
    # to'ldirilgan fayl: yangi guruh avtomatik, bo'sh parol — tasodifiy, noto'g'ri login — o'tkaziladi
    ws = wb["Talabalar"]
    for row in (["imp1", "Import Bir", "imp1@example.edu", "YANGI-25", "ID1", "", ""], ["imp2", "Import Ikki", "", "YANGI-25", 20250002, "", "Parol12345"], ["bad login!", "X"], ["imp3", ""]):
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    r = a.post("/api/admin/users/import", data={"role": "student"}, files={"file": ("t.xlsx", buf.getvalue(), XLSX)}).json()
    assert r["added"] == 2 and {x["reason"][:5] for x in r["skipped"]} == {"login", "F.I.S"}
    assert any(c["login"] == "imp1" and len(c["password"]) >= 8 and c["extra"] == "YANGI-25" for c in r["created"])
    assert any(x["name"] == "YANGI-25" and x["students"] == 2 for x in a.get("/api/admin/acad/groups").json()["items"])
    assert login(m, "imp2", "Parol12345")[1]["user"]["role"] == "student"
    imp2 = next(u for u in a.get("/api/admin/users?q=imp2").json()["items"] if u["login"] == "imp2")
    assert imp2["data"]["student_no"] == "20250002"
    # o'qituvchilar: fakultet nomi bo'yicha biriktiriladi
    tw = load_workbook(io.BytesIO(a.get("/api/admin/users/template.xlsx?role=teacher").content))
    tw.active.append(["imp.t1", "Import O‘qituvchi", "", "Dotsent", "Menejment", "Iqtisodiyot va boshqaruv kafedrasi; Yo‘q fakultet", "", "Parol12345"])
    buf = io.BytesIO()
    tw.save(buf)
    r = a.post("/api/admin/users/import", data={"role": "teacher"}, files={"file": ("t.xlsx", buf.getvalue(), XLSX)}).json()
    assert r["added"] == 1 and r["skipped"][0]["warning"] and "Yo‘q fakultet" in r["skipped"][0]["reason"]
    t1 = next(u for u in a.get("/api/admin/users?role=teacher").json()["items"] if u["login"] == "imp.t1")
    assert t1["data"]["faculty_ids"] == ["fac-eco"] and t1["data"]["position"] == "Dotsent"
    assert a.post("/api/admin/users/import", data={"role": "student"}, files={"file": ("x.xlsx", b"not excel", XLSX)}).json()["detail"] == "xlsx_not_xlsx"
    cred = a.post("/api/admin/users/credentials.xlsx", json={"items": r["created"]})
    assert load_workbook(io.BytesIO(cred.content)).active["B2"].value == "imp.t1"
    # o'zini o'chira olmaydi, bloklash
    me = a.get("/api/auth/me").json()["user"]
    assert a.delete(f"/api/admin/users/{me['id']}").status_code == 400
    a.put(f"/api/admin/users/{u['id']}", json={"active": False})
    assert client(m).post("/api/auth/login", json={"login": "yangi.talaba", "password": "yangi-parol-1"}).status_code == 401
    assert a.delete(f"/api/admin/users/{u['id']}").status_code == 200


# ------------------------------------------------------------------ dars jadvali
def test_schedule_conflicts_and_week(m):
    a = admin(m)
    ov = a.get("/api/admin/acad-overview").json()
    assert ov["semester"]["current"] and ov["counts"]["lessons"] == 12 and len(ov["slots"]) == 6
    sem = ov["semester"]["id"]
    g1 = next(g for g in ov["groups"] if g["name"] == "CS-25-1")
    g2 = next(g for g in ov["groups"] if g["name"] == "EC-26-1")
    teacher = next(t for t in ov["teachers"] if t["login"] == "teacher")
    slot0 = sorted(ov["slots"], key=lambda s: s["idx"])[0]
    lessons = a.get(f"/api/admin/lessons?semester={sem}&group={g1['id']}").json()["items"]
    assert len(lessons) == 6 and all(l["group_name"] == "CS-25-1" for l in lessons)
    # CS-25-1 dushanba 1-juftlikda band — to'qnashuv (guruh)
    busy = next(l for l in lessons if l["weekday"] == 0 and l["slot_id"] == slot0["id"])
    body = {"semester_id": sem, "group_id": g1["id"], "subject_id": busy["subject_id"], "teacher_id": None, "room_id": None, "weekday": 0, "slot_id": slot0["id"], "type": "lecture", "parity": "all"}
    r = a.post("/api/admin/lessons", json=body)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "conflict" and r.json()["detail"]["conflicts"][0]["kind"] == "group"
    # o'qituvchi boshqa guruhda band (boshqa fan) — to'qnashuv; toq hafta bilan juft hafta kesishmaydi
    body2 = {**body, "group_id": g2["id"], "teacher_id": busy["teacher_id"], "subject_id": next(s for s in ov["subjects"] if s["id"] != busy["subject_id"])["id"]}
    chk = a.post("/api/admin/lessons/check", json=body2).json()["conflicts"]
    assert any(c["kind"] == "teacher" for c in chk) and not any(c["kind"] == "group" for c in chk)
    assert a.post("/api/admin/lessons/check", json={**body2, "parity": "odd"}).json()["conflicts"]  # mavjud dars 'all' — kesishadi
    # qo'shma ma'ruza: bir o'qituvchi, bir fan, bir xona, boshqa guruh — to'qnashuv emas
    joint = {**body, "group_id": g2["id"], "teacher_id": busy["teacher_id"], "room_id": busy["room_id"]}
    assert a.post("/api/admin/lessons/check", json=joint).json()["conflicts"] == []
    # to'qnashuvda majburan saqlash yo'q
    assert a.post("/api/admin/lessons", json={**body2, "force": True}).status_code == 409
    # sudrab ko'chirish uchun bo'sh/band kataklar xaritasi
    cells = a.post("/api/admin/lessons/availability", json=body2).json()["cells"]
    assert len(cells) == 6 * len(ov["slots"])
    busy_cell = next(c for c in cells if c["weekday"] == 0 and c["slot_id"] == slot0["id"])
    assert {c["kind"] for c in busy_cell["conflicts"]} == {"teacher"} and busy_cell["conflicts"][0]["group_name"] == "CS-25-1"
    free = [c for c in cells if not c["conflicts"] and c["weekday"] == 0]
    assert free
    r = a.post("/api/admin/lessons", json={**body2, "slot_id": free[0]["slot_id"]})
    assert r.status_code == 200, r.text
    lid = r.json()["id"]
    # band katakka ko'chirib bo'lmaydi, bo'shiga — bo'ladi
    assert a.post(f"/api/admin/lessons/{lid}/move", json={"weekday": 0, "slot_id": slot0["id"]}).status_code == 409
    other_free = next(c for c in a.post("/api/admin/lessons/availability", json={"id": lid}).json()["cells"] if not c["conflicts"] and c["weekday"] == 0 and c["slot_id"] != free[0]["slot_id"])
    mv = a.post(f"/api/admin/lessons/{lid}/move", json={"weekday": 0, "slot_id": other_free["slot_id"]})
    assert mv.status_code == 200 and mv.json()["slot_id"] == other_free["slot_id"]
    # haftalik ko'rinish: toq/juft, semestr boshidan (1-sentabr dushanba bo'lmasa, 1-hafta dushanbasi "off")
    wk = a.get(f"/api/admin/week?semester={sem}&group={g2['id']}&week={ov['semester']['start']}").json()
    assert wk["week_number"] == 1 and wk["parity"] == "odd" and len(wk["days"]) == 7
    week2 = (date.fromisoformat(ov["semester"]["start"]) + timedelta(days=7)).isoformat()
    wk = a.get(f"/api/admin/week?semester={sem}&group={g2['id']}&week={week2}").json()
    assert wk["week_number"] == 2 and wk["parity"] == "even"
    monday = next(d for d in wk["days"] if d["weekday"] == 0)
    assert any(l["id"] == lid for l in monday["lessons"])
    # bir kunlik bekor qilish
    ch = a.post("/api/admin/changes", json={"lesson_id": lid, "date": monday["date"], "kind": "cancel", "note": "Bayram"}).json()
    wk = a.get(f"/api/admin/week?semester={sem}&group={g2['id']}&week={week2}").json()
    l = next(l for d in wk["days"] if d["weekday"] == 0 for l in d["lessons"] if l["id"] == lid)
    assert l["change"]["kind"] == "cancel" and l["change"]["note"] == "Bayram"
    assert a.get(f"/api/admin/changes?semester={sem}").json()["items"][0]["id"] == ch["id"]
    a.delete(f"/api/admin/changes/{ch['id']}")
    a.delete(f"/api/admin/lessons/{lid}")
    assert len(a.get(f"/api/admin/lessons?semester={sem}&group={g2['id']}").json()["items"]) == 6
    # dars jadvali faqat tizimga kirganlarga: ochiq API yo'q
    c = client(m)
    assert c.get("/api/schedule?group=CS-25-1").status_code == 404 and c.get("/api/schedule/groups").status_code == 404
    assert c.get("/api/portal/form").status_code == 401
    # davlat shaklidagi jadval: ustunlar — guruhlar
    form = a.get(f"/api/admin/form?semester={sem}&course=2").json()
    assert [g["name"] for g in form["groups"]] == ["CS-25-1"] and len(form["lessons"]) == 6 and len(form["weekdays"]) == 6
    assert form["settings"]["approver_title"] and form["uni"]["abbr"] == "UNI"
    a.put("/api/admin/form-settings", json={"approver_title": "O‘quv ishlari bo‘yicha prorektor", "approver_name": "A. Testov"})
    s, _ = login(m, "student", DEMO_PW)
    sf = s.get("/api/portal/form").json()
    assert [g["name"] for g in sf["groups"]] == ["CS-25-1"] and len(sf["lessons"]) == 6 and sf["settings"]["approver_name"] == "A. Testov"
    tc = login(m, "teacher", DEMO_PW)[0]
    tf = tc.get("/api/portal/form").json()
    assert {g["name"] for g in tf["groups"]} == {"CS-25-1", "EC-26-1"} and all(l["teacher_id"] == tf["lessons"][0]["teacher_id"] for l in tf["lessons"])
    # o'qituvchi faqat o'ziga biriktirilgan (dars o'tadigan) fakultetlar jadvalini ko'radi
    tme = tc.get("/api/portal/me").json()
    fac_ids = {f["id"] for f in tme["faculties"]}
    assert fac_ids == {"fac-eng", "fac-eco"}
    ff = tc.get("/api/portal/form?faculty=fac-eng").json()
    assert [g["name"] for g in ff["groups"]] == ["CS-25-1"] and len(ff["lessons"]) == 6
    assert tc.get("/api/portal/form?faculty=fac-fund").status_code == 403
    # talaba fakultet parametri bilan ham faqat o'z guruhini ko'radi
    assert [g["name"] for g in s.get("/api/portal/form?faculty=fac-eco").json()["groups"]] == ["CS-25-1"]
    # admin: guruh va o'qituvchi bo'yicha alohida jadval
    assert [g["name"] for g in a.get(f"/api/admin/form?semester={sem}&group={g2['id']}").json()["groups"]] == ["EC-26-1"]
    tform = a.get(f"/api/admin/form?semester={sem}&teacher={teacher['id']}").json()
    assert tform["title"] and all(l["teacher_id"] == teacher["id"] for l in tform["lessons"])
    assert teacher["role"] == "teacher"


def test_semester_unpublished_hides_from_students(m):
    a = admin(m)
    sem = a.get("/api/admin/acad-overview").json()["semester"]
    a.put(f"/api/admin/acad/semesters/{sem['id']}", json={**sem, "published": False})
    s, _ = login(m, "student", DEMO_PW)
    assert s.get("/api/portal/schedule").json().get("unpublished") is True
    assert s.get("/api/portal/form").json()["lessons"] == []
    a.put(f"/api/admin/acad/semesters/{sem['id']}", json={**sem, "published": True})
    assert sum(len(d["lessons"]) for d in s.get("/api/portal/schedule").json()["days"]) == 6


# ------------------------------------------------------------------ o'qituvchi va talaba kabinetlari
def test_teacher_attendance_grades_assignments(m):
    t, _ = login(m, "teacher", DEMO_PW)
    me = t.get("/api/portal/me").json()
    assert me["user"]["role"] == "teacher" and me["courses"]
    course = next(c for c in me["courses"] if c["group_name"] == "CS-25-1" and c["subject"] == "Dasturlash asoslari")
    assert course["students"] == 3 and course["lessons_per_week"] == 3
    today = t.get("/api/portal/today").json()
    assert today["groups"] >= 1 and "lessons" in today
    # boshqa o'qituvchining guruhi — ruxsat yo'q
    other = next(c for c in login(m, "teacher2", DEMO_PW)[0].get("/api/portal/me").json()["courses"] if c["group_name"] == "EC-26-1")
    assert t.get(f"/api/teacher/journal?group={other['group_id']}&subject={other['subject_id']}").status_code == 403
    students = t.get(f"/api/teacher/groups/{course['group_id']}/students").json()["items"]
    assert len(students) == 3
    # davomat
    lesson = next(l for l in login(m, "admin", ADMIN_PW)[0].get(f"/api/admin/lessons?group={course['group_id']}").json()["items"] if l["subject_id"] == course["subject_id"])
    att = t.get(f"/api/teacher/lessons/{lesson['id']}/attendance?date_=2026-09-07").json()
    assert len(att["students"]) == 3 and att["students"][0]["mark"] is None
    marks = [{"student_id": students[0]["id"], "status": "present"}, {"student_id": students[1]["id"], "status": "absent", "note": "kasal"}, {"student_id": students[2]["id"], "status": "late"}]
    assert t.put(f"/api/teacher/lessons/{lesson['id']}/attendance", json={"date": "2026-09-07", "marks": marks}).json()["saved"] == 3
    t.put(f"/api/teacher/lessons/{lesson['id']}/attendance", json={"date": "2026-09-09", "marks": [{"student_id": students[1]["id"], "status": "absent"}, {"student_id": students[0]["id"], "status": "present"}]})
    att = t.get(f"/api/teacher/lessons/{lesson['id']}/attendance?date_=2026-09-07").json()
    assert next(s for s in att["students"] if s["id"] == students[1]["id"])["mark"]["status"] == "absent" and att["dates"] == ["2026-09-09", "2026-09-07"]
    # boshqa o'qituvchi bu darsga davomat qo'ya olmaydi
    assert login(m, "teacher2", DEMO_PW)[0].put(f"/api/teacher/lessons/{lesson['id']}/attendance", json={"date": "2026-09-07", "marks": marks}).status_code == 404
    # baholar: alohida va ustun bo'yicha
    g = t.post("/api/teacher/grades", json={"student_id": students[0]["id"], "subject_id": course["subject_id"], "kind": "current", "title": "1-nazorat", "score": 85, "max": 100, "date": "2026-09-10"})
    assert g.status_code == 200, g.text
    assert t.post("/api/teacher/grades", json={"student_id": students[0]["id"], "subject_id": course["subject_id"], "kind": "current", "score": 150, "max": 100}).status_code == 400
    bulk = t.post("/api/teacher/grades/bulk", json={"group_id": course["group_id"], "subject_id": course["subject_id"], "kind": "midterm", "title": "Oraliq", "max": 50, "date": "2026-10-01",
                                                     "marks": [{"student_id": students[0]["id"], "score": 45}, {"student_id": students[1]["id"], "score": 20}, {"student_id": students[2]["id"], "score": ""}]}).json()
    assert bulk["added"] == 2
    j = t.get(f"/api/teacher/journal?group={course['group_id']}&subject={course['subject_id']}").json()
    s0 = next(s for s in j["students"] if s["id"] == students[0]["id"])
    assert len(s0["grades"]) == 2 and s0["summary"]["pct"] == 86.7 and s0["summary"]["grade5"] == 4 and s0["attendance"]["pct"] == 100
    s1 = next(s for s in j["students"] if s["id"] == students[1]["id"])
    assert s1["summary"]["grade5"] == 2 and s1["attendance"]["pct"] == 0 and j["attendance_dates"] == ["2026-09-07", "2026-09-09"]
    gid = g.json()["id"]
    assert t.put(f"/api/teacher/grades/{gid}", json={"score": 95}).json()["score"] == 95
    assert login(m, "teacher2", DEMO_PW)[0].delete(f"/api/teacher/grades/{gid}").status_code == 404
    # topshiriq → talaba topshiradi → baholash → jurnalga tushadi
    asg = t.post("/api/teacher/assignments", json={"group_id": course["group_id"], "subject_id": course["subject_id"], "title": "Insho", "description": "Dasturlash asoslari bo‘yicha 300 so‘zli insho", "due": "2099-01-01T10:00:00+05:00", "max": 20}).json()
    assert asg["submissions"] == 0 and asg["group_name"] == "CS-25-1"
    mat = t.post("/api/teacher/materials", json={"subject_id": course["subject_id"], "title": "1-ma’ruza", "url": "https://example.com/l1.pdf"}).json()
    assert mat["title"] == "1-ma’ruza"
    notice = t.post("/api/teacher/notices", json={"group_id": course["group_id"], "title": "Ertaga dars 101-xonada", "body": "Diqqat!"}).json()
    assert notice["audience"] == "group"
    # o'qituvchi EC-26-1 da ham dasturlash asoslaridan dars o'tadi — ruxsat bor; umuman dars bermagan guruhga — 403
    assert t.post("/api/teacher/notices", json={"group_id": other["group_id"], "title": "x"}).status_code == 200
    foreign = admin(m).post("/api/admin/acad/groups", json={"name": "BEGONA-1", "course": 1}).json()
    assert t.post("/api/teacher/notices", json={"group_id": foreign["id"], "title": "x"}).status_code == 403

    s, _ = login(m, "student", DEMO_PW)
    sme = s.get("/api/portal/me").json()
    assert sme["group"]["name"] == "CS-25-1" and sme["program"]["slug"] == "dasturiy-injiniring"
    gr = s.get("/api/student/grades").json()
    assert gr["gpa"] is not None and any(x["subject_id"] == course["subject_id"] for x in gr["subjects"])
    att = s.get("/api/student/attendance").json()
    assert att["total"] == 2 and att["pct"] == 100
    items = s.get("/api/student/assignments").json()["items"]
    a0 = next(x for x in items if x["id"] == asg["id"])
    assert a0["submission"] is None
    assert s.post(f"/api/student/assignments/{asg['id']}/submit", json={"text": ""}).status_code == 400
    sub = s.post(f"/api/student/assignments/{asg['id']}/submit", json={"text": "Mening inshom…", "attachments": [{"label": "insho.pdf", "url": "/media/abc.pdf"}]}).json()
    assert sub["attachments"][0]["label"] == "insho.pdf"
    subs = t.get(f"/api/teacher/assignments/{asg['id']}/submissions").json()["items"]
    sid = next(x for x in subs if x["submission"])["submission"]["id"]
    assert t.put(f"/api/teacher/submissions/{sid}", json={"score": 18, "feedback": "Yaxshi"}).json()["score"] == 18
    assert t.put(f"/api/teacher/submissions/{sid}", json={"score": 25}).status_code == 400
    assert s.post(f"/api/student/assignments/{asg['id']}/submit", json={"text": "qayta"}).status_code == 400  # baholangan
    gr = s.get("/api/student/grades").json()
    assert any(x["kind"] == "assignment" and x["score"] == 18 for x in gr["items"])
    assert any(x["title"] == "1-ma’ruza" for x in s.get("/api/student/materials").json()["items"])
    assert any(n["title"] == "Ertaga dars 101-xonada" for n in s.get("/api/portal/notices").json()["items"])
    # boshqa guruh talabasi bu bildirishnoma va topshiriqni ko'rmaydi
    s4, _ = login(m, "student4", DEMO_PW)
    assert not any(n["title"] == "Ertaga dars 101-xonada" for n in s4.get("/api/portal/notices").json()["items"])
    assert not any(x["id"] == asg["id"] for x in s4.get("/api/student/assignments").json()["items"])
    today = s.get("/api/portal/today").json()
    assert "gpa" in today and today["attendance"]["total"] == 2
    # parol o'zgartirish
    assert s.post("/api/portal/password", json={"current": "notogri", "new": "Yangi-parol-9"}).status_code == 400
    assert s.post("/api/portal/password", json={"current": DEMO_PW, "new": "Yangi-parol-9"}).status_code == 200
    assert login(m, "student", "Yangi-parol-9")[1]["user"]["login"] == "student"
    login(m, "student", "Yangi-parol-9")[0].post("/api/portal/password", json={"current": "Yangi-parol-9", "new": DEMO_PW})


# ------------------------------------------------------------------ statistika, obuna, aloqa, media, admin kontent
def test_pageview_refresh_not_counted(m):
    c = client(m, ip="10.0.1.1")
    r1 = c.post("/api/t/pv", json={"path": "/news/n60-magistratura-qabul-2026", "ref": "https://google.com/search?q=x"})
    assert r1.json()["counted"] is True
    for _ in range(3):
        assert c.post("/api/t/pv", json={"path": "/news/magistratura-qabul-2026"}).json()["counted"] is False
    assert c.post("/api/t/pv", json={"path": "/programs/dasturiy-injiniring"}).json()["counted"] is True
    assert c.post("/api/t/pv", json={"path": "/student/grades"}).json()["counted"] is False
    bot = client(m, ua="Mozilla/5.0 (compatible; Googlebot/2.1)", ip="66.249.1.1")
    assert bot.post("/api/t/pv", json={"path": "/"}).json()["counted"] is False
    assert c.post("/api/t/read", json={"slug": "magistratura-qabul-2026", "kind": "news", "seconds": 240, "depth": 0.9}).json()["counted"] is True
    st = admin(m).get("/api/admin/stats?days=30").json()
    assert st["current"]["pageviews"] >= 2 and st["top_items"][0]["slug"] in ("magistratura-qabul-2026", "dasturiy-injiniring")
    assert st["totals"]["students"] >= 5 and st["totals"]["groups"] >= 2


def test_stats_cookie_only_with_consent(m):
    c = client(m, ip="10.0.7.1")
    r = c.post("/api/t/pv", json={"path": "/about"})
    assert r.json()["counted"] is True and "vid" not in r.cookies  # rozilik yo'q — statistika cookie'si qo'yilmaydi
    c2 = client(m, ip="10.0.7.2")
    c2.cookies.set("uni_consent", "v1:necessary,stats")
    r2 = c2.post("/api/t/pv", json={"path": "/about"})
    assert r2.json()["counted"] is True and r2.cookies.get("vid")
    c3 = client(m, ip="10.0.7.3")
    c3.cookies.set("uni_consent", "v1:necessary")
    c3.cookies.set("vid", "a" * 24)
    r3 = c3.post("/api/t/pv", json={"path": "/about"})
    assert 'vid=""' in r3.headers.get("set-cookie", "")  # rozilik qaytarib olingan — eski cookie o'chiriladi


def test_subscribe_contact_smtp(m):
    c = client(m, ip="10.0.4.1")
    assert c.post("/api/subscribe", json={"email": "yomon"}).status_code == 400
    assert c.post("/api/subscribe", json={"email": "Ali@Example.com", "lang": "en"}).json()["status"] == "active"
    a = admin(m)
    assert a.put("/api/admin/smtp", json={"enabled": True, "host": "smtp.example.com", "port": 587, "security": "starttls", "username": "u", "password": "maxfiy", "from_email": "info@example.edu", "from_name": "UNI"}).status_code == 200
    assert "password" not in a.get("/api/admin/smtp").json()
    SENT.clear()
    assert c.post("/api/subscribe", json={"email": "vali@example.com", "lang": "ru"}).json()["status"] == "pending"
    assert wait_for(lambda: any(x["to"] == "vali@example.com" for x in SENT))
    assert "Подтвердите подписку" in SENT[-1]["subject"]
    r = c.post("/api/contact", json={"name": "Aziz", "email": "aziz@example.com", "phone": "+998901234567", "subject": "Qabul", "message": "Dasturiy injiniring yo‘nalishi haqida"}).json()
    assert r["ok"] and r["ticket"] >= 1
    board = a.get("/api/admin/desk").json()
    t = next(x for x in board["tickets"] if x["number"] == r["ticket"])
    assert t["requester_phone"] == "+998901234567" and t["stage"] == "new" and t["unread"] and t["source"] == "web"
    # yangilik tarqatmasi
    it = next(x for x in a.get("/api/admin/items/news").json()["items"] if x["slug"] == "magistratura-qabul-2026")
    SENT.clear()
    assert a.post(f"/api/admin/posts/{it['id']}/send", json={}).status_code == 200
    assert wait_for(lambda: any(x["to"] == "ali@example.com" for x in SENT))
    assert "/news/magistratura-qabul-2026" in SENT[-1]["html"]


def test_admin_content_crud(m):
    a = admin(m)
    r = a.post("/api/admin/items/announce", json={"title": "Yangi e’lon: Sinov!", "category": "exam", "deadline": "2099-05-01T10:00:00+05:00", "text": "Matn " * 30, "html": "<p>Matn</p>", "status": "draft"})
    assert r.status_code == 200, r.text
    it = r.json()
    assert it["slug"] == "yangi-elon-sinov" and it["category"] == "exam" and it["deadline"].startswith("2099-05-01")
    assert client(m).get("/api/announcements/yangi-elon-sinov").status_code == 404
    a.put(f"/api/admin/items/announce/{it['id']}", json={**it, "status": "published"})
    assert client(m).get("/api/announcements/yangi-elon-sinov").json()["item"]["title"] == "Yangi e’lon: Sinov!"
    st = a.post("/api/admin/items/staff", json={"title": "Test Professor", "position": "Professor", "category": "professor", "spoken": ["Ingliz"], "status": "published",
                                                 "i18n": {"en": {"position": "Professor of Food Technology"}, "ru": {"title": "Тест Профессор"}, "ko": {"position": "x"}}}).json()
    assert st["category"] == "professor" and st["kind"] == "staff" and st["spoken"] == ["Ingliz"] and set(st["i18n"]) == {"en", "ru"}
    assert client(m).get("/api/staff/test-professor?lang=en").json()["item"]["position"] == "Professor of Food Technology"
    assert client(m).get("/api/staff/test-professor?lang=ru").json()["item"]["title"] == "Тест Профессор"
    doc = a.post("/api/admin/items/document", json={"title": "Nizom", "category": "regulation", "year": 2025, "file": "/media/abc.pdf", "status": "published"}).json()
    assert doc["file"] == "/media/abc.pdf"
    dup = a.post(f"/api/admin/items/announce/{it['id']}/duplicate").json()
    assert dup["slug"] != it["slug"] and dup["status"] == "draft"
    assert a.delete(f"/api/admin/items/announce/{dup['id']}").status_code == 200
    assert a.get("/api/admin/items/yoq").status_code == 404
    # institut profili va sayt
    u = a.get("/api/admin/uni").json()
    u["rector_name"] = "Test Rektor"
    u["socials"] = {"telegram": "javascript:alert(1)", "facebook": "https://facebook.com/example.edu"}
    u["i18n"] = {"en": {"name": "International Institute of Food Technology and Engineering (test)"}}
    got = a.put("/api/admin/uni", json=u).json()
    assert got["rector_name"] == "Test Rektor" and not got["socials"]["telegram"] and got["socials"]["facebook"].startswith("https")
    assert client(m).get("/api/site?lang=en").json()["uni"]["name"] == "International Institute of Food Technology and Engineering (test)"
    assert client(m).get("/api/home").json()["rector"]["rector_name"] == "Test Rektor"
    s = a.get("/api/admin/site").json()
    s["accent"] = "red;}body{display:none"
    s["hero"] = {**s["hero"], "cta_primary_url": "javascript:x", "cta_secondary_url": "/programs"}
    s["hero_images"] = ["/media/abc.jpg", "javascript:alert(1)"]
    s["accent2"] = "#C8102E"
    out = a.put("/api/admin/site", json=s).json()
    assert out["accent"].startswith("#") and out["hero"]["cta_primary_url"] == "" and out["hero"]["cta_secondary_url"] == "/programs"
    assert out["hero_images"] == ["/media/abc.jpg"] and out["accent2"] == "#C8102E"
    pub = client(m).get("/api/site").json()["site"]
    assert pub["accent2"] == "#C8102E" and "public_schedule" not in pub
    s["hero_images"] = []
    # menyu: admin tuzadi, tarjimalar bilan; xavfli havolalar tozalanadi
    s["menu"] = [{"label": "Institut", "url": "/about", "labels": {"ru": "Институт", "ko": "x"}, "children": [{"label": "Yashil institut", "url": "/about/yashil-institut", "group": "Haqida"}, {"label": "X", "url": "javascript:alert(1)"}]},
                 {"label": "", "url": "/bo-sh"}]
    out = a.put("/api/admin/site", json=s).json()
    assert len(out["menu"]) == 1 and out["menu"][0]["children"][1]["url"] == "" and out["menu"][0]["labels"] == {"ru": "Институт"}
    pub_ru = client(m).get("/api/site?lang=ru").json()["site"]["menu"]
    assert pub_ru[0]["label"] == "Институт" and pub_ru[0]["children"][0]["group"] == "Haqida"
    s["menu"] = []
    a.put("/api/admin/site", json=s)


def test_media_validation(m):
    a = admin(m)
    r = a.post("/api/admin/media", files={"file": ("a.png", PNG, "image/png")})
    assert r.status_code == 200, r.text
    got = client(m).get(r.json()["url"])
    assert got.status_code == 200 and got.headers["x-content-type-options"] == "nosniff"
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    assert a.post("/api/admin/media", files={"file": ("x.png", svg, "image/png")}).json()["detail"] == "unsupported_type"
    assert a.post("/api/admin/media", files={"file": ("x.html", b"<html></html>", "text/html")}).status_code == 400
    assert a.post("/api/admin/media", files={"file": ("d.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")}).status_code == 200
    assert a.post("/api/admin/media", files={"file": ("d.docx", b"PK\x03\x04rest", "application/octet-stream")}).status_code == 200
    assert a.post("/api/admin/media", files={"file": ("d.zip", b"PK\x03\x04rest", "application/zip")}).status_code == 400
    assert client(m).get("/media/../site.sqlite3").status_code == 404
    assert a.post("/api/admin/media/from-url", json={"url": "ftp://x"}).status_code == 400
    # talaba kabinetdan fayl yuklaydi (topshiriq uchun), lekin media kutubxonaga emas
    s, _ = login(m, "student", DEMO_PW)
    assert s.post("/api/portal/upload", files={"file": ("ish.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")}).status_code == 200
    assert s.post("/api/admin/media", files={"file": ("a.png", PNG, "image/png")}).status_code in (401, 403)


def test_export_pdf_og(m):
    a = admin(m)
    ex = a.get("/api/admin/export").json()
    assert "items" in ex and "academic" in ex and all("pw_hash" not in u for u in ex["users"])
    d = client(m).get("/api/print/news/magistratura-qabul-2026").json()
    assert d["url"] == "https://site.example/news/magistratura-qabul-2026" and d["qr"].startswith("<svg") and d["uni"]["abbr"] == "UNI"
    assert client(m).get("/api/print/programs/dasturiy-injiniring?lang=en").json()["item"]["title"] == "Software Engineering"
    assert client(m).get("/api/print/admin/x").status_code == 404
    html = client(m).get("/news/magistratura-qabul-2026").text  # muqovasi bor — og:image o'sha surat
    assert 'property="og:image" content="https://site.example/media/' in html
    html = client(m).get("/programs/dasturiy-injiniring").text  # surati yo'q — avtomatik og kartasi
    assert 'property="og:image" content="https://site.example/og/programs/dasturiy-injiniring.png?lang=uz&amp;v=' in html
    s = m.svc()
    calls = []
    s.render.pdf = lambda url: calls.append(url) or b"%PDF-1.7 test"
    s.render.png = lambda url, width=1200, height=630: calls.append(url) or b"\x89PNG test"
    c = client(m, ip="10.0.8.1")
    r = c.get("/api/pdf/programs/dasturiy-injiniring?lang=ru")
    assert r.status_code == 200 and r.content.startswith(b"%PDF") and r.headers["content-disposition"] == 'attachment; filename="dasturiy-injiniring-ru.pdf"'
    assert calls[-1].endswith("/print/programs/dasturiy-injiniring?lang=ru")
    assert c.get("/og/news/magistratura-qabul-2026.png").status_code == 200 and calls[-1].endswith("/print/og/news/magistratura-qabul-2026?lang=uz")
    assert c.get("/og/site.png").status_code == 200


# ------------------------------------------------------------------ rollar, administratorlar, bo'limlar, professor profillari, fakultet muharrirlari
def test_roles_admins_and_menu_permissions(m):
    a = admin(m)
    me = a.get("/api/admin/me").json()["admin"]
    assert me["role_id"] == "superadmin" and "roles" in me["perms"] and "admins" in me["perms"]
    r = a.get("/api/admin/roles").json()
    assert {x["id"] for x in r["items"]} >= {"superadmin", "study", "editor"} and any(p["key"] == "professors" for p in r["perms"])
    items = [x for x in r["items"] if x["id"] != "superadmin"] + [{"name": "Matbuot xizmati", "perms": ["news", "events", "bogus"]}]
    rr = a.put("/api/admin/roles", json={"items": items}).json()
    press = next(x for x in rr["items"] if x["name"] == "Matbuot xizmati")
    assert press["perms"] == ["news", "events"] and any(x["id"] == "superadmin" for x in rr["items"])
    # admin hisobi faqat «Administratorlar» bo'limida
    u = a.post("/api/admin/admins", json={"login": "matbuot", "name": "Matbuot", "password": "Matbuot-123", "role_id": press["id"]}).json()
    assert u["role_name"] == "Matbuot xizmati" and u["perms"] == ["news", "events"]
    p, r = login(m, "matbuot", "Matbuot-123", panel=True)
    assert r["home"] == "/admin"
    assert p.post("/api/admin/items/news", json={"title": "Matbuot yangiligi"}).status_code == 200
    assert p.post("/api/admin/items/page", json={"title": "x"}).json()["detail"] == "no_permission"
    assert p.get("/api/admin/users").status_code == 403 and p.get("/api/admin/stats").status_code == 403 and p.put("/api/admin/uni", json={}).status_code == 403
    assert p.get("/api/mail/folders").json()["detail"] == "no_permission"  # «Mening pochtam» berilmagan
    # foydalanilayotgan rolni o'chirib bo'lmaydi; bosh administratorni oddiy admin tayinlay olmaydi
    assert a.put("/api/admin/roles", json={"items": [x for x in rr["items"] if x["id"] != press["id"]]}).json()["detail"] == "role_in_use"
    a.put(f"/api/admin/admins/{u['id']}", json={"role_id": "study"})
    sch = login(m, "matbuot", "Matbuot-123", panel=True)[0]
    assert sch.get("/api/admin/lessons").status_code == 200
    # o'qituvchi /admin ga kira olmaydi; oxirgi bosh administratorni o'chirib bo'lmaydi
    assert client(m).post("/api/admin/login", json={"login": "teacher", "password": DEMO_PW}).json()["detail"] == "use_portal_login"
    me_id = a.get("/api/admin/me").json()["admin"]["id"]
    assert a.put(f"/api/admin/admins/{me_id}", json={"role_id": "study"}).json()["detail"] == "cannot_change_own_role"
    assert a.delete(f"/api/admin/admins/{u['id']}").status_code == 200


def test_sections_professor_profiles_and_faculty_editors(m):
    a = admin(m)
    # bo'limlar: o'quv bo'limi + yangi bo'lim
    secs = a.get("/api/admin/sections").json()["items"]
    assert secs[0]["id"] == "study"
    secs = a.put("/api/admin/sections", json={"items": [*secs, {"name": "Kadrlar bo‘limi"}]}).json()["items"]
    hr = next(x for x in secs if x["name"] == "Kadrlar bo‘limi")
    deps = a.get("/api/admin/items/department").json()["items"]
    facs = a.get("/api/admin/items/faculty").json()["items"]
    # professor + o'quv bo'limi xodimi: saytda profil (ilmiy ishlar bilan) va «Professorlar»da ko'rinadi
    r = a.post("/api/admin/users", json={"role": "teacher", "login": "k.prof", "name": "Kim Professor", "password": "Parol-2025",
                                          "data": {"sections": ["study", hr["id"], "bogus"]},
                                          "profile": {"position": "Professor", "department_id": deps[0]["id"], "faculty_id": facs[0]["id"], "degree": "PhD",
                                                      "category": "professor", "publications": "1. Maqola", "bio": "Tarjimai hol"}})
    assert r.status_code == 200, r.text
    u = r.json()
    assert u["data"]["sections"] == ["study", hr["id"]] and u["section_names"] == ["O‘quv bo‘limi", "Kadrlar bo‘limi"] and u["profile"]["status"] == "published"
    full = a.get(f"/api/admin/users/{u['id']}").json()["profile_full"]
    assert full["publications"] == "1. Maqola" and full["user_id"] == u["id"] and full["category"] == "professor"
    pub = client(m).get(f"/api/staff/{full['slug']}").json()["item"]
    assert pub["degree"] == "PhD" and "user_id" not in pub
    people = a.get("/api/admin/people?kind=professors").json()
    assert any(x["id"] == u["id"] for x in people["items"])
    assert all(x["profile"] for x in people["items"])  # eski profillar foydalanuvchilarga bog'langan
    assert [x["id"] for x in a.get(f"/api/admin/users?section={hr['id']}").json()["items"]] == [u["id"]]
    # oddiy xodimga o'tkazilsa — ilmiy ishlar olib tashlanadi
    a.put(f"/api/admin/users/{u['id']}", json={"role": "staff", "profile": {"position": "Kadrlar mutaxassisi", "publications": "yo'q"}})
    full = a.get(f"/api/admin/users/{u['id']}").json()["profile_full"]
    assert full["category"] == "staff" and full["publications"] == "" and full["degree"] == ""
    s, r = login(m, "k.prof", "Parol-2025")
    assert r["home"] == "/xodim" and s.get("/api/portal/me").json()["sections"] == ["O‘quv bo‘limi", "Kadrlar bo‘limi"]
    # fakultet o'qituvchilari va kabinetdan tahrirlash huquqi
    a.put(f"/api/admin/users/{u['id']}", json={"role": "teacher"})
    fac = facs[0]
    ppl = a.get(f"/api/admin/faculties/{fac['id']}/people").json()["items"]
    assert any(x["id"] == u["id"] and x["member"] for x in ppl)
    t, _ = login(m, "teacher", DEMO_PW)
    tid = t.get("/api/portal/me").json()["user"]["id"]
    assert t.get(f"/api/portal/faculty/{fac['id']}").status_code == 403
    members = [x["id"] for x in ppl if x["member"]] + [tid]
    ppl = a.put(f"/api/admin/faculties/{fac['id']}/people", json={"members": members, "editors": [tid]}).json()["items"]
    assert next(x for x in ppl if x["id"] == tid)["editor"] is True
    me = t.get("/api/portal/me").json()
    assert me["editable_faculties"][0]["id"] == fac["id"]
    d = t.get(f"/api/portal/faculty/{fac['id']}").json()
    assert any(x["id"] == tid for x in d["teachers"])
    r = t.put(f"/api/portal/faculty/{fac['id']}", json={"summary": "O‘qituvchi yangilagan tavsif", "title": "Buzib bo'lmaydi"}).json()["item"]
    assert r["summary"] == "O‘qituvchi yangilagan tavsif" and r["title"] == fac["title"]
    staff = client(m).get(f"/api/faculties/{fac['slug']}").json()
    assert "editor_ids" not in staff["item"]
    # boshqa o'qituvchi tahrirlay olmaydi
    t2, _ = login(m, "teacher2", DEMO_PW)
    assert t2.put(f"/api/portal/faculty/{fac['id']}", json={"summary": "x"}).status_code == 403


def test_profile_photo_face_detection(m):
    from pathlib import Path

    here = Path(__file__).parent
    s, _ = login(m, "student", DEMO_PW)
    animal = s.post("/api/portal/photo", files={"file": ("mushuk.jpg", (here / "animal_sample.jpg").read_bytes(), "image/jpeg")})
    assert animal.status_code == 400 and animal.json()["detail"] == "photo_no_face"
    assert s.post("/api/portal/photo", files={"file": ("x.jpg", b"not an image", "image/jpeg")}).json()["detail"] == "photo_not_image"
    r = s.post("/api/portal/photo", files={"file": ("men.jpg", (here / "face_sample.jpg").read_bytes(), "image/jpeg")})
    assert r.status_code == 200, r.text
    url = r.json()["data"]["photo"]
    assert url.startswith("/media/") and client(m).get(url).status_code == 200
    # profil orqali surat URL ini qo'lda o'rnatib bo'lmaydi (faqat yuz tekshiruvidan o'tgan surat)
    s.put("/api/portal/profile", json={"data": {"photo": "/media/boshqa.png", "phone": "+998900000000"}})
    me = s.get("/api/portal/me").json()["user"]
    assert me["data"]["photo"] == url and me["data"]["phone"] == "+998900000000"
    # o'qituvchi surati saytdagi profiliga ham tushadi
    t, _ = login(m, "teacher", DEMO_PW)
    url2 = t.post("/api/portal/photo", files={"file": ("men.jpg", (here / "face_sample.jpg").read_bytes(), "image/jpeg")}).json()["data"]["photo"]
    a = admin(m)
    tid = t.get("/api/portal/me").json()["user"]["id"]
    assert a.get(f"/api/admin/users/{tid}").json()["profile_full"]["photo"] == url2
    assert s.delete("/api/portal/photo").json()["data"]["photo"] == ""


def test_careers_faq_dean_and_seo(m):
    a = admin(m)
    pub = client(m)
    # vakansiyalar (3 tilda) va ariza → «Murojaatlar» (Kadrlar bo'limi), rezyume yopiq
    assert pub.get("/api/careers").json()["items"] == []  # boshlang'ich vakansiya yo'q — admin qo'shadi
    for n, (uz, ru, en) in enumerate((("Oziq-ovqat kimyosi o‘qituvchisi", "Преподаватель пищевой химии", "Food chemistry lecturer"),
                                      ("Laborant (mikrobiologiya)", "Лаборант (микробиология)", "Laboratory assistant (microbiology)"),
                                      ("Iqtisodiyot o‘qituvchisi", "Преподаватель экономики", "Economics lecturer"))):
        v = a.post("/api/admin/items/vacancy", json={"title": uz, "summary": uz, "category": "academic", "employment": "full_time", "status": "published",
                                                    "requirements": ["Magistr darajasi"], "duties": ["Dars o‘tish"],
                                                    "i18n": {"ru": {"title": ru, "requirements": ["Степень магистра"]}, "en": {"title": en, "requirements": ["Master's degree"]}}})
        assert v.status_code == 200, v.text
    items = pub.get("/api/careers?lang=ru").json()["items"]
    assert len(items) >= 3 and all(x["lang"] == "ru" for x in items)
    slug = items[0]["slug"]
    one = pub.get(f"/api/careers/{slug}?lang=en").json()
    assert one["item"]["requirements"] == ["Master's degree"] and one["item"]["lang"] == "en"
    bad = pub.post(f"/api/careers/{slug}/apply", data={"name": "Ali Valiyev", "email": "ali@example.com"}, files={"cv": ("cv.exe", b"MZ..", "application/octet-stream")})
    assert bad.status_code == 400 and bad.json()["detail"] == "bad_file_type"
    r = pub.post(f"/api/careers/{slug}/apply", data={"name": "Ali Valiyev", "email": "ali@example.com", "phone": "+998901234567", "message": "Tajribam 3 yil"},
                 files={"cv": ("rezyume.pdf", b"%PDF-1.4 test", "application/pdf")})
    assert r.status_code == 200, r.text
    board = a.get("/api/admin/desk").json()
    t = next(x for x in board["tickets"] if x["number"] == r.json()["ticket"])
    assert t["category"]["title"].startswith("Kadrlar") and t["source"] == "careers"
    full = a.get(f"/api/admin/desk/tickets/{t['id']}").json()
    f = full["events"][0]["meta"]["files"][0]
    assert f["name"] == "rezyume.pdf" and f["url"].startswith("/api/admin/desk/files/")
    assert a.get(f["url"]).content == b"%PDF-1.4 test"
    assert pub.get(f["url"]).status_code == 401
    # FAQ: ochiq API va admin CRUD
    faq = pub.get("/api/faq?lang=en").json()["items"]
    assert len(faq) >= 4 and faq[0]["q"] and faq[0]["a"]
    new = a.post("/api/admin/items/faq", json={"title": "Yotoqxona bormi?", "answer": "Ha, qabul bo‘limiga murojaat qiling.", "category": "campus",
                                              "i18n": {"ru": {"title": "Есть ли общежитие?", "answer": "Да."}}}).json()
    assert any(x["q"] == "Есть ли общежитие?" for x in pub.get("/api/faq?lang=ru").json()["items"])
    a.delete(f"/api/admin/items/faq/{new['id']}")
    # SEO: FAQPage, JobPosting, kalit so'zlar, sitemap
    html = pub.get("/contact").text
    assert '"FAQPage"' in html and 'name="keywords"' in html and "<noscript><main>" in html
    assert '"JobPosting"' in pub.get(f"/careers/{slug}").text
    home = pub.get("/?lang=ru").text
    assert "Приём" in home and '"EducationalOccupationalProgram"' in home and "Korea" not in home and "ukiu" not in home
    assert f"/careers/{slug}" in pub.get("/sitemap.xml").text
    # menyuda professorlar yo'q, vakansiyalar bor (saqlangan menyuda ham — ko'rinish tarjimasi)
    a.put("/api/admin/site", json={"menu": [{"label": "Ta’lim yo‘nalishlari", "url": "/programs", "children": []}, {"label": "Vakansiyalar", "url": "/careers", "children": []}]})
    menu = pub.get("/api/site?lang=en").json()["site"]["menu"]
    assert [x["label"] for x in menu] == ["Programmes", "Careers"]
    a.put("/api/admin/site", json={"menu": []})
    # fakultet xodimlari: o'qituvchini biriktirish va dekan qilish
    fac = next(x for x in a.get("/api/admin/faculty-staff").json()["items"] if x["slug"] == "iqtisodiyot-va-boshqaruv")
    people = a.get(f"/api/admin/faculties/{fac['id']}/people").json()["items"]
    prof = next(x for x in people if x["staff_id"])
    members = [x["id"] for x in people if x["member"]] + [prof["id"]]
    assert a.put(f"/api/admin/faculties/{fac['id']}/people", json={"members": members, "editors": [], "dean": "nope"}).json()["detail"] == "dean_not_member"
    r = a.put(f"/api/admin/faculties/{fac['id']}/people", json={"members": members, "editors": [], "dean": prof["id"]})
    assert r.status_code == 200 and next(x for x in r.json()["items"] if x["id"] == prof["id"])["dean"]
    staff_slug = a.get(f"/api/admin/items/staff/{prof['staff_id']}").json()["slug"]
    a.put(f"/api/admin/items/staff/{prof['staff_id']}", json={"status": "published"})
    fd = pub.get("/api/faculties/iqtisodiyot-va-boshqaruv").json()
    assert fd["dean"]["slug"] == staff_slug and all(x["slug"] != staff_slug for x in fd["staff"])
    assert pub.get(f"/api/staff/{staff_slug}").json()["is_dean"] is True


def test_newsletter_announce_event_and_unsubscribe(m):
    a = admin(m)
    pub = client(m)
    SENT.clear()
    a.put("/api/admin/smtp", json={"host": "smtp.example", "port": 587, "from_email": "news@site.example", "enabled": True})
    a.put("/api/admin/site", json={"double_opt_in": False})
    assert pub.post("/api/subscribe", json={"email": "reader@example.com", "lang": "en"}).json()["status"] == "active"
    ev = a.post("/api/admin/items/event", json={"title": "Ochiq eshiklar kuni 2027", "summary": "Abituriyentlar uchun", "starts": "2027-06-20T05:00:00Z",
                                               "ends": "2027-06-20T09:00:00Z", "place": "Bosh bino", "status": "published", "send_newsletter": True}).json()
    ann = a.post("/api/admin/items/announce", json={"title": "Qabul boshlandi", "excerpt": "Hujjatlar qabuli", "status": "published", "send_newsletter": True}).json()
    s = m.svc()
    due = {x["id"] for x in s.st.due_newsletters()}
    # fondagi rejalashtiruvchi shu orada band qilgan bo'lishi mumkin — har biri yo navbatda, yo allaqachon yuborilgan
    assert all(i in due or s.st.get_item(i).get("newsletter_sent") for i in (ev["id"], ann["id"]))
    for it in s.st.due_newsletters():
        s.send_newsletter(it)
    assert not s.st.claim_newsletter(ann["id"])  # ikkinchi marta band qilinmaydi
    for _ in range(60):
        if sum(1 for x in SENT if x["to"] == "reader@example.com" and "Unsubscribe" in x["html"]) >= 2:
            break
        time.sleep(0.2)
    mails = [x for x in SENT if x["to"] == "reader@example.com" and "/unsubscribe?token=" in x["html"]]
    assert any("/events/" in x["html"] and "When" in x["html"] for x in mails)
    assert any("/announcements/" in x["html"] for x in mails)
    assert all(x["headers"].get("List-Unsubscribe") for x in mails)
    assert not s.st.due_newsletters() or not ({ev["id"], ann["id"]} & {x["id"] for x in s.st.due_newsletters()})
    token = s.st.subscriber_by_email("reader@example.com")["unsub_token"]
    assert pub.post("/api/unsubscribe", json={"token": token}).json()["email"] == "reader@example.com"
    assert s.st.subscriber_by_email("reader@example.com")["status"] == "unsubscribed"


def test_hemis_sync_profile_and_login(m, monkeypatch):
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).parent))
    from fake_hemis import T

    from university import hemis as H

    monkeypatch.setattr(H, "TRANSPORT", T)
    a = admin(m)
    r = a.put("/api/admin/hemis", json={"enabled": True, "api_url": "student.example.edu/rest/v1/", "token": "TOK", "portal_url": "https://student.example.edu", "student_auth": True})
    assert r.status_code == 200 and r.json()["config"]["has_token"] and "token" not in r.json()["config"]
    assert client(m).get("/api/site").json()["uni"]["hemis_url"] == "https://student.example.edu"
    assert a.post("/api/admin/hemis/test", json={}).json()["ok"] is True
    res = H.sync(m.svc().st, H.config(m.svc().st))
    assert res["errors"] == [] and res["students"][1] >= 1 and res["teachers"][0] >= 1
    # dars jadvali HEMIS'dan: haftalik andoza (har hafta → «all», faqat bir haftada → toq/juft), o'qituvchi HEMIS id bo'yicha
    st = m.svc().st
    assert res["schedule"][0] == 2
    sem = st.current_semester()
    hl = [x for x in st.lessons(semester_id=sem["id"]) if x["note"] == "HEMIS"]
    chem = next(x for x in hl if x["subject"] == "Oziq-ovqat kimyosi")
    assert chem["weekday"] == 0 and chem["parity"] == "all" and chem["room"] == "204" and chem["slot_start"] == "08:30" and chem["group_name"] == "CS-25-1"
    assert chem["teacher"].startswith("Namuna") and chem["type"] == "lecture"
    lab = next(x for x in hl if x["subject"] == "Mikrobiologiya")
    assert lab["weekday"] == 3 and lab["parity"] in ("odd", "even") and lab["type"] == "lab" and lab["teacher_id"] is None
    # qayta sinxronlash — takrorlanmaydi, qo'lda kiritilgan dars saqlanadi
    manual = st.save_lesson(st.clean_lesson({"semester_id": sem["id"], "group_id": chem["group_id"], "subject_id": chem["subject_id"], "weekday": 4, "slot_id": chem["slot_id"]}))
    res2 = H.sync(st, H.config(st))
    assert res2["schedule"] == [2, 2] and st.get_lesson(manual["id"])
    assert len([x for x in st.lessons(semester_id=sem["id"]) if x["note"] == "HEMIS"]) == 2
    # o'qituvchining saytdagi profili: bo'sh lavozim/daraja HEMIS'dan
    tu = next(u for u in st.list_users("teacher") if (u.get("data") or {}).get("hemis_id") == "101")
    prof = st.get_item(tu["data"]["staff_id"])
    assert prof["degree"] == "PhD, Dotsent" and prof["position"]
    s, _ = login(m, "student", DEMO_PW)
    d = s.get("/api/portal/hemis").json()
    assert d["enabled"] and d["profile"]["payment_form"] == "Kontrakt" and d["attendance_by_subject"][0]["unexcused"] == 2
    assert d["schedule"] and d["schedule"][0]["subject"] == "Falsafa" and d["gpa"][0]["gpa"] == 3.9
    # HEMIS paroli bilan birinchi kirish — hisob yaratiladi
    c = client(m)
    r = c.post("/api/auth/login", json={"login": "399241100777", "password": "hemispw"})
    assert r.status_code == 200 and r.json()["via"] == "hemis" and r.json()["user"]["role"] == "student"
    assert client(m).post("/api/auth/login", json={"login": "399241100777", "password": "noto'g'ri"}).status_code == 401
    # o'qituvchi: HEMIS bilan bog'lanmagan — xato emas, izoh
    t, _ = login(m, "teacher2", DEMO_PW)
    assert t.get("/api/portal/hemis").json()["error"] == "not_linked"
    a.put("/api/admin/hemis", json={"enabled": False})


def test_s3_storage_media(m, monkeypatch):
    from university import s3 as S3

    store: dict[str, bytes] = {}

    class FakeClient(S3.Client):
        def put(self, name, data, mime="application/octet-stream", cache=""):
            store[self.key(name)] = data

        def get(self, name):
            return store[self.key(name)]

        def delete(self, name):
            store.pop(self.key(name), None)

    monkeypatch.setattr(S3, "Client", FakeClient)
    a = admin(m)
    assert a.put("/api/admin/storage", json={"enabled": True, "endpoint": "s3.example"}).json()["detail"] == "s3_incomplete"
    r = a.put("/api/admin/storage", json={"enabled": True, "endpoint": "s3.example", "bucket": "university-media", "access_key": "AK", "secret_key": "SK", "prefix": "site", "public_url": "https://cdn.example"})
    assert r.status_code == 200 and r.json()["config"]["has_secret"] and "secret_key" not in r.json()["config"] and r.json()["config"]["endpoint"] == "https://s3.example"
    assert a.post("/api/admin/storage/test", json={}).json()["ok"] is True
    up = a.post("/api/admin/media", files={"file": ("a.png", PNG, "image/png")}).json()
    name = up["url"].rsplit("/", 1)[-1]
    assert store.get(f"site/media/{name}") == PNG and not (m.svc().st.media_dir / name).exists()
    g = client(m).get(up["url"], follow_redirects=False)
    assert g.status_code == 302 and g.headers["location"] == f"https://cdn.example/site/media/{name}"
    a.delete(f"/api/admin/media/{up['id']}")
    assert f"site/media/{name}" not in store
    a.put("/api/admin/storage", json={"enabled": False})


def test_interactive_tests_paper_release_and_live_game(m):
    tch, _ = login(m, "teacher", DEMO_PW)
    # Excel namuna → import → test
    tpl = tch.get("/api/iq/template.xlsx")
    assert tpl.status_code == 200 and tpl.content[:2] == b"PK"
    imp = tch.post("/api/iq/import", files={"file": ("q.xlsx", tpl.content, XLSX)}).json()
    assert len(imp["questions"]) == 6 and not imp["errors"]
    types = [q["type"] for q in imp["questions"]]
    assert types.count("text") == 1 and "multi" in types
    t = tch.post("/api/iq/tests", json={"title": "Oraliq nazorat", "questions": imp["questions"], "settings": {"time_limit": 20, "subject": "Oziq-ovqat kimyosi"}}).json()
    assert t["code"] and len(t["questions"]) == 6
    # qog'oz: 3 variant — har birida aralash tartib, kalitlar bilan
    paper = tch.get(f"/api/iq/tests/{t['id']}/paper?variants=3").json()
    assert len(paper["variants"]) == 3 and all(len(v["key"]) == 6 for v in paper["variants"])
    orders = {tuple(q["id"] for q in v["questions"]) for v in paper["variants"]}
    assert len(orders) >= 2
    # yopiq test — talaba boshlay olmaydi; ochilgach — kirmagan foydalanuvchi 401
    s1, _ = login(m, "student", DEMO_PW)
    assert s1.post(f"/api/iq/t/{t['code']}/start").json()["detail"] == "test_closed"
    tch.post(f"/api/iq/tests/{t['id']}/status", json={"status": "open"})
    assert client(m).get(f"/api/iq/t/{t['code']}").status_code == 401
    info = s1.get(f"/api/iq/t/{t['code']}").json()
    assert info["open"] and info["count"] == 6
    att = s1.post(f"/api/iq/t/{t['code']}/start").json()
    assert len(att["questions"]) == 6 and all("correct" not in q for q in att["questions"]) and att["deadline"]
    # to'g'ri javoblar (testdagi kalit bo'yicha), bittasini xato
    full = tch.get(f"/api/iq/tests/{t['id']}").json()
    by = {q["id"]: q for q in full["questions"]}
    answers = {}
    for q in att["questions"]:
        src = by[q["id"]]
        answers[q["id"]] = src["answers"][0] if src["type"] == "text" else (src["correct"] if src["type"] == "multi" else src["correct"][0])
    wrong = next(q["id"] for q in att["questions"] if by[q["id"]]["type"] == "single")
    answers[wrong] = next(o["id"] for o in by[wrong]["options"] if o["id"] not in by[wrong]["correct"])
    assert s1.put(f"/api/iq/attempts/{att['id']}/answers", json={"answers": answers}).json()["saved"] == 6
    done = s1.post(f"/api/iq/attempts/{att['id']}/submit").json()
    assert done["finished"] and done["percent"] is None  # natija professor yuborgunicha yashirin
    # ikkinchi talaba — boshqa tartib bo'lishi mumkin; urinishlar soni 1
    s2, _ = login(m, "student2", DEMO_PW)
    a2 = s2.post(f"/api/iq/t/{t['code']}/start").json()
    s2.post(f"/api/iq/attempts/{a2['id']}/submit", json={"answers": {}})
    assert s2.post(f"/api/iq/t/{t['code']}/start").json()["detail"] == "no_attempts_left"
    res = tch.get(f"/api/iq/tests/{t['id']}/results").json()
    assert len(res["rows"]) == 2 and res["rows"][0]["correct"] == 5 and res["rows"][0]["user"]["name"]
    assert any(q["percent"] == 50 for q in res["questions"])
    assert tch.get(f"/api/iq/tests/{t['id']}/results.xlsx").content[:2] == b"PK"
    # boshqa professor ko'ra olmaydi
    t2, _ = login(m, "teacher2", DEMO_PW)
    assert t2.get(f"/api/iq/tests/{t['id']}/results").status_code == 403
    # yuborish: har bir talaba faqat o'z varag'ini oladi
    assert s1.get(f"/api/iq/my/{att['id']}/sheet").status_code == 403
    rel = tch.post(f"/api/iq/tests/{t['id']}/release").json()
    assert rel["sent"] == 2
    sheet = s1.get(f"/api/iq/my/{att['id']}/sheet").json()
    assert sum(1 for r in sheet["rows"] if not r["ok"]) == 1 and sheet["percent"] < 100
    assert s2.get(f"/api/iq/my/{att['id']}/sheet").status_code == 404
    notes = s1.get("/api/portal/notices").json()["items"]
    assert any("Oraliq nazorat" in n["title"] for n in notes)
    s2_notes = [n for n in s2.get("/api/portal/notices").json()["items"] if "Oraliq nazorat" in n["title"]]
    assert len(s2_notes) == 1 and s2_notes[0]["title"] != next(n["title"] for n in notes if "Oraliq nazorat" in n["title"])
    my = s1.get("/api/iq/my").json()["items"]
    assert my[0]["released"] and my[0]["percent"] is not None

    # «Bilimdon» jonli o'yin
    g = tch.post(f"/api/iq/tests/{t['id']}/live").json()
    pin = g["pin"]
    assert len(pin) == 6
    assert client(m).get(f"/api/iq/play/{pin}").status_code == 401
    s1.post(f"/api/iq/play/{pin}/join")
    s2.post(f"/api/iq/play/{pin}/join")
    host = tch.get(f"/api/iq/live/{g['id']}").json()
    assert host["phase"] == "lobby" and len(host["players"]) == 2
    tch.post(f"/api/iq/live/{g['id']}/start")
    svc = m.svc()
    game = svc._iq_games.get(g["id"])
    game["state"]["started_at"] -= 5  # «tayyorlaning» sanog'ini o'tkazib yuborish
    game["state"]["deadline"] -= 5
    st = s1.get(f"/api/iq/play/{pin}").json()
    assert st["phase"] == "question" and st["question"]["options"] is not None and "correct" not in st
    q = by[st["question"]["id"]]
    right = q["answers"][0] if q["type"] == "text" else (q["correct"] if q["type"] == "multi" else q["correct"][0])
    assert s1.post(f"/api/iq/play/{pin}/answer", json={"value": right}).json()["ok"]
    assert s1.post(f"/api/iq/play/{pin}/answer", json={"value": right}).json()["detail"] == "already_answered"
    s2.post(f"/api/iq/play/{pin}/answer", json={"value": "noto'g'ri"})
    st = s1.get(f"/api/iq/play/{pin}").json()
    assert st["phase"] == "reveal" and st["me"]["score"] >= 500 and st["correct"] is not None
    tch.post(f"/api/iq/live/{g['id']}/end")
    fin = tch.get(f"/api/iq/live/{g['id']}").json()
    assert fin["phase"] == "finished" and fin["ranking"][0]["name"] == "Aziza Karimova"
    # tugagan o'yin: qatnashchi o'z o'rnini ko'radi, qatnashmagan — topilmaydi, yangi qo'shilish yo'q
    me_fin = s1.get(f"/api/iq/play/{pin}").json()
    assert me_fin["phase"] == "finished" and me_fin["me"]["score"] >= 500
    s3, _ = login(m, "student3", DEMO_PW)
    assert s3.get(f"/api/iq/play/{pin}").status_code == 404
    assert s3.post(f"/api/iq/play/{pin}/join").status_code == 404


def test_public_site_search(m):
    c = client(m)
    r = c.get("/api/search?q=injiniring").json()["items"]
    assert r and r[0]["type"] == "program" and all(x["to"].startswith("/") and not x["to"].startswith("/admin") for x in r)
    assert {"program", "news"} & {x["type"] for x in r}
    assert c.get("/api/search?q=o").json()["items"] == []
    ru = c.get("/api/search?q=магистратура&lang=ru").json()["items"]
    assert ru and any("агистрат" in x["title"] for x in ru)
    # qoralama (nashr qilinmagan) material qidiruvda chiqmaydi
    a = admin(m)
    a.post("/api/admin/items/news", json={"title": "Qoralama zarqaldoq yangilik", "status": "draft", "content": "<p>x</p>"})
    assert c.get("/api/search?q=zarqaldoq").json()["items"] == []


def test_search_and_test_kinds_and_paper_signing(m):
    # admin qidiruvi: kontent ruxsatga qarab, admin yo'llari bilan
    a = admin(m)
    r = a.get("/api/admin/search?q=injiniring").json()["items"]
    assert r and all(x["to"].startswith("/admin") for x in r)
    assert any(x["type"] == "program" for x in r)
    assert a.get("/api/admin/search?q=k").json()["items"] == []
    # kabinet qidiruvi: ochiq sayt materiallari (tarjima bilan) — saytdagi yo'l
    s1, _ = login(m, "student", DEMO_PW)
    r = s1.get("/api/portal/search?q=магистратура&lang=ru").json()["items"]
    assert r and any(x.get("external") and x["to"].startswith("/") for x in r)
    assert client(m).get("/api/portal/search?q=magistratura").status_code == 401
    # Test va Bilimdon alohida: Bilimdon havola (/t/kod) orqali ochilmaydi
    tch, _ = login(m, "teacher", DEMO_PW)
    q = [{"type": "single", "text": "2+2?", "options": [{"id": "a", "text": "3"}, {"id": "b", "text": "4"}], "correct": ["b"]}]
    g = tch.post("/api/iq/tests", json={"title": "Viktorina", "questions": q, "settings": {"kind": "game"}}).json()
    assert g["settings"]["kind"] == "game"
    tch.post(f"/api/iq/tests/{g['id']}/status", json={"status": "open"})
    assert s1.get(f"/api/iq/t/{g['code']}").status_code == 404
    t = tch.post("/api/iq/tests", json={"title": "Nazorat", "questions": q * 1, "settings": {"variants": 5}}).json()
    assert t["settings"]["kind"] == "test" and t["settings"]["variants"] == 5
    # qog'oz: imzosiz / noto'g'ri imzo — rad etiladi; to'g'ri imzo (server ichida) — ma'lumot
    from university.api import interactive as API

    assert client(m).get(f"/api/iq/paper-print/{t['id']}?variants=5&exp=9999999999&tk=bad").status_code == 403
    import time as _t

    exp = int(_t.time()) + 60
    ok_ = client(m).get(f"/api/iq/paper-print/{t['id']}?variants=5&exp={exp}&tk={API._paper_sig(t['id'], 5, exp)}").json()
    assert len(ok_["variants"]) == 5 and ok_["teacher"]
    assert client(m).get(f"/api/iq/paper-print/{t['id']}?variants=4&exp={exp}&tk={API._paper_sig(t['id'], 5, exp)}").status_code == 403
    assert API._safe_name("Oraliq: nazorat 1") == "Oraliq_nazorat_1"


def test_admin_and_portal_sessions_coexist_and_login_suggest(m):
    c = client(m)
    assert c.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
    # admin sessiyasi bor, lekin /login (kabinet) uni ko'rmaydi — admin panelga yo'naltirilmaydi
    assert c.get("/api/auth/me").status_code == 401
    assert c.get("/api/admin/me").json()["admin"]["login"] == "admin"
    # o'sha brauzerda talaba sifatida ham kirish — ikkala sessiya parallel
    assert c.post("/api/auth/login", json={"login": "student", "password": DEMO_PW}).status_code == 200
    assert c.get("/api/auth/me").json()["user"]["login"] == "student"
    assert c.get("/api/admin/me").json()["admin"]["login"] == "admin"
    assert c.get("/api/auth/me", headers={"x-admin-realm": "admin"}).json()["user"]["role"] == "admin"
    assert c.get("/api/auth/me", headers={"referer": "http://testserver/admin/users"}).json()["user"]["role"] == "admin"
    # kabinetdan chiqish admin sessiyasiga tegmaydi va aksincha
    c.post("/api/auth/logout")
    assert c.get("/api/auth/me").status_code == 401 and c.get("/api/admin/me").status_code == 200
    c.post("/api/auth/login", json={"login": "student", "password": DEMO_PW})
    c.post("/api/admin/logout")
    assert c.get("/api/admin/me").status_code == 401 and c.get("/api/auth/me").status_code == 200
    # ism-familiya → login va pochta taklifi (band loginlar chetlanadi)
    from university import names as N

    assert N.translit("Ғайратжон Ўлмасов") == "gayratjon olmasov"
    assert N.login_candidates("Aziza Karimova")[:3] == ["aziza.karimova", "karimova.aziza", "a.karimova"]
    a = admin(m)
    r = a.get("/api/admin/users/suggest?name=Nodira O‘ktamova").json()
    assert r["items"][0]["login"] == "nodira.oktamova" and r["items"][0]["email"].startswith("nodira.oktamova@") and r["domain"]
    assert a.get("/api/admin/users/login-free?login=student").json()["free"] is False
    assert a.get("/api/admin/users/login-free?login=nodira.oktamova").json()["free"] is True
    # Excel: login ustuni bo'sh — ism-familiyadan yaratiladi (band bo'lsa — muqobil)
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["F.I.Sh.", "Guruh"])
    ws.append(["Shahzod Ergashev", "CS-25-1"])
    ws.append(["Shahzod Ergashev", "CS-25-1"])
    buf = io.BytesIO()
    wb.save(buf)
    r = a.post("/api/admin/users/import", data={"role": "student"}, files={"file": ("n.xlsx", buf.getvalue(), XLSX)}).json()
    assert [x["login"] for x in r["created"]] == ["shahzod.ergashev", "ergashev.shahzod"], r


def test_telegram_bot_intake_and_reply(m, monkeypatch):
    """Murojaat boti: chatda bitta «panel» xabari — navigatsiya va bosqichlar uni tahrirlaydi, yozilgan kiritishlar o'chiriladi,
    murojaat matni va qo'shimcha xabarlar qoladi (panel ularning ostiga ko'chadi), operator javobi — yangi xabar."""
    from fake_tg import FakeTG

    from university import telegram as TG

    fk = FakeTG()
    sent = fk.sent
    monkeypatch.setattr(TG, "TRANSPORT", fk.transport)
    a = admin(m)
    assert a.put("/api/admin/telegram", json={"token": "bad"}).json()["detail"] == "telegram_bad_token"
    r = a.put("/api/admin/telegram", json={"enabled": True, "token": "123456:" + "A" * 35, "mode": "polling"}).json()
    assert r["config"]["username"] == "site_test_bot" and "token" not in r["config"] and r["link"] == "https://t.me/site_test_bot"
    assert client(m).get("/api/site").json()["telegram_bot"] == "https://t.me/site_test_bot"
    from university.api.desk import bot

    b = bot()
    user = {"id": 777, "first_name": "Ali", "last_name": "Valiyev", "username": "ali"}
    n = iter(range(1, 100))

    def msg(text, chat=777, frm=user, **kw):
        mid = fk.user(chat, text=text, **kw)["id"]
        b.handle({"update_id": next(n), "message": {"message_id": mid, "chat": {"id": chat, "type": "private"}, "from": frm} | ({"text": text} if text else {}) | kw})
        return mid

    def btn(data, chat=777, frm=user):
        b.handle({"update_id": next(n), "callback_query": {"id": "q", "from": frm, "data": data,
                                                           "message": {"chat": {"id": chat}, "message_id": b.chat(str(chat))["panel"]}}})

    def scr(chat=777):  # panel — foydalanuvchi ko'radigan bot ekrani
        return fk.msg(chat, b.chat(str(chat))["panel"])

    def kbd(chat=777):
        return scr(chat)["markup"]["inline_keyboard"]

    def users(chat=777):
        return [x["text"] for x in fk.user_msgs(chat)]

    msg("/start")
    assert "inline_keyboard" in scr()["markup"] and fk.visible(777) == [scr()]  # /start o'chirildi
    pid = b.chat("777")["panel"]
    btn("lang:ru")
    assert "виртуальная приёмная" in scr()["text"]
    btn("new")
    btn("use_name")
    bad = msg("telefon yo'q")
    assert "Неверный номер" in scr()["text"] and "2/6" in scr()["text"] and ("777", bad) in fk.deleted
    msg("+998 90 123 45 67")
    btn("skip_email")
    cats = kbd()
    btn(cats[0][0]["callback_data"])
    msg("Yotoqxona")
    # shu paytgacha: til, menyu, 4 bosqich, xato — hammasi bitta panelda (tahrir), yozilganlar o'chirilgan
    assert b.chat("777")["panel"] == pid and [x["_m"] for x in sent].count("sendMessage") == 1 and fk.visible(777) == [scr()]
    body = msg("Yotoqxonada joy bormi?")
    # murojaat matni — yozishma: o'chirilmaydi; panel (tekshirish) uning ostiga ko'chadi, eskisi o'chiriladi
    assert "Ali Valiyev" in scr()["text"] and fk.msg(777, body) and not fk.msg(777, pid)
    assert [x["id"] for x in fk.visible(777)] == [body, b.chat("777")["panel"]]
    btn("send")
    assert "UNI-" in scr()["text"] and sent[-1]["_m"] == "editMessageText"
    board = a.get("/api/admin/desk").json()
    t = next(x for x in board["tickets"] if x["source"] == "telegram")
    assert t["requester_name"] == "Ali Valiyev" and t["requester_phone"] == "+998 90 123 45 67" and t["tg_chat"] == "777"
    # qo'shimcha xabar — shu chiptaga; u ham qoladi, panel yana eng pastda (bitta)
    extra = msg("Yana bir savol")
    assert any(e["kind"] == "message_in" and e["content"] == "Yana bir savol" for e in a.get(f"/api/admin/desk/tickets/{t['id']}").json()["events"])
    assert users() == ["Yotoqxonada joy bormi?", "Yana bir savol"] and fk.visible(777)[-1] == scr() and len(fk.bot_msgs(777)) == 1
    assert fk.msg(777, extra) and "UNI-" in scr()["text"]
    # administrator javobi — Telegram orqali; «Yangi» murojaat avtomatik «Jarayonda»ga o'tadi, javob yozgan operator mas'ul bo'ladi,
    # murojaatchiga alohida holat xabari bormaydi (faqat javobning o'zi) — bildirishnoma, yangi xabar
    k = len(sent)
    r = a.post(f"/api/admin/desk/tickets/{t['id']}/reply", data={"body": "Ha, joy bor.", "channel": "telegram"})
    assert r.status_code == 200, r.text
    assert len(sent) == k + 1 and sent[-1]["_m"] == "sendMessage" and sent[-1]["chat_id"] == "777" and "Ha, joy bor." in sent[-1]["text"] and "Ответ" in sent[-1]["text"]
    reply_id = fk.bot_msgs(777)[-1]["id"]
    d = r.json()
    assert d["ticket"]["stage"] == "in_progress" and d["ticket"]["assignee"]["name"] == "Administrator"
    kinds = [e["kind"] for e in d["events"]]
    assert kinds[-2:] == ["message_out", "transition"] and d["events"][-2]["meta"]["channel"] == "telegram"
    tr = d["events"][-1]
    assert tr["meta"]["from"] == "new" and tr["meta"]["to"] == "in_progress" and tr["meta"]["via"] == "reply" and not tr["meta"].get("notified")
    # «Mening murojaatlarim» tarixida «Jarayonda» ko'rinadi (panel tahriri, javob xabari joyida)
    btn(f"view:{t['id']}")
    assert "В работе" in scr()["text"] and "Новое" in scr()["text"] and fk.msg(777, reply_id)["text"] == sent[k]["text"]
    # ikkinchi murojaat: ism va telefon eslab qolingan — so'ralmaydi (bo'lim → mavzu → matn → tasdiqlash)
    btn("new")
    assert scr()["text"].startswith("👤 Ali Valiyev · 📞 +998 90 123 45 67") and "1/3 ·" in scr()["text"]
    btn(kbd()[0][0]["callback_data"])
    assert scr()["text"].startswith("2/3 ·")
    # panel ustida javob xabari bor (u yuborilgandan keyin panel ko'chmagan): mavzu kiritilgach panel pastga ko'chadi
    old = b.chat("777")["panel"]
    msg("Stipendiya")
    assert scr()["text"].startswith("3/3 ·") and b.chat("777")["panel"] != old and not fk.msg(777, old) and fk.visible(777)[-1] == scr()
    msg("Stipendiya qachon?")
    summ = scr()
    assert "Ali Valiyev" in summ["text"] and "+998 90 123 45 67" in summ["text"]
    assert ["edit_me"] in [[b_["callback_data"] for b_ in row] for row in summ["markup"]["inline_keyboard"]]
    # ma'lumotlarni o'zgartirish (tasdiqlash qadamida): ism yangi, telefon o'zgarishsiz, email qo'shiladi
    btn("edit_me")
    assert "Напишите имя" in scr()["text"] and not scr()["text"][0].isdigit()
    assert kbd()[0][0]["callback_data"] == "keep_name"
    msg("Ali Valiyev Karimovich")
    assert kbd()[0][0]["callback_data"] == "keep_phone"
    btn("keep_phone")
    msg("ali@example.com")
    assert "Ali Valiyev Karimovich" in scr()["text"] and "+998 90 123 45 67" in scr()["text"] and "Stipendiya qachon?" in scr()["text"]
    btn("send")
    t2 = next(x for x in a.get("/api/admin/desk").json()["tickets"] if x["title"] == "Stipendiya")
    assert (t2["requester_name"], t2["requester_phone"], t2["requester_email"]) == ("Ali Valiyev Karimovich", "+998 90 123 45 67", "ali@example.com")
    # chat: murojaat matnlari, qo'shimcha xabar, operator javobi va bitta panel; ism/telefon/mavzu/email kiritishlari o'chirilgan
    assert users() == ["Yotoqxonada joy bormi?", "Yana bir savol", "Stipendiya qachon?"]
    assert [x["id"] for x in fk.bot_msgs(777)] == [reply_id, b.chat("777")["panel"]]
    # uchinchi murojaat — yangilangan ma'lumotlar bilan; bekor qilish ham ularni o'chirmaydi
    btn("new")
    btn("cancel")
    assert fk.toasts[-1].get("text") == "Отменено."
    btn("new")
    assert scr()["text"].startswith("👤 Ali Valiyev Karimovich · 📞 +998 90 123 45 67")
    btn("cancel")
    # boshqa chat: profil yo'q — to'liq so'rovnoma; telefon «kontakt» sifatida yuborilsa ham qabul qilinadi
    other = {"id": 778, "first_name": "Sardor"}
    msg("/start", chat=778, frm=other)
    btn("lang:uz", chat=778, frm=other)
    btn("new", chat=778, frm=other)
    assert scr(778)["text"].startswith("1/6 ·")
    msg("Sardor Aliyev", chat=778, frm=other)
    msg(None, chat=778, frm=other, contact={"phone_number": "998901112233", "user_id": 778})
    assert scr(778)["text"].startswith("3/6 ·")
    assert b.chat("778")["data"]["phone"] == "+998901112233"
    assert fk.visible(778) == [scr(778)]
    # webhook: maxfiy kalitsiz — 403
    assert client(m).post("/api/telegram/webhook", json={}).status_code == 403
    a.put("/api/admin/telegram", json={"enabled": False})


def test_desk_telegram_media_status_rating_stats(m, monkeypatch):
    """Murojaatlar + Telegram: kiruvchi media saqlanadi, operator ilovalari botga ketadi, javob bosqichni o'zgartirmaydi,
    bosqich o'zgarishi (izoh bilan) murojaatchiga boradi, «Hal qilindi» — baholash (1–5, bitta marta), «Mening murojaatlarim», statistika."""
    from fake_tg import FakeTG

    from university import telegram as TG

    fk = FakeTG(files={"F1": PNG, "F2": b"%PDF-1.4 hujjat", "F3": b"OggS-voice", "G1": PNG, "G2": PNG})
    calls = fk.calls  # (usul, tana) — fon long-polling va answerCallbackQuery'siz
    monkeypatch.setattr(TG, "TRANSPORT", fk.transport)
    a = admin(m)
    a.put("/api/admin/telegram", json={"enabled": True, "token": "123456:" + "B" * 35, "mode": "polling"})
    from university.api.desk import bot

    b = bot()
    user = {"id": 888, "first_name": "Vali", "username": "vali"}
    n = iter(range(1000, 2000))
    sent = lambda: [x for x in calls if x[0] == "sendMessage"]  # noqa: E731

    def msg(**kw):
        mid = fk.user(888, **kw)["id"]
        b.handle({"update_id": next(n), "message": {"message_id": mid, "chat": {"id": 888, "type": "private"}, "from": user} | kw})
        return mid

    def btn(data, mid=None):
        mid = mid or b.chat("888")["panel"]  # standart — panel tugmasi
        b.handle({"update_id": next(n), "callback_query": {"id": "q", "from": user, "data": data, "message": {"chat": {"id": 888}, "message_id": mid}}})

    def scr():
        return fk.msg(888, b.chat("888")["panel"])

    msg(text="/start")
    btn("lang:ru")
    btn("new")
    btn("use_name")
    msg(text="+998 90 000 11 22")
    btn("skip_email")
    btn(scr()["markup"]["inline_keyboard"][0][0]["callback_data"])
    msg(text="Diplom nusxasi")
    # murojaat matni bosqichida: rasm (izohsiz) — ilova (chatda qoladi), panel uning ostiga; keyin matn
    ph = msg(photo=[{"file_id": "F0", "file_size": 10, "width": 90, "height": 90}, {"file_id": "F1", "file_size": len(PNG), "width": 900, "height": 900}])
    assert "Файл получен" in scr()["text"] and fk.msg(888, ph) and fk.visible(888)[-1] == scr()
    body = msg(text="Diplom nusxasini olsam bo‘ladimi?")
    assert "📎" in scr()["text"] and [x["id"] for x in fk.visible(888)] == [ph, body, scr()["id"]]
    btn("send")
    t = next(x for x in a.get("/api/admin/desk").json()["tickets"] if x["tg_chat"] == "888")
    assert t["lang"] == "ru" and t["channels"] == [{"id": "telegram", "ready": True}]
    ev = a.get(f"/api/admin/desk/tickets/{t['id']}").json()["events"]
    f0 = ev[0]["meta"]["files"][0]
    assert ev[0]["kind"] == "created" and f0["kind"] == "image" and f0["name"].endswith(".jpg")
    assert a.get(f0["url"]).content == PNG
    # erkin xabar: hujjat va ovozli xabar — ochiq murojaatga; albom (media_group_id) — bitta xabar
    msg(document={"file_id": "F2", "file_name": "ariza.pdf", "mime_type": "application/pdf", "file_size": 15}, caption="Ariza ilova qilindi")
    msg(voice={"file_id": "F3", "mime_type": "audio/ogg", "file_size": 10, "duration": 2})
    msg(photo=[{"file_id": "G1", "file_size": len(PNG)}], media_group_id="alb1", caption="Albom")
    msg(photo=[{"file_id": "G2", "file_size": len(PNG)}], media_group_id="alb1")
    ev = [e for e in a.get(f"/api/admin/desk/tickets/{t['id']}").json()["events"] if e["kind"] == "message_in"]
    assert ev[0]["content"] == "Ariza ilova qilindi" and ev[0]["meta"]["files"][0]["name"] == "ariza.pdf"
    assert ev[1]["meta"]["files"][0]["kind"] == "audio" and ev[1]["meta"]["files"][0]["mime"] == "audio/ogg"
    assert len(ev) == 3 and ev[2]["content"] == "Albom" and [f["kind"] for f in ev[2]["meta"]["files"]] == ["image", "image"]
    # erkin xabarlar chiptaga yozishma sifatida chatda qoladi; panel (bitta) — eng pastda
    assert len(fk.user_msgs(888)) == 6 and fk.bot_msgs(888) == [scr()] and fk.visible(888)[-1] == scr() and "Сообщение добавлено" in scr()["text"]
    # juda katta fayl — yuklab olinmaydi, foydalanuvchiga panelda aytiladi (alohida xabar emas)
    k = len(sent())
    msg(video={"file_id": "BIG", "mime_type": "video/mp4", "file_size": 30 * 1024 * 1024})
    assert "слишком большой" in scr()["text"] and len(sent()) == k + 1 and fk.bot_msgs(888) == [scr()]
    # «Boshlash» → Jarayonda: murojaatchiga holat xabari YUBORILMAYDI; «Jarayonda»dagi murojaatga javob bosqichni o'zgartirmaydi
    calls.clear()
    d = a.post(f"/api/admin/desk/tickets/{t['id']}/start").json()
    assert d["ticket"]["stage"] == "in_progress" and calls == []
    st_ev = [e for e in d["events"] if e["kind"] == "start"][-1]
    assert st_ev["meta"]["to"] == "in_progress" and "notified" not in st_ev["meta"]
    calls.clear()
    r = a.post(f"/api/admin/desk/tickets/{t['id']}/reply", data={"body": "Mana namuna.", "channel": "telegram"},
               files=[("files", ("namuna.png", PNG, "image/png"))])
    assert r.status_code == 200, r.text
    assert r.json()["ticket"]["stage"] == "in_progress"
    assert [c[0] for c in calls] == ["sendPhoto"]
    assert b'name="chat_id"' in calls[0][1] and b"888" in calls[0][1] and b"Mana namuna." in calls[0][1] and b'filename="namuna.png"' in calls[0][1]
    out = [e for e in r.json()["events"] if e["kind"] == "message_out"][-1]
    assert out["meta"]["channel"] == "telegram" and out["meta"]["files"][0]["kind"] == "image"
    # bir nechta rasm — albom (sendMediaGroup) + matn alohida (tugmalar bilan); hujjat — sendDocument
    calls.clear()
    a.post(f"/api/admin/desk/tickets/{t['id']}/reply", data={"body": "Ikki rasm", "channel": "telegram"},
           files=[("files", ("a.png", PNG, "image/png")), ("files", ("b.png", PNG, "image/png"))])
    assert [c[0] for c in calls] == ["sendMediaGroup", "sendMessage"] and b"attach://f1" in calls[0][1]
    calls.clear()
    a.post(f"/api/admin/desk/tickets/{t['id']}/reply", data={"body": "", "channel": "telegram"}, files=[("files", ("x.pdf", b"%PDF-1", "application/pdf"))])
    assert [c[0] for c in calls] == ["sendDocument"]
    # uzun matn — izoh emas, alohida xabar
    calls.clear()
    a.post(f"/api/admin/desk/tickets/{t['id']}/reply", data={"body": "x" * 1500, "channel": "telegram"}, files=[("files", ("x.pdf", b"%PDF-1", "application/pdf"))])
    assert [c[0] for c in calls] == ["sendDocument", "sendMessage"] and b'name="caption"' not in calls[0][1]
    assert a.get(f"/api/admin/desk/tickets/{t['id']}").json()["ticket"]["stage"] == "in_progress"
    # bosqich o'zgarishi izoh bilan — murojaatchiga (uning tilida)
    calls.clear()
    d = a.post(f"/api/admin/desk/tickets/{t['id']}/move", json={"stage": "waiting", "reason": "Pasport raqamingizni yozing"}).json()
    txt = sent()[-1][1]["text"]
    assert "Ожидается ваш ответ" in txt and "Pasport raqamingizni yozing" in txt and sent()[-1][1]["chat_id"] == "888"
    assert [e for e in d["events"] if e["kind"] == "transition"][-1]["meta"]["notified"] == ["telegram"]
    # murojaatchi javobi bosqichni o'zgartirmaydi (faqat yopilgan murojaat qayta ochiladi)
    msg(text="AB1234567")
    assert a.get(f"/api/admin/desk/tickets/{t['id']}").json()["ticket"]["stage"] == "waiting"
    # «Mening murojaatlarim»: holat va oxirgi izoh; ochilsa — tarix
    btn("mine")
    lst = scr()
    assert "UNI-" in lst["text"] and "Ожидается ваш ответ" in lst["text"] and "Pasport raqamingizni yozing" in lst["text"]
    btn(lst["markup"]["inline_keyboard"][0][0]["callback_data"])
    det = scr()["text"]
    assert "История статусов" in det and "Новое" in det and "В работе" in det and "Pasport raqamingizni yozing" in det
    # «Javob kutilmoqda»dagi murojaatga operator javobi → «Jarayonda» (hodisa bilan), holat xabarisiz — faqat javob
    calls.clear()
    d = a.post(f"/api/admin/desk/tickets/{t['id']}/reply", data={"body": "Rahmat, tekshiryapmiz.", "channel": "telegram"}).json()
    assert d["ticket"]["stage"] == "in_progress" and len(sent()) == 1 and "Ответ по" in sent()[0][1]["text"] and "статус" not in sent()[0][1]["text"]
    tr = d["events"][-1]
    assert tr["kind"] == "transition" and (tr["meta"]["from"], tr["meta"]["to"], tr["meta"]["via"]) == ("waiting", "in_progress", "reply")
    btn(f"view:{t['id']}")
    det = scr()["text"]
    assert det.index("Ожидается ваш ответ") < det.rindex("В работе") and "⏳ В работе\n" in det
    # qo'lda «Jarayonda»ga (sudrab / holat tanlash) izohsiz — hech narsa yuborilmaydi; boshqa bosqichlar (shu jumladan «Yangi»ga qaytarish) — xabar bilan
    calls.clear()
    a.post(f"/api/admin/desk/tickets/{t['id']}/move", json={"stage": "new"})
    assert len(sent()) == 1 and "Новое" in sent()[0][1]["text"] and "статус" in sent()[0][1]["text"]
    calls.clear()
    d = a.post(f"/api/admin/desk/tickets/{t['id']}/move", json={"stage": "in_progress"}).json()
    assert d["ticket"]["stage"] == "in_progress" and calls == []
    assert "notified" not in [e for e in d["events"] if e["kind"] == "transition"][-1]["meta"]
    # «Jarayonda»ga izoh bilan — murojaatchiga faqat izohning o'zi (oddiy operator xabari, «holat o'zgardi» sarlavhasisiz)
    a.post(f"/api/admin/desk/tickets/{t['id']}/move", json={"stage": "waiting", "reason": "Yana bir hujjat kerak"})
    calls.clear()
    d = a.post(f"/api/admin/desk/tickets/{t['id']}/move", json={"stage": "in_progress", "reason": "Hujjatlaringiz ko‘rib chiqilmoqda"}).json()
    assert len(calls) == 1 and calls[0][0] == "sendMessage"
    txt = calls[0][1]["text"]
    assert "Hujjatlaringiz ko‘rib chiqilmoqda" in txt and "статус" not in txt and "В работе" not in txt and "🔔" not in txt
    tr = [e for e in d["events"] if e["kind"] == "transition"][-1]
    assert tr["meta"]["notified"] == ["telegram"] and tr["content"] == "Hujjatlaringiz ko‘rib chiqilmoqda"
    # «Boshlash» — «Javob kutilmoqda»dan ham «Jarayonda»ga, xabarsiz
    a.post(f"/api/admin/desk/tickets/{t['id']}/move", json={"stage": "waiting", "reason": "Pasportni yuboring"})
    calls.clear()
    assert a.post(f"/api/admin/desk/tickets/{t['id']}/start").json()["ticket"]["stage"] == "in_progress" and calls == []
    # hal qilindi: izoh + «hal qilindi» + yulduzli tugmalar
    calls.clear()
    a.post(f"/api/admin/desk/tickets/{t['id']}/move", json={"stage": "resolved", "reason": "Nusxa tayyor, 3-xonadan oling"})
    last = sent()[-1][1]
    assert "обращение решено" in last["text"] and "Nusxa tayyor" in last["text"]
    kbd = last["reply_markup"]["inline_keyboard"][0]
    assert [k["callback_data"] for k in kbd] == [f"rate:{t['id']}:{i}" for i in range(1, 6)]
    rmsg = fk.bot_msgs(888)[-1]  # baholash so'ralgan holat xabari (bildirishnoma)
    pid = b.chat("888")["panel"]
    btn(f"rate:{t['id']}:9", mid=rmsg["id"])  # noto'g'ri baho — e'tiborsiz
    assert a.get(f"/api/admin/desk/tickets/{t['id']}").json()["ticket"]["rating"] is None
    calls.clear()
    btn(f"rate:{t['id']}:5", mid=rmsg["id"])
    # yangi xabar yo'q: o'sha baholash xabari «rahmat» holatiga tahrirlanadi (holat va izoh matni saqlanadi)
    assert [c[0] for c in calls] == ["editMessageText"] and calls[0][1]["message_id"] == rmsg["id"]
    assert "5/5" in rmsg["text"] and "Nusxa tayyor" in rmsg["text"] and "решено" in rmsg["text"] and "оцените" not in rmsg["text"]
    assert [x["callback_data"] for row in rmsg["markup"]["inline_keyboard"] for x in row] == ["mine", "menu"]
    cm = msg(text="Juda tez yordam berishdi")
    assert "отзыв сохранён" in rmsg["text"] and "Juda tez yordam berishdi" in rmsg["text"] and ("888", cm) in fk.deleted
    assert not [c for c in calls if c[0] == "sendMessage"] and b.chat("888")["panel"] == pid
    btn(f"rate:{t['id']}:1", mid=rmsg["id"])
    assert "уже оценено" in fk.toasts[-1]["text"] and fk.toasts[-1]["show_alert"] is True and not [c for c in calls if c[0] == "sendMessage"]
    tk = a.get(f"/api/admin/desk/tickets/{t['id']}").json()
    assert tk["ticket"]["rating"] == 5 and tk["ticket"]["rating_comment"] == "Juda tez yordam berishdi" and tk["ticket"]["stage"] == "resolved"
    assert [e["meta"]["rating"] for e in tk["events"] if e["kind"] == "rating"] == [5, 5]
    # ochiq API orqali ham qayta baholab bo'lmaydi
    tok = tk["public_url"].rsplit("/", 1)[1]
    assert client(m).post(f"/api/desk/public/{tok}/rate", json={"rating": 3}).status_code == 409
    # statistika: hajmlar, baholar, operatorlar reytingi
    st = a.get("/api/admin/desk/stats?days=7").json()
    o = st["overview"]
    assert o["total"] >= 1 and o["by_source"]["telegram"] >= 1 and o["ratings"] >= 1 and o["rating_dist"]["5"] >= 1 and o["csat"]
    op = next(x for x in st["operators"] if x["user"]["name"] == "Administrator")
    assert op["resolved"] >= 1 and op["rated"] >= 1 and op["csat"] and op["avg_first_response_min"] is not None
    assert len(st["timeline"]) == 7 and sum(x["created"] for x in st["timeline"]) == o["total"]
    assert a.get("/api/admin/desk/stats?start=2026-02-10&end=2026-01-01").status_code == 400
    a.put("/api/admin/telegram", json={"enabled": False})


def test_telegram_group_autopost(m, monkeypatch):
    """Murojaatlar boti guruh/kanalga qo'shilsa (my_chat_member) — ro'yxatga tushadi; faqat tasdiqlangan chatga, tanlangan turdagi,
    tasdiqlangandan keyin nashr qilingan elementlar bir marta yuboriladi (rasm + HTML izoh ≤1024); guruhdagi oddiy xabarlarga bot javob bermaydi."""
    import json as _json
    from datetime import datetime, timedelta, timezone
    from email.parser import BytesParser
    from email.policy import HTTP

    import httpx

    from university import telegram as TG
    from university import tg_publish as TP

    calls: list[tuple[str, dict]] = []
    fail = {"sendPhoto": ""}

    def parse(req: httpx.Request) -> dict:
        ctype = req.headers.get("content-type", "")
        if "json" in ctype:
            return _json.loads(req.content or b"{}")
        msg = BytesParser(policy=HTTP).parsebytes(b"Content-Type: " + ctype.encode() + b"\r\n\r\n" + req.read())
        return {p.get_param("name", header="content-disposition"): (p.get_payload(decode=True) if p.get_filename() else p.get_payload(decode=True).decode())
                for p in msg.iter_parts()}

    def handler(req: httpx.Request):
        method = req.url.path.rsplit("/", 1)[-1]
        body = parse(req)
        if method in ("getUpdates", "deleteWebhook", "answerCallbackQuery"):
            return httpx.Response(200, json={"ok": True, "result": [] if method == "getUpdates" else True})
        calls.append((method, body))
        if method == "getMe":
            return httpx.Response(200, json={"ok": True, "result": {"id": 123456, "username": "site_test_bot", "first_name": "UNI"}})
        if method == "getChat":
            return httpx.Response(200, json={"ok": True, "result": {"id": -1009990001, "type": "channel", "title": "UNI rasmiy", "username": "uni_rasmiy"}})
        if method == "getChatMember":
            assert body["user_id"] == 123456
            return httpx.Response(200, json={"ok": True, "result": {"status": "administrator", "can_post_messages": True, "user": {"id": 123456}}})
        if method == "sendPhoto" and fail["sendPhoto"]:
            return httpx.Response(400, json={"ok": False, "description": fail["sendPhoto"]})
        return httpx.Response(200, json={"ok": True, "result": {"message_id": len(calls)}})

    monkeypatch.setattr(TG, "TRANSPORT", httpx.MockTransport(handler))
    monkeypatch.setattr(TP, "SYNC", True)
    a = admin(m)
    a.put("/api/admin/telegram", json={"enabled": True, "token": "123456:" + "C" * 35, "mode": "polling"})
    u = a.get("/api/admin/uni").json()
    u["socials"] = {**u["socials"], "telegram": "https://t.me/uni_official", "instagram": "https://instagram.com/example.edu", "youtube": "https://youtube.com/@uni",
                    "facebook": "https://facebook.com/uni"}
    assert a.put("/api/admin/uni", json=u).status_code == 200
    from university.api.desk import bot

    b = bot()
    n = iter(range(5000, 6000))
    grp = {"id": -100123, "type": "supergroup", "title": "UNI talabalari"}
    b.handle({"update_id": next(n), "my_chat_member": {"chat": grp, "from": {"id": 5}, "date": 1,
                                                        "old_chat_member": {"status": "left", "user": {"id": 123456}},
                                                        "new_chat_member": {"status": "member", "user": {"id": 123456}}}})
    gs = a.get("/api/admin/telegram").json()["groups"]
    g = next(x for x in gs if x["chat_id"] == "-100123")
    assert g["title"] == "UNI talabalari" and g["type"] == "supergroup" and g["can_post"] and not g["confirmed"]

    def posts():
        return [(mt, bd) for mt, bd in calls if mt in ("sendPhoto", "sendMessage")]

    def news(title, status="published", **kw):
        r = a.post("/api/admin/items/news", json={"title": title, "status": status, **kw})
        assert r.status_code == 200, r.text
        return r.json()

    # tasdiqlanmagan guruhga hech narsa ketmaydi
    news("Tasdiqlanmagan guruhga ketmaydi")
    assert posts() == []
    # guruhdagi oddiy xabarlar, buyruqlar va tugmalar e'tiborsiz (murojaat jarayoni faqat shaxsiy chatda)
    for text in ("/start", "Salom hammaga", "/menu"):
        b.handle({"update_id": next(n), "message": {"chat": grp, "from": {"id": 42, "first_name": "Ali"}, "text": text}})
    b.handle({"update_id": next(n), "callback_query": {"id": "q", "from": {"id": 42}, "data": "new", "message": {"chat": grp}}})
    assert calls == [] or all(mt not in ("sendMessage", "sendPhoto") for mt, _ in calls)
    assert b.chat("-100123")["state"] == "" and not b.chat("-100123")["lang"]

    assert a.post("/api/admin/telegram/groups/-100123/confirm", json={"confirmed": True}).status_code == 200
    g = next(x for x in a.get("/api/admin/telegram").json()["groups"] if x["chat_id"] == "-100123")
    assert g["confirmed"] and g["kinds"] == ["news", "announce", "vacancy"]
    # tasdiqlashdan oldin nashr qilingan yangilik keyin ham yuborilmaydi
    assert posts() == []

    img = a.post("/api/admin/media", files={"file": ("a.png", PNG, "image/png")}).json()["url"]
    long_html = "<p>" + " ".join(["Institutda yangi laboratoriya ochildi &amp; talabalar uchun <b>amaliy</b> mashg‘ulotlar boshlandi."] * 40) + "</p><p>Ikkinchi paragraf.</p>"
    it = news("Yangi <laboratoriya> ochildi", html=long_html, feature_image=img)
    ps = posts()
    assert len(ps) == 1 and ps[0][0] == "sendPhoto", ps
    body = ps[0][1]
    cap = body["caption"]
    assert body["chat_id"] == "-100123" and body["parse_mode"] == "HTML" and isinstance(body["photo"], bytes) and body["photo"][:4] == b"\x89PNG"
    assert len(cap) <= 1024 and cap.startswith("<b>Yangi &lt;laboratoriya&gt; ochildi</b>")
    assert f'<a href="https://site.example/news/{it["slug"]}">Batafsil →</a>' in cap
    assert cap.endswith('<a href="https://t.me/uni_official">Telegram</a> | <a href="https://instagram.com/example.edu">Instagram</a> | '
                        '<a href="https://youtube.com/@uni">YouTube</a>')
    assert "facebook" not in cap and "<p>" not in cap and "&amp; talabalar" in cap and ("…" in cap or cap.count(".") > 1)
    assert a.get("/api/admin/telegram/items/" + it["id"]).json()["posts"][0]["status"] == "sent"
    # tahrirlash qayta yubormaydi
    a.put(f"/api/admin/items/news/{it['id']}", json={**it, "title": "Yangi laboratoriya ochildi (yangilandi)"})
    assert len(posts()) == 1
    # qoralama yuborilmaydi; qoralama → nashr — bir marta (rasmsiz: sendMessage, havola ko'rinishisiz)
    d = news("Qoralama yangilik", status="draft", html="<p>Matn.</p>")
    assert len(posts()) == 1
    a.put(f"/api/admin/items/news/{d['id']}", json={**d, "status": "published"})
    ps = posts()
    assert len(ps) == 2 and ps[1][0] == "sendMessage" and ps[1][1]["link_preview_options"] == {"is_disabled": True}
    assert "<b>Qoralama yangilik</b>" in ps[1][1]["text"] and "Matn." in ps[1][1]["text"]
    a.put(f"/api/admin/items/news/{d['id']}", json={**d, "status": "published", "title": "Qoralama yangilik!"})
    a.put(f"/api/admin/items/news/{d['id']}", json={**d, "status": "draft"})
    a.put(f"/api/admin/items/news/{d['id']}", json={**d, "status": "published"})
    assert len(posts()) == 2
    # turlar: tadbir standart o'chiq; faqat yangilik qoldirilsa — e'lon ham ketmaydi
    a.post("/api/admin/items/event", json={"title": "Ochiq eshiklar kuni", "status": "published", "starts": "2026-11-01T05:00:00Z", "place": "Bosh bino"})
    assert len(posts()) == 2
    a.put("/api/admin/telegram/groups/-100123", json={"kinds": ["news"]})
    a.post("/api/admin/items/announce", json={"title": "Imtihon jadvali", "status": "published"})
    vac0 = a.post("/api/admin/items/vacancy", json={"title": "Eski vakansiya", "status": "published"}).json()
    assert len(posts()) == 2
    # vakansiya yoqildi: avval nashr qilingani ketmaydi, yangisi — asosiy ma'lumotlar bilan
    a.put("/api/admin/telegram/groups/-100123", json={"kinds": ["news", "vacancy"]})
    a.put(f"/api/admin/items/vacancy/{vac0['id']}", json={**vac0, "salary": "5 mln"})
    assert len(posts()) == 2
    vac = a.post("/api/admin/items/vacancy", json={"title": "Dotsent (oziq-ovqat texnologiyasi)", "status": "published", "department": "Oziq-ovqat texnologiyasi kafedrasi",
                                                    "employment": "full_time", "salary": "8–10 mln so‘m", "deadline": "2026-11-30T00:00:00Z",
                                                    "summary": "Kafedraga tajribali dotsent kerak. Ilmiy daraja talab etiladi.", "html": "<p>Batafsil talablar.</p>"}).json()
    ps = posts()
    assert len(ps) == 3 and ps[2][0] == "sendMessage"
    vt = ps[2][1]["text"]
    assert vt.startswith("<b>Dotsent") and "Bo‘lim: Oziq-ovqat texnologiyasi kafedrasi" in vt and "Ish haqi: 8–10 mln so‘m" in vt
    assert "Ariza muddati: 30.11.2026" in vt and "Ish turi: To‘liq stavka" in vt and "Kafedraga tajribali dotsent kerak." in vt
    assert f"https://site.example/careers/{vac['slug']}" in vt and len(vt) <= 1024
    # rejalashtirilgan: vaqti kelganda (fon oqimi har daqiqada tekshiradi)
    soon = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat(timespec="seconds")
    sch = news("Rejalashtirilgan yangilik", status="scheduled", published_at=soon)
    assert sch["status"] == "scheduled" and len(posts()) == 3
    time.sleep(2.5)
    from university.api.desk import publisher

    publisher().run_once()
    assert len(posts()) == 4 and "Rejalashtirilgan yangilik" in posts()[3][1]["text"]
    publisher().run_once()
    assert len(posts()) == 4
    # xato: oxirgi xato sozlamalarda; rasm muammosi bo'lsa — matn bilan yuboriladi
    fail["sendPhoto"] = "Bad Request: chat not found"
    e = news("Xato bilan", feature_image=img)
    g = next(x for x in a.get("/api/admin/telegram").json()["groups"] if x["chat_id"] == "-100123")
    assert "chat not found" in g["last_error"] and len(posts()) == 5
    fail["sendPhoto"] = "Bad Request: wrong file identifier/HTTP URL specified"
    a.post("/api/admin/telegram/groups/-100123/retry")
    ps = posts()
    assert ps[-1][0] == "sendMessage" and "Xato bilan" in ps[-1][1]["text"]
    g = next(x for x in a.get("/api/admin/telegram").json()["groups"] if x["chat_id"] == "-100123")
    assert not g["last_error"] and g["last_post"]
    assert a.get("/api/admin/telegram/items/" + e["id"]).json()["posts"][0]["status"] == "sent"
    fail["sendPhoto"] = ""
    # qo'lda «Telegramga yuborish»: allaqachon yuborilgan — yo'q
    assert a.post(f"/api/admin/telegram/items/{e['id']}/send").json()["detail"] == "telegram_nothing_to_send"
    # kanalni qo'lda qo'shish (getChat + getChatMember), tasdiqlash; qo'lda yuborish — eski elementni ham
    r = a.post("/api/admin/telegram/groups/check", json={"chat": "@uni_rasmiy"}).json()
    assert r["group"]["chat_id"] == "-1009990001" and r["group"]["type"] == "channel" and r["group"]["can_post"]
    assert a.post("/api/admin/telegram/groups/check", json={"chat": "salom dunyo"}).json()["detail"] == "telegram_bad_chat"
    a.post("/api/admin/telegram/groups/-1009990001/confirm")
    before = len(posts())
    r = a.post(f"/api/admin/telegram/items/{it['id']}/send").json()
    assert r["sent"] == 1 and len(posts()) == before + 1 and posts()[-1][1]["chat_id"] == "-1009990001"
    # bot guruhdan chiqarildi — tasdiqlash bo'lsa ham yuborilmaydi; superguruhga aylanish — id yangilanadi
    b.handle({"update_id": next(n), "my_chat_member": {"chat": grp, "from": {"id": 5}, "date": 2, "old_chat_member": {"status": "member", "user": {"id": 123456}},
                                                        "new_chat_member": {"status": "kicked", "user": {"id": 123456}}}})
    a.post("/api/admin/telegram/groups/-1009990001/confirm", json={"confirmed": False})
    before = len(posts())
    news("Chiqarilgandan keyin")
    assert len(posts()) == before
    old = {"id": -555, "type": "group", "title": "Eski guruh"}
    b.handle({"update_id": next(n), "my_chat_member": {"chat": old, "from": {"id": 5}, "date": 3, "old_chat_member": {"status": "left", "user": {"id": 123456}},
                                                        "new_chat_member": {"status": "member", "user": {"id": 123456}}}})
    b.handle({"update_id": next(n), "message": {"chat": old, "from": {"id": 5}, "migrate_to_chat_id": -100555}})
    ids = [x["chat_id"] for x in a.get("/api/admin/telegram").json()["groups"]]
    assert "-100555" in ids and "-555" not in ids
    assert "my_chat_member" in TG.ALLOWED_UPDATES
    for cid in ids:
        assert a.delete(f"/api/admin/telegram/groups/{cid}").status_code == 200
    assert a.get("/api/admin/telegram").json()["groups"] == []
    a.put("/api/admin/telegram", json={"enabled": False})


def test_caption_fits_and_cuts_cleanly():
    from university import tg_publish as TP

    t = "Birinchi gap. " * 200
    out = TP.fit(t, 300)
    assert len(out) <= 300 and out.endswith("gap.")
    w = "so‘z " * 400
    out = TP.fit(w, 101)
    assert len(out) <= 101 and out.endswith("so‘z…")
    assert TP.fit("a < b & c", 100) == "a &lt; b &amp; c"
    assert TP.fit("<<<<<<<<<<<<<<<<<<<<", 21) == "&lt;&lt;&lt;&lt;&lt;…"
    assert TP.plain_text("<h2>Sarlavha</h2><p>Bir&nbsp;  ikki</p><ul><li>uch</li></ul><script>x()</script>") == "Sarlavha\n\nBir ikki\n\nuch"


def test_onlyoffice_docs_editor_callback_and_site_view(m, monkeypatch):
    import httpx

    import university.api.office as AO
    from university import office as O

    a = admin(m)
    t, _ = login(m, "teacher", DEMO_PW)
    # o'chirilgan holatda: ro'yxat bor, tahrirlagich yo'q
    assert client(m).get("/api/office/status").json()["enabled"] is False
    r = a.put("/api/admin/office", json={"enabled": True, "secret": "S3CRET-key", "url": "/office-ds", "internal_url": "http://ds", "app_url": "http://app:8000"})
    assert r.status_code == 200 and r.json()["config"]["has_secret"] and "secret" not in r.json()["config"]
    assert client(m).get("/api/office/status").json()["enabled"] is True
    # yaratish: uch turdan biri tanlanadi
    assert t.post("/api/docs", json={"ext": "exe"}).status_code == 400
    d = t.post("/api/docs", json={"ext": "xlsx", "title": "Baholar jadvali"}).json()
    assert d["kind"] == "cell" and d["editable"] and d["title"] == "Baholar jadvali"
    for ext, kind in (("docx", "word"), ("pptx", "slide")):
        assert t.post("/api/docs", json={"ext": ext}).json()["kind"] == kind
    assert len(t.get("/api/docs").json()["items"]) == 3
    # boshqa foydalanuvchi ko'ra olmaydi
    s1, _ = login(m, "student", DEMO_PW)
    assert s1.get(f"/api/docs/{d['id']}/editor").status_code == 404
    # tahrirlagich konfiguratsiyasi: JWT bilan imzolangan, fayl va callback havolalari imzoli
    e = t.get(f"/api/docs/{d['id']}/editor?lang=ru&back=/teacher/docs").json()
    cfg = e["config"]
    assert e["server"] == "/office-ds" and cfg["documentType"] == "cell" and cfg["editorConfig"]["mode"] == "edit" and cfg["editorConfig"]["lang"] == "ru"
    payload = O.jwt_decode(cfg["token"], "S3CRET-key")
    assert payload and payload["document"]["key"] == cfg["document"]["key"]
    assert O.jwt_decode(cfg["token"], "boshqa-kalit") is None
    file_url = cfg["document"]["url"]
    assert file_url.startswith("http://app:8000/api/office/file/")
    path = file_url.split("http://app:8000", 1)[1]
    assert client(m).get(path).content[:2] == b"PK"  # Document Server sessiyasiz, imzo bilan yuklab oladi
    assert client(m).get(f"/api/office/file/{d['id']}?exp=9999999999&sig=x").status_code == 403
    # saqlash: Document Server callback (JWT) → yangi versiya, yangi kalit
    new_bytes = b"PK\x03\x04 yangi versiya"
    monkeypatch.setattr(AO, "TRANSPORT", httpx.MockTransport(lambda req: httpx.Response(200, content=new_bytes) if req.url.host == "ds" else httpx.Response(404)))
    cb = cfg["editorConfig"]["callbackUrl"].split("http://app:8000", 1)[1]
    teacher_id = t.get("/api/auth/me").json()["user"]["id"] if t.get("/api/auth/me").status_code == 200 else "x"
    body = {"key": cfg["document"]["key"], "status": 2, "url": "https://site.example/office-ds/cache/files/data/x/output.xlsx", "users": [teacher_id], "filetype": "xlsx"}
    assert client(m).post(cb, json=body).json()["error"] == 1  # tokensiz — rad etiladi
    assert client(m).post(cb, json={"token": O.jwt_encode(body, "S3CRET-key")}).json()["error"] == 0
    d2 = next(x for x in t.get("/api/docs").json()["items"] if x["id"] == d["id"])
    assert d2["version"] == 2 and d2["size"] == len(new_bytes)
    assert t.get(f"/api/docs/{d['id']}/download").content == new_bytes
    assert t.get(f"/api/docs/{d['id']}/editor").json()["config"]["document"]["key"] != cfg["document"]["key"]
    # yuklash, nomini o'zgartirish, o'chirish
    up = t.post("/api/docs/upload", files={"file": ("Reja.docx", (O.TEMPLATES / "new.docx").read_bytes(), "application/octet-stream")}).json()
    assert up["title"] == "Reja" and up["ext"] == "docx"
    assert t.put(f"/api/docs/{up['id']}", json={"title": "Yangi reja", "starred": True}).json()["starred"] is True
    assert t.delete(f"/api/docs/{up['id']}").json()["ok"]
    # saytdagi hujjat: faqat ko'rish rejimi (kirmagan mehmon uchun ham)
    v = client(m).get("/api/office/view?src=/media/0123456789abcdef.pdf&title=Nizom").json()
    assert v["config"]["editorConfig"]["mode"] == "view" and v["config"]["documentType"] == "pdf" and v["config"]["document"]["title"] == "Nizom.pdf"
    assert client(m).get("/api/office/view?src=/etc/passwd").status_code == 400
    a.put("/api/admin/office", json={"enabled": False})


def test_onlyoffice_proxy_scheme_behind_tls_proxy():
    """Tashqi proksi https'ni uzib, `X-Forwarded-Proto: http` yuborsa ham Document Server https havola yasashi kerak —
    aks holda brauzer fayl havolasini «Mixed Content» deb bloklaydi va ONLYOFFICE «Download failed» ko'rsatadi."""
    from types import SimpleNamespace

    from starlette.datastructures import Headers

    import university.api.office as AO

    def req(h, scheme="http"):
        return SimpleNamespace(headers=Headers(h), url=SimpleNamespace(scheme=scheme))

    # brauzerning Origin / Referer'i proksi aytganidan ustun
    assert AO._scheme(req({"host": "example.edu", "x-forwarded-proto": "http", "origin": "https://example.edu"})) == "https"
    assert AO._scheme(req({"host": "example.edu", "referer": "https://example.edu/docs/view?src=x"})) == "https"
    assert AO._scheme(req({"host": "example.edu", "cf-visitor": '{"scheme":"https"}'})) == "https"
    # boshqa domendan kelgan Origin hisobga olinmaydi
    assert AO._scheme(req({"host": "example.edu", "origin": "https://evil.example"})) == "http"
    assert AO._scheme(req({"host": "example.edu", "x-forwarded-proto": "https"})) == "https"
    assert AO._scheme(req({"host": "localhost:8000"})) == "http"
    assert AO._host(req({"host": "app:8000", "x-forwarded-host": "example.edu"})) == "example.edu"
    # tashqi proksining X-Forwarded-* sarlavhalari ikkinchi nusxa bo'lib ketmaydi
    h = AO._fwd_headers(Headers({"host": "example.edu", "x-forwarded-proto": "http", "x-forwarded-host": "app", "forwarded": "proto=http",
                                 "cookie": "s=1", "accept": "*/*"}), "example.edu", "https", "1.2.3.4")
    low = [k.lower() for k in h]
    assert low.count("x-forwarded-proto") == 1 and h["X-Forwarded-Proto"] == "https"
    assert low.count("x-forwarded-host") == 1 and h["X-Forwarded-Host"] == "example.edu/office-ds"
    assert "forwarded" not in low and "cookie" not in low and h["accept"] == "*/*"


def test_interactive_secure_mode_leaves_close_attempt(m, monkeypatch):
    """Himoyalangan rejim: sahifadan chiqish hisoblanadi, 3-chiqishda test yopiladi; nusxalash faqat jurnalga yoziladi."""
    from university import interactive as I

    tch, _ = login(m, "teacher", DEMO_PW)
    tpl = tch.get("/api/iq/template.xlsx").content
    qs = tch.post("/api/iq/import", files={"file": ("q.xlsx", tpl, XLSX)}).json()["questions"]
    t = tch.post("/api/iq/tests", json={"title": "Yakuniy nazorat", "questions": qs, "settings": {"time_limit": 20}}).json()
    assert t["settings"]["secure"] is True and t["settings"]["max_leaves"] == 3  # standart: yoqilgan, 3 marta
    tch.post(f"/api/iq/tests/{t['id']}/status", json={"status": "open"})
    s1, _ = login(m, "student", DEMO_PW)
    info = s1.get(f"/api/iq/t/{t['code']}").json()
    assert info["secure"] and info["max_leaves"] == 3
    att = s1.post(f"/api/iq/t/{t['code']}/start").json()
    assert att["secure"] and att["violations"] == 0
    v = lambda kind, **kw: s1.post(f"/api/iq/attempts/{att['id']}/violation", json={"kind": kind, **kw}).json()  # noqa: E731
    # bitta chiqishda brauzer blur + visibilitychange yuboradi — bitta deb sanaladi
    assert v("leave")["violations"] == 1
    assert v("leave")["violations"] == 1
    monkeypatch.setattr(I, "VIOLATION_GAP", 0)
    # nusxalash, o'ng tugma — bloklanadi va jurnalga yoziladi, lekin hisoblanmaydi; noma'lum tur e'tiborsiz
    assert v("copy")["violations"] == 1 and v("contextmenu")["violations"] == 1 and v("hack")["violations"] == 1
    r = v("leave")
    assert r["violations"] == 2 and not r["finished"]
    q0 = att["questions"][0]["id"]
    ans = {q0: att["questions"][0]["options"][0]["id"] if att["questions"][0]["options"] else "javob"}
    r = v("screenshot", answers=ans)  # 3-qoidabuzarlik — test yopiladi, oxirgi javob saqlanadi
    assert r["finished"] and r["closed_reason"] == "violations" and r["violations"] == 3 and r["answers"][q0] == ans[q0]
    assert s1.put(f"/api/iq/attempts/{att['id']}/answers", json={"answers": ans}).json()["detail"] == "already_finished"
    assert v("leave")["violations"] == 3  # yopilgandan keyin hisob o'zgarmaydi
    row = tch.get(f"/api/iq/tests/{t['id']}/results").json()["rows"][0]
    assert row["violations"] == 3 and row["closed_reason"] == "violations" and "copy" in row["events"] and "hack" not in row["events"]
    assert next(x for x in s1.get("/api/iq/my").json()["items"] if x["id"] == att["id"])["closed_reason"] == "violations"
    # boshqa talaba bu urinishga yoza olmaydi
    s2, _ = login(m, "student2", DEMO_PW)
    assert s2.post(f"/api/iq/attempts/{att['id']}/violation", json={"kind": "leave"}).status_code == 404
    # o'chirilgan rejim — hech narsa hisoblanmaydi
    t2 = tch.post("/api/iq/tests", json={"title": "Mashq", "questions": qs, "settings": {"secure": False, "max_leaves": 99}}).json()
    assert t2["settings"]["secure"] is False and t2["settings"]["max_leaves"] == 10
    tch.post(f"/api/iq/tests/{t2['id']}/status", json={"status": "open"})
    a2 = s2.post(f"/api/iq/t/{t2['code']}/start").json()
    assert not a2["secure"]
    for _ in range(4):
        r = s2.post(f"/api/iq/attempts/{a2['id']}/violation", json={"kind": "leave"}).json()
    assert r["violations"] == 0 and not r["finished"]
    # Bilimdon himoyalangan rejimga kirmaydi
    assert not I.secure_on({"settings": {"kind": "game", "secure": True}})


def test_interactive_access_groups_blocked_students(m):
    """Test kirishi: professor faqat o'z guruhlarini tanlaydi; bloklangan / boshqa guruh talabasi ko'rmaydi va kod bilan ham kira olmaydi."""
    from university import interactive as I

    st = m.svc().st
    tch, _ = login(m, "teacher", DEMO_PW)
    grp = {g["name"]: g["id"] for g in st.acad_list("groups")}
    g1 = grp["CS-25-1"]  # teacher darslari bor: student, student2, student3
    foreign = st.acad_save("groups", {"name": "XX-99-1", "course": 1})["id"]  # hech kimga biriktirilmagan
    st.create_user("student_xx", "Begona Talaba", DEMO_PW, role="student", email="sxx@example.edu", group_id=foreign)
    mine = tch.get("/api/iq/tests").json()["groups"]
    assert g1 in {g["id"] for g in mine} and foreign not in {g["id"] for g in mine}
    q = [{"type": "single", "text": "2+2?", "options": [{"id": "a", "text": "3"}, {"id": "b", "text": "4"}], "correct": ["b"]}]
    # begona guruh — 403 (yaratishda ham, tahrirda ham)
    r = tch.post("/api/iq/tests", json={"title": "Begona", "questions": q, "settings": {"access": "groups", "group_ids": [foreign]}})
    assert r.status_code == 403 and r.json()["detail"] == "group_not_assigned"
    t = tch.post("/api/iq/tests", json={"title": "Guruh testi", "questions": q, "settings": {"access": "groups", "group_ids": []}}).json()
    assert t["settings"]["access"] == "groups"
    assert tch.put(f"/api/iq/tests/{t['id']}", json={"settings": {"group_ids": [g1, foreign]}}).status_code == 403
    # guruh tanlanmagan «groups» rejimi — hech kimga ochilmagan
    tch.post(f"/api/iq/tests/{t['id']}/status", json={"status": "open"})
    s1, _ = login(m, "student", DEMO_PW)
    assert s1.get(f"/api/iq/t/{t['code']}").json()["detail"] == "not_allowed"
    assert t["code"] not in {x["code"] for x in s1.get("/api/iq/available").json()["items"]}
    # guruh + bitta talaba bloklangan
    ag = tch.get(f"/api/iq/access-groups?test={t['id']}").json()["items"]
    studs = {x["login"]: x["id"] for x in next(g for g in ag if g["id"] == g1)["students"]}
    assert {"student", "student2", "student3"} <= set(studs) and all("photo" in x for g in ag for x in g["students"])
    assert foreign not in {g["id"] for g in ag}
    t = tch.put(f"/api/iq/tests/{t['id']}", json={"settings": {"group_ids": [g1], "blocked_student_ids": [studs["student3"]]}}).json()
    assert t["settings"]["blocked_student_ids"] == [studs["student3"]]
    # ruxsat etilgan talaba — ro'yxatda darhol ko'radi va boshlaydi
    av = s1.get("/api/iq/available").json()["items"]
    assert any(x["code"] == t["code"] and x["attempts_left"] == 1 for x in av)
    a1 = s1.post(f"/api/iq/t/{t['code']}/start").json()
    assert a1["questions"]
    # bloklangan talaba — ko'rmaydi, kod bilan ham kira olmaydi
    s3, _ = login(m, "student3", DEMO_PW)
    assert t["code"] not in {x["code"] for x in s3.get("/api/iq/available").json()["items"]}
    assert s3.get(f"/api/iq/t/{t['code']}").status_code == 403
    assert s3.post(f"/api/iq/t/{t['code']}/start").json()["detail"] == "not_allowed"
    # boshqa (tanlanmagan) guruh talabasi — 403
    sx, _ = login(m, "student_xx", DEMO_PW)
    assert sx.post(f"/api/iq/t/{t['code']}/start").status_code == 403
    assert sx.get("/api/iq/available").json()["items"] == []
    # test davomida bloklash — javob va topshirish rad etiladi
    s2, _ = login(m, "student2", DEMO_PW)
    a2 = s2.post(f"/api/iq/t/{t['code']}/start").json()
    tch.put(f"/api/iq/tests/{t['id']}", json={"settings": {"blocked_student_ids": [studs["student3"], studs["student2"]]}})
    assert s2.put(f"/api/iq/attempts/{a2['id']}/answers", json={"answers": {"x": "b"}}).status_code == 403
    r = s2.post(f"/api/iq/attempts/{a2['id']}/submit", json={"answers": {}})
    assert r.status_code == 403 and r.json()["detail"] == "not_allowed"
    assert t["code"] not in {x["code"] for x in s2.get("/api/iq/my").json()["items"]}
    # ruxsat etilgan talaba topshiradi; natijalarda faqat ruxsat etilganlar, boshlamaganlar ro'yxati
    assert s1.post(f"/api/iq/attempts/{a1['id']}/submit", json={"answers": {a1['questions'][0]['id']: "b"}}).json()["finished"]
    res = tch.get(f"/api/iq/tests/{t['id']}/results").json()
    assert [r["user"]["login"] for r in res["rows"]] == ["student"]
    assert "student2" not in {p["login"] for p in res["pending"]} and "student3" not in {p["login"] for p in res["pending"]}
    # Bilimdon: o'yin testi kirish sozlamalari PIN bilan ham amal qiladi
    gm = tch.post("/api/iq/tests", json={"title": "Viktorina-2", "questions": q, "settings": {"kind": "game", "access": "code", "blocked_student_ids": [studs["student3"]]}}).json()
    pin = tch.post(f"/api/iq/tests/{gm['id']}/live").json()["pin"]
    assert s1.post(f"/api/iq/play/{pin}/join").json()["joined"]
    assert sx.post(f"/api/iq/play/{pin}/join").json()["joined"]  # kod orqali hamma
    assert s3.post(f"/api/iq/play/{pin}/join").status_code == 403
    assert s3.get(f"/api/iq/play/{pin}").json()["detail"] == "not_allowed"
    tch.put(f"/api/iq/tests/{gm['id']}", json={"settings": {"access": "groups", "group_ids": [g1]}})
    assert sx.post(f"/api/iq/play/{pin}/answer", json={"value": "b"}).status_code == 403
    # eski test (group_ids bo'sh, rejim yozilmagan) — «kod orqali hamma» rejimiga ko'chiriladi va ishlayveradi
    import json as _json

    lid = "legacy00test"
    with st._tx() as c:
        c.execute("INSERT INTO iq_tests(id, owner_id, title, description, questions, settings, status, code, created, updated) VALUES(%s,%s,%s,'',%s,%s,'open','lgcy22','2024-01-01','2024-01-01')",
                  (lid, st.find_user("teacher")["id"], "Eski test", _json.dumps([I.clean_question(q[0])]), _json.dumps({"group_ids": [], "time_limit": 0})))
    I.Store(st)  # ishga tushishdagi ko'chirish
    raw = _json.loads(st._q("SELECT settings FROM iq_tests WHERE id=%s", (lid,))[0]["settings"])
    assert raw["access"] == "code"
    assert sx.post("/api/iq/t/lgcy22/start").json()["questions"]
    assert "lgcy22" not in {x["code"] for x in s1.get("/api/iq/available").json()["items"]}  # kod orqali — ro'yxatga chiqmaydi


def test_tg_photo_sources(tmp_path):
    """Telegram posti uchun rasm: /media, boshqa domen bilan yozilgan /media, matndagi <img> — hammasi fayl sifatida yuklanadi."""
    from types import SimpleNamespace

    from university import tg_publish as P

    st = SimpleNamespace(media_dir=tmp_path, dir=tmp_path)
    (tmp_path / "0123456789abcdef.png").write_bytes(PNG)
    (tmp_path / "abcdef0123456789.png").write_bytes(PNG)
    ph = P.photo_of(st, None, {"feature_image": "/media/0123456789abcdef.png"})
    assert ph[0] == "file" and ph[3] == "image/png" and ph[2][:4] == b"\x89PNG"
    ph = P.photo_of(st, None, {"feature_image": "https://boshqa-domen.uz/media/0123456789abcdef.png?v=2"})
    assert ph[0] == "file" and ph[2][:4] == b"\x89PNG"
    ph = P.photo_of(st, None, {"feature_image": "", "html": '<p>Matn</p><img src="/media/0123456789abcdef.png" alt="">'})
    assert ph[0] == "file"
    # mavjud bo'lmagan asosiy rasm — keyingi nomzodga o'tadi
    ph = P.photo_of(st, None, {"feature_image": "/media/ffffffffffffffff.jpg", "gallery": [{"url": "/media/abcdef0123456789.png"}]})
    assert ph[0] == "file"
    assert P.photo_of(st, None, {"feature_image": ""}) is None
