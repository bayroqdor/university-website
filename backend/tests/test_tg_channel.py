"""Telegram kanal: admin paneldan yoziladigan postlar (Telegram HTML, post osti matni, albom, rejalashtirish, tahrirlash, o'chirish)
va saytdan avtomatik yuborilgan postlarning tahriri."""
import importlib
import json
import time
from datetime import datetime, timedelta, timezone
from email.parser import BytesParser
from email.policy import HTTP

import httpx
import pytest
from fastapi.testclient import TestClient

ADMIN_PW = "Admin-parol-123"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63e0f789f90f0002dc01b7e9d63d0a0000000049454e44ae426082"
)
CH, GR = "-1001234500001", "-1001234500002"


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
    import university.mailer as mailer

    importlib.reload(main)
    deps.reset_service()
    mailer.send = lambda *a, **k: None
    return main


class Tg:
    """Soxta Bot API: chaqiruvlar yoziladi; `fail[metod]` — shu metod uchun xato matni."""

    def __init__(self):
        self.calls: list[tuple[str, dict]] = []
        self.fail: dict[str, str] = {}
        self.mid = 100

    @staticmethod
    def parse(req: httpx.Request) -> dict:
        ctype = req.headers.get("content-type", "")
        if "json" in ctype:
            return json.loads(req.content or b"{}")
        msg = BytesParser(policy=HTTP).parsebytes(b"Content-Type: " + ctype.encode() + b"\r\n\r\n" + req.read())
        out = {}
        for p in msg.iter_parts():
            name = p.get_param("name", header="content-disposition")
            raw = p.get_payload(decode=True)
            out[name] = raw if p.get_filename() else raw.decode()
        for k in ("media", "reply_markup"):
            if isinstance(out.get(k), str):
                out[k] = json.loads(out[k])
        return out

    def __call__(self, req: httpx.Request):
        method = req.url.path.rsplit("/", 1)[-1]
        body = self.parse(req)
        if method in ("getUpdates", "deleteWebhook", "answerCallbackQuery", "setMyCommands", "setChatMenuButton"):
            return httpx.Response(200, json={"ok": True, "result": [] if method == "getUpdates" else True})
        if method == "getMe":
            return httpx.Response(200, json={"ok": True, "result": {"id": 123456, "username": "site_test_bot", "first_name": "UNI"}})
        self.calls.append((method, body))
        if self.fail.get(method):
            return httpx.Response(400, json={"ok": False, "description": self.fail[method]})
        if method == "sendMediaGroup":
            res = []
            for _ in body["media"]:
                self.mid += 1
                res.append({"message_id": self.mid})
            return httpx.Response(200, json={"ok": True, "result": res})
        if method.startswith("send"):
            self.mid += 1
            return httpx.Response(200, json={"ok": True, "result": {"message_id": self.mid}})
        return httpx.Response(200, json={"ok": True, "result": True})

    def of(self, *methods: str) -> list[tuple[str, dict]]:
        return [(mt, b) for mt, b in self.calls if mt in methods]


@pytest.fixture()
def tg(m, monkeypatch):
    from university import telegram as TG
    from university import tg_publish as TP

    t = Tg()
    monkeypatch.setattr(TG, "TRANSPORT", httpx.MockTransport(t))
    monkeypatch.setattr(TP, "SYNC", True)
    return t


_n = iter(range(1, 400))
_adm: dict = {}


def admin(m):
    if "a" not in _adm:
        c = TestClient(m.app, headers={"user-agent": UA, "x-forwarded-for": f"10.8.{next(_n) // 200}.{next(_n) % 200}"})
        r = c.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW})
        assert r.status_code == 200, r.text
        c.headers["x-admin-realm"] = "admin"
        _adm["a"] = c
    return _adm["a"]


def setup_chats(m, a):
    from university import tg_publish as TP
    from university.api.deps import svc

    r = a.put("/api/admin/telegram", json={"enabled": True, "token": "123456:" + "D" * 35, "mode": "webhook"})
    assert r.status_code in (200, 400), r.text  # webhook https talab qiladi — sozlama baribir saqlanadi
    st = svc().st
    TP.upsert(st, {"id": int(CH), "type": "channel", "title": "UNI rasmiy", "username": "uni_kanal"}, {"status": "administrator", "can_post_messages": True})
    TP.upsert(st, {"id": int(GR), "type": "supergroup", "title": "UNI talabalari"}, {"status": "member"})
    for cid in (CH, GR):
        assert a.post(f"/api/admin/telegram/groups/{cid}/confirm", json={"confirmed": True}).status_code == 200
    u = a.get("/api/admin/uni").json()
    u["socials"] = {**u["socials"], "telegram": "https://t.me/uni_official", "instagram": "https://instagram.com/example.edu", "youtube": "https://youtube.com/@uni"}
    assert a.put("/api/admin/uni", json=u).status_code == 200


def img(a) -> str:
    r = a.post("/api/admin/media", files={"file": ("a.png", PNG, "image/png")})
    assert r.status_code == 200, r.text
    return r.json()["url"]


# ------------------------------------------------------------------ tozalash
def test_sanitizer_keeps_only_telegram_html():
    from university.tg_channel import sanitize, visible_len

    s = sanitize("<b>Salom</b> 👋🇺🇿\n\n  Ikkinchi <i>qator</i>\n<script>alert(1)</script><img src=x onerror=alert(1)><h1>Sarlavha</h1>")
    assert s == "<b>Salom</b> 👋🇺🇿\n\n  Ikkinchi <i>qator</i>\nSarlavha"
    assert sanitize("<strong>a</strong><em>b</em><ins>c</ins><del>d</del><strike>e</strike><span class=\"tg-spoiler\">f</span><span style='x'>g</span>") == \
        "<b>a</b><i>b</i><u>c</u><s>d</s><s>e</s><tg-spoiler>f</tg-spoiler>g"
    assert sanitize('<a href="javascript:alert(1)">x</a> <a href="https://t.me/a?b=1&c=2" onclick="y" target="_blank">ok</a>') == \
        'x <a href="https://t.me/a?b=1&amp;c=2">ok</a>'
    assert sanitize('<pre><code class="language-python">print(<b>1</b>)\n    x &lt; 2</code></pre>') == '<pre><code class="language-python">print(1)\n    x &lt; 2</code></pre>'
    assert sanitize('<pre><code class="evil x">a</code></pre>') == "<pre><code>a</code></pre>"
    assert sanitize("<blockquote expandable>a\n<blockquote>b</blockquote></blockquote><blockquote data-expandable='true'>c</blockquote>") == \
        "<blockquote expandable>a\nb</blockquote><blockquote expandable>c</blockquote>"
    assert sanitize("<b>a<i>b</b>c</i>") == "<b>a<i>b</i></b><i>c</i>"  # to'g'ri ichma-ichlik
    assert sanitize("<b>ochiq") == "<b>ochiq</b>"
    assert sanitize("a < b & c > d") == "a &lt; b &amp; c &gt; d"
    assert sanitize("<code>x<b>y</b></code>") == "<code>xy</code>"
    assert visible_len("<b>👋</b> a") == 4  # emoji — 2 ta UTF-16 birligi (Telegram shunday sanaydi)
    assert visible_len("a &amp; b") == 5


# ------------------------------------------------------------------ qo'lda yoziladigan postlar
def test_channel_posts(m, tg):
    from university.api.desk import publisher

    a = admin(m)
    setup_chats(m, a)
    info = a.get("/api/admin/telegram/posts").json()
    assert {g["chat_id"] for g in info["groups"]} == {CH, GR}
    soc = '<a href="https://t.me/uni_official">Telegram</a> | <a href="https://instagram.com/example.edu">Instagram</a> | <a href="https://youtube.com/@uni">YouTube</a>'
    assert info["footer"] == {"html": soc, "default": soc, "custom": False}

    # post osti matni — bir marta saqlanadi
    foot = '🎓 <b>UNI</b> | <a href="https://example.edu">Sayt</a> | <a href="https://t.me/uni_kanal">Kanal</a>'
    r = a.put("/api/admin/telegram/footer", json={"html": foot + "<script>x</script>"})
    assert r.status_code == 200 and r.json()["footer"]["html"] == foot and r.json()["footer"]["custom"]

    # matnli post ikki chatga
    body = "<b>Diqqat!</b> 📢\nErtaga <i>ochiq eshiklar</i> kuni.\n\n<tg-spoiler>sovg‘a bor</tg-spoiler>"
    r = a.post("/api/admin/telegram/posts", json={"html": body, "targets": [CH, GR], "footer": True, "silent": True, "action": "send"})
    assert r.status_code == 200, r.text
    p = r.json()["post"]
    sends = tg.of("sendMessage")
    assert len(sends) == 2 and {b["chat_id"] for _, b in sends} == {CH, GR}
    for _, b in sends:
        assert b["text"] == body + "\n\n" + foot and b["parse_mode"] == "HTML" and b["disable_notification"] is True
        assert b["link_preview_options"] == {"is_disabled": True}
    assert p["status"] == "sent" and all(c["status"] == "sent" and len(c["message_ids"]) == 1 for c in p["chats"])
    ids = {c["chat_id"]: c["message_ids"] for c in p["chats"]}
    ch = next(c for c in p["chats"] if c["chat_id"] == CH)
    assert ch["link"] == f"https://t.me/uni_kanal/{ids[CH][0]}"
    assert next(c for c in p["chats"] if c["chat_id"] == GR)["link"] == f"https://t.me/c/1234500002/{ids[GR][0]}"

    # tahrirlash — o'sha xabarlar (editMessageText), yangi xabar yuborilmaydi
    n_send = len(tg.of("sendMessage", "sendPhoto", "sendMediaGroup"))
    body2 = body.replace("Ertaga", "Indinga")
    r = a.put(f"/api/admin/telegram/posts/{p['id']}", json={"html": body2, "targets": [CH, GR], "footer": True, "action": "send"})
    assert r.status_code == 200, r.text
    edits = tg.of("editMessageText")
    assert len(edits) == 2 and {(b["chat_id"], b["message_id"]) for _, b in edits} == {(CH, ids[CH][0]), (GR, ids[GR][0])}
    assert all(b["text"] == body2 + "\n\n" + foot for _, b in edits)
    assert len(tg.of("sendMessage", "sendPhoto", "sendMediaGroup")) == n_send
    assert r.json()["edit"] == {"edited": 2, "failed": 0}
    # «message is not modified» — xato emas
    tg.fail["editMessageText"] = "Bad Request: message is not modified: specified new message content and reply markup are exactly the same"
    r = a.put(f"/api/admin/telegram/posts/{p['id']}", json={"html": body2 + " ", "targets": [CH, GR], "footer": True, "action": "send"})
    assert r.status_code == 200 and r.json()["edit"] == {"edited": 2, "failed": 0}
    assert all(not c["error"] for c in r.json()["post"]["chats"])
    tg.fail.pop("editMessageText")
    assert len(tg.of("sendMessage", "sendPhoto", "sendMediaGroup")) == n_send

    # matnli xabarga rasm qo'shib bo'lmaydi — 409, post o'zgarmaydi; «yangi xabar sifatida» — eskisi o'chiriladi
    pic = img(a)
    r = a.put(f"/api/admin/telegram/posts/{p['id']}", json={"html": body2, "targets": [CH, GR], "media": [{"url": pic}], "action": "send"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "telegram_edit_incompatible"
    assert {c["chat_id"] for c in r.json()["detail"]["chats"]} == {CH, GR}
    assert a.get(f"/api/admin/telegram/posts/{p['id']}").json()["post"]["media"] == []
    r = a.post(f"/api/admin/telegram/posts/{p['id']}/resend", json={"html": body2, "targets": [CH, GR], "media": [{"url": pic}], "footer": True, "delete_old": True})
    assert r.status_code == 200, r.text
    dels = tg.of("deleteMessage")
    assert {(b["chat_id"], b["message_id"]) for _, b in dels} == {(CH, ids[CH][0]), (GR, ids[GR][0])}
    photos = tg.of("sendPhoto")
    assert len(photos) == 2 and all(b["photo"][:4] == b"\x89PNG" and b["caption"] == body2 + "\n\n" + foot for _, b in photos)
    p = r.json()["post"]
    assert p["status"] == "sent" and all(c["message_ids"][0] not in (ids[CH][0], ids[GR][0]) for c in p["chats"])

    # rasmli post: izoh — editMessageCaption, rasm almashsa — editMessageMedia (o'sha message_id)
    pic2 = img(a)
    buttons = [[{"text": "Ro‘yxatdan o‘tish", "url": "https://example.edu/qabul"}]]
    r = a.put(f"/api/admin/telegram/posts/{p['id']}", json={"html": body2 + "\n🎉", "targets": [CH, GR], "media": [{"url": pic}], "footer": True, "buttons": buttons, "action": "send"})
    assert r.status_code == 200, r.text
    caps = tg.of("editMessageCaption")
    assert len(caps) == 2 and all(b["caption"].startswith(body2 + "\n🎉") and b["reply_markup"] == {"inline_keyboard": [[{"text": "Ro‘yxatdan o‘tish", "url": "https://example.edu/qabul"}]]}
                                  for _, b in caps)
    mids = {c["chat_id"]: c["message_ids"][0] for c in p["chats"]}
    assert {(b["chat_id"], b["message_id"]) for _, b in caps} == set(mids.items())
    r = a.put(f"/api/admin/telegram/posts/{p['id']}", json={"html": body2 + "\n🎉", "targets": [CH, GR], "media": [{"url": pic2}], "footer": True, "buttons": buttons, "action": "send"})
    em = tg.of("editMessageMedia")
    assert r.status_code == 200 and len(em) == 2
    assert all(b["media"]["type"] == "photo" and b["media"]["media"] == "attach://f0" and isinstance(b["f0"], bytes) for _, b in em)
    assert {(str(b["chat_id"]), int(b["message_id"])) for _, b in em} == set(mids.items())
    assert len(tg.of("sendMessage", "sendPhoto", "sendMediaGroup")) == n_send + 2

    # o'chirish: deleteMessage; Telegram rad etsa — 409, majburan — ro'yxatdan olib tashlanadi
    tg.fail["deleteMessage"] = "Bad Request: message can't be deleted"
    r = a.delete(f"/api/admin/telegram/posts/{p['id']}")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "telegram_delete_failed"
    tg.fail["deleteMessage"] = "Bad Request: message to delete not found"
    r = a.delete(f"/api/admin/telegram/posts/{p['id']}")
    assert r.status_code == 200
    assert all(x["id"] != p["id"] for x in a.get("/api/admin/telegram/posts").json()["posts"])
    tg.fail.pop("deleteMessage")

    # post osti matnisiz
    r = a.post("/api/admin/telegram/posts", json={"html": "Faqat matn", "targets": [CH], "footer": False, "preview": True, "action": "send"})
    b = tg.of("sendMessage")[-1][1]
    assert b["text"] == "Faqat matn" and b["link_preview_options"] == {"is_disabled": False} and "disable_notification" not in b

    # albom: 3 ta rasm — sendMediaGroup, izoh birinchisida; har chat uchun barcha id'lar saqlanadi; o'chirish — deleteMessages
    pics = [img(a) for _ in range(3)]
    r = a.post("/api/admin/telegram/posts", json={"html": "Albom 📸", "targets": [CH, GR], "media": [{"url": u} for u in pics], "footer": True,
                                                  "buttons": buttons, "action": "send"})
    assert r.status_code == 400 and r.json()["detail"] == "telegram_album_buttons"
    r = a.post("/api/admin/telegram/posts", json={"html": "Albom 📸", "targets": [CH, GR], "media": [{"url": u} for u in pics], "footer": True, "action": "send"})
    assert r.status_code == 200, r.text
    groups_ = tg.of("sendMediaGroup")
    assert len(groups_) == 2
    for _, b in groups_:
        assert [x["media"] for x in b["media"]] == ["attach://m0", "attach://m1", "attach://m2"] and all(x["type"] == "photo" for x in b["media"])
        assert b["media"][0]["caption"] == "Albom 📸\n\n" + foot and "caption" not in b["media"][1]
        assert all(isinstance(b[f"m{i}"], bytes) for i in range(3))
    alb = r.json()["post"]
    assert all(len(c["message_ids"]) == 3 for c in alb["chats"])
    # albom izohi — birinchi xabarda tahrirlanadi; rasmlar soni o'zgarsa — tahrirlab bo'lmaydi
    r = a.put(f"/api/admin/telegram/posts/{alb['id']}", json={"html": "Albom 📸 (yangilandi)", "targets": [CH, GR], "media": [{"url": u} for u in pics], "footer": True, "action": "send"})
    assert r.status_code == 200
    caps = tg.of("editMessageCaption")[-2:]
    assert {(b["chat_id"], b["message_id"]) for _, b in caps} == {(c["chat_id"], c["message_ids"][0]) for c in alb["chats"]}
    r = a.put(f"/api/admin/telegram/posts/{alb['id']}", json={"html": "x", "targets": [CH, GR], "media": [{"url": u} for u in pics[:2]], "action": "send"})
    assert r.status_code == 409
    r = a.delete(f"/api/admin/telegram/posts/{alb['id']}")
    assert r.status_code == 200
    dm = tg.of("deleteMessages")
    assert len(dm) == 2 and {tuple(b["message_ids"]) for _, b in dm} == {tuple(c["message_ids"]) for c in alb["chats"]}

    # uzunlik chegaralari: matn 4096, rasm izohi 1024 (post osti matni bilan birga)
    long = "a" * 4097
    r = a.post("/api/admin/telegram/posts", json={"html": long, "targets": [CH], "footer": False, "action": "send"})
    assert r.status_code == 400 and r.json()["detail"] == "telegram_text_too_long"
    r = a.post("/api/admin/telegram/posts", json={"html": "a" * (4096 - len("🎓 UNI | Sayt | Kanal") - 2), "targets": [CH], "footer": True, "action": "send"})
    assert r.status_code == 400 and r.json()["detail"] == "telegram_text_too_long"
    r = a.post("/api/admin/telegram/posts", json={"html": "<b>" + "a" * 1025 + "</b>", "targets": [CH], "media": [{"url": pic}], "footer": False, "action": "send"})
    assert r.status_code == 400 and r.json()["detail"] == "telegram_caption_too_long"
    r = a.post("/api/admin/telegram/posts", json={"html": "a" * 4096, "targets": [CH], "footer": False, "action": "draft"})
    assert r.status_code == 200 and r.json()["post"]["status"] == "draft"  # qoralama — chegarasiz saqlanadi
    r = a.post("/api/admin/telegram/posts", json={"html": "x", "targets": [], "action": "send"})
    assert r.json()["detail"] == "telegram_no_targets"

    # rejalashtirish: vaqti kelganda bir marta (bazada atomar band qilinadi)
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    r = a.post("/api/admin/telegram/posts", json={"html": "Kech", "targets": [CH], "scheduled_at": past, "action": "schedule"})
    assert r.json()["detail"] == "telegram_bad_schedule"
    soon = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat()
    n0 = len(tg.of("sendMessage"))
    r = a.post("/api/admin/telegram/posts", json={"html": "Rejalashtirilgan ⏰", "targets": [CH, GR], "scheduled_at": soon, "footer": False, "action": "schedule"})
    sp = r.json()["post"]
    assert r.status_code == 200 and sp["status"] == "scheduled" and len(tg.of("sendMessage")) == n0
    publisher().run_once()
    assert len(tg.of("sendMessage")) == n0
    time.sleep(2.5)
    from university import tg_channel as TC
    from university.api.deps import svc

    assert TC.claim(svc().st, sp["id"], ("scheduled",)) and not TC.claim(svc().st, sp["id"], ("scheduled",))
    TC.set_status(svc().st, sp["id"], "scheduled")  # boshqa jarayon band qilganida ikkinchisi yubormaydi; holatni qaytaramiz
    publisher().run_once()
    publisher().run_once()
    new = tg.of("sendMessage")[n0:]
    assert len(new) == 2 and all(b["text"] == "Rejalashtirilgan ⏰" for _, b in new)
    assert a.get(f"/api/admin/telegram/posts/{sp['id']}").json()["post"]["status"] == "sent"

    # standart post osti matniga qaytarish
    r = a.put("/api/admin/telegram/footer", json={"reset": True})
    assert r.json()["footer"] == {"html": soc, "default": soc, "custom": False}


# ------------------------------------------------------------------ saytdan avtomatik postlar: tahrir
def test_autopost_edit_updates_same_message(m, tg):
    a = admin(m)
    setup_chats(m, a)
    foot = '<b>UNI</b> | <a href="https://example.edu">example.edu</a>'
    assert a.put("/api/admin/telegram/footer", json={"html": foot}).status_code == 200
    pic, pic2 = img(a), img(a)
    r = a.post("/api/admin/items/news", json={"title": "Yangi bino", "status": "published", "html": "<p>Matn.</p>", "feature_image": pic})
    it = r.json()
    ph = tg.of("sendPhoto")
    assert len(ph) == 2 and all(b["caption"].endswith("\n\n" + foot) and "Instagram" not in b["caption"] for _, b in ph)  # post osti matni avtopostda ham
    from university.api.deps import svc

    mids = {r["chat_id"]: int(r["message_id"]) for r in svc().st._q("SELECT * FROM tg_posts WHERE item_id=%s", (it["id"],))}
    assert set(mids) == {CH, GR}
    # sarlavha o'zgardi → editMessageCaption (o'sha xabar), yangi xabar yo'q
    a.put(f"/api/admin/items/news/{it['id']}", json={**it, "title": "Yangi bino ochildi"})
    caps = tg.of("editMessageCaption")
    assert len(caps) == 2 and {(b["chat_id"], b["message_id"]) for _, b in caps} == set(mids.items())
    assert all(b["caption"].startswith("<b>Yangi bino ochildi</b>") and b["parse_mode"] == "HTML" for _, b in caps)
    assert len(tg.of("sendPhoto", "sendMessage")) == 2
    # hech narsa o'zgarmasa — Telegram'ga chaqiruv yo'q
    n = len(tg.calls)
    a.put(f"/api/admin/items/news/{it['id']}", json={**it, "title": "Yangi bino ochildi"})
    assert len(tg.calls) == n
    # muqova almashdi → editMessageMedia
    a.put(f"/api/admin/items/news/{it['id']}", json={**it, "title": "Yangi bino ochildi", "feature_image": pic2})
    em = tg.of("editMessageMedia")
    assert len(em) == 2 and all(b["media"]["caption"].startswith("<b>Yangi bino ochildi</b>") for _, b in em)
    assert {(str(b["chat_id"]), int(b["message_id"])) for _, b in em} == set(mids.items())
    # nashrdan olingan element tahrirlansa — Telegram'da hech narsa qilinmaydi (xabar o'chirilmaydi)
    n = len(tg.calls)
    a.put(f"/api/admin/items/news/{it['id']}", json={**it, "status": "draft", "title": "Qoralamaga qaytdi"})
    a.put(f"/api/admin/items/news/{it['id']}", json={**it, "status": "draft", "title": "Qoralamada tahrir"})
    assert len(tg.calls) == n
    # matnli avtopost → editMessageText; Telegram «not modified» desa — xato emas
    t = a.post("/api/admin/items/news", json={"title": "Rasmsiz yangilik", "status": "published", "html": "<p>Bir.</p>"}).json()
    assert len(tg.of("sendMessage")) == 2
    tg.fail["editMessageText"] = "Bad Request: message is not modified"
    a.put(f"/api/admin/items/news/{t['id']}", json={**t, "html": "<p>Bir.</p>"})
    tg.fail.pop("editMessageText")
    a.put(f"/api/admin/items/news/{t['id']}", json={**t, "html": "<p>Ikki.</p>"})
    et = tg.of("editMessageText")
    assert len(et) >= 2 and all("Ikki." in b["text"] for _, b in et[-2:])
    st = a.get("/api/admin/telegram/items/" + t["id"]).json()["posts"]
    assert all(p["status"] == "sent" and not p["edit_error"] for p in st)
    assert len(tg.of("sendPhoto", "sendMessage")) == 4
    a.put("/api/admin/telegram/footer", json={"reset": True})
