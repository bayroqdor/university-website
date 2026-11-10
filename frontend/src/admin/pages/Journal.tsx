// Ilmiy jurnal boshqaruvi («journal» ruxsati): sozlamalar, tahrir hay'ati, sonlar, maqolalar (muharrir: mualliflar, annotatsiya,
// PDF tekshiruvi, «Google Scholar tekshiruvi» va iqtibos ko'rinishi), saytdan yuborilgan qo'lyozmalar.
// Backend: university/api/journal.py. Ochiq sayt: /journal.
import { AlertTriangle, ArrowDown, ArrowUp, BookOpenText, CheckCircle2, Circle, Download, Eye, ExternalLink, FilePlus2, FileText, GripVertical, Info, Plus, Save, Search, Send, Trash2, Upload, Wand2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, req, type Lang } from "../../lib/api";
import { Btn, Card, Empty, Field, ImageField, Input, LangTabs, Modal, PageHead, Pill, Select, Spinner, TagInput, Textarea, Toggle, fmtDateTime, useConfirm, useToast } from "../ui";
import "../../styles/journal-admin.css";

type L = Partial<Record<Lang, string>>;
type Person = { id?: string; name: string; role: string; position: L; affiliation: string; degree: string; country: string; orcid: string; photo: string; staff_id: string; email: string };
type Settings = {
  /** null — hali hal qilinmagan: nomi birinchi saqlanganda saytda avtomatik yoqiladi */
  enabled: boolean | null;
  submissions_open: boolean;
  title: L;
  abbr: string;
  issn_print: string;
  issn_online: string;
  publisher: L;
  founded: number | null;
  frequency: L;
  doi_prefix: string;
  license: string;
  cover: string;
  email: string;
  submission_email: string;
  phone: string;
  address: L;
  texts: Record<string, L>;
  indexing: { title: string; url: string; logo: string }[];
  sections: { id: string; title: L }[];
  board: Person[];
};
type Issue = { id: string; volume: number; number: number; year: number; status: string; published_on: string; title: L; cover: string; pdf: string; pdf_size: number; key: string; articles?: { total: number; published: number } };
type Action = { kind: "settings" | "enable" | "new_issue" | "publish_issue" | "new_article" | "edit_article" | "drafts"; label: string; id?: string; disabled?: boolean };
type Step = { code: string; ok: boolean; text: string; action: Action | null };
type Diag = { visible: boolean; ready: boolean; steps: Step[]; warnings: { text: string; action: Action; info?: boolean }[]; prompt: boolean; counts: { issues: number; articles: number; published: number; drafts: number } };
type Overview = { settings: Settings; issues: Issue[]; unassigned: number; licenses: string[]; base_url: string; base_lang: Lang; enabled: boolean; status: Diag };
type Reason = { code: string; text: string; fix: string; fix_label: string };
type Visibility = { public: boolean; reasons: Reason[]; issue_status: string };
type Author = { given: string; family: string; given_en?: string; family_en?: string; affiliations: string[]; country: string; email: string; orcid: string; corresponding: boolean; _k?: string };
type PdfCheck = { pages: number; has_text: boolean; encrypted: boolean; info_title: string; first_text: string };
type Hints = { title?: string; abstract?: string; keywords?: string[]; doi?: string; udc?: string };
type Art = {
  id?: string;
  num?: number;
  slug?: string;
  url?: string;
  pdf_url?: string;
  issue_id: string | null;
  section_id: string;
  lang: string;
  title: string;
  title_i18n: Record<string, string>;
  authors: Author[];
  abstract: Record<string, string>;
  keywords: Record<string, string[]>;
  first_page: string;
  last_page: string;
  doi: string;
  udc: string;
  received: string;
  revised: string;
  accepted: string;
  published_on: string;
  pdf: string;
  pdf_name: string;
  pdf_size: number;
  pdf_check?: PdfCheck;
  references: string[];
  funding: string;
  license: string;
  status: string;
  sort: number;
  views?: number;
  downloads?: number;
  problems?: string[];
  visibility?: Visibility;
};
type ArtRow = Pick<Art, "id" | "num" | "slug" | "issue_id" | "status" | "title" | "authors" | "first_page" | "last_page" | "section_id" | "lang" | "doi" | "published_on" | "views" | "downloads" | "pdf"> & { url: string; problems: string[]; updated: string };
type Submission = { id: string; number: number; title: string; stage: string; name: string; email: string; affiliation: string; created: string; files: { name: string; url: string; size: number }[] };

const LANGS: Lang[] = ["uz", "ru", "en"];
const LANG_NAME: Record<string, string> = { uz: "O‘zbekcha", ru: "Русский", en: "English" };
const ROLES: Record<string, string> = { editor_in_chief: "Bosh muharrir", deputy: "Bosh muharrir o‘rinbosari", secretary: "Mas’ul kotib", member: "Tahrir hay’ati a’zosi", international: "Xalqaro tahrir kengashi" };
const TEXTS: Record<string, string> = { about: "Jurnal haqida (maqsad va yo‘nalishlar)", guidelines: "Mualliflar uchun talablar", peer_review: "Taqriz siyosati", ethics: "Nashr etikasi", open_access: "Ochiq kirish", contacts: "Aloqa", cfp: "Maqolalar qabuli (bosh sahifada)" };
const STAGE: Record<string, string> = { new: "Yangi", progress: "Jarayonda", waiting: "Kutilmoqda", resolved: "Hal qilindi", closed: "Yopildi" };
const ERR: Record<string, string> = {
  invalid_issn: "ISSN noto‘g‘ri (nazorat raqami mos emas)",
  invalid_orcid: "ORCID noto‘g‘ri",
  invalid_email: "Email noto‘g‘ri",
  invalid_doi: "DOI noto‘g‘ri (10.xxxx/... ko‘rinishida bo‘lsin)",
  invalid_doi_prefix: "DOI prefiksi noto‘g‘ri (10.xxxx)",
  issue_exists: "Bunday jild va raqamli son allaqachon bor",
  issue_locked: "E’lon qilingan sonning jild/raqami o‘zgarmaydi (URL o‘zgarmasligi uchun). Avval qoralamaga qaytaring.",
  issue_not_empty: "Sonda maqolalar bor — avval ularni boshqa songa o‘tkazing yoki o‘chiring",
  invalid_pages: "Oxirgi bet birinchisidan kichik",
  invalid_issue: "Son topilmadi",
  not_pdf: "Fayl PDF emas",
  too_large: "Fayl juda katta",
};
const MISS: Record<string, string> = { title: "sarlavha", authors: "mualliflar", issue: "son", pdf: "PDF fayl", abstract: "annotatsiya" };

function errText(e: unknown): string {
  if (!(e instanceof ApiError)) return String(e);
  const d = e.detail || "";
  if (d.startsWith("cannot_publish:")) return "E’lon qilish uchun yetishmaydi: " + d.split(":")[1].split(",").map((x) => MISS[x] || x).join(", ");
  const [code, idx] = d.split(":");
  return (ERR[code] || d) + (idx ? ` (${Number(idx) + 1}-muallif)` : "");
}
const issueName = (i: Pick<Issue, "volume" | "number" | "year">) => `${i.volume}-jild, ${i.number}-son (${i.year})`;
const pick = (v: L | undefined, l: Lang) => (v && (v[l] || v.uz || v.en || v.ru)) || "";
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/* ====================================================================== asosiy sahifa (tablar) */
export function JournalAdminPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") || "articles") as "settings" | "board" | "issues" | "articles" | "subs";
  const [d, setD] = useState<Overview | null>(null);
  const load = useCallback(() => req<Overview>("GET", "/api/admin/journal").then(setD).catch(() => null), []);
  const quick = useQuickFix(load);
  const nav = useNavigate();
  useEffect(() => {
    load();
  }, [load]);
  if (!d) return <Spinner />;
  const run = (x: Action) => {
    if (x.kind === "settings") setSp({ tab: "settings" });
    else if (x.kind === "enable") quick.enable();
    else if (x.kind === "new_issue") setSp({ tab: "issues", new: "1" });
    else if (x.kind === "publish_issue" && x.id) quick.publishIssue(d.issues.find((i) => i.id === x.id));
    else if (x.kind === "new_article") nav("/admin/journal/articles/new");
    else if (x.kind === "edit_article" && x.id) nav(`/admin/journal/articles/${x.id}`);
    else if (x.kind === "drafts") setSp({ status: "draft" });
  };
  const tabs: [typeof tab, string][] = [
    ["articles", "Maqolalar"],
    ["issues", `Sonlar (${d.issues.length})`],
    ["board", "Tahrir hay’ati"],
    ["settings", "Sozlamalar"],
    ["subs", "Yuborilganlar"],
  ];
  return (
    <div className="a-page jA">
      <PageHead
        title="Ilmiy jurnal"
        sub={
          <>
            Saytdagi{" "}
            <a href="/journal" target="_blank" rel="noreferrer">
              /journal
            </a>{" "}
            bo‘limi: sonlar, maqolalar, Google Scholar va OAI-PMH
          </>
        }
        actions={
          <>
            <Pill tone={d.enabled ? "ok" : "muted"}>{d.enabled ? "Saytda ko‘rinadi" : "Saytda yashirin"}</Pill>
            <a className="a-btn md ghost" href="/journal" target="_blank" rel="noreferrer">
              {d.enabled ? <ExternalLink size={15} /> : <Eye size={15} />}
              <span>{d.enabled ? "Saytda ochish" : "Ko‘rib chiqish"}</span>
            </a>
          </>
        }
      />
      <StatusPanel st={d.status} run={run} busy={quick.busy} />
      <div className="a-seg jA-tabs" role="tablist" aria-label="Bo‘limlar">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setSp(k === "articles" ? {} : { tab: k })}>
            {l}
          </button>
        ))}
      </div>
      {tab === "settings" && <SettingsTab d={d} onSaved={load} />}
      {tab === "board" && <BoardTab d={d} onSaved={load} />}
      {tab === "issues" && <IssuesTab d={d} reload={load} />}
      {tab === "articles" && <ArticlesTab d={d} />}
      {tab === "subs" && <SubmissionsTab />}
    </div>
  );
}

/* ---------------------------------------------------------------------- saytda ko'rinish holati (sahifa tepasida) */
function useQuickFix(after: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      after();
      return true;
    } catch (e) {
      toast(errText(e), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    enable: (on = true) => go(() => req("PUT", "/api/admin/journal/settings", { enabled: on }), on ? "Jurnal saytda ko‘rsatildi" : "Jurnal saytdan yashirildi"),
    publishIssue: (i?: Pick<Issue, "id" | "volume" | "number" | "year">) =>
      i ? go(() => req("PUT", `/api/admin/journal/issues/${i.id}`, { status: "published" }), `${issueName(i)} nashr qilindi`) : Promise.resolve(false),
  };
}

function StatusPanel({ st, run, busy }: { st: Diag; run: (a: Action) => void; busy: boolean }) {
  const btn = (a: Action, primary = false) => (
    <Btn size="sm" kind={primary ? "primary" : "default"} busy={busy && (a.kind === "enable" || a.kind === "publish_issue")} disabled={a.disabled} onClick={() => run(a)}>
      {a.label}
    </Btn>
  );
  if (st.ready && !st.warnings.length)
    return (
      <section className="jA-status ok one" aria-label="Saytda ko‘rinish holati">
        <CheckCircle2 size={18} />
        <p>
          <b>Jurnal saytda ko‘rinadi</b> — {st.counts.issues} ta son, {st.counts.articles} ta maqola.
        </p>
      </section>
    );
  const enable = st.steps.find((x) => x.code === "enabled");
  return (
    <section className={`jA-status ${st.ready ? "ok" : "todo"} ${st.prompt ? "prompt" : ""}`} aria-label="Saytda ko‘rinish holati">
      {st.prompt && enable?.action ? (
        <div className="jA-prompt">
          <p>
            <b>Jurnal tayyor, lekin saytda yoqilmagan.</b> {st.counts.published} ta maqola e’lon qilingan — jurnalni saytda ko‘rsating.
          </p>
          {btn(enable.action, true)}
        </div>
      ) : (
        <p className="jA-status-h">
          {st.ready ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <b>{st.ready ? "Jurnal saytda ko‘rinadi" : st.visible ? "Jurnal saytda ochiq, lekin maqolalar hali ko‘rinmaydi" : "Jurnal saytda hali ko‘rinmaydi"}</b>
          {st.ready && (
            <span>
              — {st.counts.issues} ta son, {st.counts.articles} ta maqola
            </span>
          )}
        </p>
      )}
      {!st.ready && (
        <ol className="jA-steps">
          {st.steps.map((x) => (
            <li key={x.code} className={x.ok ? "ok" : "bad"}>
              {x.ok ? <CheckCircle2 size={16} /> : <Circle size={16} />}
              <span>{x.text}</span>
              {x.action && !(st.prompt && x.code === "enabled") && btn(x.action, true)}
            </li>
          ))}
        </ol>
      )}
      {st.warnings.length > 0 && (
        <ul className="jA-steps warn">
          {st.warnings.map((w) => (
            <li key={w.text} className={w.info ? "info" : "warn"}>
              {w.info ? <Info size={16} /> : <AlertTriangle size={16} />}
              <span>{w.text}</span>
              {btn(w.action, !w.info)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function useSaveSettings(onSaved: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const save = async (patch: Partial<Settings>) => {
    setBusy(true);
    try {
      await req("PUT", "/api/admin/journal/settings", patch);
      toast("Saqlandi");
      onSaved();
      return true;
    } catch (e) {
      toast(errText(e), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { save, busy };
}

/* ---------------------------------------------------------------------- sozlamalar */
function SettingsTab({ d, onSaved }: { d: Overview; onSaved: () => void }) {
  const [s, setS] = useState<Settings>(d.settings);
  const [lang, setLang] = useState<Lang>(d.base_lang);
  const [textKey, setTextKey] = useState("about");
  const { save, busy } = useSaveSettings(onSaved);
  const quick = useQuickFix(onSaved);
  const base = d.base_lang;
  const savedTitle = !!pick(d.settings.title, base);
  const shown = d.settings.enabled !== false; // null — nomi saqlangach avtomatik yoqiladi
  const saveMain = () => {
    const { enabled: _skip, ...rest } = s; // ko'rinish o'chirgichi darhol saqlanadi (yuqorida), forma uni qayta yozmaydi
    void _skip;
    return save(rest);
  };
  const setL = (k: "title" | "publisher" | "frequency" | "address", v: string) => setS({ ...s, [k]: { ...s[k], [lang]: v } });
  const filled = (l: Lang) => !!(s.title[l] || s.publisher[l] || Object.values(s.texts).some((x) => x[l]));
  const ready = !!pick(s.title, base);
  return (
    <div className="jA-stack">
      <Card
        title="Asosiy ma’lumotlar"
        actions={
          <Btn kind="primary" icon={<Save size={15} />} busy={busy} onClick={saveMain}>
            Saqlash
          </Btn>
        }
      >
        <div className="jA-toggles">
          <Toggle
            checked={shown}
            onChange={(v) => !quick.busy && quick.enable(v)}
            label="Jurnal saytda ko‘rinadi"
            hint={!savedTitle ? (ready ? "Nomi saqlangach saytda ko‘rinadi" : "Avval jurnal nomini yozing va saqlang") : shown ? "O‘zgarish darhol saqlanadi" : "Yashirin: jurnalni faqat siz «Ko‘rib chiqish» orqali ko‘rasiz"}
          />
          <Toggle checked={s.submissions_open} onChange={(v) => setS({ ...s, submissions_open: v })} label="Qo‘lyozmalar qabul qilinadi" />
        </div>
        <div style={{ margin: "14px 0" }}>
          <LangTabs value={lang} onChange={setLang} base={base} filled={filled} />
        </div>
        <div className="a-form-grid">
          <Field label={`Jurnal nomi (${lang.toUpperCase()})`} wide>
            <Input value={s.title[lang] || ""} onChange={(e) => setL("title", e.target.value)} />
          </Field>
          <Field label={`Nashriyot / muassis (${lang.toUpperCase()})`}>
            <Input value={s.publisher[lang] || ""} onChange={(e) => setL("publisher", e.target.value)} />
          </Field>
          <Field label={`Davriyligi (${lang.toUpperCase()})`} hint="masalan: yiliga 4 marta">
            <Input value={s.frequency[lang] || ""} onChange={(e) => setL("frequency", e.target.value)} />
          </Field>
          <Field label={`Manzil (${lang.toUpperCase()})`} wide>
            <Input value={s.address[lang] || ""} onChange={(e) => setL("address", e.target.value)} />
          </Field>
          <Field label="Qisqartma (citation_journal_abbrev)">
            <Input value={s.abbr} onChange={(e) => setS({ ...s, abbr: e.target.value })} />
          </Field>
          <Field label="Tashkil etilgan yil">
            <Input type="number" value={s.founded ?? ""} onChange={(e) => setS({ ...s, founded: e.target.value ? Number(e.target.value) : null })} />
          </Field>
          <Field label="ISSN (bosma)" hint="1234-567X — nazorat raqami tekshiriladi">
            <Input value={s.issn_print} onChange={(e) => setS({ ...s, issn_print: e.target.value })} placeholder="____-____" />
          </Field>
          <Field label="eISSN (onlayn)">
            <Input value={s.issn_online} onChange={(e) => setS({ ...s, issn_online: e.target.value })} placeholder="____-____" />
          </Field>
          <Field label="DOI prefiksi (ixtiyoriy)" hint="Crossref bergan: 10.xxxxx">
            <Input value={s.doi_prefix} onChange={(e) => setS({ ...s, doi_prefix: e.target.value })} />
          </Field>
          <Field label="Litsenziya (standart)">
            <Select value={s.license} onChange={(v) => setS({ ...s, license: v })} options={d.licenses.map((x) => ({ value: x, label: x }))} />
          </Field>
          <Field label="Tahririyat emaili">
            <Input type="email" value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} />
          </Field>
          <Field label="Qo‘lyozmalar keladigan email" hint="Har bir yuborilgan qo‘lyozma haqida xabar (pochta sozlangan bo‘lsa)">
            <Input type="email" value={s.submission_email} onChange={(e) => setS({ ...s, submission_email: e.target.value })} />
          </Field>
          <Field label="Telefon">
            <Input value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} />
          </Field>
          <div className="a-field">
            <ImageField label="Jurnal muqovasi" value={s.cover} onChange={(v) => setS({ ...s, cover: v })} aspect="3 / 4" />
          </div>
        </div>
      </Card>

      <Card title="Sahifalar matni" sub="Har biri saytda alohida sahifa. Bo‘sh qator — yangi xatboshi; «- » bilan boshlangan qatorlar — ro‘yxat; «## » — sarlavha; havolalar avtomatik.">
        <div className="jA-row">
          <Select value={textKey} onChange={setTextKey} options={Object.entries(TEXTS).map(([value, label]) => ({ value, label: `${label}${s.texts[value]?.[lang] ? " ✓" : ""}` }))} />
          <LangTabs value={lang} onChange={setLang} base={base} filled={(l) => !!s.texts[textKey]?.[l]} />
        </div>
        <Textarea
          rows={16}
          value={s.texts[textKey]?.[lang] || ""}
          onChange={(e) => setS({ ...s, texts: { ...s.texts, [textKey]: { ...(s.texts[textKey] || {}), [lang]: e.target.value } } })}
          aria-label={`${TEXTS[textKey]} (${lang})`}
        />
        <div className="jA-foot">
          <Btn kind="primary" icon={<Save size={15} />} busy={busy} onClick={() => save({ texts: s.texts })}>
            Saqlash
          </Btn>
        </div>
      </Card>

      <Card
        title="Rubrikalar"
        sub="Maqolalar shu rubrikalarga bo‘linadi (sonda guruhlab ko‘rsatiladi, OAI-PMH to‘plamlari)."
        actions={
          <Btn icon={<Plus size={15} />} onClick={() => setS({ ...s, sections: [...s.sections, { id: "", title: {} }] })}>
            Rubrika
          </Btn>
        }
      >
        {!s.sections.length && <p className="a-hint">Rubrika yo‘q.</p>}
        {s.sections.map((x, i) => (
          <div key={i} className="jA-row">
            <Input value={x.title[lang] || ""} placeholder={`Nomi (${lang.toUpperCase()})`} onChange={(e) => setS({ ...s, sections: s.sections.map((y, j) => (j === i ? { ...y, title: { ...y.title, [lang]: e.target.value } } : y)) })} aria-label={`Rubrika nomi ${i + 1}`} />
            <Btn kind="ghost" icon={<Trash2 size={15} />} title="O‘chirish" onClick={() => setS({ ...s, sections: s.sections.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <div className="jA-foot">
          <Btn kind="primary" icon={<Save size={15} />} busy={busy} onClick={() => save({ sections: s.sections })}>
            Saqlash
          </Btn>
        </div>
      </Card>

      <Card
        title="Indekslash va bazalar"
        actions={
          <Btn icon={<Plus size={15} />} onClick={() => setS({ ...s, indexing: [...s.indexing, { title: "", url: "", logo: "" }] })}>
            Qo‘shish
          </Btn>
        }
      >
        {!s.indexing.length && <p className="a-hint">Ro‘yxat bo‘sh.</p>}
        {s.indexing.map((x, i) => {
          const upd = (p: Partial<typeof x>) => setS({ ...s, indexing: s.indexing.map((y, j) => (j === i ? { ...y, ...p } : y)) });
          return (
            <div key={i} className="jA-index">
              <div className="jA-index-logo">
                <ImageField value={x.logo} onChange={(v) => upd({ logo: v })} aspect="5 / 2" />
              </div>
              <div className="a-form-grid">
                <Field label="Nomi">
                  <Input value={x.title} onChange={(e) => upd({ title: e.target.value })} />
                </Field>
                <Field label="Havola">
                  <Input value={x.url} onChange={(e) => upd({ url: e.target.value })} placeholder="https://" />
                </Field>
              </div>
              <Btn kind="ghost" icon={<Trash2 size={15} />} title="O‘chirish" onClick={() => setS({ ...s, indexing: s.indexing.filter((_, j) => j !== i) })} />
            </div>
          );
        })}
        <div className="jA-foot">
          <Btn kind="primary" icon={<Save size={15} />} busy={busy} onClick={() => save({ indexing: s.indexing })}>
            Saqlash
          </Btn>
        </div>
      </Card>

      <Card title="Indekslash uchun manzillar">
        <dl className="jA-dl">
          <dt>OAI-PMH</dt>
          <dd>
            <a href="/journal/oai?verb=Identify" target="_blank" rel="noreferrer">
              {d.base_url}/journal/oai
            </a>
          </dd>
          <dt>Sitemap</dt>
          <dd>
            <a href="/sitemap.xml" target="_blank" rel="noreferrer">
              {d.base_url}/sitemap.xml
            </a>
          </dd>
        </dl>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------- tahrir hay'ati */
type Staff = { id: string; title: string; photo?: string; degree?: string; position?: string };

function useDragList<T>(list: T[], setList: (l: T[]) => void) {
  const from = useRef<number | null>(null);
  const move = (i: number, j: number) => {
    if (j < 0 || j >= list.length || i === j) return;
    const l = [...list];
    const [x] = l.splice(i, 1);
    l.splice(j, 0, x);
    setList(l);
  };
  const props = (i: number) => ({
    onDragStart: (e: React.DragEvent) => {
      from.current = i;
      e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (from.current !== null) move(from.current, i);
      from.current = null;
    },
  });
  return { move, props };
}

function BoardTab({ d, onSaved }: { d: Overview; onSaved: () => void }) {
  const [board, setBoard] = useState<Person[]>(d.settings.board.map((p) => ({ ...p, position: p.position || {} })));
  const [lang, setLang] = useState<Lang>(d.base_lang);
  const [staff, setStaff] = useState<Staff[]>([]);
  const { save, busy } = useSaveSettings(onSaved);
  const { move, props } = useDragList(board, setBoard);
  useEffect(() => {
    req<{ items: Staff[] }>("GET", "/api/admin/items/staff").then((r) => setStaff(r.items)).catch(() => null);
  }, []);
  const upd = (i: number, p: Partial<Person>) => setBoard(board.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const blank: Person = { name: "", role: "member", position: {}, affiliation: "", degree: "", country: "", orcid: "", photo: "", staff_id: "", email: "" };
  return (
    <Card
      title="Tahrir hay’ati"
      sub="Saytda rollar bo‘yicha guruhlanadi. Tartibni sudrab yoki strelkalar bilan o‘zgartiring. Email saytda ko‘rsatilmaydi."
      actions={
        <>
          <LangTabs value={lang} onChange={setLang} base={d.base_lang} filled={(l) => board.some((p) => p.position[l])} />
          <Btn icon={<Plus size={15} />} onClick={() => setBoard([...board, { ...blank }])}>
            A’zo
          </Btn>
          <Btn kind="primary" icon={<Save size={15} />} busy={busy} onClick={() => save({ board })}>
            Saqlash
          </Btn>
        </>
      }
    >
      {!board.length && <Empty icon={<BookOpenText size={28} />} title="Hali a’zo qo‘shilmagan" />}
      <ol className="jA-rep">
        {board.map((p, i) => (
          <li key={p.id || `n${i}`} className="jA-rep-item" {...props(i)}>
            <div className="jA-rep-bar">
              <span className="jA-grip" draggable aria-hidden onDragStart={props(i).onDragStart}>
                <GripVertical size={16} />
              </span>
              <b>{p.name || `${i + 1}-a’zo`}</b>
              <span className="jA-sp" />
              <Btn size="sm" kind="ghost" icon={<ArrowUp size={14} />} title="Yuqoriga" onClick={() => move(i, i - 1)} />
              <Btn size="sm" kind="ghost" icon={<ArrowDown size={14} />} title="Pastga" onClick={() => move(i, i + 1)} />
              <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} title="O‘chirish" onClick={() => setBoard(board.filter((_, j) => j !== i))} />
            </div>
            <div className="jA-person">
              <div className="jA-photo">
                <ImageField value={p.photo} onChange={(v) => upd(i, { photo: v })} aspect="1 / 1" />
              </div>
              <div className="a-form-grid">
                <Field label="Xodimlar ro‘yxatidan (ixtiyoriy)">
                  <select
                    className="a-input"
                    value={p.staff_id}
                    onChange={(e) => {
                      const st = staff.find((x) => x.id === e.target.value);
                      upd(i, st ? { staff_id: st.id, name: p.name || st.title, photo: p.photo || st.photo || "", degree: p.degree || st.degree || "" } : { staff_id: "" });
                    }}
                  >
                    <option value="">— bog‘lanmagan —</option>
                    {staff.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Rol">
                  <Select value={p.role} onChange={(v) => upd(i, { role: v })} options={Object.entries(ROLES).map(([value, label]) => ({ value, label }))} />
                </Field>
                <Field label="F.I.Sh.">
                  <Input value={p.name} onChange={(e) => upd(i, { name: e.target.value })} />
                </Field>
                <Field label={`Lavozim (${lang.toUpperCase()})`}>
                  <Input value={p.position[lang] || ""} onChange={(e) => upd(i, { position: { ...p.position, [lang]: e.target.value } })} />
                </Field>
                <Field label="Ilmiy daraja, unvon">
                  <Input value={p.degree} onChange={(e) => upd(i, { degree: e.target.value })} />
                </Field>
                <Field label="Muassasa">
                  <Input value={p.affiliation} onChange={(e) => upd(i, { affiliation: e.target.value })} />
                </Field>
                <Field label="Davlat">
                  <Input value={p.country} onChange={(e) => upd(i, { country: e.target.value })} />
                </Field>
                <Field label="ORCID">
                  <Input value={p.orcid} onChange={(e) => upd(i, { orcid: e.target.value })} placeholder="0000-0000-0000-0000" />
                </Field>
                <Field label="Email (saytda ko‘rinmaydi)">
                  <Input type="email" value={p.email} onChange={(e) => upd(i, { email: e.target.value })} />
                </Field>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ---------------------------------------------------------------------- sonlar */
function PdfUpload({ value, name, onDone, label = "PDF yuklash" }: { value: string; name?: string; onDone: (r: { url: string; name: string; size: number; check: PdfCheck & { hints: Hints } }) => void; label?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const up = async (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    setBusy(true);
    try {
      onDone(await req("POST", "/api/admin/journal/pdf", fd));
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="jA-pdf">
      {value ? (
        <a href={value} target="_blank" rel="noreferrer" className="jA-pdf-name">
          <FileText size={16} /> {name || value.split("/").pop()}
        </a>
      ) : (
        <span className="a-hint">Fayl tanlanmagan</span>
      )}
      <Btn icon={<Upload size={15} />} busy={busy} onClick={() => input.current?.click()}>
        {value ? "Almashtirish" : label}
      </Btn>
      <input
        ref={input}
        type="file"
        hidden
        accept="application/pdf,.pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) up(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function IssuesTab({ d, reload }: { d: Overview; reload: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const quick = useQuickFix(reload);
  const [sp, setSp] = useSearchParams();
  const [edit, setEdit] = useState<Partial<Issue> | null>(null);
  const [lang, setLang] = useState<Lang>(d.base_lang);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      await req(edit.id ? "PUT" : "POST", edit.id ? `/api/admin/journal/issues/${edit.id}` : "/api/admin/journal/issues", edit);
      setEdit(null);
      toast("Saqlandi");
      reload();
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const del = async (i: Issue) => {
    if (!(await confirm(`${issueName(i)} o‘chirilsinmi?`))) return;
    try {
      await req("DELETE", `/api/admin/journal/issues/${i.id}`);
      reload();
    } catch (e) {
      toast(errText(e), "error");
    }
  };
  const last = d.issues[0];
  const next = (): Partial<Issue> => ({ volume: last?.volume || 1, number: last ? last.number + 1 : 1, year: new Date().getFullYear(), status: "draft", title: {}, cover: "", pdf: "" });
  useEffect(() => {
    if (sp.get("new") !== "1") return; // holat panelidagi «Son yaratish»
    setEdit(next());
    setSp({ tab: "issues" }, { replace: true });
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Card
        pad={false}
        title="Sonlar"
        actions={
          <Btn kind="primary" icon={<Plus size={15} />} onClick={() => setEdit(next())}>
            Yangi son
          </Btn>
        }
      >
        {!d.issues.length ? (
          <Empty icon={<BookOpenText size={28} />} title="Hali son yo‘q" />
        ) : (
          <div className="a-table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Son</th>
                  <th>Mavzu</th>
                  <th>Nashr sanasi</th>
                  <th>Maqolalar</th>
                  <th>Holat</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.issues.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <button className="jA-link" onClick={() => setEdit(i)}>
                        {issueName(i)}
                      </button>
                    </td>
                    <td>{pick(i.title, d.base_lang) || "—"}</td>
                    <td>{i.published_on || "—"}</td>
                    <td>
                      <Link to={`/admin/journal?issue=${i.id}`}>
                        {i.articles?.published || 0} / {i.articles?.total || 0}
                      </Link>
                    </td>
                    <td>
                      <Pill tone={i.status === "published" ? "ok" : "muted"}>{i.status === "published" ? "E’lon qilingan" : "Qoralama"}</Pill>
                    </td>
                    <td className="jA-acts">
                      {i.status !== "published" && (
                        <Btn size="sm" icon={<Send size={14} />} busy={quick.busy} onClick={() => quick.publishIssue(i)}>
                          Nashr qilish
                        </Btn>
                      )}
                      <a
                        className="a-btn ghost sm"
                        href={`/journal/issue/${i.key}`}
                        target="_blank"
                        rel="noreferrer"
                        title={i.status === "published" && d.enabled ? "Saytda ochish" : "Ko‘rib chiqish (saytda hali ko‘rinmaydi)"}
                        aria-label={i.status === "published" && d.enabled ? "Saytda ochish" : "Ko‘rib chiqish"}
                      >
                        {i.status === "published" && d.enabled ? <ExternalLink size={14} /> : <Eye size={14} />}
                      </a>
                      <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} title="O‘chirish" onClick={() => del(i)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? issueName(edit as Issue) : "Yangi son"}
        width={720}
        footer={
          <>
            <Btn onClick={() => setEdit(null)}>Bekor qilish</Btn>
            <Btn kind="primary" icon={<Save size={15} />} busy={busy} onClick={save}>
              Saqlash
            </Btn>
          </>
        }
      >
        {edit && (
          <div className="a-form-grid">
            <Field label="Jild (volume)">
              <Input type="number" min={1} value={edit.volume ?? ""} onChange={(e) => setEdit({ ...edit, volume: Number(e.target.value) })} />
            </Field>
            <Field label="Raqam (number)">
              <Input type="number" min={1} value={edit.number ?? ""} onChange={(e) => setEdit({ ...edit, number: Number(e.target.value) })} />
            </Field>
            <Field label="Yil">
              <Input type="number" value={edit.year ?? ""} onChange={(e) => setEdit({ ...edit, year: Number(e.target.value) })} />
            </Field>
            <Field label="Nashr sanasi (citation_publication_date)">
              <Input type="date" value={edit.published_on || ""} onChange={(e) => setEdit({ ...edit, published_on: e.target.value })} />
            </Field>
            <Field label="Holat">
              <Select
                value={edit.status || "draft"}
                onChange={(v) => setEdit({ ...edit, status: v })}
                options={[
                  { value: "draft", label: "Qoralama — saytda ko‘rinmaydi" },
                  { value: "published", label: "Nashr qilingan — saytda ko‘rinadi" },
                ]}
              />
            </Field>
            <div className="a-field wide">
              <LangTabs value={lang} onChange={setLang} base={d.base_lang} filled={(l) => !!edit.title?.[l]} />
            </div>
            <Field label={`Mavzu / maxsus son nomi (${lang.toUpperCase()}, ixtiyoriy)`} wide>
              <Input value={edit.title?.[lang] || ""} onChange={(e) => setEdit({ ...edit, title: { ...(edit.title || {}), [lang]: e.target.value } })} />
            </Field>
            <div className="a-field">
              <ImageField label="Muqova" value={edit.cover || ""} onChange={(v) => setEdit({ ...edit, cover: v })} aspect="3 / 4" />
            </div>
            <div className="a-field">
              <span className="a-label">Sonning to‘liq PDF fayli (ixtiyoriy)</span>
              <PdfUpload value={edit.pdf || ""} onDone={(r) => setEdit({ ...edit, pdf: r.url, pdf_size: r.size })} />
              {edit.pdf && (
                <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} onClick={() => setEdit({ ...edit, pdf: "", pdf_size: 0 })}>
                  Olib tashlash
                </Btn>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ---------------------------------------------------------------------- maqolalar ro'yxati */
function ArticlesTab({ d }: { d: Overview }) {
  const [sp, setSp] = useSearchParams();
  const issue = sp.get("issue") || "";
  const spStatus = sp.get("status") || "";
  const [status, setStatus] = useState(spStatus);
  useEffect(() => {
    if (spStatus) setStatus(spStatus); // holat panelidagi «Ko‘rish» (qoralamalar)
  }, [spStatus]);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ArtRow[] | null>(null);
  const nav = useNavigate();
  useEffect(() => {
    const t = window.setTimeout(
      () =>
        req<{ items: ArtRow[] }>("GET", `/api/admin/journal/articles?${new URLSearchParams({ issue, status, q })}`)
          .then((r) => setItems(r.items))
          .catch(() => setItems([])),
      q ? 250 : 0,
    );
    return () => window.clearTimeout(t);
  }, [issue, status, q]);
  const iss = useMemo(() => Object.fromEntries(d.issues.map((i) => [i.id, i])), [d.issues]);
  return (
    <>
      <div className="jA-bar">
        <label className="a-search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sarlavha yoki muallif…" aria-label="Qidirish" />
        </label>
        <div style={{ minWidth: 220 }}>
          <Select
            value={issue}
            onChange={(v) => setSp(v ? { issue: v } : {})}
            options={[{ value: "", label: "Barcha sonlar" }, ...d.issues.map((i) => ({ value: i.id, label: issueName(i) })), ...(d.unassigned ? [{ value: "none", label: "Songa biriktirilmagan" }] : [])]}
          />
        </div>
        <div className="a-seg">
          {[
            ["", "Hammasi"],
            ["published", "E’lon qilingan"],
            ["draft", "Qoralama"],
          ].map(([k, l]) => (
            <button key={k} className={status === k ? "on" : ""} onClick={() => setStatus(k)}>
              {l}
            </button>
          ))}
        </div>
        <span className="jA-sp" />
        <Btn kind="primary" icon={<FilePlus2 size={15} />} onClick={() => nav(`/admin/journal/articles/new${issue && issue !== "none" ? `?issue=${issue}` : ""}`)} disabled={!d.issues.length}>
          Yangi maqola
        </Btn>
      </div>
      {!d.issues.length && <p className="a-hint">Avval «Sonlar» bo‘limida son yarating.</p>}
      {!items ? (
        <Spinner />
      ) : !items.length ? (
        <Empty icon={<FileText size={28} />} title={q || status || issue ? "Hech narsa topilmadi" : "Hali maqola yo‘q"} />
      ) : (
        <Card pad={false}>
          <div className="a-table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  <th className="n">№</th>
                  <th>Sarlavha</th>
                  <th>Mualliflar</th>
                  <th>Son</th>
                  <th>Betlar</th>
                  <th>Holat</th>
                  <th>Ko‘rish / PDF</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td className="n">{a.num}</td>
                    <td className="jA-title">
                      <Link to={`/admin/journal/articles/${a.id}`}>{a.title || "(sarlavhasiz)"}</Link>
                      {a.problems.length > 0 && <small className="jA-warn">Yetishmaydi: {a.problems.map((x) => MISS[x] || x).join(", ")}</small>}
                    </td>
                    <td>{a.authors.map((x) => `${x.family} ${x.given ? x.given[0] + "." : ""}`.trim()).join(", ")}</td>
                    <td className="jA-nowrap">{a.issue_id && iss[a.issue_id] ? issueName(iss[a.issue_id]) : "—"}</td>
                    <td className="jA-nowrap">{[a.first_page, a.last_page].filter(Boolean).join("–") || "—"}</td>
                    <td>
                      {a.status === "published" && a.issue_id && iss[a.issue_id]?.status !== "published" ? (
                        <Pill tone="warn">E’lon qilingan · son qoralama</Pill>
                      ) : (
                        <Pill tone={a.status === "published" ? "ok" : "muted"}>{a.status === "published" ? "E’lon qilingan" : "Qoralama"}</Pill>
                      )}
                    </td>
                    <td className="jA-nowrap">
                      {a.views || 0} / {a.downloads || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------- yuborilganlar */
function SubmissionsTab() {
  const [items, setItems] = useState<Submission[] | null>(null);
  useEffect(() => {
    req<{ items: Submission[] }>("GET", "/api/admin/journal/submissions")
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);
  if (!items) return <Spinner />;
  if (!items.length) return <Empty icon={<Upload size={28} />} title="Hali qo‘lyozma yuborilmagan">Saytdagi /journal/submit formasi orqali kelganlar shu yerda va «Murojaatlar»da (Jurnal tahririyati) ko‘rinadi.</Empty>;
  return (
    <Card pad={false}>
      <div className="a-table-scroll">
        <table className="a-table">
          <thead>
            <tr>
              <th className="n">№</th>
              <th>Sana</th>
              <th>Maqola</th>
              <th>Muallif</th>
              <th>Holat</th>
              <th>Fayl</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td className="n">
                  <Link to={`/admin/desk?t=${s.id}`}>{s.number}</Link>
                </td>
                <td className="jA-nowrap">{fmtDateTime(s.created)}</td>
                <td className="jA-title">
                  {s.title}
                  {s.affiliation && <small>{s.affiliation}</small>}
                </td>
                <td>
                  {s.name}
                  <small className="jA-block">
                    <a href={`mailto:${s.email}`}>{s.email}</a>
                  </small>
                </td>
                <td>{STAGE[s.stage] || s.stage}</td>
                <td>
                  {s.files.map((f) => (
                    <a key={f.url} className="a-btn ghost sm" href={f.url}>
                      <Download size={14} />
                      <span>
                        {f.name} · {kb(f.size)}
                      </span>
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ====================================================================== maqola muharriri */
const emptyArt = (issue: string, lang: Lang): Art => ({
  issue_id: issue || null,
  section_id: "",
  lang,
  title: "",
  title_i18n: {},
  authors: [{ given: "", family: "", affiliations: [], country: "", email: "", orcid: "", corresponding: true }],
  abstract: {},
  keywords: {},
  first_page: "",
  last_page: "",
  doi: "",
  udc: "",
  received: "",
  revised: "",
  accepted: "",
  published_on: "",
  pdf: "",
  pdf_name: "",
  pdf_size: 0,
  references: [],
  funding: "",
  license: "",
  status: "draft",
  sort: 0,
});

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[ʻʼ'`‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function similarity(title: string, text: string) {
  const words = (norm(title).match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2);
  if (!words.length) return 0;
  const hay = new Set(norm(text).match(/[\p{L}\p{N}]+/gu) || []);
  return words.filter((w) => hay.has(w)).length / words.length;
}
function initials(g: string) {
  return g
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + ".")
    .join(" ");
}
const range = (a: Art, dash = "–") => (a.first_page && a.last_page && a.first_page !== a.last_page ? `${a.first_page}${dash}${a.last_page}` : a.first_page || a.last_page);

type Check = { level: "ok" | "warn" | "bad"; text: string };

function scholarChecks(a: Art, s: Settings, issue: Issue | undefined, base: Lang): Check[] {
  const c: Check[] = [];
  const add = (ok: boolean, text: string, missing: "warn" | "bad" = "bad") => c.push({ level: ok ? "ok" : missing, text });
  add(!!a.title.trim(), "Sarlavha (citation_title)");
  add(a.authors.some((x) => x.family || x.given), "Kamida bitta muallif (citation_author)");
  add(a.authors.every((x) => !(x.family || x.given) || (x.family && x.given)), "Har bir muallifda ism va familiya alohida", "warn");
  add(a.authors.every((x) => !(x.family || x.given) || x.affiliations.length > 0), "Har bir muallifda muassasa (citation_author_institution)", "warn");
  add(!!pick(s.title, base), "Jurnal nomi (citation_journal_title) — Sozlamalarda");
  add(!!(s.issn_print || s.issn_online), "ISSN yoki eISSN (citation_issn) — Sozlamalarda", "warn");
  add(!!issue, "Son tanlangan: jild va raqam (citation_volume, citation_issue)");
  add(!!(issue?.published_on || a.published_on), "Nashr sanasi (citation_publication_date)");
  add(!!a.first_page, "Betlar (citation_firstpage / lastpage)", "warn");
  add(Object.values(a.abstract).some((x) => x.trim()), "Annotatsiya sahifada ko‘rinadi");
  add(Object.values(a.keywords).some((x) => x.length), "Kalit so‘zlar (citation_keywords)", "warn");
  add(!!a.pdf, "To‘liq matn PDF (citation_pdf_url)");
  if (a.pdf && a.pdf_check) {
    add(a.pdf_check.has_text, "PDF’da matn qatlami bor (skaner emas) — Scholar matnli PDF talab qiladi", "bad");
    add(!a.pdf_check.encrypted, "PDF parol bilan himoyalanmagan", "warn");
    const sim = similarity(a.title, a.pdf_check.first_text);
    add(!a.title || !a.pdf_check.has_text || sim >= 0.6, `PDF birinchi betida sarlavha bor (moslik ${Math.round(sim * 100)}%)`, "warn");
  }
  add(!!a.doi, "DOI (ixtiyoriy, lekin tavsiya etiladi)", "warn");
  add(issue?.status === "published", "Son e’lon qilingan (aks holda maqola saytda ko‘rinmaydi)", "warn");
  add(a.status === "published", "Maqola e’lon qilingan", "warn");
  return c;
}

function metaPreview(a: Art, s: Settings, issue: Issue | undefined, baseUrl: string, base: Lang): [string, string][] {
  const url = a.num ? `${baseUrl}/journal/article/${a.num}/${a.slug || "…"}` : `${baseUrl}/journal/article/…`;
  const m: [string, string][] = [["citation_title", a.title]];
  for (const p of a.authors) {
    if (!(p.family || p.given)) continue;
    m.push(["citation_author", [p.family, p.given].filter(Boolean).join(", ")]);
    for (const x of p.affiliations) m.push(["citation_author_institution", x]);
    if (p.orcid) m.push(["citation_author_orcid", `https://orcid.org/${p.orcid.replace(/^https?:\/\/orcid\.org\//, "")}`]);
  }
  const pd = (issue?.published_on || a.published_on || (issue ? `${issue.year}-01-01` : "")).replace(/-/g, "/");
  m.push(["citation_publication_date", pd], ["citation_online_date", (a.published_on || "").replace(/-/g, "/") || pd], ["citation_journal_title", pick(s.title, base)], ["citation_journal_abbrev", s.abbr]);
  if (s.issn_print) m.push(["citation_issn", s.issn_print]);
  if (s.issn_online) m.push(["citation_issn", s.issn_online]);
  m.push(["citation_volume", issue ? String(issue.volume) : ""], ["citation_issue", issue ? String(issue.number) : ""], ["citation_firstpage", a.first_page], ["citation_lastpage", a.last_page]);
  m.push(["citation_doi", a.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")], ["citation_publisher", pick(s.publisher, base)], ["citation_language", a.lang]);
  for (const k of a.keywords[a.lang] || Object.values(a.keywords)[0] || []) m.push(["citation_keywords", k]);
  m.push(["citation_abstract_html_url", url]);
  if (a.pdf) m.push(["citation_pdf_url", a.num ? `${baseUrl}/journal/pdf/${a.num}/${a.slug || "…"}.pdf` : `${baseUrl}/journal/pdf/….pdf`]);
  return m.filter(([, v]) => v);
}

function citePreview(a: Art, s: Settings, issue: Issue | undefined, base: Lang) {
  const jt = pick(s.title, base) || "[jurnal nomi]";
  const au = a.authors.filter((x) => x.family || x.given);
  const names = au.map((p) => `${p.family}, ${initials(p.given)}`.replace(/, $/, ""));
  const apaA = names.length <= 1 ? names[0] || "" : `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  const pages = range(a);
  const doi = a.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  const link = doi ? `https://doi.org/${doi}` : "[URL]";
  const v = issue?.volume ?? "?";
  const n = issue?.number ?? "?";
  const y = issue?.year ?? "?";
  const t = a.title.replace(/\.$/, "") || "[sarlavha]";
  const apa = `${apaA} (${y}). ${t}. ${jt}, ${v}(${n})${pages ? `, ${pages}` : ""}. ${link}`;
  const w = a.lang === "ru" ? ["Т.", "№", "С."] : a.lang === "uz" ? ["Jild", "№", "B."] : ["Vol.", "no.", "P."];
  const gost = `${au.slice(0, 3).map((p) => `${p.family} ${initials(p.given)}`.trim()).join(", ")}${au.length > 3 ? " [et al.]" : ""} ${t} // ${jt}. ${y}. ${w[0]} ${v}, ${w[1]} ${n}.${pages ? ` ${w[2]} ${pages}.` : ""}${doi ? ` DOI: ${doi}.` : ""}`;
  const mlaA = au.length === 1 ? `${au[0].family}, ${au[0].given}` : au.length === 2 ? `${au[0].family}, ${au[0].given}, and ${au[1].given} ${au[1].family}` : au.length ? `${au[0].family}, ${au[0].given}, et al` : "";
  const mla = `${mlaA}. “${t}.” ${jt}, vol. ${v}, no. ${n}, ${y}${pages ? `, pp. ${pages}` : ""}. ${link}.`;
  return { APA: apa, ГОСТ: gost, MLA: mla };
}

export function JournalArticleEditor() {
  const { id = "new" } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [ov, setOv] = useState<Overview | null>(null);
  const [a, setA] = useState<Art | null>(null);
  const [absLang, setAbsLang] = useState<string>("");
  const [hints, setHints] = useState<Hints | null>(null);
  const [busy, setBusy] = useState(false);
  const [refsText, setRefsText] = useState("");
  const [askIssue, setAskIssue] = useState(false);
  const keyN = useRef(0);
  const k = () => `a${++keyN.current}`;
  const loadOv = () => req<Overview>("GET", "/api/admin/journal").then(setOv).catch(() => null);
  const refreshVis = () => {
    loadOv();
    if (a?.id) req<Art>("GET", `/api/admin/journal/articles/${a.id}`).then((r) => setA((cur) => (cur ? { ...cur, visibility: r.visibility } : cur))).catch(() => null);
  };
  const quick = useQuickFix(refreshVis);

  useEffect(() => {
    req<Overview>("GET", "/api/admin/journal")
      .then((o) => {
        setOv(o);
        if (id === "new") {
          const art = emptyArt(sp.get("issue") || o.issues[0]?.id || "", o.base_lang);
          art.authors = art.authors.map((x) => ({ ...x, _k: k() }));
          setA(art);
          setAbsLang(art.lang);
        }
      })
      .catch(() => null);
    if (id !== "new")
      req<Art>("GET", `/api/admin/journal/articles/${id}`)
        .then((r) => {
          setA({ ...r, authors: r.authors.map((x) => ({ ...x, _k: k() })) });
          setRefsText((r.references || []).join("\n"));
          setAbsLang(r.lang);
        })
        .catch(() => toast("Maqola topilmadi", "error"));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const issue = useMemo(() => ov?.issues.find((i) => i.id === a?.issue_id), [ov, a?.issue_id]);
  const { move, props } = useDragList(a?.authors || [], (l) => a && setA({ ...a, authors: l }));
  if (!ov || !a) return <Spinner />;
  const s = ov.settings;
  const base = ov.base_lang;
  const set = (p: Partial<Art>) => setA({ ...a, ...p });
  const updAuthor = (i: number, p: Partial<Author>) => set({ authors: a.authors.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const absLangs = Array.from(new Set([a.lang, ...LANGS, ...Object.keys(a.abstract)]));
  const otherLangs = LANGS.filter((l) => l !== a.lang);

  const save = async (status?: string, withIssue = false) => {
    setBusy(true);
    const { visibility: _v, ...rest } = a;
    void _v;
    const body = { ...rest, status: status || a.status, references: refsText.split("\n").map((x) => x.trim()).filter(Boolean), authors: a.authors.map(({ _k, ...x }) => x) };
    try {
      let r = await req<Art>(a.id ? "PUT" : "POST", a.id ? `/api/admin/journal/articles/${a.id}` : "/api/admin/journal/articles", body);
      if (withIssue && issue && issue.status !== "published") {
        await req("PUT", `/api/admin/journal/issues/${issue.id}`, { status: "published" });
        r = await req<Art>("GET", `/api/admin/journal/articles/${r.id}`);
        loadOv();
      }
      setA({ ...r, authors: r.authors.map((x) => ({ ...x, _k: k() })) });
      setRefsText(r.references.join("\n"));
      toast(status === "published" ? (r.visibility?.public ? "E’lon qilindi — maqola saytda ko‘rinadi" : "E’lon qilindi") : "Saqlandi");
      if (!a.id && r.id) nav(`/admin/journal/articles/${r.id}`, { replace: true });
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  // son qoralama bo'lsa — maqola saytda ko'rinmaydi: sonni ham nashr qilish taklif qilinadi
  const publish = () => (issue && issue.status !== "published" ? setAskIssue(true) : save("published"));
  const del = async () => {
    if (!a.id || !(await confirm(`Maqola o‘chirilsinmi? «${a.title}»`))) return;
    await req("DELETE", `/api/admin/journal/articles/${a.id}`);
    nav("/admin/journal");
  };
  const applyHints = () => {
    if (!hints) return;
    const p: Partial<Art> = {};
    if (hints.title && !a.title) p.title = hints.title;
    if (hints.abstract && !a.abstract[a.lang]) p.abstract = { ...a.abstract, [a.lang]: hints.abstract };
    if (hints.keywords?.length && !(a.keywords[a.lang] || []).length) p.keywords = { ...a.keywords, [a.lang]: hints.keywords };
    if (hints.doi && !a.doi) p.doi = hints.doi;
    if (hints.udc && !a.udc) p.udc = hints.udc;
    set(p);
    toast(Object.keys(p).length ? "Bo‘sh maydonlar PDF’dan to‘ldirildi — tekshirib chiqing" : "To‘ldiriladigan bo‘sh maydon yo‘q");
  };
  const checks = scholarChecks({ ...a, references: [] }, s, issue, base);
  const bad = checks.filter((c) => c.level === "bad").length;
  const warn = checks.filter((c) => c.level === "warn").length;
  const cites = citePreview(a, s, issue, base);
  const metas = metaPreview(a, s, issue, ov.base_url, base);
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  return (
    <div className="a-page jA">
      <PageHead
        title={a.id ? `Maqola №${a.num}` : "Yangi maqola"}
        sub={
          <Link to={`/admin/journal${a.issue_id ? `?issue=${a.issue_id}` : ""}`} className="jA-back">
            ← Maqolalar
          </Link>
        }
        actions={
          <>
            <Pill tone={a.status === "published" ? "ok" : "muted"}>{a.status === "published" ? "E’lon qilingan" : "Qoralama"}</Pill>
            {a.id && a.url && (
              <a className="a-btn md ghost" href={a.url} target="_blank" rel="noreferrer" title={a.visibility?.public ? "Saytda ochish" : "Saytda qanday ko‘rinishini ko‘rish (hali faqat sizga ko‘rinadi)"}>
                {a.visibility?.public ? <ExternalLink size={15} /> : <Eye size={15} />}
                <span>{a.visibility?.public ? "Saytda" : "Ko‘rib chiqish"}</span>
              </a>
            )}
            <Btn icon={<Save size={15} />} busy={busy} onClick={() => save()}>
              Saqlash
            </Btn>
            {a.status === "published" ? (
              <Btn busy={busy} onClick={() => save("draft")}>
                Qoralamaga qaytarish
              </Btn>
            ) : (
              <Btn kind="primary" busy={busy} onClick={publish}>
                E’lon qilish
              </Btn>
            )}
          </>
        }
      />
      <div className="jA-ed">
        <div className="jA-stack">
          <Card title="Asosiy">
            <div className="a-form-grid">
              <Field label="Son">
                <Select value={a.issue_id || ""} onChange={(v) => set({ issue_id: v || null })} options={[{ value: "", label: "— tanlanmagan —" }, ...ov.issues.map((i) => ({ value: i.id, label: issueName(i) + (i.status === "published" ? "" : " · qoralama") }))]} />
              </Field>
              <Field label="Rubrika">
                <Select value={a.section_id} onChange={(v) => set({ section_id: v })} options={[{ value: "", label: "—" }, ...s.sections.map((x) => ({ value: x.id, label: pick(x.title, base) }))]} />
              </Field>
              <Field label="Maqola tili (citation_language)">
                <Select value={a.lang} onChange={(v) => set({ lang: v })} options={[...LANGS.map((l) => ({ value: l, label: LANG_NAME[l] })), ...(LANGS.includes(a.lang as Lang) ? [] : [{ value: a.lang, label: a.lang }])]} />
              </Field>
              <Field label="Litsenziya">
                <Select value={a.license} onChange={(v) => set({ license: v })} options={[{ value: "", label: `Jurnal standarti (${s.license})` }, ...ov.licenses.map((x) => ({ value: x, label: x }))]} />
              </Field>
              <Field label={`Sarlavha — maqola tilida (${LANG_NAME[a.lang] || a.lang})`} wide>
                <Textarea rows={2} value={a.title} onChange={(e) => set({ title: e.target.value.replace(/\n/g, " ") })} />
              </Field>
              {otherLangs.map((l) => (
                <Field key={l} label={`Sarlavha tarjimasi — ${LANG_NAME[l]} (ixtiyoriy)`} wide>
                  <Input value={a.title_i18n[l] || ""} onChange={(e) => set({ title_i18n: { ...a.title_i18n, [l]: e.target.value } })} />
                </Field>
              ))}
              {a.slug && (
                <p className="a-hint wide jA-url">
                  URL: <code>/journal/article/{a.num}/{a.slug}</code> — birinchi e’londan keyin o‘zgarmaydi.
                </p>
              )}
            </div>
          </Card>

          <Card
            title="Mualliflar"
            sub="Tartib — maqoladagi tartib. Sudrab yoki strelkalar bilan o‘zgartiring. Email saytda ko‘rsatilmaydi."
            actions={
              <Btn icon={<Plus size={15} />} onClick={() => set({ authors: [...a.authors, { given: "", family: "", affiliations: a.authors[a.authors.length - 1]?.affiliations || [], country: a.authors[a.authors.length - 1]?.country || "", email: "", orcid: "", corresponding: false, _k: k() }] })}>
                Muallif
              </Btn>
            }
          >
            <ol className="jA-rep">
              {a.authors.map((p, i) => (
                <li key={p._k} className="jA-rep-item" {...props(i)}>
                  <div className="jA-rep-bar">
                    <span className="jA-grip" draggable aria-hidden onDragStart={props(i).onDragStart}>
                      <GripVertical size={16} />
                    </span>
                    <b>
                      {i + 1}. {[p.given, p.family].filter(Boolean).join(" ") || "Yangi muallif"}
                    </b>
                    <span className="jA-sp" />
                    <Btn size="sm" kind="ghost" icon={<ArrowUp size={14} />} title="Yuqoriga" onClick={() => move(i, i - 1)} disabled={i === 0} />
                    <Btn size="sm" kind="ghost" icon={<ArrowDown size={14} />} title="Pastga" onClick={() => move(i, i + 1)} disabled={i === a.authors.length - 1} />
                    <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} title="O‘chirish" onClick={() => set({ authors: a.authors.filter((_, j) => j !== i) })} />
                  </div>
                  <div className="a-form-grid">
                    <Field label="Familiya">
                      <Input value={p.family} onChange={(e) => updAuthor(i, { family: e.target.value })} />
                    </Field>
                    <Field label="Ism (va otasining ismi)">
                      <Input value={p.given} onChange={(e) => updAuthor(i, { given: e.target.value })} />
                    </Field>
                    <Field label="Muassasa(lar) — har biri alohida qatorda" wide>
                      <Textarea rows={2} value={p.affiliations.join("\n")} onChange={(e) => updAuthor(i, { affiliations: e.target.value.split("\n") })} />
                    </Field>
                    <Field label="Davlat">
                      <Input value={p.country} onChange={(e) => updAuthor(i, { country: e.target.value })} />
                    </Field>
                    <Field label="ORCID">
                      <Input value={p.orcid} onChange={(e) => updAuthor(i, { orcid: e.target.value })} placeholder="0000-0000-0000-0000" />
                    </Field>
                    <Field label="Email (saytda ko‘rinmaydi)">
                      <Input type="email" value={p.email} onChange={(e) => updAuthor(i, { email: e.target.value })} />
                    </Field>
                    <div className="a-field jA-corr">
                      <Toggle checked={p.corresponding} onChange={(v) => updAuthor(i, { corresponding: v })} label="Mas’ul muallif" />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card
            title="To‘liq matn (PDF)"
            sub="Google Scholar matnli PDF talab qiladi: birinchi betda sarlavha va mualliflar, skaner qilingan emas."
            actions={
              hints && (
                <Btn icon={<Wand2 size={15} />} onClick={applyHints}>
                  PDF dan to‘ldirish
                </Btn>
              )
            }
          >
            <PdfUpload
              value={a.pdf}
              name={a.pdf_name}
              onDone={(r) => {
                const { hints: h, ...check } = r.check;
                set({ pdf: r.url, pdf_name: r.name, pdf_size: r.size, pdf_check: check });
                setHints(h || null);
              }}
            />
            {a.pdf_check && (
              <ul className="jA-pdfinfo">
                <li>{a.pdf_check.pages} bet · {kb(a.pdf_size)}</li>
                <li className={a.pdf_check.has_text ? "ok" : "bad"}>
                  {a.pdf_check.has_text ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {a.pdf_check.has_text ? "Matn qatlami bor" : "Matn qatlami yo‘q (skaner) — Scholar indekslamaydi; OCR qilingan PDF yuklang"}
                </li>
                {a.pdf_check.encrypted && (
                  <li className="warn">
                    <AlertTriangle size={15} /> PDF shifrlangan
                  </li>
                )}
                {a.pdf_check.info_title && <li>PDF hujjat sarlavhasi: «{a.pdf_check.info_title}»</li>}
              </ul>
            )}
          </Card>

          <Card title="Annotatsiya va kalit so‘zlar">
            <div className="a-seg jA-langs" role="tablist" aria-label="Til">
              {absLangs.map((l) => (
                <button key={l} role="tab" aria-selected={absLang === l} className={absLang === l ? "on" : ""} onClick={() => setAbsLang(l)}>
                  {LANG_NAME[l] || l}
                  {l === a.lang ? " · asosiy" : ""}
                  {a.abstract[l] ? " ✓" : ""}
                </button>
              ))}
            </div>
            <Field label={`Annotatsiya (${LANG_NAME[absLang] || absLang})`} wide>
              <Textarea rows={8} value={a.abstract[absLang] || ""} onChange={(e) => set({ abstract: { ...a.abstract, [absLang]: e.target.value } })} />
            </Field>
            <Field label={`Kalit so‘zlar (${LANG_NAME[absLang] || absLang})`} wide>
              <TagInput value={a.keywords[absLang] || []} onChange={(v) => set({ keywords: { ...a.keywords, [absLang]: v } })} />
            </Field>
          </Card>

          <Card title="Nashr ma’lumotlari">
            <div className="a-form-grid jA-g4">
              <Field label="Birinchi bet">
                <Input value={a.first_page} onChange={(e) => set({ first_page: e.target.value })} inputMode="numeric" />
              </Field>
              <Field label="Oxirgi bet">
                <Input value={a.last_page} onChange={(e) => set({ last_page: e.target.value })} inputMode="numeric" />
              </Field>
              <Field label="DOI (ixtiyoriy)">
                <Input value={a.doi} onChange={(e) => set({ doi: e.target.value })} placeholder={s.doi_prefix ? `${s.doi_prefix}/…` : "10.xxxx/…"} />
              </Field>
              <Field label="UDK (ixtiyoriy)">
                <Input value={a.udc} onChange={(e) => set({ udc: e.target.value })} />
              </Field>
              <Field label="Qabul qilingan">
                <Input type="date" value={a.received} onChange={(e) => set({ received: e.target.value })} />
              </Field>
              <Field label="Qayta ishlangan">
                <Input type="date" value={a.revised} onChange={(e) => set({ revised: e.target.value })} />
              </Field>
              <Field label="Nashrga qabul qilingan">
                <Input type="date" value={a.accepted} onChange={(e) => set({ accepted: e.target.value })} />
              </Field>
              <Field label="Onlayn e’lon qilingan">
                <Input type="date" value={a.published_on} onChange={(e) => set({ published_on: e.target.value })} />
              </Field>
            </div>
          </Card>

          <Card title="Adabiyotlar ro‘yxati" sub="Har bir manba alohida qatorda; raqamlar avtomatik qo‘yiladi.">
            <Textarea rows={10} value={refsText} onChange={(e) => setRefsText(e.target.value)} aria-label="Adabiyotlar" />
          </Card>

          <Card title="Moliyalashtirish va minnatdorchilik (ixtiyoriy)">
            <Textarea rows={3} value={a.funding} onChange={(e) => set({ funding: e.target.value })} aria-label="Moliyalashtirish" />
          </Card>

          {a.id && (
            <div className="jA-foot left">
              <Btn kind="danger" icon={<Trash2 size={15} />} onClick={del}>
                Maqolani o‘chirish
              </Btn>
            </div>
          )}
        </div>

        <aside className="jA-side">
          {a.id && a.visibility && <VisibilityBox v={a.visibility} busy={quick.busy} onEnable={() => quick.enable()} onIssue={() => quick.publishIssue(issue)} />}
          <details className="jA-check" open>
            <summary>
              <b>Google Scholar tekshiruvi</b>
              <span className={`jA-score ${bad ? "bad" : warn ? "warn" : "ok"}`}>{bad ? `${bad} ta majburiy yetishmaydi` : warn ? `${warn} ta tavsiya` : "Tayyor"}</span>
            </summary>
            <ul>
              {checks.map((c) => (
                <li key={c.text} className={c.level}>
                  {c.level === "ok" ? <CheckCircle2 size={15} /> : c.level === "warn" ? <AlertTriangle size={15} /> : <XCircle size={15} />}
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
            <details className="jA-meta">
              <summary>Meta teglar ({metas.length})</summary>
              <pre>{metas.map(([n, v]) => `<meta name="${n}" content="${esc(v)}">`).join("\n")}</pre>
            </details>
          </details>
          <Card title="Iqtibos ko‘rinishi">
            {Object.entries(cites).map(([k2, v]) => (
              <div key={k2} className="jA-cite">
                <b>{k2}</b>
                <p>{v}</p>
              </div>
            ))}
          </Card>
          {a.id && (
            <Card title="Statistika">
              <p className="jA-stat">
                Ko‘rishlar: <b>{a.views || 0}</b> · Yuklab olishlar: <b>{a.downloads || 0}</b>
              </p>
            </Card>
          )}
        </aside>
      </div>
      <Modal
        open={askIssue}
        onClose={() => setAskIssue(false)}
        title="Son hali nashr qilinmagan"
        width={520}
        footer={
          <>
            <Btn onClick={() => setAskIssue(false)}>Bekor qilish</Btn>
            <Btn
              onClick={() => {
                setAskIssue(false);
                save("published");
              }}
            >
              Faqat maqolani
            </Btn>
            <Btn
              kind="primary"
              icon={<Send size={15} />}
              onClick={() => {
                setAskIssue(false);
                save("published", true);
              }}
            >
              Sonni ham nashr qilish
            </Btn>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Maqola <b>{issue ? issueName(issue) : ""}</b> soniga tegishli, bu son hozir qoralama holatida. Son nashr qilinmaguncha maqola saytda ko‘rinmaydi.
        </p>
      </Modal>
    </div>
  );
}

/* maqola muharriri: saytda ko'rinadimi va nima to'sqinlik qilyapti (bir bosishda tuzatish) */
function VisibilityBox({ v, busy, onEnable, onIssue }: { v: Visibility; busy: boolean; onEnable: () => void; onIssue: () => void }) {
  return (
    <section className={`jA-vis ${v.public ? "ok" : "bad"}`} aria-label="Saytda ko‘rinishi">
      <p className="jA-vis-h">
        {v.public ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <b>{v.public ? "Maqola saytda ko‘rinadi" : "Maqola saytda hali ko‘rinmaydi"}</b>
      </p>
      {!v.public && (
        <ul>
          {v.reasons.map((r) => (
            <li key={r.code + r.text}>
              <span>{r.text[0].toUpperCase() + r.text.slice(1)}</span>
              {r.code === "journal_off" && (
                <Btn size="sm" kind="primary" busy={busy} onClick={onEnable}>
                  Saytda ko‘rsatish
                </Btn>
              )}
              {r.code === "issue_draft" && (
                <Btn size="sm" kind="primary" busy={busy} onClick={onIssue}>
                  Sonni nashr qilish
                </Btn>
              )}
              {r.code === "no_title" && (
                <Link className="a-btn sm default" to="/admin/journal?tab=settings">
                  <span>Nomini yozish</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
