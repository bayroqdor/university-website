// Yangilik, e'lon va sahifa (rich kontent) ko'rinishi
import { ArrowLeft, ArrowRight, Calendar, Eye, MapPin } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { pub, type Announce, type ContactPerson, type Event, type News, type Page } from "../../lib/api";
import { fmtDate, fmtDateTime } from "../../lib/i18n";
import { useSite } from "../../lib/site";
import { useReadTracking } from "../../lib/track";
import type { Heading } from "../../rich/RichHtml";
import { AnnounceRow, ContactCard, NewsCard, SectionHead } from "../cards";
import { Reveal, ScrollProgress, scrollToEl, SplitText } from "../fx";
import { LangNotice, PdfButton, Share } from "../share";
import { NotFound } from "./Pages";
import { ListenButton } from "../../a11y/Root";

const RichHtml = lazy(() => import("../../rich/RichHtml"));
// tadbirga ro'yxatdan o'tish (admin yoqqan bo'lsa; site/campus/EventReg.tsx)
const EventRegistration = lazy(() => import("../campus/EventReg"));
// «Institut haqida» sahifasida rektor murojaati bloki (murojaat yozilmagan bo'lsa — chiqmaydi)
const RectorBlock = lazy(() => import("../official").then((m) => ({ default: m.RectorBlock })));
const ABOUT_SLUG = "institut-haqida";

function Toc({ heads, label }: { heads: Heading[]; label: string }) {
  const [active, setActive] = useState("");
  useEffect(() => {
    const els = heads.map((h) => document.getElementById(h.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [heads]);
  return (
    <nav className="toc" aria-label={label}>
      <div className="toc-label">{label}</div>
      <ol>
        {heads.map((h) => (
          <li key={h.id} className={`l${h.level} ${active === h.id ? "on" : ""}`}>
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToEl(document.getElementById(h.id));
                history.replaceState(null, "", `#${h.id}`);
              }}
            >
              {h.text.replace(/#$/, "")}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Loading() {
  return (
    <div className="container section">
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
  );
}

/** Umumiy maqola qobig'i: sarlavha, meta, muqova, mundarija, matn, ulashish */
function ArticleShell({ item, section, tagsTo, byline, children, aside, after }: { item: News | Announce | Page | Event; section: string; tagsTo?: string; byline?: React.ReactNode; children?: React.ReactNode; aside?: React.ReactNode; after?: React.ReactNode }) {
  const { t, data } = useSite();
  const [heads, setHeads] = useState<Heading[]>([]);
  const article = useRef<HTMLElement>(null);
  const kind = item.kind === "news" ? "news" : item.kind === "announce" ? "announce" : item.kind === "page" ? "page" : "";
  useReadTracking(kind ? item.slug || undefined : undefined, article, kind || "news");
  const langs = (item.langs || []).filter((l) => l !== item.lang);
  const showToc = heads.length >= 3 || (!!(item as Page).show_toc && heads.length > 0);
  const cover = ((item as News).feature_image || (item as Page).cover || "") as string;
  const tags = ((item as News).tags || []) as string[];
  const lead = (item.excerpt || (item as Event).summary || "") as string;
  return (
    <>
      <ScrollProgress />
      <article className="post" ref={article}>
        <header className="post-hero">
          <div className="container narrow-l">
            <LangNotice served={item.lang} langs={langs} />
            <Reveal className="post-hero-tags">
              {tags.map((x) => (tagsTo ? <Link key={x} to={`${tagsTo}?tag=${encodeURIComponent(x)}`} className="tag">{x}</Link> : <span key={x} className="tag">{x}</span>))}
              {aside}
            </Reveal>
            <h1 className="post-h1">
              <SplitText text={item.title} stagger={0.012} />
            </h1>
            {lead && (
              <Reveal delay={0.25}>
                <p className="post-lead">{lead}</p>
              </Reveal>
            )}
            <Reveal delay={0.35} className="post-byline">
              <span className="avatar">{data?.uni.logo ? <img src={data.uni.logo} alt="" /> : data?.site.logo_text}</span>
              <span>
                <b>{data?.uni.short_name || data?.uni.abbr}</b>
                <small>{byline}</small>
              </span>
              {kind && kind !== "page" && <ListenButton target={article} />}
            </Reveal>
          </div>
        </header>
        {cover && (
          <figure className="post-feature container">
            <Reveal className="post-feature-frame">
              <img src={cover} alt={((item as News).feature_alt as string) || item.title} />
            </Reveal>
            {(item as News).feature_caption && <figcaption>{(item as News).feature_caption}</figcaption>}
          </figure>
        )}
        <div className={`container post-layout ${showToc ? "with-toc" : ""}`}>
          {showToc && (
            <aside className="post-aside">
              <Toc heads={heads} label={t.toc} />
            </aside>
          )}
          <div className="post-content">
            {children}
            <Suspense fallback={<div className="skeleton" />}>
              <RichHtml html={item.html} doc={item.content} onHeadings={setHeads} />
            </Suspense>
            <footer className="post-foot">
              {tags.length > 0 && tagsTo && (
                <div className="post-tags">
                  {tags.map((x) => (
                    <Link key={x} to={`${tagsTo}?tag=${encodeURIComponent(x)}`} className="tag">
                      #{x}
                    </Link>
                  ))}
                </div>
              )}
              <div className="post-foot-actions">
                <Share title={item.title} text={lead} full />
                {kind && <PdfButton section={section} slug={item.slug || ""} />}
              </div>
            </footer>
            {after}
          </div>
        </div>
      </article>
    </>
  );
}

/* ------------------------------------------------------------------ yangilik */
export function NewsItemPage() {
  const { slug } = useParams();
  const { t, lang } = useSite();
  const [d, setD] = useState<{ item: News; newer: News | null; older: News | null; related: News[] } | null | "404">(null);
  useEffect(() => {
    setD(null);
    pub.newsItem(slug || "").then(setD).catch(() => setD("404"));
  }, [slug]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const p = d.item;
  return (
    <>
      <ArticleShell
        item={p}
        section="news"
        tagsTo="/news"
        byline={
          <>
            <time dateTime={p.published_at || ""}>{fmtDate(p.published_at, lang)}</time> · {p.reading_time} {t.min_read}
            {p.views ? (
              <>
                {" "}
                · <Eye size={12} /> {p.views}
              </>
            ) : null}
          </>
        }
      />
      {(d.newer || d.older) && (
        <nav className="container post-nav" aria-label={`${t.older} / ${t.newer}`}>
          {d.older ? (
            <Link to={`/news/${d.older.slug}`} className="post-nav-link prev" data-cursor="">
              <small>
                <ArrowLeft size={14} /> {t.older}
              </small>
              <span>{d.older.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {d.newer ? (
            <Link to={`/news/${d.newer.slug}`} className="post-nav-link next" data-cursor="">
              <small>
                {t.newer} <ArrowRight size={14} />
              </small>
              <span>{d.newer.title}</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
      {d.related.length > 0 && (
        <section className="section">
          <div className="container">
            <SectionHead title={t.related} link="/news" linkLabel={t.news_all} />
            <div className="post-grid">
              {d.related.map((x, i) => (
                <NewsCard key={x.id} p={x} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ e'lon */
export function AnnouncementPage() {
  const { slug } = useParams();
  const { t, lang } = useSite();
  const [d, setD] = useState<{ item: Announce; others: Announce[] } | null | "404">(null);
  useEffect(() => {
    setD(null);
    pub.announcement(slug || "").then(setD).catch(() => setD("404"));
  }, [slug]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const a = d.item;
  return (
    <>
      <ArticleShell
        item={a}
        section="announcements"
        aside={<span className="badge">{t.ann_cats[a.category] || a.category}</span>}
        byline={
          <>
            <time dateTime={a.published_at || ""}>{fmtDate(a.published_at, lang)}</time>
            {a.deadline && (
              <>
                {" "}
                · {t.deadline}: {fmtDate(a.deadline, lang)}
              </>
            )}
          </>
        }
      />
      {d.others.length > 0 && (
        <section className="section tight">
          <div className="container">
            <SectionHead title={t.other_announcements} link="/announcements" linkLabel={t.announcements_all} />
            <ul className="ann-list">
              {d.others.map((x, i) => (
                <AnnounceRow key={x.id} a={x} index={i} />
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ statik sahifa (universitet haqida, qabul…) */
export function PageView() {
  const { slug } = useParams();
  const { t, lang } = useSite();
  const [d, setD] = useState<{ item: Page; siblings: Page[]; contacts?: ContactPerson[]; news?: News[] } | null | "404">(null);
  useEffect(() => {
    setD(null);
    pub.page(slug || "").then(setD).catch(() => setD("404"));
  }, [slug]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const p = d.item;
  const tag = p.news_tag || "";
  return (
    <>
    <ArticleShell
      item={p}
      section="pages"
      aside={<span className="badge soft">{t.page_sections[p.section] || p.section}</span>}
      after={
        p.slug === ABOUT_SLUG ? (
          <Suspense fallback={null}>
            <RectorBlock />
          </Suspense>
        ) : undefined
      }
      byline={
        <>
          {t.updated}: {fmtDate(p.updated, lang)}
        </>
      }
    >
      {!!d.contacts?.length && (
        <div className={`pc-list ${d.contacts.length > 2 ? "many" : ""}`}>
          {d.contacts.map((c) => (
            <ContactCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </ArticleShell>
      {!!d.news?.length && (
        <section className="section">
          <div className="container">
            <SectionHead title={t.news_title} link={`/news?tag=${encodeURIComponent(tag)}`} linkLabel={t.news_all} />
            <div className="post-grid">
              {d.news.map((x, i) => (
                <NewsCard key={x.id} p={x} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ tadbir */
export function EventPage() {
  const { slug } = useParams();
  const { t, lang } = useSite();
  const [d, setD] = useState<{ item: Event } | null | "404">(null);
  useEffect(() => {
    setD(null);
    pub.event(slug || "").then(setD).catch(() => setD("404"));
  }, [slug]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const e = d.item;
  return (
    <ArticleShell
      item={e}
      section="events"
      aside={<span className="badge">{t.event_kinds[e.category] || e.category}</span>}
      after={
        <Suspense fallback={null}>
          <EventRegistration slug={e.slug || slug || ""} />
        </Suspense>
      }
      byline={
        <>
          <Calendar size={12} /> {fmtDateTime(e.starts, lang)}
          {e.ends ? ` — ${fmtDateTime(e.ends, lang)}` : ""}
          {e.place && (
            <>
              {" "}
              · <MapPin size={12} /> {e.place}
            </>
          )}
        </>
      }
    >
      {e.url && (
        <p>
          <a className="btn btn-ghost" href={e.url} target="_blank" rel="noopener noreferrer">
            {t.open_link} <ArrowRight size={16} />
          </a>
        </p>
      )}
    </ArticleShell>
  );
}
