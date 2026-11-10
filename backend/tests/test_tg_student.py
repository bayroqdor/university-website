"""Telegram bot — talaba kabineti: bog'lash (havola, kod, kontakt), menyular, bildirishnomalar, avtomatik xabarlar, sozlamalar."""
import importlib
import time
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

ADMIN_PW = "Admin-parol-123"
DEMO_PW = "demo2025"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
TZ = timezone(timedelta(hours=5))


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
    mailer.send = lambda *a, **k: None
    return main


_n = iter(range(1, 400))


def client(m):
    return TestClient(m.app, headers={"user-agent": UA, "x-forwarded-for": f"10.7.{next(_n) // 200}.{next(_n) % 200}"})


_sessions: dict = {}


def login(m, user, pw=DEMO_PW):
    if user in _sessions:
        return _sessions[user]
    c = client(m)
    adm = user == "admin"
    r = c.post("/api/admin/login" if adm else "/api/auth/login", json={"login": user, "password": pw})
    assert r.status_code == 200, r.text
    if adm:
        c.headers["x-admin-realm"] = "admin"
    _sessions[user] = c
    return c


def _now_monday():
    """Semestr ichidagi dushanba, 07:31 (Toshkent)."""
    base = date(datetime.now(TZ).year, 10, 5)
    d = base + timedelta(days=(7 - base.weekday()) % 7)
    return datetime(d.year, d.month, d.day, 7, 31, tzinfo=TZ)


class TG:
    """Bot + Telegram soxtasi (fake_tg.FakeTG): chatda foydalanuvchi ko'radigan xabarlar yuritiladi."""

    def __init__(self, m, monkeypatch):
        from fake_tg import FakeTG

        from university import telegram as T
        from university import tg_student as TS

        self.fake = FakeTG()
        self.sent = self.fake.sent  # sendMessage / editMessageText tanalari ("_m" — usul)
        monkeypatch.setattr(T, "TRANSPORT", self.fake.transport)
        monkeypatch.setattr(TS, "SYNC", True)
        self.now = _now_monday()
        monkeypatch.setattr(TS, "now", lambda: self.now)
        a = login(m, "admin", ADMIN_PW)
        r = a.put("/api/admin/telegram", json={"enabled": True, "token": "123456:" + "S" * 35, "mode": "polling"})
        assert r.status_code == 200, r.text
        from university.api.desk import bot

        self.b = bot()
        self.TS = TS
        self.st = m.svc().st
        self.n = iter(range(1, 100000))

    def msg(self, chat, text=None, typ="private", **extra):
        frm = {"id": chat, "first_name": f"U{chat}", "username": f"user{chat}"}
        if text is not None:
            extra["text"] = text
        mid = self.fake.user(chat, **extra)["id"] if typ == "private" else 1
        m = {"chat": {"id": chat, "type": typ}, "from": frm, "message_id": mid} | extra
        self.b.handle({"update_id": next(self.n), "message": m})
        return mid

    def btn(self, chat, data, typ="private", mid=None):
        """Tugma; standart holatda — chatdagi panelning tugmasi (mid=0 — xabarsiz callback)."""
        frm = {"id": chat, "first_name": f"U{chat}", "username": f"user{chat}"}
        msg = {"chat": {"id": chat, "type": typ}}
        mid = self.pid(chat) if mid is None else mid
        if mid:
            msg["message_id"] = mid
        self.b.handle({"update_id": next(self.n), "callback_query": {"id": "q", "from": frm, "data": data, "message": msg}})

    def pid(self, chat) -> int:
        return self.b.chat(str(chat))["panel"]

    def screen(self, chat) -> dict:
        """Panel — chatdagi botning jonli xabari (foydalanuvchi ko'radigani)."""
        p = self.fake.msg(chat, self.pid(chat))
        assert p, f"chat {chat}: panel xabari chatda yo'q"
        return p

    def last(self, chat):
        return next(x for x in reversed(self.sent) if str(x["chat_id"]) == str(chat))

    def to(self, chat):
        return [x for x in self.sent if str(x["chat_id"]) == str(chat)]

    @staticmethod
    def buttons(x):
        from fake_tg import FakeTG

        return FakeTG.buttons(x)

    def only(self, chat):
        """Faqat shu chat bog'langan qolsin (avtomatik xabarlar sonini tekshirish uchun)."""
        with self.st._tx() as c:
            c.execute("DELETE FROM tg_links WHERE chat_id<>%s", (str(chat),))

    def link(self, m, user, chat):
        """Kabinetdan havola → bot → tasdiqlash."""
        c = login(m, user)
        r = c.post("/api/portal/telegram/link").json()
        self.msg(chat, "/start link_" + r["url"].split("link_", 1)[1])
        self.btn(chat, "lk:ok")
        return r


def test_deeplink_confirm_and_reuse(m, monkeypatch):
    tg = TG(m, monkeypatch)
    s = login(m, "student")
    st0 = s.get("/api/portal/telegram").json()
    assert st0["bot"] == "site_test_bot" and st0["linked"] is None
    r = s.post("/api/portal/telegram/link").json()
    assert r["url"].startswith("https://t.me/site_test_bot?start=link_") and len(r["code"]) == 6 and r["code"].isdigit()
    assert r["qr"].startswith("<svg") and r["ttl"] == 600
    assert s.get("/api/portal/telegram").json()["pending"] is True
    tok = r["url"].split("link_", 1)[1]
    start = tg.msg(9001, "/start link_" + tok)
    x = tg.screen(9001)
    assert "Talaba Bir" in x["text"] and "CS-25-1" in x["text"] and "Tasdiqlaysizmi" in x["text"]
    assert tg.buttons(x) == ["lk:ok", "lk:no"]
    # /start (token bilan) xabari o'chirildi — chatda faqat panel
    assert (str(9001), start) in tg.fake.deleted and tg.fake.visible(9001) == [x]
    # bir martalik: shu havola boshqa chatda ham, qayta ham ishlamaydi; kod ham bekor bo'ladi (xato — panelda)
    tg.msg(9099, "/start link_" + tok)
    assert "eskirgan" in tg.screen(9099)["text"] and "login" in tg.buttons(tg.screen(9099))
    tg.btn(9099, "login:code")
    tg.msg(9099, r["code"])
    assert "noto‘g‘ri" in tg.screen(9099)["text"] and tg.fake.visible(9099) == [tg.screen(9099)]
    # tasdiqlash: o'sha panel tahrirlanadi — «ulandi» va talaba menyusi bitta xabarda
    pid = tg.pid(9001)
    k = len(tg.to(9001))
    tg.btn(9001, "lk:ok")
    home = tg.screen(9001)
    assert home["id"] == pid and [x["_m"] for x in tg.to(9001)[k:]] == ["editMessageText"]
    assert "ulandi" in home["text"] and "Talaba Bir" in home["text"]
    assert {"s:today", "s:day", "s:notif:0", "s:grades", "s:tests", "s:lib", "s:desk", "s:set"} <= set(tg.buttons(home))
    assert "https://site.example/forum" in tg.buttons(home)
    assert tg.fake.visible(9001) == [home]
    st1 = s.get("/api/portal/telegram").json()
    assert st1["linked"]["username"] == "user9001" and st1["linked"]["linked"] and st1["pending"] is False
    # muddati o'tgan havola rad etiladi
    r2 = login(m, "student2").post("/api/portal/telegram/link").json()
    with tg.st._tx() as c:
        c.execute("UPDATE tg_link_tokens SET expires='2000-01-01T00:00:00+00:00'")
    tg.msg(9002, "/start link_" + r2["url"].split("link_", 1)[1])
    assert "eskirgan" in tg.screen(9002)["text"]
    assert tg.TS.link_by_chat(tg.st, 9002) is None


def test_code_link_and_rate_limit(m, monkeypatch):
    tg = TG(m, monkeypatch)
    r = login(m, "student2").post("/api/portal/telegram/link").json()
    tg.msg(9020, "/start")
    assert "lang:uz" in tg.buttons(tg.screen(9020))
    pid = tg.pid(9020)
    tg.btn(9020, "lang:uz")
    assert "login" in tg.buttons(tg.screen(9020))
    tg.btn(9020, "login")
    assert {"login:code", "login:phone"} <= set(tg.buttons(tg.screen(9020)))
    tg.btn(9020, "login:code")
    wrong = "000000" if r["code"] != "000000" else "111111"
    for _ in range(5):
        mid = tg.msg(9020, wrong)
        assert "noto‘g‘ri" in tg.screen(9020)["text"] and (str(9020), mid) in tg.fake.deleted
    tg.msg(9020, r["code"])  # 6-urinish — chegarada, to'g'ri kod ham qabul qilinmaydi
    assert "Urinishlar ko‘p" in tg.screen(9020)["text"]
    assert tg.TS.link_by_chat(tg.st, 9020) is None
    # butun oqim bitta panel xabarida: til, menyu, kod so'rash, 6 ta xato — hammasi tahrir; kiritilgan kodlar o'chirilgan
    assert tg.pid(9020) == pid and [x["_m"] for x in tg.to(9020)].count("sendMessage") == 1
    assert tg.fake.visible(9020) == [tg.screen(9020)]
    # boshqa chat — darhol to'g'ri kod
    tg.btn(9021, "login:code")
    tg.msg(9021, r["code"][:3] + " " + r["code"][3:])
    x = tg.screen(9021)
    assert "Bekzod Toshmatov" in x["text"] and tg.buttons(x) == ["lk:ok", "lk:no"]
    tg.btn(9021, "lk:ok")
    assert tg.TS.link_by_chat(tg.st, 9021)["user_id"] == tg.st.find_user("student2")["id"]
    assert tg.fake.visible(9021) == [tg.screen(9021)]


def test_contact_link(m, monkeypatch):
    tg = TG(m, monkeypatch)
    s3 = login(m, "student3")
    assert s3.put("/api/portal/profile", json={"data": {"phone": "+998 (90) 111-22-33"}}).status_code == 200
    tg.msg(9030, "/start")
    tg.btn(9030, "lang:uz")
    tg.btn(9030, "login")
    pid = tg.pid(9030)
    tg.btn(9030, "login:phone")
    # panel «pastdagi tugmani bosing» holatiga tahrirlanadi; request_contact tugmasi — vaqtinchalik xabarda (reply klaviatura)
    assert tg.pid(9030) == pid and "Raqamni yuborish" in tg.screen(9030)["text"] and tg.buttons(tg.screen(9030)) == ["lk:no"]
    prompt = tg.fake.visible(9030)[-1]
    assert prompt["markup"]["keyboard"][0][0]["request_contact"] is True
    # boshqa odamning kontakti — rad etiladi (panelda); kontakt o'chiriladi, klaviatura qoladi
    c1 = tg.msg(9030, contact={"phone_number": "998901112233", "user_id": 5555})
    assert "o‘zingizning" in tg.screen(9030)["text"] and (str(9030), c1) in tg.fake.deleted
    assert tg.fake.visible(9030) == [tg.screen(9030), prompt]
    assert tg.TS.link_by_chat(tg.st, 9030) is None
    # profilda yo'q raqam: kontakt va vaqtinchalik xabar o'chiriladi, klaviatura yopiladi (remove_keyboard xabari darhol o'chiriladi)
    k = len(tg.sent)
    tg.msg(9030, contact={"phone_number": "+998 93 000 00 00", "user_id": 9030})
    assert "topilmadi" in tg.screen(9030)["text"] and tg.pid(9030) == pid
    rm = [x for x in tg.sent[k:] if x["_m"] == "sendMessage"]
    assert len(rm) == 1 and rm[0]["reply_markup"] == {"remove_keyboard": True}
    assert tg.fake.visible(9030) == [tg.screen(9030)]
    # klaviaturadagi «Bekor qilish» (matn) — ham tozalanadi
    tg.btn(9030, "login:phone")
    tg.msg(9030, "Bekor qilish")
    assert "Bekor qilindi" in tg.screen(9030)["text"] and tg.fake.visible(9030) == [tg.screen(9030)] and tg.b.chat("9030")["state"] == ""
    # inline «Bekor qilish» (panelda) — vaqtinchalik xabar ham o'chadi
    tg.btn(9030, "login:phone")
    tg.btn(9030, "lk:no")
    assert tg.fake.visible(9030) == [tg.screen(9030)] and "login" in tg.buttons(tg.screen(9030))
    tg.btn(9030, "login:phone")
    tg.msg(9030, contact={"phone_number": "998901112233", "user_id": 9030})
    x = tg.screen(9030)
    assert "Madina Yusupova" in x["text"] and tg.buttons(x) == ["lk:ok", "lk:no"] and tg.pid(9030) == pid
    assert tg.fake.visible(9030) == [x]
    tg.btn(9030, "lk:ok")
    assert tg.TS.link_by_chat(tg.st, 9030)["user_id"] == tg.st.find_user("student3")["id"]
    assert tg.fake.visible(9030) == [tg.screen(9030)] and "ulandi" in tg.screen(9030)["text"]


def test_menus_for_linked_student(m, monkeypatch):
    tg = TG(m, monkeypatch)
    st = tg.st
    tg.link(m, "student", 9001)  # (qayta) ulash
    s = login(m, "student")
    u = st.find_user("student")
    today = tg.now.date()
    # kalendar rejasi bugunga
    assert s.post("/api/portal/calendar", json={"title": "Kutubxonaga borish", "start": today.isoformat(), "time_from": "14:00", "time_to": "15:00"}).status_code == 200
    pid, k = tg.pid(9001), len(tg.to(9001))
    tg.btn(9001, "s:today")
    x = tg.screen(9001)
    assert tg.last(9001)["_m"] == "editMessageText" and tg.last(9001)["message_id"] == pid == x["id"]
    assert "Bugun" in x["text"] and "Dasturlash asoslari" in x["text"] and "Lab-1" in x["text"] and "Kutubxonaga borish" in x["text"] and "14:00–15:00" in x["text"]
    # kun ko'rinishi va navigatsiya
    tg.btn(9001, f"s:day:{today}")
    x = tg.screen(9001)
    assert {f"s:day:{today - timedelta(days=1)}", f"s:day:{today + timedelta(days=1)}", f"s:week:{today}"} <= set(tg.buttons(x))
    tg.btn(9001, f"s:day:{today + timedelta(days=1)}")
    x = tg.screen(9001)
    assert "Seshanba" in x["text"] and "Umumiy fizika" in x["text"] and "Falsafa" in x["text"] and "Dasturlash" not in x["text"]
    tg.btn(9001, f"s:week:{today}")
    x = tg.screen(9001)
    assert "Du, " in x["text"] and "Se, " in x["text"] and "Ingliz tili" in x["text"] and "hafta" in x["text"]
    assert f"s:week:{today + timedelta(days=7)}" in tg.buttons(x) and f"s:day:{today}" in tg.buttons(x)
    # baholar va davomat
    sem = st.current_semester()
    subj = next(x for x in st.acad_list("subjects") if x["name"] == "Dasturlash asoslari")
    st.add_grade({"student_id": u["id"], "subject_id": subj["id"], "semester_id": sem["id"], "score": 43, "max": 50}, "t")
    les = next(l for l in st.lessons(semester_id=sem["id"], group_id=u["group_id"]) if l["subject_id"] == subj["id"])
    st.set_attendance(les["id"], (today - timedelta(days=7)).isoformat(), [{"student_id": u["id"], "status": "present"}], "t")
    st.set_attendance(les["id"], (today - timedelta(days=14)).isoformat(), [{"student_id": u["id"], "status": "absent"}], "t")
    tg.btn(9001, "s:grades")
    x = tg.screen(9001)
    assert "Baholar va davomat" in x["text"] and "Dasturlash asoslari" in x["text"] and "86%" in x["text"] and "50%" in x["text"] and "GPA" in x["text"]
    # testlar: faqat ruxsat etilgani
    tch = login(m, "teacher")
    grp = {g["name"]: g["id"] for g in st.acad_list("groups")}
    q = [{"type": "single", "text": "2+2?", "options": [{"id": "a", "text": "3"}, {"id": "b", "text": "4"}], "correct": ["b"]}]
    t1 = tch.post("/api/iq/tests", json={"title": "Dasturlash nazorati", "questions": q, "settings": {"access": "groups", "group_ids": [grp["CS-25-1"]], "time_limit": 15}}).json()
    tch.post(f"/api/iq/tests/{t1['id']}/status", json={"status": "open"})
    t2 = tch.post("/api/iq/tests", json={"title": "Boshqa guruh testi", "questions": q, "settings": {"access": "groups", "group_ids": [grp["EC-26-1"]]}})
    if t2.status_code == 200:
        tch.post(f"/api/iq/tests/{t2.json()['id']}/status", json={"status": "open"})
    tg.btn(9001, "s:tests")
    x = tg.screen(9001)
    assert "Dasturlash nazorati" in x["text"] and "Boshqa guruh testi" not in x["text"] and "15 daqiqa" in x["text"] and "saytda" in x["text"]
    assert f"https://site.example/t/{t1['code']}" in tg.buttons(x)
    # kutubxona
    tg.btn(9001, "s:lib")
    assert "Kutubxona" in tg.screen(9001)["text"]
    from university.api.library import lib

    lib()
    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with st._tx() as c:
        c.execute("INSERT INTO lib_books(id, title, created, updated) VALUES('bk1','Kimyo asoslari',%s,%s)", (now_iso, now_iso))
        c.execute("INSERT INTO lib_copies(id, book_id, inv, status, created, updated) VALUES('cp1','bk1','INV-1','loaned',%s,%s)", (now_iso, now_iso))
        c.execute("INSERT INTO lib_loans(id, copy_id, book_id, user_id, issued, due) VALUES('ln1','cp1','bk1',%s,%s,%s)", (u["id"], now_iso, "2099-01-15"))
    tg.btn(9001, "s:lib")
    x = tg.screen(9001)
    assert "Kimyo asoslari" in x["text"] and "15.01" in x["text"]
    # bildirishnomalar (sahifalash)
    for i in range(7):
        st.personal_notice(u["id"], f"Xabar {i}", "matn", push=False)
    tg.btn(9001, "s:notif:0")
    p0 = tg.screen(9001)
    assert p0["text"].count("Xabar ") == 4 and "s:notif:1" in tg.buttons(p0) and "https://site.example/student/notices" in tg.buttons(p0)
    tg.btn(9001, "s:notif:1")
    p1 = tg.screen(9001)
    assert p1["text"].count("Xabar ") == 3 and "s:notif:0" in tg.buttons(p1) and "s:notif:2" not in tg.buttons(p1)
    # murojaat bo'limi: ism kabinetdan, telefon so'raladi (profilda yo'q)
    tg.btn(9001, "s:desk")
    assert {"new", "mine", "contacts", "s:home"} <= set(tg.buttons(tg.screen(9001)))
    tg.btn(9001, "new")
    assert "Telefon" in tg.screen(9001)["text"]
    assert tg.b.chat("9001")["data"]["name"] == "Talaba Bir"
    # noto'g'ri telefon — xato panelda; kiritish o'chiriladi
    bad = tg.msg(9001, "telefon")
    assert "noto‘g‘ri" in tg.screen(9001)["text"] and "Telefon" in tg.screen(9001)["text"] and (str(9001), bad) in tg.fake.deleted
    tg.btn(9001, "cancel")
    assert tg.fake.toasts[-1].get("text") == "Bekor qilindi." and "s:today" in tg.buttons(tg.screen(9001))
    # barcha navigatsiya (bo'limlar, sahifalash, xato) — bitta panelni tahrirlash: yangi xabar yo'q, chatda faqat panel
    assert tg.pid(9001) == pid and [x["_m"] for x in tg.to(9001)[k:]].count("sendMessage") == 0
    assert tg.fake.visible(9001) == [tg.screen(9001)]


def test_notice_push_and_group_privacy(m, monkeypatch):
    tg = TG(m, monkeypatch)
    st = tg.st
    tg.link(m, "student", 9001)
    u = st.find_user("student")
    k, pid = len(tg.sent), tg.pid(9001)
    st.personal_notice(u["id"], "Forumda javob", "Ali yozuvingizga javob yozdi", kind="blog_comment", link="/forum/abc")
    x = tg.last(9001)
    assert len(tg.sent) == k + 1 and x["_m"] == "sendMessage" and "Forumda javob" in x["text"] and "https://site.example/forum/abc" in tg.buttons(x)
    # bildirishnoma — yangi xabar (panel o'zgarmaydi, chatda qoladi: panel + bildirishnoma)
    assert tg.pid(9001) == pid and [b["text"] for b in tg.fake.visible(9001)][-1] == x["text"] and len(tg.fake.visible(9001)) == 2
    # guruhga yuborilgan bildirishnoma — guruhdagi bog'langan talabalarga (student2 — 9021 boshqa testda ulangan bo'lishi mumkin)
    a = login(m, "admin", ADMIN_PW)
    grp = {g["name"]: g["id"] for g in st.acad_list("groups")}
    k = len(tg.sent)
    assert a.post("/api/admin/notices/send", json={"target": "group", "group_id": grp["CS-25-1"], "title": "Guruh yig‘ilishi", "body": "Soat 15:00 da"}).status_code == 200
    assert any("Guruh yig‘ilishi" in x["text"] and str(x["chat_id"]) == "9001" for x in tg.sent[k:])
    # IQ-26-1 guruhiga — 9001 ga bormaydi
    k = len(tg.sent)
    a.post("/api/admin/notices/send", json={"target": "group", "group_id": grp["IQ-26-1"], "title": "Boshqa guruh", "body": "x"})
    assert not any(str(x["chat_id"]) == "9001" for x in tg.sent[k:])
    # kutubxona inapp bildirishnomasi push=False — qaytarilmaydi (Telegram kanal alohida)
    k = len(tg.sent)
    st.personal_notice(u["id"], "📚 Kitob", "x", push=False)
    assert len(tg.sent) == k
    # guruh chatida: talaba ma'lumotlari hech qachon ko'rsatilmaydi
    k = len(tg.sent)
    tg.btn(-100500, "s:today", typ="group")
    tg.btn(9001, "s:today", typ="supergroup")
    tg.msg(-100500, "/start", typ="group")
    r = login(m, "student").post("/api/portal/telegram/link").json()
    tg.msg(-100500, "/start link_" + r["url"].split("link_", 1)[1], typ="group")
    assert len(tg.sent) == k
    assert tg.TS.send(st, -100500, "x") is None and len(tg.sent) == k


def test_relink_and_unlink(m, monkeypatch):
    tg = TG(m, monkeypatch)
    st = tg.st
    tg.link(m, "student", 9001)
    k = len(tg.sent)
    tg.link(m, "student", 9010)  # yangi akkaunt — eskisi uziladi va xabar oladi
    old = [x for x in tg.sent[k:] if str(x["chat_id"]) == "9001"]
    assert old and "uzildi" in old[-1]["text"] and "Talaba Bir" in old[-1]["text"]
    assert tg.TS.link_by_chat(st, 9001) is None and tg.TS.link_by_chat(st, 9010)["user_id"] == st.find_user("student")["id"]
    # eski chat endi ommaviy menyuni ko'radi
    tg.btn(9001, "s:today")
    x = tg.screen(9001)
    assert "Laboratoriya" not in x["text"] and "virtual qabulxona" in x["text"] and "login" in tg.buttons(x)
    # kutubxona kanali ham shu chatga
    from university.api.library import lib

    p = lib().prefs(st.find_user("student")["id"])
    assert p["tg_chat"] == "9010" and "telegram" in p["channels"]
    # kabinetdan uzish
    s = login(m, "student")
    k = len(tg.sent)
    assert s.delete("/api/portal/telegram").json()["linked"] is None
    assert any(str(x["chat_id"]) == "9010" and "uzildi" in x["text"] for x in tg.sent[k:])
    assert s.get("/api/portal/telegram").json()["linked"] is None and lib().prefs(st.find_user("student")["id"])["tg_chat"] is None
    # botdan uzish
    tg.link(m, "student", 9010)
    tg.btn(9010, "s:set")
    assert "s:unlink" in tg.buttons(tg.screen(9010))
    tg.btn(9010, "s:unlink")
    tg.btn(9010, "s:unlink:yes")
    assert "uzildi" in tg.screen(9010)["text"] and tg.TS.link_of(st, st.find_user("student")["id"]) is None


def test_settings_and_scheduled_messages(m, monkeypatch):
    tg = TG(m, monkeypatch)
    st, TS = tg.st, tg.TS
    tg.link(m, "student", 9001)
    tg.only(9001)
    u = st.find_user("student")
    with st._tx() as c:
        c.execute("DELETE FROM tg_sent WHERE key LIKE 'am:%%' OR key LIKE 'pm:%%' OR key LIKE 'rm:%%'")
    day = tg.now.date()
    # ertalabki xulosa: 07:31 da bir marta (07:30 standart)
    k, pid = len(tg.sent), tg.pid(9001)
    assert TS.tick(st, tg.now)["morning"] == 1
    x = tg.last(9001)
    assert x["_m"] == "sendMessage" and "Xayrli tong" in x["text"] and "Dasturlash asoslari" in x["text"]
    assert TS.tick(st, tg.now + timedelta(minutes=1))["morning"] == 0
    assert len([y for y in tg.sent[k:] if "Xayrli tong" in y["text"]]) == 1
    # xulosa — yangi xabar (bildirishnoma), panel joyida qoladi
    digest = tg.fake.bot_msgs(9001)[-1]
    assert "Xayrli tong" in digest["text"] and tg.pid(9001) == pid and tg.fake.msg(9001, pid)
    # xulosadagi «Dars jadvali» bosilsa: xulosa o'zgarmaydi, panel uning ostiga ko'chadi (eskisi o'chiriladi) — chatda yana bitta panel
    tg.btn(9001, f"s:day:{day}", mid=digest["id"])
    assert tg.fake.msg(9001, digest["id"])["text"] == digest["text"] and not tg.fake.msg(9001, pid)
    assert tg.pid(9001) > digest["id"] and [b["id"] for b in tg.fake.visible(9001)] == [digest["id"], tg.pid(9001)]
    assert "◀️" in str(tg.screen(9001)["markup"]) and "Dasturlash asoslari" in tg.screen(9001)["text"]
    # kechki xulosa standart o'chirilgan
    assert TS.tick(st, tg.now.replace(hour=20, minute=1))["evening"] == 0
    # sozlamalar: kechki yoqiladi, vaqt 08:00, eslatma yoqiladi
    pid = tg.pid(9001)
    tg.btn(9001, "s:set")
    x = tg.screen(9001)
    assert x["id"] == pid and "Ertalabki xabar: yoqilgan · 07:30" in x["text"] and "Kechki xabar (ertangi kun): o‘chirilgan" in x["text"]
    tg.btn(9001, "s:set:evening")
    assert "Kechki xabar (ertangi kun): yoqilgan" in tg.screen(9001)["text"]
    tg.btn(9001, "s:set:time")
    assert "s:mt:0800" in tg.buttons(tg.screen(9001))
    tg.btn(9001, "s:mt:0800")
    assert "07:30" not in tg.screen(9001)["text"] and "08:00" in tg.screen(9001)["text"]
    tg.btn(9001, "s:set:remind")
    ln = TS.link_of(st, u["id"])
    assert ln["evening"] and ln["remind"] and ln["morning_time"] == "08:00"
    assert tg.pid(9001) == pid and [b["id"] for b in tg.fake.visible(9001)] == [digest["id"], pid]  # sozlamalar — o'sha panelda
    # kechki: ertaga (seshanba) darslari, bir marta
    assert TS.tick(st, tg.now.replace(hour=20, minute=1))["evening"] == 1
    assert "Ertaga" in tg.last(9001)["text"] and "Mikrobiologiya" in tg.last(9001)["text"]
    assert TS.tick(st, tg.now.replace(hour=20, minute=2))["evening"] == 0
    # eslatma: dars boshlanishidan 10 daqiqa ichida, bir marta
    sem = st.current_semester()
    first = st.week_schedule(sem, day, group_id=u["group_id"])["days"][0]["lessons"][0]
    h, mi = (int(v) for v in first["slot_start"].split(":"))
    at = datetime(day.year, day.month, day.day, h, mi, tzinfo=TZ) - timedelta(minutes=5)
    assert TS.tick(st, at)["remind"] == 1
    assert "10 daqiqadan" in tg.last(9001)["text"] and first["subject"] in tg.last(9001)["text"]
    assert TS.tick(st, at + timedelta(minutes=1))["remind"] == 0
    # ertalabki xulosa — keyingi kuni 08:00 dan
    nxt = tg.now + timedelta(days=1)
    assert TS.tick(st, nxt.replace(hour=7, minute=45))["morning"] == 0
    assert TS.tick(st, nxt.replace(hour=8, minute=0))["morning"] == 1
    # dars ham, reja ham yo'q kuni (yakshanba) — yuborilmaydi
    sun = tg.now + timedelta(days=6)
    assert TS.tick(st, sun.replace(hour=8, minute=5))["morning"] == 0
    # til: ruscha
    tg.btn(9001, "s:set:lang")
    tg.btn(9001, "s:lang:ru")
    assert "Настройки" in tg.screen(9001)["text"]
    tg.btn(9001, "s:today")
    assert "Сегодня" in tg.screen(9001)["text"] and "Лабораторная" in tg.screen(9001)["text"]
    tg.btn(9001, "s:lang:uz")


def test_new_test_and_schedule_change_push(m, monkeypatch):
    tg = TG(m, monkeypatch)
    st, TS = tg.st, tg.TS
    tg.link(m, "student", 9001)
    tg.only(9001)
    tch = login(m, "teacher")
    grp = {g["name"]: g["id"] for g in st.acad_list("groups")}
    q = [{"type": "single", "text": "1+1?", "options": [{"id": "a", "text": "2"}, {"id": "b", "text": "3"}], "correct": ["a"]}]
    t = tch.post("/api/iq/tests", json={"title": "Yangi nazorat", "questions": q, "settings": {"access": "groups", "group_ids": [grp["CS-25-1"]]}}).json()
    tch.post(f"/api/iq/tests/{t['id']}/status", json={"status": "open"})
    late = tg.now.replace(hour=12, minute=0)
    assert TS.tick(st, late)["tests"] >= 1
    x = next(y for y in reversed(tg.sent) if "Yangi nazorat" in y["text"])
    assert str(x["chat_id"]) == "9001" and f"https://site.example/t/{t['code']}" in tg.buttons(x)
    assert TS.tick(st, late + timedelta(minutes=1))["tests"] == 0
    # dars jadvali o'zgarishi: ertangi darsni bekor qilish → guruhdagi bog'langan talabaga darhol
    a = login(m, "admin", ADMIN_PW)
    sem = st.current_semester()
    tomorrow = tg.now.date() + timedelta(days=1)
    les = next(l for l in st.lessons(semester_id=sem["id"], group_id=grp["CS-25-1"]) if l["weekday"] == tomorrow.weekday())
    k = len(tg.sent)
    assert a.post("/api/admin/changes", json={"lesson_id": les["id"], "date": tomorrow.isoformat(), "kind": "cancel"}).status_code == 200
    ch = [y for y in tg.sent[k:] if str(y["chat_id"]) == "9001"]
    assert ch and "Dars jadvali o‘zgardi" in ch[-1]["text"] and les["subject"] in ch[-1]["text"] and "bekor qilindi" in ch[-1]["text"]
    # yangi dars qo'shildi (shu hafta, bo'sh juftlik)
    slots = st.acad_list("time_slots")
    subj = next(x for x in st.acad_list("subjects") if x["name"] == "Falsafa")
    k = len(tg.sent)
    r = a.post("/api/admin/lessons", json={"semester_id": sem["id"], "group_id": grp["CS-25-1"], "subject_id": subj["id"], "weekday": 5, "slot_id": slots[4]["id"], "type": "seminar"})
    assert r.status_code == 200, r.text
    ch = [y for y in tg.sent[k:] if str(y["chat_id"]) == "9001"]
    assert ch and "Falsafa" in ch[-1]["text"] and "qo‘shildi" in ch[-1]["text"]
    # boshqa guruh o'zgarishi — bu talabaga bormaydi
    k = len(tg.sent)
    other = next(l for l in st.lessons(semester_id=sem["id"], group_id=grp["IQ-26-1"]))
    a.post("/api/admin/changes", json={"lesson_id": other["id"], "date": tomorrow.isoformat(), "kind": "cancel"})
    assert not any(str(y["chat_id"]) == "9001" for y in tg.sent[k:])


def test_unlinked_public_menu(m, monkeypatch):
    tg = TG(m, monkeypatch)
    tg.msg(9100, "/start")
    assert "lang:uz" in tg.buttons(tg.screen(9100))
    tg.btn(9100, "lang:ru")
    x = tg.screen(9100)
    assert "виртуальная приёмная" in x["text"] and {"new", "mine", "contacts", "login"} <= set(tg.buttons(x))
    tg.btn(9100, "s:grades")  # bog'lanmagan — talaba bo'limi ochilmaydi
    x = tg.screen(9100)
    assert "Оценки" not in x["text"] and "login" in tg.buttons(x)
    tg.btn(9100, "new")
    assert tg.screen(9100)["text"].startswith("1/6 ·")
    tg.btn(9100, "cancel")
    time.sleep(0)


def test_library_link_migration(m, monkeypatch):
    """Avvalgi kutubxona ulanishi (lib_prefs.tg_chat — shu bot) umumiy bog'lanishga bir marta ko'chiriladi; eski `lib_` havola ham tasdiqlash orqali ishlaydi."""
    tg = TG(m, monkeypatch)
    st, TS = tg.st, tg.TS
    from university.api.library import lib

    u4, u5 = st.find_user("student4"), st.find_user("student5")
    with st._tx() as c:
        c.execute("DELETE FROM tg_links WHERE user_id IN (%s,%s)", (u4["id"], u5["id"]))
        c.execute("INSERT INTO lib_prefs(user_id, channels, tg_chat, updated) VALUES(%s,'[\"inapp\",\"telegram\"]','9400','x') ON CONFLICT(user_id) DO UPDATE SET tg_chat='9400'", (u4["id"],))
    st.kv_put("tg_links_migrated", None)
    TS._SCHEMA.discard(id(st))
    TS.ensure_schema(st)
    assert TS.link_of(st, u4["id"])["chat_id"] == "9400"
    TS.unlink(st, u4["id"])
    TS._SCHEMA.discard(id(st))
    TS.ensure_schema(st)  # qayta ishga tushganda uzilgan ulanish qaytib kelmaydi
    assert TS.link_of(st, u4["id"]) is None and lib().prefs(u4["id"])["tg_chat"] is None
    # eski kutubxona havolasi (lib_<token>) — tasdiqlash so'raladi
    tok = lib().tg_link_token(u5["id"])
    tg.msg(9401, "/start lib_" + tok)
    assert "Nilufar Abdullayeva" in tg.screen(9401)["text"] and "IQ-26-1" in tg.screen(9401)["text"]
    tg.btn(9401, "lk:ok")
    assert TS.link_of(st, u5["id"])["chat_id"] == "9401" and lib().prefs(u5["id"])["tg_chat"] == "9401"
    # kutubxona «Telegram'ni ulash» endi umumiy havola beradi
    r = login(m, "student5").post("/api/lib/prefs/telegram").json()
    assert "?start=link_" in r["url"]


def test_panel_commands_fallback_and_free_text(m, monkeypatch):
    """Yagona panel: /menu — eski panel o'rniga pastda yangisi; panel yo'qolgan bo'lsa — yangisi yuboriladi; o'zgarmagan ekran — jim."""
    tg = TG(m, monkeypatch)
    tg.msg(9200, "/start")
    tg.btn(9200, "lang:uz")
    p1 = tg.pid(9200)
    cmd = tg.msg(9200, "/menu")
    assert tg.pid(9200) != p1 and not tg.fake.msg(9200, p1) and (str(9200), cmd) in tg.fake.deleted
    assert tg.fake.visible(9200) == [tg.screen(9200)] and "virtual qabulxona" in tg.screen(9200)["text"]
    # panel chatda yo'q (foydalanuvchi o'chirgan / juda eski): tahrir xatosi → yangi panel yuboriladi va eslab qolinadi
    p2 = tg.pid(9200)
    tg.fake.chats["9200"].clear()
    tg.btn(9200, "contacts")
    assert tg.pid(9200) not in (0, p2) and "📍" in tg.screen(9200)["text"] and tg.buttons(tg.screen(9200)) == ["menu"]
    # o'zgarmagan ekran («message is not modified») — xatosiz, yangi xabar yo'q
    k = len(tg.sent)
    tg.btn(9200, "contacts")
    assert len(tg.sent) == k and len(tg.fake.visible(9200)) == 1
    # ochiq murojaat yo'q — erkin matn o'chiriladi, panel menyuni ko'rsatadi
    t = tg.msg(9200, "salom")
    assert (str(9200), t) in tg.fake.deleted and tg.fake.visible(9200) == [tg.screen(9200)] and "new" in tg.buttons(tg.screen(9200))
    # stiker va boshqa keraksiz xabarlar ham chatda qolmaydi
    st_ = tg.msg(9200, sticker={"file_id": "S1"})
    assert (str(9200), st_) in tg.fake.deleted and len(tg.fake.visible(9200)) == 1
