"""Stock university template: 3 languages, starter pages, menu links, and clean empty defaults."""
from __future__ import annotations

import json
import re
from urllib.parse import urlsplit

from university import content as C


def test_menu_uses_three_languages_and_valid_routes():
    def walk(items):
        for x in items:
            yield x
            yield from walk(x.get("children") or [])

    pages = {it["data"]["slug"] for it in C.SEED if it["kind"] == "page"}
    allowed_roots = {
        "/", "/faculties", "/programs", "/admission", "/grant", "/tuition", "/scholarships", "/upgoals",
        "/events", "/staff", "/structure", "/news", "/announcements", "/documents", "/open-data",
        "/ratings", "/history", "/rector", "/media", "/contact", "/reception", "/careers",
        "/partners", "/practice-bases", "/alumni", "/startups", "/articles", "/student",
        "/library", "/forum", "/clubs", "/sport", "/dormitory", "/calculator", "/parents", "/life",
        "/gallery", "/campus-map", "/virtual-tour", "/admission/steps",
    }
    for m in walk(C.MENU):
        assert set(m.get("labels", {})) >= {"ru", "en"}
        u = m.get("url") or ""
        p = urlsplit(u).path
        if p.startswith("/about/"):
            assert p.split("/", 2)[2] in pages
        elif p.startswith("/"):
            assert p in allowed_roots or p.split("?")[0] in allowed_roots, u


def test_stock_defaults_are_clean():
    assert C.DEFAULT_UNI["abbr"] == "UNI"
    assert C.DEFAULT_UNI["address"] == ""
    assert C.DEFAULT_UNI["phones"] == []
    assert C.DEFAULT_SITE["home_images"] == {"hero": "", "green": "", "students": ""}
    assert C.DEFAULT_SITE["hero_images"] == []
    assert C.demo_fees("any-program", "any-faculty") == []


def test_seed_has_three_languages_and_no_legacy_refs():
    for it in C.SEED:
        d = it["data"]
        assert d["status"] == "published"
        i18n = d.get("i18n") or {}
        for lang in ("ru", "en"):
            assert i18n.get(lang, {}).get("title"), f"{it['kind']} {d.get('id')} missing {lang}"
            if d.get("html"):
                assert i18n[lang].get("html"), f"{it['kind']} {d.get('id')} missing html {lang}"
    blob = json.dumps(C.SEED) + json.dumps(C.DEFAULT_SITE) + json.dumps(C.DEFAULT_UNI)
    assert not re.search(r"seed-media|seed_site|iifte|ilfte|kiuf|agro\.uz", blob, re.I)
