"""Sayt servisi: administrator, boshlang'ich kontent, sozlamalar, email konteksti va rejalashtirilgan tarqatmalar."""
from __future__ import annotations

import copy

import hashlib
import json
import os
import re
import secrets
import sys
import threading
import time
from datetime import datetime

from . import content as C
from . import tuition as T
from .mailer import Mailer, can_send
from .render import Renderer
from .storage import Storage, local_now

VERSION = "1.0.0"

BOT_RE = re.compile(r"bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|pagespeed|curl|wget|python-requests|httpx|axios|go-http|java/|monitor|uptime|scan", re.I)


def parse_ua(ua: str) -> dict:
    ua = ua or ""
    if re.search(r"iPad|Tablet|(Android(?!.*Mobile))", ua):
        device = "tablet"
    elif re.search(r"Mobi|iPhone|Android", ua):
        device = "mobile"
    else:
        device = "desktop"
    browser = "Other"
    for name, pat in (("Edge", r"Edg/"), ("Opera", r"OPR/|Opera"), ("Yandex", r"YaBrowser"), ("Samsung", r"SamsungBrowser"), ("Firefox", r"Firefox/|FxiOS"),
                      ("Chrome", r"Chrome/|CriOS"), ("Safari", r"Safari/")):
        if re.search(pat, ua):
            browser = name
            break
    os_name = "Other"
    for name, pat in (("iOS", r"iPhone|iPad|iPod"), ("Android", r"Android"), ("Windows", r"Windows"), ("macOS", r"Mac OS X|Macintosh"), ("Linux", r"Linux|X11")):
        if re.search(pat, ua):
            os_name = name
            break
    return {"device": device, "browser": browser, "os": os_name}


def is_bot(ua: str) -> bool:
    return not ua or bool(BOT_RE.search(ua))


class Service:
    def __init__(self, storage: Storage):
        self.st = storage
        self.base_url_seen = ""
        self.static_stamp = ""  # frontend yig'ilgan vaqti: yangilanganda PDF/og kesh eskiradi
        self.internal_base = ""  # Chromium sahifani shu manzildan ochadi (http://127.0.0.1:<port>)
        self.render = Renderer(self.st.dir / "cache")
        self._bootstrap()
        self.mail = Mailer(self.st, self.email_ctx, self.loc)
        self._stop = threading.Event()
        self._scheduler: threading.Thread | None = None

    # ------------------------------------------------------------------ boshlang'ich holat
    def _bootstrap(self) -> None:
        if self.st.user_count("admin") == 0:
            login = (os.environ.get("SITE_ADMIN_LOGIN") or "admin").strip().lower()
            password = os.environ.get("SITE_ADMIN_PASSWORD") or ""
            generated = not password
            if generated:
                password = secrets.token_urlsafe(12)
            if self.st.find_user(login):
                self.st.update_user(self.st.find_user(login)["id"], role="admin", password=password)
            else:
                self.st.create_user(login, "Administrator", password, role="admin", email=os.environ.get("SITE_ADMIN_EMAIL", ""))
            if generated:
                # parol konteyner logidan tashqari ma'lumotlar papkasiga ham yoziladi (docker: /data/admin_password.txt)
                try:
                    pf = self.st.dir / "admin_password.txt"
                    pf.write_text(f"login: {login}\nparol: {password}\n", encoding="utf-8")
                    pf.chmod(0o600)
                except OSError:
                    pass
                print("=" * 64 + f"\nUniversity: administrator yaratildi. Login: {login}  Parol: {password}\n"
                      f"(nusxasi: {self.st.dir / 'admin_password.txt'})\n"
                      "Parolni /admin → Sozlamalar → Hisob bo'limida o'zgartiring yoki SITE_ADMIN_PASSWORD o'rnating.\n" + "=" * 64, file=sys.stderr, flush=True)
        elif os.environ.get("SITE_ADMIN_RESET_PASSWORD", "").lower() in ("1", "true", "yes") and os.environ.get("SITE_ADMIN_PASSWORD"):
            row = self.st.find_user((os.environ.get("SITE_ADMIN_LOGIN") or "admin").lower())
            if row:
                self.st.update_user(row["id"], password=os.environ["SITE_ADMIN_PASSWORD"])
                print("University: administrator paroli SITE_ADMIN_PASSWORD bo'yicha tiklandi", file=sys.stderr, flush=True)
        if self.st.kv_get("seeded") is None:
            for s in C.SEED:
                data = dict(s["data"])
                fixed = data.pop("id", None)
                cols, rest = C.clean_item(s["kind"], data)
                self.st.save_item(s["kind"], cols, rest, new_id=fixed)
            self.st.kv_put("seeded", True)
            self.st.kv_put("seed_version", C.SEED_VERSION)
        version = self.st.kv_get("seed_version") or 1
        if version < 2:
            self._seed_missing(C.SEED_V2)
        if version < 3:
            self._seed_missing(C.SEED_V3)
            self._move_faculties(C.FACULTY_MOVES_V3)
        if version < 4:
            self._seed_missing(C.SEED_V4)
            self._fill_translations()
            self._drop_staff_menu()
        if version < C.SEED_VERSION:
            self.st.kv_put("seed_version", C.SEED_VERSION)
        if self.st.kv_get("demo_academic") is None and os.environ.get("SITE_DEMO_ACADEMIC", "1") != "0":
            self._seed_academic()
            self.st.kv_put("demo_academic", True)
        if not self.st.kv_get("menu_contact_v5"):
            self._contact_menu()
            self.st.kv_put("menu_contact_v5", True)
        if not self.st.kv_get("people_linked"):
            self._link_people()
            self.st.kv_put("people_linked", True)
        if not self.st.kv_get("program_careers_v1"):
            self._strip_program_careers()
            self.st.kv_put("program_careers_v1", True)
        if not self.st.kv_get("program_fees_v1"):
            self._fill_demo_fees()
            self.st.kv_put("program_fees_v1", True)
        if not self.st.kv_get("menu_upgoals_v1"):
            self._upgoals_menu()
            self.st.kv_put("menu_upgoals_v1", True)
        if not self.st.kv_get("menu_sections_v6"):
            self._sections_menu()
            self.st.kv_put("menu_sections_v6", True)
        if not self.st.kv_get("menu_grants_v1"):
            self._upgoals_menu({"/about/grantga-qayta-taqsimot": "/grant-redistribution"})
            self.st.kv_put("menu_grants_v1", True)
        if not self.st.kv_get("menu_careers_v1"):
            self._careers_menu()
            self.st.kv_put("menu_careers_v1", True)
        if not self.st.kv_get("page_hints_v1"):
            self._drop_page_hints()
            self.st.kv_put("page_hints_v1", True)
        from . import official  # noqa: PLC0415

        official.bootstrap(self.st)

    def _hero_carousel(self) -> None:
        """Saqlangan sozlamada ro'yxat bo'sh va «Bosh rasm» boshlang'ich surat bo'lsa — bosh ekran karuselini moslaydi."""
        site = self.st.kv_get("site")
        if not isinstance(site, dict) or ("hero_images" not in site and "home_images" not in site):
            return
        if site.get("hero_images"):
            return
        seed = C.HERO_SEED
        hero = {**C.DEFAULT_SITE["home_images"], **(site.get("home_images") or {})}.get("hero") or ""
        if not seed or hero != seed[0]:
            return
        self.st.kv_put("site", site | {"hero_images": list(seed), "home_images": {**(site.get("home_images") or {}), "hero": seed[0]}})

    def _upgoals_menu(self, moves: dict | None = None) -> None:
        """Alohida sahifaga aylangan bo'limlar: saqlangan menyudagi eski havola yangisiga almashtiriladi
        (BRM → /upgoals, grant taqsimoti → /grant-redistribution)."""
        moves = moves or {"/about/barqaror-rivojlanish": "/upgoals"}
        site = self.st.kv_get("site")
        if not isinstance(site, dict) or not site.get("menu"):
            return
        def fix(m: dict) -> dict:
            m = dict(m)
            u = m.get("url") or ""
            if u in moves:  # aniq havola (so'rov qismi bilan)
                m["url"] = moves[u]
            elif u.split("?")[0] in moves:
                m["url"] = moves[u.split("?")[0]]
            if m.get("children"):
                m["children"] = [fix(c) for c in m["children"]]
            return m
        self.st.kv_put("site", site | {"menu": [fix(m) for m in site["menu"]]})

    def _fill_demo_fees(self) -> None:
        """Avvaldan ishlab turgan bazada yo'nalishlarga namunaviy narx qo'yiladi, lekin saytda ko'rsatish o'chiq —
        admin «Kontrakt narxlari» bo'limida tekshirib yoqadi (taxminiy summa ochiq saytga o'z-o'zidan chiqib qolmasin)."""
        filled = 0
        for it in self.st.list_items("program"):
            base = self.st.get_item(it["id"]) or it
            if base.get("fees") or not base.get("slug"):
                continue
            fees = C.demo_fees(base["slug"], base.get("faculty_id") or "")
            if not fees:  # namunaviy narx yo'q — summalarni admin kiritadi
                continue
            self.st.patch_item_data(it["id"], fees=fees)
            filled += 1
        if filled and self.st.kv_get("tuition") is None:
            self.st.kv_put("tuition", {"show": False, "demo": True})

    # yo'nalish matnidagi «Bitiruvchilar qayerda ishlaydi» bo'limi — sahifa uni «careers» maydonidan alohida chiqaradi (takror bo'lmasin)
    CAREER_HEADS = {"bitiruvchilar qayerda ishlaydi", "где работают выпускники", "where graduates work"}

    @classmethod
    def strip_careers_section(cls, block: dict) -> bool:
        """Matn (va tarjima) bloki ichidan karyera sarlavhasi + undan keyingi ro'yxatni olib tashlaydi. O'zgargan bo'lsa True."""
        doc = block.get("content")
        changed = False
        if isinstance(doc, dict) and isinstance(doc.get("content"), list):
            nodes, out, skip_list = doc["content"], [], False
            for n in nodes:
                if skip_list and n.get("type") in ("bulletList", "orderedList"):
                    skip_list = False
                    continue
                skip_list = False
                if n.get("type") == "heading" and C._text(n).strip().lower().rstrip(":") in cls.CAREER_HEADS:
                    skip_list, changed = True, True
                    continue
                out.append(n)
            if changed:
                block["content"] = {**doc, "content": out}
                block["text"] = C._text(block["content"])
        html = block.get("html")
        if isinstance(html, str):
            for h in cls.CAREER_HEADS:
                pat = re.compile(r"<h[1-6][^>]*>\s*" + re.escape(h) + r":?\s*</h[1-6]>\s*(<(ul|ol)[^>]*>.*?</\2>)?", re.I | re.S)
                new = pat.sub("", html)
                if new != html:
                    html, changed = new, True
            block["html"] = html
        return changed

    def _strip_program_careers(self) -> None:
        for it in self.st.list_items("program"):
            base = {k: it.get(k) for k in ("content", "html", "text")}
            changed = self.strip_careers_section(base)
            i18n = it.get("i18n") or {}
            for tr in i18n.values():
                if isinstance(tr, dict) and self.strip_careers_section(tr):
                    changed = True
            if changed:
                self.st.patch_item_data(it["id"], **{k: v for k, v in base.items() if v is not None}, i18n=i18n)

    def _link_people(self) -> None:
        """Xodimlar foydalanuvchilardan: har bir profil (staff) — o'z hisobi bilan (professor → teacher, boshqa xodim → staff).
        Hisobi yo'q profillarga hisob ochiladi (tasodifiy parol — admin «Foydalanuvchilar»da o'rnatadi), profilsiz xodimlarga — yashirin profil."""
        st = self.st
        taken = {u["login"] for u in st.list_users()}
        for it in st.list_items("staff"):
            if it.get("user_id") and st.get_user(it["user_id"]):
                continue
            base = re.sub(r"[^a-z0-9]+", ".", (it.get("slug") or C.slugify(it["title"]) or "xodim").lower()).strip(".")[:40] or "xodim"
            login, n = base, 2
            while login in taken or len(login) < 3:
                login, n = f"{base}{n}", n + 1
            taken.add(login)
            role = "staff" if it.get("category") == "staff" else "teacher"
            dep = st.get_item(it["department_id"]) if it.get("department_id") else None
            u = st.create_user(login, it["title"], secrets.token_urlsafe(18), role=role, email="", data={
                "staff_id": it["id"], "position": it.get("position") or "", "department": (dep or {}).get("title", ""), "photo": it.get("photo") or "",
                "faculty_ids": [it["faculty_id"]] if role == "teacher" and it.get("faculty_id") else []})
            st.patch_item_data(it["id"], user_id=u["id"])
        for u in st.list_users():
            d = u.get("data") or {}
            if u["role"] not in ("teacher", "staff") or (d.get("staff_id") and st.get_item(d["staff_id"])):
                continue
            cols, rest = C.clean_item("staff", {"title": u["name"], "user_id": u["id"], "position": d.get("position", ""), "email": u.get("email") or "",
                                                "category": "teacher" if u["role"] == "teacher" else "staff", "status": "draft"})
            slug, n = cols["slug"], 2
            while st.slug_taken("staff", slug):
                slug, n = f"{cols['slug']}-{n}", n + 1
            cols["slug"] = slug
            it = st.save_item("staff", cols, rest)
            st.update_user(u["id"], data={"staff_id": it["id"]})

    def _move_faculties(self, moves: dict) -> None:
        """Seed qiymati o'zgarmagan yozuvlarni yangi fakultetga ko'chirish (admin o'zgartirganlari tegilmaydi)."""
        for kind, by_slug in moves.items():
            for it in self.st.list_items(kind):
                mv = by_slug.get(it.get("slug") or "")
                if mv and it.get("faculty_id") == mv[0]:
                    self.st.patch_item_data(it["id"], faculty_id=mv[1])

    def _fill_translations(self) -> None:
        """Mavjud bazada: boshlang'ich yozuvlarga yetishmayotgan tarjimalar (asl matni admin tomonidan o'zgartirilmagan maydonlarga)."""
        st = self.st
        rich = ("content", "html", "text", "reading_time")
        for sd in C.SEED:
            data, kind = sd["data"], sd["kind"]
            it = st.get_item(data["id"]) if data.get("id") else None
            if not it and data.get("slug"):
                it = st.get_item_by_slug(kind, data["slug"], public=False)
            if not it:
                it = next((x for x in st.list_items(kind) if x.get("title") == data.get("title")), None)
            if not it or it["kind"] != kind:
                continue
            i18n = {k: dict(v) for k, v in (it.get("i18n") or {}).items() if isinstance(v, dict)}
            changed = False
            for lang, tr in (data.get("i18n") or {}).items():
                cur = i18n.setdefault(lang, {})
                for f, v in tr.items():
                    if not C._empty(cur.get(f)):
                        continue
                    same = (it.get("text") or "") == (data.get("text") or "") if f in rich else it.get(f) == data.get(f)
                    if same:
                        cur[f] = v
                        changed = True
            if changed:
                st.patch_item_data(it["id"], i18n={k: v for k, v in i18n.items() if v})
        for name, default in (("uni", C.DEFAULT_UNI), ("site", C.DEFAULT_SITE)):
            saved = st.kv_get(name)
            if not isinstance(saved, dict) or "i18n" not in saved:
                continue  # saqlanmagan — standart tarjimalar o'zi ishlaydi
            i18n = {k: dict(v) for k, v in (saved.get("i18n") or {}).items() if isinstance(v, dict)}
            for lang, tr in (default.get("i18n") or {}).items():
                cur = i18n.setdefault(lang, {})
                for f, v in tr.items():
                    base = saved.get(f, default.get(f))
                    if C._empty(cur.get(f)) and base == default.get(f):
                        cur[f] = v
            st.kv_put(name, saved | {"i18n": i18n})

    def _contact_menu(self) -> None:
        """«Aloqa» endi ochiluvchi: «Virtual qabulxona» (aloqa sahifasi) va «Telegram bot»."""
        site = self.st.kv_get("site")
        if not isinstance(site, dict) or not site.get("menu"):
            return
        menu = site["menu"]
        for m in menu:
            if (m.get("url") or "").split("?")[0] == "/contact" and not m.get("children"):
                m["children"] = [
                    {"label": "Virtual qabulxona", "url": "/contact", "labels": {"ru": "Виртуальная приёмная", "en": "Virtual reception"}, "group": ""},
                    {"label": "Telegram bot", "url": "/telegram", "labels": {"ru": "Telegram-бот", "en": "Telegram bot"}, "group": ""},
                ]
        self.st.kv_put("site", site | {"menu": menu})

    # sahifa matniga qo'shib yuborilgan tugma izohlari (tugma yonida/ostida izoh yozilmaydi)
    PAGE_HINTS = (
        "Har bir hujjat yonidagi «Ko‘rish» tugmasi uni shu sahifaning o‘zida ochadi.",
        "Кнопка «Просмотр» рядом с документом открывает его прямо на этой странице.",
        "The View button next to each document opens it right on this page.",
    )

    @classmethod
    def strip_hints(cls, block: dict) -> dict:
        """Matn (yoki tarjima) blokidan izoh paragrafini olib tashlaydi: html'da aynan `<p>izoh</p>`, text'da shu qator,
        content'da (muharrir JSON'i) faqat shu matndan iborat paragraf. O'zgargan maydonlar qaytariladi (o'zgarish bo'lmasa — bo'sh)."""
        out: dict = {}
        html = block.get("html")
        if isinstance(html, str) and any(f"<p>{h}</p>" in html for h in cls.PAGE_HINTS):
            for h in cls.PAGE_HINTS:
                html = html.replace(f"<p>{h}</p>", "")
            out["html"] = html
            text = block.get("text")
            if isinstance(text, str):
                out["text"] = "\n".join(x for x in text.split("\n") if x.strip() not in cls.PAGE_HINTS)
        doc = block.get("content")
        if isinstance(doc, dict) and isinstance(doc.get("content"), list):
            def hint(n) -> bool:
                if not isinstance(n, dict) or n.get("type") != "paragraph":
                    return False
                kids = n.get("content") or []
                return bool(kids) and all(isinstance(k, dict) and k.get("type") == "text" and not k.get("marks") for k in kids) \
                    and "".join(k.get("text") or "" for k in kids) in cls.PAGE_HINTS
            nodes = [n for n in doc["content"] if not hint(n)]
            if len(nodes) != len(doc["content"]):
                out["content"] = {**doc, "content": nodes}
        return out

    def _drop_page_hints(self) -> None:
        """Bir martalik: avval seed bilan qo'shilgan «Ko'rish tugmasi … ochadi» izohi mavjud sahifalardan olib tashlanadi —
        faqat matnda u hali aynan o'sha ko'rinishda turgan bo'lsa (admin o'zgartirgan matnga tegilmaydi)."""
        for it in self.st.list_items("page"):
            patch = self.strip_hints(it)
            i18n = dict(it.get("i18n") or {})
            changed = False
            for lang, tr in i18n.items():
                if isinstance(tr, dict):
                    p = self.strip_hints(tr)
                    if p:
                        i18n[lang] = {**tr, **p}
                        changed = True
            if changed:
                patch["i18n"] = i18n
            if patch:
                self.st.patch_item_data(it["id"], **patch)

    CAREERS_MENU = {"label": "Vakansiyalar", "url": "/careers", "labels": {"ru": "Вакансии", "en": "Vacancies"}, "group": ""}

    def _careers_menu(self) -> None:
        """Vakansiyalar sahifasi bor, lekin saqlangan menyuda havolasi yo'q edi — «Institut haqida» ichiga, tuzilma havolasidan keyin qo'shiladi.
        Menyuda /careers allaqachon bo'lsa (istalgan joyda) — tegilmaydi. Bir martalik: admin keyin olib tashlasa, qayta qo'shilmaydi."""
        site = self.st.kv_get("site")
        if not isinstance(site, dict) or not site.get("menu"):
            return  # saqlangan menyu yo'q — seed.MENU ishlatiladi

        def path(m: dict) -> str:
            return (m.get("url") or "").split("?")[0].split("#")[0].rstrip("/")

        menu = [dict(m) for m in site["menu"]]
        if any(path(x).startswith("/careers") for m in menu for x in [m, *(m.get("children") or [])]):
            return
        host = next((m for m in menu if any(path(c) == "/structure" for c in m.get("children") or [])), None) \
            or next((m for m in menu if path(m).startswith("/about")), None)
        if host is not None and len(host.get("children") or []) < 16:
            kids = list(host.get("children") or [])
            at = next((i + 1 for i, c in enumerate(kids) if path(c) == "/structure"), len(kids))
            near = kids[at - 1] if at else {}
            kids.insert(at, self.CAREERS_MENU | {"group": near.get("group") or ""})
            host["children"] = kids
        elif len(menu) < 9:
            at = next((i for i, m in enumerate(menu) if path(m) == "/contact"), len(menu))
            menu.insert(at, self.CAREERS_MENU | {"children": []})
        else:
            return
        self.st.kv_put("site", site | {"menu": menu})

    def _sections_menu(self) -> None:
        """Yangi bo'limlar (jurnal, qabul jadvali, ochiq ma'lumotlar, klublar, karyera…) menyuga o'z joyiga qo'shiladi; bo'sh bo'limlar saytda yashiriladi."""
        from . import menu_sections as MS  # noqa: PLC0415

        site = self.st.kv_get("site")
        if isinstance(site, dict) and site.get("menu"):
            self.st.kv_put("site", site | {"menu": MS.add_to_menu(site["menu"])})

    def _drop_staff_menu(self) -> None:
        """Professorlar endi fakultet sahifalarida: saqlangan menyudan «/staff» havolalari olib tashlanadi."""
        site = self.st.kv_get("site")
        if not isinstance(site, dict) or not site.get("menu"):
            return
        def keep(m: dict) -> bool:
            return (m.get("url") or "").split("?")[0] != "/staff"
        menu = [m | {"children": [c for c in (m.get("children") or []) if keep(c)]} for m in site["menu"] if keep(m)]
        # yangi bo'lim: Vakansiyalar (Careers) — «Aloqa» oldidan
        if not any((m.get("url") or "").startswith("/careers") for m in menu) and len(menu) < 9:
            item = {"label": "Vakansiyalar", "url": "/careers", "labels": {"ru": "Вакансии", "en": "Careers"}, "children": [], "group": ""}
            pos = next((i for i, m in enumerate(menu) if (m.get("url") or "") == "/contact"), len(menu))
            menu.insert(pos, item)
        self.st.kv_put("site", site | {"menu": menu})

    def _seed_missing(self, seeds: list[dict]) -> None:
        """Yangi versiyadagi boshlang'ich yozuvlar: slug (yoki sarlavha) bo'yicha bazada bo'lmaganlari qo'shiladi."""
        for s in seeds:
            data = dict(s["data"])
            fixed = data.pop("id", None)
            kind = s["kind"]
            if fixed and self.st.get_item(fixed):
                continue
            if data.get("slug") and self.st.slug_taken(kind, data["slug"]):
                continue
            if not data.get("slug") and any(x.get("title") == data.get("title") for x in self.st.list_items(kind)):
                continue
            cols, rest = C.clean_item(kind, data)
            self.st.save_item(kind, cols, rest, new_id=fixed)

    def _seed_academic(self) -> None:
        """Namuna o'quv ma'lumotlari: semestr, guruhlar, fanlar, auditoriyalar, o'qituvchilar va talabalar (parollar logda)."""
        st = self.st
        year = local_now().year
        sem = st.acad_save("semesters", {"name": f"{year}/{year + 1} o‘quv yili, kuzgi semestr", "start": f"{year}-09-01", "end": f"{year + 1}-01-20", "current": True, "published": True})
        g1 = st.acad_save("groups", {"name": "CS-25-1", "course": 2, "lang": "O‘zbek", "year_start": year - 1})
        g2 = st.acad_save("groups", {"name": "EC-26-1", "course": 1, "lang": "O‘zbek / Rus", "year_start": year})
        subs = {n: st.acad_save("subjects", {"name": n, "code": c, "credits": cr}) for n, c, cr in (
            ("Umumiy fizika", "PHY101", 6), ("Dasturlash asoslari", "CS101", 6), ("Ingliz tili", "ENG101", 4),
            ("Oliy matematika", "MATH101", 6), ("Iqtisodiyot nazariyasi", "ECON101", 6), ("Falsafa", "PHIL101", 2))}
        lab1 = "Lab-1"
        rooms = {n: st.acad_save("rooms", {"name": n, "building": b, "capacity": c, "type": t}) for n, b, c, t in (
            ("101", "Bosh bino", 30, "classroom"), ("204", "Bosh bino", 60, "lecture"), (lab1, "Laboratoriya korpusi", 20, "lab"), ("Lab-2", "Laboratoriya korpusi", 20, "lab"))}
        slots = st.acad_list("time_slots")
        demo_pw = os.environ.get("SITE_DEMO_PASSWORD") or "demo2025"
        teacher = st.create_user("teacher", "Namuna O‘qituvchi (1)", demo_pw, role="teacher", email="teacher@example.edu",
                                 data={"position": "O‘qituvchi", "department": "Muhandislik kafedrasi"})
        teacher2 = st.create_user("teacher2", "Namuna O‘qituvchi (2)", demo_pw, role="teacher", email="teacher2@example.edu",
                                  data={"position": "O‘qituvchi", "department": "Fundamental fanlar kafedrasi"})
        st.create_user("scheduler", "O‘quv bo‘limi", demo_pw, role="admin", email="study@example.edu", data={"role_id": "study"})
        st.create_user("xodim", "Namuna Xodim (o‘quv bo‘limi)", demo_pw, role="staff", email="xodim@example.edu", data={"position": "O‘quv bo‘limi mutaxassisi", "sections": ["study"]})
        students = []
        for i, (login, name, grp) in enumerate((("student", "Talaba Bir", g1), ("student2", "Talaba Ikki", g1), ("student3", "Talaba Uch", g1),
                                                ("student4", "Talaba To‘rt", g2), ("student5", "Talaba Besh", g2))):
            students.append(st.create_user(login, name, demo_pw, role="student", email=f"{login}@example.edu", group_id=grp["id"], data={"student_no": f"UNI{year}{i + 1:04d}", "phone": ""}))
        plan = [
            (g1, "Dasturlash asoslari", teacher, lab1, 0, 0, "lab"), (g1, "Dasturlash asoslari", teacher, lab1, 2, 0, "lab"), (g1, "Dasturlash asoslari", teacher, lab1, 4, 1, "lab"),
            (g1, "Umumiy fizika", teacher, "204", 1, 1, "lecture"), (g1, "Ingliz tili", teacher2, "101", 3, 0, "practice"), (g1, "Falsafa", teacher2, "204", 1, 2, "lecture"),
            (g2, "Oliy matematika", teacher2, "204", 0, 1, "lecture"), (g2, "Oliy matematika", teacher2, "101", 2, 1, "practice"), (g2, "Iqtisodiyot nazariyasi", teacher2, "101", 1, 0, "lecture"),
            (g2, "Iqtisodiyot nazariyasi", teacher2, "101", 3, 1, "practice"), (g2, "Ingliz tili", teacher2, "101", 4, 0, "practice"), (g2, "Dasturlash asoslari", teacher, lab1, 1, 2, "lab"),
        ]
        for grp, subj, tch, room, wd, slot_i, typ in plan:
            if slot_i < len(slots):
                st.save_lesson(st.clean_lesson({"semester_id": sem["id"], "group_id": grp["id"], "subject_id": subs[subj]["id"], "teacher_id": tch["id"], "room_id": rooms[room]["id"], "weekday": wd, "slot_id": slots[slot_i]["id"], "type": typ}))
        st.save_notice({"title": "Kuzgi semestr dars jadvali e’lon qilindi", "body": "Hurmatli talabalar va o‘qituvchilar! Kuzgi semestr dars jadvali shaxsiy kabinetda. O‘zgarishlar haqida bildirishnoma orqali xabar beramiz.", "audience": "all", "pinned": True}, st.find_user("scheduler")["id"])
        print("=" * 64 + f"\nUniversity: namuna o'quv ma'lumotlari yaratildi. Loginlar: teacher, teacher2, xodim, student…student5 (kabinet), scheduler (/admin, «O'quv bo'limi» roli). Parol: {demo_pw}\n"
              "Ularni admin → Foydalanuvchilar bo'limida o'chiring yoki parolini o'zgartiring. SITE_DEMO_ACADEMIC=0 — namunasiz ishga tushirish.\n" + "=" * 64, file=sys.stderr, flush=True)

    def uni(self) -> dict:
        p = {**C.DEFAULT_UNI, **(self.st.kv_get("uni", {}) or {})}
        p["socials"] = {**{k: "" for k in C.SOCIALS}, **(p.get("socials") or {})}
        return p

    def _site(self) -> dict:
        # sozlamalar o'zgarmaguncha (kv versiyasi) bir marta hisoblanadi — har bir kontent elementi uchun qayta emas
        ver = self.st.kv_version()
        memo = getattr(self, "_site_memo", None)
        if memo is None or memo[0] != ver or ver < 0:
            s = {**C.DEFAULT_SITE, **(self.st.kv_get("site", {}) or {})}
            s["hero"] = {**C.DEFAULT_SITE["hero"], **(s.get("hero") or {})}
            memo = self._site_memo = (ver, C.with_hero_list(C.clean_site({"sections": s.get("sections")}, s)))
        return memo[1]

    def site(self) -> dict:
        return copy.deepcopy(self._site())

    # ------------------------------------------------------------------ tillar
    def base_lang(self) -> str:
        """Asosiy til (admin → Sayt): kontentning asl matni shu tilda, saytga birinchi kirganda ham shu til."""
        return self._site().get("lang") or "uz"

    def lang(self, lang: str | None) -> str:
        return C.lang_or(lang, self.base_lang())

    def uni_l(self, lang: str | None) -> dict:
        return C.localize(self.uni(), self.lang(lang), self.base_lang(), C.UNI_I18N, meta=False)

    def site_l(self, lang: str | None) -> dict:
        # `lang` kaliti o'zgarmaydi — u sayt asosiy tili
        return C.localize(self.site(), self.lang(lang), self.base_lang(), C.SITE_I18N, meta=False)

    def loc(self, it: dict, lang: str | None) -> dict:
        out = C.localize(it, self.lang(lang), self.base_lang(), C.TRANSLATABLE.get(it.get("kind") or "", ()))
        if out.get("kind") == "program" and not T.shown(self.st):
            # narxlar admin tomonidan yashirilgan — ochiq API va SEO'ga chiqmaydi
            out = {k: v for k, v in out.items() if k not in ("fees", "fee_note")}
        return out

    def smtp(self) -> dict:
        return {**C.DEFAULT_SMTP, **(self.st.kv_get("smtp", {}) or {})}

    def base_url(self) -> str:
        return (self.site().get("url") or os.environ.get("SITE_URL") or self.base_url_seen or "http://localhost:8000").rstrip("/")

    def doc_version(self, item: dict | None = None, lang: str = "") -> str:
        """PDF va og:image kesh kaliti: kontent, til, universitet profili, sayt sozlamalari yoki frontend o'zgarsa — yangi kalit."""
        parts = [VERSION, lang, self.static_stamp, self.base_url(), json.dumps(self.uni(), sort_keys=True, default=str),
                 json.dumps(self.site(), sort_keys=True, default=str)]
        if item:
            parts += [item["id"], item.get("updated") or ""]
        return hashlib.sha1("|".join(parts).encode()).hexdigest()[:12]

    @staticmethod
    def initials(name: str) -> str:
        parts = [p for p in re.split(r"\s+", name or "") if p]
        return "".join(p[0] for p in parts[:2]).upper() or "•"

    def email_ctx(self, lang: str | None = None) -> dict:
        lang = self.lang(lang)
        u, s = self.uni_l(lang), self.site_l(lang)
        return {
            "site_name": s.get("title") or u.get("abbr") or u.get("name") or "University",
            "owner_title": u.get("name") or "",
            "author": u.get("short_name") or u.get("name") or "",
            "accent": s.get("accent") or C.DEFAULT_SITE["accent"],
            "logo_text": s.get("logo_text") or u.get("abbr") or "UNI",
            "url": self.base_url(),
            "lang": lang,
            "base_lang": self.base_lang(),
            "footer": s.get("newsletter_footer") or "",
            "year": local_now().year,
            "accent2": s.get("accent2") or C.DEFAULT_SITE["accent2"],
            "logo_url": (u.get("logo") if (u.get("logo") or "").startswith("http") else (self.base_url() + u["logo"]) if u.get("logo") else ""),
            "address": u.get("address") or "",
            "phone": (u.get("phones") or [""])[0],
            "email": u.get("email") or "",
            "socials": [(k.title() if k != "x" else "X", v) for k, v in (u.get("socials") or {}).items() if v and k != "website"][:5],
        }

    # ------------------------------------------------------------------ tarqatma
    def send_newsletter(self, post: dict) -> str:
        if not self.st.claim_newsletter(post["id"]):
            return ""  # boshqa oqim (rejalashtiruvchi yoki boshqa jarayon) allaqachon yubormoqda
        recipients = self.st.list_subscribers("active")
        nid = self.st.add_newsletter(post["id"], post.get("title") or "", len(recipients))
        self.mail.newsletter(post, recipients, nid)
        return nid

    def start_scheduler(self) -> None:
        if self._scheduler:
            return

        def loop():
            while not self._stop.wait(60):
                try:
                    # alohida SMTP yoki universitetning o'z pochta serveri — qaysi biri sozlangan bo'lsa, shu orqali
                    if not can_send(self.st):
                        continue
                    for post in self.st.due_newsletters():
                        self.send_newsletter(post)
                except Exception as e:  # noqa: BLE001
                    print(f"scheduler: {e}", file=sys.stderr, flush=True)
                time.sleep(0)

        self._scheduler = threading.Thread(target=loop, daemon=True)
        self._scheduler.start()

    def stop(self) -> None:
        self._stop.set()
