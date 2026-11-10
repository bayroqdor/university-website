"""ONLYOFFICE Docs integratsiyasi: saytdagi hujjatlarni ko'rish va kabinet/admin panelida hujjat yaratish va tahrirlash.

Qanday ishlaydi:
* Hujjat serveri (Document Server) docker-compose'dagi `onlyoffice` konteyneri. Brauzer unga sayt orqali murojaat qiladi:
  `/office-ds/…` yo'li ilova ichida proksilanadi (HTTP va WebSocket) — alohida domen yoki port ochish shart emas.
  Tashqi server ham ishlatilishi mumkin (admin → ONLYOFFICE → «Hujjat serveri manzili»).
* Server ↔ sayt: Document Server faylni `app_url` (ichki tarmoq, masalan http://web:8000) orqali yuklab oladi va
  tahrir tugagach `callback` ga xabar beradi; sayt yangi versiyani saqlaydi. Har bir so'rov JWT (HS256) bilan imzolanadi —
  umumiy kalit birinchi ishga tushishda avtomatik yaratiladi (office-secrets volume) yoki SITE_OFFICE_JWT_SECRET.
* Foydalanuvchi hujjatlari: `office_docs` jadvali + `data/office/<id>/v<N>.<ext>` (oxirgi 10 versiya saqlanadi).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

TEMPLATES = Path(__file__).parent / "templates" / "office"
# ONLYOFFICE turlari: word / cell / slide (+ pdf)
KINDS = {
    "docx": "word", "doc": "word", "odt": "word", "rtf": "word", "txt": "word", "dotx": "word", "docm": "word", "epub": "word", "fb2": "word", "html": "word",
    "xlsx": "cell", "xls": "cell", "ods": "cell", "csv": "cell", "xlsm": "cell", "xltx": "cell",
    "pptx": "slide", "ppt": "slide", "odp": "slide", "ppsx": "slide", "pps": "slide", "potx": "slide",
    "pdf": "pdf", "djvu": "pdf", "xps": "pdf", "oxps": "pdf",
}
CREATE = ("docx", "xlsx", "pptx")
EDITABLE = {"docx", "xlsx", "pptx", "odt", "ods", "odp", "doc", "xls", "ppt", "rtf", "txt", "csv", "docm", "xlsm"}
MAX_SIZE = 100 * 1024 * 1024
KEEP_VERSIONS = 10
FIELDS = ("enabled", "url", "internal_url", "app_url", "secret")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ext_of(name: str) -> str:
    m = re.search(r"\.([A-Za-z0-9]{2,5})$", (name or "").split("?")[0])
    return m.group(1).lower() if m else ""


# ====================================================================== sozlamalar
def _secret_file() -> Path | None:
    p = os.environ.get("SITE_OFFICE_JWT_FILE", "")
    return Path(p) if p else None


def env_defaults() -> dict:
    e = os.environ.get
    return {
        # «0» — o'chirilgan; docker-compose'da standart holatda yoqilgan
        "enabled": e("SITE_OFFICE_ENABLED", "0").lower() in ("1", "true", "yes"),
        # brauzer uchun manzil: sayt ichidagi proksi (standart) yoki tashqi server (https://office.example.edu)
        "url": e("SITE_OFFICE_URL", "/office-ds"),
        # ilova → hujjat serveri (ichki tarmoq)
        "internal_url": e("SITE_OFFICE_INTERNAL_URL", "http://onlyoffice"),
        # hujjat serveri → ilova (faylni yuklab olish va callback)
        "app_url": e("SITE_OFFICE_APP_URL", "http://web:8000"),
        "secret": e("SITE_OFFICE_JWT_SECRET", ""),
    }


_secret_cache: dict[str, tuple[float, str]] = {}


def _file_secret(f: Path) -> str:
    """Kalit fayli (office-secrets volume) — o'zgarmaguncha qayta o'qilmaydi (proksi orqali har bir so'rovda chaqiriladi)."""
    try:
        mt = f.stat().st_mtime
    except OSError:
        return ""
    hit = _secret_cache.get(str(f))
    if hit and hit[0] == mt:
        return hit[1]
    v = f.read_text().strip()
    _secret_cache[str(f)] = (mt, v)
    return v


def config(st) -> dict:
    saved = st.kv_get("office") or {}
    cfg = env_defaults() | {k: v for k, v in saved.items() if k in FIELDS and v not in (None, "")}
    if not cfg.get("secret"):
        f = _secret_file()
        if f:
            cfg["secret"] = _file_secret(f)
    return cfg


def clean(data: dict, current: dict) -> dict:
    out = {k: current.get(k) for k in FIELDS if k in current}
    if "enabled" in data:
        out["enabled"] = bool(data["enabled"])
    for k in ("url", "internal_url", "app_url"):
        if k in data:
            v = str(data.get(k) or "").strip().rstrip("/")[:300]
            if v and not (v.startswith(("http://", "https://")) or (k == "url" and v.startswith("/"))):
                v = "https://" + v
            out[k] = v
    if data.get("secret"):
        out["secret"] = str(data["secret"]).strip()[:300]
    return out


def public(cfg: dict) -> dict:
    return {k: v for k, v in cfg.items() if k != "secret"} | {"has_secret": bool(cfg.get("secret"))}


def ready(cfg: dict) -> bool:
    return bool(cfg.get("enabled") and cfg.get("url"))


# ====================================================================== JWT (HS256)
def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def jwt_encode(payload: dict, secret: str) -> str:
    head = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode())
    sig = hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
    return f"{head}.{body}.{_b64(sig)}"


def jwt_decode(token: str, secret: str) -> dict | None:
    try:
        head, body, sig = token.split(".")
        good = hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(good, _unb64(sig)):
            return None
        data = json.loads(_unb64(body))
        if isinstance(data, dict) and data.get("exp") and float(data["exp"]) < time.time():
            return None
        return data
    except Exception:  # noqa: BLE001
        return None


# ---------------------------------------------------------------- fayl havolasi uchun qisqa imzo (Document Server sessiyasiz yuklab oladi)
def link_sig(secret: str, doc_id: str, exp: int) -> str:
    return hmac.new((secret or "university").encode(), f"{doc_id}:{exp}".encode(), hashlib.sha256).hexdigest()[:32]


def link_ok(secret: str, doc_id: str, exp: int, sig: str) -> bool:
    return exp > time.time() and hmac.compare_digest(link_sig(secret, doc_id, exp), sig or "")


# ====================================================================== foydalanuvchi hujjatlari
class Docs:
    def __init__(self, st):
        self.st = st
        self.root = st.dir / "office"
        self.root.mkdir(parents=True, exist_ok=True)
        with st._tx() as c:  # noqa: SLF001
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS office_docs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, ext TEXT NOT NULL,
                    size BIGINT NOT NULL DEFAULT 0, version BIGINT NOT NULL DEFAULT 1, doc_key TEXT NOT NULL, starred BIGINT NOT NULL DEFAULT 0,
                    created TEXT NOT NULL, updated TEXT NOT NULL, edited_by TEXT);
                CREATE INDEX IF NOT EXISTS ix_office_owner ON office_docs(owner_id, updated);
                """
            )

    @staticmethod
    def _row(r) -> dict:
        d = dict(r)
        d["kind"] = KINDS.get(d["ext"], "word")
        d["editable"] = d["ext"] in EDITABLE
        d["starred"] = bool(d["starred"])
        return d

    def path(self, d: dict, version: int | None = None) -> Path:
        return self.root / d["id"] / f"v{version or d['version']}.{d['ext']}"

    def list(self, owner_id: str) -> list[dict]:
        return [self._row(r) for r in self.st._q("SELECT * FROM office_docs WHERE owner_id=%s ORDER BY starred DESC, updated DESC", (owner_id,))]  # noqa: SLF001

    def get(self, doc_id: str) -> dict | None:
        r = self.st._q("SELECT * FROM office_docs WHERE id=%s", (doc_id,))  # noqa: SLF001
        return self._row(r[0]) if r else None

    def _insert(self, owner_id: str, title: str, ext: str, raw: bytes) -> dict:
        did = uuid.uuid4().hex[:16]
        now = _now()
        d = {"id": did, "ext": ext, "version": 1}
        p = self.path(d)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(raw)
        with self.st._tx() as c:  # noqa: SLF001
            c.execute("INSERT INTO office_docs(id, owner_id, title, ext, size, version, doc_key, created, updated) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                      (did, owner_id, title[:200], ext, len(raw), 1, f"{did}-1-{secrets.token_hex(4)}", now, now))
        return self.get(did)  # type: ignore[return-value]

    def create(self, owner_id: str, ext: str, title: str = "") -> dict:
        if ext not in CREATE:
            raise ValueError("bad_type")
        raw = (TEMPLATES / f"new.{ext}").read_bytes()
        names = {"docx": "Yangi hujjat", "xlsx": "Yangi jadval", "pptx": "Yangi taqdimot"}
        return self._insert(owner_id, (title or "").strip() or names[ext], ext, raw)

    def upload(self, owner_id: str, filename: str, raw: bytes) -> dict:
        ext = ext_of(filename)
        if ext not in KINDS:
            raise ValueError("bad_type")
        if len(raw) > MAX_SIZE:
            raise ValueError("too_large")
        title = re.sub(r"\.[A-Za-z0-9]{2,5}$", "", Path(filename).name)[:200] or "Hujjat"
        return self._insert(owner_id, title, ext, raw)

    def rename(self, doc_id: str, title: str) -> None:
        with self.st._tx() as c:  # noqa: SLF001
            c.execute("UPDATE office_docs SET title=%s, updated=%s WHERE id=%s", ((title or "").strip()[:200] or "Hujjat", _now(), doc_id))

    def star(self, doc_id: str, on: bool) -> None:
        with self.st._tx() as c:  # noqa: SLF001
            c.execute("UPDATE office_docs SET starred=%s WHERE id=%s", (int(bool(on)), doc_id))

    def delete(self, doc_id: str) -> None:
        with self.st._tx() as c:  # noqa: SLF001
            c.execute("DELETE FROM office_docs WHERE id=%s", (doc_id,))
        shutil.rmtree(self.root / doc_id, ignore_errors=True)

    def save_version(self, doc_id: str, raw: bytes, editor: str = "", ext: str = "") -> dict | None:
        """Hujjat serveridan kelgan yangi versiya (callback): fayl yoziladi, kalit yangilanadi, eski versiyalar qisqartiriladi."""
        d = self.get(doc_id)
        if not d:
            return None
        v = d["version"] + 1
        nd = {**d, "ext": ext or d["ext"]}
        p = self.path(nd, v)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(raw)
        with self.st._tx() as c:  # noqa: SLF001
            c.execute("UPDATE office_docs SET version=%s, ext=%s, size=%s, doc_key=%s, updated=%s, edited_by=%s WHERE id=%s",
                      (v, nd["ext"], len(raw), f"{doc_id}-{v}-{secrets.token_hex(4)}", _now(), editor[:120] or None, doc_id))
        for old in sorted((self.root / doc_id).glob("v*.*"), key=lambda x: x.stat().st_mtime)[:-KEEP_VERSIONS]:
            old.unlink(missing_ok=True)
        return self.get(doc_id)


def site_key(src: str, size: int, mtime: float) -> str:
    """Saytdagi (faqat ko'rish uchun) fayl kaliti: fayl o'zgarsa — yangi kalit (keshlangan eski nusxa ko'rinmasin).

    Kalit har ochilishda bir xil bo'lishi shart: Document Server faylni kalit bo'yicha keshlaydi — kalit o'zgarsa, fayl har safar
    qaytadan yuklab olinadi va konvertatsiya qilinadi (katta PDF uchun daqiqalar). Shuning uchun vaqt/tasodifiy qiymat qo'shilmaydi."""
    return hashlib.sha1(f"{src}:{size}:{int(mtime)}".encode()).hexdigest()[:20]


UI_TYPES = ("desktop", "mobile")


def editor_config(cfg: dict, *, kind: str, ext: str, title: str, key: str, url: str, mode: str, user: dict | None, lang: str,
                  callback: str = "", back_url: str = "", ui: str = "desktop") -> dict:
    """DocsAPI.DocEditor konfiguratsiyasi (JWT bilan imzolangan).

    `ui` — «mobile»: telefonda yengil mobil tahrirlagich (to'liq desktop interfeysi telefon uchun og'ir). Tur tokenga ham kiradi —
    Document Server token ichidagi qiymatni oladi, shuning uchun uni brauzer emas, server belgilaydi."""
    can_edit = mode == "edit"
    out = {
        "documentType": kind,
        "type": ui if ui in UI_TYPES else "desktop",
        "width": "100%",
        "height": "100%",
        "document": {
            "fileType": ext,
            "key": key,
            "title": title if title.lower().endswith("." + ext) else f"{title}.{ext}",
            "url": url,
            "permissions": {"edit": can_edit, "download": True, "print": True, "comment": can_edit, "review": can_edit, "fillForms": True, "copy": True},
        },
        "editorConfig": {
            "mode": "edit" if can_edit else "view",
            "lang": {"uz": "uz", "ru": "ru", "en": "en"}.get(lang, "uz"),
            "region": {"uz": "uz-UZ", "ru": "ru-RU", "en": "en-US"}.get(lang, "uz-UZ"),
            "customization": {"autosave": True, "forcesave": True, "compactHeader": False, "toolbarNoTabs": False,
                              "uiTheme": "theme-classic-light", "help": False, "feedback": False, "plugins": False},
        },
    }
    if back_url:
        out["editorConfig"]["customization"]["goback"] = {"url": back_url, "text": {"uz": "Orqaga", "ru": "Назад", "en": "Back"}.get(lang, "Orqaga")}
    if user:
        out["editorConfig"]["user"] = {"id": user["id"], "name": user.get("name") or user.get("login") or ""}
    else:
        # saytdagi mehmon: ism so'ralmaydi
        guest = {"uz": "Mehmon", "ru": "Гость", "en": "Guest"}.get(lang, "Mehmon")
        out["editorConfig"]["user"] = {"id": "guest", "name": guest}
        out["editorConfig"]["customization"]["anonymous"] = {"request": False, "label": guest}
    if callback:
        out["editorConfig"]["callbackUrl"] = callback
    if cfg.get("secret"):
        out["token"] = jwt_encode({k: v for k, v in out.items() if k != "token"} | {"exp": int(time.time()) + 6 * 3600}, cfg["secret"])
    return out
