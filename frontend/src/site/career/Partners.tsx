// Hamkorlar va amaliyot bazalari: ro'yxat (turi, amaliyot bazasi, yo'nalish, qidiruv), hamkor sahifasi, yo'nalish sahifasidagi blok
import { ArrowUpRight, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fmtDate } from "../../lib/i18n";
import { useSite } from "../../lib/site";
import { NotFound } from "../pages/Pages";
import { cc, type Partner } from "./api";
import { OppRow } from "./CareerCenter";
import { fmt, useCT, type CT } from "./i18n";
import { Box, CheckField, Count, FilterSelect, Hero, SearchBox, Skeleton, Tabs, useLoad, usePageTitle } from "./ui";

const norm = (s: string) => s.toLowerCase().replace(/[ʻʼ'`‘’]/g, "'");

function PartnerCard({ p, c }: { p: Partner; c: CT }) {
  const place = [p.country, p.city].filter(Boolean).join(", ");
  return (
    <article className="cc-card">
      <Box src={p.logo} name={p.title} size={72} />
      <div className="cc-card-main">
        <p className="cc-row-kicker">
          <span className="cc-tag">{c.ptypes[p.category] || p.category}</span>
          {p.practice_base && <span className="cc-tag alt">{c.pt_practice}</span>}
        </p>
        <h3 className="cc-row-title">
          <Link to={`/partners/${p.slug}`}>{p.title}</Link>
        </h3>
        {place && (
          <p className="cc-row-meta">
            <span>
              <MapPin size={15} aria-hidden="true" /> {place}
            </span>
          </p>
        )}
        {p.summary && <p className="cc-row-text">{p.summary}</p>}
      </div>
    </article>
  );
}

export function CooperationPartnersPage() {
  const c = useCT();
  usePageTitle(c.pt_title);
  const d = useLoad((l) => cc.partners(l));
  const [type, setType] = useState("");
  const [practice, setPractice] = useState(false);
  const [prog, setProg] = useState("");
  const [q, setQ] = useState("");
  const items = d && d !== "404" ? d.items : [];
  const programs = d && d !== "404" ? d.programs : [];
  const types = useMemo(() => (["industry", "international", "academic", "government"] as const).filter((x) => items.some((p) => p.category === x)), [items]);
  const pracProgs = useMemo(() => programs.filter((p) => items.some((x) => x.practice_base && x.program_ids.includes(p.id))), [items, programs]);
  const shown = useMemo(() => {
    const nq = norm(q.trim());
    return items.filter(
      (p) =>
        (!type || p.category === type) &&
        (!practice || p.practice_base) &&
        (!prog || (p.practice_base && p.program_ids.includes(prog))) &&
        (!nq || norm(`${p.title} ${p.country} ${p.city} ${p.summary} ${(p.areas || []).join(" ")}`).includes(nq)),
    );
  }, [items, type, practice, prog, q]);
  if (d === "404") return <NotFound />;
  return (
    <>
      <Hero crumbs={[]} title={c.pt_title} sub={c.pt_sub} />
      {!d ? (
        <Skeleton />
      ) : (
        <section className="section tight cc-sec">
          <div className="container">
            {items.length > 0 && (
              <>
                {types.length > 1 && <Tabs label={c.f_type} value={type} onChange={setType} items={[{ value: "", label: c.f_all }, ...types.map((x) => ({ value: x, label: c.ptypes[x] }))]} />}
                <div className="cc-filters">
                  <SearchBox label={c.f_search} value={q} onChange={setQ} />
                  {pracProgs.length > 0 && <FilterSelect label={c.f_program} value={prog} onChange={setProg} all={c.f_all} options={pracProgs.map((p) => ({ value: p.id, label: p.title }))} />}
                  {items.some((p) => p.practice_base) && (
                    <div className="cc-fld cc-fld-check">
                      <CheckField id="pt-practice" checked={practice} onChange={setPractice} label={c.pt_practice_only} />
                    </div>
                  )}
                </div>
                <Count text={fmt(c.pt_found, { n: shown.length })} />
              </>
            )}
            {shown.length > 0 ? (
              <div className="cc-cards">
                {shown.map((p) => (
                  <PartnerCard key={p.id} p={p} c={c} />
                ))}
              </div>
            ) : (
              <div className="cc-empty">
                <p>{c.pt_none}</p>
                {(type || practice || prog || q) && (
                  <button
                    type="button"
                    className="cc-btn"
                    onClick={() => {
                      setType("");
                      setPractice(false);
                      setProg("");
                      setQ("");
                    }}
                  >
                    {c.cc_reset}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}

export function PartnerPage() {
  const { slug = "" } = useParams();
  const c = useCT();
  const d = useLoad((l) => cc.partner(slug, l), [slug]);
  usePageTitle(d && d !== "404" ? d.item.title : undefined);
  if (d === "404") return <NotFound />;
  if (!d) return <Skeleton />;
  const p = d.item;
  const hasGeo = p.lat != null && p.lng != null;
  const osm = hasGeo ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=15/${p.lat}/${p.lng}` : "";
  return (
    <>
      <Hero crumbs={[{ to: "/partners", label: c.pt_title }]} title={p.title} eyebrow={[c.ptypes[p.category], p.practice_base ? c.pt_practice : ""].filter(Boolean).join(" · ")} />
      <section className="section tight cc-sec">
        <div className="container cc-detail">
          <div className="cc-detail-main">
            {p.summary && <p className="cc-lead">{p.summary}</p>}
            {p.description &&
              p.description
                .split(/\n\s*\n/)
                .filter((x) => x.trim())
                .map((x, i) => (
                  <p key={i} className="cc-p">
                    {x}
                  </p>
                ))}
            {p.areas?.length > 0 && (
              <>
                <h2 className="cc-h3">{c.pt_areas}</h2>
                <ul className="cc-bullets">
                  {p.areas.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            )}
            {p.practice_base && d.programs.length > 0 && (
              <>
                <h2 className="cc-h3">{c.pt_programs}</h2>
                <ul className="cc-links">
                  {d.programs.map((x) => (
                    <li key={x.id}>
                      <Link to={`/programs/${x.slug}`}>{x.title}</Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {d.opportunities.length > 0 && (
              <>
                <h2 className="cc-h3">{c.pt_opps}</h2>
                <div className="cc-list">
                  {d.opportunities.map((o) => (
                    <OppRow key={o.id} o={o} c={c} />
                  ))}
                </div>
              </>
            )}
            {d.news.length > 0 && (
              <>
                <h2 className="cc-h3">{c.pt_news}</h2>
                <ul className="cc-news">
                  {d.news.map((n) => (
                    <li key={n.id}>
                      <Link to={`/news/${n.slug}`}>{n.title}</Link>
                      {n.published_at && <time dateTime={n.published_at}>{fmtDate(n.published_at, c.lang, true)}</time>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <aside className="cc-aside">
            <div className="cc-org">
              <Box src={p.logo} name={p.title} size={72} />
            </div>
            <dl className="cc-dl">
              {p.country && (
                <div>
                  <dt>{c.pt_country}</dt>
                  <dd>{p.country}</dd>
                </div>
              )}
              {p.city && (
                <div>
                  <dt>{c.pt_city}</dt>
                  <dd>{p.city}</dd>
                </div>
              )}
              {p.since && (
                <div>
                  <dt>{c.pt_since}</dt>
                  <dd>{p.since}</dd>
                </div>
              )}
              {p.agreement_date && (
                <div>
                  <dt>{c.pt_agreement}</dt>
                  <dd>{/^\d{4}-\d{2}-\d{2}/.test(p.agreement_date) ? fmtDate(p.agreement_date, c.lang) : p.agreement_date}</dd>
                </div>
              )}
              {p.practice_base && p.capacity ? (
                <div>
                  <dt>{c.pt_capacity}</dt>
                  <dd>{p.capacity}</dd>
                </div>
              ) : null}
            </dl>
            {(p.url || osm) && (
              <div className="cc-apply">
                {p.url && (
                  <a className="cc-btn" href={p.url} target="_blank" rel="noopener noreferrer">
                    {c.pt_site} <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                )}
                {osm && (
                  <a className="cc-btn" href={osm} target="_blank" rel="noopener noreferrer">
                    <MapPin size={16} aria-hidden="true" /> {c.pt_map}
                  </a>
                )}
              </div>
            )}
          </aside>
        </div>
      </section>
      {d.others.length > 0 && (
        <section className="section tight cc-sec" aria-labelledby="pt-others">
          <div className="container">
            <div className="cc-sec-head">
              <h2 className="cc-h2" id="pt-others">
                {c.pt_others}
              </h2>
              <Link className="cc-more" to="/partners">
                {c.pt_all}
              </Link>
            </div>
            <div className="cc-cards">
              {d.others.map((x) => (
                <PartnerCard key={x.id} p={x} c={c} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/** Yo'nalish sahifasidagi «Amaliyot bazalari» bloki — baza bo'lmasa hech narsa chiqmaydi */
export function PracticeBases({ program }: { program: string }) {
  const c = useCT();
  const { lang } = useSite();
  const [items, setItems] = useState<Partner[]>([]);
  useEffect(() => {
    let live = true;
    cc.practiceBases(program, lang)
      .then((r) => live && setItems(r.items))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [program, lang]);
  if (!items.length) return null;
  return (
    <div className="skills cc-bases">
      <h2 className="h-sm">{c.pt_bases_title}</h2>
      <ul>
        {items.map((p) => (
          <li key={p.id}>
            <Box src={p.logo} name={p.title} size={40} />
            <span>
              <Link to={`/partners/${p.slug}`}>{p.title}</Link>
              {(p.country || p.city) && <small>{[p.country, p.city].filter(Boolean).join(", ")}</small>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
