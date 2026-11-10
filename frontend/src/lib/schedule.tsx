// Haftalik dars jadvali ko'rinishi (ochiq sahifa, talaba va o'qituvchi kabinetlari uchun umumiy)
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Lesson, WeekSchedule } from "./api";
import "../styles/schedule.css";

/** Jadval uchun kerakli matnlar (sayt va kabinet lug'atlari ikkalasi ham mos keladi) */
export interface SchedDict {
  weekdays: string[];
  lesson_types: Record<string, string>;
  no_lessons: string;
  room: string;
  week_odd: string;
  week_even: string;
  cancelled: string;
  moved: string;
  week: string;
  prev: string;
  next: string;
  date: string;
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function shiftWeek(week: string, n: number): string {
  return addDays(week, n * 7);
}

export function mondayOf(d = new Date()): string {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return isoDate(x);
}

function dm(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

export function WeekNav({ week, onChange, data, t }: { week: string; onChange: (w: string) => void; data: WeekSchedule | null; t: SchedDict }) {
  return (
    <div className="sch-nav">
      <button className="sch-nav-btn" onClick={() => onChange(shiftWeek(week, -1))} aria-label={t.prev}>
        <ChevronLeft size={18} />
      </button>
      <div className="sch-nav-title">
        <b>
          {dm(week)} – {dm(addDays(week, 6))}
        </b>
        {data && (
          <small>
            {t.week} {data.week_number} · {data.parity === "odd" ? t.week_odd : t.week_even}
          </small>
        )}
      </div>
      <button className="sch-nav-btn" onClick={() => onChange(shiftWeek(week, 1))} aria-label={t.next}>
        <ChevronRight size={18} />
      </button>
      <button className="sch-nav-today" onClick={() => onChange(mondayOf())}>
        {t.date}: {dm(isoDate(new Date()))}
      </button>
    </div>
  );
}

export function LessonCard({ l, t, showGroup, showTeacher, onClick }: { l: Lesson; t: SchedDict; showGroup?: boolean; showTeacher?: boolean; onClick?: () => void }) {
  const ch = l.change;
  const cancelled = ch?.kind === "cancel";
  const Comp = onClick ? "button" : "div";
  return (
    <Comp className={`sch-lesson type-${l.type} ${cancelled ? "cancelled" : ""} ${ch && !cancelled ? "changed" : ""}`} onClick={onClick} type={onClick ? "button" : undefined}>
      <div className="sch-time">
        <b>{l.slot_idx}</b>
        <span>
          {l.slot_start}–{l.slot_end}
        </span>
      </div>
      <div className="sch-body">
        <span className="sch-type">{t.lesson_types[l.type] || l.type}</span>
        <b className="sch-subject">{l.subject}</b>
        <small className="sch-meta">
          {showGroup && l.group_name && <span>{l.group_name}</span>}
          {showTeacher && l.teacher && <span>{l.teacher}</span>}
          {l.room && (
            <span>
              {t.room} {l.room}
            </span>
          )}
          {l.parity !== "all" && <span>{l.parity === "odd" ? t.week_odd : t.week_even}</span>}
        </small>
        {ch && (
          <small className="sch-change">
            {cancelled ? t.cancelled : t.moved}
            {ch.note ? `: ${ch.note}` : ""}
          </small>
        )}
      </div>
    </Comp>
  );
}

export function WeekView({ data, t, showGroup, showTeacher, onLesson, days = 6 }: { data: WeekSchedule; t: SchedDict; showGroup?: boolean; showTeacher?: boolean; onLesson?: (l: Lesson) => void; days?: number }) {
  const today = isoDate(new Date());
  const shown = data.days.slice(0, days);
  return (
    <div className="sch-week" style={{ ["--cols" as string]: shown.length }}>
      {shown.map((d) => (
        <div key={d.date} className={`sch-day ${d.date === today ? "today" : ""} ${d.off ? "off" : ""}`}>
          <div className="sch-day-head">
            <b>{t.weekdays[d.weekday]}</b>
            <span>{dm(d.date)}</span>
          </div>
          {d.lessons.length === 0 ? (
            <div className="sch-empty">{t.no_lessons}</div>
          ) : (
            d.lessons.map((l) => <LessonCard key={l.id + d.date} l={l} t={t} showGroup={showGroup} showTeacher={showTeacher} onClick={onLesson ? () => onLesson(l) : undefined} />)
          )}
        </div>
      ))}
    </div>
  );
}
