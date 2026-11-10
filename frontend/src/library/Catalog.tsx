// Kutubxona katalogi: bitta qatorli qidiruv (lotin/kirill bir xil), filtrlar, saralash, natijalar va tavsiya qatorlari
import { BookMarked, ChevronLeft, ChevronRight, Filter, Flame, GraduationCap, Library as LibIcon, Search, Sparkles, Star, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSite } from "../lib/site";
import { lib, type Facets, type SearchResult } from "./api";
import { BookRow, Cover, f, LibLang, Shelfbar, useLT, useReaderLink } from "./ui";

type HomeData = Awaited<ReturnType<typeof lib.home>>;

export function useFontLevel(): [number, (n: number) => void] {
  const [n, setN] = useState(() => {
    try {
      return Number(localStorage.getItem("lib_font") || 1);
    } catch {
      return 1;
    }
  });
  return [
    n,
    (v: number) => {
      setN(v);
      try {
        localStorage.setItem("lib_font", String(v));
      } catch {
        /* */
      }
    },
  ];
}

export function FontSwitch({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const T = useLT();
  return (
    <span className="lb-fontsw" role="group" aria-label={T.font_size}>
      {[0, 1, 2].map((i) => (
        <button key={i} className={value === i ? "on" : ""} onClick={() => onChange(i)} aria-pressed={value === i} title={T.font_size}>
          A
        </button>
      ))}
    </span>
  );
}

export default function LibraryCatalog() {
  const { lang } = useSite();
  return (
    <LibLang lang={lang}>
      <CatalogBody />
    </LibLang>
  );
}

const FILTER_KEYS = ["category", "faculty", "lang", "year_from", "year_to", "format", "available"] as const;

/** Katalog tanasi: ochiq saytda va kabinet ichida (LibNav konteksti kitob havolalarini belgilaydi) */
export function CatalogBody() {
  const T = useLT();
  const readerLink = useReaderLink();
  const [sp, setSp] = useSearchParams();
  const [home, setHome] = useState<HomeData | null>(null);
  const [res, setRes] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState(sp.get("q") || "");
  const [showF, setShowF] = useState(false);
  const [font, setFont] = useFontLevel();
  const active = !!(sp.get("q") || FILTER_KEYS.some((k) => sp.get(k)) || sp.get("sort"));
  useEffect(() => {
    lib.home().then(setHome).catch(() => setHome(null));
  }, []);
  useEffect(() => {
    setQ(sp.get("q") || "");
    if (!active) {
      setRes(null);
      return;
    }
    setBusy(true);
    const p: Record<string, string> = {};
    sp.forEach((v, k) => (p[k] = v));
    lib
      .search(p)
      .then(setRes)
      .catch(() => setRes({ items: [], total: 0, page: 1, pages: 0 }))
      .finally(() => setBusy(false));
  }, [sp, active]);
  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== "page") n.delete("page");
    setSp(n);
  };
  const submit = () => set("q", q.trim() || null);
  const facets = home?.facets;
  const chips = useMemo(() => FILTER_KEYS.filter((k) => sp.get(k)).map((k) => ({ k, v: sp.get(k) as string })), [sp]);
  return (
    <div className={`lb-root fs-${font}`}>
      <section className="lb-hero">
        <div className="container">
          <div className="lb-hero-top">
            <span className="lb-eyebrow">
              <LibIcon size={16} /> {T.library_full}
            </span>
            <FontSwitch value={font} onChange={setFont} />
          </div>
          <h1>{T.hero_title}</h1>
          <p>{T.hero_sub}</p>
          <form
            className="lb-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Search size={20} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.search_ph} aria-label={T.search_ph} autoComplete="off" />
            {q && (
              <button type="button" className="lb-search-x" onClick={() => (setQ(""), set("q", null))} aria-label="×">
                <X size={16} />
              </button>
            )}
            <button type="submit" className="lb-search-go">
              {T.search_btn}
            </button>
          </form>
          <div className="lb-hero-meta">
            <small>{T.search_hint}</small>
            {facets && (
              <span className="lb-hero-stats">
                <b>{facets.total.toLocaleString()}</b> {T.stat_books} · <b>{facets.copies.toLocaleString()}</b> {T.stat_copies} · <b>{facets.files.toLocaleString()}</b> {T.stat_files}
              </span>
            )}
          </div>
          {facets && !active && facets.categories.length > 0 && (
            <div className="lb-cats">
              {facets.categories.slice(0, 14).map((c) => (
                <button key={c.name} onClick={() => set("category", c.name)}>
                  {c.name} <i>{c.count}</i>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="container lb-body">
        {active ? (
          <div className={`lb-results ${showF ? "show-f" : ""}`}>
            <aside className="lb-filters" aria-label={T.filters}>
              <div className="lb-filters-h">
                <b>
                  <Filter size={16} /> {T.filters}
                </b>
                {chips.length > 0 && (
                  <button
                    onClick={() => {
                      const n = new URLSearchParams();
                      if (sp.get("q")) n.set("q", sp.get("q") as string);
                      setSp(n);
                    }}
                  >
                    {T.reset}
                  </button>
                )}
                <button className="lb-filters-close" onClick={() => setShowF(false)} aria-label={T.close}>
                  <X size={18} />
                </button>
              </div>
              <FilterBlock title={T.format}>
                <div className="lb-chipset">
                  {[
                    ["", T.all],
                    ["paper", T.fmt_paper],
                    ["ebook", T.fmt_ebook],
                    ["pdf", T.fmt_pdf],
                    ["epub", T.fmt_epub],
                    ["audio", T.fmt_audio],
                  ].map(([v, l]) => (
                    <button key={v} className={(sp.get("format") || "") === v ? "on" : ""} onClick={() => set("format", v || null)}>
                      {l}
                    </button>
                  ))}
                </div>
                <label className="lb-check">
                  <input type="checkbox" checked={sp.get("available") === "true"} onChange={(e) => set("available", e.target.checked ? "true" : null)} /> {T.available_now}
                </label>
              </FilterBlock>
              {facets && facets.categories.length > 0 && <FacetList title={T.subject} items={facets.categories} value={sp.get("category")} onPick={(v) => set("category", v)} />}
              {facets && facets.faculties.length > 0 && <FacetList title={T.faculty} items={facets.faculties} value={sp.get("faculty")} onPick={(v) => set("faculty", v)} />}
              {facets && facets.langs.length > 0 && (
                <FilterBlock title={T.language}>
                  <div className="lb-chipset">
                    {facets.langs.map((l) => (
                      <button key={l.name} className={sp.get("lang") === l.name ? "on" : ""} onClick={() => set("lang", sp.get("lang") === l.name ? null : l.name)}>
                        {l.name.toUpperCase()} <i>{l.count}</i>
                      </button>
                    ))}
                  </div>
                </FilterBlock>
              )}
              <FilterBlock title={T.year}>
                <div className="lb-years">
                  <input type="number" placeholder={String(facets?.years[0] || 1950)} value={sp.get("year_from") || ""} onChange={(e) => set("year_from", e.target.value || null)} aria-label={`${T.year} ${T.year_from}`} />
                  <span>—</span>
                  <input type="number" placeholder={String(facets?.years[1] || new Date().getFullYear())} value={sp.get("year_to") || ""} onChange={(e) => set("year_to", e.target.value || null)} aria-label={`${T.year} ${T.year_to}`} />
                </div>
              </FilterBlock>
            </aside>
            <main className="lb-list">
              <div className="lb-list-h">
                <div>
                  <h2>{busy ? "…" : res && res.total ? f(T.found, { n: res.total }) : T.nothing}</h2>
                  {res?.ms !== undefined && <small>{f(T.found_ms, { ms: res.ms })}</small>}
                  <div className="lb-active">
                    {chips.map((c) => (
                      <button key={c.k} onClick={() => set(c.k, null)}>
                        {c.k === "available" ? T.available_now : c.v} <X size={12} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="lb-list-tools">
                  <button className="lb-btn ghost lb-filters-open" onClick={() => setShowF(true)}>
                    <Filter size={16} /> {T.filters}
                  </button>
                  <label className="lb-sort">
                    {T.sort}
                    <select value={sp.get("sort") || ""} onChange={(e) => set("sort", e.target.value || null)}>
                      <option value="">{T.sort_relevance}</option>
                      <option value="popular">{T.sort_popular}</option>
                      <option value="rating">{T.sort_rating}</option>
                      <option value="new">{T.sort_new}</option>
                      <option value="alpha">{T.sort_alpha}</option>
                    </select>
                  </label>
                </div>
              </div>
              {res && !res.total && !busy && (
                <div className="lb-empty">
                  <Search size={30} />
                  <b>{T.nothing}</b>
                  <p>{T.nothing_hint}</p>
                </div>
              )}
              <div className={`lb-rows ${busy ? "busy" : ""}`}>
                {res?.items.map((b) => (
                  <BookRow key={b.id} b={b} />
                ))}
              </div>
              {res && res.pages > 1 && (
                <nav className="lb-pager" aria-label="pages">
                  <button disabled={res.page <= 1} onClick={() => set("page", String(res.page - 1))} aria-label={T.prev}>
                    <ChevronLeft size={18} />
                  </button>
                  <span>
                    {res.page} / {res.pages}
                  </span>
                  <button disabled={res.page >= res.pages} onClick={() => set("page", String(res.page + 1))} aria-label={T.next}>
                    <ChevronRight size={18} />
                  </button>
                </nav>
              )}
            </main>
          </div>
        ) : (
          <>
            {home?.continue && home.continue.length > 0 && (
              <section className="lb-continue">
                <h2>
                  <BookMarked size={20} /> {T.sec_continue}
                </h2>
                <div className="lb-continue-row">
                  {home.continue.map((p) => (
                    <Link key={p.file_id} {...readerLink(p)} className="lb-cont">
                      <Cover title={p.title || ""} src={p.cover} size="sm" />
                      <span>
                        <b>{p.title}</b>
                        <small>{p.authors?.join(", ")}</small>
                        <span className="lb-prog">
                          <i style={{ width: `${Math.round(p.percent)}%` }} />
                        </span>
                        <em>{Math.round(p.percent)}%</em>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <Shelfbar title={T.sec_for_you} items={home?.for_you} icon={<Sparkles size={20} />} />
            <Shelfbar title={T.sec_peers} items={home?.peers} icon={<Users size={20} />} />
            <Shelfbar title={T.sec_popular} items={home?.popular} icon={<Flame size={20} />} />
            <Shelfbar title={T.sec_teacher} items={home?.teacher_picks} icon={<GraduationCap size={20} />} />
            <Shelfbar title={T.sec_new} items={home?.newest} icon={<Sparkles size={20} />} />
            <Shelfbar title={T.sec_top} items={home?.top_rated} icon={<Star size={20} />} />
            {home && !home.newest.length && (
              <div className="lb-empty big">
                <LibIcon size={36} />
                <b>{T.library}</b>
                <p>{T.nothing_hint}</p>
              </div>
            )}
            {!home && (
              <div className="lb-skel">
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className="lb-cover md" />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FilterBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="lb-fblock">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function FacetList({ title, items, value, onPick }: { title: string; items: Facets["categories"]; value: string | null; onPick: (v: string | null) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 8);
  return (
    <FilterBlock title={title}>
      <div className="lb-facets">
        {shown.map((c) => (
          <button key={c.name} className={value === c.name ? "on" : ""} onClick={() => onPick(value === c.name ? null : c.name)}>
            <span>{c.name}</span>
            <i>{c.count}</i>
          </button>
        ))}
        {items.length > 8 && (
          <button className="more" onClick={() => setAll(!all)}>
            {all ? "−" : `+${items.length - 8}`}
          </button>
        )}
      </div>
    </FilterBlock>
  );
}
