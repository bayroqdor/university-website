// O'quv jarayoni lug'atlari: semestrlar, dars vaqtlari, guruhlar, fanlar, auditoriyalar; ichki bildirishnomalar
import { Bell, CalendarRange, Clock, DoorOpen, Library, Pencil, Pin, Plus, Send, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Group, Item, Room, Semester, Subject, TimeSlot, User } from "../../lib/api";
import { admin, type AcadTable, type AdminNotice } from "../api";
import { Btn, Card, Empty, Field, Input, Modal, PageHead, Pill, Select, Spinner, Textarea, Toggle, fmtDateTime, useConfirm, useRun } from "../ui";

type FieldDef = { key: string; label: string; type?: "text" | "number" | "date" | "time" | "select" | "toggle" | "textarea"; options?: { value: string; label: string }[]; hint?: string; wide?: boolean };

function Dict<T extends { id: string }>({ table, title, sub, icon, fields, defaults, row, sortKey }: { table: AcadTable; title: string; sub: string; icon: ReactNode; fields: FieldDef[]; defaults: Record<string, unknown>; row: (x: T) => ReactNode; sortKey?: (x: T) => string | number }) {
  const run = useRun();
  const confirm = useConfirm();
  const [items, setItems] = useState<T[] | null>(null);
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const load = useCallback(() => admin.acad<T>(table).then((r) => setItems(r.items)).catch(() => setItems([])), [table]);
  useEffect(() => {
    load();
  }, [load]);
  const shown = items ? (sortKey ? [...items].sort((a, b) => (sortKey(a) > sortKey(b) ? 1 : -1)) : items) : [];
  return (
    <Card
      title={
        <span className="with-ic">
          {icon} {title} <Pill>{items?.length ?? ""}</Pill>
        </span>
      }
      sub={sub}
      actions={
        <Btn size="sm" kind="accent" icon={<Plus size={14} />} onClick={() => setEdit({ ...defaults })}>
          Qo‘shish
        </Btn>
      }
      pad={false}
    >
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty title="Hali yozuv yo‘q" />
      ) : (
        <div className="a-table-scroll">
          <table className="a-table">
            <tbody>
              {shown.map((x) => (
                <tr key={x.id}>
                  <td>{row(x)}</td>
                  <td className="actions">
                    <button className="a-icon" onClick={() => setEdit({ ...x })} title="Tahrirlash">
                      <Pencil size={15} />
                    </button>
                    <button
                      className="a-icon danger"
                      title="O‘chirish"
                      onClick={async () => {
                        if (await confirm("O‘chirilsinmi? Bog‘liq dars jadvali yozuvlari ham o‘chadi.")) {
                          await run(() => admin.acadDelete(table, x.id), "O‘chirildi");
                          load();
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
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Tahrirlash" : "Yangi yozuv"}
        width={620}
        footer={
          <>
            <Btn onClick={() => setEdit(null)}>Bekor qilish</Btn>
            <Btn
              kind="primary"
              onClick={async () => {
                if (!edit) return;
                const r = await run(() => admin.acadSave(table, edit, edit.id as string | undefined), "Saqlandi");
                if (r) {
                  setEdit(null);
                  load();
                }
              }}
            >
              Saqlash
            </Btn>
          </>
        }
      >
        {edit && (
          <div className="a-form-grid">
            {fields.map((f) => {
              const v = edit[f.key];
              return (
                <Field key={f.key} label={f.label} hint={f.type === "toggle" ? undefined : f.hint} wide={f.wide}>
                  {f.type === "select" ? (
                    <Select value={(v as string) || ""} onChange={(x) => setEdit({ ...edit, [f.key]: x })} options={f.options || []} />
                  ) : f.type === "toggle" ? (
                    <Toggle checked={!!v} onChange={(x) => setEdit({ ...edit, [f.key]: x })} label={f.hint || ""} />
                  ) : f.type === "textarea" ? (
                    <Textarea rows={3} value={(v as string) || ""} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} />
                  ) : (
                    <Input type={f.type || "text"} value={(v as string | number | null) ?? ""} onChange={(e) => setEdit({ ...edit, [f.key]: f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value })} />
                  )}
                </Field>
              );
            })}
          </div>
        )}
      </Modal>
    </Card>
  );
}

export function AcademicPage() {
  const [teachers, setTeachers] = useState<User[]>([]);
  const [programs, setPrograms] = useState<Item[]>([]);
  const [faculties, setFaculties] = useState<Item[]>([]);
  useEffect(() => {
    admin.users({ role: "teacher" }).then((r) => setTeachers(r.items)).catch(() => null);
    admin.acadOverview().then(() => null).catch(() => null);
    fetch("/api/programs").then((r) => r.json()).then((r) => { setPrograms(r.items || []); setFaculties(r.faculties || []); }).catch(() => null);
  }, []);
  const pid = Object.fromEntries(programs.map((p) => [p.id, p.title]));
  const fid = Object.fromEntries(faculties.map((p) => [p.id, p.title]));
  const tid = Object.fromEntries(teachers.map((p) => [p.id, p.name]));
  return (
    <div className="a-page">
      <PageHead title="O‘quv jarayoni" sub="Semestrlar, dars vaqtlari, guruhlar, fanlar va auditoriyalar — dars jadvali shular asosida tuziladi" />
      <div className="dash-grid">
        <Dict<Semester>
          table="semesters"
          title="Semestrlar"
          sub="Joriy semestr — kabinetlarda ko‘rsatiladi. «E’lon qilingan» o‘chirilsa, talabalar jadvalni ko‘rmaydi (qoralama)."
          icon={<CalendarRange size={16} />}
          defaults={{ name: "", start: "", end: "", current: false, published: true }}
          fields={[
            { key: "name", label: "Nomi", wide: true, hint: "masalan, 2025/2026 kuzgi semestr" },
            { key: "start", label: "Boshlanishi", type: "date", hint: "toq/juft haftalar shu sanadan hisoblanadi" },
            { key: "end", label: "Tugashi", type: "date" },
            { key: "current", label: "Joriy semestr", type: "toggle", hint: "kabinet va ochiq jadval shu semestrni ko‘rsatadi" },
            { key: "published", label: "E’lon qilingan", type: "toggle", hint: "talabalar va ochiq sahifa ko‘ra oladi" },
          ]}
          row={(s) => (
            <>
              <b>{s.name}</b> {s.current && <Pill tone="ok">joriy</Pill>} {!s.published && <Pill tone="warn">qoralama</Pill>}
              <br />
              <small className="muted">
                {s.start} — {s.end}
              </small>
            </>
          )}
        />
        <Dict<TimeSlot>
          table="time_slots"
          title="Dars vaqtlari (juftliklar)"
          sub="Raqam, boshlanish va tugash vaqti"
          icon={<Clock size={16} />}
          defaults={{ idx: 1, start: "08:30", end: "09:50" }}
          sortKey={(x) => x.idx}
          fields={[
            { key: "idx", label: "Raqam", type: "number" },
            { key: "start", label: "Boshlanishi", type: "time" },
            { key: "end", label: "Tugashi", type: "time" },
          ]}
          row={(x) => (
            <>
              <b>{x.idx}-juftlik</b> · {x.start}–{x.end}
            </>
          )}
        />
        <Dict<Room>
          table="rooms"
          title="Auditoriyalar"
          sub="Bino, sig‘im va turi"
          icon={<DoorOpen size={16} />}
          defaults={{ name: "", building: "", capacity: 30, type: "classroom" }}
          fields={[
            { key: "name", label: "Nomi / raqami" },
            { key: "building", label: "Bino" },
            { key: "capacity", label: "Sig‘im", type: "number" },
            { key: "type", label: "Turi", type: "select", options: [{ value: "classroom", label: "Auditoriya" }, { value: "lecture", label: "Ma’ruza zali" }, { value: "lab", label: "Laboratoriya" }, { value: "computer", label: "Kompyuter sinfi" }, { value: "gym", label: "Sport zali" }] },
          ]}
          row={(x) => (
            <>
              <b>{x.name}</b> <small className="muted">{x.building}{x.capacity ? ` · ${x.capacity} o‘rin` : ""} · {x.type}</small>
            </>
          )}
        />
        <Dict<Group>
          table="groups"
          title="Guruhlar"
          sub="Talabalar guruhga «Foydalanuvchilar» bo‘limida biriktiriladi"
          icon={<Users size={16} />}
          defaults={{ name: "", course: 1, lang: "", program_id: "", faculty_id: "", curator_id: "", year_start: new Date().getFullYear() }}
          fields={[
            { key: "name", label: "Nomi", hint: "masalan, KT-24-1" },
            { key: "course", label: "Kurs", type: "number" },
            { key: "faculty_id", label: "Kafedra", type: "select", options: [{ value: "", label: "—" }, ...faculties.map((f) => ({ value: f.id, label: f.title }))] },
            { key: "program_id", label: "Yo‘nalish", type: "select", options: [{ value: "", label: "—" }, ...programs.map((p) => ({ value: p.id, label: p.title }))] },
            { key: "lang", label: "Ta’lim tili" },
            { key: "year_start", label: "Qabul yili", type: "number" },
            { key: "curator_id", label: "Kurator", type: "select", options: [{ value: "", label: "—" }, ...teachers.map((t) => ({ value: t.id, label: t.name }))] },
            { key: "note", label: "Izoh", type: "textarea", wide: true },
          ]}
          row={(g) => (
            <>
              <b>{g.name}</b> <Pill tone="info">{g.course}-kurs</Pill> <Pill>{g.students ?? 0} talaba</Pill>
              <br />
              <small className="muted">
                {[pid[g.program_id || ""], fid[g.faculty_id || ""], g.lang, g.curator_id ? `kurator: ${tid[g.curator_id] || ""}` : ""].filter(Boolean).join(" · ")}
              </small>
            </>
          )}
        />
        <Dict<Subject>
          table="subjects"
          title="Fanlar"
          sub="Kreditlar GPA hisobida ishlatiladi"
          icon={<Library size={16} />}
          defaults={{ name: "", code: "", credits: 4, department: "" }}
          fields={[
            { key: "name", label: "Nomi", wide: true },
            { key: "code", label: "Kod" },
            { key: "credits", label: "Kreditlar", type: "number" },
            { key: "department", label: "Kafedra", wide: true },
            { key: "note", label: "Izoh", type: "textarea", wide: true },
          ]}
          row={(s) => (
            <>
              <b>{s.name}</b> {s.code && <span className="mono muted">{s.code}</span>}
              <br />
              <small className="muted">
                {s.credits ? `${s.credits} kredit` : ""}
                {s.department ? ` · ${s.department}` : ""}
              </small>
            </>
          )}
        />
        <NoticesCard />
      </div>
    </div>
  );
}

function NoticesCard() {
  const run = useRun();
  const confirm = useConfirm();
  const [items, setItems] = useState<AdminNotice[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [f, setF] = useState<{ title: string; body: string; audience: string; group_id: string; pinned: boolean } | null>(null);
  const load = useCallback(() => admin.notices().then((r) => setItems(r.items)).catch(() => setItems([])), []);
  useEffect(() => {
    load();
    admin.acad<Group>("groups").then((r) => setGroups(r.items)).catch(() => null);
  }, [load]);
  return (
    <Card
      title={
        <span className="with-ic">
          <Bell size={16} /> Ichki bildirishnomalar <Pill>{items?.length ?? ""}</Pill>
        </span>
      }
      sub="Talaba va o‘qituvchi kabinetlarida ko‘rinadi (sayt e’lonlaridan farqli)"
      actions={
        <Btn size="sm" kind="accent" icon={<Plus size={14} />} onClick={() => setF({ title: "", body: "", audience: "all", group_id: "", pinned: false })}>
          Yuborish
        </Btn>
      }
      pad={false}
    >
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty title="Hali bildirishnoma yo‘q" />
      ) : (
        <div className="a-table-scroll">
          <table className="a-table">
            <tbody>
              {items.slice(0, 30).map((n) => (
                <tr key={n.id}>
                  <td>
                    <b>
                      {n.pinned ? <Pin size={12} /> : null} {n.title}
                    </b>
                    <br />
                    <small className="muted">
                      {{ all: "Hammaga", students: "Talabalarga", teachers: "O‘qituvchilarga", group: `Guruh: ${n.group_name || ""}` }[n.audience] || n.audience} · {n.author} · {fmtDateTime(n.created)}
                    </small>
                  </td>
                  <td className="actions">
                    <button className="a-icon danger" onClick={async () => { if (await confirm("O‘chirilsinmi?")) { await run(() => admin.deleteNotice(n.id)); load(); } }}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={!!f}
        onClose={() => setF(null)}
        title="Bildirishnoma yuborish"
        width={600}
        footer={
          <>
            <Btn onClick={() => setF(null)}>Bekor qilish</Btn>
            <Btn
              kind="primary"
              icon={<Send size={14} />}
              disabled={!f?.title}
              onClick={async () => {
                if (!f) return;
                const r = await run(() => admin.saveNotice(f), "Yuborildi");
                if (r) {
                  setF(null);
                  load();
                }
              }}
            >
              Yuborish
            </Btn>
          </>
        }
      >
        {f && (
          <div className="a-form-grid">
            <Field label="Kimga">
              <Select value={f.audience} onChange={(v) => setF({ ...f, audience: v })} options={[{ value: "all", label: "Hammaga" }, { value: "students", label: "Barcha talabalarga" }, { value: "teachers", label: "O‘qituvchilarga" }, { value: "group", label: "Bitta guruhga" }]} />
            </Field>
            {f.audience === "group" && (
              <Field label="Guruh">
                <Select value={f.group_id} onChange={(v) => setF({ ...f, group_id: v })} options={[{ value: "", label: "—" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
              </Field>
            )}
            <Field label="Sarlavha" wide>
              <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </Field>
            <Field label="Matn" wide>
              <Textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
            </Field>
            <Toggle checked={f.pinned} onChange={(v) => setF({ ...f, pinned: v })} label="Muhim (yuqorida turadi)" />
          </div>
        )}
      </Modal>
    </Card>
  );
}
