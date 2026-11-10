// Foydalanuvchilar: professor-o'qituvchilar, xodimlar (bo'limlar bo'yicha), talabalar. Admin panel hisoblari — «Administratorlar» bo'limida.
import { Bell, Download, FileSpreadsheet, FolderPlus, Pencil, Plus, Search, Send, Trash2, Upload, UserCheck, UserX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Role } from "../../lib/api";
import { admin, type ImportResult, type Person, type Section } from "../api";
import { Btn, Card, Empty, Field, Input, Modal, PageHead, Pill, Select, Spinner, Textarea, Toggle, fmtDateTime, useConfirm, useRun, useToast } from "../ui";
import { PersonAvatar, PersonModal, ROLE_LABEL, useRefs, type PersonTarget } from "./People";
import { useSearchParams } from "react-router-dom";

export { ROLE_LABEL };
const ROLE_TONE: Record<Role, "accent" | "info" | "ok" | "muted"> = { admin: "accent", staff: "info", teacher: "ok", student: "muted" };
const TABS: { key: string; label: string; role?: Role }[] = [
  { key: "", label: "Barchasi" },
  { key: "teacher", label: "Professor-o‘qituvchilar", role: "teacher" },
  { key: "staff", label: "Xodimlar", role: "staff" },
  { key: "student", label: "Talabalar", role: "student" },
];

export function UsersPage() {
  const run = useRun();
  const confirm = useConfirm();
  const toast = useToast();
  const refs = useRefs();
  const [items, setItems] = useState<Person[] | null>(null);
  const [tab, setTab] = useState<string>("");
  const [group, setGroup] = useState("");
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  useEffect(() => {
    const v = sp.get("q");
    if (v !== null) setQ(v);
  }, [sp]);
  const [target, setTarget] = useState<PersonTarget>(null);
  const [secEdit, setSecEdit] = useState<Section[] | null>(null);
  const [imp, setImp] = useState<{ role: Role; file: File | null } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [notify, setNotify] = useState(false);
  const section = tab.startsWith("s:") ? tab.slice(2) : "";
  const role = section ? "" : tab;
  const load = useCallback(
    () =>
      admin
        .users({ role, group: role === "student" || !role ? group : "", q, section })
        .then((r) => setItems(r.items))
        .catch(() => setItems([])),
    [role, group, q, section],
  );
  useEffect(() => {
    const h = setTimeout(load, 200);
    return () => clearTimeout(h);
  }, [load]);
  const close = useCallback(() => setTarget(null), []);
  const students = role === "student";
  useEffect(() => setPicked(new Set()), [role, group, q, section]);
  const pick = (id: string, on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const allPicked = !!items?.length && items.every((u) => picked.has(u.id));
  const addNew = () => setTarget(section ? { role: "staff", sections: [section] } : { role: (role as Role) || "teacher" });
  return (
    <div className="a-page">
      <PageHead
        title="Foydalanuvchilar"
        sub="Professor-o‘qituvchilar, xodimlar va talabalar saytdagi «Shaxsiy kabinet» orqali kiradi (har biriga login@domen pochtasi). Admin panel hisoblari — «Administratorlar» bo‘limida."
        actions={
          <>
            {students && (
              <Btn icon={<Bell size={15} />} onClick={() => setNotify(true)}>
                Bildirishnoma yuborish{picked.size ? ` (${picked.size})` : ""}
              </Btn>
            )}
            <Btn icon={<Upload size={15} />} onClick={() => setImp({ role: role === "teacher" ? "teacher" : "student", file: null })}>
              Excel orqali qo‘shish
            </Btn>
            <Btn kind="accent" icon={<Plus size={15} />} onClick={addNew}>
              Qo‘shish
            </Btn>
          </>
        }
      />
      <div className="list-tools">
        <div className="a-seg wrap">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
          {refs.sections.map((s) => (
            <button key={s.id} className={tab === `s:${s.id}` ? "on" : ""} onClick={() => setTab(`s:${s.id}`)} title="bo‘lim">
              {s.name}
            </button>
          ))}
          <button className="seg-add" onClick={() => setSecEdit(refs.sections.map((s) => ({ id: s.id, name: s.name })))} title="Bo‘lim qo‘shish yoki tahrirlash">
            <FolderPlus size={14} /> Bo‘lim
          </button>
        </div>
        <div className="u-filters">
          {(role === "student" || !tab) && refs.groups.length > 0 && <Select value={group} onChange={setGroup} options={[{ value: "", label: "Barcha guruhlar" }, ...refs.groups.map((g) => ({ value: g.id, label: g.name }))]} />}
          <label className="a-search">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism, login, email…" />
          </label>
        </div>
      </div>
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Card>
          <Empty title="Foydalanuvchi topilmadi" />
        </Card>
      ) : (
        <Card pad={false}>
          <div className="a-table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  {students && (
                    <th className="u-pick">
                      <input type="checkbox" aria-label="Hammasini belgilash" checked={allPicked} onChange={(e) => setPicked(e.target.checked ? new Set(items.map((u) => u.id)) : new Set())} />
                    </th>
                  )}
                  <th>Ism</th>
                  <th>Login</th>
                  <th>Turi</th>
                  <th>Guruh / lavozim, bo‘limlar</th>
                  <th>Oxirgi kirish</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id} className={u.active ? "" : "dim"}>
                    {students && (
                      <td className="u-pick">
                        <input type="checkbox" aria-label={u.name} checked={picked.has(u.id)} onChange={(e) => pick(u.id, e.target.checked)} />
                      </td>
                    )}
                    <td>
                      <span className="u-cell">
                        <PersonAvatar p={u} size={32} />
                        <span>
                          <b>{u.name}</b>
                          {!u.active && <Pill tone="bad">bloklangan</Pill>}
                          {u.email && <small className="muted"> · {u.email}</small>}
                        </span>
                      </span>
                    </td>
                    <td className="mono">{u.login}</td>
                    <td>
                      <Pill tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Pill>
                    </td>
                    <td className="muted">
                      {u.role === "student" ? u.group_name || "—" : u.data?.position || "—"}
                      {(u.section_names || []).map((s) => (
                        <Pill key={s} tone="accent">
                          {s}
                        </Pill>
                      ))}
                    </td>
                    <td className="muted">{fmtDateTime(u.last_login)}</td>
                    <td className="actions">
                      <button className="a-icon" title="Tahrirlash" onClick={() => setTarget({ id: u.id })}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="a-icon"
                        title={u.active ? "Bloklash" : "Faollashtirish"}
                        onClick={async () => {
                          await run(() => admin.updateUser(u.id, { active: !u.active }));
                          load();
                        }}
                      >
                        {u.active ? <UserX size={15} /> : <UserCheck size={15} />}
                      </button>
                      <button
                        className="a-icon danger"
                        title="O‘chirish"
                        onClick={async () => {
                          if (await confirm(`${u.name} o‘chirilsinmi? Baholari va davomati saqlanadi, saytdagi profili yashiriladi, kabinetga kira olmaydi.`)) {
                            await run(() => admin.deleteUser(u.id), "O‘chirildi");
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
        </Card>
      )}

      <PersonModal target={target} onClose={close} onSaved={load} />
      {notify && <NotifyModal picked={[...picked]} group={group} groups={refs.groups} onClose={() => setNotify(false)} onSent={() => setPicked(new Set())} />}

      <Modal
        open={!!secEdit}
        onClose={() => setSecEdit(null)}
        title="Bo‘limlar"
        width={520}
        footer={
          <>
            <Btn onClick={() => setSecEdit(null)}>Bekor qilish</Btn>
            <Btn
              kind="primary"
              onClick={async () => {
                if (!secEdit) return;
                const r = await run(() => admin.saveSections(secEdit.filter((s) => s.name.trim())), "Bo‘limlar saqlandi");
                if (r) {
                  setSecEdit(null);
                  refs.reloadSections();
                }
              }}
            >
              Saqlash
            </Btn>
          </>
        }
      >
        {secEdit && (
          <div>
            <p className="a-hint" style={{ marginTop: 0 }}>
              Bo‘lim — xodimlar guruhi (o‘quv bo‘limi, kafedra, kadrlar, buxgalteriya…). Har bir bo‘lim «Foydalanuvchilar»da alohida tab bo‘ladi, pochtada esa butun bo‘limga bitta xat yozish mumkin.
            </p>
            {secEdit.map((s, i) => (
              <div key={s.id || i} className="pair-row">
                <Input value={s.name} onChange={(e) => setSecEdit(secEdit.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Bo‘lim nomi" />
                <button className="a-icon danger" onClick={() => setSecEdit(secEdit.filter((_, j) => j !== i))} aria-label="O‘chirish">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Btn size="sm" icon={<Plus size={14} />} onClick={() => setSecEdit([...secEdit, { id: "", name: "" }])}>
              Bo‘lim qo‘shish
            </Btn>
          </div>
        )}
      </Modal>

      <Modal
        open={!!imp}
        onClose={() => setImp(null)}
        title="Excel orqali qo‘shish"
        width={720}
        footer={
          <>
            <Btn onClick={() => setImp(null)}>Bekor qilish</Btn>
            <Btn
              kind="primary"
              icon={<Upload size={15} />}
              disabled={!imp?.file}
              onClick={async () => {
                if (!imp?.file) return;
                const r = await run(() => admin.importUsers(imp.role, imp.file!));
                if (r) {
                  toast(`${r.added} ta qo‘shildi${r.skipped.length ? `, ${r.skipped.length} ta qatorda izoh bor` : ""}`);
                  setResult(r);
                  setImp(null);
                  load();
                }
              }}
            >
              Yuklash va qo‘shish
            </Btn>
          </>
        }
      >
        {imp && (
          <div className="xl-import">
            <div className="a-seg">
              {(["student", "teacher"] as const).map((r) => (
                <button key={r} className={imp.role === r ? "on" : ""} onClick={() => setImp({ ...imp, role: r })}>
                  {r === "student" ? "Talabalar" : "O‘qituvchilar"}
                </button>
              ))}
            </div>
            <ol className="xl-steps">
              <li>
                <b>Namuna faylni yuklab oling</b>
                <span>Ustunlar, 2 ta namuna qator, yo‘riqnoma va mavjud {imp.role === "student" ? "guruhlar" : "fakultetlar"} ro‘yxati bilan.</span>
                <Btn
                  size="sm"
                  icon={<FileSpreadsheet size={14} />}
                  onClick={() => run(() => admin.downloadXlsx(`/api/admin/users/template.xlsx?role=${imp.role}`, `users-${imp.role === "student" ? "talabalar" : "oqituvchilar"}-namuna.xlsx`))}
                >
                  Namuna (.xlsx)
                </Btn>
              </li>
              <li>
                <b>Excel’da to‘ldiring</b>
                <span>
                  {imp.role === "student"
                    ? "Login, F.I.Sh., guruh, talaba ID, telefon. Parol bo‘sh bo‘lsa — avtomatik yaratiladi; yangi guruh avtomatik qo‘shiladi."
                    : "Login, F.I.Sh., lavozim, kafedra, fakultet(lar). Parol bo‘sh bo‘lsa — avtomatik yaratiladi."}{" "}
                  «namuna.» bilan boshlanuvchi qatorlar e’tiborga olinmaydi.
                </span>
              </li>
              <li>
                <b>Faylni yuklang</b>
                <label className={`xl-drop ${imp.file ? "has" : ""}`}>
                  <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setImp({ ...imp, file: e.target.files?.[0] || null })} />
                  <FileSpreadsheet size={22} />
                  <span>{imp.file ? imp.file.name : "Faylni tanlang yoki shu yerga tashlang (.xlsx)"}</span>
                </label>
              </li>
            </ol>
          </div>
        )}
      </Modal>

      <Modal open={!!result} onClose={() => setResult(null)} title="Import natijasi" width={760} footer={<Btn onClick={() => setResult(null)}>Yopish</Btn>}>
        {result && (
          <>
            <div className="xl-sum">
              <span className="ok">
                <b>{result.added}</b> ta hisob yaratildi
              </span>
              {result.skipped.length > 0 && (
                <span className="warn">
                  <b>{result.skipped.length}</b> ta qatorda izoh
                </span>
              )}
            </div>
            {result.created.length > 0 && (
              <>
                <p className="a-hint">Parollar faqat shu oynada ko‘rinadi — Excel faylni yuklab olib, foydalanuvchilarga yetkazing.</p>
                <Btn kind="primary" icon={<Download size={14} />} onClick={() => run(() => admin.downloadXlsx("/api/admin/users/credentials.xlsx", "user-credentials.xlsx", { items: result.created }))}>
                  Login va parollar (.xlsx)
                </Btn>
                <div className="a-table-scroll">
                  <table className="a-table" style={{ marginTop: 12 }}>
                    <thead>
                      <tr>
                        <th>F.I.Sh.</th>
                        <th>Login</th>
                        <th>Parol</th>
                        <th>Guruh / lavozim</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.created.map((c) => (
                        <tr key={c.login}>
                          <td>{c.name}</td>
                          <td className="mono">{c.login}</td>
                          <td className="mono">{c.password}</td>
                          <td className="muted">{c.extra}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {result.skipped.length > 0 && (
              <>
                <h4 style={{ margin: "18px 0 8px" }}>Qatorlar bo‘yicha izohlar</h4>
                <div className="a-table-scroll">
                  <table className="a-table">
                    <tbody>
                      {result.skipped.map((x, i) => (
                        <tr key={i}>
                          <td className="mono">{x.row}-qator</td>
                          <td className="mono">{x.login || "—"}</td>
                          <td>{x.warning ? <Pill tone="warn">{x.reason}</Pill> : <Pill tone="bad">{x.reason}</Pill>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

/** Talabalarga kabinet bildirishnomasi: belgilanganlarga, guruhga yoki barchasiga; ixtiyoriy email nusxasi. */
function NotifyModal({ picked, group, groups, onClose, onSent }: { picked: string[]; group: string; groups: { id: string; name: string }[]; onClose: () => void; onSent: () => void }) {
  const run = useRun();
  const [f, setF] = useState({
    target: picked.length ? "selected" : group ? "group" : "students",
    group_id: group,
    title: "",
    body: "",
    email: false,
    pinned: false,
  });
  const targets = [
    ...(picked.length ? [{ value: "selected", label: `Belgilangan talabalarga (${picked.length})` }] : []),
    { value: "group", label: "Guruhga" },
    { value: "students", label: "Barcha talabalarga" },
  ];
  return (
    <Modal
      open
      onClose={onClose}
      title="Talabalarga bildirishnoma"
      width={600}
      footer={
        <>
          <Btn onClick={onClose}>Bekor qilish</Btn>
          <Btn
            kind="primary"
            icon={<Send size={14} />}
            disabled={!f.title.trim() || (f.target === "group" && !f.group_id)}
            onClick={async () => {
              const r = await run(() => admin.sendNotice({ ...f, user_ids: f.target === "selected" ? picked : [] }), "Bildirishnoma yuborildi");
              if (r) {
                onSent();
                onClose();
              }
            }}
          >
            Yuborish
          </Btn>
        </>
      }
    >
      <div className="a-form-grid">
        <Field label="Kimga">
          <Select value={f.target} onChange={(v) => setF({ ...f, target: v })} options={targets} />
        </Field>
        {f.target === "group" && (
          <Field label="Guruh">
            <Select value={f.group_id} onChange={(v) => setF({ ...f, group_id: v })} options={[{ value: "", label: "—" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
          </Field>
        )}
        <Field label="Sarlavha" wide>
          <Input value={f.title} maxLength={300} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Matn" wide>
          <Textarea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <div style={{ gridColumn: "1 / -1", display: "grid", gap: 12 }}>
          <Toggle checked={f.email} onChange={(v) => setF({ ...f, email: v })} label="Emailga ham yuborish" hint="talabaning pochtasiga sayt dizaynidagi xat, «Kabinetda ochish» tugmasi bilan" />
          {f.target !== "selected" && <Toggle checked={f.pinned} onChange={(v) => setF({ ...f, pinned: v })} label="Yuqorida qadab qo‘yish" />}
        </div>
      </div>
    </Modal>
  );
}
