// Foydali maqolalar: mavzu bo'yicha ro'yxat va maqola sahifasi (muallif kartasi, manbalar, mavzuga oid maqolalar)
import { Rss } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fmtDate } from "../../lib/i18n";
import { useSite } from "../../lib/site";
import { NotFound } from "../pages/Pages";
import { cc, type Insight } from "./api";
import { fmt, useCT, type CT } from "./i18n";
import { Box, Count, Hero, Rich, SearchBox, Skeleton, Tabs, useLoad, usePageTitle } from "./ui";

const norm = (s: string) => s.toLowerCase().replace(/[ʻʼ'`‘’]/g, "'");

function ArticleCard({ a, c }: { a: Insight; c: CT }) {
  return (
    <article className="cc-card ar">
      {a.cover ? (
        <span className="cc-cover">
          <img src={a.cover} alt="" width={640} height={360} loading="lazy" decoding="async" />
        </span>
      ) : null}
      <div className="cc-card-main">
        {a.topics.length > 0 && (
          <p className="cc-row-kicker">
            {a.topics.map((t) => (
              <span key={t} className="cc-tag">
                {c.topics[t] || t}
              </span>
            ))}
          </p>
        )}
        <h3 className="cc-row-title">
          <Link to={`/articles/${a.slug}`}>{a.title}</Link>
        </h3>
        {a.excerpt && <p className="cc-row-text">{a.excerpt}</p>}
        <p className="cc-row-meta">
          {a.author?.title && <span>{a.author.title}</span>}
          {a.published_at && <time dateTime={a.published_at}>{fmtDate(a.published_at, c.lang, true)}</time>}
          {a.reading_time ? <span>{fmt(c.ar_min, { n: a.reading_time })}</span> : null}
        </p>
      </div>
    </article>
  );
}

export function ArticlesPage() {
  const c = useCT();
  const { defaultLang } = useSite();
  usePageTitle(c.ar_title);
  const d = useLoad((l) => cc.articles(l));
  const [topic, setTopic] = useState("");
  const [q, setQ] = useState("");
  const items = d && d !== "404" ? d.items : [];
  const topics = useMemo(() => (d && d !== "404" ? d.topics : []).filter((t) => items.some((a) => a.topics.includes(t))), [d, items]);
  const shown = items.filter((a) => (!topic || a.topics.includes(topic)) && (!q.trim() || norm(`${a.title} ${a.excerpt} ${a.author?.title || ""} ${a.tags.join(" ")}`).includes(norm(q.trim()))));
  if (d === "404") return <NotFound />;
  return (
    <>
      <Hero crumbs={[]} title={c.ar_title} sub={c.ar_sub}>
        {items.length > 0 && (
          <p className="cc-hero-acts">
            <a className="cc-btn" href={`/articles/rss.xml${c.lang !== defaultLang ? `?lang=${c.lang}` : ""}`}>
              <Rss size={16} aria-hidden="true" /> {c.ar_rss}
            </a>
          </p>
        )}
      </Hero>
      {!d ? (
        <Skeleton />
      ) : (
        <section className="section tight cc-sec">
          <div className="container">
            {items.length > 0 ? (
              <>
                {topics.length > 1 && <Tabs label={c.ar_topic} value={topic} onChange={setTopic} items={[{ value: "", label: c.f_all }, ...topics.map((x) => ({ value: x, label: c.topics[x] || x }))]} />}
                <div className="cc-filters">
                  <SearchBox label={c.f_search} value={q} onChange={setQ} />
                </div>
                <Count text={fmt(c.ar_found, { n: shown.length })} />
                {shown.length ? (
                  <div className="cc-cards">
                    {shown.map((a) => (
                      <ArticleCard key={a.id} a={a} c={c} />
                    ))}
                  </div>
                ) : (
                  <div className="cc-empty">
                    <p>{c.cc_none_filtered}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="cc-empty">
                <p>{c.ar_none}</p>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}

export function ArticlePage() {
  const { slug = "" } = useParams();
  const c = useCT();
  const d = useLoad((l) => cc.article(slug, l), [slug]);
  usePageTitle(d && d !== "404" ? d.item.title : undefined);
  if (d === "404") return <NotFound />;
  if (!d) return <Skeleton />;
  const a = d.item;
  const au = d.author;
  return (
    <>
      <Hero crumbs={[{ to: "/articles", label: c.ar_title }]} title={a.title} sub={a.excerpt} eyebrow={a.topics.map((t) => c.topics[t] || t).join(" · ")}>
        <p className="cc-hero-meta">
          {au?.title && <span>{au.title}</span>}
          {a.published_at && <time dateTime={a.published_at}>{fmtDate(a.published_at, c.lang)}</time>}
          {a.reading_time ? <span>{fmt(c.ar_min, { n: a.reading_time })}</span> : null}
        </p>
      </Hero>
      <section className="section tight cc-sec">
        <div className="container cc-article">
          {a.cover && (
            <figure className="cc-figure">
              <img src={a.cover} alt={a.cover_alt || ""} width={1200} height={675} />
            </figure>
          )}
          <Rich html={a.html} doc={a.content} />
          {(a.sources || []).length > 0 && (
            <>
              <h2 className="cc-h3">{c.ar_sources}</h2>
              <ol className="cc-sources">
                {(a.sources || []).map((s, i) => (
                  <li key={i}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.title || s.url}
                      </a>
                    ) : (
                      s.title
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
          {au && (
            <aside className="cc-author" aria-label={c.ar_author}>
              <Box src={au.photo} name={au.title} size={88} kind="photo" />
              <div>
                <p className="cc-k">{c.ar_author}</p>
                <p className="cc-author-name">{au.slug ? <Link to={`/staff/${au.slug}`}>{au.title}</Link> : au.title}</p>
                {(au.position || au.degree) && <p className="cc-author-pos">{[au.position, au.degree].filter(Boolean).join(", ")}</p>}
                {au.bio && <p className="cc-author-bio">{au.bio}</p>}
              </div>
            </aside>
          )}
        </div>
      </section>
      {d.related.length > 0 && (
        <section className="section tight cc-sec" aria-labelledby="ar-rel">
          <div className="container">
            <div className="cc-sec-head">
              <h2 className="cc-h2" id="ar-rel">
                {c.ar_related}
              </h2>
              <Link className="cc-more" to="/articles">
                {c.ar_all}
              </Link>
            </div>
            <div className="cc-cards">
              {d.related.map((x) => (
                <ArticleCard key={x.id} a={x} c={c} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
