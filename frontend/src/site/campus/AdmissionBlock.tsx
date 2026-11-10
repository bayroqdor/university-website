// /admission sahifasidagi blok: qabul bosqichlari (ixcham, yil tanlash bilan) va abituriyent bo'limlariga havolalar.
// Mazmuni bo'lmagan bo'lim ko'rsatilmaydi; hech narsa bo'lmasa — blok umuman chiqmaydi.
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cx, type Sections, type StepsData } from "./api";
import { Timeline, YearSwitch } from "./Timeline";
import { useCx } from "./ui";

export default function AdmissionBlock() {
  const { t, lang } = useCx();
  const [sec, setSec] = useState<Sections | null>(null);
  const [d, setD] = useState<StepsData | null>(null);
  const [year, setYear] = useState<number | undefined>();
  useEffect(() => {
    cx.sections().then(setSec).catch(() => setSec(null));
  }, []);
  useEffect(() => {
    if (!sec?.steps) return;
    cx.steps(lang, year).then(setD).catch(() => setD(null));
  }, [sec, lang, year]);
  if (!sec) return null;
  const links = (
    [
      ["calculator", "/admission/calculator"],
      ["parents", "/parents"],
      ["map", "/campus-map"],
      ["tour", "/virtual-tour"],
    ] as const
  ).filter(([k]) => sec[k]);
  if (!links.length && !sec.steps) return null;
  return (
    <div className="cx-adm">
      {sec.steps && d && d.steps.length > 0 && (
        <section className="cx-adm-steps" aria-labelledby="cx-adm-steps-h">
          <div className="cx-adm-head">
            <h2 className="h-sm" id="cx-adm-steps-h">
              {t.steps} {d.label}
            </h2>
            <YearSwitch d={d} onYear={setYear} />
          </div>
          <Timeline d={d} compact />
          <p className="cx-more">
            <Link className="tlink" to={`/admission/steps${d.year ? `?year=${d.year}` : ""}`}>
              {t.steps} <span aria-hidden>→</span>
            </Link>
          </p>
        </section>
      )}
      {links.length > 0 && (
        <ul className="cx-adm-links">
          {links.map(([k, to]) => (
            <li key={k}>
              <Link to={to}>
                <span>{t[k]}</span>
                <ArrowUpRight size={22} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
