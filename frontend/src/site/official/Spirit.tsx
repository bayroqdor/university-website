// «Institut ruhi»: reytinglar, tarix (vaqt chizig'i), rektor murojaati, OAV biz haqimizda
import { ExternalLink, Play, X } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fmtDate } from "../../lib/i18n";
import { NotFound } from "../pages/Pages";
import { initials } from "../uni";
import { off, type Mention, type Rector } from "./api";
import { useOT } from "./i18n";
import { fmtNum, OfficialHero, Skeleton, useLoad } from "./ui";

const RichHtml = lazy(() => import("../../rich/RichHtml"));

/* ------------------------------------------------------------------ reytinglar */
export function RankingsPage() {
  const { o, lang } = useOT();
  const d = useLoad(off.rankings);
  if (d === "404") return <NotFound />;
  return (
    <>
      <OfficialHero title={o.rk_title} sub={o.rk_sub} />
      {!d ? (
        <Skeleton />
      ) : (
        <section className="section tight of-sec">
          <div className="container of-rk-list">
            {d.groups.map((g) => {
              const latest = g.entries[0];
              return (
                <section key={g.key} className="of-rk" aria-labelledby={`rk-${g.key}`}>
                  <div className="of-rk-head">
                    {g.logo && (
                      <span className="of-rk-logo">
                        <img src={g.logo} alt="" loading="lazy" />
                      </span>
                    )}
                    <div className="of-rk-name">
                      <h2 id={`rk-${g.key}`} className="of-h2 sm">
                        {g.title}
                      </h2>
                      {g.url && (
                        <a href={g.url} target="_blank" rel="noopener noreferrer" className="of-link">
                          {o.rk_link} <ExternalLink size={13} aria-hidden="true" />
                          <span className="of-sr">: {g.title}</span>
                        </a>
                      )}
                    </div>
                    {latest?.place && (
                      <p className="of-rk-now">
                        <span className="of-rk-place">{latest.place}</span>
                        <span className="of-rk-sub">
                          {latest.total ? `${o.rk_of} ${fmtNum(latest.total, lang)}` : ""}
                          {latest.year ? ` · ${latest.year}` : ""}
                        </span>
                      </p>
                    )}
                  </div>
                  <table className="of-table">
                    <caption className="of-sr">
                      {g.title}: {o.rk_history}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">{o.rk_year}</th>
                        <th scope="col">{o.rk_category}</th>
                        <th scope="col" className="of-num">
                          {o.rk_place}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.entries.map((e) => (
                        <tr key={e.id}>
                          <th scope="row">{e.year || "—"}</th>
                          <td>
                            {e.url && e.url !== g.url ? (
                              <a href={e.url} target="_blank" rel="noopener noreferrer" className="of-link">
                                {e.category || g.title} <ExternalLink size={13} aria-hidden="true" />
                              </a>
                            ) : (
                              e.category || "—"
                            )}
                            {e.note && <small className="of-cell-note">{e.note}</small>}
                          </td>
                          <td className="of-num">
                            {e.place || "—"}
                            {e.total ? (
                              <span className="of-of">
                                {" "}
                                / {fmtNum(e.total, lang)}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ tarix */
export function HistoryPage() {
  const { o, lang } = useOT();
  const d = useLoad(off.history);
  if (d === "404") return <NotFound />;
  return (
    <>
      <OfficialHero title={o.hi_title} sub={o.hi_sub} />
      {!d ? (
        <Skeleton />
      ) : (
        <section className="section tight of-sec">
          <div className="container">
            <ol className="of-tl">
              {d.items.map((x) => (
                <li key={x.id} id={`y-${x.id}`} className="of-tl-i">
                  <div className="of-tl-when">
                    <time dateTime={x.date ? x.date.slice(0, 10) : String(x.year || "")}>{x.year || (x.date ? x.date.slice(0, 4) : "")}</time>
                    {x.date && <span className="of-tl-date">{fmtDate(x.date, lang)}</span>}
                  </div>
                  <div className="of-tl-body">
                    <h2 className="of-tl-title">{x.title}</h2>
                    {x.body && x.body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
                    {x.image && (
                      <figure className="of-tl-fig">
                        <img src={x.image} alt={x.image_alt || ""} loading="lazy" />
                        {x.image_alt && <figcaption>{x.image_alt}</figcaption>}
                      </figure>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ rektor murojaati */
export function RectorView({ r, compact = false }: { r: Rector; compact?: boolean }) {
  const { o } = useOT();
  return (
    <div className={`of-rector ${compact ? "compact" : ""}`}>
      <div className="of-rector-side">
        <span className="of-rector-photo">{r.photo ? <img src={r.photo} alt={r.name} loading="lazy" /> : <span aria-hidden="true">{initials(r.name)}</span>}</span>
        <p className="of-rector-name">{r.staff_slug ? <Link to={`/staff/${r.staff_slug}`}>{r.name}</Link> : r.name}</p>
        {r.title && <p className="of-rector-pos">{r.title}</p>}
      </div>
      <div className="of-rector-text">
        <div className={compact ? "of-rector-clip" : ""}>
          <Suspense fallback={<div className="skeleton" />}>
            <RichHtml html={r.html} />
          </Suspense>
        </div>
        {!compact && r.signature && (
          <div className="of-rector-sign">
            <img src={r.signature} alt={`${o.rc_signature}: ${r.name}`} loading="lazy" />
          </div>
        )}
        {compact && (
          <Link to="/rector" className="of-btn">
            {o.rc_more}
            <span className="of-sr">: {o.rc_title}</span>
          </Link>
        )}
      </div>
    </div>
  );
}

/** «Institut haqida» sahifasidagi blok: murojaat yozilmagan bo'lsa — hech narsa chiqmaydi */
export function RectorBlock() {
  const { o } = useOT();
  const d = useLoad(off.rector);
  if (!d || d === "404") return null;
  return (
    <section className="of-rector-block" aria-labelledby="of-rector-h">
      <h2 id="of-rector-h" className="of-h2">
        {o.rc_title}
      </h2>
      <RectorView r={d} compact />
    </section>
  );
}

export function RectorPage() {
  const { o } = useOT();
  const d = useLoad(off.rector);
  if (d === "404") return <NotFound />;
  return (
    <>
      <OfficialHero title={o.rc_title} />
      {!d ? (
        <Skeleton />
      ) : (
        <section className="section tight of-sec">
          <div className="container">
            <RectorView r={d} />
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ OAV biz haqimizda */
function MentionItem({ m }: { m: Mention }) {
  const { o, lang } = useOT();
  const [play, setPlay] = useState(false);
  return (
    <li className="of-mm">
      <div className="of-mm-src">
        {m.logo ? (
          <span className="of-mm-logo">
            <img src={m.logo} alt="" loading="lazy" />
          </span>
        ) : null}
        <span className="of-mm-outlet">{m.outlet}</span>
        <span className="of-mm-meta">
          {o.mm_types[m.type] || m.type}
          {m.date ? ` · ${fmtDate(m.date, lang)}` : ""}
        </span>
      </div>
      <div className="of-mm-main">
        <h2 className="of-mm-title">
          {m.url ? (
            <a href={m.url} target="_blank" rel="noopener noreferrer">
              {m.title} <ExternalLink size={14} aria-hidden="true" />
            </a>
          ) : (
            m.title
          )}
        </h2>
        {m.summary && <p className="of-mm-sum">{m.summary}</p>}
        {m.video_id && (
          <div className="of-mm-video">
            {play ? (
              <>
                <div className="of-embed">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${m.video_id}?autoplay=1&rel=0`}
                    title={m.title}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    loading="lazy"
                  />
                </div>
                <div className="of-mm-acts">
                  <button type="button" className="of-btn sm" onClick={() => setPlay(false)}>
                    <X size={15} aria-hidden="true" />
                    <span>{o.rec_close}</span>
                  </button>
                  <a className="of-link" href={m.url} target="_blank" rel="noopener noreferrer">
                    {o.mm_open} <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </div>
              </>
            ) : (
              <button type="button" className="of-btn sm primary" onClick={() => setPlay(true)}>
                <Play size={15} aria-hidden="true" />
                <span>{o.mm_play}</span>
                <span className="of-sr">: {m.title}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function MediaMentionsPage() {
  const { o } = useOT();
  const d = useLoad(off.mentions);
  const [sp, setSp] = useSearchParams();
  const year = sp.get("year") || "";
  const type = sp.get("type") || "";
  const shown = useMemo(() => (d && d !== "404" ? d.items.filter((x) => (!year || String(x.year) === year) && (!type || x.type === type)) : []), [d, year, type]);
  if (d === "404") return <NotFound />;
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true, preventScrollReset: true });
  };
  return (
    <>
      <OfficialHero title={o.mm_title} sub={o.mm_sub} />
      {!d ? (
        <Skeleton />
      ) : (
        <section className="section tight of-sec">
          <div className="container">
            <div className="of-tools">
              {d.years.length > 1 && (
                <label className="of-field inline">
                  <span>{o.mm_year}</span>
                  <select value={year} onChange={(e) => set("year", e.target.value)}>
                    <option value="">{o.mm_all_years}</option>
                    {d.years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {d.types.length > 1 && (
                <div className="of-tabs" role="group" aria-label={o.mm_type}>
                  <button type="button" className={!type ? "on" : ""} aria-pressed={!type} onClick={() => set("type", "")}>
                    {o.mm_all_types}
                  </button>
                  {d.types.map((x) => (
                    <button key={x} type="button" className={type === x ? "on" : ""} aria-pressed={type === x} onClick={() => set("type", x)}>
                      {o.mm_types[x] || x}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="of-count" aria-live="polite">
              {shown.length ? o.mm_found(shown.length) : o.mm_none}
            </p>
            <ul className="of-mms">
              {shown.map((m) => (
                <MentionItem key={m.id} m={m} />
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
