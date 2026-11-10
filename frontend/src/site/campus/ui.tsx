// Talabalar hayoti / abituriyent sahifalari uchun umumiy bloklar: sarlavha va yo'l (breadcrumb), surat, filtr, forma maydoni,
// savol-javob, xodim kartasi, surat ko'ruvchi (lightbox) — sayt dizayn tizimi (Onest, 2px, soyasiz, gradiyentsiz).
import { ChevronLeft, ChevronRight, Mail, Phone, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { Lang } from "../../lib/api";
import { useSite } from "../../lib/site";
import { lockScroll } from "../fx";
import { Reveal } from "../chrome/ui";
import { img, srcset, type Photo, type StaffCard } from "./api";
import { CX, fill, type CxDict } from "./i18n";
import "../../styles/campus.css";

const RichHtml = lazy(() => import("../../rich/RichHtml"));

export function useCx(): { t: CxDict; lang: Lang; motionOn: boolean } {
  const { lang, motionOn } = useSite();
  return { t: CX[lang] || CX.uz, lang, motionOn };
}

/** Ma'lumot yuklash: null — yuklanmoqda, "404" — topilmadi / bo'lim yashirin. */
export function useData<T>(fn: () => Promise<T>, deps: unknown[]): T | null | "404" {
  const [d, setD] = useState<T | null | "404">(null);
  useEffect(() => {
    let live = true;
    setD(null);
    fn()
      .then((x) => live && setD(x))
      .catch(() => live && setD("404"));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return d;
}

export type Crumb = { to?: string; label: string };

export function Crumbs({ items }: { items: Crumb[] }) {
  const { t } = useCx();
  const all: Crumb[] = [{ to: "/", label: t.home }, ...items];
  return (
    <nav className="cx-crumbs" aria-label="Breadcrumb">
      <ol>
        {all.map((c, i) => (
          <li key={i}>{c.to && i < all.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span aria-current={i === all.length - 1 ? "page" : undefined}>{c.label}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}

/** Sahifa boshi: yo'l, eyebrow, sarlavha, qisqa matn va ixtiyoriy amallar. */
export function Hero({ crumbs, eyebrow, title, lead, children, aside }: { crumbs: Crumb[]; eyebrow?: string; title: string; lead?: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <section className={`page-hero cx-hero ${aside ? "has-aside" : ""}`}>
      <div className="container">
        <Crumbs items={crumbs} />
        <Reveal className="cx-hero-in">
          <div className="cx-hero-main">
            {eyebrow && <p className="ey">{eyebrow}</p>}
            <h1 className="cx-h1">{title}</h1>
            {lead && <p className="cx-lead">{lead}</p>}
            {children}
          </div>
          {aside}
        </Reveal>
      </div>
    </section>
  );
}

export function Loading() {
  return (
    <div className="container cx-loading" aria-busy="true">
      <span />
      <span />
      <span />
    </div>
  );
}

/** Surat: o'lchami doim saqlanadi (surat bo'lmasa — tekis bo'sh quti), lazy, srcset bilan. */
export function Pic({ src, alt, ratio = "4 / 3", sizes = "(max-width: 760px) 100vw, 33vw", eager = false, className = "", w = 960 }: {
  src?: string;
  alt: string;
  ratio?: string;
  sizes?: string;
  eager?: boolean;
  className?: string;
  w?: number;
}) {
  if (!src) return <span className={`cx-pic empty ${className}`} style={{ aspectRatio: ratio }} aria-hidden="true" />;
  return (
    <span className={`cx-pic ${className}`} style={{ aspectRatio: ratio }}>
      <img src={img(src, w)} srcSet={srcset(src)} sizes={sizes} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" />
    </span>
  );
}

/** Filtr: tugmalar guruhi (aria-pressed), sahifa qayta yuklanmaydi. */
export function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="cx-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Rich({ html }: { html?: string }) {
  if (!html) return null;
  return (
    <Suspense fallback={null}>
      <RichHtml html={html} />
    </Suspense>
  );
}

export function Section({ id, title, children, className = "", alt = false }: { id?: string; title?: string; children: ReactNode; className?: string; alt?: boolean }) {
  const hid = useId();
  return (
    <section className={`cx-sec ${alt ? "alt" : ""} ${className}`} id={id} aria-labelledby={title ? hid : undefined}>
      <div className="container">
        {title && (
          <Reveal>
            <h2 className="cx-h2" id={hid}>
              {title}
            </h2>
          </Reveal>
        )}
        {children}
      </div>
    </section>
  );
}

/** Savol-javob (ochiladigan bloklar). */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="cx-faq">
      {items.map((x, i) => (
        <details key={i}>
          <summary>{x.q}</summary>
          <p>{x.a}</p>
        </details>
      ))}
    </div>
  );
}

export function People({ items }: { items: StaffCard[] }) {
  if (!items.length) return null;
  return (
    <ul className="cx-people">
      {items.map((p) => (
        <li key={p.id}>
          <Pic src={p.photo} alt={p.title} ratio="1 / 1" w={320} sizes="96px" className="cx-people-ph" />
          <div>
            <Link to={`/staff/${p.slug}`} className="cx-people-name">
              {p.title}
            </Link>
            {p.position && <p className="cx-people-pos">{p.position}</p>}
            {p.hours && <p className="cx-people-pos">{p.hours}</p>}
            <p className="cx-people-c">
              {p.phone && (
                <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>
                  <Phone size={15} aria-hidden /> {p.phone}
                </a>
              )}
              {p.email && (
                <a href={`mailto:${p.email}`}>
                  <Mail size={15} aria-hidden /> {p.email}
                </a>
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ forma maydoni */
export function Field({ label, error, optional, wide, children, id }: { label: string; error?: string; optional?: boolean; wide?: boolean; children: ReactNode; id: string }) {
  const { t } = useCx();
  return (
    <div className={`cx-f ${wide ? "wide" : ""} ${error ? "bad" : ""}`}>
      <label className="cx-l" htmlFor={id}>
        {label}
        {optional ? <small> ({t.optional})</small> : <i aria-hidden> *</i>}
      </label>
      {children}
      {error && (
        <span className="cx-err" id={`${id}-err`}>
          {error}
        </span>
      )}
    </div>
  );
}

/** Kiritish maydoniga xato va majburiylik atributlari */
export const aria = (id: string, error?: string, required = true) => ({
  id,
  "aria-invalid": error ? (true as const) : undefined,
  "aria-describedby": error ? `${id}-err` : undefined,
  "aria-required": required || undefined,
});

/** Server xatosi (400 {fields}) → maydon xatolari; boshqasi — umumiy xabar. */
export function errText(t: CxDict, code: string): string {
  return code === "too_many_attempts" ? t.too_many : code === "closed" ? t.closed_err : code === "duplicate" ? t.duplicate : code === "full" ? t.full_err : t.error;
}
export function fieldErr(t: CxDict, k: string, v: string): string {
  if (k === "phone") return t.bad_phone;
  if (k === "email") return t.bad_email;
  if (k === "name") return t.fio;
  return v === "required" ? t.req : t.req;
}

/* ------------------------------------------------------------------ suratlar to'ri va ko'ruvchi */
export function PhotoGrid({ photos, ratio = "1 / 1", title }: { photos: Photo[]; ratio?: string; title?: string }) {
  const { t } = useCx();
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <ul className="cx-grid-ph">
        {photos.map((p, i) => (
          <li key={p.url}>
            <button type="button" className="cx-ph-btn" onClick={() => setOpen(i)} aria-label={fill(t.open_photo, { t: p.alt || title || String(i + 1) })}>
              <Pic src={p.url} alt="" ratio={ratio} w={480} sizes="(max-width: 760px) 50vw, 25vw" />
            </button>
            {p.caption && <p className="cx-ph-cap">{p.caption}</p>}
          </li>
        ))}
      </ul>
      {open !== null && <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Kirish mumkin bo'lgan surat ko'ruvchi: Esc, ←/→, fokus ichkarida, telefonda surib almashtirish, hisoblagich, alt matn. */
export function Lightbox({ photos, index, onIndex, onClose }: { photos: Photo[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const { t, motionOn } = useCx();
  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const prevFocus = useRef<Element | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const n = photos.length;
  const p = photos[index];
  const go = useCallback((d: number) => onIndex((index + d + n) % n), [index, n, onIndex]);

  useEffect(() => {
    prevFocus.current = document.activeElement;
    closeBtn.current?.focus();
    lockScroll(true);
    return () => {
      lockScroll(false);
      (prevFocus.current as HTMLElement | null)?.focus?.();
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight" && n > 1) go(1);
      else if (e.key === "ArrowLeft" && n > 1) go(-1);
      else if (e.key === "Tab") {
        const els = Array.from(box.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") || []);
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, n, onClose]);
  // keyingi va oldingi suratni oldindan yuklash
  useEffect(() => {
    for (const d of [1, -1]) {
      const q = photos[(index + d + n) % n];
      if (q) new Image().src = img(q.url, 1600);
    }
  }, [index, n, photos]);

  return createPortal(
    <div
      className={`cx-lb ${motionOn ? "anim" : ""}`}
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-label={t.viewer}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s || n < 2) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="cx-lb-top">
        <p className="cx-lb-count tnum" aria-live="polite">
          {fill(t.counter, { i: index + 1, n })}
        </p>
        <button type="button" ref={closeBtn} className="cx-lb-btn" onClick={onClose} aria-label={t.close}>
          <X size={24} aria-hidden />
        </button>
      </div>
      <figure className="cx-lb-fig" key={p.url}>
        <img src={img(p.url, 1600)} srcSet={srcset(p.url)} sizes="100vw" alt={p.alt} />
        {p.caption && <figcaption>{p.caption}</figcaption>}
      </figure>
      {n > 1 && (
        <>
          <button type="button" className="cx-lb-btn cx-lb-prev" onClick={() => go(-1)} aria-label={t.prev}>
            <ChevronLeft size={28} aria-hidden />
          </button>
          <button type="button" className="cx-lb-btn cx-lb-next" onClick={() => go(1)} aria-label={t.next}>
            <ChevronRight size={28} aria-hidden />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

export const dateL = (iso: string | undefined | null, lang: Lang) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const M: Record<Lang, string[]> = {
    uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
    ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  };
  const m = M[lang][d.getMonth()];
  return lang === "uz" ? `${d.getDate()}-${m}, ${d.getFullYear()}` : lang === "ru" ? `${d.getDate()} ${m} ${d.getFullYear()}` : `${d.getDate()} ${m} ${d.getFullYear()}`;
};
