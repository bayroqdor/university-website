"""Kabinetlar uchun ichki ilovalar: blog (faqat tizimga kirganlar), shaxsiy kalendar va eslatmalar (notes).

* **Blog** — talaba, professor-o'qituvchi va xodimlar yozadi; har bir yozuvda muallifning F.I.Sh., kafedrasi va guruhi
  (talaba) yoki lavozimi (o'qituvchi) ko'rsatiladi. Izohlar: admin hammasini o'chirib qo'yishi (umumiy sozlama),
  bitta yozuvda izohni yopishi (muallif ochib qo'ya olmaydi) yoki istalgan izoh / yozuvni yashirishi mumkin.
  Saytda (ochiq qismda) ko'rinmaydi — API faqat kabinet sessiyasi bilan ishlaydi.
* **Kalendar** — foydalanuvchining o'z hodisalari (band kun, vazifa, uchrashuv, imtihon, shaxsiy); dars jadvalidagi
  darslar va topshiriq muddatlari bilan birga ko'rsatiladi (API qatlamida qo'shiladi).
* **Eslatmalar** — shaxsiy yozuvlar: sarlavha, matn, toifa (rang), mahkamlash.

`Community(st)` — Storage ulanishi va qulfidan foydalanadi (desk.py / library.py kabi).
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import date, datetime, timezone

import nh3

EVENT_KINDS = ("busy", "task", "meeting", "exam", "personal", "free")
NOTE_CATS = ("study", "personal", "important", "other")
POST_STATUS = ("published", "hidden")
DEFAULT_BLOG = {"enabled": True, "comments": True}
# blog matni (HTML zaxira nusxasi — ro'yxat, qidiruv va eski yozuvlar uchun)
TAGS = {"p", "br", "b", "strong", "i", "em", "u", "s", "ul", "ol", "li", "a", "h2", "h3", "h4", "blockquote", "code", "pre", "mark", "sub", "sup",
        "figure", "figcaption", "img", "table", "thead", "tbody", "tr", "th", "td", "hr", "span", "div"}
# admin panelidagi boy matn muharriri (Tiptap) hujjati: faqat shu tugun va belgilar qabul qilinadi
DOC_NODES = {"doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "taskList", "taskItem", "blockquote", "codeBlock",
             "hardBreak", "horizontalRule", "table", "tableRow", "tableHeader", "tableCell", "figure", "gallery", "callout", "chart", "button",
             "youtube", "inlineMath", "blockMath", "image", "docEmbed"}
DOC_MARKS = {"bold", "italic", "underline", "strike", "code", "link", "highlight", "subscript", "superscript", "textStyle"}
URL_ATTRS = {"src", "href", "url"}
SOFT_URL_ATTRS = {"creditUrl", "sourceUrl", "licenseUrl"}  # rasm muallifi / manbasi / litsenziyasi havolalari: xavfli bo'lsa bo'shatiladi
_SAFE_URL = re.compile(r"^(https?://|/(?!/)|mailto:)", re.I)
_YT = re.compile(r"^https?://(www\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)/", re.I)
# forum bildirishnomalari (shaxsiy, qo'ng'iroqchada): saqlanadigan matn — o'zbekcha zaxira; kabinet `kind` + `meta` bo'yicha
# foydalanuvchi tanlagan tilda (uz/ru/en) chiqaradi
NOTIFY_TXT = {"blog_like": "{actor} yozuvingizni yoqtirdi", "blog_comment": "{actor} yozuvingizga javob yozdi",
              "blog_quote": "{actor} xabaringizdan iqtibos keltirib javob yozdi"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _id() -> str:
    return uuid.uuid4().hex[:12]


def _s(v, n: int = 200) -> str:
    return str(v if v is not None else "").strip()[:n]


def _date(v) -> str | None:
    v = _s(v, 20)
    try:
        return date.fromisoformat(v[:10]).isoformat() if v else None
    except ValueError:
        return None


def _time(v) -> str:
    v = _s(v, 5)
    return v if re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v) else ""


def clean_html(html: str) -> str:
    out = nh3.clean(str(html or "")[:60000], tags=TAGS, attributes={"a": {"href"}, "img": {"src", "alt"}, "td": {"colspan", "rowspan"}, "th": {"colspan", "rowspan"}}, url_schemes={"http", "https", "mailto"}, link_rel="noopener noreferrer nofollow")
    return out.strip()


def clean_doc(doc, _depth: int = 0):
    """Muharrir JSON hujjatini tozalash: ruxsat etilmagan tugunlar tashlab yuboriladi, havola/rasm manzillari faqat http(s) yoki sayt ichidagi yo'l."""
    if not isinstance(doc, dict) or _depth > 40:
        return None
    t = doc.get("type")
    if t not in DOC_NODES:
        return None
    out: dict = {"type": t}
    if t == "text":
        out["text"] = str(doc.get("text") or "")[:20000]
        marks = []
        for m in doc.get("marks") or []:
            if isinstance(m, dict) and m.get("type") in DOC_MARKS:
                mm = {"type": m["type"]}
                if isinstance(m.get("attrs"), dict):
                    a = {k: v for k, v in m["attrs"].items() if isinstance(v, (str, int, float, bool)) or v is None}
                    if m["type"] == "link" and not _SAFE_URL.match(str(a.get("href") or "")):
                        continue
                    mm["attrs"] = a
                marks.append(mm)
        if marks:
            out["marks"] = marks
        return out
    if isinstance(doc.get("attrs"), dict):
        attrs = {}
        for k, v in doc["attrs"].items():
            if k in URL_ATTRS and v:
                if not _SAFE_URL.match(str(v)) or (t == "youtube" and not _YT.match(str(v))):
                    return None  # xavfli/yot manzil — tugun tashlanadi
            if k in SOFT_URL_ATTRS and v and not re.match(r"^https?://", str(v), re.I):
                v = ""
            if k == "images" and isinstance(v, list):  # karusel
                v = [x for x in v if isinstance(x, dict) and _SAFE_URL.match(str(x.get("src") or ""))][:30]
            attrs[k] = v
        out["attrs"] = attrs
    kids = [c for c in (clean_doc(x, _depth + 1) for x in (doc.get("content") or [])[:2000]) if c]
    if kids:
        out["content"] = kids
    return out


def doc_text(doc) -> str:
    if not isinstance(doc, dict):
        return ""
    if doc.get("type") == "text":
        return doc.get("text") or ""
    sep = " " if doc.get("type") in ("paragraph", "heading", "listItem", "tableCell", "tableHeader") else ""
    return sep.join(doc_text(c) for c in doc.get("content") or []) + (" " if sep else "")


def text_of(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html or "")).strip()


class Community:
    def __init__(self, st):
        self.st = st
        with st._tx() as c:  # noqa: SLF001
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS blog_posts (id TEXT PRIMARY KEY, author_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
                    excerpt TEXT NOT NULL DEFAULT '', cover TEXT, tags TEXT NOT NULL DEFAULT '[]', comments_enabled BIGINT NOT NULL DEFAULT 1,
                    comments_locked BIGINT NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published', pinned BIGINT NOT NULL DEFAULT 0,
                    views BIGINT NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS ix_blog_created ON blog_posts(status, pinned, created);
                CREATE INDEX IF NOT EXISTS ix_blog_author ON blog_posts(author_id);
                CREATE TABLE IF NOT EXISTS blog_comments (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, author_id TEXT NOT NULL, body TEXT NOT NULL,
                    hidden BIGINT NOT NULL DEFAULT 0, created TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS ix_blogc_post ON blog_comments(post_id, created);
                CREATE INDEX IF NOT EXISTS ix_blogc_author ON blog_comments(author_id);
                CREATE TABLE IF NOT EXISTS blog_likes (post_id TEXT NOT NULL, user_id TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(post_id, user_id));
                CREATE TABLE IF NOT EXISTS cal_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
                    kind TEXT NOT NULL DEFAULT 'task', start TEXT NOT NULL, "end" TEXT NOT NULL, time_from TEXT NOT NULL DEFAULT '', time_to TEXT NOT NULL DEFAULT '',
                    done BIGINT NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS ix_cal_user ON cal_events(user_id, start);
                CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
                    category TEXT NOT NULL DEFAULT 'other', pinned BIGINT NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS ix_notes_user ON notes(user_id, updated);
                """
            )
        st.add_column("blog_posts", "doc", "TEXT")  # muharrir hujjati (JSON)
        st.add_column("blog_comments", "quote_id", "TEXT")  # iqtibos keltirilgan xabar: yozuv id (birinchi xabar) yoki izoh id
        st._ensure_notice_user()  # noqa: SLF001 — bildirishnomalar jadvalidagi kind/ref/link ustunlari

    # ================================================================== blog: sozlamalar
    def blog_settings(self) -> dict:
        v = self.st.kv_get("blog_settings") or {}
        return {**DEFAULT_BLOG, **{k: bool(v[k]) for k in DEFAULT_BLOG if k in v}}

    def set_blog_settings(self, data: dict) -> dict:
        cur = self.blog_settings()
        for k in DEFAULT_BLOG:
            if k in data:
                cur[k] = bool(data[k])
        self.st.kv_put("blog_settings", cur)
        return cur

    # ================================================================== blog: muallif
    def prime_cards(self, uids, cache: dict) -> None:
        """Bir nechta muallif kartochkasi bir yo'la: foydalanuvchilar, guruhlar va fakultetlar — 3 ta so'rov (har biri uchun alohida emas)."""
        need = sorted({u for u in uids if u and u not in cache})
        if not need:
            return
        st = self.st
        users = {r["id"]: st._user(r) for r in st._q("SELECT * FROM users WHERE id = ANY(%s)", (need,))}  # noqa: SLF001
        gids = sorted({u["group_id"] for u in users.values() if u["role"] == "student" and u.get("group_id")})
        groups = {r["id"]: dict(r) for r in st._q("SELECT * FROM groups WHERE id = ANY(%s)", (gids,))} if gids else {}  # noqa: SLF001
        fids = {g.get("faculty_id") for g in groups.values()}
        for u in users.values():
            d = u.get("data") or {}
            fids.update((d.get("faculty_ids") or [])[:1] or [d.get("faculty_id")])
        facs = st.get_items(fids)
        for uid in need:
            cache[uid] = self._card(uid, users.get(uid), groups, facs)

    def _card(self, uid: str, u: dict | None, groups: dict, facs: dict) -> dict:
        if not u:
            out = {"id": uid, "name": "—", "role": "", "photo": "", "faculty": "", "group": "", "position": "", "course": None}
        else:
            d = u.get("data") or {}
            out = {"id": uid, "name": u["name"] or u["login"], "role": u["role"], "photo": d.get("photo") or "", "faculty": "", "group": "", "position": "", "course": None}
            if u["role"] == "student" and u.get("group_id"):
                g = groups.get(u["group_id"])
                if g:
                    out["group"], out["course"] = g["name"], g.get("course")
                    fac = facs.get(g.get("faculty_id") or "")
                    out["faculty"] = fac["title"] if fac else ""
            else:
                out["position"] = _s(d.get("position"), 160)
                fids = d.get("faculty_ids") or ([d["faculty_id"]] if d.get("faculty_id") else [])
                fac = facs.get(fids[0]) if fids else None
                out["faculty"] = fac["title"] if fac else _s(d.get("department"), 200)
        return out

    def author_card(self, uid: str, cache: dict | None = None) -> dict:
        """Muallif: ism, surat, rol va qayerdanligi (talaba — kafedra, guruh, kurs; o'qituvchi/xodim — lavozim, kafedra)."""
        cache = {} if cache is None else cache
        if uid not in cache:
            self.prime_cards([uid], cache)
        return cache[uid]

    # ================================================================== blog: yozuvlar
    def _posts(self, rows, viewer: str | None, cache: dict, full: bool = False) -> list[dict]:
        """Yozuvlar ro'yxati: yoqtirishlar, javoblar soni va so'nggi javob yozganlar barcha yozuvlar uchun bir yo'la (har yozuvga alohida so'rov emas)."""
        rows = [dict(r) for r in rows]
        ids = [r["id"] for r in rows]
        if not ids:
            return []
        st = self.st
        likes = {r["post_id"]: (r["n"], r["mine"]) for r in st._q(  # noqa: SLF001
            "SELECT post_id, COUNT(*) AS n, BOOL_OR(user_id = %s) AS mine FROM blog_likes WHERE post_id = ANY(%s) GROUP BY post_id", (viewer or "", ids))}
        last: dict[str, list] = {}
        counts: dict[str, int] = {}
        # har bir yozuvning so'nggi 40 ta javobi (ishtirokchilar uchun) va jami soni — oyna funksiyalari bilan bitta so'rovda
        for r in st._q("""SELECT post_id, author_id, created, n FROM (
                              SELECT post_id, author_id, created, COUNT(*) OVER w AS n, ROW_NUMBER() OVER (w ORDER BY created DESC) AS rn
                              FROM blog_comments WHERE post_id = ANY(%s) AND hidden=0 WINDOW w AS (PARTITION BY post_id)) x
                          WHERE rn <= 40 ORDER BY post_id, created DESC""", (ids,)):  # noqa: SLF001
            last.setdefault(r["post_id"], []).append(r)
            counts[r["post_id"]] = r["n"]
        self.prime_cards([r["author_id"] for r in rows] + [c["author_id"] for v in last.values() for c in v], cache)
        comments_on = self.blog_settings()["comments"]
        return [self._post(r, cache, likes.get(r["id"], (0, False)), counts.get(r["id"], 0), last.get(r["id"], []), comments_on, full) for r in rows]

    def _post(self, p: dict, cache: dict, like: tuple, n_comments: int, last: list, comments_on: bool, full: bool) -> dict:
        p["tags"] = json.loads(p.get("tags") or "[]")
        p["comments_enabled"], p["comments_locked"], p["pinned"] = bool(p["comments_enabled"]), bool(p["comments_locked"]), bool(p["pinned"])
        p["author"] = self.author_card(p["author_id"], cache)
        p["likes"], p["liked"] = int(like[0] or 0), bool(like[1])
        p["comments"] = int(n_comments)
        p["can_comment"] = comments_on and p["comments_enabled"] and not p["comments_locked"] and p["status"] == "published"
        # forum ro'yxati uchun: oxirgi javob (kim, qachon) va ishtirokchilar (muallif + so'nggi javob yozganlar)
        p["last_at"] = last[0]["created"] if last else p["created"]
        p["last_author"] = self.author_card(last[0]["author_id"], cache) if last else None
        seen, people = {p["author_id"]}, [p["author"]]
        for r2 in last:
            if r2["author_id"] not in seen and len(people) < 5:
                seen.add(r2["author_id"])
                people.append(self.author_card(r2["author_id"], cache))
        p["participants"] = people
        if full:
            try:
                p["doc"] = json.loads(p["doc"]) if p.get("doc") else None
            except ValueError:
                p["doc"] = None
        else:
            p.pop("body", None)
            p.pop("doc", None)
        return p

    def posts(self, viewer: str | None = None, q: str = "", author: str = "", tag: str = "", include_hidden: bool = False, limit: int = 200, sort: str = "") -> list[dict]:
        sql, args = "SELECT * FROM blog_posts WHERE 1=1", []
        if not include_hidden:
            # yashirilgan yozuvni faqat muallifning o'zi ko'radi
            sql += " AND (status='published' OR author_id=%s)"
            args.append(viewer or "")
        if author:
            sql += " AND author_id=%s"
            args.append(author)
        if q:
            sql += " AND (lower(title) LIKE %s OR lower(excerpt) LIKE %s)"
            args += [f"%{q.lower()}%"] * 2
        if tag:
            sql += " AND tags ILIKE %s"
            args.append(f'%"{tag}"%')
        sql += " ORDER BY pinned DESC, created DESC LIMIT %s"
        args.append(limit)
        out = self._posts(self.st._q(sql, tuple(args)), viewer, {})  # noqa: SLF001
        # forum tartibi: mahkamlanganlar tepada; «activity» — oxirgi javob bo'yicha, «top» — yoqtirish + javoblar
        if sort == "activity":
            out.sort(key=lambda p: (p["pinned"], p["last_at"]), reverse=True)
        elif sort == "top":
            out.sort(key=lambda p: (p["pinned"], p["likes"] * 2 + p["comments"], p["views"]), reverse=True)
        return out

    def forum_stats(self, viewer: str | None, limit: int = 500) -> dict:
        """Forum yon paneli: teglar, faol mualliflar, mavzu/javob/ishtirokchi soni — to'liq yozuvlarni yig'masdan (3–5 so'rov)."""
        rows = self.st._q("SELECT id, author_id, tags FROM blog_posts WHERE (status='published' OR author_id=%s) "  # noqa: SLF001
                          "ORDER BY pinned DESC, created DESC LIMIT %s", (viewer or "", limit))
        ids = [r["id"] for r in rows]
        replies = int(self.st._one("SELECT COUNT(*) FROM blog_comments WHERE post_id = ANY(%s) AND hidden=0", (ids,)) or 0) if ids else 0  # noqa: SLF001
        cache: dict = {}
        self.prime_cards([r["author_id"] for r in rows], cache)
        tags: dict[str, int] = {}
        authors: dict[str, dict] = {}
        for r in rows:
            for t in json.loads(r["tags"] or "[]"):
                tags[t] = tags.get(t, 0) + 1
            a = authors.setdefault(r["author_id"], cache[r["author_id"]] | {"posts": 0})
            a["posts"] += 1
        return {"tags": tags, "authors": authors, "stats": {"topics": len(rows), "replies": replies, "members": len(authors)}}

    def activity(self, uids: list[str]) -> dict[str, int]:
        """Har bir foydalanuvchining forumdagi xabarlari soni (mavzular + javoblar) — forumdagi muallif ustuni uchun."""
        ids = list(dict.fromkeys(u for u in uids if u))
        out: dict[str, int] = dict.fromkeys(ids, 0)
        if not ids:
            return out
        for r in self.st._q("""SELECT author_id, COUNT(*) FROM blog_posts WHERE author_id = ANY(%s) AND status='published' GROUP BY author_id
                               UNION ALL
                               SELECT author_id, COUNT(*) FROM blog_comments WHERE author_id = ANY(%s) AND hidden=0 GROUP BY author_id""", (ids, ids)):  # noqa: SLF001
            out[r[0]] += int(r[1])
        return out

    def post(self, pid: str, viewer: str | None = None, count_view: bool = False) -> dict | None:
        rows = self.st._q("SELECT * FROM blog_posts WHERE id=%s", (pid,))  # noqa: SLF001
        if not rows:
            return None
        if count_view:
            with self.st._tx() as c:  # noqa: SLF001
                c.execute("UPDATE blog_posts SET views=views+1 WHERE id=%s", (pid,))
            rows = self.st._q("SELECT * FROM blog_posts WHERE id=%s", (pid,))  # noqa: SLF001
        return self._posts(rows, viewer, {}, full=True)[0]

    def save_post(self, author_id: str, data: dict, pid: str | None = None) -> dict:
        title = _s(data.get("title"), 200)
        body = clean_html(data.get("body") or "")
        doc = clean_doc(data.get("doc")) if data.get("doc") else None
        if doc and doc.get("type") != "doc":
            doc = None
        if not title:
            raise ValueError("empty_title")
        plain = (doc_text(doc) if doc else "") or text_of(body)
        if len(re.sub(r"\s+", " ", plain).strip()) < 2 and not (doc and any(n.get("type") in ("figure", "gallery", "youtube", "chart", "image") for n in doc.get("content") or [])):
            raise ValueError("empty_body")
        tags = [t for t in (re.sub(r"[^\w\-’‘ʼ' ]", "", _s(x, 40)).strip().lower() for x in (data.get("tags") or [])[:8]) if t]
        cover = _s(data.get("cover"), 400)
        if cover and not re.match(r"^(/media/|https?://)", cover):
            cover = ""
        now = _now()
        row = {"title": title, "body": body, "doc": json.dumps(doc, ensure_ascii=False) if doc else None,
               "excerpt": re.sub(r"\s+", " ", plain).strip()[:280], "cover": cover or None, "tags": json.dumps(list(dict.fromkeys(tags)), ensure_ascii=False),
               "comments_enabled": int(bool(data.get("comments_enabled", True))), "updated": now}
        with self.st._tx() as c:  # noqa: SLF001
            if pid:
                c.execute(f"UPDATE blog_posts SET {', '.join(f'{k}=%s' for k in row)} WHERE id=%s", (*row.values(), pid))
            else:
                pid = _id()
                c.execute(
                    "INSERT INTO blog_posts(id, author_id, title, body, doc, excerpt, cover, tags, comments_enabled, created, updated) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (pid, author_id, row["title"], row["body"], row["doc"], row["excerpt"], row["cover"], row["tags"], row["comments_enabled"], now, now),
                )
        return self.post(pid, author_id)  # type: ignore[return-value]

    def raw_post(self, pid: str) -> dict | None:
        rows = self.st._q("SELECT * FROM blog_posts WHERE id=%s", (pid,))  # noqa: SLF001
        return dict(rows[0]) if rows else None

    def moderate_post(self, pid: str, data: dict) -> None:
        """Admin: yashirish/ko'rsatish, mahkamlash, izohlarni yopish (muallif ochib qo'ya olmaydi)."""
        sets, args = [], []
        if "status" in data and data["status"] in POST_STATUS:
            sets.append("status=%s")
            args.append(data["status"])
        for k in ("pinned", "comments_locked"):
            if k in data:
                sets.append(f"{k}=%s")
                args.append(int(bool(data[k])))
        if sets:
            with self.st._tx() as c:  # noqa: SLF001
                c.execute(f"UPDATE blog_posts SET {', '.join(sets)} WHERE id=%s", (*args, pid))

    def delete_post(self, pid: str) -> None:
        with self.st._tx() as c:  # noqa: SLF001
            c.execute("DELETE FROM blog_comments WHERE post_id=%s", (pid,))
            c.execute("DELETE FROM blog_likes WHERE post_id=%s", (pid,))
            c.execute("DELETE FROM blog_posts WHERE id=%s", (pid,))
            c.execute("DELETE FROM notices WHERE audience='user' AND kind LIKE 'blog\\_%%' AND ref=%s", (pid,))

    def toggle_like(self, pid: str, uid: str) -> bool:
        with self.st._tx() as c:  # noqa: SLF001
            if c.execute("SELECT 1 FROM blog_likes WHERE post_id=%s AND user_id=%s", (pid, uid)).fetchone():
                c.execute("DELETE FROM blog_likes WHERE post_id=%s AND user_id=%s", (pid, uid))
                return False
            c.execute("INSERT INTO blog_likes VALUES(%s,%s,%s)", (pid, uid, _now()))
            return True

    # ================================================================== blog: bildirishnomalar
    def _notify(self, uid: str | None, kind: str, actor_id: str, post: dict, cid: str | None = None, snippet: str = "") -> bool:
        """Bitta foydalanuvchiga forum bildirishnomasi (o'ziga emas). Havola — rolga bog'liq bo'lmagan /forum/<id> (+ izoh langari)."""
        if not uid or uid == actor_id:
            return False
        actor = self.author_card(actor_id)["name"]
        title = _s(post.get("title"), 160)
        link = f"/forum/{post['id']}" + (f"#c-{cid}" if cid else "")
        self.st.personal_notice(uid, f"{NOTIFY_TXT[kind].format(actor=actor)}: «{title}»", snippet, actor_id, kind=kind, ref=post["id"], link=link,
                                meta={"actor": actor, "post": title, "cid": cid})
        return True

    def notify_like(self, post: dict, uid: str) -> bool:
        """Yoqtirish — muallifga bitta marta (yoqtirish → bekor qilish → yana yoqtirish qayta yubormaydi)."""
        if post["author_id"] == uid or self.st._one(  # noqa: SLF001
                "SELECT 1 FROM notices WHERE audience='user' AND user_id=%s AND kind='blog_like' AND author_id=%s AND ref=%s",
                (post["author_id"], uid, post["id"])):
            return False
        return self._notify(post["author_id"], "blog_like", uid, post)

    @staticmethod
    def _own_text(body: str) -> str:
        """Javobning o'z matni («> » iqtibos qatorlarisiz) — bildirishnomadagi qisqa ko'rinish uchun."""
        return re.sub(r"\s+", " ", " ".join(l for l in (body or "").split("\n") if not l.startswith(">"))).strip()[:200]

    # ================================================================== blog: izohlar
    def comments(self, pid: str, include_hidden: bool = False) -> list[dict]:
        sql = "SELECT * FROM blog_comments WHERE post_id=%s" + ("" if include_hidden else " AND hidden=0") + " ORDER BY created"
        cache: dict = {}
        out = []
        for r in self.st._q(sql, (pid,)):  # noqa: SLF001
            c = dict(r)
            c["hidden"] = bool(c["hidden"])
            c["author"] = self.author_card(c["author_id"], cache)
            out.append(c)
        return out

    def add_comment(self, pid: str, uid: str, body: str, quote_ids: list | None = None) -> dict:
        """Javob. `quote_ids` — iqtibos keltirilgan xabarlar (yozuvning o'zi — `pid`, yoki shu mavzudagi izoh id). Matnda iqtibos
        («> » qatori) qolmagan bo'lsa, iqtibos hisoblanmaydi. Bildirishnomalar: mavzu muallifiga — «javob yozdi», iqtibos keltirilgan
        xabar egasiga — «iqtibos keltirdi» (bir kishiga bitta; iqtibos ustun)."""
        body = _s(body, 3000)
        if len(body) < 1:
            raise ValueError("empty_comment")
        post = self.raw_post(pid) or {"id": pid, "author_id": "", "title": ""}
        quoted: list[tuple[str, str]] = []  # (xabar id, egasi)
        if quote_ids and any(l.startswith(">") for l in body.split("\n")):
            for q in list(dict.fromkeys(_s(x, 40) for x in quote_ids if x))[:5]:
                if q == pid:
                    quoted.append((q, post["author_id"]))
                else:
                    r = self.st._q("SELECT author_id FROM blog_comments WHERE id=%s AND post_id=%s AND hidden=0", (q, pid))  # noqa: SLF001
                    if r:
                        quoted.append((q, r[0]["author_id"]))
        quote_id = quoted[0][0] if quoted else None
        cid, now = _id(), _now()
        with self.st._tx() as c:  # noqa: SLF001
            c.execute("INSERT INTO blog_comments(id, post_id, author_id, body, created, quote_id) VALUES(%s,%s,%s,%s,%s,%s)", (cid, pid, uid, body, now, quote_id))
        snippet, sent = self._own_text(body), {uid}
        for _q, owner in quoted:
            if owner not in sent and self._notify(owner, "blog_quote", uid, post, cid, snippet):
                sent.add(owner)
        if post["author_id"] not in sent:
            self._notify(post["author_id"], "blog_comment", uid, post, cid, snippet)
        return {"id": cid, "post_id": pid, "author_id": uid, "body": body, "hidden": False, "created": now, "quote_id": quote_id, "author": self.author_card(uid)}

    def comment(self, cid: str) -> dict | None:
        rows = self.st._q("SELECT * FROM blog_comments WHERE id=%s", (cid,))  # noqa: SLF001
        return dict(rows[0]) if rows else None

    def set_comment_hidden(self, cid: str, hidden: bool) -> None:
        with self.st._tx() as c:  # noqa: SLF001
            c.execute("UPDATE blog_comments SET hidden=%s WHERE id=%s", (int(hidden), cid))

    def delete_comment(self, cid: str) -> None:
        with self.st._tx() as c:  # noqa: SLF001
            c.execute("DELETE FROM blog_comments WHERE id=%s", (cid,))

    def recent_comments(self, limit: int = 100) -> list[dict]:
        cache: dict = {}
        out = []
        for r in self.st._q(  # noqa: SLF001
            "SELECT c.*, p.title AS post_title FROM blog_comments c LEFT JOIN blog_posts p ON p.id=c.post_id ORDER BY c.created DESC LIMIT %s", (limit,)
        ):
            c = dict(r)
            c["hidden"] = bool(c["hidden"])
            c["author"] = self.author_card(c["author_id"], cache)
            out.append(c)
        return out

    def blog_stats(self) -> dict:
        q = self.st._one  # noqa: SLF001
        return {"posts": q("SELECT COUNT(*) FROM blog_posts") or 0, "hidden": q("SELECT COUNT(*) FROM blog_posts WHERE status='hidden'") or 0,
                "comments": q("SELECT COUNT(*) FROM blog_comments") or 0, "authors": q("SELECT COUNT(DISTINCT author_id) FROM blog_posts") or 0}

    def user_deleted(self, uid: str) -> None:
        with self.st._tx() as c:  # noqa: SLF001
            for t in ("cal_events", "notes", "blog_likes"):
                c.execute(f"DELETE FROM {t} WHERE user_id=%s", (uid,))

    # ================================================================== kalendar
    @staticmethod
    def _event(r) -> dict:
        e = dict(r)
        e["done"] = bool(e["done"])
        return e

    def events(self, uid: str, start: str, end: str) -> list[dict]:
        rows = self.st._q('SELECT * FROM cal_events WHERE user_id=%s AND start<=%s AND "end">=%s ORDER BY start, time_from', (uid, end, start))  # noqa: SLF001
        return [self._event(r) for r in rows]

    def save_event(self, uid: str, data: dict, eid: str | None = None) -> dict:
        title = _s(data.get("title"), 200)
        start = _date(data.get("start"))
        end = _date(data.get("end")) or start
        if not title:
            raise ValueError("empty_title")
        if not start:
            raise ValueError("invalid_date")
        if end < start:
            start, end = end, start
        kind = data.get("kind") if data.get("kind") in EVENT_KINDS else "task"
        tf, tt = _time(data.get("time_from")), _time(data.get("time_to"))
        if tf and tt and tt < tf:
            tf, tt = tt, tf
        row = {"title": title, "note": _s(data.get("note"), 2000), "kind": kind, "start": start, "end": end, "time_from": tf, "time_to": tt,
               "done": int(bool(data.get("done"))), "updated": _now()}
        with self.st._tx() as c:  # noqa: SLF001
            if eid:
                sets = ", ".join(f'"{k}"=%s' for k in row)
                n = c.execute(f"UPDATE cal_events SET {sets} WHERE id=%s AND user_id=%s", (*row.values(), eid, uid)).rowcount
                if not n:
                    raise KeyError("not_found")
            else:
                eid = _id()
                c.execute("INSERT INTO cal_events(id, user_id, created, " + ", ".join(f'"{k}"' for k in row) + ") VALUES(%s,%s,%s," + ",".join(["%s"] * len(row)) + ")",
                          (eid, uid, row["updated"], *row.values()))
        return self._event(self.st._q("SELECT * FROM cal_events WHERE id=%s", (eid,))[0])  # noqa: SLF001

    def delete_event(self, uid: str, eid: str) -> bool:
        with self.st._tx() as c:  # noqa: SLF001
            return c.execute("DELETE FROM cal_events WHERE id=%s AND user_id=%s", (eid, uid)).rowcount > 0

    # ================================================================== eslatmalar
    @staticmethod
    def _note(r) -> dict:
        n = dict(r)
        n["pinned"] = bool(n["pinned"])
        return n

    def notes(self, uid: str) -> list[dict]:
        return [self._note(r) for r in self.st._q("SELECT * FROM notes WHERE user_id=%s ORDER BY pinned DESC, updated DESC", (uid,))]  # noqa: SLF001

    def save_note(self, uid: str, data: dict, nid: str | None = None) -> dict:
        title, body = _s(data.get("title"), 200), _s(data.get("body"), 20000)
        if not title and not body:
            raise ValueError("empty_note")
        cat = data.get("category") if data.get("category") in NOTE_CATS else "other"
        row = {"title": title, "body": body, "category": cat, "pinned": int(bool(data.get("pinned"))), "updated": _now()}
        with self.st._tx() as c:  # noqa: SLF001
            if nid:
                n = c.execute(f"UPDATE notes SET {', '.join(f'{k}=%s' for k in row)} WHERE id=%s AND user_id=%s", (*row.values(), nid, uid)).rowcount
                if not n:
                    raise KeyError("not_found")
            else:
                nid = _id()
                c.execute("INSERT INTO notes(id, user_id, created, title, body, category, pinned, updated) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
                          (nid, uid, row["updated"], *row.values()))
        return self._note(self.st._q("SELECT * FROM notes WHERE id=%s", (nid,))[0])  # noqa: SLF001

    def delete_note(self, uid: str, nid: str) -> bool:
        with self.st._tx() as c:  # noqa: SLF001
            return c.execute("DELETE FROM notes WHERE id=%s AND user_id=%s", (nid, uid)).rowcount > 0
