"""Ilmiy jurnal API: ochiq sahifalar (JSON), maqola PDF'i (inline, Scholar uchun), BibTeX/RIS, OAI-PMH, maqola yuborish formasi,
ko'rish hisoblagichi va admin bo'limi («journal» ruxsati: sozlamalar, tahrir hay'ati, sonlar, maqolalar, yuborilganlar).

Mantiq — university/journal.py, OAI-PMH — university/journal_oai.py; server sahifasidagi meta teglar — seo.page_meta → journal.page_meta.

Ko'rib chiqish rejimi: «journal» ruxsatli admin (uni_admin cookie — admin panelga kirgan brauzer) uchun ochiq JSON'lar yashirin jurnal,
qoralama son va maqolalarni ham qaytaradi va javobda «preview» — saytda ko'rinmaslik sabablari (tuzatish havolalari bilan) bo'ladi.
"""
from __future__ import annotations

import hashlib
import io
import re
import secrets
import zipfile
from pathlib import Path

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response

from .. import journal as J
from .. import journal_oai as OAI
from .. import roles as R
from ..content import LANGS
from ..media import get_blob, put_blob
from ..service import is_bot
from .deps import ADMIN_COOKIE, current_admin, ip_of, ok, rate_limit, svc

router = APIRouter()
SUBMIT_EXT = {".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
DESK_CATEGORY = "Jurnal tahririyati"


def _lang(lang: str) -> str:
    return lang if lang in LANGS else svc().base_lang()


def preview_allowed(request: Request) -> bool:
    """Admin panelga kirgan, «journal» ruxsati bor brauzer (cookie butun saytga yuboriladi: path=/)."""
    memo = getattr(request.state, "journal_preview", None)
    if memo is not None:
        return memo
    tok = request.cookies.get(ADMIN_COOKIE)
    st = svc().st
    u = st.session_user(tok) if tok else None
    v = bool(u and u.get("role") == "admin" and "journal" in R.perms_of(st, u))
    request.state.journal_preview = v
    return v


def _on(request: Request | None = None) -> bool:
    """Ochiq so'rov: jurnal yashirin bo'lsa — 404; admin ko'rib chiqishida — True (qoralamalar ham ko'rsatiladi)."""
    pv = bool(request is not None and preview_allowed(request))
    if not pv and not J.enabled(svc().st):
        raise HTTPException(404, "not_found")
    return pv


def _out(data: dict, pv: bool, reasons: list[dict] | None = None) -> JSONResponse:
    """Ko'rib chiqishdagi javob: sabablar («preview») va keshlanmaydi (har bir admin uchun alohida)."""
    if not pv:
        return ok(data)
    reasons = J.journal_reasons(svc().st) + (reasons or [])
    out = data | ({"preview": reasons} if reasons else {})
    return JSONResponse(out, headers={"Cache-Control": "private, no-store", "X-Robots-Tag": "noindex"})


def _drafts(items: list[dict]) -> list[dict]:
    """Ro'yxatda qoralama bo'lsa — bitta umumiy sabab (sahifaning o'zi ochiq bo'lishi mumkin)."""
    if not any(x.get("draft") for x in items):
        return []
    return [{"code": "drafts_listed", "text": "«Qoralama» belgili son va maqolalar saytda hali ko‘rinmaydi", "fix": J.ADMIN_URL, "fix_label": "Admin panelda ochish"}]


def _vid(request: Request) -> str | None:
    """Botlar va admin panel hisoblanmaydi; tashrif buyuruvchi — IP + brauzer (kunlik)."""
    ua = request.headers.get("user-agent") or ""
    if is_bot(ua):
        return None
    st = svc().st
    salt = st.kv_get("vid_salt")
    if not salt:
        salt = secrets.token_hex(16)
        st.kv_put("vid_salt", salt)
    return hashlib.sha256(f"{salt}|{ip_of(request)}|{ua}".encode()).hexdigest()[:24]


# ====================================================================== ochiq JSON
@router.get("/api/journal")
def journal_public(request: Request, lang: str = ""):
    pv = _on(request)
    s = svc()
    lang = _lang(lang)
    st = s.st
    pubs = J.issues(st, public=not pv)
    arts = J.public_articles(st, preview=pv)
    iss = {i["id"]: i for i in pubs}
    cur = pubs[0] if pubs else None
    cur_arts = [J.public_view(s, a, iss[a["issue_id"]], lang, full=False) for a in arts if cur and a["issue_id"] == cur["id"]]
    latest = sorted((a for a in arts if not cur or a["issue_id"] != cur["id"]), key=lambda a: (a.get("published_on") or "", a["num"]), reverse=True)[:6]
    latest_v = [J.public_view(s, a, iss[a["issue_id"]], lang, full=False) for a in latest]
    cur_v = J.issue_view(cur, lang, s.base_lang()) | {"articles": cur_arts} if cur else None
    return _out({"journal": J.public_settings(s, lang), "current": cur_v, "latest": latest_v,
                 "years": sorted({i["year"] for i in pubs}, reverse=True), "counts": {"issues": len(pubs), "articles": len(arts)}},
                pv, _drafts([*([cur_v] if cur_v else []), *cur_arts, *latest_v]))


@router.get("/api/journal/archive")
def journal_archive(request: Request, lang: str = ""):
    pv = _on(request)
    s = svc()
    lang = _lang(lang)
    counts: dict[str, int] = {}
    for a in J.public_articles(s.st, preview=pv):
        counts[a["issue_id"]] = counts.get(a["issue_id"], 0) + 1
    items = [J.issue_view(i, lang, s.base_lang()) | {"articles": counts.get(i["id"], 0)} for i in J.issues(s.st, public=not pv)]
    return _out({"issues": items}, pv, _drafts(items))


@router.get("/api/journal/issue/{key}")
def journal_issue(request: Request, key: str, lang: str = ""):
    pv = _on(request)
    s = svc()
    lang = _lang(lang)
    i = J.issue_by_key(s.st, key, public=not pv)
    if not i:
        raise HTTPException(404, "not_found")
    arts = [J.public_view(s, a, i, lang, full=False) for a in J.public_articles(s.st, i["id"], pv)]
    own = J.issue_reasons(i)
    return _out({"issue": J.issue_view(i, lang, s.base_lang()), "articles": arts}, pv, own or _drafts(arts))


@router.get("/api/journal/article/{num}")
def journal_article(request: Request, num: str, lang: str = ""):
    pv = _on(request)
    s = svc()
    hit = J.public_article(s.st, num, pv)
    if not hit:
        raise HTTPException(404, "not_found")
    a, i = hit
    return _out({"article": J.public_view(s, a, i, _lang(lang))}, pv, J.article_reasons(a, i) if pv else [])


@router.post("/api/journal/article/{num}/view")
def journal_article_view(request: Request, num: str):
    if _on(request):  # muharrir ko'rishi hisoblanmaydi
        return ok({"counted": False})
    rate_limit(f"jview:{ip_of(request)}", 120, 60)
    hit = J.public_article(svc().st, num)
    if not hit:
        raise HTTPException(404, "not_found")
    vid = _vid(request)
    return ok({"counted": bool(vid) and J.hit(svc().st, hit[0]["id"], "view", vid)})


@router.get("/api/journal/search")
def journal_search(request: Request, q: str = "", year: str = "", section: str = "", author: str = "", keyword: str = "", lang: str = ""):
    pv = _on(request)
    rate_limit(f"jsearch:{ip_of(request)}", 120, 60)
    items = J.find(svc(), _lang(lang), q[:120], year[:4], section[:20], author[:120], keyword[:120], preview=pv)
    return _out({"items": items[:200], "total": len(items)}, pv, _drafts(items[:200]))


# ====================================================================== PDF va iqtiboslar (o'zgarmas, ochiq URL'lar)
def _pdf_response(request: Request, media_url: str, filename: str, head: bool) -> Response:
    name = media_url.rsplit("/", 1)[-1]
    st = svc().st
    headers = {"Content-Disposition": f'inline; filename="{filename}"', "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff",
               "X-Robots-Tag": "index, follow"}
    p = st.media_dir / name
    if p.is_file():
        return FileResponse(p, media_type="application/pdf", headers=headers)
    raw = get_blob(st, name)  # S3: o'z domenimizdan beriladi (Scholar PDF'ni maqola bilan bir domenda kutadi)
    if raw is None:
        raise HTTPException(404, "not_found")
    return Response(b"" if head else raw, media_type="application/pdf", headers=headers | {"Content-Length": str(len(raw))})


@router.api_route("/journal/pdf/{num}/{name}", methods=["GET", "HEAD"])
def journal_pdf(request: Request, num: str, name: str):
    pv = _on(request)
    hit = J.public_article(svc().st, num, pv)
    if not hit or not hit[0].get("pdf"):
        raise HTTPException(404, "not_found")
    a = hit[0]
    if name != f"{a['slug']}.pdf":
        return RedirectResponse(J.pdf_path(a), status_code=301)
    rng = request.headers.get("range") or ""
    if request.method == "GET" and not pv and (not rng or rng.startswith("bytes=0-")):
        vid = _vid(request)
        if vid:
            J.hit(svc().st, a["id"], "download", vid)
    return _pdf_response(request, a["pdf"], f"{a['slug']}.pdf", request.method == "HEAD")


@router.api_route("/journal/issue-pdf/{name}", methods=["GET", "HEAD"])
def journal_issue_pdf(request: Request, name: str):
    pv = _on(request)
    m = re.fullmatch(r"(\d{1,4}-\d{1,4})\.pdf", name)
    i = J.issue_by_key(svc().st, m.group(1), public=not pv) if m else None
    if not i or not i.get("pdf"):
        raise HTTPException(404, "not_found")
    return _pdf_response(request, i["pdf"], f"issue-{i['volume']}-{i['number']}.pdf", request.method == "HEAD")


@router.get("/journal/cite/{name}")
def journal_cite(request: Request, name: str):
    pv = _on(request)
    m = re.fullmatch(r"(\d{1,9})\.(bib|ris)", name)
    hit = J.public_article(svc().st, m.group(1), pv) if m else None
    if not hit:
        raise HTTPException(404, "not_found")
    a, i = hit
    if m.group(2) == "bib":
        return Response(J.bibtex(svc(), a, i), media_type="application/x-bibtex; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{a["slug"]}.bib"'})
    return Response(J.ris(svc(), a, i), media_type="application/x-research-info-systems; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{a["slug"]}.ris"'})


@router.api_route("/journal/oai", methods=["GET", "POST"])
async def journal_oai(request: Request):
    _on(request)  # admin yashirin jurnalda ham Identify'ni tekshira oladi; yozuvlar — faqat ochiq maqolalar
    rate_limit(f"oai:{ip_of(request)}", 300, 60)
    args = list(request.query_params.multi_items())
    if request.method == "POST":
        form = await request.form()
        args = [(k, str(v)) for k, v in form.multi_items()]
    xml, status = OAI.respond(svc(), args)
    return Response(xml, status_code=status, media_type="text/xml; charset=utf-8")


# ====================================================================== maqola yuborish (tahririyatga)
def _check_submission(raw: bytes, ext: str) -> None:
    if ext == ".pdf" and not raw.startswith(b"%PDF-"):
        raise HTTPException(400, "bad_file_type")
    if ext == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                if "word/document.xml" not in z.namelist():
                    raise HTTPException(400, "bad_file_type")
        except zipfile.BadZipFile:
            raise HTTPException(400, "bad_file_type") from None


@router.post("/api/journal/submit")
async def journal_submit(request: Request, name: str = Form(""), email: str = Form(""), affiliation: str = Form(""), title: str = Form(""),
                         abstract: str = Form(""), phone: str = Form(""), message: str = Form(""), lang: str = Form(""), hp: str = Form(""),
                         file: UploadFile | None = File(None)):
    """Qo'lyozma: «Murojaatlar»da «Jurnal tahririyati» chiptasi, fayl yopiq saqlanadi (faqat tahririyat va murojaatlar bo'limi ko'radi)."""
    _on(request)
    if hp:
        return ok({"ok": True})
    s = svc()
    cfg = J.settings(s.st)
    if not cfg.get("submissions_open", True):
        raise HTTPException(400, "closed")
    rate_limit("jsubmit:" + ip_of(request), 3, 600)
    name, email, affiliation, title = name.strip()[:160], email.strip()[:160], affiliation.strip()[:400], title.strip()[:600]
    abstract, phone, message = abstract.strip()[:6000], phone.strip()[:40], message.strip()[:4000]
    errs = []
    if len(name) < 3:
        errs.append("name")
    if not re.fullmatch(r"[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}", email):
        errs.append("email")
    if len(affiliation) < 2:
        errs.append("affiliation")
    if len(title) < 5:
        errs.append("title")
    if len(abstract) < 50:
        errs.append("abstract")
    if file is None or not file.filename:
        errs.append("file")
    if errs:
        raise HTTPException(400, {"code": "invalid", "fields": errs})
    ext = Path(file.filename).suffix.lower()
    if ext not in SUBMIT_EXT:
        raise HTTPException(400, "bad_file_type")
    raw = await file.read(J.SUBMIT_MAX + 1)
    if len(raw) > J.SUBMIT_MAX:
        raise HTTPException(400, "too_large")
    if not raw:
        raise HTTPException(400, "bad_file_type")
    _check_submission(raw, ext)
    token = secrets.token_hex(16)
    put_blob(s.st, f"cv/{token}{ext}", raw, SUBMIT_EXT[ext], private=True)
    safe = re.sub(r"[^\w.\- ]+", "_", file.filename)[:120]
    files = [{"name": safe, "url": f"/api/admin/desk/files/{token}{ext}", "size": len(raw)}]
    t = _ticket(name, email, phone, affiliation, title, abstract, message, files, ip_of(request), lang if lang in LANGS else "")
    to = cfg.get("submission_email") or cfg.get("email")
    if to:
        try:
            s.mail.contact_notify({"name": name, "email": email, "phone": phone, "subject": f"[UNI-{t['number']}] {t['title']}",
                                   "body": f"{title}\n\n{affiliation}\n\n{abstract}"}, to)
        except Exception:  # noqa: BLE001 — pochta sozlanmagan bo'lsa ham qo'lyozma qabul qilinadi
            pass
    return ok({"ok": True, "ticket": t["number"]})


def _category(d) -> dict:
    cat = next((c for c in d.categories() if c["title"] == DESK_CATEGORY), None)
    return cat or d.save_category({"title": DESK_CATEGORY, "color": "#0a2e73", "mailbox": "", "sort": 95})


def _ticket(name, email, phone, affiliation, title, abstract, message, files, ip, lang) -> dict:
    from .desk import _desk  # noqa: PLC0415

    d = _desk()
    cat = _category(d)
    body = f"Maqola: {title}\nMuassasa: {affiliation}\n\nAnnotatsiya:\n{abstract}" + (f"\n\nIzoh:\n{message}" if message else "")
    return d.create(f"Jurnal: {title[:150]}", body, name=name, email=email, phone=phone, category_id=cat["id"], source="journal", ip=ip, lang=lang,
                    meta={"source": "journal", "journal": {"title": title, "affiliation": affiliation}, "files": files})


# ====================================================================== admin («journal» ruxsati)
def _err(e: Exception) -> HTTPException:
    if isinstance(e, LookupError):
        return HTTPException(404, "not_found")
    return HTTPException(400, str(e))


@router.get("/api/admin/journal")
def admin_journal(a: dict = Depends(current_admin)):
    st = svc().st
    counts: dict[str, dict] = {}
    for x in J.articles(st):
        c = counts.setdefault(x.get("issue_id") or "", {"total": 0, "published": 0})
        c["total"] += 1
        c["published"] += x["status"] == "published"
    return ok({"settings": J.settings(st), "issues": [i | {"articles": counts.get(i["id"], {"total": 0, "published": 0})} for i in J.issues(st)],
               "unassigned": counts.get("", {"total": 0})["total"], "licenses": list(J.LICENSES), "base_url": svc().base_url(), "base_lang": svc().base_lang(),
               "enabled": J.enabled(st), "status": J.diagnose(st)})


@router.put("/api/admin/journal/settings")
def admin_journal_settings(data: dict = Body(...), a: dict = Depends(current_admin)):
    st = svc().st
    try:
        s = J.clean_settings(data, J.settings(st))
    except ValueError as e:
        raise _err(e) from e
    s["updated"] = J._now()  # noqa: SLF001
    st.kv_put(J.KV, s)
    return ok(J.settings(st))


@router.post("/api/admin/journal/issues")
def admin_issue_create(data: dict = Body(...), a: dict = Depends(current_admin)):
    try:
        return ok(J.save_issue(svc().st, data))
    except (ValueError, LookupError) as e:
        raise _err(e) from e


@router.put("/api/admin/journal/issues/{iid}")
def admin_issue_update(iid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    try:
        return ok(J.save_issue(svc().st, data, iid))
    except (ValueError, LookupError) as e:
        raise _err(e) from e


@router.delete("/api/admin/journal/issues/{iid}")
def admin_issue_delete(iid: str, a: dict = Depends(current_admin)):
    try:
        J.delete_issue(svc().st, iid)
    except ValueError as e:
        raise _err(e) from e
    return ok({"ok": True})


def _admin_article(x: dict) -> dict:
    return x | {"url": J.article_path(x), "pdf_url": J.pdf_path(x) if x.get("pdf") else "", "problems": J.publish_problems(x),
                "visibility": J.article_visibility(svc().st, x)}


@router.get("/api/admin/journal/articles")
def admin_articles(issue: str = "", status: str = "", q: str = "", a: dict = Depends(current_admin)):
    st = svc().st
    items = J.articles(st, issue_id=issue if issue and issue != "none" else None, status=status, q=q[:120])
    if issue == "none":
        items = [x for x in items if not x.get("issue_id")]
    keep = ("id", "num", "slug", "issue_id", "status", "title", "authors", "first_page", "last_page", "section_id", "lang", "doi", "published_on",
            "views", "downloads", "updated", "pdf", "sort")
    return ok({"items": [{k: x.get(k) for k in keep} | {"url": J.article_path(x), "problems": J.publish_problems(x)} for x in items]})


@router.get("/api/admin/journal/articles/{aid}")
def admin_article(aid: str, a: dict = Depends(current_admin)):
    x = J.get_article(svc().st, aid)
    if not x:
        raise HTTPException(404, "not_found")
    return ok(_admin_article(x))


@router.post("/api/admin/journal/articles")
def admin_article_create(data: dict = Body(...), a: dict = Depends(current_admin)):
    try:
        return ok(_admin_article(J.save_article(svc().st, data)))
    except (ValueError, LookupError) as e:
        raise _err(e) from e


@router.put("/api/admin/journal/articles/{aid}")
def admin_article_update(aid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    try:
        return ok(_admin_article(J.save_article(svc().st, data, aid)))
    except (ValueError, LookupError) as e:
        raise _err(e) from e


@router.delete("/api/admin/journal/articles/{aid}")
def admin_article_delete(aid: str, a: dict = Depends(current_admin)):
    J.delete_article(svc().st, aid)
    return ok({"ok": True})


@router.post("/api/admin/journal/pdf")
async def admin_journal_pdf(file: UploadFile = File(...), a: dict = Depends(current_admin)):
    """Maqola yoki sonning PDF fayli: faqat PDF (mazmuni tekshiriladi), 80 MB gacha. Javobda — matn qatlami, sahifalar soni,
    hujjat sarlavhasi va birinchi bet matni (Scholar tekshiruvi va «PDF dan to'ldirish» uchun)."""
    raw = await file.read(J.PDF_MAX + 1)
    if len(raw) > J.PDF_MAX:
        raise HTTPException(400, "too_large")
    if not raw.startswith(b"%PDF-"):
        raise HTTPException(400, "not_pdf")
    st = svc().st
    import uuid  # noqa: PLC0415

    mid = uuid.uuid4().hex[:16]
    name = f"{mid}.pdf"
    put_blob(st, name, raw, "application/pdf")
    st.add_media(name, file.filename or name, "application/pdf", len(raw), None, None)
    check = J.analyze_pdf(raw)
    return ok({"url": f"/media/{name}", "name": (file.filename or name)[:200], "size": len(raw), "check": check})


@router.get("/api/admin/journal/submissions")
def admin_submissions(a: dict = Depends(current_admin)):
    from .desk import _desk  # noqa: PLC0415

    d = _desk()
    cat = next((c for c in d.categories() if c["title"] == DESK_CATEGORY), None)
    if not cat:
        return ok({"items": []})
    import json  # noqa: PLC0415

    tickets = d.list(category=cat["id"], limit=500)
    metas = {r["ticket_id"]: json.loads(r["meta"] or "{}") for r in svc().st._q(  # noqa: SLF001
        "SELECT ticket_id, meta FROM desk_events WHERE kind='created' AND ticket_id = ANY(%s)", ([t["id"] for t in tickets],))}
    items = []
    for t in tickets:
        meta = metas.get(t["id"]) or {}
        items.append({"id": t["id"], "number": t["number"], "title": (meta.get("journal") or {}).get("title") or t.get("title"), "stage": t.get("stage"),
                      "name": t.get("requester_name"), "email": t.get("requester_email"), "affiliation": (meta.get("journal") or {}).get("affiliation") or "",
                      "created": t.get("created"), "files": [f | {"url": f["url"].replace("/api/admin/desk/files/", "/api/admin/journal/files/")}
                                                             for f in meta.get("files") or [] if isinstance(f, dict)]})
    return ok({"items": items})


@router.get("/api/admin/journal/files/{name}")
def admin_submission_file(name: str, a: dict = Depends(current_admin)):
    """Yuborilgan qo'lyozma («journal» ruxsati yetarli — «Murojaatlar» ruxsati shart emas)."""
    if not re.fullmatch(r"[a-f0-9]{32}\.(pdf|docx)", name):
        raise HTTPException(404, "not_found")
    raw = get_blob(svc().st, f"cv/{name}", private=True)
    if raw is None:
        raise HTTPException(404, "not_found")
    return Response(raw, media_type=SUBMIT_EXT["." + name.rsplit(".", 1)[1]],
                    headers={"Content-Disposition": f'attachment; filename="manuscript.{name.rsplit(".", 1)[1]}"', "Cache-Control": "private, no-store",
                             "X-Content-Type-Options": "nosniff"})
