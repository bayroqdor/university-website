"""Ichki pochta: universitetning o'z pochta serveri (Stalwart — ochiq kodli) bilan IMAP/SMTP orqali ishlaydigan veb-pochta.

- Har bir foydalanuvchiga login asosida manzil beriladi: `login@domen` (masalan `j.doe@example.edu`).
- Veb-pochta foydalanuvchi parolini saqlamaydi: server bilan «xizmat hisobi» orqali, uning nomidan (impersonation) ishlaydi.
  Stalwart: `<manzil>%<xizmat hisobi>` + xizmat hisobi paroli; Dovecot: `<manzil>*<master>` (login_format sozlanadi).
- Stalwart boshqaruv API (JMAP, `POST /api`) orqali domen, xizmat hisobi va foydalanuvchi hisoblari avtomatik yaratiladi/o'chiriladi.
  Parol o'rnatilganda (yaratish, import, parolni almashtirish) u pochta serveriga ham yuboriladi — Thunderbird/telefon uchun.
"""
from __future__ import annotations

import base64
import html as H
import imaplib
import json
import logging
import os
import queue
import secrets
import re
import smtplib
import ssl
import threading
import time
import urllib.error
import urllib.request
from email import message_from_bytes, policy
from email.message import EmailMessage
from email.utils import formataddr, formatdate, getaddresses, make_msgid, parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote, urlparse

import nh3

log = logging.getLogger("university.mail")

SECRETS = ("master_password", "stalwart_password", "stalwart_token")
ROLES_ORDER = ("inbox", "drafts", "sent", "archive", "junk", "trash")
DEFAULT_NAMES = {"drafts": "Drafts", "sent": "Sent Items", "archive": "Archive", "junk": "Junk Mail", "trash": "Deleted Items"}
NAME_ROLES = {
    "inbox": "inbox", "входящие": "inbox",
    "sent": "sent", "sent items": "sent", "sent messages": "sent", "sent mail": "sent", "отправленные": "sent", "yuborilganlar": "sent",
    "drafts": "drafts", "draft": "drafts", "черновики": "drafts", "qoralamalar": "drafts",
    "trash": "trash", "deleted items": "trash", "deleted messages": "trash", "bin": "trash", "корзина": "trash", "savat": "trash",
    "junk": "junk", "spam": "junk", "junk mail": "junk", "junk e-mail": "junk", "спам": "junk",
    "archive": "archive", "archives": "archive", "архив": "archive", "arxiv": "archive",
}
SPECIAL_USE = {"\\sent": "sent", "\\drafts": "drafts", "\\trash": "trash", "\\junk": "junk", "\\archive": "archive", "\\inbox": "inbox"}
RESERVED = {"webmail", "postmaster", "abuse", "noreply", "no-reply", "mailer-daemon", "hostmaster"}
STARRED = "@starred"
EMAIL_RE = re.compile(r"^[^@\s<>\"',;]{1,64}@[^@\s<>\"',;]+\.[^@\s<>\"',;]{2,}$")


class MailError(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(code)
        self.code, self.detail = code, detail


# ================================================================== sozlamalar
def _env(k: str, d: str = "") -> str:
    return os.environ.get(k, d).strip()


def _env_bool(k: str, d: bool = False) -> bool:
    v = os.environ.get(k)
    return d if v is None else v.strip().lower() in ("1", "true", "yes", "on")


def secrets_dir() -> Path:
    """docker compose: pochta konteyneri bilan umumiy volume (Stalwart administrator paroli shu yerda avtomatik yaratiladi)."""
    return Path(_env("SITE_MAIL_SECRETS_DIR", "/secrets"))


def _secret_file(name: str) -> str:
    try:
        p = secrets_dir() / name
        return p.read_text(encoding="utf-8").strip() if p.is_file() else ""
    except OSError:
        return ""


def env_defaults() -> dict:
    host = urlparse(_env("SITE_URL")).hostname or "example.edu"
    auto_pw = _secret_file("admin_password")  # docker compose ichidagi pochta serveri — qo'lda sozlash shart emas
    domain = _env("SITE_MAIL_DOMAIN") or (host[4:] if host.startswith("www.") else host)
    if domain in ("localhost", "127.0.0.1"):
        domain = "example.edu"
    return {
        "enabled": _env_bool("SITE_MAIL_ENABLED", bool(auto_pw)) if _env("SITE_MAIL_ENABLED") else bool(auto_pw),
        "domain": domain,
        "imap_host": _env("SITE_MAIL_IMAP_HOST", "127.0.0.1"),
        "imap_port": int(_env("SITE_MAIL_IMAP_PORT", "993") or 993),
        "imap_security": _env("SITE_MAIL_IMAP_SECURITY", "ssl"),
        "smtp_host": _env("SITE_MAIL_SMTP_HOST", "") or _env("SITE_MAIL_IMAP_HOST", "127.0.0.1"),
        "smtp_port": int(_env("SITE_MAIL_SMTP_PORT", "465") or 465),
        "smtp_security": _env("SITE_MAIL_SMTP_SECURITY", "ssl"),
        "tls_verify": _env_bool("SITE_MAIL_TLS_VERIFY", True),
        "login_format": _env("SITE_MAIL_LOGIN_FORMAT", "{address}%{master}"),
        "master_user": _env("SITE_MAIL_MASTER_USER", "") or f"webmail@{domain}",
        "master_password": _env("SITE_MAIL_MASTER_PASSWORD"),
        "provision": _env("SITE_MAIL_PROVISION", "stalwart"),
        "stalwart_url": _env("SITE_MAIL_STALWART_URL", "http://127.0.0.1:8080"),
        "stalwart_user": _env("SITE_MAIL_STALWART_USER", "admin"),
        "stalwart_password": _env("SITE_MAIL_STALWART_PASSWORD") or auto_pw,
        "stalwart_token": _env("SITE_MAIL_STALWART_TOKEN"),
        "max_attach_mb": int(_env("SITE_MAIL_MAX_ATTACH_MB", "20") or 20),
        "quota_mb": int(_env("SITE_MAIL_QUOTA_MB", "0") or 0),
        "public_imap": _env("SITE_MAIL_PUBLIC_IMAP", ""),
        "system_address": _env("SITE_MAIL_SYSTEM_ADDRESS", "") or f"noreply@{domain}",
        "mail_host": _env("SITE_MAIL_HOSTNAME", "") or _env("MAIL_HOSTNAME", "") or f"mail.{domain}",
        "server_ip": _env("SITE_MAIL_SERVER_IP", ""),
        "public_smtp": _env("SITE_MAIL_PUBLIC_SMTP", ""),
    }


INT_KEYS = ("imap_port", "smtp_port", "max_attach_mb", "quota_mb")
BOOL_KEYS = ("enabled", "tls_verify")
CHOICES = {"imap_security": ("ssl", "starttls", "none"), "smtp_security": ("ssl", "starttls", "none"), "provision": ("stalwart", "none")}


def config(st) -> dict:
    """Muhit o'zgaruvchilari — standart; admin paneldagi sozlamalar (kv «mail») ularning ustidan yoziladi."""
    cfg = env_defaults()
    saved = st.kv_get("mail") or {}
    for k, v in saved.items():
        if k in cfg and v not in (None, ""):
            cfg[k] = v
    if not cfg.get("master_password") and cfg.get("provision") == "stalwart" and cfg.get("stalwart_password"):
        # veb-pochta xizmat hisobi paroli: bir marta yaratiladi va ma'lumotlar papkasida saqlanadi
        p = Path(st.dir) / "mail_master_password"
        try:
            if not p.is_file():
                p.write_text(secrets.token_urlsafe(24), encoding="utf-8")
                p.chmod(0o600)
            cfg["master_password"] = p.read_text(encoding="utf-8").strip()
        except OSError:
            pass
    return cfg


def clean_config(data: dict, old: dict) -> dict:
    out = {}
    base = env_defaults()
    for k in base:
        if k not in data:
            if k in old:
                out[k] = old[k]
            continue
        v = data[k]
        if k in SECRETS:
            if v in (None, "") and old.get(k):  # bo'sh — o'zgarmaydi
                out[k] = old[k]
            elif v:
                out[k] = str(v)[:300]
            continue
        if k in INT_KEYS:
            try:
                out[k] = max(0, min(int(v), 65535))
            except (TypeError, ValueError):
                continue
        elif k in BOOL_KEYS:
            out[k] = bool(v)
        elif k in CHOICES:
            if v in CHOICES[k]:
                out[k] = v
        else:
            out[k] = str(v or "").strip()[:300]
    if out.get("domain"):
        out["domain"] = out["domain"].lower().lstrip("@")
    return out


def public_config(cfg: dict) -> dict:
    return {k: v for k, v in cfg.items() if k not in SECRETS} | {f"has_{k}": bool(cfg.get(k)) for k in SECRETS}


def ready(cfg: dict) -> bool:
    return bool(cfg.get("enabled") and cfg.get("domain") and cfg.get("imap_host"))


# ================================================================== manzillar
def local_part(login: str) -> str:
    s = (login or "").strip().lower().replace("@", ".")
    s = re.sub(r"[^a-z0-9._-]+", "", s)
    s = re.sub(r"\.{2,}", ".", s).strip(".-_")
    if s in RESERVED:
        s = "u." + s
    return s[:60] or "user"


def mail_address(u: dict, domain: str | None = None) -> str:
    if domain is None:
        from .api.deps import svc  # noqa: PLC0415

        domain = config(svc().st)["domain"]
    return f"{local_part(u['login'])}@{domain}"


def _imap_login(cfg: dict, address: str) -> str:
    master = cfg.get("master_user") or ""
    return (cfg.get("login_format") or "{address}").format(address=address, local=address.split("@")[0], master=master, domain=cfg.get("domain", ""))


# ================================================================== IMAP yordamchilari
def _ctx(cfg: dict) -> ssl.SSLContext:
    c = ssl.create_default_context()
    if not cfg.get("tls_verify", True):
        c.check_hostname = False
        c.verify_mode = ssl.CERT_NONE
    return c


def utf7_encode(s: str) -> str:
    """IMAP papka nomi: o'zgartirilgan UTF-7 (RFC 3501 5.1.3)."""
    out, buf = [], []

    def flush():
        if buf:
            b = "".join(buf).encode("utf-16-be")
            out.append("&" + base64.b64encode(b).decode().rstrip("=").replace("/", ",") + "-")
            buf.clear()

    for ch in s:
        if 0x20 <= ord(ch) <= 0x7E:
            flush()
            out.append("&-" if ch == "&" else ch)
        else:
            buf.append(ch)
    flush()
    return "".join(out)


def utf7_decode(s: str) -> str:
    def rep(m):
        t = m.group(1)
        if not t:
            return "&"
        t = t.replace(",", "/")
        t += "=" * (-len(t) % 4)
        try:
            return base64.b64decode(t).decode("utf-16-be")
        except Exception:  # noqa: BLE001
            return m.group(0)

    return re.sub(r"&([A-Za-z0-9+,]*)-", rep, s)


def _q(name: str) -> str:
    return '"' + utf7_encode(name).replace("\\", "\\\\").replace('"', '\\"') + '"'


def _qs(text: str) -> str:
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


LIST_RE = re.compile(rb'^\((?P<flags>[^)]*)\)\s+(?P<delim>"(?:[^"\\]|\\.)*"|NIL)\s+(?P<name>.*)$')


def _unquote(b: bytes) -> str:
    s = b.decode("utf-8", "replace").strip()
    if len(s) >= 2 and s[0] == s[-1] == '"':
        s = s[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    return s


def _fetch_entries(data) -> list[tuple[bytes, bytes | None]]:
    """imaplib FETCH javobini (meta, literal) juftliklariga ajratadi; literaldan keyingi qism ham metaga qo'shiladi."""
    out: list[list] = []
    for item in data or []:
        if isinstance(item, tuple):
            out.append([item[0], item[1]])
        elif isinstance(item, bytes):
            if out and item.strip() not in (b"",) and not re.match(rb"^\d+ \(", item):
                out[-1][0] += b" " + item
            elif re.match(rb"^\d+ \(", item):
                out.append([item, None])
    return [(m, lit) for m, lit in out]


def _meta(meta: bytes) -> dict:
    d = {}
    m = re.search(rb"UID (\d+)", meta)
    d["uid"] = int(m.group(1)) if m else 0
    m = re.search(rb"FLAGS \(([^)]*)\)", meta)
    d["flags"] = [f.decode() for f in m.group(1).split()] if m else []
    m = re.search(rb"RFC822\.SIZE (\d+)", meta)
    d["size"] = int(m.group(1)) if m else 0
    m = re.search(rb'INTERNALDATE "([^"]+)"', meta)
    if m:
        try:
            d["internal"] = time.mktime(imaplib.Internaldate2tuple(b'INTERNALDATE "' + m.group(1) + b'"'))
        except Exception:  # noqa: BLE001
            d["internal"] = 0
    return d


def _addr(v) -> list[dict]:
    try:
        return [{"name": n, "email": e} for n, e in getaddresses([str(v)]) if e] if v else []
    except Exception:  # noqa: BLE001
        return []


def _date(msg, fallback: float = 0) -> str:
    try:
        d = parsedate_to_datetime(str(msg.get("Date")))
        return d.isoformat()
    except Exception:  # noqa: BLE001
        if fallback:
            return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(fallback))
        return ""


def _hdr(msg, k: str) -> str:
    try:
        v = msg.get(k)
        return str(v) if v is not None else ""
    except Exception:  # noqa: BLE001
        return ""


def _parts(msg):
    """Barglar (multipart bo'lmagan qismlar) — tartib raqami fayl identifikatori bo'lib xizmat qiladi."""
    return [p for p in msg.walk() if not p.is_multipart()]


def _is_attachment(p, body_ids: set[int]) -> bool:
    if id(p) in body_ids:
        return False
    disp = p.get_content_disposition()
    if disp == "attachment" or p.get_filename():
        return True
    if p.get("Content-ID") and p.get_content_maintype() != "text":
        return True
    return p.get_content_maintype() not in ("text", "multipart")


def _payload(p) -> bytes:
    try:
        b = p.get_payload(decode=True)
        return b or b""
    except Exception:  # noqa: BLE001
        return b""


def _text(p) -> str:
    try:
        return p.get_content()
    except Exception:  # noqa: BLE001
        raw = _payload(p)
        return raw.decode(p.get_content_charset() or "utf-8", "replace")


TAGS = set(nh3.ALLOWED_TAGS) | {"font", "center", "style", "span", "div", "table", "tbody", "thead", "tfoot", "tr", "td", "th", "img", "hr", "u", "s", "small", "big", "sup", "sub"}
GLOBAL_ATTRS = {"style", "class", "align", "valign", "width", "height", "bgcolor", "color", "dir", "lang", "title", "border", "cellpadding", "cellspacing", "colspan", "rowspan", "face", "size"}
ATTRS = {k: set(v) | GLOBAL_ATTRS for k, v in nh3.ALLOWED_ATTRIBUTES.items()} | {"*": GLOBAL_ATTRS, "img": {"src", "alt", "width", "height", "style", "border"}, "a": {"href", "title", "style", "target"}}


def sanitize_html(html: str) -> str:
    try:
        return nh3.clean(html, tags=TAGS, attributes=ATTRS, clean_content_tags={"script", "noscript", "iframe", "object"}, url_schemes={"http", "https", "mailto", "cid", "data", "tel"}, link_rel="noopener noreferrer", strip_comments=True)
    except Exception:  # noqa: BLE001
        return H.escape(html)


URL_RE = re.compile(r"(https?://[^\s<>\"']+)")


def text_to_html(text: str) -> str:
    esc = H.escape(text or "")
    esc = URL_RE.sub(lambda m: f'<a href="{m.group(1)}" target="_blank" rel="noopener noreferrer">{m.group(1)}</a>', esc)
    return f'<div style="white-space:pre-wrap;font-family:inherit">{esc}</div>'


def html_to_text(html: str) -> str:
    t = re.sub(r"(?is)<(script|style).*?</\1>", "", html or "")
    t = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</h\d>|</tr>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = H.unescape(t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def _snippet(msg) -> str:
    try:
        b = msg.get_body(preferencelist=("plain", "html"))
        if b is None:
            return ""
        t = _text(b)
        if b.get_content_subtype() == "html":
            t = html_to_text(t)
        return re.sub(r"\s+", " ", t).strip()[:160]
    except Exception:  # noqa: BLE001
        return ""


def _has_attach(msg) -> bool:
    ct = (msg.get_content_type() or "").lower()
    if ct == "multipart/mixed":
        return True
    try:
        return any(p.get_content_disposition() == "attachment" for p in msg.walk())
    except Exception:  # noqa: BLE001
        return False


# ================================================================== pochta qutisi (IMAP sessiyasi)
class Mailbox:
    """Bitta so'rov uchun IMAP ulanishi: `with Mailbox(cfg, address) as mb: ...`."""

    def __init__(self, cfg: dict, address: str):
        self.cfg, self.address = cfg, address
        self.c: imaplib.IMAP4 | None = None
        self._folders: list[dict] | None = None
        self._selected: tuple[str, bool] | None = None
        self._caps: set[str] = set()

    # -------------------------------------------------- ulanish
    def __enter__(self) -> Mailbox:
        cfg = self.cfg
        try:
            sec = cfg.get("imap_security", "ssl")
            if sec == "ssl":
                c = imaplib.IMAP4_SSL(cfg["imap_host"], int(cfg["imap_port"]), ssl_context=_ctx(cfg), timeout=20)
            else:
                c = imaplib.IMAP4(cfg["imap_host"], int(cfg["imap_port"]), timeout=20)
                if sec == "starttls":
                    c.starttls(_ctx(cfg))
        except (OSError, imaplib.IMAP4.error) as e:
            raise MailError("mail_unavailable", str(e)) from e
        try:
            c.login(_imap_login(cfg, self.address), cfg.get("master_password") or "")
        except imaplib.IMAP4.error as e:
            try:
                c.logout()
            except Exception:  # noqa: BLE001
                pass
            raise MailError("mail_auth_failed", str(e)) from e
        self.c = c
        try:  # login dan keyin imkoniyatlar ro'yxati kengayishi mumkin (MOVE, UIDPLUS, SPECIAL-USE)
            typ, dat = c.capability()
            self._caps = {x.decode().upper() for x in (dat[0] or b"").split()} if typ == "OK" and dat else set()
        except Exception:  # noqa: BLE001
            self._caps = set()
        self._caps |= {x.upper() for x in (c.capabilities or ())}
        return self

    def __exit__(self, *exc) -> None:
        if self.c is not None:
            try:
                self.c.logout()
            except Exception:  # noqa: BLE001
                pass
            self.c = None

    def _ok(self, res, code: str = "mail_error"):
        typ, data = res
        if typ != "OK":
            raise MailError(code, b" ".join(x for x in data if isinstance(x, bytes)).decode("utf-8", "replace") if data else "")
        return data

    def caps(self) -> set[str]:
        return self._caps

    # -------------------------------------------------- papkalar
    def _list(self) -> list[dict]:
        data = self._ok(self.c.list('""', "*"))
        out = []
        for item in data:
            if item is None:
                continue
            if isinstance(item, tuple):
                head, lit = item
                m = LIST_RE.match(head.rstrip() + b' ""')
                name = lit.decode("utf-8", "replace") if lit else ""
            else:
                m = LIST_RE.match(item)
                name = _unquote(m.group("name")) if m else ""
            if not m:
                continue
            flags = [f.lower() for f in m.group("flags").decode().split()]
            delim = _unquote(m.group("delim")) if m.group("delim") != b"NIL" else ""
            if "\\noselect" in flags or "\\nonexistent" in flags:
                continue
            out.append({"path": utf7_decode(name), "delim": delim, "flags": flags})
        return out

    def folders(self, counts: bool = True, create: bool = True) -> list[dict]:
        if self._folders is not None and not counts:
            return self._folders
        raw = self._list()
        roles: dict[str, str] = {}
        for f in raw:
            r = next((SPECIAL_USE[x] for x in f["flags"] if x in SPECIAL_USE), None)
            if f["path"].upper() == "INBOX":
                r = "inbox"
            if r and r not in roles:
                roles[r] = f["path"]
        for f in raw:  # nomlar bo'yicha (SPECIAL-USE bo'lmagan serverlar)
            r = NAME_ROLES.get(f["path"].split(f["delim"] or "/")[-1].strip().lower()) if f["path"] else None
            if r and r not in roles:
                roles[r] = f["path"]
        if create:
            for r, name in DEFAULT_NAMES.items():
                if r not in roles:
                    typ, _ = self.c.create(_q(name))
                    if typ == "OK":
                        self.c.subscribe(_q(name))
                        roles[r] = name
                        raw.append({"path": name, "delim": "/", "flags": []})
        by_path = {v: k for k, v in roles.items()}
        out = []
        for f in raw:
            role = by_path.get(f["path"])
            item = {"path": f["path"], "name": f["path"].split(f["delim"] or "\0")[-1] if f["delim"] else f["path"], "role": role, "delim": f["delim"], "unread": 0, "total": 0}
            if counts:
                typ, st = self.c.status(_q(f["path"]), "(MESSAGES UNSEEN)")
                if typ == "OK" and st and st[0]:
                    s = st[0] if isinstance(st[0], bytes) else st[0][0]
                    m1, m2 = re.search(rb"MESSAGES (\d+)", s), re.search(rb"UNSEEN (\d+)", s)
                    item["total"] = int(m1.group(1)) if m1 else 0
                    item["unread"] = int(m2.group(1)) if m2 else 0
            out.append(item)
        order = {r: i for i, r in enumerate(ROLES_ORDER)}
        out.sort(key=lambda x: (order.get(x["role"], 99), x["path"].lower()))
        self._folders = out
        return out

    def role_path(self, role: str) -> str:
        for f in self.folders(counts=False):
            if f["role"] == role:
                return f["path"]
        raise MailError("folder_not_found", role)

    def role_of(self, path: str) -> str | None:
        for f in self.folders(counts=False):
            if f["path"] == path:
                return f["role"]
        return None

    def _exists(self, path: str) -> bool:
        return any(f["path"] == path for f in self.folders(counts=False))

    def select(self, path: str, readonly: bool = False) -> int:
        if self._selected and self._selected[0] == path and (readonly or not self._selected[1]):
            return -1
        typ, data = self.c.select(_q(path), readonly=readonly)
        if typ != "OK":
            self._selected = None
            raise MailError("folder_not_found", path)
        self._selected = (path, readonly)
        try:
            return int(data[0] or 0)
        except (TypeError, ValueError):
            return 0

    def create_folder(self, name: str, parent: str = "") -> str:
        name = name.strip().replace("/", "-")[:80]
        if not name:
            raise MailError("invalid_folder")
        delim = next((f["delim"] for f in self.folders(counts=False) if f["delim"]), "/")
        path = f"{parent}{delim}{name}" if parent else name
        if self._exists(path):
            raise MailError("folder_exists")
        self._ok(self.c.create(_q(path)), "folder_error")
        self.c.subscribe(_q(path))
        self._folders = None
        return path

    def rename_folder(self, path: str, name: str) -> str:
        if self.role_of(path):
            raise MailError("folder_protected")
        name = name.strip().replace("/", "-")[:80]
        if not name:
            raise MailError("invalid_folder")
        f = next((x for x in self.folders(counts=False) if x["path"] == path), None)
        if not f:
            raise MailError("folder_not_found")
        delim = f["delim"] or "/"
        new = path.rsplit(delim, 1)[0] + delim + name if delim in path else name
        self._ok(self.c.rename(_q(path), _q(new)), "folder_error")
        self.c.unsubscribe(_q(path))
        self.c.subscribe(_q(new))
        self._folders = None
        return new

    def delete_folder(self, path: str) -> None:
        if self.role_of(path) or path.upper() == "INBOX":
            raise MailError("folder_protected")
        if self._selected and self._selected[0] == path:
            self.select("INBOX", readonly=True)
        self._ok(self.c.delete(_q(path)), "folder_error")
        self._folders = None

    # -------------------------------------------------- ro'yxat
    def _search(self, q: str, unread: bool = False, flagged: bool = False) -> list[int]:
        crit: list[str] = []
        if unread:
            crit.append("UNSEEN")
        if flagged:
            crit.append("FLAGGED")
        q = (q or "").strip()[:120]
        if q:
            if q.isascii():
                crit += ["OR", "OR", "FROM", _qs(q), "SUBJECT", _qs(q), "TEXT", _qs(q)]
                typ, data = self.c.uid("SEARCH", *crit)
            else:
                self.c.literal = q.encode()
                typ, data = self.c.uid("SEARCH", "CHARSET", "UTF-8", *crit, "TEXT")
        else:
            typ, data = self.c.uid("SEARCH", *(crit or ["ALL"]))
        if typ != "OK":
            return []
        return sorted({int(x) for x in b" ".join(d for d in data if d).split()})

    def _summaries(self, uids: list[int], folder: str) -> list[dict]:
        if not uids:
            return []
        typ, data = self.c.uid("FETCH", ",".join(map(str, uids)), "(UID FLAGS RFC822.SIZE INTERNALDATE BODY.PEEK[]<0.16384>)")
        if typ != "OK":
            return []
        out = []
        for meta, lit in _fetch_entries(data):
            d = _meta(meta)
            if not d["uid"]:
                continue
            msg = message_from_bytes(lit or b"", policy=policy.default)
            flags = {f.lower() for f in d["flags"]}
            frm = _addr(_hdr(msg, "From"))
            out.append({
                "uid": d["uid"], "folder": folder,
                "from": frm[0] if frm else {"name": "", "email": ""},
                "to": _addr(_hdr(msg, "To")) + _addr(_hdr(msg, "Cc")),
                "subject": _hdr(msg, "Subject"),
                "date": _date(msg, d.get("internal", 0)),
                "seen": "\\seen" in flags, "flagged": "\\flagged" in flags, "answered": "\\answered" in flags,
                "forwarded": "$forwarded" in flags, "draft": "\\draft" in flags,
                "size": d["size"], "attach": _has_attach(msg), "snippet": _snippet(msg),
            })
        return out

    def list(self, folder: str, page: int = 1, size: int = 40, q: str = "", unread: bool = False, flagged: bool = False) -> dict:
        size = max(5, min(size, 100))
        if folder == STARRED:
            items: list[dict] = []
            for f in self.folders(counts=False):
                if f["role"] in ("trash", "junk"):
                    continue
                self.select(f["path"], readonly=True)
                uids = self._search(q, unread=unread, flagged=True)[-200:]
                items += self._summaries(uids, f["path"])
            items.sort(key=lambda x: x["date"], reverse=True)
            total = len(items)
            page_items = items[(page - 1) * size: page * size]
        else:
            self.select(folder, readonly=True)
            uids = self._search(q, unread=unread, flagged=flagged)
            uids.reverse()
            total = len(uids)
            chunk = uids[(page - 1) * size: page * size]
            page_items = self._summaries(chunk, folder)
            page_items.sort(key=lambda x: chunk.index(x["uid"]))
        return {"items": page_items, "total": total, "page": page, "pages": max(1, -(-total // size))}

    # -------------------------------------------------- xat
    def _raw(self, folder: str, uid: int) -> tuple[bytes, list[str]]:
        self.select(folder, readonly=True)
        typ, data = self.c.uid("FETCH", str(uid), "(UID FLAGS BODY.PEEK[])")
        ents = [(m, lit) for m, lit in _fetch_entries(data) if lit is not None] if typ == "OK" else []
        if not ents:
            raise MailError("message_not_found")
        return ents[0][1], _meta(ents[0][0])["flags"]

    def get(self, folder: str, uid: int, mark_seen: bool = True, att_url: str = "") -> dict:
        raw, flags = self._raw(folder, uid)
        msg = message_from_bytes(raw, policy=policy.default)
        html_part = msg.get_body(preferencelist=("html",))
        text_part = msg.get_body(preferencelist=("plain",))
        body_ids = {id(p) for p in (html_part, text_part) if p is not None}
        atts, cids = [], {}
        for i, p in enumerate(_parts(msg)):
            if not _is_attachment(p, body_ids):
                continue
            data = _payload(p)
            cid = (p.get("Content-ID") or "").strip().strip("<>")
            name = p.get_filename() or (f"{cid or 'fayl'}.{p.get_content_subtype()}")
            item = {"part": i, "name": name, "type": p.get_content_type(), "size": len(data), "cid": cid, "inline": p.get_content_disposition() == "inline" and bool(cid)}
            atts.append(item)
            if cid:
                cids[cid] = i
        text = _text(text_part) if text_part is not None else ""
        if html_part is not None:
            body = sanitize_html(_text(html_part))
            if att_url:
                body = re.sub(r'src="cid:([^"]+)"', lambda m: f'src="{att_url}&part={cids[m.group(1)]}"' if m.group(1) in cids else 'src=""', body)
            if not text:
                text = html_to_text(body)
        else:
            body = text_to_html(text)
        if mark_seen and "\\Seen" not in flags:
            self.select(folder)
            self.c.uid("STORE", str(uid), "+FLAGS.SILENT", "(\\Seen)")
            flags = [*flags, "\\Seen"]
        lf = {f.lower() for f in flags}
        frm = _addr(_hdr(msg, "From"))
        return {
            "uid": uid, "folder": folder, "role": self.role_of(folder),
            "subject": _hdr(msg, "Subject"),
            "from": frm[0] if frm else {"name": "", "email": ""},
            "to": _addr(_hdr(msg, "To")), "cc": _addr(_hdr(msg, "Cc")), "bcc": _addr(_hdr(msg, "Bcc")),
            "reply_to": _addr(_hdr(msg, "Reply-To")),
            "date": _date(msg), "message_id": _hdr(msg, "Message-ID"), "references": _hdr(msg, "References"),
            "html": body, "text": text, "attachments": atts,
            "seen": "\\seen" in lf, "flagged": "\\flagged" in lf, "answered": "\\answered" in lf, "draft": "\\draft" in lf,
            "size": len(raw),
        }

    def attachment(self, folder: str, uid: int, part: int) -> tuple[bytes, str, str]:
        raw, _ = self._raw(folder, uid)
        msg = message_from_bytes(raw, policy=policy.default)
        parts = _parts(msg)
        if not 0 <= part < len(parts):
            raise MailError("attachment_not_found")
        p = parts[part]
        cid = (p.get("Content-ID") or "").strip().strip("<>")
        return _payload(p), p.get_filename() or f"{cid or 'fayl'}.{p.get_content_subtype()}", p.get_content_type()

    def raw(self, folder: str, uid: int) -> bytes:
        return self._raw(folder, uid)[0]

    # -------------------------------------------------- amallar
    def store(self, folder: str, uids: list[int], flag: str, on: bool) -> None:
        if not uids:
            return
        self.select(folder)
        self._ok(self.c.uid("STORE", ",".join(map(str, uids)), "+FLAGS.SILENT" if on else "-FLAGS.SILENT", f"({flag})"))

    def _expunge(self, uids: list[int]) -> None:
        if "UIDPLUS" in self.caps():
            self.c.uid("EXPUNGE", ",".join(map(str, uids)))
        else:
            self.c.expunge()

    def move(self, folder: str, uids: list[int], dest: str) -> None:
        if not uids or folder == dest:
            return
        if not self._exists(dest):
            raise MailError("folder_not_found", dest)
        self.select(folder)
        seq = ",".join(map(str, uids))
        if "MOVE" in self.caps():
            self._ok(self.c.uid("MOVE", seq, _q(dest)))
        else:
            self._ok(self.c.uid("COPY", seq, _q(dest)))
            self.c.uid("STORE", seq, "+FLAGS.SILENT", "(\\Deleted)")
            self._expunge(uids)

    def destroy(self, folder: str, uids: list[int]) -> None:
        if not uids:
            return
        self.select(folder)
        self.c.uid("STORE", ",".join(map(str, uids)), "+FLAGS.SILENT", "(\\Deleted)")
        self._expunge(uids)

    def delete(self, folder: str, uids: list[int]) -> str:
        """Savatda yoki spamda bo'lsa — butunlay o'chiriladi, aks holda savatga ko'chiriladi."""
        role = self.role_of(folder)
        if role in ("trash", "junk", "drafts"):
            self.destroy(folder, uids)
            return "destroyed"
        self.move(folder, uids, self.role_path("trash"))
        return "trashed"

    def empty(self, folder: str) -> int:
        n = self.select(folder)
        if n:
            self.c.store("1:*", "+FLAGS.SILENT", "(\\Deleted)")
            self.c.expunge()
        return max(n, 0)

    def mark_all_read(self, folder: str) -> None:
        if self.select(folder):
            self.c.store("1:*", "+FLAGS.SILENT", "(\\Seen)")

    def append(self, folder: str, raw: bytes, flags: str = "(\\Seen)") -> int | None:
        typ, data = self.c.append(_q(folder), flags, imaplib.Time2Internaldate(time.time()), raw)
        if typ != "OK":
            raise MailError("append_failed")
        m = re.search(rb"APPENDUID \d+ (\d+)", b" ".join(x for x in data if isinstance(x, bytes)))
        return int(m.group(1)) if m else None

    def find_by_msgid(self, folder: str, msgid: str) -> int | None:
        self.select(folder, readonly=True)
        typ, data = self.c.uid("SEARCH", "HEADER", "Message-ID", _qs(msgid))
        ids = b" ".join(d for d in data if d).split() if typ == "OK" else []
        return int(ids[-1]) if ids else None


# ================================================================== xat yaratish va yuborish
def parse_recipients(v) -> list[tuple[str, str]]:
    items = v if isinstance(v, list) else [v]
    out = []
    for it in items:
        if isinstance(it, dict):
            out.append((str(it.get("name") or "")[:120], str(it.get("email") or "").strip()))
        elif it:
            out += [(n, e.strip()) for n, e in getaddresses([str(it)]) if e]
    seen, res = set(), []
    for n, e in out:
        if e.lower() in seen:
            continue
        seen.add(e.lower())
        res.append((n, e))
    return res


def build_message(sender: tuple[str, str], data: dict, files: list[tuple[str, str, bytes]], domain: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr(sender)
    for k, hk in (("to", "To"), ("cc", "Cc"), ("bcc", "Bcc")):
        rc = parse_recipients(data.get(k) or [])
        if rc:
            msg[hk] = ", ".join(formataddr(x) for x in rc)
    msg["Subject"] = str(data.get("subject") or "")[:300]
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=domain)
    if data.get("in_reply_to"):
        msg["In-Reply-To"] = str(data["in_reply_to"])[:500]
        refs = (str(data.get("references") or "") + " " + str(data["in_reply_to"])).strip()
        msg["References"] = " ".join(refs.split()[-20:])
    msg["X-Mailer"] = "University webmail"
    html = str(data.get("html") or "")
    text = str(data.get("text") or "") or html_to_text(html)
    msg.set_content(text or " ")
    if html:
        msg.add_alternative(f'<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2a3c">{sanitize_html(html)}</body></html>', subtype="html")
    for name, ctype, blob in files:
        main, _, sub = (ctype or "application/octet-stream").partition("/")
        msg.add_attachment(blob, maintype=main or "application", subtype=sub or "octet-stream", filename=name)
    return msg


def smtp_send(cfg: dict, address: str, msg: EmailMessage, rcpts: list[str]) -> None:
    sec = cfg.get("smtp_security", "starttls")
    host, port = cfg.get("smtp_host") or cfg["imap_host"], int(cfg.get("smtp_port") or 587)
    try:
        s = smtplib.SMTP_SSL(host, port, timeout=30, context=_ctx(cfg)) if sec == "ssl" else smtplib.SMTP(host, port, timeout=30)
    except OSError as e:
        raise MailError("smtp_unavailable", str(e)) from e
    try:
        s.ehlo()
        if sec == "starttls":
            s.starttls(context=_ctx(cfg))
            s.ehlo()
        if s.has_extn("auth"):
            s.login(_imap_login(cfg, address), cfg.get("master_password") or "")
        s.send_message(msg_without_bcc(msg), from_addr=address, to_addrs=rcpts)
    except smtplib.SMTPAuthenticationError as e:
        raise MailError("mail_auth_failed", str(e)) from e
    except smtplib.SMTPRecipientsRefused as e:
        raise MailError("recipients_refused", ", ".join(e.recipients)) from e
    except (smtplib.SMTPException, OSError) as e:
        raise MailError("smtp_error", str(e)) from e
    finally:
        try:
            s.quit()
        except Exception:  # noqa: BLE001
            pass


def system_send(st, to: str, subject: str, html: str, text: str = "", headers: dict | None = None, from_name: str = "University") -> None:
    """Tizim xatlari (obunani tasdiqlash, bildirishnomalar, tarqatma) — universitet pochta serveri orqali, noreply@domen manzilidan."""
    cfg = config(st)
    addr = cfg.get("system_address") or f"noreply@{cfg['domain']}"
    msg = EmailMessage()
    msg["From"] = formataddr((from_name or "University", addr))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=cfg["domain"])
    for k, v in (headers or {}).items():
        msg[k] = v
    msg.set_content(text or html_to_text(html) or " ")
    msg.add_alternative(html, subtype="html")
    smtp_send(cfg, addr, msg, [to])


def msg_without_bcc(msg: EmailMessage) -> EmailMessage:
    m = message_from_bytes(msg.as_bytes(), policy=policy.SMTP)
    del m["Bcc"]
    return m


# ================================================================== Stalwart: hisoblarni avtomatik boshqarish (JMAP boshqaruv API)
USING = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"]


class Stalwart:
    def __init__(self, cfg: dict, opener=None):
        self.cfg = cfg
        # Stalwart v0.16: boshqaruv JMAP orqali (/jmap/, «urn:stalwart:jmap»)
        self.url = cfg["stalwart_url"].rstrip("/") + "/jmap/"
        self._opener = opener or urllib.request.urlopen
        self._domain_id: str | None = None

    def _auth(self) -> str:
        if self.cfg.get("stalwart_token"):
            return "Bearer " + self.cfg["stalwart_token"]
        raw = f"{self.cfg.get('stalwart_user') or 'admin'}:{self.cfg.get('stalwart_password') or ''}".encode()
        return "Basic " + base64.b64encode(raw).decode()

    def call(self, calls: list) -> list:
        body = json.dumps({"using": USING, "methodCalls": calls}).encode()
        req = urllib.request.Request(self.url, data=body, method="POST", headers={"Content-Type": "application/json", "Authorization": self._auth()})
        ctx = _ctx(self.cfg) if self.url.startswith("https") else None
        try:
            with self._opener(req, timeout=20, **({"context": ctx} if ctx else {})) as r:
                res = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            raise MailError("stalwart_http", f"{e.code} {e.read()[:300].decode('utf-8', 'replace')}") from e
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise MailError("stalwart_unavailable", str(e)) from e
        out = res.get("methodResponses") or []
        for name, args, _cid in out:
            if name == "error":
                raise MailError("stalwart_error", json.dumps(args)[:300])
        return out

    @staticmethod
    def _set_result(resp: list, key: str, op: str = "created") -> dict:
        for name, args, _ in resp:
            if name.endswith("/set"):
                if args.get(f"not{op.capitalize()}"):
                    raise MailError("stalwart_error", json.dumps(args[f"not{op.capitalize()}"])[:300])
                return (args.get(op) or {}).get(key) or {}
        return {}

    def _find(self, obj: str, flt: dict, match: dict) -> dict | None:
        resp = self.call([
            [f"x:{obj}/query", {"filter": flt}, "q"],
            [f"x:{obj}/get", {"#ids": {"resultOf": "q", "name": f"x:{obj}/query", "path": "/ids"}}, "g"],
        ])
        for name, args, _ in resp:
            if name == f"x:{obj}/get":
                for it in args.get("list") or []:
                    if all(str(it.get(k, "")).lower() == str(v).lower() for k, v in match.items()):
                        return it
        return None

    def domain_id(self) -> str:
        if self._domain_id:
            return self._domain_id
        domain = self.cfg["domain"]
        found = self._find("Domain", {"name": domain}, {"name": domain})
        if found:
            self._domain_id = found["id"]
        else:
            resp = self.call([["x:Domain/set", {"create": {"d": {
                "name": domain, "aliases": {},
                "certificateManagement": {"@type": "Manual"}, "dkimManagement": {"@type": "Automatic"},
                "dnsManagement": {"@type": "Manual"}, "subAddressing": {"@type": "Enabled"},
            }}}, "c"]])
            self._domain_id = self._set_result(resp, "d").get("id")
        if not self._domain_id:
            raise MailError("stalwart_error", "domain")
        return self._domain_id

    def find_account(self, local: str) -> dict | None:
        did = self.domain_id()
        return self._find("Account", {"name": local, "domainId": did}, {"name": local})

    def ensure_account(self, local: str, description: str = "", password: str | None = None, impersonate: bool = False) -> str:
        did = self.domain_id()
        found = self.find_account(local)
        patch: dict = {}
        if description:
            patch["description"] = description[:200]
        if password:
            patch["credentials"] = {"0": {"@type": "Password", "secret": password}}
        if impersonate:
            patch["permissions"] = {"@type": "Merge", "enabledPermissions": {"impersonate": True}, "disabledPermissions": {}}
        if found:
            if patch:
                self._set_result(self.call([["x:Account/set", {"update": {found["id"]: patch}}, "c"]]), found["id"], "updated")
            return found["id"]
        quota = int(self.cfg.get("quota_mb") or 0)
        acc = {
            "@type": "User", "name": local, "domainId": did, "aliases": {}, "memberGroupIds": {},
            "credentials": patch.pop("credentials", {}), "roles": {"@type": "User"},
            "permissions": patch.pop("permissions", {"@type": "Inherit"}),
            "quotas": {"maxDiskQuota": quota * 1024 * 1024} if quota else {},
            "encryptionAtRest": {"@type": "Disabled"},
        } | patch
        created = self._set_result(self.call([["x:Account/set", {"create": {"a": acc}}, "c"]]), "a")
        return created.get("id", "")

    def rename_account(self, old: str, new: str) -> None:
        found = self.find_account(old)
        if found and not self.find_account(new):
            self._set_result(self.call([["x:Account/set", {"update": {found["id"]: {"name": new}}}, "c"]]), found["id"], "updated")

    def zone_file(self) -> str:
        """Stalwart domen uchun tayyorlagan DNS yozuvlari (DKIM kalitlari bilan)."""
        found = self._find("Domain", {"name": self.cfg["domain"]}, {"name": self.cfg["domain"]})
        return str((found or {}).get("dnsZoneFile") or "")

    def delete_account(self, local: str) -> None:
        found = self.find_account(local)
        if found:
            self.call([["x:Account/set", {"destroy": [found["id"]]}, "c"]])


# ================================================================== fon rejimidagi provisioning navbati
class Provisioner:
    """Hisob yaratish/o'chirish so'rovlari bitta fon oqimida ketma-ket bajariladi (sayt sekinlashmaydi)."""

    def __init__(self, st, opener=None, sync: bool = False):
        self.st, self.opener, self.sync = st, opener, sync
        self.q: queue.Queue = queue.Queue()
        self.thread: threading.Thread | None = None
        self.log: list[dict] = []
        self.state = {"running": False, "done": 0, "total": 0, "errors": 0, "finished": None}

    def _note(self, ok: bool, what: str, detail: str = "") -> None:
        self.log.insert(0, {"ok": ok, "what": what, "detail": detail[:300], "ts": time.strftime("%Y-%m-%d %H:%M:%S")})
        del self.log[50:]
        if not ok:
            log.warning("pochta: %s — %s", what, detail)

    def active(self) -> bool:
        cfg = config(self.st)
        return ready(cfg) and cfg.get("provision") == "stalwart"

    def submit(self, fn, *args) -> None:
        if not self.active():
            return
        if self.sync:
            self._run(fn, args)
            return
        self.q.put((fn, args))
        if not self.thread or not self.thread.is_alive():
            self.thread = threading.Thread(target=self._loop, daemon=True, name="mail-provision")
            self.thread.start()

    def _loop(self) -> None:
        while True:
            try:
                fn, args = self.q.get(timeout=30)
            except queue.Empty:
                return
            self._run(fn, args)

    def _run(self, fn, args) -> None:
        try:
            fn(Stalwart(config(self.st), self.opener), *args)
        except MailError as e:
            self._note(False, getattr(fn, "__name__", "?"), f"{e.code}: {e.detail}")
        except Exception as e:  # noqa: BLE001
            self._note(False, getattr(fn, "__name__", "?"), repr(e))

    def _folders(self, cfg: dict, address: str) -> None:
        """Yangi qutida standart papkalar (Kiruvchi, Qoralamalar, Yuborilgan, Arxiv, Spam, Savat) darhol bo'lsin.
        Server sozlanmagan yoki xizmat hisobi hali yo'q bo'lsa — jim o'tkaziladi (birinchi ochilganda yaratiladi)."""
        if not ready(cfg) or not cfg.get("master_password"):
            return
        try:
            with Mailbox(cfg, address) as mb:
                mb.folders(counts=False, create=True)
        except MailError:
            pass

    # --------------------------------------------- vazifalar
    def user_saved(self, u: dict, password: str | None = None, old_login: str | None = None) -> None:
        if not u.get("active", True):
            return

        def ensure_user(sw: Stalwart, u=u, password=password, old_login=old_login):
            local = local_part(u["login"])
            if old_login and local_part(old_login) != local:
                sw.rename_account(local_part(old_login), local)
            sw.ensure_account(local, u.get("name") or u["login"], password)
            self._folders(sw.cfg, f"{local}@{sw.cfg['domain']}")
            self._note(True, f"hisob: {local}@{sw.cfg['domain']}")

        self.submit(ensure_user)

    def user_deleted(self, u: dict) -> None:
        def delete_user(sw: Stalwart, login=u["login"]):
            sw.delete_account(local_part(login))
            self._note(True, f"o'chirildi: {local_part(login)}")

        self.submit(delete_user)

    def sync_all(self) -> None:
        def sync(sw: Stalwart):
            st = self.st
            users = [u for u in st.list_users() if u.get("active", True)]
            self.state.update(running=True, done=0, total=len(users) + 1, errors=0, finished=None)
            try:
                sw.domain_id()
                cfg = sw.cfg
                if cfg.get("master_password"):
                    sw.ensure_account(cfg["master_user"].split("@")[0], "University webmail service account", cfg["master_password"], impersonate=True)
                sys_addr = cfg.get("system_address") or ""
                if sys_addr.endswith("@" + cfg["domain"]):
                    sw.ensure_account(sys_addr.split("@")[0], "University system emails (subscriptions, notifications)")
                self.state["done"] += 1
                for u in users:
                    try:
                        sw.ensure_account(local_part(u["login"]), u.get("name") or u["login"])
                        self._folders(sw.cfg, f"{local_part(u['login'])}@{sw.cfg['domain']}")
                    except MailError as e:
                        self.state["errors"] += 1
                        self._note(False, u["login"], f"{e.code}: {e.detail}")
                    self.state["done"] += 1
                self._note(True, f"sinxronlash: {len(users)} ta hisob")
            finally:
                self.state.update(running=False, finished=time.strftime("%Y-%m-%d %H:%M:%S"))

        self.submit(sync)


def sync_when_ready(st, attempts: int = 60, delay: float = 10.0) -> None:
    """Ishga tushganda: pochta serveri (docker compose ichida birga ko'tariladi) javob bera boshlagach bir marta to'liq sinxronlash.
    Server hali tayyor bo'lmasa (birinchi ishga tushishda o'zini sozlab olishi ~30 soniya) — fon oqimida qayta urinadi."""

    def loop():
        for _ in range(attempts):
            cfg = config(st)
            if ready(cfg) and cfg.get("provision") == "stalwart":
                try:
                    Stalwart(cfg).domain_id()
                except MailError as e:
                    log.info("pochta serveri hali tayyor emas: %s", e.code)
                else:
                    provisioner(st).sync_all()
                    return
            time.sleep(delay)

    threading.Thread(target=loop, daemon=True, name="mail-wait").start()


_prov: Provisioner | None = None
_prov_lock = threading.Lock()


def provisioner(st) -> Provisioner:
    global _prov
    with _prov_lock:
        if _prov is None or _prov.st is not st:
            _prov = Provisioner(st)
        return _prov


def set_provisioner(p: Provisioner | None) -> None:
    global _prov
    _prov = p


def quote_name(s: str) -> str:
    return quote(s, safe="")


# ================================================================== DNS yozuvlari (hosting panelga kiritish uchun)
ZONE_RE = re.compile(r"^(?P<name>\S+)\s+(?:(?P<ttl>\d+)\s+)?(?:IN\s+)?(?P<type>A|AAAA|MX|TXT|CNAME|SRV|CAA|TLSA)\s+(?P<value>.+)$", re.I)


def _rel(fqdn: str, domain: str) -> str:
    """To'liq nomdan hosting paneli kutadigan qisqa nom: example.edu. → @, _dmarc.example.edu. → _dmarc."""
    n = fqdn.rstrip(".").lower()
    d = domain.lower()
    if n == d:
        return "@"
    return n[: -len(d) - 1] if n.endswith("." + d) else n


def _txt(v: str) -> str:
    parts = re.findall(r'"((?:[^"\\]|\\.)*)"', v)
    return "".join(parts) if parts else v.strip()


def parse_zone(zone: str, domain: str) -> list[dict]:
    out = []
    for line in (zone or "").splitlines():
        line = line.split(";")[0].strip() if not re.search(r'"[^"]*;', line) else line.strip()
        m = ZONE_RE.match(line)
        if not m:
            continue
        t, v = m.group("type").upper(), m.group("value").strip()
        out.append({"type": t, "fqdn": m.group("name").rstrip("."), "host": _rel(m.group("name"), domain), "value": _txt(v) if t == "TXT" else v.rstrip(".")})
    return out


def dns_records(cfg: dict, zone: str = "", dmarc: str = "quarantine") -> list[dict]:
    """Domen va sozlamalardan kelib chiqib barcha kerakli yozuvlar. Stalwart zona fayli bo'lsa — DKIM kalitlari undan olinadi."""
    d = cfg["domain"]
    host = (cfg.get("mail_host") or f"mail.{d}").rstrip(".")
    host_rel = _rel(host, d)
    ip = (cfg.get("server_ip") or "").strip()
    pm = f"postmaster@{d}"
    dmarc = dmarc if dmarc in ("none", "quarantine", "reject") else "quarantine"
    recs: list[dict] = []

    def add(kind, rtype, name, value, why, required=True, priority=None, ttl=3600, extra=None):
        recs.append({"kind": kind, "type": rtype, "host": _rel(name, d) if "." in name else name, "fqdn": (name if name != "@" else d) if name.endswith(d) or name == "@" else f"{name}.{d}",
                     "value": value, "priority": priority, "ttl": ttl, "why": why, "required": required, **(extra or {})})

    add("a", "A", host_rel, ip or "SERVER_IP", "Pochta serverining IP manzili (Cloudflare’da «DNS only» — kulrang bulut, proksi o‘chiq)", priority=None, extra={"placeholder": not ip})
    add("mx", "MX", "@", host, "Kiruvchi xatlar shu serverga keladi", priority=10)
    add("spf", "TXT", "@", "v=spf1 mx ra=postmaster -all", "SPF: domen nomidan faqat MX serverlari xat yubora oladi")
    add("spf", "TXT", host_rel, "v=spf1 a ra=postmaster -all", "SPF: pochta serverining o‘z nomi uchun (HELO)", required=False)
    dkim = [r for r in parse_zone(zone, d) if r["type"] == "TXT" and "._domainkey" in r["fqdn"]]
    if dkim:
        for r in dkim:
            algo = "Ed25519" if "k=ed25519" in r["value"] else "RSA"
            add("dkim", "TXT", r["host"], r["value"], f"DKIM ({algo}) — chiquvchi xatlar imzosini tekshirish uchun ochiq kalit")
    else:
        add("dkim", "TXT", "SELECTOR._domainkey", "v=DKIM1; k=rsa; p=…", "DKIM kaliti Stalwart’da yaratiladi: «Hisoblarni sinxronlash»dan keyin shu yerda haqiqiy qiymat chiqadi (yoki Stalwart admin → Domains → DNS records)", extra={"placeholder": True})
    add("dmarc", "TXT", "_dmarc", f"v=DMARC1; p={dmarc}; rua=mailto:{pm}; ruf=mailto:{pm}; fo=1; adkim=r; aspf=r", "DMARC: SPF/DKIM tekshiruvidan o‘tmagan xatlarga siyosat va hisobotlar manzili")
    add("tlsrpt", "TXT", "_smtp._tls", f"v=TLSRPTv1; rua=mailto:{pm}", "TLS hisobotlari (tavsiya etiladi)", required=False)
    zone_recs = parse_zone(zone, d)
    sts = next((r for r in zone_recs if r["fqdn"].lower().startswith("_mta-sts.")), None)
    add("mtasts", "CNAME", "mta-sts", host, "MTA-STS siyosati sahifasi (tavsiya etiladi)", required=False)
    add("mtasts", "TXT", "_mta-sts", sts["value"] if sts else "v=STSv1; id=" + time.strftime("%Y%m%d01"), "MTA-STS: kiruvchi ulanishlar faqat TLS orqali (tavsiya etiladi)", required=False)
    for svc, port in (("_imaps._tcp", 993), ("_submissions._tcp", 465), ("_submission._tcp", 587)):
        add("srv", "SRV", svc, f"0 1 {port} {host}", "Telefon va Thunderbird sozlamalarni avtomatik topishi uchun", required=False, priority=0,
            extra={"service": svc.split(".")[0], "protocol": "_tcp", "weight": 1, "port": port, "target": host})
    add("autoconfig", "CNAME", "autoconfig", host, "Thunderbird avtomatik sozlash", required=False)
    add("autoconfig", "CNAME", "autodiscover", host, "Outlook avtomatik sozlash", required=False)
    add("caa", "CAA", "@", '0 issue "letsencrypt.org"', "Faqat Let’s Encrypt sertifikat bera oladi (ixtiyoriy)", required=False)
    return recs


def zone_text(recs: list[dict], domain: str) -> str:
    lines = [f"; {domain} — pochta uchun DNS yozuvlari (BIND formatida)"]
    for r in recs:
        name = r["fqdn"].rstrip(".") + "."
        if r["type"] == "MX":
            val = f"{r['priority']} {r['value']}."
        elif r["type"] == "TXT":
            v = r["value"]
            val = " ".join('"' + v[i:i + 250] + '"' for i in range(0, len(v), 250))
        elif r["type"] in ("CNAME",):
            val = r["value"].rstrip(".") + "."
        elif r["type"] == "SRV":
            val = r["value"] + "."
        else:
            val = r["value"]
        lines.append(f"{name}\t{r['ttl']}\tIN\t{r['type']}\t{val}")
    return "\n".join(lines) + "\n"
