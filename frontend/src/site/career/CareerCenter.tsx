// Karyera markazi: imkoniyatlar ro'yxati (filtrlar, qidiruv, tartib), imkoniyat sahifasi va kompaniyalar uchun e'lon formasi
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { fmtDate } from "../../lib/i18n";
import { useSite } from "../../lib/site";
import { NotFound } from "../pages/Pages";
import { cc, type Opportunity, type ProgramRef } from "./api";
import { fmt, useCT, type CT } from "./i18n";
import { Box, CheckField, Count, Done, EMAIL_RE, ErrorSummary, Field, FilterSelect, Hero, phoneOk, Rich, SearchBox, Skeleton, useLoad, usePageTitle } from "./ui";

const norm = (s: string) => s.toLowerCase().replace(/[ʻʼ'`‘’]/g, "'");

export function OppRow({ o, c }: { o: Opportunity; c: CT }) {
  const place = [o.city, o.remote ? c.remote : ""].filter(Boolean).join(" · ");
  return (
    <article className="cc-row">
      <Box src={o.logo} name={o.company || o.title} size={56} />
      <div className="cc-row-main">
        <p className="cc-row-kicker">
          <span className="cc-tag">{c.types[o.type] || o.type}</span>
          {o.company && <span>{o.company}</span>}
        </p>
        <h3 className="cc-row-title">
          <Link to={`/career-center/${o.slug}`}>{o.title}</Link>
        </h3>
        {o.summary && <p className="cc-row-text">{o.summary}</p>}
        <p className="cc-row-meta">
          {place && (
            <span>
              <MapPin size={15} aria-hidden="true" /> {place}
            </span>
          )}
          {o.salary && (
            <span>
              {c.salary}: {o.salary}
            </span>
          )}
          <span>
            {c.deadline}: {o.deadline ? <time dateTime={o.deadline}>{fmtDate(o.deadline, c.lang, true)}</time> : c.no_deadline}
          </span>
        </p>
      </div>
    </article>
  );
}

export function CareerCenterPage() {
  const c = useCT();
  usePageTitle(c.cc_title);
  const d = useLoad((l) => cc.career(l));
  const [type, setType] = useState("");
  const [prog, setProg] = useState("");
  const [city, setCity] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("new");
  const items = d && d !== "404" ? d.items : [];
  const programs = d && d !== "404" ? d.programs : [];
  const usedProgs = useMemo(() => programs.filter((p) => items.some((o) => o.program_ids.includes(p.id))), [items, programs]);
  const cities = useMemo(() => [...new Set(items.map((o) => o.city).filter(Boolean))].sort(), [items]);
  const types = useMemo(() => [...new Set(items.map((o) => o.type))], [items]);
  const shown = useMemo(() => {
    const nq = norm(q.trim());
    const r = items.filter(
      (o) =>
        (!type || o.type === type) &&
        (!prog || o.program_ids.includes(prog)) &&
        (!city || (city === "__remote" ? o.remote : o.city === city)) &&
        (!nq || norm(`${o.title} ${o.company} ${o.summary}`).includes(nq)),
    );
    if (sort === "deadline") r.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
    return r;
  }, [items, type, prog, city, q, sort]);
  const filtered = !!(type || prog || city || q);
  if (d === "404") return <NotFound />;
  const info = d ? d.info : "";
  const ct = d ? d.contacts : null;
  const hasContacts = !!ct && !!(ct.email || ct.phone || ct.room || ct.hours || ct.staff.length);
  return (
    <>
      <Hero crumbs={[]} title={c.cc_title} sub={c.cc_sub} />
      {!d ? (
        <Skeleton />
      ) : (
        <>
          <section className="section tight cc-sec" aria-labelledby="cc-open">
            <div className="container">
              <h2 className="cc-h2" id="cc-open">
                {c.cc_open}
              </h2>
              {items.length > 0 && (
                <div className="cc-filters">
                  <SearchBox label={c.f_search} value={q} onChange={setQ} placeholder={c.f_search_ph} />
                  {types.length > 1 && <FilterSelect label={c.f_type} value={type} onChange={setType} all={c.f_all} options={types.map((x) => ({ value: x, label: c.types[x] || x }))} />}
                  {usedProgs.length > 0 && <FilterSelect label={c.f_program} value={prog} onChange={setProg} all={c.f_all} options={usedProgs.map((p) => ({ value: p.id, label: p.title }))} />}
                  {(cities.length > 1 || items.some((o) => o.remote)) && (
                    <FilterSelect
                      label={c.f_city}
                      value={city}
                      onChange={setCity}
                      all={c.f_all}
                      options={[...cities.map((x) => ({ value: x, label: x })), ...(items.some((o) => o.remote) ? [{ value: "__remote", label: c.remote }] : [])]}
                    />
                  )}
                  <FilterSelect label={c.f_sort} value={sort} onChange={setSort} options={[{ value: "new", label: c.sort_new }, { value: "deadline", label: c.sort_deadline }]} />
                </div>
              )}
              {items.length > 0 && <Count text={fmt(c.cc_found, { n: shown.length })} />}
              {shown.length > 0 ? (
                <div className="cc-list">
                  {shown.map((o) => (
                    <OppRow key={o.id} o={o} c={c} />
                  ))}
                </div>
              ) : (
                <div className="cc-empty">
                  <p>{filtered ? c.cc_none_filtered : c.cc_none}</p>
                  {filtered && (
                    <button
                      type="button"
                      className="cc-btn"
                      onClick={() => {
                        setType("");
                        setProg("");
                        setCity("");
                        setQ("");
                      }}
                    >
                      {c.cc_reset}
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
          {(info || hasContacts) && (
            <section className="section tight cc-sec cc-band" aria-labelledby="cc-about">
              <div className="container cc-split">
                <div>
                  <h2 className="cc-h2" id="cc-about">
                    {c.cc_about}
                  </h2>
                  <Rich html={info} />
                </div>
                {hasContacts && ct && (
                  <aside className="cc-aside" aria-labelledby="cc-contacts">
                    <h3 id="cc-contacts">{c.cc_contacts}</h3>
                    {ct.staff.map((s) => (
                      <div key={s.id} className="cc-person">
                        <Box src={s.photo} name={s.title} size={56} kind="photo" />
                        <div>
                          <Link to={`/staff/${s.slug}`}>{s.title}</Link>
                          {s.position && <p>{s.position}</p>}
                        </div>
                      </div>
                    ))}
                    <dl className="cc-dl">
                      {ct.phone && (
                        <div>
                          <dt>
                            <Phone size={15} aria-hidden="true" /> {c.sf_phone}
                          </dt>
                          <dd>
                            <a href={`tel:${ct.phone.replace(/[^\d+]/g, "")}`}>{ct.phone}</a>
                          </dd>
                        </div>
                      )}
                      {ct.email && (
                        <div>
                          <dt>
                            <Mail size={15} aria-hidden="true" /> {c.sf_email}
                          </dt>
                          <dd>
                            <a href={`mailto:${ct.email}`}>{ct.email}</a>
                          </dd>
                        </div>
                      )}
                      {ct.room && (
                        <div>
                          <dt>{c.cc_room}</dt>
                          <dd>{ct.room}</dd>
                        </div>
                      )}
                      {ct.hours && (
                        <div>
                          <dt>{c.cc_hours}</dt>
                          <dd>{ct.hours}</dd>
                        </div>
                      )}
                    </dl>
                  </aside>
                )}
              </div>
            </section>
          )}
          <section className="section tight cc-sec" aria-labelledby="cc-submit">
            <div className="container">
              <SubmitForm programs={programs} />
            </div>
          </section>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- imkoniyat sahifasi */
export function OpportunityPage() {
  const { slug = "" } = useParams();
  const c = useCT();
  const d = useLoad((l) => cc.opportunity(slug, l), [slug]);
  usePageTitle(d && d !== "404" ? d.item.title : undefined);
  if (d === "404") return <NotFound />;
  if (!d) return <Skeleton />;
  const o = d.item;
  const place = [o.city, o.remote ? c.remote : ""].filter(Boolean).join(" · ");
  const applies = !o.expired && (o.apply_url || o.apply_email || o.apply_phone);
  return (
    <>
      <Hero crumbs={[{ to: "/career-center", label: c.cc_title }]} title={o.title} eyebrow={[c.types[o.type], o.company].filter(Boolean).join(" · ")} />
      <section className="section tight cc-sec">
        <div className="container cc-detail">
          <div className="cc-detail-main">
            {o.expired && (
              <div className="cc-note" role="note">
                <b>{c.expired}.</b> {c.expired_note}
              </div>
            )}
            {o.html || o.content ? <Rich html={o.html} doc={o.content} /> : o.summary && <p className="cc-lead">{o.summary}</p>}
            {o.requirements?.length > 0 && (
              <>
                <h2 className="cc-h3">{c.requirements}</h2>
                <ul className="cc-bullets">
                  {o.requirements.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            )}
            {d.programs.length > 0 && (
              <>
                <h2 className="cc-h3">{c.programs_rel}</h2>
                <ul className="cc-links">
                  {d.programs.map((p) => (
                    <li key={p.id}>
                      <Link to={`/programs/${p.slug}`}>{p.title}</Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <aside className="cc-aside">
            <div className="cc-org">
              <Box src={o.logo} name={o.company || o.title} size={64} />
              <div>
                <p className="cc-k">{c.company}</p>
                {o.partner ? <Link to={`/partners/${o.partner.slug}`}>{o.company}</Link> : <b>{o.company}</b>}
              </div>
            </div>
            <dl className="cc-dl">
              {place && (
                <div>
                  <dt>{c.location}</dt>
                  <dd>{place}</dd>
                </div>
              )}
              {o.salary && (
                <div>
                  <dt>{c.salary}</dt>
                  <dd>{o.salary}</dd>
                </div>
              )}
              <div>
                <dt>{c.deadline}</dt>
                <dd>{o.deadline ? <time dateTime={o.deadline}>{fmtDate(o.deadline, c.lang)}</time> : c.no_deadline}</dd>
              </div>
              {o.published_at && (
                <div>
                  <dt>{c.posted}</dt>
                  <dd>
                    <time dateTime={o.published_at}>{fmtDate(o.published_at, c.lang)}</time>
                  </dd>
                </div>
              )}
            </dl>
            {applies && (
              <div className="cc-apply">
                <h2 className="cc-h3">{c.how_apply}</h2>
                {o.apply_url && (
                  <a className="cc-btn primary" href={o.apply_url} target="_blank" rel="noopener noreferrer">
                    {c.apply_site} <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                )}
                {o.apply_email && (
                  <a className="cc-btn" href={`mailto:${o.apply_email}?subject=${encodeURIComponent(o.title)}`}>
                    <Mail size={16} aria-hidden="true" /> {o.apply_email}
                  </a>
                )}
                {o.apply_phone && (
                  <a className="cc-btn" href={`tel:${o.apply_phone.replace(/[^\d+]/g, "")}`}>
                    <Phone size={16} aria-hidden="true" /> {o.apply_phone}
                  </a>
                )}
              </div>
            )}
          </aside>
        </div>
      </section>
      {d.others.length > 0 && (
        <section className="section tight cc-sec" aria-labelledby="cc-sim">
          <div className="container">
            <div className="cc-sec-head">
              <h2 className="cc-h2" id="cc-sim">
                {c.similar}
              </h2>
              <Link className="cc-more" to="/career-center">
                {c.back_all}
              </Link>
            </div>
            <div className="cc-list">
              {d.others.map((x) => (
                <OppRow key={x.id} o={x} c={c} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- kompaniyalar uchun forma */
type SF = {
  company: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  title: string;
  type: string;
  city: string;
  remote: boolean;
  salary: string;
  description: string;
  requirements: string;
  program_ids: string[];
  apply_url: string;
  apply_email: string;
  apply_phone: string;
  deadline: string;
  agree: boolean;
  hp: string;
};
const EMPTY: SF = { company: "", contact_name: "", email: "", phone: "", website: "", title: "", type: "", city: "", remote: false, salary: "", description: "", requirements: "", program_ids: [], apply_url: "", apply_email: "", apply_phone: "", deadline: "", agree: false, hp: "" };

function validate(f: SF, c: CT): Record<string, string> {
  const e: Record<string, string> = {};
  const today = new Date().toISOString().slice(0, 10);
  if (f.company.trim().length < 2) e.company = c.err_required;
  if (f.contact_name.trim().length < 2) e.contact_name = c.err_required;
  if (!EMAIL_RE.test(f.email.trim())) e.email = f.email.trim() ? c.err_email : c.err_required;
  if (f.phone.trim() && !phoneOk(f.phone)) e.phone = c.err_phone;
  if (f.website.trim() && !/^https?:\/\//i.test(f.website.trim())) e.website = c.err_url;
  if (f.title.trim().length < 4) e.title = c.err_required;
  if (!f.type) e.type = c.err_required;
  if (!f.remote && f.city.trim().length < 2) e.city = c.err_required;
  if (f.description.trim().length < 30) e.description = f.description.trim() ? c.err_short : c.err_required;
  if (f.apply_url.trim() && !/^https?:\/\//i.test(f.apply_url.trim())) e.apply_url = c.err_url;
  if (f.apply_email.trim() && !EMAIL_RE.test(f.apply_email.trim())) e.apply_email = c.err_email;
  if (f.apply_phone.trim() && !phoneOk(f.apply_phone)) e.apply_phone = c.err_phone;
  if (!f.apply_url.trim() && !f.apply_email.trim() && !f.apply_phone.trim()) e.apply_url = c.err_apply;
  if (f.deadline && f.deadline < today) e.deadline = c.err_past;
  if (!f.agree) e.agree = c.err_agree;
  return e;
}

function SubmitForm({ programs }: { programs: ProgramRef[] }) {
  const c = useCT();
  const { lang } = useSite();
  const [f, setF] = useState<SF>(EMPTY);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ n: number; email: string } | null>(null);
  const [fail, setFail] = useState("");
  const [tried, setTried] = useState(false);
  const set = <K extends keyof SF>(k: K, v: SF[K]) => {
    const nf = { ...f, [k]: v };
    setF(nf);
    if (touched[k] || errors[k]) {
      const e = validate(nf, c);
      setErrors((old) => {
        const n = { ...old };
        delete n[k];
        if (k === "apply_email" || k === "apply_phone" || k === "apply_url") delete n.apply_url;
        if (e[k]) n[k] = e[k];
        if (e.apply_url && (k === "apply_email" || k === "apply_phone" || k === "apply_url")) n.apply_url = e.apply_url;
        return n;
      });
    }
  };
  const blur = (k: keyof SF) => () => {
    setTouched((t) => ({ ...t, [k]: true }));
    const e = validate(f, c);
    setErrors((old) => {
      const n = { ...old };
      delete n[k];
      if (e[k] && (f[k] as string | boolean) !== "") n[k] = e[k];
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
      const r = await cc.submit({ ...f, lang });
      setDone({ n: r.ticket, email: f.email });
      setF(EMPTY);
      setTouched({});
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && (err.body as { fields?: Record<string, string> })?.fields) {
        const sv = (err.body as { fields: Record<string, string> }).fields;
        const m: Record<string, string> = {};
        for (const [k, v] of Object.entries(sv)) {
          const key = k === "apply" ? "apply_url" : k;
          m[key] = v === "invalid" ? (key.includes("email") ? c.err_email : key.includes("phone") ? c.err_phone : c.err_url) : v === "short" ? c.err_short : v === "past" ? c.err_past : key === "apply_url" ? c.err_apply : key === "agree" ? c.err_agree : c.err_required;
        }
        setErrors(m);
      } else setFail(err instanceof ApiError && err.status === 429 ? c.err_many : c.err_generic);
    }
    setBusy(false);
  };
  const labels: Record<string, string> = {
    company: c.sf_company, contact_name: c.sf_contact, email: c.sf_email, phone: c.sf_phone, website: c.sf_website, title: c.sf_title_f, type: c.f_type,
    city: c.f_city, description: c.sf_desc, apply_url: c.sf_apply_url, apply_email: c.sf_apply_email, apply_phone: c.sf_apply_phone, deadline: c.sf_deadline, agree: c.consent,
  };
  const inp = (k: keyof SF, extra: Record<string, unknown> = {}) => (p: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => (
    <input {...p} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} onBlur={blur(k)} {...extra} />
  );
  return (
    <div className="cc-form-wrap">
      <h2 className="cc-h2" id="cc-submit">
        {c.sf_title}
      </h2>
      <p className="cc-lead">{c.sf_lead}</p>
      {done ? (
        <Done title={c.sf_done} text={fmt(c.sf_done_t, { n: done.n, email: done.email })} again={c.sf_again} onAgain={() => setDone(null)} />
      ) : (
        <form className="cc-form" onSubmit={submit} noValidate>
          {tried && <ErrorSummary text={fmt(c.sf_errors, { n: Object.keys(errors).length })} errors={errors} labels={labels} />}
          <fieldset>
            <legend>{c.sf_org}</legend>
            <div className="cc-grid">
              <Field id="f-company" label={c.sf_company} error={errors.company}>
                {inp("company", { autoComplete: "organization", maxLength: 200, required: true })}
              </Field>
              <Field id="f-contact_name" label={c.sf_contact} error={errors.contact_name}>
                {inp("contact_name", { autoComplete: "name", maxLength: 160, required: true })}
              </Field>
              <Field id="f-email" label={c.sf_email} error={errors.email}>
                {inp("email", { type: "email", autoComplete: "email", maxLength: 160, required: true, inputMode: "email" })}
              </Field>
              <Field id="f-phone" label={c.sf_phone} optional={c.sf_optional} error={errors.phone}>
                {inp("phone", { type: "tel", autoComplete: "tel", maxLength: 40, inputMode: "tel" })}
              </Field>
              <Field id="f-website" label={c.sf_website} optional={c.sf_optional} error={errors.website} wide>
                {inp("website", { type: "url", autoComplete: "url", maxLength: 300, placeholder: "https://" })}
              </Field>
            </div>
          </fieldset>
          <fieldset>
            <legend>{c.sf_offer}</legend>
            <div className="cc-grid">
              <Field id="f-title" label={c.sf_title_f} error={errors.title} wide>
                {inp("title", { maxLength: 300, required: true })}
              </Field>
              <Field id="f-type" label={c.f_type} error={errors.type}>
                {(p) => (
                  <select {...p} value={f.type} onChange={(e) => set("type", e.target.value)} onBlur={blur("type")} required>
                    <option value="">—</option>
                    {Object.entries(c.types).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field id="f-salary" label={c.salary} optional={c.sf_optional}>
                {inp("salary", { maxLength: 120 })}
              </Field>
              <Field id="f-city" label={c.f_city} optional={f.remote ? c.sf_optional : undefined} error={errors.city}>
                {inp("city", { maxLength: 120, autoComplete: "address-level2" })}
              </Field>
              <div className="cc-f cc-f-check">
                <CheckField id="f-remote" checked={f.remote} onChange={(v) => set("remote", v)} label={c.sf_remote} />
              </div>
              <Field id="f-description" label={c.sf_desc} hint={c.sf_desc_hint} error={errors.description} wide>
                {(p) => <textarea {...p} rows={6} maxLength={8000} value={f.description} onChange={(e) => set("description", e.target.value)} onBlur={blur("description")} required />}
              </Field>
              <Field id="f-requirements" label={c.sf_reqs} hint={c.sf_reqs_hint} optional={c.sf_optional} wide>
                {(p) => <textarea {...p} rows={4} maxLength={6000} value={f.requirements} onChange={(e) => set("requirements", e.target.value)} />}
              </Field>
              {programs.length > 0 && (
                <fieldset className="cc-f wide cc-progs">
                  <legend>
                    {c.sf_programs} <span className="cc-opt">({c.sf_optional})</span>
                  </legend>
                  <div className="cc-checks">
                    {programs.map((p) => (
                      <CheckField
                        key={p.id}
                        id={`f-p-${p.id}`}
                        checked={f.program_ids.includes(p.id)}
                        onChange={(v) => set("program_ids", v ? [...f.program_ids, p.id] : f.program_ids.filter((x) => x !== p.id))}
                        label={p.title}
                      />
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          </fieldset>
          <fieldset>
            <legend>{c.sf_apply}</legend>
            <p className="cc-hint" id="f-apply-h">
              {c.sf_apply_hint}
            </p>
            <div className="cc-grid">
              <Field id="f-apply_url" label={c.sf_apply_url} error={errors.apply_url} wide>
                {inp("apply_url", { type: "url", maxLength: 1000, placeholder: "https://" })}
              </Field>
              <Field id="f-apply_email" label={c.sf_apply_email} error={errors.apply_email}>
                {inp("apply_email", { type: "email", maxLength: 160, inputMode: "email" })}
              </Field>
              <Field id="f-apply_phone" label={c.sf_apply_phone} error={errors.apply_phone}>
                {inp("apply_phone", { type: "tel", maxLength: 60, inputMode: "tel" })}
              </Field>
              <Field id="f-deadline" label={c.sf_deadline} optional={c.sf_optional} error={errors.deadline}>
                {inp("deadline", { type: "date", min: new Date().toISOString().slice(0, 10) })}
              </Field>
            </div>
          </fieldset>
          <CheckField id="f-agree" checked={f.agree} onChange={(v) => set("agree", v)} label={c.sf_agree} error={errors.agree} />
          <input className="cc-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.hp} onChange={(e) => setF({ ...f, hp: e.target.value })} name="company_fax" />
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
