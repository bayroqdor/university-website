// Qabul bosqichlari: bugungi sanaga ko'ra joriy bosqich ajratiladi; o'quv yili bo'yicha almashtirish.
// /admission/steps sahifasida to'liq, /admission sahifasida ixcham (AdmissionBlock) ko'rinishda.
import { ArrowUpRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import type { StepsData } from "./api";
import { dateL, Seg, useCx } from "./ui";

export function range(a: string | undefined, b: string | undefined, lang: Parameters<typeof dateL>[1]): string {
  const x = dateL(a, lang);
  const y = dateL(b, lang);
  if (!x) return y;
  if (!y || x === y) return x;
  return `${x} — ${y}`;
}

export function YearSwitch({ d, onYear }: { d: StepsData; onYear: (y: number) => void }) {
  const { t } = useCx();
  if (d.years.length < 2 || !d.year) return null;
  return <Seg label={t.ac_year} value={d.year} onChange={onYear} options={d.years.map((y) => ({ value: y.year, label: y.label }))} />;
}

export function Timeline({ d, compact = false }: { d: StepsData; compact?: boolean }) {
  const { t, lang } = useCx();
  if (!d.steps.length) return <p className="cx-empty">{t.steps_none}</p>;
  return (
    <ol className={`cx-tl ${compact ? "compact" : ""}`} aria-label={`${t.steps} ${d.label || ""}`}>
      {d.steps.map((s, i) => {
        const cur = d.current === i;
        const st = cur ? t.st_now : s.state === "done" ? t.st_done : t.st_next;
        const ext = s.url && /^https?:/.test(s.url);
        return (
          <li key={s.id} className={`${s.state} ${cur ? "cur" : ""}`} aria-current={cur ? "step" : undefined}>
            <span className="cx-tl-dot" aria-hidden>
              {s.state === "done" ? <Check size={14} /> : i + 1}
            </span>
            <div className="cx-tl-b">
              <p className="cx-tl-when tnum">
                <span className="cx-tl-st">{st}</span>
                {range(s.starts, s.ends, lang)}
              </p>
              <h3>{s.title}</h3>
              {!compact && s.summary && <p className="cx-tl-s">{s.summary}</p>}
              {s.url &&
                (ext ? (
                  <a className="tlink" href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.button || s.title} <ArrowUpRight size={15} aria-hidden />
                  </a>
                ) : (
                  <Link className="tlink" to={s.url}>
                    {s.button || s.title} <span aria-hidden>→</span>
                  </Link>
                ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
