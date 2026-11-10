"""Tugma izohlari: seed sahifalarida «Ko'rish tugmasi … ochadi» kabi izoh yo'q; mavjud bazadan bir martalik migratsiya uni
faqat matnda aynan turgan bo'lsa olib tashlaydi (admin o'zgartirgan matnga tegilmaydi)."""
import importlib

import pytest
from fastapi.testclient import TestClient

HINTS = {
    "uz": "Har bir hujjat yonidagi «Ko‘rish» tugmasi uni shu sahifaning o‘zida ochadi.",
    "ru": "Кнопка «Просмотр» рядом с документом открывает его прямо на этой странице.",
    "en": "The View button next to each document opens it right on this page.",
}


@pytest.fixture(scope="module")
def m(tmp_path_factory):
    import os

    static = tmp_path_factory.mktemp("static")
    (static / "index.html").write_text('<!doctype html><html lang="uz"><head><title>x</title></head><body><div id="root"></div></body></html>', encoding="utf-8")
    os.environ["SITE_DATA_DIR"] = str(tmp_path_factory.mktemp("data"))
    os.environ["SITE_STATIC_DIR"] = str(static)
    os.environ["SITE_PREWARM"] = "0"
    import university.api.deps as deps
    import university.api.main as main

    importlib.reload(main)
    deps.reset_service()
    return main


def test_seed_has_no_button_hint(m):
    c = TestClient(m.app)
    for lang, h in HINTS.items():
        html = c.get(f"/api/pages/oquv-rejalar?lang={lang}").json()["item"]["html"]
        assert "drive.google.com" in html and h not in html, lang


def test_migration_drops_hint_only_when_verbatim(m):
    import university.api.deps as deps

    svc = deps.svc()
    st = svc.st
    it = st.get_item_by_slug("page", "oquv-rejalar", public=False)
    # eski baza holati: izoh html, text, tarjimalar va muharrir JSON'ida
    old_html = it["html"].replace("<h2>Malaka talablari</h2>", f"<p>{HINTS['uz']}</p><h2>Malaka talablari</h2>")
    assert old_html != it["html"]
    i18n = dict(it.get("i18n") or {})
    i18n["ru"] = {**i18n["ru"], "html": i18n["ru"]["html"] + f"<p>{HINTS['ru']}</p>", "text": i18n["ru"]["text"] + "\n" + HINTS["ru"]}
    i18n["en"] = {**i18n["en"], "html": i18n["en"]["html"] + f"<p>{HINTS['en']}</p>",
                  "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Curricula"}]},
                                                         {"type": "paragraph", "content": [{"type": "text", "text": HINTS["en"]}]}]}}
    st.patch_item_data(it["id"], html=old_html, text=it["text"] + "\n" + HINTS["uz"], i18n=i18n)
    # admin o'zgartirgan sahifa: jumla boshqa so'z bilan — tegilmaydi
    other = st.get_item_by_slug("page", "yakuniy-nazorat", public=False)
    edited = other["html"] + "<p>Har bir hujjat yonidagi «Ko‘rish» tugmasi uni shu sahifaning o‘zida ochadi, albatta.</p>"
    st.patch_item_data(other["id"], html=edited)

    svc._drop_page_hints()

    got = st.get_item(it["id"])
    assert HINTS["uz"] not in got["html"] and HINTS["uz"] not in got["text"]
    assert got["html"] == it["html"]  # qolgan matn o'zgarmagan
    assert HINTS["ru"] not in got["i18n"]["ru"]["html"] and HINTS["ru"] not in got["i18n"]["ru"]["text"]
    assert HINTS["en"] not in got["i18n"]["en"]["html"]
    assert [n["content"][0]["text"] for n in got["i18n"]["en"]["content"]["content"]] == ["Curricula"]
    assert st.get_item(other["id"])["html"] == edited
    # takror ishga tushsa ham xavfsiz
    svc._drop_page_hints()
    assert st.get_item(it["id"])["html"] == got["html"]


def test_migration_runs_once_on_startup(m):
    import university.api.deps as deps

    assert deps.svc().st.kv_get("page_hints_v1") is True
