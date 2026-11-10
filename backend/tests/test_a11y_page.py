"""/accessibility — «Maxsus imkoniyatlar bayonoti»: server 200 holat, til bo'yicha sarlavha, sayt xaritasi (a11y_page.py)."""
import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def m(tmp_path_factory):
    import os

    static = tmp_path_factory.mktemp("static")
    (static / "index.html").write_text('<!doctype html><html lang="uz"><head><title>x</title></head><body><div id="root"></div></body></html>', encoding="utf-8")
    os.environ["SITE_DATA_DIR"] = str(tmp_path_factory.mktemp("data"))
    os.environ["SITE_STATIC_DIR"] = str(static)
    os.environ["SITE_ADMIN_PASSWORD"] = "Admin-parol-123"
    os.environ["SITE_URL"] = "https://site.example"
    os.environ["SITE_PREWARM"] = "0"
    import university.api.deps as deps
    import university.api.main as main

    importlib.reload(main)
    deps.reset_service()
    return main


def test_accessibility_statement_page(m):
    g = TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126", "x-forwarded-for": "10.41.1.1"}, follow_redirects=False)
    r = g.get("/accessibility")
    assert r.status_code == 200 and "<title>Maxsus imkoniyatlar bayonoti" in r.text
    meta = g.get("/api/meta?path=/accessibility&lang=ru").json()
    assert meta["status"] == 200 and meta["title"].startswith("Заявление о доступности")
    assert "WCAG 2.2 AA" in g.get("/api/meta?path=/accessibility&lang=en").json()["description"]
    assert "/accessibility" in g.get("/sitemap.xml").text
