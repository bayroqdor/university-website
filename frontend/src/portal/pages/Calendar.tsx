// Shaxsiy kalendar: oy ko'rinishi — band / bo'sh kunlar, darslar (dars jadvalidan), topshiriq muddatlari va o'z ishlari.
// O'ng tomonda tanlangan kun rejasi; hodisa qo'shish / tahrirlash oynasi.
import { CalendarCheck2, ChevronLeft, ChevronRight, Clock, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Btn, Field, Input, Modal, PageHead, Spinner, Textarea, Toggle, useConfirm, useRun } from "../../admin/ui";
import type { AppsDict } from "../apps-i18n";
import { calendar, type CalDeadline, type CalEvent, type CalLesson, type EventKind } from "../api";
import { usePortal } from "../PortalApp";
import { useApps } from "./Blog";

const KINDS: EventKind[] = ["task", "busy", "meeting", "exam", "personal", "free"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const kindLabel = (k: EventKind, t: AppsDict) => t[`k_${k}` as keyof AppsDict] as string;

type Data = { events: CalEvent[]; lessons: CalLesson[]; deadlines: CalDeadline[] };
type Draft = { id?: string; title: string; kind: EventKind; start: string; end: string; time_from: string; time_to: string; note: string; done: boolean };

function monthGrid(y: number, m: number): Date[] {
  const first = new Date(y, m, 1);
  const shift = (first.getDay() + 6) % 7; // dushanbadan
  const start = new Date(y, m, 1 - shift);
  const weeks = Math.ceil((shift + new Date(y, m + 1, 0).getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export function CalendarPage() {
  const t = useApps();
  const { t: pt } = usePortal();
  const run = useRun();
  const confirm = useConfirm();
  const today = iso(new Date());
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [sel, setSel] = useState(today);
  const [data, setData] = useState<Data | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const days = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const load = useCallback(() => {
    calendar
      .range(iso(days[0]), iso(days[days.length - 1]))
      .then(setData)
      .catch(() => setData({ events: [], lessons: [], deadlines: [] }));
  }, [days]);
  useEffect(load, [load]);

  const byDay = useMemo(() => {
    const out: Record<string, { events: CalEvent[]; lessons: CalLesson[]; deadlines: CalDeadline[] }> = {};
    const get = (d: string) => (out[d] ||= { events: [], lessons: [], deadlines: [] });
    for (const e of data?.events || []) {
      for (let d = new Date(e.start + "T00:00"); iso(d) <= e.end; d.setDate(d.getDate() + 1)) get(iso(d)).events.push(e);
    }
    for (const l of data?.lessons || []) get(l.date).lessons.push(l);
    for (const x of data?.deadlines || []) get(x.date).deadlines.push(x);
    return out;
  }, [data]);
  const busy = (d: string) => {
    const x = byDay[d];
    return !!x && (x.lessons.length > 0 || x.deadlines.length > 0 || x.events.some((e) => e.kind !== "free"));
  };
  const inMonth = days.filter((d) => d.getMonth() === ym.m).map(iso);
  const busyN = inMonth.filter(busy).length;
  const move = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  const open = (d: string, e?: CalEvent) =>
    setEdit(e ? { ...e } : { title: "", kind: "task", start: d, end: d, time_from: "", time_to: "", note: "", done: false });
  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!edit) return;
    const { id, ...body } = edit;
    const r = await run(() => (id ? calendar.update(id, body) : calendar.add(body)));
    if (r) {
      setEdit(null);
      setSel(r.start);
      load();
    }
  };
  const day = byDay[sel] || { events: [], lessons: [], deadlines: [] };
  const selDate = new Date(sel + "T00:00");

  return (
    <div className="a-page cal">
      <PageHead
        title={pt.calendar}
        sub={t.cal_sub}
        actions={
          <Btn kind="primary" icon={<Plus size={16} />} onClick={() => open(sel)}>
            {t.add_event}
          </Btn>
        }
      />
      <div className="cal-grid-wrap">
        <section className="a-card cal-month">
          <header className="cal-bar">
            <div className="cal-nav">
              <button className="a-icon" onClick={() => move(-1)} aria-label="‹">
                <ChevronLeft size={18} />
              </button>
              <button className="a-icon" onClick={() => move(1)} aria-label="›">
                <ChevronRight size={18} />
              </button>
              <button
                className="a-btn sm"
                onClick={() => {
                  const d = new Date();
                  setYm({ y: d.getFullYear(), m: d.getMonth() });
                  setSel(today);
                }}
              >
                <span>{t.today}</span>
              </button>
            </div>
            <h2>
              {t.months[ym.m]} {ym.y}
            </h2>
            <div className="cal-sum">
              <span className="busy">
                {busyN} {t.busy_days}
              </span>
              <span className="free">
                {inMonth.length - busyN} {t.free_days}
              </span>
            </div>
          </header>
          {!data ? (
            <Spinner />
          ) : (
            <div className="cal-table" role="grid">
              {t.wd.map((w, i) => (
                <div key={w} className={`cal-wd ${i > 4 ? "we" : ""}`} role="columnheader">
                  {w}
                </div>
              ))}
              {days.map((d) => {
                const k = iso(d);
                const x = byDay[k];
                const out = d.getMonth() !== ym.m;
                const b = busy(k);
                return (
                  <button
                    key={k}
                    role="gridcell"
                    className={`cal-day ${out ? "out" : ""} ${k === today ? "today" : ""} ${k === sel ? "sel" : ""} ${b ? "busy" : "free"}`}
                    onClick={() => setSel(k)}
                    onDoubleClick={() => open(k)}
                  >
                    <span className="cal-num">{d.getDate()}</span>
                    {!b && !out && <span className="cal-free">{t.free}</span>}
                    <span className="cal-items">
                      {x && x.lessons.length > 0 && (
                        <i className="cal-pill lesson">
                          {x.lessons.length} {t.lessons_n}
                        </i>
                      )}
                      {x?.deadlines.slice(0, 1).map((dl) => (
                        <i key={dl.id} className="cal-pill deadline">
                          {dl.title}
                        </i>
                      ))}
                      {x?.events.slice(0, 2).map((e) => (
                        <i key={e.id} className={`cal-pill k-${e.kind} ${e.done ? "done" : ""}`}>
                          {e.time_from && <small>{e.time_from}</small>} {e.title}
                        </i>
                      ))}
                      {x && x.events.length + x.deadlines.length > 3 && <i className="cal-more">+{x.events.length + x.deadlines.length - 3}</i>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <footer className="cal-legend">
            {KINDS.map((k) => (
              <span key={k} className={`k-${k}`}>
                <i /> {kindLabel(k, t)}
              </span>
            ))}
            <span className="lesson">
              <i /> {t.lessons}
            </span>
            <span className="deadline">
              <i /> {t.deadlines}
            </span>
          </footer>
        </section>

        <aside className="a-card cal-agenda">
          <header>
            <div>
              <small>{t.day_agenda}</small>
              <h3>
                {selDate.getDate()} {t.months[selDate.getMonth()]} · {t.wd[(selDate.getDay() + 6) % 7]}
              </h3>
            </div>
            <button className="a-icon" onClick={() => open(sel)} title={t.add_event} aria-label={t.add_event}>
              <Plus size={18} />
            </button>
          </header>
          {!busy(sel) && day.events.length === 0 && (
            <div className="cal-nothing">
              <CalendarCheck2 size={26} />
              <p>{t.nothing}</p>
            </div>
          )}
          {day.lessons.length > 0 && (
            <div className="cal-sec">
              <h4>{t.lessons}</h4>
              {day.lessons.map((l, i) => (
                <div key={i} className="cal-row lesson">
                  <span className="cal-time">
                    {l.start}
                    <small>{l.end}</small>
                  </span>
                  <span className="cal-txt">
                    <b>{l.subject}</b>
                    <small>
                      {l.group}
                      {l.room && (
                        <>
                          {" "}
                          · <MapPin size={11} /> {l.room}
                        </>
                      )}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          )}
          {day.deadlines.length > 0 && (
            <div className="cal-sec">
              <h4>{t.deadlines}</h4>
              {day.deadlines.map((dl) => (
                <div key={dl.id} className="cal-row deadline">
                  <span className="cal-dot" />
                  <span className="cal-txt">
                    <b>{dl.title}</b>
                    <small>{dl.subject}</small>
                  </span>
                </div>
              ))}
            </div>
          )}
          {day.events.length > 0 && (
            <div className="cal-sec">
              <h4>{t.my_events}</h4>
              {day.events.map((e) => (
                <div key={e.id} className={`cal-row ev k-${e.kind} ${e.done ? "done" : ""}`}>
                  <input
                    type="checkbox"
                    checked={e.done}
                    title={t.done}
                    aria-label={t.done}
                    onChange={async () => {
                      await run(() => calendar.update(e.id, { ...e, done: !e.done }));
                      load();
                    }}
                  />
                  <span className="cal-txt">
                    <b>{e.title}</b>
                    <small>
                      <em className={`cal-kind k-${e.kind}`}>{kindLabel(e.kind, t)}</em>
                      <Clock size={11} /> {e.time_from ? `${e.time_from}${e.time_to ? `–${e.time_to}` : ""}` : t.all_day}
                      {e.start !== e.end && ` · ${e.start.slice(5)} → ${e.end.slice(5)}`}
                    </small>
                    {e.note && <p>{e.note}</p>}
                  </span>
                  <button className="a-icon" onClick={() => open(sel, e)} title={t.edit_event} aria-label={t.edit_event}>
                    <Pencil size={15} />
                  </button>
                  <button
                    className="a-icon danger"
                    title={t.delete_event_q}
                    aria-label={t.delete_event_q}
                    onClick={async () => {
                      if (await confirm(t.delete_event_q)) {
                        await run(() => calendar.remove(e.id));
                        load();
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? t.edit_event : t.new_event}
        footer={
          <>
            <Btn onClick={() => setEdit(null)}>{t.cancel}</Btn>
            <button className="a-btn primary" type="submit" form="cal-form">
              <span>{t.save}</span>
            </button>
          </>
        }
      >
        {edit && (
          <form id="cal-form" className="cal-form" onSubmit={save}>
            <Field label={t.event}>
              <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={200} autoFocus required />
            </Field>
            <div className="a-field">
              <span className="a-label">{t.kind}</span>
              <div className="cal-kinds">
                {KINDS.map((k) => (
                  <button type="button" key={k} className={`k-${k} ${edit.kind === k ? "on" : ""}`} onClick={() => setEdit({ ...edit, kind: k })}>
                    <i /> {kindLabel(k, t)}
                  </button>
                ))}
              </div>
            </div>
            <div className="a-grid2">
              <Field label={t.start}>
                <Input type="date" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value, end: edit.end < e.target.value ? e.target.value : edit.end })} required />
              </Field>
              <Field label={t.end}>
                <Input type="date" value={edit.end} min={edit.start} onChange={(e) => setEdit({ ...edit, end: e.target.value })} />
              </Field>
              <Field label={t.time_from}>
                <Input type="time" value={edit.time_from} onChange={(e) => setEdit({ ...edit, time_from: e.target.value })} />
              </Field>
              <Field label={t.time_to}>
                <Input type="time" value={edit.time_to} onChange={(e) => setEdit({ ...edit, time_to: e.target.value })} />
              </Field>
            </div>
            <Field label={t.note}>
              <Textarea value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} rows={3} maxLength={2000} />
            </Field>
            {edit.id && <Toggle checked={edit.done} onChange={(v) => setEdit({ ...edit, done: v })} label={t.done} />}
            {edit.id && (
              <button
                type="button"
                className="a-btn danger sm cal-del"
                onClick={async () => {
                  if (edit.id && (await confirm(t.delete_event_q))) {
                    await run(() => calendar.remove(edit.id as string));
                    setEdit(null);
                    load();
                  }
                }}
              >
                <Trash2 size={14} />
                <span>{t.delete}</span>
              </button>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
