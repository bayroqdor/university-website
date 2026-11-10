// Hujjatni sahifaning o'zida ko'rsatish: saytdagi PDF (skaner qilingan buyruq, nizom…) — server tayyorlagan sahifa rasmlari (WebP,
// /api/docpages: sekin kanalda ham tez; pdf.js faqat zaxira — boshqa domendagi PDF yoki server rasm bera olmasa),
// Google Drive fayli — Drive'ning ko'rish oynasi, Drive papkasi — sayt uslubidagi ro'yxat (ichki papkalar, faylni shu yerda ochish),
// Drive'dagi arxiv (RAR/ZIP) — server ochib bergan ro'yxat, ichidagi PDF shu yerda (Google'ning oynasida faylni bosish
// faqat nomini nusxalaydi), rasm — o'zi. Hech narsa oldindan yuklanmaydi: oyna ekranga yaqinlashgandagina hujjat so'raladi, sahifalar ko'rinishga kelganda yuklanadi.
import { ArrowLeft, ChevronRight, Download, ExternalLink, File, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, FolderOpen, Presentation } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import "../styles/docviewer.css";

type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;
type PdfLib = typeof import("pdfjs-dist");

/** Google havolasi: fayl, papka, Google hujjati (Docs/Sheets/Slides) yoki `open?id=` (fayl ham, papka ham bo'lishi mumkin) */
export type DriveRef = { type: "file" | "folder" | "gdoc" | "open"; id: string; rk: string; app?: string };

const ID = /^[\w-]{10,120}$/;

export function driveRef(src: string): DriveRef | null {
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || !/^(drive|docs)\.google\.com$/.test(u.hostname)) return null;
  const p = u.pathname.replace(/^\/a\/[^/]+/, ""); // Workspace domeni: /a/<domen>/...
  const q = u.searchParams;
  const rk = q.get("resourcekey") || "";
  const qid = q.get("id") || "";
  let m = p.match(/\/folders\/([\w-]+)/);
  if (m && ID.test(m[1])) return { type: "folder", id: m[1], rk };
  if (/^\/(embedded)?folderview$/.test(p) && ID.test(qid)) return { type: "folder", id: qid, rk };
  m = p.match(/^\/file\/(?:u\/\d+\/)?d\/([\w-]+)/);
  if (m && ID.test(m[1])) return { type: "file", id: m[1], rk };
  m = p.match(/^\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([\w-]+)/);
  if (m && ID.test(m[2])) return { type: "gdoc", id: m[2], rk, app: m[1] };
  if (/^\/(uc|thumbnail)$/.test(p) && ID.test(qid)) return { type: "file", id: qid, rk };
  if (p === "/open" && ID.test(qid)) return { type: "open", id: qid, rk };
  return null;
}

const rkq = (rk: string, sep = "?") => (rk ? `${sep}resourcekey=${encodeURIComponent(rk)}` : "");
/** Saytga joylanadigan ko'rish oynasi manzili */
const previewUrl = (r: DriveRef) =>
  r.type === "gdoc" ? `https://docs.google.com/${r.app}/d/${r.id}/preview${rkq(r.rk)}` : `https://drive.google.com/file/d/${r.id}/preview${rkq(r.rk)}`;
/** «Yangi oynada ochish» manzili */
const viewUrl = (r: DriveRef) =>
  r.type === "folder"
    ? `https://drive.google.com/drive/folders/${r.id}${rkq(r.rk)}`
    : r.type === "gdoc"
      ? `https://docs.google.com/${r.app}/d/${r.id}/view${rkq(r.rk)}`
      : `https://drive.google.com/file/d/${r.id}/view${rkq(r.rk)}`;

/** Havola qaysi turdagi hujjat: pdf | drive (fayl yoki papka) | image | null (ko'rsatib bo'lmaydi) */
export function docKind(src: string): "pdf" | "drive" | "image" | null {
  if (!src) return null;
  if (driveRef(src)) return "drive";
  const path = src.split(/[?#]/)[0].toLowerCase();
  if (path.endsWith(".pdf")) return "pdf";
  if (/\.(jpe?g|png|webp|gif)$/.test(path)) return "image";
  return null;
}

const sameOrigin = (src: string) => {
  try {
    return new URL(src, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
};

type Strings = {
  open: string; download: string; pages: string; loading: string; failed: string; openDrive: string; back: string; empty: string;
  folderFailed: string; folder: string; preparing: string; archive: string; kb: string; mb: string;
};
const L: Record<string, Strings> = {
  uz: {
    open: "Yangi oynada ochish", download: "Yuklab olish", pages: "bet", loading: "Hujjat yuklanmoqda…",
    failed: "Hujjatni bu yerda ko‘rsatib bo‘lmadi.", openDrive: "Google Drive’da ochish", back: "Papkaga qaytish",
    empty: "Papka bo‘sh", folderFailed: "Papka tarkibini yuklab bo‘lmadi.", folder: "Papka",
    preparing: "Hujjatlar tayyorlanmoqda…", archive: "Arxiv", kb: "KB", mb: "MB",
  },
  ru: {
    open: "Открыть в новом окне", download: "Скачать", pages: "стр.", loading: "Загрузка документа…",
    failed: "Не удалось показать документ здесь.", openDrive: "Открыть в Google Drive", back: "Назад к папке",
    empty: "Папка пуста", folderFailed: "Не удалось загрузить содержимое папки.", folder: "Папка",
    preparing: "Документы подготавливаются…", archive: "Архив", kb: "КБ", mb: "МБ",
  },
  en: {
    open: "Open in new tab", download: "Download", pages: "pages", loading: "Loading document…",
    failed: "The document can’t be shown here.", openDrive: "Open in Google Drive", back: "Back to folder",
    empty: "This folder is empty", folderFailed: "Couldn’t load the folder contents.", folder: "Folder",
    preparing: "Preparing documents…", archive: "Archive", kb: "KB", mb: "MB",
  },
};
const strings = (lang: string) => L[(lang || "").slice(0, 2)] || L.uz;

// ------------------------------------------------------------------ umumiy yordamchilar

/** Element ekranga (margin ichida) yaqinlashdimi — bir marta true bo'ladi va shunday qoladi */
function useNear(ref: RefObject<HTMLElement>, margin = "400px 0px") {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near, margin]);
  return near;
}

/** drive.google.com bilan ulanishni oldindan ochish — faqat Drive oynasi kerak bo'lganda, bir marta */
let preconnected = false;
function preconnectDrive() {
  if (preconnected || typeof document === "undefined") return;
  preconnected = true;
  for (const href of ["https://drive.google.com", "https://www.gstatic.com"]) {
    const l = document.createElement("link");
    l.rel = "preconnect";
    l.href = href;
    l.crossOrigin = "anonymous";
    document.head.appendChild(l);
  }
}

/** Drive/Docs oynasi: yuklanguncha orqasida «yuklanmoqda» yozuvi ko'rinadi */
function Frame({ src, title, lang }: { src: string; title: string; lang: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    preconnectDrive();
    setReady(false);
  }, [src]);
  return (
    <div className="dv-framewrap">
      {!ready && <p className="dv-msg dv-wait">{strings(lang).loading}</p>}
      <iframe className={`dv-frame${ready ? " ready" : ""}`} src={src} title={title} allow="autoplay; fullscreen" allowFullScreen onLoad={() => setReady(true)} />
    </div>
  );
}

// ------------------------------------------------------------------ PDF (pdf.js)

// pdf.js kutubxonasi va uning ishchi oqimi (worker) — sahifada bitta: barcha PDF oynalari shuni ishlatadi
let pdfLib: Promise<{ lib: PdfLib; worker: InstanceType<PdfLib["PDFWorker"]> }> | null = null;
function loadPdf() {
  if (!pdfLib) {
    const p = (async () => {
      const [lib, url] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
      lib.GlobalWorkerOptions.workerSrc = url.default;
      return { lib, worker: new lib.PDFWorker() };
    })();
    p.catch(() => {
      pdfLib = null; // tarmoq xatosi — keyingi safar qayta urinadi
    });
    pdfLib = p;
  }
  return pdfLib;
}

const MAX_PIXELS = 4_000_000; // bitta sahifa kanvasi uchun chegara (telefon xotirasi)

function PdfPage({ doc, n, width, ratio0, root }: { doc: PdfDoc; n: number; width: number; ratio0: number; root: HTMLElement | null }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(n === 1);
  const [ratio, setRatio] = useState(ratio0);
  useEffect(() => setRatio(ratio0), [ratio0]);
  // ko'rinishga yaqinlashganda chiziladi, uzoqlashganda kanvas bo'shatiladi (ko'p sahifali skanlar xotirani to'ldirmasin)
  useEffect(() => {
    const el = box.current;
    if (!el || !root) return;
    const io = new IntersectionObserver((e) => setNear(e[e.length - 1].isIntersecting), { root, rootMargin: "150% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (!near || !width) {
      c.width = c.height = 0;
      return;
    }
    let task: { cancel: () => void } | null = null;
    let alive = true;
    doc
      .getPage(n)
      .then((page) => {
        if (!alive) return;
        const base = page.getViewport({ scale: 1 });
        setRatio(base.height / base.width);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let scale = (width / base.width) * dpr;
        if (base.width * base.height * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (base.width * base.height));
        const vp = page.getViewport({ scale });
        // avval yashirin kanvasda chiziladi — qayta chizishda eski rasm o'chib-yonmasligi uchun
        const off = document.createElement("canvas");
        off.width = Math.floor(vp.width);
        off.height = Math.floor(vp.height);
        const t = page.render({ canvasContext: off.getContext("2d")!, viewport: vp, canvas: off } as never);
        task = t;
        return t.promise.then(() => {
          if (!alive) return;
          c.width = off.width;
          c.height = off.height;
          c.getContext("2d")!.drawImage(off, 0, 0);
          off.width = off.height = 0;
        });
      })
      .catch(() => null);
    return () => {
      alive = false;
      task?.cancel();
    };
  }, [near, width, doc, n]);
  return (
    <div ref={box} className="dv-page" style={{ aspectRatio: `1 / ${ratio}` }}>
      <canvas ref={canvas} aria-label={`${n}`} />
    </div>
  );
}

function PdfJsView({ src, lang }: { src: string; lang: string }) {
  const t = strings(lang);
  const wrap = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [ratio0, setRatio0] = useState(1.414);
  const [err, setErr] = useState(false);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    let alive = true;
    let task: { destroy: () => Promise<void> } | null = null;
    setErr(false);
    setDoc(null);
    (async () => {
      try {
        const { lib, worker } = await loadPdf();
        if (!alive) return;
        // disableStream + disableAutoFetch: faqat ko'rilayotgan sahifalar uchun kerakli qismlar (HTTP Range, 64 KB bo'laklar) yuklanadi;
        // aks holda pdf.js butun faylni (skanlar — 10+ MB) oxirigacha tortib oladi
        const lt = lib.getDocument({ url: src, worker, rangeChunkSize: 65536, disableStream: true, disableAutoFetch: true, isEvalSupported: false });
        task = lt;
        const d = await lt.promise;
        const v = (await d.getPage(1)).getViewport({ scale: 1 });
        if (!alive) return;
        setRatio0(v.height / v.width); // qolgan sahifalar uchun joy shu nisbatda ajratiladi (sahifa sakramasin)
        setDoc(d);
      } catch {
        if (alive) setErr(true);
      }
    })();
    return () => {
      alive = false;
      task?.destroy();
    };
  }, [src]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setRoot(el);
    let timer = 0;
    const measure = () => {
      const cs = getComputedStyle(el);
      const nw = Math.round(el.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0"));
      setWidth((w) => (Math.abs(nw - w) < 2 ? w : nw));
    };
    measure();
    // kenglik o'zgarganda sahifalar qayta chiziladi — har bir kadrda emas, o'zgarish tugagach
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 180);
    });
    ro.observe(el);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [err]);
  if (err) {
    // pdf.js ocholmadi (masalan, boshqa domendagi fayl CORS ruxsatisiz) — brauzerning o'z ko'rsatkichi, u ham bo'lmasa — tugma
    const native = typeof navigator !== "undefined" && (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
    return native ? (
      <iframe className="dv-frame ready" src={src} title={t.open} />
    ) : (
      <div className="dv-msg">
        <p>{t.failed}</p>
        <a className="dv-btn" href={src} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} aria-hidden /> {t.open}
        </a>
      </div>
    );
  }
  return (
    <div ref={wrap} className={doc ? "dv-pages" : "dv-pages loading"}>
      {!doc ? <p className="dv-msg">{t.loading}</p> : Array.from({ length: doc.numPages }, (_, i) => <PdfPage key={i} doc={doc} n={i + 1} width={width} ratio0={ratio0} root={root} />)}
      {doc && (
        <span className="dv-count">
          {doc.numPages} {t.pages}
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ PDF — server tayyorlagan sahifa rasmlari

type PagesMeta = { pages: number; sizes: [number, number][]; version: string };
// hujjat haqida ma'lumot — sahifa davomida bir marta (arxivda faylga qayta kirilganda so'ralmaydi)
const pagesCache = new Map<string, Promise<PagesMeta>>();
function loadPages(path: string, w: number): Promise<PagesMeta> {
  let p = pagesCache.get(path);
  if (!p) {
    p = fetch(`/api/docpages?${new URLSearchParams({ src: path, w: String(w) })}`, { credentials: "same-origin" }).then((r) =>
      r.ok ? (r.json() as Promise<PagesMeta>) : Promise.reject(new Error(String(r.status))),
    );
    p.catch(() => pagesCache.delete(path));
    pagesCache.set(path, p);
  }
  return p;
}

/** Rasm kengligi: oyna kengligi × ekran zichligi (ko'pi bilan 2) — 800 yoki 1200 px (keshdagi variantlar) */
const pickWidth = (css: number) => (css * Math.min(window.devicePixelRatio || 1, 2) > 880 ? 1200 : 800);

function ImgPage({ url, n, ratio, root, eager }: { url: string; n: number; ratio: number; root: HTMLElement | null; eager: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(eager);
  const [tries, setTries] = useState(0);
  // ko'rinishga yaqinlashgandagina so'raladi (oldinda 1,5 ekran); yuklangan rasm qoladi
  useEffect(() => {
    const el = box.current;
    if (near || !el || !root) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { root, rootMargin: "150% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [root, near]);
  return (
    <div ref={box} className="dv-page" style={{ aspectRatio: `1 / ${ratio}` }}>
      {near && (
        <img
          src={tries ? `${url}&r=${tries}` : url}
          alt={`${n}`}
          decoding="async"
          draggable={false}
          onError={() => tries < 2 && window.setTimeout(() => setTries((x) => x + 1), 1500)}
        />
      )}
    </div>
  );
}

function ImgPages({ src, lang, onFail }: { src: string; lang: string; onFail: () => void }) {
  const t = strings(lang);
  const wrap = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [meta, setMeta] = useState<PagesMeta | null>(null);
  const [w, setW] = useState(0);
  const path = useMemo(() => {
    const u = new URL(src, window.location.href);
    return u.pathname;
  }, [src]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setRoot(el);
    let timer = 0;
    // kenglik faqat kattalashadi (telefon burilsa — aniqroq rasm), kichraysa — yuklangani qoladi
    const measure = () => setW((x) => Math.max(x, pickWidth(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 180);
    });
    ro.observe(el);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, []);
  const ready = w > 0;
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setMeta(null);
    loadPages(path, w).then(
      (m) => alive && (m.pages > 0 ? setMeta(m) : onFail()),
      () => alive && onFail(),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ready]);
  return (
    <div ref={wrap} className={meta ? "dv-pages" : "dv-pages loading"}>
      {!meta ? (
        <p className="dv-msg">{t.loading}</p>
      ) : (
        meta.sizes.map(([pw, ph], i) => (
          <ImgPage key={i} n={i + 1} url={`/api/docpages/img/${meta.version}/${i + 1}.webp?w=${w}`} ratio={ph / pw} root={root} eager={i < 2} />
        ))
      )}
      {meta && (
        <span className="dv-count">
          {meta.pages} {t.pages}
        </span>
      )}
    </div>
  );
}

/** PDF: saytdagi fayl — sahifa rasmlari; boshqa domendagi yoki server rasm bera olmagan fayl — pdf.js */
export function PdfView({ src, lang }: { src: string; lang: string }) {
  const [failed, setFailed] = useState("");
  return sameOrigin(src) && failed !== src ? <ImgPages src={src} lang={lang} onFail={() => setFailed(src)} /> : <PdfJsView src={src} lang={lang} />;
}

// ------------------------------------------------------------------ Google Drive papkasi

type DriveItem = { id: string; name: string; kind: "folder" | "file"; mime: string; url: string; rk: string; modified: string };
type FolderData = { id: string; title: string; items: DriveItem[] };

// papka tarkibi va `open?id=` turi — sahifa davomida bir marta so'raladi (bir nechta oyna bo'lsa ham)
const folderCache = new Map<string, Promise<FolderData>>();
type DriveMeta = { kind: string; name?: string; archive?: boolean };
const kindCache = new Map<string, Promise<DriveMeta>>();
function getJson<T>(cache: Map<string, Promise<T>>, key: string, url: string): Promise<T> {
  let p = cache.get(key);
  if (!p) {
    p = fetch(url, { credentials: "same-origin" }).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)))));
    p.catch(() => cache.delete(key)); // xato bo'lsa keyinroq qayta urinish mumkin
    cache.set(key, p);
  }
  return p;
}
const loadFolder = (id: string, rk: string) => getJson(folderCache, `${id}:${rk}`, `/api/gdrive/folder/${encodeURIComponent(id)}${rk ? `?rk=${encodeURIComponent(rk)}` : ""}`);
/** Drive havolasi haqida: papkami yoki fayl, fayl nomi va arxivmi (RAR/ZIP — ichidagini sayt o'zi ochadi) */
const loadMeta = (id: string) => getJson(kindCache, id, `/api/gdrive/kind/${encodeURIComponent(id)}`);

function itemIcon(it: { kind: string; mime?: string; name: string }): ReactNode {
  const m = it.mime || "";
  const n = it.name.toLowerCase();
  if (it.kind === "folder") return <Folder size={20} aria-hidden />;
  if (/spreadsheet|excel|csv/.test(m) || /\.(xlsx?|csv|ods)$/.test(n)) return <FileSpreadsheet size={20} aria-hidden />;
  if (/presentation|powerpoint/.test(m) || /\.(pptx?|odp)$/.test(n)) return <Presentation size={20} aria-hidden />;
  if (m.startsWith("image/")) return <FileImage size={20} aria-hidden />;
  if (m.startsWith("video/")) return <FileVideo size={20} aria-hidden />;
  if (m.startsWith("audio/")) return <FileAudio size={20} aria-hidden />;
  if (/zip|rar|7z|tar|gzip|compressed/.test(m)) return <FileArchive size={20} aria-hidden />;
  if (/pdf|document|word|text/.test(m) || /\.(pdf|docx?|odt|txt|rtf)$/.test(n)) return <FileText size={20} aria-hidden />;
  return <File size={20} aria-hidden />;
}

const fmtDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join(".") : "");

function DriveFolder({ id, rk, title, lang }: { id: string; rk: string; title: string; lang: string }) {
  const t = strings(lang);
  const [path, setPath] = useState<{ id: string; rk: string; title: string }[]>([{ id, rk, title }]);
  const [data, setData] = useState<FolderData | null>(null);
  const [err, setErr] = useState(false);
  const [file, setFile] = useState<{ ref: DriveRef; name: string } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const cur = path[path.length - 1];
  useEffect(() => {
    setPath([{ id, rk, title }]);
    setFile(null);
  }, [id, rk, title]);
  useEffect(() => {
    let alive = true;
    setData(null);
    setErr(false);
    loadFolder(cur.id, cur.rk).then(
      (d) => {
        if (!alive) return;
        setData(d);
        // papka nomi berilmagan bo'lsa — Google'dagi nomi
        if (d.title) setPath((p) => p.map((x) => (x.id === d.id && !x.title ? { ...x, title: d.title } : x)));
      },
      () => alive && setErr(true),
    );
    return () => {
      alive = false;
    };
  }, [cur.id, cur.rk]);
  useEffect(() => {
    if (list.current) list.current.scrollTop = 0;
  }, [cur.id, data]);
  const open = (it: DriveItem) => {
    if (it.kind === "folder") {
      setPath((p) => [...p, { id: it.id, rk: it.rk, title: it.name }]);
      return;
    }
    const ref = driveRef(it.url);
    setFile({ ref: ref && (ref.type === "file" || ref.type === "gdoc") ? ref : { type: "file", id: it.id, rk: it.rk }, name: it.name });
  };
  const curRef: DriveRef = { type: "folder", id: cur.id, rk: cur.rk };

  if (file) {
    return (
      <div className="dv-drive">
        <div className="dv-bar dv-sub">
          <button type="button" className="dv-btn ghost" onClick={() => setFile(null)}>
            <ArrowLeft size={16} aria-hidden /> <span>{t.back}</span>
          </button>
          <b className="dv-sub-name" title={file.name}>
            {file.name}
          </b>
          <a className="dv-btn ghost" href={viewUrl(file.ref)} target="_blank" rel="noopener noreferrer" title={t.openDrive} aria-label={t.openDrive}>
            <ExternalLink size={16} aria-hidden /> <span className="dv-hide-sm">{t.openDrive}</span>
          </a>
        </div>
        <Frame src={previewUrl(file.ref)} title={file.name} lang={lang} />
      </div>
    );
  }
  return (
    <div className="dv-drive">
      <div className="dv-bar dv-sub">
        <nav className="dv-crumbs" aria-label={t.folder}>
          {path.map((p, i) =>
            i < path.length - 1 ? (
              <span key={p.id + i} className="dv-crumb">
                <button type="button" onClick={() => setPath((x) => x.slice(0, i + 1))}>
                  {p.title || t.folder}
                </button>
                <ChevronRight size={14} aria-hidden />
              </span>
            ) : (
              <b key={p.id + i} className="dv-crumb cur" aria-current="page">
                <FolderOpen size={16} aria-hidden /> <span>{p.title || t.folder}</span>
              </b>
            ),
          )}
        </nav>
        <a className="dv-btn ghost" href={viewUrl(curRef)} target="_blank" rel="noopener noreferrer" title={t.openDrive} aria-label={t.openDrive}>
          <ExternalLink size={16} aria-hidden /> <span className="dv-hide-sm">{t.openDrive}</span>
        </a>
      </div>
      {err ? (
        // Google javob bermadi yoki papka yopiq — Google'ning o'z ro'yxati (faqat ko'rish uchun) va aniq tugma
        <>
          <div className="dv-msg">
            <p>{t.folderFailed}</p>
            <a className="dv-btn" href={viewUrl(curRef)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} aria-hidden /> {t.openDrive}
            </a>
          </div>
          <iframe className="dv-frame dv-frame-list ready" src={`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(cur.id)}${rkq(cur.rk, "&")}#list`} title={cur.title || t.folder} loading="lazy" />
        </>
      ) : !data ? (
        <p className="dv-msg">{t.loading}</p>
      ) : !data.items.length ? (
        <p className="dv-msg">{t.empty}</p>
      ) : (
        <div className="dv-list" ref={list}>
          {data.items.map((it) => (
            <button key={it.id} type="button" className={`dv-item ${it.kind}`} onClick={() => open(it)} title={it.name}>
              <span className="dv-item-ic">{itemIcon(it)}</span>
              <span className="dv-item-name">{it.name}</span>
              {it.modified && <span className="dv-item-date">{fmtDate(it.modified)}</span>}
              {it.kind === "folder" && <ChevronRight size={16} className="dv-item-go" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Google Drive'dagi arxiv (RAR/ZIP): server yuklab, ochib beradi

type ArchEntry = { path: string; name: string; kind: "folder" | "file"; size?: number; mime?: string };
type ArchState = { status: "preparing"; progress: number } | { status: "ready"; name: string; entries: ArchEntry[] } | { status: "error"; code?: string };

const archCache = new Map<string, ArchState>(); // tayyor ro'yxat — sahifa davomida qayta so'ralmaydi
const archUrl = (id: string) => `/api/gdrive/archive/${encodeURIComponent(id)}`;
const archFile = (id: string, path: string) => `${archUrl(id)}/f/${path.split("/").map(encodeURIComponent).join("/")}`;
const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const isPdf = (e: ArchEntry) => e.mime === "application/pdf";
const isImg = (e: ArchEntry) => /^image\/(png|jpeg|gif|webp|bmp)$/.test(e.mime || "");

function fmtSize(n: number | undefined, lang: string) {
  if (!n) return "";
  const t = strings(lang);
  const [v, u] = n < 1048576 ? [Math.max(n / 1024, 1), t.kb] : [n / 1048576, t.mb];
  const s = v < 10 ? v.toFixed(1) : String(Math.round(v));
  return `${lang.startsWith("en") ? s : s.replace(".", ",")} ${u}`;
}

function DriveArchive({ drive, name, lang }: { drive: DriveRef; name: string; lang: string }) {
  const t = strings(lang);
  const id = drive.id;
  const [st, setSt] = useState<ArchState | null>(archCache.get(id) || null);
  const [path, setPath] = useState<string[]>([]);
  const [file, setFile] = useState<ArchEntry | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // fayl ochilganda yoki ro'yxatga qaytilganda oynaning boshi ekrandan (yopishqoq sarlavha ostidan) chiqib ketgan bo'lsa — ko'rinishga keltiriladi
  useEffect(() => {
    const el = box.current?.closest(".dv");
    if (el && el.getBoundingClientRect().top < 72) el.scrollIntoView({ block: "start" });
  }, [file]);
  // tayyor bo'lguncha holat so'rab turiladi (server fonda yuklab, ochmoqda)
  useEffect(() => {
    if (archCache.get(id)?.status === "ready") return;
    let alive = true;
    let timer = 0;
    const poll = () =>
      fetch(archUrl(id), { credentials: "same-origin" })
        .then((r) => (r.ok ? (r.json() as Promise<ArchState>) : Promise.reject(new Error(String(r.status)))))
        .then(
          (d) => {
            if (!alive) return;
            setSt(d);
            if (d.status === "ready") archCache.set(id, d);
            if (d.status === "preparing") timer = window.setTimeout(poll, 1500);
          },
          () => alive && setSt({ status: "error" }),
        );
    poll();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [id]);
  const ready = st?.status === "ready" ? st : null;
  // papka → ichidagilar; arxivning boshida faqat bitta papka bo'lsa — darhol uning ichidan boshlanadi
  const tree = useMemo(() => {
    const m = new Map<string, ArchEntry[]>();
    for (const e of ready?.entries || []) {
      const p = parentOf(e.path);
      (m.get(p) || m.set(p, []).get(p)!).push(e);
    }
    let start = "";
    for (let k = m.get(""); k && k.length === 1 && k[0].kind === "folder"; k = m.get(start)) start = k[0].path;
    return { m, start };
  }, [ready]);
  useEffect(() => {
    setPath([tree.start]);
    setFile(null);
  }, [tree]);
  const cur = path[path.length - 1] ?? tree.start;
  useEffect(() => {
    if (list.current) list.current.scrollTop = 0;
  }, [cur]);
  const archName = ready?.name || name;
  const crumbLabel = (p: string) => (p ? p.slice(p.lastIndexOf("/") + 1) : archName.replace(/\.(zip|rar|7z|tar(\.\w+)?|tgz)$/i, "") || t.archive);
  const driveBtn = (
    <a className="dv-btn ghost" href={viewUrl(drive)} target="_blank" rel="noopener noreferrer" title={t.openDrive} aria-label={t.openDrive}>
      <ExternalLink size={16} aria-hidden /> <span className="dv-hide-sm">{t.openDrive}</span>
    </a>
  );

  if (st?.status === "error") return <Frame src={previewUrl(drive)} title={name} lang={lang} />; // server ocholmadi — Google'ning oynasi
  if (!ready) {
    const pct = st?.status === "preparing" ? Math.round(st.progress * 100) : 0;
    return (
      <div className="dv-drive">
        <div className="dv-bar dv-sub">
          <FileArchive size={18} aria-hidden className="dv-sub-ic" />
          <b className="dv-sub-name" title={name}>
            {name}
          </b>
          {driveBtn}
        </div>
        <div className="dv-prep" role="status">
          <p>
            {t.preparing} <span className="dv-prep-pct">{pct}%</span>
          </p>
          <div className="dv-progress" aria-hidden>
            <span style={{ width: `${Math.max(pct, 2)}%` }} />
          </div>
        </div>
      </div>
    );
  }
  if (file) {
    const src = archFile(id, file.path);
    return (
      <div className="dv-drive" ref={box}>
        <div className="dv-bar dv-sub">
          <button type="button" className="dv-btn ghost" onClick={() => setFile(null)}>
            <ArrowLeft size={16} aria-hidden /> <span>{t.back}</span>
          </button>
          <b className="dv-sub-name" title={file.name}>
            {file.name}
          </b>
          <a className="dv-btn ghost" href={`${src}?dl=1`} download={file.name} title={t.download} aria-label={t.download}>
            <Download size={16} aria-hidden /> <span className="dv-hide-sm">{t.download}</span>
          </a>
        </div>
        {isPdf(file) ? <PdfView src={src} lang={lang} /> : <img className="dv-img dv-arch-img" src={src} alt={file.name} decoding="async" />}
      </div>
    );
  }
  const items = tree.m.get(cur) || [];
  return (
    <div className="dv-drive" ref={box}>
      <div className="dv-bar dv-sub">
        <nav className="dv-crumbs" aria-label={t.archive}>
          {path.map((p, i) =>
            i < path.length - 1 ? (
              <span key={p} className="dv-crumb">
                <button type="button" onClick={() => setPath((x) => x.slice(0, i + 1))}>
                  {crumbLabel(p)}
                </button>
                <ChevronRight size={14} aria-hidden />
              </span>
            ) : (
              <b key={p} className="dv-crumb cur" aria-current="page">
                <FolderOpen size={16} aria-hidden /> <span>{crumbLabel(p)}</span>
              </b>
            ),
          )}
        </nav>
        {driveBtn}
      </div>
      {!items.length ? (
        <p className="dv-msg">{t.empty}</p>
      ) : (
        <div className="dv-list" ref={list}>
          {items.map((e) => {
            const inner = (
              <>
                <span className="dv-item-ic">{itemIcon(e)}</span>
                <span className="dv-item-name">{e.name}</span>
                {e.kind === "file" && <span className="dv-item-date">{fmtSize(e.size, lang)}</span>}
                {e.kind === "folder" ? <ChevronRight size={16} className="dv-item-go" aria-hidden /> : !isPdf(e) && !isImg(e) && <Download size={16} className="dv-item-go" aria-hidden />}
              </>
            );
            // PDF va rasm — shu oynada; Word/Excel va boshqalar — yuklab olinadi
            return e.kind === "folder" || isPdf(e) || isImg(e) ? (
              <button key={e.path} type="button" className={`dv-item ${e.kind}`} title={e.name} onClick={() => (e.kind === "folder" ? setPath((x) => [...x, e.path]) : setFile(e))}>
                {inner}
              </button>
            ) : (
              <a key={e.path} className="dv-item file" href={`${archFile(id, e.path)}?dl=1`} download={e.name} title={e.name}>
                {inner}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ asosiy komponent

export function DocViewer({ src, title, lang = "uz" }: { src: string; title?: string; lang?: string }) {
  const t = strings(lang);
  const root = useRef<HTMLDivElement>(null);
  const near = useNear(root);
  const kind = docKind(src);
  const ref0 = kind === "drive" ? driveRef(src) : null;
  // `open?id=ID` — fayl yoki papka, fayl bo'lsa — arxivmi (RAR/ZIP): server Google'dan bilib beradi (natija keshlanadi); bilinmasa — oddiy fayl.
  // Oddiy fayl uchun javob 1,2 soniyadan kechiksa, Google'ning oynasi kutmasdan ochiladi
  const askMeta = near && (ref0?.type === "open" || ref0?.type === "file");
  const [meta, setMeta] = useState<DriveMeta | null>(null);
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!askMeta || !ref0) return;
    let alive = true;
    setMeta(null);
    setLate(false);
    const timer = window.setTimeout(() => alive && setLate(true), 1200);
    loadMeta(ref0.id).then(
      (m) => alive && setMeta(m),
      () => alive && setMeta({ kind: "file" }),
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [askMeta, ref0?.id]);
  const drive: DriveRef | null = ref0?.type === "open" && meta ? { ...ref0, type: meta.kind === "folder" ? "folder" : "file" } : ref0;
  const folder = drive?.type === "folder";
  const archive = drive?.type === "file" && !!meta?.archive;
  // tahrirlagich sarlavha berilmasa havolaning oxirgi qismini yozadi («view», papka ID si) yoki havolaning o'zi turadi — bu nom emas
  if (title && (/^https?:\/\//.test(title) || (drive && title === src.split("/").pop()))) title = "";
  let fileName = "";
  try {
    fileName = drive ? "" : decodeURIComponent(src.split(/[?#]/)[0].split("/").pop() || "");
  } catch {
    fileName = src;
  }
  const name = title || fileName || meta?.name || "Google Drive";
  const local = sameOrigin(src);
  const tall = kind === "pdf" || (!!drive && !folder);
  return (
    <div ref={root} className="dv">
      {!(near && (folder || archive)) && (
        <div className="dv-bar">
          {folder ? <Folder size={18} aria-hidden /> : <FileText size={18} aria-hidden />}
          <b title={name}>{name}</b>
          <span className="dv-acts">
            {kind === "pdf" && local && (
              <a href={src} download aria-label={t.download} title={t.download}>
                <Download size={16} />
              </a>
            )}
            <a href={drive ? viewUrl(drive) : src} target="_blank" rel="noopener noreferrer" aria-label={drive ? t.openDrive : t.open} title={drive ? t.openDrive : t.open}>
              <ExternalLink size={16} />
            </a>
          </span>
        </div>
      )}
      {!near ? (
        // ekrandan uzoqda — hali hech narsa yuklanmaydi; joy oldindan ajratiladi (sahifa sakramasin)
        <div className={tall ? "dv-placeholder tall" : "dv-placeholder"} />
      ) : drive ? (
        drive.type === "open" || (drive.type === "file" && !meta && !late) ? (
          <p className="dv-msg">{t.loading}</p>
        ) : drive.type === "folder" ? (
          <DriveFolder id={drive.id} rk={drive.rk} title={title || ""} lang={lang} />
        ) : archive ? (
          <DriveArchive drive={drive} name={title || meta?.name || name} lang={lang} />
        ) : (
          <Frame src={previewUrl(drive)} title={name} lang={lang} />
        )
      ) : kind === "pdf" ? (
        <PdfView src={src} lang={lang} />
      ) : kind === "image" ? (
        <img className="dv-img" src={src} alt={name} loading="lazy" decoding="async" />
      ) : (
        <p className="dv-msg">
          <a href={src} target="_blank" rel="noopener noreferrer">
            {name}
          </a>
        </p>
      )}
    </div>
  );
}
