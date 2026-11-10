// Saytdagi hujjatni ko'rish sahifasi: /document?src=/media/…pdf&title=… — sayt qolipi ichida, «Orqaga» va «Yuklab olish» tugmalari bilan.
// PDF pdf.js bilan (DocViewer: kerakli qismlar Range so'rovlari bilan, birinchi bet darhol), rasm — o'zi. ONLYOFFICE ishlatilmaydi:
// ochiq saytda u har bir mehmon uchun ~30 MB tahrirlagich va serverda konvertatsiya demakdir (komissiya qarori 2 daqiqa ochilardi).
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSite } from "../../lib/site";
import { docKind, DocViewer } from "../../rich/DocViewer";

const SITE_FILE = /^\/media\/[^/?#]+$/;

/** Saytning o'z PDF fayli bo'lsa — uning yo'li (sayt ichida ko'rsatiladi); Word/Excel/PowerPoint — null (oddiy havola: yuklab olinadi),
 *  rasm — null (avvalgidek to'g'ridan-to'g'ri ochiladi, galereyalar o'z ishini qiladi) */
export function viewablePath(href: string): string | null {
  try {
    const u = new URL(href, window.location.href);
    if (u.origin !== window.location.origin || !SITE_FILE.test(u.pathname)) return null;
    return docKind(u.pathname) === "pdf" ? u.pathname : null;
  } catch {
    return null;
  }
}

export function documentHref(src: string, title = ""): string {
  const q = new URLSearchParams({ src });
  if (title) q.set("title", title);
  return `/document?${q}`;
}

const L = {
  uz: { back: "Orqaga", download: "Yuklab olish", open: "Yangi oynada ochish", doc: "Hujjat", bad: "Bu faylni brauzerda ko‘rsatib bo‘lmaydi." },
  ru: { back: "Назад", download: "Скачать", open: "Открыть в новом окне", doc: "Документ", bad: "Этот файл нельзя показать в браузере." },
  en: { back: "Back", download: "Download", open: "Open in new tab", doc: "Document", bad: "This file can’t be shown in the browser." },
};

export function DocumentPage() {
  const { lang } = useSite();
  const t = L[lang as keyof typeof L] || L.uz;
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const raw = sp.get("src") || "";
  const src = SITE_FILE.test(raw) ? raw : "";
  const kind = src ? docKind(src) : null;
  const name = (sp.get("title") || "").trim() || decodeURIComponent(src.split("/").pop() || "") || t.doc;
  const back = () => ((window.history.state as { idx?: number } | null)?.idx ? nav(-1) : nav("/"));
  return (
    <section className="section docpage">
      <div className="container narrow-l">
        <div className="docpage-bar">
          <button type="button" className="btn btn-ghost sm" onClick={back}>
            <ArrowLeft size={17} aria-hidden />
            <span>{t.back}</span>
          </button>
          <h1 className="docpage-t" title={name}>
            {name}
          </h1>
          {src && (
            <span className="docpage-acts">
              <a className="btn btn-ghost sm docpage-open" href={src} target="_blank" rel="noopener noreferrer" data-no-office="" aria-label={t.open} title={t.open}>
                <ExternalLink size={16} aria-hidden />
              </a>
              <a className="btn btn-primary sm" href={src} download data-no-office="">
                <Download size={16} aria-hidden />
                <span>{t.download}</span>
              </a>
            </span>
          )}
        </div>
        {src && (kind === "pdf" || kind === "image") ? (
          <div className="docpage-view">
            <DocViewer key={src} src={src} title={name} lang={lang} />
          </div>
        ) : (
          <p className="docpage-msg">{t.bad}</p>
        )}
      </div>
    </section>
  );
}
