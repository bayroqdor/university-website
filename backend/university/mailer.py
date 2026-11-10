"""Elektron pochta: SMTP orqali yuborish, HTML shablonlar va obunachilarga tarqatma (fon rejimida)."""
from __future__ import annotations

import re
import smtplib
import ssl
import threading
import time
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from html import escape
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATES = Path(__file__).parent / "templates" / "email"
_env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=select_autoescape(["html"]))

LABELS = {
    "uz": {
        "open_portal": "Kabinetda ochish",
        "newsletter": "Obuna", "kind_news": "Yangilik", "kind_announce": "E’lon", "kind_event": "Tadbir", "when": "Vaqti", "where": "Joyi", "deadline": "Muddat",
        "confirm_subject": "Obunani tasdiqlang", "confirm_title": "Obunani tasdiqlang",
        "confirm_text": "Institut yangiliklari va e’lonlaridan xabardor bo‘lish uchun obuna bo‘ldingiz. Tasdiqlash uchun quyidagi tugmani bosing.",
        "confirm_button": "Obunani tasdiqlash", "confirm_ignore": "Agar siz obuna bo‘lmagan bo‘lsangiz, bu xatni e’tiborsiz qoldiring.",
        "welcome_subject": "Obuna tasdiqlandi", "welcome_title": "Obuna faol",
        "welcome_text": "Obunangiz tasdiqlandi. Institut yangiliklari va e’lonlari pochtangizga keladi.", "visit": "Saytga o‘tish",
        "read": "Batafsil o‘qish", "min_read": "daqiqa o‘qish", "unsubscribe": "Obunani bekor qilish",
        "why": "Siz bu xatni saytdagi obuna tufayli olyapsiz.", "contact_subject": "Saytdan yangi xabar", "contact_title": "Saytdan yangi xabar",
        "from": "Kimdan", "subject": "Mavzu", "reply": "Javob berish", "test_subject": "SMTP sinov xati", "test_title": "SMTP sozlamalari ishlayapti",
        "test_text": "Bu sinov xati. Uni olgan bo‘lsangiz, pochta sozlamalari to‘g‘ri.", "new_sub_subject": "Yangi obunachi",
    },
    "ru": {
        "open_portal": "Открыть в кабинете",
        "newsletter": "Рассылка", "kind_news": "Новость", "kind_announce": "Объявление", "kind_event": "Мероприятие", "when": "Когда", "where": "Где", "deadline": "Срок",
        "confirm_subject": "Подтвердите подписку", "confirm_title": "Подтвердите подписку",
        "confirm_text": "Вы подписались на уведомления о новых статьях. Чтобы подтвердить, нажмите кнопку ниже.",
        "confirm_button": "Подтвердить подписку", "confirm_ignore": "Если вы не подписывались, просто проигнорируйте это письмо.",
        "welcome_subject": "Подписка подтверждена", "welcome_title": "Подписка активна",
        "welcome_text": "Подписка подтверждена. Новости и объявления института будут приходить на вашу почту.", "visit": "Перейти на сайт",
        "read": "Читать далее", "min_read": "мин чтения", "unsubscribe": "Отписаться",
        "why": "Вы получили это письмо, потому что подписались на сайте.", "contact_subject": "Новое сообщение с сайта", "contact_title": "Новое сообщение с сайта",
        "from": "От", "subject": "Тема", "reply": "Ответить", "test_subject": "Тестовое письмо SMTP", "test_title": "Настройки SMTP работают",
        "test_text": "Это тестовое письмо. Если вы его получили, настройки почты верны.", "new_sub_subject": "Новый подписчик",
    },
    "en": {
        "open_portal": "Open in your account",
        "newsletter": "Newsletter", "kind_news": "News", "kind_announce": "Announcement", "kind_event": "Event", "when": "When", "where": "Where", "deadline": "Deadline",
        "confirm_subject": "Confirm your subscription", "confirm_title": "Confirm your subscription",
        "confirm_text": "You signed up to get notified about new posts. Please confirm by clicking the button below.",
        "confirm_button": "Confirm subscription", "confirm_ignore": "If you didn’t sign up, you can safely ignore this email.",
        "welcome_subject": "Subscription confirmed", "welcome_title": "Subscription active",
        "welcome_text": "Your subscription is confirmed. Institute news and announcements will arrive in your inbox.", "visit": "Visit the site",
        "read": "Read more", "min_read": "min read", "unsubscribe": "Unsubscribe",
        "why": "You are receiving this email because you subscribed on the website.", "contact_subject": "New message from the website", "contact_title": "New message from the website",
        "from": "From", "subject": "Subject", "reply": "Reply", "test_subject": "SMTP test email", "test_title": "SMTP settings work",
        "test_text": "This is a test email. If you received it, your mail settings are correct.", "new_sub_subject": "New subscriber",
    },
}


def html_to_text(html: str) -> str:
    t = re.sub(r"<(br|/p|/h\d|/li|/tr)>", "\n", html, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return re.sub(r"[ \t]+", " ", t).strip()


def render(template: str, **ctx) -> str:
    return _env.get_template(template).render(**ctx)


def configured(smtp: dict) -> bool:
    return bool(smtp.get("enabled") and smtp.get("host") and smtp.get("from_email"))


def mail_server_ready(st) -> bool:
    """Universitet pochta serveri sozlangan bo'lsa, tizim xatlari (obuna, bildirishnoma) shu orqali ketadi — alohida SMTP shart emas."""
    from . import mail as M  # noqa: PLC0415

    cfg = M.config(st)
    return M.ready(cfg) and bool(cfg.get("master_password"))


def can_send(st) -> bool:
    return configured(st.kv_get("smtp", {}) or {}) or mail_server_ready(st)


def send(smtp: dict, to: str, subject: str, html: str, text: str | None = None, headers: dict | None = None) -> None:
    """Bitta xat yuborish (xato bo'lsa — istisno)."""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((smtp.get("from_name") or "", smtp["from_email"]))
    msg["To"] = to
    msg["Message-ID"] = make_msgid(domain=(smtp["from_email"].split("@")[-1] or None))
    if smtp.get("reply_to"):
        msg["Reply-To"] = smtp["reply_to"]
    for k, v in (headers or {}).items():
        msg[k] = v
    msg.set_content(text or html_to_text(html))
    msg.add_alternative(html, subtype="html")
    host, port, sec = smtp["host"], int(smtp.get("port") or 587), smtp.get("security") or "starttls"
    ctx = ssl.create_default_context()
    if sec == "ssl":
        server = smtplib.SMTP_SSL(host, port, timeout=25, context=ctx)
    else:
        server = smtplib.SMTP(host, port, timeout=25)
    try:
        server.ehlo()
        if sec == "starttls":
            server.starttls(context=ctx)
            server.ehlo()
        if smtp.get("username"):
            server.login(smtp["username"], smtp.get("password") or "")
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:  # noqa: BLE001
            pass


class Mailer:
    """Xatlarni fon oqimida yuboradi va jurnalga yozadi."""

    def __init__(self, storage, ctx_fn, loc_fn=None):
        self.st = storage
        self.ctx_fn = ctx_fn  # (lang) -> dict: sayt nomi, rang, url, til
        self.loc_fn = loc_fn or (lambda it, lang: it)  # (maqola, til) -> tarjima qilingan maqola

    def _deliver(self, kind: str, to: str, subject: str, html: str, headers: dict | None = None) -> bool:
        smtp = self.st.kv_get("smtp", {}) or {}
        use_server = not configured(smtp) and mail_server_ready(self.st)
        if not configured(smtp) and not use_server:
            self.st.log_email(kind, to, subject, "skipped", "smtp_not_configured")
            return False
        try:
            if use_server:
                from . import mail as M  # noqa: PLC0415

                M.system_send(self.st, to, subject, html, html_to_text(html), headers, from_name=(self.ctx_fn(None) or {}).get("site_name", "University"))
            else:
                send(smtp, to, subject, html, headers=headers)
            self.st.log_email(kind, to, subject, "sent")
            return True
        except Exception as e:  # noqa: BLE001
            self.st.log_email(kind, to, subject, "failed", f"{type(e).__name__}: {e}")
            return False

    def _async(self, fn, *args) -> None:
        threading.Thread(target=fn, args=args, daemon=True).start()

    def base_ctx(self, lang: str | None = None) -> dict:
        c = self.ctx_fn(lang)
        c["L"] = LABELS.get(c.get("lang") or "uz", LABELS["uz"])
        # sayt sahifalariga havola o'quvchi tilida ochilsin
        c["lq"] = f"lang={c['lang']}" if c.get("lang") != c.get("base_lang") else ""
        return c

    @staticmethod
    def _with(url: str, q: str) -> str:
        return f"{url}{'&' if '?' in url else '?'}{q}" if q else url

    # ------------------------------------------------------------------ xat turlari
    def confirm(self, sub: dict, sync: bool = False) -> None:
        c = self.base_ctx(sub.get("lang"))
        link = f"{c['url']}/api/subscribe/confirm?token={sub['token']}"
        html = render("confirm.html", **c, link=link, preheader=c["L"]["confirm_text"])
        args = ("confirm", sub["email"], f"{c['L']['confirm_subject']} — {c['site_name']}", html)
        self._deliver(*args) if sync else self._async(self._deliver, *args)

    def welcome(self, sub: dict) -> None:
        c = self.base_ctx(sub.get("lang"))
        unsub = self._with(f"{c['url']}/unsubscribe?token={sub['unsub_token']}", c["lq"])
        html = render("welcome.html", **c, unsub=unsub, preheader=c["L"]["welcome_text"])
        one_click = f"{c['url']}/api/unsubscribe?token={sub['unsub_token']}"
        self._async(self._deliver, "welcome", sub["email"], f"{c['L']['welcome_subject']} — {c['site_name']}", html,
                    {"List-Unsubscribe": f"<{one_click}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"})

    def contact_notify(self, msg: dict, to: str) -> None:
        c = self.base_ctx()
        html = render("contact.html", **c, m=msg, body_html=escape(msg["body"]).replace("\n", "<br>"), preheader=msg["body"][:120])
        self._async(self._deliver, "contact", to, f"{c['L']['contact_subject']}: {msg.get('subject') or msg['name']}", html, {"Reply-To": msg["email"]})

    def portal_notice(self, to: list[str], title: str, text: str, path: str) -> None:
        """Kabinet bildirishnomasining email nusxasi (fon oqimida, har biriga alohida xat)."""
        c = self.base_ctx()
        html = render("notice.html", **c, title=title, text=text, preheader=text[:120], href=c["url"] + path, button=c["L"].get("open_portal") or c["site_name"])

        def run():
            for addr in to:
                self._deliver("notice", addr, f"{title} — {c['site_name']}", html)
                time.sleep(0.2)

        threading.Thread(target=run, daemon=True).start()

    def new_subscriber_notify(self, email: str, to: str) -> None:
        c = self.base_ctx()
        html = render("notice.html", **c, title=c["L"]["new_sub_subject"], text=email, preheader=email)
        self._async(self._deliver, "notice", to, f"{c['L']['new_sub_subject']}: {email}", html)

    def test(self, to: str) -> tuple[bool, str]:
        c = self.base_ctx()
        smtp = self.st.kv_get("smtp", {}) or {}
        html = render("notice.html", **c, title=c["L"]["test_title"], text=c["L"]["test_text"], preheader=c["L"]["test_text"])
        if not (smtp.get("host") and smtp.get("from_email")):
            return False, "smtp_not_configured"
        try:
            send(smtp, to, f"{c['L']['test_subject']} — {c['site_name']}", html)
            self.st.log_email("test", to, c["L"]["test_subject"], "sent")
            return True, ""
        except Exception as e:  # noqa: BLE001
            err = f"{type(e).__name__}: {e}"
            self.st.log_email("test", to, c["L"]["test_subject"], "failed", err)
            return False, err

    SECTION = {"news": "news", "announce": "announcements", "event": "events"}

    def post_html(self, post: dict, unsub: str = "#", lang: str | None = None) -> str:
        """Yangilik / e'lon / tadbir haqida xat (universitet ranglari, muqova, qisqacha mazmun, «Batafsil» tugmasi)."""
        from .storage import _tz as local_tz  # noqa: PLC0415

        c = self.base_ctx(lang)
        kind = post.get("kind") or "news"
        post = self.loc_fn(post, c["lang"])
        url = self._with(f"{c['url']}/{self.SECTION.get(kind, 'news')}/{post.get('slug')}", c["lq"])
        img = post.get("feature_image") or post.get("cover") or ""
        if img and not img.startswith("http"):
            img = c["url"] + img
        L = c["L"]

        def when(iso: str | None) -> str:
            if not iso:
                return ""
            try:
                from datetime import datetime  # noqa: PLC0415

                return datetime.fromisoformat(iso).astimezone(local_tz()).strftime("%d.%m.%Y, %H:%M")
            except ValueError:
                return iso[:16]
        box = []
        if kind == "event":
            if post.get("starts"):
                a, b = when(post["starts"]), when(post.get("ends"))
                box.append((L["when"], a + (f" — {b.split(', ')[1] if b[:10] == a[:10] else b}" if b else "")))
            if post.get("place"):
                box.append((L["where"], post["place"]))
        if kind == "announce" and post.get("deadline"):
            box.append((L["deadline"], when(post["deadline"])))
        meta = " · ".join(x for x in (c.get("author") or "", when(post.get("published_at")).split(",")[0] if post.get("published_at") else "",
                                       f"{post['reading_time']} {L['min_read']}" if post.get("reading_time") and kind == "news" else "") if x)
        return render("post.html", **c, post=post, post_url=url, unsub=unsub, image=img, kind_label=L.get(f"kind_{kind}", ""), meta_line=meta,
                      event_box=box, summary=post.get("excerpt") or post.get("summary") or "", preheader=post.get("excerpt") or post.get("summary") or "")

    def newsletter(self, post: dict, recipients: list[dict], nid: str, on_done=None) -> None:
        """Maqola haqida barcha obunachilarga xat (fon oqimida, har biriga shaxsiy «bekor qilish» havolasi)."""
        def run():
            sent = failed = 0
            for i, sub in enumerate(recipients):
                # har bir obunachiga o'z tilida (tarjima bo'lmasa — asl tilda)
                c = self.base_ctx(sub.get("lang"))
                subject = self.loc_fn(post, c["lang"]).get("title") or c["site_name"]
                unsub = self._with(f"{c['url']}/unsubscribe?token={sub['unsub_token']}", c["lq"])
                html = self.post_html(post, unsub, c["lang"])
                one_click = f"{c['url']}/api/unsubscribe?token={sub['unsub_token']}"
                ok = self._deliver("newsletter", sub["email"], subject, html, {"List-Unsubscribe": f"<{one_click}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"})
                sent += int(ok)
                failed += int(not ok)
                if i % 5 == 4:
                    self.st.update_newsletter(nid, sent, failed)
                time.sleep(0.3)  # SMTP serverni ortiqcha yuklamaslik uchun
            self.st.update_newsletter(nid, sent, failed, done=True)
            if on_done:
                on_done()

        threading.Thread(target=run, daemon=True).start()
