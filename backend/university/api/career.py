"""Hamkorlik va karyera API: karyera markazi (imkoniyatlar, kompaniyalar arizasi, moderatsiya), hamkorlar va amaliyot bazalari,
bitiruvchilar (hikoyalar, ro'yxatga olish, bandlik statistikasi), startaplar, foydali maqolalar (+ RSS), talaba kabinetidagi «Karyera».

Ruxsatlar (roles.py): career_center — /api/admin/career-center/*, alumni — /api/admin/alumni/*; kontent CRUD — /api/admin/items/<tur>.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from html import escape

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import Response

from .. import career as K
from .. import content as C
from .deps import current_admin, current_user, ip_of, ok, rate_limit, save_item, svc

router = APIRouter()
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
HIDDEN = ("text", "submitter", "ticket_id", "reject_reason", "silent", "i18n", "registry_id", "content")


def startup() -> None:
    """Ilova ishga tushganda: jadvallar, migratsiya, «Karyera markazi» murojaat bo'limi va fon vazifasi."""
    try:
        st = _st()
        from .desk import _desk  # noqa: PLC0415

        K.desk_category(_desk())
        K.sweep(st, force=True)
    except Exception as e:  # noqa: BLE001
        import sys  # noqa: PLC0415

        print(f"career startup: {e}", file=sys.stderr, flush=True)
    K.start(svc)


def _st():
    st = svc().st
    K.ensure(st)
    return st


def _pub(kind: str, lang: str) -> list[dict]:
    s = svc()
    return [s.loc(x, lang) for x in s.st.list_items(kind, public=True)]


def _light(it: dict, drop=("html",)) -> dict:
    return {k: v for k, v in it.items() if k not in HIDDEN and k not in drop}


def _detail(it: dict) -> dict:
    return {k: v for k, v in it.items() if k not in HIDDEN or k == "content"}


def _programs(lang: str) -> list[dict]:
    return [{"id": p["id"], "title": p["title"], "slug": p.get("slug") or "", "degree": p.get("degree") or ""} for p in _pub("program", lang)]


def _staff_card(it: dict | None, lang: str) -> dict | None:
    if not it or it.get("kind") != "staff" or it.get("status") != "published":
        return None
    it = svc().loc(it, lang)
    return {k: it.get(k) or "" for k in ("id", "title", "slug", "position", "degree", "photo", "email", "phone")} | {"bio": (it.get("bio") or "")[:400]}


def _partner_card(p: dict) -> dict:
    return {k: p.get(k) for k in ("id", "slug", "title", "logo", "url", "country", "city", "category", "summary", "practice_base", "program_ids",
                                  "capacity", "areas", "since", "featured")}


def _by_slug(kind: str, slug: str, lang: str) -> dict:
    it = svc().st.get_item_by_slug(kind, slug)
    if not it:
        raise HTTPException(404, "not_found")
    return svc().loc(it, lang)


# ================================================================== karyera markazi
def _opp_card(o: dict, partners: dict) -> dict:
    p = partners.get(o.get("partner_id") or "")
    return _light(o) | {"expired": K.is_expired(o), "partner": {"slug": p["slug"], "title": p["title"], "logo": p.get("logo") or ""} if p else None,
                        "logo": o.get("logo") or (p or {}).get("logo") or "", "company": o.get("company") or (p or {}).get("title") or ""}


def _open_opps(lang: str) -> list[dict]:
    K.sweep(_st())
    partners = {p["id"]: p for p in _pub("partner", lang)}
    items = [o for o in _pub("opportunity", lang) if not K.is_expired(o)]
    items.sort(key=lambda o: o.get("published_at") or "", reverse=True)
    return [_opp_card(o, partners) for o in items]


def _contacts(lang: str) -> dict:
    s = K.settings(_st())
    staff = [c for c in (_staff_card(svc().st.get_item(i), lang) for i in s.get("staff_ids") or []) if c]
    return {k: s.get(k) or "" for k in ("email", "phone", "room", "hours")} | {"staff": staff}


@router.get("/api/career")
def career_public(lang: str = ""):
    s = svc()
    st = _st()
    return ok({"items": _open_opps(lang), "programs": _programs(lang), "info": K.info_html(st, s.lang(lang), s.base_lang()), "contacts": _contacts(lang)})


@router.get("/api/career/{slug}")
def career_item(slug: str, lang: str = ""):
    s = svc()
    st = _st()
    K.sweep(st)
    raw = st.get_item_by_slug("opportunity", slug, public=False)
    if not raw or raw.get("status") not in ("published", "expired") or (raw.get("published_at") or "") > K._now():  # noqa: SLF001
        raise HTTPException(404, "not_found")
    it = s.loc(raw, lang)
    partners = {p["id"]: p for p in _pub("partner", lang)}
    card = _opp_card(it, partners)
    progs = {p["id"]: p for p in _programs(lang)}
    others = [x for x in _open_opps(lang) if x["id"] != it["id"]]
    others.sort(key=lambda x: (-len(set(x.get("program_ids") or []) & set(it.get("program_ids") or [])), x.get("type") != it.get("type")))
    return ok({"item": _detail(it) | {k: card[k] for k in ("expired", "partner", "logo", "company")},
               "programs": [progs[i] for i in it.get("program_ids") or [] if i in progs], "others": others[:3]})


def _err(fields: dict):
    raise HTTPException(400, {"fields": fields})


def _phone_ok(v: str) -> bool:
    return 7 <= len(re.sub(r"\D", "", v)) <= 15


def _paras(text: str) -> str:
    return "".join(f"<p>{escape(p).replace(chr(10), '<br>')}</p>" for p in re.split(r"\n\s*\n", text.strip()) if p.strip())


@router.post("/api/career/submit")
def career_submit(request: Request, data: dict = Body(...)):
    """Kompaniya imkoniyat yuboradi → «pending» (saytda ko'rinmaydi) + «Karyera markazi» murojaati; admin tasdiqlagach nashr qilinadi."""
    if data.get("hp"):
        return ok({"ok": True, "ticket": 0})
    st = _st()
    f = {k: re.sub(r"[ \t]+", " ", str(data.get(k) or "")).strip() for k in
         ("company", "contact_name", "email", "phone", "website", "title", "type", "city", "salary", "apply_url", "apply_email", "apply_phone", "deadline")}
    desc = str(data.get("description") or "").strip()[:8000]
    reqs = [x.strip(" •-–\t") for x in str(data.get("requirements") or "").splitlines() if x.strip(" •-–\t")][:20]
    remote = bool(data.get("remote"))
    progs = {p["id"] for p in st.list_items("program", public=True)}
    program_ids = [x for x in (data.get("program_ids") or []) if isinstance(x, str) and x in progs][:40]
    e: dict = {}
    if len(f["company"]) < 2:
        e["company"] = "required"
    if len(f["contact_name"]) < 2:
        e["contact_name"] = "required"
    if not EMAIL_RE.match(f["email"]):
        e["email"] = "invalid"
    if f["phone"] and not _phone_ok(f["phone"]):
        e["phone"] = "invalid"
    if f["website"] and not C.safe_url(f["website"], allow_relative=False):
        e["website"] = "invalid"
    if len(f["title"]) < 4:
        e["title"] = "required"
    if f["type"] not in K.OPP_TYPES:
        e["type"] = "required"
    if not remote and len(f["city"]) < 2:
        e["city"] = "required"
    if len(desc) < 30:
        e["description"] = "short"
    if f["apply_url"] and not re.match(r"^https?://", f["apply_url"], re.I):
        e["apply_url"] = "invalid"
    if f["apply_email"] and not EMAIL_RE.match(f["apply_email"]):
        e["apply_email"] = "invalid"
    if f["apply_phone"] and not _phone_ok(f["apply_phone"]):
        e["apply_phone"] = "invalid"
    if not (f["apply_url"] or f["apply_email"] or f["apply_phone"]):
        e["apply"] = "required"
    deadline = None
    if f["deadline"]:
        try:
            d = date.fromisoformat(f["deadline"][:10])
            if d < date.today():
                e["deadline"] = "past"
            else:
                deadline = f"{d.isoformat()}T23:59:59+05:00"
        except ValueError:
            e["deadline"] = "invalid"
    if not data.get("agree"):
        e["agree"] = "required"
    if e:
        _err(e)
    rate_limit("career-submit:" + ip_of(request), 5, 3600)
    lang = data.get("lang") if data.get("lang") in C.LANGS else svc().base_lang()
    sub = {"company": f["company"][:200], "name": f["contact_name"][:160], "email": f["email"].lower()[:160], "phone": f["phone"][:40],
           "website": C.safe_url(f["website"], allow_relative=False), "lang": lang, "ip": ip_of(request)[:60], "at": K._now()}  # noqa: SLF001
    item = {"title": f["title"][:300], "company": f["company"][:200], "type": f["type"], "city": f["city"][:120], "remote": remote, "salary": f["salary"][:120],
            "summary": re.sub(r"\s+", " ", desc)[:300], "html": _paras(desc), "text": desc, "requirements": reqs, "program_ids": program_ids,
            "apply_url": f["apply_url"], "apply_email": f["apply_email"].lower(), "apply_phone": f["apply_phone"], "deadline": deadline,
            "status": "pending", "submitter": sub}
    it = save_item("opportunity", item, None)
    from .desk import _desk  # noqa: PLC0415

    d = _desk()
    cat = K.desk_category(d)
    body = "\n".join(x for x in [
        f"Kompaniya: {sub['company']}", f"Aloqa: {sub['name']}, {sub['email']}{', ' + sub['phone'] if sub['phone'] else ''}",
        f"Veb-sayt: {sub['website']}" if sub["website"] else "", f"Turi: {K.LABELS['uz']['opp_types'][f['type']]}",
        f"Joy: {f['city'] or '—'}{' (masofaviy)' if remote else ''}", f"Muddat: {f['deadline']}" if deadline else "", "", desc,
        "", f"Moderatsiya: /admin/career-center?id={it['id']}"] if x is not None)
    t = d.create(f"Karyera markazi: {it['title']}", body, name=sub["name"], email=sub["email"], phone=sub["phone"], category_id=cat["id"], source="career",
                 ip=sub["ip"], lang=lang, meta={"source": "career", "opportunity": {"id": it["id"], "title": it["title"]}})
    st.patch_item_data(it["id"], ticket_id=t["id"])
    return ok({"ok": True, "ticket": t["number"]})


# ------------------------------------------------------------------ moderatsiya (admin: career_center)
def _ticket_move(it: dict, stage: str, actor: dict, reason: str) -> None:
    if not it.get("ticket_id"):
        return
    from .desk import _desk  # noqa: PLC0415

    d = _desk()
    t = d.get(it["ticket_id"])
    if t:
        d.move(t, stage, {"id": actor["id"], "name": actor.get("name") or actor.get("login")}, reason)


@router.post("/api/admin/career-center/opportunities/{iid}/approve")
def career_approve(iid: str, a: dict = Depends(current_admin)):
    st = _st()
    it = st.get_item(iid)
    if not it or it["kind"] != "opportunity":
        raise HTTPException(404, "not_found")
    if it.get("deadline") and it["deadline"] < K._now():  # noqa: SLF001
        raise HTTPException(400, "deadline_passed")
    it = save_item("opportunity", {"status": "published", "reject_reason": ""}, iid)
    mailed = K.moderation_mail(svc(), it, True)
    _ticket_move(it, "resolved", a, "E’lon tasdiqlandi va nashr qilindi")
    return ok({"item": it, "mailed": mailed})


@router.post("/api/admin/career-center/opportunities/{iid}/reject")
def career_reject(iid: str, data: dict = Body(default={}), a: dict = Depends(current_admin)):
    st = _st()
    it = st.get_item(iid)
    if not it or it["kind"] != "opportunity":
        raise HTTPException(404, "not_found")
    reason = str(data.get("reason") or "").strip()[:1000]
    if len(reason) < 3:
        raise HTTPException(400, "reason_required")
    it = save_item("opportunity", {"status": "rejected", "reject_reason": reason}, iid)
    mailed = K.moderation_mail(svc(), it, False, reason)
    _ticket_move(it, "failed", a, reason)
    return ok({"item": it, "mailed": mailed})


@router.get("/api/admin/career-center/settings")
def career_settings_get(a: dict = Depends(current_admin)):
    st = _st()
    return ok(K.settings(st) | {"counts": {s: st._one("SELECT COUNT(*) FROM items WHERE kind='opportunity' AND status=%s", (s,)) or 0  # noqa: SLF001
                                         for s in ("pending", "published", "expired", "rejected", "draft")}})


@router.put("/api/admin/career-center/settings")
def career_settings_put(data: dict = Body(...), a: dict = Depends(current_admin)):
    st = _st()
    v = K.clean_settings(data, K.settings(st))
    st.kv_put("career_center", v)
    return ok(v)


@router.post("/api/admin/career-center/sweep")
def career_sweep(a: dict = Depends(current_admin)):
    st = _st()
    return ok({"expired": K.sweep(st, force=True), "notified": K.run_digest(st)})


# ================================================================== hamkorlar va amaliyot bazalari
@router.get("/api/cooperation/partners")
def partners_index(lang: str = ""):
    _st()
    items = [_partner_card(p) for p in _pub("partner", lang)]
    return ok({"items": items, "programs": _programs(lang)})


@router.get("/api/cooperation/practice-bases")
def practice_bases(program: str = "", lang: str = ""):
    _st()
    progs = _programs(lang)
    pid = next((p["id"] for p in progs if program in (p["id"], p["slug"])), "")
    if not pid:
        return ok({"items": []})
    return ok({"items": [_partner_card(p) for p in _pub("partner", lang) if p.get("practice_base") and pid in (p.get("program_ids") or [])]})


@router.get("/api/cooperation/partners/{slug}")
def partner_item(slug: str, lang: str = ""):
    st = _st()
    it = _by_slug("partner", slug, lang)
    progs = {p["id"]: p for p in _programs(lang)}
    # tegishli yangiliklar: sarlavha yoki matnda hamkor nomi (aniq moslik)
    key = (it["title"].split("(")[0].strip() or it["title"]).lower()
    raw_title = (st.get_item(it["id"]) or {}).get("title", "").split("(")[0].strip().lower()
    news = []
    for n in sorted(_pub("news", lang), key=lambda x: x.get("published_at") or "", reverse=True):
        hay = f"{n.get('title') or ''} {n.get('text') or ''}".lower()
        if len(key) >= 4 and (key in hay or (raw_title and raw_title in hay)):
            news.append({k: n.get(k) for k in ("id", "slug", "title", "published_at", "feature_image", "excerpt")})
        if len(news) >= 4:
            break
    opps = [o for o in _open_opps(lang) if o.get("partner_id") == it["id"]]
    others = [_partner_card(p) for p in _pub("partner", lang) if p["id"] != it["id"] and p.get("category") == it.get("category")][:3]
    return ok({"item": _detail(it), "programs": [progs[i] for i in it.get("program_ids") or [] if i in progs], "news": news, "opportunities": opps,
               "others": others})


# ================================================================== bitiruvchilar
def _stats_public(lang: str) -> list[dict]:
    progs = {p["id"]: p for p in _programs(lang)}
    return [r | {"program": progs[r["program_id"]]["title"] if r["program_id"] in progs else ""} for r in K.stats(svc().st)
            if not r["program_id"] or r["program_id"] in progs]


@router.get("/api/alumni")
def alumni_public(lang: str = ""):
    _st()
    progs = {p["id"]: p for p in _programs(lang)}
    stories = [_light(x) | {"program": progs.get(x.get("program_id") or "", {}).get("title") or x.get("program_text") or ""} for x in _pub("alumni", lang)]
    return ok({"items": stories, "stats": _stats_public(lang), "programs": list(progs.values())})


@router.get("/api/alumni/{slug}")
def alumni_item(slug: str, lang: str = ""):
    _st()
    it = _by_slug("alumni", slug, lang)
    progs = {p["id"]: p for p in _programs(lang)}
    others = [_light(x) | {"program": progs.get(x.get("program_id") or "", {}).get("title") or x.get("program_text") or ""}
              for x in _pub("alumni", lang) if x["id"] != it["id"]][:3]
    return ok({"item": _detail(it) | {"program": progs.get(it.get("program_id") or "")}, "others": others})


@router.post("/api/alumni/register")
def alumni_register(request: Request, data: dict = Body(...)):
    """Bitiruvchilar ro'yxati: ochiq saytda ko'rinmaydi; admin («alumni» ruxsati) ko'radi va Excel'ga yuklaydi."""
    if data.get("hp"):
        return ok({"ok": True})
    st = _st()
    f = {k: re.sub(r"\s+", " ", str(data.get(k) or "")).strip() for k in ("name", "program_id", "program_text", "job", "company", "city", "email", "phone")}
    e: dict = {}
    if len(f["name"]) < 5 or len(f["name"].split()) < 2:
        e["name"] = "required"
    try:
        year = int(data.get("year") or 0)
    except (TypeError, ValueError):
        year = 0
    if not 2000 <= year <= datetime.now().year + 1:
        e["year"] = "invalid"
    progs = {p["id"] for p in st.list_items("program", public=True)}
    if f["program_id"] and f["program_id"] not in progs:
        f["program_id"] = ""
    if not f["program_id"] and len(f["program_text"]) < 3:
        e["program_id"] = "required"
    if f["email"] and not EMAIL_RE.match(f["email"]):
        e["email"] = "invalid"
    if f["phone"] and not _phone_ok(f["phone"]):
        e["phone"] = "invalid"
    if not f["email"] and not f["phone"]:
        e["contact"] = "required"
    if not data.get("agree"):
        e["agree"] = "required"
    if e:
        _err(e)
    rate_limit("alumni-reg:" + ip_of(request), 5, 3600)
    key = f["email"].lower() or re.sub(r"\D", "", f["phone"])
    dup = st._one("SELECT COUNT(*) FROM alumni_registry WHERE (lower(email)=%s OR regexp_replace(COALESCE(phone,''), '\\D', '', 'g')=%s) AND created>=%s",  # noqa: SLF001
                  (key, key, datetime.now(timezone.utc).date().isoformat()))
    if dup:
        raise HTTPException(400, "duplicate")
    rid = K.new_id()
    now = K._now()  # noqa: SLF001
    lang = data.get("lang") if data.get("lang") in C.LANGS else svc().base_lang()
    with st._tx() as c:  # noqa: SLF001
        c.execute("INSERT INTO alumni_registry(id, name, year, program_id, program_text, job, company, city, email, phone, consent_contact, consent_publish, "
                  "status, lang, ip, created, updated) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'new',%s,%s,%s,%s)",
                  (rid, f["name"][:160], year, f["program_id"] or None, f["program_text"][:200], f["job"][:200], f["company"][:200], f["city"][:120],
                   f["email"].lower()[:160], f["phone"][:40], int(bool(data.get("consent_contact"))), int(bool(data.get("consent_publish"))), lang,
                   ip_of(request)[:60], now, now))
    return ok({"ok": True})


REG_STATUS = ("new", "contacted", "story", "archived")


def _registry(st, q: str = "", year: str = "", program: str = "", status: str = "") -> list[dict]:
    sql, args = "SELECT * FROM alumni_registry WHERE 1=1", []
    if year:
        sql += " AND year=%s"
        args.append(int(year) if year.isdigit() else -1)
    if program:
        sql += " AND program_id=%s"
        args.append(program)
    if status:
        sql += " AND status=%s"
        args.append(status)
    if q:
        sql += " AND (lower(name) LIKE %s OR lower(COALESCE(email,'')) LIKE %s OR COALESCE(phone,'') LIKE %s OR lower(COALESCE(job,'')) LIKE %s OR lower(COALESCE(company,'')) LIKE %s OR lower(COALESCE(city,'')) LIKE %s)"
        args += [f"%{q.lower()}%"] * 6
    sql += " ORDER BY created DESC LIMIT 5000"
    return [dict(r) | {"consent_contact": bool(r["consent_contact"]), "consent_publish": bool(r["consent_publish"])} for r in st._q(sql, tuple(args))]  # noqa: SLF001


@router.get("/api/admin/alumni/registry")
def registry_list(q: str = "", year: str = "", program: str = "", status: str = "", a: dict = Depends(current_admin)):
    st = _st()
    years = [r[0] for r in st._q("SELECT DISTINCT year FROM alumni_registry WHERE year IS NOT NULL ORDER BY year DESC")]  # noqa: SLF001
    return ok({"items": _registry(st, q.strip()[:80], year, program, status), "years": years, "total": st._one("SELECT COUNT(*) FROM alumni_registry") or 0})  # noqa: SLF001


@router.get("/api/admin/alumni/registry.xlsx")
def registry_export(q: str = "", year: str = "", program: str = "", status: str = "", a: dict = Depends(current_admin)):
    from ..lib_xlsx import table  # noqa: PLC0415

    st = _st()
    progs = {p["id"]: p["title"] for p in st.list_items("program")}
    yn = lambda v: "Ha" if v else "Yo‘q"  # noqa: E731
    rows = [[i + 1, r["name"], r["year"] or "", progs.get(r["program_id"] or "", r["program_text"] or ""), r["job"] or "", r["company"] or "", r["city"] or "",
             r["email"] or "", r["phone"] or "", yn(r["consent_contact"]), yn(r["consent_publish"]), r["status"], r["note"] or "", (r["created"] or "")[:10]]
            for i, r in enumerate(_registry(st, q.strip()[:80], year, program, status))]
    body = table("Bitiruvchilar ro‘yxati", ["№", "F.I.Sh.", "Bitirgan yili", "Yo‘nalish", "Lavozim", "Ish joyi", "Shahar", "Email", "Telefon",
                                           "Bog‘lanishga rozi", "Nashrga rozi", "Holat", "Izoh", "Sana"], rows, [5, 32, 10, 30, 24, 24, 14, 26, 16, 12, 12, 12, 24, 12])
    return Response(body, media_type=XLSX, headers={"Content-Disposition": 'attachment; filename="bitiruvchilar.xlsx"'})


@router.put("/api/admin/alumni/registry/{rid}")
def registry_update(rid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    st = _st()
    r = st._q("SELECT * FROM alumni_registry WHERE id=%s", (rid,))  # noqa: SLF001
    if not r:
        raise HTTPException(404, "not_found")
    status = data.get("status") if data.get("status") in REG_STATUS else r[0]["status"]
    note = str(data.get("note") if "note" in data else r[0]["note"] or "").strip()[:2000]
    with st._tx() as c:  # noqa: SLF001
        c.execute("UPDATE alumni_registry SET status=%s, note=%s, updated=%s WHERE id=%s", (status, note, K._now(), rid))  # noqa: SLF001
    return ok({"ok": True})


@router.delete("/api/admin/alumni/registry/{rid}")
def registry_delete(rid: str, a: dict = Depends(current_admin)):
    st = _st()
    with st._tx() as c:  # noqa: SLF001
        c.execute("DELETE FROM alumni_registry WHERE id=%s", (rid,))
    return ok({"ok": True})


@router.post("/api/admin/alumni/registry/{rid}/story")
def registry_story(rid: str, a: dict = Depends(current_admin)):
    """Ro'yxatdagi bitiruvchidan hikoya qoralamasi (nashrga rozilik ro'yxatdagi javobdan olinadi; matnni admin yozadi)."""
    st = _st()
    r = st._q("SELECT * FROM alumni_registry WHERE id=%s", (rid,))  # noqa: SLF001
    if not r:
        raise HTTPException(404, "not_found")
    r = r[0]
    if r["story_id"] and st.get_item(r["story_id"]):
        return ok({"id": r["story_id"]})
    it = save_item("alumni", {"title": r["name"], "year": r["year"], "program_id": r["program_id"] or "", "program_text": r["program_text"] or "",
                              "position": r["job"] or "", "company": r["company"] or "", "consent": bool(r["consent_publish"]), "registry_id": rid,
                              "status": "draft"}, None)
    with st._tx() as c:  # noqa: SLF001
        c.execute("UPDATE alumni_registry SET story_id=%s, status='story', updated=%s WHERE id=%s", (it["id"], K._now(), rid))  # noqa: SLF001
    return ok({"id": it["id"]})


@router.get("/api/admin/alumni/stats")
def alumni_stats_get(a: dict = Depends(current_admin)):
    return ok({"rows": K.stats(_st())})


@router.put("/api/admin/alumni/stats")
def alumni_stats_put(data: dict = Body(...), a: dict = Depends(current_admin)):
    st = _st()
    rows = K.clean_stats(data.get("rows"))
    st.kv_put("alumni_stats", rows)
    return ok({"rows": rows})


# ================================================================== startaplar
def _startup_out(it: dict, lang: str, full: bool = False) -> dict:
    st = svc().st
    team = []
    for m in it.get("team") or []:
        s = _staff_card(st.get_item(m["staff_id"]), lang) if m.get("staff_id") else None
        team.append(m | {"slug": s["slug"] if s else "", "photo": s["photo"] if s else "", "position": s["position"] if s else ""})
    out = (_detail(it) if full else _light(it)) | {"team": team}
    if full:
        ps = [p for p in (st.get_item(i) for i in it.get("partner_ids") or []) if p and p.get("status") == "published"]
        out["partner_cards"] = [{"slug": p.get("slug") or "", "title": svc().loc(p, lang)["title"], "logo": p.get("logo") or ""} for p in ps]
    return out


@router.get("/api/startups")
def startups_public(lang: str = ""):
    _st()
    return ok({"items": [_startup_out(x, lang) for x in _pub("startup", lang)]})


@router.get("/api/startups/{slug}")
def startup_item(slug: str, lang: str = ""):
    _st()
    it = _by_slug("startup", slug, lang)
    others = [_startup_out(x, lang) for x in _pub("startup", lang) if x["id"] != it["id"]]
    others.sort(key=lambda x: x.get("category") != it.get("category"))
    return ok({"item": _startup_out(it, lang, full=True), "others": others[:3]})


# ================================================================== foydali maqolalar
def _article_card(it: dict, staff: dict, lang: str) -> dict:
    a = _staff_card(staff.get(it.get("author_id") or ""), lang)
    return _light(it) | {"author": {"title": a["title"], "slug": a["slug"], "photo": a["photo"], "position": a["position"]} if a else
                         ({"title": it["author_name"], "slug": "", "photo": "", "position": ""} if it.get("author_name") else None)}


@router.get("/api/articles")
def articles_public(lang: str = ""):
    _st()
    items = sorted(_pub("insight", lang), key=lambda x: x.get("published_at") or "", reverse=True)
    staff = svc().st.get_items([x.get("author_id") for x in items])
    return ok({"items": [_article_card(x, staff, lang) for x in items], "topics": list(C.ARTICLE_TOPICS)})


@router.get("/api/articles/{slug}")
def article_item(slug: str, lang: str = ""):
    st = _st()
    it = _by_slug("insight", slug, lang)
    author = _staff_card(st.get_item(it["author_id"]), lang) if it.get("author_id") else None
    rest = [x for x in _pub("insight", lang) if x["id"] != it["id"]]
    topics = set(it.get("topics") or [])
    rest.sort(key=lambda x: x.get("published_at") or "", reverse=True)
    rest.sort(key=lambda x: -len(topics & set(x.get("topics") or [])))  # barqaror: avval mavzusi mos, keyin yangilari
    staff = st.get_items([x.get("author_id") for x in rest[:3]])
    return ok({"item": _detail(it), "author": author or ({"title": it["author_name"]} if it.get("author_name") else None),
               "related": [_article_card(x, staff, lang) for x in rest[:3]]})


@router.get("/articles/rss.xml")
def articles_rss(lang: str = ""):
    _st()
    return Response(K.articles_rss(svc(), lang or None), media_type="application/rss+xml; charset=utf-8")


# ================================================================== talaba kabineti: «Karyera»
@router.get("/api/portal/career")
def portal_career(lang: str = "", u: dict = Depends(current_user)):
    st = _st()
    pid = K.student_program(st, u) if u["role"] == "student" else ""
    items = _open_opps(lang)
    for x in items:
        x["match"] = bool(pid and pid in (x.get("program_ids") or []))
    # o'z yo'nalishiga moslari birinchi, keyin tanlanganlar va yangilari
    items.sort(key=lambda x: (not x["match"], not x.get("featured"), -(datetime.fromisoformat(x["published_at"]).timestamp() if x.get("published_at") else 0)))
    progs = {p["id"]: p for p in _programs(lang)}
    return ok({"items": items, "program": progs.get(pid), "programs": list(progs.values()), "muted": K.is_muted(st, u["id"]),
               "notify": bool(K.settings(st).get("notify", True))})


@router.put("/api/portal/career/notify")
def portal_career_notify(data: dict = Body(...), u: dict = Depends(current_user)):
    K.set_muted(_st(), u["id"], not bool(data.get("on")))
    return ok({"ok": True, "muted": not bool(data.get("on"))})

