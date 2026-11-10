"""Google Drive papkasi: embeddedfolderview sahifasini tahlil qilish va /api/gdrive/* (tarmoqsiz — Google javobi soxtalashtiriladi)."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from university.api import gdrive as G

# Google'ning haqiqiy embeddedfolderview belgilashidan qisqartirilgan namuna (2026-10): papka, ikonali fayl, eskizli fayl, Google Sheets
ENTRY = (
    '<div class="flip-entry" id="entry-{id}" tabindex="0" role="link"><div class="flip-entry-info"><a href="{href}" target="_blank">'
    '<div class="flip-entry-visual"><div class="flip-entry-visual-card">{visual}</div></div>'
    '<div class="flip-entry-list-icon">{icon}</div><div class="flip-entry-title">{name}</div></a></div>'
    '<div class="flip-entry-last-modified"><div>{date}</div></div></div>'
)
FOLDER_ICON = '<div aria-label="Folder" class="icon-color-1 drive-sprite-folder-list-shared-icon"></div>'


def page(title: str, entries: list[str]) -> str:
    return (
        f'<!DOCTYPE html><html><head><title>{title}</title><meta http-equiv="content-type" content="text/html; charset=utf-8"/></head>'
        '<body class="flip-embedded"><div id="flip-contents" class="flip-contents flip-list-view"><script>var x=1;</script>'
        '<div class="flip-list-header"><div class="flip-list-title-header">TITLE</div></div>'
        f'<div class="flip-entries">{"".join(entries)}</div></div></body></html>'
    )


FIXTURE = page("Buyruqlar &amp; nizomlar", [
    ENTRY.format(id="1Ox3Hjpd1HgXkoi3YmI3i7VpEjEVTSESv", href="https://drive.google.com/file/d/1Ox3Hjpd1HgXkoi3YmI3i7VpEjEVTSESv/view?usp=drive_web",
                 visual='<div class="flip-entry-icon"><img src="https://drive-thirdparty.googleusercontent.com/128/type/application/pdf" alt="PDF"/></div>',
                 icon='<img src="https://drive-thirdparty.googleusercontent.com/16/type/application/pdf" alt=""/>', name="Buyruq №12 &quot;Qabul&quot;.pdf", date="12/15/21"),
    ENTRY.format(id="1Co4PKflkM9_49_pTxX84VeVEutdVf1W5", href="https://drive.google.com/drive/folders/1Co4PKflkM9_49_pTxX84VeVEutdVf1W5",
                 visual=FOLDER_ICON.replace("list", "grid"), icon=FOLDER_ICON, name="2025-yil", date="May 4"),
    ENTRY.format(id="1w08kHzFZbvbHunnQGgbsk08jx7ypjik4", href="https://drive.google.com/file/d/1w08kHzFZbvbHunnQGgbsk08jx7ypjik4/view?usp=drive_web&amp;resourcekey=0-AbC_d",
                 visual='<div class="flip-entry-thumb"><img src="https://lh3.googleusercontent.com/drive-storage/AJQ=s190" alt="Microsoft Excel (.xlsx)"/></div>',
                 icon='<img src="https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" alt=""/>',
                 name="Kontrakt narxlari.xlsx", date="3:45 PM"),
    ENTRY.format(id="1a5c2Ubetp3eUW3ctySSyyOVVdk5UfiYYuTbIMKsIB0k", href="https://docs.google.com/spreadsheets/d/1a5c2Ubetp3eUW3ctySSyyOVVdk5UfiYYuTbIMKsIB0k/edit?usp=drive_web",
                 visual="", icon='<img src="https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.spreadsheet" alt=""/>',
                 name="Jadval", date="9/7/2020"),
    ENTRY.format(id="1BADhrefXXXXXXXXXXXXXXXXXXXX", href="javascript:alert(1)", visual="", icon="", name="<b>x</b>", date="soon"),
])


def test_parse_folder_real_markup():
    data = G.parse_folder(FIXTURE, today=date(2026, 10, 5))
    assert data["title"] == "Buyruqlar & nizomlar"
    items = data["items"]
    assert [i["kind"] for i in items] == ["folder", "file", "file", "file", "file"]  # papkalar tepada, qolgani Google tartibida
    folder, pdf, xlsx, sheet, bad = items
    assert folder == folder | {"id": "1Co4PKflkM9_49_pTxX84VeVEutdVf1W5", "name": "2025-yil", "mime": "application/vnd.google-apps.folder", "modified": "2026-05-04"}
    assert pdf["name"] == 'Buyruq №12 "Qabul".pdf' and pdf["mime"] == "application/pdf" and pdf["modified"] == "2021-12-15"
    assert pdf["url"].startswith("https://drive.google.com/file/d/1Ox3Hjpd1HgXkoi3YmI3i7VpEjEVTSESv/")
    assert xlsx["rk"] == "0-AbC_d" and xlsx["modified"] == "2026-10-05" and xlsx["modified_raw"] == "3:45 PM"
    assert xlsx["mime"].endswith("spreadsheetml.sheet")
    assert sheet["url"].startswith("https://docs.google.com/spreadsheets/d/") and sheet["modified"] == "2020-09-07"
    assert bad["url"] == "https://drive.google.com/file/d/1BADhrefXXXXXXXXXXXXXXXXXXXX/view" and bad["name"] == "x" and bad["modified"] == ""


def test_parse_empty_and_private():
    assert G.parse_folder(page("Bo'sh", []))["items"] == []
    with pytest.raises(G.DriveError) as e:
        G.parse_folder("<html><body>Sign in - Google Accounts</body></html>")
    assert e.value.code == "private"


def test_parse_date_variants():
    t = date(2026, 10, 5)
    assert G.parse_date("1/2/03", t) == "2003-01-02"
    assert G.parse_date("Dec 31", t) == "2026-12-31"
    assert G.parse_date("15.12.2021", t) == "2021-12-15"
    assert G.parse_date("13/45/21", t) == "" and G.parse_date("", t) == ""


class FakeGoogle:
    def __init__(self):
        self.calls = 0
        self.mode = "ok"

    def __call__(self, url, params):
        self.calls += 1
        req = httpx.Request("GET", url, params=params)
        if self.mode == "down":
            raise G.DriveError("unreachable", 502)
        if self.mode == "private":
            return httpx.Response(302, headers={"location": "https://accounts.google.com/ServiceLogin"}, request=req)
        if url.endswith("/open"):
            loc = f"https://drive.google.com/drive/folders/{params['id']}?usp=drive_open" if params["id"].startswith("1F") else f"https://drive.google.com/file/d/{params['id']}/view"
            return httpx.Response(307, headers={"location": loc}, request=req)
        assert params["hl"] == "en"
        return httpx.Response(200, text=FIXTURE, request=req)


@pytest.fixture()
def client(monkeypatch):
    fake = FakeGoogle()
    monkeypatch.setattr(G, "_get", fake)
    G.clear_cache()
    app = FastAPI()
    app.include_router(G.router)
    yield TestClient(app, headers={"x-forwarded-for": "10.77.0.1"}), fake
    G.clear_cache()


def test_folder_api_cache_and_fallback(client, monkeypatch):
    c, fake = client
    r = c.get("/api/gdrive/folder/1eEL3dpCk_mfSsvEhME04-qJkWjrpi8Ib")
    assert r.status_code == 200 and "max-age" in r.headers["cache-control"]
    body = r.json()
    assert body["id"] == "1eEL3dpCk_mfSsvEhME04-qJkWjrpi8Ib" and len(body["items"]) == 5
    assert c.get("/api/gdrive/folder/1eEL3dpCk_mfSsvEhME04-qJkWjrpi8Ib").json() == body
    assert fake.calls == 1  # ikkinchi so'rov — xotiradan
    # muddati o'tgan nusxa: Google javob bermasa ham eski ro'yxat qaytadi
    key = "f:1eEL3dpCk_mfSsvEhME04-qJkWjrpi8Ib:"
    G._cache[key] = (G._cache[key][0] - G.TTL - 1, True, G._cache[key][2])
    fake.mode = "down"
    assert c.get("/api/gdrive/folder/1eEL3dpCk_mfSsvEhME04-qJkWjrpi8Ib").status_code == 200
    assert fake.calls == 2


def test_folder_api_errors(client):
    c, fake = client
    fake.mode = "private"
    r = c.get("/api/gdrive/folder/1PrivateFolderIdXXXXXXXXXX")
    assert r.status_code == 403 and r.json()["detail"] == "private" and r.headers["cache-control"] == "no-store"
    assert c.get("/api/gdrive/folder/1PrivateFolderIdXXXXXXXXXX").status_code == 403
    assert fake.calls == 1  # xato ham qisqa muddat eslab qolinadi
    fake.mode = "down"
    assert c.get("/api/gdrive/folder/1DownFolderIdXXXXXXXXXXXXX").status_code == 502
    for bad in ("short", "a" * 200, "x%2F..%2Fetc"):
        assert c.get(f"/api/gdrive/folder/{bad}").status_code == 404
    assert c.get("/api/gdrive/folder/1eEL3dpCk_mfSsvEhME04-qJkWjrpi8Ib?rk=bad key!").status_code == 404


def test_kind_api(client):
    c, _ = client
    assert c.get("/api/gdrive/kind/1FolderIdXXXXXXXXXXXXXXXX").json()["kind"] == "folder"
    assert c.get("/api/gdrive/kind/1m9HNQzgmNRt4d2Ai92TIg81lqwWQyKE5").json()["kind"] == "file"


def test_router_registered(client):
    """main.py dagi ilovada ham ulangan (tarmoqsiz: Google javobi soxta)."""
    from university.api import main

    r = TestClient(main.app).get("/api/gdrive/kind/1FolderIdXXXXXXXXXXXXXXXX")
    assert r.status_code == 200 and r.json()["kind"] == "folder"


def test_static_assets_gzip(tmp_path, monkeypatch):
    """/assets/* JS/CSS — brauzer qabul qilsa gzip bilan (nusxa bir marta yaratiladi), aks holda asl fayl."""
    import gzip

    from starlette.requests import Request

    from university.api.static_gz import gzipped

    monkeypatch.setenv("SITE_DATA_DIR", str(tmp_path / "data"))
    js = tmp_path / "pdf.worker.min-abc.mjs"
    js.write_text("export const x = 1;\n" * 400)
    req = lambda enc: Request({"type": "http", "headers": [(b"accept-encoding", enc.encode())] if enc else []})  # noqa: E731
    r = gzipped(js, req("gzip, deflate, br"), {"Cache-Control": "immutable"})
    assert r is not None and r.headers["content-encoding"] == "gzip" and r.media_type == "text/javascript"
    assert r.headers["vary"] == "Accept-Encoding" and r.headers["cache-control"] == "immutable"
    assert gzip.decompress(Path(r.path).read_bytes()) == js.read_bytes()
    assert gzipped(js, req(""), {}) is None  # gzip'siz brauzer — asl fayl
    small = tmp_path / "a.css"
    small.write_text("a{}")
    assert gzipped(small, req("gzip"), {}) is None  # juda kichik
    png = tmp_path / "a.png"
    png.write_bytes(b"\x89PNG" * 1000)
    assert gzipped(png, req("gzip"), {}) is None  # rasm allaqachon siqilgan
