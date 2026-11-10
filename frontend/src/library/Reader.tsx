// Elektron kitob o'quvchisi: PDF (PDF.js) va EPUB (epub.js).
// Fayl yuklab olinmaydi — tokenli vaqtinchalik manzildan o'qiladi. O'qish joyi, xatcho'plar, belgilar va eslatmalar
// faqat foydalanuvchiga ko'rinadi va avtomatik saqlanadi. Tungi rejim, qidiruv, mundarija, EPUB: shrift/qator/fon/rejim, ovozli o'qish.
import {
  ArrowLeft, Bookmark, BookmarkPlus, ChevronLeft, ChevronRight, Download, Highlighter, List, Loader2, Maximize2, Minus, Moon, Plus, Search, Settings2, StickyNote, Sun, Trash2, Volume2, VolumeX, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "pdfjs-dist/web/pdf_viewer.css";
import { ApiError } from "../lib/api";
import { lib, type Mark, type OpenFile } from "./api";
import { errText, f, LibLang, readerLang, useLT, useReaderBack, useViewerHome } from "./ui";


export default function ReaderPage({ admin = false }: { admin?: boolean }) {
  return (
    <LibLang lang={readerLang()}>
      <ReaderShell admin={admin} />
    </LibLang>
  );
}

type Panel = "" | "toc" | "marks" | "search" | "settings";
export type TocItem = { title: string; level: number; go: () => void };
export type SearchHit = { label: string; text: string; go: () => void };

/* ------------------------------------------------------------------ o'qish vaqti va joyini saqlash */
function useProgressSaver(fid: string, enabled: boolean) {
  const st = useRef({ loc: "", percent: 0, secs: 0, pages: new Set<string>(), sentPages: 0, last: Date.now(), dirty: false });
  const flush = useCallback(() => {
    const s = st.current;
    if (!enabled || !s.dirty) return;
    const pages = s.pages.size - s.sentPages;
    s.sentPages = s.pages.size;
    const secs = Math.round(s.secs);
    s.secs = 0;
    s.dirty = false;
    lib.progress(fid, { loc: s.loc, percent: s.percent, seconds: secs, pages }).catch(() => (s.dirty = true));
  }, [fid, enabled]);
  useEffect(() => {
    // faol o'qish vaqti: sahifa ko'rinib turgan va so'nggi 2 daqiqada harakat bo'lgan bo'lsa
    let lastAct = Date.now();
    const act = () => (lastAct = Date.now());
    const tick = window.setInterval(() => {
      const s = st.current;
      const now = Date.now();
      if (document.visibilityState === "visible" && now - lastAct < 120000) {
        s.secs += (now - s.last) / 1000;
        s.dirty = true;
      }
      s.last = now;
    }, 1000);
    const save = window.setInterval(flush, 15000);
    const hide = () => document.visibilityState === "hidden" && flush();
    ["pointerdown", "keydown", "wheel", "touchstart", "scroll"].forEach((e) => window.addEventListener(e, act, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(save);
      document.removeEventListener("visibilitychange", hide);
      ["pointerdown", "keydown", "wheel", "touchstart", "scroll"].forEach((e) => window.removeEventListener(e, act, { capture: true }));
      flush();
    };
  }, [flush]);
  return useCallback((loc: string, percent: number, pageKey?: string) => {
    const s = st.current;
    if (s.loc !== loc) s.dirty = true;
    s.loc = loc;
    s.percent = Math.max(0, Math.min(100, percent));
    if (pageKey) s.pages.add(pageKey);
  }, []);
}

function ReaderShell({ admin }: { admin: boolean }) {
  const T = useLT();
  const { fid = "" } = useParams();
  const [raw, setD] = useState<OpenFile | null>(null);
  const [err, setErr] = useState("");
  const home = useViewerHome(admin);
  // mehmon (ochiq fond fayli): o'qish joyi va belgilar saqlanmaydi
  const d = useMemo(() => raw && { ...raw, guest: !!raw.guest || home === "", home }, [raw, home]);
  useEffect(() => {
    setD(null);
    lib
      .open(fid, admin)
      .then((r) => {
        setD(r);
        // EPUB ma'lumoti oflayn ochish uchun saqlanadi (fayl o'zi Cache API'da)
        if (r.file.kind === "epub" && !admin)
          try {
            localStorage.setItem(`lib_meta_${fid}`, JSON.stringify({ ...r, url: "" }));
          } catch {
            /* */
          }
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401 && !admin) return void (window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        if (!(e instanceof ApiError))
          try {
            const m = JSON.parse(localStorage.getItem(`lib_meta_${fid}`) || "null") as OpenFile | null;
            if (m) return setD({ ...m, url: `/lib-offline/epub/${fid}` });
          } catch {
            /* */
          }
        setErr(errText(e, T));
      });
  }, [fid, admin]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err)
    return (
      <div className="rd rd-msg">
        <p>{err}</p>
        <Link to="/library" className="lb-btn primary">
          {T.back_catalog}
        </Link>
      </div>
    );
  if (!d)
    return (
      <div className="rd rd-msg">
        <Loader2 className="spin" size={30} />
        <p>{T.loading_book}</p>
      </div>
    );
  return d.file.kind === "epub" ? <EpubReader d={d} admin={admin} /> : <PdfReader d={d} admin={admin} />;
}

/* ------------------------------------------------------------------ umumiy qobiq: yuqori panel, yon panel */
function Chrome({
  d, admin, title, pageLabel, panel, setPanel, night, setNight, toc, marks, onMark, onDelMark, onBookmark, search, extraTools, children, settings, onPrev, onNext,
}: {
  d: OpenFile;
  admin: boolean;
  title: string;
  pageLabel: string;
  panel: Panel;
  setPanel: (p: Panel) => void;
  night: boolean;
  setNight: (v: boolean) => void;
  toc: TocItem[];
  marks: Mark[];
  onMark: (m: Mark) => void;
  onDelMark: (m: Mark) => void;
  onBookmark: () => void;
  search: (q: string) => Promise<SearchHit[]>;
  extraTools?: React.ReactNode;
  children: React.ReactNode;
  settings?: React.ReactNode;
  onPrev: () => void;
  onNext: () => void;
}) {
  const T = useLT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const back = useReaderBack(d.book.id, admin, d.home);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") (e.preventDefault(), onNext());
      else if (e.key === "ArrowLeft" || e.key === "PageUp") (e.preventDefault(), onPrev());
      else if (e.key === "Escape") setPanel("");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onNext, onPrev, setPanel]);
  const tab = (p: Panel, icon: React.ReactNode, label: string) => (
    <button className={`rd-ic ${panel === p ? "on" : ""}`} onClick={() => setPanel(panel === p ? "" : p)} title={label} aria-label={label} aria-pressed={panel === p}>
      {icon}
    </button>
  );
  return (
    <div className={`rd ${night ? "night" : ""} ${panel ? "with-panel" : ""}`}>
      <header className="rd-top">
        <Link {...back} className="rd-ic" title={T.close} aria-label={T.close}>
          <ArrowLeft size={19} />
        </Link>
        <div className="rd-title">
          <b>{d.book.title}</b>
          <small>
            {title}
            {d.preview && <em> · {T.preview}</em>}
          </small>
        </div>
        <span className="rd-page" aria-live="polite">
          {pageLabel}
        </span>
        <div className="rd-tools">
          {extraTools}
          <button className="rd-ic" onClick={onBookmark} title={T.add_bookmark} aria-label={T.add_bookmark} disabled={!!d.preview || !!d.guest}>
            <BookmarkPlus size={19} />
          </button>
          {tab("toc", <List size={19} />, T.toc)}
          {tab("search", <Search size={19} />, T.search_in_book)}
          {tab("marks", <Bookmark size={19} />, T.marks)}
          {settings && tab("settings", <Settings2 size={19} />, T.settings)}
          <button className="rd-ic" onClick={() => setNight(!night)} title={T.night} aria-label={T.night} aria-pressed={night}>
            {night ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          {d.download && (
            <a className="rd-ic" href={lib.downloadUrl(d.file.id)} title={`${T.download} — ${T.download_hint}`} aria-label={T.download}>
              <Download size={19} />
            </a>
          )}
        </div>
      </header>
      <div className="rd-main">
        <div className="rd-view">{children}</div>
        {panel && (
          <aside className="rd-panel" aria-label={T.settings}>
            <div className="rd-panel-h">
              <b>{panel === "toc" ? T.toc : panel === "marks" ? T.marks : panel === "search" ? T.search_in_book : T.settings}</b>
              <button className="rd-ic sm" onClick={() => setPanel("")} aria-label={T.close}>
                <X size={17} />
              </button>
            </div>
            {panel === "toc" && (
              <nav className="rd-toc">
                {toc.length ? (
                  toc.map((x, i) => (
                    <button key={i} style={{ paddingLeft: 14 + x.level * 14 }} onClick={() => (x.go(), window.innerWidth < 900 && setPanel(""))}>
                      {x.title}
                    </button>
                  ))
                ) : (
                  <p className="muted">—</p>
                )}
              </nav>
            )}
            {panel === "marks" && (
              <div className="rd-marks">
                {!marks.length && <p className="muted">—</p>}
                {marks.map((m) => (
                  <div key={m.id} className={`rd-mark k-${m.kind} c-${m.color}`}>
                    <button onClick={() => onMark(m)}>
                      {m.kind === "bookmark" ? <Bookmark size={14} /> : m.kind === "note" ? <StickyNote size={14} /> : <Highlighter size={14} />}
                      <span>
                        <b>{m.text ? `“${m.text.slice(0, 140)}”` : m.kind === "bookmark" ? T.add_bookmark : ""}</b>
                        {m.note && <small>{m.note}</small>}
                        <i>{markLabel(m, T)}</i>
                      </span>
                    </button>
                    <button className="rd-ic sm" onClick={() => onDelMark(m)} aria-label={T.delete}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {panel === "search" && (
              <div className="rd-search">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (q.trim().length < 2) return;
                    setBusy(true);
                    setHits(await search(q.trim()));
                    setBusy(false);
                  }}
                >
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.search_in_book} autoFocus />
                  <button className="rd-ic sm" aria-label={T.search_btn}>
                    {busy ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
                  </button>
                </form>
                {hits && <small className="muted">{f(T.search_results, { n: hits.length })}</small>}
                <div className="rd-hits">
                  {hits?.map((h, i) => (
                    <button key={i} onClick={() => (h.go(), window.innerWidth < 900 && setPanel(""))}>
                      <i>{h.label}</i>
                      <span dangerouslySetInnerHTML={{ __html: h.text }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {panel === "settings" && settings}
          </aside>
        )}
      </div>
      <button className="rd-edge l" onClick={onPrev} aria-label={T.prev}>
        <ChevronLeft size={26} />
      </button>
      <button className="rd-edge r" onClick={onNext} aria-label={T.next}>
        <ChevronRight size={26} />
      </button>
    </div>
  );
}

function markLabel(m: Mark, T: ReturnType<typeof useLT>): string {
  if (m.loc.startsWith("{")) {
    try {
      return f(T.page_n, { n: JSON.parse(m.loc).p });
    } catch {
      return "";
    }
  }
  if (/^\d+$/.test(m.loc)) return f(T.page_n, { n: m.loc });
  return new Date(m.created).toLocaleDateString();
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
function snippet(text: string, q: string): string | null {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  const a = Math.max(0, i - 50);
  return `${a ? "…" : ""}${esc(text.slice(a, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length, i + q.length + 70))}…`;
}

/* ------------------------------------------------------------------ PDF */
type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;

function PdfReader({ d, admin }: { d: OpenFile; admin: boolean }) {
  const T = useLT();
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [n, setN] = useState(0);
  const [page, setPage] = useState(() => Math.max(1, Number(d.progress?.loc) || 1));
  const [scale, setScale] = useState<number>(() => Number(localStorage.getItem("rd_pdf_scale") || 0) || 0); // 0 — kenglik bo'yicha
  const [fitScale, setFitScale] = useState(1.2);
  const [night, setNight] = useState(() => localStorage.getItem("rd_night") === "1");
  const [panel, setPanel] = useState<Panel>("");
  const [marks, setMarks] = useState<Mark[]>(d.marks);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 595, h: 842 });
  const [sel, setSel] = useState<{ x: number; y: number; p: number; rects: number[][]; text: string } | null>(null);
  const [hitQ, setHitQ] = useState("");
  const [err, setErr] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const textCache = useRef<Map<number, string>>(new Map());
  const save = useProgressSaver(d.file.id, !d.preview && !d.guest);
  const eff = scale || fitScale;
  useEffect(() => localStorage.setItem("rd_night", night ? "1" : "0"), [night]);
  useEffect(() => {
    let alive = true;
    let task: { destroy: () => void } | null = null;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = worker;
      const t = pdfjs.getDocument({ url: d.url, rangeChunkSize: 262144, disableAutoFetch: true, disableStream: false, withCredentials: true, httpHeaders: admin ? { "X-Admin-Realm": "admin" } : undefined });
      task = t;
      try {
        const doc = await t.promise;
        if (!alive) return;
        const p1 = await doc.getPage(1);
        const vp = p1.getViewport({ scale: 1 });
        setDims({ w: vp.width, h: vp.height });
        setN(doc.numPages);
        setPdf(doc);
        // mundarija (PDF ichidagi) — bo'lmasa server bergani
        const out: TocItem[] = [];
        const walk = async (items: { title: string; dest: unknown; items: unknown[] }[] | null, level: number) => {
          for (const it of items || []) {
            let p = 0;
            try {
              const dest = typeof it.dest === "string" ? await doc.getDestination(it.dest) : (it.dest as unknown[]);
              if (dest && dest[0]) p = (await doc.getPageIndex(dest[0] as { num: number; gen: number })) + 1;
            } catch {
              /* */
            }
            out.push({ title: it.title, level, go: () => p && goto(p) });
            await walk(it.items as never, level + 1);
          }
        };
        await walk((await doc.getOutline()) as never, 0);
        if (alive) setToc(out.length ? out : (d.file.toc || []).map((x) => ({ title: x.title, level: x.level || 0, go: () => x.page && goto(x.page) })));
      } catch (e) {
        if (alive) setErr(String((e as Error).message || e));
      }
    })();
    return () => {
      alive = false;
      task?.destroy();
    };
  }, [d.url]); // eslint-disable-line react-hooks/exhaustive-deps
  // kenglik bo'yicha masshtab
  useEffect(() => {
    const fit = () => {
      const w = (wrap.current?.clientWidth || 800) - 32;
      setFitScale(Math.max(0.4, Math.min(2.2, w / dims.w)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [dims.w, panel]);
  const goto = useCallback((p: number) => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-page="${p}"]`);
    if (el) wrap.current!.scrollTo({ top: el.offsetTop - 12, behavior: "auto" });
  }, []);
  // birinchi ochilishda — saqlangan joydan
  const restored = useRef(false);
  useEffect(() => {
    if (pdf && !restored.current) {
      restored.current = true;
      window.setTimeout(() => goto(page), 60);
    }
  }, [pdf, goto, page]);
  // joriy sahifa — aylantirish bo'yicha
  useEffect(() => {
    const el = wrap.current;
    if (!el || !n) return;
    const on = () => {
      const mid = el.scrollTop + el.clientHeight * 0.35;
      const pages = el.querySelectorAll<HTMLElement>("[data-page]");
      let cur = 1;
      pages.forEach((pg) => {
        if (pg.offsetTop <= mid) cur = Number(pg.dataset.page);
      });
      setPage(cur);
    };
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [n]);
  useEffect(() => {
    if (n) save(String(page), (page / n) * 100, String(page));
  }, [page, n, save]);
  const zoom = (k: number) => {
    const v = Math.max(0.4, Math.min(3, Math.round((eff + k) * 10) / 10));
    setScale(v);
    localStorage.setItem("rd_pdf_scale", String(v));
    window.setTimeout(() => goto(page), 50);
  };
  // matnni belgilash
  const onMouseUp = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.toString().trim()) return setSel(null);
    const range = s.getRangeAt(0);
    const pageEl = (range.startContainer.parentElement as HTMLElement | null)?.closest<HTMLElement>("[data-page]");
    if (!pageEl) return setSel(null);
    const pr = pageEl.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .filter((r) => r.width > 1 && r.height > 1)
      .map((r) => [(r.left - pr.left) / pr.width, (r.top - pr.top) / pr.height, r.width / pr.width, r.height / pr.height].map((x) => Math.round(x * 10000) / 10000));
    const last = range.getBoundingClientRect();
    setSel({ x: last.left + last.width / 2, y: last.top, p: Number(pageEl.dataset.page), rects, text: s.toString().trim().slice(0, 1000) });
  };
  const addMark = async (kind: "highlight" | "note", color = "yellow") => {
    if (!sel || d.preview || d.guest) return;
    const note = kind === "note" ? window.prompt(T.note_ph) || "" : "";
    if (kind === "note" && !note) return;
    const m = await lib.addMark(d.file.id, { kind, loc: JSON.stringify({ p: sel.p, r: sel.rects }), text: sel.text, note, color });
    setMarks((x) => [...x, m]);
    setSel(null);
    window.getSelection()?.removeAllRanges();
  };
  const search = async (q: string): Promise<SearchHit[]> => {
    if (!pdf) return [];
    const out: SearchHit[] = [];
    for (let i = 1; i <= pdf.numPages && out.length < 300; i++) {
      let t = textCache.current.get(i);
      if (t === undefined) {
        const tc = await (await pdf.getPage(i)).getTextContent();
        t = tc.items.map((x) => ("str" in x ? x.str : "")).join(" ");
        textCache.current.set(i, t);
      }
      const sn = snippet(t, q);
      if (sn) out.push({ label: f(T.page_n, { n: i }), text: sn, go: () => (setHitQ(q), goto(i)) });
    }
    return out;
  };
  return (
    <Chrome
      d={d}
      admin={admin}
      title={d.file.title || "PDF"}
      pageLabel={n ? f(T.page_of, { p: page, n }) : "…"}
      panel={panel}
      setPanel={setPanel}
      night={night}
      setNight={setNight}
      toc={toc}
      marks={marks}
      onMark={(m) => goto(m.loc.startsWith("{") ? JSON.parse(m.loc).p : Number(m.loc) || 1)}
      onDelMark={async (m) => (await lib.deleteMark(m.id), setMarks((x) => x.filter((y) => y.id !== m.id)))}
      onBookmark={async () => {
        if (marks.some((m) => m.kind === "bookmark" && m.loc === String(page))) return;
        const m = await lib.addMark(d.file.id, { kind: "bookmark", loc: String(page), text: "", note: "" });
        setMarks((x) => [...x, m]);
      }}
      search={search}
      onPrev={() => goto(Math.max(1, page - 1))}
      onNext={() => goto(Math.min(n, page + 1))}
      extraTools={
        <>
          <button className="rd-ic" onClick={() => zoom(-0.15)} title={T.zoom_out} aria-label={T.zoom_out}>
            <Minus size={18} />
          </button>
          <span className="rd-zoom">{Math.round(eff * 100)}%</span>
          <button className="rd-ic" onClick={() => zoom(0.15)} title={T.zoom_in} aria-label={T.zoom_in}>
            <Plus size={18} />
          </button>
          <button className={`rd-ic ${!scale ? "on" : ""}`} onClick={() => (setScale(0), localStorage.removeItem("rd_pdf_scale"))} title={T.fit_width} aria-label={T.fit_width}>
            <Maximize2 size={17} />
          </button>
        </>
      }
    >
      <div className="rd-pdf" ref={wrap} onMouseUp={onMouseUp} onTouchEnd={() => window.setTimeout(onMouseUp, 30)}>
        {err && <p className="rd-err">{err}</p>}
        {!pdf && !err && (
          <div className="rd-msg inline">
            <Loader2 className="spin" size={28} />
          </div>
        )}
        {pdf &&
          Array.from({ length: n }, (_, i) => (
            <PdfPage key={i + 1} pdf={pdf} num={i + 1} scale={eff} dims={dims} root={wrap} marks={marks.filter((m) => m.loc.startsWith("{") && JSON.parse(m.loc).p === i + 1)} query={hitQ} />
          ))}
      </div>
      {sel && (
        <div className="rd-selbar" style={{ left: Math.max(90, Math.min(window.innerWidth - 90, sel.x)), top: Math.max(70, sel.y - 52) }}>
          {["yellow", "green", "pink"].map((c) => (
            <button key={c} className={`dot c-${c}`} onClick={() => addMark("highlight", c)} aria-label={`${T.highlight} ${c}`} />
          ))}
          <button onClick={() => addMark("note")}>
            <StickyNote size={15} /> {T.add_note}
          </button>
        </div>
      )}
    </Chrome>
  );
}

function PdfPage({ pdf, num, scale, dims, root, marks, query }: { pdf: PdfDoc; num: number; scale: number; dims: { w: number; h: number }; root: React.RefObject<HTMLDivElement>; marks: Mark[]; query: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => setVis(e[0].isIntersecting), { root: root.current, rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);
  useEffect(() => {
    if (!vis) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      const page = await pdf.getPage(num);
      if (cancelled) return;
      const vp = page.getViewport({ scale });
      setSize({ w: vp.width, h: vp.height });
      const host = ref.current!;
      const canvas = host.querySelector("canvas")!;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      const ctx = canvas.getContext("2d")!;
      const rt = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      task = rt;
      try {
        await rt.promise;
      } catch {
        return;
      }
      const tl = host.querySelector<HTMLDivElement>(".textLayer")!;
      tl.innerHTML = "";
      host.style.setProperty("--scale-factor", String(scale));
      const layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: vp });
      await layer.render();
      if (query) tl.querySelectorAll("span").forEach((s) => s.textContent?.toLowerCase().includes(query.toLowerCase()) && s.classList.add("hit"));
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [vis, scale, pdf, num, query]);
  const w = size?.w || dims.w * scale;
  const h = size?.h || dims.h * scale;
  return (
    <div className="rd-page-box" data-page={num} ref={ref} style={{ width: w, height: h }} aria-label={`${num}`}>
      <canvas />
      <div className="textLayer" />
      <div className="rd-hl-layer" aria-hidden>
        {marks.map((m) => {
          const r = JSON.parse(m.loc).r as number[][];
          return r.map((x, i) => (
            <span key={m.id + i} className={`rd-hl c-${m.color} ${m.kind}`} title={m.note || m.text} style={{ left: `${x[0] * 100}%`, top: `${x[1] * 100}%`, width: `${x[2] * 100}%`, height: `${x[3] * 100}%` }} />
          ));
        })}
      </div>
      <span className="rd-pnum">{num}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ EPUB */
type EpubSettings = { font: "serif" | "sans" | "wide"; size: number; line: number; theme: "light" | "sepia" | "dark"; flow: "paginated" | "scrolled-doc" };
const FONTS = { serif: "'Lora Variable', Georgia, serif", sans: "'Onest Variable', 'Onest', system-ui, sans-serif", wide: "Verdana, 'Atkinson Hyperlegible', sans-serif" };
const THEMES = { light: { bg: "#ffffff", fg: "#1b1b1b" }, sepia: { bg: "#f4ecd8", fg: "#3b2f1e" }, dark: { bg: "#121417", fg: "#d9dde3" } };

async function loadEpubData(url: string, fid: string): Promise<{ data: ArrayBuffer; offline: boolean }> {
  // oxirgi ochilgan 3 ta EPUB keshda saqlanadi — internet bo'lmasa ham ochiladi (PWA)
  const key = `/lib-offline/epub/${fid}`;
  try {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error(String(r.status));
    const buf = await r.arrayBuffer();
    try {
      const c = await caches.open("uni-lib-v1");
      await c.put(key, new Response(buf.slice(0), { headers: { "Content-Type": "application/epub+zip" } }));
      const recent = JSON.parse(localStorage.getItem("lib_offline") || "[]").filter((x: string) => x !== key);
      recent.unshift(key);
      for (const old of recent.slice(3)) await c.delete(old);
      localStorage.setItem("lib_offline", JSON.stringify(recent.slice(0, 3)));
    } catch {
      /* kesh ixtiyoriy */
    }
    return { data: buf, offline: url.startsWith("/lib-offline/") };
  } catch (e) {
    const c = await caches.open("uni-lib-v1").catch(() => null);
    const hit = await c?.match(key);
    if (hit) return { data: await hit.arrayBuffer(), offline: true };
    throw e;
  }
}

function EpubReader({ d, admin }: { d: OpenFile; admin: boolean }) {
  const T = useLT();
  const view = useRef<HTMLDivElement>(null);
  const bookRef = useRef<import("epubjs").Book | null>(null);
  const rendRef = useRef<import("epubjs").Rendition | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [err, setErr] = useState("");
  const [panel, setPanel] = useState<Panel>("");
  const [toc, setToc] = useState<TocItem[]>([]);
  const [marks, setMarks] = useState<Mark[]>(d.marks);
  const [pct, setPct] = useState(d.progress?.percent || 0);
  const [cfi, setCfi] = useState(d.progress?.loc || "");
  const [sel, setSel] = useState<{ cfi: string; text: string } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [s, setS] = useState<EpubSettings>(() => {
    try {
      return { font: "serif", size: 105, line: 1.6, theme: "light", flow: "paginated", ...JSON.parse(localStorage.getItem("rd_epub") || "{}") };
    } catch {
      return { font: "serif", size: 105, line: 1.6, theme: "light", flow: "paginated" };
    }
  });
  const night = s.theme === "dark";
  const save = useProgressSaver(d.file.id, !d.preview && !d.guest);
  const apply = useCallback((r: import("epubjs").Rendition, st: EpubSettings) => {
    const th = THEMES[st.theme];
    r.themes.default({
      body: { background: `${th.bg} !important`, color: `${th.fg} !important`, "font-family": `${FONTS[st.font]} !important`, "line-height": `${st.line} !important`, padding: "0 6px !important" },
      "p, li, span, div": { "line-height": `${st.line} !important`, "font-family": `${FONTS[st.font]} !important` },
      a: { color: st.theme === "dark" ? "#8fb2f5" : "#0a2e73" },
      "::selection": { background: "rgba(250, 204, 21, 0.45)" },
    });
    r.themes.fontSize(`${st.size}%`);
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, offline: off } = await loadEpubData(d.url, d.file.id);
        if (!alive) return;
        setOffline(off);
        const ePub = (await import("epubjs")).default;
        const book = ePub(data as unknown as string);
        bookRef.current = book;
        const r = book.renderTo(view.current!, { width: "100%", height: "100%", flow: s.flow, spread: "none", allowScriptedContent: false });
        rendRef.current = r;
        apply(r, s);
        await r.display(d.progress?.loc || undefined);
        setReady(true);
        r.on("relocated", (loc: { start: { cfi: string; percentage: number; href: string } }) => {
          setCfi(loc.start.cfi);
          const p = book.locations.length() ? book.locations.percentageFromCfi(loc.start.cfi) * 100 : loc.start.percentage * 100;
          setPct(p);
          save(loc.start.cfi, p, loc.start.href + ":" + Math.round(p));
        });
        r.on("selected", (range: string, contents: { window: Window }) => {
          const text = contents.window.getSelection()?.toString().trim() || "";
          if (text) setSel({ cfi: range, text: text.slice(0, 1000) });
        });
        r.on("keyup", (e: KeyboardEvent) => {
          if (e.key === "ArrowRight") r.next();
          if (e.key === "ArrowLeft") r.prev();
        });
        for (const m of d.marks) if (m.kind !== "bookmark") r.annotations.highlight(m.loc, {}, () => undefined, `rd-epub-hl c-${m.color}`, { fill: hlColor(m.color), "fill-opacity": "0.35" });
        const nav = await book.loaded.navigation;
        const flat: TocItem[] = [];
        const walk = (items: { label: string; href: string; subitems?: unknown[] }[], level: number) =>
          items.forEach((it) => {
            flat.push({ title: it.label.trim(), level, go: () => r.display(it.href) });
            if (it.subitems?.length) walk(it.subitems as never, level + 1);
          });
        walk(nav.toc as never, 0);
        if (alive) setToc(flat);
        await book.ready;
        book.locations.generate(1200).then(() => {
          const loc = r.currentLocation() as unknown as { start?: { cfi: string } };
          if (loc?.start) setPct(book.locations.percentageFromCfi(loc.start.cfi) * 100);
        });
      } catch (e) {
        if (alive) setErr(String((e as Error).message || e));
      }
    })();
    return () => {
      alive = false;
      window.speechSynthesis?.cancel();
      bookRef.current?.destroy();
    };
  }, [d.url]); // eslint-disable-line react-hooks/exhaustive-deps
  const setSetting = (p: Partial<EpubSettings>) => {
    const n = { ...s, ...p };
    setS(n);
    localStorage.setItem("rd_epub", JSON.stringify(n));
    const r = rendRef.current;
    if (!r) return;
    if (p.flow && p.flow !== s.flow) {
      r.flow(p.flow);
      r.display(cfi || undefined);
    }
    apply(r, n);
  };
  const addMark = async (kind: "highlight" | "note", color = "yellow") => {
    if (!sel || d.preview || d.guest) return;
    const note = kind === "note" ? window.prompt(T.note_ph) || "" : "";
    if (kind === "note" && !note) return;
    const m = await lib.addMark(d.file.id, { kind, loc: sel.cfi, text: sel.text, note, color });
    rendRef.current?.annotations.highlight(sel.cfi, {}, () => undefined, `rd-epub-hl c-${color}`, { fill: hlColor(color), "fill-opacity": "0.35" });
    setMarks((x) => [...x, m]);
    setSel(null);
  };
  const search = async (q: string): Promise<SearchHit[]> => {
    const book = bookRef.current;
    if (!book) return [];
    const out: SearchHit[] = [];
    const items = (book.spine as unknown as { spineItems: { load: (l: unknown) => Promise<unknown>; find: (q: string) => { cfi: string; excerpt: string }[]; unload: () => void; href: string }[] }).spineItems;
    for (const it of items) {
      try {
        await it.load(book.load.bind(book));
        for (const r of it.find(q).slice(0, 30)) {
          out.push({ label: toc.find((x) => it.href.includes(x.title))?.title || "", text: snippet(r.excerpt, q) || esc(r.excerpt), go: () => rendRef.current?.display(r.cfi) });
          if (out.length >= 300) break;
        }
      } finally {
        it.unload();
      }
      if (out.length >= 300) break;
    }
    return out;
  };
  // ovozli o'qish (TTS): joriy bo'limning ko'rinayotgan qismidan
  const speak = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const contents = (rendRef.current?.getContents() as unknown as { document: Document }[]) || [];
    const text = contents.map((c) => c.document.body.innerText).join("\n").trim();
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text.slice(0, 30000));
    const lang = readerLang();
    u.lang = { uz: "uz-UZ", ru: "ru-RU", en: "en-US" }[lang] || "uz-UZ";
    u.onend = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };
  const settings = (
    <div className="rd-settings">
      <label>{T.font}</label>
      <div className="rd-seg">
        {(["serif", "sans", "wide"] as const).map((k) => (
          <button key={k} className={s.font === k ? "on" : ""} style={{ fontFamily: FONTS[k] }} onClick={() => setSetting({ font: k })}>
            {k === "serif" ? T.font_serif : k === "sans" ? T.font_sans : T.font_dyslexic}
          </button>
        ))}
      </div>
      <label>
        {T.font_size} <i>{s.size}%</i>
      </label>
      <div className="rd-seg">
        <button onClick={() => setSetting({ size: Math.max(70, s.size - 10) })} aria-label={T.zoom_out}>
          A−
        </button>
        <input type="range" min={70} max={220} step={5} value={s.size} onChange={(e) => setSetting({ size: Number(e.target.value) })} aria-label={T.font_size} />
        <button onClick={() => setSetting({ size: Math.min(220, s.size + 10) })} aria-label={T.zoom_in}>
          A+
        </button>
      </div>
      <label>
        {T.line_height} <i>{s.line.toFixed(1)}</i>
      </label>
      <input type="range" min={1.1} max={2.4} step={0.1} value={s.line} onChange={(e) => setSetting({ line: Number(e.target.value) })} aria-label={T.line_height} />
      <label>{T.theme}</label>
      <div className="rd-seg themes">
        {(["light", "sepia", "dark"] as const).map((k) => (
          <button key={k} className={`th-${k} ${s.theme === k ? "on" : ""}`} onClick={() => setSetting({ theme: k })}>
            {k === "light" ? T.theme_light : k === "sepia" ? T.theme_sepia : T.theme_dark}
          </button>
        ))}
      </div>
      <label>{T.flow}</label>
      <div className="rd-seg">
        {(["paginated", "scrolled-doc"] as const).map((k) => (
          <button key={k} className={s.flow === k ? "on" : ""} onClick={() => setSetting({ flow: k })}>
            {k === "paginated" ? T.flow_paged : T.flow_scroll}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <Chrome
      d={d}
      admin={admin}
      title={d.file.title || "EPUB"}
      pageLabel={`${Math.round(pct)}%`}
      panel={panel}
      setPanel={setPanel}
      night={night}
      setNight={(v) => setSetting({ theme: v ? "dark" : "light" })}
      toc={toc}
      marks={marks}
      onMark={(m) => rendRef.current?.display(m.loc)}
      onDelMark={async (m) => {
        await lib.deleteMark(m.id);
        if (m.kind !== "bookmark") rendRef.current?.annotations.remove(m.loc, "highlight");
        setMarks((x) => x.filter((y) => y.id !== m.id));
      }}
      onBookmark={async () => {
        if (!cfi || marks.some((m) => m.kind === "bookmark" && m.loc === cfi)) return;
        const m = await lib.addMark(d.file.id, { kind: "bookmark", loc: cfi, text: "", note: `${Math.round(pct)}%` });
        setMarks((x) => [...x, m]);
      }}
      search={search}
      settings={settings}
      onPrev={() => rendRef.current?.prev()}
      onNext={() => rendRef.current?.next()}
      extraTools={
        <button className={`rd-ic ${speaking ? "on" : ""}`} onClick={speak} title={speaking ? T.tts_stop : T.tts} aria-label={speaking ? T.tts_stop : T.tts} aria-pressed={speaking}>
          {speaking ? <VolumeX size={19} /> : <Volume2 size={19} />}
        </button>
      }
    >
      <div className={`rd-epub th-${s.theme}`}>
        {offline && <div className="rd-offline">{T.offline}</div>}
        {err && <p className="rd-err">{err}</p>}
        {!ready && !err && (
          <div className="rd-msg inline">
            <Loader2 className="spin" size={28} />
          </div>
        )}
        <div className="rd-epub-view" ref={view} />
        <div className="rd-epub-prog" aria-hidden>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      {sel && (
        <div className="rd-selbar bottom">
          <span className="rd-seltext">“{sel.text.slice(0, 60)}…”</span>
          {["yellow", "green", "pink"].map((c) => (
            <button key={c} className={`dot c-${c}`} onClick={() => addMark("highlight", c)} aria-label={`${T.highlight} ${c}`} />
          ))}
          <button onClick={() => addMark("note")}>
            <StickyNote size={15} /> {T.add_note}
          </button>
          <button className="rd-ic sm" onClick={() => setSel(null)} aria-label={T.close}>
            <X size={15} />
          </button>
        </div>
      )}
    </Chrome>
  );
}

function hlColor(c: string): string {
  return ({ yellow: "#facc15", green: "#4ade80", pink: "#f472b6" } as Record<string, string>)[c] || "#facc15";
}

