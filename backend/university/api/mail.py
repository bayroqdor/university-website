"""Veb-pochta API: har bir xodim va talaba o'z pochta qutisini kabinetda ko'radi (kiruvchi, yuborilgan, qoralama, spam, savat, arxiv...).
Admin: pochta serveri sozlamalari, ulanishni tekshirish, hisoblarni sinxronlash."""
from __future__ import annotations

import json
import time
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from .. import mail as M
from .deps import current_admin, current_user, ok, rate_limit, svc

router = APIRouter()


def _cfg() -> dict:
    cfg = M.config(svc().st)
    if not M.ready(cfg):
        raise HTTPException(503, "mail_disabled")
    return cfg


def _err(e: M.MailError) -> HTTPException:
    code = 404 if e.code in ("message_not_found", "folder_not_found", "attachment_not_found") else 400 if e.code in ("invalid_folder", "folder_exists", "folder_protected", "recipients_refused", "invalid_recipient", "no_recipients", "too_large") else 502
    return HTTPException(code, e.code)


class _Box:
    """`with _box(u) as mb:` — MailError ni HTTP xatoga aylantiradi."""

    def __init__(self, u: dict):
        self.cfg = _cfg()
        self.address = M.mail_address(u, self.cfg["domain"])
        self.mb = M.Mailbox(self.cfg, self.address)

    def __enter__(self) -> M.Mailbox:
        try:
            return self.mb.__enter__()
        except M.MailError as e:
            raise _err(e) from e

    def __exit__(self, et, ev, tb):
        self.mb.__exit__(et, ev, tb)
        if isinstance(ev, M.MailError):
            raise _err(ev) from ev
        return False


def _att_url(folder: str, uid: int) -> str:
    return f"/api/mail/attachment?folder={quote(folder, safe='')}&uid={uid}&inline=1"


@router.get("/api/mail/status")
def mail_status(u: dict = Depends(current_user)):
    cfg = M.config(svc().st)
    if not M.ready(cfg):
        return ok({"enabled": False})
    return ok({
        "enabled": True, "address": M.mail_address(u, cfg["domain"]), "name": u.get("name") or u["login"], "domain": cfg["domain"],
        "max_attach_mb": cfg.get("max_attach_mb") or 20, "imap": cfg.get("public_imap") or "", "smtp": cfg.get("public_smtp") or "",
        "groups": u["role"] != "student",
    })


@router.get("/api/mail/folders")
def mail_folders(u: dict = Depends(current_user)):
    with _Box(u) as mb:
        return ok({"items": mb.folders()})


@router.get("/api/mail/messages")
def mail_messages(folder: str = "INBOX", page: int = 1, size: int = 40, q: str = "", unread: int = 0, flagged: int = 0, u: dict = Depends(current_user)):
    with _Box(u) as mb:
        return ok(mb.list(folder, max(1, page), size, q, bool(unread), bool(flagged)))


@router.get("/api/mail/message")
def mail_message(folder: str, uid: int, seen: int = 1, u: dict = Depends(current_user)):
    with _Box(u) as mb:
        return ok(mb.get(folder, uid, mark_seen=bool(seen), att_url=_att_url(folder, uid)))


def _disposition(name: str, inline: bool) -> str:
    ascii_name = "".join(ch if 32 <= ord(ch) < 127 and ch not in '"\\' else "_" for ch in name) or "fayl"
    return f"{'inline' if inline else 'attachment'}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name, safe='')}"


SAFE_INLINE = ("image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain")


@router.get("/api/mail/attachment")
def mail_attachment(folder: str, uid: int, part: int, inline: int = 0, u: dict = Depends(current_user)):
    with _Box(u) as mb:
        data, name, ctype = mb.attachment(folder, uid, part)
    show = bool(inline) and ctype in SAFE_INLINE
    return Response(data, media_type=ctype if show else "application/octet-stream", headers={
        "Content-Disposition": _disposition(name, show), "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    })


@router.get("/api/mail/raw")
def mail_raw(folder: str, uid: int, u: dict = Depends(current_user)):
    with _Box(u) as mb:
        raw = mb.raw(folder, uid)
    return Response(raw, media_type="message/rfc822", headers={"Content-Disposition": f'attachment; filename="xat-{uid}.eml"', "Cache-Control": "no-store"})


# ------------------------------------------------------------------ yuborish va qoralamalar
def _expand(u: dict, items) -> list:
    """«group:<id>» manzilini guruh talabalari manzillariga aylantiradi (faqat xodimlar uchun)."""
    st, cfg = svc().st, M.config(svc().st)
    out = []
    for it in items if isinstance(items, list) else [items]:
        email = (it.get("email") if isinstance(it, dict) else str(it or "")).strip()
        if email.startswith("group:"):
            if u["role"] == "student":
                raise HTTPException(403, "forbidden")
            for s in st.list_users("student", email[6:], active=True):
                out.append({"name": s.get("name") or "", "email": M.mail_address(s, cfg["domain"])})
        elif email.startswith("section:"):
            if u["role"] == "student":
                raise HTTPException(403, "forbidden")
            for s in st.list_users(active=True):
                if email[8:] in ((s.get("data") or {}).get("sections") or []) and s["id"] != u["id"]:
                    out.append({"name": s.get("name") or "", "email": M.mail_address(s, cfg["domain"])})
        elif email:
            out.append(it if isinstance(it, dict) else email)
    return out


async def _files(files: list[UploadFile] | None, limit_mb: int) -> list[tuple[str, str, bytes]]:
    out, total = [], 0
    for f in files or []:
        blob = await f.read()
        total += len(blob)
        if total > limit_mb * 1024 * 1024:
            raise HTTPException(400, "too_large")
        out.append(((f.filename or "fayl")[:180], f.content_type or "application/octet-stream", blob))
    return out


def _payload(raw: str) -> dict:
    try:
        d = json.loads(raw or "{}")
    except ValueError as e:
        raise HTTPException(400, "invalid_payload") from e
    if not isinstance(d, dict):
        raise HTTPException(400, "invalid_payload")
    return d


def _forwarded(mb: M.Mailbox, d: dict) -> list[tuple[str, str, bytes]]:
    """Yo'naltirilgan (forward) yoki qoralamadagi xatning tanlangan ilovalari."""
    src = d.get("attach_from") or {}
    out = []
    if src.get("folder") and src.get("uid"):
        for part in (src.get("parts") or [])[:30]:
            try:
                blob, name, ctype = mb.attachment(str(src["folder"]), int(src["uid"]), int(part))
            except (M.MailError, ValueError, TypeError):
                continue
            out.append((name, ctype, blob))
    return out


@router.post("/api/mail/send")
async def mail_send(request: Request, payload: str = Form("{}"), files: list[UploadFile] | None = File(None), u: dict = Depends(current_user)):
    rate_limit(f"mail:{u['id']}", 60, 3600)
    d = _payload(payload)
    cfg = _cfg()
    address = M.mail_address(u, cfg["domain"])
    for k in ("to", "cc", "bcc"):
        d[k] = _expand(u, d.get(k) or [])
    rcpts = [e for k in ("to", "cc", "bcc") for _n, e in M.parse_recipients(d[k])]
    if not rcpts:
        raise HTTPException(400, "no_recipients")
    bad = [e for e in rcpts if not M.EMAIL_RE.match(e)]
    if bad:
        raise HTTPException(400, "invalid_recipient:" + ", ".join(bad[:5]))
    if len(rcpts) > 500:
        raise HTTPException(400, "too_many_recipients")
    att = await _files(files, int(cfg.get("max_attach_mb") or 20))
    with _Box(u) as mb:
        att += _forwarded(mb, d)
        if sum(len(b) for _n, _t, b in att) > int(cfg.get("max_attach_mb") or 20) * 1024 * 1024:
            raise HTTPException(400, "too_large")
        msg = M.build_message((u.get("name") or "", address), d, att, cfg["domain"])
        try:
            M.smtp_send(cfg, address, msg, rcpts)
        except M.MailError as e:
            raise _err(e) from e
        try:
            mb.append(mb.role_path("sent"), msg.as_bytes(), "(\\Seen)")
        except M.MailError:
            pass
        ref = d.get("reply_to_msg") or {}
        if ref.get("folder") and ref.get("uid"):
            try:
                mb.store(str(ref["folder"]), [int(ref["uid"])], "$Forwarded" if d.get("mode") == "forward" else "\\Answered", True)
            except (M.MailError, ValueError):
                pass
        if d.get("draft_uid"):
            try:
                mb.destroy(mb.role_path("drafts"), [int(d["draft_uid"])])
            except (M.MailError, ValueError):
                pass
    return ok({"ok": True, "message_id": msg["Message-ID"], "recipients": len(rcpts)})


@router.post("/api/mail/draft")
async def mail_draft(payload: str = Form("{}"), files: list[UploadFile] | None = File(None), u: dict = Depends(current_user)):
    d = _payload(payload)
    cfg = _cfg()
    address = M.mail_address(u, cfg["domain"])
    for k in ("to", "cc", "bcc"):
        d[k] = [x for x in (d.get(k) or []) if isinstance(x, (dict, str))]
    att = await _files(files, int(cfg.get("max_attach_mb") or 20))
    with _Box(u) as mb:
        att += _forwarded(mb, d)
        msg = M.build_message((u.get("name") or "", address), d, att, cfg["domain"])
        drafts = mb.role_path("drafts")
        uid = mb.append(drafts, msg.as_bytes(), "(\\Seen \\Draft)") or mb.find_by_msgid(drafts, msg["Message-ID"])
        if d.get("draft_uid"):
            try:
                mb.destroy(drafts, [int(d["draft_uid"])])
            except (M.MailError, ValueError):
                pass
    return ok({"ok": True, "uid": uid, "folder": drafts, "saved": time.strftime("%H:%M")})


# ------------------------------------------------------------------ amallar
FLAG_ACTIONS = {"read": ("\\Seen", True), "unread": ("\\Seen", False), "flag": ("\\Flagged", True), "unflag": ("\\Flagged", False)}


@router.post("/api/mail/action")
def mail_action(data: dict = Body(...), u: dict = Depends(current_user)):
    action = str(data.get("action") or "")
    by_folder: dict[str, list[int]] = {}
    for it in (data.get("items") or [])[:1000]:
        try:
            by_folder.setdefault(str(it["folder"]), []).append(int(it["uid"]))
        except (KeyError, TypeError, ValueError):
            continue
    if not by_folder:
        raise HTTPException(400, "nothing_selected")
    result = ""
    with _Box(u) as mb:
        for folder, uids in by_folder.items():
            if action in FLAG_ACTIONS:
                flag, on = FLAG_ACTIONS[action]
                mb.store(folder, uids, flag, on)
            elif action == "delete":
                result = mb.delete(folder, uids)
            elif action == "destroy":
                mb.destroy(folder, uids)
            elif action in ("spam", "archive", "trash"):
                mb.move(folder, uids, mb.role_path({"spam": "junk"}.get(action, action)))
            elif action in ("notspam", "restore", "inbox"):
                mb.move(folder, uids, mb.role_path("inbox"))
            elif action == "move":
                mb.move(folder, uids, str(data.get("dest") or ""))
            else:
                raise HTTPException(400, "invalid_action")
    return ok({"ok": True, "result": result})


@router.post("/api/mail/empty")
def mail_empty(data: dict = Body(...), u: dict = Depends(current_user)):
    folder = str(data.get("folder") or "")
    with _Box(u) as mb:
        if mb.role_of(folder) not in ("trash", "junk"):
            raise HTTPException(400, "folder_protected")
        n = mb.empty(folder)
    return ok({"ok": True, "removed": n})


@router.post("/api/mail/read-all")
def mail_read_all(data: dict = Body(...), u: dict = Depends(current_user)):
    with _Box(u) as mb:
        mb.mark_all_read(str(data.get("folder") or "INBOX"))
    return ok({"ok": True})


@router.post("/api/mail/folders")
def mail_folder_create(data: dict = Body(...), u: dict = Depends(current_user)):
    with _Box(u) as mb:
        return ok({"path": mb.create_folder(str(data.get("name") or ""), str(data.get("parent") or ""))})


@router.put("/api/mail/folders")
def mail_folder_rename(data: dict = Body(...), u: dict = Depends(current_user)):
    with _Box(u) as mb:
        return ok({"path": mb.rename_folder(str(data.get("path") or ""), str(data.get("name") or ""))})


@router.delete("/api/mail/folders")
def mail_folder_delete(path: str, u: dict = Depends(current_user)):
    with _Box(u) as mb:
        mb.delete_folder(path)
    return ok({"ok": True})


# ------------------------------------------------------------------ manzillar kitobi
@router.get("/api/mail/contacts")
def mail_contacts(q: str = "", u: dict = Depends(current_user)):
    st = svc().st
    cfg = M.config(st)
    q = q.strip()[:60]
    if len(q) < 1:
        return ok({"items": []})
    groups = {g["id"]: g for g in st.acad_list("groups")}
    users = [x for x in st.list_users(q=q, active=True) if x["id"] != u["id"]]
    if u["role"] == "student":  # talaba: o'qituvchilar, xodimlar va o'z guruhdoshlari
        users = [x for x in users if x["role"] != "student" or (x.get("group_id") and x.get("group_id") == u.get("group_id"))]
    role_label = {"admin": "Administrator", "teacher": "Professor-o‘qituvchi", "staff": "Xodim", "student": "Talaba"}
    items = []
    for x in users[:15]:
        hint = (groups.get(x.get("group_id") or "") or {}).get("name") if x["role"] == "student" else (x.get("data") or {}).get("position")
        items.append({"type": "user", "name": x.get("name") or x["login"], "email": M.mail_address(x, cfg["domain"]), "hint": hint or role_label.get(x["role"], ""), "photo": (x.get("data") or {}).get("photo") or ""})
    if u["role"] != "student":
        ql = q.lower()
        for g in groups.values():
            if ql in g["name"].lower():
                n = len(st.list_users("student", g["id"], active=True))
                items.append({"type": "group", "name": f"{g['name']} guruhi", "email": f"group:{g['id']}", "hint": f"{n} talaba"})
        from .academic import sections  # noqa: PLC0415

        all_users = st.list_users(active=True)
        for sec in sections(st):
            if ql in sec["name"].lower():
                n = sum(1 for x in all_users if sec["id"] in ((x.get("data") or {}).get("sections") or []))
                items.append({"type": "group", "name": sec["name"], "email": f"section:{sec['id']}", "hint": f"{n} xodim"})
    return ok({"items": items[:20]})


# ------------------------------------------------------------------ admin: pochta serveri
def _admin_payload() -> dict:
    st = svc().st
    cfg = M.config(st)
    p = M.provisioner(st)
    return {"config": M.public_config(cfg), "ready": M.ready(cfg), "state": p.state, "log": p.log[:30], "users": len(st.list_users(active=True))}


@router.get("/api/admin/mail")
def admin_mail(a: dict = Depends(current_admin)):
    return ok(_admin_payload())


@router.put("/api/admin/mail")
def admin_mail_save(data: dict = Body(...), a: dict = Depends(current_admin)):
    st = svc().st
    old = st.kv_get("mail") or {}
    new = M.clean_config(data, old)
    st.kv_put("mail", new)
    return ok(_admin_payload())


@router.post("/api/admin/mail/test")
def admin_mail_test(a: dict = Depends(current_admin)):
    """Ulanishni tekshirish: Stalwart API, IMAP (admin manzili nomidan) va SMTP."""
    st = svc().st
    cfg = M.config(st)
    checks = []
    if cfg.get("provision") == "stalwart":
        try:
            M.Stalwart(cfg, M.provisioner(st).opener).domain_id()
            checks.append({"name": "Stalwart API", "ok": True, "detail": cfg["stalwart_url"]})
        except M.MailError as e:
            checks.append({"name": "Stalwart API", "ok": False, "detail": f"{e.code}: {e.detail}"[:300]})
    try:
        with M.Mailbox(cfg, M.mail_address(a, cfg["domain"])) as mb:
            n = len(mb.folders(counts=False))
        checks.append({"name": "IMAP", "ok": True, "detail": f"{cfg['imap_host']}:{cfg['imap_port']} — {n} ta papka"})
    except M.MailError as e:
        checks.append({"name": "IMAP", "ok": False, "detail": f"{e.code}: {e.detail}"[:300]})
    import smtplib  # noqa: PLC0415

    try:
        sec = cfg.get("smtp_security")
        host, port = cfg.get("smtp_host") or cfg["imap_host"], int(cfg.get("smtp_port") or 587)
        s = smtplib.SMTP_SSL(host, port, timeout=10, context=M._ctx(cfg)) if sec == "ssl" else smtplib.SMTP(host, port, timeout=10)
        s.ehlo()
        if sec == "starttls":
            s.starttls(context=M._ctx(cfg))
        s.quit()
        checks.append({"name": "SMTP", "ok": True, "detail": f"{host}:{port}"})
    except (OSError, smtplib.SMTPException) as e:
        checks.append({"name": "SMTP", "ok": False, "detail": str(e)[:300]})
    return ok({"checks": checks})


@router.get("/api/admin/mail/dns")
def admin_mail_dns(dmarc: str = "quarantine", a: dict = Depends(current_admin)):
    """Hosting paneliga kiritish uchun DNS yozuvlari: MX, SPF, DKIM, DMARC va tavsiya etiladiganlar."""
    st = svc().st
    cfg = M.config(st)
    zone, source, err = "", "generated", ""
    if cfg.get("provision") == "stalwart" and (cfg.get("stalwart_password") or cfg.get("stalwart_token")):
        try:
            zone = M.Stalwart(cfg, M.provisioner(st).opener).zone_file()
            source = "stalwart" if zone else "generated"
        except M.MailError as e:
            err = f"{e.code}: {e.detail}"[:300]
    recs = M.dns_records(cfg, zone, dmarc)
    return ok({"domain": cfg["domain"], "mail_host": cfg.get("mail_host"), "server_ip": cfg.get("server_ip"), "source": source, "error": err,
               "records": recs, "zone": M.zone_text(recs, cfg["domain"])})


@router.post("/api/admin/mail/sync")
def admin_mail_sync(a: dict = Depends(current_admin)):
    st = svc().st
    p = M.provisioner(st)
    if not p.active():
        raise HTTPException(400, "provision_disabled")
    p.sync_all()
    return ok(_admin_payload())


# ------------------------------------------------------------------ foydalanuvchilar o'zgarganda (boshqa modullardan chaqiriladi)
def on_user_saved(u: dict | None, password: str | None = None, old_login: str | None = None) -> None:
    if u:
        M.provisioner(svc().st).user_saved(u, password, old_login)


def on_user_deleted(u: dict | None) -> None:
    if u:
        M.provisioner(svc().st).user_deleted(u)
