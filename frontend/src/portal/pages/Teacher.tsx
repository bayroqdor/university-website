// O'qituvchi kabineti sahifalari: guruhlar, davomat, jurnal, topshiriqlar, materiallar, bildirishnomalar
import { BookOpen, CheckCheck, ClipboardCheck, Paperclip, Plus, RefreshCw, Save, Send, Trash2, Upload, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Lesson } from "../../lib/api";
import { isoDate, LessonCard, mondayOf, WeekNav } from "../../lib/schedule";
import { Btn, Card, Empty, Field, Input, Modal, PageHead, Pill, Select, Spinner, Textarea, Toggle, fmtDateTime, fmtNum, useConfirm, useRun, useToast } from "../../admin/ui";
import { portal, teacher, type Assignment, type Attachment, type Course, type Grade, type Material, type Notice, type StudentRow, type Today } from "../api";
import { usePortal } from "../PortalApp";
import { Avatar } from "../../lib/Avatar";
import { NoticeList } from "./Common";

const ATT = ["present", "absent", "late", "excused"] as const;

/** O'qituvchining fanlari (guruh + fan); yuklanayotganda null */
function useCourseList(): Course[] | null {
  const { me } = usePortal();
  const [items, setItems] = useState<Course[] | null>(me.courses || null);
  useEffect(() => {
    if (!items) teacher.courses().then((r) => setItems(r.items)).catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return items;
}

function useCourses() {
  return useCourseList() || [];
}

function uniqGroups(courses: Course[]) {
  const m = new Map<string, Course>();
  courses.forEach((c) => !m.has(c.group_id) && m.set(c.group_id, c));
  return [...m.values()];
}

export function TeacherDashboard() {
  const { t, user } = usePortal();
  const [d, setD] = useState<Today | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    portal.today().then(setD).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);
  if (failed)
    return (
      <div className="a-page">
        <Card>
          <Empty title={t.load_failed}>
            <Btn icon={<RefreshCw size={15} />} onClick={load}>
              {t.retry}
            </Btn>
          </Empty>
        </Card>
      </div>
    );
  if (!d) return <Spinner />;
  return (
    <div className="a-page">
      <div className="p-hero">
        <div>
          <h1>
            {t.hello}, {user.name}!
          </h1>
          <p>
            {t.today}: {d.date} · {t.weekdays[d.weekday]}
            {d.week ? ` · ${d.week.number}-${t.week} (${d.week.parity === "odd" ? t.odd : t.even})` : ""}
          </p>
        </div>
        <div className="p-hero-meta">
          {user.data?.position && <span>{user.data.position}</span>}
          {d.semester && <span>{d.semester.name}</span>}
        </div>
      </div>
      <div className="kpis three">
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-ic">
              <Users size={17} />
            </span>
          </div>
          <div className="kpi-v">{d.groups || 0}</div>
          <div className="kpi-l">{t.groups}</div>
          <div className="kpi-sub">
            {d.students || 0} {t.students.toLowerCase()}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-ic">
              <ClipboardCheck size={17} />
            </span>
          </div>
          <div className="kpi-v">{(d.courses || []).reduce((s, c) => s + c.lessons_per_week, 0)}</div>
          <div className="kpi-l">{t.stats_week}</div>
          <div className="kpi-sub">
            {(d.courses || []).length} {t.courses.toLowerCase()}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-ic">
              <BookOpen size={17} />
            </span>
          </div>
          <div className="kpi-v">{d.to_grade || 0}</div>
          <div className="kpi-l">{t.to_grade}</div>
          <div className="kpi-sub">
            <Link to="/teacher/assignments">{t.assignments} →</Link>
          </div>
        </div>
      </div>
      <div className="p-grid">
        <Card title={t.today_lessons} className="span2" actions={<Link className="a-btn sm" to="/teacher/attendance"><ClipboardCheck size={14} /> {t.mark_attendance}</Link>}>
          {d.lessons.length === 0 ? (
            <Empty title={t.no_lessons_today} />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {d.lessons.map((l) => (
                <LessonCard key={l.id} l={l} t={t} showGroup />
              ))}
            </div>
          )}
        </Card>
        <Card title={t.notices} pad={false}>
          <NoticeList items={d.notices} />
        </Card>
        <Card title={t.courses} className="span2" pad={false}>
          <div className="a-table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  <th>{t.group}</th>
                  <th>{t.subject}</th>
                  <th className="n">{t.students}</th>
                  <th className="n">{t.lessons_per_week}</th>
                </tr>
              </thead>
              <tbody>
                {(d.courses || []).map((c) => (
                  <tr key={c.group_id + c.subject_id}>
                    <td>
                      <b>{c.group_name}</b> <small className="muted">{c.course}-kurs</small>
                    </td>
                    <td>{c.subject}</td>
                    <td className="n">{c.students}</td>
                    <td className="n">{c.lessons_per_week}</td>
                  </tr>
                ))}
                {(d.courses || []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      {t.no_data}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function TeacherCourses() {
  const { t } = usePortal();
  const courses = useCourses();
  const groups = uniqGroups(courses);
  const [gid, setGid] = useState("");
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  useEffect(() => {
    if (!gid && groups.length) setGid(groups[0].group_id);
  }, [groups, gid]);
  useEffect(() => {
    if (!gid) return;
    setStudents(null);
    teacher.students(gid).then((r) => setStudents(r.items)).catch(() => setStudents([]));
  }, [gid]);
  const g = groups.find((x) => x.group_id === gid);
  return (
    <div className="a-page">
      <PageHead title={t.courses} sub={`${groups.length} ${t.groups.toLowerCase()} · ${courses.length} ${t.subjects.toLowerCase()}`} />
      <div className="p-courses">
        {groups.map((c) => (
          <button key={c.group_id} className={`p-course ${gid === c.group_id ? "on" : ""}`} onClick={() => setGid(c.group_id)}>
            <b>{c.group_name}</b>
            <small>
              {c.course}-kurs · {c.students} {t.students.toLowerCase()}
            </small>
            <small>{courses.filter((x) => x.group_id === c.group_id).map((x) => x.subject).join(", ")}</small>
          </button>
        ))}
      </div>
      {g && (
        <Card title={`${g.group_name} — ${t.students}`} pad={false}>
          {!students ? (
            <Spinner />
          ) : (
            <div className="a-table-scroll">
              <table className="a-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t.student}</th>
                    <th>{t.student_no}</th>
                    <th>{t.email}</th>
                    <th>{t.phone}</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id}>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <span className="u-cell"><Avatar name={s.name} photo={(s as { data?: Record<string, string> }).data?.photo} size={30} /><b>{s.name}</b></span>
                      </td>
                      <td className="mono">{s.data?.student_no || "—"}</td>
                      <td>{s.email || "—"}</td>
                      <td>{s.data?.phone || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ davomat */
export function TeacherAttendance() {
  const { t } = usePortal();
  const run = useRun();
  const [week, setWeek] = useState(mondayOf());
  const [wk, setWk] = useState<Awaited<ReturnType<typeof portal.schedule>> | null>(null);
  const [sel, setSel] = useState<Lesson | null>(null);
  const [date, setDate] = useState(isoDate(new Date()));
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [marks, setMarks] = useState<Record<string, { status: string; note: string }>>({});
  const [dates, setDates] = useState<string[]>([]);
  const [wkFailed, setWkFailed] = useState(false);
  const [wkTry, setWkTry] = useState(0);
  const [rowsFailed, setRowsFailed] = useState(false);
  useEffect(() => {
    setWk(null);
    setWkFailed(false);
    portal.schedule(week).then(setWk).catch(() => setWkFailed(true));
  }, [week, wkTry]);
  const load = useCallback((l: Lesson, d: string) => {
    setRows(null);
    setRowsFailed(false);
    teacher.attendance(l.id, d).catch(() => { setRowsFailed(true); return null; }).then((r) => {
      if (!r) return;
      setRows(r.students);
      setDates(r.dates);
      const m: Record<string, { status: string; note: string }> = {};
      r.students.forEach((s) => (m[s.id] = { status: s.mark?.status || "present", note: s.mark?.note || "" }));
      setMarks(m);
    });
  }, []);
  const pick = (l: Lesson) => {
    setSel(l);
    const d = l.date || isoDate(new Date());
    setDate(d);
    load(l, d);
  };
  const save = async () => {
    if (!sel) return;
    const r = await run(() => teacher.setAttendance(sel.id, date, Object.entries(marks).map(([student_id, m]) => ({ student_id, ...m }))), t.attendance_saved);
    if (r) load(sel, date);
  };
  return (
    <div className="a-page">
      <PageHead title={t.attendance} sub={t.select_lesson} />
      <WeekNav week={week} onChange={setWeek} data={wk} t={t} />
      {wkFailed ? (
        <Card>
          <Empty title={t.load_failed}>
            <Btn icon={<RefreshCw size={15} />} onClick={() => setWkTry((n) => n + 1)}>
              {t.retry}
            </Btn>
          </Empty>
        </Card>
      ) : !wk ? (
        <Spinner />
      ) : (
        <div className="sch-week" style={{ ["--cols" as string]: 6 }}>
          {wk.days.slice(0, 6).map((d) => (
            <div key={d.date} className={`sch-day ${d.date === isoDate(new Date()) ? "today" : ""}`}>
              <div className="sch-day-head">
                <b>{t.weekdays_short[d.weekday]}</b>
                <span>{d.date.slice(8, 10) + "." + d.date.slice(5, 7)}</span>
              </div>
              {d.lessons.length === 0 ? <div className="sch-empty">{t.no_lessons}</div> : d.lessons.map((l) => <LessonCard key={l.id + d.date} l={{ ...l, date: d.date }} t={t} showGroup onClick={() => pick({ ...l, date: d.date })} />)}
            </div>
          ))}
        </div>
      )}
      {sel && (
        <Card
          title={`${sel.subject} — ${sel.group_name}`}
          sub={`${t.weekdays[sel.weekday]} · ${sel.slot_start}–${sel.slot_end} · ${t.lesson_types[sel.type] || sel.type}`}
          actions={
            <>
              <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); load(sel, e.target.value); }} style={{ width: 160 }} />
              <Btn size="sm" icon={<CheckCheck size={14} />} onClick={() => setMarks(Object.fromEntries(Object.keys(marks).map((k) => [k, { ...marks[k], status: "present" }])))}>
                {t.all_present}
              </Btn>
              <Btn kind="primary" size="sm" icon={<Save size={14} />} onClick={save} disabled={!rows}>
                {t.save}
              </Btn>
            </>
          }
          pad={false}
        >
          {rowsFailed ? (
            <Empty title={t.load_failed}>
              <Btn icon={<RefreshCw size={15} />} onClick={() => load(sel, date)}>
                {t.retry}
              </Btn>
            </Empty>
          ) : !rows ? (
            <Spinner />
          ) : (
            <div className="a-table-scroll">
              <table className="a-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t.student}</th>
                    <th>{t.attendance}</th>
                    <th>{t.comment}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => (
                    <tr key={s.id}>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <span className="u-cell"><Avatar name={s.name} photo={(s as { data?: Record<string, string> }).data?.photo} size={30} /><b>{s.name}</b></span>
                      </td>
                      <td>
                        <span className="att-pick">
                          {ATT.map((a) => (
                            <button key={a} className={`${a} ${marks[s.id]?.status === a ? "on" : ""}`} onClick={() => setMarks({ ...marks, [s.id]: { ...marks[s.id], status: a } })} title={t[a]}>
                              {t[a].slice(0, 3)}
                            </button>
                          ))}
                        </span>
                      </td>
                      <td>
                        <Input value={marks[s.id]?.note || ""} onChange={(e) => setMarks({ ...marks, [s.id]: { ...marks[s.id], note: e.target.value } })} placeholder="…" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {dates.length > 0 && (
            <p className="a-hint" style={{ padding: "10px 14px" }}>
              {t.marked_dates}: {dates.slice(0, 12).map((d) => (
                <button key={d} className="a-btn ghost sm" onClick={() => { setDate(d); load(sel, d); }}>
                  {d}
                </button>
              ))}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ jurnal */
export function TeacherJournal() {
  const { t, me } = usePortal();
  const run = useRun();
  const confirm = useConfirm();
  const list = useCourseList();
  const courses = list || [];
  const [key, setKey] = useState("");
  const [d, setD] = useState<Awaited<ReturnType<typeof teacher.journal>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [col, setCol] = useState<{ kind: string; title: string; max: number; date: string; marks: Record<string, string> } | null>(null);
  const [edit, setEdit] = useState<Grade | null>(null);
  useEffect(() => {
    if (!key && courses.length) setKey(`${courses[0].group_id}|${courses[0].subject_id}`);
  }, [courses, key]);
  const [gid, sid] = key.split("|");
  const load = useCallback(() => {
    if (!gid || !sid) return;
    setD(null);
    setFailed(false);
    // xato bo'lsa ham aylanib qolmaydi — sabab va «Qayta urinish» ko'rsatiladi
    teacher.journal(gid, sid).then(setD).catch(() => setFailed(true));
  }, [gid, sid]);
  useEffect(load, [load]);
  const columns = useMemo(() => {
    if (!d) return [];
    const m = new Map<string, { kind: string; title: string; date: string; max: number }>();
    d.students.forEach((s) => (s.grades || []).forEach((g) => m.set(`${g.kind}|${g.title}|${g.date}`, { kind: g.kind, title: g.title, date: g.date, max: g.max })));
    return [...m.entries()].sort((a, b) => a[1].date.localeCompare(b[1].date));
  }, [d]);
  return (
    <div className="a-page">
      <PageHead
        title={t.journal}
        sub={d ? `${d.group.name} · ${d.subject.name} · ${d.semester.name}` : undefined}
        actions={
          <>
            <Select value={key} onChange={setKey} options={courses.map((c) => ({ value: `${c.group_id}|${c.subject_id}`, label: `${c.group_name} — ${c.subject}` }))} />
            <Btn kind="accent" icon={<Plus size={15} />} disabled={!d} onClick={() => setCol({ kind: "current", title: "", max: 100, date: isoDate(new Date()), marks: {} })}>
              {t.add_column}
            </Btn>
          </>
        }
      />
      {list && list.length === 0 ? (
        <Card>
          <Empty title={t.no_courses} />
        </Card>
      ) : failed ? (
        <Card>
          <Empty title={t.load_failed}>
            <Btn icon={<RefreshCw size={15} />} onClick={load}>
              {t.retry}
            </Btn>
          </Empty>
        </Card>
      ) : !d ? (
        <Spinner />
      ) : (
        <Card pad={false}>
          <div className="journal-wrap">
            <div className="a-table-scroll">
              <table className="a-table journal">
                <thead>
                  <tr>
                    <th className="stud">{t.student}</th>
                    <th className="col" title={t.attendance}>
                      {t.attendance}
                    </th>
                    {columns.map(([k, c]) => (
                      <th key={k} className="col" title={`${t.grade_kinds[c.kind]} · ${c.date}`}>
                        <small className="muted">{c.date.slice(5)}</small>
                        <br />
                        {c.title || t.grade_kinds[c.kind]}
                        <br />
                        <small className="muted">/{fmtNum(c.max, 0)}</small>
                      </th>
                    ))}
                    <th className="col">{t.total}</th>
                    <th className="col">{t.grade5}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.students.map((s) => (
                    <tr key={s.id}>
                      <td className="stud">
                        <span className="u-cell"><Avatar name={s.name} photo={(s as { data?: Record<string, string> }).data?.photo} size={30} /><b>{s.name}</b></span>
                      </td>
                      <td className="col">
                        {s.attendance?.pct != null ? (
                          <span className={`p-grade ${s.attendance.pct < 75 ? "g2" : "g5"}`}>{s.attendance.pct}%</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      {columns.map(([k, c]) => {
                        const g = (s.grades || []).find((x) => `${x.kind}|${x.title}|${x.date}` === k);
                        return (
                          <td key={k} className="col">
                            {g ? (
                              <button className="p-grade" onClick={() => setEdit(g)} title={g.comment}>
                                {fmtNum(g.score, g.score % 1 ? 1 : 0)}
                              </button>
                            ) : (
                              <button
                                className="a-icon"
                                title={t.add_grade}
                                onClick={async () => {
                                  const r = await run(() => teacher.addGrade({ student_id: s.id, subject_id: sid, semester_id: d.semester.id, kind: c.kind, title: c.title, score: 0, max: c.max, date: c.date }));
                                  if (r) {
                                    setEdit(r);
                                    load();
                                  }
                                }}
                              >
                                <Plus size={14} />
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="col">{s.summary ? `${fmtNum(s.summary.score, 0)}/${fmtNum(s.summary.max, 0)}` : "—"}</td>
                      <td className="col">{s.summary?.grade5 != null ? <span className={`p-grade g${s.summary.grade5}`}>{s.summary.grade5}</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
      <Modal
        open={!!col}
        onClose={() => setCol(null)}
        title={t.add_column}
        width={760}
        footer={
          <Btn
            kind="primary"
            onClick={async () => {
              if (!col || !d) return;
              const r = await run(
                () =>
                  teacher.bulkGrades({
                    group_id: gid, subject_id: sid, semester_id: d.semester.id, kind: col.kind, title: col.title, max: col.max, date: col.date,
                    marks: Object.entries(col.marks).filter(([, v]) => v !== "").map(([student_id, score]) => ({ student_id, score })),
                  }),
                t.saved,
              );
              if (r) {
                setCol(null);
                load();
              }
            }}
          >
            {t.save}
          </Btn>
        }
      >
        {col && d && (
          <>
            <div className="a-form-grid">
              <Field label={t.kind}>
                <Select value={col.kind} onChange={(v) => setCol({ ...col, kind: v })} options={Object.keys(t.grade_kinds).map((k) => ({ value: k, label: t.grade_kinds[k] }))} />
              </Field>
              <Field label={t.title}>
                <Input value={col.title} onChange={(e) => setCol({ ...col, title: e.target.value })} placeholder={t.grade_kinds[col.kind]} />
              </Field>
              <Field label={t.max}>
                <Input type="number" value={col.max} onChange={(e) => setCol({ ...col, max: Number(e.target.value) || 100 })} />
              </Field>
              <Field label={t.date}>
                <Input type="date" value={col.date} onChange={(e) => setCol({ ...col, date: e.target.value })} />
              </Field>
            </div>
            <div className="a-table-scroll">
              <table className="a-table">
                <tbody>
                  {d.students.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="n">
                        <Input type="number" min={0} max={col.max} className="cell" style={{ width: 90 }} value={col.marks[s.id] ?? ""} onChange={(e) => setCol({ ...col, marks: { ...col.marks, [s.id]: e.target.value } })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={t.edit}
        width={460}
        footer={
          <>
            <Btn
              kind="danger"
              icon={<Trash2 size={14} />}
              onClick={async () => {
                if (!edit || !(await confirm(t.confirm_delete))) return;
                await run(() => teacher.deleteGrade(edit.id));
                setEdit(null);
                load();
              }}
            >
              {t.delete}
            </Btn>
            <Btn
              kind="primary"
              onClick={async () => {
                if (!edit) return;
                const r = await run(() => teacher.updateGrade(edit.id, { score: edit.score, max: edit.max, comment: edit.comment, title: edit.title, kind: edit.kind, date: edit.date }), t.saved);
                if (r) {
                  setEdit(null);
                  load();
                }
              }}
            >
              {t.save}
            </Btn>
          </>
        }
      >
        {edit && (
          <div className="a-form-grid">
            <Field label={t.score}>
              <Input type="number" min={0} max={edit.max} step="0.5" value={edit.score} onChange={(e) => setEdit({ ...edit, score: Number(e.target.value) })} />
            </Field>
            <Field label={t.max}>
              <Input type="number" value={edit.max} onChange={(e) => setEdit({ ...edit, max: Number(e.target.value) || 100 })} />
            </Field>
            <Field label={t.kind}>
              <Select value={edit.kind} onChange={(v) => setEdit({ ...edit, kind: v })} options={Object.keys(t.grade_kinds).map((k) => ({ value: k, label: t.grade_kinds[k] }))} />
            </Field>
            <Field label={t.date}>
              <Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
            </Field>
            <Field label={t.title} wide>
              <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </Field>
            <Field label={t.comment} wide>
              <Input value={edit.comment} onChange={(e) => setEdit({ ...edit, comment: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
      <span hidden>{me.user.id}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ topshiriqlar */
function FileList({ items, onRemove }: { items: Attachment[]; onRemove?: (i: number) => void }) {
  if (!items?.length) return null;
  return (
    <div className="p-files">
      {items.map((a, i) => (
        <a key={i} href={a.url} target="_blank" rel="noreferrer" onClick={onRemove ? (e) => { e.preventDefault(); onRemove(i); } : undefined} title={onRemove ? "×" : undefined}>
          <Paperclip size={12} /> {a.label || a.url.split("/").pop()}
          {onRemove && " ×"}
        </a>
      ))}
    </div>
  );
}

function UploadBtn({ onDone, label }: { onDone: (a: Attachment) => void; label: string }) {
  const run = useRun();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Btn size="sm" icon={<Upload size={14} />} onClick={() => input.current?.click()}>
        {label}
      </Btn>
      <input
        ref={input}
        type="file"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = await run(() => portal.upload(f));
          if (r) onDone({ label: r.original || f.name, url: r.url });
          e.target.value = "";
        }}
      />
    </>
  );
}

export function TeacherAssignments() {
  const { t } = usePortal();
  const run = useRun();
  const confirm = useConfirm();
  const courses = useCourses();
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [edit, setEdit] = useState<Partial<Assignment> | null>(null);
  const [subs, setSubs] = useState<{ assignment: Assignment; items: StudentRow[] } | null>(null);
  const load = () => teacher.assignments().then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);
  const courseKey = (a: Partial<Assignment>) => `${a.group_id || ""}|${a.subject_id || ""}`;
  return (
    <div className="a-page">
      <PageHead
        title={t.assignments}
        actions={
          <Btn kind="accent" icon={<Plus size={15} />} onClick={() => setEdit({ title: "", description: "", max: 100, attachments: [], group_id: courses[0]?.group_id, subject_id: courses[0]?.subject_id })}>
            {t.new_assignment}
          </Btn>
        }
      />
      <Card pad={false}>
        {!items ? <Spinner /> : items.length === 0 ? <Empty title={t.no_data} /> : null}
        {(items || []).map((a) => (
          <div key={a.id} className="p-assign">
            <div className="p-assign-date">
              <b>{a.due ? a.due.slice(8, 10) : "—"}</b>
              <small>{a.due ? a.due.slice(5, 7) + "." + a.due.slice(0, 4) : ""}</small>
            </div>
            <div className="p-assign-main">
              <b>{a.title}</b>
              <small>
                {a.group_name} · {a.subject} · {t.max} {a.max}
                {a.due ? ` · ${t.due}: ${fmtDateTime(a.due)}` : ""}
              </small>
              <FileList items={a.attachments} />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Pill tone={(a.submissions || 0) - (a.graded || 0) > 0 ? "warn" : "muted"}>
                {t.submissions}: {a.submissions} · {t.graded}: {a.graded}
              </Pill>
              <Btn size="sm" onClick={() => teacher.submissions(a.id).then(setSubs)}>
                {t.submissions}
              </Btn>
              <Btn size="sm" kind="ghost" onClick={() => setEdit(a)}>
                {t.edit}
              </Btn>
              <button
                className="a-icon danger"
                onClick={async () => {
                  if (await confirm(t.confirm_delete)) {
                    await run(() => teacher.deleteAssignment(a.id));
                    load();
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </Card>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? t.edit : t.new_assignment}
        width={720}
        footer={
          <Btn
            kind="primary"
            onClick={async () => {
              if (!edit) return;
              const r = await run(() => teacher.saveAssignment(edit, edit.id), t.saved);
              if (r) {
                setEdit(null);
                load();
              }
            }}
          >
            {t.save}
          </Btn>
        }
      >
        {edit && (
          <div className="a-form-grid">
            <Field label={t.group + " / " + t.subject} wide>
              <Select
                value={courseKey(edit)}
                onChange={(v) => {
                  const [g, s] = v.split("|");
                  setEdit({ ...edit, group_id: g, subject_id: s });
                }}
                options={courses.map((c) => ({ value: `${c.group_id}|${c.subject_id}`, label: `${c.group_name} — ${c.subject}` }))}
              />
            </Field>
            <Field label={t.title} wide>
              <Input value={edit.title || ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </Field>
            <Field label={t.description} wide>
              <Textarea rows={5} value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </Field>
            <Field label={t.due}>
              <Input type="datetime-local" value={edit.due ? edit.due.slice(0, 16) : ""} onChange={(e) => setEdit({ ...edit, due: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </Field>
            <Field label={t.max}>
              <Input type="number" value={edit.max ?? 100} onChange={(e) => setEdit({ ...edit, max: Number(e.target.value) || 100 })} />
            </Field>
            <Field label={t.attachments} wide>
              <FileList items={edit.attachments || []} onRemove={(i) => setEdit({ ...edit, attachments: (edit.attachments || []).filter((_, j) => j !== i) })} />
              <UploadBtn label={t.attach_file} onDone={(a) => setEdit((e) => ({ ...(e || {}), attachments: [...((e?.attachments as Attachment[]) || []), a] }))} />
            </Field>
          </div>
        )}
      </Modal>
      <Modal open={!!subs} onClose={() => setSubs(null)} title={subs ? `${subs.assignment.title} — ${t.submissions}` : ""} width={900}>
        {subs && (
          <div className="a-table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  <th>{t.student}</th>
                  <th>{t.submitted}</th>
                  <th>{t.your_answer}</th>
                  <th className="n">{t.score}</th>
                  <th>{t.feedback}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {subs.items.map((s) => (
                  <SubRow key={s.id} s={s} max={subs.assignment.max} onSaved={() => teacher.submissions(subs.assignment.id).then((r) => { setSubs(r); load(); })} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SubRow({ s, max, onSaved }: { s: StudentRow; max: number; onSaved: () => void }) {
  const { t } = usePortal();
  const run = useRun();
  const sub = s.submission;
  const [score, setScore] = useState<string>(sub?.score != null ? String(sub.score) : "");
  const [fb, setFb] = useState(sub?.feedback || "");
  return (
    <tr>
      <td>
        <span className="u-cell"><Avatar name={s.name} photo={(s as { data?: Record<string, string> }).data?.photo} size={30} /><b>{s.name}</b></span>
      </td>
      <td>{sub ? <Pill tone="info">{fmtDateTime(sub.submitted)}</Pill> : <Pill tone="muted">{t.not_submitted}</Pill>}</td>
      <td style={{ maxWidth: 320 }}>
        {sub?.text && <div className="p-desc">{sub.text.slice(0, 400)}</div>}
        {sub && <FileList items={sub.attachments} />}
      </td>
      <td className="n">{sub && <Input type="number" min={0} max={max} className="cell" style={{ width: 80 }} value={score} onChange={(e) => setScore(e.target.value)} />}</td>
      <td>{sub && <Input value={fb} onChange={(e) => setFb(e.target.value)} />}</td>
      <td className="actions">
        {sub && (
          <Btn
            size="sm"
            kind="primary"
            onClick={async () => {
              const r = await run(() => teacher.gradeSubmission(sub.id, score === "" ? null : Number(score), fb), t.saved);
              if (r) onSaved();
            }}
          >
            {t.grade_it}
          </Btn>
        )}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ materiallar */
export function TeacherMaterials() {
  const { t } = usePortal();
  const run = useRun();
  const confirm = useConfirm();
  const courses = useCourses();
  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    courses.forEach((c) => m.set(c.subject_id, c.subject));
    return [...m.entries()];
  }, [courses]);
  const groups = uniqGroups(courses);
  const [items, setItems] = useState<Material[] | null>(null);
  const [edit, setEdit] = useState<Partial<Material> | null>(null);
  const load = () => teacher.materials().then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="a-page">
      <PageHead title={t.materials} actions={<Btn kind="accent" icon={<Plus size={15} />} onClick={() => setEdit({ title: "", description: "", url: "", attachments: [], subject_id: subjects[0]?.[0], group_id: null })}>{t.new_material}</Btn>} />
      <Card pad={false}>
        {!items ? <Spinner /> : items.length === 0 ? <Empty title={t.no_data} /> : null}
        <ul className="p-list" style={{ padding: "0 18px" }}>
          {(items || []).map((m) => (
            <li key={m.id}>
              <span className="p-badge">
                <BookOpen size={15} />
              </span>
              <span className="grow">
                <b>{m.title}</b>
                <small>
                  {m.subject} · {m.group_name || t.for_all_groups} · {fmtDateTime(m.created)}
                </small>
                {m.description && <small>{m.description}</small>}
                <div className="p-files">
                  {m.url && (
                    <a href={m.url} target="_blank" rel="noreferrer">
                      {t.link}
                    </a>
                  )}
                  <FileList items={m.attachments} />
                </div>
              </span>
              <Btn size="sm" kind="ghost" onClick={() => setEdit(m)}>
                {t.edit}
              </Btn>
              <button
                className="a-icon danger"
                onClick={async () => {
                  if (await confirm(t.confirm_delete)) {
                    await run(() => teacher.deleteMaterial(m.id));
                    load();
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? t.edit : t.new_material}
        width={680}
        footer={
          <Btn
            kind="primary"
            onClick={async () => {
              if (!edit) return;
              const r = await run(() => teacher.saveMaterial(edit, edit.id), t.saved);
              if (r) {
                setEdit(null);
                load();
              }
            }}
          >
            {t.save}
          </Btn>
        }
      >
        {edit && (
          <div className="a-form-grid">
            <Field label={t.subject}>
              <Select value={edit.subject_id || ""} onChange={(v) => setEdit({ ...edit, subject_id: v })} options={subjects.map(([id, name]) => ({ value: id, label: name }))} />
            </Field>
            <Field label={t.group}>
              <Select value={edit.group_id || ""} onChange={(v) => setEdit({ ...edit, group_id: v || null })} options={[{ value: "", label: t.for_all_groups }, ...groups.map((g) => ({ value: g.group_id, label: g.group_name }))]} />
            </Field>
            <Field label={t.title} wide>
              <Input value={edit.title || ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </Field>
            <Field label={t.description} wide>
              <Textarea rows={3} value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </Field>
            <Field label={t.link} wide>
              <Input value={edit.url || ""} onChange={(e) => setEdit({ ...edit, url: e.target.value })} placeholder="https://" />
            </Field>
            <Field label={t.attachments} wide>
              <FileList items={edit.attachments || []} onRemove={(i) => setEdit({ ...edit, attachments: (edit.attachments || []).filter((_, j) => j !== i) })} />
              <UploadBtn label={t.attach_file} onDone={(a) => setEdit((e) => ({ ...(e || {}), attachments: [...((e?.attachments as Attachment[]) || []), a] }))} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ bildirishnomalar (o'z guruhlariga) */
export function TeacherNotices() {
  const { t } = usePortal();
  const run = useRun();
  const confirm = useConfirm();
  const toast = useToast();
  const courses = useCourses();
  const groups = uniqGroups(courses);
  const [items, setItems] = useState<Notice[] | null>(null);
  const [f, setF] = useState({ title: "", body: "", group_id: "", pinned: false });
  const load = () => portal.notices().then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!f.group_id && groups.length) setF((x) => ({ ...x, group_id: groups[0].group_id }));
  }, [groups, f.group_id]);
  return (
    <div className="a-page">
      <PageHead title={t.notices} />
      <div className="p-grid">
        <Card title={t.new_notice}>
          <Field label={t.to_group}>
            <Select value={f.group_id} onChange={(v) => setF({ ...f, group_id: v })} options={groups.map((g) => ({ value: g.group_id, label: g.group_name }))} />
          </Field>
          <Field label={t.title}>
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <Field label={t.body}>
            <Textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          </Field>
          <Toggle checked={f.pinned} onChange={(v) => setF({ ...f, pinned: v })} label={t.pinned} />
          <Btn
            kind="primary"
            icon={<Send size={15} />}
            disabled={!f.title || !f.group_id}
            onClick={async () => {
              const r = await run(() => teacher.sendNotice(f), t.saved);
              if (r) {
                setF({ ...f, title: "", body: "", pinned: false });
                load();
                toast(t.saved);
              }
            }}
          >
            {t.new_notice}
          </Btn>
        </Card>
        <Card className="span2" pad={false}>
          {!items ? (
            <Spinner />
          ) : (
            <NoticeList
              items={items}
              onDelete={async (n) => {
                if (await confirm(t.confirm_delete)) {
                  await run(() => teacher.deleteNotice(n.id));
                  load();
                }
              }}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
