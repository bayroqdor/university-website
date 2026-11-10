// Tadbir sahifasidagi ro'yxatdan o'tish formasi (admin yoqqan bo'lsa): bo'sh o'rinlar hisoblagichi, kutish ro'yxati, muddat,
// qo'shimcha savollar, tasdiqlash va taqvimga qo'shish (.ics).
import { CalendarPlus, CheckCircle2, Clock, Send } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { ApiError } from "../../lib/api";
import { Consent } from "../official/Consent";
import { cx, type RegInfo } from "./api";
import { fill } from "./i18n";
import { aria, dateL, errText, Field, fieldErr, useCx } from "./ui";

export default function EventRegistration({ slug }: { slug: string }) {
  const { t, lang } = useCx();
  const id = useId();
  const [info, setInfo] = useState<RegInfo | null>(null);
  const [f, setF] = useState<Record<string, string>>({ name: "", phone: "", email: "", school: "", grade: "", guests: "0" });
  const [ans, setAns] = useState<Record<string, string>>({});
  const [hp, setHp] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [state, setState] = useState<"" | "busy" | "error">("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState<{ status: "registered" | "waitlist"; position: number | null } | null>(null);
  const load = () =>
    cx
      .regInfo(slug, lang)
      .then(setInfo)
      .catch(() => setInfo(null));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, lang]);
  if (!info || !info.enabled) return null;

  const set = (k: string, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errs[k]) setErrs((e) => ({ ...e, [k]: "" }));
  };
  const open = info.state === "open" || info.state === "waitlist";
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (f.name.trim().split(/\s+/).length < 2) e.name = t.fio;
    if (!/^(998)?\d{9}$/.test(f.phone.replace(/\D/g, ""))) e.phone = t.bad_phone;
    for (const k of ["email", "school", "grade"] as const) if (info.fields[k] === "required" && !f[k].trim()) e[k] = t.req;
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.email = t.bad_email;
    for (const q of info.questions) if (q.required && !(ans[q.id] || "").trim()) e[`q_${q.id}`] = t.req;
    setErrs(e);
    if (Object.keys(e).length) {
      document.getElementById(`${id}-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setState("busy");
    try {
      const r = await cx.register(slug, { ...f, guests: Number(f.guests) || 0, answers: ans, hp, lang });
      setDone(r);
      setState("");
      load();
    } catch (x) {
      const b = x instanceof ApiError ? (x.body as { fields?: Record<string, string> } | undefined) : undefined;
      if (b && typeof b === "object" && b.fields) {
        setErrs(Object.fromEntries(Object.entries(b.fields).map(([k, v]) => [k, k === "guests" ? t.req : fieldErr(t, k, v)])));
        setState("");
        return;
      }
      setMsg(errText(t, x instanceof ApiError ? x.detail : ""));
      setState("error");
      load();
    }
  };
  const ics = `/api/events/${encodeURIComponent(slug)}/calendar.ics?lang=${lang}`;
  const opt = (k: "email" | "school" | "grade", label: string, extra: Record<string, unknown> = {}) =>
    info.fields[k] === "off" ? null : (
      <Field id={`${id}-${k}`} label={label} error={errs[k]} optional={info.fields[k] !== "required"}>
        <input {...aria(`${id}-${k}`, errs[k], info.fields[k] === "required")} value={f[k]} onChange={(e) => set(k, e.target.value)} maxLength={k === "grade" ? 40 : 160} {...extra} />
      </Field>
    );
  return (
    <section className="cx-reg" aria-labelledby={`${id}-h`}>
      <h2 className="cx-h3" id={`${id}-h`}>
        {t.reg_title}
      </h2>
      <dl className="cx-reg-meta tnum" aria-live="polite">
        {info.capacity ? (
          <div>
            <dt>{t.seats_left}</dt>
            <dd>
              <b>{info.left}</b> / {info.capacity}
            </dd>
          </div>
        ) : null}
        {info.deadline && (
          <div>
            <dt>{t.reg_deadline}</dt>
            <dd>
              <Clock size={15} aria-hidden /> {dateL(info.deadline, lang)}
            </dd>
          </div>
        )}
      </dl>
      {info.capacity ? (
        <div className="cx-meter" role="img" aria-label={`${t.seats_left}: ${info.left} / ${info.capacity}`}>
          <span style={{ width: `${Math.min(100, (info.taken / info.capacity) * 100)}%` }} />
        </div>
      ) : null}
      {done ? (
        <div className="cx-done" role="status">
          <CheckCircle2 size={32} aria-hidden />
          <h3>{done.status === "registered" ? t.reg_ok : t.reg_wait}</h3>
          {done.status === "waitlist" && done.position ? <p>{fill(t.reg_wait_n, { n: done.position })}</p> : null}
          <a className="cx-btn ghost" href={ics} download>
            <CalendarPlus size={18} aria-hidden /> {t.ics}
          </a>
        </div>
      ) : !open ? (
        <p className="cx-state">{info.state === "full" ? t.st_full : t.st_closed}</p>
      ) : (
        <form className="cx-form" onSubmit={submit} noValidate aria-labelledby={`${id}-h`}>
          {info.state === "waitlist" && <p className="cx-state wide">{t.st_waitlist}</p>}
          <Field id={`${id}-name`} label={t.name} error={errs.name}>
            <input {...aria(`${id}-name`, errs.name)} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={t.name_ph} autoComplete="name" maxLength={160} />
          </Field>
          <Field id={`${id}-phone`} label={t.phone} error={errs.phone}>
            <input {...aria(`${id}-phone`, errs.phone)} value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/[^\d+\s()-]/g, ""))} inputMode="tel" autoComplete="tel" maxLength={20} placeholder="+998" />
          </Field>
          {opt("email", t.email, { type: "email", autoComplete: "email" })}
          {opt("school", t.school)}
          {opt("grade", t.grade)}
          {info.guests_max > 0 && (
            <Field id={`${id}-guests`} label={t.guests} error={errs.guests} optional>
              <select id={`${id}-guests`} value={f.guests} onChange={(e) => set("guests", e.target.value)}>
                {Array.from({ length: info.guests_max + 1 }, (_, i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {info.questions.map((q) => (
            <Field key={q.id} id={`${id}-q_${q.id}`} label={q.label} error={errs[`q_${q.id}`]} optional={!q.required} wide>
              <textarea
                {...aria(`${id}-q_${q.id}`, errs[`q_${q.id}`], q.required)}
                rows={2}
                value={ans[q.id] || ""}
                onChange={(e) => {
                  setAns((a) => ({ ...a, [q.id]: e.target.value }));
                  if (errs[`q_${q.id}`]) setErrs((x) => ({ ...x, [`q_${q.id}`]: "" }));
                }}
                maxLength={1000}
              />
            </Field>
          ))}
          <input className="cx-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={hp} onChange={(e) => setHp(e.target.value)} name="website" />
          {state === "error" && (
            <p className="cx-formerr" role="alert">
              {msg}
            </p>
          )}
          <Consent className="wide" />
          <button className="cx-btn" disabled={state === "busy"}>
            {state === "busy" ? t.sending : info.state === "waitlist" ? t.join_wait : t.register} <Send size={17} aria-hidden />
          </button>
        </form>
      )}
    </section>
  );
}
