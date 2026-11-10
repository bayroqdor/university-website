"""O'quv jarayoni (akademik) ma'lumotlari: semestrlar, dars vaqtlari, guruhlar, fanlar, auditoriyalar,
dars jadvali (to'qnashuvlarni aniqlash bilan), jadval o'zgarishlari, davomat, baholar, topshiriqlar, materiallar, bildirishnomalar.

`Storage` klassiga mixin sifatida qo'shiladi (PostgreSQL, umumiy ulanishlar puli).
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import date, datetime, timedelta, timezone

WEEKDAYS = ("Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba")
LESSON_TYPES = ("lecture", "practice", "lab", "seminar", "exam", "consult", "other")
PARITY = ("all", "odd", "even")
ATT_STATUS = ("present", "absent", "late", "excused")
GRADE_KINDS = ("current", "midterm", "final", "assignment", "other")
AUDIENCE = ("all", "students", "teachers", "group")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _notice_hook(st, notice: dict) -> None:
    """Yangi bildirishnoma (shaxsiy yoki talabalar/guruhga) — bog'langan Telegram chatlariga (tg_student)."""
    from . import tg_student  # noqa: PLC0415

    tg_student.on_notice(st, notice)


def _id() -> str:
    return uuid.uuid4().hex[:12]


def _s(v, n: int = 200) -> str:
    return str(v if v is not None else "").strip()[:n]


def _int(v, default=None):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def _float(v, default=None):
    try:
        x = float(v)
        return x if x == x else default
    except (TypeError, ValueError):
        return default


def _date(v) -> str | None:
    """YYYY-MM-DD (noto'g'ri bo'lsa None)."""
    v = _s(v, 40)
    if not v:
        return None
    try:
        return date.fromisoformat(v[:10]).isoformat()
    except ValueError:
        return None


def _time(v) -> str:
    v = _s(v, 10)
    return v if re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v) else ""


def _iso(v) -> str | None:
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def _list(v, n: int = 10, ln: int = 500) -> list:
    out = []
    for x in (v or [])[:n]:
        if isinstance(x, dict) and x.get("url"):
            out.append({"label": _s(x.get("label"), 120), "url": _s(x.get("url"), ln)})
        elif isinstance(x, str) and x.strip():
            out.append({"label": "", "url": x.strip()[:ln]})
    return out


def score_to_5(pct: float | None) -> int | None:
    """Foizni 5 ballik tizimga: ≥90 → 5, 70–89 → 4, 60–69 → 3, <60 → 2."""
    if pct is None:
        return None
    return 5 if pct >= 90 else 4 if pct >= 70 else 3 if pct >= 60 else 2


def week_number(sem_start: str | None, day: date) -> int:
    """Semestr boshidan hafta raqami (1 dan). Semestr sanasi bo'lmasa — ISO hafta."""
    if sem_start:
        try:
            start = date.fromisoformat(sem_start)
            start -= timedelta(days=start.weekday())
            return max(1, (day - start).days // 7 + 1)
        except ValueError:
            pass
    return day.isocalendar()[1]


def parity_of(week_no: int) -> str:
    return "odd" if week_no % 2 == 1 else "even"


# jadval: ustunlar va tozalash
TABLES: dict[str, dict] = {
    "semesters": {"cols": ("name", "start", "end", "current", "published"), "order": "start DESC, name"},
    "time_slots": {"cols": ("idx", "start", "end"), "order": "idx"},
    "groups": {"cols": ("name", "program_id", "faculty_id", "course", "lang", "curator_id", "year_start", "note"), "order": "course, name"},
    "subjects": {"cols": ("name", "code", "credits", "department", "note"), "order": "name"},
    "rooms": {"cols": ("name", "building", "capacity", "type"), "order": "building, name"},
}


def clean_record(table: str, data: dict) -> dict:
    d = {}
    if table == "semesters":
        d = {"name": _s(data.get("name"), 120), "start": _date(data.get("start")), "end": _date(data.get("end")), "current": int(bool(data.get("current"))), "published": int(bool(data.get("published", True)))}
    elif table == "time_slots":
        d = {"idx": _int(data.get("idx"), 1) or 1, "start": _time(data.get("start")), "end": _time(data.get("end"))}
    elif table == "groups":
        d = {"name": _s(data.get("name"), 80), "program_id": _s(data.get("program_id"), 40) or None, "faculty_id": _s(data.get("faculty_id"), 40) or None,
             "course": min(max(_int(data.get("course"), 1) or 1, 1), 7), "lang": _s(data.get("lang"), 40), "curator_id": _s(data.get("curator_id"), 40) or None,
             "year_start": _int(data.get("year_start"), None), "note": _s(data.get("note"), 500)}
    elif table == "subjects":
        d = {"name": _s(data.get("name"), 200), "code": _s(data.get("code"), 40), "credits": _float(data.get("credits"), None), "department": _s(data.get("department"), 200), "note": _s(data.get("note"), 500)}
    elif table == "rooms":
        d = {"name": _s(data.get("name"), 80), "building": _s(data.get("building"), 120), "capacity": _int(data.get("capacity"), None), "type": _s(data.get("type"), 40) or "classroom"}
    if "name" in d and not d["name"]:
        raise ValueError("empty_name")
    return d


class AcademicMixin:
    """Storage uchun o'quv jarayoni jadvallari. `self._conn`, `self._tx`, `self._q`, `self._one` Storage'dan."""

    def _init_academic(self) -> None:
        with self._tx():
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS semesters (id TEXT PRIMARY KEY, name TEXT NOT NULL, start TEXT, "end" TEXT, current BIGINT NOT NULL DEFAULT 0,
                    published BIGINT NOT NULL DEFAULT 1, created TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS time_slots (id TEXT PRIMARY KEY, idx BIGINT NOT NULL, start TEXT NOT NULL, "end" TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, program_id TEXT, faculty_id TEXT, course BIGINT NOT NULL DEFAULT 1,
                    lang TEXT, curator_id TEXT, year_start BIGINT, note TEXT, created TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT, credits DOUBLE PRECISION, department TEXT, note TEXT, created TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, building TEXT, capacity BIGINT, type TEXT);
                CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY, semester_id TEXT NOT NULL, group_id TEXT NOT NULL, subject_id TEXT NOT NULL, teacher_id TEXT,
                    room_id TEXT, weekday BIGINT NOT NULL, slot_id TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'lecture', parity TEXT NOT NULL DEFAULT 'all',
                    date_from TEXT, date_to TEXT, note TEXT, created TEXT NOT NULL, updated TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS ix_lessons_sem ON lessons(semester_id, weekday, slot_id);
                CREATE INDEX IF NOT EXISTS ix_lessons_group ON lessons(group_id);
                CREATE INDEX IF NOT EXISTS ix_lessons_teacher ON lessons(teacher_id);
                CREATE TABLE IF NOT EXISTS schedule_changes (id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL,
                    room_id TEXT, slot_id TEXT, teacher_id TEXT, note TEXT, created_by TEXT, created TEXT NOT NULL, UNIQUE(lesson_id, date));
                CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, date TEXT NOT NULL, student_id TEXT NOT NULL,
                    status TEXT NOT NULL, note TEXT, marked_by TEXT, ts TEXT NOT NULL, UNIQUE(lesson_id, date, student_id));
                CREATE INDEX IF NOT EXISTS ix_att_student ON attendance(student_id, date);
                CREATE TABLE IF NOT EXISTS grades (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, subject_id TEXT NOT NULL, semester_id TEXT NOT NULL,
                    kind TEXT NOT NULL, title TEXT, score DOUBLE PRECISION NOT NULL, max DOUBLE PRECISION NOT NULL DEFAULT 100, date TEXT, comment TEXT, teacher_id TEXT, ts TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS ix_grades_student ON grades(student_id, semester_id);
                CREATE INDEX IF NOT EXISTS ix_grades_subject ON grades(subject_id, semester_id);
                CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, group_id TEXT NOT NULL, teacher_id TEXT NOT NULL,
                    semester_id TEXT, title TEXT NOT NULL, description TEXT, due TEXT, max DOUBLE PRECISION NOT NULL DEFAULT 100, attachments TEXT NOT NULL DEFAULT '[]',
                    created TEXT NOT NULL, updated TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS ix_assign_group ON assignments(group_id, due);
                CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, student_id TEXT NOT NULL, text TEXT,
                    attachments TEXT NOT NULL DEFAULT '[]', submitted TEXT NOT NULL, score DOUBLE PRECISION, feedback TEXT, graded_by TEXT, graded_at TEXT,
                    UNIQUE(assignment_id, student_id));
                CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, group_id TEXT, teacher_id TEXT NOT NULL, title TEXT NOT NULL,
                    description TEXT, url TEXT, attachments TEXT NOT NULL DEFAULT '[]', created TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS ix_mat_subject ON materials(subject_id);
                CREATE TABLE IF NOT EXISTS notices (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, audience TEXT NOT NULL DEFAULT 'all', group_id TEXT,
                    author_id TEXT, pinned BIGINT NOT NULL DEFAULT 0, created TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS ix_notices_created ON notices(pinned, created);
                """
            )
            if not self._conn.execute("SELECT 1 FROM time_slots LIMIT 1").fetchone():
                # standart juftliklar (80 daqiqa, 10 daqiqa tanaffus)
                for i, (a, b) in enumerate((("08:30", "09:50"), ("10:00", "11:20"), ("11:30", "12:50"), ("13:30", "14:50"), ("15:00", "16:20"), ("16:30", "17:50")), 1):
                    self._conn.execute("INSERT INTO time_slots VALUES(%s,%s,%s,%s)", (_id(), i, a, b))

    # ------------------------------------------------------------------ umumiy CRUD (semestr, vaqt, guruh, fan, auditoriya)
    def acad_list(self, table: str) -> list[dict]:
        t = TABLES[table]
        rows = [dict(r) for r in self._q(f"SELECT * FROM {table} ORDER BY {t['order']}")]
        if table == "semesters":
            for r in rows:
                r["current"], r["published"] = bool(r["current"]), bool(r["published"])
        if table == "groups":
            counts = {r[0]: r[1] for r in self._q("SELECT group_id, COUNT(*) FROM users WHERE role='student' AND active=1 AND group_id IS NOT NULL GROUP BY group_id")}
            for r in rows:
                r["students"] = counts.get(r["id"], 0)
        return rows

    def acad_get(self, table: str, rid: str) -> dict | None:
        assert table in TABLES or table in ("lessons", "assignments", "materials", "notices", "schedule_changes", "grades")
        r = self._q(f"SELECT * FROM {table} WHERE id=%s", (rid,))
        if not r:
            return None
        d = dict(r[0])
        if table == "semesters":
            d["current"], d["published"] = bool(d["current"]), bool(d["published"])
        for k in ("attachments",):
            if k in d:
                d[k] = json.loads(d[k] or "[]")
        return d

    def acad_save(self, table: str, data: dict, rid: str | None = None) -> dict:
        t = TABLES[table]
        d = clean_record(table, data)
        now = _now()
        with self._tx():
            if table == "semesters" and d["current"]:
                self._conn.execute("UPDATE semesters SET current=0")
            if rid and self._one(f"SELECT 1 FROM {table} WHERE id=%s", (rid,)):
                sets = ", ".join(f'"{k}"=%s' for k in t["cols"])  # "end" — PostgreSQL kalit so'zi
                self._conn.execute(f"UPDATE {table} SET {sets} WHERE id=%s", (*[d[k] for k in t["cols"]], rid))
            else:
                rid = _id()
                has_created = table in ("semesters", "groups", "subjects")
                cols = list(t["cols"]) + (["created"] if has_created else [])
                vals = [d[k] for k in t["cols"]] + ([now] if has_created else [])
                names = ", ".join(f'"{k}"' for k in cols)
                self._conn.execute(f"INSERT INTO {table}(id, {names}) VALUES(%s, {', '.join('%s' for _ in cols)})", (rid, *vals))
        return self.acad_get(table, rid)

    def acad_delete(self, table: str, rid: str) -> None:
        with self._tx():
            self._conn.execute(f"DELETE FROM {table} WHERE id=%s", (rid,))
            if table == "groups":
                self._conn.execute("UPDATE users SET group_id=NULL WHERE group_id=%s", (rid,))
                self._conn.execute("DELETE FROM lessons WHERE group_id=%s", (rid,))
            if table == "semesters":
                self._conn.execute("DELETE FROM lessons WHERE semester_id=%s", (rid,))
            if table == "time_slots":
                self._conn.execute("DELETE FROM lessons WHERE slot_id=%s", (rid,))

    def current_semester(self) -> dict | None:
        r = self._q("SELECT * FROM semesters WHERE current=1 LIMIT 1") or self._q("SELECT * FROM semesters ORDER BY start DESC LIMIT 1")
        if not r:
            return None
        d = dict(r[0])
        d["current"], d["published"] = bool(d["current"]), bool(d["published"])
        return d

    def group_by_name(self, name: str) -> dict | None:
        r = self._q("SELECT * FROM groups WHERE lower(name)=%s", (name.strip().lower(),))
        return dict(r[0]) if r else None

    # ------------------------------------------------------------------ dars jadvali
    LESSON_SQL = """
        SELECT l.*, s.name AS subject, s.code AS subject_code, g.name AS group_name, u.name AS teacher, r.name AS room, r.building,
               t.idx AS slot_idx, t.start AS slot_start, t."end" AS slot_end
        FROM lessons l
        LEFT JOIN subjects s ON s.id=l.subject_id
        LEFT JOIN groups g ON g.id=l.group_id
        LEFT JOIN users u ON u.id=l.teacher_id
        LEFT JOIN rooms r ON r.id=l.room_id
        LEFT JOIN time_slots t ON t.id=l.slot_id
    """

    def lessons(self, semester_id: str | None = None, group_id: str | None = None, teacher_id: str | None = None, room_id: str | None = None, subject_id: str | None = None) -> list[dict]:
        where, args = [], []
        for col, v in (("l.semester_id", semester_id), ("l.group_id", group_id), ("l.teacher_id", teacher_id), ("l.room_id", room_id), ("l.subject_id", subject_id)):
            if v:
                where.append(f"{col}=%s")
                args.append(v)
        sql = self.LESSON_SQL + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY l.weekday, t.idx, g.name"
        return [dict(r) for r in self._q(sql, tuple(args))]

    def get_lesson(self, lid: str) -> dict | None:
        r = self._q(self.LESSON_SQL + " WHERE l.id=%s", (lid,))
        return dict(r[0]) if r else None

    @staticmethod
    def clean_lesson(data: dict) -> dict:
        d = {
            "semester_id": _s(data.get("semester_id"), 40), "group_id": _s(data.get("group_id"), 40), "subject_id": _s(data.get("subject_id"), 40),
            "teacher_id": _s(data.get("teacher_id"), 40) or None, "room_id": _s(data.get("room_id"), 40) or None,
            "weekday": min(max(_int(data.get("weekday"), 0) or 0, 0), 6), "slot_id": _s(data.get("slot_id"), 40),
            "type": data.get("type") if data.get("type") in LESSON_TYPES else "lecture", "parity": data.get("parity") if data.get("parity") in PARITY else "all",
            "date_from": _date(data.get("date_from")), "date_to": _date(data.get("date_to")), "note": _s(data.get("note"), 300),
        }
        for k in ("semester_id", "group_id", "subject_id", "slot_id"):
            if not d[k]:
                raise ValueError(f"missing_{k}")
        return d

    def lesson_conflicts(self, d: dict, exclude: str | None = None, rows: list[dict] | None = None) -> list[dict]:
        """Bir vaqtda: guruh band / o'qituvchi boshqa darsda / auditoriya band.

        Bir o'qituvchi bir vaqtda bir xil fanni bir xil auditoriyada bir nechta guruhga o'tishi (qo'shma ma'ruza) — to'qnashuv emas."""
        rows = rows if rows is not None else self.lessons(semester_id=d["semester_id"])
        out = []
        for x in rows:
            if x["id"] == exclude or x["weekday"] != d["weekday"] or x["slot_id"] != d["slot_id"]:
                continue
            if d["parity"] != "all" and x["parity"] != "all" and x["parity"] != d["parity"]:
                continue  # toq/juft haftalar kesishmaydi
            if x["group_id"] == d["group_id"]:
                out.append({"kind": "group", "lesson": x})
            joint = x["teacher_id"] == d["teacher_id"] and x["subject_id"] == d["subject_id"] and x["room_id"] == d["room_id"]
            if d["teacher_id"] and x["teacher_id"] == d["teacher_id"] and not joint:
                out.append({"kind": "teacher", "lesson": x})
            if d["room_id"] and x["room_id"] == d["room_id"] and not joint and x["teacher_id"] != d["teacher_id"]:
                out.append({"kind": "room", "lesson": x})
        return out

    def availability(self, d: dict, exclude: str | None = None, days: int = 6) -> list[dict]:
        """Dars jadvali tuzuvchida sudrab ko'chirish uchun: har bir (kun, juftlik) katagi uchun to'qnashuvlar.

        Qaytaradi: [{"weekday", "slot_id", "conflicts": [{"kind", "group_name", "subject", "teacher", "room"}]}]"""
        rows = self.lessons(semester_id=d["semester_id"])
        out = []
        for wd in range(days):
            for slot in self.acad_list("time_slots"):
                c = self.lesson_conflicts({**d, "weekday": wd, "slot_id": slot["id"]}, exclude=exclude, rows=rows)
                out.append({"weekday": wd, "slot_id": slot["id"],
                            "conflicts": [{"kind": x["kind"], **{k: x["lesson"].get(k) for k in ("id", "group_name", "subject", "teacher", "room")}} for x in c]})
        return out

    def save_lesson(self, d: dict, lid: str | None = None) -> dict:
        now = _now()
        cols = ("semester_id", "group_id", "subject_id", "teacher_id", "room_id", "weekday", "slot_id", "type", "parity", "date_from", "date_to", "note")
        with self._tx():
            if lid and self._one("SELECT 1 FROM lessons WHERE id=%s", (lid,)):
                self._conn.execute(f"UPDATE lessons SET {', '.join(k + '=%s' for k in cols)}, updated=%s WHERE id=%s", (*[d[k] for k in cols], now, lid))
            else:
                lid = _id()
                self._conn.execute(f"INSERT INTO lessons(id, {', '.join(cols)}, created, updated) VALUES(%s, {', '.join('%s' for _ in cols)}, %s, %s)", (lid, *[d[k] for k in cols], now, now))
        return self.get_lesson(lid)

    def delete_lesson(self, lid: str) -> None:
        with self._tx():
            self._conn.execute("DELETE FROM lessons WHERE id=%s", (lid,))
            self._conn.execute("DELETE FROM schedule_changes WHERE lesson_id=%s", (lid,))

    def copy_semester_schedule(self, src: str, dst: str) -> int:
        """Bir semestr jadvalini boshqasiga nusxalash (yangi o'quv yili uchun qoralama)."""
        n = 0
        now = _now()
        with self._tx():
            for r in self._q("SELECT * FROM lessons WHERE semester_id=%s", (src,)):
                self._conn.execute(
                    "INSERT INTO lessons(id, semester_id, group_id, subject_id, teacher_id, room_id, weekday, slot_id, type, parity, date_from, date_to, note, created, updated) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (_id(), dst, r["group_id"], r["subject_id"], r["teacher_id"], r["room_id"], r["weekday"], r["slot_id"], r["type"], r["parity"], None, None, r["note"], now, now),
                )
                n += 1
        return n

    # o'zgarishlar (bir kunlik: bekor qilish, ko'chirish)
    def changes(self, lesson_ids: list[str], date_from: str, date_to: str) -> dict[tuple[str, str], dict]:
        if not lesson_ids:
            return {}
        out = {}
        rows = self._q(
            'SELECT c.*, r.name AS room, t.idx AS slot_idx, t.start AS slot_start, t."end" AS slot_end, u.name AS teacher FROM schedule_changes c '
            "LEFT JOIN rooms r ON r.id=c.room_id LEFT JOIN time_slots t ON t.id=c.slot_id LEFT JOIN users u ON u.id=c.teacher_id "
            "WHERE c.lesson_id = ANY(%s) AND c.date>=%s AND c.date<=%s",
            (list(lesson_ids), date_from, date_to),
        )
        for r in rows:
            out[(r["lesson_id"], r["date"])] = dict(r)
        return out

    def list_changes(self, semester_id: str | None = None, limit: int = 300) -> list[dict]:
        sql = ("SELECT c.*, l.semester_id, l.weekday, s.name AS subject, g.name AS group_name, r.name AS room FROM schedule_changes c JOIN lessons l ON l.id=c.lesson_id "
               "LEFT JOIN subjects s ON s.id=l.subject_id LEFT JOIN groups g ON g.id=l.group_id LEFT JOIN rooms r ON r.id=c.room_id")
        args: tuple = ()
        if semester_id:
            sql += " WHERE l.semester_id=%s"
            args = (semester_id,)
        sql += " ORDER BY c.date DESC LIMIT %s"
        return [dict(r) for r in self._q(sql, (*args, limit))]

    def save_change(self, lesson_id: str, day: str, kind: str, room_id: str | None, slot_id: str | None, teacher_id: str | None, note: str, by: str) -> dict:
        if kind not in ("cancel", "move", "replace"):
            raise ValueError("invalid_kind")
        d = _date(day)
        if not d:
            raise ValueError("invalid_date")
        with self._tx():
            self._conn.execute(
                "INSERT INTO schedule_changes(id, lesson_id, date, kind, room_id, slot_id, teacher_id, note, created_by, created) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT(lesson_id, date) DO UPDATE SET kind=excluded.kind, room_id=excluded.room_id, slot_id=excluded.slot_id, teacher_id=excluded.teacher_id, note=excluded.note, created_by=excluded.created_by, created=excluded.created",
                (_id(), lesson_id, d, kind, room_id or None, slot_id or None, teacher_id or None, _s(note, 300), by, _now()),
            )
        r = self._q("SELECT * FROM schedule_changes WHERE lesson_id=%s AND date=%s", (lesson_id, d))
        return dict(r[0])

    def delete_change(self, cid: str) -> None:
        with self._tx():
            self._conn.execute("DELETE FROM schedule_changes WHERE id=%s", (cid,))

    def week_schedule(self, semester: dict, week_start: date, **filters) -> dict:
        """Berilgan hafta uchun kunlar bo'yicha darslar (toq/juft, sana oralig'i va bir kunlik o'zgarishlar hisobga olingan)."""
        week_start -= timedelta(days=week_start.weekday())
        days = [week_start + timedelta(days=i) for i in range(7)]
        wn = week_number(semester.get("start"), week_start)
        par = parity_of(wn)
        rows = self.lessons(semester_id=semester["id"], **filters)
        ch = self.changes([r["id"] for r in rows], days[0].isoformat(), days[-1].isoformat())
        out = []
        for day in days:
            ds = day.isoformat()
            if semester.get("start") and ds < semester["start"] or semester.get("end") and ds > semester["end"]:
                out.append({"date": ds, "weekday": day.weekday(), "lessons": [], "off": True})
                continue
            items = []
            for r in rows:
                if r["weekday"] != day.weekday():
                    continue
                if r["parity"] != "all" and r["parity"] != par:
                    continue
                if r["date_from"] and ds < r["date_from"] or r["date_to"] and ds > r["date_to"]:
                    continue
                c = ch.get((r["id"], ds))
                item = {**r, "date": ds, "change": c}
                if c and c["kind"] in ("move", "replace"):
                    for k in ("room", "room_id", "slot_idx", "slot_start", "slot_end", "slot_id", "teacher", "teacher_id"):
                        if c.get(k):
                            item[k] = c[k]
                items.append(item)
            items.sort(key=lambda x: (x.get("slot_idx") or 0, x.get("group_name") or ""))
            out.append({"date": ds, "weekday": day.weekday(), "lessons": items})
        return {"week_start": days[0].isoformat(), "week_end": days[-1].isoformat(), "week_number": wn, "parity": par, "days": out, "semester": semester}

    # ------------------------------------------------------------------ o'qituvchi: guruhlar va fanlar (jadvaldan)
    def teacher_courses(self, teacher_id: str, semester_id: str) -> list[dict]:
        rows = self._q(
            "SELECT l.group_id, g.name AS group_name, g.course, l.subject_id, s.name AS subject, s.code AS subject_code, COUNT(*) AS lessons_per_week, "
            "(SELECT COUNT(*) FROM users u WHERE u.group_id=l.group_id AND u.role='student' AND u.active=1) AS students "
            "FROM lessons l JOIN groups g ON g.id=l.group_id JOIN subjects s ON s.id=l.subject_id WHERE l.teacher_id=%s AND l.semester_id=%s "
            "GROUP BY l.group_id, l.subject_id, g.name, g.course, s.name, s.code ORDER BY g.name, s.name",
            (teacher_id, semester_id),
        )
        return [dict(r) for r in rows]

    def teacher_has(self, teacher_id: str, group_id: str, subject_id: str | None = None, semester_id: str | None = None) -> bool:
        sql, args = "SELECT 1 FROM lessons WHERE teacher_id=%s AND group_id=%s", [teacher_id, group_id]
        if subject_id:
            sql += " AND subject_id=%s"
            args.append(subject_id)
        if semester_id:
            sql += " AND semester_id=%s"
            args.append(semester_id)
        return bool(self._one(sql + " LIMIT 1", tuple(args)))

    def group_students(self, group_id: str) -> list[dict]:
        return [{"id": r["id"], "name": r["name"], "login": r["login"], "email": r["email"], "data": json.loads(r["data"] or "{}")}
                for r in self._q("SELECT * FROM users WHERE group_id=%s AND role='student' AND active=1 ORDER BY name", (group_id,))]

    # ------------------------------------------------------------------ davomat
    def attendance_for(self, lesson_id: str, day: str) -> list[dict]:
        return [dict(r) for r in self._q("SELECT * FROM attendance WHERE lesson_id=%s AND date=%s", (lesson_id, day))]

    def set_attendance(self, lesson_id: str, day: str, marks: list[dict], by: str) -> int:
        d = _date(day)
        if not d:
            raise ValueError("invalid_date")
        n = 0
        with self._tx():
            for m in marks[:500]:
                sid, st = _s(m.get("student_id"), 40), m.get("status")
                if not sid or st not in ATT_STATUS:
                    continue
                self._conn.execute(
                    "INSERT INTO attendance(id, lesson_id, date, student_id, status, note, marked_by, ts) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) "
                    "ON CONFLICT(lesson_id, date, student_id) DO UPDATE SET status=excluded.status, note=excluded.note, marked_by=excluded.marked_by, ts=excluded.ts",
                    (_id(), lesson_id, d, sid, st, _s(m.get("note"), 200), by, _now()),
                )
                n += 1
        return n

    def attendance_dates(self, lesson_id: str) -> list[str]:
        return [r[0] for r in self._q("SELECT DISTINCT date FROM attendance WHERE lesson_id=%s ORDER BY date DESC", (lesson_id,))]

    def student_attendance(self, student_id: str, semester_id: str | None) -> dict:
        sql = ("SELECT a.*, l.subject_id, s.name AS subject, l.type, l.semester_id FROM attendance a JOIN lessons l ON l.id=a.lesson_id LEFT JOIN subjects s ON s.id=l.subject_id "
               "WHERE a.student_id=%s")
        args: list = [student_id]
        if semester_id:
            sql += " AND l.semester_id=%s"
            args.append(semester_id)
        rows = [dict(r) for r in self._q(sql + " ORDER BY a.date DESC", tuple(args))]
        per: dict[str, dict] = {}
        for r in rows:
            p = per.setdefault(r["subject_id"], {"subject_id": r["subject_id"], "subject": r["subject"], "total": 0, "present": 0, "absent": 0, "late": 0, "excused": 0})
            p["total"] += 1
            p[r["status"]] += 1
        for p in per.values():
            p["pct"] = round(100 * (p["present"] + p["late"]) / p["total"]) if p["total"] else None
        total = sum(p["total"] for p in per.values())
        attended = sum(p["present"] + p["late"] for p in per.values())
        return {"subjects": sorted(per.values(), key=lambda x: x["subject"] or ""), "recent": rows[:60], "total": total, "attended": attended,
                "pct": round(100 * attended / total) if total else None, "absent": sum(p["absent"] for p in per.values())}

    def group_attendance(self, group_id: str, subject_id: str, semester_id: str) -> dict:
        """Jurnal: guruh talabalari × sanalar (fan bo'yicha)."""
        rows = self._q(
            "SELECT a.date, a.student_id, a.status, a.note FROM attendance a JOIN lessons l ON l.id=a.lesson_id WHERE l.group_id=%s AND l.subject_id=%s AND l.semester_id=%s ORDER BY a.date",
            (group_id, subject_id, semester_id),
        )
        dates = sorted({r["date"] for r in rows})
        by_student: dict[str, dict] = {}
        for r in rows:
            by_student.setdefault(r["student_id"], {})[r["date"]] = r["status"]
        return {"dates": dates, "marks": by_student}

    # ------------------------------------------------------------------ baholar
    def add_grade(self, data: dict, teacher_id: str) -> dict:
        d = self._clean_grade(data)
        gid = _id()
        with self._tx():
            self._conn.execute(
                "INSERT INTO grades(id, student_id, subject_id, semester_id, kind, title, score, max, date, comment, teacher_id, ts) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (gid, d["student_id"], d["subject_id"], d["semester_id"], d["kind"], d["title"], d["score"], d["max"], d["date"], d["comment"], teacher_id, _now()),
            )
        return self.acad_get("grades", gid)

    @staticmethod
    def _clean_grade(data: dict) -> dict:
        d = {"student_id": _s(data.get("student_id"), 40), "subject_id": _s(data.get("subject_id"), 40), "semester_id": _s(data.get("semester_id"), 40),
             "kind": data.get("kind") if data.get("kind") in GRADE_KINDS else "current", "title": _s(data.get("title"), 160),
             "score": _float(data.get("score")), "max": _float(data.get("max"), 100) or 100, "date": _date(data.get("date")) or date.today().isoformat(), "comment": _s(data.get("comment"), 500)}
        if not (d["student_id"] and d["subject_id"] and d["semester_id"]):
            raise ValueError("missing_fields")
        if d["score"] is None or d["score"] < 0 or d["score"] > d["max"]:
            raise ValueError("invalid_score")
        return d

    def update_grade(self, gid: str, data: dict) -> dict | None:
        cur = self.acad_get("grades", gid)
        if not cur:
            return None
        d = self._clean_grade({**cur, **data})
        with self._tx():
            self._conn.execute("UPDATE grades SET kind=%s, title=%s, score=%s, max=%s, date=%s, comment=%s, ts=%s WHERE id=%s", (d["kind"], d["title"], d["score"], d["max"], d["date"], d["comment"], _now(), gid))
        return self.acad_get("grades", gid)

    def delete_grade(self, gid: str) -> None:
        with self._tx():
            self._conn.execute("DELETE FROM grades WHERE id=%s", (gid,))

    def student_grades(self, student_id: str, semester_id: str | None) -> dict:
        sql = "SELECT g.*, s.name AS subject, s.credits, s.code AS subject_code FROM grades g LEFT JOIN subjects s ON s.id=g.subject_id WHERE g.student_id=%s"
        args: list = [student_id]
        if semester_id:
            sql += " AND g.semester_id=%s"
            args.append(semester_id)
        rows = [dict(r) for r in self._q(sql + " ORDER BY g.date DESC, g.ts DESC", tuple(args))]
        return {"items": rows, "subjects": self.summarize_grades(rows)}

    @staticmethod
    def summarize_grades(rows: list[dict]) -> list[dict]:
        """Fan bo'yicha: foiz (barcha baholar yig'indisi / maksimal), 5 ballik va turlar bo'yicha kesim."""
        per: dict[str, dict] = {}
        for r in rows:
            p = per.setdefault(r["subject_id"], {"subject_id": r["subject_id"], "subject": r.get("subject"), "credits": r.get("credits"), "score": 0.0, "max": 0.0, "count": 0, "kinds": {}})
            p["score"] += float(r["score"])
            p["max"] += float(r["max"])
            p["count"] += 1
            k = p["kinds"].setdefault(r["kind"], {"score": 0.0, "max": 0.0, "count": 0})
            k["score"] += float(r["score"])
            k["max"] += float(r["max"])
            k["count"] += 1
        out = []
        for p in per.values():
            p["pct"] = round(100 * p["score"] / p["max"], 1) if p["max"] else None
            p["grade5"] = score_to_5(p["pct"])
            for k in p["kinds"].values():
                k["pct"] = round(100 * k["score"] / k["max"], 1) if k["max"] else None
            out.append(p)
        return sorted(out, key=lambda x: x["subject"] or "")

    @staticmethod
    def gpa(subjects: list[dict]) -> float | None:
        """Kreditlar bo'yicha o'rtacha (5 ballik). Kredit bo'lmasa — oddiy o'rtacha."""
        pairs = [(s["grade5"], float(s.get("credits") or 1)) for s in subjects if s.get("grade5") is not None]
        if not pairs:
            return None
        return round(sum(g * c for g, c in pairs) / sum(c for _, c in pairs), 2)

    def journal(self, group_id: str, subject_id: str, semester_id: str) -> dict:
        students = self.group_students(group_id)
        rows = [dict(r) for r in self._q("SELECT * FROM grades WHERE subject_id=%s AND semester_id=%s AND student_id IN (SELECT id FROM users WHERE group_id=%s) ORDER BY date, ts", (subject_id, semester_id, group_id))]
        by: dict[str, list] = {}
        for r in rows:
            by.setdefault(r["student_id"], []).append(r)
        for s in students:
            s["grades"] = by.get(s["id"], [])
            summ = self.summarize_grades(s["grades"])
            s["summary"] = summ[0] if summ else None
        att = self.group_attendance(group_id, subject_id, semester_id)
        for s in students:
            marks = att["marks"].get(s["id"], {})
            tot = len(marks)
            s["attendance"] = {"total": tot, "present": sum(1 for v in marks.values() if v in ("present", "late")), "pct": round(100 * sum(1 for v in marks.values() if v in ("present", "late")) / tot) if tot else None}
        return {"students": students, "attendance_dates": att["dates"], "attendance": att["marks"]}

    # ------------------------------------------------------------------ topshiriqlar
    def save_assignment(self, data: dict, teacher_id: str, aid: str | None = None) -> dict:
        d = {"subject_id": _s(data.get("subject_id"), 40), "group_id": _s(data.get("group_id"), 40), "semester_id": _s(data.get("semester_id"), 40) or None,
             "title": _s(data.get("title"), 300), "description": str(data.get("description") or "")[:20000], "due": _iso(data.get("due")),
             "max": _float(data.get("max"), 100) or 100, "attachments": json.dumps(_list(data.get("attachments")), ensure_ascii=False)}
        if not (d["subject_id"] and d["group_id"] and d["title"]):
            raise ValueError("missing_fields")
        now = _now()
        with self._tx():
            if aid and self._one("SELECT 1 FROM assignments WHERE id=%s", (aid,)):
                self._conn.execute("UPDATE assignments SET subject_id=%s, group_id=%s, semester_id=%s, title=%s, description=%s, due=%s, max=%s, attachments=%s, updated=%s WHERE id=%s",
                                   (d["subject_id"], d["group_id"], d["semester_id"], d["title"], d["description"], d["due"], d["max"], d["attachments"], now, aid))
            else:
                aid = _id()
                self._conn.execute("INSERT INTO assignments(id, subject_id, group_id, teacher_id, semester_id, title, description, due, max, attachments, created, updated) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                                   (aid, d["subject_id"], d["group_id"], teacher_id, d["semester_id"], d["title"], d["description"], d["due"], d["max"], d["attachments"], now, now))
        return self.get_assignment(aid)

    ASSIGN_SQL = ("SELECT a.*, s.name AS subject, g.name AS group_name, u.name AS teacher, "
                  "(SELECT COUNT(*) FROM submissions x WHERE x.assignment_id=a.id) AS submissions, "
                  "(SELECT COUNT(*) FROM submissions x WHERE x.assignment_id=a.id AND x.score IS NOT NULL) AS graded "
                  "FROM assignments a LEFT JOIN subjects s ON s.id=a.subject_id LEFT JOIN groups g ON g.id=a.group_id LEFT JOIN users u ON u.id=a.teacher_id")

    def get_assignment(self, aid: str) -> dict | None:
        r = self._q(self.ASSIGN_SQL + " WHERE a.id=%s", (aid,))
        if not r:
            return None
        d = dict(r[0])
        d["attachments"] = json.loads(d["attachments"] or "[]")
        return d

    def assignments(self, teacher_id: str | None = None, group_id: str | None = None, subject_id: str | None = None) -> list[dict]:
        where, args = [], []
        for col, v in (("a.teacher_id", teacher_id), ("a.group_id", group_id), ("a.subject_id", subject_id)):
            if v:
                where.append(f"{col}=%s")
                args.append(v)
        sql = self.ASSIGN_SQL + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY COALESCE(a.due, a.created) DESC"
        out = []
        for r in self._q(sql, tuple(args)):
            d = dict(r)
            d["attachments"] = json.loads(d["attachments"] or "[]")
            out.append(d)
        return out

    def delete_assignment(self, aid: str) -> None:
        with self._tx():
            self._conn.execute("DELETE FROM submissions WHERE assignment_id=%s", (aid,))
            self._conn.execute("DELETE FROM assignments WHERE id=%s", (aid,))

    def submissions(self, aid: str) -> list[dict]:
        out = []
        for r in self._q("SELECT x.*, u.name AS student FROM submissions x LEFT JOIN users u ON u.id=x.student_id WHERE x.assignment_id=%s ORDER BY x.submitted", (aid,)):
            d = dict(r)
            d["attachments"] = json.loads(d["attachments"] or "[]")
            out.append(d)
        return out

    def student_submissions(self, student_id: str) -> dict[str, dict]:
        out = {}
        for r in self._q("SELECT * FROM submissions WHERE student_id=%s", (student_id,)):
            d = dict(r)
            d["attachments"] = json.loads(d["attachments"] or "[]")
            out[d["assignment_id"]] = d
        return out

    def submit(self, aid: str, student_id: str, text: str, attachments: list) -> dict:
        with self._tx():
            self._conn.execute(
                "INSERT INTO submissions(id, assignment_id, student_id, text, attachments, submitted) VALUES(%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT(assignment_id, student_id) DO UPDATE SET text=excluded.text, attachments=excluded.attachments, submitted=excluded.submitted",
                (_id(), aid, student_id, str(text or "")[:20000], json.dumps(_list(attachments), ensure_ascii=False), _now()),
            )
        r = self._q("SELECT * FROM submissions WHERE assignment_id=%s AND student_id=%s", (aid, student_id))
        d = dict(r[0])
        d["attachments"] = json.loads(d["attachments"] or "[]")
        return d

    def grade_submission(self, sid: str, score: float | None, feedback: str, by: str) -> dict | None:
        with self._tx():
            self._conn.execute("UPDATE submissions SET score=%s, feedback=%s, graded_by=%s, graded_at=%s WHERE id=%s", (score, _s(feedback, 2000), by, _now() if score is not None else None, sid))
        r = self._q("SELECT * FROM submissions WHERE id=%s", (sid,))
        return dict(r[0]) if r else None

    # ------------------------------------------------------------------ materiallar
    def save_material(self, data: dict, teacher_id: str, mid: str | None = None) -> dict:
        d = {"subject_id": _s(data.get("subject_id"), 40), "group_id": _s(data.get("group_id"), 40) or None, "title": _s(data.get("title"), 300),
             "description": str(data.get("description") or "")[:5000], "url": _s(data.get("url"), 1000), "attachments": json.dumps(_list(data.get("attachments")), ensure_ascii=False)}
        if not (d["subject_id"] and d["title"]):
            raise ValueError("missing_fields")
        with self._tx():
            if mid and self._one("SELECT 1 FROM materials WHERE id=%s", (mid,)):
                self._conn.execute("UPDATE materials SET subject_id=%s, group_id=%s, title=%s, description=%s, url=%s, attachments=%s WHERE id=%s",
                                   (d["subject_id"], d["group_id"], d["title"], d["description"], d["url"], d["attachments"], mid))
            else:
                mid = _id()
                self._conn.execute("INSERT INTO materials(id, subject_id, group_id, teacher_id, title, description, url, attachments, created) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                                   (mid, d["subject_id"], d["group_id"], teacher_id, d["title"], d["description"], d["url"], d["attachments"], _now()))
        return self.acad_get("materials", mid)

    def materials(self, teacher_id: str | None = None, group_id: str | None = None, subject_ids: list[str] | None = None) -> list[dict]:
        sql = "SELECT m.*, s.name AS subject, g.name AS group_name, u.name AS teacher FROM materials m LEFT JOIN subjects s ON s.id=m.subject_id LEFT JOIN groups g ON g.id=m.group_id LEFT JOIN users u ON u.id=m.teacher_id WHERE 1=1"
        args: list = []
        if teacher_id:
            sql += " AND m.teacher_id=%s"
            args.append(teacher_id)
        if group_id:
            sql += " AND (m.group_id IS NULL OR m.group_id=%s)"
            args.append(group_id)
        if subject_ids is not None:
            if not subject_ids:
                return []
            sql += " AND m.subject_id = ANY(%s)"
            args.append(list(subject_ids))
        out = []
        for r in self._q(sql + " ORDER BY m.created DESC", tuple(args)):
            d = dict(r)
            d["attachments"] = json.loads(d["attachments"] or "[]")
            out.append(d)
        return out

    def delete_material(self, mid: str) -> None:
        with self._tx():
            self._conn.execute("DELETE FROM materials WHERE id=%s", (mid,))

    # ------------------------------------------------------------------ bildirishnomalar (ichki e'lonlar)
    def save_notice(self, data: dict, author_id: str, nid: str | None = None) -> dict:
        d = {"title": _s(data.get("title"), 300), "body": str(data.get("body") or "")[:10000], "audience": data.get("audience") if data.get("audience") in AUDIENCE else "all",
             "group_id": _s(data.get("group_id"), 40) or None, "pinned": int(bool(data.get("pinned")))}
        if not d["title"]:
            raise ValueError("empty_title")
        if d["audience"] == "group" and not d["group_id"]:
            raise ValueError("missing_group")
        with self._tx():
            if nid and self._one("SELECT 1 FROM notices WHERE id=%s", (nid,)):
                self._conn.execute("UPDATE notices SET title=%s, body=%s, audience=%s, group_id=%s, pinned=%s WHERE id=%s", (d["title"], d["body"], d["audience"], d["group_id"], d["pinned"], nid))
            else:
                nid = _id()
                self._conn.execute("INSERT INTO notices(id, title, body, audience, group_id, author_id, pinned, created) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
                                   (nid, d["title"], d["body"], d["audience"], d["group_id"], author_id, d["pinned"], _now()))
                note = {"id": nid, **d}
                self.db.after_commit(lambda: _notice_hook(self, note))
        return self.acad_get("notices", nid)

    def personal_notice(self, user_id: str, title: str, body: str, author_id: str | None = None, kind: str | None = None, ref: str | None = None,
                        link: str | None = None, meta: dict | None = None, push: bool = True) -> str:
        """Faqat bitta foydalanuvchiga bildirishnoma (masalan, test natijasi — o'z javob varag'i; forumda yoqtirish / javob / iqtibos).
        `kind` berilgan bildirishnomalar yuqori paneldagi qo'ng'iroqchada (o'qilmagan bo'lsa) ham ko'rinadi; `meta` — matnni
        foydalanuvchi tilida chiqarish uchun (kim, qaysi mavzu), `link` — bosilganda ochiladigan sahifa."""
        self._ensure_notice_user()
        nid = _id()
        with self._tx():
            self._conn.execute("INSERT INTO notices(id, title, body, audience, group_id, author_id, pinned, created, user_id, kind, ref, link, meta) "
                               "VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                               (nid, title[:300], body[:10000], "user", None, author_id, 0, _now(), user_id, kind, ref, link,
                                json.dumps(meta, ensure_ascii=False) if meta else None))
            if push:  # bog'langan Telegram chatiga ham (tranzaksiya yakunlangach, fon navbatida)
                note = {"id": nid, "title": title[:300], "body": body[:10000], "audience": "user", "user_id": user_id, "kind": kind, "link": link}
                self.db.after_commit(lambda: _notice_hook(self, note))
        return nid

    def _ensure_notice_user(self) -> None:
        if getattr(self, "_notice_user_ok", False):
            return
        self.add_column("notices", "user_id", "TEXT")
        # shaxsiy bildirishnomalar: turi (forum: blog_like / blog_comment / blog_quote), manba (yozuv id), havola, matn uchun ma'lumot, o'qilganmi
        self.add_column("notices", "kind", "TEXT")
        self.add_column("notices", "ref", "TEXT")
        self.add_column("notices", "link", "TEXT")
        self.add_column("notices", "meta", "TEXT")
        self.add_column("notices", "seen", "BIGINT NOT NULL DEFAULT 0")
        self._conn.execute("CREATE INDEX IF NOT EXISTS ix_notices_user ON notices(user_id, seen, created)")
        self._notice_user_ok = True

    @staticmethod
    def _notice(r) -> dict:
        n = dict(r)
        if "meta" in n:
            try:
                n["meta"] = json.loads(n["meta"]) if n.get("meta") else None
            except ValueError:
                n["meta"] = None
        if "seen" in n:
            n["seen"] = bool(n["seen"])
        return n

    def notices_for(self, role: str, group_id: str | None = None, author_id: str | None = None, limit: int = 100, user_id: str | None = None,
                    personal_kinds: bool = True) -> list[dict]:
        """`personal_kinds=False` — forum kabi avtomatik shaxsiy bildirishnomalarsiz (bosh sahifadagi «so'nggi e'lonlar», qidiruv)."""
        self._ensure_notice_user()
        sql = "SELECT n.*, u.name AS author, g.name AS group_name FROM notices n LEFT JOIN users u ON u.id=n.author_id LEFT JOIN groups g ON g.id=n.group_id WHERE "
        args: list = []
        if author_id:
            # o'qituvchining «yuborganlarim» ro'yxati: forumdagi harakatlari (yoqtirish, javob) boshqa birovga borgan bildirishnoma — unga tegishli emas
            sql += "n.author_id=%s AND n.kind IS NULL"
            args.append(author_id)
        elif role == "student":
            sql += "(n.audience IN ('all','students') OR (n.audience='group' AND n.group_id=%s) OR (n.audience='user' AND n.user_id=%s))"
            args += [group_id or "", user_id or "-"]
        elif role == "teacher":
            sql += "(n.audience IN ('all','teachers') OR n.author_id=%s OR (n.audience='user' AND n.user_id=%s))"
            args += [author_id or "-", user_id or "-"]
        elif role == "staff":
            sql += "(n.audience IN ('all','staff') OR (n.audience='user' AND n.user_id=%s))"
            args.append(user_id or "-")
        else:
            sql += "n.audience != 'user'"
        if not personal_kinds:
            sql += " AND n.kind IS NULL"
        sql += " ORDER BY n.pinned DESC, n.created DESC LIMIT %s"
        return [self._notice(r) for r in self._q(sql, (*args, limit))]

    def notifications(self, user_id: str, limit: int = 15) -> dict:
        """Qo'ng'iroqcha: foydalanuvchining o'qilmagan avtomatik bildirishnomalari (eng yangilari) va jami soni."""
        self._ensure_notice_user()
        rows = self._q("SELECT n.*, u.name AS author FROM notices n LEFT JOIN users u ON u.id=n.author_id "
                       "WHERE n.audience='user' AND n.user_id=%s AND n.kind IS NOT NULL AND n.seen=0 ORDER BY n.created DESC LIMIT %s", (user_id, limit))
        n = self._one("SELECT COUNT(*) FROM notices WHERE audience='user' AND user_id=%s AND kind IS NOT NULL AND seen=0", (user_id,)) or 0
        return {"items": [self._notice(r) for r in rows], "unread": int(n)}

    def notifications_seen(self, user_id: str, ids: list[str] | None = None) -> int:
        """O'qildi deb belgilash: `ids` berilmasa — hammasi. Faqat o'z bildirishnomalari."""
        self._ensure_notice_user()
        with self._tx():
            if ids is None:
                cur = self._conn.execute("UPDATE notices SET seen=1 WHERE audience='user' AND user_id=%s AND seen=0", (user_id,))
            else:
                cur = self._conn.execute("UPDATE notices SET seen=1 WHERE audience='user' AND user_id=%s AND id = ANY(%s)", (user_id, list(ids)[:200]))
        return cur.rowcount

    def delete_notice(self, nid: str) -> None:
        with self._tx():
            self._conn.execute("DELETE FROM notices WHERE id=%s", (nid,))

    # ------------------------------------------------------------------ hisobotlar
    def academic_counts(self) -> dict:
        one = self._one
        return {
            "students": int(one("SELECT COUNT(*) FROM users WHERE role='student' AND active=1") or 0),
            "teachers": int(one("SELECT COUNT(*) FROM users WHERE role='teacher' AND active=1") or 0),
            "groups": int(one("SELECT COUNT(*) FROM groups") or 0),
            "subjects": int(one("SELECT COUNT(*) FROM subjects") or 0),
            "rooms": int(one("SELECT COUNT(*) FROM rooms") or 0),
            "lessons": int(one("SELECT COUNT(*) FROM lessons l JOIN semesters s ON s.id=l.semester_id WHERE s.current=1") or 0),
            "assignments": int(one("SELECT COUNT(*) FROM assignments") or 0),
            "attendance_today": int(one("SELECT COUNT(*) FROM attendance WHERE date=%s", (date.today().isoformat(),)) or 0),
        }
