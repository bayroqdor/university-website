"""Telegram bot: saytning «Virtual qabulxona»si Telegram'da.

/start → til tanlash → asosiy menyu (hammasi inline tugmalar bilan):
  «Yangi murojaat»: ism → telefon → email (ixtiyoriy) → bo'lim → mavzu → xabar → tasdiqlash → «Murojaatlar»da chipta (manba: telegram).
  Ism, telefon va email shu chat uchun eslab qolinadi: keyingi murojaatlarda so'ralmaydi (bo'lim → mavzu → xabar → tasdiqlash);
  tasdiqlash qadamidagi «Ism va telefonni o'zgartirish» tugmasi bilan yangilanadi.
  «Mening murojaatlarim»: oxirgi murojaatlar, holati va oxirgi izoh; murojaatni ochsa — bosqichlar tarixi (holat + izoh + vaqt).
  Ochiq murojaatga botda yozilgan xabar (matn, rasm, hujjat, video, ovozli xabar) shu chiptaga qo'shiladi.
Administrator chipta tafsilotida javob yozsa — javob (ilovalari bilan) shu chatga bot orqali boradi; bosqich o'zgarsa — holat va izoh
(«Jarayonda»ga o'tish bundan mustasno: faqat operator izohi bo'lsa — oddiy xabar; holat esa «Mening murojaatlarim» tarixida),
«Hal qilindi»da — 1–5 yulduzli baholash tugmalari (keyingi xabar — baho izohi).

Chat toza qoladi: botning bitta jonli «panel» xabari bor va barcha navigatsiya shu xabarni tahrirlaydi (Bot.panel); yozilgan kiritishlar
(ism, telefon, mavzu, kod, /start …) o'chiriladi; murojaat matni, ilovalar va ochiq murojaatga yozilgan xabarlar qoladi. Bildirishnomalar
(operator javobi, holat, xulosalar, eslatmalar) — yangi xabar.

Kabinetga bog'langan foydalanuvchi (talaba) uchun shu botning o'zida — kabinet menyusi va avtomatik xabarlar: tg_student.py.

Ishlash rejimi: long polling (alohida ommaviy manzil shart emas) yoki webhook (sayt manzili HTTPS bo'lsa).
"""
from __future__ import annotations

import json
import os
import re
import secrets
import queue
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor, wait as _wait_all
from datetime import datetime, timezone

import httpx

from . import tg_net

TRANSPORT: httpx.BaseTransport | None = None  # testlar uchun
MAX_FILE = 20 * 1024 * 1024  # Bot API getFile chegarasi
CAPTION = 1024
MEDIA_KEYS = (("document", "fayl", "application/octet-stream"), ("video", "video.mp4", "video/mp4"), ("audio", "audio.mp3", "audio/mpeg"),
              ("voice", "voice.ogg", "audio/ogg"), ("video_note", "video_note.mp4", "video/mp4"), ("animation", "animation.mp4", "video/mp4"))


def esc(v) -> str:
    return str(v or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def stars(n: int) -> str:
    return "⭐" * int(n or 0)
FIELDS = ("enabled", "token", "username", "mode", "welcome", "ipv4")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
PHONE_RE = re.compile(r"^\+?[\d\s\-()]{7,20}$")

T = {
    "uz": {
        "choose_lang": "Tilni tanlang · Выберите язык · Choose language",
        "welcome": "Assalomu alaykum! Bu — {uni} virtual qabulxonasi.\nSavol, taklif yoki murojaatingizni qoldiring — mas’ul xodim javob beradi.",
        "new": "✍️ Yangi murojaat", "mine": "📂 Mening murojaatlarim", "site": "🌐 Sayt", "contacts": "☎️ Aloqa", "lang": "🌐 Til", "cancel": "❌ Bekor qilish",
        "back": "⬅️ Orqaga", "menu": "🏠 Menyu", "skip": "⏭ O‘tkazib yuborish", "use": "✅ {v}", "send": "✅ Yuborish", "restart": "✏️ Qaytadan",
        "ask_name": "1/6 · Ism va familiyangizni yozing:", "ask_phone": "2/6 · Telefon raqamingizni yozing (masalan, +998 90 123 45 67):",
        "bad_phone": "Telefon raqami noto‘g‘ri. Masalan: +998 90 123 45 67", "ask_email": "3/6 · Email manzilingiz (ixtiyoriy):",
        "bad_email": "Email noto‘g‘ri. Qaytadan yozing yoki «O‘tkazib yuborish»ni bosing.", "ask_cat": "4/6 · Murojaat qaysi bo‘limga?",
        "ask_subject": "5/6 · Murojaat mavzusi (qisqacha):", "ask_body": "6/6 · Murojaatingiz matnini yozing:",
        "summary": "Tekshiring:\n\n👤 {name}\n📞 {phone}\n✉️ {email}\n🗂 {cat}\n📌 {subject}\n\n{body}",
        "done": "✅ Murojaatingiz qabul qilindi!\nRaqami: <b>{num}</b>\nJavob shu yerga keladi. Qo‘shimcha ma’lumot bo‘lsa — shu chatga yozing.",
        "cancelled": "Bekor qilindi.", "none": "Sizda hali murojaat yo‘q.", "list": "Oxirgi murojaatlaringiz:", "added": "📎 Xabaringiz {num} murojaatiga qo‘shildi.",
        "reply": "💬 <b>{num}</b> bo‘yicha javob:\n\n{text}", "answer": "✍️ Javob yozish", "write_reply": "{num} bo‘yicha xabaringizni yozing:",
        "stage": {"new": "🆕 Yangi", "in_progress": "⏳ Jarayonda", "waiting": "💬 Javobingiz kutilmoqda", "resolved": "✅ Hal qilindi", "failed": "⛔ Rad etildi"},
        "contacts_text": "📍 {address}\n📞 {phones}\n✉️ {email}\n🕘 {hours}", "nocat": "Umumiy",
        "status": "🔔 <b>{num}</b> · murojaatingiz holati: <b>{stage}</b>", "resolved": "✅ <b>{num}</b> · murojaatingiz hal qilindi.",
        "comment": "💬 Izoh: {text}", "rate_ask": "Iltimos, xizmat sifatini 1 dan 5 gacha baholang:", "rate": "⭐ Baholash",
        "rate_thanks": "⭐ Bahoingiz uchun rahmat: <b>{stars} ({n}/5)</b>\nIstasangiz, fikringizni bitta xabar bilan yozib qoldiring.",
        "rate_saved": "📝 Fikringiz saqlandi. Rahmat!", "rated_already": "Bu murojaat allaqachon baholangan.",
        "open": "📄 {num}", "history": "Holat tarixi:", "last_comment": "💬 {text}", "your_rating": "Bahoingiz: {stars} ({n}/5)",
        "att_saved": "📎 Fayl qabul qilindi. Endi murojaat matnini yozing:", "files": "📎 Ilovalar: {n}", "file_big": "⚠️ {name} — fayl juda katta (20 MB dan ortiq), qabul qilinmadi.",
        "back_list": "⬅️ Murojaatlarim",
        "edit_me": "👤 Ism va telefonni o‘zgartirish", "keep": "✅ {v} (o‘zgarishsiz)", "saved_me": "👤 {name} · 📞 {phone}",
    },
    "ru": {
        "choose_lang": "Tilni tanlang · Выберите язык · Choose language",
        "welcome": "Здравствуйте! Это виртуальная приёмная — {uni}.\nОставьте вопрос, предложение или обращение — ответственный сотрудник ответит.",
        "new": "✍️ Новое обращение", "mine": "📂 Мои обращения", "site": "🌐 Сайт", "contacts": "☎️ Контакты", "lang": "🌐 Язык", "cancel": "❌ Отмена",
        "back": "⬅️ Назад", "menu": "🏠 Меню", "skip": "⏭ Пропустить", "use": "✅ {v}", "send": "✅ Отправить", "restart": "✏️ Заново",
        "ask_name": "1/6 · Напишите имя и фамилию:", "ask_phone": "2/6 · Номер телефона (например, +998 90 123 45 67):",
        "bad_phone": "Неверный номер. Пример: +998 90 123 45 67", "ask_email": "3/6 · Ваш email (необязательно):",
        "bad_email": "Неверный email. Напишите ещё раз или нажмите «Пропустить».", "ask_cat": "4/6 · В какой отдел обращение?",
        "ask_subject": "5/6 · Тема обращения (кратко):", "ask_body": "6/6 · Напишите текст обращения:",
        "summary": "Проверьте:\n\n👤 {name}\n📞 {phone}\n✉️ {email}\n🗂 {cat}\n📌 {subject}\n\n{body}",
        "done": "✅ Обращение принято!\nНомер: <b>{num}</b>\nОтвет придёт сюда. Если есть дополнения — напишите в этот чат.",
        "cancelled": "Отменено.", "none": "У вас пока нет обращений.", "list": "Ваши последние обращения:", "added": "📎 Сообщение добавлено к обращению {num}.",
        "reply": "💬 Ответ по <b>{num}</b>:\n\n{text}", "answer": "✍️ Ответить", "write_reply": "Напишите сообщение по {num}:",
        "stage": {"new": "🆕 Новое", "in_progress": "⏳ В работе", "waiting": "💬 Ожидается ваш ответ", "resolved": "✅ Решено", "failed": "⛔ Отклонено"},
        "contacts_text": "📍 {address}\n📞 {phones}\n✉️ {email}\n🕘 {hours}", "nocat": "Общий",
        "status": "🔔 <b>{num}</b> · статус вашего обращения: <b>{stage}</b>", "resolved": "✅ <b>{num}</b> · ваше обращение решено.",
        "comment": "💬 Комментарий: {text}", "rate_ask": "Пожалуйста, оцените качество обслуживания от 1 до 5:", "rate": "⭐ Оценить",
        "rate_thanks": "⭐ Спасибо за оценку: <b>{stars} ({n}/5)</b>\nЕсли хотите, напишите отзыв одним сообщением.",
        "rate_saved": "📝 Ваш отзыв сохранён. Спасибо!", "rated_already": "Это обращение уже оценено.",
        "open": "📄 {num}", "history": "История статусов:", "last_comment": "💬 {text}", "your_rating": "Ваша оценка: {stars} ({n}/5)",
        "att_saved": "📎 Файл получен. Теперь напишите текст обращения:", "files": "📎 Вложения: {n}", "file_big": "⚠️ {name} — файл слишком большой (более 20 МБ), не принят.",
        "back_list": "⬅️ Мои обращения",
        "edit_me": "👤 Изменить имя и телефон", "keep": "✅ {v} (без изменений)", "saved_me": "👤 {name} · 📞 {phone}",
    },
    "en": {
        "choose_lang": "Tilni tanlang · Выберите язык · Choose language",
        "welcome": "Hello! This is the virtual reception of {uni}.\nLeave your question, suggestion or request — the responsible staff member will reply.",
        "new": "✍️ New request", "mine": "📂 My requests", "site": "🌐 Website", "contacts": "☎️ Contacts", "lang": "🌐 Language", "cancel": "❌ Cancel",
        "back": "⬅️ Back", "menu": "🏠 Menu", "skip": "⏭ Skip", "use": "✅ {v}", "send": "✅ Send", "restart": "✏️ Start over",
        "ask_name": "1/6 · Your full name:", "ask_phone": "2/6 · Your phone number (e.g. +998 90 123 45 67):",
        "bad_phone": "Invalid phone number. Example: +998 90 123 45 67", "ask_email": "3/6 · Your email (optional):",
        "bad_email": "Invalid email. Type it again or press “Skip”.", "ask_cat": "4/6 · Which office is it for?",
        "ask_subject": "5/6 · Subject (short):", "ask_body": "6/6 · Write your message:",
        "summary": "Please check:\n\n👤 {name}\n📞 {phone}\n✉️ {email}\n🗂 {cat}\n📌 {subject}\n\n{body}",
        "done": "✅ Your request has been received!\nNumber: <b>{num}</b>\nThe reply will come here. If you have anything to add, just write in this chat.",
        "cancelled": "Cancelled.", "none": "You have no requests yet.", "list": "Your recent requests:", "added": "📎 Your message was added to {num}.",
        "reply": "💬 Reply on <b>{num}</b>:\n\n{text}", "answer": "✍️ Reply", "write_reply": "Write your message on {num}:",
        "stage": {"new": "🆕 New", "in_progress": "⏳ In progress", "waiting": "💬 Awaiting your reply", "resolved": "✅ Resolved", "failed": "⛔ Declined"},
        "contacts_text": "📍 {address}\n📞 {phones}\n✉️ {email}\n🕘 {hours}", "nocat": "General",
        "status": "🔔 <b>{num}</b> · your request status: <b>{stage}</b>", "resolved": "✅ <b>{num}</b> · your request has been resolved.",
        "comment": "💬 Comment: {text}", "rate_ask": "Please rate our service from 1 to 5:", "rate": "⭐ Rate",
        "rate_thanks": "⭐ Thank you for your rating: <b>{stars} ({n}/5)</b>\nIf you like, leave your feedback in one message.",
        "rate_saved": "📝 Your feedback has been saved. Thank you!", "rated_already": "This request has already been rated.",
        "open": "📄 {num}", "history": "Status history:", "last_comment": "💬 {text}", "your_rating": "Your rating: {stars} ({n}/5)",
        "att_saved": "📎 File received. Now write the text of your request:", "files": "📎 Attachments: {n}", "file_big": "⚠️ {name} — the file is too large (over 20 MB) and was not accepted.",
        "back_list": "⬅️ My requests",
        "edit_me": "👤 Change name and phone", "keep": "✅ {v} (unchanged)", "saved_me": "👤 {name} · 📞 {phone}",
    },
}
LANG_BTNS = [("uz", "🇺🇿 O‘zbekcha"), ("ru", "🇷🇺 Русский"), ("en", "🇬🇧 English")]
STEPS = ("name", "phone", "email", "cat", "subject", "body")  # to'liq so'rovnoma; ism va telefon saqlangan bo'lsa — faqat oxirgi uchtasi
STEP_RE = re.compile(r"^\d/\d · ")


def env_defaults() -> dict:
    return {"enabled": bool(os.environ.get("SITE_TELEGRAM_TOKEN")), "token": os.environ.get("SITE_TELEGRAM_TOKEN", ""), "username": "",
            "mode": os.environ.get("SITE_TELEGRAM_MODE", "polling"), "welcome": "", "ipv4": False}


def config(st) -> dict:
    cfg = env_defaults() | {k: v for k, v in (st.kv_get("telegram") or {}).items() if k in FIELDS}
    tg_net.set_forced(bool(cfg.get("ipv4")))  # «faqat IPv4» sozlamasi tarmoq qatlamiga
    return cfg


def public(cfg: dict) -> dict:
    return {k: v for k, v in cfg.items() if k != "token"} | {"has_token": bool(cfg.get("token"))}


def clean(data: dict, cur: dict) -> dict:
    out = dict(cur)
    if "enabled" in data:
        out["enabled"] = bool(data["enabled"])
    if data.get("token"):
        tok = str(data["token"]).strip()
        if not re.fullmatch(r"\d{5,15}:[A-Za-z0-9_-]{30,60}", tok):
            raise ValueError("telegram_bad_token")
        out["token"] = tok
    if data.get("mode") in ("polling", "webhook"):
        out["mode"] = data["mode"]
    if "welcome" in data:
        out["welcome"] = str(data.get("welcome") or "").strip()[:1500]
    if "ipv4" in data:
        out["ipv4"] = bool(data["ipv4"])
    return out


def ready(cfg: dict) -> bool:
    return bool(cfg.get("enabled") and cfg.get("token"))


def sent_out(st, chat_id, mid) -> None:
    """Chatga bildirishnoma (yangi xabar) ketdi: endi panel eng pastda emas — keyingi kiritishda panel pastga ko'chiriladi."""
    try:
        with st._tx() as cx:  # noqa: SLF001
            cx.execute("UPDATE tg_chats SET tail=%s WHERE chat_id=%s", (int(mid or -1), str(chat_id)))
    except Exception:  # noqa: BLE001 — bildirishnoma yuborilgan, belgi muhim emas
        pass



def ensure_schema(st) -> None:
    from . import tg_publish, tg_student  # noqa: PLC0415

    with st._tx() as c:
        c.execute("CREATE TABLE IF NOT EXISTS tg_chats (chat_id TEXT PRIMARY KEY, lang TEXT, state TEXT, data TEXT, tg_user TEXT, updated TEXT)")
        # panel — botning jonli xabari (navigatsiya shu xabarda); tail — chatga bot yuborgan eng oxirgi xabar (panel = tail: panel eng pastda)
        c.execute("ALTER TABLE tg_chats ADD COLUMN IF NOT EXISTS panel BIGINT")
        c.execute("ALTER TABLE tg_chats ADD COLUMN IF NOT EXISTS tail BIGINT")
    tg_publish.ensure_schema(st)
    tg_student.ensure_schema(st)


# bot oladigan yangilanishlar: shaxsiy chat xabarlari, tugmalar va guruh/kanalga qo'shilish (my_chat_member)
ALLOWED_UPDATES = ["message", "callback_query", "my_chat_member"]

class Conflict(RuntimeError):
    """getUpdates → 409: shu token bilan boshqa joyda ham bot ishlayapti (yoki webhook o'rnatilgan)."""


CONFLICT_TEXT = ("Bu token bilan boshqa joyda ham bot ishlayapti (409): eski nusxa, test serveri yoki boshqa sayt. "
                 "Ularni to‘xtating yoki @BotFather'dan yangi token oling.")


class Api:
    """Bot API. Ulanishlar jarayon bo'yicha umumiy (tg_net: keep-alive puli, IPv6 → IPv4 zaxirasi, o'lchovlar);
    `timeout` — javob kutish (s). Xato (`ok: false`) — RuntimeError("telegram: <tavsif>"), 409 — Conflict."""

    def __init__(self, token: str, timeout: float = tg_net.READ):
        self.base = f"https://api.telegram.org/bot{token}/"
        self.timeout = timeout

    @staticmethod
    def _result(r: httpx.Response, method: str):
        try:
            j = r.json()
        except ValueError as e:
            tg_net.mark_error(method, f"HTTP {r.status_code}")
            raise RuntimeError(f"telegram: HTTP {r.status_code}") from e
        if not j.get("ok"):
            desc = str(j.get("description") or r.status_code)
            tg_net.mark_error(method, desc)
            if j.get("error_code") == 409 or r.status_code == 409:
                raise Conflict(f"telegram: {desc}")
            raise RuntimeError(f"telegram: {desc}")
        return j.get("result")

    def call(self, method: str, timeout: float | None = None, **params):
        read = timeout or self.timeout
        kind = "api"
        if method == "getUpdates":  # long polling: Telegram javobni `timeout` soniyagacha ushlab turadi
            kind, read = "poll", max(read, float(params.get("timeout") or 0) + 10)
        r = tg_net.request(kind, method, "POST", self.base + method, httpx.Timeout(read, connect=tg_net.CONNECT, pool=10.0),
                           json={k: v for k, v in params.items() if v is not None})
        return self._result(r, method)

    def upload(self, method: str, files: dict, **params):
        """multipart/form-data: fayllar {maydon: (nom, bayt, mime)}; murakkab qiymatlar (reply_markup, media) — JSON matn."""
        data = {k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v)) for k, v in params.items() if v is not None}
        r = tg_net.request("api", method, "POST", self.base + method, httpx.Timeout(max(self.timeout, tg_net.FILE), connect=tg_net.CONNECT, pool=10.0),
                           data=data, files=files)
        return self._result(r, method)

    def download(self, file_id: str, limit: int = MAX_FILE) -> tuple[bytes, str]:
        """getFile → fayl mazmuni (Bot API orqali 20 MB gacha). Qaytadi: (bayt, file_path)."""
        info = self.call("getFile", file_id=file_id) or {}
        path = info.get("file_path") or ""
        if not path:
            raise RuntimeError("telegram: no file_path")
        if int(info.get("file_size") or 0) > limit:
            raise ValueError("too_large")
        r = tg_net.request("api", "getFile/download", "GET", self.base.replace("/bot", "/file/bot", 1) + path,
                           httpx.Timeout(tg_net.FILE, connect=tg_net.CONNECT, pool=10.0))
        if r.status_code != 200:
            raise RuntimeError(f"telegram: file HTTP {r.status_code}")
        if len(r.content) > limit:
            raise ValueError("too_large")
        return r.content, path


def kb(rows: list[list[tuple[str, str]]]) -> dict:
    """Inline klaviatura: [[(matn, callback_data | url:…)]]."""
    return {"inline_keyboard": [[({"text": t, "url": d[4:]} if d.startswith("url:") else {"text": t, "callback_data": d[:64]}) for t, d in row] for row in rows if row]}


def update_chat(upd: dict) -> str:
    """Yangilanish qaysi chatga tegishli (bitta chat yangilanishlari ketma-ket, turli chatlar — parallel)."""
    for k in ("message", "edited_message", "my_chat_member", "channel_post"):
        if isinstance(upd.get(k), dict):
            return str(((upd[k].get("chat") or {}).get("id")) or "_")
    q = upd.get("callback_query")
    if isinstance(q, dict):
        return str(((q.get("message") or {}).get("chat") or {}).get("id") or (q.get("from") or {}).get("id") or "_")
    return "_"


def update_kind(upd: dict) -> str:
    """O'lchovlar uchun qisqa tur: «tugma new», «tugma s:today», «buyruq /start», «matn», «fayl» …"""
    q = upd.get("callback_query")
    if isinstance(q, dict):
        d = str(q.get("data") or "").split(":")
        return "tugma " + ":".join(d[:2] if d[0] == "s" else d[:1])
    m = upd.get("message") or upd.get("edited_message")
    if isinstance(m, dict):
        t = str(m.get("text") or "")
        if t.startswith("/"):
            return "buyruq " + t.split()[0][:16]
        if m.get("contact"):
            return "kontakt"
        if any(m.get(k) for k in ("photo", "document", "video", "audio", "voice", "video_note", "animation")):
            return "fayl"
        return "matn"
    return next((k for k in upd if k != "update_id"), "?")


class Dispatcher:
    """Yangilanishlar puli: bitta chat ichida qat'iy ketma-ket (navbat), turli chatlar — parallel (`workers` ta oqim).
    Bitta foydalanuvchining sekin amali (fayl yuklash, pochta, osilib qolgan chaqiruv) boshqalarni kutdirmaydi.

    Tasdiqlash (offset) semantikasi: long polling keyingi getUpdates'da offset'ni darhol oshiradi — yangilanish Telegram'dan
    «olindi» deb hisoblanadi, u xotiradagi navbatga tushgan bo'ladi. Jarayon to'satdan o'lsa, navbatda turganlari yo'qolishi mumkin
    (ko'pi bilan bir necha soniyalik); buning evaziga qayta ishlash ham bo'lmaydi — ishlovchilar idempotent emas (murojaat yaratish,
    chiptaga xabar qo'shish), takroriy ishlov foydalanuvchiga ikki marta murojaat bo'lib ko'rinadi. Shuning uchun «ko'pi bilan bir marta»
    tanlangan; Telegram webhook'ni qayta yuborsa (yoki polling/webhook almashganda) — so'nggi update_id'lar bo'yicha takror tashlanadi."""

    def __init__(self, fn, workers: int = 4, name: str = "tg-upd"):
        self.fn = fn  # (update, kutgan_ms) -> None
        self.workers = max(1, workers)
        self.name = name
        self.lock = threading.Lock()
        self.pending: dict[str, deque] = {}  # chat → navbat; kalit bor = chat ishlanmoqda yoki tayyorlar navbatida
        self.ready: queue.Queue = queue.Queue()
        self.threads: list[threading.Thread] = []
        self.seen: deque = deque(maxlen=2000)
        self.seen_set: set = set()
        self.busy = 0

    def submit(self, upd: dict) -> bool:
        """Navbatga qo'yish. False — takroriy update_id (tashlandi)."""
        uid = upd.get("update_id")
        key = update_chat(upd)
        with self.lock:
            if uid is not None:
                if uid in self.seen_set:
                    return False
                if len(self.seen) == self.seen.maxlen:
                    self.seen_set.discard(self.seen[0])
                self.seen.append(uid)
                self.seen_set.add(uid)
            dq = self.pending.get(key)
            if dq is None:
                self.pending[key] = deque([(time.monotonic(), upd)])
                self.ready.put(key)
            else:
                dq.append((time.monotonic(), upd))
            self._ensure()
        return True

    def _ensure(self) -> None:
        self.threads = [t for t in self.threads if t.is_alive()]
        while len(self.threads) < self.workers:
            t = threading.Thread(target=self._work, daemon=True, name=f"{self.name}-{len(self.threads)}")
            self.threads.append(t)
            t.start()

    def _work(self) -> None:
        while True:
            key = self.ready.get()
            with self.lock:
                at, upd = self.pending[key][0]
                self.busy += 1
            try:
                self.fn(upd, (time.monotonic() - at) * 1000)
            except Exception:  # noqa: BLE001 — ishlovchi o'zi xatoni yozadi; oqim o'lmasin
                pass
            finally:
                with self.lock:
                    self.busy -= 1
                    dq = self.pending[key]
                    dq.popleft()
                    if dq:
                        self.ready.put(key)  # shu chatning keyingisi — navbat oxiriga (boshqa chatlar ham ulgursin)
                    else:
                        del self.pending[key]

    def backlog(self) -> int:
        with self.lock:
            return sum(len(d) for d in self.pending.values())

    def drain(self, timeout: float = 10.0) -> bool:
        """Navbat bo'shaguncha kutish (testlar, to'xtatish)."""
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if not self.backlog():
                return True
            time.sleep(0.01)
        return not self.backlog()


_SIDE = ThreadPoolExecutor(max_workers=8, thread_name_prefix="tg-side")  # javobni kutish shart bo'lmagan chaqiruvlar (parallel)


class Bot:
    def __init__(self, st, desk_fn, svc_fn):
        self.st = st
        self.desk_fn = desk_fn  # () -> Desk
        self.svc_fn = svc_fn  # () -> Service
        self._t: threading.Thread | None = None
        self._stop = threading.Event()
        self.last_error = ""
        self._wake = threading.Event()
        self.polling = False
        self._tl = threading.local()  # joriy yangilanishning fon chaqiruvlari (handle oxirida kutiladi)
        self.dispatcher = Dispatcher(self._run, workers=int(os.environ.get("SITE_TELEGRAM_WORKERS") or 4))
        ensure_schema(st)
        from .tg_student import StudentBot  # noqa: PLC0415

        self.stu = StudentBot(self)  # bog'langan talaba: menyu, bog'lash oqimi

    # --- holat
    def chat(self, cid: str) -> dict:
        r = self.st._q("SELECT * FROM tg_chats WHERE chat_id=%s", (str(cid),))
        if r:
            d = dict(r[0])
            return {"chat_id": d["chat_id"], "lang": d["lang"] or "", "state": d["state"] or "", "data": json.loads(d["data"] or "{}"),
                    "tg_user": json.loads(d["tg_user"] or "{}"), "panel": int(d.get("panel") or 0), "tail": int(d.get("tail") or 0)}
        return {"chat_id": str(cid), "lang": "", "state": "", "data": {}, "tg_user": {}, "panel": 0, "tail": 0}

    def save_chat(self, c: dict) -> None:
        with self.st._tx() as cx:
            cx.execute("INSERT INTO tg_chats(chat_id, lang, state, data, tg_user, updated) VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(chat_id) DO UPDATE SET "
                       "lang=excluded.lang, state=excluded.state, data=excluded.data, tg_user=excluded.tg_user, updated=excluded.updated",
                       (c["chat_id"], c["lang"], c["state"], json.dumps(c["data"], ensure_ascii=False), json.dumps(c["tg_user"], ensure_ascii=False),
                        datetime.now(timezone.utc).isoformat(timespec="seconds")))

    def api(self) -> Api:
        return Api(config(self.st)["token"])

    def L(self, c: dict) -> dict:
        return T.get(c["lang"] or "uz", T["uz"])

    def send(self, cid, text: str, markup: dict | None = None) -> dict | None:
        """Yangi xabar — bildirishnomalar uchun (operator javobi, holat, kutubxona …). Navigatsiya — `panel()`."""
        r = self.api().call("sendMessage", chat_id=cid, text=text[:4000], parse_mode="HTML", reply_markup=markup, disable_web_page_preview=True)
        sent_out(self.st, cid, (r or {}).get("message_id"))
        return r

    # --- yagona «panel» xabari
    # Chatda botning bitta jonli xabari bor — panel (id: tg_chats.panel). Menyu, bo'limlar, sahifalash, sozlamalar, til, murojaat bosqichlari,
    # tasdiqlash, «Mening murojaatlarim», xato/tekshiruv matnlari — hammasi shu xabarni tahrirlaydi (editMessageText), yangi xabar yuborilmaydi.
    # Foydalanuvchi yozgan kiritish (ism, telefon, email, mavzu, kod, baho izohi, /start, /menu …) qabul qilinadi va o'chiriladi (deleteMessage).
    # Murojaat matni, ilovalar va ochiq murojaatga yozilgan xabarlar — yozishma, o'chirilmaydi: panel ularning ostiga ko'chadi
    # (yangisi yuboriladi, eskisi o'chiriladi). Bildirishnomalar (javob, holat, xulosa, eslatma …) — doim yangi xabar, panelga tegmaydi.
    def _ctx(self, c: dict) -> dict:
        """Joriy yangilanish: {"q": callback} yoki {"mid": foydalanuvchi xabari, "keep": o'chirilmasin, "fresh": buyruq, "inplace": joyida}."""
        return c.setdefault("_ctx", {})

    def keep(self, c: dict) -> None:
        """Foydalanuvchi xabari yozishma (murojaat matni, ilova, chiptaga xabar) — o'chirilmaydi, panel uning ostiga ko'chadi."""
        self._ctx(c)["keep"] = True

    def note(self, c: dict, text: str) -> None:
        """Panel matni boshidagi qisqa izoh (xato, ogohlantirish) — alohida xabar emas."""
        c.setdefault("_notes", []).append(text)

    def toast(self, c: dict, text: str, alert: bool = False) -> None:
        """Tugma bosilganda vaqtinchalik xabar (answerCallbackQuery): chatda qolmaydi. Tugmaga javob ishlov boshida yuboriladi
        (`answer`, matni `early_toast`da), shuning uchun keyin aniqlangan boshqa matn — panel izohi bo'ladi."""
        x = self._ctx(c)
        if x.get("answered"):
            if text != x.get("toast"):
                self.note(c, ("⚠️ " if alert else "") + text)
            return
        x.update(toast=text, alert=alert)

    def early_toast(self, c: dict, data: str) -> tuple[str, bool]:
        """Tugma javobidagi matn — oldindan, arzon aniqlanadigan hollar (bekor qilish, allaqachon baholangan)."""
        if data == "cancel":
            return self.L(c)["cancelled"], False
        if data == "lk:no":
            from .tg_student import tx  # noqa: PLC0415

            return tx(c["lang"] or "uz")["aborted"], False
        if data.startswith("rate:"):
            parts = data.split(":")
            t = self._own(c, parts[1]) if len(parts) == 3 else None
            if t and t.get("rating"):
                return self.L(c)["rated_already"], True
        return "", False

    def answer(self, c: dict, q: dict, data: str) -> None:
        """answerCallbackQuery — darhol, ishlovdan oldin (tugmadagi «soat» to'xtaydi); tarmoq chaqiruvi fon oqimida, panel tahriri bilan parallel."""
        x = self._ctx(c)
        text, alert = self.early_toast(c, data)
        x.update(answered=True, toast=text, alert=alert)
        api = self.api()

        def go():
            try:
                api.call("answerCallbackQuery", callback_query_id=q["id"], text=text[:200] or None, show_alert=True if alert else None)
            except Exception:  # noqa: BLE001 — eskirgan tugma (15 daqiqadan ko'p) va h.k.
                pass

        self.bg(go)

    def bg(self, fn, *a) -> None:
        """Javobi kerak bo'lmagan chaqiruv (tugma javobi, kiritishni o'chirish, eski panelni o'chirish) — parallel fon oqimida.
        Joriy yangilanish (handle) tugashidan oldin kutiladi: keyingi yangilanish uni ko'radi, testlarda natija aniq."""
        fut = _SIDE.submit(fn, *a)
        side = getattr(self._tl, "side", None)
        if side is not None:
            side.append(fut)

    def delete(self, cid, mid) -> bool:
        if not mid:
            return False
        try:
            self.api().call("deleteMessage", chat_id=cid, message_id=int(mid))
            return True
        except Exception:  # noqa: BLE001 — allaqachon o'chirilgan yoki 48 soatdan eski xabar: e'tiborsiz
            return False

    def edit(self, cid, mid, text: str, markup: dict | None = None) -> bool:
        """editMessageText; «message is not modified» — muvaffaqiyat. False — tahrirlab bo'lmadi (topilmadi, juda eski, media …)."""
        try:
            self.api().call("editMessageText", chat_id=cid, message_id=int(mid), text=text[:4000], parse_mode="HTML", reply_markup=markup,
                            disable_web_page_preview=True)
            return True
        except RuntimeError as e:
            return "not modified" in str(e)

    def consume(self, c: dict) -> None:
        """Foydalanuvchining kiritishi (yozishma bo'lmasa) o'chiriladi — bir marta."""
        x = self._ctx(c)
        if x.get("mid") and not x.get("keep") and not x.get("deleted"):
            x["deleted"] = True
            self.bg(self.delete, c["chat_id"], x["mid"])  # panel tahriri bilan parallel

    def set_panel(self, c: dict, mid, sent: bool = False) -> None:
        """Panel id'sini saqlash; `sent` — u hozir yuborildi, demak chatdagi eng pastki xabar (tail)."""
        c["panel"] = int(mid or 0)
        if sent:
            c["tail"] = c["panel"]
        with self.st._tx() as cx:  # tail faqat yangi yuborilganda yoziladi (oraliqda kelgan bildirishnoma belgisi ustidan yozilmasin)
            cx.execute("INSERT INTO tg_chats(chat_id, lang, state, data, tg_user, updated, panel, tail) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) "
                       "ON CONFLICT(chat_id) DO UPDATE SET panel=excluded.panel" + (", tail=excluded.tail" if sent else ""),
                       (c["chat_id"], c["lang"], c["state"], json.dumps(c["data"], ensure_ascii=False), json.dumps(c["tg_user"], ensure_ascii=False),
                        datetime.now(timezone.utc).isoformat(timespec="seconds"), c["panel"] or None, c["panel"] if sent else None))

    def panel(self, c: dict, text: str, markup: dict | None = None) -> None:
        """Ekranni ko'rsatish. Tahrirlanadi: panelning o'z tugmasi bosilganda; kiritish o'chirilganda — agar panel chatdagi eng pastki
        xabar bo'lsa (undan keyin bot hech narsa yubormagan: tail = panel); bir yangilanishdagi ikkinchi chaqiruvda. Yangi panel yuborilib,
        eskisi o'chiriladi: buyruq (/start, /menu — foydalanuvchi tarixni tozalagan bo'lishi mumkin), saqlanadigan xabar (murojaat matni,
        ilova), panel ustida bildirishnoma bo'lsa, bildirishnoma tugmasi bosilganda (uning matni qoladi), panel yo'q yoki tahrirlab bo'lmasa."""
        cid, x = c["chat_id"], self._ctx(c)
        notes = c.pop("_notes", None)
        if notes:
            text = "\n".join(notes) + "\n\n" + text
        self.consume(c)
        cur = int(c.get("panel") or 0)
        target, move = cur, False
        if x.get("done") or x.get("inplace"):
            pass
        elif x.get("fresh"):
            move = True
        elif "q" in x:
            mid = int(((x["q"] or {}).get("message") or {}).get("message_id") or 0)
            if mid and cur and mid != cur:
                move = True  # bildirishnoma (javob, holat, xulosa) ostidagi tugma: u o'zgarmaydi, panel pastga ko'chadi
            elif mid:
                target = mid  # panel (yoki avvalgi versiyadan qolgan menyu — panel deb olinadi)
        elif x.get("mid"):
            last = int(c.get("tail") or 0) == cur  # panel chatdagi eng pastki bot xabari
            # o'chirilgan kiritish: panel eng pastda bo'lsa — joyida; saqlanadigan xabar: panel undan keyin (albomning keyingi qismi) bo'lsa — joyida
            move = not last or (bool(x.get("keep")) and x["mid"] > cur)
        x["done"] = True
        if target and not move and self.edit(cid, target, text, markup):
            if target != cur:
                self.set_panel(c, target)
            return
        r = self.api().call("sendMessage", chat_id=cid, text=text[:4000], parse_mode="HTML", reply_markup=markup, disable_web_page_preview=True)
        self.set_panel(c, (r or {}).get("message_id"), sent=True)
        if cur and cur != c["panel"]:
            self.bg(self.delete, cid, cur)

    # --- ekranlar
    def main_menu(self, c: dict) -> dict:
        u = self.stu.user_of(c)
        if u:  # bog'langan foydalanuvchi — kabinet menyusi (murojaatlar ham shu yerda)
            return self.stu.home_kb(c, u)
        L = self.L(c)
        site = self.svc_fn().base_url()
        from .tg_student import tx  # noqa: PLC0415

        rows = [[(L["new"], "new")], [(L["mine"], "mine")], [(L["contacts"], "contacts"), (L["lang"], "lang")], [(tx(c["lang"])["login"], "login")]]
        if site.startswith("https://"):
            rows.append([(L["site"], f"url:{site}/?lang={c['lang'] or 'uz'}")])
        return kb(rows)

    def welcome_text(self, c: dict) -> str:
        L = self.L(c)
        uni = self.svc_fn().uni_l(c["lang"] or None).get("name") or "University"
        own = config(self.st).get("welcome")
        return (own + "\n\n" if own else "") + L["welcome"].format(uni=uni)

    def welcome(self, c: dict) -> None:
        """Bosh ekran (panelda): bog'langan foydalanuvchi — kabinet menyusi, aks holda — qabulxona menyusi."""
        u = self.stu.user_of(c)
        if u:
            self.stu.home(c, u)
            return
        self.panel(c, self.welcome_text(c), self.main_menu(c))

    def choose_lang(self, c: dict) -> None:
        self.panel(c, T["uz"]["choose_lang"], kb([[(n, f"lang:{k}")] for k, n in LANG_BTNS]))

    # --- murojaatchi ma'lumotlari: ism, telefon, email bir marta so'raladi va shu chat uchun eslab qolinadi (tg_chats.data.profile)
    def profile(self, c: dict) -> dict:
        p = c["data"].get("profile") or {}
        if p.get("name") and p.get("phone"):
            return p
        u = self.stu.user_of(c)
        if u:  # bog'langan foydalanuvchi: ism kabinetdan, telefon — saqlangan profildan
            ph = str((u.get("data") or {}).get("phone") or "").strip()
            if not PHONE_RE.match(ph):
                ph = next((t["requester_phone"] for t in self.desk_fn().by_chat(c["chat_id"], open_only=False) if t.get("requester_phone")), "")
            return {"name": u["name"], "phone": ph, "email": u.get("email") or ""}
        # avvalgi versiyada profil saqlanmagan — shu chatdan kelgan oxirgi murojaatdagi ma'lumotlar
        for t in self.desk_fn().by_chat(c["chat_id"], open_only=False):
            if t.get("requester_name") and t.get("requester_phone"):
                return {"name": t["requester_name"], "phone": t["requester_phone"], "email": t.get("requester_email") or ""}
        return {}

    @staticmethod
    def remember(c: dict) -> None:
        d = c["data"]
        if d.get("name") and d.get("phone"):
            d["profile"] = {"name": d["name"], "phone": d["phone"], "email": d.get("email") or ""}

    @staticmethod
    def fresh(c: dict) -> None:
        """Murojaat qoralamasini tozalash; saqlangan ism/telefon qoladi."""
        prof = c["data"].get("profile")
        c["data"] = {"profile": prof} if prof else {}

    def prompt(self, c: dict, step: str) -> str:
        """Savol matni va qadam raqami: to'liq so'rovnoma 1/6…6/6, ma'lumotlar saqlangan bo'lsa 1/3…3/3; tahrirlashda raqamsiz."""
        d = c["data"]
        text = STEP_RE.sub("", self.L(c)["ask_" + step])
        steps = STEPS[3:] if d.get("quick") else STEPS
        if d.get("edit") or step not in steps:
            return text
        return f"{steps.index(step) + 1}/{len(steps)} · {text}"

    def ask(self, c: dict, step: str, error: str = "") -> None:
        """Murojaat bosqichi (panelda). `error` — tekshiruv xatosi, savol ustida ko'rsatiladi."""
        L, d = self.L(c), c["data"]
        c["state"] = step
        self.save_chat(c)
        cancel = [(L["cancel"], "cancel")]
        q = self.prompt(c, step)
        edit = bool(d.get("edit"))
        rows: list = []
        if step == "name":
            u = c["tg_user"]
            full = " ".join(x for x in (u.get("first_name"), u.get("last_name")) if x).strip()
            rows = [[(L["keep"].format(v=d["name"][:40]), "keep_name")]] if edit and d.get("name") else []
            if full and full != d.get("name"):
                rows.append([(L["use"].format(v=full[:40]), "use_name")])
        elif step == "phone":
            rows = [[(L["keep"].format(v=d["phone"][:40]), "keep_phone")]] if edit and d.get("phone") else []
        elif step == "email":
            rows = ([[(L["keep"].format(v=d["email"][:40]), "keep_email")]] if edit and d.get("email") else []) + [[(L["skip"], "skip_email")]]
        elif step == "cat":
            cats = [x for x in self.desk_fn().categories() if x["active"]]
            rows = [[(x["title"][:40], f"cat:{x['id']}")] for x in cats[:12]]
            if d.get("quick"):
                q = L["saved_me"].format(name=esc(d.get("name")), phone=esc(d.get("phone"))) + "\n\n" + q
        if error:
            self.note(c, "⚠️ " + error)
        self.panel(c, q, kb(rows + [cancel]))

    def after_email(self, c: dict) -> None:
        """Ma'lumotlar kiritildi: tahrirlash bo'lsa — saqlanadi va tasdiqlashga qaytadi, aks holda — bo'lim tanlash."""
        if c["data"].pop("edit", False):
            self.remember(c)
            self.summary(c)
        else:
            self.ask(c, "cat")

    def summary(self, c: dict) -> None:
        L, d = self.L(c), c["data"]
        cat = self.desk_fn().category(d.get("cat"))
        c["state"] = "confirm"
        self.save_chat(c)
        e = lambda v: esc(v or "—")  # noqa: E731
        text = L["summary"].format(name=e(d.get("name")), phone=e(d.get("phone")), email=e(d.get("email")),
                                   cat=e((cat or {}).get("title") or L["nocat"]), subject=e(d.get("subject")), body=e(d.get("body")))
        if d.get("files"):
            text += "\n\n" + L["files"].format(n=len(d["files"]))
        self.panel(c, text, kb([[(L["send"], "send")], [(L["edit_me"], "edit_me")], [(L["restart"], "new"), (L["cancel"], "cancel")]]))

    # --- yangilanishlarni qayta ishlash
    def dispatch(self, upd: dict) -> bool:
        """Polling va webhook: yangilanish pulga (chat bo'yicha ketma-ket, chatlar orasida parallel) — darhol qaytadi."""
        return self.dispatcher.submit(upd)

    def _run(self, upd: dict, wait_ms: float = 0.0) -> None:
        try:
            self.handle(upd, wait_ms)
        except Exception as e:  # noqa: BLE001
            self.last_error = f"{type(e).__name__}: {e}"

    def handle(self, upd: dict, wait_ms: float = 0.0) -> None:
        """Bitta yangilanish (sinxron: qaytganda barcha natijalar, fon chaqiruvlari ham, tayyor). Vaqti o'lchanadi (tg_net.stats)."""
        t0 = time.perf_counter()
        prev = getattr(self._tl, "side", None)
        self._tl.side = side = []
        try:
            self._handle(upd)
        finally:
            if side:
                _wait_all(side, timeout=30)
            self._tl.side = prev
            tg_net.handled(update_kind(upd), (time.perf_counter() - t0) * 1000, wait_ms)

    def _handle(self, upd: dict) -> None:
        if "my_chat_member" in upd:  # bot guruhga qo'shildi / chiqarildi, kanalda administrator qilindi
            from . import tg_publish  # noqa: PLC0415

            tg_publish.on_member(self.st, upd["my_chat_member"])
            return
        if "callback_query" in upd:
            q = upd["callback_query"]
            msg = q.get("message") or {}
            if (msg.get("chat") or {}).get("type", "private") != "private":  # guruh va kanallarda bot faqat e'lon qiladi
                return
            cid = str((msg.get("chat") or {}).get("id") or q["from"]["id"])
            c = self.chat(cid)
            c["tg_user"] = {k: q["from"].get(k) for k in ("id", "first_name", "last_name", "username")}
            c["_ctx"] = {"q": q}
            data = q.get("data") or ""
            self.answer(c, q, data)  # birinchi navbatda: tugmadagi «soat» darhol to'xtaydi
            if c["state"] == "login_phone" and data != "login:phone":  # raqam kutilayotgan edi — pastki klaviatura olib tashlanadi
                self.stu.drop_kb(c)
                c["state"] = ""
                self.save_chat(c)
            self.on_button(c, data, q)
            return
        msg = upd.get("message") or upd.get("edited_message")
        if msg and msg.get("migrate_to_chat_id"):  # guruh superguruhga aylandi — id o'zgaradi
            from . import tg_publish  # noqa: PLC0415

            tg_publish.migrate(self.st, msg["chat"]["id"], msg["migrate_to_chat_id"])
            return
        if not msg or (msg.get("chat") or {}).get("type") != "private":  # guruhdagi oddiy xabarlarga javob berilmaydi
            return
        c = self.chat(str(msg["chat"]["id"]))
        c["tg_user"] = {k: (msg.get("from") or {}).get(k) for k in ("id", "first_name", "last_name", "username")}
        # tahrirlangan eski xabar o'chirilmaydi
        c["_ctx"] = {"mid": int(msg.get("message_id") or 0), "keep": "message" not in upd}
        try:
            self.on_message(c, msg)
        finally:
            self.consume(c)  # panel chizilmagan holatda ham (stiker, keraksiz fayl) kiritish chatda qolmaydi

    def on_message(self, c: dict, msg: dict) -> None:
        from .tg_student import tx  # noqa: PLC0415

        x = self._ctx(c)
        text = (msg.get("text") or msg.get("caption") or "").strip()
        if c["state"] == "login_phone":  # «Raqam orqali»: faqat Telegram tasdiqlagan o'z kontakti
            if msg.get("contact"):
                self.stu.on_contact(c, msg)
                return
            self.stu.drop_kb(c)  # boshqa narsa yozildi — vaqtinchalik xabar va pastki klaviatura olib tashlanadi
            c["state"] = ""
            self.save_chat(c)
            if text == tx(c["lang"])["cancel"]:
                x["inplace"] = True
                self.note(c, tx(c["lang"])["aborted"])
                self.welcome(c)
                return
        if text.split(" ", 1)[0] in ("/start", "/menu", "/help"):
            x["fresh"] = True  # buyruq: eski panel o'chiriladi, yangisi pastda
        if text.startswith("/start link_"):  # kabinetdagi «Telegram'ni ulash» (bir martalik havola) → tasdiqlash
            self.stu.start_token(c, text.split("link_", 1)[1])
            return
        if text.startswith("/start lib_"):  # avvalgi kutubxona havolasi — umumiy bog'lashga
            self.stu.start_lib_token(c, text.split("lib_", 1)[1])
            return
        if c["state"] == "login_code" and text and not text.startswith("/"):
            self.stu.on_code(c, text)
            return
        if text.startswith("/start") and c["lang"] and self.stu.user_of(c):
            c["state"] = ""
            self.save_chat(c)
            self.welcome(c)
            return
        if text.startswith("/start") or not c["lang"]:
            c["state"] = ""
            self.save_chat(c)
            self.choose_lang(c)
            return
        if text in ("/menu", "/help"):
            c["state"] = ""
            self.save_chat(c)
            self.welcome(c)
            return
        self.on_text(c, text, msg)

    def on_button(self, c: dict, data: str, q: dict | None = None) -> None:
        L = self.L(c)
        if self.stu.on_button(c, data, q):
            return
        if data == "menu":
            c["state"] = ""
            self.fresh(c)
            self.save_chat(c)
            self.welcome(c)
            return
        if data.startswith("lang:"):
            c["lang"] = data[5:] if data[5:] in T else "uz"
            c["state"] = ""
            self.save_chat(c)
            self.welcome(c)
        elif data == "lang":
            self.choose_lang(c)
        elif data == "new":
            self.fresh(c)
            p = self.profile(c)
            if p and p.get("phone"):  # ism va telefon avval kiritilgan — so'ralmaydi
                c["data"] |= {"name": p["name"], "phone": p["phone"], "email": p.get("email") or "", "quick": True}
                self.ask(c, "cat")
            elif p and p.get("name"):  # bog'langan talaba: ism ma'lum — telefondan boshlanadi
                c["data"] |= {"name": p["name"], "email": p.get("email") or ""}
                self.ask(c, "phone")
            else:
                self.ask(c, "name")
        elif data == "edit_me" and c["state"] == "confirm":
            c["data"]["edit"] = True
            self.ask(c, "name")
        elif data == "use_name" and c["state"] == "name":
            u = c["tg_user"]
            c["data"]["name"] = " ".join(x for x in (u.get("first_name"), u.get("last_name")) if x).strip()[:120]
            self.ask(c, "phone")
        elif data == "keep_name" and c["state"] == "name" and c["data"].get("name"):
            self.ask(c, "phone")
        elif data == "keep_phone" and c["state"] == "phone" and c["data"].get("phone"):
            self.ask(c, "email")
        elif data in ("skip_email", "keep_email") and c["state"] == "email":
            if data == "skip_email":
                c["data"]["email"] = ""
            self.after_email(c)
        elif data.startswith("cat:") and c["state"] == "cat":
            c["data"]["cat"] = data[4:]
            self.ask(c, "subject")
        elif data == "send" and c["state"] == "confirm":
            self.submit(c)
        elif data == "cancel":
            c["state"] = ""
            self.fresh(c)
            self.save_chat(c)
            self.toast(c, L["cancelled"])
            self.welcome(c)
        elif data == "mine":
            self.my_list(c)
        elif data.startswith("view:"):
            self.view(c, data[5:])
        elif data.startswith("rateask:"):
            t = self._own(c, data[8:])
            if t and not t.get("rating"):
                self.panel(c, L["rate_ask"], kb([*self.stars_rows(t), [(L["back"], f"view:{t['id']}")]]))
            else:
                self.view(c, data[8:])
        elif data.startswith("rate:"):
            self.on_rate(c, data, q)
        elif data.startswith("reply:"):
            c["state"] = "reply:" + data[6:]
            self.save_chat(c)
            t = self.desk_fn().get(data[6:])
            self.panel(c, L["write_reply"].format(num=f"UNI-{(t or {}).get('number', '')}"), kb([[(L["cancel"], "cancel")]]))
        elif data == "contacts":
            u = self.svc_fn().uni_l(c["lang"] or None)
            self.panel(c, L["contacts_text"].format(address=u.get("address") or "—", phones=", ".join(u.get("phones") or []) or "—",
                                                    email=u.get("email") or "—", hours=u.get("hours") or "—"), kb([[(L["menu"], "menu")]]))
        else:
            self.welcome(c)

    def _own(self, c: dict, tid: str) -> dict | None:
        t = self.desk_fn().get(tid)
        return t if t and t.get("tg_chat") == c["chat_id"] else None

    # --- ilovalar: kiruvchi
    @staticmethod
    def media_of(msg: dict) -> list[dict]:
        """Xabardagi media: [{file_id, name, mime, size}] (rasm — eng katta o'lchami)."""
        out = []
        mid = msg.get("message_id") or int(time.time())
        if msg.get("photo"):
            p = max(msg["photo"], key=lambda x: (x.get("file_size") or 0, (x.get("width") or 0) * (x.get("height") or 0)))
            out.append({"file_id": p["file_id"], "name": f"photo_{mid}.jpg", "mime": "image/jpeg", "size": p.get("file_size") or 0})
        for key, default, mime in MEDIA_KEYS:
            o = msg.get(key)
            if not o or (key == "document" and msg.get("animation")):
                continue
            name = o.get("file_name") or (default if key == "document" else f"{key}_{mid}.{default.rsplit('.', 1)[1]}")
            out.append({"file_id": o["file_id"], "name": name, "mime": o.get("mime_type") or mime, "size": o.get("file_size") or 0})
        return out

    def fetch(self, c: dict, media: list[dict]) -> list[dict]:
        """Telegram fayllarini yuklab olib, «Murojaatlar» ilovalari sifatida saqlaydi. Katta fayl — nomi va xato belgisi bilan
        (ogohlantirish panel matnida ko'rsatiladi)."""
        from .desk import save_attachment  # noqa: PLC0415

        out = []
        for f in media[:10]:
            if f["size"] and f["size"] > MAX_FILE:
                out.append({"name": f["name"], "size": f["size"], "error": "too_large"})
                self.note(c, self.L(c)["file_big"].format(name=esc(f["name"])))
                continue
            try:
                data, path = self.api().download(f["file_id"])
                name = f["name"]
                if "." not in name and "." in path.rsplit("/", 1)[-1]:
                    name += "." + path.rsplit(".", 1)[1]
                out.append(save_attachment(self.st, name, data, f["mime"]))
            except ValueError:
                out.append({"name": f["name"], "size": f["size"], "error": "too_large"})
                self.note(c, self.L(c)["file_big"].format(name=esc(f["name"])))
            except Exception as e:  # noqa: BLE001
                self.last_error = f"getFile: {e}"
                out.append({"name": f["name"], "size": f["size"], "error": "download_failed"})
        return out

    def on_text(self, c: dict, text: str, msg: dict) -> None:
        L, st = self.L(c), c["state"]
        if st == "phone" and (msg.get("contact") or {}).get("phone_number"):  # «Kontaktni yuborish» orqali yuborilgan raqam
            text = str(msg["contact"]["phone_number"]).strip()
            text = text if text.startswith("+") else "+" + text
        media = self.media_of(msg)
        mg = msg.get("media_group_id")
        if not text and not media:
            return
        if st in ("body", "confirm") and media:
            # murojaat matni bosqichida yuborilgan fayllar — murojaatga ilova (xabar chatda qoladi, panel uning ostiga)
            self.keep(c)
            files = c["data"].setdefault("files", [])
            files += self.fetch(c, media)[: max(0, 10 - len(files))]
            if text and st == "body":
                c["data"]["body"] = text[:4000]
            c["data"]["mg"] = mg or ""
            if c["data"].get("body"):
                self.summary(c)
            else:
                self.save_chat(c)
                self.panel(c, L["att_saved"], kb([[(L["cancel"], "cancel")]]))
            return
        if not text and st in ("name", "phone", "email", "subject", "cat", "confirm"):
            return
        if st == "name":
            c["data"]["name"] = text[:120]
            self.ask(c, "phone")
        elif st == "phone":
            if not PHONE_RE.match(text):
                self.ask(c, "phone", L["bad_phone"])
                return
            c["data"]["phone"] = text[:40]
            self.ask(c, "email")
        elif st == "email":
            if not EMAIL_RE.match(text):
                self.ask(c, "email", L["bad_email"])
                return
            c["data"]["email"] = text.lower()[:160]
            self.after_email(c)
        elif st == "subject":
            c["data"]["subject"] = text[:200]
            self.ask(c, "body")
        elif st == "body":
            self.keep(c)  # murojaat matni — yozishmaning o'zi
            c["data"]["body"] = text[:4000]
            self.summary(c)
        elif st.startswith("rate_comment:"):
            t = self._own(c, st[13:])
            c["state"] = ""
            if t and text:
                t = self.desk_fn().rate_comment(t, text)
                self.rated(c, t, L["rate_saved"] + f"\n«{esc(text[:300])}»")
                c["data"].pop("rate_msg", None)
                self.save_chat(c)
            else:
                self.save_chat(c)
                self.on_text(c, text, msg)
        elif st.startswith("reply:"):
            t = self.desk_fn().get(st[6:])
            if t and t.get("tg_chat") == c["chat_id"]:
                self.keep(c)
                files = self.fetch(c, media) if media else []
                self.desk_fn().telegram_in(t, self._name(c), text, {"files": files, "media_group_id": mg} if media else None)
                c["state"] = "" if not mg else c["state"]
                c["data"]["mg"] = mg or ""
                self.save_chat(c)
                self.panel(c, L["added"].format(num=f"UNI-{t['number']}"), self.main_menu(c))
            else:
                c["state"] = ""
                self.save_chat(c)
                self.welcome(c)
        else:
            # erkin xabar: ochiq murojaat bo'lsa — unga qo'shiladi (xabar qoladi), aks holda — o'chiriladi va menyu
            open_ = self.desk_fn().by_chat(c["chat_id"])
            if open_:
                t = open_[0]
                self.keep(c)
                files = self.fetch(c, media) if media else []
                self.desk_fn().telegram_in(t, self._name(c), text, {"files": files, "media_group_id": mg} if media else None)
                c["data"]["mg"] = mg or ""
                self.save_chat(c)
                self.panel(c, L["added"].format(num=f"UNI-{t['number']}"), kb([[(L["new"], "new")], [(L["menu"], "menu")]]))
            else:
                self.welcome(c)

    def _name(self, c: dict) -> str:
        return (c["data"].get("profile") or {}).get("name") or c["data"].get("name") or self._tg_name(c)

    def _tg_name(self, c: dict) -> str:
        u = c["tg_user"]
        return " ".join(x for x in (u.get("first_name"), u.get("last_name")) if x).strip() or (("@" + u["username"]) if u.get("username") else "Telegram")

    def submit(self, c: dict) -> None:
        L, d = self.L(c), c["data"]
        desk = self.desk_fn()
        cats = [x for x in desk.categories() if x["active"]]
        cat = desk.category(d.get("cat")) or (cats[0] if cats else None)
        u = c["tg_user"]
        meta = {"source": "telegram", "telegram": {"chat_id": c["chat_id"], "username": u.get("username") or "", "lang": c["lang"]}}
        if d.get("files"):
            meta["files"] = d["files"]
        t = desk.create(d.get("subject") or "Telegram", d.get("body") or "", name=d.get("name") or self._tg_name(c), email=d.get("email") or "",
                        phone=d.get("phone") or "", category_id=cat["id"] if cat else None, source="telegram", meta=meta, lang=c["lang"],
                        tg_chat=c["chat_id"])
        self.remember(c)
        c["state"] = ""
        self.fresh(c)
        self.save_chat(c)
        self.panel(c, L["done"].format(num=f"UNI-{t['number']}"), self.main_menu(c))

    def my_list(self, c: dict) -> None:
        """«Mening murojaatlarim»: har biri — holati va oxirgi izoh; tugma bilan ochiladi (tarix)."""
        L = self.L(c)
        desk = self.desk_fn()
        items = desk.by_chat(c["chat_id"], open_only=False)
        if not items:
            self.panel(c, L["none"], self.main_menu(c))
            return
        lines = [L["list"]]
        for t in items[:8]:
            lines.append(f"\n• <b>UNI-{t['number']}</b> — {esc(t['title'][:60])}\n   {L['stage'].get(t['stage'], t['stage'])}")
            note = desk.last_comment(t["id"])
            if note:
                lines.append("   " + L["last_comment"].format(text=esc(note[:200])))
        rows = [[(L["open"].format(num=f"UNI-{t['number']}"), f"view:{t['id']}")] for t in items[:8]]
        self.panel(c, "\n".join(lines), kb(rows + [[(L["new"], "new")], [(L["menu"], "menu")]]))

    def view(self, c: dict, tid: str) -> None:
        """Bitta murojaat: holat, bosqichlar tarixi (holat + izoh + vaqt), baho; tugmalar — javob yozish / baholash."""
        from .desk import local_dt  # noqa: PLC0415

        L = self.L(c)
        t = self._own(c, tid)
        if not t:
            self.my_list(c)
            return
        lines = [f"📄 <b>UNI-{t['number']}</b> — {esc(t['title'][:120])}", L["stage"].get(t["stage"], t["stage"]), "", f"<b>{L['history']}</b>"]
        for h in self.desk_fn().history(t["id"])[-15:]:
            lines.append(f"{local_dt(h['at'])} · {L['stage'].get(h['stage'], h['stage'])}")
            if h["comment"]:
                lines.append("   " + L["last_comment"].format(text=esc(h["comment"][:500])))
        if t.get("rating"):
            lines += ["", L["your_rating"].format(stars=stars(t["rating"]), n=t["rating"])]
        rows = []
        if t["stage"] not in ("resolved", "failed"):
            rows.append([(L["answer"], f"reply:{t['id']}")])
        elif not t.get("rating"):
            rows.append([(L["rate"], f"rateask:{t['id']}")])
        self.panel(c, "\n".join(lines)[:4000], kb(rows + [[(L["back_list"], "mine")], [(L["menu"], "menu")]]))

    # --- baholash
    @staticmethod
    def stars_rows(t: dict) -> list:
        return [[(f"⭐ {n}", f"rate:{t['id']}:{n}") for n in range(1, 6)]]

    @classmethod
    def stars_kb(cls, t: dict) -> dict:
        return kb(cls.stars_rows(t))

    def on_rate(self, c: dict, data: str, q: dict | None) -> None:
        """Yulduz bosildi: baho saqlanadi va baholash xabarining o'zi «rahmat» holatiga tahrirlanadi (yangi xabar yo'q)."""
        L = self.L(c)
        parts = data.split(":")
        t = self._own(c, parts[1]) if len(parts) == 3 else None
        if not t:
            return
        try:
            t = self.desk_fn().rate(t, parts[2], by="telegram")
        except ValueError as e:
            if str(e) == "already_rated":
                self.toast(c, L["rated_already"], alert=True)
            return
        mid = int(((q or {}).get("message") or {}).get("message_id") or 0)
        c["state"] = f"rate_comment:{t['id']}"
        c["data"]["rate_msg"] = mid if mid and mid != int(c.get("panel") or 0) else 0  # 0 — panelning o'zi (murojaat tafsilotidan)
        self.save_chat(c)
        self.rated(c, t, L["rate_thanks"].format(stars=stars(t["rating"]), n=t["rating"]))

    def rated(self, c: dict, t: dict, tail: str) -> None:
        """Baholash xabarini yangilash: holat xabari (bildirishnoma) bo'lsa — uning matni saqlanib, ostiga baho/izoh holati yoziladi;
        panel bo'lsa — panelda. Tahrirlab bo'lmasa — panelda."""
        L = self.L(c)
        markup = kb([[(L["mine"], "mine"), (L["menu"], "menu")]])
        mid = int(c["data"].get("rate_msg") or 0)
        if mid:
            hist = self.desk_fn().history(t["id"])
            cm = hist[-1]["comment"] if hist and hist[-1]["stage"] == t["stage"] else ""
            if self.edit(c["chat_id"], mid, self.status_text(c, t, t["stage"], cm) + "\n\n" + tail, markup):
                return
        self.panel(c, tail, markup)

    # --- administrator javobi va bosqich xabarlari
    @staticmethod
    def _method(f: tuple[str, str, bytes]) -> tuple[str, str]:
        """Fayl turi bo'yicha Bot API usuli va maydoni."""
        name, mime, blob = f
        mime = (mime or "").lower()
        if mime in ("image/jpeg", "image/png", "image/webp") and len(blob) <= 10 * 1024 * 1024:
            return "sendPhoto", "photo"
        if mime == "image/gif":
            return "sendAnimation", "animation"
        if mime == "video/mp4":
            return "sendVideo", "video"
        if mime in ("audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/mp3"):
            return "sendAudio", "audio"
        if mime == "audio/ogg" or name.lower().endswith((".ogg", ".oga", ".opus")):
            return "sendVoice", "voice"
        return "sendDocument", "document"

    def send_files(self, chat_id: str, files: list[tuple[str, str, bytes]], caption: str = "", markup: dict | None = None) -> None:
        """Ilovalarni yuborish: bitta fayl — mos usul (sendPhoto/…/sendDocument) izoh bilan; 2–10 ta rasm/video — albom (sendMediaGroup);
        aralash turlar — har biri alohida. Izoh 1024 belgidan oshsa — matn alohida xabar bo'lib keyin yuboriladi."""
        api = self.api()
        cap = caption if caption and len(caption) <= CAPTION else ""
        rest = caption if caption and not cap else ""
        kinds = [self._method(f) for f in files]
        if 2 <= len(files) <= 10 and all(m in ("sendPhoto", "sendVideo") for m, _ in kinds):
            # albomga tugma biriktirib bo'lmaydi: tugma kerak bo'lsa — matn albomdan keyin alohida xabar
            on_album = cap if not markup else ""
            media, up = [], {}
            for i, (f, (_m, field)) in enumerate(zip(files, kinds)):
                item = {"type": field, "media": f"attach://f{i}"}
                if i == 0 and on_album:
                    item |= {"caption": on_album, "parse_mode": "HTML"}
                media.append(item)
                up[f"f{i}"] = (f[0], f[2], f[1] or "application/octet-stream")
            api.upload("sendMediaGroup", up, chat_id=chat_id, media=media)
            sent_out(self.st, chat_id, -1)
            if caption and not on_album:
                self.send(chat_id, caption, markup)
            return
        for i, (f, (method, field)) in enumerate(zip(files, kinds)):
            last = i == len(files) - 1
            extra = {"caption": cap, "parse_mode": "HTML"} if (i == 0 and cap) else {}
            if last and markup and not rest:
                extra["reply_markup"] = markup
            api.upload(method, {field: (f[0], f[2], f[1] or "application/octet-stream")}, chat_id=chat_id, **extra)
            sent_out(self.st, chat_id, -1)
        if rest:
            self.send(chat_id, rest, markup)

    def deliver_reply(self, chat_id: str, t: dict, text: str, files: list | None = None) -> None:
        c = self.chat(chat_id)
        L = self.L(c)
        body = L["reply"].format(num=f"UNI-{t['number']}", text=esc(text))
        markup = kb([[(L["answer"], f"reply:{t['id']}")], [(L["menu"], "menu")]])
        if files:
            self.send_files(chat_id, files, body, markup)
        else:
            self.send(chat_id, body, markup)

    def status_text(self, c: dict, t: dict, stage: str, comment: str = "") -> str:
        L = self.L(c)
        num = f"UNI-{t['number']}"
        lines = [L["resolved"].format(num=num)] if stage == "resolved" else []
        lines.append(L["status"].format(num=num, stage=L["stage"].get(stage, stage)))
        if comment:
            lines += ["", L["comment"].format(text=esc(comment))]
        return "\n".join(lines)

    def deliver_status(self, t: dict, stage: str, comment: str = "", rate: bool = False) -> None:
        """Bosqich o'zgardi (bildirishnoma — yangi xabar): yangi holat + operator izohi; «Hal qilindi» — baholash tugmalari (1–5 yulduz).
        Baho qo'yilgach shu xabarning o'zi «rahmat» holatiga tahrirlanadi (on_rate)."""
        c = self.chat(t["tg_chat"])
        L = self.L(c)
        text = self.status_text(c, t, stage, comment)
        if rate:
            text += "\n\n" + L["rate_ask"]
            markup = self.stars_kb(t)
        else:
            markup = kb([[(L["open"].format(num=f"UNI-{t['number']}"), f"view:{t['id']}")], [(L["menu"], "menu")]])
        self.send(t["tg_chat"], text, markup)

    # --- long polling
    POLL = 25  # getUpdates: Telegram javobni shuncha soniyagacha ushlab turadi (yangilanish kelsa — darhol qaytaradi)

    @staticmethod
    def backoff(prev: float) -> float:
        """Xatodan keyin kutish: 1, 2, 4, 8, 15, 15 … s (muvaffaqiyatda — 0 dan)."""
        return min(15.0, prev * 2) if prev else 1.0

    def start(self) -> None:
        if self._t and self._t.is_alive():
            self._wake.set()  # sozlama o'zgardi — rejim darhol qayta o'qiladi
            return
        self._stop.clear()

        def loop():
            try:
                offset = int(self.st.kv_get("telegram_offset") or 0)
            except Exception:  # noqa: BLE001
                offset = 0
            webhook_cleared = hook_synced = False
            wait = 0.0
            while not self._stop.is_set():
                try:
                    cfg = config(self.st)
                except Exception as e:  # noqa: BLE001 — baza vaqtincha ishlamasa ham oqim o'lmasin
                    self.last_error = f"{type(e).__name__}: {e}"
                    wait = self.backoff(wait)
                    self._stop.wait(wait)
                    continue
                if not ready(cfg) or cfg.get("mode") == "webhook":
                    # webhook rejimi: polling to'liq to'xtaydi (getUpdates chaqirilmaydi), faqat sozlama kuzatiladi
                    webhook_cleared = False
                    self.polling = False
                    if ready(cfg) and not hook_synced:  # eski webhook'da allowed_updates (my_chat_member) yangilanadi
                        hook_synced = True
                        try:
                            base = self.svc_fn().base_url()
                            if base.startswith("https://") and self.st.kv_get("telegram_secret"):
                                self.set_webhook(f"{base}/api/telegram/webhook")
                        except Exception as e:  # noqa: BLE001
                            self.last_error = f"setWebhook: {e}"
                    self._wake.wait(10)
                    self._wake.clear()
                    continue
                self.polling = True
                try:
                    api = Api(cfg["token"])
                    if not webhook_cleared:  # polling: eski (yoki boshqa server o'rnatgan) webhook o'chiriladi
                        api.call("deleteWebhook")
                        webhook_cleared = True
                    t0 = time.monotonic()
                    ups = api.call("getUpdates", offset=offset or None, timeout=self.POLL, allowed_updates=ALLOWED_UPDATES) or []
                    for u in ups:
                        offset = max(offset, int(u["update_id"]) + 1)
                        self.dispatch(u)  # pulga — keyingi getUpdates darhol (sekin ishlov boshqalarni kutdirmaydi)
                    if ups:
                        self.st.kv_put("telegram_offset", offset)
                    self.last_error = ""
                    wait = 0.0
                    if not ups and time.monotonic() - t0 < 0.5:
                        self._stop.wait(0.5)  # bo'sh javob darhol qaytdi (Telegram odatda ushlab turadi) — tsikl aylanib qolmasin
                    while self.dispatcher.backlog() > 500 and not self._stop.is_set():
                        self._stop.wait(0.2)  # juda katta navbat — Telegram'dan olishni sekinlashtirish
                except Conflict as e:
                    wait = self.backoff(wait)
                    if "webhook" in str(e).lower():
                        if config(self.st).get("mode") == "webhook":  # o'zimiz webhook rejimiga o'tdik — ziddiyat emas
                            continue
                        webhook_cleared = False  # kimdir (boshqa server) webhook o'rnatgan — keyingi aylanishda o'chiriladi
                    tg_net.conflict(str(e))
                    self.last_error = CONFLICT_TEXT + f" [{e}]"
                    self._stop.wait(wait)
                except Exception as e:  # noqa: BLE001
                    self.last_error = f"{type(e).__name__}: {e}"
                    wait = self.backoff(wait)
                    self._stop.wait(wait)

        self._t = threading.Thread(target=loop, daemon=True, name="tg-poll")
        self._t.start()

    def set_webhook(self, url: str) -> str:
        secret = self.st.kv_get("telegram_secret") or secrets.token_hex(16)
        self.st.kv_put("telegram_secret", secret)
        self.api().call("setWebhook", url=url, secret_token=secret, allowed_updates=ALLOWED_UPDATES, drop_pending_updates=False)
        return secret

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()


def now_ts() -> float:
    return time.time()
