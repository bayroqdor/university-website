"""Kabinet ilovalari API: ichki blog, shaxsiy kalendar, eslatmalar; admin — blog moderatsiyasi.

Blog faqat tizimga kirgan talaba / o'qituvchi / xodimlarga (kabinet sessiyasi) ochiq — saytning ochiq qismida yo'q.
"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Body, Depends, HTTPException

from ..community import Community
from .deps import current_admin, current_user, ok, rate_limit, svc

router = APIRouter()
_inst: tuple[object, Community] | None = None


def comm() -> Community:
    global _inst
    st = svc().st
    if _inst is None or _inst[0] is not st:
        _inst = (st, Community(st))
    return _inst[1]


def _blog_on() -> Community:
    c = comm()
    if not c.blog_settings()["enabled"]:
        raise HTTPException(403, "blog_disabled")
    return c


def _err(e: Exception) -> HTTPException:
    return HTTPException(400, str(e).strip("'"))


# ================================================================== blog (kabinet)
@router.get("/api/portal/blog")
def blog_list(q: str = "", author: str = "", tag: str = "", mine: bool = False, sort: str = "activity", u: dict = Depends(current_user)):
    c = _blog_on()
    items = c.posts(viewer=u["id"], q=q.strip()[:80], author=u["id"] if mine else author[:40], tag=tag.strip().lower()[:40],
                    sort=sort if sort in ("activity", "new", "top") else "activity")
    fs = c.forum_stats(u["id"])
    tags, authors, total = fs["tags"], fs["authors"], fs["stats"]
    return ok({"items": items, "settings": c.blog_settings(), "tags": sorted(tags.items(), key=lambda x: -x[1])[:20], "me": c.author_card(u["id"]),
               "authors": sorted(authors.values(), key=lambda a: -a["posts"])[:30],
               "author": (c.author_card(author[:40]) if author and not mine else None), "stats": total})


@router.get("/api/portal/blog/{pid}")
def blog_get(pid: str, u: dict = Depends(current_user)):
    c = _blog_on()
    p = c.post(pid, u["id"], count_view=True)
    if not p or (p["status"] != "published" and p["author_id"] != u["id"]):
        raise HTTPException(404, "not_found")
    cl = c.comments(pid)
    return ok(p | {"comment_list": cl, "mine": p["author_id"] == u["id"], "settings": c.blog_settings(),
                   "activity": c.activity([p["author_id"], *(x["author_id"] for x in cl)])})


@router.post("/api/portal/blog")
def blog_create(data: dict = Body(...), u: dict = Depends(current_user)):
    c = _blog_on()
    rate_limit(f"blog:{u['id']}", 10, 3600)
    try:
        return ok(c.save_post(u["id"], data))
    except ValueError as e:
        raise _err(e) from e


@router.put("/api/portal/blog/{pid}")
def blog_update(pid: str, data: dict = Body(...), u: dict = Depends(current_user)):
    c = _blog_on()
    cur = c.raw_post(pid)
    if not cur or cur["author_id"] != u["id"]:
        raise HTTPException(404, "not_found")
    try:
        return ok(c.save_post(u["id"], data, pid))
    except ValueError as e:
        raise _err(e) from e


@router.delete("/api/portal/blog/{pid}")
def blog_delete(pid: str, u: dict = Depends(current_user)):
    c = _blog_on()
    cur = c.raw_post(pid)
    if not cur or cur["author_id"] != u["id"]:
        raise HTTPException(404, "not_found")
    c.delete_post(pid)
    return ok({"ok": True})


@router.post("/api/portal/blog/{pid}/like")
def blog_like(pid: str, u: dict = Depends(current_user)):
    c = _blog_on()
    cur = c.raw_post(pid)
    if not cur or cur["status"] != "published":
        raise HTTPException(404, "not_found")
    liked = c.toggle_like(pid, u["id"])
    if liked:
        c.notify_like(cur, u["id"])  # muallifga bildirishnoma (o'ziga emas, har yoqtiruvchidan bitta)
    return ok({"liked": liked, "likes": c.post(pid, u["id"])["likes"]})  # type: ignore[index]


@router.post("/api/portal/blog/{pid}/comments")
def blog_comment(pid: str, data: dict = Body(...), u: dict = Depends(current_user)):
    c = _blog_on()
    p = c.post(pid, u["id"])
    if not p or p["status"] != "published":
        raise HTTPException(404, "not_found")
    if not p["can_comment"]:
        raise HTTPException(403, "comments_closed")
    rate_limit(f"blogc:{u['id']}", 30, 600)
    try:
        quotes = data.get("quote_ids") if isinstance(data.get("quote_ids"), list) else [data.get("quote_id")] if data.get("quote_id") else []
        return ok(c.add_comment(pid, u["id"], str(data.get("body") or ""), quotes))
    except ValueError as e:
        raise _err(e) from e


@router.delete("/api/portal/blog/comments/{cid}")
def blog_comment_delete(cid: str, u: dict = Depends(current_user)):
    """O'z izohini yoki o'z yozuvidagi izohni o'chirish."""
    c = _blog_on()
    cm = c.comment(cid)
    post = c.raw_post(cm["post_id"]) if cm else None
    if not cm or (cm["author_id"] != u["id"] and (not post or post["author_id"] != u["id"])):
        raise HTTPException(404, "not_found")
    c.delete_comment(cid)
    return ok({"ok": True})


# ================================================================== blog (admin moderatsiyasi)
@router.get("/api/admin/blog")
def admin_blog(q: str = "", a: dict = Depends(current_admin)):
    c = comm()
    return ok({"items": c.posts(q=q.strip()[:80], include_hidden=True, limit=500), "settings": c.blog_settings(), "stats": c.blog_stats()})


@router.put("/api/admin/blog/settings")
def admin_blog_settings(data: dict = Body(...), a: dict = Depends(current_admin)):
    return ok(comm().set_blog_settings(data))


@router.get("/api/admin/blog/comments")
def admin_blog_comments(a: dict = Depends(current_admin)):
    return ok({"items": comm().recent_comments(200)})


@router.get("/api/admin/blog/{pid}")
def admin_blog_get(pid: str, a: dict = Depends(current_admin)):
    c = comm()
    p = c.post(pid)
    if not p:
        raise HTTPException(404, "not_found")
    return ok(p | {"comment_list": c.comments(pid, include_hidden=True)})


@router.put("/api/admin/blog/{pid}")
def admin_blog_moderate(pid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    c = comm()
    if not c.raw_post(pid):
        raise HTTPException(404, "not_found")
    c.moderate_post(pid, data)
    return ok(c.post(pid))


@router.delete("/api/admin/blog/{pid}")
def admin_blog_delete(pid: str, a: dict = Depends(current_admin)):
    comm().delete_post(pid)
    return ok({"ok": True})


@router.put("/api/admin/blog/comments/{cid}")
def admin_comment_hide(cid: str, data: dict = Body(...), a: dict = Depends(current_admin)):
    c = comm()
    if not c.comment(cid):
        raise HTTPException(404, "not_found")
    c.set_comment_hidden(cid, bool(data.get("hidden")))
    return ok({"ok": True})


@router.delete("/api/admin/blog/comments/{cid}")
def admin_comment_delete(cid: str, a: dict = Depends(current_admin)):
    comm().delete_comment(cid)
    return ok({"ok": True})


# ================================================================== kalendar
def _range(start: str, end: str) -> tuple[date, date]:
    try:
        a = date.fromisoformat(start[:10])
        b = date.fromisoformat(end[:10])
    except ValueError as e:
        raise HTTPException(400, "invalid_date") from e
    if b < a:
        a, b = b, a
    if (b - a).days > 62:
        b = a + timedelta(days=62)
    return a, b


@router.get("/api/portal/calendar")
def calendar(start: str, end: str, u: dict = Depends(current_user)):
    """Oraliqdagi: o'z hodisalari + dars jadvalidagi darslar + topshiriq muddatlari (talaba / o'qituvchi)."""
    st = svc().st
    a, b = _range(start, end)
    out = {"events": comm().events(u["id"], a.isoformat(), b.isoformat()), "lessons": [], "deadlines": []}
    sem = st.current_semester()
    flt = None
    if u["role"] == "student" and u.get("group_id") and sem and sem.get("published"):
        flt = {"group_id": u["group_id"]}
    elif u["role"] == "teacher" and sem:
        flt = {"teacher_id": u["id"]}
    if flt is not None:
        wk = a - timedelta(days=a.weekday())
        while wk <= b:
            for d in st.week_schedule(sem, wk, **flt)["days"]:
                if a.isoformat() <= d["date"] <= b.isoformat():
                    for l in d["lessons"]:
                        if (l.get("change") or {}).get("kind") == "cancel":
                            continue
                        out["lessons"].append({"date": d["date"], "start": l.get("slot_start") or "", "end": l.get("slot_end") or "", "subject": l.get("subject") or "",
                                               "group": l.get("group_name") or "", "room": l.get("room") or "", "type": l.get("type") or ""})
            wk += timedelta(days=7)
    if u["role"] in ("student", "teacher"):
        asg = st.assignments(group_id=u["group_id"]) if u["role"] == "student" and u.get("group_id") else st.assignments(teacher_id=u["id"]) if u["role"] == "teacher" else []
        for x in asg:
            due = (x.get("due") or "")[:10]
            if due and a.isoformat() <= due <= b.isoformat():
                out["deadlines"].append({"date": due, "title": x.get("title") or "", "subject": x.get("subject") or x.get("subject_name") or "", "id": x["id"]})
    return ok(out)


@router.post("/api/portal/calendar")
def calendar_add(data: dict = Body(...), u: dict = Depends(current_user)):
    try:
        return ok(comm().save_event(u["id"], data))
    except ValueError as e:
        raise _err(e) from e


@router.put("/api/portal/calendar/{eid}")
def calendar_update(eid: str, data: dict = Body(...), u: dict = Depends(current_user)):
    try:
        return ok(comm().save_event(u["id"], data, eid))
    except ValueError as e:
        raise _err(e) from e
    except KeyError as e:
        raise HTTPException(404, "not_found") from e


@router.delete("/api/portal/calendar/{eid}")
def calendar_delete(eid: str, u: dict = Depends(current_user)):
    if not comm().delete_event(u["id"], eid):
        raise HTTPException(404, "not_found")
    return ok({"ok": True})


# ================================================================== eslatmalar
@router.get("/api/portal/notes")
def notes_list(u: dict = Depends(current_user)):
    return ok({"items": comm().notes(u["id"])})


@router.post("/api/portal/notes")
def notes_add(data: dict = Body(...), u: dict = Depends(current_user)):
    try:
        return ok(comm().save_note(u["id"], data))
    except ValueError as e:
        raise _err(e) from e


@router.put("/api/portal/notes/{nid}")
def notes_update(nid: str, data: dict = Body(...), u: dict = Depends(current_user)):
    try:
        return ok(comm().save_note(u["id"], data, nid))
    except ValueError as e:
        raise _err(e) from e
    except KeyError as e:
        raise HTTPException(404, "not_found") from e


@router.delete("/api/portal/notes/{nid}")
def notes_delete(nid: str, u: dict = Depends(current_user)):
    if not comm().delete_note(u["id"], nid):
        raise HTTPException(404, "not_found")
    return ok({"ok": True})
