"""E'lon oynasi va bayram bezaklari."""
from __future__ import annotations

import importlib
from datetime import date

import pytest
from fastapi.testclient import TestClient

from university import festive as F

ADMIN_PW = "Admin-Fx-12345"


class KV:
    def __init__(self, data=None):
        self.d = dict(data or {})

    def kv_get(self, k, default=None):
        return self.d.get(k, default)

    def kv_put(self, k, v):
        self.d[k] = v


def test_festive_windows_and_priority():
    st = KV()
    # faqat O'zbekiston bayramlari va 3 til; yangi o'rnatishda bezaklar o'chiq
    assert set(F.LANGS) == {"uz", "ru", "en"} and all(p["region"] == "uz" and set(p["name"]) == set(F.LANGS) for p in F.PRESETS)
    assert F.settings(st)["enabled"] is False and F.active(st, date(2026, 3, 21)) is None
    assert F.clean({})["enabled"] is False
    on = {"enabled": True}
    st.kv_put("festive", F.clean(on))
    assert F.active(st, date(2026, 3, 21))["id"] == "navruz"
    assert F.active(st, date(2026, 3, 17))["id"] == "navruz"  # 4 kun oldin
    assert F.active(st, date(2026, 3, 20))["id"] == "eid_fitr"  # Ramazon hayiti kuni — u ustun
    assert F.active(st, date(2026, 3, 22))["id"] == "navruz"
    ny = F.active(st, date(2025, 12, 28), "ru")
    assert ny["id"] == "newyear" and ny["day"] == "2026-01-01" and ny["countdown"] and "Новым" in ny["greeting"]
    assert F.active(st, date(2026, 1, 5))["id"] == "newyear"
    assert F.active(st, date(2026, 2, 17)) is None
    assert F.active(st, date(2026, 9, 1), "en")["greeting"] == "Happy Independence Day!"
    assert F.active(st, date(2026, 7, 10)) is None
    # admin: bayramni o'chirish, kunlar va aniq sanalar
    st.kv_put("festive", F.clean({**on, "holidays": {"navruz": {"enabled": False}}}))
    assert F.active(st, date(2026, 3, 24)) is None
    st.kv_put("festive", F.clean({**on, "holidays": {"navruz": {"before": 0, "after": 0}}}))
    assert F.active(st, date(2026, 3, 24)) is None and F.active(st, date(2026, 3, 21))["id"] == "navruz"
    st.kv_put("festive", F.clean({**on, "holidays": {"teachers_day": {"start": "2026-07-01", "end": "2026-07-03"}}}))
    assert F.active(st, date(2026, 7, 2))["id"] == "teachers_day"
    st.kv_put("festive", F.clean({**on, "holidays": {"eid_fitr": {"dates": {"2027": "03-11"}}}}))
    assert F.active(st, date(2027, 3, 13))["day"] == "2027-03-11"
    # o'z tadbiri, umumiy o'chirish, ko'rib chiqish
    st.kv_put("festive", F.clean({**on, "custom": [{"name": {"uz": "Institut kuni"}, "greeting": {"uz": "Tabriklaymiz!"}, "style": "independence",
                                                    "start": "2026-06-10", "end": "2026-06-12"}]}))
    c = F.active(st, date(2026, 6, 11))
    assert c["name"] == "Institut kuni" and c["style"] == "independence"
    st.kv_put("festive", F.clean({"enabled": False}))
    assert F.active(st, date(2026, 3, 21)) is None
    assert F.active(st, date(2026, 7, 10), preview="teachers_day")["style"] == "teachers"
    assert F.active(st, date(2026, 7, 10), preview="eid")["preview"]
    assert F.clean({"force": "bogus"})["force"] is None


@pytest.fixture(scope="module")
def m(tmp_path_factory):
    import os

    static = tmp_path_factory.mktemp("static")
    (static / "index.html").write_text("<!doctype html><html><head><title>x</title></head><body></body></html>", encoding="utf-8")
    os.environ["SITE_DATA_DIR"] = str(tmp_path_factory.mktemp("data"))
    os.environ["SITE_STATIC_DIR"] = str(static)
    os.environ["SITE_ADMIN_PASSWORD"] = ADMIN_PW
    os.environ["SITE_PREWARM"] = "0"
    import university.api.deps as deps
    import university.api.main as main

    importlib.reload(main)
    deps.reset_service()
    return main


def test_festive_scene_image_override():
    """Admin har bir bayram (va o'z tadbiri) sahnasiga o'z suratini qo'ya oladi; faqat media kutubxonasi yoki https manzil."""
    cfg = F.clean({"enabled": True, "holidays": {"navruz": {"image": "/media/abc123.jpg"}, "newyear": {"image": "javascript:alert(1)"}},
                   "custom": [{"start": "2026-05-01", "end": "2026-05-03", "style": "teachers", "name": {"uz": "Institut kuni"}, "image": "https://cdn.example.uz/a.webp"}]})
    assert cfg["holidays"]["navruz"]["image"] == "/media/abc123.jpg"
    assert cfg["holidays"]["newyear"]["image"] is None  # xavfli manzil qabul qilinmaydi
    assert cfg["custom"][0]["image"] == "https://cdn.example.uz/a.webp"
    st = KV({"festive": cfg})
    assert F.active(st, date(2026, 3, 21), "uz")["image"] == "/media/abc123.jpg"
    assert F.active(st, date(2026, 1, 1), "uz")["image"] == ""  # standart fotosurat (frontend tanlaydi)
    assert F.active(st, date(2026, 5, 2), "uz")["image"] == "https://cdn.example.uz/a.webp"


def test_popups_api(m):
    a = TestClient(m.app, headers={"x-forwarded-for": "10.99.1.1"})
    assert a.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
    a.headers["x-admin-realm"] = "admin"
    items = [
        {"name": "Qabul", "active": True, "title": {"uz": "Qabul boshlandi", "en": "Admission is open", "de": "Zulassung"}, "body": {"uz": "Hujjatlar 1-iyulgacha"},
         "image": "/media/abc.png", "video": "javascript:alert(1)", "buttons": [{"label": {"uz": "Ariza"}, "url": "https://example.edu/admission", "new_tab": True},
                                                                               {"label": {"uz": "Yomon"}, "url": "javascript:x"}],
         "frequency": "daily", "pages": "home", "delay": 3},
        {"name": "Eski", "active": True, "title": {"uz": "O‘tgan"}, "end": "2020-01-01T00:00"},
        {"name": "O‘chiq", "active": False, "title": {"uz": "Yo‘q"}},
    ]
    r = a.put("/api/admin/popups", json={"items": items}).json()["items"]
    assert r[0]["video"] == "" and len(r[0]["buttons"]) == 1 and r[0]["version"] == 1 and set(r[0]["title"]) == {"uz", "en"}
    r2 = a.put("/api/admin/popups", json={"items": r}).json()["items"]
    assert r2[0]["version"] == 1  # o'zgarmagan — versiya o'sha
    r2[0]["body"]["uz"] = "Yangilandi"
    r3 = a.put("/api/admin/popups", json={"items": r2}).json()["items"]
    assert r3[0]["version"] == 2
    g = TestClient(m.app)
    site = g.get("/api/site?lang=en").json()
    assert [p["title"] for p in site["popups"]] == ["Admission is open"] and site["popups"][0]["body"] == "Yangilandi"
    assert "festive" in site and site["festive"] is None  # bezaklar standart holatda o'chiq
    assert g.get("/api/festive?preview=navruz").json()["festive"]["style"] == "navruz"
    f = a.put("/api/admin/festive", json={"holidays": {"newyear": {"before": 20}}}).json()
    assert next(h for h in f["holidays"] if h["id"] == "newyear")["next"]
    assert TestClient(m.app).get("/api/admin/popups").status_code in (401, 403)


def test_video_media_admin_only(m):
    from university.media import is_video

    mp4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64
    heic = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 64
    webm = b"\x1a\x45\xdf\xa3" + b"\x00" * 64
    assert is_video(mp4) and is_video(webm) and not is_video(heic)
    a = TestClient(m.app, headers={"x-forwarded-for": "10.99.1.2"})
    assert a.post("/api/admin/login", json={"login": "admin", "password": ADMIN_PW}).status_code == 200
    a.headers["x-admin-realm"] = "admin"
    r = a.post("/api/admin/media", files={"file": ("clip.mp4", mp4, "video/mp4")})
    assert r.status_code == 200 and r.json()["mime"] == "video/mp4" and r.json()["url"].endswith(".mp4")
    assert a.get(r.json()["url"]).headers["content-type"].startswith("video/mp4")
    # kabinet orqali video yuklab bo'lmaydi
    from university.api.main import _store_media
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        _store_media(webm, "x.webm")
