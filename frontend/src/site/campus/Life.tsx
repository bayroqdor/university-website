// Talabalar hayoti: bo'lim sahifasi (/student-life), to'garak va klublar (/clubs, /clubs/:slug), sport (/sport),
// talabalar turar joyi (/dormitory), stipendiyalar va imtiyozlar (/scholarships).
import { ArrowRight, ArrowUpRight, CalendarClock, CheckCircle2, ExternalLink, Images, MapPin, Send, User } from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { Consent } from "../official/Consent";
import { NotFound } from "../pages/Pages";
import { cx, type AlbumCard, type Club, type Dorm, type Scholarship } from "./api";
import { fill, type CxDict } from "./i18n";
import { aria, dateL, errText, Faq, Field, fieldErr, Hero, Lightbox, Loading, People, PhotoGrid, Pic, Rich, Section, Seg, useCx, useData } from "./ui";

const CAT_KEY = { science: "cat_science", sport: "cat_sport", creative: "cat_creative", volunteer: "cat_volunteer", other: "cat_other" } as const;
const lifeCrumb = (t: CxDict) => ({ to: "/student-life", label: t.life });

/* ------------------------------------------------------------------ bo'lim sahifasi */
export function StudentLifePage() {
  const { t, lang } = useCx();
  const d = useData(() => cx.life(lang), [lang]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const links = (
    [
      ["clubs", "/clubs", d.counts.clubs],
      ["sport", "/sport", 0],
      ["dormitory", "/dormitory", 0],
      ["scholarships", "/scholarships", d.counts.scholarships],
      ["gallery", "/gallery", d.counts.albums],
    ] as const
  ).filter(([k]) => d.sections[k]);
  return (
    <>
      <Hero crumbs={[{ label: t.life }]} title={t.life} lead={d.intro} />
      <Section>
        <ol className="cx-index">
          {links.map(([k, to, n], i) => (
            <li key={k}>
              <Link to={to}>
                <span className="cx-index-n tnum" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="cx-index-t">{t[k]}</span>
                {n > 0 && <span className="cx-index-c tnum">{n}</span>}
                <ArrowUpRight className="cx-index-a" size={26} aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      </Section>
      {d.clubs.length > 0 && (
        <Section title={t.clubs} alt>
          <ClubGrid items={d.clubs.slice(0, 3)} />
          <p className="cx-more">
            <Link className="tlink" to="/clubs">
              {t.clubs} <span aria-hidden>→</span>
            </Link>
          </p>
        </Section>
      )}
      {d.albums.length > 0 && (
        <Section title={t.gallery}>
          <AlbumGrid items={d.albums} />
          <p className="cx-more">
            <Link className="tlink" to="/gallery">
              {t.gallery} <span aria-hidden>→</span>
            </Link>
          </p>
        </Section>
      )}
    </>
  );
}

export function AlbumGrid({ items }: { items: AlbumCard[] }) {
  const { t, lang } = useCx();
  return (
    <ul className="cx-cards four">
      {items.map((a) => (
        <li key={a.id} className="cx-card">
          <Link to={`/gallery/${a.slug}`} className="cx-card-a">
            <Pic src={a.cover_photo?.url} alt={a.cover_photo?.alt || ""} ratio="4 / 3" w={640} sizes="(max-width: 760px) 100vw, 25vw" className="zoom" />
            <span className="cx-card-b">
              {a.date && <span className="ey">{dateL(a.date, lang)}</span>}
              <span className="cx-card-t">{a.title}</span>
              <span className="cx-card-m tnum">
                {a.count > 0 && fill(t.n_photos, { n: a.count })}
                {a.count > 0 && a.videos_count > 0 && " · "}
                {a.videos_count > 0 && fill(t.n_videos, { n: a.videos_count })}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ klublar */
export function ClubGrid({ items }: { items: Club[] }) {
  const { t } = useCx();
  return (
    <ul className="cx-cards">
      {items.map((c) => (
        <li key={c.id} className="cx-card">
          <Link to={`/clubs/${c.slug}`} className="cx-card-a">
            <Pic src={c.cover || c.photos[0]?.url} alt={c.cover ? c.cover_alt || "" : c.photos[0]?.alt || ""} ratio="4 / 3" w={640} className="zoom" />
            <span className="cx-card-b">
              <span className="ey">{t[CAT_KEY[c.category]]}</span>
              <span className="cx-card-t">{c.title}</span>
              {c.summary && <span className="cx-card-s">{c.summary}</span>}
              {(c.schedule || c.place) && (
                <span className="cx-card-m">
                  {c.schedule && (
                    <span>
                      <CalendarClock size={15} aria-hidden /> {c.schedule}
                    </span>
                  )}
                  {c.place && (
                    <span>
                      <MapPin size={15} aria-hidden /> {c.place}
                    </span>
                  )}
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ClubsPage() {
  const { t, lang } = useCx();
  const d = useData(() => cx.clubs(lang), [lang]);
  const [sp, setSp] = useSearchParams();
  const cat = sp.get("cat") || "";
  const items = useMemo(() => (d && d !== "404" ? d.items.filter((c) => !cat || c.category === cat) : []), [d, cat]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  return (
    <>
      <Hero crumbs={[lifeCrumb(t), { label: t.clubs }]} eyebrow={t.life} title={t.clubs} lead={d.intro} />
      <Section className="tight-top">
        {d.categories.length > 1 && (
          <div className="cx-tools">
            <Seg
              label={t.filter_cat}
              value={cat}
              onChange={(v) => setSp(v ? { cat: v } : {}, { replace: true })}
              options={[{ value: "", label: t.all }, ...d.categories.map((c) => ({ value: c, label: t[CAT_KEY[c]] }))]}
            />
            <p className="cx-count tnum" aria-live="polite">
              {fill(t.shown, { n: items.length })}
            </p>
          </div>
        )}
        {items.length ? <ClubGrid items={items} /> : <p className="cx-empty">{t.none_cat}</p>}
      </Section>
    </>
  );
}

function JoinForm({ slug, title }: { slug: string; title: string }) {
  const { t, lang } = useCx();
  const id = useId();
  const EMPTY = { name: "", phone: "", email: "", group: "", message: "" };
  const [f, setF] = useState(EMPTY);
  const [hp, setHp] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [state, setState] = useState<"" | "busy" | "sent" | "error">("");
  const [msg, setMsg] = useState("");
  const [num, setNum] = useState<number | undefined>();
  const set = (k: keyof typeof EMPTY, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errs[k]) setErrs((e) => ({ ...e, [k]: "" }));
  };
  const validate = () => {
    const e: Record<string, string> = {};
    if (f.name.trim().split(/\s+/).length < 2) e.name = t.fio;
    if (!/^(998)?\d{9}$/.test(f.phone.replace(/\D/g, ""))) e.phone = t.bad_phone;
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.email = t.bad_email;
    if (!f.group.trim()) e.group = t.req;
    setErrs(e);
    return e;
  };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) {
      document.getElementById(`${id}-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setState("busy");
    try {
      const r = await cx.join(slug, { ...f, hp, lang });
      setNum(r.ticket);
      setState("sent");
      setF(EMPTY);
    } catch (x) {
      const b = x instanceof ApiError ? (x.body as { fields?: Record<string, string> } | undefined) : undefined;
      if (b && typeof b === "object" && b.fields) {
        setErrs(Object.fromEntries(Object.entries(b.fields).map(([k, v]) => [k, fieldErr(t, k, v)])));
        setState("");
        return;
      }
      setMsg(errText(t, x instanceof ApiError ? x.detail : ""));
      setState("error");
    }
  };
  if (state === "sent")
    return (
      <div className="cx-done" role="status">
        <CheckCircle2 size={32} aria-hidden />
        <h3>{t.sent}</h3>
        {num ? <p>{fill(t.sent_n, { n: num })}</p> : null}
        <button type="button" className="cx-btn ghost" onClick={() => setState("")}>
          {t.again}
        </button>
      </div>
    );
  return (
    <form className="cx-form" onSubmit={submit} noValidate aria-label={`${t.join_title}: ${title}`}>
      <Field id={`${id}-name`} label={t.name} error={errs.name}>
        <input {...aria(`${id}-name`, errs.name)} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={t.name_ph} autoComplete="name" maxLength={160} />
      </Field>
      <Field id={`${id}-phone`} label={t.phone} error={errs.phone}>
        <input {...aria(`${id}-phone`, errs.phone)} value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/[^\d+\s()-]/g, ""))} inputMode="tel" autoComplete="tel" maxLength={20} placeholder="+998" />
      </Field>
      <Field id={`${id}-email`} label={t.email} error={errs.email} optional>
        <input {...aria(`${id}-email`, errs.email, false)} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" maxLength={160} />
      </Field>
      <Field id={`${id}-group`} label={t.group} error={errs.group}>
        <input {...aria(`${id}-group`, errs.group)} value={f.group} onChange={(e) => set("group", e.target.value)} placeholder={t.group_ph} maxLength={60} />
      </Field>
      <Field id={`${id}-message`} label={t.message} optional wide>
        <textarea id={`${id}-message`} rows={4} value={f.message} onChange={(e) => set("message", e.target.value)} maxLength={3000} />
      </Field>
      <input className="cx-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={hp} onChange={(e) => setHp(e.target.value)} name="website" />
      {state === "error" && (
        <p className="cx-formerr" role="alert">
          {msg}
        </p>
      )}
      <Consent className="wide" />
      <button className="cx-btn" disabled={state === "busy"}>
        {state === "busy" ? t.sending : t.send} <Send size={17} aria-hidden />
      </button>
    </form>
  );
}

export function ClubPage() {
  const { slug = "" } = useParams();
  const { t, lang } = useCx();
  const d = useData(() => cx.club(slug, lang), [slug, lang]);
  const [joinOpen, setJoinOpen] = useState(false);
  const joinId = useId();
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const c = d.item;
  const cover = c.cover ? { url: c.cover, alt: c.cover_alt || "" } : null;
  const photos = c.photos.filter((p) => p.url !== c.cover);
  return (
    <>
      <Hero crumbs={[lifeCrumb(t), { to: "/clubs", label: t.clubs }, { label: c.title }]} eyebrow={t[CAT_KEY[c.category]]} title={c.title} lead={c.summary}>
        {(c.join_url || c.join_form) && (
          <div className="cx-actions">
            {c.join_url ? (
              <a className="cx-btn" href={c.join_url} target="_blank" rel="noopener noreferrer">
                {t.join} <ArrowUpRight size={18} aria-hidden />
              </a>
            ) : (
              <button
                type="button"
                className="cx-btn"
                aria-expanded={joinOpen}
                aria-controls={joinId}
                onClick={() => {
                  setJoinOpen(true);
                  window.setTimeout(() => document.getElementById(joinId)?.scrollIntoView({ block: "start" }), 30);
                }}
              >
                {t.join} <ArrowRight size={18} aria-hidden />
              </button>
            )}
          </div>
        )}
      </Hero>
      <Section className="tight-top">
        <div className="cx-split">
          <div className="cx-main">
            {cover && <Pic src={cover.url} alt={cover.alt} ratio="16 / 9" w={1280} sizes="(max-width: 760px) 100vw, 60vw" eager />}
            <div className="cx-prose">
              <Rich html={c.html} />
            </div>
            {photos.length > 0 && (
              <>
                <h2 className="cx-h3">{t.photos}</h2>
                <PhotoGrid photos={photos} title={c.title} />
              </>
            )}
          </div>
          <aside className="cx-aside">
            <dl className="cx-facts">
              {(d.leader || c.leader) && (
                <div>
                  <dt>{t.leader}</dt>
                  <dd>
                    {d.leader ? (
                      <Link to={`/staff/${d.leader.slug}`} className="cx-leader">
                        <Pic src={d.leader.photo} alt="" ratio="1 / 1" w={320} sizes="56px" />
                        <span>
                          <b>{d.leader.title}</b>
                          {d.leader.position && <small>{d.leader.position}</small>}
                        </span>
                      </Link>
                    ) : (
                      <>
                        <User size={16} aria-hidden /> {c.leader}
                      </>
                    )}
                  </dd>
                </div>
              )}
              {c.schedule && (
                <div>
                  <dt>{t.schedule}</dt>
                  <dd>{c.schedule}</dd>
                </div>
              )}
              {c.place && (
                <div>
                  <dt>{t.place}</dt>
                  <dd>{c.place}</dd>
                </div>
              )}
              {(c.contact || c.telegram) && (
                <div>
                  <dt>{t.contact}</dt>
                  <dd className="cx-contact">
                    {c.contact && <span>{c.contact}</span>}
                    {c.telegram && (
                      <a href={c.telegram} target="_blank" rel="noopener noreferrer">
                        Telegram <ExternalLink size={14} aria-hidden />
                      </a>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </aside>
        </div>
      </Section>
      {c.join_form && !c.join_url && (
        <section className="cx-sec alt" id={joinId} hidden={!joinOpen} aria-labelledby={`${joinId}-h`}>
          <div className="container cx-narrow">
            <h2 className="cx-h2" id={`${joinId}-h`}>
              {t.join_title}
            </h2>
            <JoinForm slug={c.slug} title={c.title} />
          </div>
        </section>
      )}
      {d.news.length > 0 && (
        <Section title={t.news}>
          <ul className="cx-rows">
            {d.news.map((n) => (
              <li key={n.id}>
                <Link to={`/news/${n.slug}`}>
                  <span className="tnum cx-rows-d">{dateL(n.published_at, lang)}</span>
                  <span className="cx-rows-t">{n.title}</span>
                  <ArrowRight size={20} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {d.others.length > 0 && (
        <Section title={t.others} alt>
          <ClubGrid items={d.others} />
        </Section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ sport */
export function SportPage() {
  const { t, lang } = useCx();
  const d = useData(() => cx.sport(lang), [lang]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  return (
    <>
      <Hero crumbs={[lifeCrumb(t), { label: t.sport }]} eyebrow={t.life} title={t.sport} lead={d.intro} />
      {d.clubs.length > 0 && (
        <Section title={t.sections} className="tight-top">
          <ClubGrid items={d.clubs} />
        </Section>
      )}
      {d.achievements.length > 0 && (
        <Section title={t.achievements} alt>
          <ul className="cx-ach">
            {d.achievements.map((a) => (
              <li key={a.id}>
                <span className="cx-ach-y tnum">{a.year || ""}</span>
                <div className="cx-ach-b">
                  <h3>{a.url ? <Link to={a.url}>{a.title}</Link> : a.title}</h3>
                  {a.result && <p className="cx-ach-r">{a.result}</p>}
                  {a.athlete && <p className="cx-ach-a">{a.athlete}</p>}
                </div>
                {a.photo && <Pic src={a.photo} alt={a.photo_alt || ""} ratio="4 / 3" w={480} sizes="(max-width: 760px) 100vw, 200px" className="cx-ach-ph" />}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {d.facilities.length > 0 && (
        <Section title={t.facilities}>
          <ul className="cx-cards">
            {d.facilities.map((f) => (
              <li key={f.id} className="cx-card plain">
                <Pic src={f.photo} alt={f.photo_alt || ""} ratio="4 / 3" w={640} />
                <div className="cx-card-b">
                  <h3 className="cx-card-t">{f.title}</h3>
                  {f.summary && <p className="cx-card-s">{f.summary}</p>}
                  <dl className="cx-mini">
                    {f.place && (
                      <div>
                        <dt>{t.place}</dt>
                        <dd>{f.place}</dd>
                      </div>
                    )}
                    {f.hours && (
                      <div>
                        <dt>{t.hours}</dt>
                        <dd>{f.hours}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ yotoqxona */
function Building({ b }: { b: Dorm }) {
  const { t } = useCx();
  const [open, setOpen] = useState<number | null>(null);
  const per = b.price_period === "semester" ? t.per_semester : b.price_period === "year" ? t.per_year : t.per_month;
  return (
    <li className="cx-bld">
      <div className="cx-bld-ph">
        <Pic src={b.photos[0]?.url} alt={b.photos[0]?.alt || ""} ratio="4 / 3" w={960} sizes="(max-width: 760px) 100vw, 40vw" />
        {b.photos.length > 1 && (
          <button type="button" className="cx-btn ghost sm" onClick={() => setOpen(0)}>
            <Images size={17} aria-hidden /> {t.photos} ({b.photos.length})
          </button>
        )}
      </div>
      <div className="cx-bld-b">
        <h3 className="cx-h3">{b.title}</h3>
        {b.summary && <p className="cx-p">{b.summary}</p>}
        <dl className="cx-facts">
          {b.address && (
            <div>
              <dt>{t.address}</dt>
              <dd>
                {b.address}
                {b.map_url && (
                  <>
                    {" "}
                    <a href={b.map_url} target="_blank" rel="noopener noreferrer" className="cx-inline">
                      {t.on_map} <ExternalLink size={14} aria-hidden />
                    </a>
                  </>
                )}
              </dd>
            </div>
          )}
          {b.capacity ? (
            <div>
              <dt>{t.capacity}</dt>
              <dd className="tnum">{fill(t.places, { n: b.capacity })}</dd>
            </div>
          ) : null}
          {b.rooms?.length ? (
            <div>
              <dt>{t.rooms}</dt>
              <dd>{b.rooms.join(", ")}</dd>
            </div>
          ) : null}
          {b.amenities?.length ? (
            <div>
              <dt>{t.amenities}</dt>
              <dd>
                <ul className="cx-list">
                  {b.amenities.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          {b.price && (
            <div>
              <dt>{t.price}</dt>
              <dd>
                {b.price} {per}
              </dd>
            </div>
          )}
          {b.phone && (
            <div>
              <dt>{t.contact}</dt>
              <dd>
                <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`}>{b.phone}</a>
              </dd>
            </div>
          )}
        </dl>
      </div>
      {open !== null && <Lightbox photos={b.photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </li>
  );
}

function DormForm() {
  const { t, lang } = useCx();
  const id = useId();
  const EMPTY = { name: "", phone: "", email: "", program: "", course: "", group: "", region: "", message: "" };
  const [f, setF] = useState(EMPTY);
  const [hp, setHp] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [state, setState] = useState<"" | "busy" | "sent" | "error">("");
  const [msg, setMsg] = useState("");
  const [num, setNum] = useState<number | undefined>();
  const set = (k: keyof typeof EMPTY, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errs[k]) setErrs((e) => ({ ...e, [k]: "" }));
  };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (f.name.trim().split(/\s+/).length < 2) e.name = t.fio;
    if (!/^(998)?\d{9}$/.test(f.phone.replace(/\D/g, ""))) e.phone = t.bad_phone;
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.email = t.bad_email;
    for (const k of ["program", "group", "region"] as const) if (f[k].trim().length < 2) e[k] = t.req;
    if (!f.course) e.course = t.req;
    setErrs(e);
    if (Object.keys(e).length) {
      document.getElementById(`${id}-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setState("busy");
    try {
      const r = await cx.dormApply({ ...f, hp, lang });
      setNum(r.ticket);
      setState("sent");
      setF(EMPTY);
    } catch (x) {
      const b = x instanceof ApiError ? (x.body as { fields?: Record<string, string> } | undefined) : undefined;
      if (b && typeof b === "object" && b.fields) {
        setErrs(Object.fromEntries(Object.entries(b.fields).map(([k, v]) => [k, fieldErr(t, k, v)])));
        setState("");
        return;
      }
      setMsg(errText(t, x instanceof ApiError ? x.detail : ""));
      setState("error");
    }
  };
  if (state === "sent")
    return (
      <div className="cx-done" role="status">
        <CheckCircle2 size={32} aria-hidden />
        <h3>{t.sent}</h3>
        {num ? <p>{fill(t.sent_n, { n: num })}</p> : null}
      </div>
    );
  const inp = (k: keyof typeof EMPTY, label: string, extra: Record<string, unknown> = {}, opt = false, wide = false) => (
    <Field id={`${id}-${k}`} label={label} error={errs[k]} optional={opt} wide={wide}>
      <input {...aria(`${id}-${k}`, errs[k], !opt)} value={f[k]} onChange={(e) => set(k, e.target.value)} maxLength={160} {...extra} />
    </Field>
  );
  return (
    <form className="cx-form" onSubmit={submit} noValidate aria-label={t.apply}>
      {inp("name", t.name, { autoComplete: "name", placeholder: t.name_ph }, false, true)}
      {inp("phone", t.phone, { inputMode: "tel", autoComplete: "tel", placeholder: "+998" })}
      {inp("email", t.email, { type: "email", autoComplete: "email" }, true)}
      {inp("program", t.program, {}, false, true)}
      <Field id={`${id}-course`} label={t.course} error={errs.course}>
        <select {...aria(`${id}-course`, errs.course)} value={f.course} onChange={(e) => set("course", e.target.value)}>
          <option value="">{t.course_ph}</option>
          {["1", "2", "3", "4"].map((c) => (
            <option key={c} value={c}>
              {fill(t.course_n, { n: c })}
            </option>
          ))}
          <option value="master">{t.master}</option>
        </select>
      </Field>
      {inp("group", t.stgroup, { placeholder: t.stgroup_ph })}
      {inp("region", t.region, { placeholder: t.region_ph, autoComplete: "address-level1" }, false, true)}
      <Field id={`${id}-message`} label={t.note} optional wide>
        <textarea id={`${id}-message`} rows={4} value={f.message} onChange={(e) => set("message", e.target.value)} maxLength={3000} />
      </Field>
      <input className="cx-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={hp} onChange={(e) => setHp(e.target.value)} name="website" />
      {state === "error" && (
        <p className="cx-formerr" role="alert">
          {msg}
        </p>
      )}
      <Consent className="wide" />
      <button className="cx-btn" disabled={state === "busy"}>
        {state === "busy" ? t.sending : t.apply} <Send size={17} aria-hidden />
      </button>
    </form>
  );
}

export function DormitoryPage() {
  const { t, lang } = useCx();
  const d = useData(() => cx.dormitory(lang), [lang]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  return (
    <>
      <Hero
        crumbs={[lifeCrumb(t), { label: t.dormitory }]}
        eyebrow={t.life}
        title={t.dormitory}
        lead={d.intro}
        aside={d.photo ? <Pic src={d.photo} alt={d.photo_alt} ratio="4 / 3" w={960} sizes="(max-width: 760px) 100vw, 40vw" eager className="cx-hero-ph" /> : undefined}
      >
        {d.apply_open && (
          <div className="cx-actions">
            <a className="cx-btn" href="#apply">
              {t.apply} <ArrowRight size={18} aria-hidden />
            </a>
          </div>
        )}
      </Hero>
      {d.buildings.length > 0 && (
        <Section title={t.buildings} className="tight-top">
          <ul className="cx-blds">
            {d.buildings.map((b) => (
              <Building key={b.id} b={b} />
            ))}
          </ul>
        </Section>
      )}
      {d.rules && (
        <Section title={t.rules} alt>
          <div className="cx-prose narrow">
            <Rich html={d.rules} />
          </div>
        </Section>
      )}
      {(d.steps.length > 0 || d.apply_open) && (
        <Section title={t.how} id="apply">
          <div className={d.steps.length && d.apply_open ? "cx-split" : ""}>
            {d.steps.length > 0 && (
              <ol className="cx-steps-list">
                {d.steps.map((s, i) => (
                  <li key={i}>
                    <span className="cx-steps-n tnum" aria-hidden>
                      {i + 1}
                    </span>
                    <div>
                      <h3>{s.title}</h3>
                      {s.text && <p>{s.text}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {d.apply_open && (
              <div className="cx-card-form">
                <h3 className="cx-h3">{t.apply}</h3>
                <DormForm />
              </div>
            )}
          </div>
        </Section>
      )}
      {d.faq.length > 0 && (
        <Section title={t.faq} alt>
          <Faq items={d.faq} />
        </Section>
      )}
      {d.contacts.length > 0 && (
        <Section title={t.contacts}>
          <People items={d.contacts} />
        </Section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ stipendiyalar */
function ScholarshipCard({ s }: { s: Scholarship }) {
  const { t } = useCx();
  return (
    <li className="cx-sch">
      <h3 className="cx-h3">{s.title}</h3>
      {s.amount && (
        <p className="cx-sch-amt">
          <span className="sr-only">{t.amount}: </span>
          {s.amount}
        </p>
      )}
      {s.summary && <p className="cx-p">{s.summary}</p>}
      <dl className="cx-facts">
        {s.eligibility && (
          <div>
            <dt>{t.eligibility}</dt>
            <dd>{s.eligibility}</dd>
          </div>
        )}
        {s.criteria?.length ? (
          <div>
            <dt>{t.criteria}</dt>
            <dd>
              <ul className="cx-list">
                {s.criteria.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        {s.period && (
          <div>
            <dt>{t.period}</dt>
            <dd>{s.period}</dd>
          </div>
        )}
        {s.documents?.length ? (
          <div>
            <dt>{t.documents}</dt>
            <dd>
              <ul className="cx-list">
                {s.documents.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
      {s.url &&
        (/^https?:/.test(s.url) ? (
          <a className="tlink" href={s.url} target="_blank" rel="noopener noreferrer">
            {t.more} <span aria-hidden>↗</span>
          </a>
        ) : (
          <Link className="tlink" to={s.url}>
            {t.more} <span aria-hidden>→</span>
          </Link>
        ))}
    </li>
  );
}

export function ScholarshipsPage() {
  const { t, lang } = useCx();
  const d = useData(() => cx.scholarships(lang), [lang]);
  const [tag, setTag] = useState("");
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const items = d.items.filter((s) => !tag || (s.tags || []).includes(tag));
  const tl = (k: string) => (t as unknown as Record<string, string>)[`tag_${k}`] || k;
  return (
    <>
      <Hero crumbs={[lifeCrumb(t), { label: t.scholarships }]} eyebrow={t.life} title={t.scholarships} lead={d.intro} />
      <Section className="tight-top">
        {d.tags.length > 0 && (
          <div className="cx-tools">
            <Seg label={t.for_whom} value={tag} onChange={setTag} options={[{ value: "", label: t.all }, ...d.tags.map((x) => ({ value: x, label: tl(x) }))]} />
            <p className="cx-count tnum" aria-live="polite">
              {fill(t.shown, { n: items.length })}
            </p>
          </div>
        )}
        {items.length ? (
          <ul className="cx-schs">
            {items.map((s) => (
              <ScholarshipCard key={s.id} s={s} />
            ))}
          </ul>
        ) : (
          <p className="cx-empty">{t.none_tag}</p>
        )}
      </Section>
    </>
  );
}
