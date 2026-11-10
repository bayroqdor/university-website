"""Hamkorlik va karyera: karyera markazi, sanoat hamkorlari va amaliyot bazalari, bitiruvchilar, startaplar, foydali maqolalar.

Kontent `items` jadvalida (content.py sxemalari):
  opportunity — karyera markazi imkoniyati (amaliyot, ish, stajirovka, loyiha). Kompaniyalar saytdan yuboradi → «pending»
                (moderatsiya, «Karyera markazi» murojaati) → admin tasdiqlaydi («published») yoki sabab bilan rad etadi («rejected»).
                Muddati o'tgan nashr avtomatik «expired» bo'ladi (saqlashda, har daqiqadagi tekshiruvda va so'rovlarda).
  partner     — hamkorlar (sanoat / xalqaro / akademik / davlat), «amaliyot bazasi» belgisi va shu yerda amaliyot o'taydigan yo'nalishlar.
  alumni      — bitiruvchilar hikoyalari: faqat rozilik (consent) belgilansa nashr qilinadi.
  startup     — talaba va o'qituvchilar startaplari / innovatsion loyihalari.
  article     — foydali maqolalar (fan, ta’lim, texnologiya…), muallif — xodim profili.

Alohida jadvallar: `alumni_registry` (bitiruvchilar ro'yxatga olish formasi — ochiq emas, faqat admin), `career_notify` (talabaga
oxirgi xabar vaqti: kuniga ko'pi bilan bitta jamlangan xabar). Sozlamalar: kv `career_center` (ma'lumot bloki, aloqa, xabarnoma),
`alumni_stats` (bandlik statistikasi — admin kiritadi, taxminiy raqam yo'q).
"""
from __future__ import annotations

import json
import re
import secrets
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from html import escape
from xml.sax.saxutils import escape as xesc

from . import content as C
from . import seo

DESK_TITLE = "Karyera markazi"
OPP_TYPES = ("internship", "full_time", "part_time", "traineeship", "project")
PARTNER_TYPES = ("industry", "international", "academic", "government")
STAGES = ("idea", "prototype", "pilot", "market")
STARTUP_CATS = ("food_tech", "packaging", "processing", "agro", "ecology", "digital", "equipment", "other")
NOTIFY_GAP = timedelta(hours=20)  # talabaga karyera xabari kuniga ko'pi bilan bir marta (jamlangan)

# sahifa nomlari (SEO, sayt xaritasi, xatlar)
LABELS = {
    "uz": {"career-center": "Karyera markazi", "partners": "Hamkorlar", "alumni": "Bitiruvchilar", "startups": "Startaplar va innovatsiyalar",
           "articles": "Foydali maqolalar", "expired": "Muddati tugagan", "opp_types": {"internship": "Amaliyot", "full_time": "To‘liq stavka",
           "part_time": "Yarim stavka", "traineeship": "Stajirovka", "project": "Loyiha"}},
    "ru": {"career-center": "Центр карьеры", "partners": "Партнёры", "alumni": "Выпускники", "startups": "Стартапы и инновации",
           "articles": "Полезные статьи", "expired": "Срок истёк", "opp_types": {"internship": "Практика", "full_time": "Полная ставка",
           "part_time": "Неполная ставка", "traineeship": "Стажировка", "project": "Проект"}},
    "en": {"career-center": "Career Centre", "partners": "Partners", "alumni": "Alumni", "startups": "Startups and innovation",
           "articles": "Expert articles", "expired": "Closed", "opp_types": {"internship": "Internship", "full_time": "Full-time",
           "part_time": "Part-time", "traineeship": "Traineeship", "project": "Project"}},
}
DESC = {
    "uz": {"career-center": "{abbr} karyera markazi: talaba va bitiruvchilar uchun amaliyot, ish o‘rinlari, stajirovka va loyihalar; kompaniyalar uchun e’lon joylash.",
           "partners": "{abbr} hamkorlari: sanoat korxonalari, xalqaro tashkilotlar, universitetlar va davlat organlari; talabalar amaliyot bazalari.",
           "alumni": "{abbr} bitiruvchilari: hikoyalar, bandlik statistikasi va bitiruvchilar ro‘yxatiga qo‘shilish.",
           "startups": "{abbr} talaba va o‘qituvchilarining startaplari va innovatsion loyihalari.",
           "articles": "{abbr} mutaxassislarining foydali maqolalari."},
    "ru": {"career-center": "Центр карьеры {abbr}: практика, вакансии, стажировки и проекты для студентов и выпускников; размещение предложений для компаний.",
           "partners": "Партнёры {abbr}: промышленные предприятия, международные организации, университеты и госорганы; базы практики студентов.",
           "alumni": "Выпускники {abbr}: истории, статистика трудоустройства и регистрация в базе выпускников.",
           "startups": "Стартапы и инновационные проекты студентов и преподавателей {abbr}.",
           "articles": "Полезные статьи экспертов {abbr}."},
    "en": {"career-center": "{abbr} Career Centre: internships, jobs, traineeships and projects for students and graduates; post an opportunity as an employer.",
           "partners": "{abbr} partners: industry, international organisations, universities and government bodies; student internship sites.",
           "alumni": "{abbr} alumni: stories, employment statistics and the alumni register.",
           "startups": "Startups and innovation projects by {abbr} students and staff.",
           "articles": "Expert articles by {abbr} specialists."},
}
SECTIONS = {"career-center": "opportunity", "alumni": "alumni", "startups": "startup", "articles": "insight", "partners": "partner"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _l(lang: str) -> dict:
    return LABELS.get(lang, LABELS["uz"])


# ------------------------------------------------------------------ sozlamalar
DEFAULT_SETTINGS = {"info": {}, "email": "", "phone": "", "room": "", "hours": "", "staff_ids": [], "notify": True}


def settings(st) -> dict:
    v = st.kv_get("career_center") or {}
    return {**DEFAULT_SETTINGS, **(v if isinstance(v, dict) else {})}


def clean_settings(data: dict, cur: dict) -> dict:
    out = dict(cur)
    for k, n in (("email", 160), ("phone", 60), ("room", 120), ("hours", 200)):
        if k in data:
            out[k] = str(data.get(k) or "").strip()[:n]
    if "staff_ids" in data:
        out["staff_ids"] = [str(x)[:40] for x in (data.get("staff_ids") or []) if x][:6]
    if "notify" in data:
        out["notify"] = bool(data["notify"])
    if isinstance(data.get("info"), dict):
        info = {}
        for lang in C.LANGS:
            x = data["info"].get(lang)
            if isinstance(x, dict) and str(x.get("html") or "").strip() and re.sub(r"<[^>]+>|\s|&nbsp;", "", str(x.get("html"))):
                info[lang] = {"html": str(x.get("html"))[:200_000], "content": x.get("content") if isinstance(x.get("content"), dict) else None}
        out["info"] = info
    return out


def info_html(st, lang: str, base: str) -> str:
    info = settings(st).get("info") or {}
    return ((info.get(lang) or info.get(base) or next(iter(info.values()), None) or {}).get("html")) or ""


# bandlik statistikasi: [{year, program_id, graduates, employed_pct}] — faqat admin kiritgan qiymatlar
def stats(st) -> list[dict]:
    v = st.kv_get("alumni_stats") or []
    return v if isinstance(v, list) else []


def clean_stats(rows) -> list[dict]:
    out = []
    for r in (rows or [])[:400]:
        if not isinstance(r, dict):
            continue
        try:
            year = int(r.get("year") or 0)
        except (TypeError, ValueError):
            continue
        if not 1990 <= year <= 2100:
            continue
        grads = C._num(r.get("graduates"), lambda x: int(float(x)), None) if r.get("graduates") not in (None, "") else None  # noqa: SLF001
        pct = C._num(r.get("employed_pct"), float, None) if r.get("employed_pct") not in (None, "") else None  # noqa: SLF001
        if grads is not None and grads < 0:
            grads = None
        if pct is not None and not 0 <= pct <= 100:
            pct = None
        if grads is None and pct is None:
            continue
        out.append({"year": year, "program_id": str(r.get("program_id") or "")[:40], "graduates": grads, "employed_pct": round(pct, 1) if pct is not None else None})
    out.sort(key=lambda x: (-x["year"], x["program_id"]))
    return out


# ------------------------------------------------------------------ jadvallar, migratsiya, boshlang'ich ma'lumot
def ensure_schema(st) -> None:
    with st._tx() as c:  # noqa: SLF001
        c.execute("CREATE TABLE IF NOT EXISTS alumni_registry (id TEXT PRIMARY KEY, name TEXT NOT NULL, year BIGINT, program_id TEXT, program_text TEXT, "
                  "job TEXT, company TEXT, city TEXT, email TEXT, phone TEXT, consent_contact BIGINT NOT NULL DEFAULT 0, consent_publish BIGINT NOT NULL DEFAULT 0, "
                  "status TEXT NOT NULL DEFAULT 'new', note TEXT, story_id TEXT, lang TEXT, ip TEXT, created TEXT NOT NULL, updated TEXT NOT NULL)")
        c.execute("CREATE INDEX IF NOT EXISTS ix_alumni_reg ON alumni_registry(created)")
        c.execute("CREATE TABLE IF NOT EXISTS career_notify (user_id TEXT PRIMARY KEY, last_sent TEXT, muted BIGINT NOT NULL DEFAULT 0)")
    st.add_column("career_notify", "last_pub", "TEXT")  # oxirgi xabarga kirgan eng yangi e'lon vaqti (keyingi xabar — undan keyingilar)
    st.add_column("career_notify", "last_ids", "TEXT")  # o'sha soniyada nashr qilingan va yuborilgan e'lonlar (takrorlanmasin)


def _partner_slugs(st) -> None:
    """Avvalgi versiyadagi hamkorlarda slug yo'q edi — tafsilot sahifasi uchun nomdan yasaladi."""
    from .api.deps import save_item  # noqa: PLC0415

    for it in st.list_items("partner"):
        if not it.get("slug"):
            save_item("partner", {}, it["id"])


_ready_lock = threading.Lock()


def ensure(st) -> None:
    """Jadvallar, hamkorlar slugi va «Karyera markazi» murojaat bo'limi."""
    if getattr(st, "_career_ready", False):
        return
    with _ready_lock:
        if getattr(st, "_career_ready", False):
            return
        ensure_schema(st)
        try:
            if not st.kv_get("coop_partners_v1"):
                _partner_slugs(st)
                st.kv_put("coop_partners_v1", True)
            if not st.kv_get("career_notify_since"):
                st.kv_put("career_notify_since", _now())
        except Exception as e:  # noqa: BLE001 — sayt ishlashda davom etsin
            print(f"career ensure: {e}", file=sys.stderr, flush=True)
        st._career_ready = True  # noqa: SLF001


def desk_category(desk) -> dict:
    """«Karyera markazi» murojaat bo'limi (bo'lmasa yaratiladi; takroriy chaqiruv — o'sha bo'lim)."""
    from . import mail as M  # noqa: PLC0415

    cat = next((c for c in desk.categories() if (c["title"] or "").strip().lower() == DESK_TITLE.lower() or (c["mailbox"] or "").startswith("career@")), None)
    if not cat:
        cat = desk.save_category({"title": DESK_TITLE, "color": "#0a2e73", "mailbox": f"career@{M.config(desk.st)['domain']}", "sort": 80})
    return cat


# ------------------------------------------------------------------ muddati o'tgan imkoniyatlar
_last_sweep = [0.0]


def sweep(st, force: bool = False) -> int:
    """Nashr qilingan, muddati o'tgan imkoniyatlar — «expired» (saytda, qidiruvda, sayt xaritasida ko'rinmaydi)."""
    now = time.monotonic()
    if not force and now - _last_sweep[0] < 30:
        return 0
    _last_sweep[0] = now
    with st._tx() as c:  # noqa: SLF001
        cur = c.execute("UPDATE items SET status='expired', updated=%s WHERE kind='opportunity' AND status IN ('published','scheduled') "
                        "AND COALESCE(data::jsonb->>'deadline', '') <> '' AND data::jsonb->>'deadline' < %s", (_now(), _now()))
    return cur.rowcount or 0


def is_expired(it: dict) -> bool:
    return it.get("status") == "expired" or bool(it.get("deadline") and it["deadline"] < _now())


# ------------------------------------------------------------------ talabalarga xabar (kuniga ko'pi bilan bitta, faqat o'z yo'nalishi)
def student_program(st, user: dict) -> str:
    gid = user.get("group_id")
    if not gid:
        return ""
    return st._one("SELECT program_id FROM groups WHERE id=%s", (gid,)) or ""  # noqa: SLF001


def run_digest(st, now: datetime | None = None) -> int:
    """Yangi nashr qilingan imkoniyatlar (xabar yoqilgan, yo'nalishlar tanlangan) — mos yo'nalish talabalariga bitta jamlangan
    shaxsiy bildirishnoma (kabinet + bog'langan Telegram). Talabaga oxirgi xabardan 20 soat o'tmagan bo'lsa — keyingi safar.
    Qaytaradi: yuborilgan bildirishnomalar soni."""
    ensure(st)
    if not settings(st).get("notify", True):
        return 0
    now = now or datetime.now(timezone.utc)
    now_s = now.isoformat(timespec="seconds")
    floor = st.kv_get("career_notify_since") or now_s
    opps = [x for x in st.list_items("opportunity", public=True)
            if not x.get("silent") and x.get("program_ids") and (x.get("published_at") or "") > floor and not is_expired(x)]
    if not opps:
        return 0
    progs = sorted({p for o in opps for p in o["program_ids"]})
    rows = st._q("SELECT u.id, g.program_id FROM users u JOIN groups g ON g.id=u.group_id WHERE u.role='student' AND u.active=1 AND g.program_id = ANY(%s)",  # noqa: SLF001
                 (progs,))
    if not rows:
        return 0
    state = {r["user_id"]: r for r in st._q("SELECT * FROM career_notify WHERE user_id = ANY(%s)", ([r["id"] for r in rows],))}  # noqa: SLF001
    sent = 0
    for r in rows:
        s = state.get(r["id"])
        if s and s["muted"]:
            continue
        last = (s["last_pub"] if s else None) or floor
        if s and s["last_sent"] and datetime.fromisoformat(s["last_sent"]) > now - NOTIFY_GAP:
            continue
        seen = set(json.loads(s["last_ids"] or "[]")) if s and s["last_ids"] else set()
        new = [o for o in opps if r["program_id"] in o["program_ids"] and ((o.get("published_at") or "") > last
                                                                           or ((o.get("published_at") or "") == last and o["id"] not in seen))]
        if not new:
            continue
        new.sort(key=lambda o: o.get("published_at") or "", reverse=True)
        title = f"Karyera markazi: {len(new)} ta yangi imkoniyat" if len(new) > 1 else f"Karyera markazi: {new[0]['title']}"
        body = "\n".join(f"• {o['title']}" + (f" — {o['company']}" if o.get("company") else "") for o in new[:8])
        if len(new) > 8:
            body += f"\n… +{len(new) - 8}"
        # kind — yuqori paneldagi qo'ng'iroqchada ham chiqadi (kind'siz shaxsiy xabar faqat «Bildirishnomalar» ro'yxatida ko'rinardi)
        st.personal_notice(r["id"], title[:300], body, kind="career", link="/student/career")
        with st._tx() as c:  # noqa: SLF001
            top = max(o.get("published_at") or "" for o in new)
            ids = [o["id"] for o in new if (o.get("published_at") or "") == top] + (list(seen) if top == last else [])
            c.execute("INSERT INTO career_notify(user_id, last_sent, last_pub, last_ids, muted) VALUES(%s,%s,%s,%s,0) "
                      "ON CONFLICT(user_id) DO UPDATE SET last_sent=excluded.last_sent, last_pub=excluded.last_pub, last_ids=excluded.last_ids",
                      (r["id"], now_s, top, json.dumps(ids[:200])))
        sent += 1
    return sent


def set_muted(st, uid: str, muted: bool) -> None:
    ensure(st)
    with st._tx() as c:  # noqa: SLF001
        c.execute("INSERT INTO career_notify(user_id, last_sent, muted) VALUES(%s,NULL,%s) ON CONFLICT(user_id) DO UPDATE SET muted=excluded.muted",
                  (uid, int(bool(muted))))


def is_muted(st, uid: str) -> bool:
    ensure(st)
    return bool(st._one("SELECT muted FROM career_notify WHERE user_id=%s", (uid,)))  # noqa: SLF001


_job: list = [None]


def start(svc_fn) -> None:
    """Fon oqimi: har daqiqada muddati o'tganlarni yopish, har 15 daqiqada talabalarga jamlangan xabar."""
    if _job[0]:
        return
    stop = threading.Event()

    def loop():
        n = 0
        while not stop.wait(60):
            try:
                st = svc_fn().st
                ensure(st)
                sweep(st, force=True)
                if n % 15 == 0:
                    run_digest(st)
            except Exception as e:  # noqa: BLE001
                print(f"career job: {e}", file=sys.stderr, flush=True)
            n += 1

    _job[0] = threading.Thread(target=loop, daemon=True, name="career")
    _job[0].start()


# ------------------------------------------------------------------ xatlar (moderatsiya natijasi — kompaniyaga)
MAIL = {
    "uz": {"ok_s": "E’loningiz nashr qilindi", "ok_t": "«{title}» e’loningiz karyera markazida nashr qilindi.",
           "no_s": "E’loningiz nashr qilinmadi", "no_t": "«{title}» e’loningiz moderatsiyadan o‘tmadi.", "why": "Sabab", "open": "E’lonni ko‘rish"},
    "ru": {"ok_s": "Ваше объявление опубликовано", "ok_t": "Ваше объявление «{title}» опубликовано в центре карьеры.",
           "no_s": "Ваше объявление не опубликовано", "no_t": "Ваше объявление «{title}» не прошло модерацию.", "why": "Причина", "open": "Открыть объявление"},
    "en": {"ok_s": "Your opportunity is published", "ok_t": "Your opportunity “{title}” is now published in the Career Centre.",
           "no_s": "Your opportunity was not published", "no_t": "Your opportunity “{title}” did not pass moderation.", "why": "Reason", "open": "View the listing"},
}


def moderation_mail(svc, it: dict, approved: bool, reason: str = "") -> bool:
    sub = it.get("submitter") or {}
    to = (sub.get("email") or "").strip()
    if not to:
        return False
    lang = sub.get("lang") if sub.get("lang") in C.LANGS else svc.base_lang()
    L = MAIL[lang]
    from .mailer import render  # noqa: PLC0415

    c = svc.mail.base_ctx(lang)
    text = (L["ok_t"] if approved else L["no_t"]).format(title=it["title"])
    if not approved and reason:
        text += f"\n\n{L['why']}: {reason}"
    href = f"{c['url']}/career-center/{it['slug']}" if approved else c["url"] + "/career-center"
    html = render("notice.html", **c, title=L["ok_s"] if approved else L["no_s"], text=text, preheader=text[:120], href=href,
                  button=L["open"] if approved else c["site_name"])
    subject = f"{L['ok_s'] if approved else L['no_s']} — {c['site_name']}"
    threading.Thread(target=svc.mail._deliver, args=("career", to, subject, html), daemon=True).start()  # noqa: SLF001
    return True


# ------------------------------------------------------------------ SEO: meta, JSON-LD, sayt xaritasi, RSS
def _has(st, kind: str) -> bool:
    return bool(st.list_items(kind, public=True))


def _section_meta(svc, meta, sec, lang, base, base_lang, home) -> None:
    abbr = svc.uni_l(lang).get("abbr") or meta["site_name"]
    lab = _l(lang)[sec]
    meta["title"] = seo._fit([f"{lab} — {svc.uni_l(lang).get('name') or meta['site_name']}", f"{lab} — {abbr}"])  # noqa: SLF001
    meta["description"] = DESC.get(lang, DESC["uz"])[sec].format(abbr=abbr)
    meta["ssr"] = {"h1": lab, "text": meta["description"], "links": []}
    meta["jsonld"]["@graph"].append(seo._crumbs(base, [home, (lab, meta["url"])]))  # noqa: SLF001


def _item_url(base, sec, slug, lang, base_lang) -> str:
    return seo._lang_url(base, f"/{sec}/{slug}", lang, base_lang)  # noqa: SLF001


def _programs(svc, lang: str) -> dict[str, dict]:
    return {p["id"]: svc.loc(p, lang) for p in svc.st.list_items("program", public=True)}


def job_posting(svc, it: dict, url: str, lang: str) -> dict | None:
    """Schema.org JobPosting (Google Jobs): faqat ochiq e'lon va joylashuv ma'lum bo'lsa (shahar yoki masofaviy)."""
    if is_expired(it) or not (it.get("city") or it.get("remote")):
        return None
    st = svc.st
    partner = st.get_item(it["partner_id"]) if it.get("partner_id") else None
    company = it.get("company") or (partner or {}).get("title") or ""
    if not company:
        return None
    base = svc.base_url()
    logo = it.get("logo") or (partner or {}).get("logo") or ""
    ld = {"@type": "JobPosting", "title": it["title"], "description": it.get("html") or escape(it.get("summary") or it["title"]),
          "datePosted": (it.get("published_at") or it.get("created") or "")[:10], "validThrough": it.get("deadline"),
          "employmentType": {"internship": "INTERN", "traineeship": "INTERN", "full_time": "FULL_TIME", "part_time": "PART_TIME", "project": "CONTRACTOR"}.get(it.get("type") or "", "OTHER"),
          "hiringOrganization": {"@type": "Organization", "name": company, "sameAs": (partner or {}).get("url") or None, "logo": seo.abs_url(base, logo) or None},
          "url": url, "directApply": False, "inLanguage": lang}
    if it.get("city"):
        ld["jobLocation"] = {"@type": "Place", "address": {"@type": "PostalAddress", "addressLocality": it["city"], "addressCountry": "UZ"}}
    if it.get("remote"):
        ld["jobLocationType"] = "TELECOMMUTE"
        ld["applicantLocationRequirements"] = {"@type": "Country", "name": "Uzbekistan"}
    return ld


def meta_hook(svc, meta: dict, seg: list[str], lang: str, base: str, base_lang: str, home: tuple) -> int | None:
    """seo.page_meta kengaytmasi: /career-center, /partners/<slug>, /alumni, /startups, /articles (+ tafsilot sahifalari)."""
    if not seg or seg[0] not in SECTIONS or (seg[0] == "partners" and len(seg) != 2) or len(seg) > 2:
        return None
    st = svc.st
    ensure(st)
    sec = seg[0]
    kind = SECTIONS[sec]
    site_name = meta["site_name"]
    lab = _l(lang)[sec]
    sec_url = seo._lang_url(base, f"/{sec}", lang, base_lang)  # noqa: SLF001
    if len(seg) == 1:
        _section_meta(svc, meta, sec, lang, base, base_lang, home)
        items = [svc.loc(x, lang) for x in st.list_items(kind, public=True)]
        meta["ssr"]["links"] = [(x["title"], _item_url(base, sec, x["slug"], lang, base_lang)) for x in items[:80] if x.get("slug")]
        if items:
            meta["jsonld"]["@graph"].append({"@type": "ItemList", "name": lab, "numberOfItems": len(items), "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "url": _item_url(base, sec, x["slug"], lang, base_lang), "name": x["title"]} for i, x in enumerate(items[:80])]})
        elif sec in ("startups", "articles"):
            meta["noindex"] = True  # hali kontent yo'q — qidiruvga chiqarilmaydi
        if sec == "articles":
            meta["rss"] = f"{base}/articles/rss.xml" + ("" if lang == base_lang else f"?lang={lang}")
        return 200
    raw = st.get_item_by_slug(kind, seg[1], public=False)
    if kind == "opportunity" and raw and raw.get("status") in ("published", "expired"):
        pass
    elif not raw or raw.get("status") not in ("published", "scheduled") or (raw.get("published_at") and raw["published_at"] > _now()):
        meta.update(title=f"{seo.LABELS.get(lang, seo.LABELS['uz'])['notfound']} — {site_name}", noindex=True, jsonld=None)
        return 404
    it = svc.loc(raw, lang)
    served = it["lang"]
    url = seo._lang_url(base, f"/{sec}/{it['slug']}", served, base_lang)  # noqa: SLF001
    desc = it.get("meta_description") or it.get("summary") or it.get("excerpt") or it.get("quote") or ""
    if not desc and it.get("text"):
        desc = re.sub(r"\s+", " ", it["text"])[:240]
    img_own = it.get("og_image") or it.get("cover") or it.get("photo") or it.get("logo") or ""
    title = it.get("meta_title") or it["title"]
    if kind == "alumni":
        head = ", ".join(x for x in (it.get("position"), it.get("company")) if x)
        title = f"{it['title']}{' — ' + head if head else ''}"
        desc = desc or head
    meta.update(title=f"{title} — {site_name}", description=re.sub(r"\s+", " ", desc or meta["description"])[:300], lang=served, url=url,
                image=seo.abs_url(base, img_own) or meta["image"], image_alt=it["title"], type="article" if kind == "insight" else "website",
                alternates=[(x, seo._lang_url(base, f"/{sec}/{it['slug']}", x, base_lang)) for x in it["langs"]],  # noqa: SLF001
                keywords=seo.keywords(svc, served, [it["title"], *(it.get("tags") or [])]),
                ssr={"h1": it["title"], "text": (it.get("text") or desc or "")[:4000], "links": [(lab, sec_url)]})
    graph = meta["jsonld"]["@graph"]
    graph.append(seo._crumbs(base, [home, (lab, sec_url), (it["title"], url)]))  # noqa: SLF001
    org_ref = {"@id": base + "/#org"}
    ld = None
    if kind == "opportunity":
        if is_expired(raw):
            meta["noindex"] = True
        else:
            ld = job_posting(svc, it, url, served)
    elif kind == "insight":
        meta["published"] = it.get("published_at")
        author = st.get_item(it["author_id"]) if it.get("author_id") else None
        a = {"@type": "Person", "name": author["title"], "url": seo._lang_url(base, f"/staff/{author['slug']}", served, base_lang),  # noqa: SLF001
             "jobTitle": author.get("position") or None} if author and author.get("status") == "published" else (
            {"@type": "Person", "name": it["author_name"]} if it.get("author_name") else org_ref)
        ld = {"@type": "Article", "headline": it["title"], "description": meta["description"], "image": seo.abs_url(base, it.get("cover") or "") or None,
              "datePublished": it.get("published_at"), "dateModified": it.get("updated"), "author": a, "publisher": org_ref, "mainEntityOfPage": url,
              "keywords": ", ".join(it.get("tags") or []) or None, "inLanguage": served, "wordCount": len(re.findall(r"\w+", it.get("text") or "")) or None,
              "citation": [s.get("url") or s.get("title") for s in it.get("sources") or []] or None}
    elif kind == "alumni":
        ld = {"@type": "Person", "name": it["title"], "jobTitle": it.get("position") or None, "image": seo.abs_url(base, it.get("photo") or "") or None,
              "worksFor": {"@type": "Organization", "name": it["company"]} if it.get("company") else None, "alumniOf": org_ref}
    elif kind == "startup":
        ld = {"@type": "CreativeWork", "name": it["title"], "description": meta["description"], "image": seo.abs_url(base, it.get("cover") or "") or None,
              "creator": [{"@type": "Person", "name": m["name"]} for m in it.get("team") or []] or None, "award": it.get("awards") or None,
              "sourceOrganization": org_ref, "url": url}
    elif kind == "partner":
        ld = {"@type": "Organization", "name": it["title"], "url": it.get("url") or None, "logo": seo.abs_url(base, it.get("logo") or "") or None,
              "description": meta["description"], "address": {"@type": "PostalAddress", "addressLocality": it.get("city") or None,
                                                             "addressCountry": it.get("country") or None} if it.get("city") or it.get("country") else None}
        if it.get("lat") is not None and it.get("lng") is not None:
            ld["location"] = {"@type": "Place", "geo": {"@type": "GeoCoordinates", "latitude": it["lat"], "longitude": it["lng"]}}
    if ld:
        graph.append({k: v for k, v in ld.items() if v not in (None, "", [])})
    return 200


def sitemap_hook(svc) -> list[tuple]:
    """(yo'l, o'zgargan, tillar, chastota, ustuvorlik, rasm) — bo'sh bo'limlar (startaplar, maqolalar) kiritilmaydi."""
    st = svc.st
    ensure(st)
    sweep(st)
    base_lang = svc.base_lang()
    base = svc.base_url()
    out = [("/career-center", None, C.LANGS, "daily", "0.6"), ("/alumni", None, C.LANGS, "monthly", "0.5")]
    out = [(p, m, ln, f, pr, "") for p, m, ln, f, pr in out]
    for sec, kind in SECTIONS.items():
        items = [x for x in st.list_items(kind, public=True) if x.get("slug")]
        if sec in ("startups", "articles") and items:
            out.append((f"/{sec}", None, C.LANGS, "weekly", "0.5", ""))
        for it in items:
            img = it.get("cover") or it.get("photo") or it.get("logo") or ""
            out.append((f"/{sec}/{it['slug']}", it.get("updated"), svc.loc(it, base_lang)["langs"], "weekly", "0.5", seo.abs_url(base, img)))
    return out


def articles_rss(svc, lang: str | None = None) -> str:
    base = svc.base_url()
    lang = svc.lang(lang)
    base_lang = svc.base_lang()
    u, s = svc.uni_l(lang), svc.site_l(lang)
    title = f"{_l(lang)['articles']} — {s.get('title') or u.get('abbr') or 'UNI'}"
    rows = sorted(svc.st.list_items("insight", public=True), key=lambda x: x.get("published_at") or "", reverse=True)[:40]
    staff = svc.st.get_items([x.get("author_id") for x in rows])
    items = []
    for raw in rows:
        it = svc.loc(raw, lang)
        link = seo._lang_url(base, f"/articles/{it['slug']}", it["lang"], base_lang)  # noqa: SLF001
        pub = datetime.fromisoformat(it["published_at"]) if it.get("published_at") else datetime.now(timezone.utc)
        body = seo.clean_html(it.get("html") or "") or xesc(it.get("excerpt") or "")
        a = staff.get(it.get("author_id") or "")
        author = (a or {}).get("title") or it.get("author_name") or ""
        cats = "".join(f"<category>{xesc(t)}</category>" for t in [*(it.get("topics") or []), *(it.get("tags") or [])])
        items.append(f"<item><title>{xesc(it['title'])}</title><link>{link}</link><guid isPermaLink=\"true\">{link}</guid>"
                     f"<pubDate>{format_datetime(pub)}</pubDate>{f'<dc:creator>{xesc(author)}</dc:creator>' if author else ''}"
                     f"<description>{xesc(it.get('excerpt') or '')}</description>"
                     f"<content:encoded><![CDATA[{body.replace(']]>', ']]]]><![CDATA[>')}]]></content:encoded>{cats}</item>")
    self_url = seo._lang_url(base, "/articles/rss.xml", lang, base_lang)  # noqa: SLF001
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
            f"<title>{xesc(title)}</title><link>{seo._lang_url(base, '/articles', lang, base_lang)}</link>"  # noqa: SLF001
            f"<description>{xesc(DESC.get(lang, DESC['uz'])['articles'].format(abbr=u.get('abbr') or 'UNI'))}</description>"
            f"<language>{lang}</language><atom:link href=\"{xesc(self_url)}\" rel=\"self\" type=\"application/rss+xml\"/>" + "".join(items) + "</channel></rss>")


def new_id() -> str:
    return secrets.token_hex(6)


def dumps(v) -> str:
    return json.dumps(v, ensure_ascii=False)


# seo.page_meta va seo.sitemap kengaytmalari
if meta_hook not in seo.EXTRA_META:
    seo.EXTRA_META.append(meta_hook)
if sitemap_hook not in seo.EXTRA_SITEMAP:
    seo.EXTRA_SITEMAP.append(sitemap_hook)
