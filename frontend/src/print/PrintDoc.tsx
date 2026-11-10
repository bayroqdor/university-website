// Chop etish uchun sahifalar: yangilik/sahifa/yo'nalish PDF'i (A4) va ijtimoiy tarmoq kartasi (1200×630).
// Server bu sahifalarni headless Chromium'da ochadi va sahifa «tayyor» belgisini qo'ygach PDF yoki PNG oladi.
import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { Lang, Rich } from "../lib/api";
import { DICTS, fmtDate, type Dict } from "../lib/i18n";
import { ChartLabels } from "../rich/labels";
import { PrintMode } from "../rich/print";
import "../styles/print.css";

const RichHtml = lazy(() => import("../rich/RichHtml"));

declare global {
  interface Window {
    __PRINT_READY?: boolean;
    __PRINT_ERROR?: string;
  }
}

type PrintItem = Rich & { feature_image?: string; cover?: string; photo?: string; tags?: string[]; accent?: string; starts?: string | null; place?: string; position?: string; degree?: string; category?: string };

interface PrintData {
  section: string | null;
  lang: Lang;
  url: string;
  base: string;
  host: string;
  qr: string;
  item: PrintItem | null;
  uni: { name: string; short_name: string; abbr: string; tagline: string; logo: string; address: string; email: string; phones: string[]; keywords: string[]; founded: string };
  site: { title: string; accent: string; lang: Lang; logo_text: string; description: string };
  counts: Record<string, number>;
  generated: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function usePrintData(path: string): PrintData | null {
  const [d, setD] = useState<PrintData | null>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.add("print-root");
    fetch(path)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((x: PrintData) => {
        document.documentElement.style.setProperty("--accent", x.site.accent);
        document.documentElement.lang = x.lang;
        document.title = x.item?.title || x.site.title;
        setD(x);
      })
      .catch((e) => {
        window.__PRINT_ERROR = `load: ${e}`;
      });
  }, [path]);
  return d;
}

/** Shriftlar, rasmlar, formulalar va grafiklar chizilishini kutib, «tayyor» belgisini qo'yish. */
async function markReady(root: HTMLElement | null, waitBody: boolean) {
  try {
    if (waitBody) {
      for (let i = 0; i < 80 && !root?.querySelector(".prose > *"); i++) await sleep(100);
    }
    await document.fonts.ready;
    const imgs = Array.from(root?.querySelectorAll("img") || []);
    await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    for (let i = 0; i < 150; i++) {
      const needCharts = root?.querySelectorAll('figure[data-type="chart"]').length || 0;
      const done = root?.querySelectorAll(".chart-canvas[data-rendered]").length || 0;
      if (done >= needCharts) break;
      await sleep(100);
    }
    await sleep(350);
    await document.fonts.ready;
  } finally {
    window.__PRINT_READY = true;
  }
}

type Node = { type?: string; text?: string; attrs?: { level?: number }; content?: Node[] };
/** Muqova uchun mundarija: 2-darajali sarlavhalar. */
function outline(it: { content?: unknown; html?: string }): string[] {
  const out: string[] = [];
  const text = (n: Node): string => (n.text || "") + (n.content || []).map(text).join("");
  const walk = (n: Node) => {
    if (n.type === "heading" && n.attrs?.level === 2) out.push(text(n));
    else (n.content || []).forEach(walk);
  };
  if (it.content && typeof it.content === "object") walk(it.content as Node);
  else if (it.html) new DOMParser().parseFromString(it.html, "text/html").querySelectorAll("h2").forEach((h) => out.push(h.textContent || ""));
  return out.map((x) => x.trim()).filter(Boolean).slice(0, 8);
}

const cssStr = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;
const cut = (v: string, n: number) => (v.length > n ? v.slice(0, n - 1).trimEnd() + "…" : v);

function Avatar({ d, size }: { d: PrintData; size: number }) {
  return (
    <span className="p-avatar" style={{ width: size, height: size, fontSize: size * 0.3 }}>
      {d.uni.logo ? <img src={d.uni.logo} alt="" /> : d.site.logo_text}
    </span>
  );
}

function Orbit({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 400" aria-hidden>
      <circle cx="200" cy="200" r="196" fill="none" stroke="var(--line-2)" strokeWidth="1.2" />
      <circle cx="200" cy="200" r="150" fill="none" stroke="var(--line-2)" strokeWidth="1" strokeDasharray="2 7" />
      <circle cx="200" cy="200" r="104" fill="none" stroke="var(--line-2)" strokeWidth="1.2" />
      <defs>
        <radialGradient id="pdrop" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="color-mix(in srgb, var(--accent) 45%, #fff)" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="62" fill="url(#pdrop)" />
      <path d="M138 200 Q200 150 262 200 Q200 250 138 200Z" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="1.2" />
      <ellipse cx="186" cy="180" rx="7" ry="12" fill="#fff" opacity="0.4" />
      <circle cx="339" cy="62" r="10" fill="var(--accent)" />
      <circle cx="78" cy="118" r="6" fill="var(--ink)" />
      <circle cx="258" cy="298" r="6" fill="var(--accent)" />
      <circle cx="366" cy="262" r="4" fill="var(--muted)" />
    </svg>
  );
}

function kickerOf(section: string | null, t: Dict): string {
  switch (section) {
    case "news":
      return t.p_article;
    case "announcements":
      return t.announcements_title;
    case "programs":
      return t.programs_title;
    case "events":
      return t.events_title;
    case "faculties":
      return t.faculty;
    case "structure":
      return t.department;
    case "staff":
      return t.staff_title;
    default:
      return t.p_page;
  }
}

/* ================================================================== PDF */
function useLangQuery(): string {
  const [sp] = useSearchParams();
  const l = sp.get("lang");
  return l && /^[a-z]{2}$/.test(l) ? `?lang=${l}` : "";
}

export function PrintDoc() {
  const { section = "", slug = "" } = useParams();
  const q = useLangQuery();
  const d = usePrintData(`/api/print/${encodeURIComponent(section)}/${encodeURIComponent(slug)}${q}`);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (d) markReady(root.current, !!(d.item?.html || d.item?.content));
  }, [d]);
  if (!d || !d.item) return null;
  const t: Dict = DICTS[d.lang] || DICTS.uz;
  const it = d.item;
  const isNews = d.section === "news" || d.section === "announcements";
  const lang = d.lang;
  const image = it.feature_image || it.cover || "";
  const lead = (it.excerpt || it.summary || "") as string;
  const date = fmtDate(it.published_at || it.updated, lang);
  const toc = outline(it);
  const kicker = kickerOf(d.section, t);
  const pageCss = `
@page {
  size: A4;
  margin: 21mm 17mm 19mm;
  @top-left { content: ${cssStr("✦  " + d.site.title)}; font: 600 7.5pt "Inter Variable", sans-serif; color: #161512; vertical-align: bottom; padding-bottom: 3mm; border-bottom: 0.6pt solid #e1dacd; }
  @top-center { content: ""; vertical-align: bottom; border-bottom: 0.6pt solid #e1dacd; }
  @top-right { content: ${cssStr(cut(it.title, 70))}; font: 400 7.5pt "Inter Variable", sans-serif; color: #7b756b; vertical-align: bottom; padding-bottom: 3mm; border-bottom: 0.6pt solid #e1dacd; }
  @bottom-left { content: ${cssStr(d.url.replace(/^https?:\/\//, ""))}; font: 400 7pt "JetBrains Mono Variable", monospace; color: #9a9386; vertical-align: top; padding-top: 3mm; }
  @bottom-right { content: ${cssStr(t.p_page_n + " ")} counter(page) " / " counter(pages); font: 500 7pt "Inter Variable", sans-serif; color: #7b756b; vertical-align: top; padding-top: 3mm; }
}
@page :first { margin: 0; @top-left { content: none; } @top-center { content: none; } @top-right { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }`;
  const meta: [string, string][] = isNews
    ? [
        [t.p_author, d.uni.short_name || d.uni.name],
        [t.published, date],
        [t.p_reading, `${it.reading_time || 1} ${t.min_read}`],
        [t.p_tags, (it.tags || []).join(", ") || "—"],
      ]
    : [
        [t.p_author, d.uni.short_name || d.uni.name],
        [t.updated, date],
        ...(it.tags?.length ? ([[t.p_tags, it.tags.join(", ")]] as [string, string][]) : []),
      ];
  return (
    <PrintMode.Provider value>
      <ChartLabels.Provider value={t}>
        <div className="pdoc-root" ref={root} style={it.accent && !isNews ? ({ "--accent": it.accent } as CSSProperties) : undefined}>
          <style>{pageCss}</style>
          <section className="pc-cover">
            <Orbit className="pc-orbit" />
            <div className="pc-main">
              <div className="pc-brand">
                <Avatar d={d} size={46} />
                <div>
                  <b>{d.uni.name}</b>
                  <span>{[d.uni.address, d.uni.email].filter(Boolean).join(" · ")}</span>
                </div>
              </div>
              <div className="pc-kicker">
                {kicker} · {date}
              </div>
              <h1 className={`pc-title ${it.title.length > 70 ? "long" : it.title.length > 40 ? "mid" : ""}`}>{it.title}</h1>
              {lead && <p className="pc-lead">{cut(lead, 420)}</p>}
              {image && (
                <figure className="pc-image">
                  <img src={image} alt="" />
                </figure>
              )}
              {!image && toc.length > 0 && (
                <div className="pc-toc">
                  <div className="pc-toc-label">{t.toc}</div>
                  <ol>
                    {toc.map((h, i) => (
                      <li key={i}>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        {h}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
            <div className="pc-meta">
              <dl>
                {meta.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="pc-qr">
                <div className="qr" dangerouslySetInnerHTML={{ __html: d.qr }} />
                <b>{t.p_read_online}</b>
              </div>
            </div>
            <footer className="pc-band">
              <div>
                <b>{d.site.title}</b>
                <span>{d.url.replace(/^https?:\/\//, "")}</span>
              </div>
              <div className="pc-gen">
                {t.p_generated}: {fmtDate(d.generated, lang)}
              </div>
            </footer>
            <div className="pc-line" />
          </section>

          <main className="pdoc">
            <header className="pdoc-head">
              <div className="pdoc-kicker">{kicker}</div>
              <h2>{it.title}</h2>
            </header>
            <Suspense fallback={null}>
              <RichHtml html={it.html} doc={it.content} className="prose prose-print" />
            </Suspense>
            <footer className="pdoc-end">
              <div className="pdoc-author">
                <Avatar d={d} size={52} />
                <div>
                  <b>{d.uni.name}</b>
                  <span>{d.uni.address}</span>
                  {d.uni.email && <span className="mono">{d.uni.email}</span>}
                </div>
              </div>
              <div className="pdoc-online">
                <div className="qr" dangerouslySetInnerHTML={{ __html: d.qr }} />
                <div>
                  <b>{t.p_online_version}</b>
                  <span className="mono">{d.url}</span>
                  <small>{t.p_scan}</small>
                </div>
              </div>
            </footer>
          </main>
        </div>
      </ChartLabels.Provider>
    </PrintMode.Provider>
  );
}

/* ================================================================== og:image (1200×630) */
export function OgCard() {
  const { section = "", slug = "" } = useParams();
  const q = useLangQuery();
  const path = (section && slug ? `/api/print/${encodeURIComponent(section)}/${encodeURIComponent(slug)}` : "/api/print/site") + q;
  const d = usePrintData(path);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (d) markReady(root.current, false);
  }, [d]);
  if (!d) return null;
  const t: Dict = DICTS[d.lang] || DICTS.uz;
  const it = d.item;
  const lang = d.lang;
  const image = it ? it.feature_image || it.cover || it.photo || "" : d.uni.logo;
  const title = it ? it.title : d.uni.name;
  const size = it ? (title.length > 90 ? 50 : title.length > 60 ? 58 : title.length > 34 ? 68 : 80) : title.length > 40 ? 56 : title.length > 22 ? 72 : 96;
  const pill = it ? (d.section === "news" || d.section === "announcements" ? `${fmtDate(it.published_at, lang)} · ${it.reading_time || 1} ${t.min_read}` : d.section === "events" && it.starts ? fmtDate(it.starts, lang) : it.position || it.degree || fmtDate(it.updated, lang)) : "";
  return (
    <div className={`og ${image ? "with-image" : ""} ${it ? "" : "og-site"}`} ref={root} style={it?.accent && !it.feature_image ? ({ "--accent": it.accent } as CSSProperties) : undefined}>
      <div className="og-glow" />
      <div className="og-left">
        <div className="og-top">
          {it ? (
            <>
              <Avatar d={d} size={58} />
              <div>
                <b>{d.uni.abbr || d.site.title}</b>
                <span>{d.uni.short_name}</span>
              </div>
            </>
          ) : (
            <span className="og-kicker">{d.uni.abbr}</span>
          )}
        </div>
        <div className="og-mid">
          {it && <span className="og-kicker">{kickerOf(d.section, t)}</span>}
          <h1 style={{ fontSize: size }}>{title}</h1>
          {!it && d.uni.tagline && <p>{cut(d.uni.tagline, 140)}</p>}
          {!it && d.uni.keywords?.length > 0 && (
            <div className="og-chips">
              {d.uni.keywords.slice(0, 4).map((k) => (
                <span key={k}>{k}</span>
              ))}
            </div>
          )}
        </div>
        <div className="og-bottom">
          <span className="og-host">{d.host}</span>
          {it && pill && <span className="og-pill">{pill}</span>}
        </div>
      </div>
      <div className="og-right">{image ? <img src={image} alt="" /> : <Orbit className="og-orbit" />}</div>
      <div className="og-bar" />
    </div>
  );
}

export default PrintDoc;
