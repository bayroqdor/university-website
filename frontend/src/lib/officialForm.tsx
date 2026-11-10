/* Davlat shaklidagi dars jadvali (O'zbekiston OTMlarida qabul qilingan ko'rinish):
   o'ng yuqorida «TASDIQLAYMAN» bloki, markazda institut nomi va «DARS JADVALI» sarlavhasi,
   chap ustunda vertikal yozilgan hafta kunlari, juftlik raqami va vaqti, ustunlarda guruhlar,
   pastda imzo qatorlari. Toq/juft hafta darslari bitta katakda ikkiga bo'linadi; bir xil qo'shma
   ma'ruza yonma-yon guruhlarda birlashtiriladi. Tahrirlash rejimida darslarni sudrab ko'chirish mumkin. */
import "../styles/official-form.css";
import { Fragment, useMemo, type DragEvent, type ReactNode } from "react";
import type { Lesson, OfficialForm } from "./api";

export interface FormLabels {
  approve: string;
  title: string;
  day: string;
  pair: string;
  time: string;
  odd: string;
  even: string;
  course: string;
  students: string;
  forSemester: string;
  teacherOf: string;
  date: string;
  year: string;
  legend: string;
  empty: string;
  types: Record<string, string>;
  typeShort: Record<string, string>;
  group: string;
  noLessons: string;
  statGroups: string;
  statLessons: string;
  statTeachers: string;
  slots: string;
}

export const FORM_LABELS_UZ: FormLabels = {
  approve: "TASDIQLAYMAN",
  title: "DARS JADVALI",
  day: "Kun",
  pair: "№",
  time: "Vaqti",
  odd: "toq hafta",
  even: "juft hafta",
  course: "kurs",
  students: "talabalarining",
  forSemester: "uchun",
  teacherOf: "o‘qituvchisining",
  date: "«____» ______________",
  year: "yil",
  legend: "Belgilar",
  empty: "Bu semestr uchun jadval hali tuzilmagan",
  types: {
    lecture: "ma’ruza",
    practice: "amaliy",
    lab: "laboratoriya",
    seminar: "seminar",
    exam: "imtihon",
    consult: "konsultatsiya",
    other: "mashg‘ulot",
  },
  typeShort: {
    lecture: "m",
    practice: "a",
    lab: "l",
    seminar: "s",
    exam: "imt",
    consult: "k",
    other: "",
  },
  group: "Guruh",
  noLessons: "Dars yo‘q",
  statGroups: "guruh",
  statLessons: "dars",
  statTeachers: "o‘qituvchi",
  slots: "Juftliklar",
};

export type DragInfo = {
  lesson: Lesson;
  /** "wd:slotId" → to'qnashuvlar (bo'sh massiv — bo'sh katak) */
  cells: Record<
    string,
    {
      kind: string;
      group_name: string;
      subject: string;
      teacher: string | null;
    }[]
  > | null;
};

const sig = (ls: Lesson[]) =>
  ls
    .map(
      (l) =>
        `${l.subject_id}|${l.teacher_id}|${l.room_id}|${l.type}|${l.parity}`,
    )
    .sort()
    .join(";");

function Chip({
  l,
  L,
  editable,
  onClick,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  l: Lesson;
  L: FormLabels;
  editable?: boolean;
  onClick?: (l: Lesson) => void;
  onDragStart?: (l: Lesson) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
}) {
  return (
    <div
      className={`ofs-chip t-${l.type} ${editable ? "editable" : ""} ${dragging ? "dragging" : ""}`}
      draggable={editable}
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", l.id);
        onDragStart?.(l);
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={() => onClick?.(l)}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={`${l.subject} (${L.types[l.type] || l.type}) · ${l.teacher || "—"} · ${l.room || "—"}`}
    >
      <b>
        {l.subject}
        {L.typeShort[l.type] ? <em> ({L.typeShort[l.type]})</em> : null}
      </b>
      <span className="ofs-chip-meta">
        {l.teacher && <span>{l.teacher}</span>}
        {l.room && <span className="ofs-room">{l.room}</span>}
      </span>
    </div>
  );
}

export function OfficialFormView({
  form,
  L = FORM_LABELS_UZ,
  weekdays,
  subtitle,
  editable = false,
  drag = null,
  onLessonClick,
  onEmptyClick,
  onDragStartLesson,
  onDragEnd,
  onDrop,
  toolbar,
  layout = "groups",
  today = false,
}: {
  form: OfficialForm;
  L?: FormLabels;
  weekdays?: string[];
  subtitle?: ReactNode;
  editable?: boolean;
  drag?: DragInfo | null;
  onLessonClick?: (l: Lesson) => void;
  onEmptyClick?: (groupId: string, weekday: number, slotId: string) => void;
  onDragStartLesson?: (l: Lesson) => void;
  onDragEnd?: () => void;
  onDrop?: (l: Lesson, weekday: number, slotId: string) => void;
  toolbar?: ReactNode;
  /** groups — ustunlarda guruhlar (davlat shakli, tahrirlash); days — ustunlarda hafta kunlari, qatorlarda guruhlar (ko'p guruhni bir varaqqa sig'dirish) */
  layout?: "groups" | "days";
  /** bugungi kun va joriy juftlikni ajratib ko'rsatish (kabinet) */
  today?: boolean;
}) {
  const slots = useMemo(
    () => [...form.slots].sort((a, b) => a.idx - b.idx),
    [form.slots],
  );
  const days = (weekdays || form.weekdays).slice(0, 6);
  const byCell = useMemo(() => {
    const m = new Map<string, Lesson[]>();
    for (const l of form.lessons) {
      const k = `${l.group_id}:${l.weekday}:${l.slot_id}`;
      m.set(k, [...(m.get(k) || []), l]);
    }
    return m;
  }, [form.lessons]);
  // bo'sh kunlarni (barcha guruhlarda dars yo'q) — tahrirlashdan tashqari — qisqartirmaymiz: rasmiy shaklda barcha ish kunlari ko'rsatiladi
  const s = form.settings;
  const groups = form.groups;
  const facultyNames = [
    ...new Set(
      groups
        .map((g) => (g.faculty_id ? form.faculties[g.faculty_id] : ""))
        .filter(Boolean),
    ),
  ];
  const courses = [
    ...new Set(groups.map((g) => g.course).filter(Boolean)),
  ].sort();
  const year = (form.semester.start || "").slice(0, 4);
  const todayWd = today ? (new Date().getDay() + 6) % 7 : -1;
  const hm = new Date().toTimeString().slice(0, 5);
  const nowSlot = today
    ? slots.find((x) => x.start <= hm && hm <= x.end)?.id
    : undefined;
  const busyDay = (wd: number) => form.lessons.some((l) => l.weekday === wd);
  const teachersN = new Set(
    form.lessons.map((l) => l.teacher_id).filter(Boolean),
  ).size;
  const parTag = (l: Lesson) =>
    l.parity === "odd"
      ? ` · ${L.odd}`
      : l.parity === "even"
        ? ` · ${L.even}`
        : "";

  const renderCell = (gid: string, wd: number, slotId: string, span = 1) => {
    const ls = byCell.get(`${gid}:${wd}:${slotId}`) || [];
    const key = `${wd}:${slotId}`;
    let cls = "ofs-cell";
    let tip = "";
    if (drag) {
      if (drag.lesson.group_id !== gid) cls += " drop-na";
      else if (drag.lesson.weekday === wd && drag.lesson.slot_id === slotId)
        cls += " drop-origin";
      else if (!drag.cells) cls += " drop-wait";
      else {
        const c = drag.cells[key] || [];
        cls += c.length ? " drop-bad" : " drop-ok";
        tip = c
          .map(
            (x) =>
              `${x.kind === "teacher" ? "O‘qituvchi band" : x.kind === "room" ? "Auditoriya band" : "Guruh band"}: ${x.group_name} — ${x.subject}${x.teacher ? ` (${x.teacher})` : ""}`,
          )
          .join("\n");
      }
    }
    const ok = drag && cls.includes("drop-ok");
    const odd = ls.filter((l) => l.parity === "odd");
    const even = ls.filter((l) => l.parity === "even");
    const all = ls.filter((l) => l.parity === "all");
    const chip = (l: Lesson) => (
      <Chip
        key={l.id}
        l={l}
        L={L}
        editable={editable}
        onClick={onLessonClick}
        onDragStart={onDragStartLesson}
        onDragEnd={onDragEnd}
        dragging={drag?.lesson.id === l.id}
      />
    );
    return (
      <td
        key={gid}
        colSpan={span}
        className={cls}
        title={tip || undefined}
        onDragOver={(e) => {
          if (ok) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (drag && ok) onDrop?.(drag.lesson, wd, slotId);
        }}
        onClick={(e) => {
          if (
            editable &&
            !drag &&
            ls.length === 0 &&
            e.target === e.currentTarget
          )
            onEmptyClick?.(gid, wd, slotId);
        }}
      >
        {odd.length || even.length ? (
          <div className="ofs-split">
            <div className="ofs-half">
              <span className="ofs-par">{L.odd}</span>
              {[...all, ...odd].map(chip)}
            </div>
            <div className="ofs-half">
              <span className="ofs-par">{L.even}</span>
              {even.map(chip)}
            </div>
          </div>
        ) : (
          all.map(chip)
        )}
        {editable && !drag && ls.length === 0 && (
          <button
            className="ofs-add"
            onClick={() => onEmptyClick?.(gid, wd, slotId)}
            aria-label="+"
          >
            +
          </button>
        )}
        {drag && cls.includes("drop-bad") && (
          <span className="ofs-lock" aria-hidden>
            ✕
          </span>
        )}
      </td>
    );
  };

  return (
    <div className="ofs-sheet">
      {toolbar && <div className="ofs-toolbar no-print">{toolbar}</div>}
      <header className="ofs-head">
        <div className="ofs-uni">
          {form.uni.logo && <img src={form.uni.logo} alt="" />}
          <span>{form.uni.name}</span>
        </div>
        <div className="ofs-approve">
          <b>{L.approve}</b>
          <span>{s.approver_title}</span>
          <span className="ofs-sign">
            <i />
            {s.approver_name}
          </span>
          <span>
            {L.date} {year} {L.year}
          </span>
        </div>
      </header>
      <div className="ofs-title">
        <p>
          {form.semester.name} {L.forSemester}
          {form.title ? (
            <>
              {" "}
              <b>{form.title}</b> {L.teacherOf}
            </>
          ) : (
            <>
              {facultyNames.length ? ` ${facultyNames.join(", ")}` : ""}
              {courses.length ? ` ${courses.join(", ")}-${L.course}` : ""}{" "}
              {L.students}
            </>
          )}
        </p>
        <h2>{L.title}</h2>
        <div className="ofs-stats">
          <span>
            <b>{groups.length}</b> {L.statGroups}
          </span>
          <span>
            <b>{form.lessons.length}</b> {L.statLessons}
          </span>
          <span>
            <b>{teachersN}</b> {L.statTeachers}
          </span>
        </div>
        {subtitle && <div className="ofs-subtitle">{subtitle}</div>}
      </div>
      {groups.length === 0 ? (
        <p className="ofs-empty">{L.empty}</p>
      ) : layout === "days" ? (
        <div className="ofs-scroll">
          <p className="ofs-slots">
            <b>{L.slots}:</b>
            {slots.map((x) => (
              <span key={x.id}>
                <i>{x.idx}</i> {x.start}–{x.end}
              </span>
            ))}
          </p>
          <table className="ofs ofs-days">
            <thead>
              <tr>
                <th className="ofs-gcol">{L.group}</th>
                {days.map((d, wd) => (
                  <th key={wd} className={wd === todayWd ? "today" : ""}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <th className="ofs-gcol">
                    <b>{g.name}</b>
                    <small>
                      {g.course ? `${g.course}-${L.course}` : ""}
                      {g.lang ? ` · ${g.lang}` : ""}
                    </small>
                  </th>
                  {days.map((_, wd) => {
                    const ls = form.lessons
                      .filter((l) => l.group_id === g.id && l.weekday === wd)
                      .sort(
                        (a, b) =>
                          a.slot_idx - b.slot_idx ||
                          a.parity.localeCompare(b.parity),
                      );
                    return (
                      <td
                        key={wd}
                        className={`ofs-dcell ${wd === todayWd ? "today" : ""}`}
                      >
                        {ls.length === 0 ? (
                          <span className="ofs-none">—</span>
                        ) : (
                          ls.map((l) => (
                            <div
                              key={l.id}
                              className={`ofs-dl t-${l.type} ${wd === todayWd && l.slot_id === nowSlot ? "now" : ""}`}
                              onClick={() => onLessonClick?.(l)}
                              title={`${l.slot_start}–${l.slot_end}`}
                            >
                              <i>{l.slot_idx}</i>
                              <span>
                                <b>
                                  {l.subject}
                                  {L.typeShort[l.type] ? (
                                    <em> ({L.typeShort[l.type]})</em>
                                  ) : null}
                                </b>
                                <small>
                                  {[l.room, l.teacher]
                                    .filter(Boolean)
                                    .join(" · ")}
                                  {parTag(l)}
                                </small>
                              </span>
                            </div>
                          ))
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ofs-scroll">
          <table className={`ofs ${groups.length > 6 ? "dense" : ""}`}>
            <thead>
              <tr>
                <th className="ofs-day-h">{L.day}</th>
                <th className="ofs-n">{L.pair}</th>
                <th className="ofs-time">{L.time}</th>
                {groups.map((g) => (
                  <th key={g.id} className="ofs-group">
                    <b>{g.name}</b>
                    {g.lang && <small>{g.lang}</small>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((dayName, wd) =>
                !editable && !busyDay(wd) ? (
                  <tr
                    key={wd}
                    className={`day-start day-off ${wd === todayWd ? "today" : ""}`}
                  >
                    <th className="ofs-day">
                      <span>{dayName}</span>
                    </th>
                    <td colSpan={2 + groups.length} className="ofs-off">
                      {L.noLessons}
                    </td>
                  </tr>
                ) : (
                  <Fragment key={wd}>
                    {slots.map((sl, si) => {
                      // qo'shma darslar: yonma-yon guruhlardagi bir xil dars birlashtiriladi (tahrirlashda emas)
                      const cells: ReactNode[] = [];
                      for (let gi = 0; gi < groups.length; gi++) {
                        const g = groups[gi];
                        const here = byCell.get(`${g.id}:${wd}:${sl.id}`) || [];
                        let span = 1;
                        if (!editable && here.length) {
                          const sg = sig(here);
                          while (
                            gi + span < groups.length &&
                            sig(
                              byCell.get(
                                `${groups[gi + span].id}:${wd}:${sl.id}`,
                              ) || [],
                            ) === sg
                          )
                            span++;
                        }
                        cells.push(renderCell(g.id, wd, sl.id, span));
                        gi += span - 1;
                      }
                      return (
                        <tr
                          key={sl.id}
                          className={`${si === 0 ? "day-start" : ""} ${wd === todayWd ? "today" : ""} ${wd === todayWd && sl.id === nowSlot ? "now" : ""}`}
                        >
                          {si === 0 && (
                            <th rowSpan={slots.length} className="ofs-day">
                              <span>{dayName}</span>
                            </th>
                          )}
                          <td className="ofs-n">{sl.idx}</td>
                          <td className="ofs-time">
                            {sl.start}
                            <br />
                            {sl.end}
                          </td>
                          {cells}
                        </tr>
                      );
                    })}
                  </Fragment>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      <footer className="ofs-foot">
        <div className="ofs-legend">
          <b>{L.legend}:</b>
          {Object.entries(L.typeShort)
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <span key={k} className={`t-${k}`}>
                ({v}) — {L.types[k]}
              </span>
            ))}
        </div>
        <div className="ofs-signs">
          {s.dean_name || s.dean_title ? (
            <span>
              {s.dean_title}
              <i />
              {s.dean_name}
            </span>
          ) : null}
          <span>
            {s.head_title}
            <i />
            {s.head_name}
          </span>
        </div>
        {s.note && <p className="ofs-note">{s.note}</p>}
      </footer>
    </div>
  );
}

/** Faqat jadvalni chop etish (sahifaning qolgan qismi yashiriladi, A4 albom) */
export function printForm() {
  document.body.classList.add("printing-form");
  const done = () => {
    document.body.classList.remove("printing-form");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  window.setTimeout(done, 2000);
}

export const FORM_LABELS: Record<string, FormLabels> = {
  uz: FORM_LABELS_UZ,
  ru: {
    ...FORM_LABELS_UZ,
    approve: "УТВЕРЖДАЮ",
    title: "РАСПИСАНИЕ ЗАНЯТИЙ",
    day: "День",
    time: "Время",
    odd: "нечётная неделя",
    even: "чётная неделя",
    course: "курс",
    students: "студентов",
    forSemester: "—",
    teacherOf: "преподавателя",
    year: "г.",
    legend: "Обозначения",
    empty: "Расписание на этот семестр ещё не составлено",
    types: {
      lecture: "лекция",
      practice: "практика",
      lab: "лабораторная",
      seminar: "семинар",
      exam: "экзамен",
      consult: "консультация",
      other: "занятие",
    },
    typeShort: {
      lecture: "л",
      practice: "пр",
      lab: "лаб",
      seminar: "сем",
      exam: "экз",
      consult: "конс",
      other: "",
    },
    group: "Группа",
    noLessons: "Нет занятий",
    statGroups: "групп",
    statLessons: "занятий",
    statTeachers: "преподавателей",
    slots: "Пары",
  },
  en: {
    ...FORM_LABELS_UZ,
    approve: "APPROVED",
    title: "TIMETABLE",
    day: "Day",
    time: "Time",
    odd: "odd week",
    even: "even week",
    course: "year",
    students: "students",
    forSemester: "—",
    teacherOf: "— lecturer",
    year: "",
    legend: "Legend",
    empty: "No timetable for this semester yet",
    types: {
      lecture: "lecture",
      practice: "practice",
      lab: "lab",
      seminar: "seminar",
      exam: "exam",
      consult: "consultation",
      other: "class",
    },
    typeShort: {
      lecture: "L",
      practice: "P",
      lab: "Lab",
      seminar: "S",
      exam: "Ex",
      consult: "C",
      other: "",
    },
    group: "Group",
    noLessons: "No classes",
    statGroups: "groups",
    statLessons: "classes",
    statTeachers: "lecturers",
    slots: "Periods",
  },
};
