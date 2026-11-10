"""Google Drive'dagi arxiv (ZIP/7z/RAR) ichidagi hujjatlar: fonda yuklash/ochish, /api/gdrive/archive/* (tarmoqsiz — yuklash soxtalashtiriladi).

Xavfsizlik: «../» va mutlaq yo'llar (zip-slip), symlink, cheklovlar (yozuvlar soni, hajm), faqat index'dagi yo'llar beriladi,
HTML/SVG saytning domenida ochilmaydi, faqat saytda havolasi bor arxivlar yuklanadi.
"""
from __future__ import annotations

import io
import json
import stat
import threading
import time
import zipfile
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from university import gdrive_archive as A
from university.api import gdrive as G

ARC = "1ArchiveZipIdXXXXXXXXXXXXXXXX"
OTHER = "1NotLinkedIdXXXXXXXXXXXXXXXXX"
PLAIN = "1PlainPdfIdXXXXXXXXXXXXXXXXXX"
PDF = b"%PDF-1.4\n" + b"0" * 5000 + b"\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def make_zip(extra: list[tuple[str, bytes]] | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("Rejalar/", b"")
        z.writestr("Rejalar/2024/O‘quv reja — 60310100.pdf", PDF)  # UTF-8 nom (zipfile 0x800 belgisini qo'yadi)
        z.writestr("Rejalar/rasm.png", PNG)
        z.writestr("Rejalar/sahifa.html", b"<script>alert(1)</script>")
        z.writestr("../evil.pdf", b"evil")  # zip-slip
        z.writestr("/etc/abs.pdf", b"abs")
        z.writestr("Rejalar/../../up.pdf", b"up")
        z.writestr("__MACOSX/Rejalar/._x.pdf", b"junk")
        link = zipfile.ZipInfo("Rejalar/link.pdf")
        link.external_attr = (stat.S_IFLNK | 0o777) << 16  # symlink
        link.create_system = 3
        z.writestr(link, "/etc/passwd")
        for name, data in extra or []:
            z.writestr(name, data)
    return buf.getvalue()


def make_7z() -> bytes:
    import libarchive

    out = io.BytesIO()
    with libarchive.custom_writer(out.write, "7zip") as w:
        w.add_file_from_memory("Hujjatlar/a.pdf", len(PDF), PDF)
        w.add_file_from_memory("../b.pdf", 3, b"bad")
    return out.getvalue()


class FakeGoogle:
    """Google: /open — fayl; embeddedfolderview — fayl nomi <title> da."""

    names = {ARC: "O&#39;quv reja 2023-24.zip", OTHER: "boshqa.zip", PLAIN: "Nizom.pdf"}

    def __call__(self, url, params):
        req = httpx.Request("GET", url, params=params)
        if url.endswith("/open"):
            return httpx.Response(307, headers={"location": f"https://drive.google.com/file/d/{params['id']}/view"}, request=req)
        return httpx.Response(200, text=f"<html><head><title>{self.names.get(params['id'], 'x.pdf')}</title></head><body></body></html>", request=req)


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("SITE_DATA_DIR", str(tmp_path / "data"))
    A.reset()
    G.clear_cache()
    monkeypatch.setattr(G, "_get", FakeGoogle())
    monkeypatch.setattr(A, "linked_ids", lambda force=False: {ARC, PLAIN})
    state = {"blob": make_zip(), "calls": 0, "gate": None}

    def fake_download(fid, dest, job):
        state["calls"] += 1
        if state["gate"]:
            state["gate"].wait(5)
        data = state["blob"]
        job["total"] = len(data)
        Path(dest).write_bytes(data)
        job["done"] = len(data)
        return "from-google.zip"

    monkeypatch.setattr(A, "download", fake_download)
    app = FastAPI()
    app.include_router(G.router)
    yield TestClient(app, headers={"x-forwarded-for": "10.78.0.1"}), state, tmp_path
    A.reset()
    G.clear_cache()


def wait_ready(c, fid=ARC, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        r = c.get(f"/api/gdrive/archive/{fid}")
        body = r.json()
        if body.get("status") != "preparing":
            return r, body
        assert 0 <= body["progress"] <= 1
        time.sleep(0.05)
    raise AssertionError("tayyor bo'lmadi")


def test_kind_reports_archive(env):
    c, _, _ = env
    body = c.get(f"/api/gdrive/kind/{ARC}").json()
    assert body == {"id": ARC, "kind": "file", "name": "O'quv reja 2023-24.zip", "archive": True}
    assert c.get(f"/api/gdrive/kind/{PLAIN}").json()["archive"] is False


def test_zip_extract_and_serve(env):
    c, state, tmp = env
    r, body = wait_ready(c)
    assert r.status_code == 200 and body["status"] == "ready" and body["name"] == "O'quv reja 2023-24.zip"
    paths = {e["path"]: e for e in body["entries"]}
    pdf_path = "Rejalar/2024/O‘quv reja — 60310100.pdf"
    assert set(paths) == {"Rejalar", "Rejalar/2024", pdf_path, "Rejalar/rasm.png", "Rejalar/sahifa.html"}
    assert paths["Rejalar"]["kind"] == "folder" and paths["Rejalar/2024"]["kind"] == "folder"
    assert paths[pdf_path] == {"path": pdf_path, "name": "O‘quv reja — 60310100.pdf", "kind": "file", "size": len(PDF), "mime": "application/pdf"}
    assert "f" not in paths[pdf_path]  # diskdagi nom tashqariga chiqmaydi
    # arxivdagi «../evil.pdf» va boshqalar hech qayerga yozilmagan
    data = tmp / "data"
    assert not any(p.name in ("evil.pdf", "abs.pdf", "up.pdf") for p in tmp.rglob("*"))
    assert not list(data.rglob("archive.bin"))  # yuklangan arxiv o'chirilgan
    assert not [p for p in (data / "cache" / "gdrive-arch").iterdir() if p.name.startswith(".tmp")]

    url = f"/api/gdrive/archive/{ARC}/f/Rejalar/2024/O%E2%80%98quv%20reja%20%E2%80%94%2060310100.pdf"
    f = c.get(url)
    assert f.status_code == 200 and f.content == PDF and f.headers["content-type"] == "application/pdf"
    cd = f.headers["content-disposition"]
    assert cd.startswith("inline;") and "filename*=utf-8''O%E2%80%98quv%20reja" in cd
    assert "max-age=604800" in f.headers["cache-control"] and f.headers["x-content-type-options"] == "nosniff"
    assert f.headers.get("accept-ranges") == "bytes"
    part = c.get(url, headers={"Range": "bytes=0-8"})  # pdf.js kerakli qismlarni Range bilan oladi
    assert part.status_code == 206 and part.content == PDF[:9]
    assert c.get(url + "?dl=1").headers["content-disposition"].startswith("attachment;")

    img = c.get(f"/api/gdrive/archive/{ARC}/f/Rejalar/rasm.png")
    assert img.headers["content-type"] == "image/png" and img.headers["content-disposition"].startswith("inline;")
    h = c.get(f"/api/gdrive/archive/{ARC}/f/Rejalar/sahifa.html")
    assert h.headers["content-type"] == "application/octet-stream" and h.headers["content-disposition"].startswith("attachment;")
    assert "sandbox" in h.headers["content-security-policy"]

    for bad in ("../evil.pdf", "Rejalar/link.pdf", "Rejalar/../../up.pdf", "..%2F..%2F..%2Fetc%2Fpasswd", "Rejalar", "index.json", "files"):
        assert c.get(f"/api/gdrive/archive/{ARC}/f/{bad}").status_code == 404, bad
    assert c.get("/api/gdrive/archive/short/f/a.pdf").status_code == 404
    assert state["calls"] == 1
    # ikkinchi so'rov — diskdagi tayyor nusxadan (Google'ga bormaydi)
    assert c.get(f"/api/gdrive/archive/{ARC}").json()["status"] == "ready" and state["calls"] == 1


def test_seven_zip_via_libarchive(env):
    c, state, _ = env
    state["blob"] = make_7z()
    _, body = wait_ready(c)
    assert [e["path"] for e in body["entries"]] == ["Hujjatlar", "Hujjatlar/a.pdf"]
    assert c.get(f"/api/gdrive/archive/{ARC}/f/Hujjatlar/a.pdf").content == PDF


def test_only_linked_archives(env):
    c, state, _ = env
    r = c.get(f"/api/gdrive/archive/{OTHER}")
    assert r.status_code == 404 and r.json()["detail"] == "not_linked"
    r = c.get(f"/api/gdrive/archive/{PLAIN}")
    assert r.status_code == 404 and r.json()["detail"] == "not_archive"
    for bad in ("short", "a" * 200):
        assert c.get(f"/api/gdrive/archive/{bad}").status_code == 404
    assert state["calls"] == 0


def test_concurrent_requests_one_job(env):
    c, state, _ = env
    state["gate"] = threading.Event()
    bodies = [c.get(f"/api/gdrive/archive/{ARC}").json() for _ in range(4)]
    assert all(b["status"] == "preparing" for b in bodies)
    assert c.get(f"/api/gdrive/archive/{ARC}").headers["cache-control"] == "no-store"
    state["gate"].set()
    wait_ready(c)
    assert state["calls"] == 1


def test_limits(env, monkeypatch):
    c, state, _ = env
    monkeypatch.setattr(A, "MAX_FILES", 3)
    _, body = wait_ready(c)
    assert body == {"id": ARC, "status": "error", "code": "too_many"}
    assert c.get(f"/api/gdrive/archive/{ARC}").json()["status"] == "error" and state["calls"] == 1  # xato eslab qolinadi
    A.reset()
    monkeypatch.setattr(A, "MAX_FILES", 5000)
    monkeypatch.setattr(A, "MAX_TOTAL", 4000)  # PDF 5 KB dan katta
    _, body = wait_ready(c)
    assert body["status"] == "error" and body["code"] == "too_large"
    A.reset()
    monkeypatch.setattr(A, "MAX_TOTAL", 10 * A.MB)
    state["blob"] = b"bu arxiv emas" * 100
    _, body = wait_ready(c)
    assert body["status"] == "error" and body["code"] == "bad_archive"


def test_stale_copy_served_while_refreshing(env):
    c, state, tmp = env
    wait_ready(c)
    idx_path = tmp / "data" / "cache" / "gdrive-arch" / ARC / "index.json"
    idx = json.loads(idx_path.read_text("utf-8"))
    idx["fetched"] = time.time() - A.REFRESH - 10
    idx_path.write_text(json.dumps(idx, ensure_ascii=False), "utf-8")
    state["blob"] = make_zip([("Rejalar/yangi.pdf", PDF)])
    state["gate"] = threading.Event()
    body = c.get(f"/api/gdrive/archive/{ARC}").json()
    assert body["status"] == "ready" and "Rejalar/yangi.pdf" not in {e["path"] for e in body["entries"]}  # eski nusxa darhol
    assert c.get(f"/api/gdrive/archive/{ARC}/f/Rejalar/rasm.png").status_code == 200
    state["gate"].set()
    end = time.time() + 10
    while ARC in A._jobs and time.time() < end:
        time.sleep(0.05)
    body = c.get(f"/api/gdrive/archive/{ARC}").json()
    assert "Rejalar/yangi.pdf" in {e["path"] for e in body["entries"]} and state["calls"] == 2


def test_clean_path():
    assert A.clean_path("a\\b\\c.pdf") == "a/b/c.pdf"
    assert A.clean_path("./a//b.pdf") == "a/b.pdf"
    for bad in ("../x", "a/../../x", "/abs", "C:/win.pdf", "a/\x00b", "", None, "__MACOSX/x", "a/.DS_Store", "a/._x.pdf"):
        assert A.clean_path(bad) is None, bad
    assert A.clean_path("Отчёт.pdf".encode("cp866")) == "Отчёт.pdf"
    assert A.is_archive_name("O'quv reja.RAR") and A.is_archive_name("a.tar.gz") and not A.is_archive_name("a.pdf")


def test_confirm_form_and_disposition():
    page = ('<form id="download-form" action="https://drive.usercontent.google.com/download" method="get">'
            '<input type="hidden" name="id" value="1abc"><input type="hidden" name="confirm" value="t"><input type="hidden" name="uuid" value="u-1"></form>')
    assert A._confirm_form(page) == ("https://drive.usercontent.google.com/download", {"id": "1abc", "confirm": "t", "uuid": "u-1"})
    assert A._disposition_name("attachment; filename=\"O'quv reja.rar\"; filename*=UTF-8''O%27quv%20reja%E2%80%99.rar") == "O'quv reja’.rar"
    assert A._google_host("drive.usercontent.google.com") and not A._google_host("google.com.evil.uz")


def test_linked_ids_from_content(tmp_path, monkeypatch):
    """Sayt kontentidagi (items) Drive fayl havolalari topiladi; boshqa ID'lar — yo'q."""
    from university.api import deps

    monkeypatch.setenv("SITE_DATA_DIR", str(tmp_path / "data2"))
    deps.reset_service()
    A.reset()
    st = deps.svc().st
    html = ('<ul><li><a href="https://drive.google.com/file/d/148TJCAkuhcwPY_G-L8DjcR5lvBid1BV2/view">2023–2024</a></li>'
            '<li><a href="https://drive.google.com/open?usp=sharing&amp;id=1RnJBXBe3drUj3oHCDpriuUaJ14noFYTx">x</a></li></ul>')
    st.save_item("page", {"status": "published", "title": "O'quv rejalar", "slug": "oquv-rejalar-test"}, {"body": html})
    ids = A.linked_ids(force=True)
    assert {"148TJCAkuhcwPY_G-L8DjcR5lvBid1BV2", "1RnJBXBe3drUj3oHCDpriuUaJ14noFYTx"} <= ids
    assert OTHER not in ids
    deps.reset_service()
