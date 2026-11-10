// Admin: rasmiy bo'limlar — rahbariyat qabuli jadvali, ochiq ma'lumotlar (ko'rsatkichlar + to'plamlar), reytinglar, tarix, OAV biz haqimizda,
// rektor murojaati, maxfiylik siyosati (sahifalar muharririga o'tish). MatDash tokenlari (--md-*).
import type { JSONContent } from "@tiptap/core";
import { ArrowDown, ArrowUp, CalendarClock, Database, History, Newspaper, Pencil, Plus, Save, Trash2, Trophy, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { RichEditor } from "../../editor/RichEditor";
import { req, type Item, type Kind, type Lang, type Uni } from "../../lib/api";
import { admin } from "../api";
import { SiteLink, SiteNote, useSiteSection } from "../SiteStatus";
import { Btn, Card, Empty, Field, ImageField, Input, LangBadges, LangTabs, Modal, PageHead, Pill, Select, Spinner, Textarea, Toggle, useBaseLang, useConfirm, useRun, useToast } from "../ui";
import "../../styles/official-admin.css";

type Rec = Record<string, unknown>;
type OKind = "reception" | "dataset" | "ranking" | "milestone" | "mention";
const K = (k: OKind) => k as unknown as Kind;

const VIS = [
  { value: "published", label: "Saytda ko‘rinadi" },
  { value: "draft", label: "Yashirin (qoralama)" },
];
const DAYS = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
const DAYS_S = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

/** ISO → <input type="date"> qiymati (Toshkent vaqti) va aksincha (kun o'rtasi: vaqt mintaqasida sana siljimaydi) */
const isoToDay = (v: unknown) => {
  if (!v || typeof v !== "string") return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
};
const dayToIso = (v: string) => (v ? `${v}T12:00:00+05:00` : null);

type FType = "text" | "textarea" | "number" | "select" | "url" | "image" | "file" | "date" | "toggle";
interface FDef {
  key: string;
  label: string;
  type: FType;
  options?: { value: string; label: string }[];
  wide?: boolean;
  hint?: string;
  placeholder?: string;
  tr?: boolean; // tarjima qilinadi
}

/* ------------------------------------------------------------------ umumiy ro'yxat + forma */
function Records({
  kind,
  title,
  sub,
  icon,
  empty,
  fields,
  defaults,
  row,
  thumb,
  extra,
  prepare,
  publicUrl,
  sortItems,
  extraTop = false,
  hiddenNote,
}: {
  kind: OKind;
  title: string;
  sub: string;
  icon: ReactNode;
  empty: string;
  fields: FDef[];
  defaults: Rec;
  row: (x: Item) => ReactNode;
  thumb?: (x: Item) => string;
  extra?: (e: Rec, set: (k: string, v: unknown) => void, tr: Lang | null) => ReactNode;
  prepare?: (e: Rec) => Rec;
  publicUrl: string;
  sortItems?: (a: Item, b: Item) => number;
  extraTop?: boolean;
  hiddenNote?: string;
}) {
  const run = useRun();
  const confirm = useConfirm();
  const baseLang = useBaseLang();
  const [items, setItems] = useState<Item[] | null>(null);
  const [edit, setEditRaw] = useState<Rec | null>(null);
  const [editLang, setEditLang] = useState<Lang | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const load = useCallback(() => admin.items<Item>(K(kind)).then((r) => setItems(r.items)).catch(() => setItems([])), [kind]);
  useEffect(() => {
    load();
  }, [load]);
  const setEdit = (v: Rec | null) => {
    setEditLang(null);
    setEditRaw(v);
  };
  const tr: Lang | null = baseLang && editLang && editLang !== baseLang ? editLang : null;
  const trOf = (e: Rec | null, l: Lang) => (((e?.i18n as Record<string, Rec> | undefined) || {})[l] || {}) as Rec;
  const setF = (k: string, v: unknown) =>
    setEditRaw((e) => {
      const f = fields.find((x) => x.key === k);
      if (!tr || (f && !f.tr) || (!f && !["title"].includes(k))) return { ...(e || {}), [k]: v };
      const i18n = { ...((e?.i18n as Record<string, Rec>) || {}) };
      i18n[tr] = { ...(i18n[tr] || {}), [k]: v };
      return { ...(e || {}), i18n };
    });
  const toast = useToast();
  const save = async () => {
    if (!edit) return;
    const data = prepare ? prepare(edit) : edit;
    if (!String(data.title || "").trim()) {
      // server «Sarlavha kiriting» deydi — formada esa bu maydon boshqacha nomlangan (masalan, «Reyting nomi», «F.I.Sh.»)
      const f = fields.find((x) => x.key === "title");
      setEditLang(null);
      toast(kind === "reception" ? "Xodimni tanlang yoki F.I.Sh. ni kiriting" : `«${f?.label || "Sarlavha"}» maydonini to‘ldiring`, "error");
      return;
    }
    setBusy(true);
    const r = await run(() => (edit.id ? admin.update(K(kind), edit.id as string, data) : admin.create(K(kind), data)), "Saqlandi");
    setBusy(false);
    if (r) {
      setEdit(null);
      load();
    }
  };
  const list = useMemo(() => {
    const arr = [...(items || [])];
    if (sortItems) arr.sort(sortItems);
    return arr;
  }, [items, sortItems]);
  const shown = list.filter((x) => !q || x.title.toLowerCase().includes(q.toLowerCase()));
  const move = async (i: number, dir: -1 | 1) => {
    const arr = [...list];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setItems(arr.map((x, n) => ({ ...x, sort: n })));
    await run(() => admin.reorder(K(kind), arr.map((x) => x.id)));
  };
  const trFields = fields.filter((f) => f.tr).map((f) => f.key);
  const site = useSiteSection(publicUrl, items);
  return (
    <div className="a-page">
      <PageHead
        title={title}
        sub={sub}
        actions={
          <>
            <SiteLink path={publicUrl} state={site} />
            <Btn kind="accent" icon={<Plus size={16} />} onClick={() => setEdit({ ...defaults })}>
              Qo‘shish
            </Btn>
          </>
        }
      />
      <SiteNote state={site} hidden={hiddenNote} />
      <div className="list-tools">
        <span className="muted">{items?.length ?? ""} ta yozuv</span>
        <label className="a-search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish…" aria-label="Qidirish" />
        </label>
      </div>
      {!items ? (
        <Spinner />
      ) : !items.length ? (
        <Card>
          <Empty icon={icon} title={empty}>
            <Btn kind="accent" icon={<Plus size={15} />} onClick={() => setEdit({ ...defaults })}>
              Qo‘shish
            </Btn>
          </Empty>
        </Card>
      ) : (
        <div className="doc-list">
          {shown.map((x, i) => (
            <div key={x.id} className={`doc-row ${x.status === "draft" ? "dim" : ""}`} onClick={() => setEdit({ ...x })}>
              {thumb && <div className="doc-thumb round">{thumb(x) ? <img src={thumb(x)} alt="" /> : <span>{x.title.slice(0, 1)}</span>}</div>}
              <div className="doc-main">
                {row(x)}
                <LangBadges langs={x.langs} />
              </div>
              <div className="doc-actions" onClick={(e) => e.stopPropagation()}>
                {!sortItems && (
                  <>
                    <button className="a-icon" onClick={() => move(i, -1)} title="Yuqoriga" aria-label="Yuqoriga" disabled={i === 0 || !!q}>
                      <ArrowUp size={15} />
                    </button>
                    <button className="a-icon" onClick={() => move(i, 1)} title="Pastga" aria-label="Pastga" disabled={i === list.length - 1 || !!q}>
                      <ArrowDown size={15} />
                    </button>
                  </>
                )}
                <button className="a-icon" onClick={() => setEdit({ ...x })} title="Tahrirlash" aria-label="Tahrirlash">
                  <Pencil size={15} />
                </button>
                <button
                  className="a-icon danger"
                  title="O‘chirish"
                  aria-label="O‘chirish"
                  onClick={async () => {
                    if (!(await confirm(`«${x.title}» o‘chirilsinmi?`))) return;
                    await run(() => admin.remove(K(kind), x.id), "O‘chirildi");
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
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Tahrirlash" : "Yangi yozuv"}
        width={860}
        footer={
          <>
            <Btn onClick={() => setEdit(null)}>Bekor qilish</Btn>
            <Btn kind="primary" busy={busy} onClick={save}>
              Saqlash
            </Btn>
          </>
        }
      >
        {edit && baseLang && trFields.length > 0 && (
          <div className="modal-lang">
            <LangTabs value={editLang || baseLang} base={baseLang} onChange={setEditLang} filled={(l) => !!(l === baseLang ? edit.title : trOf(edit, l).title)} />
            {tr && <p className="a-hint">Faqat matnli maydonlar tarjima qilinadi; bo‘sh qolganlari saytda asosiy tilda chiqadi.</p>}
          </div>
        )}
        {edit && (
          <div className="a-form-grid">
            {extraTop && extra?.(edit, setF, tr)}
            {fields
              .filter((f) => !tr || f.tr)
              .map((f) => {
                const v = tr ? trOf(edit, tr)[f.key] : edit[f.key];
                const ph = tr ? String(edit[f.key] ?? "") || f.placeholder : f.placeholder;
                const input =
                  f.type === "textarea" ? (
                    <Textarea rows={4} value={(v as string) || ""} placeholder={ph} onChange={(e) => setF(f.key, e.target.value)} />
                  ) : f.type === "select" ? (
                    <Select value={(v as string) || f.options![0].value} onChange={(x) => setF(f.key, x)} options={f.options!} />
                  ) : f.type === "toggle" ? (
                    <Toggle checked={!!v} onChange={(x) => setF(f.key, x)} label={f.hint || ""} />
                  ) : f.type === "image" ? (
                    <ImageField value={(v as string) || ""} onChange={(x) => setF(f.key, x)} aspect="1 / 1" />
                  ) : f.type === "file" ? (
                    <ImageField value={(v as string) || ""} onChange={(x) => setF(f.key, x)} accept="pdf" />
                  ) : f.type === "date" ? (
                    <Input type="date" value={isoToDay(v)} onChange={(e) => setF(f.key, dayToIso(e.target.value))} />
                  ) : (
                    <Input
                      type={f.type === "number" ? "number" : f.type === "url" ? "url" : "text"}
                      value={(v as string | number | undefined) ?? ""}
                      placeholder={ph}
                      onChange={(e) => setF(f.key, f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
                    />
                  );
                return (
                  <Field key={f.key} label={f.label} hint={f.type === "toggle" ? undefined : f.hint} wide={f.wide}>
                    {input}
                  </Field>
                );
              })}
            {!extraTop && extra?.(edit, setF, tr)}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ rahbariyat qabuli */
interface Slot {
  day: number;
  start: string;
  end: string;
}
function SlotsEditor({ value, onChange }: { value: Slot[]; onChange: (v: Slot[]) => void }) {
  const set = (i: number, p: Partial<Slot>) => onChange(value.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const bad = (s: Slot) => !s.start || !s.end || s.start >= s.end;
  return (
    <div className="ofa-slots">
      {value.map((s, i) => (
        <div key={i} className={`ofa-slot ${bad(s) ? "bad" : ""}`}>
          <Select value={String(s.day)} onChange={(x) => set(i, { day: Number(x) })} options={DAYS.map((d, n) => ({ value: String(n + 1), label: d }))} />
          <Input type="time" value={s.start} onChange={(e) => set(i, { start: e.target.value })} aria-label="Boshlanishi" />
          <span aria-hidden>—</span>
          <Input type="time" value={s.end} onChange={(e) => set(i, { end: e.target.value })} aria-label="Tugashi" />
          <button type="button" className="a-icon danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="O‘chirish" title="O‘chirish">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="ofa-slot-acts">
        <Btn size="sm" icon={<Plus size={14} />} onClick={() => onChange([...value, { day: 1, start: "09:00", end: "12:00" }])}>
          Vaqt qo‘shish
        </Btn>
        {value.length > 0 && (
          <Btn
            size="sm"
            kind="ghost"
            onClick={() => {
              const f = value[0];
              const out = [...value];
              for (let d = 1; d <= 5; d++) if (!out.some((s) => s.day === d && s.start === f.start)) out.push({ day: d, start: f.start, end: f.end });
              onChange(out.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)));
            }}
          >
            Birinchi vaqtni Du–Ju ga nusxalash
          </Btn>
        )}
      </div>
      {value.some(bad) && <p className="a-error">Tugash vaqti boshlanishidan keyin bo‘lishi kerak.</p>}
    </div>
  );
}

function slotsText(v: unknown): string {
  const s = (Array.isArray(v) ? v : []) as Slot[];
  return s.map((x) => `${DAYS_S[x.day - 1]} ${x.start}–${x.end}`).join(", ");
}

export function ReceptionAdmin() {
  const [staff, setStaff] = useState<Item[]>([]);
  useEffect(() => {
    admin.items<Item>("staff").then((r) => setStaff(r.items)).catch(() => null);
  }, []);
  const byId = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);
  const opts = useMemo(
    () => [
      { value: "", label: "— Ro‘yxatda yo‘q (ism qo‘lda) —" },
      ...[...staff]
        .sort((a, b) => Number(b.category === "leadership") - Number(a.category === "leadership") || a.title.localeCompare(b.title))
        .map((s) => ({ value: s.id, label: `${s.title}${s.position ? ` — ${String(s.position).slice(0, 70)}` : ""}` })),
    ],
    [staff],
  );
  return (
    <Records
      kind="reception"
      extraTop
      title="Rahbariyat qabuli jadvali"
      sub="Rahbarlarning fuqarolarni qabul qilish kunlari va vaqtlari. Saytda haftalik jadval va «Qabulga yozilish» tugmasi chiqadi; arizalar «Murojaatlar» → «Rahbariyat qabuli» bo‘limiga tushadi."
      icon={<CalendarClock size={28} />}
      empty="Hali qabul jadvali kiritilmagan"
      publicUrl="/reception"
      defaults={{ status: "published", slots: [], staff_id: "" }}
      thumb={(x) => (x.photo as string) || ((byId[x.staff_id as string]?.photo as string) || "")}
      fields={[
        { key: "title", label: "F.I.Sh. (xodim tanlanmasa)", type: "text", wide: true, tr: true, hint: "Xodim tanlansa — ism, lavozim va surat uning profilidan olinadi" },
        { key: "position", label: "Lavozim (profildagidan farqli bo‘lsa)", type: "text", wide: true, tr: true },
        { key: "place", label: "Qabul joyi", type: "text", tr: true, placeholder: "Bosh bino, 2-qavat" },
        { key: "room", label: "Xona", type: "text", placeholder: "214" },
        { key: "phone", label: "Qabul telefoni", type: "text", placeholder: "+998 …" },
        { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
        { key: "note", label: "Onlayn qabul haqida izoh", type: "textarea", wide: true, tr: true },
        { key: "online_url", label: "Onlayn qabul havolasi", type: "url", wide: true, placeholder: "https://my.gov.uz/… yoki video qo‘ng‘iroq" },
        { key: "photo", label: "Surat (profildagidan farqli bo‘lsa)", type: "image", wide: true },
      ]}
      prepare={(e) => {
        const s = byId[e.staff_id as string];
        return { ...e, title: (e.title as string) || s?.title || "" };
      }}
      extra={(e, set, tr) =>
        tr ? null : (
          <>
            <Field label="Xodim (rahbar)" wide>
              <Select
                value={(e.staff_id as string) || ""}
                onChange={(x) => {
                  set("staff_id", x);
                  if (x && byId[x]) set("title", byId[x].title);
                }}
                options={opts}
              />
            </Field>
            <Field label="Qabul kunlari va vaqtlari" wide hint="Saytdagi yozilish formasida faqat shu vaqtlar tanlanadi (30 daqiqalik qadam)">
              <SlotsEditor value={(e.slots as Slot[]) || []} onChange={(v) => set("slots", v)} />
            </Field>
          </>
        )
      }
      row={(x) => {
        const s = byId[x.staff_id as string];
        return (
          <>
            <b>{s?.title || x.title}</b>
            <small>
              {slotsText(x.slots) || <Pill tone="warn">vaqt kiritilmagan</Pill>}
              {(x.place as string) ? ` · ${x.place}` : ""}
              {x.status === "draft" && <Pill>yashirin</Pill>}
            </small>
          </>
        );
      }}
    />
  );
}

/* ------------------------------------------------------------------ reytinglar, tarix, OAV */
export function RankingsAdmin() {
  return (
    <Records
      kind="ranking"
      title="Reytinglar"
      sub="Institut ishtirok etgan reytinglar natijalari. Bir xil nomdagi yozuvlar saytda bitta reyting ostida yillar bo‘yicha chiqadi. Faqat rasmiy e’lon qilingan natijalarni kiriting."
      icon={<Trophy size={28} />}
      empty="Hali reyting natijasi kiritilmagan"
      publicUrl="/rankings"
      defaults={{ status: "published", year: new Date().getFullYear() }}
      thumb={(x) => (x.logo as string) || ""}
      fields={[
        { key: "title", label: "Reyting nomi", type: "text", wide: true, tr: true, placeholder: "Masalan: reyting tashkiloti va nomi" },
        { key: "year", label: "Yil", type: "number" },
        { key: "category", label: "Toifa / yo‘nalish", type: "text", tr: true },
        { key: "place", label: "O‘rin", type: "text", placeholder: "12 yoki 401–500" },
        { key: "total", label: "Jami ishtirokchilar (ixtiyoriy)", type: "number" },
        { key: "url", label: "Natija havolasi", type: "url", wide: true, placeholder: "https://" },
        { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
        { key: "logo", label: "Reyting logotipi", type: "image", wide: true },
        { key: "note", label: "Izoh", type: "textarea", wide: true, tr: true },
      ]}
      sortItems={(a, b) => a.title.localeCompare(b.title) || Number(b.year || 0) - Number(a.year || 0)}
      row={(x) => (
        <>
          <b>{x.title}</b>
          <small>
            {String(x.year || "—")}
            {(x.category as string) ? ` · ${x.category}` : ""}
            {(x.place as string) ? ` · ${x.place}${x.total ? ` / ${x.total}` : ""}` : ""}
            {x.status === "draft" && <Pill>yashirin</Pill>}
          </small>
        </>
      )}
    />
  );
}

export function HistoryAdmin() {
  return (
    <Records
      kind="milestone"
      title="Tarix (vaqt chizig‘i)"
      sub="Institut tarixidagi muhim sanalar: yil, sarlavha, matn va ixtiyoriy rasm. Saytda yillar tartibida chiqadi. Faqat tasdiqlangan faktlarni yozing."
      icon={<History size={28} />}
      empty="Hali tarixiy sana kiritilmagan"
      publicUrl="/history"
      defaults={{ status: "published", year: new Date().getFullYear() }}
      thumb={(x) => (x.image as string) || ""}
      fields={[
        { key: "year", label: "Yil", type: "number" },
        { key: "date", label: "Aniq sana (ixtiyoriy)", type: "date" },
        { key: "title", label: "Sarlavha", type: "text", wide: true, tr: true },
        { key: "body", label: "Matn", type: "textarea", wide: true, tr: true },
        { key: "image", label: "Rasm (ixtiyoriy)", type: "image", wide: true },
        { key: "image_alt", label: "Rasm tavsifi (alt)", type: "text", wide: true, tr: true },
        { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
      ]}
      sortItems={(a, b) => Number(a.year || 0) - Number(b.year || 0) || String(a.date || "").localeCompare(String(b.date || ""))}
      row={(x) => (
        <>
          <b>
            {String(x.year || "")} — {x.title}
          </b>
          <small>
            {String(x.body || "").slice(0, 120)}
            {x.status === "draft" && <Pill>yashirin</Pill>}
          </small>
        </>
      )}
    />
  );
}

const MTYPES = [
  { value: "article", label: "Maqola" },
  { value: "video", label: "Video" },
  { value: "tv", label: "Teleko‘rsatuv" },
  { value: "radio", label: "Radio" },
];
export function MentionsAdmin() {
  return (
    <Records
      kind="mention"
      title="OAV biz haqimizda"
      sub="Ommaviy axborot vositalaridagi materiallar. Video va teleko‘rsatuvlar uchun YouTube havolasi kiritilsa — saytda shu yerning o‘zida ochiladi."
      icon={<Newspaper size={28} />}
      empty="Hali material kiritilmagan"
      publicUrl="/media-mentions"
      defaults={{ status: "published", type: "article" }}
      thumb={(x) => (x.logo as string) || ""}
      fields={[
        { key: "title", label: "Material sarlavhasi", type: "text", wide: true, tr: true },
        { key: "outlet", label: "Nashr / kanal nomi", type: "text", tr: true },
        { key: "type", label: "Turi", type: "select", options: MTYPES },
        { key: "date", label: "Sana", type: "date" },
        { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
        { key: "url", label: "Havola", type: "url", wide: true, placeholder: "https://" },
        { key: "summary", label: "Qisqacha", type: "textarea", wide: true, tr: true },
        { key: "logo", label: "Nashr logotipi", type: "image", wide: true },
      ]}
      sortItems={(a, b) => String(b.date || "").localeCompare(String(a.date || ""))}
      row={(x) => (
        <>
          <b>{x.title}</b>
          <small>
            {String(x.outlet || "")} · {MTYPES.find((t) => t.value === x.type)?.label}
            {x.date ? ` · ${isoToDay(x.date)}` : ""}
            {!x.url && <Pill tone="warn">havola yo‘q</Pill>}
            {x.status === "draft" && <Pill>yashirin</Pill>}
          </small>
        </>
      )}
    />
  );
}

/* ------------------------------------------------------------------ ochiq ma'lumotlar */
interface AInd {
  key: string;
  label: string;
  kind: "value" | "breakdown";
  value: number | null;
  breakdown?: { label: string; value: number }[];
  auto: number | { label: string; value: number }[] | null;
  source: string;
  hidden: boolean;
  has_data: boolean;
  updated: string;
}
interface Table {
  columns: string[];
  rows: (string | number)[][];
}
const ofa = {
  opendata: () => req<{ indicators: AInd[] }>("GET", "/api/admin/official/opendata"),
  saveOpendata: (indicators: Record<string, { hidden: boolean; value: number | null; rows: { label: string; value: number }[] }>) =>
    req<{ indicators: AInd[] }>("PUT", "/api/admin/official/opendata", { indicators }),
  parse: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<Table>("POST", "/api/admin/official/datasets/parse", fd);
  },
};

const rowsToText = (rows: { label: string; value: number }[]) => rows.map((r) => `${r.label}: ${r.value}`).join("\n");
const textToRows = (s: string) =>
  s
    .split("\n")
    .map((l) => l.match(/^(.+?)[:;\t]\s*(\d+)\s*$/))
    .filter(Boolean)
    .map((m) => ({ label: m![1].trim(), value: Number(m![2]) }));

function IndicatorsCard() {
  const run = useRun();
  const [items, setItems] = useState<AInd[] | null>(null);
  const [cfg, setCfg] = useState<Record<string, { hidden: boolean; value: string; rows: string }>>({});
  const [busy, setBusy] = useState(false);
  const apply = (list: AInd[]) => {
    setItems(list);
    setCfg(
      Object.fromEntries(
        list.map((x) => [x.key, { hidden: x.hidden, value: x.kind === "value" && x.source === "manual" ? String(x.value ?? "") : "", rows: x.kind === "breakdown" && x.source === "manual" ? rowsToText(x.breakdown || []) : "" }]),
      ),
    );
  };
  useEffect(() => {
    ofa.opendata().then((r) => apply(r.indicators)).catch(() => setItems([]));
  }, []);
  if (!items) return <Spinner />;
  const save = async () => {
    setBusy(true);
    const payload = Object.fromEntries(
      Object.entries(cfg).map(([k, c]) => [k, { hidden: c.hidden, value: c.value.trim() === "" ? null : Number(c.value), rows: textToRows(c.rows) }]),
    );
    const r = await run(() => ofa.saveOpendata(payload), "Saqlandi");
    setBusy(false);
    if (r) apply(r.indicators);
  };
  const set = (k: string, p: Partial<{ hidden: boolean; value: string; rows: string }>) => setCfg((c) => ({ ...c, [k]: { ...c[k], ...p } }));
  return (
    <Card
      title="Ko‘rsatkichlar"
      sub="Bazadan avtomatik hisoblanadi (talabalar, o‘qituvchilar — HEMIS va foydalanuvchilar; yo‘nalishlar, kafedralar; kutubxona fondi). Ma’lumot to‘liq bo‘lmasa — yashiring yoki rasmiy qiymatni qo‘lda kiriting. Ma’lumoti yo‘q ko‘rsatkich saytda chiqmaydi."
      actions={
        <Btn kind="primary" icon={<Save size={15} />} busy={busy} onClick={save}>
          Saqlash
        </Btn>
      }
    >
      <div className="ofa-inds">
        {items.map((x) => {
          const c = cfg[x.key] || { hidden: false, value: "", rows: "" };
          const autoTxt =
            x.kind === "value" ? (x.auto ?? "—") : Array.isArray(x.auto) && x.auto.length ? x.auto.map((r) => `${r.label}: ${r.value}`).join("; ") : "—";
          return (
            <div key={x.key} className={`ofa-ind ${c.hidden ? "off" : ""}`}>
              <div className="ofa-ind-h">
                <b>{x.label}</b>
                <span className="ofa-ind-state">
                  {c.hidden ? <Pill>yashirin</Pill> : x.has_data ? <Pill tone="ok">saytda</Pill> : <Pill tone="warn">ma’lumot yo‘q</Pill>}
                  {x.source === "manual" && <Pill tone="info">qo‘lda · {x.updated}</Pill>}
                </span>
              </div>
              <p className="ofa-ind-auto">
                Avtomatik: <span>{String(autoTxt)}</span>
              </p>
              <div className="ofa-ind-f">
                {x.kind === "value" ? (
                  <Field label="Qo‘lda qiymat (bo‘sh — avtomatik)">
                    <Input type="number" min={0} value={c.value} onChange={(e) => set(x.key, { value: e.target.value })} />
                  </Field>
                ) : (
                  <Field label="Qo‘lda taqsimot: har qatorda «nomi: soni» (bo‘sh — avtomatik)">
                    <Textarea rows={3} value={c.rows} onChange={(e) => set(x.key, { rows: e.target.value })} placeholder="Nomi: soni" />
                  </Field>
                )}
                <Toggle checked={c.hidden} onChange={(v) => set(x.key, { hidden: v })} label="Saytda yashirish" />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TableEditor({ value, onChange }: { value: Table; onChange: (t: Table) => void }) {
  const run = useRun();
  const fileRef = useRef<HTMLInputElement>(null);
  const t = { columns: value?.columns || [], rows: value?.rows || [] };
  const big = t.rows.length > 200;
  const setCell = (i: number, j: number, v: string) => onChange({ ...t, rows: t.rows.map((r, a) => (a === i ? r.map((c, b) => (b === j ? (/^-?\d+([.,]\d+)?$/.test(v.trim()) ? Number(v.replace(",", ".")) : v) : c)) : r)) });
  return (
    <div className="ofa-table">
      <div className="ofa-table-tools">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const r = await run(() => ofa.parse(f), "Jadval o‘qildi");
            if (r) onChange(r);
          }}
        />
        <Btn size="sm" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>
          CSV / XLSX yuklash
        </Btn>
        <Btn size="sm" icon={<Plus size={14} />} onClick={() => onChange({ columns: [...t.columns, `Ustun ${t.columns.length + 1}`], rows: t.rows.map((r) => [...r, ""]) })}>
          Ustun
        </Btn>
        <Btn size="sm" icon={<Plus size={14} />} disabled={!t.columns.length} onClick={() => onChange({ ...t, rows: [...t.rows, t.columns.map(() => "")] })}>
          Qator
        </Btn>
        <span className="muted">
          {t.columns.length} ustun · {t.rows.length} qator
        </span>
      </div>
      {t.columns.length > 0 && (
        <div className="ofa-grid-wrap">
          <table className="ofa-grid">
            <thead>
              <tr>
                {t.columns.map((c, j) => (
                  <th key={j}>
                    <span className="ofa-colh">
                      <input value={c} aria-label={`Ustun ${j + 1} nomi`} onChange={(e) => onChange({ ...t, columns: t.columns.map((x, b) => (b === j ? e.target.value : x)) })} />
                      <button
                        type="button"
                        className="a-icon danger"
                        aria-label="Ustunni o‘chirish"
                        onClick={() => onChange({ columns: t.columns.filter((_, b) => b !== j), rows: t.rows.map((r) => r.filter((_, b) => b !== j)) })}
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  </th>
                ))}
                <th aria-label="Amallar" />
              </tr>
            </thead>
            <tbody>
              {t.rows.slice(0, 200).map((r, i) => (
                <tr key={i}>
                  {t.columns.map((_, j) => (
                    <td key={j}>
                      <input value={String(r[j] ?? "")} aria-label={`${i + 1}-qator, ${t.columns[j]}`} onChange={(e) => setCell(i, j, e.target.value)} />
                    </td>
                  ))}
                  <td>
                    <button type="button" className="a-icon danger" aria-label="Qatorni o‘chirish" onClick={() => onChange({ ...t, rows: t.rows.filter((_, a) => a !== i) })}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {big && <p className="a-hint">Faqat birinchi 200 qator tahrirlanadi; katta jadvalni faylda o‘zgartirib qayta yuklang.</p>}
    </div>
  );
}

const DS_CATS = [
  { value: "students", label: "Talabalar" },
  { value: "staff", label: "Xodimlar" },
  { value: "education", label: "Ta’lim" },
  { value: "science", label: "Ilm-fan" },
  { value: "finance", label: "Moliya" },
  { value: "library", label: "Kutubxona" },
  { value: "other", label: "Boshqa" },
];

export function OpenDataAdmin() {
  return (
    <>
      <div className="a-page ofa-od-top">
        <IndicatorsCard />
      </div>
      <Records
        kind="dataset"
        title="Ma’lumotlar to‘plamlari"
        sub="Yuklab olinadigan jadvallar: CSV/XLSX faylni yuklang yoki jadvalni shu yerda kiriting. Saytda CSV, XLSX va JSON formatlarida yuklab olinadi; API: /api/open-data."
        icon={<Database size={28} />}
        empty="Hali to‘plam qo‘shilmagan"
        publicUrl="/open-data"
        hiddenNote="Saytda ko‘rinmaydi: ko‘rsatkichlarda ma’lumot yo‘q (yoki hammasi yashirilgan) va hali birorta to‘plam chop etilmagan."
        defaults={{ status: "published", category: "other", table: { columns: [], rows: [] } }}
        fields={[
          { key: "title", label: "Nomi", type: "text", wide: true, tr: true },
          { key: "description", label: "Tavsif", type: "textarea", wide: true, tr: true },
          { key: "period", label: "Davr", type: "text", tr: true, placeholder: "2025/2026 o‘quv yili" },
          { key: "source", label: "Manba", type: "text", tr: true, placeholder: "Registrator ofisi" },
          { key: "category", label: "Toifa", type: "select", options: DS_CATS },
          { key: "updated_on", label: "Ma’lumot sanasi", type: "date" },
          { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
        ]}
        extra={(e, set, tr) =>
          tr ? null : (
            <Field label="Jadval" wide>
              <TableEditor value={(e.table as Table) || { columns: [], rows: [] }} onChange={(v) => set("table", v)} />
            </Field>
          )
        }
        row={(x) => (
          <>
            <b>{x.title}</b>
            <small>
              {String(x.period || "")}
              {Array.isArray((x.table as Table | undefined)?.rows) ? ` · ${(x.table as Table).rows.length} qator` : ""}
              {x.status === "draft" && <Pill>yashirin</Pill>}
            </small>
          </>
        )}
      />
    </>
  );
}

/* ------------------------------------------------------------------ rektor murojaati (Institut ma'lumotlari: rector_* maydonlari) */
type RU = Pick<Uni, "rector_name" | "rector_title" | "rector_photo" | "rector_speech" | "rector_speech_html"> & { rector_signature?: string; rector_staff_id?: string; i18n?: Record<string, Partial<Uni>> };
export function RectorAdmin() {
  const run = useRun();
  const baseLang = useBaseLang();
  const [u, setU] = useState<RU | null>(null);
  const [lang, setLang] = useState<Lang | null>(null);
  const [staff, setStaff] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [edKey, setEdKey] = useState(0);
  const [saved, setSaved] = useState(0);
  const site = useSiteSection("/rector", saved);
  useEffect(() => {
    admin.uni().then((x) => setU(x as unknown as RU));
    admin.items<Item>("staff").then((r) => setStaff(r.items.filter((s) => s.category === "leadership"))).catch(() => null);
  }, []);
  if (!u || !baseLang) return <Spinner />;
  const tr: Lang | null = lang && lang !== baseLang ? lang : null;
  const trd = (tr && u.i18n?.[tr]) || {};
  const v = tr ? { rector_name: "", rector_title: "", rector_speech: null, rector_speech_html: "", ...trd } : u;
  const set = (p: Partial<RU>) =>
    setU((cur) => {
      if (!cur) return cur;
      if (!tr) return { ...cur, ...p };
      return { ...cur, i18n: { ...(cur.i18n || {}), [tr]: { ...(cur.i18n?.[tr] || {}), ...p } } };
    });
  const s = staff.find((x) => x.id === u.rector_staff_id) || staff.find((x) => /rektor/i.test(String(x.position)) && !/prorektor/i.test(String(x.position)));
  const save = async () => {
    setBusy(true);
    await run(
      () =>
        admin.saveUni({
          rector_name: u.rector_name,
          rector_title: u.rector_title,
          rector_photo: u.rector_photo,
          rector_speech: u.rector_speech,
          rector_speech_html: u.rector_speech_html,
          rector_signature: u.rector_signature || "",
          rector_staff_id: u.rector_staff_id || "",
          i18n: u.i18n || {},
        } as unknown as Partial<Uni>),
      "Saqlandi",
    );
    setBusy(false);
    setSaved((n) => n + 1);
  };
  return (
    <div className="a-page narrow">
      <PageHead
        title="Rektor murojaati"
        sub="«Institut haqida» sahifasida va alohida /rector sahifasida chiqadi. Matn bo‘sh bo‘lsa — saytda ko‘rinmaydi. Ism, lavozim va surat bo‘sh qolsa — xodimlar ro‘yxatidagi rektor profilidan olinadi."
        actions={
          <>
            <SiteLink path="/rector" state={site} />
            <Btn kind="primary" icon={<Save size={15} />} busy={busy} onClick={save}>
              Saqlash
            </Btn>
          </>
        }
      />
      <SiteNote state={site} hidden="Saytda ko‘rinmaydi: murojaat matni hali yozilmagan. Matnni yozib saqlang — /rector sahifasi va «Institut haqida»dagi blok darhol paydo bo‘ladi." />
      <Card>
        <LangTabs value={lang || baseLang} base={baseLang} onChange={(l) => { setLang(l); setEdKey((k) => k + 1); }} filled={(l) => !!(l === baseLang ? u.rector_speech_html : u.i18n?.[l]?.rector_speech_html)} />
        {!tr && (
          <Field label="Xodimlar ro‘yxatidagi rektor" hint={s ? `Profil: ${s.title}` : "Rahbariyat toifasidagi xodimlar"} wide>
            <Select
              value={u.rector_staff_id || ""}
              onChange={(x) => set({ rector_staff_id: x })}
              options={[{ value: "", label: "Avtomatik (lavozimida «rektor» bo‘lgan xodim)" }, ...staff.map((x) => ({ value: x.id, label: `${x.title} — ${String(x.position || "").slice(0, 60)}` }))]}
            />
          </Field>
        )}
        <div className="a-form-grid">
          <Field label="Ism familiya" wide>
            <Input value={v.rector_name || ""} placeholder={tr ? u.rector_name : s?.title} onChange={(e) => set({ rector_name: e.target.value })} />
          </Field>
          <Field label="Lavozim" wide>
            <Input value={v.rector_title || ""} placeholder={tr ? u.rector_title : String(s?.position || "")} onChange={(e) => set({ rector_title: e.target.value })} />
          </Field>
          {!tr && (
            <>
              <Field label="Surat (bo‘sh — profildagi)">
                <ImageField value={u.rector_photo || ""} onChange={(x) => set({ rector_photo: x })} aspect="4 / 5" />
              </Field>
              <Field label="Imzo rasmi (ixtiyoriy, shaffof PNG)">
                <ImageField value={u.rector_signature || ""} onChange={(x) => set({ rector_signature: x })} aspect="3 / 1" />
              </Field>
            </>
          )}
        </div>
        <Field label="Murojaat matni" wide>
          <div className="mini-editor">
            <RichEditor
              key={`${tr || "base"}-${edKey}`}
              value={(v.rector_speech as JSONContent) || null}
              onChange={(o) => set({ rector_speech: o.json, rector_speech_html: o.html })}
              placeholder="Hurmatli talabalar, ota-onalar va hamkorlar…"
            />
          </div>
        </Field>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ maxfiylik siyosati: sahifalar muharririga */
export function PrivacyAdmin() {
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    admin
      .items<Item>("page")
      .then((r) => {
        const p = r.items.find((x) => x.slug === "maxfiylik-siyosati");
        setTo(p ? `/admin/pages/${p.id}` : "/admin/pages");
      })
      .catch(() => setTo("/admin/pages"));
  }, []);
  return to ? <Navigate to={to} replace /> : <Spinner />;
}
