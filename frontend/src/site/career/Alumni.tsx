// Bitiruvchilar: hikoyalar (faqat rozilik bilan), bandlik statistikasi (admin kiritgan), ro'yxatga olish formasi (ochiq emas)
import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { useSite } from "../../lib/site";
import { NotFound } from "../pages/Pages";
import { cc, type AlumniStory, type ProgramRef, type StatRow } from "./api";
import { fmt, useCT, type CT } from "./i18n";
import { Box, CheckField, Done, EMAIL_RE, ErrorSummary, Field, FilterSelect, Hero, phoneOk, Rich, Skeleton, useLoad, usePageTitle } from "./ui";

const progName = (s: AlumniStory) => (typeof s.program === "string" ? s.program : s.program?.title) || s.program_text || "";

function StoryCard({ s, c }: { s: AlumniStory; c: CT }) {
  const job = [s.position, s.company].filter(Boolean).join(", ");
  return (
    <article className="cc-story">
      <Box src={s.photo} name={s.title} size={96} kind="photo" />
      <div>
        <h3 className="cc-row-title">
          <Link to={`/alumni/${s.slug}`}>{s.title}</Link>
        </h3>
        <p className="cc-row-meta">
          <span>{[s.year ? fmt(c.al_class, { y: s.year }) : "", progName(s)].filter(Boolean).join(" · ")}</span>
        </p>
        {job && <p className="cc-job">{job}</p>}
        {s.quote && <blockquote className="cc-quote">{s.quote}</blockquote>}
      </div>
    </article>
  );
}

function Stats({ rows, c }: { rows: StatRow[]; c: CT }) {
  const [prog, setProg] = useState("");
  const progs = useMemo(() => [...new Map(rows.filter((r) => r.program_id).map((r) => [r.program_id, r.program])).entries()], [rows]);
  const totals = rows.some((r) => !r.program_id);
  // yo'nalish tanlanmasa: umumiy qatorlar (bo'lsa), aks holda hammasi
  const list = rows.filter((r) => (prog ? r.program_id === prog : totals ? !r.program_id : true));
  return (
    <section className="section tight cc-sec cc-band" aria-labelledby="al-stats">
      <div className="container">
        <div className="cc-sec-head">
          <h2 className="cc-h2" id="al-stats">
            {c.al_stats}
          </h2>
          {progs.length > 0 && (
            <FilterSelect label={c.f_program} value={prog} onChange={setProg} all={totals ? c.al_all_programs : c.f_all} options={progs.map(([id, t]) => ({ value: id, label: t }))} />
          )}
        </div>
        <div className="cc-table-wrap" tabIndex={0} role="region" aria-labelledby="al-stats">
          <table className="cc-table">
            <thead>
              <tr>
                <th scope="col">{c.al_year}</th>
                <th scope="col">{c.f_program}</th>
                <th scope="col" className="cc-num">
                  {c.al_grads}
                </th>
                <th scope="col">{c.al_employed}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={`${r.year}-${r.program_id}`}>
                  <th scope="row">{r.year}</th>
                  <td>{r.program || c.al_all_programs}</td>
                  <td className="cc-num">{r.graduates ?? "—"}</td>
                  <td>
                    {r.employed_pct != null ? (
                      <span className="cc-bar">
                        <span className="cc-bar-track" aria-hidden="true">
                          <span style={{ width: `${r.employed_pct}%` }} />
                        </span>
                        <b>{r.employed_pct}%</b>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function AlumniPage() {
  const c = useCT();
  usePageTitle(c.al_title);
  const d = useLoad((l) => cc.alumni(l));
  if (d === "404") return <NotFound />;
  return (
    <>
      <Hero crumbs={[]} title={c.al_title} sub={c.al_sub} />
      {!d ? (
        <Skeleton />
      ) : (
        <>
          {d.items.length > 0 && (
            <section className="section tight cc-sec" aria-labelledby="al-st">
              <div className="container">
                <h2 className="cc-h2" id="al-st">
                  {c.al_stories}
                </h2>
                <div className="cc-stories">
                  {d.items.map((s) => (
                    <StoryCard key={s.id} s={s} c={c} />
                  ))}
                </div>
              </div>
            </section>
          )}
          {d.stats.length > 0 && <Stats rows={d.stats} c={c} />}
          <section className="section tight cc-sec" aria-labelledby="al-reg">
            <div className="container">
              <RegisterForm programs={d.programs} />
            </div>
          </section>
        </>
      )}
    </>
  );
}

export function AlumniStoryPage() {
  const { slug = "" } = useParams();
  const c = useCT();
  const d = useLoad((l) => cc.story(slug, l), [slug]);
  usePageTitle(d && d !== "404" ? d.item.title : undefined);
  if (d === "404") return <NotFound />;
  if (!d) return <Skeleton />;
  const s = d.item;
  const prog = s.program && typeof s.program === "object" ? s.program : null;
  const job = [s.position, s.company].filter(Boolean).join(", ");
  return (
    <>
      <Hero crumbs={[{ to: "/alumni", label: c.al_title }]} title={s.title} eyebrow={[s.year ? fmt(c.al_class, { y: s.year }) : "", prog?.title || s.program_text].filter(Boolean).join(" · ")} />
      <section className="section tight cc-sec">
        <div className="container cc-detail rev">
          <aside className="cc-aside">
            <Box src={s.photo} name={s.title} size={160} kind="photo" className="cc-box-xl" />
            <dl className="cc-dl">
              {job && (
                <div>
                  <dt>{c.al_job}</dt>
                  <dd>{job}</dd>
                </div>
              )}
              {s.year && (
                <div>
                  <dt>{c.al_year}</dt>
                  <dd>{s.year}</dd>
                </div>
              )}
              {(prog || s.program_text) && (
                <div>
                  <dt>{c.al_program}</dt>
                  <dd>{prog ? <Link to={`/programs/${prog.slug}`}>{prog.title}</Link> : s.program_text}</dd>
                </div>
              )}
            </dl>
          </aside>
          <div className="cc-detail-main">
            {s.quote && <blockquote className="cc-quote lg">{s.quote}</blockquote>}
            <Rich html={s.html} doc={s.content} />
          </div>
        </div>
      </section>
      {d.others.length > 0 && (
        <section className="section tight cc-sec" aria-labelledby="al-more">
          <div className="container">
            <div className="cc-sec-head">
              <h2 className="cc-h2" id="al-more">
                {c.al_more}
              </h2>
              <Link className="cc-more" to="/alumni">
                {c.al_all}
              </Link>
            </div>
            <div className="cc-stories">
              {d.others.map((x) => (
                <StoryCard key={x.id} s={x} c={c} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- ro'yxatga olish formasi */
type RF = { name: string; year: string; program_id: string; program_text: string; job: string; company: string; city: string; email: string; phone: string; consent_contact: boolean; consent_publish: boolean; agree: boolean; hp: string };
const EMPTY: RF = { name: "", year: "", program_id: "", program_text: "", job: "", company: "", city: "", email: "", phone: "", consent_contact: false, consent_publish: false, agree: false, hp: "" };

function validate(f: RF, c: CT): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.name.trim().length < 5 || f.name.trim().split(/\s+/).length < 2) e.name = f.name.trim() ? c.err_name : c.err_required;
  if (!f.year) e.year = c.err_year;
  if (!f.program_id || (f.program_id === "__other" && f.program_text.trim().length < 3)) e.program_id = c.err_required;
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) e.email = c.err_email;
  if (f.phone.trim() && !phoneOk(f.phone)) e.phone = c.err_phone;
  if (!f.email.trim() && !f.phone.trim()) e.email = c.err_contact;
  if (!f.agree) e.agree = c.err_agree;
  return e;
}

function RegisterForm({ programs }: { programs: ProgramRef[] }) {
  const c = useCT();
  const { lang } = useSite();
  const [f, setF] = useState<RF>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [fail, setFail] = useState("");
  const [tried, setTried] = useState(false);
  const now = new Date().getFullYear();
  const years = Array.from({ length: now + 2 - 2000 }, (_, i) => String(now + 1 - i));
  const set = <K extends keyof RF>(k: K, v: RF[K]) => {
    const nf = { ...f, [k]: v };
    setF(nf);
    if (touched[k] || errors[k] || ((k === "phone" || k === "email") && errors.email)) {
      const e = validate(nf, c);
      setErrors((o) => {
        const n = { ...o };
        delete n[k];
        if (k === "phone") delete n.email;
        if (e[k]) n[k] = e[k];
        if (k === "phone" && e.email) n.email = e.email;
        return n;
      });
    }
  };
  const blur = (k: keyof RF) => () => {
    setTouched((x) => ({ ...x, [k]: true }));
    const e = validate(f, c);
    setErrors((o) => {
      const n = { ...o };
      delete n[k];
      if (e[k] && f[k] !== "") n[k] = e[k];
      return n;
    });
  };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setTried(true);
    setFail("");
    const e = validate(f, c);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await cc.register({ ...f, program_id: f.program_id === "__other" ? "" : f.program_id, year: Number(f.year), lang });
      setDone(true);
      setF(EMPTY);
    } catch (err) {
      setFail(err instanceof ApiError ? (err.status === 429 ? c.err_many : err.detail === "duplicate" ? c.err_dup : c.err_generic) : c.err_generic);
    }
    setBusy(false);
  };
  const labels: Record<string, string> = { name: c.al_name, year: c.al_year, program_id: c.al_program, email: c.sf_email, phone: c.sf_phone, agree: c.consent };
  const inp = (k: keyof RF, extra: Record<string, unknown> = {}) => (p: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => (
    <input {...p} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} onBlur={blur(k)} {...extra} />
  );
  return (
    <div className="cc-form-wrap">
      <h2 className="cc-h2" id="al-reg">
        {c.al_reg_title}
      </h2>
      <p className="cc-lead">{c.al_reg_lead}</p>
      {done ? (
        <Done title={c.al_done} text={c.al_done_t} />
      ) : (
        <form className="cc-form" onSubmit={submit} noValidate>
          {tried && <ErrorSummary text={fmt(c.sf_errors, { n: Object.keys(errors).length })} errors={errors} labels={labels} />}
          <div className="cc-grid">
            <Field id="f-name" label={c.al_name} error={errors.name} wide>
              {inp("name", { autoComplete: "name", maxLength: 160, required: true })}
            </Field>
            <Field id="f-year" label={c.al_year} error={errors.year}>
              {(p) => (
                <select {...p} value={f.year} onChange={(e) => set("year", e.target.value)} onBlur={blur("year")} required>
                  <option value="">—</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field id="f-program_id" label={c.al_program} error={errors.program_id}>
              {(p) => (
                <select {...p} value={f.program_id} onChange={(e) => set("program_id", e.target.value)} onBlur={blur("program_id")} required>
                  <option value="">—</option>
                  {programs.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
                  <option value="__other">{c.al_program_other}</option>
                </select>
              )}
            </Field>
            {f.program_id === "__other" && (
              <Field id="f-program_text" label={c.al_program_text} wide>
                {inp("program_text", { maxLength: 200 })}
              </Field>
            )}
            <Field id="f-job" label={c.al_job} optional={c.sf_optional}>
              {inp("job", { maxLength: 200, autoComplete: "organization-title" })}
            </Field>
            <Field id="f-company" label={c.al_company} optional={c.sf_optional}>
              {inp("company", { maxLength: 200, autoComplete: "organization" })}
            </Field>
            <Field id="f-city" label={c.al_city} optional={c.sf_optional}>
              {inp("city", { maxLength: 120, autoComplete: "address-level2" })}
            </Field>
            <div className="cc-f wide">
              <p className="cc-hint">{c.al_contact_hint}</p>
            </div>
            <Field id="f-email" label={c.sf_email} error={errors.email}>
              {inp("email", { type: "email", maxLength: 160, autoComplete: "email", inputMode: "email" })}
            </Field>
            <Field id="f-phone" label={c.sf_phone} error={errors.phone}>
              {inp("phone", { type: "tel", maxLength: 40, autoComplete: "tel", inputMode: "tel" })}
            </Field>
          </div>
          <CheckField id="f-consent_contact" checked={f.consent_contact} onChange={(v) => set("consent_contact", v)} label={c.al_consent_contact} />
          <CheckField id="f-consent_publish" checked={f.consent_publish} onChange={(v) => set("consent_publish", v)} label={c.al_consent_publish} />
          <CheckField id="f-agree" checked={f.agree} onChange={(v) => set("agree", v)} label={c.sf_agree} error={errors.agree} />
          <input className="cc-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.hp} onChange={(e) => setF({ ...f, hp: e.target.value })} name="fax_number" />
          {fail && (
            <p className="cc-err" role="alert">
              {fail}
            </p>
          )}
          <button type="submit" className="cc-btn primary" disabled={busy} aria-busy={busy}>
            {busy ? c.sf_sending : c.sf_send}
          </button>
        </form>
      )}
    </div>
  );
}
