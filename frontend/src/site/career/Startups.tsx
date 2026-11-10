// Startaplar va innovatsiyalar: ro'yxat (bosqich, yo'nalish, qidiruv) va loyiha sahifasi
import { ArrowUpRight, Mail, Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { NotFound } from "../pages/Pages";
import { cc, type Startup } from "./api";
import { fmt, useCT, type CT } from "./i18n";
import { Box, Count, FilterSelect, Hero, Rich, SearchBox, Skeleton, Tabs, useLoad, usePageTitle } from "./ui";

const norm = (s: string) => s.toLowerCase().replace(/[ʻʼ'`‘’]/g, "'");
const STAGES = ["idea", "prototype", "pilot", "market"];

function StageMeter({ stage, c }: { stage: string; c: CT }) {
  const i = STAGES.indexOf(stage);
  return (
    <span className="cc-stage">
      <span className="cc-stage-steps" aria-hidden="true">
        {STAGES.map((s, j) => (
          <span key={s} className={j <= i ? "on" : ""} />
        ))}
      </span>
      {c.stages[stage] || stage}
    </span>
  );
}

function StartupCard({ s, c }: { s: Startup; c: CT }) {
  return (
    <article className="cc-card su">
      {s.cover ? (
        <span className="cc-cover">
          <img src={s.cover} alt="" width={640} height={360} loading="lazy" decoding="async" />
        </span>
      ) : null}
      <div className="cc-card-main">
        <p className="cc-row-kicker">
          <span className="cc-tag">{c.scats[s.category] || s.category}</span>
          <StageMeter stage={s.stage} c={c} />
        </p>
        <h3 className="cc-row-title">
          <Link to={`/startups/${s.slug}`}>{s.title}</Link>
        </h3>
        {s.summary && <p className="cc-row-text">{s.summary}</p>}
        {s.team.length > 0 && <p className="cc-row-meta">{s.team.map((m) => m.name).join(", ")}</p>}
      </div>
    </article>
  );
}

export function StartupsPage() {
  const c = useCT();
  usePageTitle(c.su_title);
  const d = useLoad((l) => cc.startups(l));
  const [stage, setStage] = useState("");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const items = d && d !== "404" ? d.items : [];
  const cats = useMemo(() => [...new Set(items.map((s) => s.category))], [items]);
  const stages = useMemo(() => STAGES.filter((x) => items.some((s) => s.stage === x)), [items]);
  const shown = items.filter((s) => (!stage || s.stage === stage) && (!cat || s.category === cat) && (!q.trim() || norm(`${s.title} ${s.summary} ${s.team.map((m) => m.name).join(" ")}`).includes(norm(q.trim()))));
  if (d === "404") return <NotFound />;
  return (
    <>
      <Hero crumbs={[]} title={c.su_title} sub={c.su_sub} />
      {!d ? (
        <Skeleton />
      ) : (
        <section className="section tight cc-sec">
          <div className="container">
            {items.length > 0 ? (
              <>
                {stages.length > 1 && <Tabs label={c.f_stage} value={stage} onChange={setStage} items={[{ value: "", label: c.f_all }, ...stages.map((x) => ({ value: x, label: c.stages[x] }))]} />}
                <div className="cc-filters">
                  <SearchBox label={c.f_search} value={q} onChange={setQ} />
                  {cats.length > 1 && <FilterSelect label={c.f_category} value={cat} onChange={setCat} all={c.f_all} options={cats.map((x) => ({ value: x, label: c.scats[x] || x }))} />}
                </div>
                <Count text={fmt(c.su_found, { n: shown.length })} />
                {shown.length ? (
                  <div className="cc-cards">
                    {shown.map((s) => (
                      <StartupCard key={s.id} s={s} c={c} />
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
                <p>{c.su_none}</p>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function videoEmbed(url: string): string {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : "";
}

export function StartupPage() {
  const { slug = "" } = useParams();
  const c = useCT();
  const d = useLoad((l) => cc.startup(slug, l), [slug]);
  usePageTitle(d && d !== "404" ? d.item.title : undefined);
  if (d === "404") return <NotFound />;
  if (!d) return <Skeleton />;
  const s = d.item;
  const embed = s.video ? videoEmbed(s.video) : "";
  return (
    <>
      <Hero crumbs={[{ to: "/startups", label: c.su_title }]} title={s.title} sub={s.summary} eyebrow={[c.scats[s.category], c.stages[s.stage], s.year].filter(Boolean).join(" · ")} />
      <section className="section tight cc-sec">
        <div className="container cc-detail">
          <div className="cc-detail-main">
            <p className="cc-stage-line">
              <span className="cc-k">{c.f_stage}:</span> <StageMeter stage={s.stage} c={c} />
            </p>
            {s.cover && (
              <figure className="cc-figure">
                <img src={s.cover} alt="" width={1200} height={675} />
              </figure>
            )}
            <Rich html={s.html} doc={s.content} />
            {embed ? (
              <>
                <h2 className="cc-h3">{c.su_video}</h2>
                <div className="cc-video">
                  <iframe src={embed} title={`${c.su_video}: ${s.title}`} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" />
                </div>
              </>
            ) : s.video ? (
              <p>
                <a className="cc-btn" href={s.video} target="_blank" rel="noopener noreferrer">
                  {c.su_video} <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </p>
            ) : null}
            {s.images.length > 0 && (
              <>
                <h2 className="cc-h3">{c.su_gallery}</h2>
                <div className="cc-gallery">
                  {s.images.map((u, i) => (
                    <a key={u} href={u} target="_blank" rel="noopener noreferrer" aria-label={`${c.su_gallery} ${i + 1}`}>
                      <img src={u} alt="" width={400} height={300} loading="lazy" decoding="async" />
                    </a>
                  ))}
                </div>
              </>
            )}
            {s.awards.length > 0 && (
              <>
                <h2 className="cc-h3">{c.su_awards}</h2>
                <ul className="cc-bullets">
                  {s.awards.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <aside className="cc-aside">
            {s.team.length > 0 && (
              <>
                <h2 className="cc-h3 first">{c.su_team}</h2>
                <ul className="cc-team">
                  {s.team.map((m, i) => (
                    <li key={`${m.name}-${i}`}>
                      <Box src={m.photo} name={m.name} size={48} kind="photo" />
                      <span>
                        {m.slug ? <Link to={`/staff/${m.slug}`}>{m.name}</Link> : <b>{m.name}</b>}
                        <small>{[m.role, c.su_kinds[m.kind]].filter(Boolean).join(" · ")}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {((s.partner_cards || []).length > 0 || s.partners.length > 0) && (
              <>
                <h2 className="cc-h3">{c.su_partners}</h2>
                <ul className="cc-links">
                  {(s.partner_cards || []).map((p) => (
                    <li key={p.slug}>
                      <Link to={`/partners/${p.slug}`}>{p.title}</Link>
                    </li>
                  ))}
                  {s.partners.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </>
            )}
            {(s.contact_email || s.contact_phone || s.website) && (
              <div className="cc-apply">
                <h2 className="cc-h3">{c.su_contact}</h2>
                {s.website && (
                  <a className="cc-btn" href={s.website} target="_blank" rel="noopener noreferrer">
                    {c.su_site} <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                )}
                {s.contact_email && (
                  <a className="cc-btn" href={`mailto:${s.contact_email}`}>
                    <Mail size={16} aria-hidden="true" /> {s.contact_email}
                  </a>
                )}
                {s.contact_phone && (
                  <a className="cc-btn" href={`tel:${s.contact_phone.replace(/[^\d+]/g, "")}`}>
                    <Phone size={16} aria-hidden="true" /> {s.contact_phone}
                  </a>
                )}
              </div>
            )}
          </aside>
        </div>
      </section>
      {d.others.length > 0 && (
        <section className="section tight cc-sec" aria-labelledby="su-others">
          <div className="container">
            <div className="cc-sec-head">
              <h2 className="cc-h2" id="su-others">
                {c.su_others}
              </h2>
              <Link className="cc-more" to="/startups">
                {c.su_all}
              </Link>
            </div>
            <div className="cc-cards">
              {d.others.map((x) => (
                <StartupCard key={x.id} s={x} c={c} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
