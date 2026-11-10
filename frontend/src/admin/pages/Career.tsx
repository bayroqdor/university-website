// Admin: hamkorlik va karyera — karyera markazi (imkoniyatlar, moderatsiya, ma'lumot bloki), hamkorlar va amaliyot bazalari,
// bitiruvchilar (hikoyalar, ro'yxat, bandlik statistikasi), startaplar, foydali maqolalar
import type { JSONContent } from "@tiptap/core";
import { Briefcase, Check, Download, ExternalLink, FileText, GraduationCap, Handshake, Lightbulb, Pencil, Plus, Search, Star, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { Lang } from "../../lib/api";
import { RichEditor } from "../../editor/RichEditor";
import { ca, type CareerSettings, type CKind, type Rec, type RegistryRow, type StatRow } from "../career-api";
import { Btn, Card, Empty, Field, ImageField, Input, LangBadges, LangTabs, LANG_LABEL, Modal, PageHead, Pill, Select, Spinner, TagInput, Textarea, Toggle, fmtDateTime, useBaseLang, useConfirm, useRun } from "../ui";
import { SiteLink, SiteNote, useSiteSection } from "../SiteStatus";
import "../../styles/career-admin.css";

type Opt = { value: string; label: string };
type Tone = "ok" | "warn" | "bad" | "muted" | "accent" | "info";
const STATUS: Record<string, [string, Tone]> = {
  pending: ["Moderatsiyada", "warn"],
  published: ["Nashr qilingan", "ok"],
  scheduled: ["Rejalashtirilgan", "info"],
  expired: ["Muddati tugagan", "muted"],
  rejected: ["Rad etilgan", "bad"],
  draft: ["Qoralama", "muted"],
};
const OPP_TYPES: Opt[] = [
  { value: "internship", label: "Amaliyot" },
  { value: "full_time", label: "To‘liq stavka" },
  { value: "part_time", label: "Yarim stavka" },
  { value: "traineeship", label: "Stajirovka" },
  { value: "project", label: "Loyiha" },
];
const PARTNER_TYPES: Opt[] = [
  { value: "industry", label: "Sanoat" },
  { value: "international", label: "Xalqaro" },
  { value: "academic", label: "Akademik" },
  { value: "government", label: "Davlat" },
];
const STAGES: Opt[] = [
  { value: "idea", label: "G‘oya" },
  { value: "prototype", label: "Prototip" },
  { value: "pilot", label: "Pilot" },
  { value: "market", label: "Bozorda" },
];
const SCATS: Opt[] = [
  { value: "food_tech", label: "Oziq-ovqat texnologiyasi" },
  { value: "packaging", label: "Qadoqlash" },
  { value: "processing", label: "Qayta ishlash" },
  { value: "agro", label: "Agrotexnologiya" },
  { value: "ecology", label: "Ekologiya" },
  { value: "digital", label: "Raqamli yechimlar" },
  { value: "equipment", label: "Uskunalar" },
  { value: "other", label: "Boshqa" },
];
const TOPICS: Opt[] = [
  { value: "food_safety", label: "Oziq-ovqat xavfsizligi" },
  { value: "nutrition", label: "Sog‘lom ovqatlanish" },
  { value: "technology", label: "Texnologiya" },
  { value: "quality", label: "Sifat va standartlar" },
  { value: "processing", label: "Qayta ishlash" },
  { value: "ecology", label: "Ekologiya" },
  { value: "economics", label: "Iqtisodiyot" },
  { value: "other", label: "Boshqa" },
];
const TEAM_KINDS: Opt[] = [
  { value: "student", label: "Talaba" },
  { value: "teacher", label: "O‘qituvchi" },
  { value: "graduate", label: "Bitiruvchi" },
  { value: "other", label: "Boshqa" },
];
const PUB: Opt[] = [
  { value: "draft", label: "Qoralama" },
  { value: "published", label: "Nashr qilingan" },
];
const label = (opts: Opt[], v: unknown) => opts.find((o) => o.value === v)?.label || String(v || "");

/* ------------------------------------------------------------------ ma'lumotnomalar (yo'nalishlar, hamkorlar, xodimlar) */
type Refs = { programs: Opt[]; partners: (Opt & { logo?: string })[]; staff: (Opt & { photo?: string })[] };
function useRefs(): Refs {
  const [r, setR] = useState<Refs>({ programs: [], partners: [], staff: [] });
  useEffect(() => {
    Promise.all([ca.items("program"), ca.items("partner"), ca.items("staff")])
      .then(([p, pa, s]) =>
        setR({
          programs: p.items.map((x) => ({ value: x.id, label: x.title })),
          partners: pa.items.map((x) => ({ value: x.id, label: x.title, logo: x.logo as string })),
          staff: s.items.map((x) => ({ value: x.id, label: x.position ? `${x.title} — ${x.position}` : x.title, photo: x.photo as string })),
        }),
      )
      .catch(() => null);
  }, []);
  return r;
}

/** Murakkab maydonlar uchun (bir nechta input) — <label> emas, guruh */
function Group({ label: l, hint, wide, children }: { label: string; hint?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`a-field ${wide ? "wide" : ""}`} role="group" aria-label={l}>
      <span className="a-label">{l}</span>
      {children}
      {hint && <span className="a-hint">{hint}</span>}
    </div>
  );
}

function MultiCheck({ value, onChange, options }: { value: string[]; onChange: (v: string[]) => void; options: Opt[] }) {
  return (
    <div className="ca-checks">
      {options.map((o) => (
        <label key={o.value} className="ca-check">
          <input type="checkbox" checked={value.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((x) => x !== o.value))} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

function LinesInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState((value || []).join("\n"));
  useEffect(() => {
    if ((value || []).join("\n") !== text.split("\n").filter((x) => x.trim()).join("\n")) setText((value || []).join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Textarea
      rows={4}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.split("\n").map((x) => x.trim()).filter(Boolean));
      }}
    />
  );
}

type Member = { name: string; role: string; kind: string; staff_id: string };
function TeamInput({ value, onChange, staff }: { value: Member[]; onChange: (v: Member[]) => void; staff: Opt[] }) {
  const upd = (i: number, p: Partial<Member>) => onChange(value.map((m, j) => (j === i ? { ...m, ...p } : m)));
  return (
    <div className="ca-rows">
      {value.map((m, i) => (
        <div key={i} className="ca-row4">
          <Input value={m.name} placeholder="Ism, familiya" aria-label="Ism, familiya" onChange={(e) => upd(i, { name: e.target.value })} />
          <Input value={m.role} placeholder="Roli (muallif, dasturchi…)" aria-label="Roli" onChange={(e) => upd(i, { role: e.target.value })} />
          <Select value={m.kind || "student"} onChange={(v) => upd(i, { kind: v })} options={TEAM_KINDS} />
          <Select
            value={m.staff_id || ""}
            onChange={(v) => upd(i, { staff_id: v, name: m.name || (staff.find((s) => s.value === v)?.label.split(" — ")[0] ?? "") })}
            options={[{ value: "", label: "Xodim profili (ixtiyoriy)" }, ...staff]}
          />
          <button type="button" className="a-icon danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="O‘chirish" title="O‘chirish">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <Btn size="sm" icon={<Plus size={14} />} onClick={() => onChange([...value, { name: "", role: "", kind: "student", staff_id: "" }])}>
        A’zo qo‘shish
      </Btn>
    </div>
  );
}

type Source = { title: string; url: string };
function SourcesInput({ value, onChange }: { value: Source[]; onChange: (v: Source[]) => void }) {
  return (
    <div className="ca-rows">
      {value.map((s, i) => (
        <div key={i} className="pair-row">
          <Input value={s.title} placeholder="Manba nomi" aria-label="Manba nomi" onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
          <Input value={s.url} placeholder="https://" aria-label="Havola" onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          <button type="button" className="a-icon danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="O‘chirish" title="O‘chirish">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <Btn size="sm" icon={<Plus size={14} />} onClick={() => onChange([...value, { title: "", url: "" }])}>
        Manba qo‘shish
      </Btn>
    </div>
  );
}

function ImagesInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="ca-images">
      {value.map((u, i) => (
        <div key={`${u}-${i}`} className="ca-image">
          <ImageField value={u} onChange={(x) => onChange(x ? value.map((y, j) => (j === i ? x : y)) : value.filter((_, j) => j !== i))} aspect="4 / 3" />
        </div>
      ))}
      {value.length < 20 && (
        <div className="ca-image">
          <ImageField value="" onChange={(x) => x && onChange([...value, x])} aspect="4 / 3" />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ maydonlar va muharrir */
type FT = "text" | "textarea" | "select" | "toggle" | "tags" | "image" | "photo" | "images" | "rich" | "multi" | "date" | "datetime" | "number" | "float" | "ref" | "team" | "sources" | "lines";
type FDef = { key: string; label: string; type: FT; options?: Opt[] | ((r: Refs) => Opt[]); wide?: boolean; hint?: string; placeholder?: string; show?: (d: Rec) => boolean; empty?: string };

function toDate(iso: unknown): string {
  if (!iso || typeof iso !== "string") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function FieldInput({ f, v, set, refs }: { f: FDef; v: unknown; set: (v: unknown) => void; refs: Refs }) {
  const opts = typeof f.options === "function" ? f.options(refs) : f.options || [];
  switch (f.type) {
    case "textarea":
      return (
        <Field label={f.label} hint={f.hint} wide={f.wide}>
          <Textarea rows={3} value={(v as string) || ""} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />
        </Field>
      );
    case "select":
      return (
        <Field label={f.label} hint={f.hint} wide={f.wide}>
          <Select value={(v as string) || opts[0]?.value || ""} onChange={set} options={opts} />
        </Field>
      );
    case "ref":
      return (
        <Field label={f.label} hint={f.hint} wide={f.wide}>
          <Select value={(v as string) || ""} onChange={set} options={[{ value: "", label: f.empty || "—" }, ...opts]} />
        </Field>
      );
    case "toggle":
      return (
        <div className={`a-field ${f.wide ? "wide" : ""}`}>
          <Toggle checked={!!v} onChange={set} label={f.label} hint={f.hint} />
        </div>
      );
    case "tags":
      return (
        <Group label={f.label} hint={f.hint} wide={f.wide}>
          <TagInput value={(v as string[]) || []} onChange={set} />
        </Group>
      );
    case "lines":
      return (
        <Field label={f.label} hint={f.hint} wide={f.wide}>
          <LinesInput value={(v as string[]) || []} onChange={set} placeholder={f.placeholder} />
        </Field>
      );
    case "image":
    case "photo":
      return (
        <Group label={f.label} hint={f.hint} wide={f.wide}>
          <div className={f.type === "photo" ? "ca-photo" : "ca-logo"}>
            <ImageField value={(v as string) || ""} onChange={set} aspect={f.type === "photo" ? "1 / 1" : "16 / 9"} />
          </div>
        </Group>
      );
    case "images":
      return (
        <Group label={f.label} hint={f.hint} wide>
          <ImagesInput value={(v as string[]) || []} onChange={set} />
        </Group>
      );
    case "multi":
      return (
        <Group label={f.label} hint={f.hint} wide>
          <MultiCheck value={(v as string[]) || []} onChange={set} options={opts} />
        </Group>
      );
    case "date":
      return (
        <Field label={f.label} hint={f.hint} wide={f.wide}>
          <Input type="date" value={toDate(v)} onChange={(e) => set(e.target.value ? `${e.target.value}T23:59:59+05:00` : null)} />
        </Field>
      );
    case "datetime":
      return (
        <Field label={f.label} hint={f.hint} wide={f.wide}>
          <Input type="datetime-local" value={typeof v === "string" && v ? toLocal(v) : ""} onChange={(e) => set(e.target.value ? new Date(e.target.value).toISOString() : null)} />
        </Field>
      );
    case "number":
    case "float":
      return (
        <Field label={f.label} hint={f.hint} wide={f.wide}>
          <Input type="number" step={f.type === "float" ? "any" : "1"} value={v == null ? "" : String(v)} placeholder={f.placeholder} onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))} />
        </Field>
      );
    case "team":
      return (
        <Group label={f.label} hint={f.hint} wide>
          <TeamInput value={(v as Member[]) || []} onChange={set} staff={refs.staff} />
        </Group>
      );
    case "sources":
      return (
        <Group label={f.label} hint={f.hint} wide>
          <SourcesInput value={(v as Source[]) || []} onChange={set} />
        </Group>
      );
    default:
      return (
        <Field label={f.label} hint={f.hint} wide={f.wide}>
          <Input value={(v as string) || ""} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />
        </Field>
      );
  }
}

function toLocal(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Editor({ kind, initial, fields, i18n, onClose, onSaved, top, title }: { kind: CKind; initial: Rec; fields: FDef[]; i18n: string[]; onClose: () => void; onSaved: (r: Rec) => void; top?: (d: Rec, reload: (r: Rec) => void) => ReactNode; title: string }) {
  const run = useRun();
  const refs = useRefs();
  const base = useBaseLang();
  const [d, setD] = useState<Rec>(initial);
  const [stored, setStored] = useState<Rec>(initial); // serverdagi holat: «Saytda ochish» faqat haqiqatan chop etilgan bo'lsa
  const [lang, setLang] = useState<Lang | null>(null);
  const [busy, setBusy] = useState(false);
  const [edKey, setEdKey] = useState(0);
  const tr: Lang | null = base && lang && lang !== base ? lang : null;
  const trOf = (l: Lang) => (d.i18n?.[l] || {}) as Record<string, unknown>;
  const get = (k: string) => (tr ? trOf(tr)[k] : d[k]);
  const set = (k: string, v: unknown) =>
    setD((x) => {
      if (!tr) return { ...x, [k]: v };
      const all = { ...(x.i18n || {}) };
      all[tr] = { ...(all[tr] || {}), [k]: v };
      return { ...x, i18n: all };
    });
  const setRich = (o: { json: JSONContent; html: string; text: string }) => {
    set("content", o.json);
    setD((x) => {
      if (!tr) return { ...x, content: o.json, html: o.html, text: o.text };
      const all = { ...(x.i18n || {}) };
      all[tr] = { ...(all[tr] || {}), content: o.json, html: o.html, text: o.text };
      return { ...x, i18n: all };
    });
  };
  const save = async () => {
    setBusy(true);
    const r = await run(() => ca.save(kind, d), "Saqlandi");
    setBusy(false);
    if (r) {
      // oyna ochiq qoladi: keyingi «Saqlash» yangi yozuv yaratmasin (id), server qaytargan holat (masalan, muddati o'tgan) ko'rinsin
      setD(r);
      setStored(r);
      onSaved(r);
    }
  };
  const shown = fields.filter((f) => (!tr || i18n.includes(f.key)) && (!f.show || f.show(d)));
  return (
    <Modal
      open
      onClose={onClose}
      title={d.id ? `${title}: tahrirlash` : `${title}: yangi`}
      width={980}
      footer={
        <>
          {typeof stored.slug === "string" && stored.slug && stored.status === "published" && SITE_PATH[kind] && (
            <a className="a-btn ghost md" href={`${SITE_PATH[kind]}/${stored.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> <span>Saytda ochish</span>
            </a>
          )}
          <Btn onClick={onClose}>Bekor qilish</Btn>
          <Btn kind="primary" busy={busy} onClick={save}>
            Saqlash
          </Btn>
        </>
      }
    >
      {top?.(d, (r) => {
        setD(r);
        setStored(r);
        onSaved(r);
      })}
      {base && i18n.length > 0 && (
        <div className="modal-lang">
          <LangTabs
            value={lang || base}
            base={base}
            onChange={(l) => {
              setLang(l);
              setEdKey((k) => k + 1);
            }}
            filled={(l) => !!(l === base ? d.title || d.position : trOf(l).title || trOf(l).position || trOf(l).html)}
          />
          {tr && <p className="a-hint">{LANG_LABEL[tr]}: faqat matnli maydonlar tarjima qilinadi; bo‘sh qolganlari saytda asosiy tilda chiqadi.</p>}
        </div>
      )}
      <div className="a-form-grid">
        {shown.map((f) =>
          f.type === "rich" ? (
            <Group key={f.key} label={f.label} hint={f.hint} wide>
              <div className="ca-rich">
                <RichEditor key={`${tr || "base"}-${edKey}`} value={((tr ? trOf(tr).content || trOf(tr).html : d.content || d.html) as JSONContent | string | null) || null} onChange={setRich} />
              </div>
            </Group>
          ) : (
            <FieldInput key={f.key} f={f} v={get(f.key)} set={(v) => set(f.key, v)} refs={refs} />
          ),
        )}
      </div>
    </Modal>
  );
}

const SITE_PATH: Partial<Record<CKind, string>> = { opportunity: "/career-center", partner: "/partners", alumni: "/alumni", startup: "/startups", insight: "/articles" };

/* ------------------------------------------------------------------ ro'yxat */
function Records({
  kind,
  title,
  sub,
  icon,
  fields,
  i18n,
  defaults,
  row,
  thumb,
  statuses,
  filters,
  top,
  empty,
  extraActions,
  reloadKey = 0,
}: {
  kind: CKind;
  title: string;
  sub: string;
  icon: ReactNode;
  fields: FDef[];
  i18n: string[];
  defaults: Record<string, unknown>;
  row: (x: Rec) => ReactNode;
  thumb?: (x: Rec) => string | undefined;
  statuses?: Opt[];
  filters?: (items: Rec[], set: (f: (x: Rec) => boolean) => void) => ReactNode;
  top?: (d: Rec, reload: (r: Rec) => void) => ReactNode;
  empty: string;
  extraActions?: (x: Rec, reload: () => void) => ReactNode;
  reloadKey?: number;
}) {
  const run = useRun();
  const confirm = useConfirm();
  const [items, setItems] = useState<Rec[] | null>(null);
  const [edit, setEdit] = useState<Rec | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [flt, setFlt] = useState<{ f: (x: Rec) => boolean }>({ f: () => true });
  const [params, setParams] = useSearchParams();
  const load = useCallback(() => ca.items(kind).then((r) => setItems(r.items)).catch(() => setItems([])), [kind]);
  useEffect(() => {
    load();
  }, [load, reloadKey]);
  const open = useCallback(
    (id: string) =>
      ca
        .item(kind, id)
        .then(setEdit)
        .catch(() => null),
    [kind],
  );
  useEffect(() => {
    const id = params.get("id");
    if (id) {
      open(id);
      params.delete("id");
      setParams(params, { replace: true });
    }
  }, [params, setParams, open]);
  const shown = (items || []).filter((x) => (!status || x.status === status) && flt.f(x) && (!q || `${x.title} ${x.company || ""} ${x.country || ""}`.toLowerCase().includes(q.toLowerCase())));
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const x of items || []) c[x.status || ""] = (c[x.status || ""] || 0) + 1;
    return c;
  }, [items]);
  const sitePath = SITE_PATH[kind] || "";
  const site = useSiteSection(sitePath, items);
  return (
    <div className="a-page">
      <PageHead
        title={title}
        sub={sub}
        actions={
          <>
            <SiteLink path={sitePath} state={site} />
            <Btn kind="accent" icon={<Plus size={16} />} onClick={() => setEdit({ id: "", title: "", ...defaults } as Rec)}>
              Qo‘shish
            </Btn>
          </>
        }
      />
      <SiteNote state={site} />
      <div className="list-tools ca-tools">
        <div className="ca-tools-l">
          {statuses && (
            <div className="a-seg" role="group" aria-label="Holat">
              <button type="button" className={!status ? "on" : ""} aria-pressed={!status} onClick={() => setStatus("")}>
                Barchasi ({items?.length ?? 0})
              </button>
              {statuses.map((s) => (
                <button key={s.value} type="button" className={status === s.value ? "on" : ""} aria-pressed={status === s.value} onClick={() => setStatus(s.value)}>
                  {s.label} ({counts[s.value] || 0})
                </button>
              ))}
            </div>
          )}
          {filters?.(items || [], (f) => setFlt({ f }))}
        </div>
        <label className="a-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish…" aria-label="Qidirish" />
        </label>
      </div>
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Card>
          <Empty icon={icon} title={empty}>
            <Btn kind="accent" icon={<Plus size={15} />} onClick={() => setEdit({ id: "", title: "", ...defaults } as Rec)}>
              Qo‘shish
            </Btn>
          </Empty>
        </Card>
      ) : (
        <div className="doc-list">
          {shown.length === 0 && <p className="ca-none">Tanlangan filtr bo‘yicha yozuv yo‘q.</p>}
          {shown.map((x) => (
            <div key={x.id} className={`doc-row ${x.status !== "published" && x.status !== "pending" && x.status !== "scheduled" ? "dim" : ""}`}>
              {thumb && (
                <div className="doc-thumb ca-thumb">
                  {thumb(x) ? <img src={thumb(x)} alt="" /> : <span>{String(x.company || x.title || "?").slice(0, 2).toUpperCase()}</span>}
                </div>
              )}
              <button type="button" className="doc-main ca-open" onClick={() => open(x.id)}>
                {row(x)}
                <LangBadges langs={x.langs as Lang[] | undefined} />
              </button>
              <div className="doc-actions">
                {extraActions?.(x, load)}
                {x.slug && x.status === "published" && SITE_PATH[kind] && (
                  <a className="a-icon" href={`${SITE_PATH[kind]}/${x.slug}`} target="_blank" rel="noreferrer" title="Saytda ochish" aria-label="Saytda ochish">
                    <ExternalLink size={15} />
                  </a>
                )}
                <button type="button" className="a-icon" onClick={() => open(x.id)} title="Tahrirlash" aria-label="Tahrirlash">
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  className="a-icon danger"
                  title="O‘chirish"
                  aria-label="O‘chirish"
                  onClick={async () => {
                    if (!(await confirm(`«${x.title}» o‘chirilsinmi?`))) return;
                    await run(() => ca.remove(kind, x.id), "O‘chirildi");
                    load();
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && (
        <Editor
          kind={kind}
          title={title}
          initial={edit}
          fields={fields}
          i18n={i18n}
          top={top}
          onClose={() => setEdit(null)}
          onSaved={(r) => {
            setEdit(r);
            load();
          }}
        />
      )}
    </div>
  );
}

const StatusPill = ({ s }: { s?: string }) => (s && STATUS[s] ? <Pill tone={STATUS[s][1]}>{STATUS[s][0]}</Pill> : null);

/* ================================================================== karyera markazi */
const OPP_FIELDS: FDef[] = [
  { key: "title", label: "Lavozim yoki loyiha nomi", type: "text", wide: true },
  { key: "company", label: "Kompaniya", type: "text" },
  { key: "partner_id", label: "Hamkor (bo‘lsa)", type: "ref", options: (r) => r.partners, empty: "— hamkor emas", hint: "Tanlansa, logotip va havola hamkor sahifasidan olinadi" },
  { key: "type", label: "Turi", type: "select", options: OPP_TYPES },
  { key: "status", label: "Holat", type: "select", options: Object.entries(STATUS).filter(([k]) => k !== "scheduled").map(([value, [l]]) => ({ value, label: l })) },
  { key: "city", label: "Shahar", type: "text" },
  { key: "salary", label: "Maosh", type: "text", placeholder: "kelishiladi / 5 000 000 so‘m" },
  { key: "remote", label: "Masofaviy ishlash mumkin", type: "toggle" },
  { key: "deadline", label: "Ariza muddati", type: "date", hint: "Muddat o‘tgach e’lon avtomatik yopiladi" },
  { key: "program_ids", label: "Mos yo‘nalishlar", type: "multi", options: (r) => r.programs, hint: "Talabalar kabinetida shu yo‘nalishlarga birinchi bo‘lib ko‘rinadi va xabar boradi" },
  { key: "summary", label: "Qisqacha", type: "textarea", wide: true },
  { key: "html", label: "Batafsil tavsif", type: "rich" },
  { key: "requirements", label: "Talablar", type: "lines", wide: true, hint: "Har bir talab — alohida qatorda" },
  { key: "apply_url", label: "Ariza havolasi", type: "text", placeholder: "https://", wide: true },
  { key: "apply_email", label: "Ariza uchun email", type: "text" },
  { key: "apply_phone", label: "Ariza uchun telefon", type: "text" },
  { key: "logo", label: "Logotip", type: "image" },
  { key: "featured", label: "Tanlangan (ro‘yxat boshida)", type: "toggle" },
  { key: "silent", label: "Talabalarga xabar yubormaslik", type: "toggle" },
];

function SubmitterCard({ d, reload }: { d: Rec; reload: (r: Rec) => void }) {
  const run = useRun();
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = d.submitter as { company?: string; name?: string; email?: string; phone?: string; website?: string; at?: string } | null;
  if (!d.id || (!s && d.status !== "pending")) return null;
  return (
    <div className={`ca-mod ${d.status}`}>
      <div className="ca-mod-head">
        <StatusPill s={d.status} />
        {s?.at && <small>Yuborilgan: {fmtDateTime(s.at)}</small>}
      </div>
      {s && (
        <dl className="ca-dl">
          <div>
            <dt>Kompaniya</dt>
            <dd>{s.company}</dd>
          </div>
          <div>
            <dt>Mas’ul shaxs</dt>
            <dd>{s.name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${s.email}`}>{s.email}</a>
            </dd>
          </div>
          {s.phone && (
            <div>
              <dt>Telefon</dt>
              <dd>{s.phone}</dd>
            </div>
          )}
          {s.website && (
            <div>
              <dt>Veb-sayt</dt>
              <dd>
                <a href={s.website} target="_blank" rel="noreferrer">
                  {s.website}
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}
      {d.status === "rejected" && typeof d.reject_reason === "string" && d.reject_reason && <p className="ca-reason">Rad etish sababi: {d.reject_reason}</p>}
      {rejecting ? (
        <div className="ca-reject">
          <Field label="Rad etish sababi (kompaniyaga emailda yuboriladi)" wide>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
          <div className="ca-acts">
            <Btn onClick={() => setRejecting(false)}>Bekor qilish</Btn>
            <Btn
              kind="danger"
              busy={busy}
              disabled={reason.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                const r = await run(() => ca.reject(d.id, reason.trim()), "Rad etildi");
                setBusy(false);
                if (r) {
                  setRejecting(false);
                  reload(r.item);
                }
              }}
            >
              Rad etish
            </Btn>
          </div>
        </div>
      ) : (
        (d.status === "pending" || d.status === "rejected") && (
          <div className="ca-acts">
            <Btn
              kind="primary"
              icon={<Check size={15} />}
              busy={busy}
              onClick={async () => {
                setBusy(true);
                const r = await run(() => ca.approve(d.id), "Tasdiqlandi va nashr qilindi");
                setBusy(false);
                if (r) reload(r.item);
              }}
            >
              Tasdiqlash va nashr qilish
            </Btn>
            {d.status === "pending" && (
              <Btn kind="danger" icon={<X size={15} />} onClick={() => setRejecting(true)}>
                Rad etish
              </Btn>
            )}
          </div>
        )
      )}
    </div>
  );
}

function CareerInfo() {
  const run = useRun();
  const base = useBaseLang();
  const refs = useRefs();
  const [s, setS] = useState<CareerSettings | null>(null);
  const [lang, setLang] = useState<Lang | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    ca.settings().then(setS).catch(() => null);
  }, []);
  if (!s || !base) return <Spinner />;
  const l = lang || base;
  const save = async () => {
    setBusy(true);
    const r = await run(() => ca.saveSettings(s), "Saqlandi");
    setBusy(false);
    if (r) setS({ ...s, ...r });
  };
  return (
    <div className="ca-info">
      <Card title="Karyera markazi haqida (saytda)" sub="Xizmatlar (rezyume tayyorlashda yordam, konsultatsiyalar va h.k.) — saytdagi «Karyera markazi haqida» bloki. Bo‘sh bo‘lsa, blok chiqmaydi.">
        <LangTabs value={l} base={base} onChange={setLang} filled={(x) => !!s.info?.[x]?.html} />
        <div className="ca-rich">
          <RichEditor
            key={l}
            value={((s.info?.[l]?.content as JSONContent) || s.info?.[l]?.html || null) as JSONContent | string | null}
            onChange={(o) => setS({ ...s, info: { ...(s.info || {}), [l]: { html: o.text.trim() ? o.html : "", content: o.json } } })}
          />
        </div>
      </Card>
      <Card title="Aloqa" sub="Saytda «Aloqa» kartasida chiqadi">
        <div className="a-form-grid">
          <Field label="Telefon">
            <Input value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} />
          </Field>
          <Field label="Xona">
            <Input value={s.room} onChange={(e) => setS({ ...s, room: e.target.value })} />
          </Field>
          <Field label="Ish vaqti">
            <Input value={s.hours} onChange={(e) => setS({ ...s, hours: e.target.value })} placeholder="Dushanba – Juma, 9:00 – 17:00" />
          </Field>
          <Group label="Mas’ul xodimlar" wide>
            <div className="ca-rows">
              {s.staff_ids.map((id, i) => (
                <div key={id} className="pair-row">
                  <Select value={id} onChange={(v) => setS({ ...s, staff_ids: s.staff_ids.map((x, j) => (j === i ? v : x)) })} options={refs.staff} />
                  <button type="button" className="a-icon danger" aria-label="Olib tashlash" title="Olib tashlash" onClick={() => setS({ ...s, staff_ids: s.staff_ids.filter((_, j) => j !== i) })}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {s.staff_ids.length < 6 && (
                <Select value="" onChange={(v) => v && setS({ ...s, staff_ids: [...s.staff_ids, v] })} options={[{ value: "", label: "+ Xodim qo‘shish…" }, ...refs.staff.filter((x) => !s.staff_ids.includes(x.value))]} />
              )}
            </div>
          </Group>
          <div className="a-field wide">
            <Toggle
              checked={s.notify}
              onChange={(v) => setS({ ...s, notify: v })}
              label="Talabalarga xabar yuborish"
              hint="Yangi imkoniyat nashr qilinsa — faqat mos yo‘nalish talabalariga, kuniga ko‘pi bilan bitta jamlangan xabar (kabinet va Telegram)"
            />
          </div>
        </div>
      </Card>
      <div className="ca-acts">
        <Btn kind="primary" busy={busy} onClick={save}>
          Saqlash
        </Btn>
      </div>
    </div>
  );
}

export function CareerCenterAdminPage() {
  const [tab, setTab] = useState<"list" | "info">("list");
  const [k, setK] = useState(0);
  const run = useRun();
  return (
    <div className="ca-wrap">
      <div className="a-tabs ca-page-tabs" role="tablist" aria-label="Karyera markazi">
        <button type="button" role="tab" aria-selected={tab === "list"} className={tab === "list" ? "on" : ""} onClick={() => setTab("list")}>
          Imkoniyatlar va moderatsiya
        </button>
        <button type="button" role="tab" aria-selected={tab === "info"} className={tab === "info" ? "on" : ""} onClick={() => setTab("info")}>
          Ma’lumot bloki va sozlamalar
        </button>
      </div>
      {tab === "info" ? (
        <div className="a-page">
          <PageHead title="Karyera markazi: ma’lumot va sozlamalar" sub="Saytdagi /career-center sahifasining ma’lumot bloki, aloqa va talabalarga xabarnoma" />
          <CareerInfo />
        </div>
      ) : (
        <Records
          kind="opportunity"
          title="Karyera markazi"
          sub="Talaba va bitiruvchilar uchun amaliyot, ish, stajirovka va loyihalar. Kompaniyalar saytdan yuborgan e’lonlar «Moderatsiyada» holatida keladi."
          icon={<Briefcase size={28} />}
          empty="Hali imkoniyat qo‘shilmagan"
          reloadKey={k}
          defaults={{ type: "internship", status: "published", program_ids: [], requirements: [], remote: false, city: "Farg‘ona" }}
          fields={OPP_FIELDS}
          i18n={["title", "summary", "html", "city", "salary", "requirements"]}
          statuses={[
            { value: "pending", label: "Moderatsiyada" },
            { value: "published", label: "Nashr qilingan" },
            { value: "expired", label: "Muddati tugagan" },
            { value: "rejected", label: "Rad etilgan" },
            { value: "draft", label: "Qoralama" },
          ]}
          thumb={(x) => x.logo as string}
          top={(d, reload) => <SubmitterCard d={d} reload={reload} />}
          extraActions={(x, reload) =>
            x.status === "pending" ? (
              <button
                type="button"
                className="a-icon ok"
                title="Tasdiqlash va nashr qilish"
                aria-label="Tasdiqlash va nashr qilish"
                onClick={async () => {
                  if (await run(() => ca.approve(x.id), "Tasdiqlandi va nashr qilindi")) {
                    reload();
                    setK((n) => n + 1);
                  }
                }}
              >
                <Check size={15} />
              </button>
            ) : null
          }
          row={(x) => (
            <>
              <b>
                {x.featured && <Star size={13} className="star" />}
                {x.title}
              </b>
              <small>
                <StatusPill s={x.status} />
                {label(OPP_TYPES, x.type)}
                {x.company ? ` · ${x.company}` : ""}
                {x.deadline ? ` · muddat ${fmtDateTime(x.deadline as string).slice(0, 10)}` : ""}
                {(x.program_ids as string[] | undefined)?.length ? ` · ${(x.program_ids as string[]).length} yo‘nalish` : ""}
              </small>
            </>
          )}
        />
      )}
    </div>
  );
}

/* ================================================================== hamkorlar */
const PARTNER_FIELDS: FDef[] = [
  { key: "title", label: "Nomi", type: "text", wide: true },
  { key: "category", label: "Turi", type: "select", options: PARTNER_TYPES },
  { key: "status", label: "Ko‘rinishi", type: "select", options: [{ value: "published", label: "Saytda ko‘rinadi" }, { value: "draft", label: "Yashirin (qoralama)" }] },
  { key: "country", label: "Mamlakat", type: "text" },
  { key: "city", label: "Shahar", type: "text" },
  { key: "url", label: "Veb-sayt", type: "text", placeholder: "https://" },
  { key: "since", label: "Hamkorlik yili", type: "text", placeholder: "2025" },
  { key: "agreement_date", label: "Shartnoma sanasi", type: "text", placeholder: "2025-12-26", hint: "Ixtiyoriy: YYYY-MM-DD yoki yil" },
  { key: "logo", label: "Logotip", type: "image" },
  { key: "summary", label: "Qisqacha (kartada)", type: "textarea", wide: true },
  { key: "description", label: "Batafsil tavsif", type: "textarea", wide: true, hint: "Xatboshilar bo‘sh qator bilan ajratiladi" },
  { key: "areas", label: "Hamkorlik yo‘nalishlari", type: "tags", wide: true },
  { key: "practice_base", label: "Amaliyot bazasi", type: "toggle", hint: "Talabalar shu yerda amaliyot o‘taydi" },
  { key: "capacity", label: "Yiliga amaliyot o‘rinlari", type: "number", show: (d) => !!d.practice_base },
  { key: "program_ids", label: "Shu yerda amaliyot o‘taydigan yo‘nalishlar", type: "multi", options: (r) => r.programs, show: (d) => !!d.practice_base, hint: "Yo‘nalish sahifasida «Amaliyot bazalari» blokida chiqadi" },
  { key: "lat", label: "Kenglik (lat)", type: "float", placeholder: "40.3864" },
  { key: "lng", label: "Uzunlik (lng)", type: "float", placeholder: "71.7864" },
  { key: "featured", label: "Bosh sahifa", type: "toggle", hint: "Bosh sahifadagi logotiplar qatorida" },
];

export function PartnersAdminPage() {
  return (
    <Records
      kind="partner"
      title="Hamkorlar va amaliyot bazalari"
      sub="Sanoat, xalqaro, akademik va davlat hamkorlari. «Amaliyot bazasi» belgilanganlar yo‘nalish sahifalarida va filtrda chiqadi."
      icon={<Handshake size={28} />}
      empty="Hali hamkor qo‘shilmagan"
      defaults={{ category: "industry", status: "published", areas: [], program_ids: [], practice_base: false }}
      fields={PARTNER_FIELDS}
      i18n={["title", "country", "city", "summary", "description", "areas"]}
      thumb={(x) => x.logo as string}
      filters={(_items, set) => <PartnerFilter set={set} />}
      row={(x) => (
        <>
          <b>
            {x.featured && <Star size={13} className="star" />}
            {x.title}
          </b>
          <small>
            <Pill tone="info">{label(PARTNER_TYPES, ({ university: "academic", company: "industry", organization: "international" } as Record<string, string>)[x.category as string] || x.category)}</Pill>
            {x.practice_base ? <Pill tone="ok">amaliyot bazasi</Pill> : null}
            {[x.country, x.city].filter(Boolean).join(", ")}
            {x.status === "draft" && <Pill>yashirin</Pill>}
          </small>
        </>
      )}
    />
  );
}

function PartnerFilter({ set }: { set: (f: (x: Rec) => boolean) => void }) {
  const [t, setT] = useState("");
  const [p, setP] = useState(false);
  useEffect(() => {
    set((x) => (!t || x.category === t) && (!p || !!x.practice_base));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, p]);
  return (
    <>
      <div className="ca-sel">
        <Select value={t} onChange={setT} options={[{ value: "", label: "Barcha turlar" }, ...PARTNER_TYPES]} />
      </div>
      <Toggle checked={p} onChange={setP} label="Faqat amaliyot bazalari" />
    </>
  );
}

/* ================================================================== bitiruvchilar */
const ALUMNI_FIELDS: FDef[] = [
  { key: "title", label: "F.I.Sh.", type: "text", wide: true },
  { key: "consent", label: "Bitiruvchi nashrga yozma rozilik bergan", type: "toggle", hint: "Rozilik bo‘lmasa hikoya saytda chiqmaydi (qoralama bo‘lib qoladi)" },
  { key: "status", label: "Holat", type: "select", options: PUB },
  { key: "year", label: "Bitirgan yili", type: "number" },
  { key: "program_id", label: "Yo‘nalish", type: "ref", options: (r) => r.programs, empty: "— ro‘yxatda yo‘q" },
  { key: "program_text", label: "Yo‘nalish (ro‘yxatda bo‘lmasa)", type: "text", show: (d) => !d.program_id },
  { key: "position", label: "Hozirgi lavozimi", type: "text" },
  { key: "company", label: "Ish joyi (kompaniya)", type: "text" },
  { key: "photo", label: "Surat", type: "photo", hint: "Surat bo‘lmasa — bosh harflar" },
  { key: "quote", label: "Qisqa iqtibos", type: "textarea", wide: true },
  { key: "html", label: "Hikoya", type: "rich" },
  { key: "featured", label: "Tanlangan", type: "toggle" },
];

function Registry({ onStory }: { onStory: () => void }) {
  const run = useRun();
  const confirm = useConfirm();
  const refs = useRefs();
  const [p, setP] = useState({ q: "", year: "", program: "", status: "" });
  const [d, setD] = useState<{ items: RegistryRow[]; years: number[]; total: number } | null>(null);
  const [note, setNote] = useState<RegistryRow | null>(null);
  const load = useCallback(() => ca.registry(p).then(setD).catch(() => setD({ items: [], years: [], total: 0 })), [p]);
  useEffect(() => {
    const h = window.setTimeout(load, 250);
    return () => window.clearTimeout(h);
  }, [load]);
  const prog = (r: RegistryRow) => refs.programs.find((x) => x.value === r.program_id)?.label || r.program_text || "—";
  const REG: Opt[] = [
    { value: "new", label: "Yangi" },
    { value: "contacted", label: "Bog‘lanildi" },
    { value: "story", label: "Hikoya tayyorlanmoqda" },
    { value: "archived", label: "Arxiv" },
  ];
  return (
    <div className="a-page">
      <PageHead
        title="Bitiruvchilar ro‘yxati"
        sub="Saytdagi formadan ro‘yxatdan o‘tganlar. Shaxsiy ma’lumotlar — saytda e’lon qilinmaydi."
        actions={
          <a className="a-btn default md" href={ca.registryUrl(p)}>
            <Download size={15} /> <span>Excel</span>
          </a>
        }
      />
      <div className="list-tools ca-tools">
        <div className="ca-tools-l">
          <div className="ca-sel">
            <Select value={p.year} onChange={(v) => setP({ ...p, year: v })} options={[{ value: "", label: "Barcha yillar" }, ...(d?.years || []).map((y) => ({ value: String(y), label: String(y) }))]} />
          </div>
          <div className="ca-sel">
            <Select value={p.program} onChange={(v) => setP({ ...p, program: v })} options={[{ value: "", label: "Barcha yo‘nalishlar" }, ...refs.programs]} />
          </div>
          <div className="ca-sel">
            <Select value={p.status} onChange={(v) => setP({ ...p, status: v })} options={[{ value: "", label: "Barcha holatlar" }, ...REG]} />
          </div>
        </div>
        <label className="a-search">
          <Search size={15} />
          <input value={p.q} onChange={(e) => setP({ ...p, q: e.target.value })} placeholder="Ism, email, telefon, ish joyi…" aria-label="Qidirish" />
        </label>
      </div>
      {!d ? (
        <Spinner />
      ) : d.items.length === 0 ? (
        <Card>
          <Empty icon={<UserPlus size={28} />} title={d.total ? "Filtr bo‘yicha topilmadi" : "Hali hech kim ro‘yxatdan o‘tmagan"} />
        </Card>
      ) : (
        <Card pad={false}>
          <div className="a-table-scroll">
            <table className="a-table ca-table">
              <thead>
                <tr>
                  <th scope="col">F.I.Sh.</th>
                  <th scope="col">Yil</th>
                  <th scope="col">Yo‘nalish</th>
                  <th scope="col">Ish joyi</th>
                  <th scope="col">Aloqa</th>
                  <th scope="col">Rozilik</th>
                  <th scope="col">Holat</th>
                  <th scope="col">
                    <span className="sr-only">Amallar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.name}</b>
                      <small className="ca-sub">{fmtDateTime(r.created)}</small>
                      {r.note && <small className="ca-sub">Izoh: {r.note}</small>}
                    </td>
                    <td>{r.year || "—"}</td>
                    <td>{prog(r)}</td>
                    <td>
                      {[r.job, r.company].filter(Boolean).join(", ") || "—"}
                      {r.city && <small className="ca-sub">{r.city}</small>}
                    </td>
                    <td>
                      {r.email && (
                        <a href={`mailto:${r.email}`} className="ca-sub">
                          {r.email}
                        </a>
                      )}
                      {r.phone && <small className="ca-sub">{r.phone}</small>}
                    </td>
                    <td>
                      <small className="ca-sub">Bog‘lanish: {r.consent_contact ? "ha" : "yo‘q"}</small>
                      <small className="ca-sub">Nashr: {r.consent_publish ? "ha" : "yo‘q"}</small>
                    </td>
                    <td>
                      <select
                        className="a-input ca-mini"
                        aria-label={`${r.name}: holat`}
                        value={r.status}
                        onChange={async (e) => {
                          await run(() => ca.registryUpdate(r.id, { status: e.target.value }));
                          load();
                        }}
                      >
                        {REG.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="actions">
                      <button type="button" className="a-icon" title="Izoh" aria-label={`${r.name}: izoh`} onClick={() => setNote(r)}>
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="a-icon"
                        title="Hikoya qoralamasini yaratish"
                        aria-label={`${r.name}: hikoya qoralamasi`}
                        onClick={async () => {
                          const x = await run(() => ca.registryStory(r.id), "Hikoya qoralamasi yaratildi — «Hikoyalar» bo‘limida");
                          if (x) {
                            load();
                            onStory();
                          }
                        }}
                      >
                        <FileText size={15} />
                      </button>
                      <button
                        type="button"
                        className="a-icon danger"
                        title="O‘chirish"
                        aria-label={`${r.name}: o‘chirish`}
                        onClick={async () => {
                          if (!(await confirm(`«${r.name}» ro‘yxatdan o‘chirilsinmi?`))) return;
                          await run(() => ca.registryDelete(r.id), "O‘chirildi");
                          load();
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
      {note && (
        <Modal
          open
          onClose={() => setNote(null)}
          title={`Izoh: ${note.name}`}
          footer={
            <>
              <Btn onClick={() => setNote(null)}>Bekor qilish</Btn>
              <Btn
                kind="primary"
                onClick={async () => {
                  await run(() => ca.registryUpdate(note.id, { note: note.note }), "Saqlandi");
                  setNote(null);
                  load();
                }}
              >
                Saqlash
              </Btn>
            </>
          }
        >
          <Field label="Ichki izoh (faqat adminlar ko‘radi)" wide>
            <Textarea rows={4} value={note.note || ""} onChange={(e) => setNote({ ...note, note: e.target.value })} />
          </Field>
        </Modal>
      )}
    </div>
  );
}

function StatsEditor() {
  const run = useRun();
  const refs = useRefs();
  const [rows, setRows] = useState<StatRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    ca.stats()
      .then((r) => setRows(r.rows))
      .catch(() => setRows([]));
  }, []);
  if (!rows) return <Spinner />;
  const upd = (i: number, p: Partial<StatRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className="a-page">
      <PageHead title="Bandlik statistikasi" sub="Faqat tasdiqlangan raqamlarni kiriting (yil, bitiruvchilar soni, ish bilan bandlik %). Bo‘sh bo‘lsa saytda blok chiqmaydi. Yo‘nalish tanlanmasa — institut bo‘yicha jami." />
      <Card pad={false}>
        <div className="a-table-scroll">
          <table className="a-table ca-table">
            <thead>
              <tr>
                <th scope="col">Yil</th>
                <th scope="col">Yo‘nalish</th>
                <th scope="col">Bitiruvchilar soni</th>
                <th scope="col">Ish bilan band, %</th>
                <th scope="col">
                  <span className="sr-only">Amallar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <input className="a-input ca-mini" type="number" aria-label="Yil" value={r.year ?? ""} onChange={(e) => upd(i, { year: e.target.value })} />
                  </td>
                  <td>
                    <select className="a-input" aria-label="Yo‘nalish" value={r.program_id} onChange={(e) => upd(i, { program_id: e.target.value })}>
                      <option value="">Institut bo‘yicha jami</option>
                      {refs.programs.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input className="a-input ca-mini" type="number" min={0} aria-label="Bitiruvchilar soni" value={r.graduates ?? ""} onChange={(e) => upd(i, { graduates: e.target.value })} />
                  </td>
                  <td>
                    <input className="a-input ca-mini" type="number" min={0} max={100} step="0.1" aria-label="Ish bilan band, %" value={r.employed_pct ?? ""} onChange={(e) => upd(i, { employed_pct: e.target.value })} />
                  </td>
                  <td className="actions">
                    <button type="button" className="a-icon danger" aria-label="Qatorni o‘chirish" title="Qatorni o‘chirish" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ca-table-foot">
          <Btn size="sm" icon={<Plus size={14} />} onClick={() => setRows([...rows, { year: new Date().getFullYear(), program_id: "", graduates: "", employed_pct: "" }])}>
            Qator qo‘shish
          </Btn>
        </div>
      </Card>
      <div className="ca-acts">
        <Btn
          kind="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            const r = await run(() => ca.saveStats(rows), "Saqlandi");
            setBusy(false);
            if (r) setRows(r.rows);
          }}
        >
          Saqlash
        </Btn>
      </div>
    </div>
  );
}

export function AlumniAdminPage() {
  const [tab, setTab] = useState<"stories" | "registry" | "stats">("stories");
  const [k, setK] = useState(0);
  return (
    <div className="ca-wrap">
      <div className="a-tabs ca-page-tabs" role="tablist" aria-label="Bitiruvchilar">
        {(
          [
            ["stories", "Hikoyalar"],
            ["registry", "Ro‘yxat (shaxsiy ma’lumotlar)"],
            ["stats", "Bandlik statistikasi"],
          ] as const
        ).map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {l}
          </button>
        ))}
      </div>
      {tab === "registry" ? (
        <Registry onStory={() => setK((x) => x + 1)} />
      ) : tab === "stats" ? (
        <StatsEditor />
      ) : (
        <Records
          kind="alumni"
          title="Bitiruvchilar hikoyalari"
          sub="Saytdagi /alumni sahifasi. Hikoya faqat bitiruvchining nashrga roziligi belgilansa chiqadi."
          icon={<GraduationCap size={28} />}
          empty="Hali hikoya qo‘shilmagan"
          reloadKey={k}
          defaults={{ status: "draft", consent: false }}
          fields={ALUMNI_FIELDS}
          i18n={["position", "quote", "html", "program_text"]}
          statuses={[
            { value: "published", label: "Nashr qilingan" },
            { value: "draft", label: "Qoralama" },
          ]}
          thumb={(x) => x.photo as string}
          row={(x) => (
            <>
              <b>{x.title}</b>
              <small>
                <StatusPill s={x.status} />
                {!x.consent && <Pill tone="warn">rozilik yo‘q</Pill>}
                {[x.year, x.position, x.company].filter(Boolean).join(" · ")}
              </small>
            </>
          )}
        />
      )}
    </div>
  );
}

/* ================================================================== startaplar */
const STARTUP_FIELDS: FDef[] = [
  { key: "title", label: "Loyiha nomi", type: "text", wide: true },
  { key: "stage", label: "Bosqich", type: "select", options: STAGES },
  { key: "category", label: "Yo‘nalish", type: "select", options: SCATS },
  { key: "status", label: "Holat", type: "select", options: PUB },
  { key: "year", label: "Yil", type: "number" },
  { key: "summary", label: "Qisqacha", type: "textarea", wide: true },
  { key: "html", label: "Tavsif", type: "rich" },
  { key: "team", label: "Jamoa", type: "team", hint: "Xodim profili tanlansa — saytda sahifasiga havola va surati chiqadi" },
  { key: "cover", label: "Muqova", type: "image" },
  { key: "video", label: "Video havolasi (YouTube)", type: "text", placeholder: "https://youtu.be/…" },
  { key: "images", label: "Suratlar", type: "images" },
  { key: "awards", label: "Mukofot va grantlar", type: "lines", wide: true, hint: "Har biri alohida qatorda" },
  { key: "partner_ids", label: "Hamkorlar (ro‘yxatdan)", type: "multi", options: (r) => r.partners },
  { key: "partners", label: "Boshqa hamkorlar", type: "tags", wide: true },
  { key: "contact_email", label: "Email", type: "text" },
  { key: "contact_phone", label: "Telefon", type: "text" },
  { key: "website", label: "Loyiha sayti", type: "text", placeholder: "https://", wide: true },
  { key: "featured", label: "Tanlangan", type: "toggle" },
];

export function StartupsAdminPage() {
  return (
    <Records
      kind="startup"
      title="Startaplar va innovatsiyalar"
      sub="Talaba va o‘qituvchilar loyihalari: bosqich, jamoa, mukofotlar, hamkorlar. Faqat tasdiqlangan ma’lumotlarni kiriting."
      icon={<Lightbulb size={28} />}
      empty="Hali loyiha qo‘shilmagan"
      defaults={{ stage: "idea", category: "food_tech", status: "draft", team: [], images: [], awards: [], partner_ids: [], partners: [] }}
      fields={STARTUP_FIELDS}
      i18n={["title", "summary", "html", "awards"]}
      statuses={PUB}
      thumb={(x) => x.cover as string}
      row={(x) => (
        <>
          <b>
            {x.featured && <Star size={13} className="star" />}
            {x.title}
          </b>
          <small>
            <StatusPill s={x.status} />
            {label(STAGES, x.stage)} · {label(SCATS, x.category)}
            {(x.team as Member[] | undefined)?.length ? ` · jamoa: ${(x.team as Member[]).length}` : ""}
          </small>
        </>
      )}
    />
  );
}

/* ================================================================== foydali maqolalar */
const ARTICLE_FIELDS: FDef[] = [
  { key: "title", label: "Sarlavha", type: "text", wide: true },
  { key: "author_id", label: "Muallif (xodim)", type: "ref", options: (r) => r.staff, empty: "— xodim emas", hint: "Maqola ostida muallif kartasi (surat, lavozim, profil havolasi)" },
  { key: "author_name", label: "Muallif ismi (xodim bo‘lmasa)", type: "text", show: (d) => !d.author_id },
  { key: "status", label: "Holat", type: "select", options: [...PUB, { value: "scheduled", label: "Rejalashtirilgan" }] },
  { key: "published_at", label: "Nashr vaqti", type: "datetime", show: (d) => d.status === "scheduled" || d.status === "published" },
  { key: "topics", label: "Mavzular", type: "multi", options: TOPICS },
  { key: "excerpt", label: "Qisqacha (ro‘yxatda va qidiruvda)", type: "textarea", wide: true },
  { key: "html", label: "Matn", type: "rich", hint: "O‘qish vaqti avtomatik hisoblanadi" },
  { key: "cover", label: "Muqova", type: "image" },
  { key: "cover_alt", label: "Muqova tavsifi (alt)", type: "text" },
  { key: "tags", label: "Teglar", type: "tags", wide: true },
  { key: "sources", label: "Manbalar", type: "sources" },
  { key: "meta_title", label: "SEO sarlavha", type: "text" },
  { key: "meta_description", label: "SEO tavsif", type: "text" },
  { key: "featured", label: "Tanlangan", type: "toggle" },
];

export function ArticlesAdminPage() {
  return (
    <Records
      kind="insight"
      title="Foydali maqolalar"
      sub="Fan, ta’lim va texnologiyalar haqida mutaxassislar maqolalari (/articles, RSS)."
      icon={<FileText size={28} />}
      empty="Hali maqola yozilmagan"
      defaults={{ status: "draft", topics: [], tags: [], sources: [] }}
      fields={ARTICLE_FIELDS}
      i18n={["title", "excerpt", "html", "cover_alt", "meta_title", "meta_description"]}
      statuses={[...PUB, { value: "scheduled", label: "Rejalashtirilgan" }]}
      thumb={(x) => x.cover as string}
      row={(x) => (
        <>
          <b>
            {x.featured && <Star size={13} className="star" />}
            {x.title}
          </b>
          <small>
            <StatusPill s={x.status} />
            {((x.topics as string[]) || []).map((t) => label(TOPICS, t)).join(", ")}
            {x.published_at ? ` · ${fmtDateTime(x.published_at)}` : ""}
          </small>
        </>
      )}
    />
  );
}
