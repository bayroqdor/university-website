// Abituriyentlarga: qabul bosqichlari (/admission/steps), «Qaysi yo'nalishga kira olaman?» kalkulyatori (/admission/calculator),
// ota-onalar uchun (/parents).
import { ArrowRight, Check, ExternalLink, Mail, MapPin, Minus, Phone } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { NotFound } from "../pages/Pages";
import { cx, type CalcResult, type CalcRow } from "./api";
import { fill, type CxDict } from "./i18n";
import { Timeline, YearSwitch } from "./Timeline";
import { aria, Faq, Field, Hero, Loading, People, Rich, Section, useCx, useData } from "./ui";

const admCrumb = (t: CxDict) => ({ to: "/admission", label: t.admission });

/* ------------------------------------------------------------------ qabul bosqichlari */
export function StepsPage() {
  const { t, lang } = useCx();
  const [sp, setSp] = useSearchParams();
  const year = Number(sp.get("year")) || undefined;
  const d = useData(() => cx.steps(lang, year), [lang, year]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  if (!d.steps.length && !year) return <NotFound />;
  return (
    <>
      <Hero crumbs={[admCrumb(t), { label: t.steps }]} eyebrow={t.applicants} title={`${t.steps}${d.label ? ` ${d.label}` : ""}`} lead={d.intro} />
      <Section className="tight-top">
        <div className="cx-tools">
          <YearSwitch d={d} onYear={(y) => setSp({ year: String(y) }, { replace: true })} />
        </div>
        <Timeline d={d} />
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ kalkulyator */
const FORM_KEY = { day: "f_day", extramural: "f_extramural", evening: "f_evening", distance: "f_distance", second: "f_second" } as const;
const LANG_KEY: Record<string, keyof CxDict> = { uz: "l_uz", ru: "l_ru", en: "l_en" };
const num = (v: number | null | undefined, lang: string) => (v === null || v === undefined ? "—" : v.toLocaleString(lang === "en" ? "en-GB" : "ru-RU", { maximumFractionDigits: 1 }));

function Status({ r, t, lang }: { r: CalcRow; t: CxDict; lang: string }) {
  const label =
    r.status === "grant" ? t.s_grant : r.status === "contract" ? t.s_contract : r.status === "short" ? fill(t.s_short, { x: num(r.gap, lang) }) : t.s_nodata;
  return (
    <span className={`cx-st ${r.status}`}>
      {r.status === "grant" || r.status === "contract" ? <Check size={16} aria-hidden /> : <Minus size={16} aria-hidden />}
      {label}
    </span>
  );
}

export function CalculatorPage() {
  const { t, lang } = useCx();
  const id = useId();
  const meta = useData(() => cx.calcMeta(lang), [lang]);
  const [sp, setSp] = useSearchParams();
  const [score, setScore] = useState(sp.get("score") || "");
  const [year, setYear] = useState<number>(Number(sp.get("year")) || 0);
  const [form, setForm] = useState(sp.get("form") || "");
  const [elang, setElang] = useState(sp.get("lang_ed") || "");
  const [err, setErr] = useState("");
  const [res, setRes] = useState<CalcResult | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef<HTMLDivElement>(null);
  const m = meta && meta !== "404" ? meta : null;
  const y = year || m?.years[0]?.year || 0;
  const opts = m?.by_year[String(y)] || { forms: [], langs: [] };

  const run = async (s = score, yy = y, f = form, l = elang) => {
    if (!m) return;
    const v = Number(String(s).replace(",", "."));
    if (!String(s).trim() || !Number.isFinite(v) || v < 0 || v > m.max_score) {
      setErr(fill(t.bad_score, { max: m.max_score }));
      setRes(null);
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const r = await cx.calc(lang, { score: String(v), year: yy || undefined, form: f || undefined, edu_lang: l || undefined });
      setRes(r);
      setSp(Object.fromEntries(Object.entries({ score: String(v), year: yy ? String(yy) : "", form: f, lang_ed: l }).filter(([, x]) => x)), { replace: true });
    } catch {
      setErr(t.error);
    }
    setBusy(false);
  };
  // havola orqali kelganda (ball URL'da) — darhol hisoblanadi; til almashsa — natija yangilanadi
  useEffect(() => {
    if (m && score) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m]);

  if (meta === "404") return <NotFound />;
  if (!m) return <Loading />;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run();
    if (!score.trim()) document.getElementById(`${id}-score`)?.focus();
  };
  const src = m.sources[String(y)];
  const yl = m.years.find((x) => x.year === y)?.label || "";
  return (
    <>
      <Hero crumbs={[admCrumb(t), { label: t.calculator }]} eyebrow={t.applicants} title={t.calculator} lead={m.intro} />
      <Section className="tight-top">
        <form className="cx-calc" onSubmit={submit} noValidate aria-label={t.calculator}>
          <Field id={`${id}-score`} label={`${t.score} (${fill(t.score_range, { max: m.max_score })})`} error={err}>
            <input
              {...aria(`${id}-score`, err)}
              type="number"
              inputMode="decimal"
              min={0}
              max={m.max_score}
              step={0.1}
              value={score}
              onChange={(e) => {
                setScore(e.target.value);
                if (err) setErr("");
              }}
              className="cx-score"
            />
          </Field>
          {m.years.length > 1 && (
            <Field id={`${id}-year`} label={t.ad_year}>
              <select id={`${id}-year`} value={y} onChange={(e) => (setYear(Number(e.target.value)), setForm(""), setElang(""))}>
                {m.years.map((x) => (
                  <option key={x.year} value={x.year}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {opts.forms.length > 1 && (
            <Field id={`${id}-form`} label={t.form} optional>
              <select id={`${id}-form`} value={form} onChange={(e) => setForm(e.target.value)}>
                <option value="">{t.form_all}</option>
                {opts.forms.map((f) => (
                  <option key={f} value={f}>
                    {t[FORM_KEY[f]]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {opts.langs.length > 1 && (
            <Field id={`${id}-lang`} label={t.edu_lang} optional>
              <select id={`${id}-lang`} value={elang} onChange={(e) => setElang(e.target.value)}>
                <option value="">{t.lang_all}</option>
                {opts.langs.map((l) => (
                  <option key={l} value={l}>
                    {(t[LANG_KEY[l]] as string) || l}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <button className="cx-btn" disabled={busy}>
            {t.check} <ArrowRight size={18} aria-hidden />
          </button>
        </form>

        <div className="cx-calc-res" ref={live} aria-live="polite" aria-busy={busy}>
          {res && (
            <>
              <h2 className="cx-h3">
                {t.results_t} · {res.label}
              </h2>
              <p className="cx-calc-sum">
                {fill(t.results_sum, { s: num(Number(score.replace(",", ".")), lang), g: res.counts.grant, c: res.counts.contract, x: res.counts.short })}
              </p>
              {res.results.length === 0 ? (
                <p className="cx-empty">{t.no_results}</p>
              ) : (
                <ul className="cx-calc-list">
                  {res.results.map((r) => (
                    <li key={r.id} className={r.status}>
                      <div className="cx-calc-h">
                        <Link to={`/programs/${r.slug}`} className="cx-calc-t">
                          {r.title}
                        </Link>
                        <p className="cx-calc-m">
                          {t[FORM_KEY[r.form]]} · {(t[LANG_KEY[r.edu_lang]] as string) || r.edu_lang}
                        </p>
                      </div>
                      <Status r={r} t={t} lang={lang} />
                      <dl className="cx-calc-d tnum">
                        <div>
                          <dt>
                            {t.passing} ({t.grant})
                          </dt>
                          <dd>{num(r.grant, lang)}</dd>
                        </div>
                        <div>
                          <dt>
                            {t.passing} ({t.contract})
                          </dt>
                          <dd>{num(r.contract, lang)}</dd>
                        </div>
                        <div>
                          <dt>{t.quota}</dt>
                          <dd>{r.quota ?? "—"}</dd>
                        </div>
                        {r.fee ? (
                          <div>
                            <dt>{t.fee}</dt>
                            <dd>
                              {r.fee.toLocaleString("ru-RU").replace(/,/g, " ")} {t.sum}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      {r.status === "contract" && r.grant_gap ? <p className="cx-calc-gap">{fill(t.to_grant, { x: num(r.grant_gap, lang) })}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div className="cx-note">
          <p>{fill(t.disclaimer, { y: res?.label || yl })}</p>
          {src && (
            <p>
              <a href={src} target="_blank" rel="noopener noreferrer" className="cx-inline">
                {fill(t.source, { y: yl })} <ExternalLink size={14} aria-hidden />
              </a>
            </p>
          )}
        </div>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ ota-onalar uchun */
export function ParentsPage() {
  const { t, lang } = useCx();
  const d = useData(() => cx.parents(lang), [lang]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const a = d.about;
  const stats = (a.stats || []).filter((s) => s.value);
  return (
    <>
      <Hero crumbs={[admCrumb(t), { label: t.parents }]} eyebrow={t.applicants} title={t.parents} />
      {d.intro && (
        <Section className="tight-top">
          <div className="cx-prose narrow">
            <Rich html={d.intro} />
          </div>
        </Section>
      )}
      <Section title={t.why}>
        <div className="cx-split">
          <div>
            {a.short_about && <p className="cx-p big">{a.short_about}</p>}
            {a.mission && (
              <>
                <h3 className="cx-h4">{t.mission}</h3>
                <p className="cx-p">{a.mission}</p>
              </>
            )}
            {a.values?.length ? (
              <ul className="cx-list">
                {a.values.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            ) : null}
          </div>
          {stats.length > 0 && (
            <dl className="cx-stats">
              {stats.map((s) => (
                <div key={s.label}>
                  <dt>{s.label}</dt>
                  <dd className="tnum">
                    {s.value}
                    {s.suffix}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </Section>
      <Section title={t.costs}>
        <ul className="cx-adm-links">
          <li>
            <Link to={d.tuition ? "/programs#tuition" : "/programs"}>
              <span>{d.tuition ? t.costs_link : t.programs_link}</span>
              <ArrowRight size={22} aria-hidden />
            </Link>
          </li>
          {d.sections.calculator && (
            <li>
              <Link to="/admission/calculator">
                <span>{t.calculator}</span>
                <ArrowRight size={22} aria-hidden />
              </Link>
            </li>
          )}
        </ul>
        {d.pay && (
          <>
            <h3 className="cx-h3 sp">{t.pay}</h3>
            <div className="cx-prose narrow">
              <Rich html={d.pay} />
            </div>
          </>
        )}
      </Section>
      {d.sections.dormitory && (
        <Section title={t.dormitory}>
          {d.dormitory && <p className="cx-p narrow">{d.dormitory}</p>}
          <p className="cx-more">
            <Link className="tlink" to="/dormitory">
              {t.dorm_link} <span aria-hidden>→</span>
            </Link>
          </p>
        </Section>
      )}
      {d.contacts.length > 0 && (
        <Section title={t.support}>
          <People items={d.contacts} />
        </Section>
      )}
      {d.faq.length > 0 && (
        <Section title={t.faq}>
          <Faq items={d.faq} />
        </Section>
      )}
      <Section title={t.contact_inst}>
        <ul className="cx-contacts">
          {a.address && (
            <li>
              <MapPin size={18} aria-hidden />
              <span>
                {a.address}
                {a.map_url && (
                  <>
                    {" "}
                    <a href={a.map_url} target="_blank" rel="noopener noreferrer" className="cx-inline">
                      {t.open_map} <ExternalLink size={14} aria-hidden />
                    </a>
                  </>
                )}
              </span>
            </li>
          )}
          {(a.phones || []).map((p) => (
            <li key={p}>
              <Phone size={18} aria-hidden />
              <a href={`tel:${p.replace(/[^\d+]/g, "")}`}>{p}</a>
            </li>
          ))}
          {a.email && (
            <li>
              <Mail size={18} aria-hidden />
              <a href={`mailto:${a.email}`}>{a.email}</a>
            </li>
          )}
          {a.hours && <li className="cx-contacts-h">{a.hours}</li>}
        </ul>
        <p className="cx-more">
          <Link className="tlink" to="/contact">
            {t.contact_page} <span aria-hidden>→</span>
          </Link>
        </p>
      </Section>
    </>
  );
}

