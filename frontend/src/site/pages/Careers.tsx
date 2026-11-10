// Vakansiyalar (Careers): ro'yxat, vakansiya sahifasi va ariza (rezyume bilan) — arizalar «Murojaatlar»ga tushadi
import { ArrowLeft, ArrowUpRight, Briefcase, Building2, CalendarClock, CheckCircle2, Clock, FileUp, GraduationCap, HeartHandshake, MapPin, Plane, Send, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { lazy, Suspense, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Consent } from "../official/Consent";
import { ApiError, pub, type Vacancy } from "../../lib/api";
import { fmtDate } from "../../lib/i18n";
import { useSite } from "../../lib/site";
import { Magnetic, Reveal } from "../fx";
import { LangNotice, Share } from "../share";
import { Loading, NotFound, PageHero, useFetch } from "./Pages";
import "../../styles/careers.css";

const RichHtml = lazy(() => import("../../rich/RichHtml"));

function VacancyCard({ v, index }: { v: Vacancy; index: number }) {
  const { t, lang } = useSite();
  return (
    <Reveal delay={(index % 3) * 0.06}>
      <Link to={`/careers/${v.slug}`} className={`vac-card ${v.open === false ? "closed" : ""}`} data-cursor={t.details}>
        <div className="vac-top">
          <span className="vac-chip">{t.employment[v.employment] || v.employment}</span>
          {v.featured && <Sparkles size={16} className="vac-star" />}
        </div>
        <h3>{v.title}</h3>
        {v.summary && <p>{v.summary}</p>}
        <div className="vac-meta">
          {v.department && (
            <span>
              <Building2 size={14} /> {v.department}
            </span>
          )}
          {v.location && (
            <span>
              <MapPin size={14} /> {v.location}
            </span>
          )}
          {v.deadline && (
            <span className={v.open === false ? "late" : ""}>
              <CalendarClock size={14} /> {v.open === false ? t.vac_closed : `${t.vac_deadline}: ${fmtDate(v.deadline, lang, true)}`}
            </span>
          )}
        </div>
        <span className="vac-go">
          {t.vac_apply} <ArrowUpRight size={16} />
        </span>
      </Link>
    </Reveal>
  );
}

export function CareersPage() {
  const { t } = useSite();
  const d = useFetch(() => pub.careers());
  const [cat, setCat] = useState("all");
  const items = d && d !== "404" ? d.items : [];
  const cats = useMemo(() => [...new Set(items.map((x) => x.category))], [items]);
  const shown = items.filter((x) => cat === "all" || x.category === cat);
  const perks: [ReactNode, string, string][] = [
    [<HeartHandshake key="1" />, t.perk1_t, t.perk1_d],
    [<Plane key="2" />, t.perk2_t, t.perk2_d],
    [<GraduationCap key="3" />, t.perk3_t, t.perk3_d],
    [<ShieldCheck key="4" />, t.perk4_t, t.perk4_d],
  ];
  return (
    <>
      <section className="careers-hero">
        <div className="container">
          <Reveal className="page-eyebrow">{t.careers_eyebrow}</Reveal>
          <h1 className="careers-title">{t.careers_title}</h1>
          <Reveal delay={0.2}>
            <p className="careers-sub">{t.careers_sub}</p>
          </Reveal>
          <Reveal delay={0.3} className="careers-cta">
            <a href="#open" className="btn btn-primary">
              <Briefcase size={17} /> {t.careers_open}
              {items.length > 0 && <b className="careers-count">{items.length}</b>}
            </a>
          </Reveal>
        </div>
      </section>
      <section className="section tight">
        <div className="container">
          <Reveal>
            <h2 className="careers-h2">{t.careers_why}</h2>
          </Reveal>
          <div className="perk-grid">
            {perks.map(([ic, h, p], i) => (
              <Reveal key={h} delay={i * 0.07} className="perk">
                <span className="perk-ic">{ic}</span>
                <b>{h}</b>
                <p>{p}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section className="section tight" id="open">
        <div className="container">
          <div className="careers-head">
            <h2 className="careers-h2">{t.careers_open}</h2>
            {cats.length > 1 && (
              <div className="pill-tabs">
                <button className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>
                  {t.faq_all}
                </button>
                {cats.map((c) => (
                  <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>
                    {t.vac_cats[c] || c}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!d ? (
            <Loading />
          ) : shown.length ? (
            <div className="vac-grid">
              {shown.map((v, i) => (
                <VacancyCard key={v.id} v={v} index={i} />
              ))}
            </div>
          ) : (
            <div className="vac-empty">
              <Briefcase size={28} />
              <p>{t.careers_none}</p>
            </div>
          )}
        </div>
      </section>
      <section className="section tight">
        <div className="container">
          <Reveal>
            <h2 className="careers-h2">{t.careers_steps}</h2>
          </Reveal>
          <ol className="hire-steps">
            {[t.step1, t.step2, t.step3].map((s, i) => (
              <Reveal key={s} as="li" delay={i * 0.08}>
                <span aria-hidden>{i + 1}</span>
                <b>{s}</b>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

function ApplyForm({ v }: { v: Vacancy }) {
  const { t } = useSite();
  const [f, setF] = useState({ name: "", email: "", phone: "", message: "", hp: "" });
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [err, setErr] = useState("");
  const [num, setNum] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("busy");
    const fd = new FormData();
    Object.entries(f).forEach(([k, x]) => fd.append(k, x));
    if (file) fd.append("cv", file);
    try {
      const r = await pub.apply(v.slug || "", fd);
      setNum(r.ticket);
      setState("sent");
    } catch (e2) {
      const dd = e2 instanceof ApiError ? e2.detail : "";
      setErr(dd === "invalid_email" ? t.err_invalid_email : dd === "bad_file_type" || dd === "too_large" ? t.apply_bad_file : dd === "too_many_attempts" ? t.err_too_many : t.err_generic);
      setState("error");
    }
  };
  if (state === "sent")
    return (
      <div className="apply-done">
        <CheckCircle2 size={34} />
        <b>
          {t.apply_ok}
          {num ? `UNI-${num}` : ""}
        </b>
        <p>{t.apply_ok2}</p>
      </div>
    );
  return (
    <form className="contact-form apply-form" onSubmit={submit}>
      <h3>{t.apply_title}</h3>
      <label className="field">
        <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder=" " maxLength={120} />
        <span>{t.apply_name}</span>
      </label>
      <div className="field-row">
        <label className="field">
          <input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder=" " maxLength={160} />
          <span>{t.f_email}</span>
        </label>
        <label className="field">
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder=" " maxLength={40} />
          <span>{t.f_phone}</span>
        </label>
      </div>
      <label className="field">
        <textarea rows={4} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder=" " maxLength={5000} />
        <span>{t.apply_message}</span>
      </label>
      <button type="button" className={`cv-drop ${file ? "has" : ""}`} onClick={() => inp.current?.click()}>
        <FileUp size={20} />
        <span>
          <b>{file ? file.name : t.apply_pick}</b>
          <small>{t.apply_cv}</small>
        </span>
      </button>
      <input ref={inp} type="file" hidden accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <input className="hp" tabIndex={-1} autoComplete="off" value={f.hp} onChange={(e) => setF({ ...f, hp: e.target.value })} aria-hidden />
      {state === "error" && <p className="form-error">{err}</p>}
      <Consent />
      <Magnetic>
        <button className="btn btn-primary" disabled={state === "busy"} data-cursor="">
          {state === "busy" ? t.sending : t.apply_send} <Send size={16} />
        </button>
      </Magnetic>
    </form>
  );
}

function Bullets({ title, items, icon }: { title: string; items: string[]; icon: ReactNode }) {
  if (!items?.length) return null;
  return (
    <Reveal className="vac-list">
      <h3>{title}</h3>
      <ul>
        {items.map((x) => (
          <li key={x}>
            {icon}
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

export function CareerPage() {
  const { slug } = useParams();
  const { t, lang } = useSite();
  const d = useFetch(() => pub.career(slug || ""), [slug]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const v = d.item;
  return (
    <>
      <PageHero eyebrow={t.vac_cats[v.category] || t.careers_eyebrow} title={v.title} sub={v.summary} notice={<LangNotice served={v.lang} langs={v.langs} />}>
        <Reveal delay={0.4} className="vac-facts">
          <span>
            <Clock size={15} /> {t.employment[v.employment] || v.employment}
          </span>
          {v.department && (
            <span>
              <Building2 size={15} /> {v.department}
            </span>
          )}
          {v.location && (
            <span>
              <MapPin size={15} /> {v.location}
            </span>
          )}
          {v.salary && (
            <span>
              <Wallet size={15} /> {v.salary}
            </span>
          )}
          {v.deadline && (
            <span className={v.open === false ? "late" : ""}>
              <CalendarClock size={15} /> {v.open === false ? t.vac_closed : `${t.vac_deadline}: ${fmtDate(v.deadline, lang)}`}
            </span>
          )}
        </Reveal>
      </PageHero>
      <section className="section tight">
        <div className="container vac-layout">
          <div className="vac-main">
            {(v.html || v.content) && (
              <div className="article-wrap top">
                <Suspense fallback={<Loading />}>
                  <RichHtml html={v.html} doc={v.content} />
                </Suspense>
              </div>
            )}
            <Bullets title={t.vac_duties} items={v.duties} icon={<Sparkles size={15} />} />
            <Bullets title={t.vac_requirements} items={v.requirements} icon={<CheckCircle2 size={15} />} />
            <Bullets title={t.vac_benefits} items={v.benefits} icon={<HeartHandshake size={15} />} />
            <Share title={v.title} />
          </div>
          <aside className="vac-side">{v.open === false ? <div className="apply-done closed"><CalendarClock size={30} /><b>{t.vac_closed}</b></div> : <ApplyForm v={v} />}</aside>
        </div>
      </section>
      {d.others.length > 0 && (
        <section className="section tight">
          <div className="container">
            <h2 className="careers-h2">{t.vac_other}</h2>
            <div className="vac-grid">
              {d.others.map((x, i) => (
                <VacancyCard key={x.id} v={x} index={i} />
              ))}
            </div>
            <Link to="/careers" className="link-arrow">
              <ArrowLeft size={18} /> {t.careers_open}
            </Link>
          </div>
        </section>
      )}
    </>
  );
}


/* ------------------------------------------------------------------ Telegram bot (Aloqa → Telegram bot) */
export function TelegramPage() {
  const { t, data } = useSite();
  const link = data?.telegram_bot || "";
  if (link && typeof window !== "undefined") window.location.replace(link);
  return (
    <section className="state-page unsub-page">
      <div className="container narrow">
        <Reveal className="unsub-card">
          <span className="unsub-ic" aria-hidden>
            <Send size={32} />
          </span>
          <h1 className="page-title sm">{t.tg_title}</h1>
          {!link && <p className="page-sub">{t.tg_none}</p>}
          {link ? (
            <a className="btn btn-primary" href={link}>
              <Send size={16} /> {t.tg_open}
            </a>
          ) : (
            <Link to="/contact" className="btn btn-primary">
              {t.nav_reception}
            </Link>
          )}
        </Reveal>
      </div>
    </section>
  );
}
