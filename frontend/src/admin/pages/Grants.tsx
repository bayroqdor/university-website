// Grant taqsimoti boshqaruvi: arizalar jadvali (holat, izoh, filtr, Excel), natijalar (Excel'dan yuklash yoki tasdiqlanganlardan
// yasash, ko'rib chiqish, e'lon qilish, PDF qaror), sozlamalar (qabul ochiq/yopiq, muddat, e'lon matni).
import { CheckCircle2, Download, Eye, FileSpreadsheet, Search, Trash2, Upload, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "../../lib/api";
import { ApiError, req } from "../../lib/api";
import { Btn, Card, Empty, Field, ImageField, Input, LangTabs, Modal, PageHead, Pill, Select, Spinner, Textarea, Toggle, useBaseLang, useConfirm, useToast } from "../ui";

type L = Partial<Record<Lang, string>>;
type Group = { title: string; columns: string[]; rows: string[][] };
type Settings = { open: boolean; deadline: string; notice: L; intro: L; published: boolean; results: { title: L; intro: L; groups: Group[]; file: string; updated: string } };
type App = { id: string; full_name: string; course: string; group_name: string; field: string; edu_lang: string; phone: string; email: string; reason: string; status: string; note: string; created: string };
type Data = { settings: Settings; items: App[]; counts: Record<string, number>; total: number };

const STATUS: Record<string, [string, "info" | "warn" | "ok" | "bad"]> = {
  new: ["Yangi", "info"],
  review: ["Ko‘rib chiqilmoqda", "warn"],
  approved: ["Tasdiqlandi", "ok"],
  rejected: ["Rad etildi", "bad"],
};
const COURSE: Record<string, string> = { "1": "1-kurs", "2": "2-kurs", "3": "3-kurs", "4": "4-kurs", master: "Magistratura" };
const LNG: Record<string, string> = { uz: "O‘zbek", ru: "Rus", en: "Ingliz" };
const ERR: Record<string, string> = { bad_xlsx: "Fayl Excel (.xlsx) formatida emas", empty_xlsx: "Faylda jadval topilmadi", no_approved: "Tasdiqlangan ariza yo‘q", file_too_large: "Fayl juda katta" };
const dt = (s: string) => (s ? new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export function GrantsAdminPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const base = useBaseLang() || "uz";
  const [tab, setTab] = useState<"apps" | "results" | "settings">("apps");
  const [d, setD] = useState<Data | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [status, setStatus] = useState("");
  const [course, setCourse] = useState("");
  const [q, setQ] = useState("");
  const [lang, setLang] = useState<Lang>("uz");
  const [open, setOpen] = useState<App | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams({ status, course, q });
    req<Data>("GET", `/api/admin/grants?${p}`)
      .then((r) => {
        setD(r);
        setS((old) => old || r.settings);
      })
      .catch(() => null);
  }, [status, course, q]);
  useEffect(() => {
    const t = window.setTimeout(load, q ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  if (!d || !s) return <Spinner />;
  const err = (e: unknown) => toast(e instanceof ApiError ? ERR[e.detail] || e.detail : String(e), "error");
  const save = async (patch?: Partial<Settings>) => {
    setBusy(true);
    try {
      const r = await req<Settings>("PUT", "/api/admin/grants/settings", { ...s, ...patch });
      setS(r);
      toast("Saqlandi");
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  };
  const upd = async (a: App, patch: Partial<App>) => {
    try {
      const r = await req<App>("PATCH", `/api/admin/grants/apps/${a.id}`, patch);
      setD({ ...d, items: d.items.map((x) => (x.id === a.id ? r : x)) });
      if (open?.id === a.id) setOpen(r);
      if (patch.status) load();
    } catch (e) {
      err(e);
    }
  };
  const del = async (a: App) => {
    if (!(await confirm(`Arizani o‘chirish? ${a.full_name}`))) return;
    await req("DELETE", `/api/admin/grants/apps/${a.id}`);
    setOpen(null);
    load();
  };
  const parse = async (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await req<{ groups: Group[] }>("POST", "/api/admin/grants/results/parse", fd);
      setS({ ...s, results: { ...s.results, groups: r.groups } });
      toast(`${r.groups.reduce((a, g) => a + g.rows.length, 0)} qator o‘qildi — ko‘rib chiqib saqlang`);
    } catch (e) {
      err(e);
    }
  };
  const fromApproved = async () => {
    try {
      const r = await req<{ groups: Group[] }>("POST", "/api/admin/grants/results/from-approved");
      setS({ ...s, results: { ...s.results, groups: r.groups } });
    } catch (e) {
      err(e);
    }
  };
  const res = s.results;
  const filledL = (l: Lang) => !!(s.notice[l] || s.intro[l] || res.title[l] || res.intro[l]);
  const exportUrl = `/api/admin/grants/apps.xlsx?${new URLSearchParams({ status, course })}`;

  return (
    <div className="a-page">
      <PageHead
        title="Grant taqsimoti"
        sub={
          <>
            Saytdagi{" "}
            <a href="/grant-redistribution" target="_blank" rel="noreferrer">
              /grant-redistribution
            </a>{" "}
            sahifasi: arizalar, natijalar va e’lon
          </>
        }
        actions={
          <>
            <Pill tone={s.open ? "ok" : "muted"}>{s.open ? "Qabul ochiq" : "Qabul yopiq"}</Pill>
            <Pill tone={s.published ? "accent" : "muted"}>{s.published ? "Natijalar e’lon qilingan" : "Natijalar e’lon qilinmagan"}</Pill>
          </>
        }
      />
      <div className="a-seg" style={{ marginBottom: 16 }}>
        {[
          ["apps", `Arizalar (${d.total})`],
          ["results", "Natijalar"],
          ["settings", "Sozlamalar"],
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k as typeof tab)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "apps" && (
        <>
          <div className="gA-bar">
            <label className="a-search">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="F.I.Sh., guruh, telefon…" />
            </label>
            <div className="a-seg">
              <button className={!status ? "on" : ""} onClick={() => setStatus("")}>
                Hammasi <small>{d.total}</small>
              </button>
              {Object.entries(STATUS).map(([k, [l]]) => (
                <button key={k} className={status === k ? "on" : ""} onClick={() => setStatus(k)}>
                  {l} <small>{d.counts[k] || 0}</small>
                </button>
              ))}
            </div>
            <div style={{ width: 190 }}>
              <Select value={course} onChange={setCourse} options={[{ value: "", label: "Barcha kurslar" }, ...Object.entries(COURSE).map(([value, label]) => ({ value, label }))]} />
            </div>
            <span style={{ flex: 1 }} />
            <a className="a-btn md" href={exportUrl}>
              <FileSpreadsheet size={15} />
              <span>Excel</span>
            </a>
          </div>
          {!d.items.length ? (
            <Empty icon={<FileSpreadsheet size={28} />} title={q || status || course ? "Hech narsa topilmadi" : "Hali ariza yo‘q"}>
              {!s.open && "Qabul yopiq — «Sozlamalar»da oching."}
            </Empty>
          ) : (
            <Card pad={false}>
              <div className="a-table-scroll">
                <table className="a-table gA-table">
                  <thead>
                    <tr>
                      <th className="n">№</th>
                      <th>F.I.Sh.</th>
                      <th>Kurs</th>
                      <th>Guruh</th>
                      <th>Yo‘nalish</th>
                      <th>Til</th>
                      <th>Telefon</th>
                      <th>Sana</th>
                      <th>Holat</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((a, i) => (
                      <tr key={a.id}>
                        <td className="n">{i + 1}</td>
                        <td>
                          <button className="gA-name" onClick={() => setOpen(a)}>
                            {a.full_name}
                          </button>
                          {a.note && <small className="gA-note">{a.note}</small>}
                        </td>
                        <td>{COURSE[a.course] || a.course}</td>
                        <td>{a.group_name}</td>
                        <td>{a.field}</td>
                        <td>{LNG[a.edu_lang] || a.edu_lang}</td>
                        <td className="gA-nowrap">
                          <a href={`tel:${a.phone}`}>{a.phone}</a>
                        </td>
                        <td className="gA-nowrap">{dt(a.created)}</td>
                        <td>
                          <select className={`gA-st ${a.status}`} value={a.status} onChange={(e) => upd(a, { status: e.target.value })} aria-label="Holat">
                            {Object.entries(STATUS).map(([k, [l]]) => (
                              <option key={k} value={k}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <Btn size="sm" kind="ghost" icon={<Eye size={14} />} onClick={() => setOpen(a)} title="Batafsil" />
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

      {tab === "results" && (
        <>
          <Card
            title="Natijalar jadvali"
            sub="Excel’dan yuklang (har varaq — jadval; faqat birinchi katakchasi to‘la qator, masalan «Bakalavriat (sirtqi)», — bo‘lim sarlavhasi) yoki tasdiqlangan arizalardan avtomatik yasang. Ko‘rib chiqing, keyin saqlang va e’lon qiling."
            actions={
              <>
                <a className="a-btn md ghost" href="/api/admin/grants/results-template.xlsx">
                  <Download size={15} />
                  <span>Namuna</span>
                </a>
                <Btn icon={<Upload size={15} />} onClick={() => file.current?.click()}>
                  Excel yuklash
                </Btn>
                <Btn icon={<Wand2 size={15} />} onClick={fromApproved}>
                  Tasdiqlanganlardan
                </Btn>
              </>
            }
          >
            <input
              ref={file}
              type="file"
              accept=".xlsx"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) parse(f);
                e.target.value = "";
              }}
            />
            <div style={{ margin: "4px 0 14px" }}>
              <LangTabs value={lang} onChange={setLang} base={base} filled={filledL} />
            </div>
            <div className="a-form-grid">
              <Field label="Sarlavha">
                <Input value={res.title[lang] || ""} onChange={(e) => setS({ ...s, results: { ...res, title: { ...res.title, [lang]: e.target.value } } })} placeholder="2025–2026 o‘quv yili grant taqsimoti natijalari" />
              </Field>
              <ImageField value={res.file} onChange={(v) => setS({ ...s, results: { ...res, file: v } })} label="Komissiya qarori (PDF, ixtiyoriy)" accept="pdf" aspect="4 / 1" />
            </div>
            <Field label="Izoh matni" wide>
              <Textarea rows={3} value={res.intro[lang] || ""} onChange={(e) => setS({ ...s, results: { ...res, intro: { ...res.intro, [lang]: e.target.value } } })} />
            </Field>
            {!res.groups.length ? (
              <Empty icon={<FileSpreadsheet size={28} />} title="Jadval hali yuklanmagan" />
            ) : (
              res.groups.map((g, gi) => (
                <div className="gA-group" key={gi}>
                  <div className="gA-group-h">
                    <Input value={g.title} onChange={(e) => setS({ ...s, results: { ...res, groups: res.groups.map((x, k) => (k === gi ? { ...x, title: e.target.value } : x)) } })} placeholder="Bo‘lim nomi" />
                    <Pill tone="muted">{g.rows.length} qator</Pill>
                    <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} title="Bo‘limni olib tashlash" onClick={() => setS({ ...s, results: { ...res, groups: res.groups.filter((_, k) => k !== gi) } })} />
                  </div>
                  <div className="a-table-scroll gA-prev">
                    <table className="a-table">
                      <thead>
                        <tr>
                          {g.columns.map((c, k) => (
                            <th key={k}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.slice(0, 50).map((r, k) => (
                          <tr key={k}>
                            {r.map((c, j) => (
                              <td key={j}>{c}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {g.rows.length > 50 && <p className="a-hint">… yana {g.rows.length - 50} qator</p>}
                </div>
              ))
            )}
            <div className="gA-pub">
              <Toggle checked={s.published} onChange={(v) => setS({ ...s, published: v })} label="Natijalarni saytda e’lon qilish" hint="Yoqilsa — /grant-redistribution sahifasida forma o‘rniga jadval ko‘rinadi, arizalar qabuli yopiladi" />
              <Btn kind="primary" busy={busy} icon={<CheckCircle2 size={15} />} onClick={() => save()}>
                Saqlash
              </Btn>
            </div>
          </Card>
        </>
      )}

      {tab === "settings" && (
        <Card title="Arizalar qabuli">
          <Toggle checked={s.open} onChange={(v) => setS({ ...s, open: v })} label="Arizalar qabul qilinmoqda" hint="O‘chiq bo‘lsa — saytda forma o‘rniga «qabul yopiq» yozuvi. Natijalar e’lon qilingan bo‘lsa qabul yopiq turadi" />
          <div className="a-form-grid" style={{ marginTop: 14 }}>
            <Field label="Oxirgi muddat (ixtiyoriy)" hint="Shu kundan keyin forma avtomatik yopiladi">
              <Input type="date" value={s.deadline} onChange={(e) => setS({ ...s, deadline: e.target.value })} />
            </Field>
          </div>
          <div style={{ margin: "10px 0 14px" }}>
            <LangTabs value={lang} onChange={setLang} base={base} filled={filledL} />
          </div>
          <Field label="Sahifa kirish matni" hint="Bo‘sh qolsa — standart matn" wide>
            <Textarea rows={3} value={s.intro[lang] || ""} onChange={(e) => setS({ ...s, intro: { ...s.intro, [lang]: e.target.value } })} />
          </Field>
          <Field label="«Diqqat!» bloki" hint="Bo‘sh qolsa — standart ogohlantirish" wide>
            <Textarea rows={3} value={s.notice[lang] || ""} onChange={(e) => setS({ ...s, notice: { ...s.notice, [lang]: e.target.value } })} />
          </Field>
          <Btn kind="primary" busy={busy} onClick={() => save()}>
            Saqlash
          </Btn>
        </Card>
      )}

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.full_name || ""}
        width={620}
        footer={
          open && (
            <>
              <Btn kind="danger" icon={<Trash2 size={14} />} onClick={() => del(open)}>
                O‘chirish
              </Btn>
              <span style={{ flex: 1 }} />
              <Btn icon={<X size={14} />} onClick={() => setOpen(null)}>
                Yopish
              </Btn>
            </>
          )
        }
      >
        {open && (
          <div className="gA-det">
            <dl>
              <dt>Kurs</dt>
              <dd>{COURSE[open.course]}</dd>
              <dt>Guruh</dt>
              <dd>{open.group_name}</dd>
              <dt>Yo‘nalish</dt>
              <dd>{open.field}</dd>
              <dt>Ta’lim tili</dt>
              <dd>{LNG[open.edu_lang]}</dd>
              <dt>Telefon</dt>
              <dd>
                <a href={`tel:${open.phone}`}>{open.phone}</a>
              </dd>
              {open.email && (
                <>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${open.email}`}>{open.email}</a>
                  </dd>
                </>
              )}
              <dt>Yuborilgan</dt>
              <dd>{dt(open.created)}</dd>
            </dl>
            <h4>Grant kerak bo‘lish sababi</h4>
            <p className="gA-reason">{open.reason}</p>
            <Field label="Holat">
              <Select value={open.status} onChange={(v) => upd(open, { status: v })} options={Object.entries(STATUS).map(([value, [label]]) => ({ value, label }))} />
            </Field>
            <Field label="Komissiya izohi" wide>
              <Textarea rows={3} defaultValue={open.note || ""} onBlur={(e) => e.target.value !== (open.note || "") && upd(open, { note: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
