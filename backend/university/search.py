"""Admin panel va kabinetlardagi umumiy qidiruv (yuqori o'ng burchakdagi qidiruv maydoni).

Menyu bandlari frontendda qidiriladi; bu yerda — kontent: sayt materiallari, foydalanuvchilar,
murojaatlar (admin) va o'quv materiallari, topshiriqlar, testlar, bildirishnomalar (kabinet).
Har bir natija: {"type", "title", "sub", "to", "external"?}. Faqat ruxsat etilgan narsalar qaytadi.
"""
from __future__ import annotations

import json
import re

from . import content as C

# kontent turi → (admin ruxsati, admin yo'li, saytdagi yo'li)
ADMIN_KINDS = {
    "news": ("news", "/admin/news/{id}", "/news/{slug}"),
    "announce": ("announcements", "/admin/announcements/{id}", "/announcements/{slug}"),
    "event": ("events", "/admin/events/{id}", "/events/{slug}"),
    "page": ("pages", "/admin/pages/{id}", "/about/{slug}"),
    "program": ("programs", "/admin/programs/{id}", "/programs/{slug}"),
    "faculty": ("faculties", "/admin/faculties/{id}", "/faculties/{slug}"),
    "department": ("structure", "/admin/structure/{id}", "/structure/{slug}"),
    "staff": ("professors", "/admin/professors?q={q_title}", "/staff/{slug}"),
    "vacancy": ("careers", "/admin/careers/{id}", "/careers/{slug}"),
    "partner": ("partners", "/admin/partners?id={id}", "/partners/{slug}"),
    "document": ("documents", "/admin/documents", "/documents"),
    "link": ("links", "/admin/links", "/links"),
    "faq": ("faq", "/admin/faq", "/faq"),
    # rasmiy bo'limlar (official.py)
    "reception": ("reception", "/admin/reception", "/reception"),
    "dataset": ("opendata", "/admin/open-data", "/open-data#ds-{id}"),
    "ranking": ("rankings", "/admin/rankings", "/rankings"),
    "milestone": ("history", "/admin/history", "/history#y-{id}"),
    "mention": ("mentions", "/admin/media-mentions", "/media-mentions"),
}
# kabinetda ko'rsatiladigan ochiq sayt materiallari
PUBLIC_KINDS = ("news", "announce", "event", "page", "program", "faculty", "department", "staff", "vacancy", "faq")
# hamkorlik va karyera (career.py)
ADMIN_KINDS.update({
    "opportunity": ("career_center", "/admin/career-center?id={id}", "/career-center/{slug}"),
    "alumni": ("alumni", "/admin/alumni?id={id}", "/alumni/{slug}"),
    "startup": ("startups", "/admin/startups?id={id}", "/startups/{slug}"),
    "insight": ("articles", "/admin/articles?id={id}", "/articles/{slug}"),
})
PUBLIC_KINDS += ("opportunity", "insight")

_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
_APOS = re.compile(r"[ʻʼ'`‘’]")


def norm(s: str) -> str:
    return _WS.sub(" ", _APOS.sub("'", str(s or ""))).strip().casefold()


_NORM: dict[tuple, tuple[str, str]] = {}  # (id, o'zgargan vaqti) → normallashgan (sarlavha, matn): har qidiruvda qayta hisoblanmaydi


def _normed(it: dict, title: str, body: str) -> tuple[str, str]:
    key = (it.get("id"), it.get("updated"), len(body))
    v = _NORM.get(key)
    if v is None:
        if len(_NORM) > 20000:
            _NORM.clear()
        v = _NORM[key] = (norm(title), norm(body))
    return v


def _score(q: str, title: str, body: str, normed: tuple[str, str] | None = None) -> int:
    """0 — mos emas; katta son — yaxshiroq (sarlavha boshida > sarlavhada > matnda)."""
    t = normed[0] if normed else norm(title)
    words = [w for w in q.split(" ") if w]
    if not words:
        return 0
    if t.startswith(q):
        return 100
    if q in t:
        return 80
    if all(w in t for w in words):
        return 60
    # matnda — faqat so'z boshidan («нов» → «новости», lekin «основан» emas)
    b = normed[1] if normed else norm(body)
    starts = lambda w, txt: re.search(r"(?<!\w)" + re.escape(w), txt) is not None  # noqa: E731
    if all(starts(w, t) or starts(w, b) for w in words):
        return 30 if any(w in t for w in words) else 15
    return 0


def _item_text(it: dict) -> tuple[str, str, str]:
    """(sarlavha, qo'shimcha, qidiriladigan matn) — barcha tillardagi sarlavha va qisqa matnlar bilan."""
    title = it.get("title") or it.get("name") or ""
    sub = it.get("summary") or it.get("excerpt") or it.get("position") or it.get("place") or it.get("outlet") or it.get("description") or ""
    parts = [title, sub, it.get("answer") or "", it.get("position") or "", it.get("department") or "", it.get("code") or "", it.get("url") or "",
             it.get("outlet") or "", it.get("body") or "", it.get("description") or ""]
    for tr in (it.get("i18n") or {}).values():
        if isinstance(tr, dict):
            parts += [str(tr.get(k) or "") for k in ("title", "summary", "excerpt", "answer", "position", "name")]
    html = it.get("html") or ""
    if html:
        parts.append(_TAG.sub(" ", html)[:4000])
    return title, _TAG.sub(" ", str(sub))[:140], " ".join(parts)


def _content(st, q: str, kinds, public: bool, lang: str, base: str) -> list[tuple[int, dict]]:
    out = []
    by_kind = st.list_items_of(kinds, public=public)
    for kind in kinds:
        for it in by_kind[kind]:
            title, sub, body = _item_text(it)
            sc = _score(q, title, body, _normed(it, title, body) if it.get("id") else None)
            if not sc:
                continue
            if public and lang != base:
                loc = C.localize(it, lang, base, ("title", "summary", "excerpt"), meta=False)
                title = loc.get("title") or title
                sub = _TAG.sub(" ", str(loc.get("summary") or loc.get("excerpt") or sub))[:140]
            out.append((sc, {"kind": kind, "id": it["id"], "slug": it.get("slug") or "", "title": title, "sub": sub, "status": it.get("status")}))
    return out


def _fmt(tpl: str, x: dict) -> str:
    return tpl.format(id=x["id"], slug=x.get("slug") or "", q_title=re.sub(r"\s+", "+", x["title"][:60]))


def admin_search(svc, admin: dict, q: str, perms: set[str], desk=None, limit: int = 30) -> list[dict]:
    q = norm(q)
    if len(q) < 2:
        return []
    st = svc.st
    full = "*" in perms
    has = lambda p: full or p in perms  # noqa: E731
    found: list[tuple[int, dict]] = []
    kinds = [k for k, (perm, _a, _p) in ADMIN_KINDS.items() if has(perm)]
    for sc, x in _content(st, q, kinds, public=False, lang="uz", base="uz"):
        perm, apath, _p = ADMIN_KINDS[x["kind"]]
        found.append((sc, {"type": x["kind"], "title": x["title"], "sub": x["sub"], "to": _fmt(apath, x), "status": x["status"]}))
    if has("users") or has("professors"):
        for u in st.list_users(q=""):
            if u.get("role") == "admin":
                continue
            d = u.get("data") or {}
            sc = _score(q, u.get("name") or "", " ".join([u.get("login") or "", u.get("email") or "", d.get("position") or "", d.get("student_no") or "", d.get("phone") or ""]))
            if sc:
                found.append((sc - 5, {"type": "user", "title": u.get("name") or u.get("login"), "sub": f"@{u.get('login')} · {u.get('role')}",
                                       "to": "/admin/users?q=" + re.sub(r"\s+", "+", u.get("login") or ""), "photo": d.get("photo") or ""}))
    if has("messages") and desk is not None:
        for t in desk.list(q=q, limit=40):
            found.append((50, {"type": "ticket", "title": t.get("title") or "", "sub": f"#{t.get('number')} · {t.get('requester_name') or t.get('requester_email') or ''}",
                               "to": f"/admin/desk?t={t.get('id')}"}))
    if has("subscribers"):
        for s in st._q("SELECT email, name FROM subscribers WHERE lower(email) LIKE %s LIMIT 10", (f"%{q}%",)):
            found.append((20, {"type": "subscriber", "title": s["email"], "sub": s["name"] or "", "to": "/admin/subscribers?q=" + s["email"]}))
    found.sort(key=lambda p: -p[0])
    return [x for _s, x in found[:limit]]


def portal_search(svc, user: dict, q: str, lang: str, limit: int = 30) -> list[dict]:
    q = norm(q)
    if len(q) < 2:
        return []
    st = svc.st
    role = user["role"]
    base = "/student" if role == "student" else "/xodim" if role == "staff" else "/teacher"
    found: list[tuple[int, dict]] = []

    def add(sc: int, typ: str, title: str, sub: str, to: str, external: bool = False) -> None:
        found.append((sc, {"type": typ, "title": title, "sub": sub, "to": to} | ({"external": True} if external else {})))

    def scan(rows: list[dict], typ: str, to: str, fields=("title", "description", "subject", "group_name", "teacher")) -> None:
        for r in rows:
            title = r.get("title") or r.get("name") or ""
            sc = _score(q, title, " ".join(str(r.get(f) or "") for f in fields))
            if sc:
                add(sc + 5, typ, title, " · ".join(str(r.get(f)) for f in ("subject", "group_name") if r.get(f)), to)

    try:
        if role == "student" and user.get("group_id"):
            scan(st.assignments(group_id=user["group_id"]), "assignment", f"{base}/assignments")
            scan(st.materials(group_id=user["group_id"]), "material", f"{base}/materials")
        elif role == "teacher":
            scan(st.assignments(teacher_id=user["id"]), "assignment", f"{base}/assignments")
            scan(st.materials(teacher_id=user["id"]), "material", f"{base}/materials")
            sem = st.current_semester()
            for c in st.teacher_courses(user["id"], sem["id"]) if sem else []:
                title = f"{c.get('group_name') or c.get('group') or ''} · {c.get('subject_name') or c.get('subject') or ''}".strip(" ·")
                if _score(q, title, title):
                    add(55, "course", title, "", f"{base}/courses")
        notes = st.notices_for(role if role != "staff" else "teacher", group_id=user.get("group_id"), user_id=user["id"], limit=200, personal_kinds=False)
        for n in notes:
            sc = _score(q, n.get("title") or "", n.get("body") or "")
            if sc:
                add(sc, "notice", n.get("title") or "", (n.get("author") or ""), f"{base}/notices")
    except Exception:  # noqa: BLE001 — o'quv jadvallari bo'lmasa ham qidiruv ishlasin
        pass
    if role in ("student", "teacher"):
        from .interactive import Store  # noqa: PLC0415

        try:
            iq = Store(st)
            if role == "teacher":
                for t in iq.tests(user["id"]):
                    sc = _score(q, t.get("title") or "", json.dumps(t.get("settings") or {}, ensure_ascii=False))
                    if sc:
                        game = (t.get("settings") or {}).get("kind") == "game"
                        add(sc + 5, "game" if game else "test", t.get("title") or "", (t.get("settings") or {}).get("subject") or "", f"{base}/interactive/{t['id']}")
            else:
                seen = set()
                for a in iq.attempts(user_id=user["id"]):
                    t = iq.test(a["test_id"])
                    if not t or t["id"] in seen:
                        continue
                    seen.add(t["id"])
                    sc = _score(q, t.get("title") or "", (t.get("settings") or {}).get("subject") or "")
                    if sc:
                        add(sc + 5, "test", t.get("title") or "", (t.get("settings") or {}).get("subject") or "", f"{base}/tests")
        except Exception:  # noqa: BLE001
            pass
    sbase = svc.base_lang()
    for sc, x in _content(st, q, PUBLIC_KINDS, public=True, lang=lang, base=sbase):
        _perm, _a, ppath = ADMIN_KINDS[x["kind"]]
        add(sc - 10, x["kind"], x["title"], x["sub"], _fmt(ppath, x), external=True)
    found.sort(key=lambda p: -p[0])
    return [x for _s, x in found[:limit]]


# ochiq saytdagi qidiruv: yangiliklar, e'lonlar, sahifalar, yo'nalishlar, kafedralar, tuzilma, xodimlar, vakansiyalar, hamkorlar,
# hujjatlar, foydali havolalar, savol-javob (menyu bandlari va bo'limlar frontendda qo'shiladi)
SITE_KINDS = ("program", "page", "news", "announce", "event", "faculty", "department", "staff", "vacancy", "partner", "document", "link", "faq",
              "reception", "dataset", "ranking", "milestone", "mention")
KIND_WEIGHT = {"program": 8, "page": 8, "faculty": 6, "department": 5, "staff": 4, "news": 2, "announce": 2, "event": 2}
SITE_KINDS += ("opportunity", "alumni", "startup", "insight")  # hamkorlik va karyera
# talabalar hayoti va galereya (campus_schema.py): klublar, albomlar, stipendiyalar, yotoqxona binolari
from .campus_schema import SEARCH_KINDS as _CAMPUS_SEARCH, SITE_SEARCH as _CAMPUS_SITE  # noqa: E402

ADMIN_KINDS.update(_CAMPUS_SEARCH)
SITE_KINDS += _CAMPUS_SITE


def site_search(svc, q: str, lang: str, limit: int = 40) -> list[dict]:
    q = norm(q)
    if len(q) < 2:
        return []
    found: list[tuple[int, dict]] = []
    for sc, x in _content(svc.st, q, SITE_KINDS, public=True, lang=lang, base=svc.base_lang()):
        _perm, _a, ppath = ADMIN_KINDS[x["kind"]]
        found.append((sc + KIND_WEIGHT.get(x["kind"], 0), {"type": x["kind"], "title": x["title"], "sub": x["sub"], "to": _fmt(ppath, x)}))
    from .journal import search_hits  # noqa: PLC0415 — ilmiy jurnal maqolalari (type: "article")

    found += search_hits(svc, q, lang)
    found.sort(key=lambda p: -p[0])
    return [x for _s, x in found[:limit]]
