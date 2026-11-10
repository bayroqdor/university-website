// Kontrakt narxlari: yo'nalish kartasidagi narx tasmasi, yo'nalish sahifasidagi narx bloki va barcha yo'nalishlar narx jadvali.
import { ArrowUpRight, BadgePercent, Check, MessageCircle, Sparkles, Wallet } from "lucide-react";
import { animate, useInView } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Fee, Lang, Program } from "../lib/api";
import { useSite } from "../lib/site";
import { Reveal } from "./fx";

/* ------------------------------------------------------------------ formatlash */
const SEP: Record<Lang, string> = { uz: " ", ru: " ", en: "," };
const CUR: Record<Lang, string> = { uz: "so‘m", ru: "сум", en: "UZS" };

export function fmtMoney(n: number, lang: Lang): string {
  const s = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, SEP[lang] || " ");
  return lang === "en" ? `UZS ${s}` : `${s} ${CUR[lang] || "so‘m"}`;
}

/** 18 500 000 → «18,5 mln so‘m» / «18,5 млн сум» / «UZS 18.5M» */
export function fmtCompact(n: number, lang: Lang): string {
  const m = n / 1_000_000;
  const v = (Math.round(m * 10) / 10).toString();
  if (lang === "en") return `UZS ${v}M`;
  return `${v.replace(".", ",")} ${lang === "ru" ? "млн сум" : "mln so‘m"}`;
}

export function minFee(p: Program): Fee | null {
  const f = (p.fees || []).filter((x) => x.amount > 0);
  if (!f.length) return null;
  return f.reduce((a, b) => (b.amount < a.amount ? b : a));
}

function years(duration: string | undefined): number {
  const m = (duration || "").match(/\d+(?:[.,]\d+)?/);
  const n = m ? parseFloat(m[0].replace(",", ".")) : 4;
  return n > 0 && n < 10 ? n : 4;
}

function pct(f: Fee) {
  return f.old && f.old > f.amount ? Math.round((1 - f.amount / f.old) * 100) : 0;
}

/** Ko'ringanda 0 dan summagacha sanab chiqadi */
function CountUp({ value, lang }: { value: number; lang: Lang }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const { motionOn } = useSite();
  const [v, setV] = useState(motionOn ? 0 : value);
  useEffect(() => {
    if (!motionOn) return setV(value);
    if (!inView) return;
    const c = animate(0, value, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => setV(x) });
    return () => c.stop();
  }, [inView, value, motionOn]);
  const s = Math.round(v / 1000) * 1000;
  return <span ref={ref}>{fmtMoney(s, lang).replace(/\s?(so‘m|сум|숨)$/, "").replace(/^UZS\s/, "")}</span>;
}

/* ------------------------------------------------------------------ yo'nalish kartasidagi narx */
export function CardPrice({ p }: { p: Program }) {
  const { t, lang, data } = useSite();
  const f = minFee(p);
  if (!f || !data?.tuition) return null;
  const many = (p.fees || []).length > 1;
  const v = fmtCompact(f.amount, lang);
  const off = pct(f);
  return (
    <div className="card-price">
      <span className="card-price-ic" aria-hidden>
        <Wallet size={17} />
      </span>
      <span className="card-price-label">
        {t.tu_title}
        <small>{many ? t.fee_forms[f.form] : t.tu_year.replace("{y}", data.tuition.year)}</small>
      </span>
      <span className="card-price-val">
        {off > 0 && <s>{fmtCompact(f.old!, lang)}</s>}
        <b>{many ? t.tu_from.replace("{v}", v) : v}</b>
        <small>/ {t.per_year_short}</small>
      </span>
      {off > 0 && <span className="card-price-off">−{off}%</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ yo'nalish sahifasidagi blok */
export function TuitionBlock({ p }: { p: Program }) {
  const { t, lang, data } = useSite();
  const tu = data?.tuition;
  const fees = p.fees || [];
  if (!tu || !fees.length) return null;
  const n = years(p.duration);
  const cheapest = fees.length > 1 ? minFee(p)?.form : null;
  return (
    <section className="tu-block" style={p.accent ? ({ "--pa": p.accent } as React.CSSProperties) : undefined} id="tuition">
      <Reveal className="tu-head">
        <span className="tu-eyebrow">
          <Sparkles size={14} /> {t.tu_year.replace("{y}", tu.year)}
        </span>
        <h2 className="tu-title">{t.tu_title}</h2>
      </Reveal>
      <div className="tu-grid">
        <div className={`tu-cards n${Math.min(fees.length, 3)}`}>
          {fees.map((f, i) => {
            const off = pct(f);
            return (
              <Reveal key={f.form} delay={i * 0.08} className={`tu-card ${cheapest === f.form ? "best" : ""}`}>
                <span className="tu-card-glow" aria-hidden />
                <div className="tu-card-top">
                  <span className="tu-form">{t.fee_forms[f.form] || f.form}</span>
                  {cheapest === f.form && <span className="tu-best">{t.cheapest}</span>}
                  {off > 0 && (
                    <span className="tu-off">
                      <BadgePercent size={14} /> −{off}% {t.tu_discount}
                    </span>
                  )}
                </div>
                {off > 0 && <s className="tu-old">{fmtMoney(f.old!, lang)}</s>}
                <div className="tu-amount">
                  {lang === "en" && <span className="tu-cur">UZS</span>}
                  <b>
                    <CountUp value={f.amount} lang={lang} />
                  </b>
                  {lang !== "en" && <span className="tu-cur">{CUR[lang]}</span>}
                  <span className="tu-per">/ {t.per_year}</span>
                </div>
                {tu.usd_rate ? <div className="tu-usd">≈ ${Math.round(f.amount / tu.usd_rate).toLocaleString("en-US")}</div> : null}
                <dl className="tu-rows">
                  <div>
                    <dt>{t.per_sem}</dt>
                    <dd>{fmtMoney(f.amount / 2, lang)}</dd>
                  </div>
                  <div>
                    <dt>{t.full_course.replace("{n}", String(n))}</dt>
                    <dd>{fmtMoney(f.amount * n, lang)}</dd>
                  </div>
                </dl>
              </Reveal>
            );
          })}
        </div>
        <Reveal delay={0.15} className="tu-side">
          <h3>{t.tu_benefits}</h3>
          <ul>
            {tu.highlights.map((h) => (
              <li key={h}>
                <span>
                  <Check size={14} />
                </span>
                {h}
              </li>
            ))}
            {p.fee_note && (
              <li>
                <span>
                  <Check size={14} />
                </span>
                {p.fee_note}
              </li>
            )}
          </ul>
          <p className="tu-note">{tu.note}</p>
          <div className="tu-cta">
            {data?.uni.admission_url ? (
              <a className="btn btn-primary" href={data.uni.admission_url} target="_blank" rel="noopener noreferrer">
                {t.tu_apply} <ArrowUpRight size={16} />
              </a>
            ) : (
              <Link className="btn btn-primary" to="/admission">
                {t.tu_apply} <ArrowUpRight size={16} />
              </Link>
            )}
            <Link className="btn btn-ghost" to="/contact">
              <MessageCircle size={16} /> {t.tu_ask}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ barcha yo'nalishlar narxlari jadvali */
export function TuitionTable({ items, faculties }: { items: Program[]; faculties?: { id: string; title: string }[] }) {
  const { t, lang, data } = useSite();
  const [sort, setSort] = useState<"" | "asc" | "desc">("");
  const rows = useMemo(() => items.filter((p) => (p.fees || []).length), [items]);
  const forms = useMemo(() => {
    const order = ["day", "evening", "extramural", "distance", "second"] as const;
    const set = new Set(rows.flatMap((p) => (p.fees || []).map((f) => f.form)));
    return order.filter((f) => set.has(f));
  }, [rows]);
  const max = Math.max(1, ...rows.flatMap((p) => (p.fees || []).map((f) => f.amount)));
  const min = Math.min(...rows.map((p) => minFee(p)?.amount ?? Infinity));
  const shown = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => ((minFee(a)?.amount ?? 0) - (minFee(b)?.amount ?? 0)) * (sort === "asc" ? 1 : -1));
  }, [rows, sort]);
  const facName = (p: Program) => p.faculty || faculties?.find((f) => f.id === p.faculty_id)?.title || "";
  if (!data?.tuition || !rows.length) return null;
  return (
    <section className="tu-table-wrap" id="tuition">
      <div className="tu-table-head">
        <div>
          <span className="tu-eyebrow">
            <Wallet size={14} /> {t.tu_year.replace("{y}", data.tuition.year)}
          </span>
          <h2 className="tu-title">{t.tu_table}</h2>
          <p className="tu-sub">{t.tu_table_sub}</p>
        </div>
        <div className="tu-sort" role="group">
          <button className={sort === "asc" ? "on" : ""} onClick={() => setSort(sort === "asc" ? "" : "asc")}>
            {t.sort_price}
          </button>
          <button className={sort === "desc" ? "on" : ""} onClick={() => setSort(sort === "desc" ? "" : "desc")}>
            {t.sort_price_desc}
          </button>
        </div>
      </div>
      <div className="tu-table" role="table" style={{ ["--cols" as string]: forms.length }}>
        <div className="tu-tr tu-th" role="row">
          <span role="columnheader">{t.tu_program}</span>
          {forms.map((f) => (
            <span key={f} role="columnheader">
              {t.fee_forms[f]}
            </span>
          ))}
        </div>
        {shown.map((p, i) => {
          const m = minFee(p)?.amount;
          return (
            <Reveal key={p.id} delay={Math.min(i, 10) * 0.03} className="tu-tr">
              <Link to={`/programs/${p.slug}`} className="tu-prog" role="cell" style={p.accent ? ({ "--pa": p.accent } as React.CSSProperties) : undefined}>
                <i aria-hidden />
                <span>
                  <b>{p.title}</b>
                  <small>{facName(p)}</small>
                </span>
                {m === min && <em className="tu-best">{t.cheapest}</em>}
              </Link>
              {forms.map((form) => {
                const f = (p.fees || []).find((x) => x.form === form);
                return (
                  <span key={form} role="cell" className={`tu-cell ${f ? "" : "tu-none"}`} data-label={t.fee_forms[form]}>
                    {f ? (
                      <>
                        <b>{fmtMoney(f.amount, lang)}</b>
                        <span className="tu-bar" aria-hidden>
                          <span style={{ width: `${Math.max(8, (f.amount / max) * 100)}%` }} />
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                );
              })}
            </Reveal>
          );
        })}
      </div>
      <p className="tu-note">
        {data.tuition.note} {data.tuition.highlights.length ? `· ${data.tuition.highlights.join(" · ")}` : ""}
      </p>
    </section>
  );
}
