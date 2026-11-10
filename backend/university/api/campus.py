"""Talabalar hayoti, abituriyent, galereya, kampus xaritasi, virtual tur va tadbirga ro'yxat — ochiq va admin API.

Ochiq: /api/campus/sections, /api/life, /api/clubs[/slug][/join], /api/sport, /api/dormitory[/apply], /api/scholarships, /api/gallery[/slug],
/api/admission/steps, /api/admission/calculator, /api/admission/calc, /api/parents, /api/campus-map, /api/tour,
/api/events/{slug}/registration|register|calendar.ics, /img/{m|s}/{w}/{fayl} (kichraytirilgan WebP).
Admin: /api/admin/life/… (student_life), /api/admin/gallery/… (gallery), /api/admin/applicant/… (admission), /api/admin/eventreg… (events).
"""
from __future__ import annotations

import io
import re
from urllib.parse import urlparse

from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response

from .. import campus as K
from .. import content as C
from .. import eventreg as E
from ..campus_schema import CLUB_CATS, FORMS
from .deps import current_admin, ip_of, ok, rate_limit, svc

router = APIRouter()


def S():
    """Servis."""
    s = svc()
    if getattr(s, "_campus_seeded", None) is not s.st:
        K.ensure_seed(s)
        s._campus_seeded = s.st
    return s


def startup() -> None:
    """Ilova ishga tushganda: boshlang'ich ma'lumotlar va «Klublar», «Yotoqxona» murojaat bo'limlari (idempotent)."""
    try:
        S()
        K.ensure_desk()
    except Exception as e:  # noqa: BLE001
        print(f"campus startup: {e}", flush=True)


def _need(section: str) -> None:
    if not K.visible(S()).get(section):
        raise HTTPException(404, "not_found")


def _L(lang: str) -> tuple[str, str]:
    s = S()
    return s.lang(lang), s.base_lang()


LIGHT = ("content", "html", "text", "i18n")


def _card(it: dict, lang: str) -> dict:
    out = {k: v for k, v in it.items() if k not in LIGHT}
    if "photos" in it:
        out["photos"] = K.photos_l(it, lang)
    return out


def _staff_card(sid: str, lang: str) -> dict | None:
    it = S().st.get_item(sid) if sid else None
    if not it or it.get("kind") != "staff" or it.get("status") != "published":
        return None
    x = S().loc(it, lang)
    return {k: x.get(k) for k in ("id", "title", "slug", "position", "degree", "photo", "email", "phone", "hours")}


# ------------------------------------------------------------------ bo'limlar
@router.get("/api/campus/sections")
def sections():
    return ok(K.visible(S()))


@router.get("/api/life")
def life_hub(lang: str = ""):
    lang, base = _L(lang)
    v = K.visible(S())
    if not v["life"]:
        raise HTTPException(404, "not_found")
    s = S()
    clubs = [_card(x, lang) for x in K.pub(s, "club", lang)] if v["clubs"] else []
    albums = _albums(lang) if v["gallery"] else []
    return ok({"sections": v, "intro": K.settings_l(s.st, "life", lang, base)["intro"], "clubs": clubs[:6], "albums": albums[:4],
               "counts": {"clubs": len(clubs), "albums": len(albums), "scholarships": len(K.pub(s, "scholarship")) if v["scholarships"] else 0}})


# ------------------------------------------------------------------ klublar
@router.get("/api/clubs")
def clubs(lang: str = ""):
    _need("clubs")
    lang, base = _L(lang)
    items = [_card(x, lang) for x in K.pub(S(), "club", lang)]
    cats = [c for c in CLUB_CATS if any(x.get("category") == c for x in items)]
    return ok({"items": items, "categories": cats, "intro": K.settings_l(S().st, "clubs", lang, base)["intro"]})


def _club(slug: str) -> dict:
    it = S().st.get_item_by_slug("club", slug)
    if not it:
        raise HTTPException(404, "not_found")
    return it


@router.get("/api/clubs/{slug}")
def club_item(slug: str, lang: str = ""):
    lang, _base = _L(lang)
    raw = _club(slug)
    it = S().loc(raw, lang)
    it["photos"] = K.photos_l(raw, lang)
    leader = _staff_card(it.get("leader_staff_id") or "", lang)
    news = []
    if it.get("news_tag"):
        news = [{k: n.get(k) for k in ("id", "title", "slug", "feature_image", "published_at", "excerpt")}
                for n in (S().loc(x, lang) for x in S().st.list_items("news", public=True)) if it["news_tag"] in (n.get("tags") or [])]
        news.sort(key=lambda n: n.get("published_at") or "", reverse=True)
    others = [_card(x, lang) for x in K.pub(S(), "club", lang) if x["id"] != raw["id"] and x.get("category") == raw.get("category")][:3]
    it.pop("text", None)
    return ok({"item": it, "leader": leader, "news": news[:6], "others": others})


def _fields(data: dict, keys: tuple[str, ...]) -> dict:
    return {k: re.sub(r"\s+", " ", str(data.get(k) or "")).strip() for k in keys}


def _check_person(f: dict, err: dict) -> str:
    if len(f["name"]) < 3 or len(f["name"].split()) < 2:
        err["name"] = "required"
    phone = E.norm_phone(f["phone"])
    if not phone:
        err["phone"] = "invalid"
    if f.get("email") and not E.EMAIL_RE.match(f["email"]):
        err["email"] = "invalid"
    return phone


@router.post("/api/clubs/{slug}/join")
def club_join(request: Request, slug: str, data: dict = Body(...)):
    """«Qo'shilish» formasi → «Murojaatlar»da «Klublar» bo'limi chiptasi (klub sahifasida forma yoqilgan bo'lsa)."""
    if data.get("hp"):
        return ok({"ok": True})
    raw = _club(slug)
    if not raw.get("join_form"):
        raise HTTPException(400, "closed")
    rate_limit(f"clubjoin:{ip_of(request)}", 5, 600)
    f = _fields(data, ("name", "phone", "email", "group", "message"))
    err: dict = {}
    phone = _check_person(f, err)
    if not f["group"]:
        err["group"] = "required"
    if err:
        raise HTTPException(400, {"fields": err})
    from .desk import _desk  # noqa: PLC0415

    cat = K.ensure_desk()["clubs"]
    body = "\n".join([f"Klub: {raw['title']}", f"F.I.Sh.: {f['name']}", f"Telefon: {phone}", f"Email: {f['email'] or '—'}", f"Kurs / guruh: {f['group']}",
                      "", f["message"][:3000] or "—"])
    t = _desk().create(f"Klubga qo‘shilish: {raw['title']}", body, name=f["name"][:160], email=f["email"][:160], phone=phone, category_id=cat, source="web",
                       ip=ip_of(request), meta={"source": "club", "club": {"id": raw["id"], "title": raw["title"], "slug": raw.get("slug")}},
                       lang=str(data.get("lang") or "")[:5])
    return ok({"ok": True, "ticket": t["number"]})


# ------------------------------------------------------------------ sport
@router.get("/api/sport")
def sport(lang: str = ""):
    _need("sport")
    lang, base = _L(lang)
    s = S()
    ach = [_card(x, lang) for x in K.pub(s, "achievement", lang) if x.get("category") == "sport"]
    ach.sort(key=lambda a: (-(a.get("year") or 0), a.get("sort") or 0))
    return ok({"intro": K.settings_l(s.st, "sport", lang, base)["intro"],
               "clubs": [_card(x, lang) for x in K.pub(s, "club", lang) if x.get("category") == "sport"],
               "achievements": ach, "facilities": [_card(x, lang) for x in K.pub(s, "facility", lang) if x.get("category") == "sport"]})


# ------------------------------------------------------------------ yotoqxona
@router.get("/api/dormitory")
def dormitory(lang: str = ""):
    _need("dormitory")
    lang, base = _L(lang)
    s = S()
    st = K.settings_l(s.st, "dormitory", lang, base)
    contacts = [c for c in (_staff_card(i, lang) for i in st.pop("contact_ids") or []) if c]
    return ok({**st, "contacts": contacts, "buildings": [_card(x, lang) for x in K.pub(s, "dorm", lang)]})


@router.post("/api/dormitory/apply")
def dormitory_apply(request: Request, data: dict = Body(...)):
    """«Ariza berish» → «Murojaatlar»da «Yotoqxona» bo'limi chiptasi (admin arizalarni yoqqan bo'lsa)."""
    if data.get("hp"):
        return ok({"ok": True})
    if not K.settings(S().st, "dormitory").get("apply_open"):
        raise HTTPException(400, "closed")
    rate_limit(f"dorm:{ip_of(request)}", 4, 600)
    f = _fields(data, ("name", "phone", "email", "program", "course", "group", "region", "message"))
    err: dict = {}
    phone = _check_person(f, err)
    for k in ("program", "group", "region"):
        if len(f[k]) < 2:
            err[k] = "required"
    if f["course"] not in ("1", "2", "3", "4", "master"):
        err["course"] = "required"
    if err:
        raise HTTPException(400, {"fields": err})
    from .desk import _desk  # noqa: PLC0415

    cat = K.ensure_desk()["dorm"]
    course = "Magistratura" if f["course"] == "master" else f"{f['course']}-kurs"
    body = "\n".join([f"F.I.Sh.: {f['name']}", f"Telefon: {phone}", f"Email: {f['email'] or '—'}", f"Yo‘nalish: {f['program']}", f"Kurs: {course}",
                      f"Guruh: {f['group']}", f"Doimiy yashash joyi: {f['region']}", "", f["message"][:3000] or "—"])
    t = _desk().create(f"Yotoqxona: ariza — {f['name'][:80]}", body, name=f["name"][:160], email=f["email"][:160], phone=phone, category_id=cat, source="web",
                       ip=ip_of(request), meta={"source": "dormitory", "student": {k: f[k] for k in ("program", "course", "group", "region")}},
                       lang=str(data.get("lang") or "")[:5])
    return ok({"ok": True, "ticket": t["number"]})


# ------------------------------------------------------------------ stipendiyalar
@router.get("/api/scholarships")
def scholarships(lang: str = ""):
    _need("scholarships")
    lang, base = _L(lang)
    items = [_card(x, lang) for x in K.pub(S(), "scholarship", lang)]
    tags = sorted({t for x in items for t in x.get("tags") or []})
    # tezkor filtr faqat foydali bo'lsa: kamida 3 ta stipendiya va 2 xil belgi
    return ok({"items": items, "tags": tags if len(items) >= 3 and len(tags) >= 2 else [], "intro": K.settings_l(S().st, "scholarships", lang, base)["intro"]})


# ------------------------------------------------------------------ galereya
def _albums(lang: str) -> list[dict]:
    out = []
    for x in K.pub(S(), "album", lang):
        if not (x.get("photos") or x.get("videos")):
            continue
        c = _card(x, lang)
        c["count"] = len(x.get("photos") or [])
        c["videos_count"] = len(x.get("videos") or [])
        cover = next((p for p in c["photos"] if p["url"] == x.get("cover")), None) or (c["photos"][0] if c["photos"] else None)
        c["cover_photo"] = cover
        c.pop("photos")
        out.append(c)
    out.sort(key=lambda a: (a.get("date") or "", a.get("updated") or ""), reverse=True)
    return out


@router.get("/api/gallery")
def gallery(lang: str = "", year: int = 0):
    _need("gallery")
    lang, base = _L(lang)
    items = _albums(lang)
    years = sorted({int(a["date"][:4]) for a in items if a.get("date")}, reverse=True)
    if year:
        items = [a for a in items if (a.get("date") or "")[:4] == str(year)]
    return ok({"items": items, "years": years, "intro": K.settings_l(S().st, "gallery", lang, base)["intro"]})


@router.get("/api/gallery/{slug}")
def album(slug: str, lang: str = ""):
    lang, _b = _L(lang)
    raw = S().st.get_item_by_slug("album", slug)
    if not raw or not (raw.get("photos") or raw.get("videos")):
        raise HTTPException(404, "not_found")
    it = _card(S().loc(raw, lang), lang)
    it["photos"] = K.photos_l(raw, lang)
    from ..campus_schema import youtube_id  # noqa: PLC0415

    it["videos"] = [youtube_id(v) for v in raw.get("videos") or [] if youtube_id(v)]
    news = None
    if raw.get("news_id"):
        n = S().st.get_item(raw["news_id"])
        if n and n.get("kind") == "news" and n.get("status") == "published":
            n = S().loc(n, lang)
            news = {"title": n["title"], "slug": n["slug"]}
    others = [a for a in _albums(lang) if a["id"] != raw["id"]][:3]
    return ok({"item": it, "news": news, "others": others})


# ------------------------------------------------------------------ abituriyent
@router.get("/api/admission/steps")
def adm_steps(lang: str = "", year: int = 0):
    lang, base = _L(lang)
    d = K.steps_public(S(), lang, year or None)
    return ok(d | {"intro": K.settings_l(S().st, "steps", lang, base)["intro"]})


@router.get("/api/admission/calculator")
def adm_calc_meta(lang: str = ""):
    _need("calculator")
    lang, base = _L(lang)
    return ok(K.calc_meta(S()) | {"intro": K.settings_l(S().st, "calculator", lang, base)["intro"]})


@router.get("/api/admission/calc")
def adm_calc(request: Request, score: str = "", year: int = 0, form: str = "", edu_lang: str = "", lang: str = ""):
    _need("calculator")
    rate_limit(f"calc:{ip_of(request)}", 120, 60)
    try:
        sc = float(score.replace(",", "."))
    except ValueError:
        raise HTTPException(400, "bad_score") from None
    if form and form not in FORMS:
        raise HTTPException(400, "bad_form")
    try:
        return ok(K.calc(S(), sc, year or None, form, edu_lang if edu_lang in K.EDU_LANGS else "", S().lang(lang)))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/api/parents")
def parents(lang: str = ""):
    lang, base = _L(lang)
    s = S()
    st = K.settings_l(s.st, "parents", lang, base)
    ids = st.pop("contact_ids") or []
    if not ids:  # standart: fakultet dekanati (dekan, o'rinbosarlari va tyutorlar) — saytdagi xodimlar ro'yxatidan
        deps = [d for d in s.st.list_items("department", public=True) if (d.get("slug") or "").endswith("fakulteti")]
        ids = [x["id"] for x in s.st.list_items("staff", public=True) if deps and x.get("department_id") == deps[0]["id"]][:8]
    contacts = [c for c in (_staff_card(i, lang) for i in ids) if c]
    faq = st["faq"] or []
    if not faq:  # ota-onalar savollari kiritilmagan bo'lsa — saytdagi qabul, to'lov va yotoqxona savol-javoblari
        faq = [{"q": x["title"], "a": x.get("answer") or ""} for x in (s.loc(f, lang) for f in s.st.list_items("faq", public=True))
               if x.get("category") in ("admission", "tuition", "campus")]
    u = s.uni_l(lang)
    from .. import tuition as T  # noqa: PLC0415

    v = K.visible(s)
    return ok({"intro": st["intro"], "pay": st["pay"], "faq": faq, "contacts": contacts, "sections": v, "tuition": T.shown(s.st),
               "about": {k: u.get(k) for k in ("name", "short_about", "mission", "values", "stats", "address", "phones", "email", "hours", "map_url")},
               "dormitory": K.settings_l(s.st, "dormitory", lang, base)["intro"] if v["dormitory"] else ""})


@router.get("/api/campus-map")
def campus_map(lang: str = ""):
    _need("map")
    lang, base = _L(lang)
    s = S()
    m = K.settings_l(s.st, "map", lang, base)
    spots = sorted([_card(x, lang) for x in K.pub(s, "campus_spot", lang)], key=lambda x: (x.get("number") is None, x.get("number") or 0, x.get("sort") or 0))
    scenes = {x["id"] for x in K.pub(s, "tour_scene") if x.get("panorama")}
    for x in spots:
        if x.get("scene_id") not in scenes:
            x["scene_id"] = ""
    return ok({**m, "lat": m.get("lat") or K.GEO["lat"], "lon": m.get("lon") or K.GEO["lon"], "zoom": m.get("zoom") or K.GEO["zoom"], "spots": spots,
               "tour": K.visible(s)["tour"]})


@router.get("/api/tour")
def tour(lang: str = ""):
    _need("tour")
    lang, base = _L(lang)
    s = S()
    scenes = [x for x in K.pub(s, "tour_scene", lang) if x.get("panorama")]
    ids = {x["id"] for x in scenes}
    out = []
    for x in scenes:
        hs = []
        for h in x.get("hotspots") or []:
            if h["type"] == "scene" and h.get("target") not in ids:
                continue
            hs.append({**{k: v for k, v in h.items() if k != "i18n"}, "text": (h.get("i18n") or {}).get(lang) or h.get("text") or ""})
        out.append({k: x.get(k) for k in ("id", "title", "summary", "panorama", "yaw", "pitch", "hfov")} | {"hotspots": hs})
    st = K.settings_l(s.st, "tour", lang, base)
    first = st.get("first_scene") if st.get("first_scene") in ids else (out[0]["id"] if out else "")
    return ok({"scenes": out, "first": first, "intro": st["intro"]})


# ------------------------------------------------------------------ tadbirga ro'yxat (ochiq)
def _event(slug: str) -> dict:
    it = S().st.get_item_by_slug("event", slug)
    if not it:
        raise HTTPException(404, "not_found")
    return it


@router.get("/api/events/{slug}/registration")
def ev_reg_info(slug: str, lang: str = ""):
    lang, base = _L(lang)
    return ok(E.public(S().st, _event(slug), lang, base))


@router.post("/api/events/{slug}/register")
def ev_register(request: Request, slug: str, data: dict = Body(...)):
    if data.get("hp"):  # bot: forma to'ldirilgandek javob, yozuv saqlanmaydi
        return ok({"status": "registered", "position": None})
    ev = _event(slug)
    rate_limit(f"evreg:{ip_of(request)}", 8, 600)
    s = S()
    lang = s.lang(str(data.get("lang") or ""))
    try:
        r = E.register(s.st, ev, data, ip_of(request), lang)
    except ValueError as e:
        detail = e.args[0] if e.args else "error"
        raise HTTPException(400, detail) from e
    E.spawn(E.send, s, ev, r, "ok" if r["status"] == "registered" else "wait")
    return ok({"status": r["status"], "position": r.get("position"), "email": bool(r.get("email"))})


@router.get("/api/events/{slug}/calendar.ics")
def ev_ics(slug: str, lang: str = ""):
    s = S()
    raw = _event(slug)
    ev = s.loc(raw, lang)
    base = s.base_url()
    q = "" if ev["lang"] == s.base_lang() else f"?lang={ev['lang']}"
    body = E.ics(ev, f"{base}/events/{ev['slug']}{q}", urlparse(base).hostname or "", s.uni_l(lang).get("name") or "")
    return Response(body, media_type="text/calendar; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{ev["slug"][:60]}.ics"'})


# ------------------------------------------------------------------ kichraytirilgan rasmlar (galereya, kartalar)
WIDTHS = (320, 480, 640, 960, 1280, 1600)
_IMG_RE = {"m": re.compile(r"[a-f0-9]{16}\.(png|jpg|webp)"), "s": re.compile(r"[a-f0-9]{12}\.(jpg|png)")}


@router.get("/img/{src}/{w}/{name}")
def thumb(src: str, w: int, name: str):
    if src not in _IMG_RE or w not in WIDTHS or not _IMG_RE[src].fullmatch(name):
        raise HTTPException(404, "not_found")
    st = svc().st
    cache = st.dir / "cache" / "img" / f"{src}-{w}-{name}.webp"
    headers = {"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"}
    if cache.exists():
        return FileResponse(cache, media_type="image/webp", headers=headers)
    if src == "s":
        raw = None
    else:
        from ..media import get_blob  # noqa: PLC0415

        raw = get_blob(st, name)
    if not raw:
        raise HTTPException(404, "not_found")
    try:
        from PIL import Image, ImageOps  # noqa: PLC0415

        with Image.open(io.BytesIO(raw)) as im:
            im = ImageOps.exif_transpose(im)
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
            if im.width > w:
                im = im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=80, method=4)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(404, "not_found") from e
    cache.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache.with_suffix(".tmp")
    tmp.write_bytes(buf.getvalue())
    tmp.replace(cache)
    return Response(buf.getvalue(), media_type="image/webp", headers=headers)


# ------------------------------------------------------------------ admin: sahifa sozlamalari
def _settings_routes(group: str) -> None:
    """GET/PUT /api/admin/{life|gallery|applicant}/settings/{section} — bo'lim sahifasi sozlamalari (yo'l prefiksi ruxsatni belgilaydi)."""

    def get(section: str, a: dict = Depends(current_admin)):
        if K.GROUP.get(section) != group:
            raise HTTPException(404, "not_found")
        S()
        return ok({"settings": K.settings(svc().st, section), "base": svc().base_lang()})

    def put(section: str, data: dict = Body(...), a: dict = Depends(current_admin)):
        if K.GROUP.get(section) != group:
            raise HTTPException(404, "not_found")
        return ok({"settings": K.save_settings(S().st, section, data), "base": svc().base_lang()})

    router.add_api_route(f"/api/admin/{group}/settings/{{section}}", get, methods=["GET"])
    router.add_api_route(f"/api/admin/{group}/settings/{{section}}", put, methods=["PUT"])


for _g in ("life", "gallery", "applicant"):
    _settings_routes(_g)


@router.get("/api/admin/life/overview")
def adm_life_overview(a: dict = Depends(current_admin)):
    s = S()
    return ok({"visible": K.visible(s), "desk": K.ensure_desk()})


# ------------------------------------------------------------------ admin: galereya
@router.post("/api/admin/gallery/{aid}/from-news")
def adm_album_from_news(aid: str, data: dict = Body(default={}), a: dict = Depends(current_admin)):
    """Albomga bog'langan yangilikdagi suratlar (muqova va matndagi rasmlar) — alt matnsiz qo'shiladi; admin alt yozadi."""
    st = S().st
    al = st.get_item(aid)
    if not al or al.get("kind") != "album":
        raise HTTPException(404, "not_found")
    nid = str(data.get("news_id") or al.get("news_id") or "")
    n = st.get_item(nid) if nid else None
    if not n or n.get("kind") != "news":
        raise HTTPException(400, "no_news")
    urls = [u for u in [n.get("feature_image") or "", *(n.get("gallery") or []), *re.findall(r'<img[^>]+src="([^"]+)"', n.get("html") or "")] if C.safe_url(u)]
    have = {p["url"] for p in al.get("photos") or []}
    new = [{"url": u, "alt": "", "caption": ""} for u in dict.fromkeys(urls) if u not in have]
    return ok({"photos": new})


# ------------------------------------------------------------------ admin: o'tish ballari
def _scores_payload() -> dict:
    s = S()
    progs = [{"id": p["id"], "title": p["title"], "slug": p.get("slug"), "status": p.get("status"), "degree": p.get("degree"), "code": p.get("code") or ""}
             for p in s.st.list_items("program")]
    return K.scores(s.st) | {"programs": progs, "forms": list(FORMS), "max_score": K.max_score(s.st)}


@router.get("/api/admin/applicant/scores")
def adm_scores(a: dict = Depends(current_admin)):
    return ok(_scores_payload())


@router.put("/api/admin/applicant/scores")
def adm_scores_put(data: dict = Body(...), a: dict = Depends(current_admin)):
    K.save_scores(S().st, data.get("rows") or [], data.get("sources") if isinstance(data.get("sources"), dict) else None)
    return ok(_scores_payload())


@router.get("/api/admin/applicant/scores.xlsx")
def adm_scores_xlsx(year: int = 0, a: dict = Depends(current_admin)):
    body = K.scores_xlsx(S().st, year or None)
    return Response(body, media_type=K.XLSX, headers={"Content-Disposition": f'attachment; filename="otish-ballari{"-" + str(year) if year else ""}.xlsx"'})


@router.post("/api/admin/applicant/scores/parse")
async def adm_scores_parse(file: UploadFile = File(...), year: int = 0, a: dict = Depends(current_admin)):
    raw = await file.read(10 * 1024 * 1024 + 1)
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(400, "file_too_large")
    try:
        return ok(K.parse_scores_xlsx(S().st, raw, year or None))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


# ------------------------------------------------------------------ admin: panorama (virtual tur)
PANO_MAX_W = 6144


@router.post("/api/admin/applicant/panorama")
async def adm_panorama(file: UploadFile = File(...), a: dict = Depends(current_admin)):
    """Ekvirektangulyar panorama: nisbat 2:1 (±3%), JPEG/PNG/WEBP, 40 MB gacha; 6144 px dan keng bo'lsa kichraytiriladi (JPEG)."""
    raw = await file.read(40 * 1024 * 1024 + 1)
    if len(raw) > 40 * 1024 * 1024:
        raise HTTPException(400, "too_large")
    from PIL import Image, ImageOps  # noqa: PLC0415

    Image.MAX_IMAGE_PIXELS = 120_000_000
    try:
        with Image.open(io.BytesIO(raw)) as im:
            fmt = (im.format or "").upper()
            im.load()
            if fmt not in ("JPEG", "PNG", "WEBP"):
                raise ValueError(fmt)
            im = ImageOps.exif_transpose(im)
            w, h = im.size
            if abs(w / h - 2) > 0.06:
                raise HTTPException(400, "not_equirectangular")
            if w > PANO_MAX_W:
                im = im.resize((PANO_MAX_W, PANO_MAX_W // 2), Image.LANCZOS)
            buf = io.BytesIO()
            im.convert("RGB").save(buf, "JPEG", quality=86, optimize=True, progressive=True)
            w, h = im.size
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, "unsupported_type") from e
    import uuid  # noqa: PLC0415

    from ..media import put_blob  # noqa: PLC0415

    st = svc().st
    name = f"{uuid.uuid4().hex[:16]}.jpg"
    data = buf.getvalue()
    put_blob(st, name, data, "image/jpeg")
    m = st.add_media(name, file.filename or name, "image/jpeg", len(data), w, h)
    return ok(m | {"url": f"/media/{name}", "width": w, "height": h})


# ------------------------------------------------------------------ admin: tadbirga ro'yxat
def _ev_or_404(eid: str) -> dict:
    ev = S().st.get_item(eid)
    if not ev or ev.get("kind") != "event":
        raise HTTPException(404, "not_found")
    return ev


@router.get("/api/admin/eventreg")
def adm_eventreg(a: dict = Depends(current_admin)):
    st = S().st
    out = []
    for ev in sorted(st.list_items("event"), key=lambda e: e.get("starts") or "", reverse=True):
        out.append({k: ev.get(k) for k in ("id", "title", "slug", "starts", "ends", "place", "status", "category")} |
                   {"registration": E.config(ev), "counts": E.counts(st, ev["id"]), "state": E.state(st, ev)})
    return ok({"items": out})


@router.put("/api/admin/eventreg/{eid}")
def adm_eventreg_put(eid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    st = S().st
    ev = _ev_or_404(eid)
    cfg = E.clean_config(data)
    st.patch_item_data(ev["id"], registration=cfg)
    promoted = E.promote(st, ev["id"])  # sig'im oshirilgan bo'lsa — kutish ro'yxatidan o'tkaziladi
    ev = st.get_item(eid)
    for r in promoted:
        E.spawn(E.send, S(), ev, r, "promo")
    return ok({"registration": E.config(ev), "counts": E.counts(st, eid), "state": E.state(st, ev), "promoted": len(promoted)})


@router.get("/api/admin/eventreg/{eid}/regs")
def adm_eventreg_regs(eid: str, q: str = "", status: str = "", a: dict = Depends(current_admin)):
    st = S().st
    ev = _ev_or_404(eid)
    return ok({"items": E.regs(st, eid, q, status), "counts": E.counts(st, eid), "registration": E.config(ev)})


@router.patch("/api/admin/eventreg/regs/{rid}")
def adm_eventreg_reg(rid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    st = S().st
    try:
        r, promoted = E.update(st, rid, data)
    except KeyError as e:
        raise HTTPException(404, "not_found") from e
    ev = st.get_item(r["event_id"])
    for p in promoted:
        E.spawn(E.send, S(), ev, p, "promo")
    return ok({"item": r, "promoted": len(promoted), "counts": E.counts(st, r["event_id"])})


@router.delete("/api/admin/eventreg/regs/{rid}")
def adm_eventreg_del(rid: str, a: dict = Depends(current_admin)):
    st = S().st
    cur = E.get(st, rid)
    if not cur:
        raise HTTPException(404, "not_found")
    promoted = E.delete(st, rid)
    ev = st.get_item(cur["event_id"])
    for p in promoted:
        E.spawn(E.send, S(), ev, p, "promo")
    return ok({"ok": True, "promoted": len(promoted), "counts": E.counts(st, cur["event_id"])})


@router.get("/api/admin/eventreg/{eid}/regs.xlsx")
def adm_eventreg_xlsx(eid: str, a: dict = Depends(current_admin)):
    ev = _ev_or_404(eid)
    body = E.xlsx(S().st, ev)
    return Response(body, media_type=K.XLSX, headers={"Content-Disposition": f'attachment; filename="royxat-{(ev.get("slug") or eid)[:50]}.xlsx"'})


@router.post("/api/admin/eventreg/{eid}/remind")
def adm_eventreg_remind(eid: str, a: dict = Depends(current_admin)):
    from ..mailer import can_send  # noqa: PLC0415

    s = S()
    if not can_send(s.st):
        raise HTTPException(400, "smtp_not_configured")
    ev = _ev_or_404(eid)
    rate_limit(f"remind:{eid}", 3, 3600)
    return ok({"queued": E.remind(s, ev)})


# ------------------------------------------------------------------ SEO: server tomonidagi meta teglar va sayt xaritasi (seo.py ilmoqlari)
def _seo_hooks() -> None:
    from .. import campus_seo, seo  # noqa: PLC0415

    if campus_seo.extra_meta not in seo.EXTRA_META:
        seo.EXTRA_META.append(campus_seo.extra_meta)
    if campus_seo.sitemap_urls not in seo.EXTRA_SITEMAP:
        seo.EXTRA_SITEMAP.append(campus_seo.sitemap_urls)


_seo_hooks()
