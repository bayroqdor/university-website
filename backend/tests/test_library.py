"""Kutubxona: katalog va qidiruv (lotin/kirill), nusxalar, bron va navbat, berish/qaytarish, jarima, uzaytirish, elektron fayllar
(tokenli oqim, o'qish joyi, belgilar, suv belgili yuklab olish), baho va izohlar, javonlar, o'qituvchi ro'yxatlari, import, hisobotlar, ruxsatlar."""
import importlib
import io
import time
import zipfile
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

ADMIN_PW = "Admin-parol-123"
DEMO_PW = "demo2025"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
SENT: list[dict] = []


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
    import university.mailer as mailer

    importlib.reload(main)
    deps.reset_service()
    mailer.send = lambda smtp, to, subject, html, text=None, headers=None: SENT.append({"to": to, "subject": subject})
    return main


_n = iter(range(1, 250))


def client(m):
    return TestClient(m.app, headers={"user-agent": "Mozilla/5.0 Chrome/126", "x-forwarded-for": f"10.44.{next(_n) % 200}.{next(_n) % 200}"})


def login(m, user, pw=DEMO_PW, panel=False):
    c = client(m)
    r = c.post("/api/admin/login" if panel else "/api/auth/login", json={"login": user, "password": pw})
    assert r.status_code == 200, r.text
    if panel:
        c.headers["x-admin-realm"] = "admin"
    return c


def make_pdf(pages=10) -> bytes:
    from pypdf import PdfWriter

    w = PdfWriter()
    for _ in range(pages):
        w.add_blank_page(400, 600)
    w.add_outline_item("Kirish", 0)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def make_epub() -> bytes:
    buf = io.BytesIO()
    z = zipfile.ZipFile(buf, "w")
    z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
    z.writestr("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="c.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    z.writestr("c.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Kvant</dc:title></metadata>'
                        '<manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>')
    z.writestr("a.xhtml", "<html><body><p>Shryodinger tenglamasi va kvant chigallashuvi haqida.</p></body></html>")
    z.close()
    return buf.getvalue()


def test_library_full_flow(m):
    a = login(m, "admin", ADMIN_PW, panel=True)
    # --- fond: kitob + 2 nusxa; qidiruv lotin/kirill va ISBN bo'yicha
    b = a.post("/api/admin/library/books", json={"title": "Oʻzbek tili grammatikasi", "authors": "Karimov A.; Saidova N.", "isbn": "978-9943-01-234-5",
                                                  "categories": "Tilshunoslik", "faculties": "Gumanitar", "year": 2020, "lang": "uz", "price": 50000,
                                                  "copies": 2, "location": "A-1"}).json()
    assert b["id"] and b["isbn"] == "9789943012345"
    pub = client(m)
    assert pub.get("/api/lib/search?q=ўзбек тили").json()["total"] == 1
    assert pub.get("/api/lib/search?q=grammat").json()["total"] == 1
    assert pub.get("/api/lib/search?q=9789943012345").json()["items"][0]["id"] == b["id"]
    assert pub.get("/api/lib/search?format=pdf").json()["total"] == 0
    card = pub.get("/api/lib/search?q=karimov").json()["items"][0]
    assert card["copies"] == 2 and card["free"] == 2 and card["formats"] == ["paper"]
    full = a.get(f"/api/admin/library/books/{b['id']}").json()
    invs = [c["inv"] for c in full["copies"]]
    assert len(invs) == 2 and all(x.startswith("UNI-") for x in invs)

    s1, s2, s3, t = login(m, "student"), login(m, "student2"), login(m, "student3"), login(m, "teacher")
    st = m.svc().st
    uid = {x: st.find_user(x)["id"] for x in ("student", "student2", "student3", "teacher")}
    # --- berish: talaba 14 kun, o'qituvchi 30 kun
    r = a.post("/api/admin/library/issue", json={"user_id": uid["student"], "code": invs[0]}).json()
    assert r["loan"]["due"] == (date.today() + timedelta(days=14)).isoformat()
    assert a.post("/api/admin/library/issue", json={"user_id": uid["student2"], "code": invs[0]}).json()["detail"] == "copy_loaned"
    r = a.post("/api/admin/library/issue", json={"user_id": uid["teacher"], "code": invs[1]}).json()
    assert r["loan"]["due"] == (date.today() + timedelta(days=30)).isoformat()
    # kutubxonachi kimda ekanini ko'radi (va bu jurnalga yoziladi)
    held = a.get(f"/api/admin/library/books/{b['id']}").json()["copies"]
    assert {c["holder"]["user"]["login"] for c in held if c["holder"]} == {"student", "teacher"}
    # talaba kitob kimdaligini ko'rmaydi — faqat soni va eng yaqin qaytish
    info = s2.get(f"/api/lib/books/{b['id']}").json()
    assert info["availability"]["free"] == 0 and info["availability"]["next_due"] and "holder" not in str(info)
    # --- navbat: hammasi band — student2, keyin student3
    res2 = s2.post(f"/api/lib/books/{b['id']}/reserve").json()
    res3 = s3.post(f"/api/lib/books/{b['id']}/reserve").json()
    assert res2["status"] == "waiting" and res2["position"] == 1 and res3["position"] == 2
    assert s2.post(f"/api/lib/books/{b['id']}/reserve").json()["detail"] == "already_reserved"
    # navbat bor — uzaytirib bo'lmaydi
    loan_id = s1.get("/api/lib/me").json()["loans"][0]["id"]
    assert s1.post(f"/api/lib/loans/{loan_id}/renew").json()["detail"] == "renew_queue"
    # --- muddat o'tgan qaytarish → jarima; nusxa navbatdagi birinchiga «bron qilingan»
    with st._tx() as c:
        c.execute("UPDATE lib_loans SET due=%s WHERE id=%s", ((date.today() - timedelta(days=4)).isoformat(), loan_id))
    assert s1.get("/api/lib/me").json()["loans"][0]["overdue"] is True
    ret = a.post("/api/admin/library/return", json={"code": invs[0]}).json()
    assert ret["late_days"] == 4 and ret["fine"]["amount"] == 4000 and ret["reserved_for"] == uid["student2"]
    cp = a.get(f"/api/admin/library/copy?code={invs[0]}").json()
    assert cp["copy"]["status"] == "reserved" and cp["reserved_for"]["id"] == uid["student2"]
    assert any(x["status"] == "ready" for x in s2.get("/api/lib/me").json()["reservations"])
    # boshqa o'quvchiga berib bo'lmaydi; bron egasiga — mumkin
    assert a.post("/api/admin/library/issue", json={"user_id": uid["student3"], "code": invs[0]}).json()["detail"] == "copy_reserved_other"
    assert a.post("/api/admin/library/issue", json={"user_id": uid["student2"], "code": invs[0]}).json()["loan"]["user_id"] == uid["student2"]
    # qarzdor talaba yangi kitob ololmaydi; jarima sababsiz yopilmaydi
    me1 = s1.get("/api/lib/me").json()
    assert "has_fines" in me1["problems"] and me1["unpaid"] == 4000
    fine_id = me1["fines"][0]["id"]
    assert a.post(f"/api/admin/library/fines/{fine_id}", json={"status": "paid", "note": ""}).json()["detail"] == "reason_required"
    assert a.post(f"/api/admin/library/fines/{fine_id}", json={"status": "waived", "note": "birinchi marta"}).json()["status"] == "waived"
    assert "has_fines" not in s1.get("/api/lib/me").json()["problems"]
    # tayyor bron muhlati o'tsa — navbat keyingisiga
    a.post("/api/admin/library/return", json={"code": invs[1]})  # o'qituvchi qaytardi → student3 ga tayyor
    with st._tx() as c:
        c.execute("UPDATE lib_reservations SET expires='2000-01-01T00:00:00+00:00' WHERE status='ready'")
    m.svc()._library.expire_reservations()
    assert a.get(f"/api/admin/library/copy?code={invs[1]}").json()["copy"]["status"] == "available"
    # uzaytirish: navbat yo'q — bir marta
    l2 = s2.get("/api/lib/me").json()["loans"][0]
    assert s2.post(f"/api/lib/loans/{l2['id']}/renew").json()["renewals"] == 1
    assert s2.post(f"/api/lib/loans/{l2['id']}/renew").json()["detail"] == "renew_limit"
    # limit: talaba 3 ta
    a.put("/api/admin/library/settings", json={"limit_student": 1})
    assert a.post("/api/admin/library/issue", json={"user_id": uid["student2"], "code": invs[1]}).json()["detail"] == "limit_reached"
    a.put("/api/admin/library/settings", json={"limit_student": 3})

    # --- elektron fayllar: PDF va EPUB, tokenli oqim, Range, o'qish joyi
    pdf = a.post(f"/api/admin/library/books/{b['id']}/files", files={"file": ("k.pdf", make_pdf(), "application/pdf")}, data={"title": "Elektron nashr"}).json()
    assert pdf["kind"] == "pdf" and pdf["pages"] == 10 and pdf["access"] == "registered"
    assert a.post(f"/api/admin/library/books/{b['id']}/files", files={"file": ("x.exe", b"MZ\x90\x00binary", "application/octet-stream")}).json()["detail"] == "unsupported_type"
    eb = a.post("/api/admin/library/books", json={"title": "Kvant fizikasi", "authors": "Bohr N."}).json()
    ep = a.post(f"/api/admin/library/books/{eb['id']}/files", files={"file": ("k.epub", make_epub(), "application/epub+zip")}).json()
    assert ep["kind"] == "epub" and ep["pages"] == 1
    assert pub.get("/api/lib/search?q=chigallashuv").json()["items"][0]["id"] == eb["id"]  # fayl matni ichidan qidiruv
    assert pub.post(f"/api/lib/files/{pdf['id']}/open").status_code == 401  # mehmon elektron faylni ocha olmaydi
    op = s3.post(f"/api/lib/files/{pdf['id']}/open").json()
    assert op["url"].startswith("/api/lib/stream/") and op["download"] is False
    r = pub.get(op["url"], headers={"Range": "bytes=0-99"})
    assert r.status_code == 206 and len(r.content) == 100 and r.content[:5] == b"%PDF-"
    tok = op["url"].rsplit("/", 1)[1]
    fid, u_, exp, sig = tok.split(".")
    assert pub.get(f"/api/lib/stream/{fid}.{u_}.{exp}.{'0' * 32}").status_code == 403
    from university.api import library as LA

    old = f"{fid}.{u_}.1000.{LA._sign(fid, u_, 1000)}"
    assert pub.get(f"/api/lib/stream/{old}").status_code == 403  # muddati o'tgan — begona uchun yaroqsiz
    assert s3.get(f"/api/lib/stream/{old}").status_code == 200  # o'sha foydalanuvchi sessiyasi bilan davom etadi
    # baho: 10% o'qimaguncha mumkin emas
    assert s3.post(f"/api/lib/books/{b['id']}/rate", json={"stars": 5}).json()["detail"] == "rate_not_allowed"
    pr = s3.put(f"/api/lib/files/{pdf['id']}/progress", json={"loc": "3", "percent": 30, "seconds": 120, "pages": 3}).json()
    assert pr["loc"] == "3" and pr["percent"] == 30
    assert s3.post(f"/api/lib/books/{b['id']}/rate", json={"stars": 4}).json()["avg"] == 4
    mk = s3.post(f"/api/lib/files/{pdf['id']}/marks", json={"kind": "highlight", "loc": "3:12-40", "text": "muhim", "note": "imtihon"}).json()
    assert s3.get(f"/api/lib/files/{pdf['id']}/marks").json()["items"][0]["id"] == mk["id"]
    assert s2.get(f"/api/lib/files/{pdf['id']}/marks").json()["items"] == []  # belgilar faqat o'ziga ko'rinadi
    me3 = s3.get("/api/lib/me").json()
    assert me3["continue"][0]["file_id"] == pdf["id"] and me3["stats"]["seconds"] == 120
    # yuklab olish: taqiqlangan → ruxsat berilsa suv belgili PDF
    assert s3.get(f"/api/lib/files/{pdf['id']}/download").status_code == 403
    a.put("/api/admin/library/settings", json={"allow_download": True})
    dl = s3.get(f"/api/lib/files/{pdf['id']}/download")
    from pypdf import PdfReader

    name3 = st.get_user(uid["student3"])["name"].split()[0]
    assert dl.status_code == 200 and name3 in PdfReader(io.BytesIO(dl.content)).pages[0].extract_text()
    assert dl.headers["content-type"] == "application/pdf"
    # kirish huquqi: faqat o'qituvchilar
    a.put(f"/api/admin/library/files/{pdf['id']}", json={"access": "teachers"})
    assert s3.post(f"/api/lib/files/{pdf['id']}/open").json()["detail"] == "file_forbidden"
    assert t.post(f"/api/lib/files/{pdf['id']}/open").status_code == 200

    # --- izohlar: moderatsiya, anonim, javob, foydali, 24 soat tahrirlash
    rv = s3.post(f"/api/lib/books/{b['id']}/reviews", json={"text": "Juda foydali qo'llanma", "anonymous": True}).json()
    assert rv["status"] == "pending"
    assert s2.get(f"/api/lib/books/{b['id']}/reviews").json()["items"] == []  # moderatsiyadan o'tmagan — ko'rinmaydi
    q = a.get("/api/admin/library/reviews").json()["items"]
    assert q[0]["author"]["login"] == "student3"  # kutubxonachi anonim muallifni biladi
    a.post(f"/api/admin/library/reviews/{rv['id']}", json={"status": "approved"})
    items = s2.get(f"/api/lib/books/{b['id']}/reviews").json()["items"]
    assert items[0]["author"]["name"] == "Anonim" and "user_id" not in items[0]
    s2.post(f"/api/lib/books/{b['id']}/reviews", json={"text": "Qo'shilaman", "parent_id": rv["id"]})
    assert s2.post(f"/api/lib/reviews/{rv['id']}/vote", json={"kind": "helpful"}).json()["helpful"] == 1
    assert s3.put(f"/api/lib/reviews/{rv['id']}", json={"text": "Juda foydali qo'llanma!"}).json()["edited"]
    assert a.post(f"/api/admin/library/reviews/{rv['id']}", json={"status": "hidden"}).json()["detail"] == "reason_required"

    # --- javonlar: avtomatik «O'qiyapman»/«O'qidim», o'z ro'yxati
    shelves = {x["kind"]: x for x in s1.get("/api/lib/me").json()["shelves"]}
    assert any(i["id"] == b["id"] for i in shelves["done"]["items"])  # qaytardi → o'qidim
    sh = s1.post("/api/lib/shelves", json={"name": "Diplom ishi uchun"}).json()
    s1.post(f"/api/lib/shelves/{sh['id']}/items", json={"book_id": eb["id"]})
    assert any(x["name"] == "Diplom ishi uchun" and x["items"] for x in s1.get("/api/lib/me").json()["shelves"])

    # --- o'qituvchi tavsiya ro'yxati → talaba o'z fanlarida ko'radi
    lst = t.get("/api/lib/course-lists").json()
    subj = lst["subjects"][0]
    cl = t.post("/api/lib/course-lists", json={"subject_id": subj["id"], "subject_name": subj["name"], "items": [{"book_id": b["id"], "kind": "main"}, {"book_id": eb["id"], "kind": "extra"}]}).json()
    assert [i["kind"] for i in cl["items"]] == ["extra", "main"] or len(cl["items"]) == 2
    assert s1.post("/api/lib/course-lists", json={"subject_name": "x"}).status_code == 403
    seen = [x for x in s1.get("/api/lib/me").json()["course_lists"] if x["id"] == cl["id"]] + [x for x in s2.get("/api/lib/me").json()["course_lists"] if x["id"] == cl["id"]] \
        + [x for x in s3.get("/api/lib/me").json()["course_lists"] if x["id"] == cl["id"]]
    assert seen, "fan bo'yicha ro'yxat talabaga ko'rinishi kerak"
    assert t.post(f"/api/lib/course-lists/{cl['id']}/copy", json={"semester_id": ""}).json()["id"] != cl["id"]

    # --- tavsiyalar, statistika, hisobotlar, inventarizatsiya
    home = s2.get("/api/lib/home").json()
    assert home["facets"]["total"] >= 2 and home["popular"]
    assert s2.get(f"/api/lib/books/{eb['id']}").json()["also"] is not None
    stats = a.get("/api/admin/library/stats").json()
    assert stats["today"]["issued"] >= 3 and stats["fund"]["books"] >= 2 and stats["top_borrowed"]
    for kind in ("debtors", "fines", "fund", "circulation", "inventory"):
        r = a.get(f"/api/admin/library/reports/{kind}.xlsx")
        assert r.status_code == 200 and r.content[:2] == b"PK", kind
    inv = a.post("/api/admin/library/inventory", json={"location": "A-1", "codes": [invs[1], "NOMALUM-1"]}).json()
    assert [x["inv"] for x in inv["found"]] == [invs[1]] and [x["inv"] for x in inv["missing"]] == [] and inv["unknown"] == ["NOMALUM-1"]

    # --- Excel import: namuna, ISBN bo'yicha birlashtirish
    tpl = a.get("/api/admin/library/template.xlsx")
    assert tpl.status_code == 200 and tpl.content[:2] == b"PK"
    imp = a.post("/api/admin/library/import", files={"file": ("f.xlsx", tpl.content, XLSX)}).json()
    assert imp["books"] == 2 and imp["copies"] == 8
    imp2 = a.post("/api/admin/library/import", files={"file": ("f.xlsx", tpl.content, XLSX)}).json()
    assert imp2["merged"] == 1 and imp2["books"] == 1  # ISBN'li kitob — nusxa qo'shildi; ISBN'siz — yangi
    csv = "Nomi;Muallif;Nusxalar soni\nFizika asoslari;Rahimov;2\n".encode()
    assert a.post("/api/admin/library/import", files={"file": ("f.csv", csv, "text/csv")}).json()["copies"] == 2

    # --- ruxsatlar: kutubxonachi roli — sozlama va audit yo'q, foydalanuvchilar bo'limi yo'q
    a.post("/api/admin/admins", json={"login": "kutubxonachi", "name": "Kutubxonachi", "password": "Kutub-12345", "role_id": "librarian"})
    lb = login(m, "kutubxonachi", "Kutub-12345", panel=True)
    assert lb.get("/api/admin/library/books").status_code == 200
    assert lb.get("/api/admin/library/settings").json()["can_edit"] is False
    assert lb.put("/api/admin/library/settings", json={"fine_per_day": 1}).status_code == 403
    assert lb.get("/api/admin/library/audit").status_code == 403
    assert lb.get("/api/admin/users").status_code == 403
    assert s1.get("/api/admin/library/books").status_code in (401, 403)
    audit = a.get("/api/admin/library/audit").json()["items"]
    assert any(x["action"] == "loan.issue" for x in audit) and any(x["action"] == "view.holders" for x in audit)

    # --- ISBN bo'yicha to'ldirish (tashqi API — soxta javob)
    import httpx

    def fake(req: httpx.Request):
        if "googleapis" in str(req.url):
            return httpx.Response(200, json={"items": [{"volumeInfo": {"title": "Clean Code", "authors": ["Robert C. Martin"], "publishedDate": "2008-08-01", "pageCount": 464, "language": "en"}}]})
        return httpx.Response(200, json={})

    LA.ISBN_TRANSPORT = httpx.MockTransport(fake)
    try:
        r = a.get("/api/admin/library/isbn/9780132350884").json()
        assert r["title"] == "Clean Code" and r["year"] == 2008 and r["authors"] == ["Robert C. Martin"]
    finally:
        LA.ISBN_TRANSPORT = None

    # --- eslatmalar: 3 kun qolganda, muddat o'tganda (bir marta), ertalabki ro'yxat
    with st._tx() as c:
        c.execute("UPDATE lib_loans SET due=%s WHERE user_id=%s AND returned IS NULL", ((date.today() + timedelta(days=3)).isoformat(), uid["student2"]))
    res = LA.run_jobs()
    assert res["due3"] >= 1
    assert LA.run_jobs()["due3"] == 0  # takror yuborilmaydi
    notes = s2.get("/api/portal/notices").json()["items"]
    assert any("muddati yaqin" in n["title"].lower() for n in notes)

    # --- o'chirilgan foydalanuvchi — tarix anonimlashtiriladi
    from university.api.library import lib

    lib().anonymize_user(uid["student3"])
    assert not st._q("SELECT 1 FROM lib_progress WHERE user_id=%s", (uid["student3"],))
    time.sleep(0.05)


def _img(w: int, h: int, color=(200, 40, 40), fmt="PNG") -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, fmt)
    return buf.getvalue()


def _img_size(raw: bytes) -> tuple[int, int]:
    from PIL import Image

    return Image.open(io.BytesIO(raw)).size


def make_epub_with_cover() -> bytes:
    buf = io.BytesIO()
    z = zipfile.ZipFile(buf, "w")
    z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
    z.writestr("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/c.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    z.writestr("OEBPS/c.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Muqovali</dc:title></metadata>'
                              '<manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="cv" href="img/cv.jpg" media-type="image/jpeg" properties="cover-image"/></manifest>'
                              '<spine><itemref idref="a"/></spine></package>')
    z.writestr("OEBPS/a.xhtml", "<html><body><p>Matn.</p></body></html>")
    z.writestr("OEBPS/img/cv.jpg", _img(300, 450, (20, 120, 60), "JPEG"))
    z.close()
    return buf.getvalue()


def test_library_covers(m):
    """Muqova: yo'q bo'lsa — avtomatik chiziladi; nom o'zgarsa (avtomatik bo'lsa) qayta chiziladi; yuklangan rasm / PDF sahifasi /
    EPUB muqovasi avtomatikni almashtiradi va keyin nom o'zgarsa ham tegilmaydi; eski bazalardagi muqovasizlar to'ldiriladi."""
    a = login(m, "admin", ADMIN_PW, panel=True)
    pub = client(m)
    b = a.post("/api/admin/library/books", json={"title": "Muqova sinovi", "subtitle": "Birinchi nashr", "authors": "Aliyev V.", "year": 2021,
                                                  "publisher": "Fan", "categories": "Iqtisodiyot", "lang": "uz"}).json()
    assert b["cover"].startswith("/media/") and b["cover_auto"] == 1
    img = pub.get(b["cover"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg" and _img_size(img.content) == (600, 900)
    # o'zgarmagan ma'lumot bilan saqlash — muqova o'sha; nom o'zgarsa — yangisi, eski fayl o'chadi
    same = a.put(f"/api/admin/library/books/{b['id']}", json={"title": "Muqova sinovi", "cover": b["cover"]}).json()
    assert same["cover"] == b["cover"]
    ren = a.put(f"/api/admin/library/books/{b['id']}", json={"title": "Muqova sinovi (2-nashr)", "cover": b["cover"]}).json()
    assert ren["cover"] != b["cover"] and ren["cover_auto"] == 1
    assert pub.get(b["cover"]).status_code == 404
    # rasm yuklash — avtomatik emas, katta rasm kichraytiriladi; nom o'zgarsa ham tegilmaydi
    up = a.post(f"/api/admin/library/books/{b['id']}/cover", files={"file": ("c.png", _img(1200, 1800), "image/png")}).json()
    assert up["cover_auto"] == 0 and up["cover"] != ren["cover"]
    assert max(_img_size(pub.get(up["cover"]).content)) <= 900
    assert pub.get(ren["cover"]).status_code == 404  # avtomatik muqova fayli o'chdi
    assert a.post(f"/api/admin/library/books/{b['id']}/cover", files={"file": ("x.png", b"not an image", "image/png")}).status_code == 400
    kept = a.put(f"/api/admin/library/books/{b['id']}", json={"title": "Muqova sinovi (3-nashr)", "cover": up["cover"]}).json()
    assert kept["cover"] == up["cover"] and kept["cover_auto"] == 0
    # qayta avtomatik
    au = a.post(f"/api/admin/library/books/{b['id']}/cover/auto").json()
    assert au["cover_auto"] == 1 and au["cover"] != up["cover"]
    # PDF sahifasi: ko'rinish (preview) va muqova sifatida saqlash
    pdf = a.post(f"/api/admin/library/books/{b['id']}/files", files={"file": ("k.pdf", make_pdf(5), "application/pdf")}).json()
    pv = a.get(f"/api/admin/library/files/{pdf['id']}/preview?page=2")
    assert pv.status_code == 200 and pv.headers["content-type"] == "image/jpeg"
    assert pub.get(f"/api/admin/library/files/{pdf['id']}/preview?page=2").status_code in (401, 403)
    assert a.post(f"/api/admin/library/books/{b['id']}/cover/page", json={"file_id": pdf["id"], "page": 99}).json()["detail"] == "bad_page"
    pg = a.post(f"/api/admin/library/books/{b['id']}/cover/page", json={"file_id": pdf["id"], "page": 2}).json()
    assert pg["cover_auto"] == 0 and pg["cover"] != au["cover"]
    w, h = _img_size(pub.get(pg["cover"]).content)
    assert h <= 900 and abs(w / h - 400 / 600) < 0.02  # sahifa nisbati saqlangan (400×600 pt)
    # EPUB ichidagi muqova: kitob muqovasi avtomatik bo'lsa — almashtiradi
    eb = a.post("/api/admin/library/books", json={"title": "EPUB muqovasi", "authors": "Karimova D."}).json()
    assert eb["cover_auto"] == 1
    a.post(f"/api/admin/library/books/{eb['id']}/files", files={"file": ("m.epub", make_epub_with_cover(), "application/epub+zip")})
    eb2 = a.get(f"/api/admin/library/books/{eb['id']}").json()["book"]
    assert eb2["cover_auto"] == 0 and eb2["cover"] != eb["cover"]
    # eski baza: muqovasiz kitob — fon to'ldirishi
    from university.api.library import lib

    st = m.svc().st
    with st._tx() as c:
        c.execute("UPDATE lib_books SET cover='', cover_auto=0, cover_sig=NULL WHERE id=%s", (eb["id"],))
    assert lib().backfill_covers() >= 1
    bf = lib().book(eb["id"])
    assert bf["cover"].startswith("/media/") and bf["cover_auto"] == 1
    # ISBN dan kelgan tashqi havola saqlanmaydi: yuklab bo'lmasa — avtomatik muqova
    ext = a.post("/api/admin/library/books", json={"title": "Havolali", "cover": "http://127.0.0.1:1/x.jpg"}).json()
    assert ext["cover"].startswith("/media/") and ext["cover_auto"] == 1


def test_library_access_public(m):
    """Elektron fayl «Kimga ochiq»: registered — mehmon kitob sahifasini ko'radi, lekin o'qiy olmaydi (401); public — hamma o'qiydi."""
    a = login(m, "admin", ADMIN_PW, panel=True)
    pub = client(m)
    s1 = login(m, "student")
    b = a.post("/api/admin/library/books", json={"title": "Ochiq kitob", "authors": "Navoiy"}).json()
    f = a.post(f"/api/admin/library/books/{b['id']}/files", files={"file": ("k.pdf", make_pdf(3), "application/pdf")}).json()
    assert f["access"] == "registered"  # standart
    info = pub.get(f"/api/lib/books/{b['id']}").json()
    assert info["files"][0]["access"] == "registered" and info["files"][0]["can_read"] is False and "cover_sig" not in info["book"]
    assert pub.post(f"/api/lib/files/{f['id']}/open").status_code == 401
    assert s1.get(f"/api/lib/books/{b['id']}").json()["files"][0]["can_read"] is True
    assert s1.post(f"/api/lib/files/{f['id']}/open").status_code == 200
    # hammaga ochiq
    assert a.put(f"/api/admin/library/files/{f['id']}", json={"access": "public"}).json()["access"] == "public"
    info = pub.get(f"/api/lib/books/{b['id']}").json()
    assert info["files"][0]["access"] == "public" and info["files"][0]["can_read"] is True
    op = pub.post(f"/api/lib/files/{f['id']}/open")
    assert op.status_code == 200 and op.json()["progress"] is None and op.json()["guest"] is True
    url = op.json()["url"]
    r = pub.get(url, headers={"Range": "bytes=0-9"})
    assert r.status_code == 206 and r.content[:5] == b"%PDF-"
    assert pub.put(f"/api/lib/files/{f['id']}/progress", json={"loc": "1", "percent": 5}).status_code == 401  # o'qish joyi — faqat kirganlarga
    # yana faqat ro'yxatdan o'tganlarga — mehmon tokeni darhol bekor
    a.put(f"/api/admin/library/files/{f['id']}", json={"access": "registered"})
    assert pub.get(url).status_code == 403
    assert pub.post(f"/api/lib/files/{f['id']}/open").status_code == 401
    # eski qiymatlar: «all» → registered; teachers — ochiq JSON'da registered + audience
    assert a.put(f"/api/admin/library/files/{f['id']}", json={"access": "all"}).json()["access"] == "registered"
    a.put(f"/api/admin/library/files/{f['id']}", json={"access": "teachers"})
    x = s1.get(f"/api/lib/books/{b['id']}").json()["files"][0]
    assert x["access"] == "registered" and x["audience"] == "teachers" and x["can_read"] is False
    # yuklab olish (ruxsat berilganda) mehmonga — faqat public faylda
    a.put("/api/admin/library/settings", json={"allow_download": True})
    assert pub.get(f"/api/lib/files/{f['id']}/download").status_code == 401
    a.put(f"/api/admin/library/files/{f['id']}", json={"access": "public"})
    dl = pub.get(f"/api/lib/files/{f['id']}/download")
    assert dl.status_code == 200 and dl.content[:5] == b"%PDF-"
    a.put("/api/admin/library/settings", json={"allow_download": False})
    # mehmon uchun ochish soni cheklangan (IP bo'yicha)
    from university.api import library as LA

    old = LA.ANON_OPEN_LIMIT
    LA.ANON_OPEN_LIMIT = (2, 300.0)
    try:
        g = client(m)
        codes = [g.post(f"/api/lib/files/{f['id']}/open").status_code for _ in range(3)]
        assert codes == [200, 200, 429]
    finally:
        LA.ANON_OPEN_LIMIT = old
    # ochiq fond: «Kimga ochiq» umumiy sozlamasi
    assert a.put("/api/admin/library/seed/access", json={"access": "public"}).json()["access"] == "public"
    assert a.get("/api/admin/library/seed").json()["access"] == "public"
    assert a.put("/api/admin/library/seed/access", json={"access": "nobody"}).status_code == 400
    a.put("/api/admin/library/seed/access", json={"access": "registered"})


def test_library_desk_suggest(m):
    """Berish/qaytarish: kitob nomi bo'yicha takliflar — 3 belgidan, lotin/kirill farqsiz; berishda bo'sh nusxalar, qaytarishda qo'ldagilar."""
    a = login(m, "admin", ADMIN_PW, panel=True)
    st = m.svc().st
    b = a.post("/api/admin/library/books", json={"title": "Algebra va sonlar nazariyasi", "authors": "Qodirov B.", "year": 2019, "copies": 2}).json()
    a.post("/api/admin/library/books", json={"title": "Elektron algebra", "authors": "X"})  # nusxasiz — berishda chiqmaydi
    sug = lambda **kw: a.get("/api/admin/library/desk/suggest", params=kw).json()["items"]  # noqa: E731
    assert sug(q="al") == []
    items = sug(q="alg")
    assert [x["id"] for x in items][:1] == [b["id"]] and all(x["title"] != "Elektron algebra" for x in items)
    assert items[0]["free"] == 2 and len(items[0]["options"]) == 2 and items[0]["authors"] == ["Qodirov B."]
    assert any(x["id"] == b["id"] for x in sug(q="алгебра"))  # kirill
    assert any(x["id"] == b["id"] for x in sug(q="nazariy"))  # so'z boshi
    assert any(x["id"] == b["id"] for x in sug(q="qodirov"))  # muallif
    assert len(sug(q="a" * 3 + " ")) <= 8
    # qaytarish: hali hech kimda yo'q
    assert all(x["id"] != b["id"] for x in sug(q="algebra", mode="return"))
    inv = items[0]["options"][0]["inv"]
    uid = st.find_user("student")["id"]
    other = st.find_user("student2")["id"]
    assert a.post("/api/admin/library/issue", json={"user_id": uid, "code": inv}).status_code == 200
    ret = sug(q="algebra", mode="return")
    hit = next(x for x in ret if x["id"] == b["id"])
    assert [o["inv"] for o in hit["options"]] == [inv] and hit["options"][0]["loan"]["user"]["login"] == "student"
    assert any(x["id"] == b["id"] for x in sug(q="algebra", mode="return", user_id=uid))
    assert all(x["id"] != b["id"] for x in sug(q="algebra", mode="return", user_id=other))
    assert any(x["id"] == b["id"] for x in sug(q="algebra", mode="return", prefer=other))  # prefer — filtrlamaydi, faqat tartib
    iss = next(x for x in sug(q="algebra") if x["id"] == b["id"])
    assert [o["inv"] for o in iss["options"]] == [o["inv"] for o in items[0]["options"] if o["inv"] != inv]
    assert login(m, "student").get("/api/admin/library/desk/suggest?q=alg").status_code in (401, 403)
    a.post("/api/admin/library/return", json={"code": inv})


def test_backup_snapshot(m, tmp_path):
    from university import backup

    st = m.svc().st
    day = date.today().isoformat()
    d = backup.make(st, day)
    assert (d / "db" / "tables.json").exists() and (d / "db" / "lib_books.csv").stat().st_size > 0
    assert backup.list_backups(st)[0]["day"] == day
    import csv

    with open(d / "db" / "lib_books.csv", newline="", encoding="utf-8") as f:
        assert sum(1 for _ in csv.DictReader(f)) >= 2  # nusxa ichida kutubxona bor
    assert "tsv" not in open(d / "db" / "lib_fts.csv", encoding="utf-8").readline()  # hisoblanadigan ustun saqlanmaydi
    assert any((d / "files" / "library").rglob("*.pdf"))


def test_library_seo(m):
    a = login(m, "admin", ADMIN_PW, panel=True)
    b = a.post("/api/admin/library/books", json={"title": "SEO kitobi", "authors": ["T. Muallif"], "isbn": "9780306406157", "year": 2020, "annotation": "Qisqa tavsif"}).json()
    g = client(m)
    r = g.get("/library")
    assert r.status_code == 200 and "Kutubxona" in r.text
    r = g.get(f"/library/book/{b['id']}")
    assert r.status_code == 200 and "SEO kitobi" in r.text and '"Book"' in r.text and "T. Muallif" in r.text
    assert g.get("/library/book/yoqkitob").status_code == 404
    r = g.get(f"/library/read/{b['id']}")
    assert r.status_code == 200 and "noindex" in r.text
    assert f"/library/book/{b['id']}" in g.get("/sitemap.xml").text


def test_library_open_fund_seed(m, tmp_path, monkeypatch):
    """Ochiq fond: katalogdagi kitoblar (PDF, EPUB, MP3 boblar) yuklanib fondga qo'shiladi; qayta ishga tushirish takrorlamaydi;
    admin o'chirgan kitob avtomatik qaytmaydi, faqat «restore» bilan."""
    import json
    import shutil

    import university.api.library_seed as S

    mp3 = b"ID3\x03\x00\x00\x00\x00\x00\x00" + (b"\xff\xfb\x50\xc4" + b"\x00" * 204) * 400  # MPEG-1 L3, 64 kbit/s
    src = tmp_path / "src"
    src.mkdir()
    (src / "a.pdf").write_bytes(make_pdf(3))
    (src / "b.epub").write_bytes(make_epub())
    (src / "c1.mp3").write_bytes(mp3)
    (src / "c2.mp3").write_bytes(mp3)
    root = tmp_path / "seed"
    (root / "covers").mkdir(parents=True)
    from PIL import Image

    Image.new("RGB", (60, 90), (10, 46, 115)).save(root / "covers" / "kimyo.jpg")
    cat = [
        {"key": "kimyo", "title": "Kimyo 2e", "authors": ["P. Flowers"], "lang": "en", "categories": ["Kimyo"], "annotation": "Umumiy kimyo darsligi.",
         "license": "CC BY 4.0", "source": "OpenStax", "source_url": "https://openstax.org/details/books/chemistry-2e", "files": [{"kind": "pdf", "url": "https://x.test/a.pdf"}]},
        {"key": "kecha", "title": "Kecha va kunduz", "authors": ["Cho‘lpon"], "lang": "uz", "categories": ["Badiiy adabiyot"], "annotation": "Roman.",
         "license": "Public domain", "source": "Wikisource", "files": [{"kind": "epub", "url": "https://x.test/b.epub"}]},
        {"key": "sham", "title": "Sham kimyoviy tarixi", "authors": ["M. Faraday"], "lang": "en", "categories": ["Kimyo", "Audiokitob"], "annotation": "Ma’ruzalar.",
         "license": "Public domain", "source": "LibriVox", "files": [{"kind": "audio", "url": "https://x.test/c1.mp3", "title": "1-ma’ruza", "duration": 61},
                                                                    {"kind": "audio", "url": "https://x.test/c2.mp3", "title": "2-ma’ruza"}]},
    ]
    (root / "catalog.json").write_text(json.dumps(cat, ensure_ascii=False), encoding="utf-8")
    fetched: list[str] = []

    def fake_download(url, dest, limit):
        fetched.append(url)
        shutil.copy(src / url.rsplit("/", 1)[-1], dest)
        return dest.stat().st_size

    monkeypatch.setattr(S, "ROOT", root)
    monkeypatch.setattr(S, "_download", fake_download)
    a = login(m, "admin", ADMIN_PW, panel=True)
    st0 = a.get("/api/admin/library/seed").json()
    assert [r["status"] for r in st0["items"]] == ["pending"] * 3
    S.run()
    st1 = a.get("/api/admin/library/seed").json()
    assert [r["status"] for r in st1["items"]] == ["done"] * 3, st1
    assert len(fetched) == 4
    bids = {r["key"]: r["book_id"] for r in st1["items"]}
    d = a.get(f"/api/admin/library/books/{bids['kimyo']}").json()
    assert d["book"]["cover"] and "OpenStax" in d["book"]["annotation"] and "CC BY 4.0" in d["book"]["annotation"]
    assert [f["kind"] for f in d["files"]] == ["pdf"] and d["files"][0]["pages"] == 3
    au = a.get(f"/api/admin/library/books/{bids['sham']}").json()["files"]
    assert [f["title"] for f in au] == ["1-ma’ruza", "2-ma’ruza"] and au[0]["duration"] == 61 and au[1]["duration"] > 0
    ep = a.get(f"/api/admin/library/books/{bids['kecha']}").json()
    assert ep["files"][0]["kind"] == "epub" and ep["book"]["lang"] == "uz"
    assert any(x["id"] == bids["kecha"] for x in client(m).get("/api/lib/search", params={"q": "kvant chigallashuvi"}).json()["items"])  # EPUB matni indekslangan
    S.run()  # takrorlanmaydi
    assert len(fetched) == 4
    assert a.delete(f"/api/admin/library/books/{bids['kecha']}").status_code == 200
    S.run()
    assert len(fetched) == 4 and [r["status"] for r in a.get("/api/admin/library/seed").json()["items"]][1] == "deleted"
    S.run(keys=["kecha"], restore=True)
    assert len(fetched) == 5 and a.get("/api/admin/library/seed").json()["items"][1]["status"] == "done"
    assert login(m, "teacher").get("/api/admin/library/seed").status_code in (401, 403)
