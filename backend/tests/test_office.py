"""ONLYOFFICE tezligi: /office-ds proksisi (ulanishlar puli, oqim, kesh sarlavhalari, ulanish yopilishi), barqaror hujjat kaliti,
saytdagi fayl uchun imzoli ichki havola (S3'ga yo'naltirishsiz), mobil tahrirlagich, «Ulanishni tekshirish» ikki yo'nalishda."""
import importlib
import json

import httpx
import pytest
from fastapi.testclient import TestClient

ADMIN_PW = "Admin-parol-123"
DEMO_PW = "demo2025"
SECRET = "S3CRET-key"


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

    importlib.reload(main)
    deps.reset_service()
    return main


_S: dict = {}


def client(m, ip="10.7.0.1"):
    return TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126", "x-forwarded-for": ip})


def admin(m):
    if "admin" not in _S:
        c = client(m, "10.7.0.2")
        assert c.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
        c.headers["x-admin-realm"] = "admin"
        _S["admin"] = c
    return _S["admin"]


def teacher(m):
    if "teacher" not in _S:
        c = client(m, "10.7.0.3")
        assert c.post("/api/auth/login", json={"login": "teacher", "password": DEMO_PW}).status_code == 200
        _S["teacher"] = c
    return _S["teacher"]


def enable(m, **kw):
    r = admin(m).put("/api/admin/office", json={"enabled": True, "secret": SECRET, "url": "/office-ds", "internal_url": "http://ds", "app_url": "http://app:8000"} | kw)
    assert r.status_code == 200


class _Body(httpx.AsyncByteStream):
    """Soxta Document Server javobi: yopilganini qayd etadi (ulanish pulga qaytdimi)."""

    def __init__(self, data: bytes, log: list):
        self.data, self.log = data, log

    async def __aiter__(self):
        for i in range(0, len(self.data), 4096):
            yield self.data[i:i + 4096]

    async def aclose(self):
        self.log.append("closed")


def test_proxy_streams_passes_length_and_cache_headers(m, monkeypatch):
    import university.api.office as AO

    enable(m)
    closed: list = []
    seen: list[httpx.Request] = []
    big = bytes(range(256)) * 4000  # ~1 MB

    async def handler(req: httpx.Request):
        seen.append(req)
        body = await req.aread()
        p = req.url.path
        if p.startswith("/9.0.4-abc123/web-apps/"):  # versiyali statik fayl, sarlavhasiz
            return httpx.Response(200, headers={"content-type": "application/javascript", "content-length": str(len(big))}, stream=_Body(big, closed))
        if p == "/web-apps/apps/api/documents/api.js":
            return httpx.Response(200, headers={"content-type": "application/javascript"}, stream=_Body(b"var DocsAPI={};", closed))
        if p == "/sdkjs/word/sdk-all-min.js":
            return httpx.Response(200, headers={"cache-control": "no-cache", "etag": '"e1"'}, stream=_Body(b"x", closed))
        if p == "/etag":
            return httpx.Response(304, headers={"etag": '"e1"'}, stream=_Body(b"", closed))
        if p == "/redirect":
            return httpx.Response(302, headers={"location": "http://ds/web-apps/x"}, stream=_Body(b"", closed))
        if p.startswith("/doc/"):
            return httpx.Response(200, stream=_Body(b"echo:" + body, closed))
        return httpx.Response(404, stream=_Body(b"", closed))

    monkeypatch.setattr(AO, "TRANSPORT", httpx.MockTransport(handler))
    monkeypatch.setattr(AO, "_client", None)
    c = client(m)
    r = c.get("/office-ds/9.0.4-abc123/web-apps/apps/documenteditor/main/app.js", headers={"host": "example.edu", "origin": "https://example.edu"})
    assert r.status_code == 200 and r.content == big
    assert r.headers["content-length"] == str(len(big))
    assert "immutable" in r.headers["cache-control"]
    assert closed == ["closed"]  # ichki ulanish yopildi
    # Document Server'ga brauzer manzili va https protokoli uzatiladi, cookie esa yo'q
    up = seen[-1]
    assert up.headers["x-forwarded-host"] == "example.edu/office-ds" and up.headers["x-forwarded-proto"] == "https" and "cookie" not in up.headers
    # api.js — versiyasiz, keshlanmaydi (yangilanishda eski api.js qolib ketmasin)
    r = c.get("/office-ds/web-apps/apps/api/documents/api.js")
    assert r.status_code == 200 and "cache-control" not in r.headers
    # serverning o'z sarlavhalari o'zgarmaydi
    r = c.get("/office-ds/sdkjs/word/sdk-all-min.js")
    assert r.headers["cache-control"] == "no-cache" and r.headers["etag"] == '"e1"'
    assert c.get("/office-ds/etag", headers={"if-none-match": '"e1"'}).status_code == 304
    r = c.get("/office-ds/redirect", follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == "/office-ds/web-apps/x"
    # so'rov tanasi (socket.io polling, rasm yuklash) oqim bilan, uzunligi bilan uzatiladi
    r = c.post("/office-ds/doc/k1/c/?EIO=4&transport=polling", content=b"40")
    assert r.content == b"echo:40" and seen[-1].headers.get("content-length") == "2"
    # HEAD — tanasiz
    assert c.head("/office-ds/9.0.4-abc123/web-apps/apps/documenteditor/main/app.js").status_code == 200
    # o'chirilgan bo'lsa proksi yopiq
    admin(m).put("/api/admin/office", json={"enabled": False})
    assert c.get("/office-ds/web-apps/apps/api/documents/api.js").status_code == 404


def test_proxy_pool_is_not_the_bottleneck():
    """Avval: 100 ta ulanish va 120 s kutish — sekin mijozlar / polling pulni to'ldirsa hamma 2 daqiqa kutardi."""
    import university.api.office as AO

    assert AO._LIMITS.max_connections >= 1000
    assert AO._TIMEOUT.pool <= 15 and AO._TIMEOUT.connect <= 10


def test_stable_keys_signed_site_file_and_mobile_ui(m):
    from university import office as O

    enable(m)
    g = client(m, "10.7.0.9")
    src = "/media/0123456789abcdef.pdf"
    p = m.svc().st.media_dir / "0123456789abcdef.pdf"
    p.write_bytes(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
    v1 = g.get(f"/api/office/view?src={src}&title=Nizom").json()
    v2 = g.get(f"/api/office/view?src={src}&title=Nizom&ui=mobile").json()
    c1, c2 = v1["config"], v2["config"]
    # kalit har ochilishda bir xil — Document Server keshlangan konvertatsiyadan foydalanadi
    assert c1["document"]["key"] == c2["document"]["key"]
    assert c1["type"] == "desktop" and c2["type"] == "mobile" and O.jwt_decode(c2["token"], SECRET)["type"] == "mobile"
    # fayl /media/ (S3 → 302) orqali emas, ichki imzoli havoladan
    url = c1["document"]["url"]
    assert url.startswith("http://app:8000/api/office/src?")
    path = url.split("http://app:8000", 1)[1]
    r = g.get(path)
    assert r.status_code == 200 and r.content[:4] == b"%PDF"
    assert g.get(path.replace("sig=", "sig=0")).status_code == 403
    assert g.get(f"/api/office/src?src={src}&exp=9999999999&sig=x").status_code == 403
    # kabinet hujjati: kalit versiya bo'yicha barqaror
    t = teacher(m)
    d = t.post("/api/docs", json={"ext": "docx"}).json()
    k1 = t.get(f"/api/docs/{d['id']}/editor").json()["config"]["document"]["key"]
    e2 = t.get(f"/api/docs/{d['id']}/editor?ui=mobile").json()["config"]
    assert e2["document"]["key"] == k1 and e2["type"] == "mobile"
    admin(m).put("/api/admin/office", json={"enabled": False})


def test_connection_test_checks_both_directions(m, monkeypatch):
    import university.api.office as AO

    enable(m)
    calls: list = []

    def ds(req: httpx.Request):
        if req.url.path == "/healthcheck":
            return httpx.Response(200, text="true")
        if req.url.path == "/converter":
            body = json.loads(req.content)
            calls.append(body)
            if "token" not in body or not req.headers.get("authorization", "").startswith("Bearer "):
                return httpx.Response(200, json={"error": -8})
            # Document Server faylni app_url orqali yuklab oladi
            if body["url"].startswith("http://app:8000/"):
                r = client(m, "10.7.0.5").get(body["url"].split("http://app:8000", 1)[1])
                if r.status_code != 200 or r.content[:2] != b"PK":
                    return httpx.Response(200, json={"error": -4})
                return httpx.Response(200, json={"endConvert": True, "fileUrl": "http://ds/cache/x.pdf", "percent": 100})
            return httpx.Response(200, json={"error": -4})
        return httpx.Response(404)

    monkeypatch.setattr(AO, "SYNC_TRANSPORT", httpx.MockTransport(ds))
    r = admin(m).post("/api/admin/office/test").json()
    assert r["ok"] is True and r["problems"] == [] and r["fetch_ms"] is not None and r["health_ms"] >= 0
    assert calls[-1]["outputtype"] == "pdf" and calls[-1]["key"].startswith("probe-")
    # app_url tashqi domen bo'lsa — Document Server faylni yuklay olmaydi / aylanib yuklaydi: sabab aniq aytiladi
    enable(m, app_url="https://site.example")
    r = admin(m).post("/api/admin/office/test").json()
    assert r["ok"] is False and r["fetch_ms"] is None
    assert any("yuklab ololmadi" in p for p in r["problems"]) and any("tashqi domen" in p for p in r["problems"])
    # imzosiz tekshiruv fayli berilmaydi
    assert client(m).get("/api/office/probe?key=probe-1&exp=9999999999&sig=x").status_code == 403
    admin(m).put("/api/admin/office", json={"enabled": False, "app_url": "http://app:8000"})
