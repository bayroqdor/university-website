"""Rasmiy bo'limlar API: me'yoriy hujjatlar, rahbariyat qabuli (jadval va qabulga yozilish → «Murojaatlar»), ochiq ma'lumotlar
(ko'rsatkichlar, to'plamlar, CSV/XLSX/JSON), reytinglar, tarix, rektor murojaati, OAV biz haqimizda, maxfiylik siyosati havolasi.

Bo'lim bo'sh bo'lsa (nashr qilingan yozuv yo'q) — ochiq API 404 «empty» qaytaradi: saytda sahifa ko'rinmaydi (NotFound)."""
from __future__ import annotations

import json
import re
from datetime import date

from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse, Response

from .. import content as C
from .. import official as O
from .. import seo
from .deps import current_admin, ip_of, ok, rate_limit, s_, svc

router = APIRouter()
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
DROP = ("i18n", "content", "html", "text", "user_id", "editor_ids", "tg_live", "send_newsletter", "newsletter_sent", "table")

seo.EXTRA_PAGES.update({p: O.seo_page for p in O.SEO_LABELS})


def _pub(it: dict) -> dict:
    return {k: v for k, v in it.items() if k not in DROP}


def _items(kind: str, lang: str) -> list[dict]:
    return O.public_items(svc(), kind, lang)


def _empty() -> HTTPException:
    return HTTPException(404, "empty")


# ------------------------------------------------------------------ maxfiylik siyosati
@router.get("/privacy")
def privacy_redirect(lang: str = ""):
    q = f"?lang={lang}" if lang in C.LANGS else ""
    return RedirectResponse(f"/about/{O.PRIVACY_SLUG}{q}", status_code=301)


# ------------------------------------------------------------------ me'yoriy hujjatlar
@router.get("/api/official/documents")
def documents(lang: str = ""):
    st = svc().st
    items = []
    for x in _items("document", lang):
        d = _pub(x)
        d.update(O.file_info(st, x.get("file") or x.get("url") or ""))
        d["year"] = d.get("year") or (int(d["date"][:4]) if d.get("date") else None)
        items.append(d)
    order = {c: i for i, c in enumerate(O.DOC_CATEGORY_ORDER)}
    items.sort(key=lambda d: (order.get(d.get("category") or "other", 99), d.get("sort") or 0, -(int((d.get("date") or "0")[:4] or 0) or d.get("year") or 0)))
    cats = []
    for c in O.DOC_CATEGORY_ORDER:
        n = sum(1 for d in items if d.get("category") == c)
        if n:
            cats.append({"id": c, "count": n})
    return ok({"items": items, "categories": cats})


# ------------------------------------------------------------------ rahbariyat qabuli
def _reception_out(x: dict, lang: str, staff: dict) -> dict:
    s = staff.get(x.get("staff_id") or "")
    s = svc().loc(s, lang) if s else {}
    return {"id": x["id"], "name": s.get("title") or x["title"], "position": x.get("position") or s.get("position") or "", "photo": x.get("photo") or s.get("photo") or "",
            "staff_slug": s.get("slug") or "", "slots": O.clean_slots(x.get("slots")), "place": x.get("place") or "", "room": x.get("room") or "",
            "phone": x.get("phone") or "", "note": x.get("note") or "", "online_url": x.get("online_url") or "", "updated": x.get("updated")}


def _staff_map(ids) -> dict:
    return {k: v for k, v in svc().st.get_items(ids).items() if v.get("kind") == "staff" and v.get("status") == "published"}


@router.get("/api/reception")
def reception(lang: str = ""):
    raw = _items("reception", lang)
    staff = _staff_map([x.get("staff_id") for x in raw])
    items = [r for r in (_reception_out(x, lang, staff) for x in raw) if r["slots"]]
    if not items:
        raise _empty()
    now = O.now_local()
    a, b = O.book_window()
    return ok({"items": items, "today": now.date().isoformat(), "weekday": now.isoweekday(), "now": now.strftime("%H:%M"),
               "window": {"from": a.isoformat(), "to": b.isoformat()}})


def _reception_category() -> dict:
    from .desk import _desk  # noqa: PLC0415

    d = _desk()
    cat = next((c for c in d.categories() if c["title"].strip().lower() in ("rahbariyat qabuli", "rahbariyat qabuli (onlayn yozilish)")), None)
    return cat or d.save_category({"title": "Rahbariyat qabuli", "color": "#0a2e73", "mailbox": "", "sort": 80})


@router.post("/api/reception/book")
def reception_book(request: Request, data: dict = Body(...)):
    """Qabulga yozilish: rahbarning qabul kunlari va vaqtiga mos sana/vaqt → «Murojaatlar»da «Rahbariyat qabuli» bo'limidagi chipta."""
    if data.get("hp"):
        return ok({"ok": True})
    rate_limit("reception:" + ip_of(request), 5, 600)
    s = svc()
    it = s.st.get_item(s_(data, "id", 40))
    if not it or it["kind"] != "reception" or it.get("status") != "published":
        raise HTTPException(404, "not_found")
    name, email, phone = s_(data, "name", 120), s_(data, "email", 160), s_(data, "phone", 40)
    body = str(data.get("message") or "").strip()[:5000]
    if len(name) < 2:
        raise HTTPException(400, "invalid_name")
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "invalid_email")
    if len(body) < 5:
        raise HTTPException(400, "empty_message")
    try:
        d = date.fromisoformat(s_(data, "date", 10))
    except ValueError:
        raise HTTPException(400, "invalid_slot") from None
    hm = s_(data, "time", 5)
    lo, hi = O.book_window()
    if not lo <= d <= hi or not O.slot_ok(it.get("slots") or [], d, hm, O.now_local()):
        raise HTTPException(400, "invalid_slot")
    lang = s_(data, "lang", 5)
    base = s.base_lang()
    person = _reception_out(s.loc(it, base), base, _staff_map([it.get("staff_id")]))
    place = ", ".join(x for x in (person["place"], person["room"]) if x)
    when = f"{d.strftime('%d.%m.%Y')} {hm}"
    lines = [f"Rahbar: {person['name']}" + (f" ({person['position']})" if person["position"] else ""), f"Sana va vaqt: {when}"]
    if place:
        lines.append(f"Joy: {place}")
    if phone:
        lines.append(f"Telefon: {phone}")
    from .desk import _desk  # noqa: PLC0415

    cat = _reception_category()
    t = _desk().create(f"Rahbariyat qabuli: {person['name']} — {when}", "\n".join(lines) + "\n\n" + body, name=name, email=email, phone=phone,
                       category_id=cat["id"], source="reception", ip=ip_of(request), lang=lang,
                       meta={"source": "reception", "reception": {"entry_id": it["id"], "staff_id": it.get("staff_id") or "", "official": person["name"],
                                                                  "position": person["position"], "date": d.isoformat(), "time": hm, "place": place}})
    site = s.site()
    if site.get("notify_contact") and site.get("contact_email"):
        msg = {"id": t["id"], "name": name, "email": email, "phone": phone, "subject": f"[UNI-{t['number']}] {t['title']}", "body": t["body"], "created": t["created"]}
        try:
            s.mail.contact_notify(msg, site["contact_email"])
        except Exception:  # noqa: BLE001 — xabarnoma yuborilmasa ham yozilish saqlanadi
            pass
    return ok({"ok": True, "ticket": t["number"]})


# ------------------------------------------------------------------ ochiq ma'lumotlar
def _ds_summary(x: dict) -> dict:
    tb = O.clean_table(x.get("table"))
    return _pub(x) | {"columns": tb["columns"], "rows_count": len(tb["rows"]), "updated_on": x.get("updated_on") or x.get("updated"),
                      "downloads": {f: f"/api/open-data/datasets/{x['id']}.{f}" for f in ("csv", "xlsx", "json")}}


@router.get("/api/open-data")
def open_data(lang: str = ""):
    """Ochiq ma'lumotlar (JSON API): ko'rsatkichlar va to'plamlar ro'yxati."""
    s = svc()
    lang = s.lang(lang)
    ind = O.indicators(s, lang)
    ds = [_ds_summary(x) for x in _items("dataset", lang)]
    if not ind and not ds:
        raise _empty()
    return ok({"indicators": ind, "datasets": ds, "generated": O.today_local().isoformat(),
               "downloads": {f: f"/api/open-data/indicators.{f}" for f in ("csv", "xlsx", "json")} if ind else {}})


def _dataset(did: str, lang: str) -> dict:
    s = svc()
    it = s.st.get_item(did)
    if not it or it["kind"] != "dataset" or it.get("status") != "published":
        raise HTTPException(404, "not_found")
    return s.loc(it, lang)


def _file(fmt: str, title: str, columns: list, rows: list, payload) -> Response:
    name = O.safe_filename(title)
    if fmt == "csv":
        return Response(O.to_csv(columns, rows), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})
    if fmt == "xlsx":
        return Response(O.to_xlsx(title, columns, rows), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="{name}.xlsx"'})
    if fmt == "json":
        return Response(json.dumps(payload, ensure_ascii=False, indent=1), media_type="application/json; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{name}.json"'})
    raise HTTPException(404, "not_found")


@router.get("/api/open-data/indicators.{fmt}")
def open_data_indicators_file(fmt: str, lang: str = ""):
    s = svc()
    lang = s.lang(lang)
    ind = O.indicators(s, lang)
    if not ind:
        raise _empty()
    head = {"uz": ["Ko‘rsatkich", "Toifa", "Qiymat", "Yangilangan"], "ru": ["Показатель", "Категория", "Значение", "Обновлено"],
            "en": ["Indicator", "Category", "Value", "Updated"]}[lang]
    rows = []
    for x in ind:
        if x["kind"] == "value":
            rows.append([x["label"], "", x["value"], x["updated"]])
        else:
            rows += [[x["label"], r["label"], r["value"], x["updated"]] for r in x["breakdown"]]
    return _file(fmt, "open-data-indicators", head, rows, {"indicators": ind, "generated": O.today_local().isoformat()})


@router.get("/api/open-data/datasets/{did}.{fmt}")
def open_data_dataset_file(did: str, fmt: str, lang: str = ""):
    x = _dataset(did, lang)
    tb = O.clean_table(x.get("table"))
    payload = {"title": x["title"], "description": x.get("description") or "", "period": x.get("period") or "", "source": x.get("source") or "",
               "updated": x.get("updated_on") or x.get("updated"), "columns": tb["columns"], "rows": [dict(zip(tb["columns"], r)) for r in tb["rows"]]}
    return _file(fmt, x["title"], tb["columns"], tb["rows"], payload)


@router.get("/api/open-data/datasets/{did}")
def open_data_dataset(did: str, lang: str = ""):
    x = _dataset(did, lang)
    return ok(_ds_summary(x) | {"table": O.clean_table(x.get("table"))})


@router.get("/api/admin/official/opendata")
def admin_opendata(a: dict = Depends(current_admin)):
    s = svc()
    return ok({"indicators": O.indicators(s, s.base_lang(), admin=True)})


@router.put("/api/admin/official/opendata")
def admin_opendata_put(data: dict = Body(...), a: dict = Depends(current_admin)):
    s = svc()
    s.st.kv_put("opendata_cfg", O.clean_opendata_cfg(data, O.opendata_cfg(s.st)))
    return ok({"indicators": O.indicators(s, s.base_lang(), admin=True)})


@router.post("/api/admin/official/datasets/parse")
async def admin_dataset_parse(file: UploadFile = File(...), a: dict = Depends(current_admin)):
    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(400, "too_large")
    try:
        return ok(O.parse_table(raw, file.filename or ""))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


# ------------------------------------------------------------------ reytinglar, tarix, rektor, OAV
@router.get("/api/rankings")
def rankings(lang: str = ""):
    s = svc()
    raw = s.st.list_items("ranking", public=True)
    if not raw:
        raise _empty()
    groups: dict[str, dict] = {}
    for it in raw:
        x = s.loc(it, lang)
        key = C.slugify(it["title"]) or it["id"]
        g = groups.setdefault(key, {"key": key, "title": x["title"], "logo": "", "url": "", "entries": [], "sort": it.get("sort") or 0})
        g["logo"] = g["logo"] or x.get("logo") or ""
        g["url"] = g["url"] or x.get("url") or ""
        g["sort"] = min(g["sort"], it.get("sort") or 0)
        g["entries"].append({k: x.get(k) for k in ("id", "year", "category", "place", "total", "url", "note", "logo")})
    out = sorted(groups.values(), key=lambda g: (g["sort"], -max((e.get("year") or 0) for e in g["entries"]), g["title"]))
    for g in out:
        g["entries"].sort(key=lambda e: (-(e.get("year") or 0), e.get("category") or ""))
    return ok({"groups": out})


@router.get("/api/history")
def history(lang: str = ""):
    items = [_pub(x) for x in _items("milestone", lang)]
    if not items:
        raise _empty()
    items.sort(key=lambda x: (x.get("year") or 0, x.get("date") or "", x.get("sort") or 0))
    return ok({"items": items})


@router.get("/api/rector")
def rector(lang: str = ""):
    r = O.rector(svc(), svc().lang(lang))
    if not r:
        raise _empty()
    return ok(r)


@router.get("/api/media-mentions")
def media_mentions(lang: str = ""):
    items = []
    for x in _items("mention", lang):
        d = _pub(x)
        d["video_id"] = O.yt_id(x.get("url") or "") if x.get("type") in ("video", "tv") else ""
        d["year"] = int(x["date"][:4]) if x.get("date") else None
        items.append(d)
    if not items:
        raise _empty()
    items.sort(key=lambda x: (x.get("date") or "", x.get("sort") or 0), reverse=True)
    return ok({"items": items, "years": sorted({x["year"] for x in items if x["year"]}, reverse=True),
               "types": [t for t in O.MENTION_TYPES if any(x.get("type") == t for x in items)]})


@router.get("/api/official/sections")
def sections():
    """Qaysi bo'limlar to'ldirilgan (menyu/futer havolalarini yashirish uchun): {"/reception": true, …}."""
    s = svc()
    return ok({p: O.section_visible(s, p) for p in O.SEO_LABELS})


# ------------------------------------------------------------------ admin: yangi bo'limlar saytda ko'rinadimi (bo'sh bo'lim yashiriladi)
SECTION_PATHS = ("/documents", *O.SEO_LABELS, "/student-life", "/clubs", "/sport", "/dormitory", "/scholarships", "/gallery", "/admission/steps",
                 "/admission/calculator", "/parents", "/campus-map", "/virtual-tour", "/career-center", "/partners", "/alumni", "/startups", "/articles")


def section_status(s) -> dict[str, dict]:
    """{yo'l: {visible, in_menu}} — keshsiz (admin saqlagandan keyin darhol to'g'ri holat). visible=False — chop etilgan yozuv yo'q:
    sahifa 404, menyuda ko'rinmaydi; in_menu — admin menyusida shu havola bormi (yo'q bo'lsa saytda faqat to'g'ridan-to'g'ri havola bilan ochiladi)."""
    from .. import menu_sections as MS  # noqa: PLC0415

    hidden = MS._compute(s)  # noqa: SLF001 — 60 s keshsiz
    urls = {MS._path(x.get("url") or "") for m in (s.site().get("menu") or []) for x in [m, *(m.get("children") or [])]}  # noqa: SLF001
    return {p: {"visible": p not in hidden, "in_menu": p in urls} for p in SECTION_PATHS}


@router.get("/api/admin/site-sections")
def admin_site_sections(a: dict = Depends(current_admin)):
    return ok(section_status(svc()))
