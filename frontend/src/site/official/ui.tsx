// Rasmiy bo'limlar uchun umumiy qismlar: sarlavha + sahifa yo'li (breadcrumb), yuklash holati, rozilik qatori, formatlash
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Lang } from "../../lib/api";
import { useSite } from "../../lib/site";
import { Consent } from "./Consent";
import { useOT } from "./i18n";
import "../../styles/official.css";

export function OfficialHero({ title, sub, parent, actions, print = false }: { title: string; sub?: string; parent?: { label: string; to: string }; actions?: ReactNode; print?: boolean }) {
  const { o } = useOT();
  const p = parent || { label: o.institute, to: "/about" };
  return (
    <section className={`page-hero of-hero ${print ? "of-print" : ""}`}>
      <div className="container">
        <nav className="of-crumbs" aria-label={o.breadcrumb}>
          <ol>
            <li>
              <Link to="/">{o.home}</Link>
            </li>
            <li>
              <Link to={p.to}>{p.label}</Link>
            </li>
            <li aria-current="page">{title}</li>
          </ol>
        </nav>
        <h1 className="page-title of-title">{title}</h1>
        {sub && <p className="page-sub of-sub">{sub}</p>}
        {actions && <div className="of-hero-acts">{actions}</div>}
      </div>
    </section>
  );
}

/** Ma'lumot yuklash: null — yuklanmoqda, "404" — bo'lim bo'sh yoki topilmadi (sahifa NotFound ko'rsatadi) */
export function useLoad<T>(fn: (lang: Lang) => Promise<T>): T | null | "404" {
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
  }, [lang]);
  return d;
}

export function Skeleton() {
  return (
    <div className="container section" aria-busy="true">
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
  );
}

/** Shaxsiy ma'lumot yig'adigan formalar uchun rozilik qatori */
export function ConsentNote() {
  return <Consent />;
}

export function fmtSize(n: number | null | undefined, lang: Lang): string {
  if (!n) return "";
  const u = { uz: ["B", "KB", "MB"], ru: ["Б", "КБ", "МБ"], en: ["B", "KB", "MB"] }[lang];
  if (n < 1024) return `${n} ${u[0]}`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} ${u[1]}`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", lang === "en" ? "." : ",")} ${u[2]}`;
}

export function fmtNum(n: number | null | undefined, lang: Lang): string {
  if (n === null || n === undefined) return "";
  return n.toLocaleString(lang === "en" ? "en-GB" : "ru-RU").replace(/[\u202f\u00a0]/g, " ");
}
