// Talabalar hayoti / abituriyent admin bo'limlari uchun umumiy vositalar: yozuvlar ro'yxati va tahrirlash oynasi (uch tilda),
// suratlar maydoni (bir nechta fayl yuklash, sudrab tartiblash, alt va izoh, muqova), sahifa matnlari kartasi.
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ExternalLink, GripVertical, ImagePlus, Loader2, Pencil, Plus, Search, Star, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { req, type Lang } from "../../lib/api";
import { RichEditor } from "../../editor/RichEditor";
import { admin, errMsg } from "../api";
import { Btn, Card, Empty, Field, ImageField, Input, LangTabs, MediaLibrary, Modal, Pill, Spinner, TagInput, Textarea, Toggle, useBaseLang, useConfirm, useRun, useToast } from "../ui";
import "../../styles/campus-admin.css";

export type Rec = Record<string, unknown> & { id?: string; title?: string; status?: string; i18n?: Record<string, Record<string, unknown>> };
export type Photo = { url: string; alt: string; caption?: string; i18n?: Partial<Record<Lang, { alt?: string; caption?: string }>> };

export const ERR: Record<string, string> = {
  photo_alt_required: "Nashr qilish uchun har bir suratga alt matn (surat nimani ko‘rsatishini qisqa tavsif) yozing — ko‘zi ojiz foydalanuvchilar uchun majburiy.",
  album_empty: "Albomda kamida bitta surat yoki video bo‘lishi kerak.",
  year_required: "Qabul yilini kiriting (masalan, 2026).",
  bad_dates: "Tugash sanasi boshlanish sanasidan oldin bo‘lishi mumkin emas.",
  panorama_required: "Nashr qilish uchun panorama surati yuklang.",
  empty_title: "Nomini kiriting.",
  not_equirectangular: "Panorama nisbati 2:1 bo‘lishi kerak (ekvirektangulyar, masalan 6000×3000).",
  unsupported_type: "Fayl turi qo‘llab-quvvatlanmaydi (JPG, PNG, WEBP).",
  too_large: "Fayl juda katta.",
  bad_xlsx: "Excel faylni o‘qib bo‘lmadi.",
  empty_xlsx: "Faylda «Ta’lim yo‘nalishi» va «O‘tish bali» ustunlari bo‘lgan qator topilmadi.",
  smtp_not_configured: "Pochta sozlanmagan: Sozlamalar → Sayt sozlamalari → SMTP yoki pochta serveri.",
  too_many_attempts: "Juda ko‘p urinish — birozdan so‘ng qayta urinib ko‘ring.",
};
export const em = (e: unknown) => {
  const d = (e as { detail?: string })?.detail;
  return (typeof d === "string" && ERR[d]) || errMsg(e);
};

export const VIS = [
  { value: "published", label: "Saytda ko‘rinadi" },
  { value: "draft", label: "Qoralama (yashirin)" },
];

/* ------------------------------------------------------------------ xodimlar ro'yxati (tanlov uchun) */
let staffP: Promise<{ id: string; title: string; position?: string; status: string }[]> | null = null;
export function useStaff() {
  const [s, setS] = useState<{ id: string; title: string; position?: string; status: string }[]>([]);
  useEffect(() => {
    staffP ||= req<{ items: { id: string; title: string; position?: string; status: string }[] }>("GET", "/api/admin/items/staff").then((r) =>
      r.items.filter((x) => x.status === "published").sort((a, b) => a.title.localeCompare(b.title)),
    );
    staffP.then(setS).catch(() => setS([]));
  }, []);
  return s;
}

export function StaffSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const staff = useStaff();
  return (
    <select className="a-input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">— tanlanmagan —</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title}
          {s.position ? ` — ${s.position.slice(0, 60)}` : ""}
        </option>
      ))}
    </select>
  );
}

export function StaffMulti({ value, onChange, max = 8 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const staff = useStaff();
  const by = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);
  return (
    <div className="cxa-staff">
      {value.map((id, i) => (
        <div key={id} className="cxa-staff-row">
          <span>{by[id]?.title || id}</span>
          <button type="button" className="a-icon" disabled={i === 0} onClick={() => onChange(value.map((x, j) => (j === i - 1 ? id : j === i ? value[i - 1] : x)))} aria-label="Yuqoriga">
            <ArrowUp size={14} />
          </button>
          <button type="button" className="a-icon danger" onClick={() => onChange(value.filter((x) => x !== id))} aria-label="Olib tashlash">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {value.length < max && (
        <select className="a-input" value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
          <option value="">+ Xodim qo‘shish…</option>
          {staff
            .filter((s) => !value.includes(s.id))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
        </select>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ suratlar maydoni */
const thumbOf = (u: string) => {
  const m = /^\/media\/([a-f0-9]{16}\.(?:png|jpg|webp))$/.exec(u);
  return m ? `/img/${u.startsWith("/media/") ? "m" : "s"}/320/${m[1]}` : u;
};

export function PhotosField({ value, onChange, lang, base, cover, onCover, required }: {
  value: Photo[];
  onChange: (v: Photo[]) => void;
  lang: Lang;
  base: Lang;
  cover?: string;
  onCover?: (u: string) => void;
  required?: boolean;
}) {
  const run = useRun();
  const [busy, setBusy] = useState(0);
  const [lib, setLib] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const tr = lang !== base;
  const upload = async (files: FileList | File[] | null) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setBusy(list.length);
    const out: Photo[] = [];
    for (const f of list) {
      const m = await run(() => admin.upload(f));
      if (m) out.push({ url: m.url, alt: "", caption: "" });
      setBusy((n) => n - 1);
    }
    onChange([...value, ...out]);
  };
  const setP = (i: number, k: "alt" | "caption", v: string) =>
    onChange(
      value.map((p, j) => {
        if (j !== i) return p;
        if (!tr) return { ...p, [k]: v };
        const t = { ...(p.i18n || {}) };
        t[lang] = { ...(t[lang] || {}), [k]: v };
        return { ...p, i18n: t };
      }),
    );
  const move = (i: number, j: number) => {
    if (j < 0 || j >= value.length || i === j) return;
    const a = [...value];
    const [x] = a.splice(i, 1);
    a.splice(j, 0, x);
    onChange(a);
  };
  const missing = value.filter((p) => !p.alt?.trim()).length;
  return (
    <div className="cxa-photos">
      {!tr && (
        <div
          className="a-drop cxa-drop"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
          }}
          onClick={() => input.current?.click()}
        >
          {busy ? <Loader2 className="spin" /> : <Upload size={20} />}
          <b>{busy ? `Yuklanmoqda… (${busy})` : "Suratlarni shu yerga tashlang yoki tanlang"}</b>
          <span>Bir nechta faylni birdaniga tanlash mumkin · JPG, PNG, WEBP · 15 MB gacha</span>
          <input ref={input} type="file" hidden multiple accept="image/*" onChange={(e) => upload(e.target.files)} />
        </div>
      )}
      {!tr && (
        <div className="cxa-photos-bar">
          <Btn size="sm" icon={<ImagePlus size={14} />} onClick={() => setLib(true)}>
            Media kutubxonasidan
          </Btn>
          {value.length > 0 && (
            <span className={missing && required ? "cxa-warn" : "a-hint"}>
              {value.length} ta surat{missing ? ` · alt matnsiz: ${missing}` : " · hammasida alt matn bor"}
            </span>
          )}
        </div>
      )}
      {tr && <p className="a-hint">{lang.toUpperCase()} tilidagi alt matn va izohlar. Bo‘sh qolsa — asosiy tildagisi ko‘rsatiladi.</p>}
      {value.length > 0 && (
        <ol className="cxa-ph-list">
          {value.map((p, i) => {
            const alt = tr ? p.i18n?.[lang]?.alt || "" : p.alt;
            const cap = tr ? p.i18n?.[lang]?.caption || "" : p.caption || "";
            return (
              <li
                key={p.url}
                className={`cxa-ph ${drag === i ? "drag" : ""} ${!p.alt?.trim() && required ? "bad" : ""}`}
                draggable={!tr}
                onDragStart={() => setDrag(i)}
                onDragEnd={() => setDrag(null)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (drag !== null && drag !== i) {
                    move(drag, i);
                    setDrag(i);
                  }
                }}
              >
                <div className="cxa-ph-img">
                  <img src={thumbOf(p.url)} alt="" loading="lazy" />
                  {cover === p.url && <span className="cxa-ph-cover">Muqova</span>}
                  {!tr && (
                    <span className="cxa-ph-grip" aria-hidden>
                      <GripVertical size={16} />
                    </span>
                  )}
                </div>
                <div className="cxa-ph-f">
                  <label>
                    <span>
                      Alt matn{tr ? ` (${lang.toUpperCase()})` : ""} {!tr && <i>*</i>}
                    </span>
                    <input className="a-input" value={alt} placeholder={tr ? p.alt : "Suratda nima tasvirlangan"} maxLength={300} onChange={(e) => setP(i, "alt", e.target.value)} />
                  </label>
                  <label>
                    <span>Izoh{tr ? ` (${lang.toUpperCase()})` : ""}</span>
                    <input className="a-input" value={cap} placeholder={tr ? p.caption : "ixtiyoriy"} maxLength={500} onChange={(e) => setP(i, "caption", e.target.value)} />
                  </label>
                </div>
                {!tr && (
                  <div className="cxa-ph-a">
                    <button type="button" className="a-icon" onClick={() => move(i, i - 1)} disabled={i === 0} title="Oldinga" aria-label="Oldinga">
                      <ArrowLeft size={14} />
                    </button>
                    <button type="button" className="a-icon" onClick={() => move(i, i + 1)} disabled={i === value.length - 1} title="Orqaga" aria-label="Orqaga">
                      <ArrowRight size={14} />
                    </button>
                    {onCover && (
                      <button type="button" className={`a-icon ${cover === p.url ? "on" : ""}`} onClick={() => onCover(cover === p.url ? "" : p.url)} title="Muqova qilish" aria-label="Muqova qilish" aria-pressed={cover === p.url}>
                        <Star size={14} />
                      </button>
                    )}
                    <button type="button" className="a-icon danger" onClick={() => onChange(value.filter((_, j) => j !== i))} title="Olib tashlash" aria-label="Olib tashlash">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <MediaLibrary open={lib} onClose={() => setLib(false)} onPick={(m) => !value.some((p) => p.url === m.url) && onChange([...value, { url: m.url, alt: "", caption: "" }])} />
    </div>
  );
}

/* ------------------------------------------------------------------ yozuvlar ro'yxati + tahrirlash oynasi */
export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "toggle" | "url" | "tags" | "image" | "photos" | "rich" | "staff" | "date" | "datetime" | "custom";
  options?: { value: string; label: string }[];
  wide?: boolean;
  hint?: string;
  placeholder?: string;
  altKey?: string; // image: alt matn maydoni
  cover?: boolean; // photos: muqova tanlash
  i18n?: boolean; // tarjima qilinadi
  render?: (p: { value: unknown; set: (v: unknown) => void; item: Rec; setItem: (fn: (r: Rec) => Rec) => void; lang: Lang; base: Lang }) => ReactNode;
  show?: (item: Rec) => boolean;
};

const toLocal = (iso: unknown, withTime: boolean) => {
  if (!iso || typeof iso !== "string") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  const s = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${s}T${p(d.getHours())}:${p(d.getMinutes())}` : s;
};
const fromLocal = (v: string, withTime: boolean) => (v ? new Date(withTime ? v : `${v}T12:00`).toISOString() : null);

export function ItemsPanel({ kind, fields, defaults, row, icon, empty, title, filter, sort, onSaved, newLabel = "Qo‘shish", viewUrl, extraTools }: {
  kind: string;
  fields: FieldDef[];
  defaults: Rec;
  row: (x: Rec) => ReactNode;
  icon: ReactNode;
  empty: string;
  title?: string;
  filter?: (x: Rec) => boolean;
  sort?: (a: Rec, b: Rec) => number;
  onSaved?: () => void;
  newLabel?: string;
  viewUrl?: (x: Rec) => string | null;
  extraTools?: ReactNode;
}) {
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const base = useBaseLang() || "uz";
  const [sp, setSp] = useSearchParams();
  const [items, setItems] = useState<Rec[] | null>(null);
  const [edit, setEdit] = useState<Rec | null>(null);
  const [lang, setLang] = useState<Lang>("uz");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [richKey, setRichKey] = useState(0);
  const load = useCallback(() => req<{ items: Rec[] }>("GET", `/api/admin/items/${kind}`).then((r) => setItems(r.items)).catch(() => setItems([])), [kind]);
  useEffect(() => {
    load();
  }, [load]);
  const open = async (x: Rec | null) => {
    setErr("");
    setLang(base);
    setRichKey((k) => k + 1);
    if (!x) return setEdit({ ...defaults });
    const full = await run(() => req<Rec>("GET", `/api/admin/items/${kind}/${x.id}`));
    if (full) setEdit(full);
  };
  // qidiruvdan (?id=…) kelganda — tahrirlash oynasi ochiladi
  useEffect(() => {
    const id = sp.get("id");
    if (id && items) {
      const x = items.find((i) => i.id === id);
      if (x) open(x);
      sp.delete("id");
      setSp(sp, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  const tr = lang !== base;
  const get = (k: string) => (tr ? (edit?.i18n?.[lang] || {})[k] : edit?.[k]);
  const set = (k: string, v: unknown) =>
    setEdit((e) => {
      if (!e) return e;
      if (!tr) return { ...e, [k]: v };
      const i18n = { ...(e.i18n || {}) };
      i18n[lang] = { ...(i18n[lang] || {}), [k]: v };
      return { ...e, i18n };
    });
  const save = async () => {
    if (!edit) return;
    if (!String(edit.title || "").trim()) {
      setErr(ERR.empty_title);
      setLang(base);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = edit.id ? await req<Rec>("PUT", `/api/admin/items/${kind}/${edit.id}`, edit) : await req<Rec>("POST", `/api/admin/items/${kind}`, edit);
      toast("Saqlandi");
      setEdit(null);
      load();
      onSaved?.();
      void r;
    } catch (e) {
      setErr(em(e));
    }
    setBusy(false);
  };
  const move = async (list: Rec[], i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const a = [...list];
    [a[i], a[j]] = [a[j], a[i]];
    const ids = a.map((x) => x.id as string);
    const rest = (items || []).filter((x) => !ids.includes(x.id as string)).map((x) => x.id as string);
    setItems((all) => (all ? [...a, ...all.filter((x) => !ids.includes(x.id as string))] : all));
    await run(() => req("POST", `/api/admin/items/${kind}/reorder`, { ids: [...ids, ...rest] }));
  };
  const shown = (items || []).filter((x) => (!filter || filter(x)) && (!q || String(x.title || "").toLowerCase().includes(q.toLowerCase())));
  if (sort) shown.sort(sort);
  const fieldsShown = edit ? fields.filter((f) => (!tr || f.i18n || f.type === "photos") && (!f.show || f.show(edit))) : [];
  const filled = (l: Lang) => !!(l === base ? edit?.title : edit?.i18n?.[l]?.title);
  return (
    <>
      <div className="list-tools">
        <span className="muted">{items ? `${shown.length} ta yozuv` : ""}</span>
        <div className="cxa-tools">
          {extraTools}
          <label className="a-search">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish…" aria-label="Qidirish" />
          </label>
          <Btn kind="accent" icon={<Plus size={16} />} onClick={() => open(null)}>
            {newLabel}
          </Btn>
        </div>
      </div>
      {!items ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <Card>
          <Empty icon={icon} title={items.length && q ? "Hech narsa topilmadi" : empty}>
            <Btn kind="accent" icon={<Plus size={15} />} onClick={() => open(null)}>
              {newLabel}
            </Btn>
          </Empty>
        </Card>
      ) : (
        <div className="doc-list">
          {shown.map((x, i) => {
            const url = x.status === "published" ? viewUrl?.(x) : null;
            return (
              <div key={x.id as string} className={`doc-row ${x.status === "draft" ? "dim" : ""}`} onClick={() => open(x)}>
                <div className="doc-main">
                  {row(x)}
                  {x.status === "draft" && <Pill>qoralama</Pill>}
                </div>
                <div className="doc-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="a-icon" onClick={() => move(shown, i, -1)} title="Yuqoriga" aria-label="Yuqoriga" disabled={i === 0}>
                    <ArrowUp size={15} />
                  </button>
                  <button className="a-icon" onClick={() => move(shown, i, 1)} title="Pastga" aria-label="Pastga" disabled={i === shown.length - 1}>
                    <ArrowDown size={15} />
                  </button>
                  {url && (
                    <a className="a-icon" href={url} target="_blank" rel="noreferrer" title="Saytda ochish" aria-label="Saytda ochish">
                      <ExternalLink size={15} />
                    </a>
                  )}
                  <button className="a-icon" onClick={() => open(x)} title="Tahrirlash" aria-label="Tahrirlash">
                    <Pencil size={15} />
                  </button>
                  <button
                    className="a-icon danger"
                    title="O‘chirish"
                    aria-label="O‘chirish"
                    onClick={async () => {
                      if (!(await confirm(`«${x.title}» o‘chirilsinmi?`))) return;
                      await run(() => req("DELETE", `/api/admin/items/${kind}/${x.id}`), "O‘chirildi");
                      load();
                      onSaved?.();
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? `Tahrirlash${title ? `: ${title}` : ""}` : title ? `Yangi: ${title}` : "Yangi yozuv"}
        width={880}
        footer={
          <>
            {err && (
              <span className="cxa-err" role="alert">
                {err}
              </span>
            )}
            <Btn onClick={() => setEdit(null)}>Bekor qilish</Btn>
            <Btn kind="primary" busy={busy} onClick={save}>
              Saqlash
            </Btn>
          </>
        }
      >
        {edit && (
          <>
            <div className="modal-lang">
              <LangTabs value={lang} base={base} onChange={(l) => (setLang(l), setRichKey((k) => k + 1))} filled={filled} />
              {tr && <p className="a-hint">Faqat matnli maydonlar tarjima qilinadi; bo‘sh qolganlari saytda asosiy tilda chiqadi.</p>}
            </div>
            <div className="a-form-grid">
              {fieldsShown.map((f) => {
                const v = f.type === "photos" ? edit[f.key] : get(f.key);
                const ph = tr ? String(edit[f.key] ?? "") || f.placeholder : f.placeholder;
                let input: ReactNode;
                switch (f.type) {
                  case "textarea":
                    input = <Textarea rows={4} value={(v as string) || ""} placeholder={ph} onChange={(e) => set(f.key, e.target.value)} />;
                    break;
                  case "select":
                    input = (
                      <select className="a-input" value={(v as string) || f.options![0].value} onChange={(e) => set(f.key, e.target.value)}>
                        {f.options!.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    );
                    break;
                  case "toggle":
                    input = <Toggle checked={!!v} onChange={(x) => set(f.key, x)} label={f.hint || f.label} />;
                    break;
                  case "tags":
                    input = <TagInput value={(v as string[]) || []} onChange={(x) => set(f.key, x)} placeholder={f.placeholder || "Yozing va Enter bosing"} />;
                    break;
                  case "number":
                    input = <Input type="number" value={(v as number | undefined) ?? ""} placeholder={ph} onChange={(e) => set(f.key, e.target.value === "" ? null : Number(e.target.value))} />;
                    break;
                  case "date":
                  case "datetime":
                    input = <Input type={f.type === "date" ? "date" : "datetime-local"} value={toLocal(v, f.type === "datetime")} onChange={(e) => set(f.key, fromLocal(e.target.value, f.type === "datetime"))} />;
                    break;
                  case "staff":
                    input = <StaffSelect value={(v as string) || ""} onChange={(x) => set(f.key, x)} />;
                    break;
                  case "image":
                    input = (
                      <div className="cxa-img">
                        <ImageField value={(edit[f.key] as string) || ""} onChange={(x) => setEdit((e) => (e ? { ...e, [f.key]: x } : e))} aspect="4 / 3" />
                        {f.altKey && (
                          <label className="a-field">
                            <span className="a-label">Alt matn{tr ? ` (${lang.toUpperCase()})` : ""} {edit[f.key] && !tr ? <i className="cxa-req">*</i> : null}</span>
                            <input className="a-input" value={(get(f.altKey) as string) || ""} placeholder={tr ? String(edit[f.altKey] || "") : "Suratda nima tasvirlangan"} onChange={(e) => set(f.altKey!, e.target.value)} maxLength={300} />
                          </label>
                        )}
                      </div>
                    );
                    break;
                  case "photos":
                    input = (
                      <PhotosField
                        value={(edit[f.key] as Photo[]) || []}
                        onChange={(x) => setEdit((e) => (e ? { ...e, [f.key]: x } : e))}
                        lang={lang}
                        base={base}
                        required={edit.status === "published"}
                        cover={f.cover ? (edit.cover as string) || "" : undefined}
                        onCover={f.cover ? (u) => setEdit((e) => (e ? { ...e, cover: u } : e)) : undefined}
                      />
                    );
                    break;
                  case "rich": {
                    const cur = tr ? (edit.i18n?.[lang] || {}) : edit;
                    input = (
                      <div className="cxa-rich">
                        <RichEditor
                          key={`${richKey}-${lang}`}
                          minimal
                          value={(cur.content as object) || (cur.html as string) || ""}
                          onChange={(o) => {
                            if (!tr) setEdit((e) => (e ? { ...e, content: o.json, html: o.html, text: o.text } : e));
                            else
                              setEdit((e) => {
                                if (!e) return e;
                                const i18n = { ...(e.i18n || {}) };
                                i18n[lang] = { ...(i18n[lang] || {}), content: o.json, html: o.html, text: o.text };
                                return { ...e, i18n };
                              });
                          }}
                        />
                      </div>
                    );
                    break;
                  }
                  case "custom":
                    input = f.render?.({ value: v, set: (x) => set(f.key, x), item: edit, setItem: (fn) => setEdit((e) => (e ? fn(e) : e)), lang, base });
                    break;
                  default:
                    input = <Input value={(v as string) || ""} placeholder={ph} onChange={(e) => set(f.key, e.target.value)} type={f.type === "url" ? "url" : "text"} />;
                }
                return (
                  <Field key={f.key} label={f.type === "toggle" ? "" : `${f.label}${tr && f.i18n ? ` (${lang.toUpperCase()})` : ""}`} hint={f.type === "toggle" ? undefined : f.hint} wide={f.wide || ["photos", "rich", "image", "custom"].includes(f.type)}>
                    {input}
                  </Field>
                );
              })}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ sahifa matnlari va sozlamalari (KV: campus/<bo'lim>) */
export type SetDef = {
  key: string;
  label: string;
  type: "ltext" | "lhtml" | "lpairs" | "bool" | "int" | "float" | "url" | "image" | "ids" | "str" | "select";
  pair?: [string, string, string, string]; // [kalit1, kalit2, yorliq1, yorliq2]
  hint?: string;
  rows?: number;
  options?: { value: string; label: string }[];
  max?: number;
};

export function SettingsCard({ group, section, title, sub, fields, onSaved }: { group: "life" | "gallery" | "applicant"; section: string; title: string; sub?: string; fields: SetDef[]; onSaved?: () => void }) {
  const toast = useToast();
  const base = useBaseLang() || "uz";
  const [s, setS] = useState<Record<string, unknown> | null>(null);
  const [lang, setLang] = useState<Lang>("uz");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [k, setK] = useState(0);
  useEffect(() => {
    req<{ settings: Record<string, unknown> }>("GET", `/api/admin/${group}/settings/${section}`)
      .then((r) => setS(r.settings))
      .catch((e) => toast(em(e), "error"));
  }, [group, section, toast]);
  useEffect(() => setLang(base), [base]);
  if (!s) return <Spinner />;
  const lm = (key: string) => (s[key] as Record<string, unknown>) || {};
  const up = (key: string, v: unknown) => {
    setS({ ...s, [key]: v });
    setDirty(true);
  };
  const upL = (key: string, v: unknown) => up(key, { ...lm(key), [lang]: v });
  const hasL = fields.some((f) => ["ltext", "lhtml", "lpairs"].includes(f.type));
  const save = async () => {
    setBusy(true);
    try {
      const r = await req<{ settings: Record<string, unknown> }>("PUT", `/api/admin/${group}/settings/${section}`, s);
      setS(r.settings);
      setDirty(false);
      toast("Saqlandi");
      onSaved?.();
    } catch (e) {
      toast(em(e), "error");
    }
    setBusy(false);
  };
  return (
    <Card
      title={title}
      sub={sub}
      actions={
        <Btn kind="primary" busy={busy} disabled={!dirty} onClick={save}>
          Saqlash
        </Btn>
      }
    >
      {hasL && <LangTabs value={lang} base={base} onChange={(l) => (setLang(l), setK((x) => x + 1))} filled={(l) => fields.some((f) => ["ltext", "lhtml", "lpairs"].includes(f.type) && !!(lm(f.key) as Record<string, unknown>)[l])} />}
      <div className="a-form-grid cxa-set">
        {fields.map((f) => {
          let input: ReactNode;
          if (f.type === "ltext")
            input = (f.rows || 1) > 1 ? <Textarea rows={f.rows} value={(lm(f.key)[lang] as string) || ""} onChange={(e) => upL(f.key, e.target.value)} /> : <Input value={(lm(f.key)[lang] as string) || ""} onChange={(e) => upL(f.key, e.target.value)} />;
          else if (f.type === "lhtml")
            input = (
              <div className="cxa-rich">
                <RichEditor key={`${k}-${f.key}-${lang}`} minimal value={(lm(f.key)[lang] as string) || ""} onChange={(o) => upL(f.key, o.html)} />
              </div>
            );
          else if (f.type === "lpairs") {
            const rows = ((lm(f.key)[lang] as Record<string, string>[]) || []) as Record<string, string>[];
            const [k1, k2, l1, l2] = f.pair!;
            input = (
              <div className="cxa-pairs">
                {rows.map((r, i) => (
                  <div key={i} className="cxa-pair">
                    <span className="cxa-pair-n">{i + 1}</span>
                    <div>
                      <Input value={r[k1] || ""} placeholder={l1} aria-label={l1} onChange={(e) => upL(f.key, rows.map((x, j) => (j === i ? { ...x, [k1]: e.target.value } : x)))} />
                      <Textarea rows={2} value={r[k2] || ""} placeholder={l2} aria-label={l2} onChange={(e) => upL(f.key, rows.map((x, j) => (j === i ? { ...x, [k2]: e.target.value } : x)))} />
                    </div>
                    <div className="cxa-pair-a">
                      <button type="button" className="a-icon" disabled={i === 0} onClick={() => upL(f.key, rows.map((x, j) => (j === i - 1 ? rows[i] : j === i ? rows[i - 1] : x)))} aria-label="Yuqoriga">
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" className="a-icon danger" onClick={() => upL(f.key, rows.filter((_, j) => j !== i))} aria-label="O‘chirish">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                <Btn size="sm" icon={<Plus size={14} />} onClick={() => upL(f.key, [...rows, { [k1]: "", [k2]: "" }])}>
                  Qo‘shish
                </Btn>
              </div>
            );
          } else if (f.type === "bool") input = <Toggle checked={!!s[f.key]} onChange={(v) => up(f.key, v)} label={f.label} hint={f.hint} />;
          else if (f.type === "int" || f.type === "float")
            input = <Input type="number" step={f.type === "float" ? "any" : 1} value={(s[f.key] as number | null) ?? ""} onChange={(e) => up(f.key, e.target.value === "" ? null : Number(e.target.value))} />;
          else if (f.type === "image") input = <ImageField value={(s[f.key] as string) || ""} onChange={(v) => up(f.key, v)} aspect="4 / 3" />;
          else if (f.type === "ids") input = <StaffMulti value={(s[f.key] as string[]) || []} onChange={(v) => up(f.key, v)} max={f.max} />;
          else if (f.type === "select")
            input = (
              <select className="a-input" value={(s[f.key] as string) || ""} onChange={(e) => up(f.key, e.target.value)}>
                {f.options!.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            );
          else input = <Input value={(s[f.key] as string) || ""} onChange={(e) => up(f.key, e.target.value)} />;
          const isL = ["ltext", "lhtml", "lpairs"].includes(f.type);
          return (
            <Field key={f.key} label={f.type === "bool" ? "" : `${f.label}${isL ? ` (${lang.toUpperCase()})` : ""}`} hint={f.type === "bool" ? undefined : f.hint} wide={f.type !== "int" && f.type !== "float"}>
              {input}
            </Field>
          );
        })}
      </div>
    </Card>
  );
}

/** Bo'lim ichidagi yorliqlar (tab) */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="a-seg cxa-tabs" role="tablist">
      {items.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Visible({ on, to }: { on: boolean | undefined; to: string }) {
  if (on === undefined) return null;
  return on ? (
    <a className="a-btn ghost md" href={to} target="_blank" rel="noreferrer">
      <ExternalLink size={15} />
      <span>Saytda ko‘rish</span>
    </a>
  ) : (
    <span className="cxa-hidden" role="status" title="Yozuvni «Saytda ko‘rinadi» holatida saqlang — sahifa va menyudagi havola darhol paydo bo‘ladi">
      Saytda ko‘rinmaydi: hali birorta yozuv chop etilmagan
    </span>
  );
}

let secP: Promise<Record<string, boolean>> | null = null;
export function useVisible(): [Record<string, boolean> | null, () => void] {
  const [v, setV] = useState<Record<string, boolean> | null>(null);
  const load = useCallback(() => {
    secP = req<Record<string, boolean>>("GET", "/api/campus/sections");
    secP.then(setV).catch(() => setV(null));
  }, []);
  useEffect(() => {
    (secP || req<Record<string, boolean>>("GET", "/api/campus/sections")).then(setV).catch(() => null);
  }, []);
  return [v, load];
}
