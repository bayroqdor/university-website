import { ArrowDown, ArrowUp, BookOpen, Briefcase, Building2, CalendarDays, Copy, ExternalLink, Eye, FileText, GraduationCap, Handshake, Landmark, Layers, Mail, Megaphone, Newspaper, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Document, Item, Lang, Partner, UsefulLink } from "../../lib/api";
import { admin, type Kind } from "../api";
import { Btn, Card, Empty, Field, ImageField, Input, LangBadges, LangTabs, Modal, PageHead, Pill, Select, Spinner, TagInput, Textarea, Toggle, fmtDateTime, fmtNum, useBaseLang, useConfirm, useRun } from "../ui";

const STATUS: Record<string, [string, "ok" | "warn" | "muted" | "info"]> = {
  published: ["Nashr qilingan", "ok"],
  scheduled: ["Rejalashtirilgan", "info"],
  draft: ["Qoralama", "muted"],
};

/** Muharrir bilan tahrirlanadigan turlar: ro'yxat sahifasi uchun sozlamalar */
export const RICH_KINDS: Record<string, { title: string; one: string; sub: string; path: string; section: string; icon: ReactNode; dated: boolean; cover: string; tags?: boolean; badge?: (x: Item) => string }> = {
  news: { title: "Yangiliklar", one: "yangilik", sub: "Institut yangiliklari: qoralama, rejalashtirilgan va nashr qilinganlar. Obunachilarga email yuborish mumkin.", path: "/admin/news", section: "news", icon: <Newspaper size={18} />, dated: true, cover: "feature_image", tags: true },
  announce: { title: "E’lonlar", one: "e’lon", sub: "Qabul, imtihon, tadbir va boshqa rasmiy e’lonlar; muddat bilan.", path: "/admin/announcements", section: "announcements", icon: <Megaphone size={18} />, dated: true, cover: "feature_image", tags: true, badge: (x) => ({ general: "Umumiy", admission: "Qabul", exam: "Imtihon", event: "Tadbir", vacancy: "Vakansiya", students: "Talabalar" } as Record<string, string>)[(x.category as string) || ""] || "" },
  page: { title: "Sahifalar", one: "sahifa", sub: "Institut haqida, tarix, rektor murojaati, qabul qoidalari va boshqa statik sahifalar. Bo‘limga ko‘ra menyuda chiqadi.", path: "/admin/pages", section: "about", icon: <FileText size={18} />, dated: false, cover: "cover", badge: (x) => ({ about: "Institut", admission: "Qabul", students: "Talabalar", science: "Ilm-fan", other: "Boshqa" } as Record<string, string>)[(x.section as string) || ""] || "" },
  program: { title: "Ta’lim yo‘nalishlari", one: "yo‘nalish", sub: "Bakalavriat, magistratura, qo‘shma dasturlar va tayanch doktorantura — tartibni o‘qlar bilan o‘zgartiring.", path: "/admin/programs", section: "programs", icon: <GraduationCap size={18} />, dated: false, cover: "cover", badge: (x) => ({ bachelor: "Bakalavriat", master: "Magistratura", joint: "1+1", phd: "Tayanch doktorantura", course: "Kurs" } as Record<string, string>)[(x.degree as string) || ""] || "" },
  faculty: { title: "Kafedralar", one: "kafedra", sub: "Kafedralar va ularning tavsifi. Yo‘nalishlar va xodimlar kafedraga biriktiriladi.", path: "/admin/faculties", section: "faculties", icon: <Landmark size={18} />, dated: false, cover: "cover" },
  department: { title: "Tuzilma: bo‘limlar va markazlar", one: "bo‘lim", sub: "O‘quv bo‘limi, qabul bo‘limi, markazlar, kafedralar.", path: "/admin/structure", section: "structure", icon: <Building2 size={18} />, dated: false, cover: "", badge: (x) => ({ department: "Kafedra", center: "Markaz", office: "Bo‘lim", council: "Kengash" } as Record<string, string>)[(x.category as string) || ""] || "" },
  vacancy: { title: "Vakansiyalar (Careers)", one: "vakansiya", sub: "Bo‘sh ish o‘rinlari: talablar, vazifalar, imtiyozlar, muddat. Arizalar rezyume bilan «Murojaatlar»ga (Kadrlar bo‘limi) tushadi.", path: "/admin/careers", section: "careers", icon: <Briefcase size={18} />, dated: false, cover: "cover", badge: (x) => ({ full_time: "To‘liq stavka", part_time: "Yarim stavka", contract: "Shartnoma", internship: "Stajirovka", remote: "Masofaviy" } as Record<string, string>)[(x.employment as string) || ""] || "" },
  event: { title: "Tadbirlar", one: "tadbir", sub: "Sana, vaqt va joy bilan. Bosh sahifada yaqin tadbirlar ko‘rinadi.", path: "/admin/events", section: "events", icon: <CalendarDays size={18} />, dated: true, cover: "cover", badge: (x) => (x.starts ? fmtDateTime(x.starts as string) : "") },
};

/* ------------------------------------------------------------------ muharrirli turlar ro'yxati */
export function DocList({ kind }: { kind: Kind }) {
  const cfg = RICH_KINDS[kind];
  const nav = useNavigate();
  const run = useRun();
  const confirm = useConfirm();
  const [items, setItems] = useState<Item[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const load = useCallback(() => admin.items(kind).then((r) => setItems(r.items)).catch(() => setItems([])), [kind]);
  useEffect(() => {
    setItems(null);
    setFilter("all");
    load();
  }, [load]);
  const shown = useMemo(
    () =>
      (items || [])
        .filter((x) => filter === "all" || x.status === filter || (filter === "featured" && x.featured))
        .filter((x) => !q || x.title.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (cfg.dated ? (b.published_at || b.updated || "").localeCompare(a.published_at || a.updated || "") : a.sort - b.sort)),
    [items, filter, q, cfg.dated],
  );
  const counts = (s: string) => (items || []).filter((x) => x.status === s).length;
  const move = async (i: number, dir: -1 | 1) => {
    const arr = [...shown];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setItems(arr.map((x, k) => ({ ...x, sort: k })));
    await run(() => admin.reorder(kind, arr.map((x) => x.id)));
  };
  return (
    <div className="a-page">
      <PageHead
        title={cfg.title}
        sub={cfg.sub}
        actions={
          <Btn kind="accent" icon={<Plus size={16} />} onClick={() => nav(`${cfg.path}/new`)}>
            Yangi {cfg.one}
          </Btn>
        }
      />
      <div className="list-tools">
        <div className="a-seg">
          {[
            ["all", `Barchasi ${items?.length ?? ""}`],
            ["published", `Nashr ${counts("published")}`],
            ["draft", `Qoralama ${counts("draft")}`],
            ...(cfg.dated ? [["scheduled", `Rejada ${counts("scheduled")}`]] : []),
            ["featured", "★ Tanlangan"],
          ].map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        <label className="a-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish…" />
        </label>
      </div>
      {!items ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <Card>
          <Empty icon={cfg.icon} title={items.length ? "Hech narsa topilmadi" : `Hali ${cfg.one} yo‘q`}>
            {!items.length && (
              <Btn kind="accent" icon={<Plus size={15} />} onClick={() => nav(`${cfg.path}/new`)}>
                Birinchisini yaratish
              </Btn>
            )}
          </Empty>
        </Card>
      ) : (
        <div className="doc-list">
          {shown.map((x, i) => {
            const img = (cfg.cover ? x[cfg.cover] : "") as string;
            const [label, tone] = STATUS[x.status] || [x.status, "muted"];
            const badge = cfg.badge?.(x);
            return (
              <div key={x.id} className="doc-row" onClick={() => nav(`${cfg.path}/${x.id}`)}>
                <div className="doc-thumb">{img ? <img src={img} alt="" /> : <span>{x.title.slice(0, 1)}</span>}</div>
                <div className="doc-main">
                  <b>
                    {x.featured && <Star size={13} className="star" />}
                    {x.title}
                  </b>
                  <small>
                    <Pill tone={tone}>{label}</Pill>
                    {badge && <Pill tone="info">{badge}</Pill>}
                    {cfg.dated ? (x.status === "draft" ? `yangilandi ${fmtDateTime(x.updated)}` : fmtDateTime(x.published_at)) : ""}
                    <LangBadges langs={x.langs as Lang[] | undefined} />
                    {((x.tags as string[]) || []).slice(0, 3).map((t) => (
                      <span key={t} className="doc-tag">
                        #{t}
                      </span>
                    ))}
                    {kind === "news" && x.newsletter_sent ? (
                      <span title="Obunachilarga yuborilgan">
                        <Mail size={12} />
                      </span>
                    ) : null}
                  </small>
                </div>
                <div className="doc-stats">
                  <span title="Ko‘rishlar">
                    <Eye size={14} /> {fmtNum(x.views || 0)}
                  </span>
                  {(kind === "news" || kind === "announce" || kind === "page") && (
                    <span title="O‘qishlar">
                      <BookOpen size={14} /> {fmtNum(x.reads || 0)}
                    </span>
                  )}
                </div>
                <div className="doc-actions" onClick={(e) => e.stopPropagation()}>
                  {!cfg.dated && (
                    <>
                      <button className="a-icon" onClick={() => move(i, -1)} title="Yuqoriga" disabled={i === 0}>
                        <ArrowUp size={15} />
                      </button>
                      <button className="a-icon" onClick={() => move(i, 1)} title="Pastga" disabled={i === shown.length - 1}>
                        <ArrowDown size={15} />
                      </button>
                    </>
                  )}
                  {x.status !== "draft" && x.slug && (
                    <a className="a-icon" href={`/${kind === "page" ? (x.section === "about" ? "about" : "pages") : cfg.section}/${x.slug}`} target="_blank" rel="noreferrer" title="Saytda ochish">
                      <ExternalLink size={15} />
                    </a>
                  )}
                  <button
                    className="a-icon"
                    title="Nusxa olish"
                    onClick={async () => {
                      const r = await run(() => admin.duplicate(kind, x.id), "Nusxa yaratildi");
                      if (r) load();
                    }}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    className="a-icon danger"
                    title="O‘chirish"
                    onClick={async () => {
                      if (!(await confirm(`«${x.title}» o‘chirilsinmi?`))) return;
                      await run(() => admin.remove(kind, x.id), "O‘chirildi");
                      load();
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
    </div>
  );
}

/* ------------------------------------------------------------------ oddiy ro'yxat + forma (xodimlar, hamkorlar, hujjatlar) */
type FormField = { key: string; label: string; type: "text" | "textarea" | "number" | "select" | "tags" | "toggle" | "url" | "pdf" | "image" | "links" | "date"; options?: { value: string; label: string }[]; wide?: boolean; hint?: string; placeholder?: string };

function RecordList<T extends Item>({ kind, title, sub, icon, fields, empty, defaults, row, i18nFields = [], thumb, publicUrl }: { kind: Kind; title: string; sub: string; icon: ReactNode; fields: FormField[]; empty: string; defaults: Record<string, unknown>; row: (x: T) => ReactNode; i18nFields?: string[]; thumb?: (x: T) => string; publicUrl?: string }) {
  const run = useRun();
  const confirm = useConfirm();
  const [items, setItems] = useState<T[] | null>(null);
  const [edit, setEditRaw] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const baseLang = useBaseLang();
  const [editLang, setEditLang] = useState<Lang | null>(null);
  const setEdit = (v: Record<string, unknown> | null) => {
    setEditLang(null);
    setEditRaw(v);
  };
  const tr: Lang | null = baseLang && editLang && editLang !== baseLang ? editLang : null;
  const trOf = (e: Record<string, unknown> | null, l: Lang) => ((e?.i18n as Record<string, Record<string, unknown>> | undefined)?.[l] || {}) as Record<string, unknown>;
  const load = useCallback(() => admin.items<T>(kind).then((r) => setItems(r.items)).catch(() => setItems([])), [kind]);
  useEffect(() => {
    load();
  }, [load]);
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const r = await run(() => (edit.id ? admin.update(kind, edit.id as string, edit) : admin.create(kind, edit)), "Saqlandi");
    setBusy(false);
    if (r) {
      setEdit(null);
      load();
    }
  };
  const move = async (i: number, dir: -1 | 1) => {
    if (!items) return;
    const arr = [...items];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setItems(arr);
    await run(() => admin.reorder(kind, arr.map((x) => x.id)));
  };
  const setF = (k: string, v: unknown) =>
    setEditRaw((e) => {
      if (!tr) return { ...(e || {}), [k]: v };
      const i18n = { ...((e?.i18n as Record<string, Record<string, unknown>>) || {}) };
      i18n[tr] = { ...(i18n[tr] || {}), [k]: v };
      return { ...(e || {}), i18n };
    });
  const shown = (items || []).filter((x) => !q || x.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="a-page">
      <PageHead
        title={title}
        sub={sub}
        actions={
          <>
            {publicUrl && (
              <a className="a-btn default md" href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> Saytda
              </a>
            )}
            <Btn kind="accent" icon={<Plus size={16} />} onClick={() => setEdit({ ...defaults })}>
              Qo‘shish
            </Btn>
          </>
        }
      />
      <div className="list-tools">
        <span className="muted">{items?.length ?? ""} ta yozuv</span>
        <label className="a-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish…" />
        </label>
      </div>
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
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
                <LangBadges langs={x.langs as Lang[] | undefined} />
              </div>
              <div className="doc-actions" onClick={(e) => e.stopPropagation()}>
                <button className="a-icon" onClick={() => move(i, -1)} title="Yuqoriga" disabled={i === 0}>
                  <ArrowUp size={15} />
                </button>
                <button className="a-icon" onClick={() => move(i, 1)} title="Pastga" disabled={i === items.length - 1}>
                  <ArrowDown size={15} />
                </button>
                {x.slug && x.status === "published" && kind === "staff" && (
                  <a className="a-icon" href={`/staff/${x.slug}`} target="_blank" rel="noreferrer" title="Saytda ochish">
                    <ExternalLink size={15} />
                  </a>
                )}
                <button className="a-icon" onClick={() => setEdit({ ...x })} title="Tahrirlash">
                  <Pencil size={15} />
                </button>
                <button
                  className="a-icon danger"
                  title="O‘chirish"
                  onClick={async () => {
                    if (!(await confirm(`«${x.title}» o‘chirilsinmi?`))) return;
                    await run(() => admin.remove(kind, x.id), "O‘chirildi");
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
        width={800}
        footer={
          <>
            <Btn onClick={() => setEdit(null)}>Bekor qilish</Btn>
            <Btn kind="primary" busy={busy} onClick={save}>
              Saqlash
            </Btn>
          </>
        }
      >
        {edit && baseLang && i18nFields.length > 0 && (
          <div className="modal-lang">
            <LangTabs value={editLang || baseLang} base={baseLang} onChange={setEditLang} filled={(l) => !!(l === baseLang ? edit.title : trOf(edit, l).title)} />
            {tr && <p className="a-hint">Faqat matnli maydonlar tarjima qilinadi; bo‘sh qolganlari saytda asosiy tilda chiqadi.</p>}
          </div>
        )}
        {edit && (
          <div className="a-form-grid">
            {fields.filter((f) => !tr || i18nFields.includes(f.key)).map((f) => {
              const v = tr ? trOf(edit, tr)[f.key] : edit[f.key];
              const ph = tr ? String(edit[f.key] ?? "") || f.placeholder : f.placeholder;
              const input =
                f.type === "textarea" ? (
                  <Textarea rows={4} value={(v as string) || ""} placeholder={ph} onChange={(e) => setF(f.key, e.target.value)} />
                ) : f.type === "select" ? (
                  <Select value={(v as string) || f.options![0].value} onChange={(x) => setF(f.key, x)} options={f.options!} />
                ) : f.type === "tags" ? (
                  <TagInput value={(v as string[]) || []} onChange={(x) => setF(f.key, x)} />
                ) : f.type === "toggle" ? (
                  <Toggle checked={!!v} onChange={(x) => setF(f.key, x)} label={f.hint || ""} />
                ) : f.type === "pdf" ? (
                  <ImageField value={(v as string) || ""} onChange={(x) => setF(f.key, x)} accept="pdf" />
                ) : f.type === "image" ? (
                  <ImageField value={(v as string) || ""} onChange={(x) => setF(f.key, x)} aspect="1 / 1" />
                ) : f.type === "date" ? (
                  <Input type="date" value={String(v || "").slice(0, 10)} onChange={(e) => setF(f.key, e.target.value || null)} />
                ) : f.type === "links" ? (
                  <LinksInput value={(v as { label: string; url: string }[]) || []} onChange={(x) => setF(f.key, x)} />
                ) : (
                  <Input type={f.type === "number" ? "number" : "text"} value={(v as string | number | undefined) ?? ""} placeholder={ph} onChange={(e) => setF(f.key, f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)} />
                );
              return (
                <Field key={f.key} label={f.label} hint={f.type === "toggle" ? undefined : f.hint} wide={f.wide}>
                  {input}
                </Field>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function LinksInput({ value, onChange }: { value: { label: string; url: string }[]; onChange: (v: { label: string; url: string }[]) => void }) {
  return (
    <div>
      {value.map((it, i) => (
        <div key={i} className="pair-row">
          <Input value={it.label} placeholder="Nomi (ORCID, Scholar…)" onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <Input value={it.url} placeholder="https://" onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          <button className="a-icon" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="O‘chirish">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <Btn size="sm" icon={<Plus size={14} />} onClick={() => onChange([...value, { label: "", url: "" }])}>
        Havola qo‘shish
      </Btn>
    </div>
  );
}

const VIS = [
  { value: "published", label: "Saytda ko‘rinadi" },
  { value: "draft", label: "Yashirin (qoralama)" },
];


export function PartnersPage() {
  return (
    <RecordList<Partner>
      kind="partner"
      title="Hamkorlar"
      sub="Hamkor universitetlar va tashkilotlar. Logotip yuklang — bosh sahifada logotiplar qatori chiqadi."
      icon={<Handshake size={28} />}
      empty="Hali hamkor qo‘shilmagan"
      defaults={{ category: "university", status: "published", country: "" }}
      i18nFields={["title", "country", "summary"]}
      thumb={(x) => x.logo}
      fields={[
        { key: "title", label: "Nomi", type: "text", wide: true },
        { key: "category", label: "Turi", type: "select", options: [{ value: "university", label: "Universitet" }, { value: "company", label: "Kompaniya" }, { value: "organization", label: "Tashkilot" }, { value: "government", label: "Davlat organi" }] },
        { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
        { key: "country", label: "Mamlakat", type: "text" },
        { key: "since", label: "Hamkorlik yili", type: "text", placeholder: "2022" },
        { key: "url", label: "Veb-sayt", type: "url", placeholder: "https://", wide: true },
        { key: "logo", label: "Logotip", type: "image", wide: true },
        { key: "summary", label: "Hamkorlik mazmuni", type: "textarea", wide: true },
        { key: "featured", label: "Bosh sahifa", type: "toggle", hint: "Bosh sahifadagi logotiplar qatorida" },
      ]}
      row={(x) => (
        <>
          <b>
            {x.featured && <Star size={13} className="star" />}
            {x.title}
          </b>
          <small>
            {x.country}
            {x.since ? ` · ${x.since}` : ""}
            {x.url ? ` · ${x.url}` : ""}
            {x.status === "draft" && <Pill>yashirin</Pill>}
          </small>
        </>
      )}
    />
  );
}

export function LinksPage() {
  return (
    <RecordList<UsefulLink>
      kind="link"
      title="Foydali havolalar"
      sub="Davlat portallari, vazirlik, ta’lim va xalqaro hamkorlikka oid rasmiy saytlar. Logotip yuklang — bosh sahifadagi «Foydali havolalar» blokida chiqadi."
      icon={<Landmark size={28} />}
      empty="Hali havola qo‘shilmagan"
      defaults={{ category: "gov", status: "published" }}
      i18nFields={["title", "summary"]}
      thumb={(x) => x.logo}
      fields={[
        { key: "title", label: "Nomi", type: "text", wide: true },
        { key: "url", label: "Manzil", type: "url", placeholder: "https://", wide: true },
        { key: "category", label: "Turi", type: "select", options: [{ value: "gov", label: "Davlat organi" }, { value: "edu", label: "Ta’lim" }, { value: "service", label: "Davlat xizmatlari" }, { value: "intl", label: "Xalqaro hamkorlik" }, { value: "other", label: "Boshqa" }] },
        { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
        { key: "logo", label: "Logotip", type: "image", wide: true },
        { key: "summary", label: "Qisqa izoh", type: "text", wide: true },
      ]}
      row={(x) => (
        <>
          <b>{x.title}</b>
          <small>
            {x.url}
            {x.status === "draft" && <Pill>yashirin</Pill>}
          </small>
        </>
      )}
    />
  );
}

const DOC_CATS = [
  { value: "charter", label: "Ustav" },
  { value: "internal", label: "Ichki tartib qoidalari" },
  { value: "ethics", label: "Odob-axloq kodeksi" },
  { value: "regulation", label: "Nizom / qoidalar" },
  { value: "order", label: "Qaror / buyruq" },
  { value: "license", label: "Litsenziya" },
  { value: "report", label: "Hisobot" },
  { value: "plan", label: "Dastur / reja" },
  { value: "curriculum", label: "O‘quv reja" },
  { value: "other", label: "Boshqa" },
];

export function DocumentsPage() {
  return (
    <RecordList<Document>
      kind="document"
      publicUrl="/documents"
      title="Hujjatlar"
      sub="Me’yoriy hujjatlar (/documents): ustav, ichki tartib qoidalari, odob-axloq kodeksi, nizomlar, buyruqlar, hisobotlar — saytda turlar bo‘yicha guruhlanadi. PDF yuklang (saytda ko‘rish va yuklab olish) yoki tashqi havola bering."
      icon={<Layers size={28} />}
      empty="Hali hujjat qo‘shilmagan"
      defaults={{ category: "regulation", status: "published", year: new Date().getFullYear() }}
      i18nFields={["title", "summary"]}
      fields={[
        { key: "title", label: "Nomi", type: "text", wide: true },
        { key: "category", label: "Turi", type: "select", options: DOC_CATS },
        { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
        { key: "year", label: "Yil", type: "number" },
        { key: "number", label: "Raqami", type: "text", placeholder: "714" },
        { key: "date", label: "Qabul qilingan sana", type: "date" },
        { key: "file", label: "Fayl (PDF, DOCX…)", type: "pdf", wide: true },
        { key: "url", label: "Yoki tashqi havola", type: "url", placeholder: "https://lex.uz/…", wide: true },
        { key: "summary", label: "Qisqacha", type: "textarea", wide: true },
      ]}
      row={(x) => (
        <>
          <b>{x.title}</b>
          <small>
            <Pill tone="info">{DOC_CATS.find((t) => t.value === x.category)?.label}</Pill>
            {x.year}
            {x.number ? ` · № ${x.number}` : ""}
            {!x.file && !x.url && <Pill tone="warn">fayl yo‘q</Pill>}
            {x.status === "draft" && <Pill>yashirin</Pill>}
          </small>
        </>
      )}
    />
  );
}
