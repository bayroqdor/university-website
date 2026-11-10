"""Muharrir: ochiq rasm bazasi (Openverse) proksisi — kirish talab qilinadi, so'rov tekshiruvi, kesh, import (sayt mediasiga),
rasm bo'lmagan / juda katta fayllarni rad etish, so'rovlar chegarasi. Tarmoq (Openverse) soxta provayder bilan almashtiriladi."""
import importlib
import io
import re

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
    return TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126", "x-forwarded-for": f"10.66.{next(_n) % 200}.{next(_n) % 200}"})


_sessions: dict = {}


def login(m, user, pw=DEMO_PW, panel=False):
    key = (user, panel)
    if key in _sessions:
        return _sessions[key]
    c = client(m)
    r = c.post("/api/admin/login" if panel else "/api/auth/login", json={"login": user, "password": pw})
    assert r.status_code == 200, r.text
    if panel:
        c.headers["x-admin-realm"] = "admin"
    _sessions[key] = c
    return c


def _jpeg(w=640, h=400, color=(10, 46, 115)) -> bytes:
    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", (w, h), color).save(out, "JPEG", quality=80)
    return out.getvalue()


def _row(n: int) -> dict:
    return {
        "id": f"0000000{n}-aaaa-bbbb-cccc-dddddddddddd", "title": f"Campus {n}", "url": f"https://img.example.org/full/{n}.jpg",
        "thumbnail": f"https://api.openverse.org/v1/images/{n}/thumb/", "foreign_landing_url": f"https://www.flickr.com/photos/x/{n}",
        "creator": f"Author {n}", "creator_url": f"https://www.flickr.com/people/{n}" if n % 2 else "javascript:alert(1)",
        "license": "by-sa" if n % 2 else "cc0", "license_version": "2.0" if n % 2 else "1.0",
        "license_url": "https://creativecommons.org/licenses/by-sa/2.0/", "provider": "flickr", "source": "flickr" if n % 2 else "wikimedia",
        "width": 1024, "height": 683,
    }


@pytest.fixture()
def prov(m, monkeypatch):
    """Openverse provayderi — tarmoq qismi (JSON va fayl yuklash) soxta."""
    import university.api.deps as deps
    import university.openimg as O
    from university.media import FetchError

    files: dict[str, bytes] = {}
    calls: list[str] = []

    class P(O.Openverse):
        busy = False

        def _get_json(self, url):
            calls.append(url)
            if self.busy:
                raise O.ProviderError("provider_busy")
            if "/images/?" in url:
                page = int(re.search(r"[?&]page=(\d+)", url).group(1))
                return {"result_count": 30, "page_count": 2, "results": [_row(n) for n in range((page - 1) * 20, min(page * 20, 30))] + [{"id": "../bad", "url": "x"}]}
            mm = re.search(r"/images/([^/]+)/$", url)
            n = int(mm.group(1).split("-")[0]) if mm and mm.group(1)[0].isdigit() else -1
            if n < 0:
                raise O.ProviderError("not_found")
            return _row(n)

    def fake_fetch(url, max_bytes=0, timeout=0, ua=None):
        assert ua and "University" in ua
        if url not in files:
            raise FetchError("fetch_failed:HTTPError")
        if len(files[url]) > max_bytes:
            raise FetchError("too_large")
        return files[url], url.rsplit("/", 1)[-1]

    monkeypatch.setattr(O, "safe_fetch", fake_fetch)
    p = P()
    O.set_provider(p)
    deps._attempts.clear()  # noqa: SLF001
    for n in range(30):
        files[f"https://img.example.org/full/{n}.jpg"] = _jpeg()
        files[f"https://api.openverse.org/v1/images/{n}/thumb/"] = _jpeg(200, 133)
    yield p, files, calls
    O.set_provider(None)


ADM = "/api/admin/media/openimg"
POR = "/api/portal/openimg"


def test_login_required(m, prov):
    anon = client(m)
    for base in (ADM, POR):
        assert anon.get(f"{base}/search", params={"q": "campus"}).status_code == 401
        assert anon.get(f"{base}/thumb/1-aaaa").status_code == 401
        assert anon.post(f"{base}/import", json={"id": "1-aaaa"}).status_code == 401
    # kabinet sessiyasi admin yo'llarida ishlamaydi
    s = login(m, "student")
    assert s.get(f"{ADM}/search", params={"q": "campus"}).status_code == 401
    assert s.get(f"{POR}/search", params={"q": "campus"}).status_code == 200
    assert login(m, "teacher").get(f"{POR}/search", params={"q": "campus"}).status_code == 200
    assert login(m, "admin", ADMIN_PW, panel=True).get(f"{ADM}/search", params={"q": "campus"}).status_code == 200


def test_query_validation(m, prov):
    a = login(m, "admin", ADMIN_PW, panel=True)
    for q in ("", " ", "a", "x" * 101):
        r = a.get(f"{ADM}/search", params={"q": q})
        assert r.status_code == 400 and r.json()["detail"] == "bad_query", q
    for page in (0, 13, -1):
        assert a.get(f"{ADM}/search", params={"q": "campus", "page": page}).status_code == 400
    assert a.post(f"{ADM}/import", json={"id": "../../etc/passwd"}).json()["detail"] == "bad_id"
    assert a.post(f"{ADM}/import", json={}).status_code == 400
    assert a.get(f"{ADM}/thumb/..%2Fx").status_code == 404
    assert prov[2] == []  # provayderga hech narsa yuborilmadi


def test_search_normalized_and_cached(m, prov):
    _, _, calls = prov
    a = login(m, "admin", ADMIN_PW, panel=True)
    r = a.get(f"{ADM}/search", params={"q": "  Campus   life ", "page": 1})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["page"] == 1 and d["pages"] == 2 and d["total"] == 30 and len(d["items"]) == 20  # yaroqsiz yozuv tashlab yuborildi
    one = d["items"][1]
    assert one["license"] == "CC BY-SA 2.0" and one["source"] == "Flickr" and one["creator"] == "Author 1"
    assert one["creator_url"] == "https://www.flickr.com/people/1" and one["source_url"].startswith("https://www.flickr.com/")
    zero = d["items"][0]
    assert zero["license"] == "CC0 1.0" and zero["source"] == "Wikimedia Commons" and zero["creator_url"] is None  # javascript: olib tashlandi
    assert not any(k.startswith("_") for k in one)  # asl manzillar brauzerga berilmaydi
    assert "license_type=commercial%2Cmodification" in calls[0] and "page_size=20" in calls[0] and "q=Campus+life" in calls[0]
    # qisqa kesh: bir xil so'rov provayderga qayta yuborilmaydi
    assert a.get(f"{ADM}/search", params={"q": "campus life"}).json()["items"][0]["id"] == zero["id"]
    assert len(calls) == 1
    assert len(a.get(f"{ADM}/search", params={"q": "campus life", "page": 2}).json()["items"]) == 10
    assert len(calls) == 2


def test_thumb_proxied(m, prov):
    _, files, _ = prov
    s = login(m, "student")
    items = s.get(f"{POR}/search", params={"q": "campus"}).json()["items"]
    r = s.get(f"{POR}/thumb/{items[3]['id']}")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg" and r.content[:2] == b"\xff\xd8"
    assert r.headers["x-content-type-options"] == "nosniff" and "sandbox" in r.headers["content-security-policy"]
    files["https://api.openverse.org/v1/images/4/thumb/"] = b"<html><script>alert(1)</script></html>"
    assert s.get(f"{POR}/thumb/{items[4]['id']}").status_code == 502
    # Openverse kichik rasmi ishlamasa (manba 424) — asl fayldan kichraytiriladi
    del files["https://api.openverse.org/v1/images/5/thumb/"]
    files["https://img.example.org/full/5.jpg"] = _jpeg(2000, 1000)
    r = s.get(f"{POR}/thumb/{items[5]['id']}")
    assert r.status_code == 200
    from PIL import Image

    assert Image.open(io.BytesIO(r.content)).size == (480, 240)


def test_wikimedia_sizes():
    import university.openimg as O

    u = "https://upload.wikimedia.org/wikipedia/commons/4/4a/Graz_University-Library_reading-room.jpg"
    assert O.wikimedia_thumb(u, 1280) == "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Graz_University-Library_reading-room.jpg/1280px-Graz_University-Library_reading-room.jpg"
    assert O.wikimedia_thumb("https://live.staticflickr.com/1/2.jpg", 1280) is None
    assert O.wikimedia_thumb("https://upload.wikimedia.org/wikipedia/commons/a/ab/Map.svg", 1280) is None
    assert O.license_label("by-nc", "4.0") == "CC BY-NC 4.0" and O.license_label("pdm", "") == "Public Domain Mark 1.0"


def test_import_stores_local_media(m, prov):
    a = login(m, "admin", ADMIN_PW, panel=True)
    items = a.get(f"{ADM}/search", params={"q": "campus"}).json()["items"]
    before = len(a.get("/api/admin/media").json()["items"])
    r = a.post(f"{ADM}/import", json={"id": items[1]["id"]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert re.fullmatch(r"/media/[0-9a-f]{16}\.jpg", d["url"])  # tashqi havola emas — sayt mediasi
    assert d["width"] == 640 and d["alt"] == "Campus 1"
    assert d["credit"] == {"creator": "Author 1", "creator_url": "https://www.flickr.com/people/1", "source": "Flickr",
                           "source_url": "https://www.flickr.com/photos/x/1", "license": "CC BY-SA 2.0",
                           "license_url": "https://creativecommons.org/licenses/by-sa/2.0/"}
    assert d["credit_text"] == "Foto: Author 1 / Flickr, CC BY-SA 2.0"
    got = client(m).get(d["url"])
    assert got.status_code == 200 and got.content[:2] == b"\xff\xd8"
    assert len(a.get("/api/admin/media").json()["items"]) == before + 1
    # kabinetdan ham (forum / blog), keshda bo'lmagan rasm — provayderdan id bo'yicha olinadi
    s = login(m, "student")
    r = s.post(f"{POR}/import", json={"id": "00000025-aaaa-bbbb-cccc-dddddddddddd"})
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("/media/") and r.json()["credit"]["source"] == "Flickr"
    assert s.post(f"{POR}/import", json={"id": "zzz-unknown"}).status_code == 404


def test_import_rejects_non_image_and_oversize(m, prov):
    _, files, _ = prov
    from university.media import MAX_MEDIA

    a = login(m, "admin", ADMIN_PW, panel=True)
    items = a.get(f"{ADM}/search", params={"q": "campus"}).json()["items"]
    before = len(a.get("/api/admin/media").json()["items"])
    files["https://img.example.org/full/5.jpg"] = b"<!doctype html><html>not an image</html>"
    files["https://img.example.org/full/6.jpg"] = b"%PDF-1.4\n%fake pdf\n"
    files["https://img.example.org/full/7.jpg"] = b"\xff\xd8" + b"0" * (MAX_MEDIA + 10)
    del files["https://img.example.org/full/8.jpg"]
    assert a.post(f"{ADM}/import", json={"id": items[5]["id"]}).json()["detail"] == "not_image"
    assert a.post(f"{ADM}/import", json={"id": items[6]["id"]}).json()["detail"] == "not_image"  # PDF media sifatida saqlanmaydi
    r = a.post(f"{ADM}/import", json={"id": items[7]["id"]})
    assert r.status_code == 400 and r.json()["detail"] == "too_large"
    assert a.post(f"{ADM}/import", json={"id": items[8]["id"]}).json()["detail"] == "fetch_failed"
    assert len(a.get("/api/admin/media").json()["items"]) == before


def test_rate_limit_and_provider_errors(m, prov, monkeypatch):
    import university.api.openimg as api

    p = prov[0]
    monkeypatch.setitem(api.LIMITS, "search", (3, 60))
    monkeypatch.setitem(api.LIMITS, "import", (1, 600))
    s = login(m, "teacher")
    codes = [s.get(f"{POR}/search", params={"q": f"lab {i}"}).status_code for i in range(4)]
    assert codes == [200, 200, 200, 429]
    items = login(m, "student").get(f"{POR}/search", params={"q": "campus"}).json()["items"]
    assert s.post(f"{POR}/import", json={"id": items[2]["id"]}).status_code == 200
    assert s.post(f"{POR}/import", json={"id": items[3]["id"]}).status_code == 429
    # provayder band / ishlamayapti
    p.busy = True
    a = login(m, "admin", ADMIN_PW, panel=True)
    r = a.get(f"{ADM}/search", params={"q": "something new"})
    assert r.status_code == 503 and r.json()["detail"] == "provider_busy"


def test_credit_attrs_survive_blog_doc_cleaning(m):
    from university.community import clean_doc

    fig = {"type": "figure", "attrs": {"src": "/media/abc.jpg", "alt": "x", "caption": "", "width": "normal", "credit": "Author",
                                       "creditUrl": "javascript:alert(1)", "source": "Flickr", "sourceUrl": "https://www.flickr.com/p/1",
                                       "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/"}}
    out = clean_doc({"type": "doc", "content": [fig]})
    a = out["content"][0]["attrs"]
    assert a["credit"] == "Author" and a["creditUrl"] == "" and a["sourceUrl"] == "https://www.flickr.com/p/1" and a["license"] == "CC BY 2.0"
