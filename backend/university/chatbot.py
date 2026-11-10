"""Sayt chati: sun'iy intellektsiz, sayt kontentidan javob beradigan yordamchi.

Har bir savolda kontent bazadan **shu zahoti** o'qiladi — admin qo'shgan yangi yo'nalish, FAQ, sahifa yoki yangilik darhol
javoblarda paydo bo'ladi (alohida indeks qurish shart emas). Tartib:
  1) salom / rahmat / «operator» kabi qisqa iboralar;
  2) FAQ — savol matni bilan kuchli moslik;
  3) mavzu (intent): yo'nalishlar, kontrakt, qabul, aloqa, kafedralar, rahbariyat, yangiliklar, tadbirlar, kutubxona,
     vakansiyalar, dars jadvali, BRM — ma'lumot to'g'ridan-to'g'ri bazadan yig'iladi;
  4) FAQ — o'rtacha moslik;
  5) butun sayt bo'yicha qidiruv (sarlavha, qisqa matn, sahifa matni).
Topilmasa — `found=False`: chaqiruvchi (api/chat.py) murojaatni «Murojaatlar» bo'limiga, suhbat tarixi bilan, yuboradi.
Matn kirill yoki lotinda, o'zbek / rus / ingliz tilida bo'lishi mumkin: hammasi lotinga o'giriladi va so'z o'zagi (5 harf) bo'yicha solishtiriladi.
"""
from __future__ import annotations

import re

from . import content as C
from . import tuition as T
from .names import translit

_TAG = re.compile(r"<[^>]+>")

# so'z o'zaklari (lotin, translit qilingan, kichik harf) — so'z shu bilan boshlansa mos
INTENTS: list[tuple[str, tuple[str, ...]]] = [
    ("operator", ("operator", "inson bilan", "odam bilan", "jivoy", "chelovek", "human", "agent", "menejer", "manager", "qongiroq qil", "perezvon", "call me")),
    ("partners", ("qoshma", "hamkor", "partner", "xalqaro", "mejdunarod", "sovmest", "international", "joint", "double degree", "ikki diplom")),
    ("tuition", ("kontrakt", "tolov", "tulov", "stoimost", "oplat", "fee", "tuition", "grant")),
    ("programs", ("yonalish", "mutaxassis", "napravlen", "spetsialn", "specialn", "program", "major", "bakalavr", "magistr", "doktorant", "bachelor", "master", "phd",
                  "kasb", "professi", "degree", "fakultet", "faculty")),
    ("admission", ("qabul", "abituriyent", "abiturient", "hujjat", "imtihon", "priyom", "priem", "postup", "dokument", "ekzamen", "admission", "apply", "enrol", "entrance")),
    ("contacts", ("manzil", "telefon", "aloqa", "qayerda", "joylash", "moljal", "adres", "kontakt", "nahodit", "gde ", "address", "phone", "contact", "email", "pochta",
                  "location", "where", "ish vaqt", "ish soat", "vremya rab", "grafik", "hours", "open")),
    ("dorm", ("yotoqxona", "yotoq", "obshejit", "obshchezhit", "dorm", "hostel", "turar joy")),
    ("kafedra", ("kafedra", "department", "bolim")),
    ("leaders", ("rektor", "prorektor", "dekan", "rahbar", "rukovod", "rector", "dean", "leadership", "head of")),
    ("news", ("yangilik", "xabar", "novost", "news")),
    ("events", ("tadbir", "merop", "event", "konferens", "conference")),
    ("library", ("kutubxona", "kitob", "bibliotek", "knig", "library", "book", "darslik", "uchebnik", "textbook")),
    ("vacancy", ("vakansiya", "vakans", "ish orni", "ishga", "rabota", "job", "career", "hiring")),
    ("schedule", ("jadval", "raspisan", "schedule", "timetable", "dars vaqt")),
    ("sdg", ("barqaror", "brm", "sdg", "ustoychiv", "sustainab", "ekolog", "yashil")),
]
# «narx», «price» kabi umumiy so'zlar — faqat o'qish haqidagi gapda kontrakt deb tushuniladi («marsga uchish narxi» — yo'q)
PRICE_WEAK = ("narx", "pul", "summa", "tsena", "cena", "skolko stoit", "price", "cost", "how much")
STUDY = ("oqish", "oqi", "talim", "yonalish", "kontrakt", "kurs", "semestr", "yil", "obuch", "ucheb", "napravlen", "study", "studies", "programme", "program",
         "degree", "bakalavr", "magistr", "institut", "universitet")
GREET = ("salom", "assalom", "privet", "zdravstv", "dobryy", "hello", "hi", "hey", "salyom", "xayrli kun")
THANKS = ("rahmat", "raxmat", "tashakkur", "spasibo", "blagodar", "thank", "thanks")
STOP = {
    "va", "bilan", "uchun", "haqida", "qanday", "qancha", "nima", "nimalar", "bormi", "bor", "yoq", "kerak", "mumkin", "qaysi", "qachon", "qayer", "menga",
    "men", "siz", "sizda", "sizlarda", "biz", "bu", "shu", "ham", "edi", "ekan", "iltimos", "ayting", "aytib", "bering", "beraolasizmi", "institut", "instituti",
    "i", "v", "na", "s", "po", "o", "ob", "kak", "kakie", "kakoy", "chto", "u", "vas", "est", "li", "mne", "pojaluysta", "skazhite", "dlya", "institute",
    "the", "a", "an", "of", "in", "on", "for", "to", "is", "are", "do", "does", "what", "which", "how", "you", "your", "please", "can", "i", "me", "there", "any",
}

TX = {
    "uz": {
        "greet": "Assalomu alaykum! Savolingizni yozing yoki quyidagi mavzulardan birini tanlang.",
        "thanks": "Arzimaydi! Yana savolingiz bo‘lsa, yozing.",
        "programs": "Institutda {n} ta ta’lim dasturi bor:",
        "tuition": "Kontrakt narxlari ({year} o‘quv yili, yiliga):",
        "tuition_hidden": "Kontrakt narxlari qabul bo‘limi tomonidan e’lon qilinadi. Batafsil — «Abituriyent» sahifasida yoki qabul komissiyasi telefoni orqali.",
        "admission": "Qabul {year} haqida to‘liq ma’lumot — «Abituriyent» sahifasida: yo‘nalishlar, hujjatlar, muddatlar.",
        "contacts": "Bizning manzil va aloqa ma’lumotlari:",
        "addr": "Manzil", "phone": "Telefon", "email": "Email", "hours": "Ish vaqti", "map": "Xaritada ko‘rish",
        "kafedra": "Institut kafedralari:",
        "leaders": "Rahbariyat:",
        "news": "So‘nggi yangiliklar:",
        "events": "Tadbirlar:",
        "no_events": "Hozircha e’lon qilingan tadbir yo‘q.",
        "library": "Elektron kutubxonada {n} ta kitob bor — onlayn o‘qish, audiokitoblar va bron qilish.",
        "library_found": "Kutubxonadan topilgan kitoblar:",
        "vacancy": "Ochiq vakansiyalar:",
        "no_vacancy": "Hozircha ochiq vakansiya yo‘q. Yangilarini «Vakansiyalar» sahifasida kuzatib boring.",
        "schedule": "Dars jadvali talaba va o‘qituvchi kabinetida ko‘rinadi (HEMIS login orqali kiriladi).",
        "sdg": "Institutning Barqaror rivojlanish maqsadlariga (BRM) hissasi — alohida sahifada:",
        "partners": "Xalqaro hamkorlik va hamkorlar:",
        "found": "Saytda topilgan ma’lumotlar:",
        "open": "Ochish",
        "all_programs": "Barcha yo‘nalishlar",
        "dorm": "Yotoqxona haqida:",
    },
    "ru": {
        "greet": "Здравствуйте! Напишите вопрос или выберите тему ниже.",
        "thanks": "Пожалуйста! Если будут ещё вопросы — пишите.",
        "programs": "В институте {n} образовательных программ:",
        "tuition": "Стоимость обучения ({year} учебный год, в год):",
        "tuition_hidden": "Стоимость обучения объявляет приёмная комиссия. Подробнее — на странице «Абитуриенту» или по телефону приёмной комиссии.",
        "admission": "Вся информация о приёме {year} — на странице «Абитуриенту»: направления, документы, сроки.",
        "contacts": "Наш адрес и контакты:",
        "addr": "Адрес", "phone": "Телефон", "email": "Email", "hours": "Часы работы", "map": "На карте",
        "kafedra": "Кафедры института:",
        "leaders": "Руководство:",
        "news": "Последние новости:",
        "events": "Мероприятия:",
        "no_events": "Пока нет объявленных мероприятий.",
        "library": "В электронной библиотеке {n} книг — онлайн-чтение, аудиокниги и бронирование.",
        "library_found": "Найдено в библиотеке:",
        "vacancy": "Открытые вакансии:",
        "no_vacancy": "Сейчас открытых вакансий нет. Следите за страницей «Вакансии».",
        "schedule": "Расписание занятий доступно в кабинете студента и преподавателя (вход через HEMIS).",
        "sdg": "Вклад института в Цели устойчивого развития — на отдельной странице:",
        "partners": "Международное сотрудничество и партнёры:",
        "found": "Вот что нашлось на сайте:",
        "open": "Открыть",
        "all_programs": "Все направления",
        "dorm": "Об общежитии:",
    },
    "en": {
        "greet": "Hello! Type your question or pick a topic below.",
        "thanks": "You’re welcome! Write if you have more questions.",
        "programs": "The institute offers {n} programmes:",
        "tuition": "Tuition fees ({year} academic year, per year):",
        "tuition_hidden": "Tuition fees are announced by the admissions office. See the Admissions page or call the admissions committee.",
        "admission": "Everything about admission {year} is on the Admissions page: programmes, documents and deadlines.",
        "contacts": "Our address and contacts:",
        "addr": "Address", "phone": "Phone", "email": "Email", "hours": "Opening hours", "map": "View on map",
        "kafedra": "Departments of the institute:",
        "leaders": "Leadership:",
        "news": "Latest news:",
        "events": "Events:",
        "no_events": "No events have been announced yet.",
        "library": "The e-library holds {n} books — read online, audiobooks and reservations.",
        "library_found": "Found in the library:",
        "vacancy": "Open vacancies:",
        "no_vacancy": "There are no open vacancies right now. Check the Careers page later.",
        "schedule": "The timetable is available in the student and teacher portal (sign in with HEMIS).",
        "sdg": "The institute’s contribution to the Sustainable Development Goals has its own page:",
        "partners": "International cooperation and partners:",
        "found": "Here is what I found on the site:",
        "open": "Open",
        "all_programs": "All programmes",
        "dorm": "About the dormitory:",
    },
}
DEGREE = {
    "uz": {"bachelor": "Bakalavriat", "master": "Magistratura", "joint": "Qo‘shma dastur", "phd": "Doktorantura", "course": "Kurs"},
    "ru": {"bachelor": "Бакалавриат", "master": "Магистратура", "joint": "Совместная программа", "phd": "Докторантура", "course": "Курс"},
    "en": {"bachelor": "Bachelor’s", "master": "Master’s", "joint": "Joint programme", "phd": "Doctoral", "course": "Course"},
}
QUICK = {
    "uz": ["Qanday yo‘nalishlar bor?", "Kontrakt narxi qancha?", "Qabul qachon va qanday hujjatlar kerak?", "Manzil va telefon", "Yotoqxona bormi?", "Kutubxona"],
    "ru": ["Какие есть направления?", "Сколько стоит обучение?", "Когда приём и какие документы нужны?", "Адрес и телефон", "Есть ли общежитие?", "Библиотека"],
    "en": ["What programmes do you offer?", "How much is tuition?", "When is admission and what documents are needed?", "Address and phone", "Is there a dormitory?", "Library"],
}
SECTION_PATH = {"news": "/news/{slug}", "announce": "/announcements/{slug}", "event": "/events/{slug}", "page": "/about/{slug}", "program": "/programs/{slug}",
                "faculty": "/faculties/{slug}", "department": "/structure/{slug}", "staff": "/staff/{slug}", "vacancy": "/careers/{slug}", "faq": "/contact#faq",
                "partner": "/partners", "document": "/documents", "link": "/links"}


# bu mavzularda ro'yxat bazadan olinadi (FAQ javobi bo'lsa — matn sifatida qo'shiladi)
DATA_FIRST = ("programs", "contacts", "kafedra", "leaders", "news", "events", "vacancy")


def norm(s: str) -> str:
    """Kirill → lotin, apostrof va tinish belgilarisiz, kichik harf («Йўналишлар?» → «yonalishlar»; «1+1» → «11»)."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9+ ]+", " ", translit(_TAG.sub(" ", s or "")))).strip()


def stems(s: str) -> set[str]:
    return {w[:5] for w in norm(s).split() if len(w) >= 3 and w not in STOP}


def _has(text: str, keys) -> bool:
    t = " " + text + " "
    return any((" " + k) in t for k in keys)


def detect(text: str) -> str | None:
    if re.search(r"1\s*\+\s*1", text or ""):
        return "partners"
    t = norm(text)
    for name, keys in INTENTS:
        if _has(t, keys):
            return name
    if _has(t, PRICE_WEAK) and _has(t, STUDY):
        return "tuition"
    return None


def guess_lang(text: str, default: str) -> str:
    """Savol qaysi tilda: kirillda o'zbekcha harflar (ў қ ғ ҳ) bo'lmasa — rus; lotinda ingliz so'zlari bo'lsa — ingliz."""
    s = (text or "").lower()
    cyr = len(re.findall(r"[а-яё]", s))
    if cyr >= 3:
        return "uz" if re.search(r"[ўқғҳ]", s) or re.search(r"\b(qanday|bormi|nima|qancha|haqida)\b", translit(s)) else "ru"
    lat = norm(s).split()
    en = {"what", "which", "how", "where", "when", "is", "are", "do", "does", "the", "your", "you", "there", "programmes", "programs", "address", "phone", "fees", "library", "dormitory"}
    uz = {"qanday", "bormi", "qancha", "nima", "qayerda", "haqida", "yonalish", "yonalishlar", "manzil", "kutubxona", "yotoqxona", "kontrakt", "qabul"}
    if any(w in en for w in lat) and not any(w in uz for w in lat):
        return "en"
    if any(w in uz for w in lat):
        return "uz"
    return default


def _overlap(q: set[str], doc: set[str]) -> float:
    return len(q & doc) / len(q) if q else 0.0


def _snip(s: str, n: int = 220) -> str:
    s = re.sub(r"\s+", " ", _TAG.sub(" ", str(s or ""))).strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def _path(kind: str, it: dict) -> str:
    return SECTION_PATH.get(kind, "/").format(slug=it.get("slug") or "")


class Bot:
    def __init__(self, svc, lang: str):
        self.svc = svc
        self.lang = lang if lang in TX else "uz"
        self.t = TX[self.lang]

    def items(self, kind: str) -> list[dict]:
        return [self.svc.loc(x, self.lang) for x in self.svc.st.list_items(kind, public=True)]

    def reply(self, text: str, links: list[dict] | None = None, found: bool = True, intent: str = "") -> dict:
        return {"text": text, "links": links or [], "found": found, "intent": intent}

    # ------------------------------------------------------------------ FAQ
    def faq(self, q: set[str]) -> tuple[float, dict | None]:
        best, hit = 0.0, None
        for f in self.items("faq"):
            raw = self.svc.st.get_item(f["id"]) or f
            # savol barcha tillarda (kirill/lotin farqisiz) solishtiriladi; javob — so'ralgan tilda
            titles = [raw.get("title") or ""] + [str(v.get("title") or "") for v in (raw.get("i18n") or {}).values() if isinstance(v, dict)]
            sc = max(_overlap(q, stems(t)) for t in titles)
            sc = max(sc, 0.6 * _overlap(q, stems(f.get("answer") or "")))
            if sc > best:
                best, hit = sc, f
        return best, hit

    def faq_reply(self, f: dict) -> dict:
        return self.reply(_snip(f.get("answer") or "", 900), [{"title": f["title"], "to": "/contact#faq"}], intent="faq")

    # ------------------------------------------------------------------ mavzular
    def programs(self) -> dict:
        progs = self.items("program")
        links = []
        order = ["bachelor", "master", "joint", "phd", "course"]
        for deg in order:
            for p in [x for x in progs if (x.get("degree") or "bachelor") == deg]:
                sub = DEGREE[self.lang].get(deg, "")
                if p.get("duration"):
                    sub += f" · {p['duration']}"
                fee = T.min_fee(p) if T.shown(self.svc.st) else None
                if fee:
                    sub += f" · {T.fmt(fee, self.lang)}"
                links.append({"title": p["title"], "to": f"/programs/{p['slug']}", "sub": sub})
        links.append({"title": self.t["all_programs"], "to": "/programs"})
        return self.reply(self.t["programs"].format(n=len(progs)), links, intent="programs")

    def tuition(self) -> dict:
        pub = T.public(self.svc.st, self.lang)
        if not pub:
            return self.reply(self.t["tuition_hidden"], [{"title": self.t["open"], "to": "/admission"}], intent="tuition")
        links = []
        for p in self.items("program"):
            fee = T.min_fee(p)
            if fee:
                links.append({"title": p["title"], "to": f"/programs/{p['slug']}", "sub": T.fmt(fee, self.lang)})
        if not links:
            return self.reply(self.t["tuition_hidden"], [{"title": self.t["open"], "to": "/admission"}], intent="tuition")
        return self.reply(self.t["tuition"].format(year=pub["year"]), links, intent="tuition")

    def admission(self) -> dict:
        from .seo import _admission_year  # noqa: PLC0415

        return self.reply(self.t["admission"].format(year=_admission_year(self.svc)), [{"title": self.t["open"], "to": "/admission"}, {"title": self.t["all_programs"], "to": "/programs"}], intent="admission")

    def contacts(self) -> dict:
        u = self.svc.uni_l(self.lang)
        lines = []
        if u.get("address"):
            lines.append(f"{self.t['addr']}: {u['address']}")
        for p in u.get("phones") or []:
            lines.append(f"{self.t['phone']}: {p}")
        if u.get("email"):
            lines.append(f"{self.t['email']}: {u['email']}")
        if u.get("hours"):
            lines.append(f"{self.t['hours']}: {u['hours']}")
        links = [{"title": self.t["map"], "to": u["map_url"]}] if u.get("map_url") else []
        links.append({"title": self.t["open"], "to": "/contact"})
        return self.reply(self.t["contacts"] + "\n" + "\n".join(lines), links, intent="contacts")

    def listing(self, kind: str, head: str, limit: int = 8, empty: str = "", intent: str = "") -> dict:
        xs = self.items(kind)[:limit]
        if not xs:
            return self.reply(empty, [], found=bool(empty), intent=intent)
        return self.reply(head, [{"title": x["title"], "to": _path(kind, x), "sub": _snip(x.get("summary") or x.get("excerpt") or x.get("position") or "", 90)} for x in xs], intent=intent)

    def leaders(self) -> dict:
        keys = ("rektor", "prorektor", "dekan", "rector", "dean", "prorector")
        xs = [x for x in self.items("staff") if _has(norm(x.get("position") or ""), keys)][:8]
        if not xs:
            return self.search_reply(stems("rektor prorektor dekan"), "leaders")
        return self.reply(self.t["leaders"], [{"title": x["title"], "to": f"/staff/{x['slug']}", "sub": x.get("position") or ""} for x in xs], intent="leaders")

    def library(self, q: set[str], text: str) -> dict:
        st = self.svc.st
        n = st._one("SELECT COUNT(*) FROM lib_books") if st.has_table("lib_books") else 0
        rest = [w for w in norm(text).split() if len(w) >= 3 and w not in STOP and not _has(w, dict(INTENTS)["library"])]
        if rest and n:
            from .api.library import lib  # noqa: PLC0415

            try:
                found = lib().search(q=" ".join(rest), size=5)["items"]
            except Exception:  # noqa: BLE001
                found = []
            if found:
                return self.reply(self.t["library_found"], [{"title": b["title"], "to": f"/library/book/{b['id']}", "sub": ", ".join(b.get("authors") or [])} for b in found[:5]], intent="library")
        return self.reply(self.t["library"].format(n=n or 0), [{"title": self.t["open"], "to": "/library"}], intent="library")

    # ------------------------------------------------------------------ butun sayt bo'yicha
    def search(self, q: set[str]) -> list[tuple[float, dict]]:
        """Butun sayt: har bir so'z vazni — kam uchraydigan so'z muhimroq (IDF). Savoldagi muhim so'zlarning ko'pchiligi topilishi shart."""
        import math  # noqa: PLC0415

        from .search import SITE_KINDS, _item_text  # noqa: PLC0415

        docs = []
        for kind in SITE_KINDS:
            for raw in self.svc.st.list_items(kind, public=True):
                title, _sub, body = _item_text(raw)
                ts = stems(title)
                docs.append((kind, raw, title, body, ts, ts | stems(body[:6000])))
        if not docs or not q:
            return []
        n = len(docs)
        df = {w: sum(1 for d in docs if w in d[5]) for w in q}
        wt = {w: math.log((n + 1) / (df[w] + 0.5)) for w in q}
        total = sum(wt.values()) or 1.0
        out = []
        for kind, raw, title, body, ts, alls in docs:
            in_title = sum(wt[w] for w in q if w in ts)
            in_all = sum(wt[w] for w in q if w in alls)
            sc = max(in_title / total, 0.85 * in_all / total)
            if sc < 0.6:
                continue
            it = self.svc.loc(raw, self.lang)
            sub = it.get("summary") or it.get("excerpt") or it.get("answer") or it.get("position") or _snip(body, 160)
            out.append((sc + (0.05 if kind in ("page", "program", "faq") else 0), {"title": it.get("title") or title, "to": _path(kind, it), "sub": _snip(sub, 140)}))
        out.sort(key=lambda p: -p[0])
        return out

    def search_reply(self, q: set[str], intent: str = "search") -> dict:
        hits = self.search(q)
        if not hits:
            return self.reply("", [], found=False, intent=intent)
        top = hits[0][0]
        return self.reply(self.t["found"], [x for sc, x in hits[:4] if sc >= top - 0.25], intent=intent)

    # ------------------------------------------------------------------ asosiy
    def answer(self, text: str) -> dict:
        t = norm(text)
        words = t.split()
        q = stems(text)
        if not words:
            return self.reply("", found=False)
        if len(words) <= 3 and _has(t, GREET) and not detect(text):
            return self.reply(self.t["greet"], intent="greet")
        if len(words) <= 4 and _has(t, THANKS):
            return self.reply(self.t["thanks"], intent="thanks")
        intent = detect(text)
        if intent == "operator":
            return self.reply("", found=False, intent="operator")
        fsc, f = self.faq(q)
        if intent in DATA_FIRST:
            r = self.by_intent(intent, q, text)
            if r["found"]:
                if f and fsc >= 0.67:
                    r["text"] = _snip(f.get("answer") or "", 600) + "\n\n" + r["text"]
                return r
        if f and fsc >= 0.67:
            return self.faq_reply(f)
        if intent:
            r = self.by_intent(intent, q, text)
            if r["found"]:
                return r
        if f and fsc >= 0.4:
            return self.faq_reply(f)
        if q:
            return self.search_reply(q)
        return self.reply("", found=False)

    def by_intent(self, intent: str, q: set[str], text: str) -> dict:
        t = self.t
        if intent == "programs":
            return self.programs()
        if intent == "tuition":
            return self.tuition()
        if intent == "admission":
            return self.admission()
        if intent == "contacts":
            return self.contacts()
        if intent == "kafedra":
            return self.listing("faculty", t["kafedra"], intent=intent)
        if intent == "leaders":
            return self.leaders()
        if intent == "news":
            return self.listing("news", t["news"], limit=4, intent=intent)
        if intent == "events":
            return self.listing("event", t["events"], limit=5, empty=t["no_events"], intent=intent)
        if intent == "library":
            return self.library(q, text)
        if intent == "vacancy":
            return self.listing("vacancy", t["vacancy"], empty=t["no_vacancy"], intent=intent)
        if intent == "schedule":
            return self.reply(t["schedule"], [{"title": "HEMIS", "to": self.svc.uni().get("hemis_url") or "/login"}], intent=intent)
        if intent == "sdg":
            return self.reply(t["sdg"], [{"title": "SDGs — /upgoals", "to": "/upgoals"}], intent=intent)
        if intent == "partners":
            r = self.search_reply(q, intent)
            return r if r["found"] else self.reply(t["partners"], [{"title": t["open"], "to": "/partners"}], intent=intent)
        if intent == "dorm":
            r = self.search_reply(q | {"yotoq"}, intent)
            if r["found"]:
                r["text"] = t["dorm"]
            return r
        return self.reply("", found=False)


def answer(svc, text: str, lang: str) -> dict:
    """Javob savol yozilgan tilda (rus tilida so'rasa — ruscha), aniqlab bo'lmasa — suhbat tilida."""
    return Bot(svc, guess_lang(text, lang)).answer(text)


def quick(svc, lang: str) -> list[str]:
    lang = lang if lang in QUICK else "uz"
    out = list(QUICK[lang])
    for f in [svc.loc(x, lang) for x in svc.st.list_items("faq", public=True)][:4]:
        if f.get("title") and f["title"] not in out:
            out.append(f["title"])
    return out[:10]


def greeting(lang: str, name: str) -> str:
    first = (name or "").split()[0] if name else ""
    return {"uz": f"{first}, xush kelibsiz! ", "ru": f"{first}, добро пожаловать! ", "en": f"Welcome, {first}! "}.get(lang, "") + TX.get(lang, TX["uz"])["greet"]
