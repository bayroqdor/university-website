// «Me'yoriy hujjatlar»: turlari bo'yicha guruhlangan hujjatlar, qidiruv va tur filtri (sahifa qayta yuklanmaydi), ko'rish / yuklab olish, chop etish
import { Download, ExternalLink, Eye, FileText, Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fmtDate } from "../../lib/i18n";
import { documentHref, viewablePath } from "../pages/DocView";
import { NotFound } from "../pages/Pages";
import { off, type OfficialDoc } from "./api";
import { useOT } from "./i18n";
import { fmtSize, OfficialHero, Skeleton, useLoad } from "./ui";

const norm = (s: string) => s.toLowerCase().replace(/[ʻʼ'`‘’]/g, "'").replace(/\s+/g, " ").trim();

function DocCard({ d }: { d: OfficialDoc }) {
  const { o, lang } = useOT();
  const href = d.file || d.url;
  const view = d.file ? viewablePath(d.file) : null;
  const ext = (d.file_ext || "").toUpperCase();
  const size = fmtSize(d.file_size, lang);
  const meta = [d.number && `${o.docs_number} ${d.number}`, d.date ? fmtDate(d.date, lang) : d.year ? String(d.year) : ""].filter(Boolean);
  return (
    <li className="of-doc">
      <div className="of-doc-type" aria-hidden="true">
        <FileText size={20} />
        {ext && <span>{ext}</span>}
      </div>
      <div className="of-doc-main">
        <h3 className="of-doc-title">{d.title}</h3>
        {(meta.length > 0 || ext) && (
          <p className="of-doc-meta">
            {meta.join(" · ")}
            {ext && (
              <span className="of-doc-file">
                {meta.length ? " · " : ""}
                {ext}
                {size ? `, ${size}` : ""}
              </span>
            )}
          </p>
        )}
        {d.summary && <p className="of-doc-sum">{d.summary}</p>}
      </div>
      {href && (
        <div className="of-doc-acts">
          {view && (
            <Link className="of-btn" to={documentHref(view, d.title)}>
              <Eye size={16} aria-hidden="true" />
              <span>{o.docs_view}</span>
              <span className="of-sr">: {d.title}</span>
            </Link>
          )}
          {d.file ? (
            <a className="of-btn primary" href={d.file} download data-no-office="">
              <Download size={16} aria-hidden="true" />
              <span>{o.docs_download}</span>
              <span className="of-sr">
                : {d.title}
                {ext ? ` (${ext}${size ? `, ${size}` : ""})` : ""}
              </span>
            </a>
          ) : (
            <a className="of-btn" href={d.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} aria-hidden="true" />
              <span>{o.docs_open}</span>
              <span className="of-sr">: {d.title}</span>
            </a>
          )}
        </div>
      )}
    </li>
  );
}

export function RegulatoryDocsPage() {
  const { o } = useOT();
  const d = useLoad(off.documents);
  const [sp, setSp] = useSearchParams();
  const cat = sp.get("cat") || "";
  const [q, setQ] = useState(sp.get("q") || "");
  const items = d && d !== "404" ? d.items : [];
  const shown = useMemo(() => {
    const nq = norm(q);
    return items.filter((x) => (!cat || x.category === cat) && (!nq || norm(`${x.title} ${x.number} ${x.summary}`).includes(nq)));
  }, [items, cat, q]);
  const groups = useMemo(() => {
    const m = new Map<string, OfficialDoc[]>();
    shown.forEach((x) => m.set(x.category, [...(m.get(x.category) || []), x]));
    return [...m.entries()];
  }, [shown]);
  if (d === "404" || (d && !d.items.length)) return <NotFound />;
  const setCat = (c: string) => {
    const n = new URLSearchParams(sp);
    if (c) n.set("cat", c);
    else n.delete("cat");
    setSp(n, { replace: true, preventScrollReset: true });
  };
  return (
    <>
      <OfficialHero title={o.docs_title} sub={o.docs_sub} print />
      {!d ? (
        <Skeleton />
      ) : (
        <section className="section tight of-sec">
          <div className="container">
            <div className="of-tools" role="search">
              <label className="of-search">
                <Search size={18} aria-hidden="true" />
                <span className="of-sr">{o.docs_search}</span>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={o.docs_search} autoComplete="off" />
              </label>
              <button type="button" className="of-btn of-print-btn" onClick={() => window.print()}>
                <Printer size={16} aria-hidden="true" />
                <span>{o.docs_print}</span>
              </button>
            </div>
            <div className="of-tabs" role="group" aria-label={o.docs_cat_label}>
              <button type="button" className={!cat ? "on" : ""} aria-pressed={!cat} onClick={() => setCat("")}>
                {o.docs_all} <span className="of-n">{d.items.length}</span>
              </button>
              {d.categories.map((c) => (
                <button key={c.id} type="button" className={cat === c.id ? "on" : ""} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                  {o.doc_cats[c.id] || c.id} <span className="of-n">{c.count}</span>
                </button>
              ))}
            </div>
            <p className="of-count" aria-live="polite">
              {shown.length ? o.docs_found(shown.length) : o.docs_none}
            </p>
            {groups.map(([c, list]) => (
              <section key={c} className="of-group" aria-labelledby={`dc-${c}`}>
                <h2 id={`dc-${c}`} className="of-h2">
                  {o.doc_cats[c] || c}
                </h2>
                <ul className="of-docs">
                  {list.map((x) => (
                    <DocCard key={x.id} d={x} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
