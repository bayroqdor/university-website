"""Interaktiv: professor testlari (onlayn va qog'oz variantlari) va «Bilimdon» — jonli o'yinlashtirilgan viktorina.

Savol turlari: single (bitta to'g'ri variant), multi (bir nechta), text (so'z/javob yoziladi; bir nechta to'g'ri shakl).
Savol va variantlarda rasm (URL) va formula ($…$ — KaTeX) bo'lishi mumkin.

Onlayn test: har bir talabaga savollar va variantlar tartibi alohida aralashtiriladi (attempt.order), vaqt chegarasi serverda.
Qog'oz: N ta variant — har birida savollar/variantlar aralashtirilgan (seed saqlanadi, kalitlar jadvali bilan).
Bilimdon: PIN / qisqa havola / QR orqali qo'shilish, har savolga vaqt, tezlik uchun ball, seriya bonusi, reyting va 1-2-3 o'rinlar.
"""
from __future__ import annotations

import io
import json
import random
import re
import secrets
import string
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone

TYPES = ("single", "multi", "text")
SHORT_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _id() -> str:
    return uuid.uuid4().hex[:12]


def _s(v, n: int) -> str:
    return str(v if v is not None else "").strip()[:n]


def norm_answer(s: str) -> str:
    """Matnli javobni solishtirish uchun: kichik harf, ortiqcha bo'shliqsiz, tutuq belgilarining barcha shakllari bitta."""
    s = re.sub(r"[ʻʼ'`‘’]", "'", (s or "").strip().lower())
    s = re.sub(r"\s+", " ", s)
    return s.strip(" .,!?;:")


# ------------------------------------------------------------------ savollarni tozalash
def clean_question(q: dict, idx: int = 0) -> dict | None:
    if not isinstance(q, dict):
        return None
    t = q.get("type") if q.get("type") in TYPES else "single"
    text = _s(q.get("text"), 4000)
    image = _s(q.get("image"), 600)
    if not text and not image:
        return None
    out = {"id": _s(q.get("id"), 20) or uuid.uuid4().hex[:8], "type": t, "text": text, "image": image,
           "points": max(0.0, min(float(q.get("points") or 1), 100.0)), "time": max(5, min(int(q.get("time") or 20), 240))}
    if t == "text":
        acc = q.get("answers") or []
        if isinstance(acc, str):
            acc = re.split(r"[;\n]", acc)
        out["answers"] = [a for a in (_s(x, 300) for x in acc[:20]) if a]
        if not out["answers"]:
            return None
        out["options"] = []
        out["correct"] = []
    else:
        opts = []
        for o in (q.get("options") or [])[:8]:
            if isinstance(o, str):
                o = {"text": o}
            if not isinstance(o, dict):
                continue
            ot, oi = _s(o.get("text"), 1000), _s(o.get("image"), 600)
            if ot or oi:
                opts.append({"id": _s(o.get("id"), 20) or uuid.uuid4().hex[:6], "text": ot, "image": oi})
        if len(opts) < 2:
            return None
        ids = {o["id"] for o in opts}
        corr = [str(x) for x in (q.get("correct") or []) if str(x) in ids]
        if not corr:
            return None
        if t == "single":
            corr = corr[:1]
        out["options"] = opts
        out["correct"] = corr
    return out


def clean_settings(s: dict, cur: dict | None = None) -> dict:
    s = s if isinstance(s, dict) else {}
    out = dict(cur or {})
    if "time_limit" in s:
        out["time_limit"] = max(0, min(int(s.get("time_limit") or 0), 600))  # daqiqa; 0 — cheklanmagan
    for k in ("shuffle_questions", "shuffle_options", "show_score"):
        if k in s:
            out[k] = bool(s[k])
    if "attempts" in s:
        out["attempts"] = max(1, min(int(s.get("attempts") or 1), 10))
    if "group_ids" in s:
        out["group_ids"] = list(dict.fromkeys(str(x)[:40] for x in (s.get("group_ids") or []) if x))[:50]
    if "access" in s:  # groups — faqat tanlangan guruhlar; code — kod/PIN orqali tizimga kirgan har kim
        out["access"] = "code" if s.get("access") == "code" else "groups"
    if "blocked_student_ids" in s:  # tanlangan guruhlardagi alohida talabalar uchun yopiq
        out["blocked_student_ids"] = list(dict.fromkeys(str(x)[:40] for x in (s.get("blocked_student_ids") or []) if x))[:3000]
    if "subject" in s:
        out["subject"] = _s(s.get("subject"), 200)
    if "pass_percent" in s:
        out["pass_percent"] = max(0, min(int(s.get("pass_percent") or 0), 100))
    if "kind" in s:
        out["kind"] = "game" if s.get("kind") == "game" else "test"  # test — onlayn/qog'oz; game — «Bilimdon»
    if "variants" in s:
        out["variants"] = max(1, min(int(s.get("variants") or 1), 30))  # qog'oz: guruhlar (variantlar) soni
    if "secure" in s:
        out["secure"] = bool(s["secure"])  # himoyalangan rejim: sahifadan chiqish nazorati, nusxalash taqiqi
    if "max_leaves" in s:
        out["max_leaves"] = max(1, min(int(s.get("max_leaves") or 3), 10))  # shuncha marta chiqsa — test yopiladi
    res = {"time_limit": 30, "shuffle_questions": True, "shuffle_options": True, "show_score": False, "attempts": 1, "group_ids": [], "blocked_student_ids": [],
           "subject": "", "pass_percent": 0, "kind": "test", "variants": 2, "secure": True, "max_leaves": 3} | out
    if res.get("access") not in ("groups", "code"):
        # eski testlar (rejim yozilmagan): guruh tanlanmagan — kod orqali hamma; tanlangan — faqat o'sha guruhlar
        res["access"] = "groups" if res["group_ids"] else "code"
    return res


def access_ok(t: dict, user: dict) -> bool:
    """Foydalanuvchi shu test / o'yinga kira oladimi. Egasi va administrator — doim.
    «groups»: talaba guruhi tanlangan va o'zi bloklanmagan (guruh tanlanmagan — hech kim); «code»: tizimga kirgan har kim (bloklanganlardan tashqari)."""
    s = t["settings"]
    if user.get("role") == "admin" or user.get("id") == t.get("owner_id"):
        return True
    if user.get("id") in (s.get("blocked_student_ids") or []):
        return False
    if s.get("access") == "code":
        return True
    return user.get("role") == "student" and bool(user.get("group_id")) and user["group_id"] in (s.get("group_ids") or [])


# Himoyalangan rejim: hisobga olinadigan qoidabuzarliklar (boshqa oyna/ilovaga o'tish, sahifani yopish, skrinshot tugmasi).
# Qolganlari (nusxalash, qo'yish, o'ng tugma) brauzerda bloklanadi va faqat jurnalga yoziladi.
COUNTED = ("leave", "screenshot")
LOGGED = COUNTED + ("copy", "paste", "contextmenu", "print", "devtools")
VIOLATION_GAP = 2.0  # soniya: bitta chiqishda brauzer bir nechta hodisa yuboradi (blur + visibilitychange) — bitta deb sanaladi


def secure_on(t: dict) -> bool:
    return t["settings"].get("kind") != "game" and bool(t["settings"].get("secure", True))


# ------------------------------------------------------------------ baholash
def grade_one(q: dict, ans) -> tuple[float, bool]:
    """(olingan ball, to'liq to'g'rimi)."""
    pts = float(q.get("points") or 1)
    if q["type"] == "text":
        a = norm_answer(ans if isinstance(ans, str) else "")
        ok = bool(a) and a in {norm_answer(x) for x in q.get("answers") or []}
        return (pts if ok else 0.0), ok
    sel = ans if isinstance(ans, list) else ([ans] if ans else [])
    sel = {str(x) for x in sel}
    corr = set(q.get("correct") or [])
    if q["type"] == "single":
        ok = len(sel) == 1 and sel == corr
        return (pts if ok else 0.0), ok
    ok = sel == corr
    return (pts if ok else 0.0), ok


def public_question(q: dict, option_order: list[str] | None = None) -> dict:
    """Talabaga ko'rsatiladigan savol (to'g'ri javobsiz)."""
    opts = q.get("options") or []
    if option_order:
        by = {o["id"]: o for o in opts}
        opts = [by[i] for i in option_order if i in by] + [o for o in opts if o["id"] not in option_order]
    return {"id": q["id"], "type": q["type"], "text": q["text"], "image": q.get("image") or "", "points": q.get("points", 1),
            "options": [{"id": o["id"], "text": o["text"], "image": o.get("image") or ""} for o in opts], "multi": q["type"] == "multi"}


def shuffled_order(questions: list[dict], settings: dict, rnd: random.Random) -> list[dict]:
    qs = list(questions)
    if settings.get("shuffle_questions", True):
        rnd.shuffle(qs)
    out = []
    for q in qs:
        oids = [o["id"] for o in q.get("options") or []]
        if settings.get("shuffle_options", True):
            rnd.shuffle(oids)
        out.append({"q": q["id"], "o": oids})
    return out


def paper_variants(test: dict, n: int) -> list[dict]:
    """Qog'oz uchun N ta variant: har birida savollar va variantlar aralash (o'zgarmas seed — qayta chop etishda bir xil)."""
    by = {q["id"]: q for q in test["questions"]}
    out = []
    for v in range(1, n + 1):
        rnd = random.Random(f"{test['id']}:{test.get('paper_seed') or ''}:{v}")
        order = shuffled_order(test["questions"], test["settings"] | {"shuffle_questions": True, "shuffle_options": True}, rnd)
        items, key = [], []
        for i, o in enumerate(order, 1):
            q = by[o["q"]]
            pq = public_question(q, o["o"])
            letters = {opt["id"]: string.ascii_uppercase[k] for k, opt in enumerate(pq["options"])}
            items.append(pq | {"n": i})
            key.append({"n": i, "answer": ", ".join(letters[c] for c in q["correct"]) if q["type"] != "text" else " / ".join(q.get("answers") or [])})
        out.append({"variant": v, "questions": items, "key": key})
    return out


# ------------------------------------------------------------------ Excel import / namuna
HEADERS = ["Savol", "Turi (bitta / ko'p / matn)", "A", "B", "C", "D", "E", "F", "To'g'ri javob", "Ball", "Vaqt (soniya)", "Rasm (URL)"]
TYPE_WORDS = {"bitta": "single", "single": "single", "1": "single", "ko'p": "multi", "kop": "multi", "multi": "multi", "bir nechta": "multi",
              "matn": "text", "text": "text", "so'z": "text", "soz": "text", "javob": "text", "один": "single", "несколько": "multi", "текст": "text"}


def template_xlsx() -> bytes:
    from openpyxl import Workbook  # noqa: PLC0415
    from openpyxl.styles import Alignment, Font, PatternFill  # noqa: PLC0415

    wb = Workbook()
    ws = wb.active
    ws.title = "Savollar"
    ws.append(HEADERS)
    rows = [
        ["O‘zbekiston poytaxti qaysi shahar?", "bitta", "Samarqand", "Toshkent", "Buxoro", "Farg‘ona", "", "", "B", 1, 20, ""],
        ["Quyidagilardan qaysilari tub son?", "ko'p", "2", "4", "7", "9", "11", "", "A, C, E", 2, 30, ""],
        ["$x^2 - 5x + 6 = 0$ tenglamaning kichik ildizi nechaga teng?", "matn", "", "", "", "", "", "", "2; ikki", 1, 30, ""],
        ["Sutni pasterizatsiya qilishdan asosiy maqsad nima?", "bitta", "Ta’mini yaxshilash", "Zararli mikroorganizmlarni yo‘qotish", "Yog‘liligini oshirish", "Rangini o‘zgartirish", "", "", "B", 1, 20, ""],
        ["HACCP tizimida «CCP» nimani bildiradi?", "bitta", "Nazoratning kritik nuqtasi", "Sifat sertifikati", "Mahsulot partiyasi raqami", "", "", "", "A", 1, 25, ""],
        ["Suvning kimyoviy formulasi: $H_2O$. Ha yoki yo‘q?", "bitta", "Ha", "Yo‘q", "", "", "", "", "A", 1, 15, ""],
    ]
    for r in rows:
        ws.append(r)
    bold = Font(bold=True, color="FFFFFF")
    for c in ws[1]:
        c.font = bold
        c.fill = PatternFill("solid", fgColor="0F3D8C")
        c.alignment = Alignment(vertical="center", wrap_text=True)
    widths = [52, 18, 18, 18, 18, 18, 12, 12, 16, 8, 12, 30]
    for i, w in enumerate(widths):
        ws.column_dimensions[string.ascii_uppercase[i]].width = w
    ws.freeze_panes = "A2"
    help_ = wb.create_sheet("Yo'riqnoma")
    for line in (
        "Har bir qator — bitta savol.",
        "Turi: «bitta» — bitta to'g'ri variant; «ko'p» — bir nechta to'g'ri variant; «matn» — talaba javobni o'zi yozadi.",
        "A…F — variantlar (kamida 2 ta). Matnli savolda bo'sh qoldiring.",
        "To'g'ri javob: bitta — «B»; ko'p — «A, C»; matn — mumkin bo'lgan javoblar «;» bilan: «2; ikki».",
        "Ball — savol bahosi (standart 1). Vaqt — «Bilimdon» o'yinida savolga beriladigan soniyalar (standart 20).",
        "Formula: $…$ ichida LaTeX, masalan $\\frac{a}{b}$, $x^2$, $\\sqrt{2}$.",
        "Rasm: internetdagi rasm havolasi (yoki import qilingandan keyin muharrirda rasm yuklang).",
    ):
        help_.append([line])
    help_.column_dimensions["A"].width = 120
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def import_xlsx(raw: bytes) -> tuple[list[dict], list[str]]:
    from openpyxl import load_workbook  # noqa: PLC0415

    wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    out, errors = [], []
    for n, row in enumerate(ws.iter_rows(values_only=True), 1):
        if n == 1 and row and str(row[0] or "").strip().lower().startswith(("savol", "вопрос", "question")):
            continue
        cells = [("" if c is None else str(c).strip()) for c in (list(row) + [None] * 12)[:12]]
        text, typ, opts, corr, pts, tm, img = cells[0], cells[1].lower().replace("‘", "'").replace("’", "'"), cells[2:8], cells[8], cells[9], cells[10], cells[11]
        if not text and not img:
            continue
        t = TYPE_WORDS.get(typ, "single" if any(opts) else "text")
        q: dict = {"type": t, "text": text, "image": img, "points": float(pts or 1) if re.fullmatch(r"\d+([.,]\d+)?", pts or "") else 1,
                   "time": int(float(tm)) if re.fullmatch(r"\d+([.,]\d+)?", tm or "") else 20}
        if t == "text":
            q["answers"] = [a.strip() for a in re.split(r"[;\n]", corr) if a.strip()]
        else:
            options = [{"id": string.ascii_lowercase[i], "text": o} for i, o in enumerate(opts) if o]
            letters = [x.strip().upper() for x in re.split(r"[,;\s]+", corr) if x.strip()]
            ids = {string.ascii_uppercase[i]: string.ascii_lowercase[i] for i in range(6)}
            q["options"] = options
            q["correct"] = [ids[x] for x in letters if x in ids and any(o["id"] == ids[x] for o in options)]
            if t == "single" and len(q["correct"]) > 1:
                q["type"] = "multi"
        c = clean_question(q)
        if c:
            out.append(c)
        else:
            errors.append(f"{n}-qator: savol to'liq emas (variantlar yoki to'g'ri javob yo'q)")
    return out, errors


# ------------------------------------------------------------------ saqlash
class Store:
    def __init__(self, st):
        self.st = st
        with st._tx() as c:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS iq_tests (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, questions TEXT NOT NULL,
                    settings TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', code TEXT UNIQUE, opens TEXT, closes TEXT, released TEXT, paper_seed TEXT,
                    created TEXT NOT NULL, updated TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS iq_attempts (id TEXT PRIMARY KEY, test_id TEXT NOT NULL, user_id TEXT NOT NULL, ord TEXT NOT NULL, answers TEXT NOT NULL,
                    started TEXT NOT NULL, deadline TEXT, finished TEXT, score DOUBLE PRECISION, max_score DOUBLE PRECISION, percent DOUBLE PRECISION, sent TEXT);
                CREATE INDEX IF NOT EXISTS iq_att_test ON iq_attempts(test_id);
                CREATE INDEX IF NOT EXISTS iq_att_user ON iq_attempts(user_id);
                CREATE TABLE IF NOT EXISTS iq_games (id TEXT PRIMARY KEY, pin TEXT NOT NULL, test_id TEXT NOT NULL, host_id TEXT NOT NULL, state TEXT NOT NULL,
                    players TEXT NOT NULL, created TEXT NOT NULL, finished TEXT);
                CREATE INDEX IF NOT EXISTS iq_games_pin ON iq_games(pin);
                """
            )
        st.add_column("iq_attempts", "violations", "BIGINT NOT NULL DEFAULT 0")  # hisobga olingan qoidabuzarliklar
        st.add_column("iq_attempts", "events", "TEXT")  # jurnal: [{"k": "leave", "at": "..."}]
        st.add_column("iq_attempts", "closed_reason", "TEXT")  # "violations" — qoidabuzarlik sababli yopilgan
        # bir martalik ko'chirish: kirish rejimi yozilmagan eski testlar — aniq rejimga (guruhsiz → «kod orqali hamma»)
        for r in st._q("SELECT id, settings FROM iq_tests"):
            raw = json.loads(r["settings"] or "{}")
            if raw.get("access") not in ("groups", "code"):
                with st._tx() as c:
                    c.execute("UPDATE iq_tests SET settings=%s WHERE id=%s", (json.dumps(clean_settings(raw), ensure_ascii=False), r["id"]))

    # --- testlar
    def _t(self, r) -> dict:
        d = dict(r)
        d["questions"] = json.loads(d["questions"] or "[]")
        d["settings"] = clean_settings(json.loads(d["settings"] or "{}"))
        return d

    def tests(self, owner_id: str | None = None) -> list[dict]:
        rows = self.st._q("SELECT * FROM iq_tests" + (" WHERE owner_id=%s" if owner_id else "") + " ORDER BY updated DESC", (owner_id,) if owner_id else ())
        return [self._t(r) for r in rows]

    def test(self, tid: str) -> dict | None:
        r = self.st._q("SELECT * FROM iq_tests WHERE id=%s", (tid,))
        return self._t(r[0]) if r else None

    def by_code(self, code: str) -> dict | None:
        r = self.st._q("SELECT * FROM iq_tests WHERE code=%s", ((code or "").lower(),))
        return self._t(r[0]) if r else None

    def _code(self) -> str:
        while True:
            c = "".join(secrets.choice(SHORT_ALPHABET) for _ in range(6))
            if not self.st._q("SELECT 1 FROM iq_tests WHERE code=%s", (c,)):
                return c

    def save_test(self, owner_id: str, data: dict, tid: str | None = None) -> dict:
        cur = self.test(tid) if tid else None
        title = _s(data.get("title"), 300) if "title" in data else (cur or {}).get("title", "")
        if not title:
            raise ValueError("empty_title")
        qs = cur["questions"] if cur else []
        if "questions" in data:
            qs = [q for q in (clean_question(x, i) for i, x in enumerate((data.get("questions") or [])[:300])) if q]
        settings = clean_settings(data.get("settings") or {}, (cur or {}).get("settings"))
        desc = _s(data.get("description"), 4000) if "description" in data else (cur or {}).get("description", "")
        opens = data.get("opens", (cur or {}).get("opens"))
        closes = data.get("closes", (cur or {}).get("closes"))
        now = _now()
        with self.st._tx() as c:
            if cur:
                c.execute("UPDATE iq_tests SET title=%s, description=%s, questions=%s, settings=%s, opens=%s, closes=%s, updated=%s WHERE id=%s",
                          (title, desc, json.dumps(qs, ensure_ascii=False), json.dumps(settings, ensure_ascii=False), opens, closes, now, cur["id"]))
                tid = cur["id"]
            else:
                tid = _id()
                c.execute("INSERT INTO iq_tests(id, owner_id, title, description, questions, settings, status, code, opens, closes, paper_seed, created, updated) "
                          "VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", (tid, owner_id, title, desc, json.dumps(qs, ensure_ascii=False),
                                                                json.dumps(settings, ensure_ascii=False), "draft", self._code(), opens, closes, secrets.token_hex(4), now, now))
        return self.test(tid)

    def set_status(self, tid: str, status: str) -> dict:
        with self.st._tx() as c:
            c.execute("UPDATE iq_tests SET status=%s, updated=%s WHERE id=%s", (status, _now(), tid))
        return self.test(tid)

    def mark(self, tid: str, **f) -> None:
        sets = ", ".join(f"{k}=%s" for k in f)
        with self.st._tx() as c:
            c.execute(f"UPDATE iq_tests SET {sets} WHERE id=%s", (*f.values(), tid))

    def delete_test(self, tid: str) -> None:
        with self.st._tx() as c:
            c.execute("DELETE FROM iq_attempts WHERE test_id=%s", (tid,))
            c.execute("DELETE FROM iq_games WHERE test_id=%s", (tid,))
            c.execute("DELETE FROM iq_tests WHERE id=%s", (tid,))

    def is_open(self, t: dict) -> bool:
        now = _now()
        return t["status"] == "open" and (not t.get("opens") or t["opens"] <= now) and (not t.get("closes") or t["closes"] > now)

    # --- urinishlar
    def _a(self, r) -> dict:
        d = dict(r)
        d["ord"] = json.loads(d["ord"] or "[]")
        d["answers"] = json.loads(d["answers"] or "{}")
        d["events"] = json.loads(d.get("events") or "[]")
        d["violations"] = int(d.get("violations") or 0)
        return d

    def attempts(self, test_id: str | None = None, user_id: str | None = None) -> list[dict]:
        where, args = [], []
        if test_id:
            where.append("test_id=%s")
            args.append(test_id)
        if user_id:
            where.append("user_id=%s")
            args.append(user_id)
        rows = self.st._q("SELECT * FROM iq_attempts" + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY started DESC", tuple(args))
        return [self._a(r) for r in rows]

    def attempt(self, aid: str) -> dict | None:
        r = self.st._q("SELECT * FROM iq_attempts WHERE id=%s", (aid,))
        return self._a(r[0]) if r else None

    def start(self, t: dict, user_id: str) -> dict:
        mine = self.attempts(t["id"], user_id)
        live = next((a for a in mine if not a["finished"]), None)
        if live:
            return self.check_deadline(t, live)
        if len(mine) >= t["settings"]["attempts"]:
            raise ValueError("no_attempts_left")
        rnd = random.Random(secrets.token_hex(8))
        order = shuffled_order(t["questions"], t["settings"], rnd)
        aid = _id()
        now = datetime.now(timezone.utc)
        deadline = None
        if t["settings"]["time_limit"]:
            deadline = datetime.fromtimestamp(now.timestamp() + t["settings"]["time_limit"] * 60, tz=timezone.utc).isoformat(timespec="seconds")
        if t.get("closes") and (not deadline or t["closes"] < deadline):
            deadline = t["closes"]
        with self.st._tx() as c:
            c.execute("INSERT INTO iq_attempts(id, test_id, user_id, ord, answers, started, deadline) VALUES(%s,%s,%s,%s,%s,%s,%s)",
                      (aid, t["id"], user_id, json.dumps(order), "{}", now.isoformat(timespec="seconds"), deadline))
        return self.attempt(aid)

    def save_answers(self, a: dict, answers: dict) -> dict:
        valid = {o["q"] for o in a["ord"]}
        cur = dict(a["answers"])
        for k, v in (answers or {}).items():
            if k in valid:
                cur[k] = v if isinstance(v, (list, str)) else str(v)
        with self.st._tx() as c:
            c.execute("UPDATE iq_attempts SET answers=%s WHERE id=%s", (json.dumps(cur, ensure_ascii=False)[:200000], a["id"]))
        return self.attempt(a["id"])

    def violation(self, t: dict, a: dict, kind: str) -> dict:
        """Himoyalangan rejimdagi hodisa. Hisoblanadiganlari chegaraga yetsa — urinish yopiladi (baholanadi)."""
        if a["finished"] or kind not in LOGGED or not secure_on(t):
            return a
        now = datetime.now(timezone.utc)
        events = list(a["events"])
        counted = kind in COUNTED
        if counted:  # bitta chiqish uchun kelgan bir nechta hodisa — bitta qoidabuzarlik
            last = next((e for e in reversed(events) if e.get("c")), None)
            if last and (now - datetime.fromisoformat(last["at"])).total_seconds() < VIOLATION_GAP:
                counted = False
        events.append({"k": kind, "at": now.isoformat(timespec="milliseconds"), **({"c": 1} if counted else {})})
        n = a["violations"] + (1 if counted else 0)
        with self.st._tx() as c:
            c.execute("UPDATE iq_attempts SET violations=%s, events=%s WHERE id=%s", (n, json.dumps(events[-200:]), a["id"]))
        a = self.attempt(a["id"])
        if n >= int(t["settings"].get("max_leaves") or 3):
            a = self.finish(t, a, reason="violations")
        return a

    def finish(self, t: dict, a: dict, reason: str | None = None) -> dict:
        if a["finished"]:
            return a
        by = {q["id"]: q for q in t["questions"]}
        score = total = 0.0
        for o in a["ord"]:
            q = by.get(o["q"])
            if not q:
                continue
            total += float(q.get("points") or 1)
            score += grade_one(q, a["answers"].get(q["id"]))[0]
        pct = round(100 * score / total, 1) if total else 0.0
        with self.st._tx() as c:
            c.execute("UPDATE iq_attempts SET finished=%s, score=%s, max_score=%s, percent=%s, closed_reason=%s WHERE id=%s", (_now(), score, total, pct, reason, a["id"]))
        return self.attempt(a["id"])

    def check_deadline(self, t: dict, a: dict) -> dict:
        if not a["finished"] and a.get("deadline") and a["deadline"] <= _now():
            return self.finish(t, a)
        return a

    def sheet(self, t: dict, a: dict) -> dict:
        """Talabaning javob varag'i: har savol — uning javobi, to'g'ri javob, ball."""
        by = {q["id"]: q for q in t["questions"]}
        rows = []
        for i, o in enumerate(a["ord"], 1):
            q = by.get(o["q"])
            if not q:
                continue
            ans = a["answers"].get(q["id"])
            got, ok = grade_one(q, ans)
            pq = public_question(q, o["o"])
            rows.append(pq | {"n": i, "answer": ans if ans is not None else None, "correct": q.get("correct") or [], "accepted": q.get("answers") or [],
                              "got": got, "ok": ok})
        return {"test": {"id": t["id"], "title": t["title"], "subject": t["settings"].get("subject") or ""}, "score": a["score"], "max_score": a["max_score"],
                "percent": a["percent"], "finished": a["finished"], "rows": rows}

    def stats(self, t: dict, user_ids: set[str] | None = None) -> list[dict]:
        """Savollar bo'yicha: necha foiz to'g'ri javob berildi (user_ids — faqat shu talabalar)."""
        fin = [a for a in self.attempts(t["id"]) if a["finished"] and (user_ids is None or a["user_id"] in user_ids)]
        out = []
        for q in t["questions"]:
            n = sum(1 for a in fin if q["id"] in {o["q"] for o in a["ord"]})
            ok = sum(1 for a in fin if grade_one(q, a["answers"].get(q["id"]))[1])
            dist: dict[str, int] = {}
            for a in fin:
                v = a["answers"].get(q["id"])
                for x in (v if isinstance(v, list) else [v] if v else []):
                    dist[str(x)] = dist.get(str(x), 0) + 1
            out.append({"id": q["id"], "text": q["text"], "type": q["type"], "answered": n, "correct": ok, "percent": round(100 * ok / n, 1) if n else 0, "dist": dist})
        return out


# ================================================================== Bilimdon: jonli viktorina
PHASES = ("lobby", "question", "reveal", "leaderboard", "finished")


def game_points(correct: bool, elapsed: float, limit: float, streak: int) -> int:
    """Tezlik uchun ball: to'g'ri javob 500…1000 (qancha tez — shuncha ko'p) + seriya bonusi (ketma-ket to'g'ri javoblar, 100 dan, 500 gacha)."""
    if not correct:
        return 0
    frac = max(0.0, min(elapsed / max(limit, 1), 1.0))
    return int(round(1000 * (1 - frac / 2))) + min(max(streak - 1, 0), 5) * 100


class Games:
    """O'yinlar xotirada (tez), har o'zgarishda PostgreSQL ga yoziladi (server qayta ishga tushsa ham tiklanadi)."""

    def __init__(self, store: Store):
        self.store = store
        self.st = store.st
        self.lock = threading.RLock()
        self.cache: dict[str, dict] = {}

    def _save(self, g: dict) -> None:
        g["version"] = g.get("version", 0) + 1
        with self.st._tx() as c:
            c.execute("UPDATE iq_games SET state=%s, players=%s, finished=%s WHERE id=%s",
                      (json.dumps(g["state"], ensure_ascii=False), json.dumps(g["players"], ensure_ascii=False), g.get("finished"), g["id"]))

    def _load(self, row) -> dict:
        d = dict(row)
        return {"id": d["id"], "pin": d["pin"], "test_id": d["test_id"], "host_id": d["host_id"], "state": json.loads(d["state"]), "players": json.loads(d["players"]),
                "created": d["created"], "finished": d["finished"], "version": 1}

    def _pin(self) -> str:
        active = {g["pin"] for g in self.cache.values() if not g.get("finished")}
        rows = {r["pin"] for r in self.st._q("SELECT pin FROM iq_games WHERE finished IS NULL")}
        while True:
            p = "".join(secrets.choice(string.digits) for _ in range(6))
            if p[0] != "0" and p not in active and p not in rows:
                return p

    def create(self, t: dict, host_id: str) -> dict:
        if not t["questions"]:
            raise ValueError("no_questions")
        rnd = random.Random(secrets.token_hex(6))
        order = [q["id"] for q in t["questions"]]
        if t["settings"].get("shuffle_questions"):
            rnd.shuffle(order)
        opt_order = {q["id"]: [o["id"] for o in q.get("options") or []] for q in t["questions"]}
        if t["settings"].get("shuffle_options", True):
            for v in opt_order.values():
                rnd.shuffle(v)
        g = {"id": _id(), "pin": self._pin(), "test_id": t["id"], "host_id": host_id, "created": _now(), "finished": None, "version": 0,
             "state": {"phase": "lobby", "index": -1, "order": order, "opt_order": opt_order, "started_at": None, "deadline": None, "title": t["title"]},
             "players": {}}
        with self.st._tx() as c:
            c.execute("INSERT INTO iq_games(id, pin, test_id, host_id, state, players, created) VALUES(%s,%s,%s,%s,%s,%s,%s)",
                      (g["id"], g["pin"], g["test_id"], host_id, json.dumps(g["state"]), "{}", g["created"]))
        with self.lock:
            self.cache[g["id"]] = g
        return g

    def get(self, gid: str) -> dict | None:
        with self.lock:
            if gid in self.cache:
                return self.cache[gid]
            r = self.st._q("SELECT * FROM iq_games WHERE id=%s", (gid,))
            if not r:
                return None
            g = self.cache[gid] = self._load(r[0])
            return g

    def by_pin(self, pin: str, player_id: str | None = None) -> dict | None:
        """Faol o'yin; player_id berilsa — u qatnashgan, yaqinda (6 soat) tugagan o'yin ham (yakuniy o'rinni ko'rsatish uchun)."""
        with self.lock:
            g = next((x for x in self.cache.values() if x["pin"] == pin and not x.get("finished")), None)
            if g:
                return g
            r = self.st._q("SELECT * FROM iq_games WHERE pin=%s AND finished IS NULL ORDER BY created DESC LIMIT 1", (pin,))
            if r:
                g = self.cache[r[0]["id"]] = self._load(r[0])
                return g
            if not player_id:
                return None
            for x in sorted(self.cache.values(), key=lambda x: x.get("created") or "", reverse=True):
                if x["pin"] == pin and player_id in x["players"]:
                    return x
            since = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat(timespec="seconds")
            for row in self.st._q("SELECT * FROM iq_games WHERE pin=%s AND finished >= %s ORDER BY created DESC LIMIT 5", (pin, since)):
                x = self._load(row)
                if player_id in x["players"]:
                    return x
            return None

    def list_for(self, host_id: str) -> list[dict]:
        return [self._load(r) for r in self.st._q("SELECT * FROM iq_games WHERE host_id=%s ORDER BY created DESC LIMIT 50", (host_id,))]

    # --- holat
    def _q(self, g: dict) -> dict | None:
        s = g["state"]
        if s["index"] < 0 or s["index"] >= len(s["order"]):
            return None
        t = self.store.test(g["test_id"])
        by = {q["id"]: q for q in (t or {}).get("questions", [])}
        return by.get(s["order"][s["index"]])

    def tick(self, g: dict) -> None:
        """Vaqt tugasa yoki hamma javob bersa — avtomatik «javoblar» bosqichi."""
        with self.lock:
            s = g["state"]
            if s["phase"] != "question":
                return
            q = self._q(g)
            answered = sum(1 for p in g["players"].values() if q and q["id"] in p.get("answers", {}))
            if (s.get("deadline") and time.time() >= s["deadline"]) or (g["players"] and answered >= len(g["players"])):
                s["phase"] = "reveal"
                self._save(g)

    def join(self, g: dict, user: dict) -> dict:
        with self.lock:
            p = g["players"].get(user["id"])
            if not p:
                if g["state"]["phase"] == "finished":
                    raise ValueError("game_finished")
                g["players"][user["id"]] = p = {"id": user["id"], "name": user["name"][:60], "photo": ((user.get("data") or {}).get("photo") or ""),
                                                "score": 0, "streak": 0, "answers": {}, "joined": _now()}
                self._save(g)
            return p

    def kick(self, g: dict, uid: str) -> None:
        with self.lock:
            g["players"].pop(uid, None)
            self._save(g)

    def advance(self, g: dict, action: str) -> None:
        with self.lock:
            s = g["state"]
            if action == "start" and s["phase"] == "lobby":
                self._next_question(g)
            elif action == "next":
                if s["phase"] == "question":
                    s["phase"] = "reveal"
                elif s["phase"] == "reveal":
                    s["phase"] = "leaderboard"
                elif s["phase"] in ("leaderboard", "lobby"):
                    if s["index"] + 1 >= len(s["order"]):
                        s["phase"] = "finished"
                        g["finished"] = _now()
                    else:
                        self._next_question(g)
                        return
            elif action == "end":
                s["phase"] = "finished"
                g["finished"] = _now()
            self._save(g)

    def _next_question(self, g: dict) -> None:
        s = g["state"]
        s["index"] += 1
        q = self._q(g)
        lim = float((q or {}).get("time") or 20)
        s["phase"] = "question"
        s["started_at"] = time.time() + 3  # 3 soniyalik «Tayyorlaning!» sanog'i
        s["deadline"] = s["started_at"] + lim
        s["limit"] = lim
        self._save(g)

    def answer(self, g: dict, user: dict, value) -> dict:
        with self.lock:
            self.tick(g)
            s = g["state"]
            if s["phase"] != "question":
                raise ValueError("not_accepting")
            p = g["players"].get(user["id"])
            if not p:
                raise ValueError("not_joined")
            q = self._q(g)
            if not q or q["id"] in p["answers"]:
                raise ValueError("already_answered")
            now = time.time()
            if now < s["started_at"]:
                raise ValueError("not_started")
            elapsed = now - s["started_at"]
            _, ok = grade_one(q, value)
            p["streak"] = p["streak"] + 1 if ok else 0
            pts = game_points(ok, elapsed, s.get("limit") or 20, p["streak"])
            p["score"] += pts
            p["answers"][q["id"]] = {"v": value, "ok": ok, "pts": pts, "t": round(elapsed, 2)}
            self._save(g)
            self.tick(g)
            return p["answers"][q["id"]]

    def ranking(self, g: dict) -> list[dict]:
        ps = sorted(g["players"].values(), key=lambda p: (-p["score"], p.get("joined") or ""))
        return [{"id": p["id"], "name": p["name"], "photo": p.get("photo") or "", "score": p["score"], "streak": p.get("streak", 0), "rank": i + 1}
                for i, p in enumerate(ps)]

    def view(self, g: dict, uid: str | None, host: bool) -> dict:
        """Ekran uchun holat: boshlovchi (projektor) yoki o'yinchi (telefon)."""
        self.tick(g)
        s = g["state"]
        q = self._q(g) if s["phase"] in ("question", "reveal", "leaderboard") else None
        out = {"id": g["id"], "pin": g["pin"], "title": s.get("title") or "", "phase": s["phase"], "index": s["index"], "total": len(s["order"]),
               "now": time.time(), "started_at": s.get("started_at"), "deadline": s.get("deadline"), "limit": s.get("limit"), "version": g.get("version", 0),
               "players_count": len(g["players"])}
        if q:
            pq = public_question(q, s["opt_order"].get(q["id"]))
            out["question"] = pq if (host or s["phase"] != "question" or time.time() >= (s.get("started_at") or 0)) else {**pq, "text": "", "options": []}
            out["answered"] = sum(1 for p in g["players"].values() if q["id"] in p["answers"])
            if s["phase"] in ("reveal", "leaderboard"):
                out["correct"] = q.get("correct") or []
                out["accepted"] = q.get("answers") or []
                dist: dict[str, int] = {}
                for p in g["players"].values():
                    a = p["answers"].get(q["id"])
                    if a:
                        for x in (a["v"] if isinstance(a["v"], list) else [a["v"]]):
                            dist[str(x)] = dist.get(str(x), 0) + 1
                out["dist"] = dist
        rank = self.ranking(g)
        if host or s["phase"] in ("leaderboard", "finished"):
            out["ranking"] = rank if host or s["phase"] == "finished" else rank[:5]
        if host:
            out["players"] = [{"id": p["id"], "name": p["name"], "photo": p.get("photo") or ""} for p in g["players"].values()]
        if uid and uid in g["players"]:
            p = g["players"][uid]
            me = next((r for r in rank if r["id"] == uid), None)
            out["me"] = {"score": p["score"], "streak": p["streak"], "rank": me["rank"] if me else None, "name": p["name"]}
            if q:
                out["me"]["answer"] = p["answers"].get(q["id"])
        return out
