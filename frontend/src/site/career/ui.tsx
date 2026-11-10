// Hamkorlik va karyera: umumiy bloklar — sahifa boshi (yo'l bilan), yuklash, surat/logotip qutisi (bosh harflar), filtrlar, forma maydonlari
import type { JSONContent } from "@tiptap/core";
import { Check } from "lucide-react";
import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Lang } from "../../lib/api";
import { useSite } from "../../lib/site";
import { useCT } from "./i18n";
import "../../styles/cooperation.css";

const RichHtml = lazy(() => import("../../rich/RichHtml"));

export type Crumb = { to: string; label: string };

export function Hero({ crumbs, title, sub, children, eyebrow }: { crumbs: Crumb[]; title: string; sub?: string; children?: ReactNode; eyebrow?: ReactNode }) {
  const c = useCT();
  return (
    <section className="page-hero cc-hero">
      <div className="container">
        <nav className="cc-crumbs" aria-label={c.breadcrumb}>
          <ol>
            <li>
              <Link to="/">{c.home}</Link>
            </li>
            {crumbs.map((x) => (
              <li key={x.to}>
                <Link to={x.to}>{x.label}</Link>
              </li>
            ))}
            <li aria-current="page">{title}</li>
          </ol>
        </nav>
        {eyebrow && <p className="cc-eyebrow">{eyebrow}</p>}
        <h1 className="page-title cc-title">{title}</h1>
        {sub && <p className="page-sub cc-sub">{sub}</p>}
        {children}
      </div>
    </section>
  );
}

export function usePageTitle(title: string | undefined) {
  const { data } = useSite();
  useEffect(() => {
    if (title) document.title = `${title} — ${data?.site.title || data?.uni.abbr || "UNI"}`;
  }, [title, data]);
}

/** Ma'lumot yuklash (til o'zgarsa qayta): null — yuklanmoqda, "404" — topilmadi */
export function useLoad<T>(fn: (lang: Lang) => Promise<T>, deps: unknown[] = []): T | null | "404" {
  const { lang } = useSite();
  const [d, setD] = useState<T | null | "404">(null);
  useEffect(() => {
    let live = true;
    setD(null);
    fn(lang)
      .then((x) => live && setD(x))
      .catch(() => live && setD("404"));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, ...deps]);
  return d;
}

export function Skeleton() {
  const c = useCT();
  return (
    <div className="container section" aria-busy="true">
      <span className="cc-sr">{c.loading}</span>
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
  );
}

export function initialsOf(name: string): string {
  const parts = (name || "").replace(/[«»"()]/g, " ").split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || "?").slice(0, 2)).toUpperCase();
}

/** Logotip yoki surat qutisi: o'lchami doim bir xil; rasm bo'lmasa — bosh harflar (tekis fon). */
export function Box({ src, name, size = 64, kind = "logo", className = "" }: { src?: string; name: string; size?: number; kind?: "logo" | "photo"; className?: string }) {
  const c = useCT();
  return (
    <span className={`cc-box ${kind} ${className}`} style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt={(kind === "logo" ? c.logo_of : c.photo_of).replace("{name}", name)} width={size} height={size} loading="lazy" decoding="async" />
      ) : (
        <span aria-hidden="true" style={{ fontSize: Math.max(13, Math.round(size / 3)) }}>
          {initialsOf(name)}
        </span>
      )}
    </span>
  );
}

export function Rich({ html, doc }: { html?: string; doc?: JSONContent | null }) {
  if (!html && !doc) return null;
  return (
    <Suspense fallback={null}>
      <RichHtml html={html} doc={doc || undefined} />
    </Suspense>
  );
}

/* ---------------------------------------------------------------- filtrlar */
export function FilterSelect({ label, value, onChange, options, all }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; all?: string }) {
  const id = useId();
  return (
    <div className="cc-fld">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {all !== undefined && <option value="">{all}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SearchBox({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId();
  return (
    <div className="cc-fld cc-fld-search">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
    </div>
  );
}

/** Natijalar soni — ekran o'quvchiga filtr o'zgarganda o'qiladi */
export function Count({ text }: { text: string }) {
  return (
    <p className="cc-count" role="status" aria-live="polite">
      {text}
    </p>
  );
}

export function Tabs({ label, value, onChange, items }: { label: string; value: string; onChange: (v: string) => void; items: { value: string; label: string }[] }) {
  return (
    <div className="cc-tabs" role="group" aria-label={label}>
      {items.map((x) => (
        <button key={x.value} type="button" aria-pressed={value === x.value} className={value === x.value ? "on" : ""} onClick={() => onChange(x.value)}>
          {x.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- forma */
export function Field({
  label,
  error,
  hint,
  optional,
  children,
  wide,
  id,
}: {
  label: string;
  error?: string;
  hint?: string;
  optional?: string;
  children: (p: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
  wide?: boolean;
  id: string;
}) {
  const desc = [hint ? `${id}-h` : "", error ? `${id}-e` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`cc-f ${wide ? "wide" : ""} ${error ? "bad" : ""}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="cc-opt"> ({optional})</span>}
      </label>
      {hint && (
        <p className="cc-hint" id={`${id}-h`}>
          {hint}
        </p>
      )}
      {children({ id, "aria-invalid": !!error, "aria-describedby": desc })}
      {error && (
        <p className="cc-err" id={`${id}-e`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function CheckField({ id, checked, onChange, label, error }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; error?: string }) {
  return (
    <div className={`cc-check ${error ? "bad" : ""}`}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={!!error} aria-describedby={error ? `${id}-e` : undefined} />
      <label htmlFor={id}>{label}</label>
      {error && (
        <p className="cc-err" id={`${id}-e`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function ErrorSummary({ text, errors, labels }: { text: string; errors: Record<string, string>; labels: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null);
  const keys = Object.keys(errors);
  useEffect(() => {
    if (keys.length) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join()]);
  if (!keys.length) return null;
  return (
    <div className="cc-errsum" role="alert" tabIndex={-1} ref={ref}>
      <p>{text}</p>
      <ul>
        {keys.map((k) => (
          <li key={k}>
            <a
              href={`#f-${k}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`f-${k}`)?.focus();
              }}
            >
              {labels[k] || k}: {errors[k]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Done({ title, text, again, onAgain }: { title: string; text: string; again?: string; onAgain?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="cc-done" role="status" tabIndex={-1} ref={ref}>
      <span className="cc-done-ic" aria-hidden="true">
        <Check size={22} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
        {again && onAgain && (
          <button type="button" className="cc-btn" onClick={onAgain}>
            {again}
          </button>
        )}
      </div>
    </div>
  );
}

export const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/;
export const phoneOk = (v: string) => {
  const n = v.replace(/\D/g, "").length;
  return n >= 7 && n <= 15;
};
