// «Ochiq ma'lumotlar»: bazadan avtomatik hisoblangan ko'rsatkichlar (admin yashirishi yoki qo'lda kiritishi mumkin) va
// yuklab olinadigan to'plamlar (CSV / XLSX / JSON, JSON API). Jadvallar — sarlavhali (caption), taqsimotlarda oddiy chiziqli diagramma.
import { Braces, ChevronDown, Download } from "lucide-react";
import { useState } from "react";
import { fmtDate } from "../../lib/i18n";
import { NotFound } from "../pages/Pages";
import { off, type Dataset, type Indicator } from "./api";
import { useOT } from "./i18n";
import { fmtNum, OfficialHero, Skeleton, useLoad } from "./ui";

function Downloads({ links, label }: { links: Partial<Record<"csv" | "xlsx" | "json", string>>; label: string }) {
  const { lang } = useOT();
  return (
    <ul className="of-dl-links" aria-label={label}>
      {(["csv", "xlsx", "json"] as const)
        .filter((f) => links[f])
        .map((f) => (
          <li key={f}>
            <a className="of-btn sm" href={`${links[f]}?lang=${lang}`} download>
              <Download size={15} aria-hidden="true" />
              <span>{f.toUpperCase()}</span>
              <span className="of-sr">: {label}</span>
            </a>
          </li>
        ))}
    </ul>
  );
}

function Breakdown({ x }: { x: Indicator }) {
  const { o, lang } = useOT();
  const rows = x.breakdown || [];
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="of-ind-fig">
      <table className="of-table of-bars">
        <caption>
          <span className="of-cap-t">{x.label}</span>
          <span className="of-cap-u">
            {o.od_updated}: {fmtDate(`${x.updated}T12:00:00`, lang)}
          </span>
        </caption>
        <thead>
          <tr>
            <th scope="col">{o.od_category}</th>
            <th scope="col" className="of-num">
              {o.od_value}
            </th>
            <th scope="col" className="of-bar-h">
              <span className="of-sr">{o.od_chart}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td className="of-num">{fmtNum(r.value, lang)}</td>
              <td className="of-bar-c" aria-hidden="true">
                <span className="of-bar" style={{ width: `${(r.value / max) * 100}%` }} />
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr>
              <th scope="row">{o.od_total}</th>
              <td className="of-num">{fmtNum(x.value, lang)}</td>
              <td aria-hidden="true" />
            </tr>
          </tfoot>
        )}
      </table>
    </figure>
  );
}

function DatasetCard({ ds }: { ds: Dataset }) {
  const { o, lang } = useOT();
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<Dataset | null | "err">(null);
  const toggle = () => {
    setOpen(!open);
    if (!full) off.dataset(ds.id, lang).then(setFull).catch(() => setFull("err"));
  };
  const tb = full && full !== "err" ? full.table : null;
  return (
    <li className="of-ds" id={`ds-${ds.id}`}>
      <h3 className="of-ds-title">{ds.title}</h3>
      {ds.description && <p className="of-ds-desc">{ds.description}</p>}
      <dl className="of-ds-meta">
        {ds.period && (
          <div>
            <dt>{o.od_period}</dt>
            <dd>{ds.period}</dd>
          </div>
        )}
        {ds.source && (
          <div>
            <dt>{o.od_source}</dt>
            <dd>{ds.source}</dd>
          </div>
        )}
        {ds.updated_on && (
          <div>
            <dt>{o.od_updated}</dt>
            <dd>{fmtDate(ds.updated_on, lang)}</dd>
          </div>
        )}
        <div>
          <dt className="of-sr">{o.od_table}</dt>
          <dd>{o.od_rows(ds.rows_count)}</dd>
        </div>
      </dl>
      <div className="of-ds-acts">
        <Downloads links={ds.downloads} label={ds.title} />
        {ds.rows_count > 0 && (
          <button type="button" className="of-btn sm ghost" aria-expanded={open} aria-controls={`dst-${ds.id}`} onClick={toggle}>
            <ChevronDown size={15} aria-hidden="true" className={open ? "rot" : ""} />
            <span>{open ? o.od_hide : o.od_preview}</span>
          </button>
        )}
      </div>
      <div id={`dst-${ds.id}`} hidden={!open} className="of-ds-table">
        {open && !full && <div className="skeleton short" />}
        {tb && (
          <div className="of-scroll" tabIndex={0} role="region" aria-label={ds.title}>
            <table className="of-table">
              <caption className="of-sr">{ds.title}</caption>
              <thead>
                <tr>
                  {tb.columns.map((c, i) => (
                    <th key={i} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tb.rows.slice(0, 500).map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j} className={typeof c === "number" ? "of-num" : ""}>
                        {typeof c === "number" ? fmtNum(c, lang) : c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </li>
  );
}

export function OpenDataPage() {
  const { o, lang } = useOT();
  const d = useLoad(off.openData);
  if (d === "404") return <NotFound />;
  const values = d ? d.indicators.filter((x) => x.kind === "value") : [];
  const breakdowns = d ? d.indicators.filter((x) => x.kind === "breakdown") : [];
  return (
    <>
      <OfficialHero title={o.od_title} sub={o.od_sub} />
      {!d ? (
        <Skeleton />
      ) : (
        <>
          {d.indicators.length > 0 && (
            <section className="section tight of-sec" aria-labelledby="od-ind">
              <div className="container">
                <div className="of-sec-head">
                  <h2 id="od-ind" className="of-h2">
                    {o.od_indicators}
                  </h2>
                  <div className="of-sec-acts">
                    <Downloads links={d.downloads} label={o.od_indicators} />
                    <a className="of-btn sm ghost" href={`/api/open-data?lang=${lang}`} target="_blank" rel="noopener noreferrer">
                      <Braces size={15} aria-hidden="true" />
                      <span>{o.od_api}</span>
                    </a>
                  </div>
                </div>
                {values.length > 0 && (
                  <ul className="of-stats">
                    {values.map((x) => (
                      <li key={x.key} className="of-stat">
                        <span className="of-stat-v">{fmtNum(x.value, lang)}</span>
                        <span className="of-stat-l">{x.label}</span>
                        <span className="of-stat-u">
                          {o.od_updated}: {fmtDate(`${x.updated}T12:00:00`, lang)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {breakdowns.length > 0 && (
                  <div className="of-ind-grid">
                    {breakdowns.map((x) => (
                      <Breakdown key={x.key} x={x} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
          {d.datasets.length > 0 && (
            <section className="section tight of-sec" aria-labelledby="od-ds">
              <div className="container">
                <h2 id="od-ds" className="of-h2">
                  {o.od_datasets}
                </h2>
                <ul className="of-dss">
                  {d.datasets.map((ds) => (
                    <DatasetCard key={ds.id} ds={ds} />
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
