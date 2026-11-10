from university import menu_sections as MS


def test_add_to_menu_places_new_links_once_and_keeps_admin_edits():
    menu = [
        {"label": "Universitet", "url": "/about/about-university", "children": [
            {"label": "Biz haqimizda", "url": "/about/about-university", "group": "Universitet"},
            {"label": "Hujjatlar", "url": "/documents", "group": "Ochiqlik"},
        ]},
        {"label": "Talabalar", "url": "/students", "children": [
            {"label": "Yotoqxona", "url": "/about/yotoqxona", "group": "Imkoniyatlar"},
        ]},
        {"label": "Admin qo'shgan", "url": "/about/boshqa", "children": []},
    ]
    out = MS.add_to_menu(menu)
    inst = [c["url"] for c in out[0]["children"]]
    assert inst[:3] == ["/about/about-university", "/rector", "/history"]
    assert inst.index("/reception") == inst.index("/documents") + 1 and "/open-data" in inst
    stu = [c["url"] for c in out[1]["children"]]
    assert "/dormitory" in stu and "/about/yotoqxona" not in stu and "/scholarships" in stu
    assert out[2] == menu[2] | {"children": []}  # tanish bo'lmagan ota bo'limga tegilmaydi
    again = MS.add_to_menu(out)
    assert again == out  # ikkinchi marta — o'zgarishsiz
    assert menu[1]["children"][0]["url"] == "/about/yotoqxona"  # asl ro'yxat o'zgarmaydi


def test_filter_menu_hides_empty_sections():
    menu = [{"label": "A", "url": "/news", "children": [{"label": "G", "url": "/gallery"}, {"label": "N", "url": "/news?tag=x"}]},
            {"label": "J", "url": "/journal", "children": []}]
    out = MS.filter_menu(menu, frozenset({"/gallery", "/journal"}))
    assert [m["url"] for m in out] == ["/news"] and [c["url"] for c in out[0]["children"]] == ["/news?tag=x"]
    assert MS.filter_menu(menu, frozenset()) is menu
