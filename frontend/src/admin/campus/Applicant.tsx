// Admin → Abituriyent: qabul bosqichlari, o'tish ballari va kvotalar (jadval + Excel), ota-onalar sahifasi, kampus xaritasi.
import { AlertTriangle, CalendarRange, Download, MapPin, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { req } from "../../lib/api";
import { Btn, Card, Empty, Field, Input, Modal, PageHead, Pill, Spinner, Toggle, useConfirm, useToast } from "../ui";
import { em, ItemsPanel, SettingsCard, Tabs, VIS, Visible, useVisible, type Rec } from "./kit";

/* ------------------------------------------------------------------ qabul bosqichlari */
export function StepsAdmin() {
  const [tab, setTab] = useState<"list" | "page">("list");
  const [vis, reload] = useVisible();
  const [year, setYear] = useState<number | 0>(0);
  const [years, setYears] = useState<number[]>([]);
  const loadYears = () =>
    req<{ items: Rec[] }>("GET", "/api/admin/items/adm_step")
      .then((r) => setYears([...new Set(r.items.map((x) => Number(x.year)).filter(Boolean))].sort((a, b) => b - a)))
      .catch(() => null);
  useEffect(() => {
    loadYears();
  }, []);
  return (
    <div className="a-page">
      <PageHead
        title="Qabul bosqichlari"
        sub="Har bir qabul yili uchun bosqichlar (sana oralig‘i bilan). Saytda bugungi sanaga qarab joriy bosqich ajratiladi; /admission va /admission/steps sahifalarida chiqadi."
        actions={<Visible on={vis?.steps} to="/admission/steps" />}
      />
      <Tabs value={tab} onChange={setTab} items={[["list", "Bosqichlar"], ["page", "Sahifa matni"]]} />
      {tab === "list" ? (
        <ItemsPanel
          kind="adm_step"
          title="bosqich"
          defaults={{ status: "draft", year: year || new Date().getFullYear() }}
          icon={<CalendarRange size={28} />}
          empty={year ? `${year}/${year + 1} uchun bosqich yo‘q` : "Hali bosqich qo‘shilmagan"}
          newLabel="Yangi bosqich"
          onSaved={() => (reload(), loadYears())}
          filter={(x) => !year || Number(x.year) === year}
          sort={(a, b) => Number(b.year) - Number(a.year) || String(a.starts || "").localeCompare(String(b.starts || ""))}
          extraTools={
            years.length > 1 ? (
              <select className="a-input cxa-sel" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Qabul yili">
                <option value={0}>Barcha yillar</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}/{y + 1}
                  </option>
                ))}
              </select>
            ) : null
          }
          fields={[
            { key: "title", label: "Bosqich nomi", type: "text", wide: true, i18n: true },
            { key: "year", label: "Qabul yili (masalan, 2026 → 2026/2027)", type: "number" },
            { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
            { key: "starts", label: "Boshlanishi", type: "datetime" },
            { key: "ends", label: "Tugashi", type: "datetime" },
            { key: "summary", label: "Tavsif", type: "textarea", wide: true, i18n: true },
            { key: "url", label: "Havola", type: "url", placeholder: "https://my.uzbmb.uz yoki /announcements/…" },
            { key: "button", label: "Havola matni", type: "text", i18n: true, placeholder: "Ariza topshirish" },
          ]}
          row={(x) => (
            <>
              <b>{String(x.title)}</b>
              <small>
                <Pill tone="info">
                  {String(x.year)}/{Number(x.year) + 1}
                </Pill>
                {x.starts ? new Date(String(x.starts)).toLocaleDateString("ru-RU") : "sana yo‘q"}
                {x.ends ? ` — ${new Date(String(x.ends)).toLocaleDateString("ru-RU")}` : ""}
              </small>
            </>
          )}
        />
      ) : (
        <SettingsCard group="applicant" section="steps" title="«Qabul bosqichlari» sahifasi" fields={[{ key: "intro", label: "Kirish matni", type: "ltext", rows: 3 }]} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ o'tish ballari */
type Form = "day" | "extramural" | "evening" | "distance" | "second";
interface Row {
  id: string;
  year: number;
  program_id: string;
  title: string;
  code: string;
  form: Form;
  edu_lang: "uz" | "ru" | "en";
  quota: number | null;
  quota_grant: number | null;
  quota_contract: number | null;
  grant: number | null;
  contract: number | null;
}
interface Prog {
  id: string;
  title: string;
  status: string;
  degree: string;
  code: string;
}
interface ScoresData {
  rows: Row[];
  sources: Record<string, string>;
  updated: string;
  programs: Prog[];
  forms: Form[];
  max_score: number;
}
const FORM_L: Record<Form, string> = { day: "Kunduzgi", extramural: "Sirtqi", evening: "Kechki", distance: "Masofaviy", second: "Ikkinchi oliy" };
const LANG_L = { uz: "O‘zbek", ru: "Rus", en: "Ingliz" };
const numIn = (v: string, int = false) => {
  if (v.trim() === "" || v.trim() === "-") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? (int ? Math.round(n) : n) : null;
};
const rid = () => Math.random().toString(16).slice(2, 12);

function NumCell({ value, onChange, int, label }: { value: number | null; onChange: (v: number | null) => void; int?: boolean; label: string }) {
  const [s, setS] = useState(value === null ? "" : String(value).replace(".", ","));
  useEffect(() => setS(value === null ? "" : String(value).replace(".", ",")), [value]);
  return <input className="a-input cxa-num" inputMode="decimal" value={s} aria-label={label} placeholder="—" onChange={(e) => setS(e.target.value)} onBlur={() => onChange(numIn(s, int))} />;
}

export function ScoresAdmin() {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<ScoresData | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [year, setYear] = useState(0);
  const [form, setForm] = useState<Form>("day");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newYear, setNewYear] = useState("");
  const [imp, setImp] = useState<{ rows: Row[]; unmatched: string[]; skipped: number } | null>(null);
  const [replace, setReplace] = useState(true);
  const [tab, setTab] = useState<"table" | "page">("table");
  const [vis, reload] = useVisible();
  const file = useRef<HTMLInputElement>(null);
  const load = (r: ScoresData) => {
    setD(r);
    setRows(r.rows);
    setSources(r.sources);
    setDirty(false);
    const ys = [...new Set(r.rows.map((x) => x.year))].sort((a, b) => b - a);
    setYear((y) => (y && (ys.includes(y) || y > 2000) ? y : ys[0] || new Date().getFullYear()));
  };
  useEffect(() => {
    req<ScoresData>("GET", "/api/admin/applicant/scores")
      .then(load)
      .catch((e) => toast(em(e), "error"));
  }, [toast]);
  const years = useMemo(() => [...new Set([...rows.map((r) => r.year), ...(year ? [year] : [])])].sort((a, b) => b - a), [rows, year]);
  const progs = useMemo(() => Object.fromEntries((d?.programs || []).map((p) => [p.id, p])), [d]);
  if (!d) return <Spinner />;
  const shown = rows.filter((r) => r.year === year && r.form === form).sort((a, b) => (progs[a.program_id]?.title || a.title).localeCompare(progs[b.program_id]?.title || b.title) || a.edu_lang.localeCompare(b.edu_lang));
  const formsUsed = d.forms.filter((f) => f === "day" || rows.some((r) => r.year === year && r.form === f));
  const upd = (id: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      load(await req<ScoresData>("PUT", "/api/admin/applicant/scores", { rows, sources }));
      toast("Saqlandi");
      reload();
    } catch (e) {
      toast(em(e), "error");
    }
    setBusy(false);
  };
  const parse = async (f: File | undefined) => {
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      setImp(await req<{ rows: Row[]; unmatched: string[]; skipped: number }>("POST", "/api/admin/applicant/scores/parse", fd));
    } catch (e) {
      toast(em(e), "error");
    }
    if (file.current) file.current.value = "";
  };
  const applyImport = () => {
    if (!imp) return;
    const ys = new Set(imp.rows.map((r) => r.year));
    const key = (r: Row) => `${r.year}|${r.program_id || r.title.toLowerCase()}|${r.form}|${r.edu_lang}`;
    const baseRows = replace ? rows.filter((r) => !ys.has(r.year)) : rows;
    const map = new Map(baseRows.map((r) => [key(r), r]));
    for (const r of imp.rows) map.set(key(r), { ...r, id: map.get(key(r))?.id || r.id || rid() });
    setRows([...map.values()]);
    setYear(Math.max(...ys));
    setDirty(true);
    setImp(null);
    toast("Jadvalga qo‘shildi — tekshirib, «Saqlash»ni bosing");
  };
  const unlinked = rows.filter((r) => !r.program_id || !progs[r.program_id] || progs[r.program_id].status !== "published").length;
  return (
    <div className="a-page cxa-scores">
      <PageHead
        title="O‘tish ballari va kvotalar"
        sub="Yo‘nalishlar bo‘yicha qabul kvotalari va grant / kontrakt o‘tish ballari — «Qaysi yo‘nalishga kira olaman?» kalkulyatori shu jadvaldan hisoblaydi."
        actions={
          <>
            <Visible on={vis?.calculator} to="/admission/calculator" />
            <Btn kind="primary" busy={busy} disabled={!dirty} onClick={save}>
              Saqlash
            </Btn>
          </>
        }
      />
      <Tabs value={tab} onChange={setTab} items={[["table", "Jadval"], ["page", "Kalkulyator sozlamalari"]]} />
      {tab === "page" ? (
        <SettingsCard
          group="applicant"
          section="calculator"
          title="Kalkulyator"
          fields={[
            { key: "max_score", label: "Eng yuqori ball", type: "int", hint: "Milliy test tizimi: 189 (bo‘sh qoldirilsa — 189)" },
            { key: "intro", label: "Kirish matni", type: "ltext", rows: 3 },
          ]}
        />
      ) : (
        <>
          {unlinked > 0 && (
            <div className="tu-adm-warn">
              <AlertTriangle size={20} />
              <div>
                <b>Saytdagi yo‘nalishga bog‘lanmagan qatorlar: {unlinked}</b>
                <span>Bu qatorlar kalkulyatorda ko‘rinmaydi (masalan, endi qabul qilinmaydigan yo‘nalish). Kerak bo‘lsa, «Yo‘nalish» ustunida tanlang.</span>
              </div>
            </div>
          )}
          <Card
            title="Jadval"
            actions={
              <div className="cxa-tools">
                <a className="a-btn ghost sm" href={`/api/admin/applicant/scores.xlsx${year ? `?year=${year}` : ""}`}>
                  <Download size={14} />
                  <span>Excel ({year}/{year + 1})</span>
                </a>
                <Btn size="sm" icon={<Upload size={14} />} onClick={() => file.current?.click()}>
                  Excel’dan yuklash
                </Btn>
                <input ref={file} type="file" hidden accept=".xlsx" onChange={(e) => parse(e.target.files?.[0])} />
              </div>
            }
          >
            <div className="cxa-bar">
              <div className="a-seg" role="tablist" aria-label="Qabul yili">
                {years.map((y) => (
                  <button key={y} role="tab" aria-selected={y === year} className={y === year ? "on" : ""} onClick={() => setYear(y)}>
                    {y}/{y + 1}
                  </button>
                ))}
              </div>
              <span className="cxa-row">
                <Input value={newYear} onChange={(e) => setNewYear(e.target.value)} placeholder="2027" className="cxa-year" aria-label="Yangi yil" />
                <Btn
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={() => {
                    const y = Number(newYear);
                    if (y >= 2000 && y <= 2100) {
                      setYear(y);
                      setNewYear("");
                    } else toast("Yilni kiriting, masalan 2027", "error");
                  }}
                >
                  Yil
                </Btn>
              </span>
            </div>
            <div className="a-seg cxa-forms" role="tablist" aria-label="Ta’lim shakli">
              {d.forms.map((f) => (
                <button key={f} role="tab" aria-selected={f === form} className={`${f === form ? "on" : ""} ${formsUsed.includes(f) ? "" : "dim"}`} onClick={() => setForm(f)}>
                  {FORM_L[f]} <small>{rows.filter((r) => r.year === year && r.form === f).length}</small>
                </button>
              ))}
            </div>
            <div className="cxa-src">
              <Field label={`Manba havolasi (${year}/${year + 1}) — saytda «Manba» sifatida`}>
                <Input value={sources[String(year)] || ""} placeholder="/media/… yoki https://…" onChange={(e) => (setSources({ ...sources, [String(year)]: e.target.value }), setDirty(true))} />
              </Field>
            </div>
            {shown.length === 0 ? (
              <Empty icon={<MapPin size={26} />} title={`${year}/${year + 1} · ${FORM_L[form]}: qator yo‘q`}>
                <p className="a-hint">Qator qo‘shing yoki Excel’dan yuklang.</p>
              </Empty>
            ) : (
              <div className="cxa-tablewrap">
                <table className="a-table cxa-table">
                  <thead>
                    <tr>
                      <th>Yo‘nalish</th>
                      <th>Shifr</th>
                      <th>Til</th>
                      <th>Kvota</th>
                      <th>Grant kvota</th>
                      <th>Kontrakt kvota</th>
                      <th>O‘tish bali: grant</th>
                      <th>O‘tish bali: kontrakt</th>
                      <th aria-label="Amallar" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const p = progs[r.program_id];
                      return (
                        <tr key={r.id} className={!p || p.status !== "published" ? "warn" : ""}>
                          <td>
                            <select className="a-input" value={p ? r.program_id : ""} onChange={(e) => upd(r.id, { program_id: e.target.value, title: progs[e.target.value]?.title || r.title })} aria-label="Yo‘nalish">
                              <option value="">{r.title ? `— bog‘lanmagan: ${r.title}` : "— tanlang —"}</option>
                              {d.programs.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.title}
                                  {x.status !== "published" ? " (yashirin)" : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input className="a-input cxa-code" value={r.code} onChange={(e) => upd(r.id, { code: e.target.value })} aria-label="Shifr" />
                          </td>
                          <td>
                            <select className="a-input" value={r.edu_lang} onChange={(e) => upd(r.id, { edu_lang: e.target.value as Row["edu_lang"] })} aria-label="Til">
                              {Object.entries(LANG_L).map(([k, l]) => (
                                <option key={k} value={k}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <NumCell int value={r.quota} onChange={(v) => upd(r.id, { quota: v })} label="Kvota" />
                          </td>
                          <td>
                            <NumCell int value={r.quota_grant} onChange={(v) => upd(r.id, { quota_grant: v })} label="Grant kvota" />
                          </td>
                          <td>
                            <NumCell int value={r.quota_contract} onChange={(v) => upd(r.id, { quota_contract: v })} label="Kontrakt kvota" />
                          </td>
                          <td>
                            <NumCell value={r.grant} onChange={(v) => upd(r.id, { grant: v })} label="Grant o‘tish bali" />
                          </td>
                          <td>
                            <NumCell value={r.contract} onChange={(v) => upd(r.id, { contract: v })} label="Kontrakt o‘tish bali" />
                          </td>
                          <td>
                            <button
                              className="a-icon danger"
                              aria-label="Qatorni o‘chirish"
                              onClick={async () => {
                                if (await confirm("Qator o‘chirilsinmi?")) {
                                  setRows((rs) => rs.filter((x) => x.id !== r.id));
                                  setDirty(true);
                                }
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="cxa-bar">
              <Btn
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => {
                  setRows((rs) => [...rs, { id: rid(), year, program_id: "", title: "", code: "", form, edu_lang: "uz", quota: null, quota_grant: null, quota_contract: null, grant: null, contract: null }]);
                  setDirty(true);
                }}
              >
                Qator qo‘shish
              </Btn>
              <span className="a-hint">«—» yoki bo‘sh — ball e’lon qilinmagan. O‘nlik vergul yoki nuqta bilan: 68,5.</span>
            </div>
          </Card>
        </>
      )}
      <Modal
        open={!!imp}
        onClose={() => setImp(null)}
        title="Excel’dan yuklash"
        footer={
          <>
            <Btn onClick={() => setImp(null)}>Bekor qilish</Btn>
            <Btn kind="primary" onClick={applyImport}>
              Jadvalga qo‘shish
            </Btn>
          </>
        }
      >
        {imp && (
          <div className="cxa-imp">
            <p>
              O‘qildi: <b>{imp.rows.length}</b> qator · yillar: {[...new Set(imp.rows.map((r) => r.year))].join(", ")}
              {imp.skipped ? ` · tashlab ketildi: ${imp.skipped}` : ""}
            </p>
            {imp.unmatched.length > 0 && (
              <div className="tu-adm-warn">
                <AlertTriangle size={18} />
                <div>
                  <b>Saytdagi yo‘nalishga mos kelmadi:</b>
                  <span>{imp.unmatched.join("; ")}</span>
                </div>
              </div>
            )}
            <Toggle checked={replace} onChange={setReplace} label="Yuklangan yillarning eski qatorlarini almashtirish" />
          </div>
        )}
      </Modal>
      {dirty && (
        <div className="fx-savebar">
          O‘zgarishlar saqlanmagan
          <Btn kind="primary" busy={busy} onClick={save}>
            Saqlash
          </Btn>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ ota-onalar */
export function ParentsAdmin() {
  return (
    <div className="a-page">
      <PageHead
        title="Ota-onalar uchun"
        sub="Sahifa institut haqidagi ma’lumot, narxlar, yotoqxona va aloqa ma’lumotlaridan avtomatik yig‘iladi. Bu yerda — kirish matni, to‘lov tartibi, savol-javob va qo‘llab-quvvatlash bo‘yicha mas’ul xodimlar."
        actions={<Visible on={true} to="/parents" />}
      />
      <SettingsCard
        group="applicant"
        section="parents"
        title="«Ota-onalar uchun» sahifasi"
        fields={[
          { key: "intro", label: "Kirish matni", type: "lhtml" },
          { key: "pay", label: "To‘lov tartibi", type: "lhtml", hint: "Bo‘sh qolsa — blok chiqmaydi" },
          { key: "faq", label: "Ota-onalar savollari", type: "lpairs", pair: ["q", "a", "Savol", "Javob"], hint: "Bo‘sh qolsa — saytdagi qabul, to‘lov va yotoqxona bo‘yicha savol-javoblar ko‘rsatiladi" },
          { key: "contact_ids", label: "Talabalarni qo‘llab-quvvatlash: mas’ul xodimlar", type: "ids", max: 8, hint: "Bo‘sh qolsa — fakultet dekanati xodimlari (dekan, tyutorlar)" },
        ]}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ kampus xaritasi */
function SpotPlacer({ image, x, y, onPick }: { image: string; x: number | null; y: number | null; onPick: (x: number, y: number) => void }) {
  if (!image) return <p className="a-hint">Avval «Xarita surati» yorlig‘ida bosh reja suratini yuklang — so‘ng nuqtani surat ustida belgilaysiz.</p>;
  return (
    <div className="cxa-placer">
      <p className="a-hint">Surat ustida bosib nuqta joyini belgilang (yoki X/Y foizlarini kiriting).</p>
      <div
        className="cxa-placer-in"
        role="button"
        tabIndex={0}
        aria-label="Nuqta joyini belgilash"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onPick(Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, Math.round(((e.clientY - r.top) / r.height) * 1000) / 10);
        }}
      >
        <img src={image} alt="" />
        {x !== null && y !== null && <span className="cxa-placer-dot" style={{ left: `${x}%`, top: `${y}%` }} />}
      </div>
    </div>
  );
}

export function MapAdmin() {
  const [tab, setTab] = useState<"spots" | "map">("spots");
  const [vis, reload] = useVisible();
  const [image, setImage] = useState("");
  const [scenes, setScenes] = useState<Rec[]>([]);
  useEffect(() => {
    req<{ settings: { image: string } }>("GET", "/api/admin/applicant/settings/map").then((r) => setImage(r.settings.image || "")).catch(() => null);
    req<{ items: Rec[] }>("GET", "/api/admin/items/tour_scene").then((r) => setScenes(r.items)).catch(() => null);
  }, [tab]);
  return (
    <div className="a-page">
      <PageHead
        title="Kampus xaritasi"
        sub="Bosh reja surati va raqamlangan joylar (bino nomi, tavsif, surat, ichida nima bor, 360° sahnaga havola). Surat yuklanmasa — saytda OpenStreetMap xaritasi va joylar ro‘yxati chiqadi."
        actions={<Visible on={vis?.map} to="/campus-map" />}
      />
      <Tabs value={tab} onChange={setTab} items={[["spots", "Joylar"], ["map", "Xarita surati"]]} />
      {tab === "map" ? (
        <SettingsCard
          group="applicant"
          section="map"
          title="Xarita"
          fields={[
            { key: "image", label: "Bosh reja surati", type: "image" },
            { key: "image_alt", label: "Surat alt matni", type: "ltext" },
            { key: "lat", label: "Kenglik (surat bo‘lmasa — OpenStreetMap)", type: "float" },
            { key: "lon", label: "Uzunlik", type: "float" },
            { key: "zoom", label: "Masshtab (10–19)", type: "int" },
          ]}
        />
      ) : (
        <ItemsPanel
          kind="campus_spot"
          title="joy"
          defaults={{ status: "draft" }}
          icon={<MapPin size={28} />}
          empty="Hali joy qo‘shilmagan"
          onSaved={reload}
          sort={(a, b) => Number(a.number ?? 999) - Number(b.number ?? 999)}
          fields={[
            { key: "title", label: "Nomi", type: "text", wide: true, i18n: true },
            { key: "number", label: "Raqami (xaritada)", type: "number" },
            { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
            { key: "summary", label: "Tavsif", type: "textarea", wide: true, i18n: true },
            { key: "inside", label: "Ichida nima bor", type: "tags", wide: true, i18n: true, placeholder: "Kutubxona — Enter" },
            {
              key: "pos",
              label: "Xaritadagi joyi",
              type: "custom",
              render: ({ item, setItem }) => (
                <>
                  <SpotPlacer image={image} x={(item.x as number) ?? null} y={(item.y as number) ?? null} onPick={(x, y) => setItem((r) => ({ ...r, x, y }))} />
                  <div className="cxa-row">
                    <label className="a-field">
                      <span className="a-label">X, %</span>
                      <Input type="number" value={(item.x as number) ?? ""} onChange={(e) => setItem((r) => ({ ...r, x: e.target.value === "" ? null : Number(e.target.value) }))} />
                    </label>
                    <label className="a-field">
                      <span className="a-label">Y, %</span>
                      <Input type="number" value={(item.y as number) ?? ""} onChange={(e) => setItem((r) => ({ ...r, y: e.target.value === "" ? null : Number(e.target.value) }))} />
                    </label>
                  </div>
                </>
              ),
            },
            {
              key: "scene_id",
              label: "360° sahna (virtual tur)",
              type: "custom",
              render: ({ value, set }) => (
                <select className="a-input" value={(value as string) || ""} onChange={(e) => set(e.target.value)}>
                  <option value="">— yo‘q —</option>
                  {scenes.map((s) => (
                    <option key={s.id as string} value={s.id as string}>
                      {String(s.title)}
                    </option>
                  ))}
                </select>
              ),
            },
            { key: "url", label: "Havola (sahifa)", type: "url", placeholder: "/library yoki https://…" },
            { key: "photo", label: "Surat", type: "image", altKey: "photo_alt" },
          ]}
          row={(x) => (
            <>
              <b>
                {x.number ? `${x.number}. ` : ""}
                {String(x.title)}
              </b>
              <small>{x.x !== null && x.x !== undefined ? `X ${x.x}% · Y ${x.y}%` : "xaritada belgilanmagan"}</small>
            </>
          )}
        />
      )}
    </div>
  );
}
