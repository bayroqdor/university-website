// Talaba kabineti sahifalari
import { BookOpen, CalendarDays, ClipboardCheck, GraduationCap, Paperclip, Send, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LessonCard } from "../../lib/schedule";
import { Btn, Card, Empty, Field, Modal, PageHead, Pill, Select, Spinner, Textarea, fmtDateTime, fmtNum, useRun, useToast } from "../../admin/ui";
import { portal, student, type Assignment, type Attachment, type Grade, type Material, type SubjectSummary, type Today } from "../api";
import { usePortal } from "../PortalApp";
import { NoticeList } from "./Common";

function G5({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined) return <span className="p-grade">—</span>;
  return <span className={`p-grade g${v}`}>{v}</span>;
}

function Bar({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return <span className="muted">—</span>;
  return (
    <span className="bar-cell" style={{ justifyContent: "flex-start" }}>
      <span className={`p-bar ${pct < 60 ? "bad" : pct >= 90 ? "ok" : ""}`}>
        <i style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      {fmtNum(pct, 0)}%
    </span>
  );
}

export function StudentDashboard() {
  const { t, me, user } = usePortal();
  const [d, setD] = useState<Today | null>(null);
  useEffect(() => {
    portal.today().then(setD).catch(() => null);
  }, []);
  if (!d) return <Spinner />;
  return (
    <div className="a-page">
      <div className="p-hero">
        <div>
          <h1>
            {t.hello}, {user.name.split(" ")[0]}!
          </h1>
          <p>
            {t.today}: {d.date} · {t.weekdays[d.weekday]}
            {d.week ? ` · ${d.week.number}-${t.week} (${d.week.parity === "odd" ? t.odd : t.even})` : ""}
          </p>
        </div>
        <div className="p-hero-meta">
          {me.group && (
            <span>
              {t.group}: {me.group.name}
            </span>
          )}
          {me.program && (
            <span>
              {t.program}: {me.program.title}
            </span>
          )}
          {d.semester && <span>{d.semester.name}</span>}
        </div>
      </div>
      <div className="kpis three">
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-ic">
              <GraduationCap size={17} />
            </span>
          </div>
          <div className="kpi-v">{d.gpa ?? "—"}</div>
          <div className="kpi-l">{t.gpa}</div>
          <div className="kpi-sub">
            {d.subjects?.length || 0} {t.subjects.toLowerCase()}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-ic">
              <ClipboardCheck size={17} />
            </span>
          </div>
          <div className="kpi-v">{d.attendance?.pct != null ? `${d.attendance.pct}%` : "—"}</div>
          <div className="kpi-l">{t.attendance_pct}</div>
          <div className="kpi-sub">
            {t.absences}: {d.attendance?.absent || 0} / {d.attendance?.total || 0}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-ic">
              <BookOpen size={17} />
            </span>
          </div>
          <div className="kpi-v">{d.pending_count || 0}</div>
          <div className="kpi-l">{t.pending_assignments}</div>
          <div className="kpi-sub">
            <Link to="/student/assignments">{t.assignments} →</Link>
          </div>
        </div>
      </div>
      <div className="p-grid">
        <Card title={t.today_lessons} sub={d.semester?.name} className="span2" actions={<Link className="a-btn sm" to="/student/schedule"><CalendarDays size={14} /> {t.schedule}</Link>}>
          {d.lessons.length === 0 ? (
            <Empty title={t.no_lessons_today} />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {d.lessons.map((l) => (
                <LessonCard key={l.id} l={l} t={t} showTeacher />
              ))}
            </div>
          )}
        </Card>
        <Card title={t.notices} pad={false}>
          <NoticeList items={d.notices} />
        </Card>
        <Card title={t.grades} className="span2" pad={false}>
          <div className="a-table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  <th>{t.subject}</th>
                  <th className="n">{t.score}</th>
                  <th>{t.pct}</th>
                  <th className="n">{t.grade5}</th>
                </tr>
              </thead>
              <tbody>
                {(d.subjects || []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      {t.no_data}
                    </td>
                  </tr>
                )}
                {(d.subjects || []).map((s) => (
                  <tr key={s.subject_id}>
                    <td>{s.subject}</td>
                    <td className="n">
                      {fmtNum(s.score, 0)} / {fmtNum(s.max, 0)}
                    </td>
                    <td>
                      <Bar pct={s.pct} />
                    </td>
                    <td className="n">
                      <G5 v={s.grade5} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title={t.pending_assignments} pad={false}>
          {(d.pending_assignments || []).length === 0 ? (
            <Empty title={t.no_data} />
          ) : (
            <ul className="p-list" style={{ padding: "0 16px" }}>
              {(d.pending_assignments || []).map((a) => (
                <li key={a.id}>
                  <span className="p-badge">{a.due ? a.due.slice(8, 10) : "—"}</span>
                  <span className="grow">
                    <b>{a.title}</b>
                    <small>
                      {a.subject} · {t.due}: {a.due ? fmtDateTime(a.due) : "—"}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export function StudentGrades() {
  const { t, me } = usePortal();
  const [sem, setSem] = useState(me.semester?.id || "");
  const [d, setD] = useState<{ items: Grade[]; subjects: SubjectSummary[]; gpa: number | null } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    setD(null);
    student.grades(sem || undefined).then(setD).catch(() => setD({ items: [], subjects: [], gpa: null }));
  }, [sem]);
  if (!d) return <Spinner />;
  return (
    <div className="a-page">
      <PageHead
        title={t.grades}
        sub={
          <>
            {t.gpa}: <b>{d.gpa ?? "—"}</b>
          </>
        }
        actions={me.semesters.length > 1 ? <Select value={sem} onChange={setSem} options={me.semesters.map((s) => ({ value: s.id, label: s.name }))} /> : undefined}
      />
      <Card pad={false}>
        <div className="a-table-scroll">
          <table className="a-table">
            <thead>
              <tr>
                <th>{t.subject}</th>
                {["current", "midterm", "final", "assignment"].map((k) => (
                  <th key={k} className="n">
                    {t.grade_kinds[k]}
                  </th>
                ))}
                <th className="n">{t.total}</th>
                <th>{t.pct}</th>
                <th className="n">{t.grade5}</th>
              </tr>
            </thead>
            <tbody>
              {d.subjects.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
                    {t.no_data}
                  </td>
                </tr>
              )}
              {d.subjects.map((s) => (
                <tr key={s.subject_id} onClick={() => setOpen(open === s.subject_id ? null : s.subject_id)} style={{ cursor: "pointer" }}>
                  <td>
                    <b>{s.subject}</b>
                    {s.credits ? <small className="muted"> · {s.credits} kr.</small> : null}
                  </td>
                  {["current", "midterm", "final", "assignment"].map((k) => (
                    <td key={k} className="n">
                      {s.kinds[k] ? `${fmtNum(s.kinds[k].score, 0)}/${fmtNum(s.kinds[k].max, 0)}` : "—"}
                    </td>
                  ))}
                  <td className="n">
                    {fmtNum(s.score, 0)} / {fmtNum(s.max, 0)}
                  </td>
                  <td>
                    <Bar pct={s.pct} />
                  </td>
                  <td className="n">
                    <G5 v={s.grade5} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {open && (
        <Card title={d.subjects.find((s) => s.subject_id === open)?.subject} pad={false}>
          <div className="a-table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  <th>{t.date}</th>
                  <th>{t.kind}</th>
                  <th>{t.title}</th>
                  <th className="n">{t.score}</th>
                  <th>{t.comment}</th>
                </tr>
              </thead>
              <tbody>
                {d.items.filter((g) => g.subject_id === open).map((g) => (
                  <tr key={g.id}>
                    <td>{g.date}</td>
                    <td>
                      <Pill tone="info">{t.grade_kinds[g.kind] || g.kind}</Pill>
                    </td>
                    <td>{g.title}</td>
                    <td className="n">
                      <b>{fmtNum(g.score, 1)}</b> / {fmtNum(g.max, 0)}
                    </td>
                    <td className="muted">{g.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export function StudentAttendance() {
  const { t, me } = usePortal();
  const [sem, setSem] = useState(me.semester?.id || "");
  const [d, setD] = useState<Awaited<ReturnType<typeof student.attendance>> | null>(null);
  useEffect(() => {
    setD(null);
    student.attendance(sem || undefined).then(setD).catch(() => null);
  }, [sem]);
  if (!d) return <Spinner />;
  const label: Record<string, string> = { present: t.present, absent: t.absent, late: t.late, excused: t.excused };
  return (
    <div className="a-page">
      <PageHead
        title={t.attendance}
        sub={
          <>
            {t.attendance_pct}: <b>{d.pct != null ? `${d.pct}%` : "—"}</b> · {t.absences}: {d.absent}
          </>
        }
        actions={me.semesters.length > 1 ? <Select value={sem} onChange={setSem} options={me.semesters.map((s) => ({ value: s.id, label: s.name }))} /> : undefined}
      />
      <Card pad={false}>
        <div className="a-table-scroll">
          <table className="a-table">
            <thead>
              <tr>
                <th>{t.subject}</th>
                <th className="n">{t.total}</th>
                <th className="n">{t.present}</th>
                <th className="n">{t.absent}</th>
                <th className="n">{t.late}</th>
                <th className="n">{t.excused}</th>
                <th>{t.pct}</th>
              </tr>
            </thead>
            <tbody>
              {d.subjects.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    {t.no_data}
                  </td>
                </tr>
              )}
              {d.subjects.map((s) => (
                <tr key={s.subject_id}>
                  <td>
                    <b>{s.subject}</b>
                    {s.pct != null && s.pct < 75 && <Pill tone="bad">{t.risk}</Pill>}
                  </td>
                  <td className="n">{s.total}</td>
                  <td className="n">{s.present}</td>
                  <td className="n">{s.absent}</td>
                  <td className="n">{s.late}</td>
                  <td className="n">{s.excused}</td>
                  <td>
                    <Bar pct={s.pct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {d.recent.length > 0 && (
        <Card title={t.date} pad={false}>
          <div className="a-table-scroll">
            <table className="a-table">
              <tbody>
                {d.recent.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{r.subject}</td>
                    <td>{t.lesson_types[r.type || ""] || r.type}</td>
                    <td>
                      <span className={`att-dot ${r.status}`} title={label[r.status]}>
                        {label[r.status]?.slice(0, 1)}
                      </span>{" "}
                      {label[r.status]}
                    </td>
                    <td className="muted">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Files({ items }: { items: Attachment[] }) {
  if (!items?.length) return null;
  return (
    <div className="p-files">
      {items.map((a, i) => (
        <a key={i} href={a.url} target="_blank" rel="noreferrer">
          <Paperclip size={12} /> {a.label || a.url.split("/").pop()}
        </a>
      ))}
    </div>
  );
}

export function StudentAssignments() {
  const { t } = usePortal();
  const run = useRun();
  const toast = useToast();
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [open, setOpen] = useState<Assignment | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const load = () => student.assignments().then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);
  const openIt = (a: Assignment) => {
    setOpen(a);
    setText(a.submission?.text || "");
    setFiles(a.submission?.attachments || []);
  };
  if (!items) return <Spinner />;
  const now = new Date().toISOString();
  return (
    <div className="a-page">
      <PageHead title={t.assignments} />
      <Card pad={false}>
        {items.length === 0 && <Empty title={t.no_data} />}
        {items.map((a) => {
          const s = a.submission;
          const late = a.due && a.due < now && !s;
          return (
            <div key={a.id} className="p-assign">
              <div className="p-assign-date">
                <b>{a.due ? a.due.slice(8, 10) : "—"}</b>
                <small>{a.due ? a.due.slice(5, 7) + "." + a.due.slice(0, 4) : ""}</small>
              </div>
              <div className="p-assign-main">
                <b>{a.title}</b>
                <small>
                  {a.subject} · {a.teacher} · {t.max} {a.max}
                  {a.due ? ` · ${t.due}: ${fmtDateTime(a.due)}` : ""}
                </small>
                <Files items={a.attachments} />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {s?.score != null ? (
                  <Pill tone="ok">
                    {t.graded}: {s.score} / {a.max}
                  </Pill>
                ) : s ? (
                  <Pill tone="info">{t.submitted}</Pill>
                ) : (
                  <Pill tone={late ? "bad" : "warn"}>{t.not_submitted}</Pill>
                )}
                <Btn size="sm" onClick={() => openIt(a)}>
                  {t.open}
                </Btn>
              </div>
            </div>
          );
        })}
      </Card>
      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.title || ""}
        width={720}
        footer={
          open && open.submission?.score == null ? (
            <Btn
              kind="primary"
              icon={<Send size={15} />}
              busy={busy}
              onClick={async () => {
                if (!text.trim() && !files.length) return toast(t.err_empty, "error");
                setBusy(true);
                const r = await run(() => student.submit(open.id, text, files), t.submitted);
                setBusy(false);
                if (r) {
                  setOpen(null);
                  load();
                }
              }}
            >
              {open.submission ? t.resubmit : t.submit}
            </Btn>
          ) : undefined
        }
      >
        {open && (
          <>
            <p className="a-hint">
              {open.subject} · {open.teacher} · {t.max} {open.max}
              {open.due ? ` · ${t.due}: ${fmtDateTime(open.due)}` : ""}
            </p>
            {open.description && <p className="p-desc">{open.description}</p>}
            <Files items={open.attachments} />
            <div className="doc-sep" />
            {open.submission?.score != null ? (
              <>
                <p>
                  <Pill tone="ok">
                    {t.graded}: {open.submission.score} / {open.max}
                  </Pill>
                </p>
                {open.submission.feedback && (
                  <Field label={t.feedback}>
                    <p className="p-desc">{open.submission.feedback}</p>
                  </Field>
                )}
                <Field label={t.your_answer}>
                  <p className="p-desc">{open.submission.text}</p>
                </Field>
                <Files items={open.submission.attachments} />
              </>
            ) : (
              <>
                <Field label={t.your_answer}>
                  <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
                </Field>
                <Files items={files} />
                <Btn
                  size="sm"
                  icon={<Upload size={14} />}
                  onClick={() => input.current?.click()}
                >
                  {t.attach_file}
                </Btn>
                <input
                  ref={input}
                  type="file"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const r = await run(() => portal.upload(f));
                    if (r) setFiles([...files, { label: r.original || f.name, url: r.url }]);
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

export function StudentMaterials() {
  const { t } = usePortal();
  const [items, setItems] = useState<Material[] | null>(null);
  useEffect(() => {
    student.materials().then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  if (!items) return <Spinner />;
  const bySubject = new Map<string, Material[]>();
  items.forEach((m) => bySubject.set(m.subject || "", [...(bySubject.get(m.subject || "") || []), m]));
  return (
    <div className="a-page">
      <PageHead title={t.materials} />
      {items.length === 0 && (
        <Card>
          <Empty title={t.no_data} />
        </Card>
      )}
      {[...bySubject.entries()].map(([subj, list]) => (
        <Card key={subj} title={subj} pad={false}>
          <ul className="p-list" style={{ padding: "0 18px" }}>
            {list.map((m) => (
              <li key={m.id}>
                <span className="p-badge">
                  <BookOpen size={15} />
                </span>
                <span className="grow">
                  <b>{m.title}</b>
                  {m.description && <small>{m.description}</small>}
                  <small>
                    {m.teacher} · {fmtDateTime(m.created)}
                  </small>
                  <div className="p-files">
                    {m.url && (
                      <a href={m.url} target="_blank" rel="noreferrer">
                        {t.link}
                      </a>
                    )}
                    {m.attachments.map((a, i) => (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer">
                        <Paperclip size={12} /> {a.label || a.url.split("/").pop()}
                      </a>
                    ))}
                  </div>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
