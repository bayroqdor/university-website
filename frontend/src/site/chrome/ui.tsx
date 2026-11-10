/* Sayt dizayn tizimi: kichik umumiy bloklar (ko'rinish animatsiyasi, surat, bo'lim sarlavhasi). */
import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSite } from "../../lib/site";

/** Bo'lim sarlavhalari va asosiy bloklar ko'rinish zonasiga kirganda: opacity + 16px, 700ms. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { motionOn } = useSite();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!motionOn || typeof IntersectionObserver === "undefined") {
      el.classList.add("in");
      return;
    }
    el.classList.add("rv");
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es)
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [motionOn]);
  return ref;
}

export function Reveal({ as: Tag = "div", className = "", style, children }: { as?: ElementType; className?: string; style?: CSSProperties; children: ReactNode }) {
  const ref = useReveal<HTMLElement>();
  return (
    <Tag ref={ref} className={className} style={style}>
      {children}
    </Tag>
  );
}

/** Surat: aniq o'lcham (width/height), lazy, object-fit. Surat yo'q bo'lsa — hech narsa chizilmaydi (o'rinbosar blok yo'q). */
export function Photo({ src, alt, w, h, className = "", eager = false }: { src?: string; alt: string; w: number; h: number; className?: string; eager?: boolean }) {
  if (!src) return null;
  return (
    <span className={`ph ${className}`} style={{ aspectRatio: `${w} / ${h}` }}>
      <img src={src} alt={alt} width={w} height={h} loading={eager ? "eager" : "lazy"} decoding="async" />
    </span>
  );
}

/** Ichki havola yoki tashqi havola (yangi oynada). Bo'sh manzil — oddiy matn, «#» havola yo'q. */
export function A({ to, className = "", children, ariaLabel }: { to?: string; className?: string; children: ReactNode; ariaLabel?: string }) {
  if (!to) return <span className={className}>{children}</span>;
  if (/^(https?:|mailto:|tel:)/.test(to))
    return (
      <a href={to} className={className} aria-label={ariaLabel} {...(/^https?:/.test(to) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    );
  return (
    <Link to={to} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}

/** Bo'lim boshi: chap ustunda eyebrow, o'ngda sarlavha va qisqa matn; ixtiyoriy havola. */
export function Head({ eyebrow, title, lead, more, id }: { eyebrow: string; title: string; lead?: string; more?: { to: string; label: string }; id?: string }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div className="hd" ref={ref}>
      <p className="ey hd-ey">{eyebrow}</p>
      <div className="hd-main">
        <h2 className="h2" id={id}>
          {title}
        </h2>
        {lead && <p className="hd-lead">{lead}</p>}
      </div>
      {more && (
        <A to={more.to} className="tlink hd-more">
          {more.label} <span aria-hidden>→</span>
        </A>
      )}
    </div>
  );
}

/** HTML teglarini olib tashlash (e'lon sarlavhalari va qisqa matnlar uchun). */
export function plain(s: string | undefined | null): string {
  if (!s) return "";
  const div = typeof document !== "undefined" ? document.createElement("div") : null;
  if (!div) return s.replace(/<[^>]*>/g, "");
  div.innerHTML = s;
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

/** «Qabul 2026» matnidagi yilni admin belgilagan qabul yiliga almashtirish (admin → Bosh sahifa → «Qabul» tugmasi) */
export function withAdmissionYear(text: string, year?: number): string {
  return year ? text.replace(/\b(19|20)\d{2}\b/, String(year)) : text;
}
