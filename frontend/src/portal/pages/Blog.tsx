// Ichki forum: mavzular jadvali (javoblar, ko'rishlar, oxirgi faollik), mavzu sahifasi (chapda muallif ustuni, o'ngda xabar, iqtibos bilan javob) va yozish oynasi.
// Muallifning ismi, kafedrasi va guruhi (talaba) yoki lavozimi (o'qituvchi) har bir yozuv va izohda ko'rsatiladi.
import { ArrowLeft, Eye, Heart, ImagePlus, Lock, MessageCircle, MessagesSquare, Pencil, Pin, Plus, Quote, Search, Send, Share2, Trash2, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Avatar } from "../../lib/Avatar";
import { Btn, Empty, Field, Input, PageHead, Spinner, Toggle, useConfirm, useRun, useToast } from "../../admin/ui";
import { ADICTS, type AppsDict } from "../apps-i18n";
import { blog, portal, type BlogAuthor, type BlogDraft, type BlogPostFull, type Notice } from "../api";
import type { Lang } from "../../lib/api";
import { usePortal } from "../PortalApp";

// admin panelidagi boy matn muharriri va uni ko'rsatuvchi (og'ir — faqat kerak bo'lganda yuklanadi)
const RichEditor = lazy(() => import("../../editor/RichEditor").then((m) => ({ default: m.RichEditor })));
const RichHtml = lazy(() => import("../../rich/RichHtml").then((m) => ({ default: m.RichHtml })));

export function useApps(): AppsDict {
  const { lang } = usePortal();
  return ADICTS[lang] || ADICTS.uz;
}

export function fmtDay(iso: string, lang: string, time = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const loc = lang === "ru" ? "ru-RU" : "en-GB";
  // o'zbekcha oy nomlari brauzerlarda bir xil chiqmaydi — o'zimiz yozamiz: «4-oktabr, 2026»
  const s = lang === "uz" ? `${d.getDate()}-${ADICTS.uz.months[d.getMonth()].toLowerCase()}, ${d.getFullYear()}` : d.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return time ? `${s}, ${hm}` : s;
}

/** Muallif kimligi: «Talaba · OT-25-1 · 2-kurs · Kafedra» yoki «Lavozim · Kafedra» */
export function authorLine(a: BlogAuthor, t: AppsDict): string {
  if (a.role === "student") return [a.group && `${t.group} ${a.group}`, a.course ? `${a.course}-${t.course_n}` : "", a.faculty].filter(Boolean).join(" · ");
  return [a.position || (a.role === "teacher" ? t.teacher : t.staff), a.faculty].filter(Boolean).join(" · ");
}

function RoleBadge({ a, t }: { a: BlogAuthor; t: AppsDict }) {
  return <span className={`bl-role ${a.role}`}>{a.role === "student" ? t.student : a.role === "teacher" ? t.teacher : t.staff}</span>;
}

// ------------------------------------------------------------------ ro'yxat
/** Muallif nomi — bosilsa muallifning barcha yozuvlari (karta ichida: havola ichida havola bo'lmasligi uchun tugma) */
function AuthorLink({ a, children, className = "" }: { a: BlogAuthor; children: React.ReactNode; className?: string }) {
  const nav = useNavigate();
  const { base } = useBlogBase();
  return (
    <span
      role="link"
      tabIndex={0}
      className={`bl-author-link ${className}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        nav(`${base}/author/${a.id}`);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          nav(`${base}/author/${a.id}`);
        }
      }}
    >
      {children}
    </span>
  );
}

/** Blog ildiz yo'li (/student/blog, /teacher/blog…) */
function useBlogBase() {
  const { pathname } = useLocation();
  const i = pathname.indexOf("/blog");
  return { base: i >= 0 ? pathname.slice(0, i + 5) : "blog" };
}

/** «5 daq. oldin» / «3 soat oldin» / «2 kun oldin», bir haftadan keyin — sana */
export function ago(iso: string, lang: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const m = Math.max(0, Math.round((Date.now() - d) / 60000));
  const U = lang === "ru" ? ["только что", "мин", "ч", "дн", "назад"] : lang === "en" ? ["just now", "m", "h", "d", "ago"] : ["hozirgina", "daq.", "soat", "kun", "oldin"];
  if (m < 1) return U[0];
  if (m < 60) return `${m} ${U[1]} ${U[4]}`;
  if (m < 60 * 24) return `${Math.round(m / 60)} ${U[2]} ${U[4]}`;
  if (m < 60 * 24 * 7) return `${Math.round(m / 1440)} ${U[3]} ${U[4]}`;
  return fmtDay(iso, lang);
}

/** Ishtirokchilar — bir-birining ustiga tushgan kichik avatarlar (forum ro'yxatidagi kabi) */
function People({ list, size = 26 }: { list: BlogAuthor[]; size?: number }) {
  return (
    <span className="fr-people">
      {list.slice(0, 5).map((a) => (
        <span key={a.id} title={a.name}>
          <Avatar name={a.name} photo={a.photo} size={size} />
        </span>
      ))}
    </span>
  );
}

/** Javob matni: «> » bilan boshlangan qatorlar — iqtibos bloki */
function ReplyBody({ text }: { text: string }) {
  const parts: { quote: boolean; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    const q = line.startsWith(">");
    const last = parts[parts.length - 1];
    if (last && last.quote === q) last.lines.push(q ? line.replace(/^>\s?/, "") : line);
    else parts.push({ quote: q, lines: [q ? line.replace(/^>\s?/, "") : line] });
  }
  return (
    <div className="fr-text">
      {parts.map((p, i) =>
        p.quote ? (
          <blockquote key={i}>{p.lines.join("\n")}</blockquote>
        ) : (
          p.lines.join("\n").trim() && <p key={i}>{p.lines.join("\n").trim()}</p>
        ),
      )}
    </div>
  );
}

/** «Yoqdi» tugmasi (X/Twitter kabi): yoqtirilmagan — bo'sh yurak, yoqtirilgan — to'ldirilgan qizil yurak; yoqtirganda yurak
 *  «sakraydi», atrofida halqa va zarrachalar tarqaladi, son yuqoriga/pastga suriladi (prefers-reduced-motion — animatsiyasiz). */
function LikeButton({ liked, count, label, onToggle }: { liked: boolean; count: number; label: string; onToggle: () => void }) {
  const [burst, setBurst] = useState(0);
  const prev = useRef(count);
  const dir = count > prev.current ? "up" : count < prev.current ? "down" : "";
  useEffect(() => {
    prev.current = count;
  }, [count]);
  return (
    <button
      type="button"
      className={`fr-act fr-like ${liked ? "on" : ""}`}
      aria-pressed={liked}
      onClick={() => {
        if (!liked) setBurst((b) => b + 1);
        onToggle();
      }}
    >
      <span key={burst} className={`fr-heart ${liked && burst ? "pop" : ""}`}>
        <Heart size={16} fill={liked ? "currentColor" : "none"} />
        {liked && burst > 0 && (
          <span className="fr-burst" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ "--i": i } as CSSProperties} />
            ))}
          </span>
        )}
      </span>
      {label} ·{" "}
      <span className="fr-count">
        <span key={count} className={dir}>
          {count}
        </span>
      </span>
    </button>
  );
}

/** Xabar havolasini ulashish: telefonda — tizimning «Ulashish» oynasi, kompyuterda — havola nusxalanadi.
 *  Havola rolga bog'liq emas (/forum/<id>): ochilganda kirmagan bo'lsa — kirish sahifasiga, keyin shu xabarga qaytadi. */
async function shareLink(url: string, title: string, copied: () => void) {
  const touch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return;
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  copied();
}

const NOTICE_KEY = { blog_like: "n_like", blog_comment: "n_comment", blog_quote: "n_quote" } as const;

/** Forum bildirishnomasi matni joriy tilda va kabinetdagi manzil (/forum/<id>#c-… → <kabinet>/blog/<id>#c-…) */
export function forumNotice(n: Notice, lang: Lang, base: string): { text: string; to: string } | null {
  const key = NOTICE_KEY[n.kind as keyof typeof NOTICE_KEY];
  if (!key) return null;
  const t = ADICTS[lang] || ADICTS.uz;
  return { text: t[key].replace("{a}", n.meta?.actor || n.author || "—"), to: (n.link || "").replace(/^\/forum\//, `${base}/blog/`) };
}

export function BlogPage() {
  const t = useApps();
  const { lang } = usePortal();
  const { uid = "" } = useParams();
  const { base } = useBlogBase();
  const [tab, setTab] = useState<"activity" | "new" | "top" | "mine">("activity");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof blog.list>> | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const h = window.setTimeout(() => {
      blog
        .list({ q, tag, mine: !uid && tab === "mine", author: uid || undefined, sort: tab === "mine" ? "activity" : tab })
        .then((d) => {
          setData(d);
          setErr("");
        })
        .catch((e) => setErr(String((e as { detail?: string }).detail || e)));
    }, q ? 250 : 0);
    return () => window.clearTimeout(h);
  }, [tab, q, tag, uid]);
  if (err === "blog_disabled") return <div className="a-page"><Empty icon={<Lock size={30} />} title={t.blog_off} /></div>;
  if (!data) return <Spinner />;
  const tabs: [typeof tab, string][] = [
    ["activity", t.s_activity],
    ["new", t.s_new],
    ["top", t.s_top],
    ["mine", t.my_posts],
  ];
  return (
    <div className="a-page fr">
      <PageHead
        title={uid ? t.author_blog : t.forum}
        sub={uid ? undefined : t.forum_sub}
        actions={
          <Link to={`${base}/new`} className="a-btn primary">
            <Plus size={15} />
            <span>{t.new_topic}</span>
          </Link>
        }
      />
      {uid && data.author && (
        <div className="a-card bl-author-head">
          <Link to={base} className="a-btn ghost">
            <ArrowLeft size={16} />
            <span>{t.all_authors}</span>
          </Link>
          <div className="bl-author">
            <Avatar name={data.author.name} photo={data.author.photo} size={64} />
            <span>
              <b>
                {data.author.name} <RoleBadge a={data.author} t={t} />
              </b>
              <small>{authorLine(data.author, t)}</small>
              <small>
                {data.items.length} {t.author_posts}
              </small>
            </span>
          </div>
        </div>
      )}
      <div className="fr-layout">
        <div className="fr-main-col">
          <div className="a-card fr-bar">
            {!uid && (
              <div className="a-seg">
                {tabs.map(([k, l]) => (
                  <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                    {l}
                  </button>
                ))}
              </div>
            )}
            <label className="a-search fr-search">
              <Search size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search_posts} aria-label={t.search_posts} />
            </label>
          </div>
          {tag && (
            <div className="fr-filter">
              <span className="bl-tag static">#{tag}</span>
              <button className="a-btn ghost sm" onClick={() => setTag("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {data.items.length === 0 ? (
            <div className="a-card">
              <Empty icon={<MessagesSquare size={30} />} title={t.no_posts}>
                <Link to={`${base}/new`} className="a-btn primary">
                  <Plus size={15} />
                  <span>{t.new_topic}</span>
                </Link>
              </Empty>
            </div>
          ) : (
            <div className="a-card fr-list" role="table" aria-label={t.topics}>
              <div className="fr-row fr-head" role="row">
                <span role="columnheader">{t.topic}</span>
                <span role="columnheader" className="fr-c-people" />
                <span role="columnheader" className="fr-c-n">{t.replies}</span>
                <span role="columnheader" className="fr-c-n">{t.views_h}</span>
                <span role="columnheader" className="fr-c-last">{t.activity}</span>
              </div>
              {data.items.map((p) => (
                <Link key={p.id} to={`${base}/${p.id}`} role="row" className={`fr-row ${p.status === "hidden" ? "off" : ""} ${p.pinned ? "pinned" : ""}`}>
                  <span className="fr-topic" role="cell">
                    <Avatar name={p.author.name} photo={p.author.photo} size={40} />
                    <span className="fr-topic-t">
                      <b>
                        {p.pinned && <Pin size={14} aria-label={t.pinned} />}
                        {p.status === "hidden" && <Lock size={14} />}
                        {p.title}
                      </b>
                      <span className="fr-topic-m">
                        {p.tags.slice(0, 3).map((x) => (
                          <span
                            key={x}
                            role="button"
                            tabIndex={0}
                            className={`fr-tag ${tag === x ? "on" : ""}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setTag(tag === x ? "" : x);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                e.stopPropagation();
                                setTag(tag === x ? "" : x);
                              }
                            }}
                          >
                            #{x}
                          </span>
                        ))}
                        <AuthorLink a={p.author} className="fr-by">
                          {p.author.name}
                        </AuthorLink>
                        <span className="fr-dot">{fmtDay(p.created, lang)}</span>
                      </span>
                    </span>
                  </span>
                  <span className="fr-c-people" role="cell">
                    <People list={p.participants || [p.author]} />
                  </span>
                  <span className="fr-c-n" role="cell" data-l={t.replies}>
                    <b>{p.comments}</b>
                  </span>
                  <span className="fr-c-n" role="cell" data-l={t.views_h}>
                    {p.views}
                  </span>
                  <span className="fr-c-last" role="cell">
                    <span className="fr-mob-n">
                      <MessageCircle size={13} /> {p.comments}
                    </span>
                    <time dateTime={p.last_at}>{ago(p.last_at || p.created, lang)}</time>
                    <small>{(p.last_author || p.author).name}</small>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <aside className="fr-side">
          <div className="a-card fr-stats">
            <div>
              <b>{data.stats?.topics ?? data.items.length}</b>
              <small>{t.topics}</small>
            </div>
            <div>
              <b>{data.stats?.replies ?? 0}</b>
              <small>{t.replies}</small>
            </div>
            <div>
              <b>{data.stats?.members ?? data.authors.length}</b>
              <small>{t.members}</small>
            </div>
          </div>
          {data.tags.length > 0 && (
            <div className="a-card fr-box">
              <h3>{t.tags}</h3>
              <div className="fr-tags">
                {data.tags.slice(0, 16).map(([k, n]) => (
                  <button key={k} className={tag === k ? "on" : ""} onClick={() => setTag(tag === k ? "" : k)}>
                    #{k} <em>{n}</em>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!uid && data.authors.length > 0 && (
            <div className="a-card fr-box">
              <h3>{t.authors}</h3>
              <ul className="fr-authors">
                {data.authors.slice(0, 8).map((a) => (
                  <li key={a.id}>
                    <Link to={`${base}/author/${a.id}`}>
                      <Avatar name={a.name} photo={a.photo} size={32} />
                      <span className="fr-au-t">
                        <b>{a.name}</b>
                        <small>{authorLine(a, t) || (a.role === "student" ? t.student : t.teacher)}</small>
                      </span>
                      <em>{a.posts}</em>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ mavzu sahifasi (forum: chapda muallif, o'ngda xabar)
function PostUser({ a, t, n }: { a: BlogAuthor; t: AppsDict; n?: number }) {
  return (
    <AuthorLink a={a} className="fr-user">
      <Avatar name={a.name} photo={a.photo} size={56} />
      <b>{a.name}</b>
      <RoleBadge a={a} t={t} />
      {authorLine(a, t) && <small>{authorLine(a, t)}</small>}
      {n !== undefined && (
        <small className="fr-user-n">
          {n} {t.posts_n}
        </small>
      )}
    </AuthorLink>
  );
}

export function BlogPostPage() {
  const t = useApps();
  const { lang, user } = usePortal();
  const { id = "" } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const box = useRef<HTMLTextAreaElement>(null);
  const liking = useRef(false);
  const [p, setP] = useState<BlogPostFull | null>(null);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState("");
  const [quotes, setQuotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [hl, setHl] = useState("");
  useEffect(() => {
    blog.get(id).then(setP).catch(() => setMissing(true));
  }, [id]);
  // bildirishnoma yoki ulashilgan havoladagi langar (#c-<izoh id>): xabar yuklangach o'sha javobga o'tish va qisqa belgilash
  const loaded = !!p;
  useEffect(() => {
    const h = decodeURIComponent(loc.hash.slice(1));
    if (!loaded || !/^(c-[\w-]+|post-1)$/.test(h)) return;
    const el = document.getElementById(h);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    setHl(h);
    const tm = window.setTimeout(() => setHl(""), 2400);
    return () => window.clearTimeout(tm);
  }, [loaded, loc.hash]);
  if (missing) return <div className="a-page"><Empty title="404" /></div>;
  if (!p) return <Spinner />;
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const c = await run(() => blog.comment(p.id, text.trim(), quotes));
    if (c) {
      const act = { ...(p.activity || {}) };
      act[c.author_id] = (act[c.author_id] || 0) + 1;
      setP({ ...p, comment_list: [...p.comment_list, c], comments: p.comments + 1, activity: act, last_at: c.created, last_author: c.author });
      setText("");
      setQuotes([]);
    }
    setBusy(false);
  };
  // optimistik: yurak darhol to'ladi / bo'shaydi, server javobi bilan tenglashtiriladi, xato bo'lsa — qaytariladi
  const toggleLike = async () => {
    if (liking.current) return;
    liking.current = true;
    const before = { liked: p.liked, likes: p.likes };
    setP((x) => x && { ...x, liked: !before.liked, likes: Math.max(0, before.likes + (before.liked ? -1 : 1)) });
    const r = await run(() => blog.like(p.id));
    setP((x) => x && { ...x, ...(r ? { liked: r.liked, likes: r.likes } : before) });
    liking.current = false;
  };
  const share = (hash = "") => shareLink(`${window.location.origin}/forum/${p.id}${hash}`, p.title, () => toast(t.link_copied));
  const quote = (name: string, body: string, qid: string) => {
    setQuotes((q) => (q.includes(qid) ? q : [...q, qid]));
    const clean = body
      .split("\n")
      .filter((l) => !l.startsWith(">"))
      .join(" ")
      .trim()
      .slice(0, 280);
    setText((x) => `> ${name} ${t.wrote}:\n> ${clean}\n\n${x}`);
    window.setTimeout(() => {
      box.current?.focus();
      box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 30);
  };
  const closedText = !p.settings.comments ? t.comments_off_all : t.comments_closed;
  const act = p.activity || {};
  const people = [p.author, ...p.comment_list.map((c) => c.author)].filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i);
  return (
    <div className="a-page fr">
      <div className="bl-back">
        <Link to=".." relative="path" className="a-btn ghost">
          <ArrowLeft size={16} />
          <span>{t.forum}</span>
        </Link>
      </div>
      <header className="fr-topic-h">
        {p.status === "hidden" && <div className="bl-warn">{t.hidden_post}</div>}
        <h1>
          {p.pinned && <Pin size={20} aria-label={t.pinned} />}
          {p.title}
        </h1>
        <div className="fr-topic-meta">
          {p.tags.map((x) => (
            <span key={x} className="fr-tag">
              #{x}
            </span>
          ))}
          <span>
            <MessageCircle size={15} /> {p.comments}
          </span>
          <span>
            <Eye size={15} /> {p.views}
          </span>
          <span>
            <Heart size={15} /> {p.likes}
          </span>
        </div>
      </header>
      <div className="fr-layout">
        <div className="fr-stream">
          <article className={`a-card fr-post first ${hl === "post-1" ? "fr-hl" : ""}`} id="post-1">
            <PostUser a={p.author} t={t} n={act[p.author_id]} />
            <div className="fr-content">
              <div className="fr-post-h">
                <time dateTime={p.created}>{fmtDay(p.created, lang, true)}</time>
                <a href="#post-1">#1</a>
              </div>
              {p.cover && <img className="fr-cover" src={p.cover} alt="" />}
              <Suspense fallback={<div className="bl-body prose" dangerouslySetInnerHTML={{ __html: p.body }} />}>
                {p.doc ? <RichHtml doc={p.doc as never} className="bl-body prose" /> : <div className="bl-body prose" dangerouslySetInnerHTML={{ __html: p.body }} />}
              </Suspense>
              <footer className="fr-post-f">
                <LikeButton liked={p.liked} count={p.likes} label={t.like} onToggle={toggleLike} />
                {p.can_comment && (
                  <button className="fr-act" onClick={() => quote(p.author.name, p.excerpt || p.title, p.id)}>
                    <Quote size={16} /> {t.quote}
                  </button>
                )}
                <button className="fr-act" onClick={() => share()}>
                  <Share2 size={16} /> {t.share}
                </button>
                {p.mine && (
                  <span className="fr-own">
                    <Link to="edit" className="fr-act">
                      <Pencil size={15} /> {t.edit}
                    </Link>
                    <button
                      className="fr-act danger"
                      onClick={async () => {
                        if (await confirm(t.delete_post_q)) {
                          await run(() => blog.remove(p.id));
                          nav("..", { relative: "path" });
                        }
                      }}
                    >
                      <Trash2 size={15} /> {t.delete}
                    </button>
                  </span>
                )}
              </footer>
            </div>
          </article>

          {p.comment_list.length === 0 && <p className="fr-none">{t.no_replies}</p>}
          {p.comment_list.map((c, i) => (
            <article key={c.id} className={`a-card fr-post ${hl === `c-${c.id}` ? "fr-hl" : ""}`} id={`c-${c.id}`}>
              <PostUser a={c.author} t={t} n={act[c.author_id]} />
              <div className="fr-content">
                <div className="fr-post-h">
                  <time dateTime={c.created}>{fmtDay(c.created, lang, true)}</time>
                  <a href={`#c-${c.id}`}>#{i + 2}</a>
                </div>
                <ReplyBody text={c.body} />
                <footer className="fr-post-f">
                  {p.can_comment && (
                    <button className="fr-act" onClick={() => quote(c.author.name, c.body, c.id)}>
                      <Quote size={16} /> {t.quote}
                    </button>
                  )}
                  <button className="fr-act" onClick={() => share(`#c-${c.id}`)}>
                    <Share2 size={16} /> {t.share}
                  </button>
                  {(c.author_id === user.id || p.mine) && (
                    <button
                      className="fr-act danger"
                      onClick={async () => {
                        if (await confirm(t.delete_comment_q)) {
                          await run(() => blog.removeComment(c.id));
                          setP({ ...p, comment_list: p.comment_list.filter((x) => x.id !== c.id), comments: p.comments - 1 });
                        }
                      }}
                    >
                      <Trash2 size={15} /> {t.delete}
                    </button>
                  )}
                </footer>
              </div>
            </article>
          ))}

          {p.can_comment ? (
            <form className="a-card fr-post fr-compose" id="reply" onSubmit={send}>
              <PostUser a={{ id: user.id, name: user.name, photo: user.data?.photo || "", role: user.role, faculty: "", group: "", position: "", course: null } as BlogAuthor} t={t} />
              <div className="fr-content">
                <label className="fr-compose-l" htmlFor="fr-reply">
                  {t.reply}
                </label>
                <textarea id="fr-reply" ref={box} className="a-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t.reply_ph} rows={5} maxLength={3000} />
                <div className="fr-compose-f">
                  <Btn kind="primary" type="submit" busy={busy} icon={<Send size={15} />} disabled={!text.trim()}>
                    {t.send}
                  </Btn>
                </div>
              </div>
            </form>
          ) : (
            <div className="a-card bl-closed">
              <Lock size={16} /> {closedText}
            </div>
          )}
        </div>
        <aside className="fr-side">
          <div className="a-card fr-box fr-info">
            <h3>{t.topic_info}</h3>
            <dl>
              <div>
                <dt>{t.created_h}</dt>
                <dd>
                  <Avatar name={p.author.name} photo={p.author.photo} size={24} /> {ago(p.created, lang)}
                </dd>
              </div>
              <div>
                <dt>{t.last_reply}</dt>
                <dd>
                  {p.last_author ? (
                    <>
                      <Avatar name={p.last_author.name} photo={p.last_author.photo} size={24} /> {ago(p.last_at, lang)}
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>{t.replies}</dt>
                <dd>{p.comments}</dd>
              </div>
              <div>
                <dt>{t.views_h}</dt>
                <dd>{p.views}</dd>
              </div>
            </dl>
            <h3>{t.members}</h3>
            <People list={people} size={30} />
            {p.can_comment && (
              <a className="a-btn primary fr-jump" href="#reply" onClick={() => window.setTimeout(() => box.current?.focus(), 300)}>
                <MessageCircle size={15} />
                <span>{t.reply}</span>
              </a>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ yozish / tahrirlash
export function BlogEditPage() {
  const t = useApps();
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  type Form = { title: string; doc: Record<string, unknown> | string | null; html: string; text: string; cover: string; tags: string; comments_enabled: boolean };
  const [f, setF] = useState<Form | null>(id ? null : { title: "", doc: null, html: "", text: "", cover: "", tags: "", comments_enabled: true });
  // muharrirga boshlang'ich qiymat bir marta beriladi (keyin o'zi boshqaradi)
  const [initial, setInitial] = useState<Record<string, unknown> | string | null>(null);
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (!id) return;
    blog
      .get(id)
      .then((p) => {
        const doc = p.doc || p.body || "";
        setInitial(doc);
        setF({ title: p.title, doc: p.doc || null, html: p.body, text: p.excerpt || "", cover: p.cover || "", tags: p.tags.join(", "), comments_enabled: p.comments_enabled });
      })
      .catch(() => nav("/", { replace: true }));
  }, [id, nav]);
  const draft = useMemo<BlogDraft | null>(
    () =>
      f
        ? {
            title: f.title.trim(),
            body: f.html,
            doc: f.doc && typeof f.doc === "object" ? f.doc : null,
            cover: f.cover,
            tags: f.tags.split(",").map((x) => x.trim()).filter(Boolean),
            comments_enabled: f.comments_enabled,
          }
        : null,
    [f],
  );
  if (!f || !draft) return <Spinner />;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.title) return toast(t.empty_title, "error");
    if (!f.text.trim() && !/<(img|figure|iframe)/.test(f.html)) return toast(t.empty_body, "error");
    setBusy(true);
    try {
      const p = id ? await blog.update(id, draft) : await blog.create(draft);
      toast(t.saved);
      nav(id ? ".." : `../${p.id}`, { relative: "path", replace: true });
    } catch (e2) {
      const d = (e2 as { detail?: string }).detail || "";
      toast((t as Record<string, unknown>)[d] as string || d || "Error", "error");
    }
    setBusy(false);
  };
  return (
    <form className="a-page bl narrow" onSubmit={save}>
      <PageHead title={id ? t.edit_post : t.new_post} sub={t.blog_sub} />
      <div className="a-card">
        <div className="a-card-body">
          <Field label={t.title}>
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t.title_ph} maxLength={200} autoFocus />
          </Field>
          <div className="a-field">
            <span className="a-label">{t.cover}</span>
            {f.cover ? (
              <div className="bl-cover-edit">
                <img src={f.cover} alt="" />
                <button type="button" className="a-btn danger sm" onClick={() => setF({ ...f, cover: "" })}>
                  <X size={14} />
                  <span>{t.cover_remove}</span>
                </button>
              </div>
            ) : (
              <button type="button" className="bl-cover-pick" onClick={() => file.current?.click()} disabled={up}>
                <ImagePlus size={22} />
                <span>{t.cover_add}</span>
              </button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const fl = e.target.files?.[0];
                e.target.value = "";
                if (!fl) return;
                setUp(true);
                try {
                  const r = await portal.upload(fl);
                  setF((x) => (x ? { ...x, cover: r.url } : x));
                } catch (e2) {
                  toast(String((e2 as { detail?: string }).detail || e2), "error");
                }
                setUp(false);
              }}
            />
          </div>
          <div className="a-field">
            <span className="a-label">{t.body}</span>
            <div className="bl-editor">
              <Suspense fallback={<Spinner />}>
                <RichEditor
                  value={(id ? initial : null) as never}
                  placeholder={t.body_ph}
                  uploader={(fl) => portal.upload(fl)}
                  onChange={(o) => setF((x) => (x ? { ...x, doc: o.json as Record<string, unknown>, html: o.html, text: o.text } : x))}
                />
              </Suspense>
            </div>
            <small className="a-hint">{t.body_ph}</small>
          </div>
          <Field label={t.tags}>
            <Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder={t.tags_ph} maxLength={300} />
          </Field>
          <Toggle checked={f.comments_enabled} onChange={(v) => setF({ ...f, comments_enabled: v })} label={t.allow_comments} />
        </div>
      </div>
      <div className="bl-save">
        <Link to=".." relative="path" className="a-btn">
          <span>{t.cancel}</span>
        </Link>
        <Btn kind="primary" type="submit" busy={busy} icon={<Send size={15} />}>
          {id ? t.save : t.publish}
        </Btn>
      </div>
    </form>
  );
}
