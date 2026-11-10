"""PDF sahifalari rasm ko'rinishida (/api/docpages): meta, WebP sahifa, o'zgarmas kesh sarlavhalari, fayl o'zgarsa — yangi kalit,
faqat saytdagi PDF (yo'l bilan chiqib ketish, boshqa domen, PDF bo'lmagan fayl — rad etiladi), Drive arxivi ichidagi PDF,
kabinetdagi hujjat — faqat egasiga, shifrlangan/buzuq PDF — aniq xato."""
from __future__ import annotations

import importlib
import io
import json
import os
import time
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

pdfium = pytest.importorskip("pypdfium2")

DEMO_PW = "demo2025"
MEDIA_PDF = "a1b2c3d4e5f60001.pdf"


def make_pdf(pages: int = 3, size=(595, 842)) -> bytes:
    doc = pdfium.PdfDocument.new()
    for i in range(pages):
        doc.new_page(*(size if i else (size[0] * 2, size[1])))  # 1-sahifa — yotiq (nisbat to'g'ri qaytsinmi)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


@pytest.fixture(scope="module")
def m(tmp_path_factory):
    static = tmp_path_factory.mktemp("static")
    (static / "index.html").write_text("<!doctype html><html><body><div id=root></div></body></html>", encoding="utf-8")
    os.environ["SITE_DATA_DIR"] = str(tmp_path_factory.mktemp("data"))
    os.environ["SITE_STATIC_DIR"] = str(static)
    os.environ["SITE_DEMO_PASSWORD"] = DEMO_PW
    os.environ["SITE_PREWARM"] = "0"
    import university.api.deps as deps
    import university.api.main as main
    from university import docpages as D

    importlib.reload(main)
    deps.reset_service()
    D.reset()
    mdir = deps.svc().st.media_dir
    mdir.mkdir(parents=True, exist_ok=True)
    (mdir / MEDIA_PDF).write_bytes(make_pdf())
    (mdir / "0123456789abcdef.pdf").write_bytes(b"<html>bu PDF emas</html>")
    (mdir / "bbbbbbbbbbbbbbbb.pdf").write_bytes(b"%PDF-1.4\n" + b"buzuq" * 100)
    yield main
    D.reset()


def client(m, ip="10.9.0.1"):
    return TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126", "x-forwarded-for": ip})


def test_meta_and_page_images(m):
    from university import docpages as D

    c = client(m)
    r = c.get("/api/docpages", params={"src": f"/media/{MEDIA_PDF}", "w": 800})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pages"] == 3 and body["sizes"][0] == [1190.0, 842.0] and body["sizes"][1] == [595.0, 842.0]
    key = body["version"]
    assert D.is_key(key)
    # birinchi ikki sahifa javobdan oldin tayyor (keshda)
    assert D.page_path(key, 800, 1).is_file() and D.page_path(key, 800, 2).is_file()
    img = c.get(f"/api/docpages/img/{key}/1.webp", params={"w": 800})
    assert img.status_code == 200 and img.headers["content-type"] == "image/webp"
    assert img.content[:4] == b"RIFF" and img.content[8:12] == b"WEBP"
    assert img.headers["cache-control"] == "public, max-age=31536000, immutable"
    from PIL import Image

    with Image.open(io.BytesIO(img.content)) as im:
        assert im.size == (800, 566)  # yotiq sahifa: 1190×842 → 800×566
    # keshda yo'q sahifa — so'ralganda chiziladi; boshqa kenglik ham
    r3 = c.get(f"/api/docpages/img/{key}/3.webp", params={"w": 1200})
    assert r3.status_code == 200
    with Image.open(io.BytesIO(r3.content)) as im:
        assert im.size[0] == 1200
    # chegaradan tashqari: sahifa yo'q, ruxsat etilmagan kenglik, noto'g'ri kalit
    assert c.get(f"/api/docpages/img/{key}/4.webp").status_code == 404
    assert c.get(f"/api/docpages/img/{key}/0.webp").status_code == 404
    assert c.get(f"/api/docpages/img/{key}/1.webp", params={"w": 5000}).status_code == 404
    assert c.get("/api/docpages/img/zzzz/1.webp").status_code == 404
    assert c.get(f"/api/docpages/img/{'0' * 32}/1.webp").status_code == 404


def test_media_file_and_new_key_after_change(m):
    from university.api.deps import svc

    st = svc().st
    p = st.media_dir / "0123456789abcdef.pdf"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(make_pdf(2))
    c = client(m)
    r = c.get("/api/docpages", params={"src": "/media/0123456789abcdef.pdf"})
    assert r.status_code == 200 and r.json()["pages"] == 2
    k1 = r.json()["version"]
    assert c.get(f"/api/docpages/img/{k1}/2.webp").status_code == 200
    time.sleep(0.01)
    p.write_bytes(make_pdf(4))  # fayl almashtirildi — eski kalit yaroqsiz, yangisi boshqa
    r2 = c.get("/api/docpages", params={"src": "/media/0123456789abcdef.pdf"})
    assert r2.json()["pages"] == 4 and r2.json()["version"] != k1
    assert c.get(f"/api/docpages/img/{k1}/1.webp").status_code == 404


@pytest.mark.parametrize(
    "src",
    [
        "/media/../media/a1b2c3d4e5f60001.pdf",
        "/media/..%2fa1b2c3d4e5f60001.pdf",
        "/media/../../etc/passwd",
        "/etc/passwd",
        "../a1b2c3d4e5f60001.pdf",
        "https://evil.example/media/a1b2c3d4e5f60001.pdf",
        "//evil.example/media/a1b2c3d4e5f60001.pdf",
        "/media/a1b2c3d4e5f60001.pdf?x=1",
        "/media/A1B2C3D4E5F60001.pdf",
        "/media/0123456789abcdef.docx",
        "/media/ffffffffffffffff.pdf",  # yo'q fayl
        "/api/gdrive/archive/1ArchiveZipIdXXXXXXXXXXXXXXXX/f/..%2F..%2Findex.json",
        "/api/docs/0123456789abcdef/download",
        "",
    ],
)
def test_rejects_foreign_and_traversal(m, src):
    assert client(m).get("/api/docpages", params={"src": src}).status_code == 404


def test_not_pdf_broken_and_encrypted(m, tmp_path):
    c = client(m)
    r = c.get("/api/docpages", params={"src": "/media/0123456789abcdef.pdf"})
    assert r.status_code == 400 and r.json()["detail"] == "not_pdf"
    r = c.get("/api/docpages", params={"src": "/media/bbbbbbbbbbbbbbbb.pdf"})
    assert r.status_code == 422 and r.json()["detail"] == "broken"
    from pypdf import PdfReader, PdfWriter

    from university.api import deps

    w = PdfWriter()
    for pg in PdfReader(io.BytesIO(make_pdf(1))).pages:
        w.add_page(pg)
    w.encrypt(user_password="maxfiy", owner_password="egasi")
    buf = io.BytesIO()
    w.write(buf)
    (deps.svc().st.media_dir / "eeeeeeeeeeeeeeee.pdf").write_bytes(buf.getvalue())
    r = c.get("/api/docpages", params={"src": "/media/eeeeeeeeeeeeeeee.pdf"})
    assert r.status_code == 422 and r.json()["detail"] == "encrypted"


def test_archive_entry(m):
    from university import gdrive_archive as A

    fid = "1ArchiveZipIdXXXXXXXXXXXXXXXX"
    inner = "Rejalar/2024/O‘quv reja — 60310100.pdf"
    d = A.base_dir() / fid
    (d / "files").mkdir(parents=True, exist_ok=True)
    f = A._disk_name(inner)  # noqa: SLF001
    (d / "files" / f).write_bytes(make_pdf(2))
    (d / "files" / A._disk_name("Rejalar/a.png")).write_bytes(b"\x89PNG")  # noqa: SLF001
    idx = {"name": "x.zip", "entries": [{"path": inner, "name": inner.rsplit("/", 1)[1], "kind": "file", "size": 1, "mime": "application/pdf", "f": f},
                                        {"path": "Rejalar/a.png", "name": "a.png", "kind": "file", "size": 4, "mime": "image/png", "f": A._disk_name("Rejalar/a.png")}]}  # noqa: SLF001
    (d / "index.json").write_text(json.dumps(idx), encoding="utf-8")
    c = client(m)
    src = f"/api/gdrive/archive/{fid}/f/" + "/".join(quote(x) for x in inner.split("/"))
    r = c.get("/api/docpages", params={"src": src})
    assert r.status_code == 200 and r.json()["pages"] == 2
    assert c.get(f"/api/docpages/img/{r.json()['version']}/2.webp").status_code == 200
    assert c.get("/api/docpages", params={"src": f"/api/gdrive/archive/{fid}/f/Rejalar/a.png"}).status_code == 404
    assert c.get("/api/docpages", params={"src": f"/api/gdrive/archive/{fid}/f/Rejalar/yoq.pdf"}).status_code == 404


def test_cabinet_doc_only_for_owner(m):
    owner = client(m, "10.9.0.5")
    assert owner.post("/api/auth/login", json={"login": "teacher", "password": DEMO_PW}).status_code == 200
    up = owner.post("/api/docs/upload", files={"file": ("Buyruq.pdf", make_pdf(2), "application/pdf")})
    assert up.status_code == 200, up.text
    src = f"/api/docs/{up.json()['id']}/download"
    r = owner.get("/api/docpages", params={"src": src})
    assert r.status_code == 200 and r.json()["pages"] == 2
    assert r.headers["cache-control"] == "private, no-store"
    img = owner.get(f"/api/docpages/img/{r.json()['version']}/1.webp")
    assert img.status_code == 200 and img.headers["cache-control"].startswith("private,")
    assert client(m, "10.9.0.6").get("/api/docpages", params={"src": src}).status_code == 404  # boshqa odam (mehmon)
