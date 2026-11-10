// Dars jadvali tuzish: davlat shaklidagi jadval, guruh × hafta kuni × juftlik jadvali, sudrab ko'chirish,
// to'qnashuvlarni tekshirish (band vaqtga dars qo'yib bo'lmaydi), bir kunlik o'zgarishlar
import {
  AlertTriangle,
  CalendarOff,
  Copy,
  FileSignature,
  GripVertical,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  FormSettings,
  Lesson,
  OfficialForm,
  ScheduleChange,
} from "../../lib/api";
import {
  OfficialFormView,
  printForm,
  type DragInfo,
} from "../../lib/officialForm";
import { isoDate, mondayOf, WeekNav, WeekView } from "../../lib/schedule";
import { PDICTS } from "../../portal/i18n";
import { admin, type AcadOverview, type Conflict } from "../api";
import {
  Btn,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  PageHead,
  Pill,
  Select,
  Spinner,
  Textarea,
  fmtDateTime,
  useConfirm,
  useRun,
  useToast,
} from "../ui";

const WD = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const TYPES = [
  { value: "lecture", label: "Ma’ruza" },
  { value: "practice", label: "Amaliyot" },
  { value: "lab", label: "Laboratoriya" },
  { value: "seminar", label: "Seminar" },
  { value: "exam", label: "Imtihon" },
  { value: "consult", label: "Konsultatsiya" },
  { value: "other", label: "Boshqa" },
];
const PARITY = [
  { value: "all", label: "Har hafta" },
  { value: "odd", label: "Toq haftalar" },
  { value: "even", label: "Juft haftalar" },
];
const CONFLICT_LABEL: Record<Conflict["kind"], string> = {
  group: "Guruh bu vaqtda band",
  teacher: "O‘qituvchi bu vaqtda boshqa darsda",
  room: "Auditoriya band",
};

type LessonForm = {
  id?: string;
  semester_id: string;
  group_id: string;
  subject_id: string;
  teacher_id: string;
  room_id: string;
  weekday: number;
  slot_id: string;
  type: string;
  parity: string;
  date_from: string;
  date_to: string;
  note: string;
};

export function SchedulePage() {
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const [ov, setOv] = useState<AcadOverview | null>(null);
  const [sem, setSem] = useState("");
  const [view, setView] = useState<"form" | "grid" | "week" | "changes">(
    "form",
  );
  const [by, setBy] = useState<"group" | "teacher" | "room">("group");
  const [sel, setSel] = useState("");
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [edit, setEdit] = useState<LessonForm | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [week, setWeek] = useState(mondayOf());
  const [wk, setWk] = useState<Awaited<ReturnType<typeof admin.week>> | null>(
    null,
  );
  const [change, setChange] = useState<{
    lesson: Lesson;
    date: string;
    kind: string;
    room_id: string;
    slot_id: string;
    teacher_id: string;
    note: string;
  } | null>(null);
  const [changes, setChanges] = useState<
    (ScheduleChange & { subject?: string; group_name?: string })[] | null
  >(null);
  const [copyTo, setCopyTo] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [form, setForm] = useState<OfficialForm | null>(null);
  const [course, setCourse] = useState(0);
  const [faculty, setFaculty] = useState("");
  const [scope, setScope] = useState<"all" | "faculty" | "group" | "teacher">(
    "all",
  );
  const [fGroup, setFGroup] = useState("");
  const [fTeacher, setFTeacher] = useState("");
  const [layout, setLayout] = useState<"groups" | "days">("groups");
  const [facs, setFacs] = useState<Record<string, string>>({});
  const [signs, setSigns] = useState<FormSettings | null>(null);

  useEffect(() => {
    admin.acadOverview().then((o) => {
      setOv(o);
      setSem(o.semester?.id || o.semesters[0]?.id || "");
      if (o.groups[0]) setSel(o.groups[0].id);
    });
  }, []);
  const loadForm = useCallback(() => {
    if (!sem) return;
    const p =
      scope === "group"
        ? { group: fGroup }
        : scope === "teacher"
          ? { teacher: fTeacher }
          : scope === "faculty"
            ? { faculty, course }
            : { course };
    if (
      (scope === "group" && !fGroup) ||
      (scope === "teacher" && !fTeacher) ||
      (scope === "faculty" && !faculty)
    ) {
      setForm(null);
      return;
    }
    admin
      .form({ semester: sem, ...p })
      .then((f) => {
        setForm(f);
        setFacs((cur) => (Object.keys(cur).length ? cur : f.faculties));
      })
      .catch(() => setForm(null));
  }, [sem, course, faculty, scope, fGroup, fTeacher]);
  const load = useCallback(
    (quiet = false) => {
      if (!sem) return;
      if (!quiet) setLessons(null);
      admin
        .lessons({ semester: sem })
        .then((r) => setLessons(r.items))
        .catch(() => setLessons([]));
      loadForm();
    },
    [sem, loadForm],
  );
  useEffect(() => load(), [load]);
  useEffect(() => {
    if (view !== "week" || !sem) return;
    setWk(null);
    admin
      .week({ semester: sem, week, [by]: sel })
      .then(setWk)
      .catch(() => null);
  }, [view, sem, week, by, sel]);
  useEffect(() => {
    if (view !== "changes" || !sem) return;
    admin
      .changes(sem)
      .then((r) => setChanges(r.items))
      .catch(() => setChanges([]));
  }, [view, sem]);

  const stats = useMemo(() => {
    const ls = lessons || [];
    return {
      total: ls.length,
      groups: new Set(ls.map((l) => l.group_id)).size,
      teachers: new Set(ls.map((l) => l.teacher_id).filter(Boolean)).size,
      noRoom: ls.filter((l) => !l.room_id).length,
      noTeacher: ls.filter((l) => !l.teacher_id).length,
    };
  }, [lessons]);
  if (!ov) return <Spinner />;
  const slots = [...ov.slots].sort((a, b) => a.idx - b.idx);
  const options =
    by === "group"
      ? ov.groups.map((g) => ({
          value: g.id,
          label: `${g.name} (${g.course}-kurs)`,
        }))
      : by === "teacher"
        ? ov.teachers.map((t) => ({ value: t.id, label: t.name }))
        : ov.rooms.map((r) => ({
            value: r.id,
            label: `${r.name} · ${r.building}`,
          }));
  const filterKey =
    by === "group" ? "group_id" : by === "teacher" ? "teacher_id" : "room_id";
  const cell = (wd: number, slotId: string) =>
    (lessons || []).filter(
      (l) => l[filterKey] === sel && l.weekday === wd && l.slot_id === slotId,
    );
  const blank = (wd: number, slotId: string): LessonForm => ({
    semester_id: sem,
    group_id: by === "group" ? sel : ov.groups[0]?.id || "",
    subject_id: ov.subjects[0]?.id || "",
    teacher_id: by === "teacher" ? sel : "",
    room_id: by === "room" ? sel : "",
    weekday: wd,
    slot_id: slotId,
    type: "lecture",
    parity: "all",
    date_from: "",
    date_to: "",
    note: "",
  });
  const toForm = (l: Lesson): LessonForm => ({
    id: l.id,
    semester_id: l.semester_id,
    group_id: l.group_id,
    subject_id: l.subject_id,
    teacher_id: l.teacher_id || "",
    room_id: l.room_id || "",
    weekday: l.weekday,
    slot_id: l.slot_id,
    type: l.type,
    parity: l.parity,
    date_from: l.date_from || "",
    date_to: l.date_to || "",
    note: l.note || "",
  });
  // ---- sudrab ko'chirish: bo'sh kataklar yashil, band kataklar qizil (sababi bilan)
  const startDrag = (l: Lesson) => {
    setDrag({ lesson: l, cells: null });
    admin
      .availability({ id: l.id })
      .then((r) => {
        const cells: DragInfo["cells"] = {};
        for (const c of r.cells)
          cells[`${c.weekday}:${c.slot_id}`] = c.conflicts;
        setDrag((d) => (d && d.lesson.id === l.id ? { ...d, cells } : d));
      })
      .catch(() => setDrag(null));
  };
  const dropTo = async (l: Lesson, wd: number, slotId: string) => {
    setDrag(null);
    try {
      await admin.moveLesson(l.id, { weekday: wd, slot_id: slotId });
      const sl = slots.find((x) => x.id === slotId);
      toast(`${l.subject} → ${ov.weekdays[wd]}, ${sl?.idx}-juftlik`);
      load(true);
    } catch (e) {
      const body = (e as { body?: { code?: string; conflicts?: Conflict[] } })
        .body;
      if (body?.code === "conflict")
        toast(
          `Ko‘chirilmadi: ${(body.conflicts || []).map((c) => `${CONFLICT_LABEL[c.kind]} (${c.lesson.group_name}, ${c.lesson.subject})`).join("; ")}`,
          "error",
        );
      else toast(String((e as Error).message), "error");
    }
  };
  const cellState = (wd: number, slotId: string, own: boolean) => {
    if (!drag) return { cls: "", tip: "" };
    if (!own) return { cls: "drop-na", tip: "" };
    if (drag.lesson.weekday === wd && drag.lesson.slot_id === slotId)
      return { cls: "drop-origin", tip: "" };
    if (!drag.cells) return { cls: "drop-wait", tip: "" };
    const c = drag.cells[`${wd}:${slotId}`] || [];
    return {
      cls: c.length ? "drop-bad" : "drop-ok",
      tip: c
        .map(
          (x) =>
            `${CONFLICT_LABEL[x.kind as Conflict["kind"]]}: ${x.group_name} — ${x.subject}${x.teacher ? ` (${x.teacher})` : ""}`,
        )
        .join("\n"),
    };
  };
  const check = async (f: LessonForm) => {
    try {
      const r = await admin.checkLesson({ ...f, id: f.id });
      setConflicts(r.conflicts);
    } catch {
      setConflicts([]);
    }
  };
  const openEdit = (f: LessonForm) => {
    setEdit(f);
    check(f);
  };
  const save = async () => {
    if (!edit) return;
    try {
      await admin.saveLesson({ ...edit }, edit.id);
      toast("Saqlandi");
      setEdit(null);
      load(true);
    } catch (e) {
      const body = (e as { body?: { code?: string; conflicts?: Conflict[] } })
        .body;
      if (body?.code === "conflict") {
        setConflicts(body.conflicts || []);
        toast(
          "Bu vaqtda to‘qnashuv bor — dars saqlanmadi. Boshqa vaqt, o‘qituvchi yoki auditoriyani tanlang",
          "error",
        );
      } else toast(String((e as Error).message), "error");
    }
  };
  const semName = ov.semesters.find((s) => s.id === sem)?.name;
  const t = PDICTS.uz;

  return (
    <div className="a-page">
      <PageHead
        title="Dars jadvali"
        sub={
          <>
            {semName} · {stats.total} dars · {stats.groups} guruh ·{" "}
            {stats.teachers} o‘qituvchi
            {stats.noTeacher ? (
              <Pill tone="warn">{stats.noTeacher} darsda o‘qituvchi yo‘q</Pill>
            ) : null}
            {stats.noRoom ? (
              <Pill tone="warn">{stats.noRoom} darsda auditoriya yo‘q</Pill>
            ) : null}
          </>
        }
        actions={
          <>
            <Select
              value={sem}
              onChange={setSem}
              options={ov.semesters.map((s) => ({
                value: s.id,
                label: s.name + (s.current ? " · joriy" : ""),
              }))}
            />
            <Btn
              icon={<Copy size={14} />}
              onClick={() =>
                setCopyTo(ov.semesters.find((s) => s.id !== sem)?.id || "")
              }
              title="Jadvalni boshqa semestrga nusxalash"
            />
            <Btn
              icon={<Printer size={14} />}
              onClick={() => (view === "form" ? printForm() : window.print())}
              title="Chop etish (A4 albom)"
            />
          </>
        }
      />
      {ov.semesters.length === 0 && (
        <Card>
          <Empty title="Avval «O‘quv jarayoni» bo‘limida semestr yarating" />
        </Card>
      )}
      <div className="list-tools">
        <div className="a-seg">
          {(["form", "grid", "week", "changes"] as const).map((v) => (
            <button
              key={v}
              className={view === v ? "on" : ""}
              onClick={() => setView(v)}
            >
              {
                {
                  form: "Davlat shakli",
                  grid: "Guruh / o‘qituvchi / xona",
                  week: "Kalendar (sana bo‘yicha)",
                  changes: "O‘zgarishlar",
                }[v]
              }
            </button>
          ))}
        </div>
        {view === "form" && (
          <div className="form-tools">
            <div className="a-seg">
              {(["all", "faculty", "group", "teacher"] as const).map((v) => (
                <button
                  key={v}
                  className={scope === v ? "on" : ""}
                  onClick={() => {
                    setScope(v);
                    if (v === "faculty" && !faculty)
                      setFaculty(Object.keys(facs)[0] || "");
                    if (v === "group" && !fGroup)
                      setFGroup(ov.groups[0]?.id || "");
                    if (v === "teacher" && !fTeacher)
                      setFTeacher(ov.teachers[0]?.id || "");
                  }}
                >
                  {
                    {
                      all: "Umumiy",
                      faculty: "Kafedra",
                      group: "Guruh",
                      teacher: "O‘qituvchi",
                    }[v]
                  }
                </button>
              ))}
            </div>
            {scope === "faculty" && (
              <Select
                value={faculty}
                onChange={setFaculty}
                options={Object.entries(facs).map(([id, name]) => ({
                  value: id,
                  label: name,
                }))}
              />
            )}
            {(scope === "all" || scope === "faculty") && (
              <Select
                value={String(course)}
                onChange={(v) => setCourse(Number(v))}
                options={[
                  { value: "0", label: "Barcha kurslar" },
                  ...[1, 2, 3, 4].map((c) => ({
                    value: String(c),
                    label: `${c}-kurs`,
                  })),
                ]}
              />
            )}
            {scope === "group" && (
              <Select
                value={fGroup}
                onChange={setFGroup}
                options={ov.groups.map((g) => ({
                  value: g.id,
                  label: `${g.name} (${g.course}-kurs)`,
                }))}
              />
            )}
            {scope === "teacher" && (
              <Select
                value={fTeacher}
                onChange={setFTeacher}
                options={ov.teachers.map((x) => ({
                  value: x.id,
                  label: x.name,
                }))}
              />
            )}
            <div className="a-seg">
              <button
                className={layout === "groups" ? "on" : ""}
                onClick={() => setLayout("groups")}
                title="Davlat shakli: ustunlarda guruhlar — tahrirlash va sudrab ko‘chirish"
              >
                Guruhlar ustunda
              </button>
              <button
                className={layout === "days" ? "on" : ""}
                onClick={() => setLayout("days")}
                title="Ustunlarda hafta kunlari, qatorlarda guruhlar — ko‘p guruh bir varaqqa sig‘adi"
              >
                Kunlar ustunda
              </button>
            </div>
            <Btn
              icon={<FileSignature size={14} />}
              onClick={() => admin.formSettings().then(setSigns)}
            >
              Tasdiq va imzolar
            </Btn>
          </div>
        )}
        {(view === "grid" || view === "week") && (
          <div style={{ display: "flex", gap: 8 }}>
            <div className="a-seg">
              {(["group", "teacher", "room"] as const).map((v) => (
                <button
                  key={v}
                  className={by === v ? "on" : ""}
                  onClick={() => {
                    setBy(v);
                    setSel(
                      (v === "group"
                        ? ov.groups[0]?.id
                        : v === "teacher"
                          ? ov.teachers[0]?.id
                          : ov.rooms[0]?.id) || "",
                    );
                  }}
                >
                  {
                    {
                      group: "Guruh",
                      teacher: "O‘qituvchi",
                      room: "Auditoriya",
                    }[v]
                  }
                </button>
              ))}
            </div>
            <Select value={sel} onChange={setSel} options={options} />
          </div>
        )}
      </div>

      {view === "form" && (
        <>
          <p className="a-hint dnd-hint">
            {layout === "days" || scope === "teacher" ? (
              <>
                <GripVertical size={14} /> Bu ko‘rinish ko‘rish va chop etish
                uchun (ko‘p guruh bir A4 varaqqa sig‘adi). Darslarni sudrab
                ko‘chirish — «Umumiy / Kafedra / Guruh» va «Guruhlar ustunda»
                ko‘rinishida.
              </>
            ) : (
              <>
                <GripVertical size={14} /> Darsni sichqoncha bilan ushlab boshqa
                katakka sudrang: <span className="ok-dot" /> bo‘sh vaqt,{" "}
                <span className="bad-dot" /> band (o‘qituvchi, auditoriya yoki
                guruh) — u yerga qo‘yib bo‘lmaydi. Bo‘sh katakni bosib yangi
                dars qo‘shing.
              </>
            )}
          </p>
          {!form ? (
            <Spinner />
          ) : (
            <OfficialFormView
              form={form}
              layout={layout}
              editable={layout === "groups" && scope !== "teacher"}
              drag={drag}
              onDragStartLesson={startDrag}
              onDragEnd={() => setDrag(null)}
              onDrop={dropTo}
              onLessonClick={(l) => openEdit(toForm(l))}
              onEmptyClick={(gid, wd, slotId) =>
                openEdit({ ...blank(wd, slotId), group_id: gid })
              }
            />
          )}
        </>
      )}

      {view === "grid" && (
        <Card pad={false} className="sch-grid-card">
          {!lessons ? (
            <Spinner />
          ) : (
            <div className="sch-grid-wrap">
              <table className="sch-grid">
                <thead>
                  <tr>
                    <th className="slot-h">Juftlik</th>
                    {WD.slice(0, 6).map((d, i) => (
                      <th key={d}>{ov.weekdays[i]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slots.map((s) => (
                    <tr key={s.id}>
                      <td className="slot-h">
                        <b>{s.idx}</b>
                        <small>
                          {s.start}
                          <br />
                          {s.end}
                        </small>
                      </td>
                      {WD.slice(0, 6).map((_, wd) => {
                        const ls = cell(wd, s.id);
                        const st = cellState(
                          wd,
                          s.id,
                          !!drag && drag.lesson[filterKey] === sel,
                        );
                        return (
                          <td
                            key={wd}
                            className={`sch-cell ${st.cls}`}
                            title={st.tip || undefined}
                            onDragOver={(e) => {
                              if (st.cls === "drop-ok") {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (drag && st.cls === "drop-ok")
                                dropTo(drag.lesson, wd, s.id);
                            }}
                          >
                            {ls.map((l) => (
                              <button
                                key={l.id}
                                className={`sch-lesson type-${l.type} mini ${drag?.lesson.id === l.id ? "dragging" : ""}`}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.effectAllowed = "move";
                                  e.dataTransfer.setData("text/plain", l.id);
                                  startDrag(l);
                                }}
                                onDragEnd={() => setDrag(null)}
                                onClick={() => openEdit(toForm(l))}
                                title={`${l.subject} · ${l.teacher || "—"} · ${l.room || "—"}`}
                              >
                                <div className="sch-body">
                                  <span className="sch-type">
                                    {
                                      TYPES.find((x) => x.value === l.type)
                                        ?.label
                                    }
                                    {l.parity !== "all"
                                      ? ` · ${l.parity === "odd" ? "toq" : "juft"}`
                                      : ""}
                                  </span>
                                  <b className="sch-subject">{l.subject}</b>
                                  <small className="sch-meta">
                                    {by !== "group" && (
                                      <span>{l.group_name}</span>
                                    )}
                                    {by !== "teacher" && l.teacher && (
                                      <span>{l.teacher}</span>
                                    )}
                                    {by !== "room" && l.room && (
                                      <span>{l.room}</span>
                                    )}
                                    {!l.teacher && (
                                      <span className="warn">
                                        o‘qituvchi yo‘q
                                      </span>
                                    )}
                                    {!l.room && (
                                      <span className="warn">xona yo‘q</span>
                                    )}
                                  </small>
                                </div>
                              </button>
                            ))}
                            {!drag && (
                              <button
                                className="sch-add"
                                onClick={() => openEdit(blank(wd, s.id))}
                                title="Dars qo‘shish"
                              >
                                <Plus size={14} />
                              </button>
                            )}
                            {st.cls === "drop-bad" && (
                              <span className="sch-lock">band</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {view === "week" && (
        <>
          <WeekNav week={week} onChange={setWeek} data={wk} t={t} />
          {!wk ? (
            <Spinner />
          ) : (
            <WeekView
              data={wk}
              t={t}
              showGroup={by !== "group"}
              showTeacher={by !== "teacher"}
              onLesson={(l) =>
                setChange({
                  lesson: l,
                  date: l.date || isoDate(new Date()),
                  kind: l.change?.kind || "cancel",
                  room_id: l.change?.room_id || "",
                  slot_id: l.change?.slot_id || "",
                  teacher_id: l.change?.teacher_id || "",
                  note: l.change?.note || "",
                })
              }
            />
          )}
          <p className="a-hint">
            Darsni bosib, shu kun uchun bekor qilish yoki ko‘chirish
            (auditoriya, vaqt, o‘qituvchi) mumkin. Doimiy o‘zgarish — «Haftalik
            jadval» bo‘limida.
          </p>
        </>
      )}

      {view === "changes" && (
        <Card
          title="Bir kunlik o‘zgarishlar"
          sub="Bekor qilingan va ko‘chirilgan darslar"
          pad={false}
        >
          {!changes ? (
            <Spinner />
          ) : changes.length === 0 ? (
            <Empty title="O‘zgarishlar yo‘q" />
          ) : (
            <div className="a-table-scroll">
              <table className="a-table">
                <thead>
                  <tr>
                    <th>Sana</th>
                    <th>Dars</th>
                    <th>O‘zgarish</th>
                    <th>Izoh</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.id}>
                      <td>{c.date}</td>
                      <td>
                        <b>{c.subject}</b> · {c.group_name}
                      </td>
                      <td>
                        {c.kind === "cancel" ? (
                          <Pill tone="bad">bekor</Pill>
                        ) : (
                          <Pill tone="info">
                            {c.kind === "move" ? "ko‘chirildi" : "almashtirildi"}
                            {c.room ? ` → ${c.room}` : ""}
                          </Pill>
                        )}
                      </td>
                      <td className="muted">{c.note}</td>
                      <td className="actions">
                        <button
                          className="a-icon danger"
                          onClick={async () => {
                            if (await confirm("O‘zgarish bekor qilinsinmi?")) {
                              await run(() => admin.deleteChange(c.id));
                              admin.changes(sem).then((r) => setChanges(r.items));
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* dars tahriri */}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Darsni tahrirlash" : "Yangi dars"}
        width={700}
        footer={
          <>
            {edit?.id && (
              <Btn
                kind="danger"
                icon={<Trash2 size={14} />}
                onClick={async () => {
                  if (
                    edit?.id &&
                    (await confirm("Dars jadvaldan o‘chirilsinmi?"))
                  ) {
                    await run(() => admin.deleteLesson(edit.id!), "O‘chirildi");
                    setEdit(null);
                    load(true);
                  }
                }}
              >
                O‘chirish
              </Btn>
            )}
            <span style={{ flex: 1 }} />
            <Btn onClick={() => setEdit(null)}>Bekor qilish</Btn>
            <Btn
              kind="primary"
              onClick={() => save()}
              disabled={conflicts.length > 0}
              title={
                conflicts.length
                  ? "To‘qnashuv bor — saqlab bo‘lmaydi"
                  : undefined
              }
            >
              Saqlash
            </Btn>
          </>
        }
      >
        {edit && (
          <>
            <div className="a-form-grid">
              <Field label="Guruh">
                <Select
                  value={edit.group_id}
                  onChange={(v) => {
                    const f = { ...edit, group_id: v };
                    setEdit(f);
                    check(f);
                  }}
                  options={ov.groups.map((g) => ({
                    value: g.id,
                    label: `${g.name} (${g.course}-kurs)`,
                  }))}
                />
              </Field>
              <Field label="Fan">
                <Select
                  value={edit.subject_id}
                  onChange={(v) => {
                    const f = { ...edit, subject_id: v };
                    setEdit(f);
                    check(f);
                  }}
                  options={ov.subjects.map((s) => ({
                    value: s.id,
                    label: s.code ? `${s.name} (${s.code})` : s.name,
                  }))}
                />
              </Field>
              <Field label="O‘qituvchi">
                <Select
                  value={edit.teacher_id}
                  onChange={(v) => {
                    const f = { ...edit, teacher_id: v };
                    setEdit(f);
                    check(f);
                  }}
                  options={[
                    { value: "", label: "— belgilanmagan —" },
                    ...ov.teachers.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                />
              </Field>
              <Field label="Auditoriya">
                <Select
                  value={edit.room_id}
                  onChange={(v) => {
                    const f = { ...edit, room_id: v };
                    setEdit(f);
                    check(f);
                  }}
                  options={[
                    { value: "", label: "— belgilanmagan —" },
                    ...ov.rooms.map((r) => ({
                      value: r.id,
                      label: `${r.name} · ${r.building}`,
                    })),
                  ]}
                />
              </Field>
              <Field label="Hafta kuni">
                <Select
                  value={String(edit.weekday)}
                  onChange={(v) => {
                    const f = { ...edit, weekday: Number(v) };
                    setEdit(f);
                    check(f);
                  }}
                  options={ov.weekdays.map((d, i) => ({
                    value: String(i),
                    label: d,
                  }))}
                />
              </Field>
              <Field label="Juftlik">
                <Select
                  value={edit.slot_id}
                  onChange={(v) => {
                    const f = { ...edit, slot_id: v };
                    setEdit(f);
                    check(f);
                  }}
                  options={slots.map((s) => ({
                    value: s.id,
                    label: `${s.idx} · ${s.start}–${s.end}`,
                  }))}
                />
              </Field>
              <Field label="Mashg‘ulot turi">
                <Select
                  value={edit.type}
                  onChange={(v) => setEdit({ ...edit, type: v })}
                  options={TYPES}
                />
              </Field>
              <Field label="Haftalar">
                <Select
                  value={edit.parity}
                  onChange={(v) => {
                    const f = { ...edit, parity: v };
                    setEdit(f);
                    check(f);
                  }}
                  options={PARITY}
                />
              </Field>
              <Field
                label="Boshlanish sanasi"
                hint="ixtiyoriy — qisqa kurslar uchun"
              >
                <Input
                  type="date"
                  value={edit.date_from}
                  onChange={(e) =>
                    setEdit({ ...edit, date_from: e.target.value })
                  }
                />
              </Field>
              <Field label="Tugash sanasi">
                <Input
                  type="date"
                  value={edit.date_to}
                  onChange={(e) =>
                    setEdit({ ...edit, date_to: e.target.value })
                  }
                />
              </Field>
              <Field label="Izoh" wide>
                <Input
                  value={edit.note}
                  onChange={(e) => setEdit({ ...edit, note: e.target.value })}
                />
              </Field>
            </div>
            {conflicts.length > 0 && (
              <div className="a-error" style={{ display: "grid", gap: 6 }}>
                {conflicts.map((c, i) => (
                  <span key={i}>
                    <AlertTriangle size={14} /> <b>{CONFLICT_LABEL[c.kind]}:</b>{" "}
                    {c.lesson.subject} · {c.lesson.group_name} ·{" "}
                    {c.lesson.teacher || "—"} · {c.lesson.room || "—"}
                    {c.lesson.parity && c.lesson.parity !== "all"
                      ? ` (${c.lesson.parity === "odd" ? "toq" : "juft"})`
                      : ""}
                  </span>
                ))}
                <small>
                  Band vaqtga dars qo‘yib bo‘lmaydi. Bir o‘qituvchi bir xil
                  fanni bir auditoriyada bir nechta guruhga o‘tishi (qo‘shma
                  ma’ruza) to‘qnashuv hisoblanmaydi.
                </small>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* bir kunlik o'zgarish */}
      <Modal
        open={!!change}
        onClose={() => setChange(null)}
        title={
          change
            ? `${change.lesson.subject} · ${change.lesson.group_name} · ${change.date}`
            : ""
        }
        width={560}
        footer={
          <>
            {change?.lesson.change && (
              <Btn
                kind="ghost"
                onClick={async () => {
                  await run(
                    () => admin.deleteChange(change.lesson.change!.id),
                    "O‘zgarish bekor qilindi",
                  );
                  setChange(null);
                  admin.week({ semester: sem, week, [by]: sel }).then(setWk);
                }}
              >
                O‘zgarishni olib tashlash
              </Btn>
            )}
            <span style={{ flex: 1 }} />
            <Btn
              kind="ghost"
              icon={<Pencil size={14} />}
              onClick={() => {
                if (!change) return;
                setChange(null);
                setView("grid");
                openEdit(toForm(change.lesson));
              }}
            >
              Doimiy tahrir
            </Btn>
            <Btn
              kind="primary"
              onClick={async () => {
                if (!change) return;
                const r = await run(
                  () =>
                    admin.addChange({
                      lesson_id: change.lesson.id,
                      date: change.date,
                      kind: change.kind,
                      room_id: change.room_id,
                      slot_id: change.slot_id,
                      teacher_id: change.teacher_id,
                      note: change.note,
                    }),
                  "Saqlandi",
                );
                if (r) {
                  setChange(null);
                  admin.week({ semester: sem, week, [by]: sel }).then(setWk);
                }
              }}
            >
              Saqlash
            </Btn>
          </>
        }
      >
        {change && (
          <div className="a-form-grid">
            <Field label="Sana">
              <Input
                type="date"
                value={change.date}
                onChange={(e) => setChange({ ...change, date: e.target.value })}
              />
            </Field>
            <Field label="O‘zgarish turi">
              <Select
                value={change.kind}
                onChange={(v) => setChange({ ...change, kind: v })}
                options={[
                  { value: "cancel", label: "Dars bekor qilinadi" },
                  { value: "move", label: "Vaqt / auditoriya o‘zgaradi" },
                  { value: "replace", label: "O‘qituvchi almashtiriladi" },
                ]}
              />
            </Field>
            {change.kind !== "cancel" && (
              <>
                <Field label="Auditoriya">
                  <Select
                    value={change.room_id}
                    onChange={(v) => setChange({ ...change, room_id: v })}
                    options={[
                      { value: "", label: "— o‘zgarmaydi —" },
                      ...ov.rooms.map((r) => ({
                        value: r.id,
                        label: `${r.name} · ${r.building}`,
                      })),
                    ]}
                  />
                </Field>
                <Field label="Juftlik">
                  <Select
                    value={change.slot_id}
                    onChange={(v) => setChange({ ...change, slot_id: v })}
                    options={[
                      { value: "", label: "— o‘zgarmaydi —" },
                      ...slots.map((s) => ({
                        value: s.id,
                        label: `${s.idx} · ${s.start}–${s.end}`,
                      })),
                    ]}
                  />
                </Field>
                <Field label="O‘qituvchi">
                  <Select
                    value={change.teacher_id}
                    onChange={(v) => setChange({ ...change, teacher_id: v })}
                    options={[
                      { value: "", label: "— o‘zgarmaydi —" },
                      ...ov.teachers.map((t) => ({
                        value: t.id,
                        label: t.name,
                      })),
                    ]}
                  />
                </Field>
              </>
            )}
            <Field label="Izoh (talabalar ko‘radi)" wide>
              <Textarea
                rows={2}
                value={change.note}
                onChange={(e) => setChange({ ...change, note: e.target.value })}
              />
            </Field>
            <p className="a-hint">
              <CalendarOff size={13} /> O‘zgarish faqat tanlangan kunga ta’sir
              qiladi; {fmtDateTime(new Date().toISOString())} holatida
              saqlanadi.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={!!signs}
        onClose={() => setSigns(null)}
        title="Tasdiq va imzolar (davlat shakli)"
        width={620}
        footer={
          <>
            <Btn onClick={() => setSigns(null)}>Bekor qilish</Btn>
            <Btn
              kind="primary"
              onClick={async () => {
                if (!signs) return;
                const r = await run(
                  () => admin.saveFormSettings(signs),
                  "Saqlandi",
                );
                if (r) {
                  setSigns(null);
                  loadForm();
                }
              }}
            >
              Saqlash
            </Btn>
          </>
        }
      >
        {signs && (
          <div className="a-form-grid">
            <Field label="«TASDIQLAYMAN» — lavozim">
              <Input
                value={signs.approver_title}
                onChange={(e) =>
                  setSigns({ ...signs, approver_title: e.target.value })
                }
              />
            </Field>
            <Field label="F.I.Sh.">
              <Input
                value={signs.approver_name}
                onChange={(e) =>
                  setSigns({ ...signs, approver_name: e.target.value })
                }
                placeholder="masalan: A. Karimov"
              />
            </Field>
            <Field label="Pastki imzo — lavozim">
              <Input
                value={signs.head_title}
                onChange={(e) =>
                  setSigns({ ...signs, head_title: e.target.value })
                }
              />
            </Field>
            <Field label="F.I.Sh.">
              <Input
                value={signs.head_name}
                onChange={(e) =>
                  setSigns({ ...signs, head_name: e.target.value })
                }
              />
            </Field>
            <Field label="Kafedra mudiri imzosi — lavozim">
              <Input
                value={signs.dean_title}
                onChange={(e) =>
                  setSigns({ ...signs, dean_title: e.target.value })
                }
              />
            </Field>
            <Field label="F.I.Sh.">
              <Input
                value={signs.dean_name}
                onChange={(e) =>
                  setSigns({ ...signs, dean_name: e.target.value })
                }
              />
            </Field>
            <Field label="Izoh (jadval ostida)" wide>
              <Input
                value={signs.note}
                onChange={(e) => setSigns({ ...signs, note: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={copyTo !== null}
        onClose={() => setCopyTo(null)}
        title="Jadvalni nusxalash"
        width={480}
        footer={
          <>
            <Btn onClick={() => setCopyTo(null)}>Bekor qilish</Btn>
            <Btn
              kind="primary"
              disabled={!copyTo}
              onClick={async () => {
                const r = await run(() => admin.copyLessons(sem, copyTo!));
                if (r) {
                  toast(`${r.copied} ta dars nusxalandi`);
                  setCopyTo(null);
                }
              }}
            >
              Nusxalash
            </Btn>
          </>
        }
      >
        <p className="a-hint">
          Joriy ko‘rilayotgan semestr ({semName}) jadvali tanlangan semestrga
          qo‘shiladi (mavjud darslar o‘chmaydi).
        </p>
        <Field label="Qaysi semestrga">
          <Select
            value={copyTo || ""}
            onChange={(v) => setCopyTo(v)}
            options={[
              { value: "", label: "—" },
              ...ov.semesters
                .filter((s) => s.id !== sem)
                .map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </Field>
      </Modal>
    </div>
  );
}
