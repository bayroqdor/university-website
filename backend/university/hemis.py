"""HEMIS (Oliy ta'lim jarayonlarini boshqarish axborot tizimi) integratsiyasi.

HEMIS UNIVERSITY API (OpenAPI 1.3, `https://student.<otm>.uz/rest/v1/`):
  * Backend API `/v1/data/*` — administrator panelida «API User» roli berilgan hisob tokeni (Bearer), faqat serverdan;
    sahifalash `page` (1…), `limit` (≤200); javob `{"success", "error", "data": {"items", "pagination"}, "code"}`;
    sana/vaqtlar — UTC unix soniyalar; til `l=uz-UZ|ru-RU|en-US`; ≤10 so'rov/soniya.
  * Student API `/v1/auth/login`, `/v1/account/me`, `/v1/education/*` — talaba logini (ID raqami) va paroli bilan (JWT, 10 kun).

Bu modul:
  * o'qituvchilar (`employee-list?type=teacher`), guruhlar (`group-list`) va talabalarni (`student-list`) sayt foydalanuvchilariga
    sinxronlaydi (HEMIS id bo'yicha, bo'lmasa ism / ID raqam bo'yicha moslashtiriladi; mavjud parollar o'zgarmaydi);
  * talaba profili uchun HEMIS ma'lumotlari: shaxsiy ma'lumotlar, GPA, davomat, baholar, imtihon natijalari va haftalik jadval
    (`attendance-list`, `student-grade-list`, `student-performance-list`, `student-gpa-list`, `schedule-list`) — keshlanadi;
  * ixtiyoriy: talabalar kabinetga HEMIS paroli bilan kira oladi (`auth/login`).
"""
from __future__ import annotations

import json
import os
import re
import secrets
import threading
import time
from datetime import date, datetime, timedelta, timezone

import httpx

FIELDS = ("enabled", "api_url", "token", "portal_url", "lang", "sync_teachers", "sync_students", "sync_groups", "sync_schedule", "schedule_weeks", "student_auth", "auto_hours", "cache_minutes")
SECRET = "token"
LANG_PARAM = {"uz": "uz-UZ", "ru": "ru-RU", "en": "en-US"}


TRANSPORT: httpx.BaseTransport | None = None  # testlar uchun (soxta HEMIS server)


class HemisError(RuntimeError):
    """network | unauthorized | forbidden | not_found | rate_limited | bad_response | disabled | captcha"""


def env_defaults() -> dict:
    e = os.environ.get
    return {
        "enabled": e("SITE_HEMIS_ENABLED", "0").lower() in ("1", "true", "yes"),
        "api_url": e("SITE_HEMIS_API_URL", ""),
        "token": e("SITE_HEMIS_TOKEN", ""),
        "portal_url": e("SITE_HEMIS_URL", ""),
        "lang": "uz",
        "sync_teachers": True,
        "sync_students": True,
        "sync_groups": True,
        "sync_schedule": True,
        "schedule_weeks": 2,
        "student_auth": False,
        "auto_hours": int(e("SITE_HEMIS_AUTO_HOURS", "0") or 0),
        "cache_minutes": 60,
    }


def config(st) -> dict:
    saved = st.kv_get("hemis") or {}
    return env_defaults() | {k: v for k, v in saved.items() if k in FIELDS}


def clean(data: dict, current: dict) -> dict:
    out = dict(current)
    for k in FIELDS:
        if k not in data:
            continue
        v = data[k]
        if k in ("enabled", "sync_teachers", "sync_students", "sync_groups", "sync_schedule", "student_auth"):
            out[k] = bool(v)
        elif k in ("auto_hours", "cache_minutes", "schedule_weeks"):
            try:
                out[k] = max(0, min(int(v or 0), {"auto_hours": 720, "cache_minutes": 1440, "schedule_weeks": 8}[k]))
            except (TypeError, ValueError):
                out[k] = 0
        elif k == SECRET:
            if v:
                out[k] = str(v).strip()[:4000]
        elif k == "lang":
            out[k] = v if v in LANG_PARAM else "uz"
        else:
            out[k] = str(v or "").strip()[:300]
    for k in ("api_url", "portal_url"):
        u = out.get(k) or ""
        if u and not u.startswith(("http://", "https://")):
            u = "https://" + u
        out[k] = u.rstrip("/")
    # foydalanuvchi to'liq yo'l kiritsa ham (…/rest/v1/) — faqat xost qoldiriladi
    out["api_url"] = re.sub(r"/rest(/v1)?/?$", "", out.get("api_url") or "")
    return out


def public(cfg: dict) -> dict:
    return {k: v for k, v in cfg.items() if k != SECRET} | {"has_token": bool(cfg.get(SECRET))}


def ready(cfg: dict) -> bool:
    return bool(cfg.get("enabled") and cfg.get("api_url"))


def ts(v) -> str | None:
    """HEMIS unix soniya → ISO (UTC)."""
    try:
        return datetime.fromtimestamp(int(v), tz=timezone.utc).isoformat(timespec="seconds") if v not in (None, "", 0) else None
    except (TypeError, ValueError, OSError):
        return None


def _name(o) -> str:
    return (o or {}).get("name") or "" if isinstance(o, dict) else str(o or "")


# ------------------------------------------------------------------ HTTP klient
class Client:
    def __init__(self, cfg: dict, transport: httpx.BaseTransport | None = None, timeout: float = 30.0):
        self.cfg = cfg
        self.base = cfg["api_url"].rstrip("/") + "/rest/v1/"
        self.transport = transport or TRANSPORT
        self.timeout = timeout
        self._last = 0.0
        self._lock = threading.Lock()

    def _http(self) -> httpx.Client:
        return httpx.Client(timeout=self.timeout, transport=self.transport, headers={"Accept": "application/json", "User-Agent": "UniversitySite/1.0"})

    def _throttle(self) -> None:
        with self._lock:  # ≤ ~8 so'rov/soniya (HEMIS cheklovi 10)
            wait = self._last + 0.12 - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()

    @staticmethod
    def _unwrap(r: httpx.Response):
        if r.status_code == 401:
            raise HemisError("unauthorized")
        if r.status_code == 403:
            raise HemisError("forbidden")
        if r.status_code == 404:
            raise HemisError("not_found")
        if r.status_code == 429:
            raise HemisError("rate_limited")
        try:
            j = r.json()
        except ValueError as e:
            raise HemisError(f"bad_response: HTTP {r.status_code}") from e
        if not isinstance(j, dict):
            raise HemisError("bad_response")
        if j.get("success") is False or r.status_code >= 400:
            err = j.get("error") or ((j.get("data") or {}).get("error") if isinstance(j.get("data"), dict) else "") or ""
            err = str(err)
            code = int(j.get("code") or r.status_code or 0)
            if "CAPTCHA" in err.upper():
                raise HemisError("captcha")
            raise HemisError({401: "unauthorized", 403: "forbidden", 404: "not_found", 429: "rate_limited"}.get(code, f"error: {err or code}"))
        return j.get("data")

    def get(self, path: str, params: dict | None = None, token: str | None = None):
        tok = token or self.cfg.get(SECRET)
        if not tok:
            raise HemisError("no_token")
        p = {"l": LANG_PARAM.get(self.cfg.get("lang") or "uz", "uz-UZ")} | {k: v for k, v in (params or {}).items() if v not in (None, "")}
        for attempt in range(3):
            self._throttle()
            try:
                with self._http() as c:
                    r = c.get(self.base + path.lstrip("/"), params=p, headers={"Authorization": f"Bearer {tok}"})
            except httpx.HTTPError as e:
                if attempt == 2:
                    raise HemisError(f"network: {type(e).__name__}") from e
                time.sleep(1 + attempt)
                continue
            if (r.status_code == 429 or r.status_code >= 500) and attempt < 2:
                time.sleep(1.5 * (attempt + 1))
                continue
            return self._unwrap(r)
        raise HemisError("network")

    def items(self, path: str, params: dict | None = None, max_pages: int = 500) -> list[dict]:
        """Sahifalangan ro'yxat (`data.items` + `data.pagination`), barcha sahifalar."""
        out: list[dict] = []
        page = 1
        while page <= max_pages:
            data = self.get(path, (params or {}) | {"page": page, "limit": 200})
            if isinstance(data, list):  # hujjatda massiv shaklida ko'rsatilgan
                data = data[0] if data and isinstance(data[0], dict) and "items" in data[0] else {"items": data}
            data = data or {}
            out += [x for x in data.get("items") or [] if isinstance(x, dict)]
            pg = data.get("pagination") or {}
            if isinstance(pg, list):
                pg = pg[0] if pg else {}
            if page >= int(pg.get("pageCount") or 1):
                break
            page += 1
        return out

    # --- talaba API
    def student_login(self, login: str, password: str) -> str:
        self._throttle()
        try:
            with self._http() as c:
                r = c.post(self.base + "auth/login", json={"login": login, "password": password})
        except httpx.HTTPError as e:
            raise HemisError(f"network: {type(e).__name__}") from e
        data = self._unwrap(r) or {}
        tok = data.get("token") if isinstance(data, dict) else None
        if not tok:
            raise HemisError("unauthorized")
        return tok

    def test(self) -> dict:
        data = self.get("data/department-list", {"limit": 1, "page": 1})
        if isinstance(data, list):
            data = data[0] if data else {}
        pg = (data or {}).get("pagination") or {}
        if isinstance(pg, list):
            pg = pg[0] if pg else {}
        return {"ok": True, "departments": int(pg.get("totalCount") or len((data or {}).get("items") or []))}


# ------------------------------------------------------------------ kesh
def _cache_init(st) -> None:
    with st._tx() as c:
        c.execute("CREATE TABLE IF NOT EXISTS hemis_cache (key TEXT PRIMARY KEY, data TEXT, updated DOUBLE PRECISION)")


def cache_get(st, key: str, max_age: float) -> object | None:
    _cache_init(st)
    r = st._q("SELECT data, updated FROM hemis_cache WHERE key=%s", (key,))
    if r and time.time() - float(r[0]["updated"] or 0) <= max_age:
        return json.loads(r[0]["data"])
    return None


def cache_put(st, key: str, data) -> None:
    _cache_init(st)
    with st._tx() as c:
        c.execute("INSERT INTO hemis_cache(key, data, updated) VALUES(%s,%s,%s) ON CONFLICT(key) DO UPDATE SET data=excluded.data, updated=excluded.updated",
                  (key, json.dumps(data, ensure_ascii=False), time.time()))


def cache_clear(st, prefix: str = "") -> None:
    _cache_init(st)
    with st._tx() as c:
        c.execute("DELETE FROM hemis_cache WHERE key LIKE %s", (prefix + "%",))


# ------------------------------------------------------------------ sinxronlash
def _norm(s: str) -> str:
    return re.sub(r"[^a-zа-яёўқғҳ0-9]+", " ", re.sub(r"[ʻʼ'`‘’]", "", (s or "").lower())).strip()


def _student_profile(x: dict) -> dict:
    """HEMIS talaba yozuvidan kabinetda ko'rsatiladigan qism."""
    return {
        "id": x.get("id"), "student_id_number": x.get("student_id_number") or "", "full_name": x.get("full_name") or "",
        "image": x.get("image_full") or x.get("image") or "", "birth_date": ts(x.get("birth_date")),
        "faculty": _name(x.get("department") or x.get("faculty")), "specialty": _name(x.get("specialty")), "group": _name(x.get("group")),
        "level": _name(x.get("level")), "semester": _name(x.get("semester")), "education_form": _name(x.get("educationForm")),
        "education_type": _name(x.get("educationType")), "payment_form": _name(x.get("paymentForm")), "status": _name(x.get("studentStatus")),
        "education_lang": _name((x.get("group") or {}).get("educationLang") if isinstance(x.get("group"), dict) else None) or _name(x.get("educationLang")),
        "avg_gpa": x.get("avg_gpa"), "total_credit": x.get("total_credit"), "province": _name(x.get("province")), "district": _name(x.get("district")),
        "semester_code": (x.get("semester") or {}).get("code") if isinstance(x.get("semester"), dict) else None,
        "education_year": _name(x.get("educationYear")),
    }


def _login_from(base: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9._-]+", "", base.lower())[:40] or "user"
    login, n = base, 2
    while login in taken or len(login) < 3:
        login, n = f"{base}{n}", n + 1
    taken.add(login)
    return login


def sync(st, cfg: dict, client: Client | None = None, log=None, on_user=None) -> dict:
    """To'liq sinxronlash: guruhlar → o'qituvchilar → talabalar. Natija: sanoqlar va xatolar."""
    c = client or Client(cfg)
    res: dict = {"groups": [0, 0], "teachers": [0, 0], "students": [0, 0], "schedule": [0, 0], "errors": [], "started": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    gmap: dict[str, str] = dict((st.kv_get("hemis_groups") or {}))

    def step(name: str, fn) -> None:
        try:
            fn()
        except HemisError as e:
            res["errors"].append(f"{name}: {e}")
        if log:
            log(name)

    def groups() -> None:
        local = {_norm(g["name"]): g for g in st.acad_list("groups")}
        for g in c.items("data/group-list"):
            name = (g.get("name") or "").strip()
            if not name:
                continue
            hit = local.get(_norm(name))
            note = "HEMIS: " + _name(g.get("specialty")) if g.get("specialty") else "HEMIS"
            if hit:
                gmap[str(g["id"])] = hit["id"]
                res["groups"][1] += 1
            else:
                new = st.acad_save("groups", {"name": name[:60], "lang": _name(g.get("educationLang"))[:40], "note": note[:200]})
                local[_norm(name)] = new
                gmap[str(g["id"])] = new["id"]
                res["groups"][0] += 1
        st.kv_put("hemis_groups", gmap)

    def teachers() -> None:
        users = st.list_users("teacher")
        by_hid = {str((u.get("data") or {}).get("hemis_id")): u for u in users if (u.get("data") or {}).get("hemis_id")}
        by_name = {_norm(u["name"]): u for u in users}
        taken = {u["login"] for u in st.list_users()}
        for e in c.items("data/employee-list", {"type": "teacher"}):
            hid = str(e.get("id") or "")
            name = (e.get("full_name") or "").strip()
            if not hid or not name:
                continue
            data = {"hemis_id": hid, "hemis_employee_no": e.get("employee_id_number") or "", "position": _name(e.get("staffPosition")) or None,
                    "department": _name(e.get("department")) or None, "academic_degree": _name(e.get("academicDegree")), "academic_rank": _name(e.get("academicRank")),
                    "hemis_image": e.get("image_full") or e.get("image") or ""}
            data = {k: v for k, v in data.items() if v is not None}
            u = by_hid.get(hid) or by_name.get(_norm(name))
            if u:
                st.update_user(u["id"], data=data)
                res["teachers"][1] += 1
            else:
                login = _login_from("t" + str(e.get("employee_id_number") or hid), taken)
                u = nu = st.create_user(login, name[:120], secrets.token_urlsafe(18), role="teacher", email="", data=data)
                res["teachers"][0] += 1
                if on_user:
                    on_user(nu)
            _fill_staff(st, st.get_user(u["id"]) or u, data)

    def students() -> None:
        users = st.list_users("student")
        by_hid = {str((u.get("data") or {}).get("hemis_id")): u for u in users if (u.get("data") or {}).get("hemis_id")}
        by_login = {u["login"]: u for u in users}
        taken = {u["login"] for u in st.list_users()}
        for x in c.items("data/student-list"):
            hid = str(x.get("id") or "")
            num = str(x.get("student_id_number") or "").strip()
            name = (x.get("full_name") or "").strip()
            if not hid or not name:
                continue
            gid = gmap.get(str((x.get("group") or {}).get("id") if isinstance(x.get("group"), dict) else ""))
            prof = _student_profile(x)
            data = {"hemis_id": hid, "student_no": num or None, "hemis": prof}
            data = {k: v for k, v in data.items() if v is not None}
            u = by_hid.get(hid) or (by_login.get(num.lower()) if num else None)
            if u:
                st.update_user(u["id"], data=data, **({"group_id": gid} if gid else {}))
                res["students"][1] += 1
            else:
                login = _login_from(num or f"s{hid}", taken)
                nu = st.create_user(login, name[:120], secrets.token_urlsafe(18), role="student", email="", group_id=gid, data=data)
                res["students"][0] += 1
                if on_user:
                    on_user(nu)

    if cfg.get("sync_groups", True):
        step("groups", groups)
    if cfg.get("sync_teachers", True):
        step("teachers", teachers)
    if cfg.get("sync_students", True):
        step("students", students)
    if cfg.get("sync_schedule", True):
        step("schedule", lambda: res.__setitem__("schedule", import_schedule(st, c, gmap, weeks=int(cfg.get("schedule_weeks") or 2))))
    res["finished"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    st.kv_put("hemis_last_sync", res)
    return res


def _fill_staff(st, user: dict, data: dict) -> None:
    """O'qituvchining saytdagi profili (Professorlar): bo'sh lavozim va ilmiy daraja HEMIS'dan to'ldiriladi; admin yozganlari o'zgarmaydi."""
    sid = (user.get("data") or {}).get("staff_id")
    it = st.get_item(sid) if sid else None
    if not it:
        return
    patch = {}
    if not it.get("position") and data.get("position"):
        patch["position"] = data["position"][:300]
    degree = ", ".join(x for x in (data.get("academic_degree"), data.get("academic_rank")) if x and x.strip("-— "))
    if not it.get("degree") and degree:
        patch["degree"] = degree[:200]
    if patch:
        st.patch_item_data(it["id"], **patch)


# ------------------------------------------------------------------ dars jadvali: HEMIS → sayt jadvali (haftalik andoza)
HEMIS_NOTE = "HEMIS"
_TYPES = (("maruza", "lecture"), ("лекц", "lecture"), ("lecture", "lecture"), ("amaliy", "practice"), ("практ", "practice"), ("practic", "practice"),
          ("laborator", "lab"), ("лаборатор", "lab"), ("seminar", "seminar"), ("семинар", "seminar"), ("imtihon", "exam"), ("экзам", "exam"),
          ("maslahat", "consult"), ("консульт", "consult"))
TZ = timezone(timedelta(hours=5))  # Toshkent


def _ltype(name: str) -> str:
    n = _norm(name)
    return next((v for k, v in _TYPES if k in n), "lecture" if not n else "other")


def _day(v) -> date | None:
    try:
        return datetime.fromtimestamp(int(v), TZ).date()
    except (TypeError, ValueError, OSError):
        try:
            return date.fromisoformat(str(v)[:10])
        except ValueError:
            return None


def import_schedule(st, c: "Client", gmap: dict | None = None, weeks: int = 2, today: date | None = None) -> list[int]:
    """HEMIS `data/schedule-list` (joriy haftadan boshlab `weeks` hafta) → joriy semestrning haftalik jadvali.

    Har bir dars (guruh, kun, juftlik, fan, o'qituvchi, xona, tur) bir marta yoziladi; faqat toq yoki faqat juft haftada uchrasa — shu paritet.
    Avval HEMIS'dan kelgan darslar (izoh «HEMIS») almashtiriladi, qo'lda kiritilganlar saqlanadi. HEMIS bo'sh qaytarsa — hech narsa o'chirilmaydi.
    Natija: [yozilgan darslar, o'chirilgan eski HEMIS darslari]."""
    from .academic import AcademicMixin, parity_of, week_number

    weeks = max(1, min(int(weeks or 2), 8))
    today = today or datetime.now(TZ).date()
    monday = today - timedelta(days=today.weekday())
    a, _ = _week_bounds(monday)
    rows = c.items("data/schedule-list", {"lesson_date_from": a, "lesson_date_to": a + weeks * 7 * 86400 - 1}, max_pages=300)
    if not rows:
        return [0, 0]
    sem = st.current_semester()
    if not sem:
        sem = st.acad_save("semesters", {"name": f"{monday.year}-{monday.year + 1} (HEMIS)", "start": monday.isoformat(), "current": True})
    gmap = dict(gmap if gmap is not None else (st.kv_get("hemis_groups") or {}))
    groups = {_norm(g["name"]): g["id"] for g in st.acad_list("groups")}
    subjects = {_norm(x["name"]): x["id"] for x in st.acad_list("subjects")}
    rooms = {_norm(x["name"]): x["id"] for x in st.acad_list("rooms")}
    slots = {x["start"]: x["id"] for x in st.acad_list("time_slots")}
    teachers = st.list_users("teacher")
    t_hid = {str((u.get("data") or {}).get("hemis_id")): u["id"] for u in teachers if (u.get("data") or {}).get("hemis_id")}
    t_name = {_norm(u["name"]): u["id"] for u in teachers}

    def ref(obj, table: dict, kind: str, extra: dict) -> str | None:
        name = _name(obj).strip()
        if not name:
            return None
        k = _norm(name)
        if k not in table:
            table[k] = st.acad_save(kind, {"name": name[:200 if kind == "subjects" else 80]} | extra)["id"]
        return table[k]

    seen: dict[tuple, set] = {}
    for x in rows:
        day = _day(x.get("lesson_date"))
        lp = x.get("lessonPair") if isinstance(x.get("lessonPair"), dict) else {}
        start = (lp.get("start_time") or "").strip()[:5]
        if not day or not start:
            continue
        g = x.get("group") if isinstance(x.get("group"), dict) else {}
        gid = gmap.get(str(g.get("id"))) or groups.get(_norm(g.get("name") or ""))
        if not gid and (g.get("name") or "").strip():
            gid = groups[_norm(g["name"])] = st.acad_save("groups", {"name": g["name"].strip()[:60], "note": HEMIS_NOTE})["id"]
            if g.get("id"):
                gmap[str(g["id"])] = gid
        sid = ref(x.get("subject"), subjects, "subjects", {"note": HEMIS_NOTE})
        if not gid or not sid:
            continue
        if start not in slots:
            try:
                idx = int(str(lp.get("code") or lp.get("name") or "").strip()[:2])
            except ValueError:
                idx = len(slots) + 1
            slots[start] = st.acad_save("time_slots", {"idx": idx, "start": start, "end": (lp.get("end_time") or start)[:5]})["id"]
        emp = x.get("employee") if isinstance(x.get("employee"), dict) else {}
        tid = t_hid.get(str(emp.get("id"))) or t_name.get(_norm(emp.get("name") or ""))
        rid = ref(x.get("auditorium"), rooms, "rooms", {"type": "classroom"})
        key = (gid, day.weekday(), slots[start], sid, tid, rid, _ltype(_name(x.get("trainingType"))))
        seen.setdefault(key, set()).add(parity_of(week_number(sem.get("start"), day)))
    st.kv_put("hemis_groups", gmap)
    old = [r for r in st.lessons(semester_id=sem["id"]) if (r.get("note") or "") == HEMIS_NOTE]
    for r in old:
        st.delete_lesson(r["id"])
    n = 0
    for (gid, wd, slot, sid, tid, rid, typ), par in seen.items():
        parity = next(iter(par)) if weeks >= 2 and len(par) == 1 else "all"
        st.save_lesson(AcademicMixin.clean_lesson({"semester_id": sem["id"], "group_id": gid, "subject_id": sid, "teacher_id": tid, "room_id": rid,
                                                   "weekday": wd, "slot_id": slot, "type": typ, "parity": parity, "note": HEMIS_NOTE}))
        n += 1
    return [n, len(old)]


# ------------------------------------------------------------------ talaba profili (kesh bilan)
def _week_bounds(d: date) -> tuple[int, int]:
    start = d - timedelta(days=d.weekday())
    a = datetime(start.year, start.month, start.day, tzinfo=timezone.utc) - timedelta(hours=5)  # Toshkent (UTC+5) hafta boshi
    return int(a.timestamp()), int((a + timedelta(days=7)).timestamp()) - 1


def _att(x: dict) -> dict:
    return {"date": ts(x.get("lesson_date")), "subject": _name(x.get("subject")), "type": _name(x.get("trainingType")), "pair": _name(x.get("lessonPair")),
            "start": (x.get("lessonPair") or {}).get("start_time") if isinstance(x.get("lessonPair"), dict) else "",
            "teacher": _name(x.get("employee")), "absent_on": int(x.get("absent_on") or 0), "absent_off": int(x.get("absent_off") or 0),
            "explicable": bool(x.get("explicable"))}


def _lesson(x: dict) -> dict:
    lp = x.get("lessonPair") if isinstance(x.get("lessonPair"), dict) else {}
    return {"date": ts(x.get("lesson_date")), "subject": _name(x.get("subject")), "type": _name(x.get("trainingType")), "pair": _name(lp),
            "start": lp.get("start_time") or "", "end": lp.get("end_time") or "", "room": _name(x.get("auditorium")),
            "teacher": _name(x.get("employee")), "group": _name(x.get("group"))}


def student_data(st, cfg: dict, user: dict, client: Client | None = None, force: bool = False, week: date | None = None) -> dict:
    """Talaba kabineti uchun HEMIS ma'lumotlari: profil, GPA, davomat, baholar, imtihonlar, haftalik jadval."""
    d = user.get("data") or {}
    hid = d.get("hemis_id")
    if not hid:
        raise HemisError("not_linked")
    key = f"student:{hid}"
    age = max(1, int(cfg.get("cache_minutes") or 60)) * 60
    cached = None if force else cache_get(st, key, age)
    c = client or Client(cfg)
    if cached is None:
        out: dict = {"profile": d.get("hemis") or {}, "errors": []}
        try:
            info = c.get("data/student-info", {"student_id": hid})
            if isinstance(info, dict) and info:
                out["profile"] = _student_profile(info)
                st.update_user(user["id"], data={"hemis": out["profile"]})
        except HemisError as e:
            out["errors"].append(f"profile: {e}")
        for name, path, fn in (("attendance", "data/attendance-list", _att), ("grades", "data/student-grade-list", None),
                               ("exams", "data/student-performance-list", None), ("gpa", "data/student-gpa-list", None)):
            try:
                rows = c.items(path, {"_student": hid}, max_pages=20)
            except HemisError as e:
                out["errors"].append(f"{name}: {e}")
                rows = []
            if name == "attendance":
                out[name] = sorted((fn(x) for x in rows), key=lambda x: x["date"] or "", reverse=True)
            elif name == "grades":
                out[name] = sorted(({"date": ts(x.get("lesson_date")), "subject": _name(x.get("subject")), "type": _name(x.get("trainingType")),
                                     "grade": x.get("grade"), "teacher": _name(x.get("employee"))} for x in rows), key=lambda x: x["date"] or "", reverse=True)
            elif name == "exams":
                out[name] = sorted(({"date": ts(x.get("exam_date")), "subject": _name(x.get("subject")), "exam": _name(x.get("examType")),
                                     "final": _name(x.get("finalExamType")), "grade": x.get("grade"), "regrade": x.get("regrade"),
                                     "semester": _name(x.get("semester"))} for x in rows), key=lambda x: x["date"] or "", reverse=True)
            else:
                out[name] = [{"year": _name(x.get("educationYear")), "level": _name(x.get("level")), "gpa": x.get("gpa"), "credits": x.get("credit_sum"),
                              "subjects": x.get("subjects"), "debts": x.get("debt_subjects")} for x in rows]
        # davomat bo'yicha fanlar kesimi
        per: dict[str, dict] = {}
        for a in out.get("attendance") or []:
            p = per.setdefault(a["subject"], {"subject": a["subject"], "hours": 0, "excused": 0, "unexcused": 0})
            p["hours"] += a["absent_on"] + a["absent_off"]
            p["excused" if a["explicable"] else "unexcused"] += a["absent_on"] + a["absent_off"]
        out["attendance_by_subject"] = sorted(per.values(), key=lambda x: -x["hours"])
        out["fetched"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        cache_put(st, key, out)
        cached = out
    # haftalik jadval (alohida, qisqa kesh)
    wk = week or date.today()
    a, b = _week_bounds(wk)
    hg = (cached.get("profile") or {}).get("group")
    skey = f"schedule:{hid}:{a}"
    sched = None if force else cache_get(st, skey, min(age, 1800))
    if sched is None:
        sched = []
        group_hid = next((h for h, loc in (st.kv_get("hemis_groups") or {}).items() if loc == user.get("group_id")), None)
        try:
            params = {"lesson_date_from": a, "lesson_date_to": b} | ({"_group": group_hid} if group_hid else {})
            if group_hid or hg:
                rows = c.items("data/schedule-list", params, max_pages=10)
                sched = sorted((_lesson(x) for x in rows if group_hid or _name(x.get("group")) == hg), key=lambda x: (x["date"] or "", x["start"]))
            cache_put(st, skey, sched)
        except HemisError as e:
            cached = cached | {"errors": [*cached.get("errors", []), f"schedule: {e}"]}
    return cached | {"schedule": sched, "week_start": (wk - timedelta(days=wk.weekday())).isoformat()}


def teacher_schedule(st, cfg: dict, user: dict, week: date | None = None, client: Client | None = None) -> list[dict]:
    hid = (user.get("data") or {}).get("hemis_id")
    if not hid:
        raise HemisError("not_linked")
    wk = week or date.today()
    a, b = _week_bounds(wk)
    key = f"tschedule:{hid}:{a}"
    got = cache_get(st, key, 1800)
    if got is None:
        rows = (client or Client(cfg)).items("data/schedule-list", {"_employee": hid, "lesson_date_from": a, "lesson_date_to": b}, max_pages=10)
        got = sorted((_lesson(x) for x in rows), key=lambda x: (x["date"] or "", x["start"]))
        cache_put(st, key, got)
    return got


# ------------------------------------------------------------------ fon rejimida avtomatik sinxronlash
class AutoSync:
    def __init__(self, st, on_user=None):
        self.st = st
        self.on_user = on_user
        self.running = False
        self._t: threading.Thread | None = None
        self._stop = threading.Event()

    def run_now(self) -> bool:
        """Qo'lda ishga tushirish (fon oqimida). Allaqachon ishlayotgan bo'lsa — False."""
        if self.running:
            return False
        cfg = config(self.st)
        if not ready(cfg):
            raise HemisError("disabled")

        def go():
            self.running = True
            self.st.kv_put("hemis_sync_state", {"running": True, "step": "", "started": datetime.now(timezone.utc).isoformat(timespec="seconds")})
            try:
                sync(self.st, cfg, log=lambda step: self.st.kv_put("hemis_sync_state", {"running": True, "step": step}), on_user=self.on_user)
            except Exception as e:  # noqa: BLE001
                self.st.kv_put("hemis_last_sync", {"errors": [f"{type(e).__name__}: {e}"], "finished": datetime.now(timezone.utc).isoformat(timespec="seconds")})
            finally:
                self.running = False
                self.st.kv_put("hemis_sync_state", {"running": False})

        threading.Thread(target=go, daemon=True).start()
        return True

    def start(self) -> None:
        if self._t and self._t.is_alive():
            return

        def loop():
            while not self._stop.wait(300):
                try:
                    cfg = config(self.st)
                    hours = int(cfg.get("auto_hours") or 0)
                    if not (ready(cfg) and hours):
                        continue
                    last = (self.st.kv_get("hemis_last_sync") or {}).get("finished") or ""
                    due = not last or datetime.fromisoformat(last) < datetime.now(timezone.utc) - timedelta(hours=hours)
                    if due and not self.running:
                        self.run_now()
                except Exception:  # noqa: BLE001
                    continue

        self._t = threading.Thread(target=loop, daemon=True)
        self._t.start()
