"""Kabinet ilovalari: ichki blog (faqat tizimga kirganlar, muallif ma'lumotlari, izohlar va ularni yopish), kalendar, eslatmalar."""
import importlib
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

ADMIN_PW = "Admin-parol-123"
DEMO_PW = "demo2025"


@pytest.fixture(scope="module")
def m(tmp_path_factory):
    import os

    static = tmp_path_factory.mktemp("static")
    (static / "index.html").write_text('<!doctype html><html lang="uz"><head><title>x</title></head><body><div id="root"></div></body></html>', encoding="utf-8")
    os.environ["SITE_DATA_DIR"] = str(tmp_path_factory.mktemp("data"))
    os.environ["SITE_STATIC_DIR"] = str(static)
    os.environ["SITE_ADMIN_PASSWORD"] = ADMIN_PW
    os.environ["SITE_DEMO_PASSWORD"] = DEMO_PW
    os.environ["SITE_PREWARM"] = "0"
    import university.api.deps as deps
    import university.api.main as main

    importlib.reload(main)
    deps.reset_service()
    return main


_n = iter(range(1, 400))


def client(m):
    return TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126", "x-forwarded-for": f"10.55.{next(_n) % 200}.{next(_n) % 200}"})


def login(m, user, pw=DEMO_PW, panel=False):
    c = client(m)
    r = c.post("/api/admin/login" if panel else "/api/auth/login", json={"login": user, "password": pw})
    assert r.status_code == 200, r.text
    if panel:
        c.headers["x-admin-realm"] = "admin"
    return c


def test_blog_internal_and_author_card(m):
    assert client(m).get("/api/portal/blog").status_code == 401  # faqat tizimga kirganlar
    s = login(m, "student")
    r = s.post("/api/portal/blog", json={"title": "Laboratoriyadagi birinchi kunim", "body": "<p>Salom <b>hammaga</b>!</p><script>alert(1)</script>", "tags": ["Talabalik", "lab"]})
    assert r.status_code == 200, r.text
    p = r.json()
    assert "<script" not in p["body"] and "<b>hammaga</b>" in p["body"]
    a = p["author"]
    assert a["role"] == "student" and a["name"] and a["group"]  # guruh va kafedra ko'rinadi
    t = login(m, "teacher")
    r = t.post("/api/portal/blog", json={"title": "Oziq-ovqat xavfsizligi bo'yicha maslahatlar", "body": "Har kuni gigiyena."})
    tp = r.json()
    assert tp["author"]["role"] == "teacher"
    lst = s.get("/api/portal/blog").json()
    assert {x["id"] for x in lst["items"]} >= {p["id"], tp["id"]} and ["talabalik", 1] in lst["tags"]
    assert s.get("/api/portal/blog", params={"tag": "lab"}).json()["items"][0]["id"] == p["id"]
    # boshqa foydalanuvchi tahrirlay olmaydi
    assert t.put(f"/api/portal/blog/{p['id']}", json={"title": "x", "body": "y"}).status_code == 404
    # izoh va yoqtirish
    c = t.post(f"/api/portal/blog/{p['id']}/comments", json={"body": "Ajoyib!"}).json()
    assert c["author"]["role"] == "teacher"
    assert t.post(f"/api/portal/blog/{p['id']}/like").json() == {"liked": True, "likes": 1}
    d = s.get(f"/api/portal/blog/{p['id']}").json()
    assert d["comments"] == 1 and d["comment_list"][0]["body"] == "Ajoyib!" and d["mine"] and d["views"] >= 1
    # muallif o'z yozuvidagi izohni o'chira oladi
    assert s.delete(f"/api/portal/blog/comments/{c['id']}").status_code == 200


def test_blog_admin_moderation(m):
    s = login(m, "student")
    p = s.post("/api/portal/blog", json={"title": "Moderatsiya sinovi", "body": "Matn"}).json()
    adm = login(m, "admin", ADMIN_PW, panel=True)
    # bitta yozuvda izohlarni yopish — muallif qayta ocha olmaydi
    assert adm.put(f"/api/admin/blog/{p['id']}", json={"comments_locked": True}).json()["comments_locked"] is True
    s.put(f"/api/portal/blog/{p['id']}", json={"title": "Moderatsiya sinovi", "body": "Matn", "comments_enabled": True})
    assert s.post(f"/api/portal/blog/{p['id']}/comments", json={"body": "salom"}).status_code == 403
    adm.put(f"/api/admin/blog/{p['id']}", json={"comments_locked": False})
    cid = s.post(f"/api/portal/blog/{p['id']}/comments", json={"body": "salom"}).json()["id"]
    # izohni yashirish
    adm.put(f"/api/admin/blog/comments/{cid}", json={"hidden": True})
    assert s.get(f"/api/portal/blog/{p['id']}").json()["comment_list"] == []
    assert adm.get(f"/api/admin/blog/{p['id']}").json()["comment_list"][0]["hidden"] is True
    # izohlarni umuman o'chirib qo'yish
    assert adm.put("/api/admin/blog/settings", json={"comments": False}).json()["comments"] is False
    assert s.post(f"/api/portal/blog/{p['id']}/comments", json={"body": "yana"}).status_code == 403
    adm.put("/api/admin/blog/settings", json={"comments": True})
    # yozuvni yashirish: boshqalar ko'rmaydi, muallif ko'radi
    adm.put(f"/api/admin/blog/{p['id']}", json={"status": "hidden"})
    t = login(m, "teacher")
    assert t.get(f"/api/portal/blog/{p['id']}").status_code == 404
    assert s.get(f"/api/portal/blog/{p['id']}").status_code == 200
    st = adm.get("/api/admin/blog").json()
    assert st["stats"]["hidden"] >= 1 and adm.get("/api/admin/blog/comments").json()["items"]
    assert adm.delete(f"/api/admin/blog/{p['id']}").status_code == 200
    # admin sessiyasi kabinet blogiga kira olmaydi (alohida soha)
    assert client(m).get("/api/portal/blog").status_code == 401


def test_calendar_and_notes(m):
    s = login(m, "student")
    today = date.today()
    e = s.post("/api/portal/calendar", json={"title": "Kurs ishi topshirish", "start": today.isoformat(), "kind": "exam", "time_from": "14:00", "time_to": "12:00"}).json()
    assert e["end"] == e["start"] and (e["time_from"], e["time_to"]) == ("12:00", "14:00")
    assert s.post("/api/portal/calendar", json={"title": "", "start": today.isoformat()}).status_code == 400
    r = s.get("/api/portal/calendar", params={"start": (today - timedelta(days=3)).isoformat(), "end": (today + timedelta(days=30)).isoformat()}).json()
    assert [x["id"] for x in r["events"]] == [e["id"]] and isinstance(r["lessons"], list) and r["lessons"]
    assert s.put(f"/api/portal/calendar/{e['id']}", json={**e, "done": True}).json()["done"] is True
    t = login(m, "teacher")
    assert t.delete(f"/api/portal/calendar/{e['id']}").status_code == 404  # boshqaning hodisasi
    assert s.delete(f"/api/portal/calendar/{e['id']}").status_code == 200
    n = s.post("/api/portal/notes", json={"title": "Kitoblar", "body": "Biokimyo 2-qism", "category": "study"}).json()
    assert n["category"] == "study"
    assert s.post("/api/portal/notes", json={"title": "", "body": ""}).status_code == 400
    s.put(f"/api/portal/notes/{n['id']}", json={**n, "pinned": True})
    assert s.get("/api/portal/notes").json()["items"][0]["pinned"] is True
    assert t.get("/api/portal/notes").json()["items"] == []
    assert s.delete(f"/api/portal/notes/{n['id']}").status_code == 200


def test_blog_rich_editor_doc_and_authors(m):
    """Blog muharriri — admin panelidagi boy matn (Tiptap JSON): xavfli tugun va havolalar tozalanadi; boshqa mualliflar bloglari ko'rinadi."""
    s = login(m, "student")
    t = login(m, "teacher")
    doc = {"type": "doc", "content": [
        {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Laboratoriya"}]},
        {"type": "paragraph", "content": [{"type": "text", "text": "havola", "marks": [{"type": "link", "attrs": {"href": "javascript:alert(1)"}}]},
                                          {"type": "text", "text": " qalin", "marks": [{"type": "bold"}]}]},
        {"type": "script", "content": [{"type": "text", "text": "x"}]},
        {"type": "figure", "attrs": {"src": "javascript:alert(2)"}},
        {"type": "figure", "attrs": {"src": "/media/rasm.jpg", "width": "normal"}},
        {"type": "youtube", "attrs": {"src": "https://evil.example/x"}},
    ]}
    p = s.post("/api/portal/blog", json={"title": "Boy matnli yozuv", "body": "<p>havola qalin</p><script>x</script>", "doc": doc}).json()
    full = t.get(f"/api/portal/blog/{p['id']}").json()
    types = [n["type"] for n in full["doc"]["content"]]
    assert types == ["heading", "paragraph", "figure"]
    assert "marks" not in full["doc"]["content"][1]["content"][0]  # javascript: havola olib tashlandi
    assert "<script" not in full["body"] and full["excerpt"].startswith("Laboratoriya")
    # boshqa muallif (o'qituvchi) talabaning yozuvini va mualliflar ro'yxatini ko'radi
    lst = t.get("/api/portal/blog").json()
    assert any(x["id"] == p["id"] for x in lst["items"])
    me = s.get("/api/portal/blog?mine=1").json()["me"]
    assert any(a["id"] == me["id"] and a["posts"] >= 1 for a in lst["authors"])
    by_author = t.get(f"/api/portal/blog?author={me['id']}").json()
    assert by_author["author"]["id"] == me["id"] and all(x["author"]["id"] == me["id"] for x in by_author["items"])


def test_forum_listing_fields(m):
    """Forum ko'rinishi: oxirgi javob, ishtirokchilar, tartiblash, umumiy hisob va mavzudagi har muallif xabarlari soni."""
    s, t = login(m, "student"), login(m, "teacher")
    pid = s.post("/api/portal/blog", json={"title": "Forum: kutubxona ish vaqti", "body": "<p>Shanba kuni ochiqmi?</p>", "tags": ["kutubxona"]}).json()["id"]
    assert t.post(f"/api/portal/blog/{pid}/comments", json={"body": "> savol\nHa, 9:00 dan 15:00 gacha."}).status_code == 200
    d = s.get("/api/portal/blog", params={"sort": "activity"}).json()
    top = d["items"][0] if not d["items"][0]["pinned"] else next(x for x in d["items"] if x["id"] == pid)
    it = next(x for x in d["items"] if x["id"] == pid)
    assert it["last_author"]["role"] == "teacher" and it["last_at"] >= it["created"]
    assert [a["role"] for a in it["participants"]][:2] == ["student", "teacher"]
    assert d["stats"]["topics"] >= 1 and d["stats"]["replies"] >= 1 and top
    assert s.get("/api/portal/blog", params={"sort": "top"}).status_code == 200
    full = s.get(f"/api/portal/blog/{pid}").json()
    assert all(v >= 1 for v in full["activity"].values()) and len(full["activity"]) == 2


def _notes(c, kind=None, ref=None):
    d = c.get("/api/portal/notifications").json()
    return [n for n in d["items"] if (kind is None or n["kind"] == kind) and (ref is None or n["ref"] == ref)]


def test_forum_like_notification_once_not_self(m):
    """Yoqtirish — mavzu muallifiga bitta bildirishnoma: o'zi yoqtirsa yoki yoqtirish → bekor → yana yoqtirish — qayta yuborilmaydi."""
    s, t = login(m, "student"), login(m, "teacher")
    pid = s.post("/api/portal/blog", json={"title": "Yoqtirish sinovi", "body": "<p>Matn</p>"}).json()["id"]
    assert s.post(f"/api/portal/blog/{pid}/like").json()["liked"] is True  # o'z yozuvi — bildirishnoma yo'q
    assert _notes(s, "blog_like", pid) == []
    s.post(f"/api/portal/blog/{pid}/like")
    assert t.post(f"/api/portal/blog/{pid}/like").json()["liked"] is True
    got = _notes(s, "blog_like", pid)
    assert len(got) == 1
    n = got[0]
    assert n["link"] == f"/forum/{pid}" and n["meta"]["post"] == "Yoqtirish sinovi" and n["meta"]["actor"] and n["seen"] is False
    assert t.post(f"/api/portal/blog/{pid}/like").json()["liked"] is False  # bekor qilish — bildirishnoma emas
    assert t.post(f"/api/portal/blog/{pid}/like").json()["liked"] is True  # qayta yoqtirish — takror yuborilmaydi
    assert len(_notes(s, "blog_like", pid)) == 1
    # o'qituvchining «yuborgan e'lonlari» ro'yxatiga forum bildirishnomasi tushmaydi
    assert all(x.get("kind") is None for x in t.get("/api/teacher/notices").json()["items"])
    # o'qildi deb belgilash: faqat o'ziniki
    assert t.post("/api/portal/notifications/seen", json={"ids": [n["id"]]}).json()["updated"] == 0
    before = s.get("/api/portal/notifications").json()["unread"]
    assert s.post("/api/portal/notifications/seen", json={"ids": [n["id"]]}).json()["updated"] == 1
    assert s.get("/api/portal/notifications").json()["unread"] == before - 1
    # bildirishnomalar sahifasida (tarix) ham bor, bosh sahifadagi «so'nggi e'lonlar»da — yo'q
    assert any(x["id"] == n["id"] for x in s.get("/api/portal/notices").json()["items"])
    assert all(x.get("kind") is None for x in s.get("/api/portal/today").json()["notices"])


def test_forum_comment_and_quote_notifications(m):
    s, t = login(m, "student"), login(m, "teacher")
    pid = s.post("/api/portal/blog", json={"title": "Iqtibos sinovi", "body": "<p>Savol</p>"}).json()["id"]
    # o'z mavzusiga javob — bildirishnoma yo'q
    own = s.post(f"/api/portal/blog/{pid}/comments", json={"body": "Qo'shimcha: kim biladi?"}).json()
    assert _notes(s, ref=pid) == []
    # o'qituvchi javob yozdi — muallifga «javob yozdi», izoh langari bilan
    r = t.post(f"/api/portal/blog/{pid}/comments", json={"body": "Men bilaman."}).json()
    got = _notes(s, "blog_comment", pid)
    assert len(got) == 1 and got[0]["link"] == f"/forum/{pid}#c-{r['id']}" and got[0]["body"] == "Men bilaman."
    # talaba o'qituvchining javobidan iqtibos keltirdi — o'qituvchiga «iqtibos keltirdi»
    q = s.post(f"/api/portal/blog/{pid}/comments", json={"body": "> Teacher yozdi:\n> Men bilaman.\n\nRahmat!", "quote_ids": [r["id"]]}).json()
    assert q["quote_id"] == r["id"]
    tq = _notes(t, "blog_quote", pid)
    assert len(tq) == 1 and tq[0]["link"].endswith(f"#c-{q['id']}") and tq[0]["body"] == "Rahmat!"
    # o'qituvchi talabaning birinchi xabaridan (mavzudan) iqtibos keltirdi — talabaga bitta «iqtibos» (alohida «javob yozdi» emas)
    n0, c0 = len(_notes(s, ref=pid)), len(_notes(s, "blog_comment", pid))
    t.post(f"/api/portal/blog/{pid}/comments", json={"body": "> Student yozdi:\n> Savol\n\nJavob", "quote_id": pid})
    assert len(_notes(s, ref=pid)) == n0 + 1 and len(_notes(s, "blog_comment", pid)) == c0 and len(_notes(s, "blog_quote", pid)) == 1
    # talabaning o'z izohidan iqtibos — talabaga «iqtibos» (mavzu muallifi ham u) — bitta
    t.post(f"/api/portal/blog/{pid}/comments", json={"body": "> x\nOk", "quote_ids": [own["id"]]})
    assert len(_notes(s, ref=pid)) == n0 + 2
    # iqtibos matni o'chirilgan yoki boshqa mavzudagi izoh — iqtibos hisoblanmaydi
    ro = t.post("/api/portal/blog", json={"title": "Boshqa mavzu", "body": "<p>Boshqa savol</p>"})
    assert ro.status_code == 200, ro.text
    other = ro.json()["id"]
    c2 = t.post(f"/api/portal/blog/{other}/comments", json={"body": "Faqat matn", "quote_ids": [r["id"]]}).json()
    assert c2["quote_id"] is None
    # mavzu o'chirilsa — unga oid bildirishnomalar ham o'chadi
    s.delete(f"/api/portal/blog/{pid}")
    assert _notes(s, ref=pid) == [] and _notes(t, ref=pid) == []


def test_forum_share_url_private(m):
    """Ulashiladigan havola /forum/<id>: API faqat tizimga kirganlarga, sahifa qidiruvga kiritilmaydi va mazmuni server HTMLida yo'q."""
    s = login(m, "teacher")
    pid = s.post("/api/portal/blog", json={"title": "Maxfiy forum mavzusi XYZ", "body": "<p>Ichki matn QWERTY</p>"}).json()["id"]
    anon = client(m)
    assert anon.get(f"/api/portal/blog/{pid}").status_code == 401
    assert anon.post(f"/api/portal/blog/{pid}/like").status_code == 401
    assert anon.get("/api/portal/notifications").status_code == 401
    html = anon.get(f"/forum/{pid}", headers={"user-agent": "Googlebot/2.1"}).text
    assert 'name="robots" content="noindex' in html and "QWERTY" not in html and "XYZ" not in html
    assert "Disallow: /forum" in anon.get("/robots.txt").text
    assert anon.get("/api/meta", params={"path": f"/forum/{pid}"}).json()["noindex"] is True
