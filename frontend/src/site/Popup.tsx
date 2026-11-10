// Saytga kirganda chiqadigan e'lon oynasi. Admin «E'lon oynasi» bo'limida yaratiladi: sarlavha, matn, rasm, video, tugmalar.
// Qanchalik tez-tez chiqishi: har safar / sessiyada bir marta / kuniga bir marta / bir marta (mazmuni o'zgarsa — yana).
// Cookie oynasi ochiq bo'lsa, foydalanuvchi tanlov qilguncha kutadi.
import { useFocusTrap } from "../a11y/focus";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { SitePopup } from "../lib/api";
import { useSite } from "../lib/site";
import { lockScroll } from "./fx";

const shownThisLoad = new Set<string>();

function key(p: SitePopup) {
  return `uni_pop_${p.id}_${p.version}`;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function due(p: SitePopup): boolean {
  const k = key(p);
  if (shownThisLoad.has(k)) return false;
  try {
    if (p.frequency === "session") return !sessionStorage.getItem(k);
    if (p.frequency === "daily") return localStorage.getItem(k) !== today();
    if (p.frequency === "once") return !localStorage.getItem(k);
  } catch {
    /* */
  }
  return true;
}

function markSeen(p: SitePopup) {
  const k = key(p);
  shownThisLoad.add(k);
  try {
    if (p.frequency === "session") sessionStorage.setItem(k, "1");
    if (p.frequency === "daily") localStorage.setItem(k, today());
    if (p.frequency === "once") localStorage.setItem(k, "1");
  } catch {
    /* */
  }
}

function pageMatch(p: SitePopup, path: string): boolean {
  if (path.startsWith("/admin") || path.startsWith("/login") || path.startsWith("/portal")) return false;
  if (p.pages === "home") return path === "/";
  if (p.pages === "list") return p.paths.some((x) => (x.endsWith("/") ? path.startsWith(x) : path === x || path.startsWith(x + "/")));
  return true;
}

const consentGiven = () => /(?:^|;\s*)uni_consent=/.test(document.cookie);

export function PopupHost() {
  const { data, t } = useSite();
  const loc = useLocation();
  const [cur, setCur] = useState<SitePopup | null>(null);
  const [consent, setConsent] = useState(consentGiven);
  useEffect(() => {
    if (consent) return;
    const on = () => setConsent(true);
    window.addEventListener("uni:consent", on);
    return () => window.removeEventListener("uni:consent", on);
  }, [consent]);

  useEffect(() => {
    if (cur || !consent || !data?.popups?.length) return;
    const p = data.popups.find((x) => pageMatch(x, loc.pathname) && due(x));
    if (!p) return;
    const h = window.setTimeout(() => {
      markSeen(p);
      setCur(p);
    }, Math.max(0.6, p.delay) * 1000);
    return () => window.clearTimeout(h);
  }, [data, loc.pathname, consent, cur]);

  return <PopupModal popup={cur} onClose={() => setCur(null)} closeLabel={t.close} />;
}

/* ------------------------------------------------------------------ modal */
export function PopupModal({ popup, onClose, closeLabel = "×" }: { popup: SitePopup | null; onClose: () => void; closeLabel?: string }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, !!popup, false); // fokus oyna ichida aylanadi (qaytarishni pastdagi effekt bajaradi)
  useEffect(() => {
    if (!popup) return;
    const prev = document.activeElement as HTMLElement | null;
    lockScroll(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 50);
    return () => {
      lockScroll(false);
      window.removeEventListener("keydown", onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [popup, onClose]);

  return (
    <AnimatePresence>
      {popup && (
        <motion.div
          ref={box}
          className="pop-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3, delay: 0.1 } }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
          role="dialog"
          aria-modal="true"
          aria-label={popup.title || popup.badge || "E’lon"}
        >
          <PopupCard popup={popup} onClose={onClose} closeRef={closeRef} closeLabel={closeLabel} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function PopupCard({
  popup: p,
  onClose,
  closeRef,
  closeLabel = "×",
  inline = false,
}: {
  popup: SitePopup;
  onClose: () => void;
  closeRef?: React.Ref<HTMLButtonElement>;
  closeLabel?: string;
  inline?: boolean;
}) {
  const hasMedia = !!(p.image || p.video);
  const layout = hasMedia ? p.layout : "stack";
  const style = (p.accent ? { "--pop-accent": p.accent } : {}) as React.CSSProperties;
  return (
    <motion.div
      className={`pop-card pl-${layout} ${hasMedia ? "has-media" : "no-media"} ${inline ? "inline" : ""}`}
      style={style}
      initial={inline ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16, transition: { duration: 0.2 } }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <button ref={closeRef} className="pop-x" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
        <X size={18} strokeWidth={2.4} />
      </button>
      {hasMedia && (
        <div className="pop-media">
          {p.video ? <PopVideo url={p.video} poster={p.image} /> : <img src={p.image} alt="" />}
          {layout === "cover" && <span className="pop-shade" aria-hidden />}
        </div>
      )}
      <div className="pop-body" data-lenis-prevent>
        {p.badge && (
          <motion.span className="pop-badge" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            {p.badge}
          </motion.span>
        )}
        {p.title && (
          <motion.h2 className="pop-title" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, duration: 0.5 }}>
            {p.title}
          </motion.h2>
        )}
        {p.body && (
          <motion.div className="pop-text" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, duration: 0.5 }}>
            {richText(p.body)}
          </motion.div>
        )}
        {p.buttons.length > 0 && (
          <motion.div className="pop-actions" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }}>
            {p.buttons.map((b, i) => {
              const cls = `pop-btn ${b.style === "ghost" ? "ghost" : "primary"}`;
              const inner = (
                <>
                  <span>{b.label}</span>
                  <ArrowUpRight size={17} />
                </>
              );
              if (b.url.startsWith("/") && !b.new_tab && !b.url.startsWith("/api/") && !b.url.startsWith("/media/") && !b.url.startsWith("/files/"))
                return (
                  <Link key={i} to={b.url} className={cls} onClick={onClose}>
                    {inner}
                  </Link>
                );
              return (
                <a key={i} href={b.url} className={cls} target={b.new_tab ? "_blank" : undefined} rel={b.new_tab ? "noopener noreferrer" : undefined} onClick={() => !b.new_tab && onClose()}>
                  {inner}
                </a>
              );
            })}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ video */
function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&mute=1&rel=0&playsinline=1&modestbranding=1`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?autoplay=1&muted=1&title=0&byline=0`;
  return null;
}

function PopVideo({ url, poster }: { url: string; poster?: string }) {
  const e = embedUrl(url);
  if (e) return <iframe src={e} title="video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />;
  return <video src={url} poster={poster || undefined} autoPlay muted loop playsInline controls preload="metadata" />;
}

/* ------------------------------------------------------------------ matn: xatboshilar, **qalin**, havolalar */
function richText(s: string): ReactNode {
  return s
    .split(/\n{2,}/)
    .map((para, i) => (
      <p key={i}>
        {para.split("\n").map((line, j, arr) => (
          <Fragment key={j}>
            {inline(line)}
            {j < arr.length - 1 && <br />}
          </Fragment>
        ))}
      </p>
    ));
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(\+?\d[\d\s()-]{7,}\d)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<b key={n++}>{m[1]}</b>);
    else if (m[2])
      out.push(
        <a key={n++} href={m[2]} target="_blank" rel="noopener noreferrer">
          {m[2].replace(/^https?:\/\/(www\.)?/, "")}
        </a>,
      );
    else if (m[3])
      out.push(
        <a key={n++} href={`tel:${m[3].replace(/[^\d+]/g, "")}`}>
          {m[3]}
        </a>,
      );
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
