"""Telegram bot: talaba kabineti (bitta bot — «Virtual qabulxona» boti).

Bog'lash (talaba kim ekanini botga bildirish) — parol hech qachon botda so'ralmaydi:
  * kabinetdagi «Telegram'ni ulash» → `t.me/<bot>?start=link_<token>` (bir martalik, 10 daqiqa, foydalanuvchiga bog'langan);
  * zaxira: kabinetdagi 6 xonali kod (10 daqiqa) → botda «🎓 Talaba sifatida kirish» → «Kod bilan» (chat bo'yicha 15 daqiqada 5 urinish);
  * ixtiyoriy: «Raqam orqali» — Telegram tasdiqlagan o'z raqami (`contact.user_id` = yuboruvchi) profildagi telefon bilan solishtiriladi.
  Har uchala yo'lda bot «Siz: <F.I.Sh.>, <guruh>. Tasdiqlaysizmi?» deb so'raydi; tasdiqlangach chat foydalanuvchiga bog'lanadi.
  Bir foydalanuvchiga bitta Telegram: yangisi ulansa eskisi uziladi (eski chatga xabar boriladi). Uzish — kabinetda yoki bot sozlamalarida.

Bog'langan talaba menyusi (hammasi inline tugmalar; navigatsiya chatdagi yagona panel xabarini tahrirlaydi — telegram.Bot.panel;
yozilgan kod va kontakt o'chiriladi): Bugun, Dars jadvali (kun ◀️ ▶️ / hafta),
Bildirishnomalar, Baholar va davomat, Testlar (faqat ro'yxat + saytda ochish), Kutubxona, Forum, Murojaat, Sozlamalar.
Avtomatik xabarlar (Asia/Tashkent): ertalabki xulosa, ixtiyoriy kechki «ertaga», darsdan 10 daqiqa oldin eslatma, yangi bildirishnoma,
yangi ochilgan test, guruh jadvalidagi o'zgarish. Har bir avtomatik xabar `tg_sent` jadvalidagi kalit bilan bir marta yuboriladi
(INSERT … ON CONFLICT DO NOTHING — bir nechta server jarayonida ham, qayta ishga tushganda ham takrorlanmaydi).
Talaba ma'lumotlari faqat shaxsiy chatda ko'rsatiladi (guruh/kanal yangilanishlariga bot javob bermaydi).
"""
from __future__ import annotations

import hashlib
import json
import queue
import re
import secrets
import sys
import threading
import time
from datetime import date, datetime, timedelta, timezone

from .storage import local_now

LINK_TTL = 600  # soniya
CODE_TRIES, CODE_WINDOW = 5, 900
MORNING_TIMES = ("06:30", "07:00", "07:30", "08:00", "08:30")
EVENING_TIME = "20:00"
REMIND_MIN = 10
PAGE = 5
SYNC = False  # testlar: navbatsiz, darhol yuborish


def now() -> datetime:
    """Toshkent vaqti (testlarda almashtiriladi)."""
    return local_now()


def esc(v) -> str:
    return str(v if v is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ================================================================== matnlar
S: dict[str, dict] = {
    "uz": {
        "login": "🎓 Talaba sifatida kirish", "login_t": "🎓 <b>Talaba sifatida kirish</b>\n\nKabinetda: Profil → Telegram → «Telegram'ni ulash».\nYoki u yerdagi 6 xonali kodni kiriting.",
        "by_code": "🔢 Kod bilan", "by_phone": "📱 Raqam orqali", "ask_code": "Kabinetdagi 6 xonali kodni yozing:",
        "bad_code": "Kod noto‘g‘ri yoki muddati o‘tgan.", "code_limit": "Urinishlar ko‘p. {m} daqiqadan so‘ng qayta urinib ko‘ring.",
        "ask_phone": "Pastdagi «📱 Raqamni yuborish» tugmasini bosing.", "send_phone": "📱 Raqamni yuborish",
        "phone_foreign": "Faqat o‘zingizning raqamingizni yuboring.",
        "phone_none": "Bu raqam bo‘yicha talaba topilmadi. Kabinetdan ulang: Profil → Telegram.",
        "link_bad": "Havola eskirgan yoki ishlatilgan. Kabinetdan yangisini oling.",
        "confirm": "Siz: <b>{name}</b>, {group}. Tasdiqlaysizmi?", "yes_me": "✅ Ha, bu men", "cancel": "Bekor qilish",
        "linked": "✅ Telegram ulandi.", "aborted": "Bekor qilindi.",
        "moved_away": "🔌 Bu chat {name} hisobidan uzildi: boshqa Telegram akkaunt ulandi.", "unlinked": "🔌 Telegram uzildi.",
        "home": "🎓 <b>{name}</b>\n{group} · {date}",
        "b_today": "📅 Bugun", "b_sched": "🗓 Dars jadvali", "b_notif": "🔔 Bildirishnomalar", "b_grades": "📊 Baholar va davomat",
        "b_tests": "📝 Testlar", "b_lib": "📚 Kutubxona", "b_forum": "💬 Forum", "b_desk": "✉️ Murojaat", "b_set": "⚙️ Sozlamalar",
        "b_menu": "🏠 Menyu", "b_week": "🗓 Hafta", "b_day": "📅 Kun", "b_now": "Bugun", "b_open": "🌐 Saytda ochish",
        "today_t": "📅 <b>Bugun · {date}</b>", "tomorrow_t": "🌙 <b>Ertaga · {date}</b>", "day_t": "🗓 <b>{date}</b>",
        "week_t": "🗓 <b>{a} – {b}</b> · {n}-hafta", "no_lessons": "Dars yo‘q.", "unpublished": "Dars jadvali hali e’lon qilinmagan.",
        "no_group": "Siz guruhga biriktirilmagansiz.", "plans": "🗒 <b>Rejalar</b>", "deadline": "📌 Topshiriq muddati: {title}",
        "cancelled": "bekor qilindi", "changed": "o‘zgardi",
        "notif_t": "🔔 <b>Bildirishnomalar</b>", "notif_none": "Bildirishnomalar yo‘q.",
        "grades_t": "📊 <b>Baholar va davomat</b>", "gpa": "GPA: <b>{v}</b>", "att_all": "Davomat: <b>{v}%</b>",
        "g_line": "Baho: {pct}% ({g5})", "a_line": "Davomat: {pct}%, qoldirilgan: {n}", "grades_none": "Hali baho va davomat yo‘q.",
        "tests_t": "📝 <b>Sizga ochiq testlar</b>", "tests_none": "Hozir sizga ochiq test yo‘q.", "tests_note": "Testlar faqat saytda yechiladi.",
        "q_n": "{n} ta savol", "min_n": "{n} daqiqa", "no_limit": "vaqt cheklanmagan", "until": "{d} gacha", "in_progress": "boshlangan",
        "new_test": "📝 <b>Yangi test ochildi</b>\n{title}",
        "lib_t": "📚 <b>Kutubxona</b>", "loans": "<b>Qo‘lingizdagi kitoblar</b>", "due": "{d} gacha", "overdue": "⚠️ muddati o‘tgan",
        "res": "<b>Bronlar</b>", "res_ready": "✅ tayyor · {d} gacha oling", "res_wait": "navbat: {n}", "lib_none": "Kutubxonadan olingan kitob yo‘q.",
        "desk_t": "✉️ <b>Murojaat</b>\nSavol, taklif yoki ariza — mas’ul xodim javob beradi.",
        "set_t": "⚙️ <b>Sozlamalar</b>", "s_lang": "🌐 Til: {v}", "s_morning": "☀️ Ertalabki xabar: {v}", "s_evening": "🌙 Kechki xabar (ertangi kun): {v}",
        "s_remind": "⏰ Darsdan 10 daqiqa oldin eslatma: {v}", "s_tg": "🔗 Telegram: {v}", "on": "yoqilgan", "off": "o‘chirilgan",
        "bt_lang": "🌐 Til", "bt_morning": "Ertalab", "bt_evening": "Kechqurun", "bt_remind": "Eslatma", "bt_unlink": "🔌 Telegram'ni uzish",
        "time_t": "☀️ Ertalabki xabar vaqti:", "unlink_q": "Telegram uzilsinmi? Bot sizga shaxsiy ma’lumot yubormaydi.", "unlink_yes": "🔌 Ha, uzish",
        "morning": "☀️ <b>Xayrli tong, {name}!</b>\n{date}", "remind": "⏰ <b>{n} daqiqadan so‘ng dars</b>",
        "sched_change": "🔄 <b>Dars jadvali o‘zgardi</b>", "ch_add": "qo‘shildi", "ch_del": "bekor qilindi", "ch_move": "ko‘chirildi",
        "only_students": "Bu bo‘lim talabalar uchun.",
        "types": {"lecture": "Ma’ruza", "practice": "Amaliy", "lab": "Laboratoriya", "seminar": "Seminar", "exam": "Imtihon", "consult": "Konsultatsiya", "other": "Mashg‘ulot"},
        "wd": ("Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"), "wds": ("Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"),
        "mon": ("yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"),
        "role": {"student": "talaba", "teacher": "professor-o‘qituvchi", "staff": "xodim", "admin": "administrator"},
    },
    "ru": {
        "login": "🎓 Войти как студент", "login_t": "🎓 <b>Вход для студента</b>\n\nВ кабинете: Профиль → Telegram → «Подключить Telegram».\nИли введите 6-значный код оттуда.",
        "by_code": "🔢 По коду", "by_phone": "📱 По номеру", "ask_code": "Введите 6-значный код из кабинета:",
        "bad_code": "Неверный или просроченный код.", "code_limit": "Слишком много попыток. Повторите через {m} мин.",
        "ask_phone": "Нажмите кнопку «📱 Отправить номер» внизу.", "send_phone": "📱 Отправить номер",
        "phone_foreign": "Отправьте только свой собственный номер.",
        "phone_none": "Студент с этим номером не найден. Подключите в кабинете: Профиль → Telegram.",
        "link_bad": "Ссылка устарела или уже использована. Получите новую в кабинете.",
        "confirm": "Вы: <b>{name}</b>, {group}. Подтверждаете?", "yes_me": "✅ Да, это я", "cancel": "Отмена",
        "linked": "✅ Telegram подключён.", "aborted": "Отменено.",
        "moved_away": "🔌 Этот чат отключён от аккаунта {name}: подключён другой Telegram.", "unlinked": "🔌 Telegram отключён.",
        "home": "🎓 <b>{name}</b>\n{group} · {date}",
        "b_today": "📅 Сегодня", "b_sched": "🗓 Расписание", "b_notif": "🔔 Уведомления", "b_grades": "📊 Оценки и посещаемость",
        "b_tests": "📝 Тесты", "b_lib": "📚 Библиотека", "b_forum": "💬 Форум", "b_desk": "✉️ Обращение", "b_set": "⚙️ Настройки",
        "b_menu": "🏠 Меню", "b_week": "🗓 Неделя", "b_day": "📅 День", "b_now": "Сегодня", "b_open": "🌐 Открыть на сайте",
        "today_t": "📅 <b>Сегодня · {date}</b>", "tomorrow_t": "🌙 <b>Завтра · {date}</b>", "day_t": "🗓 <b>{date}</b>",
        "week_t": "🗓 <b>{a} – {b}</b> · {n}-я неделя", "no_lessons": "Занятий нет.", "unpublished": "Расписание ещё не опубликовано.",
        "no_group": "Вы не прикреплены к группе.", "plans": "🗒 <b>Планы</b>", "deadline": "📌 Срок задания: {title}",
        "cancelled": "отменено", "changed": "изменено",
        "notif_t": "🔔 <b>Уведомления</b>", "notif_none": "Уведомлений нет.",
        "grades_t": "📊 <b>Оценки и посещаемость</b>", "gpa": "GPA: <b>{v}</b>", "att_all": "Посещаемость: <b>{v}%</b>",
        "g_line": "Оценка: {pct}% ({g5})", "a_line": "Посещаемость: {pct}%, пропуски: {n}", "grades_none": "Оценок и посещаемости пока нет.",
        "tests_t": "📝 <b>Открытые для вас тесты</b>", "tests_none": "Сейчас открытых тестов нет.", "tests_note": "Тесты решаются только на сайте.",
        "q_n": "вопросов: {n}", "min_n": "{n} мин", "no_limit": "без ограничения", "until": "до {d}", "in_progress": "начат",
        "new_test": "📝 <b>Открыт новый тест</b>\n{title}",
        "lib_t": "📚 <b>Библиотека</b>", "loans": "<b>Книги на руках</b>", "due": "до {d}", "overdue": "⚠️ просрочено",
        "res": "<b>Брони</b>", "res_ready": "✅ готово · заберите до {d}", "res_wait": "очередь: {n}", "lib_none": "Книг на руках нет.",
        "desk_t": "✉️ <b>Обращение</b>\nВопрос, предложение или заявление — ответственный сотрудник ответит.",
        "set_t": "⚙️ <b>Настройки</b>", "s_lang": "🌐 Язык: {v}", "s_morning": "☀️ Утренняя сводка: {v}", "s_evening": "🌙 Вечерняя сводка (на завтра): {v}",
        "s_remind": "⏰ Напоминание за 10 минут до занятия: {v}", "s_tg": "🔗 Telegram: {v}", "on": "вкл.", "off": "выкл.",
        "bt_lang": "🌐 Язык", "bt_morning": "Утро", "bt_evening": "Вечер", "bt_remind": "Напоминание", "bt_unlink": "🔌 Отключить Telegram",
        "time_t": "☀️ Время утренней сводки:", "unlink_q": "Отключить Telegram? Бот перестанет присылать личные данные.", "unlink_yes": "🔌 Да, отключить",
        "morning": "☀️ <b>Доброе утро, {name}!</b>\n{date}", "remind": "⏰ <b>Занятие через {n} минут</b>",
        "sched_change": "🔄 <b>Изменение в расписании</b>", "ch_add": "добавлено", "ch_del": "отменено", "ch_move": "перенесено",
        "only_students": "Этот раздел — для студентов.",
        "types": {"lecture": "Лекция", "practice": "Практика", "lab": "Лабораторная", "seminar": "Семинар", "exam": "Экзамен", "consult": "Консультация", "other": "Занятие"},
        "wd": ("Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"), "wds": ("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"),
        "mon": ("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"),
        "role": {"student": "студент", "teacher": "преподаватель", "staff": "сотрудник", "admin": "администратор"},
    },
    "en": {
        "login": "🎓 Sign in as a student", "login_t": "🎓 <b>Student sign-in</b>\n\nIn your portal: Profile → Telegram → “Connect Telegram”.\nOr enter the 6-digit code shown there.",
        "by_code": "🔢 With a code", "by_phone": "📱 With my number", "ask_code": "Enter the 6-digit code from your portal:",
        "bad_code": "The code is wrong or has expired.", "code_limit": "Too many attempts. Try again in {m} min.",
        "ask_phone": "Press “📱 Send my number” below.", "send_phone": "📱 Send my number",
        "phone_foreign": "Please send your own number only.",
        "phone_none": "No student found with this number. Connect from your portal: Profile → Telegram.",
        "link_bad": "The link has expired or was already used. Get a new one in your portal.",
        "confirm": "You are <b>{name}</b>, {group}. Confirm?", "yes_me": "✅ Yes, it’s me", "cancel": "Cancel",
        "linked": "✅ Telegram connected.", "aborted": "Cancelled.",
        "moved_away": "🔌 This chat was disconnected from {name}: another Telegram account was connected.", "unlinked": "🔌 Telegram disconnected.",
        "home": "🎓 <b>{name}</b>\n{group} · {date}",
        "b_today": "📅 Today", "b_sched": "🗓 Timetable", "b_notif": "🔔 Notifications", "b_grades": "📊 Grades & attendance",
        "b_tests": "📝 Tests", "b_lib": "📚 Library", "b_forum": "💬 Forum", "b_desk": "✉️ Requests", "b_set": "⚙️ Settings",
        "b_menu": "🏠 Menu", "b_week": "🗓 Week", "b_day": "📅 Day", "b_now": "Today", "b_open": "🌐 Open on the website",
        "today_t": "📅 <b>Today · {date}</b>", "tomorrow_t": "🌙 <b>Tomorrow · {date}</b>", "day_t": "🗓 <b>{date}</b>",
        "week_t": "🗓 <b>{a} – {b}</b> · week {n}", "no_lessons": "No classes.", "unpublished": "The timetable has not been published yet.",
        "no_group": "You are not assigned to a group.", "plans": "🗒 <b>Plans</b>", "deadline": "📌 Assignment due: {title}",
        "cancelled": "cancelled", "changed": "changed",
        "notif_t": "🔔 <b>Notifications</b>", "notif_none": "No notifications.",
        "grades_t": "📊 <b>Grades & attendance</b>", "gpa": "GPA: <b>{v}</b>", "att_all": "Attendance: <b>{v}%</b>",
        "g_line": "Grade: {pct}% ({g5})", "a_line": "Attendance: {pct}%, missed: {n}", "grades_none": "No grades or attendance yet.",
        "tests_t": "📝 <b>Tests open to you</b>", "tests_none": "No tests are open to you right now.", "tests_note": "Tests can only be taken on the website.",
        "q_n": "{n} questions", "min_n": "{n} min", "no_limit": "no time limit", "until": "until {d}", "in_progress": "started",
        "new_test": "📝 <b>A new test is open</b>\n{title}",
        "lib_t": "📚 <b>Library</b>", "loans": "<b>Books on loan</b>", "due": "due {d}", "overdue": "⚠️ overdue",
        "res": "<b>Reservations</b>", "res_ready": "✅ ready · pick up by {d}", "res_wait": "queue: {n}", "lib_none": "You have no books on loan.",
        "desk_t": "✉️ <b>Requests</b>\nA question, suggestion or application — the responsible staff member will reply.",
        "set_t": "⚙️ <b>Settings</b>", "s_lang": "🌐 Language: {v}", "s_morning": "☀️ Morning summary: {v}", "s_evening": "🌙 Evening summary (tomorrow): {v}",
        "s_remind": "⏰ Reminder 10 minutes before class: {v}", "s_tg": "🔗 Telegram: {v}", "on": "on", "off": "off",
        "bt_lang": "🌐 Language", "bt_morning": "Morning", "bt_evening": "Evening", "bt_remind": "Reminder", "bt_unlink": "🔌 Disconnect Telegram",
        "time_t": "☀️ Morning summary time:", "unlink_q": "Disconnect Telegram? The bot will stop sending your personal data.", "unlink_yes": "🔌 Yes, disconnect",
        "morning": "☀️ <b>Good morning, {name}!</b>\n{date}", "remind": "⏰ <b>Class in {n} minutes</b>",
        "sched_change": "🔄 <b>Timetable change</b>", "ch_add": "added", "ch_del": "cancelled", "ch_move": "moved",
        "only_students": "This section is for students.",
        "types": {"lecture": "Lecture", "practice": "Practice", "lab": "Lab", "seminar": "Seminar", "exam": "Exam", "consult": "Consultation", "other": "Class"},
        "wd": ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"), "wds": ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"),
        "mon": ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"),
        "role": {"student": "student", "teacher": "professor", "staff": "staff", "admin": "administrator"},
    },
}
LANG_NAMES = {"uz": "O‘zbekcha", "ru": "Русский", "en": "English"}


def tx(lang: str) -> dict:
    return S.get(lang or "uz", S["uz"])


def fmt_date(d: date, lang: str) -> str:
    L = tx(lang)
    if lang == "uz" or lang not in S:
        return f"{L['wd'][d.weekday()]}, {d.day}-{L['mon'][d.month - 1]}"
    return f"{L['wd'][d.weekday()]}, {d.day} {L['mon'][d.month - 1]}"


def short_date(d: date, lang: str) -> str:
    return f"{tx(lang)['wds'][d.weekday()]}, {d:%d.%m}"


def _dt_local(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        v = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return str(iso)[:16]
    if v.tzinfo:
        v = v.astimezone(now().tzinfo)
    return v.strftime("%d.%m %H:%M") if (v.hour or v.minute) else v.strftime("%d.%m")


# ================================================================== sxema va bog'lash
_SCHEMA: set[int] = set()


def ensure_schema(st) -> None:
    if id(st) in _SCHEMA:
        return
    with st._tx() as c:  # noqa: SLF001
        c.execute("CREATE TABLE IF NOT EXISTS tg_links (user_id TEXT PRIMARY KEY, chat_id TEXT NOT NULL UNIQUE, tg_user TEXT, linked TEXT NOT NULL, "
                  "morning BIGINT NOT NULL DEFAULT 1, morning_time TEXT NOT NULL DEFAULT '07:30', evening BIGINT NOT NULL DEFAULT 0, "
                  "remind BIGINT NOT NULL DEFAULT 0)")
        c.execute("CREATE TABLE IF NOT EXISTS tg_link_tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, expires TEXT NOT NULL, "
                  "used BIGINT NOT NULL DEFAULT 0, created TEXT NOT NULL)")
        c.execute("CREATE INDEX IF NOT EXISTS ix_tg_link_tokens_user ON tg_link_tokens(user_id)")
        c.execute("CREATE TABLE IF NOT EXISTS tg_sent (key TEXT PRIMARY KEY, created TEXT NOT NULL)")
    _SCHEMA.add(id(st))
    _migrate_lib(st)


def _migrate_lib(st) -> None:
    """Kutubxonaning avvalgi alohida Telegram ulanishlari (lib_prefs.tg_chat — shu botning o'zi) umumiy bog'lanishga o'tkaziladi (bir marta)."""
    if st.kv_get("tg_links_migrated") or "tg_chat" not in st.columns("lib_prefs"):
        return
    with st._tx() as c:  # noqa: SLF001
        for r in c.execute("SELECT user_id, tg_chat FROM lib_prefs WHERE tg_chat IS NOT NULL AND tg_chat<>''").fetchall():
            c.execute("INSERT INTO tg_links(user_id, chat_id, tg_user, linked) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                      (r["user_id"], str(r["tg_chat"]), "{}", _utc()))
    st.kv_put("tg_links_migrated", True)


def _h(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


def issue(st, uid: str) -> dict:
    """Bir martalik havola tokeni va 6 xonali kod (ikkalasi 10 daqiqa; biri ishlatilsa — ikkinchisi ham bekor)."""
    ensure_schema(st)
    tok = secrets.token_urlsafe(18).replace("-", "x").replace("_", "y")
    exp = (datetime.now(timezone.utc) + timedelta(seconds=LINK_TTL)).isoformat(timespec="seconds")
    with st._tx() as c:  # noqa: SLF001
        c.execute("DELETE FROM tg_link_tokens WHERE user_id=%s OR expires<%s", (uid, _utc()))
        c.execute("INSERT INTO tg_link_tokens(token, user_id, kind, expires, created) VALUES(%s,%s,'link',%s,%s)", ("t:" + _h(tok), uid, exp, _utc()))
        code = ""
        for _ in range(30):
            code = f"{secrets.randbelow(1_000_000):06d}"
            if c.execute("INSERT INTO tg_link_tokens(token, user_id, kind, expires, created) VALUES(%s,%s,'code',%s,%s) ON CONFLICT DO NOTHING",
                         ("c:" + code, uid, exp, _utc())).rowcount:
                break
    return {"token": tok, "code": code, "expires": exp, "ttl": LINK_TTL}


def redeem(st, kind: str, value: str) -> str | None:
    """Token / kodni ishlatish (bir marta): foydalanuvchi id yoki None. Juftligi ham bekor qilinadi."""
    ensure_schema(st)
    key = ("t:" + _h(value)) if kind == "link" else ("c:" + value)
    with st._tx() as c:  # noqa: SLF001
        r = c.execute("UPDATE tg_link_tokens SET used=1 WHERE token=%s AND kind=%s AND used=0 AND expires>%s RETURNING user_id",
                      (key, kind, _utc())).fetchone()
        if not r:
            return None
        c.execute("UPDATE tg_link_tokens SET used=1 WHERE user_id=%s", (r["user_id"],))
    return r["user_id"]


def pending(st, uid: str) -> bool:
    ensure_schema(st)
    return bool(st._one("SELECT 1 FROM tg_link_tokens WHERE user_id=%s AND used=0 AND expires>%s LIMIT 1", (uid, _utc())))  # noqa: SLF001


def _link_row(r) -> dict:
    d = dict(r)
    d["tg_user"] = json.loads(d.get("tg_user") or "{}")
    for k in ("morning", "evening", "remind"):
        d[k] = bool(d[k])
    return d


def link_of(st, uid: str) -> dict | None:
    ensure_schema(st)
    r = st._q("SELECT * FROM tg_links WHERE user_id=%s", (uid,))  # noqa: SLF001
    return _link_row(r[0]) if r else None


def link_by_chat(st, chat_id) -> dict | None:
    ensure_schema(st)
    r = st._q("SELECT * FROM tg_links WHERE chat_id=%s", (str(chat_id),))  # noqa: SLF001
    return _link_row(r[0]) if r else None


def link(st, uid: str, chat_id, tg_user: dict) -> str | None:
    """Chatni foydalanuvchiga bog'lash. Qaytaradi: uzilgan eski chat (boshqa Telegram akkaunti) yoki None."""
    ensure_schema(st)
    cid = str(chat_id)
    old = link_of(st, uid)
    has_lib = "tg_chat" in st.columns("lib_prefs")
    with st._tx() as c:  # noqa: SLF001
        c.execute("DELETE FROM tg_links WHERE chat_id=%s AND user_id<>%s", (cid, uid))  # bu chat boshqa hisobga bog'langan edi
        c.execute("INSERT INTO tg_links(user_id, chat_id, tg_user, linked) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id) DO UPDATE SET "
                  "chat_id=excluded.chat_id, tg_user=excluded.tg_user, linked=excluded.linked",
                  (uid, cid, json.dumps(tg_user or {}, ensure_ascii=False), _utc()))
        if has_lib:  # kutubxona bildirishnomalari — shu chatga (avvalgi alohida ulanish bilan bir xil ustun)
            c.execute("UPDATE lib_prefs SET tg_chat=NULL WHERE tg_chat=%s AND user_id<>%s", (cid, uid))
            r = c.execute("SELECT channels FROM lib_prefs WHERE user_id=%s", (uid,)).fetchone()
            ch = json.loads(r["channels"]) if r and r["channels"] else ["inapp", "email"]
            ch = list(dict.fromkeys([*ch, "telegram"]))
            c.execute("INSERT INTO lib_prefs(user_id, channels, tg_chat, updated) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id) DO UPDATE SET "
                      "channels=excluded.channels, tg_chat=excluded.tg_chat, tg_token=NULL, updated=excluded.updated", (uid, json.dumps(ch), cid, _utc()))
    _preclaim_tests(st, uid)
    return old["chat_id"] if old and old["chat_id"] != cid else None


def unlink(st, uid: str) -> str | None:
    ensure_schema(st)
    old = link_of(st, uid)
    with st._tx() as c:  # noqa: SLF001
        c.execute("DELETE FROM tg_links WHERE user_id=%s", (uid,))
        if "tg_chat" in st.columns("lib_prefs"):
            c.execute("UPDATE lib_prefs SET tg_chat=NULL WHERE user_id=%s", (uid,))
    return old["chat_id"] if old else None


def set_prefs(st, uid: str, **kw) -> None:
    sets = {k: (int(bool(v)) if k in ("morning", "evening", "remind") else v) for k, v in kw.items() if k in ("morning", "morning_time", "evening", "remind")}
    if not sets:
        return
    with st._tx() as c:  # noqa: SLF001
        c.execute(f"UPDATE tg_links SET {', '.join(k + '=%s' for k in sets)} WHERE user_id=%s", (*sets.values(), uid))


def claim(st, key: str) -> bool:
    """Bir martalik yuborish: True — birinchi marta (yuborish kerak). Bir nechta jarayonda ham faqat bittasi oladi."""
    ensure_schema(st)
    with st._tx() as c:  # noqa: SLF001
        return bool(c.execute("INSERT INTO tg_sent(key, created) VALUES(%s,%s) ON CONFLICT DO NOTHING", (key[:200], _utc())).rowcount)


def public(st, uid: str) -> dict | None:
    """Kabinet kartasi uchun: ulangan Telegram (ism, @username, sana)."""
    ln = link_of(st, uid)
    if not ln:
        return None
    u = ln["tg_user"] or {}
    name = " ".join(x for x in (u.get("first_name"), u.get("last_name")) if x).strip()
    return {"name": name, "username": u.get("username") or "", "linked": ln["linked"]}


# ================================================================== telefon raqami bo'yicha topish
def digits(v) -> str:
    return re.sub(r"\D", "", str(v or ""))


def _phones(u: dict) -> list[str]:
    d = u.get("data") or {}
    vals = [d.get("phone"), (d.get("hemis") or {}).get("phone") if isinstance(d.get("hemis"), dict) else None]
    return [digits(x) for x in vals if digits(x)]


def same_phone(a: str, b: str) -> bool:
    a, b = digits(a), digits(b)
    if len(a) < 7 or len(b) < 7:
        return False
    return a == b or (len(a) >= 9 and len(b) >= 9 and a[-9:] == b[-9:])


def find_by_phone(st, phone: str) -> list[dict]:
    """Profildagi telefon (users.data.phone, HEMIS profilida bo'lsa — hemis.phone) bo'yicha faol talabalar."""
    rows = st._q("SELECT * FROM users WHERE role='student' AND active=1 AND data LIKE %s", ("%phone%",))  # noqa: SLF001
    out = []
    for r in rows:
        u = st._user(r)  # noqa: SLF001
        if any(same_phone(p, phone) for p in _phones(u)):
            out.append(u)
    return out


# ================================================================== ma'lumotlar
def _group_name(st, u: dict) -> str:
    g = st.acad_get("groups", u["group_id"]) if u.get("group_id") else None
    return (g or {}).get("name") or ""


def who(st, u: dict, lang: str) -> str:
    g = _group_name(st, u) if u.get("role") == "student" else ""
    return g or tx(lang)["role"].get(u.get("role") or "", u.get("role") or "")


def week_of(st, u: dict, d: date, cache: dict | None = None) -> tuple[dict | None, str]:
    """Guruhning shu sana haftasi (portal bilan bir xil: joriy semestr, e'lon qilingan bo'lsa)."""
    sem = st.current_semester()
    if not sem or not sem.get("published"):
        return None, "unpublished"
    if not u.get("group_id"):
        return None, "no_group"
    monday = d - timedelta(days=d.weekday())
    key = (u["group_id"], monday)
    if cache is not None and key in cache:
        return cache[key], ""
    wk = st.week_schedule(sem, monday, group_id=u["group_id"])
    if cache is not None:
        cache[key] = wk
    return wk, ""


def day_lessons(st, u: dict, d: date, cache: dict | None = None) -> tuple[list[dict] | None, str]:
    wk, why = week_of(st, u, d, cache)
    if wk is None:
        return None, why
    return next((x["lessons"] for x in wk["days"] if x["date"] == d.isoformat()), []), ""


def _comm(st):
    try:
        from .api.community import comm  # noqa: PLC0415

        return comm()
    except Exception:  # noqa: BLE001
        from .community import Community  # noqa: PLC0415

        return Community(st)


def plans(st, u: dict, d: date) -> list[str]:
    """Kalendardagi o'z rejalari (shu kunni qamraydigan) va guruh topshiriqlari muddati."""
    ds = d.isoformat()
    out = []
    try:
        for e in _comm(st).events(u["id"], ds, ds):
            tm = "–".join(x for x in (e.get("time_from"), e.get("time_to")) if x)
            mark = "✅ " if e.get("done") else ""
            out.append(f"• {mark}{(tm + ' ') if tm else ''}{esc(e.get('title'))}")
    except Exception as e:  # noqa: BLE001
        print(f"tg plans: {e}", file=sys.stderr, flush=True)
    return out


def deadlines(st, u: dict, d: date) -> list[dict]:
    if u.get("role") != "student" or not u.get("group_id"):
        return []
    ds = d.isoformat()
    subs = st.student_submissions(u["id"])
    return [a for a in st.assignments(group_id=u["group_id"]) if (a.get("due") or "")[:10] == ds and a["id"] not in subs]


def lesson_text(l: dict, lang: str, compact: bool = False) -> str:
    L = tx(lang)
    tm = "–".join(x for x in (l.get("slot_start"), l.get("slot_end")) if x)
    ch = l.get("change") or {}
    subj = esc(l.get("subject") or "—")
    if compact:
        if ch.get("kind") == "cancel":
            return f"<s>{l.get('slot_start') or ''} {subj}</s> ❌"
        room = f" · {esc(l['room'])}" if l.get("room") else ""
        return f"{l.get('slot_start') or ''} {subj}{room}" + (" 🔁" if ch else "")
    if ch.get("kind") == "cancel":
        return f"<s>{tm} · {subj}</s> — ❌ {L['cancelled']}"
    meta = [L["types"].get(l.get("type") or "", l.get("type") or "")]
    if l.get("room"):
        meta.append("📍 " + esc(l["room"]))
    if l.get("teacher"):
        meta.append("👤 " + esc(l["teacher"]))
    s = f"<b>{tm}</b> · {subj}\n" + " · ".join(x for x in meta if x)
    if ch:
        s += f"\n🔁 {L['changed']}" + (f": {esc(ch['note'])}" if ch.get("note") else "")
    return s


def day_body(st, u: dict, d: date, lang: str, with_plans: bool = True, cache: dict | None = None) -> tuple[str, bool]:
    """Kun matni (darslar + rejalar). Qaytaradi: (matn, nimadir bormi)."""
    L = tx(lang)
    lessons, why = day_lessons(st, u, d, cache)
    parts = []
    has = False
    if lessons is None:
        parts.append(L[why])
    elif lessons:
        has = True
        parts.append("\n\n".join(lesson_text(x, lang) for x in lessons))
    else:
        parts.append(L["no_lessons"])
    if with_plans:
        pl = plans(st, u, d) + ["• " + L["deadline"].format(title=esc(a["title"]) + (f" ({esc(a['subject'])})" if a.get("subject") else ""))
                                for a in deadlines(st, u, d)]
        if pl:
            has = True
            parts.append(L["plans"] + "\n" + "\n".join(pl))
    return "\n\n".join(parts), has


# ================================================================== yuborish (fon navbati)
_Q: "queue.Queue" = queue.Queue()
_W: list[threading.Thread] = []


def enqueue(fn, *args) -> None:
    if SYNC:
        try:
            fn(*args)
        except Exception as e:  # noqa: BLE001
            print(f"tg push: {e}", file=sys.stderr, flush=True)
        return
    if not _W or not _W[0].is_alive():
        def work():
            while True:
                f, a = _Q.get()
                try:
                    f(*a)
                except Exception as e:  # noqa: BLE001
                    print(f"tg push: {e}", file=sys.stderr, flush=True)
                finally:
                    _Q.task_done()

        _W[:] = [threading.Thread(target=work, daemon=True)]
        _W[0].start()
    _Q.put((fn, args))


def flush(timeout: float = 5.0) -> None:
    end = time.time() + timeout
    while _Q.unfinished_tasks and time.time() < end:
        time.sleep(0.02)


def _ready(st) -> bool:
    from . import telegram as TG  # noqa: PLC0415

    return TG.ready(TG.config(st))


def _base(st) -> str:
    from .api.deps import svc  # noqa: PLC0415

    return svc().base_url()


def _url(st, path: str) -> str | None:
    """Telegram URL tugmasi — faqat ommaviy HTTPS manzil bo'lsa."""
    if not path:
        return None
    base = _base(st)
    url = path if path.startswith("http") else base + (path if path.startswith("/") else "/" + path)
    return url if url.startswith("https://") else None


def send(st, chat_id, text: str, markup: dict | None = None) -> None:
    from . import telegram as TG  # noqa: PLC0415

    cid = str(chat_id)
    if cid.startswith("-"):  # shaxsiy ma'lumot faqat shaxsiy chatga
        return
    r = TG.Api(TG.config(st)["token"]).call("sendMessage", chat_id=cid, text=text[:4000], parse_mode="HTML", reply_markup=markup, disable_web_page_preview=True)
    TG.sent_out(st, cid, (r or {}).get("message_id"))  # bildirishnoma — yangi xabar; panel endi eng pastda emas


def chat_lang(st, chat_id) -> str:
    r = st._q("SELECT lang FROM tg_chats WHERE chat_id=%s", (str(chat_id),))  # noqa: SLF001
    return (r[0]["lang"] if r else "") or "uz"


# --- bildirishnomalar (academic.personal_notice / save_notice ilgagi)
def on_notice(st, notice: dict) -> None:
    """Yangi bildirishnoma: bog'langan talaba(lar)ning chatiga darhol (fon navbatida)."""
    try:
        ensure_schema(st)
        aud = notice.get("audience")
        if aud == "user":
            rows = st._q("SELECT user_id, chat_id FROM tg_links WHERE user_id=%s", (notice.get("user_id"),))  # noqa: SLF001
        elif aud in ("all", "students"):
            rows = st._q("SELECT l.user_id, l.chat_id FROM tg_links l JOIN users u ON u.id=l.user_id WHERE u.role='student' AND u.active=1")  # noqa: SLF001
        elif aud == "group" and notice.get("group_id"):
            rows = st._q("SELECT l.user_id, l.chat_id FROM tg_links l JOIN users u ON u.id=l.user_id WHERE u.role='student' AND u.active=1 AND u.group_id=%s",  # noqa: SLF001
                         (notice["group_id"],))
        else:
            rows = []
        if not rows or not _ready(st):
            return
        targets = [(r["user_id"], r["chat_id"]) for r in rows]
        enqueue(_push_notice, st, notice, targets)
    except Exception as e:  # noqa: BLE001 — bildirishnoma asosiy amalni to'xtatmasin
        print(f"tg notice: {e}", file=sys.stderr, flush=True)


def _push_notice(st, notice: dict, targets: list[tuple[str, str]]) -> None:
    from .telegram import kb  # noqa: PLC0415

    body = re.sub(r"\s+\n", "\n", str(notice.get("body") or "")).strip()
    text = f"🔔 <b>{esc(notice.get('title'))}</b>" + (f"\n{esc(body[:700])}" if body else "")
    for uid, cid in targets:
        if not claim(st, f"nt:{notice['id']}:{uid}"):
            continue
        L = tx(chat_lang(st, cid))
        url = _url(st, notice.get("link") or "")
        rows = [[(L["b_open"], "url:" + url)]] if url else []
        try:
            send(st, cid, text, kb(rows) if rows else None)
        except Exception as e:  # noqa: BLE001
            print(f"tg notice push: {e}", file=sys.stderr, flush=True)


# --- dars jadvali o'zgarishi (admin: dars qo'shish / tahrirlash / ko'chirish / o'chirish, bir kunlik o'zgarish)
def _snap(st, group_ids: list[str]) -> dict[str, dict]:
    """Guruhlar uchun bugundan boshlab 7 kunlik darslar: {gid: {kalit: dars}} (bekor qilinganlar — yo'q hisoblanadi)."""
    sem = st.current_semester()
    out: dict[str, dict] = {}
    if not sem or not sem.get("published"):
        return out
    t0 = now().date()
    for gid in group_ids:
        cur: dict = {}
        for monday in sorted({t0 - timedelta(days=t0.weekday()), t0 + timedelta(days=6) - timedelta(days=(t0 + timedelta(days=6)).weekday())}):
            for d in st.week_schedule(sem, monday, group_id=gid)["days"]:
                if not (t0.isoformat() <= d["date"] <= (t0 + timedelta(days=6)).isoformat()):
                    continue
                for l in d["lessons"]:
                    if (l.get("change") or {}).get("kind") == "cancel":
                        continue
                    k = (d["date"], l.get("slot_start") or "", l.get("subject") or "", l.get("room") or "", l.get("teacher") or "")
                    cur[k] = {"date": d["date"], "start": l.get("slot_start") or "", "end": l.get("slot_end") or "", "subject": l.get("subject") or "",
                              "room": l.get("room") or "", "teacher": l.get("teacher") or ""}
        out[gid] = cur
    return out


class ScheduleWatch:
    """`with ScheduleWatch(st, [gid, …]):` — o'zgarishdan oldingi va keyingi 7 kunlik jadval solishtirilib, farq bog'langan talabalarga yuboriladi."""

    def __init__(self, st, group_ids):
        self.st = st
        self.gids = sorted({g for g in group_ids if g})
        self.before: dict | None = None

    def __enter__(self):
        try:
            ensure_schema(self.st)
            if self.gids and _ready(self.st) and self.st._one(  # noqa: SLF001
                    "SELECT 1 FROM tg_links l JOIN users u ON u.id=l.user_id WHERE u.role='student' AND u.group_id = ANY(%s) LIMIT 1", (self.gids,)):
                self.before = _snap(self.st, self.gids)
        except Exception as e:  # noqa: BLE001
            print(f"tg schedule watch: {e}", file=sys.stderr, flush=True)
        return self

    def __exit__(self, et, ev, tb):
        if et is not None or self.before is None:
            return False
        try:
            after = _snap(self.st, self.gids)
            for gid in self.gids:
                b, a = self.before.get(gid, {}), after.get(gid, {})
                removed = [b[k] for k in b if k not in a]
                added = [a[k] for k in a if k not in b]
                if removed or added:
                    enqueue(_push_change, self.st, gid, removed, added)
        except Exception as e:  # noqa: BLE001
            print(f"tg schedule watch: {e}", file=sys.stderr, flush=True)
        return False


def change_text(removed: list[dict], added: list[dict], lang: str) -> str:
    L = tx(lang)

    def when(x):
        return f"{short_date(date.fromisoformat(x['date']), lang)} · {x['start']}"

    lines = []
    left = list(added)
    for r in sorted(removed, key=lambda x: (x["date"], x["start"])):
        m = next((x for x in left if x["date"] == r["date"] and x["subject"] == r["subject"]), None)
        if m:
            left.remove(m)
            where = f" · 📍 {esc(m['room'])}" if m["room"] else ""
            lines.append(f"🔁 {when(r)} → {m['start']}{where} · <b>{esc(r['subject'])}</b> — {L['ch_move']}")
        else:
            lines.append(f"❌ {when(r)} · <b>{esc(r['subject'])}</b> — {L['ch_del']}")
    for x in sorted(left, key=lambda x: (x["date"], x["start"])):
        where = f" · 📍 {esc(x['room'])}" if x["room"] else ""
        lines.append(f"➕ {when(x)} · <b>{esc(x['subject'])}</b>{where} — {L['ch_add']}")
    return L["sched_change"] + "\n\n" + "\n".join(lines)


def _push_change(st, gid: str, removed: list[dict], added: list[dict]) -> None:
    from .telegram import kb  # noqa: PLC0415

    rows = st._q("SELECT l.user_id, l.chat_id FROM tg_links l JOIN users u ON u.id=l.user_id WHERE u.role='student' AND u.active=1 AND u.group_id=%s", (gid,))  # noqa: SLF001
    for r in rows:
        lang = chat_lang(st, r["chat_id"])
        L = tx(lang)
        try:
            send(st, r["chat_id"], change_text(removed, added, lang), kb([[(L["b_sched"], "s:day:" + now().date().isoformat()), (L["b_menu"], "s:home")]]))
        except Exception as e:  # noqa: BLE001
            print(f"tg schedule push: {e}", file=sys.stderr, flush=True)


# ================================================================== testlar
def _open_tests(st) -> list[dict]:
    from .api.interactive import _store  # noqa: PLC0415

    s = _store()
    out = []
    for r in st._q("SELECT * FROM iq_tests WHERE status='open' ORDER BY updated DESC"):  # noqa: SLF001
        t = s._t(r)  # noqa: SLF001
        cfg = t["settings"]
        if cfg.get("kind") == "game" or cfg.get("access") != "groups" or not s.is_open(t):
            continue
        out.append(t)
    return out


def available_tests(u: dict) -> list[dict]:
    from .api.interactive import available_tests as at  # noqa: PLC0415

    return at(u)


def _preclaim_tests(st, uid: str) -> None:
    """Ulanish paytida allaqachon ochiq testlar «yangi» deb yuborilmaydi."""
    try:
        from .interactive import access_ok  # noqa: PLC0415

        u = st.get_user(uid)
        if u and u.get("role") == "student":
            for t in _open_tests(st):  # tick bilan bir xil mezon
                if access_ok(t, u):
                    claim(st, f"iq:{uid}:{t['code']}")
    except Exception as e:  # noqa: BLE001
        print(f"tg tests: {e}", file=sys.stderr, flush=True)


# ================================================================== rejalashtiruvchi (har daqiqada)
def _hm_add(hm: str, minutes: int) -> str:
    h, m = (int(x) for x in hm.split(":"))
    t = h * 60 + m + minutes
    return f"{t // 60:02d}:{t % 60:02d}" if t < 1440 else "24:00"


def digest(st, u: dict, d: date, lang: str, kind: str, first_name: str = "") -> str | None:
    """Ertalabki (bugun) yoki kechki (ertaga) xulosa. Dars ham, reja ham bo'lmasa — None (yuborilmaydi)."""
    L = tx(lang)
    body, has = day_body(st, u, d, lang)
    if not has:
        return None
    if kind == "morning":
        head = L["morning"].format(name=esc(first_name or (u.get("name") or "").split(" ")[0]), date=fmt_date(d, lang))
    else:
        head = L["tomorrow_t"].format(date=fmt_date(d, lang))
    return head + "\n\n" + body


def tick(st, at: datetime | None = None) -> dict:
    """Bir daqiqalik qadam: ertalabki/kechki xulosa, dars eslatmasi, yangi testlar. Qaytaradi: yuborilganlar soni.

    Avval shu daqiqadagi barcha nomzod kalitlar bitta so'rov bilan tekshiriladi (yuborilganlari o'tkaziladi), keyin har biri
    `claim` bilan olinadi — bir nechta jarayonda ham bitta xabar bir marta ketadi."""
    from .interactive import access_ok  # noqa: PLC0415
    from .telegram import kb  # noqa: PLC0415

    sent = {"morning": 0, "evening": 0, "remind": 0, "tests": 0}
    ensure_schema(st)
    if not _ready(st):
        return sent
    at = at or now()
    today = at.date()
    hm = at.strftime("%H:%M")
    links = [_link_row(r) for r in st._q("SELECT l.* FROM tg_links l JOIN users u ON u.id=l.user_id WHERE u.role='student' AND u.active=1")]  # noqa: SLF001
    if not links:
        return sent
    users = {r["id"]: st._user(r) for r in st._q("SELECT * FROM users WHERE id = ANY(%s)", ([x["user_id"] for x in links],))}  # noqa: SLF001
    langs = {r["chat_id"]: r["lang"] or "uz" for r in st._q("SELECT chat_id, lang FROM tg_chats WHERE chat_id = ANY(%s)", ([x["chat_id"] for x in links],))}  # noqa: SLF001
    tests = _open_tests(st)
    cache: dict = {}
    plan: list[tuple[str, dict, str, object]] = []  # (kalit, bog'lanish, tur, ma'lumot)
    for ln in links:
        u = users.get(ln["user_id"])
        if not u:
            continue
        if ln["morning"] and ln["morning_time"] <= hm < _hm_add(ln["morning_time"], 180):
            plan.append((f"am:{u['id']}:{today}", ln, "morning", None))
        if ln["evening"] and EVENING_TIME <= hm < _hm_add(EVENING_TIME, 180):
            plan.append((f"pm:{u['id']}:{today}", ln, "evening", None))
        if ln["remind"]:
            lessons, _ = day_lessons(st, u, today, cache)
            soon = _hm_add(hm, REMIND_MIN)
            for l in lessons or []:
                s0 = l.get("slot_start") or ""
                if (l.get("change") or {}).get("kind") != "cancel" and s0 and hm < s0 <= soon:
                    plan.append((f"rm:{u['id']}:{today}:{l['id']}:{s0}", ln, "remind", l))
        for t in tests:  # yangi ochilgan testlar (professor guruhni tanlagan, talaba bloklanmagan)
            if access_ok(t, u):
                plan.append((f"iq:{u['id']}:{t['code']}", ln, "tests", t))
    done = {r["key"] for r in st._q("SELECT key FROM tg_sent WHERE key = ANY(%s)", ([p[0] for p in plan],))} if plan else set()  # noqa: SLF001
    for key, ln, kind, obj in plan:
        if key in done or not claim(st, key):
            continue
        u = users[ln["user_id"]]
        lang = langs.get(ln["chat_id"], "uz")
        L = tx(lang)
        try:
            if kind in ("morning", "evening"):
                d = today if kind == "morning" else today + timedelta(days=1)
                txt = digest(st, u, d, lang, kind, (ln["tg_user"] or {}).get("first_name") or "")
                if txt:
                    send(st, ln["chat_id"], txt, kb([[(L["b_sched"], "s:day:" + d.isoformat()), (L["b_menu"], "s:home")]]))
                    sent[kind] += 1
            elif kind == "remind":
                send(st, ln["chat_id"], L["remind"].format(n=REMIND_MIN) + "\n\n" + lesson_text(obj, lang), None)
                sent["remind"] += 1
            else:
                url = _url(st, f"/t/{obj['code']}")
                send(st, ln["chat_id"], L["new_test"].format(title=esc(obj["title"])) + _test_meta(obj, lang),
                     kb([[(L["b_open"], "url:" + url)]] if url else [[(L["b_tests"], "s:tests")]]))
                sent["tests"] += 1
        except Exception as e:  # noqa: BLE001
            print(f"tg tick {key}: {e}", file=sys.stderr, flush=True)
    if hm == "03:00":
        with st._tx() as c:  # noqa: SLF001
            c.execute("DELETE FROM tg_sent WHERE created<%s", ((datetime.now(timezone.utc) - timedelta(days=60)).isoformat(timespec="seconds"),))
    return sent


def _test_meta(t: dict, lang: str) -> str:
    L = tx(lang)
    cfg = t.get("settings") or {}
    parts = []
    if cfg.get("subject"):
        parts.append(esc(cfg["subject"]))
    parts.append(L["q_n"].format(n=len(t.get("questions") or [])))
    parts.append(L["min_n"].format(n=cfg["time_limit"]) if cfg.get("time_limit") else L["no_limit"])
    if t.get("closes"):
        parts.append(L["until"].format(d=_dt_local(t["closes"])))
    return "\n" + " · ".join(parts)


class Scheduler:
    def __init__(self, st):
        self.st = st
        self._stop = threading.Event()
        self._t: threading.Thread | None = None

    def start(self) -> None:
        if self._t and self._t.is_alive():
            return
        self._stop.clear()

        def loop():
            while not self._stop.wait(60 - time.time() % 60 + 1):
                try:
                    tick(self.st)
                except Exception as e:  # noqa: BLE001
                    print(f"tg scheduler: {e}", file=sys.stderr, flush=True)

        self._t = threading.Thread(target=loop, daemon=True)
        self._t.start()

    def stop(self) -> None:
        self._stop.set()


# ================================================================== bot ekranlari
class StudentBot:
    """Bot (telegram.Bot) ichida bog'langan foydalanuvchi uchun ekranlar va bog'lash oqimi."""

    def __init__(self, bot):
        self.bot = bot
        self.st = bot.st

    # --- yordamchilar
    def L(self, c: dict) -> dict:
        return tx(c.get("lang") or "uz")

    def user_of(self, c: dict) -> dict | None:
        ln = link_by_chat(self.st, c["chat_id"])
        if not ln:
            return None
        u = self.st.get_user(ln["user_id"])
        return u if u and u.get("active") else None

    def student(self, c: dict) -> dict | None:
        u = self.user_of(c)
        return u if u and u.get("role") == "student" else None

    def show(self, c: dict, text: str, markup: dict | None, q: dict | None = None) -> None:  # noqa: ARG002
        """Ekran — chatdagi yagona panel xabarida (telegram.Bot.panel: tahrirlanadi, kerak bo'lsa pastga ko'chiriladi)."""
        self.bot.panel(c, text, markup)

    def url_row(self, label: str, path: str) -> list:
        url = _url(self.st, path)
        return [(label, "url:" + url)] if url else []

    # --- asosiy menyu
    def home_kb(self, c: dict, u: dict) -> dict:
        from .telegram import kb  # noqa: PLC0415

        L = self.L(c)
        if u.get("role") != "student":
            T = self.bot.L(c)
            return kb([[(T["new"], "new")], [(T["mine"], "mine")], [(L["b_set"], "s:set")]])
        forum = self.url_row(L["b_forum"], "/forum")
        return kb([[(L["b_today"], "s:today"), (L["b_sched"], "s:day")], [(L["b_notif"], "s:notif:0"), (L["b_grades"], "s:grades")],
                   [(L["b_tests"], "s:tests"), (L["b_lib"], "s:lib")], [*(forum or []), (L["b_desk"], "s:desk")], [(L["b_set"], "s:set")]])

    def home_text(self, c: dict, u: dict) -> str:
        return self.L(c)["home"].format(name=esc(u["name"]), group=esc(who(self.st, u, c["lang"])), date=fmt_date(now().date(), c["lang"]))

    def home(self, c: dict, u: dict, q: dict | None = None) -> None:
        self.show(c, self.home_text(c, u), self.home_kb(c, u), q)

    # --- bog'lash
    def login(self, c: dict, q: dict | None = None) -> None:
        from .telegram import kb  # noqa: PLC0415

        L = self.L(c)
        self.show(c, L["login_t"], kb([[(L["by_code"], "login:code")], [(L["by_phone"], "login:phone")], [(self.bot.L(c)["back"], "menu")]]), q)

    def ask_confirm(self, c: dict, uid: str, q: dict | None = None) -> None:
        from .telegram import kb  # noqa: PLC0415

        L = self.L(c)
        u = self.st.get_user(uid)
        if not u or not u.get("active"):
            self.link_bad(c)
            return
        c["state"] = ""
        c["data"]["pending_link"] = {"uid": uid, "exp": time.time() + LINK_TTL}
        self.bot.save_chat(c)
        self.show(c, L["confirm"].format(name=esc(u["name"]), group=esc(who(self.st, u, c["lang"]))),
                  kb([[(L["yes_me"], "lk:ok")], [(L["cancel"], "lk:no")]]), q)

    def link_bad(self, c: dict) -> None:
        c["state"] = ""
        self.bot.save_chat(c)
        self.bot.note(c, "⚠️ " + self.L(c)["link_bad"])
        self.bot.welcome(c)

    def start_token(self, c: dict, tok: str) -> None:
        if not c["lang"]:
            c["lang"] = "uz"
        uid = redeem(self.st, "link", tok.strip()) if re.fullmatch(r"[A-Za-z0-9]{8,64}", tok.strip() or "") else None
        if not uid:
            self.link_bad(c)
            return
        self.ask_confirm(c, uid)

    def start_lib_token(self, c: dict, tok: str) -> None:
        """Avvalgi kutubxona havolasi (`lib_<token>`) — umumiy bog'lash oqimiga."""
        if not c["lang"]:
            c["lang"] = "uz"
        r = self.st._q("SELECT user_id FROM lib_prefs WHERE tg_token=%s", (tok.strip(),)) if tok.strip() else []  # noqa: SLF001
        if not r:
            self.link_bad(c)
            return
        with self.st._tx() as cx:  # noqa: SLF001
            cx.execute("UPDATE lib_prefs SET tg_token=NULL WHERE user_id=%s", (r[0]["user_id"],))
        self.ask_confirm(c, r[0]["user_id"])

    def on_code(self, c: dict, text: str) -> None:
        from .telegram import kb  # noqa: PLC0415

        L = self.L(c)
        t = time.time()
        tries = [x for x in c["data"].get("code_tries") or [] if x > t - CODE_WINDOW]
        if len(tries) >= CODE_TRIES:
            c["state"] = ""
            c["data"]["code_tries"] = tries
            self.bot.save_chat(c)
            self.show(c, "⚠️ " + L["code_limit"].format(m=max(1, int((min(tries) + CODE_WINDOW - t) // 60) + 1)), kb([[(self.bot.L(c)["menu"], "menu")]]))
            return
        tries.append(t)
        c["data"]["code_tries"] = tries
        code = digits(text)
        uid = redeem(self.st, "code", code) if len(code) == 6 else None
        if not uid:
            self.bot.save_chat(c)
            self.show(c, "⚠️ " + L["bad_code"] + "\n\n" + L["ask_code"], kb([[(L["cancel"], "lk:no")]]))
            return
        c["data"].pop("code_tries", None)
        self.ask_confirm(c, uid)

    # --- «Raqam orqali»: request_contact faqat pastki (reply) klaviaturada bo'ladi, uni xabarni tahrirlab qo'shib bo'lmaydi.
    # Shuning uchun: panel «pastdagi tugmani bosing» holatiga tahrirlanadi + klaviaturali vaqtinchalik xabar yuboriladi (id: data.kb_msg).
    # Kontakt kelganda (yoki bekor qilinganda): kontakt xabari va vaqtinchalik xabar o'chiriladi, klaviatura esa ReplyKeyboardRemove
    # biriktirilgan xabarni yuborib, darhol o'chirish bilan yopiladi (klaviaturaning xabarini o'chirish hamma ilovalarda uni yopmaydi).
    def ask_phone(self, c: dict) -> None:
        from .telegram import kb  # noqa: PLC0415

        L = self.L(c)
        self.drop_kb(c, remove=False)  # avvalgi vaqtinchalik xabar (qayta bosilgan bo'lsa)
        c["state"] = "login_phone"
        self.bot.save_chat(c)
        self.show(c, L["login_t"] + "\n\n" + L["ask_phone"], kb([[(L["cancel"], "lk:no")]]))
        r = self.bot.api().call("sendMessage", chat_id=c["chat_id"], text="👇 " + L["send_phone"],
                                reply_markup={"keyboard": [[{"text": L["send_phone"], "request_contact": True}], [{"text": L["cancel"]}]],
                                              "resize_keyboard": True, "one_time_keyboard": True})
        c["data"]["kb_msg"] = int((r or {}).get("message_id") or 0)
        self.bot.save_chat(c)

    def drop_kb(self, c: dict, remove: bool = True) -> None:
        """Vaqtinchalik «Raqamni yuborish» xabari o'chiriladi va pastki klaviatura yopiladi (xatolar e'tiborsiz)."""
        mid = c["data"].pop("kb_msg", 0)
        self.bot.delete(c["chat_id"], mid)
        if remove:
            try:
                r = self.bot.api().call("sendMessage", chat_id=c["chat_id"], text="✓", reply_markup={"remove_keyboard": True}, disable_notification=True)
                self.bot.delete(c["chat_id"], (r or {}).get("message_id"))
            except Exception as e:  # noqa: BLE001
                print(f"tg drop keyboard: {e}", file=sys.stderr, flush=True)
        self.bot.save_chat(c)

    def on_contact(self, c: dict, msg: dict) -> None:
        """Kontakt keldi: u (shaxsiy ma'lumot) o'chiriladi, natija — panelda (panel vaqtinchalik xabar ustida — joyida tahrirlanadi)."""
        from .telegram import kb  # noqa: PLC0415

        L = self.L(c)
        self.bot._ctx(c)["inplace"] = True  # noqa: SLF001
        ct = msg.get("contact") or {}
        sender = (msg.get("from") or {}).get("id")
        if not ct.get("user_id") or str(ct.get("user_id")) != str(sender):
            self.show(c, "⚠️ " + L["phone_foreign"] + "\n\n" + L["ask_phone"], kb([[(L["cancel"], "lk:no")]]))
            return
        self.drop_kb(c)
        c["state"] = ""
        self.bot.save_chat(c)
        found = find_by_phone(self.st, ct.get("phone_number") or "")
        if len(found) != 1:
            self.show(c, "⚠️ " + L["phone_none"], kb([[(L["by_code"], "login:code")], [(self.bot.L(c)["back"], "menu")]]))
            return
        self.ask_confirm(c, found[0]["id"])

    def confirm(self, c: dict, ok: bool, q: dict | None) -> None:
        L = self.L(c)
        p = c["data"].pop("pending_link", None)
        c["state"] = ""
        self.bot.save_chat(c)
        if not ok:
            self.bot.toast(c, L["aborted"])
            self.bot.welcome(c)
            return
        if not p or p.get("exp", 0) < time.time():
            self.link_bad(c)
            return
        tg = {k: c["tg_user"].get(k) for k in ("id", "first_name", "last_name", "username")}
        old = link(self.st, p["uid"], c["chat_id"], tg)
        u = self.st.get_user(p["uid"])
        if old:
            notify_moved(self.st, old, u["name"])
        self.show(c, L["linked"] + "\n\n" + self.home_text(c, u), self.home_kb(c, u), q)

    # --- bo'limlar
    def today(self, c: dict, u: dict, q: dict | None) -> None:
        from .telegram import kb  # noqa: PLC0415

        L = self.L(c)
        d = now().date()
        body, _ = day_body(self.st, u, d, c["lang"])
        self.show(c, L["today_t"].format(date=fmt_date(d, c["lang"])) + "\n\n" + body,
                  kb([[(L["b_sched"], "s:day:" + d.isoformat())], [(L["b_menu"], "s:home")]]), q)

    def day(self, c: dict, u: dict, ds: str, q: dict | None) -> None:
        from .telegram import kb  # noqa: PLC0415

        L = self.L(c)
        try:
            d = date.fromisoformat(ds) if ds else now().date()
        except ValueError:
            d = now().date()
        body, _ = day_body(self.st, u, d, c["lang"], with_plans=True)
        prev, nxt = d - timedelta(days=1), d + timedelta(days=1)
        nav = [("◀️", f"s:day:{prev}"), (L["b_now"], f"s:day:{now().date()}"), ("▶️", f"s:day:{nxt}")]
        self.show(c, L["day_t"].format(date=fmt_date(d, c["lang"])) + "\n\n" + body,
                  kb([nav, [(L["b_week"], f"s:week:{d}")], [(L["b_menu"], "s:home")]]), q)

    def week(self, c: dict, u: dict, ds: str, q: dict | None) -> None:
        from .telegram import kb  # noqa: PLC0415

        L, lang = self.L(c), c["lang"]
        try:
            d = date.fromisoformat(ds) if ds else now().date()
        except ValueError:
            d = now().date()
        monday = d - timedelta(days=d.weekday())
        wk, why = week_of(self.st, u, monday)
        if wk is None:
            text = L[why]
        else:
            lines = [L["week_t"].format(a=f"{monday:%d.%m}", b=f"{monday + timedelta(days=6):%d.%m}", n=wk.get("week_number") or "—")]
            for x in wk["days"]:
                dd = date.fromisoformat(x["date"])
                if x.get("off") or (dd.weekday() == 6 and not x["lessons"]):
                    continue
                mark = " ◀" if dd == now().date() else ""
                lines.append(f"\n<b>{short_date(dd, lang)}</b>{mark}")
                lines += [lesson_text(l, lang, compact=True) for l in x["lessons"]] or ["—"]
            text = "\n".join(lines)
        today_w = now().date()
        nav = [("◀️", f"s:week:{monday - timedelta(days=7)}"), (L["b_now"], f"s:week:{today_w}"), ("▶️", f"s:week:{monday + timedelta(days=7)}")]
        day_target = d if d - timedelta(days=d.weekday()) == monday else monday
        self.show(c, text, kb([nav, [(L["b_day"], f"s:day:{day_target}")], [(L["b_menu"], "s:home")]]), q)

    def notifs(self, c: dict, u: dict, page: int, q: dict | None) -> None:
        from .telegram import kb  # noqa: PLC0415

        L = self.L(c)
        page = max(0, min(page, 9))
        items = self.st.notices_for("student", u.get("group_id"), user_id=u["id"], limit=(page + 1) * PAGE + 1)
        has_more = len(items) > (page + 1) * PAGE
        chunk = items[page * PAGE:(page + 1) * PAGE]
        if not chunk:
            text = L["notif_t"] + "\n\n" + L["notif_none"]
        else:
            parts = [L["notif_t"]]
            for n in chunk:
                body = re.sub(r"\s+", " ", str(n.get("body") or "")).strip()
                parts.append(f"<b>{esc(n['title'])}</b>" + (f"\n{esc(body[:220])}{'…' if len(body) > 220 else ''}" if body else "") +
                             f"\n<i>{_dt_local(n['created'])}</i>")
            text = "\n\n".join(parts)
        nav = []
        if page > 0:
            nav.append(("◀️", f"s:notif:{page - 1}"))
        if has_more and page < 9:
            nav.append(("▶️", f"s:notif:{page + 1}"))
        rows = [nav, self.url_row(L["b_open"], "/student/notices"), [(L["b_menu"], "s:home")]]
        self.show(c, text, kb(rows), q)

    def grades(self, c: dict, u: dict, q: dict | None) -> None:
        from .telegram import kb  # noqa: PLC0415

        L = self.L(c)
        st = self.st
        sem = st.current_semester()
        gr = st.student_grades(u["id"], sem["id"] if sem else None)
        att = st.student_attendance(u["id"], sem["id"] if sem else None)
        per: dict[str, dict] = {}
        for s in gr["subjects"]:
            per.setdefault(s["subject_id"], {"subject": s.get("subject")})["g"] = s
        for s in att["subjects"]:
            per.setdefault(s["subject_id"], {"subject": s.get("subject")})["a"] = s
        head = [L["grades_t"] + (f" · {esc(sem['name'])}" if sem else "")]
        kpi = []
        gpa = st.gpa(gr["subjects"])
        if gpa is not None:
            kpi.append(L["gpa"].format(v=gpa))
        if att.get("pct") is not None:
            kpi.append(L["att_all"].format(v=att["pct"]))
        if kpi:
            head.append(" · ".join(kpi))
        parts = ["\n".join(head)]
        if not per:
            parts.append(L["grades_none"])
        for p in sorted(per.values(), key=lambda x: x.get("subject") or ""):
            lines = [f"<b>{esc(p.get('subject') or '—')}</b>"]
            g = p.get("g")
            if g and g.get("pct") is not None:
                lines.append(L["g_line"].format(pct=f"{g['pct']:g}", g5=g.get("grade5") if g.get("grade5") is not None else "—"))
            a = p.get("a")
            if a and a.get("pct") is not None:
                lines.append(L["a_line"].format(pct=a["pct"], n=a.get("absent") or 0))
            parts.append("\n".join(lines))
        self.show(c, "\n\n".join(parts), kb([self.url_row(L["b_open"], "/student/grades"), [(L["b_menu"], "s:home")]]), q)

    def tests(self, c: dict, u: dict, q: dict | None) -> None:
        from .telegram import kb  # noqa: PLC0415

        L = self.L(c)
        items = available_tests(u)
        if not items:
            text = L["tests_t"] + "\n\n" + L["tests_none"]
        else:
            parts = [L["tests_t"]]
            for i, t in enumerate(items[:15], 1):
                meta = [L["q_n"].format(n=t["count"]), L["min_n"].format(n=t["time_limit"]) if t.get("time_limit") else L["no_limit"]]
                if t.get("closes"):
                    meta.append(L["until"].format(d=_dt_local(t["closes"])))
                if t.get("in_progress"):
                    meta.append(L["in_progress"])
                sub = " — " + esc(t["subject"]) if t.get("subject") else ""
                parts.append(f"{i}. <b>{esc(t['title'])}</b>{sub}\n" + " · ".join(meta))
            parts.append(f"<i>{L['tests_note']}</i>")
            text = "\n\n".join(parts)
        rows = [self.url_row(f"▶️ {t['title'][:40]}", f"/t/{t['code']}") for t in items[:15]]
        self.show(c, text, kb([*rows, [(L["b_menu"], "s:home")]]), q)

    def library(self, c: dict, u: dict, q: dict | None) -> None:
        from .telegram import kb  # noqa: PLC0415

        L = self.L(c)
        loans, res = [], []
        try:
            from .api.library import lib  # noqa: PLC0415

            loans, res = lib().user_loans(u["id"]), lib().user_reservations(u["id"])
        except Exception as e:  # noqa: BLE001
            print(f"tg library: {e}", file=sys.stderr, flush=True)
        parts = [L["lib_t"]]
        if not loans and not res:
            parts.append(L["lib_none"])
        if loans:
            parts.append(L["loans"] + "\n" + "\n".join(
                f"• {esc(x['title'])} — {L['due'].format(d=_dt_local(x['due'][:10]))}" + (f" {L['overdue']}" if x.get("overdue") else "") for x in loans))
        if res:
            parts.append(L["res"] + "\n" + "\n".join(
                f"• {esc(x['title'])} — " + (L["res_ready"].format(d=_dt_local((x.get("expires") or "")[:10])) if x["status"] == "ready" else L["res_wait"].format(n=x.get("position") or 1))
                for x in res))
        self.show(c, "\n\n".join(parts), kb([self.url_row(L["b_open"], "/student/library"), [(L["b_menu"], "s:home")]]), q)

    def desk(self, c: dict, q: dict | None) -> None:
        from .telegram import kb  # noqa: PLC0415

        L, T = self.L(c), self.bot.L(c)
        self.show(c, L["desk_t"], kb([[(T["new"], "new")], [(T["mine"], "mine")], [(T["contacts"], "contacts")], [(L["b_menu"], "s:home")]]), q)

    def settings(self, c: dict, u: dict, q: dict | None) -> None:
        from .telegram import kb  # noqa: PLC0415

        L = self.L(c)
        ln = link_of(self.st, u["id"]) or {}
        tg = ln.get("tg_user") or {}
        who_tg = ("@" + tg["username"]) if tg.get("username") else (" ".join(x for x in (tg.get("first_name"), tg.get("last_name")) if x) or "—")
        onoff = lambda v: L["on"] if v else L["off"]  # noqa: E731
        lines = [L["set_t"], "", L["s_lang"].format(v=LANG_NAMES.get(c["lang"] or "uz"))]
        rows = [[(L["bt_lang"], "s:set:lang")]]
        if u.get("role") == "student":
            lines += [L["s_morning"].format(v=onoff(ln.get("morning")) + (f" · {ln.get('morning_time')}" if ln.get("morning") else "")),
                      L["s_evening"].format(v=onoff(ln.get("evening"))), L["s_remind"].format(v=onoff(ln.get("remind")))]
            mark = lambda v: "✅" if v else "▫️"  # noqa: E731
            rows += [[(f"{mark(ln.get('morning'))} {L['bt_morning']}", "s:set:morning"), (f"🕖 {ln.get('morning_time') or '07:30'}", "s:set:time")],
                     [(f"{mark(ln.get('evening'))} {L['bt_evening']}", "s:set:evening"), (f"{mark(ln.get('remind'))} {L['bt_remind']}", "s:set:remind")]]
        lines.append(L["s_tg"].format(v=esc(who_tg) + (f" · {_dt_local((ln.get('linked') or '')[:10])}" if ln.get("linked") else "")))
        rows += [[(L["bt_unlink"], "s:unlink")], [(L["b_menu"], "s:home")]]
        self.show(c, "\n".join(lines), kb(rows), q)

    # --- tugmalar
    def on_button(self, c: dict, data: str, q: dict | None) -> bool:
        """True — tugma shu yerda qayta ishlandi."""
        from .telegram import LANG_BTNS, kb  # noqa: PLC0415

        L = self.L(c)
        if data == "login":
            self.login(c, q)
            return True
        if data == "login:code":
            c["state"] = "login_code"
            self.bot.save_chat(c)
            self.show(c, L["ask_code"], kb([[(L["cancel"], "lk:no")]]), q)
            return True
        if data == "login:phone":
            self.ask_phone(c)
            return True
        if data in ("lk:ok", "lk:no"):
            if c["state"] in ("login_code", "login_phone"):
                c["state"] = ""
            self.confirm(c, data == "lk:ok", q)
            return True
        if not data.startswith("s:"):
            return False
        u = self.user_of(c)
        if not u:  # bog'lanmagan (yoki uzilgan) — ommaviy menyu
            self.show(c, self.bot.welcome_text(c), self.bot.main_menu(c), q)
            return True
        parts = data.split(":")
        sec = parts[1] if len(parts) > 1 else "home"
        arg = parts[2] if len(parts) > 2 else ""
        if sec == "home":
            self.home(c, u, q)
        elif sec == "set":
            if arg == "lang":
                self.show(c, T_choose(), kb([[(n, f"s:lang:{k}")] for k, n in LANG_BTNS] + [[(L["b_set"], "s:set")]]), q)
                return True
            if arg in ("morning", "evening", "remind") and u.get("role") == "student":
                ln = link_of(self.st, u["id"]) or {}
                set_prefs(self.st, u["id"], **{arg: not ln.get(arg)})
            elif arg == "time" and u.get("role") == "student":
                self.show(c, L["time_t"], kb([[(t, f"s:mt:{t.replace(':', '')}") for t in MORNING_TIMES[:3]], [(t, f"s:mt:{t.replace(':', '')}") for t in MORNING_TIMES[3:]],
                                              [(L["b_set"], "s:set")]]), q)
                return True
            self.settings(c, u, q)
        elif sec == "mt":
            t = f"{arg[:2]}:{arg[2:]}" if len(arg) == 4 else ""
            if t in MORNING_TIMES:
                set_prefs(self.st, u["id"], morning=True, morning_time=t)
            self.settings(c, u, q)
        elif sec == "lang":
            from .telegram import T as TT  # noqa: PLC0415

            if arg in TT:
                c["lang"] = arg
                self.bot.save_chat(c)
            self.settings(c, u, q)
        elif sec == "unlink":
            if arg == "yes":
                unlink(self.st, u["id"])
                self.show(c, self.L(c)["unlinked"], self.bot.main_menu(c), q)
            else:
                self.show(c, L["unlink_q"], kb([[(L["unlink_yes"], "s:unlink:yes")], [(L["cancel"], "s:set")]]), q)
        elif sec == "desk":
            self.desk(c, q)
        elif u.get("role") != "student":
            self.show(c, L["only_students"], self.home_kb(c, u), q)
        elif sec == "today":
            self.today(c, u, q)
        elif sec == "day":
            self.day(c, u, arg, q)
        elif sec == "week":
            self.week(c, u, arg, q)
        elif sec == "notif":
            self.notifs(c, u, int(arg) if arg.isdigit() else 0, q)
        elif sec == "grades":
            self.grades(c, u, q)
        elif sec == "tests":
            self.tests(c, u, q)
        elif sec == "lib":
            self.library(c, u, q)
        else:
            self.home(c, u, q)
        return True


def T_choose() -> str:  # noqa: N802
    from .telegram import T as TT  # noqa: PLC0415

    return TT["uz"]["choose_lang"]


def notify_unlinked(st, chat_id: str) -> None:
    """Kabinetdan uzildi — chatga xabar."""
    if not chat_id or not _ready(st):
        return
    enqueue(lambda: send(st, chat_id, tx(chat_lang(st, chat_id))["unlinked"]))


def notify_moved(st, chat_id: str, name: str) -> None:
    if not chat_id or not _ready(st):
        return
    enqueue(lambda: send(st, chat_id, tx(chat_lang(st, chat_id))["moved_away"].format(name=esc(name))))
