"""Telegram bot tezligi: umumiy ulanishlar, IPv6 → IPv4 zaxirasi, 409, chatlar bo'yicha parallel ishlov, tugmaga darhol javob,
webhook darhol 200, xatodan keyin kutish va «Tezlikni tekshirish» (tarmoq soxtalashtirilgan)."""
import importlib
import socket
import threading
import time

import httpcore
import httpx
import pytest
from fastapi.testclient import TestClient

ADMIN_PW = "Admin-parol-123"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
TOKEN = "123456:" + "V" * 35


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


_admin: dict = {}


def admin(m):
    if "c" not in _admin:
        c = TestClient(m.app, headers={"user-agent": UA, "x-forwarded-for": "10.8.0.1"})
        assert c.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
        c.headers["x-admin-realm"] = "admin"
        _admin["c"] = c
    return _admin["c"]


@pytest.fixture()
def net(monkeypatch):
    """Toza tarmoq holati (IPv4 belgisi, o'lchovlar, mijozlar) — har bir test uchun."""
    from university import tg_net

    monkeypatch.setattr(tg_net, "S", tg_net._State())  # noqa: SLF001
    monkeypatch.delenv("SITE_TELEGRAM_IPV4", raising=False)
    yield tg_net
    tg_net.reset()


def enable(m, monkeypatch, transport, **cfg):
    from university import telegram as TG

    monkeypatch.setattr(TG, "TRANSPORT", transport)
    r = admin(m).put("/api/admin/telegram", json={"enabled": True, "token": TOKEN, "mode": "polling"} | cfg)
    assert r.status_code == 200, r.text
    from university.api.desk import bot

    return bot()


def disable(m):
    admin(m).put("/api/admin/telegram", json={"enabled": False, "mode": "polling", "ipv4": False})


# ------------------------------------------------------------------ ulanishlar
def test_client_reused_and_poll_client_separate(m, monkeypatch, net):
    from fake_tg import FakeTG

    from university import telegram as TG

    fk = FakeTG()
    monkeypatch.setattr(TG, "TRANSPORT", fk.transport)
    built = []
    orig = net.new_client
    monkeypatch.setattr(net, "new_client", lambda kind="api": built.append(kind) or orig(kind))
    api = TG.Api(TOKEN)
    for i in range(5):
        api.call("sendMessage", chat_id=1, text=f"x{i}")
    TG.Api(TOKEN).call("getMe")  # yangi Api obyekti ham o'sha mijozni ishlatadi
    TG.Api(TOKEN, timeout=40).call("getUpdates", timeout=0)
    assert built == ["api", "poll"]  # 7 ta chaqiruv — 2 ta mijoz (yuborish va long polling alohida)
    assert net.client("api") is net.client("api") and net.client("api") is not net.client("poll")
    # o'lchovlar yoziladi (getUpdates umumiy statistikaga kirmaydi)
    st = net.stats()
    assert st["calls"]["count"] == 6 and {x["method"] for x in st["calls"]["methods"]} == {"sendMessage", "getMe"}
    # testda transport almashtirilsa — mijozlar qayta quriladi
    fk2 = FakeTG()
    monkeypatch.setattr(TG, "TRANSPORT", fk2.transport)
    TG.Api(TOKEN).call("sendMessage", chat_id=1, text="y")
    assert built[-1] == "api" and fk2.methods() == ["sendMessage"]


def test_real_transport_uses_own_backend(monkeypatch, net):
    """Haqiqiy tarmoq mijozi: keep-alive puli va o'z TCP backend'imiz (DNS kesh, IPv4 zaxirasi)."""
    from university import telegram as TG

    monkeypatch.setattr(TG, "TRANSPORT", None)
    monkeypatch.setattr(net, "env_proxy", lambda *a: "")
    c = net.new_client("api")
    pool = c._transport._pool  # noqa: SLF001
    assert isinstance(pool._network_backend, net.Backend) and pool._keepalive_expiry == net.KEEPALIVE  # noqa: SLF001
    c.close()


def test_ipv6_blackhole_falls_back_to_ipv4(monkeypatch, net):
    tried = []

    def fake_connect(self, host, port, timeout=None, local_address=None, socket_options=None):
        tried.append((host, timeout))
        if ":" in host:
            raise httpcore.ConnectTimeout("timed out")
        return "stream"

    monkeypatch.setattr(httpcore.SyncBackend, "connect_tcp", fake_connect)
    monkeypatch.setattr(net, "_getaddrinfo", lambda h, p, f=0: [(socket.AF_INET6, "2001:db8::1"), (socket.AF_INET, "192.0.2.10")])
    b = net.Backend()
    assert b.connect_tcp(net.HOST, 443, timeout=30) == "stream"
    # IPv6 urinishi qisqa (30 s emas), keyin IPv4; holat — jarayon oxirigacha IPv4
    assert tried == [("2001:db8::1", net.V6_TRY), ("192.0.2.10", net.CONNECT)]
    assert net.use_ipv4() and net.S.ipv4_reason.startswith("2001:db8::1")
    assert [x["family"] for x in net.S.connects] == [6, 4] and not net.S.connects[0]["ok"]
    tried.clear()
    assert b.connect_tcp(net.HOST, 443) == "stream"
    assert tried == [("192.0.2.10", net.CONNECT)]  # IPv6 endi urinilmaydi; DNS keshdan
    assert len(net.S.dns_log) == 1


def test_forced_ipv4(monkeypatch, net):
    tried = []
    monkeypatch.setattr(httpcore.SyncBackend, "connect_tcp", lambda self, host, *a, **k: tried.append(host) or "s")
    monkeypatch.setattr(net, "_getaddrinfo", lambda h, p, f=0: [(socket.AF_INET6, "2001:db8::1"), (socket.AF_INET, "192.0.2.10")])
    monkeypatch.setenv("SITE_TELEGRAM_IPV4", "1")
    net.Backend().connect_tcp(net.HOST, 443)
    assert tried == ["192.0.2.10"] and net.state()["ipv4_forced"]


def test_connect_error_retried_over_ipv4(monkeypatch, net):
    """Ulanish xatosi (so'rov yuborilmagan) — IPv4 ga o'tib bir marta qayta; ikkinchi xato — yuqoriga."""
    from university import telegram as TG

    n = {"i": 0}

    def handler(req):
        n["i"] += 1
        if n["i"] == 1:
            raise httpx.ConnectError("[Errno 101] Network is unreachable")
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 5}})

    monkeypatch.setattr(TG, "TRANSPORT", httpx.MockTransport(handler))
    net.S.dns[(net.HOST, 443)] = (time.time(), [(socket.AF_INET6, "2001:db8::1"), (socket.AF_INET, "192.0.2.10")])
    assert TG.Api(TOKEN).call("sendMessage", chat_id=1, text="x") == {"message_id": 5}
    assert n["i"] == 2 and net.use_ipv4()
    monkeypatch.setattr(TG, "TRANSPORT", httpx.MockTransport(lambda req: (_ for _ in ()).throw(httpx.ConnectError("down"))))
    with pytest.raises(httpx.ConnectError):
        TG.Api(TOKEN).call("sendMessage", chat_id=1, text="x")
    assert not net.S.calls[-1]["ok"]


# ------------------------------------------------------------------ ishlov
def test_dispatcher_per_chat_order_parallel_chats():
    from university.telegram import Dispatcher

    log, lock = [], threading.Lock()

    def fn(upd, wait_ms):
        chat = upd["message"]["chat"]["id"]
        with lock:
            log.append(("start", chat, upd["update_id"], time.monotonic()))
        time.sleep(0.3 if chat == 1 else 0.01)
        with lock:
            log.append(("end", chat, upd["update_id"], time.monotonic()))

    d = Dispatcher(fn, workers=3)
    u = lambda i, chat: {"update_id": i, "message": {"chat": {"id": chat}, "text": str(i)}}  # noqa: E731
    t0 = time.monotonic()
    for i, chat in ((1, 1), (2, 1), (3, 2), (4, 2), (5, 3)):
        assert d.submit(u(i, chat))
    assert not d.submit(u(3, 2))  # takroriy update_id (webhook qayta yuborgan) — tashlanadi
    assert d.drain(5)
    at = {(k, i): t for k, _c, i, t in log}
    # bitta chat — qat'iy ketma-ket: 2-yangilanish 1-si tugagach boshlanadi
    assert at[("start", 2)] >= at[("end", 1)] and at[("start", 4)] >= at[("end", 3)]
    # boshqa chatlar sekin chatni kutmaydi
    assert at[("end", 3)] < at[("end", 1)] and at[("end", 5)] - t0 < 0.25
    assert [i for k, _c, i, _t in log if k == "start" and _c == 1] == [1, 2]
    assert d.backlog() == 0


def test_callback_answered_before_slow_work(m, monkeypatch, net):
    from fake_tg import FakeTG

    fk = FakeTG()
    order = []

    def handler(req):
        meth = req.url.path.rsplit("/", 1)[-1]
        if meth in ("answerCallbackQuery", "editMessageText"):
            order.append((meth, time.monotonic()))
        return fk.handler(req)

    b = enable(m, monkeypatch, httpx.MockTransport(handler))
    b.stop()
    chat = 4401
    mid = fk.user(chat, text="/start")["id"]
    b.handle({"update_id": 1, "message": {"chat": {"id": chat, "type": "private"}, "from": {"id": chat}, "message_id": mid, "text": "/start"}})
    slow_done = []
    orig = b.on_button

    def slow(c, data, q=None):
        time.sleep(0.4)  # og'ir ish (fayl, baza …)
        slow_done.append(time.monotonic())
        return orig(c, data, q)

    monkeypatch.setattr(b, "on_button", slow)
    order.clear()
    t0 = time.monotonic()
    b.handle({"update_id": 2, "callback_query": {"id": "cb1", "from": {"id": chat}, "data": "lang:uz",
                                                 "message": {"chat": {"id": chat, "type": "private"}, "message_id": b.chat(str(chat))["panel"]}}})
    assert [x[0] for x in order] == ["answerCallbackQuery", "editMessageText"]
    assert order[0][1] - t0 < 0.2 and order[0][1] < slow_done[0]  # «soat» og'ir ishdan oldin to'xtadi
    # bekor qilish: toast matni oldindan aniqlanadi va birinchi javobda
    monkeypatch.setattr(b, "on_button", orig)
    b.handle({"update_id": 3, "callback_query": {"id": "cb2", "from": {"id": chat}, "data": "cancel",
                                                 "message": {"chat": {"id": chat, "type": "private"}, "message_id": b.chat(str(chat))["panel"]}}})
    assert fk.toasts[-1]["callback_query_id"] == "cb2" and fk.toasts[-1]["text"] == "Bekor qilindi."
    st = net.stats()["handlers"]
    assert st["count"] >= 3 and {"tugma lang", "tugma cancel", "buyruq /start"} <= {x["kind"] for x in net.S.handlers}
    disable(m)


def test_webhook_returns_immediately_and_processes_in_background(m, monkeypatch, net):
    from fake_tg import FakeTG

    fk = FakeTG()
    b = enable(m, monkeypatch, fk.transport, mode="webhook")
    st = m.svc().st
    secret = st.kv_get("telegram_secret")
    assert secret
    done = []
    orig = b.handle

    def slow(upd, wait_ms=0.0):
        time.sleep(0.6)
        orig(upd, wait_ms)
        done.append(upd["update_id"])

    monkeypatch.setattr(b, "handle", slow)
    c = TestClient(m.app, headers={"user-agent": UA})
    chat = 4402
    mid = fk.user(chat, text="/start")["id"]
    upd = {"update_id": 901, "message": {"chat": {"id": chat, "type": "private"}, "from": {"id": chat}, "message_id": mid, "text": "/start"}}
    assert c.post("/api/telegram/webhook", json=upd, headers={"x-telegram-bot-api-secret-token": "noto'g'ri"}).status_code == 403
    t0 = time.monotonic()
    r = c.post("/api/telegram/webhook", json=upd, headers={"x-telegram-bot-api-secret-token": secret})
    assert r.status_code == 200 and time.monotonic() - t0 < 0.4 and not done  # Telegram kutmaydi
    # Telegram qayta yuborsa — ikkinchi marta ishlanmaydi
    assert c.post("/api/telegram/webhook", json=upd, headers={"x-telegram-bot-api-secret-token": secret}).status_code == 200
    assert b.dispatcher.drain(5) and done == [901]
    assert "inline_keyboard" in (fk.msg(chat, b.chat(str(chat))["panel"]) or {}).get("markup", {})
    # webhook rejimida polling to'liq to'xtagan (getUpdates chaqirilmaydi)
    end = time.monotonic() + 3
    while b.polling and time.monotonic() < end:
        time.sleep(0.05)
    assert b.polling is False
    disable(m)


def test_backoff_sequence():
    from university.telegram import Bot

    w, seq = 0.0, []
    for _ in range(7):
        w = Bot.backoff(w)
        seq.append(w)
    assert seq == [1, 2, 4, 8, 15, 15, 15]


def test_conflict_409_detected_and_shown(m, monkeypatch, net):
    from fake_tg import FakeTG

    fk = FakeTG()
    polls = []

    def handler(req):
        if req.url.path.endswith("/getUpdates"):
            polls.append(time.monotonic())
            return httpx.Response(409, json={"ok": False, "error_code": 409,
                                             "description": "Conflict: terminated by other getUpdates request; make sure that only one bot instance is running"})
        return fk.handler(req)

    b = enable(m, monkeypatch, httpx.MockTransport(handler))
    b.start()
    time.sleep(2.5)
    assert 1 <= len(polls) <= 3  # tsiklga tushmaydi: 1 s, 2 s … kutadi
    assert "boshqa joyda ham bot ishlayapti" in b.last_error
    info = admin(m).get("/api/admin/telegram").json()
    assert info["conflict"].startswith("Bu token bilan boshqa joyda") and info["net"]["conflict_recent"]
    disable(m)


# ------------------------------------------------------------------ «Tezlikni tekshirish»
def test_speed_check_endpoint(m, monkeypatch, net):
    from fake_tg import FakeTG

    fk = FakeTG()
    b = enable(m, monkeypatch, fk.transport)
    b.stop()
    monkeypatch.setattr(net, "_dns", lambda host, fam: (["149.154.167.220"], 12.0, "") if fam == socket.AF_INET else (["2001:67c:4e8:f004::9"], 15.0, ""))
    monkeypatch.setattr(net, "_probe", lambda ip, fam, timeout=5: {"ip": ip, "ok": fam == socket.AF_INET, "tcp_ms": 95 if fam == socket.AF_INET else 3000,
                                                                     "tls_ms": 110 if fam == socket.AF_INET else None, "err": "" if fam == socket.AF_INET else "timeout"})
    monkeypatch.setattr(net, "env_proxy", lambda *a: "")
    chat = 4403
    mid = fk.user(chat, text="/start")["id"]
    b.handle({"update_id": 77, "message": {"chat": {"id": chat, "type": "private"}, "from": {"id": chat}, "message_id": mid, "text": "/start"}})
    r = admin(m).post("/api/admin/telegram/speed")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["mode"] == "polling" and d["webhook"]["url"] == "" and d["our_webhook"] == "https://site.example/api/telegram/webhook"
    assert d["net"]["dns"]["a"] == ["149.154.167.220"] and d["net"]["ipv4"]["ok"] and not d["net"]["ipv6"]["ok"]
    assert d["net"]["getme"]["cold"]["ok"] and d["net"]["getme"]["warm"]["ok"] and d["net"]["getme"]["pooled"]["ok"]
    assert d["state"]["ipv4"] and d["state"]["ipv4_reason"]  # IPv6 ishlamadi — IPv4 ga o'tkazildi
    h = d["stats"]["handlers"]
    assert h["count"] >= 1 and h["p50"] is not None and h["slowest"][0]["kind"] == "buyruq /start"
    assert d["stats"]["calls"]["count"] >= 1 and d["stats"]["calls"]["methods"][0]["p95"] is not None
    texts = [v["text"] for v in d["verdicts"]]
    assert any("IPv6 ulanishi ishlamayapti — IPv4 ga o‘tkazildi" in t for t in texts)
    assert any("Webhook rejimiga o‘tish tavsiya etiladi" in t for t in texts)
    assert {v["level"] for v in d["verdicts"]} <= {"bad", "warn", "ok", "info"}
    # tokensiz — aniq xato
    from university import telegram as TG

    st = m.svc().st
    cfg = TG.config(st)
    st.kv_put("telegram", cfg | {"token": ""})
    assert admin(m).post("/api/admin/telegram/speed").json()["detail"] == "telegram_no_token"
    st.kv_put("telegram", cfg)
    disable(m)


def test_verdicts_name_the_cause(net):
    """Xulosa qatori aniq sababni aytadi."""
    base = {"dns": {"a_ms": 10, "aaaa_ms": 10}, "ipv4": {"ok": True}, "ipv6": None,
            "getme": {"cold": {"ok": True, "ms": 900}, "warm": {"ok": True, "ms": 2400}, "pooled": {"ok": True, "ms": 2400}}}
    v = net.verdicts(base, {}, {"handlers": {}}, "webhook", True, True, "https://x/api/telegram/webhook")
    assert v[0]["level"] == "bad" and "Telegram serverigacha tarmoq sekin: 2.4 s" in v[0]["text"]
    net.conflict("Conflict: terminated by other getUpdates request")
    v = net.verdicts(base | {"getme": {"cold": {"ok": True, "ms": 300}, "warm": {"ok": True, "ms": 120}}}, {"webhook": {"url": ""}},
                     {"handlers": {"p50": 4}}, "polling", True, False, "")
    assert "(409)" in v[0]["text"] and v[0]["level"] == "bad"
    net.S.conflict_at = 0
    v = net.verdicts(base | {"getme": {"cold": {"ok": True, "ms": 300}, "warm": {"ok": True, "ms": 120}}}, {"webhook": {"url": "https://boshqa.uz/hook"}},
                     {"handlers": {"p50": 4}}, "webhook", True, True, "https://x/api/telegram/webhook")
    assert "boshqa.uz" in v[0]["text"]
    v = net.verdicts(base | {"getme": {"cold": {"ok": True, "ms": 300}, "warm": {"ok": True, "ms": 120}}}, {}, {"handlers": {"p50": 4}}, "webhook", True, True, "")
    assert v[0]["level"] == "ok" and "Muammo topilmadi" in v[0]["text"]
