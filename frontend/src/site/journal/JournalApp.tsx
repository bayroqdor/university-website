// Ilmiy jurnal (/journal/*): 4 bo'lim — bosh sahifa, arxiv (qidiruv bilan), «Jurnal haqida» (tahrir hay'ati, siyosatlar, aloqa — bitta sahifa),
// «Mualliflarga»; shuningdek son, maqola va qo'lyozma yuborish. Bo'limlar menyusi — sahifa sarlavhasi ichida (sayt menyusi ostida alohida qator yo'q).
// Eski manzillar (/journal/board, /ethics…, /journal/search) — serverda 301, ilova ichida <Navigate>.
// Google Scholar uchun meta teglar va JavaScript'siz matn serverda qo'yiladi (backend: university/journal.py → seo.page_meta).
import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, type Lang } from "../../lib/api";
import { copyText } from "../../lib/clipboard";
import { fmtDate } from "../../lib/i18n";
import { useSite } from "../../lib/site";
import { scrollToEl } from "../fx";
import { NotFound } from "../pages/Pages";
import { jApi, type Article, type ArticleBrief, type Home, type IssueRef, type Journal, type Person, type PreviewReason } from "./api";
import { JT, LANG_NAMES, type JDict } from "./i18n";
import "../../styles/journal.css";

const DocViewer = lazy(() => import("../../rich/DocViewer").then((m) => ({ default: m.DocViewer })));

type Ctx = { home: Home; j: Journal; t: JDict; lang: Lang; setPv: (r: PreviewReason[] | undefined) => void };
const JCtx = createContext<Ctx | null>(null);
const useJ = () => useContext(JCtx) as Ctx;
/** Sahifa o'z API javobidagi ko'rib chiqish sabablarini panelga beradi (faqat admin ko'radi) */
function usePagePreview(r: PreviewReason[] | undefined) {
  const { setPv } = useJ();
  useEffect(() => setPv(r), [r, setPv]);
}

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const issueName = (t: JDict, i: Pick<IssueRef, "volume" | "number" | "year">) => fill(t.issue_of, { v: i.volume, n: i.number, y: i.year });
const pagesOf = (a: ArticleBrief) => (a.pages.first && a.pages.last && a.pages.first !== a.pages.last ? `${a.pages.first}–${a.pages.last}` : a.pages.first || a.pages.last);
const textOf = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent || "").replace(/\s+/g, " ").trim();
};
function firstPara(html?: string): string {
  if (!html) return "";
  const m = html.match(/<p>([\s\S]*?)<\/p>/);
  return m ? textOf(m[1]) : "";
}

function Loading() {
  return <div className="jr-loading container" aria-busy="true" />;
}

export default function JournalApp() {
  const { lang } = useSite();
  const { pathname } = useLocation();
  const [home, setHome] = useState<Home | null | "404">(null);
  const [pagePv, setPagePv] = useState<{ path: string; r: PreviewReason[] } | null>(null);
  const setPv = useMemo(() => (r: PreviewReason[] | undefined) => setPagePv(r?.length ? { path: window.location.pathname, r } : null), []);
  useEffect(() => {
    let live = true;
    jApi
      .home(lang)
      .then((h) => live && setHome(h))
      .catch(() => live && setHome("404"));
    return () => {
      live = false;
    };
  }, [lang]);
  const t = JT[lang] || JT.uz;
  const value = useMemo(() => (home && home !== "404" ? { home, j: home.journal, t, lang, setPv } : null), [home, t, lang, setPv]);
  if (home === "404") return <NotFound />;
  if (!value) return <Loading />;
  // jurnal darajasidagi sabablar (yashirin, nomsiz) — har sahifada; sahifaniki — faqat o'sha sahifada
  const reasons = [...(value.home.preview || []).filter((r) => r.code === "no_title" || r.code === "journal_off"), ...(pagePv && pagePv.path === pathname ? pagePv.r : [])];
  return (
    <JCtx.Provider value={value}>
      <div className="jr">
        {reasons.length > 0 && <PreviewBar reasons={reasons} />}
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="archive" element={<ArchivePage />} />
          <Route path="issue/:key" element={<IssuePage />} />
          <Route path="article/:num/*" element={<ArticlePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="guidelines" element={<GuidelinesPage />} />
          <Route path="submit" element={<SubmitPage />} />
          {LEGACY.map((k) => (
            <Route key={k} path={k} element={<Legacy to={`/journal/about`} hash={k} />} />
          ))}
          <Route path="search" element={<Legacy to="/journal/archive" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </JCtx.Provider>
  );
}

/* ------------------------------------------------------------------ admin ko'rib chiqish rejimi (faqat «journal» ruxsatli admin ko'radi) */
const PAGE_HIDDEN = new Set(["no_title", "journal_off", "issue_draft", "article_draft", "no_issue"]);

function PreviewBar({ reasons }: { reasons: PreviewReason[] }) {
  const list = reasons.filter((r, n) => reasons.findIndex((x) => x.code === r.code && x.text === r.text) === n);
  const hidden = list.some((r) => PAGE_HIDDEN.has(r.code));
  const fixes = list.filter((r, n) => list.findIndex((x) => x.fix === r.fix) === n);
  return (
    <div className="jr-pv" role="status" lang="uz">
      <div className="container jr-pv-in">
        <p>
          <b>Ko‘rib chiqish rejimi</b> — {hidden ? `bu sahifa saytda hali ko‘rinmaydi: ${list.filter((r) => r.code !== "drafts_listed").map((r) => r.text).join("; ")}` : list.map((r) => r.text).join("; ")}.
        </p>
        <p className="jr-pv-acts">
          {fixes.map((r) => (
            <a key={r.fix} href={r.fix}>
              {r.fix_label}
            </a>
          ))}
        </p>
      </div>
    </div>
  );
}

function Draft({ on }: { on?: boolean }) {
  return on ? (
    <span className="jr-draft" lang="uz">
      Qoralama
    </span>
  ) : null;
}

/* ------------------------------------------------------------------ eski manzillar → yangi joyi (serverda 301: journal.legacy_redirect) */
const LEGACY = ["board", "peer-review", "ethics", "open-access", "indexing", "contacts"];

function Legacy({ to, hash }: { to: string; hash?: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}${hash ? `#${hash}` : ""}`} replace />;
}

/* ------------------------------------------------------------------ sahifa sarlavhasi: yo'l, sarlavha va jurnal bo'limlari (4 ta) */
type Crumb = { to: string; label: string };

function Crumbs({ items, current, currentLang }: { items: Crumb[]; current: string; currentLang?: string }) {
  const { t, lang } = useJ();
  const all: Crumb[] = [{ to: "/", label: t.crumb_home }, ...items];
  return (
    <nav className="jr-crumbs" aria-label={t.breadcrumb} lang={lang}>
      <ol>
        {all.map((c) => (
          <li key={c.to}>
            <Link to={c.to}>{c.label}</Link>
          </li>
        ))}
        <li aria-current="page">
          <span lang={currentLang} title={currentLang ? current : undefined}>
            {current}
          </span>
        </li>
      </ol>
    </nav>
  );
}

/** Jurnal bo'limlari: sarlavha ichidagi chiziqli yorliqlar (alohida rangli qator emas). Son sahifasi — «Arxiv», yuborish — «Mualliflarga». */
function JTabs() {
  const { t } = useJ();
  const { pathname } = useLocation();
  const p = pathname.replace(/\/+$/, "") || "/journal";
  const items: [string, string, boolean][] = [
    ["/journal", t.home, p === "/journal"],
    ["/journal/archive", t.archive, p === "/journal/archive" || p.startsWith("/journal/issue/")],
    ["/journal/about", t.about, p === "/journal/about"],
    ["/journal/guidelines", t.for_authors, p === "/journal/guidelines" || p === "/journal/submit"],
  ];
  return (
    <nav className="jr-tabs" aria-label={t.nav}>
      <ul>
        {items.map(([to, label, on]) => (
          <li key={to}>
            <Link to={to} className={on ? "on" : undefined} aria-current={on ? (p === to ? "page" : "true") : undefined}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function JHead({ crumbs = [], title, current, lead, children, aside, tabs = true }: { crumbs?: Crumb[]; title: ReactNode; current?: string; lead?: ReactNode; children?: ReactNode; aside?: ReactNode; tabs?: boolean }) {
  const { t } = useJ();
  const isHome = !crumbs.length && current === undefined;
  return (
    <section className={`page-hero jr-ph ${tabs ? "has-tabs" : ""}`}>
      <div className="container">
        <Crumbs items={isHome ? [] : [{ to: "/journal", label: t.journal }, ...crumbs]} current={isHome ? t.journal : current ?? String(title)} />
        <div className={`jr-ph-in ${aside ? "has-aside" : ""}`}>
          <div className="jr-ph-main">
            <h1 className="jr-h1">{title}</h1>
            {lead && <p className="jr-lead">{lead}</p>}
            {children}
          </div>
          {aside && <div className="jr-ph-side">{aside}</div>}
        </div>
        {tabs && <JTabs />}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ maqola qatori (ro'yxatlar) */
function ArticleItem({ a, showIssue = false, showSection = true }: { a: ArticleBrief; showIssue?: boolean; showSection?: boolean }) {
  const { t } = useJ();
  const pg = pagesOf(a);
  return (
    <li className="jr-item">
      {showSection && a.section.title && <p className="jr-item-sec">{a.section.title}</p>}
      <h3 className="jr-item-t" lang={a.lang}>
        <Link to={a.url}>{a.title}</Link>
      </h3>
      {a.authors.length > 0 && <p className="jr-item-au">{a.authors.map((x) => x.name).join(", ")}</p>}
      <p className="jr-item-meta">
        <Draft on={a.draft} />
        {showIssue && (
          <span>
            <Link to={a.issue.url}>{issueName(t, a.issue)}</Link>
          </span>
        )}
        {pg && <span>{fill(t.pp, { p: pg })}</span>}
        {a.doi && (
          <span>
            DOI:{" "}
            <a href={`https://doi.org/${a.doi}`} rel="noopener noreferrer" target="_blank">
              {a.doi}
            </a>
          </span>
        )}
        {a.pdf_url && (
          <span>
            <a href={a.pdf_url} data-no-office="" aria-label={`${t.pdf}: ${a.title}`}>
              {t.pdf}
            </a>
          </span>
        )}
      </p>
    </li>
  );
}

function ArticleList({ items, showIssue, groupBySection }: { items: ArticleBrief[]; showIssue?: boolean; groupBySection?: boolean }) {
  if (!groupBySection) {
    return (
      <ul className="jr-list">
        {items.map((a) => (
          <ArticleItem key={a.id} a={a} showIssue={showIssue} />
        ))}
      </ul>
    );
  }
  const groups: [string, ArticleBrief[]][] = [];
  for (const a of items) {
    const g = groups.find(([k]) => k === a.section.title);
    if (g) g[1].push(a);
    else groups.push([a.section.title, [a]]);
  }
  return (
    <>
      {groups.map(([title, list]) => (
        <section key={title || "-"} className="jr-group" aria-label={title || undefined}>
          {title && <h2 className="jr-h3">{title}</h2>}
          <ul className="jr-list">
            {list.map((a) => (
              <ArticleItem key={a.id} a={a} showSection={false} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ bosh sahifa */
function Facts() {
  const { j, t } = useJ();
  const rows: [string, ReactNode][] = [];
  if (j.issn_print) rows.push([t.issn, j.issn_print]);
  if (j.issn_online) rows.push([t.eissn, j.issn_online]);
  if (j.frequency) rows.push([t.frequency, j.frequency]);
  if (j.founded) rows.push([t.founded, j.founded]);
  if (j.publisher) rows.push([t.publisher, j.publisher]);
  if (j.license.code)
    rows.push([
      t.license,
      <a key="l" href={j.license.url} rel="license noopener noreferrer" target="_blank">
        {j.license.code}
      </a>,
    ]);
  if (!rows.length) return null;
  return (
    <dl className="jr-facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function HomePage() {
  const { home, j, t, lang } = useJ();
  const cur = home.current;
  usePagePreview(useMemo(() => home.preview?.filter((r) => r.code === "drafts_listed"), [home.preview]));
  const lead = firstPara(j.texts.about);
  const hasFacts = !!(j.issn_print || j.issn_online || j.frequency || j.founded || j.publisher || j.license.code);
  return (
    <>
      <JHead
        title={j.title}
        lead={lead || undefined}
        aside={
          j.cover || hasFacts ? (
            <>
              {j.cover && <img className="jr-cover" src={j.cover} alt={j.title} width={360} height={480} />}
              <Facts />
            </>
          ) : undefined
        }
      >
        <div className="jr-acts">
          {j.submissions_open && (
            <Link to="/journal/submit" className="bt bt-blue">
              {t.submit}
            </Link>
          )}
          <Link to="/journal/archive" className="tlink">
            {t.archive} <span aria-hidden>→</span>
          </Link>
        </div>
      </JHead>
      <section className="jr-sec" aria-labelledby="jr-cur">
        <div className="container">
          {cur ? (
            <div className="jr-cur">
              <div className="jr-cur-head">
                <p className="ey">{t.current}</p>
                <h2 className="jr-h2" id="jr-cur">
                  <Link to={cur.url}>{issueName(t, cur)}</Link>
                </h2>
                <Draft on={cur.draft} />
                {cur.title && <p className="jr-cur-theme">{cur.title}</p>}
                {cur.published_on && <p className="jr-muted">{fmtDate(cur.published_on, lang)}</p>}
                {cur.cover && <img className="jr-cover sm" src={cur.cover} alt={issueName(t, cur)} width={240} height={320} loading="lazy" />}
                {cur.pdf_url && (
                  <a className="tlink" href={cur.pdf_url} data-no-office="">
                    {t.full_pdf}
                  </a>
                )}
              </div>
              <div className="jr-cur-list">
                {cur.articles.length ? <ArticleList items={cur.articles} /> : <p className="jr-empty">{t.no_articles}</p>}
              </div>
            </div>
          ) : (
            <>
              <h2 className="jr-h2" id="jr-cur">
                {t.current}
              </h2>
              <p className="jr-empty">{t.no_issues}</p>
            </>
          )}
        </div>
      </section>
      {home.latest.length > 0 && (
        <section className="jr-sec alt" aria-labelledby="jr-latest">
          <div className="container">
            <h2 className="jr-h2" id="jr-latest">
              {t.latest}
            </h2>
            <ArticleList items={home.latest} showIssue />
          </div>
        </section>
      )}
      {j.texts.cfp && (
        <section className="jr-sec" aria-labelledby="jr-cfp">
          <div className="container jr-two">
            <h2 className="jr-h2" id="jr-cfp">
              {t.cfp}
            </h2>
            <div className="jr-text">
              <div className="jr-prose" dangerouslySetInnerHTML={{ __html: j.texts.cfp }} />
              <Link to="/journal/guidelines" className="tlink">
                {t.for_authors} <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </section>
      )}
      {j.indexing.length > 0 && (
        <section className={`jr-sec ${home.latest.length > 0 && !j.texts.cfp ? "" : "alt"}`} aria-labelledby="jr-idx">
          <div className="container">
            <h2 className="jr-h2" id="jr-idx">
              {t.indexing}
            </h2>
            <IndexList />
          </div>
        </section>
      )}
    </>
  );
}

function IndexList() {
  const { j } = useJ();
  return (
    <ul className="jr-index">
      {j.indexing.map((x) => {
        const inner = (
          <>
            {x.logo && <img src={x.logo} alt="" width={160} height={64} loading="lazy" />}
            <span>{x.title}</span>
          </>
        );
        return (
          <li key={x.title}>
            {x.url ? (
              <a href={x.url} target="_blank" rel="noopener noreferrer">
                {inner}
              </a>
            ) : (
              <div>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ arxiv va son */
const SEARCH_KEYS = ["q", "author", "keyword", "year", "section"] as const;
type SearchKey = (typeof SEARCH_KEYS)[number];

/** Arxiv: yuqorida maqolalar qidiruvi (eski /journal/search shu yerga), so'rov bo'lmasa — yillar bo'yicha sonlar */
function ArchivePage() {
  const { t, lang, home, j } = useJ();
  const [sp, setSp] = useSearchParams();
  const cur = Object.fromEntries(SEARCH_KEYS.map((k) => [k, sp.get(k) || ""])) as Record<SearchKey, string>;
  const active = SEARCH_KEYS.some((k) => cur[k]);
  const qs = sp.toString();
  const [form, setForm] = useState(cur);
  const [d, setD] = useState<(IssueRef & { articles: number })[] | null>(null);
  const [pv, setPvR] = useState<PreviewReason[]>();
  const [res, setRes] = useState<{ items: ArticleBrief[]; total: number; preview?: PreviewReason[] } | null>(null);
  usePagePreview(active ? res?.preview : pv);
  useEffect(() => {
    jApi
      .archive(lang)
      .then((r) => {
        setD(r.issues);
        setPvR(r.preview);
      })
      .catch(() => setD([]));
  }, [lang]);
  useEffect(() => {
    setForm(cur);
    if (!active) {
      setRes(null);
      return;
    }
    setRes(null);
    jApi.search(cur, lang).then(setRes).catch(() => setRes({ items: [], total: 0 }));
  }, [qs, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = new URLSearchParams();
    for (const k of SEARCH_KEYS) if (form[k].trim()) n.set(k, form[k].trim());
    setSp(n);
  };
  const set = (k: SearchKey) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const years = d ? [...new Set(d.map((i) => i.year))] : [];
  return (
    <>
      <JHead title={t.archive} />
      <section className="jr-sec">
        <div className="container">
          <form className="jr-search" role="search" aria-label={t.search} onSubmit={submit}>
            <div className="jr-f jr-f-q">
              <label htmlFor="js-q">{t.q}</label>
              <input id="js-q" type="search" value={form.q} onChange={set("q")} autoComplete="off" />
            </div>
            {/* eski havolalardagi muallif / kalit so'z filtrlari — faqat manzilda bo'lsa ko'rinadi */}
            {cur.author && (
              <div className="jr-f">
                <label htmlFor="js-a">{t.author_f}</label>
                <input id="js-a" value={form.author} onChange={set("author")} autoComplete="off" />
              </div>
            )}
            {cur.keyword && (
              <div className="jr-f">
                <label htmlFor="js-k">{t.keyword_f}</label>
                <input id="js-k" value={form.keyword} onChange={set("keyword")} autoComplete="off" />
              </div>
            )}
            <div className="jr-f">
              <label htmlFor="js-y">{t.year}</label>
              <select id="js-y" value={form.year} onChange={set("year")}>
                <option value="">{t.all_years}</option>
                {home.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            {j.sections.length > 0 && (
              <div className="jr-f">
                <label htmlFor="js-s">{t.section}</label>
                <select id="js-s" value={form.section} onChange={set("section")}>
                  <option value="">{t.all_sections}</option>
                  {j.sections.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="jr-f end">
              <button type="submit" className="bt bt-blue">
                {t.find}
              </button>
            </div>
          </form>
          <div aria-live="polite">
            {active &&
              (!res ? (
                <Loading />
              ) : (
                <>
                  <p className="jr-found">
                    <span>
                      {t.found}: {res.total}
                    </span>
                    <Link to="/journal/archive" className="tlink">
                      {t.all_issues}
                    </Link>
                  </p>
                  {res.items.length ? <ArticleList items={res.items} showIssue /> : <p className="jr-empty">{t.nothing}</p>}
                </>
              ))}
          </div>
          {!active &&
            (!d ? (
              <Loading />
            ) : !d.length ? (
              <p className="jr-empty">{t.no_issues}</p>
            ) : (
              years.map((y) => (
                <section key={y} className="jr-year" aria-labelledby={`y${y}`}>
                  <h2 className="jr-h2" id={`y${y}`}>
                    {y}
                  </h2>
                  <ul className="jr-issues">
                    {d
                      .filter((i) => i.year === y)
                      .map((i) => (
                        <li key={i.id}>
                          <Link to={i.url} className="jr-issue">
                            {i.cover && <img src={i.cover} alt="" width={120} height={160} loading="lazy" />}
                            <span className="jr-issue-t">{issueName(t, i)}</span>
                            <Draft on={i.draft} />
                            {i.title && <span className="jr-issue-s">{i.title}</span>}
                            <span className="jr-muted">
                              {[i.published_on && fmtDate(i.published_on, lang), `${i.articles} ${t.articles}`].filter(Boolean).join(" · ")}
                            </span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                </section>
              ))
            ))}
        </div>
      </section>
    </>
  );
}

function IssuePage() {
  const { key = "" } = useParams();
  const { t, lang } = useJ();
  const [d, setD] = useState<{ issue: IssueRef; articles: ArticleBrief[]; preview?: PreviewReason[] } | null | "404">(null);
  usePagePreview(d && d !== "404" ? d.preview : undefined);
  useEffect(() => {
    setD(null);
    jApi.issue(key, lang).then(setD).catch(() => setD("404"));
  }, [key, lang]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const i = d.issue;
  return (
    <>
      <JHead crumbs={[{ to: "/journal/archive", label: t.archive }]} title={issueName(t, i)} lead={i.title || undefined}>
        <p className="jr-head-meta">
          {i.published_on && <span>{fmtDate(i.published_on, lang)}</span>}
          {i.pdf_url && (
            <a className="tlink" href={i.pdf_url} data-no-office="">
              {t.full_pdf}
            </a>
          )}
        </p>
      </JHead>
      <section className="jr-sec">
        <div className={`container ${i.cover ? "jr-issue-grid" : ""}`}>
          {i.cover && <img className="jr-cover" src={i.cover} alt={issueName(t, i)} width={300} height={400} />}
          <div>{d.articles.length ? <ArticleList items={d.articles} groupBySection /> : <p className="jr-empty">{t.no_articles}</p>}</div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ maqola */
function OrcidLink({ id, name }: { id: string; name: string }) {
  const { t } = useJ();
  return (
    <a className="jr-orcid" href={`https://orcid.org/${id}`} target="_blank" rel="noopener noreferrer" aria-label={`${t.orcid}: ${name}`} title={`ORCID ${id}`}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="12" fill="#A6CE39" />
        <path fill="#fff" d="M8.3 17.3H6.9V7.3h1.4v10zM7.6 4.9a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zM10.3 7.3h3.7c3.5 0 5.1 2.5 5.1 5 0 2.7-2.1 5-5.1 5h-3.7v-10zm1.4 8.7h2.2c3.1 0 3.8-2.4 3.8-3.7 0-2.1-1.3-3.7-3.8-3.7h-2.2V16z" />
      </svg>
    </a>
  );
}

function CiteBox({ a }: { a: Article }) {
  const { t } = useJ();
  const [style, setStyle] = useState<"apa" | "gost" | "mla">("apa");
  const [done, setDone] = useState(false);
  const labels: Record<string, string> = { apa: "APA", gost: "ГОСТ", mla: "MLA" };
  return (
    <section className="jr-box" aria-labelledby="jr-cite">
      <h2 className="jr-box-t" id="jr-cite">
        {t.cite}
      </h2>
      <div className="jr-seg" role="group" aria-label={t.cite}>
        {(["apa", "gost", "mla"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={style === k} onClick={() => setStyle(k)}>
            {labels[k]}
          </button>
        ))}
      </div>
      <p className="jr-cite" lang={a.lang}>
        {a.cite[style]}
      </p>
      <div className="jr-cite-acts">
        <button
          type="button"
          className="jr-btn"
          onClick={async () => {
            if (await copyText(a.cite[style])) {
              setDone(true);
              window.setTimeout(() => setDone(false), 2000);
            }
          }}
        >
          {done ? t.copied : t.copy}
        </button>
        <a className="jr-btn ghost" href={a.bib_url} download>
          BibTeX
        </a>
        <a className="jr-btn ghost" href={a.ris_url} download>
          RIS
        </a>
      </div>
      <span className="jr-sr" role="status">
        {done ? t.copied : ""}
      </span>
    </section>
  );
}

function ArticlePage() {
  const { num = "" } = useParams();
  const { t, lang, j } = useJ();
  const nav = useNavigate();
  const [d, setD] = useState<Article | null | "404">(null);
  const [pv, setPvR] = useState<PreviewReason[]>();
  usePagePreview(pv);
  const [absLang, setAbsLang] = useState("");
  const counted = useRef("");
  useEffect(() => {
    setD(null);
    jApi
      .article(num, lang)
      .then((r) => {
        setD(r.article);
        setPvR(r.preview);
        const ks = Object.keys(r.article.abstract);
        setAbsLang(ks.includes(lang) ? lang : ks.includes(r.article.lang) ? r.article.lang : ks[0] || "");
        if (window.location.pathname !== r.article.url) nav(r.article.url + window.location.search, { replace: true });
        if (counted.current !== num) {
          counted.current = num;
          jApi.view(r.article.num).catch(() => null);
        }
      })
      .catch(() => setD("404"));
  }, [num, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const a = d;
  const pg = pagesOf(a);
  const absKeys = Object.keys(a.abstract);
  const abs = a.abstract[absLang];
  const kwLang = a.keywords[absLang]?.length ? absLang : a.keywords[a.lang]?.length ? a.lang : ""; // tanlangan til → maqola tili
  const kws = kwLang ? a.keywords[kwLang] : [];
  const langName = (code: string) => LANG_NAMES[code]?.[lang] || code.toUpperCase();
  const dateRows = (["received", "revised", "accepted", "published"] as const).filter((k) => a.dates[k]);
  return (
    <article className="jr-article" lang={a.lang}>
      <div className="container">
        <Crumbs items={[{ to: "/journal", label: t.journal }, ...(a.issue.id ? [{ to: a.issue.url, label: issueName(t, a.issue) }] : [])]} current={a.title} currentLang={a.lang} />
        <div className="jr-art-grid">
          <div className="jr-art-main">
            {a.section.title && (
              <p className="ey" lang={lang}>
                {a.section.title}
              </p>
            )}
            <h1 className="jr-art-h1">{a.title}</h1>
            {Object.entries(a.title_i18n).map(([k, v]) => (
              <p key={k} className="jr-alt-title" lang={k}>
                {v}
              </p>
            ))}
            <ul className="jr-authors" aria-label={t.authors}>
              {a.authors.map((p, n) => (
                <li key={n}>
                  <span>{p.name}</span>
                  {p.aff.length > 0 && <sup>{p.aff.join(",")}</sup>}
                  {p.orcid && <OrcidLink id={p.orcid} name={p.name} />}
                </li>
              ))}
            </ul>
            {a.affiliations.length > 0 && (
              <ol className="jr-affs">
                {a.affiliations.map((x, n) => (
                  <li key={x}>
                    <sup>{n + 1}</sup> {x}
                  </li>
                ))}
              </ol>
            )}
            {abs && (
              <section className="jr-abs" aria-labelledby="jr-abs-t">
                <div className="jr-abs-head">
                  <h2 className="jr-h3" id="jr-abs-t" lang={lang}>
                    {t.abstract}
                  </h2>
                  {absKeys.length > 1 && (
                    <div className="jr-seg" role="group" aria-label={t.abstract} lang={lang}>
                      {absKeys.map((k) => (
                        <button key={k} type="button" aria-pressed={absLang === k} onClick={() => setAbsLang(k)}>
                          {langName(k)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="jr-prose" lang={absLang} dangerouslySetInnerHTML={{ __html: abs.html }} />
                {kws.length > 0 && (
                  <p className="jr-kw">
                    <b lang={lang}>{t.keywords}:</b> <span lang={kwLang}>{kws.join(", ")}</span>
                  </p>
                )}
              </section>
            )}
            {a.pdf_view && (
              <section className="jr-full" aria-labelledby="jr-full-t" lang={lang}>
                <h2 className="jr-h3" id="jr-full-t">
                  {t.full_text}
                </h2>
                <div className="jr-viewer">
                  <Suspense fallback={<div className="jr-loading" />}>
                    <DocViewer src={a.pdf_view} title={a.title} lang={lang} />
                  </Suspense>
                </div>
              </section>
            )}
            {a.references.length > 0 && (
              <section className="jr-refs" aria-labelledby="jr-refs-t">
                <h2 className="jr-h3" id="jr-refs-t" lang={lang}>
                  {t.references}
                </h2>
                <ol>
                  {a.references.map((r, n) => (
                    <li key={n}>{r}</li>
                  ))}
                </ol>
              </section>
            )}
            {a.funding && (
              <section className="jr-refs" aria-labelledby="jr-fund-t">
                <h2 className="jr-h3" id="jr-fund-t" lang={lang}>
                  {t.funding}
                </h2>
                <p>{a.funding}</p>
              </section>
            )}
            {j.submissions_open && (
              <p className="jr-art-end" lang={lang}>
                <Link to="/journal/submit" className="tlink">
                  {t.submit_yours} <span aria-hidden>→</span>
                </Link>
              </p>
            )}
          </div>
          <aside className="jr-art-side" lang={lang}>
            {a.pdf_url && (
              <div className="jr-pdf-acts">
                <a className="bt bt-blue" href={a.pdf_url} download data-no-office="">
                  {t.download_pdf}
                </a>
                <a className="tlink" href={a.pdf_url} target="_blank" rel="noopener" data-no-office="">
                  {t.open_pdf}
                </a>
              </div>
            )}
            <dl className="jr-dl">
              {a.issue.id && (
                <div>
                  <dt>{t.home}</dt>
                  <dd>
                    <Link to={a.issue.url}>
                      {j.title}, {issueName(t, a.issue)}
                    </Link>
                  </dd>
                </div>
              )}
              {pg && (
                <div>
                  <dt>{t.pages}</dt>
                  <dd>{pg}</dd>
                </div>
              )}
              {a.doi && (
                <div>
                  <dt>DOI</dt>
                  <dd>
                    <a href={`https://doi.org/${a.doi}`} target="_blank" rel="noopener noreferrer">
                      https://doi.org/{a.doi}
                    </a>
                  </dd>
                </div>
              )}
              {a.udc && (
                <div>
                  <dt>{lang === "en" ? "UDC" : lang === "ru" ? "УДК" : "UDK"}</dt>
                  <dd>{a.udc}</dd>
                </div>
              )}
              <div>
                <dt>{t.lang}</dt>
                <dd>{langName(a.lang)}</dd>
              </div>
              {dateRows.map((k) => (
                <div key={k}>
                  <dt>{t[k]}</dt>
                  <dd>{fmtDate(a.dates[k], lang)}</dd>
                </div>
              ))}
              <div>
                <dt>{t.license}</dt>
                <dd>
                  <a href={a.license.url} rel="license noopener noreferrer" target="_blank">
                    {a.license.code}
                  </a>
                </dd>
              </div>
              <div>
                <dt>{t.views}</dt>
                <dd>{a.views}</dd>
              </div>
              <div>
                <dt>{t.downloads}</dt>
                <dd>{a.downloads}</dd>
              </div>
            </dl>
            <CiteBox a={a} />
            <p className="jr-license">{fill(t.license_text, { code: a.license.code })}</p>
          </aside>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ «Jurnal haqida»: bitta sahifa, chapda bo'limlar ro'yxati */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((x) => x.replace(/^[^\p{L}]+/u, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0].toUpperCase())
    .join("");

function PersonCard({ p }: { p: Person }) {
  const { t } = useJ();
  return (
    <li className="jr-person">
      {p.photo ? (
        <img src={p.photo} alt="" width={64} height={64} loading="lazy" />
      ) : (
        <span className="jr-ini" aria-hidden="true">
          {initials(p.name)}
        </span>
      )}
      <div>
        <h4 className="jr-person-n">{p.name}</h4>
        {p.position && <p className="jr-person-pos">{p.position}</p>}
        {(p.degree || p.affiliation || p.country) && <p className="jr-muted">{[p.degree, p.affiliation, p.country].filter(Boolean).join(", ")}</p>}
        {p.orcid && (
          <p className="jr-person-orcid">
            <OrcidLink id={p.orcid} name={p.name} />
            <a href={`https://orcid.org/${p.orcid}`} target="_blank" rel="noopener noreferrer" aria-label={`${t.orcid}: ${p.name}`}>
              {p.orcid}
            </a>
          </p>
        )}
      </div>
    </li>
  );
}

const ROLES = ["editor_in_chief", "deputy", "secretary", "member", "international"] as const;

function Board() {
  const { j, t } = useJ();
  return (
    <>
      {ROLES.map((r) => {
        const list = j.board.filter((p) => p.role === r);
        if (!list.length) return null;
        return (
          <div key={r} className="jr-group">
            <h3 className="jr-h4">{t[r]}</h3>
            <ul className="jr-people">
              {list.map((p) => (
                <PersonCard key={p.id} p={p} />
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function Contacts() {
  const { j, t } = useJ();
  if (!(j.email || j.phone || j.address)) return null;
  return (
    <dl className="jr-dl wide">
      {j.email && (
        <div>
          <dt>{t.email}</dt>
          <dd>
            <a href={`mailto:${j.email}`}>{j.email}</a>
          </dd>
        </div>
      )}
      {j.phone && (
        <div>
          <dt>{t.phone}</dt>
          <dd>
            <a href={`tel:${j.phone.replace(/[^\d+]/g, "")}`}>{j.phone}</a>
          </dd>
        </div>
      )}
      {j.address && (
        <div>
          <dt>{t.address}</dt>
          <dd>{j.address}</dd>
        </div>
      )}
    </dl>
  );
}

const Prose = ({ html }: { html?: string }) => (html ? <div className="jr-prose" dangerouslySetInnerHTML={{ __html: html }} /> : null);

/** Bo'limlar (langar = eski alohida sahifa manzili; backend: journal.ABOUT_ANCHORS). Mazmuni yo'q bo'lim chiqmaydi. */
function useAboutSections(): [string, string, ReactNode][] {
  const { j, t } = useJ();
  const x = j.texts;
  const out: [string, string, ReactNode | false][] = [
    ["about", t.overview, (x.about || j.issn_print || j.issn_online) && (
      <>
        <Prose html={x.about} />
        <Facts />
      </>
    )],
    ["board", t.board, j.board.length > 0 && <Board />],
    ["peer-review", t.peer_review_t, !!x.peer_review && <Prose html={x.peer_review} />],
    ["ethics", t.ethics, !!x.ethics && <Prose html={x.ethics} />],
    ["open-access", t.open_access_t, (x.open_access || j.license.code) && (
      <>
        <Prose html={x.open_access} />
        {j.license.code && (
          <p className="jr-lic">
            {t.license}:{" "}
            <a href={j.license.url} rel="license noopener noreferrer" target="_blank">
              {j.license.code}
            </a>
          </p>
        )}
      </>
    )],
    ["indexing", t.indexing, j.indexing.length > 0 && <IndexList />],
    ["contacts", t.contacts, (x.contacts || j.email || j.phone || j.address) && (
      <>
        <Prose html={x.contacts} />
        <Contacts />
      </>
    )],
  ];
  return out.filter((s): s is [string, string, ReactNode] => !!s[2]);
}

const headOffset = () => (parseFloat(getComputedStyle(document.querySelector(".site.uni") || document.documentElement).getPropertyValue("--nb-h")) || 84) + 24;

function AboutPage() {
  const { t } = useJ();
  const { hash } = useLocation();
  const secs = useAboutSections();
  const ids = secs.map((s) => s[0]).join(",");
  const [cur, setCur] = useState(secs[0]?.[0] || "");
  // bo'lim kuzatuvi: sarlavhasi ekran tepasidan o'tgan oxirgi bo'lim — joriy
  useEffect(() => {
    const list = ids.split(",").filter(Boolean);
    let raf = 0;
    const calc = () => {
      raf = 0;
      const top = headOffset() + 40;
      let on = list[0] || "";
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= top) on = id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) on = list[list.length - 1] || on;
      setCur(on);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(calc);
    };
    calc();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ids]);
  // to'g'ridan-to'g'ri /journal/about#board (yoki eski /journal/board dan) ochilganda — bo'limga
  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1));
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    const h = window.setTimeout(() => scrollToEl(el, -headOffset()), 60);
    return () => window.clearTimeout(h);
  }, [hash]);
  const go = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    scrollToEl(el, -headOffset());
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${id}`);
    el.focus({ preventScroll: true });
    setCur(id);
  };
  return (
    <>
      <JHead title={t.about} />
      <section className="jr-sec">
        <div className="container jr-about">
          {secs.length > 1 && (
            <nav className="jr-toc" aria-label={t.toc}>
              <p className="ey" aria-hidden="true">
                {t.toc}
              </p>
              <ul>
                {secs.map(([id, label]) => (
                  <li key={id}>
                    <a href={`#${id}`} onClick={go(id)} className={cur === id ? "on" : undefined} aria-current={cur === id ? "location" : undefined}>
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <div className="jr-about-main">
            {secs.length ? (
              secs.map(([id, label, body]) => (
                <section key={id} id={id} className="jr-asec" aria-labelledby={`${id}-h`} tabIndex={-1}>
                  <h2 className="jr-h3" id={`${id}-h`}>
                    {label}
                  </h2>
                  {body}
                </section>
              ))
            ) : (
              <p className="jr-empty">{t.empty_page}</p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ «Mualliflarga»: talablar, siyosatlarga havolalar va «Maqola yuborish» */
function GuidelinesPage() {
  const { j, t } = useJ();
  const links: [string, string][] = [];
  if (j.texts.peer_review) links.push(["/journal/about#peer-review", t.peer_review_t]);
  if (j.texts.ethics) links.push(["/journal/about#ethics", t.ethics]);
  if (j.texts.open_access || j.license.code) links.push(["/journal/about#open-access", t.open_access_t]);
  return (
    <>
      <JHead title={t.for_authors} />
      <section className="jr-sec">
        <div className="container jr-guide">
          <aside className="jr-guide-side" aria-label={t.submit}>
            {j.submissions_open ? (
              <Link to="/journal/submit" className="bt bt-blue">
                {t.submit}
              </Link>
            ) : (
              <p className="jr-muted">{t.closed}</p>
            )}
            {links.length > 0 && (
              <ul className="jr-guide-links">
                {links.map(([to, label]) => (
                  <li key={to}>
                    <Link to={to}>{label}</Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          <div className="jr-text">
            {j.texts.guidelines ? <Prose html={j.texts.guidelines} /> : <p className="jr-empty">{t.empty_page}</p>}
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ qo'lyozma yuborish */
function SubmitPage() {
  const { t, j, lang } = useJ();
  const [f, setF] = useState({ name: "", email: "", affiliation: "", title: "", abstract: "", phone: "", message: "", hp: "" });
  const [file, setFile] = useState<File | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [fail, setFail] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    for (const k of ["name", "affiliation", "title"] as const) if (f[k].trim().length < (k === "title" ? 5 : k === "name" ? 3 : 2)) e[k] = t.req;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email.trim())) e.email = f.email.trim() ? t.bad_email : t.req;
    if (f.abstract.trim().length < 50) e.abstract = f.abstract.trim() ? t.short_abstract : t.req;
    if (!file) e.file = t.req;
    else if (!/\.(pdf|docx)$/i.test(file.name)) e.file = t.bad_file;
    else if (file.size > 20 * 1024 * 1024) e.file = t.too_large;
    return e;
  };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setFail("");
    const e = validate();
    setErrs(e);
    if (Object.keys(e).length) {
      const first = Object.keys(e)[0];
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    const fd = new FormData();
    for (const [k, v] of Object.entries(f)) fd.append(k, v);
    fd.append("lang", lang);
    if (file) fd.append("file", file);
    setBusy(true);
    try {
      const r = await jApi.submit(fd);
      setDone(r.ticket ?? 0);
    } catch (er) {
      const code = er instanceof ApiError ? er.detail : "";
      setFail(code === "bad_file_type" ? t.bad_file : code === "too_large" ? t.too_large : code === "too_many_attempts" ? t.too_many : code === "closed" ? t.closed : t.error);
    } finally {
      setBusy(false);
    }
  };
  const field = (k: keyof typeof f, label: string, opts: { area?: boolean; type?: string; wide?: boolean; required?: boolean; auto?: string } = {}) => (
    <div className={`jr-f ${opts.wide ? "wide" : ""}`}>
      <label htmlFor={`jf-${k}`}>
        {label}
        {opts.required !== false && <span aria-hidden> *</span>}
      </label>
      {opts.area ? (
        <textarea
          id={`jf-${k}`}
          name={k}
          rows={k === "abstract" ? 7 : 4}
          value={f[k]}
          onChange={(e) => setF({ ...f, [k]: e.target.value })}
          aria-invalid={!!errs[k]}
          aria-describedby={errs[k] ? `jf-${k}-e` : undefined}
          required={opts.required !== false}
        />
      ) : (
        <input
          id={`jf-${k}`}
          name={k}
          type={opts.type || "text"}
          value={f[k]}
          autoComplete={opts.auto}
          onChange={(e) => setF({ ...f, [k]: e.target.value })}
          aria-invalid={!!errs[k]}
          aria-describedby={errs[k] ? `jf-${k}-e` : undefined}
          required={opts.required !== false}
        />
      )}
      {errs[k] && (
        <p className="jr-err" id={`jf-${k}-e`}>
          {errs[k]}
        </p>
      )}
    </div>
  );
  return (
    <>
      <JHead crumbs={[{ to: "/journal/guidelines", label: t.for_authors }]} title={t.submit} />
      <section className="jr-sec">
        <div className="container jr-submit-grid">
          <div className="jr-text">
            <h2 className="jr-h3">{t.guidelines}</h2>
            {j.texts.guidelines ? <div className="jr-prose" dangerouslySetInnerHTML={{ __html: j.texts.guidelines }} /> : <p className="jr-empty">{t.empty_page}</p>}
            {(j.texts.ethics || j.texts.peer_review) && (
              <p className="jr-links">
                {j.texts.peer_review && (
                  <Link to="/journal/about#peer-review" className="tlink">
                    {t.peer_review_t}
                  </Link>
                )}
                {j.texts.ethics && (
                  <Link to="/journal/about#ethics" className="tlink">
                    {t.ethics}
                  </Link>
                )}
              </p>
            )}
          </div>
          <div className="jr-card">
            <h2 className="jr-h3">{t.form}</h2>
            {!j.submissions_open ? (
              <p className="jr-empty">{t.closed}</p>
            ) : done !== null ? (
              <div role="status" className="jr-done">
                <p className="jr-done-t">{t.sent}</p>
                <p>{fill(t.sent_t, { n: done })}</p>
                <button
                  type="button"
                  className="jr-btn ghost"
                  onClick={() => {
                    setDone(null);
                    setF({ name: f.name, email: f.email, affiliation: f.affiliation, title: "", abstract: "", phone: f.phone, message: "", hp: "" });
                    setFile(null);
                  }}
                >
                  {t.again}
                </button>
              </div>
            ) : (
              <form ref={formRef} className="jr-form" onSubmit={submit} noValidate>
                {field("name", t.f_name, { auto: "name" })}
                {field("email", t.f_email, { type: "email", auto: "email" })}
                {field("affiliation", t.f_aff, { wide: true, auto: "organization" })}
                {field("title", t.f_title, { wide: true })}
                {field("abstract", t.f_abstract, { wide: true, area: true })}
                {field("phone", t.f_phone, { type: "tel", required: false, auto: "tel" })}
                <div className="jr-f wide">
                  <label htmlFor="jf-file">
                    {t.f_file}
                    <span aria-hidden> *</span>
                  </label>
                  <input
                    ref={fileRef}
                    id="jf-file"
                    name="file"
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    aria-invalid={!!errs.file}
                    aria-describedby={errs.file ? "jf-file-e" : undefined}
                    required
                  />
                  {errs.file && (
                    <p className="jr-err" id="jf-file-e">
                      {errs.file}
                    </p>
                  )}
                </div>
                {field("message", t.f_message, { wide: true, area: true, required: false })}
                <div className="jr-hp" aria-hidden="true">
                  <label htmlFor="jf-hp">Website</label>
                  <input id="jf-hp" name="hp" tabIndex={-1} autoComplete="off" value={f.hp} onChange={(e) => setF({ ...f, hp: e.target.value })} />
                </div>
                {fail && (
                  <p className="jr-err wide" role="alert">
                    {fail}
                  </p>
                )}
                <div className="jr-f wide">
                  <button type="submit" className="bt bt-blue" disabled={busy}>
                    {busy ? t.sending : t.send}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
