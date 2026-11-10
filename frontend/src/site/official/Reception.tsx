// «Rahbariyatning fuqarolarni qabul qilish jadvali»: haftalik jadval (bugungi kun ajratilgan), rahbarlar ro'yxati va
// «Qabulga yozilish» — virtual qabulxona formasi (rahbar va sana/vaqt oldindan tanlangan; vaqt rahbarning qabul vaqtiga mos bo'lishi shart)
import { CalendarCheck, ExternalLink, MapPin, Phone, Printer, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { fmtDate } from "../../lib/i18n";
import { NotFound } from "../pages/Pages";
import { initials } from "../uni";
import { off, type ReceptionData, type ReceptionEntry, type Slot } from "./api";
import { useOT, type OfficialDict } from "./i18n";
import { ConsentNote, OfficialHero, Skeleton, useLoad } from "./ui";

const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)), 12);
const wd = (d: Date) => ((d.getDay() + 6) % 7) + 1; // Dushanba = 1

/** «Du–Sh 09:00–15:00; Ju 14:00–17:00» — ketma-ket kunlar bir xil vaqtda bo'lsa birlashtiriladi */
function summarize(slots: Slot[], o: OfficialDict): string[] {
  const byTime = new Map<string, number[]>();
  slots.forEach((s) => {
    const k = `${s.start}–${s.end}`;
    byTime.set(k, [...(byTime.get(k) || []), s.day]);
  });
  const out: string[] = [];
  byTime.forEach((days, time) => {
    const ds = [...new Set(days)].sort((a, b) => a - b);
    const runs: string[] = [];
    let i = 0;
    while (i < ds.length) {
      let j = i;
      while (j + 1 < ds.length && ds[j + 1] === ds[j] + 1) j++;
      runs.push(j - i >= 2 ? `${o.rec_days_short[ds[i] - 1]}–${o.rec_days_short[ds[j] - 1]}` : ds.slice(i, j + 1).map((x) => o.rec_days_short[x - 1]).join(", "));
      i = j + 1;
    }
    out.push(`${runs.join(", ")} ${time}`);
  });
  return out;
}

function Photo({ e }: { e: ReceptionEntry }) {
  return <span className="of-photo">{e.photo ? <img src={e.photo} alt="" loading="lazy" /> : <span aria-hidden="true">{initials(e.name)}</span>}</span>;
}

/* ------------------------------------------------------------------ qabulga yozilish oynasi */
function BookingDialog({ data, entryId, onClose }: { data: ReceptionData; entryId: string; onClose: () => void }) {
  const { o, lang } = useOT();
  const ref = useRef<HTMLDialogElement>(null);
  const [id, setId] = useState(entryId);
  const entry = data.items.find((x) => x.id === id) || data.items[0];
  const dates = useMemo(() => {
    const out: string[] = [];
    const end = parseDay(data.window.to);
    for (let d = parseDay(data.window.from); d <= end && out.length < 40; d.setDate(d.getDate() + 1)) {
      const day = isoDay(d);
      const slots = entry.slots.filter((s) => s.day === wd(d));
      if (!slots.length) continue;
      if (day === data.today && !slots.some((s) => s.end > data.now)) continue;
      out.push(day);
    }
    return out;
  }, [entry, data]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const times = useMemo(() => {
    if (!date) return [];
    const out: string[] = [];
    entry.slots
      .filter((s) => s.day === wd(parseDay(date)))
      .forEach((s) => {
        for (let m = toMin(s.start); m < toMin(s.end); m += 30) {
          const hm = toHM(m);
          if (date === data.today && hm <= data.now) continue;
          if (!out.includes(hm)) out.push(hm);
        }
      });
    return out.sort();
  }, [date, entry, data]);
  useEffect(() => {
    setDate((d) => (dates.includes(d) ? d : dates[0] || ""));
  }, [dates]);
  useEffect(() => {
    setTime((t) => (times.includes(t) ? t : times[0] || ""));
  }, [times]);
  const [f, setF] = useState({ name: "", email: "", phone: "", message: "", hp: "" });
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [err, setErr] = useState("");
  const [ticket, setTicket] = useState(0);
  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dlg?.addEventListener("cancel", onCancel);
    return () => dlg?.removeEventListener("cancel", onCancel);
  }, [onClose]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setState("busy");
    try {
      const r = await off.book({ id: entry.id, date, time, ...f, lang });
      setTicket(r.ticket);
      setState("sent");
    } catch (e2) {
      const d = e2 instanceof ApiError ? e2.detail : "";
      setErr(
        d === "invalid_slot" ? o.rec_err_slot : d === "invalid_email" ? o.err_email : d === "invalid_name" ? o.err_name : d === "empty_message" ? o.err_message : d === "too_many_attempts" ? o.err_many : o.err_generic,
      );
      setState("idle");
    }
  };
  const dayLabel = (s: string) => `${o.rec_days[wd(parseDay(s)) - 1]}, ${fmtDate(`${s}T12:00:00`, lang)}`;
  return (
    <dialog ref={ref} className="of-dialog" aria-labelledby="of-book-h" onClick={(e) => e.target === ref.current && onClose()}>
      <div className="of-dialog-in">
        <div className="of-dialog-head">
          <h2 id="of-book-h">{o.rec_form_title}</h2>
          <button type="button" className="of-icon-btn" onClick={onClose} aria-label={o.rec_close}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {state === "sent" ? (
          <div className="of-sent" role="status">
            <CalendarCheck size={28} aria-hidden="true" />
            <p>{o.rec_sent(ticket)}</p>
            <button type="button" className="of-btn primary" onClick={onClose} autoFocus>
              {o.rec_close}
            </button>
          </div>
        ) : (
          <form className="of-form" onSubmit={submit} noValidate={false}>
            <div className="of-book-who">
              <Photo e={entry} />
              <div>
                <b>{entry.name}</b>
                {entry.position && <small>{entry.position}</small>}
              </div>
            </div>
            {data.items.length > 1 && (
              <label className="of-field">
                <span>{o.rec_official}</span>
                <select value={entry.id} onChange={(e) => setId(e.target.value)}>
                  {data.items.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {dates.length ? (
              <div className="of-row2">
                <label className="of-field">
                  <span>{o.rec_date}</span>
                  <select required value={date} onChange={(e) => setDate(e.target.value)}>
                    {dates.map((d) => (
                      <option key={d} value={d}>
                        {dayLabel(d)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="of-field">
                  <span>{o.rec_time}</span>
                  <select required value={time} onChange={(e) => setTime(e.target.value)}>
                    {times.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <p className="of-note" role="status">
                {o.rec_no_dates}
              </p>
            )}
            <div className="of-row2">
              <label className="of-field">
                <span>
                  {o.rec_name} <abbr title="*" aria-hidden="true">*</abbr>
                </span>
                <input required minLength={2} maxLength={120} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </label>
              <label className="of-field">
                <span>
                  {o.rec_email} <abbr title="*" aria-hidden="true">*</abbr>
                </span>
                <input required type="email" maxLength={160} autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              </label>
            </div>
            <label className="of-field">
              <span>{o.rec_phone_f}</span>
              <input type="tel" maxLength={40} autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </label>
            <label className="of-field">
              <span>
                {o.rec_message} <abbr title="*" aria-hidden="true">*</abbr>
              </span>
              <textarea required minLength={5} rows={4} maxLength={5000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
            </label>
            <input className="hp" tabIndex={-1} autoComplete="off" value={f.hp} onChange={(e) => setF({ ...f, hp: e.target.value })} aria-hidden="true" />
            {err && (
              <p className="of-err" role="alert">
                {err}
              </p>
            )}
            <ConsentNote />
            <div className="of-form-acts">
              <button type="button" className="of-btn" onClick={onClose}>
                {o.rec_cancel}
              </button>
              <button type="submit" className="of-btn primary" disabled={state === "busy" || !dates.length || !time}>
                {state === "busy" ? o.rec_sending : o.rec_send}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

/* ------------------------------------------------------------------ sahifa */
export function ReceptionPage() {
  const { o } = useOT();
  const d = useLoad(off.reception);
  const [sp, setSp] = useSearchParams();
  const book = sp.get("book") || "";
  const opener = useRef<HTMLElement | null>(null);
  const days = useMemo(() => {
    if (!d || d === "404") return [1, 2, 3, 4, 5, 6];
    const used = new Set(d.items.flatMap((x) => x.slots.map((s) => s.day)));
    return [1, 2, 3, 4, 5, 6, 7].filter((n) => n <= 5 || used.has(n));
  }, [d]);
  if (d === "404") return <NotFound />;
  const open = (id: string, el: HTMLElement) => {
    opener.current = el;
    const n = new URLSearchParams(sp);
    n.set("book", id);
    setSp(n, { replace: true, preventScrollReset: true });
  };
  const close = () => {
    const n = new URLSearchParams(sp);
    n.delete("book");
    setSp(n, { replace: true, preventScrollReset: true });
    window.setTimeout(() => opener.current?.focus(), 0);
  };
  const slotsOn = (e: ReceptionEntry, day: number) => e.slots.filter((s) => s.day === day);
  return (
    <>
      <OfficialHero
        title={o.rec_title}
        sub={o.rec_sub}
        print
        actions={
          <button type="button" className="of-btn of-print-btn" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" />
            <span>{o.rec_print}</span>
          </button>
        }
      />
      {!d ? (
        <Skeleton />
      ) : (
        <>
          <section className="section tight of-sec" aria-labelledby="of-week-h">
            <div className="container">
              <h2 id="of-week-h" className="of-h2">
                {o.rec_week}
              </h2>
              <div className="of-week-wrap">
                <table className="of-week">
                  <caption className="of-sr">{o.rec_title}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{o.rec_official}</th>
                      {days.map((n) => (
                        <th key={n} scope="col" className={n === d.weekday ? "today" : ""} aria-current={n === d.weekday ? "date" : undefined}>
                          <span className="of-day-l">{o.rec_days[n - 1]}</span>
                          <span className="of-day-s" aria-hidden="true">
                            {o.rec_days_short[n - 1]}
                          </span>
                          {n === d.weekday && <em className="of-today-tag">{o.rec_today}</em>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((e) => (
                      <tr key={e.id}>
                        <th scope="row">
                          <b>{e.name}</b>
                          {e.position && <small>{e.position}</small>}
                        </th>
                        {days.map((n) => {
                          const ss = slotsOn(e, n);
                          return (
                            <td key={n} className={n === d.weekday ? "today" : ""}>
                              {ss.length ? (
                                ss.map((s) => (
                                  <span key={s.start} className="of-time">
                                    {s.start}–{s.end}
                                  </span>
                                ))
                              ) : (
                                <span className="of-dash">
                                  <span aria-hidden="true">—</span>
                                  <span className="of-sr">{o.rec_no_reception}</span>
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* mobil: kunlar bo'yicha ro'yxat (jadval o'rniga) */}
              <ol className="of-agenda">
                {days.map((n) => {
                  const who = d.items.filter((e) => slotsOn(e, n).length);
                  return (
                    <li key={n} className={n === d.weekday ? "today" : ""} aria-current={n === d.weekday ? "date" : undefined}>
                      <h3>
                        {o.rec_days[n - 1]}
                        {n === d.weekday && <em className="of-today-tag">{o.rec_today}</em>}
                      </h3>
                      {who.length ? (
                        <ul>
                          {who.map((e) => (
                            <li key={e.id}>
                              <span>{e.name}</span>
                              <span className="of-time">
                                {slotsOn(e, n)
                                  .map((s) => `${s.start}–${s.end}`)
                                  .join(", ")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="of-dash">{o.rec_no_reception}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
          <section className="section tight of-sec" aria-labelledby="of-list-h">
            <div className="container">
              <h2 id="of-list-h" className="of-h2">
                {o.rec_list}
              </h2>
              <ul className="of-people">
                {d.items.map((e) => {
                  const today = slotsOn(e, d.weekday);
                  return (
                    <li key={e.id} className={`of-person ${today.length ? "is-today" : ""}`}>
                      <Photo e={e} />
                      <div className="of-person-body">
                        <h3 className="of-person-name">{e.staff_slug ? <Link to={`/staff/${e.staff_slug}`}>{e.name}</Link> : e.name}</h3>
                        {e.position && <p className="of-person-pos">{e.position}</p>}
                        <dl className="of-dl">
                          <div>
                            <dt>{o.rec_hours}</dt>
                            <dd>
                              {summarize(e.slots, o).map((x) => (
                                <span key={x} className="of-time-line">
                                  {x}
                                </span>
                              ))}
                              {today.length > 0 && (
                                <span className="of-today-line">
                                  {o.rec_today}: {today.map((s) => `${s.start}–${s.end}`).join(", ")}
                                </span>
                              )}
                            </dd>
                          </div>
                          {(e.place || e.room) && (
                            <div>
                              <dt>
                                <MapPin size={15} aria-hidden="true" /> {o.rec_place}
                              </dt>
                              <dd>{[e.place, e.room && `${o.rec_room} ${e.room}`].filter(Boolean).join(", ")}</dd>
                            </div>
                          )}
                          {e.phone && (
                            <div>
                              <dt>
                                <Phone size={15} aria-hidden="true" /> {o.rec_phone}
                              </dt>
                              <dd>
                                <a href={`tel:${e.phone.replace(/[^+\d]/g, "")}`}>{e.phone}</a>
                              </dd>
                            </div>
                          )}
                          {(e.note || e.online_url) && (
                            <div>
                              <dt>{o.rec_online}</dt>
                              <dd>
                                {e.note && <span className="of-note-text">{e.note}</span>}
                                {e.online_url && (
                                  <a href={e.online_url} target="_blank" rel="noopener noreferrer" className="of-link">
                                    {e.online_url.replace(/^https?:\/\//, "").replace(/\/$/, "")} <ExternalLink size={13} aria-hidden="true" />
                                  </a>
                                )}
                              </dd>
                            </div>
                          )}
                        </dl>
                        <button type="button" className="of-btn primary of-book-btn" onClick={(ev) => open(e.id, ev.currentTarget)}>
                          <CalendarCheck size={16} aria-hidden="true" />
                          <span>{o.rec_book}</span>
                          <span className="of-sr">: {e.name}</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
          {book && d.items.some((x) => x.id === book) && <BookingDialog key={book} data={d} entryId={book} onClose={close} />}
        </>
      )}
    </>
  );
}
