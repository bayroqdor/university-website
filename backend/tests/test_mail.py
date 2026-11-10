"""Veb-pochta testlari: haqiqiy IMAP server (pymap) va SMTP (aiosmtpd) bilan; Stalwart boshqaruv API — soxta JMAP bilan."""
import importlib
import io
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from email import message_from_bytes, policy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

pymap_bin = shutil.which("pymap") or str(Path(sys.executable).with_name("pymap"))
aiosmtpd = pytest.importorskip("aiosmtpd.controller")
if not Path(pymap_bin).exists():
    pytest.skip("pymap o'rnatilmagan (pip install -r requirements-dev.txt)", allow_module_level=True)

ADMIN_PW = "Admin-parol-123"
DEMO_PW = "demo2025"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
RECEIVED: list[dict] = []
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63e0f789f90f0002dc01b7e9d63d0a0000000049454e44ae426082"
)


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


@pytest.fixture(scope="module")
def imap_port():
    port = _free_port()
    proc = subprocess.Popen([pymap_bin, "--port", str(port), "--no-tls", "dict", "--demo-data"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try:
            socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
            break
        except OSError:
            time.sleep(0.1)
    import imaplib

    c = imaplib.IMAP4("127.0.0.1", port)
    c.login("demouser", "demopass")
    assert c.rename("Trash", "Demo-arxiv")[0] == "OK"  # pymap namunasidagi «Trash» faqat o'qish uchun — haqiqiy serverlarda bunday emas
    c.logout()
    yield port
    proc.terminate()
    proc.wait(5)


@pytest.fixture(scope="module")
def smtp_port():
    from aiosmtpd.controller import Controller

    class H:
        async def handle_DATA(self, server, session, envelope):
            RECEIVED.append({"from": envelope.mail_from, "rcpt": list(envelope.rcpt_tos), "data": envelope.content})
            return "250 OK"

    port = _free_port()
    c = Controller(H(), hostname="127.0.0.1", port=port)
    c.start()
    yield port
    c.stop()


@pytest.fixture(scope="module")
def m(tmp_path_factory, imap_port, smtp_port):
    static = tmp_path_factory.mktemp("static")
    (static / "index.html").write_text("<!doctype html><html><body><div id=root></div></body></html>", encoding="utf-8")
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


def client(m):
    return TestClient(m.app, headers={"user-agent": UA, "x-forwarded-for": f"10.7.{time.time_ns() % 200}.{time.time_ns() % 199}"})


def login(m, user, pw, admin=False):
    c = client(m)
    r = c.post("/api/admin/login" if admin else "/api/auth/login", json={"login": user, "password": pw})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture(scope="module")
def setup(m, imap_port, smtp_port):
    a = login(m, "admin", ADMIN_PW, admin=True)
    assert client(m).get("/api/mail/status").status_code == 401
    r = a.put("/api/admin/mail", json={
        "enabled": True, "domain": "example.edu", "imap_host": "127.0.0.1", "imap_port": imap_port, "imap_security": "none",
        "smtp_host": "127.0.0.1", "smtp_port": smtp_port, "smtp_security": "none",
        "login_format": "{local}", "master_password": "demopass", "provision": "none",
    })
    assert r.status_code == 200, r.text
    cfg = r.json()["config"]
    assert cfg["has_master_password"] and "master_password" not in cfg
    # pymap demo foydalanuvchisi — «demouser» loginli o'qituvchi
    r = a.post("/api/admin/users", json={"role": "teacher", "login": "demouser", "name": "Demo O'qituvchi", "password": "Demo-parol-1"})
    assert r.status_code == 200, r.text
    return {"admin": a, "t": login(m, "demouser", "Demo-parol-1")}


def test_status_and_folders(m, setup):
    t = setup["t"]
    st = t.get("/api/mail/status").json()
    assert st["enabled"] and st["address"] == "demouser@example.edu" and st["groups"] is True
    folders = t.get("/api/mail/folders").json()["items"]
    roles = {f["role"]: f for f in folders if f["role"]}
    assert set(roles) >= {"inbox", "sent", "drafts", "trash", "junk", "archive"}
    assert roles["inbox"]["total"] == 4 and roles["inbox"]["unread"] >= 1
    assert [f["role"] for f in folders][:6] == ["inbox", "drafts", "sent", "archive", "junk", "trash"]


def test_list_read_search(m, setup):
    t = setup["t"]
    r = t.get("/api/mail/messages", params={"folder": "INBOX"}).json()
    assert r["total"] == 4 and r["items"][0]["subject"] == "Hello, World!"
    first = r["items"][0]
    assert first["from"]["email"] == "friend@example.com" and not first["seen"]
    msg = t.get("/api/mail/message", params={"folder": "INBOX", "uid": first["uid"]}).json()
    assert msg["subject"] == "Hello, World!" and "<script" not in msg["html"]
    again = t.get("/api/mail/messages", params={"folder": "INBOX"}).json()["items"][0]
    assert again["seen"] is True
    assert t.get("/api/mail/messages", params={"folder": "INBOX", "q": "airspeed"}).json()["total"] == 1
    assert t.get("/api/mail/messages", params={"folder": "INBOX", "unread": 1}).json()["total"] < 4
    assert t.get("/api/mail/message", params={"folder": "INBOX", "uid": 99999}).status_code == 404


def test_send_with_attachment_and_group(m, setup):
    t = setup["t"]
    RECEIVED.clear()
    payload = {"to": [{"name": "Talaba", "email": "student@example.edu"}], "cc": [{"email": "group:" + _group_id(setup)}], "bcc": ["boss@example.com"],
               "subject": "Uy vazifasi", "html": "<p>Salom, <b>talabalar</b>!</p><script>alert(1)</script>"}
    r = t.post("/api/mail/send", data={"payload": json.dumps(payload)}, files=[("files", ("vazifa.txt", io.BytesIO(b"1-masala"), "text/plain"))])
    assert r.status_code == 200, r.text
    assert r.json()["recipients"] >= 3
    assert len(RECEIVED) == 1
    got = RECEIVED[0]
    assert got["from"] == "demouser@example.edu" and "boss@example.com" in got["rcpt"] and "student2@example.edu" in got["rcpt"]
    em = message_from_bytes(got["data"], policy=policy.default)
    assert em["Bcc"] is None and em["Subject"] == "Uy vazifasi"
    assert "alert" not in em.get_body(("html",)).get_content()
    assert [p.get_filename() for p in em.iter_attachments()] == ["vazifa.txt"]
    # «Yuborilgan» papkasiga nusxa (Bcc bilan)
    folders = {f["role"]: f["path"] for f in t.get("/api/mail/folders").json()["items"] if f["role"]}
    sent = t.get("/api/mail/messages", params={"folder": folders["sent"]}).json()["items"]
    top = next(x for x in sent if x["subject"] == "Uy vazifasi")
    assert top["attach"] is True and top["seen"] is True
    full = t.get("/api/mail/message", params={"folder": folders["sent"], "uid": top["uid"]}).json()
    assert full["bcc"][0]["email"] == "boss@example.com"
    att = full["attachments"][0]
    r = t.get("/api/mail/attachment", params={"folder": folders["sent"], "uid": top["uid"], "part": att["part"]})
    assert r.status_code == 200 and r.content == b"1-masala" and "attachment" in r.headers["content-disposition"]
    # noto'g'ri manzil
    bad = t.post("/api/mail/send", data={"payload": json.dumps({"to": ["yaroqsiz"], "subject": "x"})})
    assert bad.status_code == 400
    assert t.post("/api/mail/send", data={"payload": json.dumps({"subject": "x"})}).json()["detail"] == "no_recipients"


def _group_id(setup) -> str:
    return next(g["id"] for g in setup["admin"].get("/api/admin/acad/groups").json()["items"] if g["name"] == "CS-25-1")


def test_reply_forward_and_drafts(m, setup):
    t = setup["t"]
    RECEIVED.clear()
    folders = {f["role"]: f["path"] for f in t.get("/api/mail/folders").json()["items"] if f["role"]}
    d = t.post("/api/mail/draft", data={"payload": json.dumps({"to": ["friend@example.com"], "subject": "Qoralama", "html": "<p>yarim</p>"})}).json()
    assert d["folder"] == folders["drafts"] and d["uid"]
    drafts = t.get("/api/mail/messages", params={"folder": folders["drafts"]}).json()
    assert drafts["total"] == 1 and drafts["items"][0]["draft"] is True
    # qoralamani yangilash — eski nusxa o'chadi
    d2 = t.post("/api/mail/draft", data={"payload": json.dumps({"to": ["friend@example.com"], "subject": "Qoralama 2", "html": "<p>to'liq</p>", "draft_uid": d["uid"]})}).json()
    assert t.get("/api/mail/messages", params={"folder": folders["drafts"]}).json()["total"] == 1
    inbox = t.get("/api/mail/messages", params={"folder": "INBOX"}).json()["items"]
    orig = next(x for x in inbox if x["subject"] == "Random question")
    full = t.get("/api/mail/message", params={"folder": "INBOX", "uid": orig["uid"]}).json()
    r = t.post("/api/mail/send", data={"payload": json.dumps({
        "to": ["friend@example.com"], "subject": "Re: Random question", "html": "<p>Javob</p>", "in_reply_to": full["message_id"] or "<x@y>",
        "reply_to_msg": {"folder": "INBOX", "uid": orig["uid"]}, "mode": "reply", "draft_uid": d2["uid"],
    })})
    assert r.status_code == 200, r.text
    em = message_from_bytes(RECEIVED[-1]["data"], policy=policy.default)
    assert em["In-Reply-To"]
    assert t.get("/api/mail/messages", params={"folder": folders["drafts"]}).json()["total"] == 0
    assert next(x for x in t.get("/api/mail/messages", params={"folder": "INBOX"}).json()["items"] if x["uid"] == orig["uid"])["answered"] is True


def test_actions_and_folders(m, setup):
    t = setup["t"]
    folders = {f["role"]: f["path"] for f in t.get("/api/mail/folders").json()["items"] if f["role"]}
    inbox = t.get("/api/mail/messages", params={"folder": "INBOX"}).json()["items"]
    one = {"folder": "INBOX", "uid": inbox[-1]["uid"]}
    n_star = t.get("/api/mail/messages", params={"folder": "@starred"}).json()["total"]
    assert t.post("/api/mail/action", json={"action": "flag", "items": [one]}).status_code == 200
    starred = t.get("/api/mail/messages", params={"folder": "@starred"}).json()
    assert starred["total"] == n_star + 1 and any(x["uid"] == one["uid"] and x["folder"] == "INBOX" and x["flagged"] for x in starred["items"])
    assert t.post("/api/mail/action", json={"action": "unread", "items": [one]}).status_code == 200
    # spam → spam papkasi → qaytarish
    t.post("/api/mail/action", json={"action": "spam", "items": [one]})
    junk = t.get("/api/mail/messages", params={"folder": folders["junk"]}).json()["items"]
    assert len(junk) == 1
    t.post("/api/mail/action", json={"action": "notspam", "items": [{"folder": folders["junk"], "uid": junk[0]["uid"]}]})
    assert t.get("/api/mail/messages", params={"folder": folders["junk"]}).json()["total"] == 0
    # o'chirish: avval savatga, savatdan — butunlay
    inbox = t.get("/api/mail/messages", params={"folder": "INBOX"}).json()["items"]
    n_trash = t.get("/api/mail/messages", params={"folder": folders["trash"]}).json()["total"]
    r = t.post("/api/mail/action", json={"action": "delete", "items": [{"folder": "INBOX", "uid": inbox[0]["uid"]}]})
    assert r.status_code == 200, r.text
    r = r.json()
    assert r["result"] == "trashed"
    assert t.get("/api/mail/messages", params={"folder": folders["trash"]}).json()["total"] == n_trash + 1
    assert t.post("/api/mail/empty", json={"folder": "INBOX"}).status_code == 400
    assert t.post("/api/mail/empty", json={"folder": folders["trash"]}).json()["removed"] == n_trash + 1
    # o'z papkalari
    p = t.post("/api/mail/folders", json={"name": "Kafedra ishlari"}).json()["path"]
    assert t.post("/api/mail/folders", json={"name": "Kafedra ishlari"}).status_code == 400
    p2 = t.put("/api/mail/folders", json={"path": p, "name": "Kafedra"}).json()["path"]
    inbox = t.get("/api/mail/messages", params={"folder": "INBOX"}).json()["items"]
    t.post("/api/mail/action", json={"action": "move", "dest": p2, "items": [{"folder": "INBOX", "uid": inbox[0]["uid"]}]})
    assert t.get("/api/mail/messages", params={"folder": p2}).json()["total"] == 1
    assert t.put("/api/mail/folders", json={"path": folders["sent"], "name": "x"}).status_code == 400
    assert t.delete("/api/mail/folders", params={"path": p2}).status_code == 200
    t.post("/api/mail/read-all", json={"folder": "INBOX"})
    assert t.get("/api/mail/messages", params={"folder": "INBOX", "unread": 1}).json()["total"] == 0


def test_contacts_scope(m, setup):
    t = setup["t"]
    items = t.get("/api/mail/contacts", params={"q": "OT-25"}).json()["items"]
    assert any(x["type"] == "group" for x in items)
    s = login(m, "student", DEMO_PW)
    st_items = s.get("/api/mail/contacts", params={"q": "a"}).json()["items"]
    assert not any(x["type"] == "group" for x in st_items)
    assert s.get("/api/mail/status").json()["groups"] is False
    r = s.post("/api/mail/send", data={"payload": json.dumps({"to": [{"email": "group:" + _group_id(setup)}], "subject": "spam"})})
    assert r.status_code == 403


def test_admin_test_and_disabled(m, setup):
    a = setup["admin"]
    checks = {c["name"]: c for c in a.post("/api/admin/mail/test").json()["checks"]}
    assert checks["SMTP"]["ok"] is True and "IMAP" in checks
    assert login(m, "student", DEMO_PW).get("/api/admin/mail").status_code in (401, 403)
    a.put("/api/admin/mail", json={"enabled": False})
    assert setup["t"].get("/api/mail/status").json() == {"enabled": False}
    assert setup["t"].get("/api/mail/folders").status_code == 503
    a.put("/api/admin/mail", json={"enabled": True})


# ------------------------------------------------------------------ murojaatlar (service desk): pochta orqali javob va javobning chiptaga qaytishi
def test_service_desk_email_flow(m, setup, imap_port):
    import imaplib
    from email.message import EmailMessage

    a = setup["admin"]
    cats = a.get("/api/admin/desk/categories").json()["items"]
    assert [c["mailbox"] for c in cats][:2] == ["info@example.edu", "qabul@example.edu"]
    # pymap test serverida bitta quti bor — «Qabul» bo'limi shu manzildan yozadi
    cats[0]["mailbox"] = "demouser@example.edu"
    cats = a.put("/api/admin/desk/categories", json={"items": cats}).json()["items"]
    r = client(m).post("/api/contact", json={"name": "Aziz Karimov", "email": "aziz@example.com", "phone": "+998901112233", "subject": "Grant haqida", "message": "Grant bo‘yicha savolim bor."}).json()
    board = a.get("/api/admin/desk").json()
    t = next(x for x in board["tickets"] if x["number"] == r["ticket"])
    assert t["category"]["mailbox"] == "demouser@example.edu" and t["stage"] == "new" and board["counts"]["new"] >= 1
    tid = t["id"]
    # «Boshlash» — mas'ul bo'ladi, «Jarayonda» (murojaatchiga holat xati yuborilmaydi); javob pochta orqali, bo'lim manzilidan
    RECEIVED.clear()
    d = a.post(f"/api/admin/desk/tickets/{tid}/start").json()
    assert d["ticket"]["stage"] == "in_progress" and d["ticket"]["assignee"]["name"] == "Administrator"
    assert RECEIVED == []
    # operator javobi (ilova bilan) — «Jarayonda»da bosqich o'zgarmaydi; fayl xatga biriktiriladi va yozishmada ko'rinadi
    d = a.post(f"/api/admin/desk/tickets/{tid}/reply", data={"body": "Assalomu alaykum! Grant 1-iyungacha.", "from_addr": "demouser@example.edu"},
               files=[("files", ("nizom.pdf", b"%PDF-1.4 test", "application/pdf"))]).json()
    assert d["ticket"]["stage"] == "in_progress" and d["ticket"]["first_response_at"] and len(RECEIVED) == 1
    assert [e["kind"] for e in d["events"]][-1] == "message_out"
    assert RECEIVED[-1]["rcpt"] == ["aziz@example.com"] and RECEIVED[-1]["from"] == "demouser@example.edu"
    out = message_from_bytes(RECEIVED[-1]["data"], policy=policy.default)
    assert f"[UNI-{t['number']}]" in out["Subject"]
    att = [p for p in out.iter_attachments()]
    assert [p.get_filename() for p in att] == ["nizom.pdf"] and att[0].get_payload(decode=True) == b"%PDF-1.4 test"
    mo = [e for e in d["events"] if e["kind"] == "message_out"][-1]
    assert mo["meta"]["files"][0]["name"] == "nizom.pdf" and mo["meta"]["files"][0]["kind"] == "file"
    r = a.get(mo["meta"]["files"][0]["url"])
    assert r.status_code == 200 and r.content == b"%PDF-1.4 test" and r.headers["x-content-type-options"] == "nosniff"
    assert client(m).get(mo["meta"]["files"][0]["url"]).status_code == 401
    # boshqa administrator (mas'ul emas) javob yoza olmaydi
    a.post("/api/admin/admins", json={"login": "operator", "name": "Operator", "password": "Operator-123", "role_id": "study"})
    roles = a.get("/api/admin/roles").json()["items"]
    roles = [x | {"perms": [*x["perms"], "messages"]} if x["id"] == "study" else x for x in roles]
    a.put("/api/admin/roles", json={"items": roles})
    op = TestClient(m.app, headers={"user-agent": UA, "x-forwarded-for": "10.7.1.77"})
    assert op.post("/api/admin/login", json={"login": "operator", "password": "Operator-123"}).status_code == 200
    assert op.post(f"/api/admin/desk/tickets/{tid}/reply", data={"body": "x"}).json()["detail"] == "not_assignee"
    assert op.post(f"/api/admin/desk/tickets/{tid}/start").json()["detail"] == "already_assigned"
    # murojaatchi javob qaytaradi + yangi xat (mavzusiz belgi) — yangi chipta
    c = imaplib.IMAP4("127.0.0.1", imap_port)
    c.login("demouser", "demopass")
    for subj, ref in ((out["Subject"].replace("Re: ", "Re: Re: ", 1), out["Message-ID"]), ("Yotoqxona haqida", "")):
        em = EmailMessage()
        em["From"] = "Aziz Karimov <aziz@example.com>"
        em["To"] = "demouser@example.edu"
        em["Subject"] = subj
        em["Message-ID"] = f"<{subj.__hash__()}@example.com>"
        if ref:
            em["In-Reply-To"] = ref
        em.set_content("Rahmat, tushunarli.\n\n> eski matn")
        if ref:
            em.add_attachment(PNG, maintype="image", subtype="png", filename="skrin.png")
        c.append("INBOX", None, imaplib.Time2Internaldate(time.time()), em.as_bytes())
    c.logout()
    res = a.post("/api/admin/desk/poll").json()
    assert res["reply"] == 1 and res["new"] == 1, res
    d = a.get(f"/api/admin/desk/tickets/{tid}").json()
    inc = [e for e in d["events"] if e["kind"] == "message_in"]
    assert inc and inc[-1]["content"] == "Rahmat, tushunarli." and d["ticket"]["stage"] == "in_progress"
    # kiruvchi xat ilovasi saqlangan va ochiladi (rasm — brauzerda)
    f = inc[-1]["meta"]["files"][0]
    assert f["name"] == "skrin.png" and f["kind"] == "image" and f["size"] == len(PNG)
    r = a.get(f["url"])
    assert r.status_code == 200 and r.content == PNG and r.headers["content-type"] == "image/png" and "sandbox" in r.headers["content-security-policy"]
    assert any(x["title"] == "Yotoqxona haqida" and x["source"] == "email" for x in a.get("/api/admin/desk").json()["tickets"])
    # ichki izoh, rad etish faqat sabab bilan, hal qilish
    assert a.post(f"/api/admin/desk/tickets/{tid}/note", json={"content": "Grant bo‘limiga yuborildi"}).status_code == 200
    assert a.post(f"/api/admin/desk/tickets/{tid}/move", json={"stage": "failed"}).json()["detail"] == "reason_required"
    # bosqich o'zgarishi (izoh bilan) — murojaatchiga xat: yangi holat + izoh
    RECEIVED.clear()
    d = a.post(f"/api/admin/desk/tickets/{tid}/move", json={"stage": "waiting", "reason": "Pasport nusxasini yuboring"}).json()
    assert d["ticket"]["stage"] == "waiting"
    note = message_from_bytes(RECEIVED[-1]["data"], policy=policy.default)
    txt = note.get_body(preferencelist=("plain",)).get_content()
    assert RECEIVED[-1]["rcpt"] == ["aziz@example.com"] and "Javob kutilmoqda" in txt and "Pasport nusxasini yuboring" in txt
    assert f"[UNI-{t['number']}]" in note["Subject"] and note["In-Reply-To"]
    tr = [e for e in d["events"] if e["kind"] == "transition"][-1]
    assert tr["meta"]["notified"] == ["email"] and tr["content"] == "Pasport nusxasini yuboring"
    # «Javob kutilmoqda»dagi murojaatga operator javobi — «Jarayonda»ga o'tadi (hodisa), murojaatchiga faqat javob xati
    RECEIVED.clear()
    d = a.post(f"/api/admin/desk/tickets/{tid}/reply", data={"body": "Pasport nusxasini oldik.", "from_addr": "demouser@example.edu"}).json()
    assert d["ticket"]["stage"] == "in_progress" and len(RECEIVED) == 1
    txt = message_from_bytes(RECEIVED[-1]["data"], policy=policy.default).get_body(preferencelist=("plain",)).get_content()
    assert "Pasport nusxasini oldik." in txt and "holati" not in txt
    tr = d["events"][-1]
    assert tr["kind"] == "transition" and (tr["meta"]["from"], tr["meta"]["to"], tr["meta"]["via"]) == ("waiting", "in_progress", "reply")
    # «Yangi»ga qaytarish — holat xati; «Jarayonda»ga izohsiz (sudrab / holat tanlash) — xat yo'q; izoh bilan — faqat izoh (oddiy javob xati)
    RECEIVED.clear()
    a.post(f"/api/admin/desk/tickets/{tid}/move", json={"stage": "new"})
    assert len(RECEIVED) == 1 and "Yangi" in message_from_bytes(RECEIVED[-1]["data"], policy=policy.default).get_body(preferencelist=("plain",)).get_content()
    RECEIVED.clear()
    d = a.post(f"/api/admin/desk/tickets/{tid}/move", json={"stage": "in_progress"}).json()
    assert d["ticket"]["stage"] == "in_progress" and RECEIVED == []
    a.post(f"/api/admin/desk/tickets/{tid}/move", json={"stage": "new"})
    RECEIVED.clear()
    d = a.post(f"/api/admin/desk/tickets/{tid}/move", json={"stage": "in_progress", "reason": "Arizangiz grant bo‘limida ko‘rib chiqilmoqda."}).json()
    assert len(RECEIVED) == 1
    plain = message_from_bytes(RECEIVED[-1]["data"], policy=policy.default)
    txt = plain.get_body(preferencelist=("plain",)).get_content()
    assert txt.strip() == "Arizangiz grant bo‘limida ko‘rib chiqilmoqda." and plain["Subject"].startswith("Re: ") and f"[UNI-{t['number']}]" in plain["Subject"]
    assert [e for e in d["events"] if e["kind"] == "transition"][-1]["meta"]["notified"] == ["email"]
    # «Yangi» → «Boshlash» — xat yo'q
    a.post(f"/api/admin/desk/tickets/{tid}/move", json={"stage": "new"})
    RECEIVED.clear()
    assert a.post(f"/api/admin/desk/tickets/{tid}/start").json()["ticket"]["stage"] == "in_progress" and RECEIVED == []
    # hal qilindi — izoh + «hal qilindi» xabari + baholash havolasi
    RECEIVED.clear()
    d = a.post(f"/api/admin/desk/tickets/{tid}/move", json={"stage": "resolved", "reason": "Javob berildi"}).json()
    assert d["ticket"]["stage"] == "resolved" and d["ticket"]["resolved_at"]
    done = message_from_bytes(RECEIVED[-1]["data"], policy=policy.default)
    txt = done.get_body(preferencelist=("plain",)).get_content()
    html = done.get_body(preferencelist=("html",)).get_content()
    assert "Murojaatingiz hal qilindi." in txt and "Javob berildi" in txt and "/request/" in txt and "rate=5" in html
    token = txt.split("/request/", 1)[1].split("?", 1)[0]
    # ochiq sahifa: holat tarixi va baholash (1–5, bitta marta)
    pub = client(m).get(f"/api/desk/public/{token}").json()
    hist = [h["stage"] for h in pub["history"]]
    assert pub["stage"] == "resolved" and pub["can_rate"]
    assert hist == ["new", "in_progress", "waiting", "in_progress", "new", "in_progress", "new", "in_progress", "new", "in_progress", "resolved"], hist
    w = hist.index("waiting")
    assert pub["history"][w]["comment"] == "Pasport nusxasini yuboring" and hist[w + 1] == "in_progress"  # javob → «Jarayonda» tarixda
    assert "Arizangiz grant bo‘limida ko‘rib chiqilmoqda." in [h["comment"] for h in pub["history"]]
    assert client(m).post(f"/api/desk/public/{token}/rate", json={"rating": 6}).json()["detail"] == "invalid_rating"
    assert client(m).post(f"/api/desk/public/{token}/rate", json={"rating": 4, "comment": "Tez javob berishdi"}).json()["rating"] == 4
    r = client(m).post(f"/api/desk/public/{token}/rate", json={"rating": 5})
    assert r.status_code == 409 and r.json()["detail"] == "already_rated"
    tk = a.get(f"/api/admin/desk/tickets/{tid}").json()["ticket"]
    assert tk["rating"] == 4 and tk["rating_comment"] == "Tez javob berishdi" and "public_token" not in tk
    # o'qilgan xatlar «Murojaatlar» papkasiga o'tgan
    names = [f["path"] for f in setup["t"].get("/api/mail/folders").json()["items"]]
    assert "Murojaatlar" in names


# ------------------------------------------------------------------ Stalwart provisioning (soxta JMAP server)
class FakeStalwart:
    def __init__(self):
        self.domains, self.accounts, self.calls, self.auth = {}, {}, [], []
        self._n = 0

    def _id(self):
        self._n += 1
        return f"i{self._n}"

    def __call__(self, req, timeout=20, **kw):
        self.auth.append(req.headers.get("Authorization"))
        body = json.loads(req.data)
        out, last = [], {}
        for name, args, cid in body["methodCalls"]:
            self.calls.append((name, args))
            obj = name.split(":")[1].split("/")[0]
            store = self.domains if obj == "Domain" else self.accounts
            if name.endswith("/query"):
                f = args["filter"]
                ids = [k for k, v in store.items() if v["name"] == f["name"] and all(v.get(x) == y for x, y in f.items() if x != "name")]
                last[name] = ids
                out.append([name, {"ids": ids}, cid])
            elif name.endswith("/get"):
                ids = last[args["#ids"]["name"]] if "#ids" in args else args["ids"]
                out.append([name, {"list": [store[i] | {"id": i} for i in ids]}, cid])
            elif name.endswith("/set"):
                res = {}
                for k, v in (args.get("create") or {}).items():
                    i = self._id()
                    store[i] = dict(v)
                    res.setdefault("created", {})[k] = {"id": i}
                for i, patch in (args.get("update") or {}).items():
                    store[i].update(patch)
                    res.setdefault("updated", {})[i] = None
                for i in args.get("destroy") or []:
                    store.pop(i, None)
                out.append([name, res, cid])
        data = json.dumps({"methodResponses": out}).encode()

        class R(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        return R(data)


def test_stalwart_provisioning(m, setup):
    import university.mail as M
    from university.api.deps import svc

    fake = FakeStalwart()
    a = setup["admin"]
    a.put("/api/admin/mail", json={"provision": "stalwart", "stalwart_url": "http://mail.local:8080", "stalwart_user": "admin", "stalwart_password": "s3cret",
                                   "master_user": "webmail@example.edu", "master_password": "demopass"})
    M.set_provisioner(M.Provisioner(svc().st, opener=fake, sync=True))
    try:
        r = a.post("/api/admin/mail/sync")
        assert r.status_code == 200, r.text
        names = {v["name"]: v for v in fake.accounts.values()}
        assert list(fake.domains.values())[0]["name"] == "example.edu"
        assert names["webmail"]["permissions"]["enabledPermissions"] == {"impersonate": True}
        assert names["webmail"]["credentials"]["0"]["secret"] == "demopass"
        assert {"admin", "teacher", "student", "demouser"} <= set(names)
        assert fake.auth[0].startswith("Basic ")
        # yangi foydalanuvchi — parol bilan; login o'zgarsa — nomi o'zgaradi; o'chirilsa — hisob ham
        u = a.post("/api/admin/users", json={"role": "student", "login": "N.Aliyev", "name": "Nodir Aliyev", "password": "Parol-2025x"}).json()
        acc = next(v for v in fake.accounts.values() if v["name"] == "n.aliyev")
        assert acc["credentials"]["0"]["secret"] == "Parol-2025x" and acc["description"] == "Nodir Aliyev"
        a.put(f"/api/admin/users/{u['id']}", json={"login": "nodir.aliyev"})
        assert any(v["name"] == "nodir.aliyev" for v in fake.accounts.values())
        assert not any(v["name"] == "n.aliyev" for v in fake.accounts.values())
        a.delete(f"/api/admin/users/{u['id']}")
        assert not any(v["name"] == "nodir.aliyev" for v in fake.accounts.values())
        # DNS yozuvlari: DKIM kaliti Stalwart zona faylidan, qolganlari domen va sozlamalardan
        next(iter(fake.domains.values()))["dnsZoneFile"] = 'example.edu. MX 10 mail.example.edu.\n202610r._domainkey.example.edu. IN TXT "v=DKIM1; k=rsa; h=sha256; p=MIIBAQ" "AB"\n'
        a.put("/api/admin/mail", json={"server_ip": "203.0.113.7", "mail_host": "mail.example.edu"})
        dns = a.get("/api/admin/mail/dns?dmarc=reject").json()
        by = {(r["type"], r["host"]): r for r in dns["records"]}
        assert dns["source"] == "stalwart"
        assert by[("A", "mail")]["value"] == "203.0.113.7" and by[("MX", "@")]["value"] == "mail.example.edu" and by[("MX", "@")]["priority"] == 10
        assert by[("TXT", "202610r._domainkey")]["value"] == "v=DKIM1; k=rsa; h=sha256; p=MIIBAQAB"
        assert by[("TXT", "_dmarc")]["value"].startswith("v=DMARC1; p=reject") and by[("TXT", "@")]["value"].startswith("v=spf1")
        assert "_dmarc.example.edu.\t3600\tIN\tTXT" in dns["zone"]

        log = a.get("/api/admin/mail").json()
        assert log["state"]["done"] == log["state"]["total"] and log["state"]["errors"] == 0
        assert log["config"]["has_stalwart_password"] and "stalwart_password" not in log["config"]
    finally:
        a.put("/api/admin/mail", json={"provision": "none"})
        M.set_provisioner(None)
