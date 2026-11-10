// Rollar (qaysi rol admin panelning qaysi bo'limlarini ko'radi) va Administratorlar (admin panelga kiradigan hisoblar)
import { Check, KeyRound, Lock, Pencil, Plus, Save, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { admin, type Admin, type AdminRole, type PermDef } from "../api";
import { Btn, Card, Empty, Field, Input, Modal, PageHead, Pill, Select, Spinner, Toggle, fmtDateTime, useConfirm, useRun } from "../ui";

function groupPerms(perms: PermDef[]): [string, PermDef[]][] {
  const out: [string, PermDef[]][] = [];
  for (const p of perms) {
    const last = out[out.length - 1];
    if (last && last[0] === p.group) last[1].push(p);
    else out.push([p.group, [p]]);
  }
  return out;
}

export function RolesPage() {
  const run = useRun();
  const confirm = useConfirm();
  const [roles, setRoles] = useState<AdminRole[] | null>(null);
  const [perms, setPerms] = useState<PermDef[]>([]);
  const [sel, setSel] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const load = useCallback(
    () =>
      admin.roles().then((r) => {
        setRoles(r.items);
        setPerms(r.perms);
        setSel((s) => s || r.items.find((x) => x.id !== "superadmin")?.id || r.items[0]?.id || "");
        setDirty(false);
      }),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  const groups = useMemo(() => groupPerms(perms), [perms]);
  if (!roles) return <Spinner />;
  const cur = roles.find((r) => r.id === sel);
  const locked = cur?.id === "superadmin";
  const setCur = (p: Partial<AdminRole>) => {
    setRoles(roles.map((r) => (r.id === sel ? { ...r, ...p } : r)));
    setDirty(true);
  };
  const has = (k: string) => !!cur && (cur.perms.includes("*") || cur.perms.includes(k));
  const toggle = (keys: string[], on: boolean) => cur && setCur({ perms: on ? Array.from(new Set([...cur.perms, ...keys])) : cur.perms.filter((x) => !keys.includes(x)) });
  const save = async () => {
    const r = await run(() => admin.saveRoles(roles), "Rollar saqlandi");
    if (r) {
      setRoles(r.items);
      setDirty(false);
    }
  };
  return (
    <div className="a-page">
      <PageHead
        title="Rollar"
        sub="Har bir rolga admin panelning qaysi bo‘limlari ochiq ekanini belgilang. Ruxsat berilmagan bo‘lim administrator menyusida ko‘rinmaydi va serverda ham yopiq bo‘ladi."
        actions={
          <>
            <Btn
              icon={<Plus size={15} />}
              onClick={() => {
                const id = "r" + Math.random().toString(36).slice(2, 8);
                setRoles([...roles, { id, name: "Yangi rol", description: "", perms: ["mail"] }]);
                setSel(id);
                setDirty(true);
              }}
            >
              Yangi rol
            </Btn>
            <Btn kind="primary" icon={<Save size={15} />} onClick={save} disabled={!dirty}>
              Saqlash
            </Btn>
          </>
        }
      />
      <div className="role-layout">
        <div className="role-list">
          {roles.map((r) => (
            <button key={r.id} className={`role-item ${r.id === sel ? "on" : ""}`} onClick={() => setSel(r.id)}>
              <span className="role-ic">{r.id === "superadmin" ? <ShieldCheck size={17} /> : <KeyRound size={17} />}</span>
              <span>
                <b>{r.name}</b>
                <small>{r.perms.includes("*") ? "barcha bo‘limlar" : `${r.perms.length} ta bo‘lim`} · {r.users || 0} ta administrator</small>
              </span>
            </button>
          ))}
        </div>
        {cur && (
          <Card
            title={
              <span className="with-ic">
                {locked ? <Lock size={16} /> : <Pencil size={16} />} {cur.name}
              </span>
            }
            sub={locked ? "Bosh administrator roli barcha bo‘limlarga ega va o‘zgartirilmaydi" : "Bo‘limni belgilang — shu roldagi administratorlar menyusida paydo bo‘ladi"}
            actions={
              !locked && (
                <Btn
                  size="sm"
                  kind="danger"
                  icon={<Trash2 size={14} />}
                  onClick={async () => {
                    if (cur.users) {
                      await confirm(`«${cur.name}» roli ${cur.users} ta administratorga biriktirilgan. Avval «Administratorlar» bo‘limida ularning rolini o‘zgartiring.`, false);
                      return;
                    }
                    if (await confirm(`«${cur.name}» roli o‘chirilsinmi?`)) {
                      setRoles(roles.filter((r) => r.id !== cur.id));
                      setSel("");
                      setDirty(true);
                    }
                  }}
                >
                  O‘chirish
                </Btn>
              )
            }
          >
            {!locked && (
              <div className="a-form-grid" style={{ marginBottom: 16 }}>
                <Field label="Rol nomi">
                  <Input value={cur.name} onChange={(e) => setCur({ name: e.target.value })} />
                </Field>
                <Field label="Izoh">
                  <Input value={cur.description || ""} onChange={(e) => setCur({ description: e.target.value })} placeholder="masalan: o‘quv bo‘limi xodimlari" />
                </Field>
              </div>
            )}
            <div className="perm-grid">
              {groups.map(([g, items]) => {
                const all = items.every((p) => has(p.key));
                return (
                  <div key={g} className="perm-group">
                    <label className="perm-head">
                      <input type="checkbox" disabled={locked} checked={all} onChange={(e) => toggle(items.map((p) => p.key), e.target.checked)} />
                      <b>{g}</b>
                    </label>
                    {items.map((p) => (
                      <label key={p.key} className={`perm ${has(p.key) ? "on" : ""}`}>
                        <input type="checkbox" disabled={locked} checked={has(p.key)} onChange={(e) => toggle([p.key], e.target.checked)} />
                        <span>{p.label}</span>
                        {has(p.key) && <Check size={14} />}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
            {dirty && <p className="a-hint">O‘zgarishlar saqlanmagan — yuqoridagi «Saqlash» tugmasini bosing.</p>}
          </Card>
        )}
      </div>
    </div>
  );
}

type AdminForm = { id?: string; login: string; name: string; email: string; password: string; role_id: string; active: boolean };

export function AdminsPage({ me }: { me: Admin }) {
  const run = useRun();
  const confirm = useConfirm();
  const [list, setList] = useState<Admin[] | null>(null);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [edit, setEdit] = useState<AdminForm | null>(null);
  const load = useCallback(
    () =>
      admin.admins().then((r) => {
        setList(r.items);
        setRoles(r.roles);
      }),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  const amSuper = (me.perms || []).includes("roles") && me.role_id === "superadmin";
  const roleOpts = roles.filter((r) => amSuper || r.id !== "superadmin").map((r) => ({ value: r.id, label: r.name }));
  const save = async () => {
    if (!edit) return;
    const body: Record<string, unknown> = { login: edit.login, name: edit.name, email: edit.email, role_id: edit.role_id, active: edit.active };
    if (edit.password) body.password = edit.password;
    const r = await run(() => (edit.id ? admin.updateAdmin(edit.id, body) : admin.addAdmin(body)), "Saqlandi");
    if (r) {
      setEdit(null);
      load();
    }
  };
  return (
    <div className="a-page">
      <PageHead
        title="Administratorlar"
        sub="Admin panelga (/admin) faqat shu yerda ochilgan hisoblar kira oladi. Professor-o‘qituvchi, xodim va talabalar faqat saytdagi «Shaxsiy kabinet» orqali kiradi. Har bir administratorga rol biriktiriladi."
        actions={
          <Btn kind="accent" icon={<Plus size={15} />} onClick={() => setEdit({ login: "", name: "", email: "", password: "", role_id: roles.find((r) => r.id !== "superadmin")?.id || "superadmin", active: true })}>
            Administrator qo‘shish
          </Btn>
        }
      />
      {!list ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Card>
          <Empty title="Administratorlar yo‘q" />
        </Card>
      ) : (
        <Card pad={false}>
          <div className="a-table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Ism</th>
                  <th>Login</th>
                  <th>Rol</th>
                  <th>Oxirgi kirish</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} className={a.active ? "" : "dim"}>
                    <td>
                      <b>{a.name}</b> {a.id === me.id && <Pill tone="info">siz</Pill>}
                      {!a.active && <Pill tone="bad">bloklangan</Pill>}
                      {a.email && <small className="muted"> · {a.email}</small>}
                    </td>
                    <td className="mono">{a.login}</td>
                    <td>
                      <Pill tone={a.role_id === "superadmin" ? "accent" : "info"}>{a.role_name}</Pill>
                    </td>
                    <td className="muted">{fmtDateTime(a.last_login)}</td>
                    <td className="actions">
                      <button className="a-icon" title="Tahrirlash" onClick={() => setEdit({ id: a.id, login: a.login, name: a.name, email: a.email || "", password: "", role_id: a.role_id || "superadmin", active: a.active })}>
                        <Pencil size={15} />
                      </button>
                      {a.id !== me.id && (
                        <>
                          <button
                            className="a-icon"
                            title={a.active ? "Bloklash" : "Faollashtirish"}
                            onClick={async () => {
                              await run(() => admin.updateAdmin(a.id, { active: !a.active }));
                              load();
                            }}
                          >
                            {a.active ? <UserX size={15} /> : <UserCheck size={15} />}
                          </button>
                          <button
                            className="a-icon danger"
                            title="O‘chirish"
                            onClick={async () => {
                              if (await confirm(`${a.name} administrator hisobi o‘chirilsinmi?`)) {
                                await run(() => admin.deleteAdmin(a.id), "O‘chirildi");
                                load();
                              }
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Administratorni tahrirlash" : "Yangi administrator"}
        footer={
          <>
            <Btn onClick={() => setEdit(null)}>Bekor qilish</Btn>
            <Btn kind="primary" onClick={save}>
              Saqlash
            </Btn>
          </>
        }
      >
        {edit && (
          <div className="a-form-grid">
            <Field label="Rol" hint="bo‘limlar ro‘yxati «Rollar» sahifasida sozlanadi" wide>
              <Select value={edit.role_id} onChange={(v) => setEdit({ ...edit, role_id: v })} options={edit.role_id === "superadmin" && !amSuper ? [{ value: "superadmin", label: "Bosh administrator" }] : roleOpts} />
            </Field>
            <Field label="Ism">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Login" hint="a-z, 0-9, . _ -">
              <Input value={edit.login} onChange={(e) => setEdit({ ...edit, login: e.target.value.toLowerCase() })} autoComplete="off" />
            </Field>
            <Field label="Email">
              <Input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </Field>
            <Field label={edit.id ? "Yangi parol (bo‘sh — o‘zgarmaydi)" : "Parol"} hint="kamida 8 belgi">
              <Input type="text" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} autoComplete="new-password" />
            </Field>
            {edit.id && edit.id !== me.id && <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Faol" hint="bloklangan administrator kira olmaydi" />}
          </div>
        )}
      </Modal>
    </div>
  );
}
