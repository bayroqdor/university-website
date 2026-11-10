// Muharrirli yozuvlar (yangilik, e'lon, sahifa, yo'nalish, kafedra, bo'lim, tadbir): Ghost uslubidagi tahrirlagich + sozlamalar paneli
import { FeesField } from "./Tuition";
import type { JSONContent } from "@tiptap/core";
import { ArrowLeft, Copy, ExternalLink, Eye, ImagePlus, Languages, Mail, PanelRight, Plus, Send, Trash2, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Item, Lang } from "../../lib/api";
import { RichEditor } from "../../editor/RichEditor";
import { admin, errMsg, type FacultyPerson, type Kind, type Smtp, type TelegramItemPost } from "../api";
import { Btn, Field, ImageField, Input, LANG_LABEL, LangTabs, MediaLibrary, Modal, Select, Spinner, Textarea, Toggle, TagInput, useBaseLang, useConfirm, useToast, fmtDateTime } from "../ui";
import { RICH_KINDS } from "./Content";

const RichHtml = lazy(() => import("../../rich/RichHtml"));

type Doc = Partial<Item> & { [k: string]: unknown };

function slugify(s: string) {
  const cyr: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h" };
  return s.toLowerCase().split("").map((c) => cyr[c] ?? c).join("").replace(/[’‘ʻʼ'`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

function toLocalInput(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600e3);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function AutoTextarea({ value, onChange, className, placeholder, maxLength }: { value: string; onChange: (v: string) => void; className: string; placeholder: string; maxLength?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} className={className} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))} />;
}

// qisqacha mazmun maydoni nomi
const EXCERPT_KEY: Record<string, string> = { news: "excerpt", announce: "excerpt", page: "excerpt", program: "summary", faculty: "summary", department: "summary", event: "summary", vacancy: "summary" };
// har bir turda tarjima qilinadigan qo'shimcha maydonlar (panelda TR belgisi bilan)
const DEFAULTS: Record<string, Doc> = {
  news: { tags: [], featured: false, send_newsletter: true, show_toc: false },
  announce: { tags: [], category: "general", featured: false, send_newsletter: true },
  page: { section: "about", show_toc: true },
  program: { degree: "bachelor", languages: ["O‘zbek", "Rus"], form: ["Kunduzgi"], careers: [], subjects: [], duration: "4 yil", featured: false },
  faculty: {},
  department: { category: "office" },
  event: { category: "event", featured: false, send_newsletter: true },
  vacancy: { employment: "full_time", category: "academic", location: "Farg‘ona", requirements: [], duties: [], benefits: [], featured: false },
};

/** Sahifa uchun mas'ul xodim(lar): saytda rasm, F.I.Sh., lavozim, qabul vaqti va aloqa kartasi bo'lib chiqadi */
function ContactPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [staff, setStaff] = useState<{ id: string; title: string; position?: string; photo?: string }[]>([]);
  useEffect(() => {
    admin
      .items("staff")
      .then((r) => setStaff(r.items.map((x) => ({ id: x.id, title: x.title, position: x.position as string, photo: x.photo as string }))))
      .catch(() => null);
  }, []);
  const byId = new Map(staff.map((x) => [x.id, x]));
  return (
    <Field label="Mas’ul xodim" hint="sahifa boshida rasm, F.I.Sh., lavozim, qabul vaqti, telefon va email kartasi chiqadi (xodim profilidan olinadi)">
      <div className="pc-pick">
        {value.map((id) => {
          const x = byId.get(id);
          return (
            <div key={id} className="pc-pick-i">
              {x?.photo ? <img src={x.photo} alt="" /> : <span className="pc-pick-ph">{(x?.title || "?").slice(0, 1)}</span>}
              <span>
                <b>{x?.title || id}</b>
                {x?.position && <small>{x.position}</small>}
              </span>
              <button type="button" className="a-icon danger" title="Olib tashlash" onClick={() => onChange(value.filter((y) => y !== id))}>
                <X size={14} />
              </button>
            </div>
          );
        })}
        {value.length < 8 && (
          <Select
            value=""
            onChange={(v) => v && onChange([...value, v])}
            options={[{ value: "", label: "+ Xodim tanlash…" }, ...staff.filter((x) => !value.includes(x.id)).map((x) => ({ value: x.id, label: x.position ? `${x.title} — ${x.position}` : x.title }))]}
          />
        )}
      </div>
    </Field>
  );
}

function useRefOptions(kind: Kind) {
  const [facs, setFacs] = useState<{ value: string; label: string }[]>([{ value: "", label: "—" }]);
  useEffect(() => {
    if (kind === "program" || kind === "vacancy") admin.items("faculty").then((r) => setFacs([{ value: "", label: "—" }, ...r.items.map((x) => ({ value: x.id, label: x.title }))])).catch(() => null);
  }, [kind]);
  return facs;
}

export function DocEditor({ kind }: { kind: Kind }) {
  const cfg = RICH_KINDS[kind];
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const base = cfg.path;
  const dated = cfg.dated;
  const [doc, setDoc] = useState<Doc | null>(null);
  // JSON (muharrir) yoki HTML (tashqaridan qo'shilgan, hali muharrirda saqlanmagan matn)
  const [content, setContent] = useState<JSONContent | string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [panel, setPanel] = useState(true);
  const [publishOpen, setPublishOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [coverPick, setCoverPick] = useState(false);
  const [smtp, setSmtp] = useState<Smtp | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const facs = useRefOptions(kind);
  const docRef = useRef<Doc | null>(null);
  docRef.current = doc;
  const htmlRef = useRef<{ html: string; text: string }>({ html: "", text: "" });
  const [editorKey, setEditorKey] = useState(0);
  const baseLang = useBaseLang();
  const [editLang, setEditLang] = useState<Lang | null>(null);
  const tr: Lang | null = baseLang && editLang && editLang !== baseLang ? editLang : null;
  const trData = ((tr && (doc?.i18n?.[tr] as Record<string, unknown> | undefined)) || {}) as Record<string, unknown>;
  const getF = (k: string): unknown => (tr ? trData[k] : doc?.[k]);
  const setF = (patch: Record<string, unknown>) => {
    if (!tr) return set(patch as Doc);
    setDoc((d) => {
      const i18n = { ...(d?.i18n || {}) };
      i18n[tr] = { ...(i18n[tr] || {}), ...patch };
      return { ...(d || {}), i18n };
    });
    setDirty(true);
  };
  const excerptKey = EXCERPT_KEY[kind] || "excerpt";
  const switchLang = (l: Lang) => {
    if (!doc || !baseLang) return;
    setEditLang(l);
    const src = (l === baseLang ? doc : (doc.i18n?.[l] as Record<string, unknown> | undefined)) || {};
    setContent((src.content as JSONContent) || (src.html as string) || null);
    setEditorKey((k) => k + 1);
  };
  const copyFromBase = () => {
    if (!tr || !doc) return;
    setF({ title: doc.title, [excerptKey]: doc[excerptKey], content: doc.content, html: htmlRef.current.html, text: htmlRef.current.text });
    setContent((doc.content as JSONContent) || (doc.html as string) || null);
    setEditorKey((k) => k + 1);
  };
  const dropTranslation = async () => {
    if (!tr || !(await confirm(`${LANG_LABEL[tr]} tarjimasi o‘chirilsinmi? Saqlagandan keyin saytda bu tilda asl matn ko‘rsatiladi.`))) return;
    setDoc((d) => {
      const i18n = { ...(d?.i18n || {}) };
      delete i18n[tr];
      return { ...(d || {}), i18n };
    });
    setDirty(true);
    setContent(null);
    setEditorKey((k) => k + 1);
  };

  useEffect(() => {
    if (kind === "news" || kind === "announce" || kind === "event") admin.smtp().then(setSmtp).catch(() => null);
    if (cfg.tags) admin.items(kind).then((r) => setAllTags([...new Set(r.items.flatMap((x) => (x.tags as string[]) || []))])).catch(() => null);
    if (id && docRef.current?.id === id) return;
    setEditLang(null);
    if (!id || id === "new") {
      const d: Doc = { title: "", status: "draft", [excerptKey]: "", ...DEFAULTS[kind] };
      setDoc(d);
      setContent(null);
      setEditorKey((k) => k + 1);
      return;
    }
    admin
      .item<Doc>(kind, id)
      .then((d) => {
        setDoc(d);
        setContent((d.content as JSONContent) || (d.html as string) || null);
        setEditorKey((k) => k + 1);
        htmlRef.current = { html: (d.html as string) || "", text: (d.text as string) || "" };
      })
      .catch(() => {
        toast("Topilmadi", "error");
        nav(base);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, kind]);

  const set = (patch: Doc) => {
    setDoc((d) => ({ ...(d || {}), ...patch }));
    setDirty(true);
  };

  const save = useCallback(
    async (patch: Doc = {}, silent = false) => {
      const d = { ...(docRef.current || {}), ...patch };
      if (!d.title?.trim()) {
        if (!silent) toast("Avval asosiy tilda sarlavha yozing", "error");
        return null;
      }
      setSaving(true);
      try {
        const body = { ...d, content: d.content, html: htmlRef.current.html, text: htmlRef.current.text };
        delete body.views;
        delete body.reads;
        const r = d.id ? await admin.update<Doc>(kind, d.id as string, body) : await admin.create<Doc>(kind, body);
        setDoc((cur) => ({ ...(cur || {}), ...r, content: cur?.content, i18n: cur?.i18n }));
        setDirty(false);
        setSavedAt(new Date().toISOString());
        if (!d.id) nav(`${base}/${r.id}`, { replace: true });
        if (!silent) toast("Saqlandi");
        return r;
      } catch (e) {
        toast(errMsg(e), "error");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [kind, base, nav, toast],
  );

  useEffect(() => {
    if (!dirty || !doc || doc.status !== "draft" || !doc.title?.trim()) return;
    const h = setTimeout(() => save({}, true), 2500);
    return () => clearTimeout(h);
  }, [dirty, doc, save]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    const bu = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", k);
    window.addEventListener("beforeunload", bu);
    return () => {
      window.removeEventListener("keydown", k);
      window.removeEventListener("beforeunload", bu);
    };
  }, [dirty, save]);

  const publicSection = kind === "page" ? (doc?.section === "about" ? "about" : "pages") : cfg.section;
  const publicUrl = doc?.slug ? `/${publicSection}/${doc.slug}` : "";
  const viewUrl = publicUrl + (tr ? `?lang=${tr}` : "");
  const status = doc?.status || "draft";
  const statusText = useMemo(() => {
    if (saving) return "Saqlanmoqda…";
    if (status === "published") return dirty ? "Nashr qilingan · o‘zgarishlar saqlanmagan" : "Nashr qilingan";
    if (status === "scheduled") return `Rejalashtirilgan: ${fmtDateTime(doc?.published_at as string)}`;
    return dirty ? "Qoralama · saqlanmagan" : savedAt ? `Qoralama · saqlandi ${fmtDateTime(savedAt).slice(11)}` : "Qoralama";
  }, [saving, status, dirty, savedAt, doc?.published_at]);

  if (!doc) return <Spinner />;
  const coverKey = cfg.cover || "cover";
  const cover = doc[coverKey] as string | undefined;
  const setCover = (u: string) => set({ [coverKey]: u });
  const del = async () => {
    if (!doc.id) return nav(base);
    if (!(await confirm(`«${doc.title}» o‘chirilsinmi? Bu amalni qaytarib bo‘lmaydi.`))) return;
    await admin.remove(kind, doc.id as string);
    toast("O‘chirildi");
    nav(base);
  };
  const Tr = ({ children }: { children: React.ReactNode }) => (
    <>
      {children}
      {tr && <span className="tr-tag">{tr.toUpperCase()}</span>}
    </>
  );
  const TextF = ({ k, label, wide, placeholder }: { k: string; label: string; wide?: boolean; placeholder?: string }) => (
    <Field label={<Tr>{label}</Tr>} wide={wide}>
      <Input value={(getF(k) as string) || ""} placeholder={tr ? (doc[k] as string) || placeholder : placeholder} onChange={(e) => setF({ [k]: e.target.value })} />
    </Field>
  );
  const TagsF = ({ k, label }: { k: string; label: string }) => (
    <Field label={<Tr>{label}</Tr>}>
      <TagInput value={(getF(k) as string[]) || []} onChange={(v) => setF({ [k]: v })} />
    </Field>
  );

  return (
    <div className={`doc-editor ${panel ? "with-panel" : ""}`}>
      <header className="doc-bar">
        <div className="doc-bar-l">
          <button className="a-icon" onClick={() => nav(base)} title="Ro‘yxatga qaytish">
            <ArrowLeft size={18} />
          </button>
          <span className={`doc-status ${status}`}>
            <i />
            {statusText}
          </span>
          {baseLang && <LangTabs value={editLang || baseLang} base={baseLang} onChange={switchLang} filled={(l) => !!(l === baseLang ? doc.title : (doc.i18n?.[l] as Record<string, unknown> | undefined)?.title)} />}
        </div>
        <div className="doc-bar-r">
          <Btn kind="ghost" icon={<Eye size={16} />} onClick={() => setPreview(true)}>
            Ko‘rish
          </Btn>
          {status === "published" && publicUrl && (
            <a className="a-btn ghost md" href={viewUrl} target="_blank" rel="noreferrer" title="Saytda ochish">
              <ExternalLink size={16} />
            </a>
          )}
          {status !== "draft" ? (
            <Btn kind="primary" busy={saving} disabled={!dirty} onClick={() => save()}>
              Yangilash
            </Btn>
          ) : (
            <Btn kind="ghost" busy={saving} disabled={!dirty} onClick={() => save()}>
              Saqlash
            </Btn>
          )}
          {status === "draft" && (
            <Btn kind="accent" icon={<Send size={15} />} onClick={() => (dated ? setPublishOpen(true) : save({ status: "published", published_at: new Date().toISOString() }))}>
              Nashr qilish
            </Btn>
          )}
          <button className={`a-icon ${panel ? "on" : ""}`} onClick={() => setPanel(!panel)} title="Sozlamalar paneli">
            <PanelRight size={18} />
          </button>
        </div>
      </header>

      <div className="doc-body">
        <div className="doc-canvas">
          {cfg.cover ? (
            cover ? (
              <div className="doc-cover">
                <img src={cover} alt="" />
                <div className="doc-cover-tools">
                  <Btn size="sm" onClick={() => setCoverPick(true)}>
                    Almashtirish
                  </Btn>
                  <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} onClick={() => setCover("")} title="Olib tashlash" />
                </div>
              </div>
            ) : (
              <button className="doc-add-cover" onClick={() => setCoverPick(true)}>
                <ImagePlus size={16} /> Muqova rasmi qo‘shish
              </button>
            )
          ) : null}
          {tr && !trData.title && (
            <div className="tr-hint">
              <Languages size={16} />
              <span>
                <b>{LANG_LABEL[tr]}</b> tarjimasi hali yo‘q. Asl matnni ko‘chirib, so‘ng tarjima qilishingiz mumkin. Tarjima bo‘lmasa, saytda bu tilda asl matn ko‘rsatiladi.
              </span>
              <Btn size="sm" onClick={copyFromBase}>
                Asl matndan nusxa olish
              </Btn>
            </div>
          )}
          <AutoTextarea className="doc-title" value={(getF("title") as string) || ""} onChange={(v) => setF({ title: v })} placeholder={tr ? (doc.title as string) || "Sarlavha tarjimasi" : `${cfg.one[0].toUpperCase()}${cfg.one.slice(1)} sarlavhasi`} maxLength={300} />
          <AutoTextarea className="doc-excerpt" value={(getF(excerptKey) as string) || ""} onChange={(v) => setF({ [excerptKey]: v })} placeholder={tr ? (doc[excerptKey] as string) || "Qisqacha mazmun tarjimasi" : "Qisqacha mazmun (ro‘yxatlarda, email va ijtimoiy tarmoqlarda ko‘rinadi)"} maxLength={1200} />
          {content !== undefined && (
            <RichEditor
              key={editorKey}
              value={content}
              placeholder={tr ? `${LANG_LABEL[tr]} tilidagi matn… («/» — bloklar)` : undefined}
              onChange={(o) => {
                if (tr) {
                  setF({ content: o.json, html: o.html, text: o.text });
                  return;
                }
                htmlRef.current = { html: o.html, text: o.text };
                set({ content: o.json });
              }}
            />
          )}
        </div>

        {panel && (
          <aside className="doc-panel">
            <div className="doc-panel-head">
              <b>
                Sozlamalar
                {tr && <span className="tr-tag">{tr.toUpperCase()}</span>}
              </b>
              <button className="a-icon" onClick={() => setPanel(false)} aria-label="Yopish">
                <X size={16} />
              </button>
            </div>
            {tr && <p className="a-hint tr-note">Belgilangan maydonlar ({tr.toUpperCase()}) shu tilga tegishli; havola, teglar, sana va rasmlar barcha tillar uchun umumiy.</p>}
            <Field label="Havola (URL)" hint={publicUrl ? <span className="mono">{publicUrl}</span> : "asosiy tildagi sarlavhadan avtomatik; barcha tillarda bir xil"}>
              <Input value={(doc.slug as string) || ""} placeholder={slugify((doc.title as string) || "")} onChange={(e) => set({ slug: slugify(e.target.value) })} />
            </Field>
            {dated && status !== "draft" && (
              <Field label="Nashr sanasi">
                <Input type="datetime-local" required value={toLocalInput(doc.published_at as string)} onChange={(e) => e.target.value && set({ published_at: new Date(e.target.value).toISOString() })} />
              </Field>
            )}
            {cfg.tags && (
              <Field label="Teglar">
                <TagInput value={(doc.tags as string[]) || []} onChange={(v) => set({ tags: v })} suggestions={allTags} />
              </Field>
            )}

            {kind === "news" && (
              <>
                {cover && (
                  <>
                    <TextF k="feature_alt" label="Muqova alt matni" />
                    <TextF k="feature_caption" label="Muqova izohi" />
                  </>
                )}
                <Toggle checked={!!doc.featured} onChange={(v) => set({ featured: v })} label="Tanlangan yangilik" hint="ro‘yxat boshida katta ko‘rinadi" />
                <Toggle checked={!!doc.show_toc} onChange={(v) => set({ show_toc: v })} label="Mundarija" hint="3 va undan ko‘p sarlavha bo‘lsa har doim chiqadi" />
              </>
            )}
            {(kind === "news" || kind === "announce" || kind === "event") && (
              <>
                <div className="doc-sep" />
                <div className="a-label">Obunachilarga xat</div>
                {doc.newsletter_sent ? (
                  <p className="a-hint">
                    <Mail size={13} /> Obunachilarga yuborilgan: {fmtDateTime(doc.newsletter_sent as string)}
                  </p>
                ) : (
                  <Toggle checked={!!doc.send_newsletter} onChange={(v) => set({ send_newsletter: v })} label="Nashr qilinganda obunachilarga yuborish" hint={smtp?.configured ? "institut ranglaridagi xat: muqova, sarlavha, qisqacha mazmun, «Batafsil» tugmasi va obunani bekor qilish havolasi" : "Pochta serveri yoki SMTP sozlanmagan"} />
                )}
                <TestEmail id={doc.id as string | undefined} disabled={!smtp?.configured} />
              </>
            )}
            {(kind === "news" || kind === "announce" || kind === "event" || kind === "vacancy") && doc.id && status === "published" ? <TgSend id={doc.id as string} /> : null}
            {kind === "announce" && (
              <>
                <Field label="Kategoriya">
                  <Select value={(doc.category as string) || "general"} onChange={(v) => set({ category: v })} options={[{ value: "general", label: "Umumiy" }, { value: "admission", label: "Qabul" }, { value: "exam", label: "Imtihon" }, { value: "event", label: "Tadbir" }, { value: "vacancy", label: "Vakansiya" }, { value: "students", label: "Talabalar uchun" }]} />
                </Field>
                <Field label="Muddat (deadline)" hint="ixtiyoriy — e’londa ko‘rsatiladi">
                  <Input type="datetime-local" value={doc.deadline ? toLocalInput(doc.deadline as string) : ""} onChange={(e) => set({ deadline: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </Field>
                <Toggle checked={!!doc.featured} onChange={(v) => set({ featured: v })} label="Muhim e’lon" />
              </>
            )}
            {kind === "page" && (
              <>
                <Field label="Bo‘lim" hint="menyuda qayerda chiqadi">
                  <Select value={(doc.section as string) || "about"} onChange={(v) => set({ section: v })} options={[{ value: "about", label: "Institut (haqida, tarix, rektor…)" }, { value: "admission", label: "Qabul" }, { value: "students", label: "Talabalar uchun" }, { value: "science", label: "Ilm-fan va tadqiqot" }, { value: "other", label: "Boshqa" }]} />
                </Field>
                <Toggle checked={!!doc.show_toc} onChange={(v) => set({ show_toc: v })} label="Mundarija" />
                <ContactPicker value={(doc.contact_ids as string[]) || []} onChange={(v) => set({ contact_ids: v })} />
                <Field label="Sahifa ostidagi yangiliklar" hint="shu tegdagi so‘nggi 6 ta yangilik sahifa ostida chiqadi (masalan: Eko faol talabalar). Bo‘sh — chiqmaydi">
                  <Input value={(doc.news_tag as string) || ""} onChange={(e) => set({ news_tag: e.target.value })} placeholder="Yangilik tegi" maxLength={60} />
                </Field>
              </>
            )}
            {kind === "program" && (
              <>
                <Field label="Kafedra">
                  <Select value={(doc.faculty_id as string) || ""} onChange={(v) => set({ faculty_id: v })} options={facs} />
                </Field>
                <div className="a-grid2">
                  <Field label="Daraja">
                    <Select value={(doc.degree as string) || "bachelor"} onChange={(v) => set({ degree: v })} options={[{ value: "bachelor", label: "Bakalavriat" }, { value: "master", label: "Magistratura" }, { value: "joint", label: "Qo‘shma dastur (1+1)" }, { value: "phd", label: "Tayanch doktorantura" }, { value: "course", label: "Kurs" }]} />
                  </Field>
                  <Field label="Kod">
                    <Input value={(doc.code as string) || ""} onChange={(e) => set({ code: e.target.value })} placeholder="60710500" />
                  </Field>
                </div>
                <TextF k="duration" label="Davomiyligi" placeholder="4 yil" />
                <Field label="O‘qitish tillari">
                  <TagInput value={(doc.languages as string[]) || []} onChange={(v) => set({ languages: v })} />
                </Field>
                <Field label="Ta’lim shakli">
                  <TagInput value={(doc.form as string[]) || []} onChange={(v) => set({ form: v })} />
                </Field>
                <div className="a-grid2">
                  <Field label="Kreditlar">
                    <Input type="number" value={(doc.credits as number) ?? ""} onChange={(e) => set({ credits: e.target.value === "" ? null : Number(e.target.value) })} />
                  </Field>
                  <Field label="Kvota">
                    <Input type="number" value={(doc.quota as number) ?? ""} onChange={(e) => set({ quota: e.target.value === "" ? null : Number(e.target.value) })} />
                  </Field>
                </div>
                <FeesField value={doc.fees as Parameters<typeof FeesField>[0]["value"]} onChange={(v) => set({ fees: v })} />
                <TextF k="partner" label="Hamkor universitet (qo‘shma dastur)" />
                <TagsF k="subjects" label="Asosiy fanlar" />
                <TagsF k="careers" label="Bitiruvchilar qayerda ishlaydi" />
                <Toggle checked={!!doc.featured} onChange={(v) => set({ featured: v })} label="Bosh sahifada ko‘rsatish" />
                <Field label="Urg‘u rangi (rasm bo‘lmaganda naqsh uchun)">
                  <div className="a-color">
                    <input type="color" value={(doc.accent as string) || "#1e4fa3"} onChange={(e) => set({ accent: e.target.value })} />
                    <Input value={(doc.accent as string) || ""} placeholder="sayt rangi" onChange={(e) => set({ accent: e.target.value })} />
                  </div>
                </Field>
              </>
            )}
            {kind === "faculty" && (
              <>
                <TextF k="dean" label="Kafedra mudiri" />
                <Field label="Email">
                  <Input value={(doc.email as string) || ""} onChange={(e) => set({ email: e.target.value })} />
                </Field>
                <Field label="Telefon">
                  <Input value={(doc.phone as string) || ""} onChange={(e) => set({ phone: e.target.value })} />
                </Field>
                <Field label="Urg‘u rangi">
                  <div className="a-color">
                    <input type="color" value={(doc.accent as string) || "#1e4fa3"} onChange={(e) => set({ accent: e.target.value })} />
                    <Input value={(doc.accent as string) || ""} onChange={(e) => set({ accent: e.target.value })} />
                  </div>
                </Field>
                {id && id !== "new" && <FacultyPeople fid={id} onEditors={(ids) => setDoc((d) => (d ? { ...d, editor_ids: ids } : d))} />}
              </>
            )}
            {kind === "department" && (
              <>
                <Field label="Turi">
                  <Select value={(doc.category as string) || "office"} onChange={(v) => set({ category: v })} options={[{ value: "office", label: "Bo‘lim" }, { value: "department", label: "Kafedra" }, { value: "center", label: "Markaz" }, { value: "council", label: "Kengash" }]} />
                </Field>
                <TextF k="head" label="Rahbar" />
                <Field label="Email">
                  <Input value={(doc.email as string) || ""} onChange={(e) => set({ email: e.target.value })} />
                </Field>
                <div className="a-grid2">
                  <Field label="Telefon">
                    <Input value={(doc.phone as string) || ""} onChange={(e) => set({ phone: e.target.value })} />
                  </Field>
                  <Field label="Xona">
                    <Input value={(doc.room as string) || ""} onChange={(e) => set({ room: e.target.value })} />
                  </Field>
                </div>
              </>
            )}
            {kind === "event" && (
              <>
                <Field label="Turi">
                  <Select value={(doc.category as string) || "event"} onChange={(v) => set({ category: v })} options={[{ value: "event", label: "Tadbir" }, { value: "conference", label: "Konferensiya" }, { value: "openday", label: "Ochiq eshiklar kuni" }, { value: "exam", label: "Imtihon" }, { value: "holiday", label: "Bayram" }, { value: "meeting", label: "Uchrashuv" }]} />
                </Field>
                <Field label="Boshlanishi">
                  <Input type="datetime-local" value={doc.starts ? toLocalInput(doc.starts as string) : ""} onChange={(e) => set({ starts: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </Field>
                <Field label="Tugashi">
                  <Input type="datetime-local" value={doc.ends ? toLocalInput(doc.ends as string) : ""} onChange={(e) => set({ ends: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </Field>
                <TextF k="place" label="Joy" />
                <Field label="Ro‘yxatdan o‘tish havolasi">
                  <Input value={(doc.url as string) || ""} placeholder="https://" onChange={(e) => set({ url: e.target.value })} />
                </Field>
                <Toggle checked={!!doc.featured} onChange={(v) => set({ featured: v })} label="Bosh sahifada ko‘rsatish" />
              </>
            )}

            {kind === "vacancy" && (
              <>
                <div className="a-grid2">
                  <Field label="Bandlik turi">
                    <Select value={(doc.employment as string) || "full_time"} onChange={(v) => set({ employment: v })} options={[{ value: "full_time", label: "To‘liq stavka" }, { value: "part_time", label: "Yarim stavka" }, { value: "contract", label: "Shartnoma" }, { value: "internship", label: "Stajirovka" }, { value: "remote", label: "Masofaviy" }]} />
                  </Field>
                  <Field label="Yo‘nalish">
                    <Select value={(doc.category as string) || "academic"} onChange={(v) => set({ category: v })} options={[{ value: "academic", label: "Professor-o‘qituvchi" }, { value: "administrative", label: "Ma’muriy" }, { value: "research", label: "Ilmiy" }, { value: "technical", label: "Texnik" }, { value: "other", label: "Boshqa" }]} />
                  </Field>
                </div>
                <Field label="Kafedra (ixtiyoriy)">
                  <Select value={(doc.faculty_id as string) || ""} onChange={(v) => set({ faculty_id: v })} options={facs} />
                </Field>
                <TextF k="department" label="Bo‘lim / kafedra" />
                <TextF k="location" label="Joylashuv" placeholder="Farg‘ona" />
                <TextF k="salary" label="Ish haqi" placeholder="Suhbat asosida" />
                <Field label="Ariza muddati" hint="o‘tgach saytda «Qabul yopilgan» deb ko‘rinadi">
                  <Input type="datetime-local" value={doc.deadline ? toLocalInput(doc.deadline as string) : ""} onChange={(e) => set({ deadline: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </Field>
                <TagsF k="duties" label="Vazifalar" />
                <TagsF k="requirements" label="Talablar" />
                <TagsF k="benefits" label="Biz taklif qilamiz" />
                <Field label="Aloqa emaili (ixtiyoriy)" hint="arizalar baribir «Murojaatlar» → «Kadrlar bo‘limi»ga tushadi">
                  <Input value={(doc.contact_email as string) || ""} placeholder="hr@example.edu" onChange={(e) => set({ contact_email: e.target.value })} />
                </Field>
                <Toggle checked={!!doc.featured} onChange={(v) => set({ featured: v })} label="Ajratilgan vakansiya" hint="ro‘yxat boshida yulduzcha bilan" />
              </>
            )}
            {(kind === "news" || kind === "announce" || kind === "page" || kind === "program" || kind === "vacancy") && (
              <>
                <div className="doc-sep" />
                <div className="a-label">SEO va ijtimoiy tarmoqlar</div>
                <Field label={<Tr>Meta sarlavha</Tr>} hint={`${((getF("meta_title") as string) || (getF("title") as string) || "").length}/60`}>
                  <Input value={(getF("meta_title") as string) || ""} placeholder={(getF("title") as string) || (doc.title as string)} onChange={(e) => setF({ meta_title: e.target.value })} />
                </Field>
                <Field label={<Tr>Meta tavsif</Tr>} hint={`${((getF("meta_description") as string) || (getF(excerptKey) as string) || "").length}/160`}>
                  <Textarea rows={3} value={(getF("meta_description") as string) || ""} placeholder={(getF(excerptKey) as string) || (doc[excerptKey] as string)} onChange={(e) => setF({ meta_description: e.target.value })} />
                </Field>
                <div className="serp">
                  <small>
                    {window.location.host}
                    {publicUrl ? ` › ${publicSection} › ${doc.slug}${tr ? `?lang=${tr}` : ""}` : ""}
                  </small>
                  <b>{(getF("meta_title") as string) || (getF("title") as string) || (doc.title as string) || "Sarlavha"}</b>
                  <p>{((getF("meta_description") as string) || (getF(excerptKey) as string) || (doc[excerptKey] as string) || "Tavsif…").slice(0, 160)}</p>
                </div>
                <ImageField label="Ijtimoiy tarmoq rasmi (OG)" value={(doc.og_image as string) || ""} onChange={(v) => set({ og_image: v })} aspect="1.91 / 1" />
              </>
            )}
            <div className="doc-sep" />
            {tr && Object.keys(trData).length > 0 && (
              <Btn kind="ghost" icon={<Languages size={15} />} onClick={dropTranslation}>
                {LANG_LABEL[tr]} tarjimasini o‘chirish
              </Btn>
            )}
            {status !== "draft" && (
              <Btn
                kind="ghost"
                onClick={async () => {
                  if (await confirm("Nashrdan olinsinmi? Sahifa saytda ko‘rinmay qoladi.", false)) save({ status: "draft" });
                }}
              >
                Nashrdan olish
              </Btn>
            )}
            {doc.id && (
              <Btn
                kind="ghost"
                icon={<Copy size={15} />}
                onClick={async () => {
                  const r = await admin.duplicate<Doc>(kind, doc.id as string).catch(() => null);
                  if (r) {
                    toast("Nusxa yaratildi");
                    nav(`${base}/${r.id}`);
                  }
                }}
              >
                Nusxa olish
              </Btn>
            )}
            <Btn kind="danger" icon={<Trash2 size={15} />} onClick={del}>
              O‘chirish
            </Btn>
          </aside>
        )}
      </div>

      <MediaLibrary open={coverPick} onClose={() => setCoverPick(false)} onPick={(m) => setCover(m.url)} />
      <PublishModal
        open={publishOpen}
        isNews={kind === "news" || kind === "announce" || kind === "event"}
        smtpOk={!!smtp?.configured}
        onClose={() => setPublishOpen(false)}
        onPublish={async (when, newsletter) => {
          const now = !when;
          const r = await save({ status: now ? "published" : "scheduled", published_at: now ? new Date().toISOString() : when, send_newsletter: kind === "news" || kind === "announce" || kind === "event" ? newsletter : false });
          setPublishOpen(false);
          if (!r) return;
          if (now && kind === "news" && newsletter) {
            try {
              const s = await admin.sendPost(r.id as string);
              toast(`Nashr qilindi va ${s.recipients} obunachiga yuborilmoqda`);
            } catch (e) {
              toast(errMsg(e), "error");
            }
          } else toast(now ? "Nashr qilindi 🎉" : "Rejalashtirildi");
        }}
      />
      <Modal open={preview} onClose={() => setPreview(false)} title="Ko‘rish" width={980}>
        <div className="doc-preview">
          <h1 className="post-h1">{((getF("title") as string) || (doc.title as string)) ?? ""}</h1>
          {((getF(excerptKey) as string) || (doc[excerptKey] as string)) && <p className="post-lead">{(getF(excerptKey) as string) || (doc[excerptKey] as string)}</p>}
          {cover && <img className="doc-preview-cover" src={cover} alt="" />}
          <Suspense fallback={<Spinner />}>
            <RichHtml html={tr ? ((trData.html as string) || htmlRef.current.html) : htmlRef.current.html} doc={tr ? (trData.content as JSONContent) || undefined : typeof content === "string" ? undefined : content || undefined} />
          </Suspense>
        </div>
      </Modal>
    </div>
  );
}

/** Telegram guruh/kanallariga yuborilganlik holati va qo'lda yuborish (tasdiqlangan chat bo'lsa). */
function TgSend({ id }: { id: string }) {
  const toast = useToast();
  const [st, setSt] = useState<{ posts: TelegramItemPost[]; groups: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    admin.tgItem(id).then(setSt).catch(() => setSt(null));
  }, [id]);
  if (!st || (!st.groups && !st.posts.length)) return null;
  return (
    <>
      <div className="doc-sep" />
      <div className="a-label">Telegram</div>
      {st.posts.map((p) => (
        <p key={p.chat_id} className="a-hint" style={p.status === "error" ? { color: "var(--a-bad)" } : undefined}>
          <Send size={13} /> {p.title}: {p.status === "sent" ? fmtDateTime(p.at) : p.status === "error" ? p.error : "yuborilmoqda"}
          {p.status === "sent" && p.edited && !p.edit_error ? ` · tahrirlangan ${fmtDateTime(p.edited)}` : ""}
          {p.edit_error ? <span style={{ color: "var(--a-bad)" }}> · tahrirlanmadi: {p.edit_error}</span> : null}
        </p>
      ))}
      {st.groups > 0 && (
        <Btn
          size="sm"
          icon={<Send size={14} />}
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await admin.tgItemSend(id);
              setSt({ ...st, posts: r.posts });
              toast(r.failed ? `Yuborildi: ${r.sent}, xato: ${r.failed}` : `Yuborildi: ${r.sent}`, r.failed ? "error" : undefined);
            } catch (e) {
              toast(errMsg(e), "error");
            }
            setBusy(false);
          }}
        >
          Telegramga yuborish
        </Btn>
      )}
    </>
  );
}

function TestEmail({ id, disabled }: { id?: string; disabled: boolean }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div className="pair-row">
      <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Test xat uchun email" disabled={disabled || !id} />
      <Btn
        size="sm"
        busy={busy}
        disabled={disabled || !id || !to}
        onClick={async () => {
          setBusy(true);
          try {
            await admin.sendPost(id!, to);
            toast("Test xat yuborildi");
          } catch (e) {
            toast(errMsg(e), "error");
          }
          setBusy(false);
        }}
      >
        Test
      </Btn>
    </div>
  );
}

function PublishModal({ open, isNews, smtpOk, onClose, onPublish }: { open: boolean; isNews: boolean; smtpOk: boolean; onClose: () => void; onPublish: (when: string | null, newsletter: boolean) => void }) {
  const [mode, setMode] = useState<"now" | "later">("now");
  const [when, setWhen] = useState(toLocalInput(null));
  const [nl, setNl] = useState(false);
  useEffect(() => {
    if (open) {
      setMode("now");
      setWhen(toLocalInput(null));
      setNl(smtpOk && isNews);
    }
  }, [open, smtpOk, isNews]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nashr qilish"
      width={520}
      footer={
        <>
          <Btn onClick={onClose}>Bekor qilish</Btn>
          <Btn kind="accent" icon={<Send size={15} />} onClick={() => onPublish(mode === "now" ? null : new Date(when).toISOString(), nl)}>
            {mode === "now" ? "Hozir nashr qilish" : "Rejalashtirish"}
          </Btn>
        </>
      }
    >
      <div className="publish-opts">
        <label className={mode === "now" ? "on" : ""}>
          <input type="radio" checked={mode === "now"} onChange={() => setMode("now")} />
          <span>
            <b>Hozir</b>
            <small>Darhol saytda paydo bo‘ladi</small>
          </span>
        </label>
        <label className={mode === "later" ? "on" : ""}>
          <input type="radio" checked={mode === "later"} onChange={() => setMode("later")} />
          <span>
            <b>Rejalashtirish</b>
            <small>Belgilangan vaqtda avtomatik nashr</small>
          </span>
        </label>
      </div>
      {mode === "later" && (
        <Field label="Sana va vaqt">
          <Input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      )}
      {isNews && <Toggle checked={nl && smtpOk} onChange={setNl} label="Obunachilarga email yuborish" hint={smtpOk ? "chiroyli xat: muqova, sarlavha, qisqacha mazmun va «O‘qish» tugmasi" : "SMTP sozlanmagan — Pochta bo‘limida ulang"} />}
    </Modal>
  );
}

export { Plus };


/** Kafedra o'qituvchilari (foydalanuvchilardan) va kabinetdan kafedra sahifasini tahrirlash huquqi */
function FacultyPeople({ fid, onEditors }: { fid: string; onEditors: (ids: string[]) => void }) {
  const toast = useToast();
  const [items, setItems] = useState<FacultyPerson[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    admin
      .facultyPeople(fid)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [fid]);
  if (!items) return null;
  const upd = (id: string, p: Partial<FacultyPerson>) => {
    setItems(items.map((x) => (x.id === id ? { ...x, ...p, ...(p.member === false ? { editor: false } : {}), ...(p.editor ? { member: true } : {}) } : x)));
    setDirty(true);
  };
  const shown = items.filter((x) => x.member || (q && x.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="fac-people">
      <div className="fac-people-h">
        <b>O‘qituvchilar</b>
        <small>{items.filter((x) => x.member).length} ta · ✎ — kafedra sahifasini kabinetdan tahrirlay oladi</small>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="O‘qituvchi qo‘shish: ism…" />
      <div className="fac-people-list">
        {shown.map((x) => (
          <div key={x.id} className={`fp-row ${x.member ? "on" : ""}`}>
            <label className="fp-name">
              <input type="checkbox" checked={x.member} onChange={(e) => upd(x.id, { member: e.target.checked })} />
              <span>
                <b>{x.name}</b>
                <small>{x.position || x.login}</small>
              </span>
            </label>
            <button className={`fp-edit ${x.editor ? "on" : ""}`} title={x.editor ? "Tahrirlash huquqi bor" : "Tahrirlash huquqini berish"} onClick={() => upd(x.id, { editor: !x.editor })}>
              ✎
            </button>
          </div>
        ))}
        {!shown.length && <small className="muted">Hali o‘qituvchi biriktirilmagan — yuqoriga ism yozing.</small>}
      </div>
      {dirty && (
        <Btn
          size="sm"
          kind="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await admin.saveFacultyPeople(
                fid,
                items.filter((x) => x.member).map((x) => x.id),
                items.filter((x) => x.editor).map((x) => x.id),
              );
              setItems(r.items);
              onEditors(r.items.filter((x) => x.editor).map((x) => x.id));
              setDirty(false);
              toast("O‘qituvchilar saqlandi");
            } catch (e) {
              toast(errMsg(e), "error");
            }
            setBusy(false);
          }}
        >
          O‘qituvchilarni saqlash
        </Btn>
      )}
    </div>
  );
}
