// Shaxslar: foydalanuvchi qo'shish/tahrirlash formasi (xodim, professor-o'qituvchi, talaba) va «Professorlar» bo'limi.
// Xodimlar foydalanuvchilardan olinadi: professor-o'qituvchi yoki xodim qo'shilsa — saytdagi profili ham yaratiladi.
import { BadgeCheck, Camera, EyeOff, GraduationCap, KeyRound, Mail, Plus, Search, Star, UserPlus, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Group, Role } from "../../lib/api";
import { admin, type Orphan, type Person, type Profile, type Section } from "../api";
import { Btn, Card, Empty, Field, Input, Modal, PageHead, Pill, Select, Spinner, TagInput, Textarea, Toggle, useRun } from "../ui";
import { LinksInput } from "./Content";
import { Avatar } from "../../lib/Avatar";
import { useSearchParams } from "react-router-dom";

export const ROLE_LABEL: Record<Role, string> = { admin: "Administrator", teacher: "Professor-o‘qituvchi", staff: "Xodim", student: "Talaba" };
export const PROF_KINDS = [
  { value: "leadership", label: "Rahbariyat" },
  { value: "professor", label: "Professor" },
  { value: "teacher", label: "O‘qituvchi" },
  { value: "visiting", label: "Xorijlik (tashrif) professor" },
];

type Opt = { value: string; label: string };
type PForm = {
  id?: string;
  role: Role;
  login: string;
  name: string;
  email: string;
  password: string;
  active: boolean;
  group_id: string;
  phone: string;
  student_no: string;
  sections: string[];
  faculty_ids: string[];
  profile: Profile;
};

export function useRefs() {
  const [facs, setFacs] = useState<Opt[]>([]);
  const [deps, setDeps] = useState<Opt[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const reloadSections = useCallback(() => admin.sections().then((r) => setSections(r.items)).catch(() => null), []);
  useEffect(() => {
    admin.items("faculty").then((r) => setFacs(r.items.map((x) => ({ value: x.id, label: x.title })))).catch(() => null);
    admin.items("department").then((r) => setDeps(r.items.map((x) => ({ value: x.id, label: x.title })))).catch(() => null);
    admin.acad<Group>("groups").then((r) => setGroups(r.items)).catch(() => null);
    reloadSections();
  }, [reloadSections]);
  return { facs, deps, groups, sections, reloadSections };
}

const randomPw = () => Math.random().toString(36).slice(2, 7) + Math.random().toString(36).slice(2, 7).toUpperCase();

const blank = (role: Role): PForm => ({
  role,
  login: "",
  name: "",
  email: "",
  password: "",
  active: true,
  group_id: "",
  phone: "",
  student_no: "",
  sections: [],
  faculty_ids: [],
  profile: { status: role === "teacher" ? "published" : "draft", category: "teacher", interests: [], spoken: [], subjects: [], links: [] },
});

export type PersonTarget = { id?: string; role?: Role; orphan?: Orphan; sections?: string[] } | null;

/** Foydalanuvchi formasi: xodim («Professor-o‘qituvchi» belgilansa — ilmiy ma’lumotlar bilan) yoki talaba */
export function PersonModal({ target, onClose, onSaved }: { target: PersonTarget; onClose: () => void; onSaved: () => void }) {
  const run = useRun();
  const refs = useRefs();
  const [f, setF] = useState<PForm | null>(null);
  // ism kiritilganda — login va institut pochtasi (login@domen) taklifi; foydalanuvchi loginni o'zi yozsa — tegilmaydi
  const [loginTouched, setLoginTouched] = useState(false);
  const [sug, setSug] = useState<{ items: { login: string; email: string }[]; domain: string; mail_ready: boolean } | null>(null);
  const [free, setFree] = useState<boolean | null>(null);
  const isNew = !!f && !f.id;
  const fname = f?.name || "";
  useEffect(() => {
    if (!isNew || fname.trim().length < 3) {
      setSug(null);
      return;
    }
    const h = window.setTimeout(() => {
      admin
        .suggestLogin(fname)
        .then((r) => {
          setSug(r);
          if (!loginTouched && r.items[0]) setF((x) => (x && !x.id ? { ...x, login: r.items[0].login } : x));
        })
        .catch(() => null);
    }, 350);
    return () => window.clearTimeout(h);
  }, [fname, isNew, loginTouched]);
  const flogin = f?.login || "";
  const fid = f?.id || "";
  useEffect(() => {
    if (flogin.length < 3) {
      setFree(null);
      return;
    }
    const h = window.setTimeout(() => admin.loginFree(flogin, fid).then((r) => setFree(r.free)).catch(() => null), 300);
    return () => window.clearTimeout(h);
  }, [flogin, fid]);
  useEffect(() => {
    setLoginTouched(false);
    setSug(null);
    if (!target) {
      setF(null);
      return;
    }
    if (target.id) {
      admin
        .person(target.id)
        .then((p) => {
          const d = (p.data || {}) as Record<string, unknown>;
          const pf = (p.profile_full || {}) as Profile;
          setF({
            id: p.id,
            role: p.role,
            login: p.login,
            name: p.name,
            email: p.email || "",
            password: "",
            active: p.active,
            group_id: p.group_id || "",
            phone: (d.phone as string) || "",
            student_no: (d.student_no as string) || "",
            sections: (d.sections as string[]) || [],
            faculty_ids: (d.faculty_ids as string[]) || [],
            profile: { ...blank(p.role).profile, ...pf, category: pf.category && pf.category !== "staff" ? pf.category : "teacher", position: pf.position || (d.position as string) || "" },
          });
        })
        .catch(() => onClose());
    } else if (target.orphan) {
      admin.item("staff", target.orphan.id).then((it) => {
        const x = it as unknown as Profile & { title: string; email?: string; phone?: string };
        const role: Role = target.orphan?.category === "staff" ? "staff" : "teacher";
        setF({ ...blank(role), name: x.title, email: x.email || "", phone: x.phone || "", password: randomPw(), profile: { ...blank(role).profile, ...x, staff_id: target.orphan?.id, category: x.category && x.category !== "staff" ? x.category : "teacher" } });
      });
    } else {
      setF({ ...blank(target.role || "teacher"), password: randomPw(), sections: target.sections || [] });
    }
  }, [target, onClose]);
  if (!target) return null;
  const set = (p: Partial<PForm>) => f && setF({ ...f, ...p });
  const setP = (p: Partial<Profile>) => f && setF({ ...f, profile: { ...f.profile, ...p } });
  const employee = f && f.role !== "student";
  const prof = f?.role === "teacher";
  const save = async () => {
    if (!f) return;
    const body: Record<string, unknown> = {
      role: f.role,
      login: f.login,
      name: f.name,
      email: f.email,
      active: f.active,
      group_id: f.role === "student" ? f.group_id : null,
      data: {
        phone: f.phone,
        ...(f.role === "student" ? { student_no: f.student_no } : { sections: f.sections, position: f.profile.position || "" }),
        ...(prof ? { faculty_ids: f.faculty_ids } : {}),
      },
    };
    if (employee) {
      const p = f.profile;
      body.profile = prof
        ? { ...p, featured: !!p.featured }
        : { position: p.position, department_id: p.department_id, faculty_id: p.faculty_id, photo: p.photo, status: p.status, staff_id: p.staff_id };
    }
    if (f.password) body.password = f.password;
    const r = await run(() => (f.id ? admin.updateUser(f.id, body) : admin.addUser(body)), f.id ? "Saqlandi" : `Qo‘shildi. Login: ${f.login}${f.password ? `, parol: ${f.password}` : ""}`);
    if (r) {
      onSaved();
      onClose();
    }
  };
  const opt = (list: Opt[]) => [{ value: "", label: "—" }, ...list];
  return (
    <Modal
      open
      onClose={onClose}
      title={f?.id ? `${f.name} — tahrirlash` : target.orphan ? "Profil uchun hisob ochish" : "Yangi foydalanuvchi"}
      width={880}
      footer={
        <>
          <Btn onClick={onClose}>Bekor qilish</Btn>
          <Btn kind="primary" onClick={save} disabled={!f}>
            Saqlash
          </Btn>
        </>
      }
    >
      {!f ? (
        <Spinner />
      ) : (
        <div className="person-form">
          <div className="person-kind">
            <div className="a-seg">
              <button className={employee ? "on" : ""} onClick={() => set({ role: prof ? "teacher" : f.role === "student" ? "staff" : f.role })}>
                Xodim
              </button>
              <button className={!employee ? "on" : ""} onClick={() => set({ role: "student" })}>
                Talaba
              </button>
            </div>
            {employee && (
              <label className={`prof-switch ${prof ? "on" : ""}`}>
                <input type="checkbox" checked={prof} onChange={(e) => set({ role: e.target.checked ? "teacher" : "staff" })} />
                <GraduationCap size={18} />
                <span>
                  <b>Professor-o‘qituvchi</b>
                  <small>dars beradi, saytda professor sahifasi: ilmiy daraja, ilmiy ishlar, biografiya</small>
                </span>
              </label>
            )}
          </div>

          <h4 className="pf-h">Hisob</h4>
          <div className="a-form-grid">
            <Field label="Ism familiya">
              <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Login" hint="a-z, 0-9, . _ - (pochta manzili ham shu: login@domen)">
              <Input
                value={f.login}
                onChange={(e) => {
                  setLoginTouched(true);
                  set({ login: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") });
                }}
                autoComplete="off"
              />
            </Field>
            {(sug?.domain || f.login) && (
              <div className={`mail-suggest ${free === false ? "taken" : ""}`}>
                <span className="ms-ic">
                  <Mail size={18} />
                </span>
                <span className="ms-main">
                  <small>Institut pochtasi</small>
                  <b>{f.login ? `${f.login}@${sug?.domain || "…"}` : "—"}</b>
                  <em>
                    {free === false
                      ? "Bu login band — boshqasini tanlang"
                      : sug && !sug.mail_ready
                        ? "Pochta serveri hali sozlanmagan — sozlangach quti avtomatik ochiladi"
                        : f.id
                          ? "Profilga ulangan pochta qutisi"
                          : "Profil yaratilganda pochta qutisi shu manzilda ochiladi va profilga ulanadi"}
                  </em>
                </span>
                {isNew && sug && sug.items.length > 1 && (
                  <span className="ms-alts">
                    {sug.items.map((x) => (
                      <button
                        key={x.login}
                        className={x.login === f.login ? "on" : ""}
                        onClick={() => {
                          setLoginTouched(true);
                          set({ login: x.login });
                        }}
                      >
                        {x.email || x.login}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            )}
            <Field label="Email (shaxsiy)" hint="ixtiyoriy, login o‘rniga ham ishlatiladi">
              <Input value={f.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label={f.id ? "Yangi parol (bo‘sh — o‘zgarmaydi)" : "Parol"} hint="kamida 8 belgi">
              <div className="pair-row" style={{ margin: 0 }}>
                <Input type="text" value={f.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
                <Btn size="sm" icon={<KeyRound size={14} />} onClick={() => set({ password: randomPw() })} title="Tasodifiy parol" />
              </div>
            </Field>
            <Field label="Telefon">
              <Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            {f.id && <Toggle checked={f.active} onChange={(v) => set({ active: v })} label="Faol" hint="bloklangan foydalanuvchi kabinetga kira olmaydi" />}
          </div>

          {f.role === "student" ? (
            <>
              <h4 className="pf-h">Talaba</h4>
              <div className="a-form-grid">
                <Field label="Guruh">
                  <Select value={f.group_id} onChange={(v) => set({ group_id: v })} options={[{ value: "", label: "— guruhsiz —" }, ...refs.groups.map((g) => ({ value: g.id, label: `${g.name} (${g.course}-kurs)` }))]} />
                </Field>
                <Field label="Talaba ID (HEMIS)">
                  <Input value={f.student_no} onChange={(e) => set({ student_no: e.target.value })} />
                </Field>
              </div>
            </>
          ) : (
            <>
              <h4 className="pf-h">Ish joyi</h4>
              <div className="a-form-grid">
                <Field label="Bo‘limlar" hint="bir kishi bir nechta bo‘limda bo‘lishi mumkin (masalan, professor ham o‘quv bo‘limi xodimi)" wide>
                  <div className="chk-list">
                    {refs.sections.map((s) => (
                      <label key={s.id} className="chk">
                        <input type="checkbox" checked={f.sections.includes(s.id)} onChange={(e) => set({ sections: e.target.checked ? [...f.sections, s.id] : f.sections.filter((x) => x !== s.id) })} />
                        {s.name}
                      </label>
                    ))}
                    {!refs.sections.length && <span className="muted">Bo‘limlar yo‘q — «Foydalanuvchilar» sahifasida «+ Bo‘lim» tugmasi bilan qo‘shing</span>}
                  </div>
                </Field>
                <Field label="Lavozim">
                  <Input value={f.profile.position || ""} onChange={(e) => setP({ position: e.target.value })} placeholder={prof ? "dotsent, katta o‘qituvchi" : "mutaxassis, buxgalter"} />
                </Field>
                <Field label="Qabul vaqti" hint="saytdagi profil va sahifalardagi «mas’ul xodim» kartasida ko‘rinadi">
                  <Input value={f.profile.hours || ""} onChange={(e) => setP({ hours: e.target.value })} placeholder="Qabul vaqti: Dushanba – Juma (09:00 – 15:00)" maxLength={200} />
                </Field>
                <Field label="Bo‘lim / markaz (tuzilma)">
                  <Select value={f.profile.department_id || ""} onChange={(v) => setP({ department_id: v })} options={opt(refs.deps)} />
                </Field>
                <Field label="Kafedra">
                  <Select value={f.profile.faculty_id || ""} onChange={(v) => setP({ faculty_id: v })} options={opt(refs.facs)} />
                </Field>
                <Field label="Saytda">
                  <Select
                    value={f.profile.status || "draft"}
                    onChange={(v) => setP({ status: v })}
                    options={[
                      { value: "published", label: "Profil saytda ko‘rinadi" },
                      { value: "draft", label: "Yashirin" },
                    ]}
                  />
                </Field>
                <Field label="Surat" hint="yuz aniq ko‘rinadigan portret — tizim yuzni tekshiradi va markazlab kesadi">
                  <FacePhoto value={f.profile.photo || ""} name={f.name} onChange={(v) => setP({ photo: v })} />
                </Field>
              </div>
            </>
          )}

          {prof && (
            <>
              <h4 className="pf-h">Professor-o‘qituvchi</h4>
              <div className="a-form-grid">
                <Field label="Toifa">
                  <Select value={f.profile.category || "teacher"} onChange={(v) => setP({ category: v })} options={PROF_KINDS} />
                </Field>
                <Field label="Ilmiy daraja / unvon">
                  <Input value={f.profile.degree || ""} onChange={(e) => setP({ degree: e.target.value })} placeholder="PhD, dotsent" />
                </Field>
                {refs.facs.length > 0 && (
                  <Field label="Dars jadvali ko‘rinadigan kafedralar" hint="kabinetda shu kafedralar jadvali ko‘rinadi (dars o‘tadigan guruhlar kafedrasi avtomatik qo‘shiladi)" wide>
                    <div className="chk-list">
                      {refs.facs.map((x) => (
                        <label key={x.value} className="chk">
                          <input type="checkbox" checked={f.faculty_ids.includes(x.value)} onChange={(e) => set({ faculty_ids: e.target.checked ? [...f.faculty_ids, x.value] : f.faculty_ids.filter((y) => y !== x.value) })} />
                          {x.label}
                        </label>
                      ))}
                    </div>
                  </Field>
                )}
                <Field label="Qisqacha (biografiya)" wide>
                  <Textarea rows={3} value={f.profile.bio || ""} onChange={(e) => setP({ bio: e.target.value })} />
                </Field>
                <Field label="Ilmiy ishlar" hint="maqolalar, monografiyalar, darsliklar — har qatorga bittasi" wide>
                  <Textarea rows={5} value={f.profile.publications || ""} onChange={(e) => setP({ publications: e.target.value })} />
                </Field>
                <Field label="Ta’lim" hint="har qatorga bitta: yil — muassasa" wide>
                  <Textarea rows={3} value={f.profile.education || ""} onChange={(e) => setP({ education: e.target.value })} />
                </Field>
                <Field label="Tajriba" wide>
                  <Textarea rows={3} value={f.profile.experience || ""} onChange={(e) => setP({ experience: e.target.value })} />
                </Field>
                <Field label="Ilmiy qiziqishlar">
                  <TagInput value={f.profile.interests || []} onChange={(v) => setP({ interests: v })} />
                </Field>
                <Field label="O‘qitadigan fanlari">
                  <TagInput value={f.profile.subjects || []} onChange={(v) => setP({ subjects: v })} />
                </Field>
                <Field label="Tillar">
                  <TagInput value={f.profile.spoken || []} onChange={(v) => setP({ spoken: v })} />
                </Field>
                <Toggle checked={!!f.profile.featured} onChange={(v) => setP({ featured: v })} label="Bosh sahifada" hint="professorlar lentasida ko‘rsatish" />
                <Field label="Havolalar (ORCID, Scholar, LinkedIn…)" wide>
                  <LinksInput value={f.profile.links || []} onChange={(v) => setP({ links: v })} />
                </Field>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Surat: yuklangan rasm serverda yuz bo'yicha tekshiriladi (hayvon, manzara rad etiladi) va 512×512 qilib kesiladi */
export function FacePhoto({ value, name, onChange }: { value: string; name: string; onChange: (url: string) => void }) {
  const run = useRun();
  const [busy, setBusy] = useState(false);
  return (
    <div className="face-photo">
      <Avatar name={name} photo={value} size={88} />
      <div className="face-photo-btns">
        <label className="a-btn sm">
          <Camera size={14} />
          <span>{busy ? "Tekshirilmoqda…" : value ? "Almashtirish" : "Surat yuklash"}</span>
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              const r = await run(() => admin.photoCheck(file));
              setBusy(false);
              if (r) onChange(r.url);
            }}
          />
        </label>
        {value && (
          <Btn size="sm" kind="ghost" onClick={() => onChange("")}>
            Olib tashlash
          </Btn>
        )}
      </div>
    </div>
  );
}

export function PersonAvatar({ p, size = 44 }: { p: { name?: string; title?: string; photo?: string }; size?: number }) {
  return <Avatar name={p.name || p.title} photo={p.photo} size={size} />;
}

/** «Professorlar»: professor-o‘qituvchilar (foydalanuvchilardan) va boshqa xodimlarning sayt profillari */
export function ProfessorsPage() {
  const [kind, setKind] = useState<"professors" | "staff">("professors");
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  useEffect(() => {
    const v = sp.get("q");
    if (v !== null) setQ(v);
  }, [sp]);
  const [data, setData] = useState<{ items: Person[]; orphans: Orphan[] } | null>(null);
  const [target, setTarget] = useState<PersonTarget>(null);
  const load = useCallback(() => admin.people(kind, q).then(setData).catch(() => setData({ items: [], orphans: [] })), [kind, q]);
  useEffect(() => {
    const h = setTimeout(load, 200);
    return () => clearTimeout(h);
  }, [load]);
  const close = useCallback(() => setTarget(null), []);
  return (
    <div className="a-page">
      <PageHead
        title="Professorlar"
        sub="Professor-o‘qituvchilar foydalanuvchilardan olinadi: «Foydalanuvchilar»da «Professor-o‘qituvchi» belgisi bilan qo‘shilgan har bir kishi shu yerda va saytda ko‘rinadi. Bu yerda qo‘shsangiz ham — kabinet hisobi birga ochiladi."
        actions={
          <Btn kind="accent" icon={<UserPlus size={15} />} onClick={() => setTarget({ role: kind === "professors" ? "teacher" : "staff" })}>
            {kind === "professors" ? "Professor qo‘shish" : "Xodim qo‘shish"}
          </Btn>
        }
      />
      <div className="list-tools">
        <div className="a-seg">
          <button className={kind === "professors" ? "on" : ""} onClick={() => setKind("professors")}>
            Professor-o‘qituvchilar
          </button>
          <button className={kind === "staff" ? "on" : ""} onClick={() => setKind("staff")}>
            Boshqa xodimlar
          </button>
        </div>
        <label className="a-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism…" />
        </label>
      </div>
      {!data ? (
        <Spinner />
      ) : (
        <>
          {data.items.length === 0 ? (
            <Card>
              <Empty icon={<UsersRound size={28} />} title="Hali hech kim yo‘q" />
            </Card>
          ) : (
            <div className="pp-grid">
              {data.items.map((p) => (
                <button key={p.id} className={`pp-card ${p.active ? "" : "dim"}`} onClick={() => setTarget({ id: p.id })}>
                  <PersonAvatar p={p} size={64} />
                  <span className="pp-body">
                    <b>
                      {p.profile?.featured && <Star size={13} className="star" />} {p.name}
                    </b>
                    <small>{p.data?.position || "—"}</small>
                    <span className="pp-tags">
                      {p.profile?.category && <Pill tone="info">{PROF_KINDS.find((k) => k.value === p.profile?.category)?.label || "Xodim"}</Pill>}
                      {p.profile?.status === "published" ? (
                        <Pill tone="ok">
                          <BadgeCheck size={11} /> saytda
                        </Pill>
                      ) : (
                        <Pill>
                          <EyeOff size={11} /> yashirin
                        </Pill>
                      )}
                      {(p.section_names || []).map((s) => (
                        <Pill key={s} tone="accent">
                          {s}
                        </Pill>
                      ))}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {data.orphans.length > 0 && (
            <Card title="Hisobi yo‘q profillar" sub="Bu profillar foydalanuvchiga bog‘lanmagan. «Hisob ochish» — kabinet hisobi yaratiladi va profil unga bog‘lanadi." pad={false}>
              <div className="a-table-scroll">
                <table className="a-table">
                  <tbody>
                    {data.orphans.map((o) => (
                      <tr key={o.id}>
                        <td style={{ width: 56 }}>
                          <PersonAvatar p={o} size={36} />
                        </td>
                        <td>
                          <b>{o.title}</b>
                          <small className="muted"> · {o.position}</small>
                        </td>
                        <td className="actions">
                          <Btn size="sm" icon={<Plus size={14} />} onClick={() => setTarget({ orphan: o })}>
                            Hisob ochish
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
      <PersonModal target={target} onClose={close} onSaved={load} />
    </div>
  );
}
