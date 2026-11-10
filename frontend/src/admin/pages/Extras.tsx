// Admin: ko'p so'raladigan savollar, kafedra xodimlari (mudir), HEMIS integratsiyasi, fayl saqlash (S3), SEO
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Gauge, Info, Send, XCircle, Cloud, Crown, Database, ExternalLink, HelpCircle, KeyRound, Landmark, Plus, RefreshCw, Search, Server, Trash2, Upload, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Item, Lang, SiteSettings } from "../../lib/api";
import { Avatar } from "../../lib/Avatar";
import { admin, errMsg, type FacultyOverview, type FacultyPerson, type HemisConfig, type HemisStatus, type S3Config, type StorageInfo, type TelegramInfo, type TelegramSpeed, type TgKind } from "../api";
import { Btn, Card, Empty, Field, Input, LangTabs, Modal, PageHead, Pill, Select, Spinner, Textarea, Toggle, fmtDateTime, useBaseLang, useConfirm, useRun, useToast } from "../ui";

const LANGS: Lang[] = ["uz", "ru", "en"];

/* ================================================================== FAQ */
type Faq = Item & { answer?: string; category?: string; i18n?: Record<string, { title?: string; answer?: string }> };
const FAQ_CATS = [
  { value: "admission", label: "Qabul" },
  { value: "study", label: "O‘qish" },
  { value: "tuition", label: "Kontrakt va to‘lov" },
  { value: "intl", label: "Xalqaro hamkorlik va xorijiy talabalar" },
  { value: "campus", label: "Kampus va yotoqxona" },
  { value: "other", label: "Boshqa" },
];

export function FaqAdminPage() {
  const run = useRun();
  const confirm = useConfirm();
  const toast = useToast();
  const base = useBaseLang() || "uz";
  const [items, setItems] = useState<Faq[] | null>(null);
  const [edit, setEdit] = useState<Faq | null>(null);
  const [lang, setLang] = useState<Lang>("uz");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const load = useCallback(() => admin.items<Faq>("faq").then((r) => setItems(r.items.sort((a, b) => a.sort - b.sort))).catch(() => setItems([])), []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => setLang(base), [base, edit?.id]);
  const shown = (items || []).filter((x) => !q || x.title.toLowerCase().includes(q.toLowerCase()) || (x.answer || "").toLowerCase().includes(q.toLowerCase()));
  const tr = (l: Lang): { title?: string; answer?: string } => (l === base ? { title: edit?.title, answer: edit?.answer } : edit?.i18n?.[l] || {});
  const setTr = (l: Lang, patch: { title?: string; answer?: string }) => {
    if (!edit) return;
    if (l === base) setEdit({ ...edit, ...patch });
    else setEdit({ ...edit, i18n: { ...(edit.i18n || {}), [l]: { ...(edit.i18n?.[l] || {}), ...patch } } });
  };
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      const body = { title: edit.title, answer: edit.answer || "", category: edit.category || "other", status: edit.status || "published", sort: edit.sort ?? (items?.length || 0), i18n: edit.i18n || {} };
      if (edit.id) await admin.update("faq", edit.id, body);
      else await admin.create("faq", body);
      toast("Saqlandi");
      setEdit(null);
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setBusy(false);
  };
  const move = async (i: number, d: number) => {
    if (!items) return;
    const arr = [...items];
    const [x] = arr.splice(i, 1);
    arr.splice(i + d, 0, x);
    setItems(arr);
    await run(() => admin.reorder("faq", arr.map((y) => y.id)));
  };
  return (
    <div className="a-page">
      <PageHead
        title="Ko‘p so‘raladigan savollar"
        sub="Aloqa sahifasidagi FAQ bloki: savol va javoblar 3 tilda, kategoriyalar bo‘yicha. Qidiruv tizimlari uchun FAQPage ma’lumotlari avtomatik qo‘shiladi."
        actions={
          <Btn kind="primary" icon={<Plus size={15} />} onClick={() => setEdit({ title: "", answer: "", category: "admission", status: "published" } as unknown as Faq)}>
            Savol qo‘shish
          </Btn>
        }
      />
      <div className="a-toolbar">
        <div className="a-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Savol yoki javob bo‘yicha qidirish…" />
        </div>
      </div>
      {!items ? (
        <Spinner />
      ) : !shown.length ? (
        <Empty icon={<HelpCircle size={26} />} title="Savollar yo‘q">
          «Savol qo‘shish» tugmasi bilan birinchi savolni yozing.
        </Empty>
      ) : (
        <div className="faq-admin">
          {shown.map((x, i) => (
            <div key={x.id} className={`faq-row ${x.status !== "published" ? "off" : ""}`}>
              <div className="faq-row-ord">
                <button className="a-icon" disabled={i === 0 || !!q} onClick={() => move(i, -1)} aria-label="Yuqoriga">
                  <ArrowUp size={14} />
                </button>
                <button className="a-icon" disabled={i === shown.length - 1 || !!q} onClick={() => move(i, 1)} aria-label="Pastga">
                  <ArrowDown size={14} />
                </button>
              </div>
              <button className="faq-row-body" onClick={() => setEdit(x)}>
                <b>{x.title}</b>
                <small>{(x.answer || "").slice(0, 160)}</small>
                <span className="faq-row-meta">
                  <Pill tone="accent">{FAQ_CATS.find((c) => c.value === x.category)?.label || x.category}</Pill>
                  {LANGS.filter((l) => l !== base && x.i18n?.[l]?.title).map((l) => (
                    <Pill key={l}>{l.toUpperCase()}</Pill>
                  ))}
                  {x.status !== "published" && <Pill tone="warn">yashirin</Pill>}
                </span>
              </button>
              <button
                className="a-icon danger"
                aria-label="O‘chirish"
                onClick={async () => {
                  if (await confirm(`«${x.title}» o‘chirilsinmi?`)) {
                    await run(() => admin.remove("faq", x.id), "O‘chirildi");
                    load();
                  }
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Savolni tahrirlash" : "Yangi savol"}
        width={680}
        footer={
          <>
            <Btn kind="ghost" onClick={() => setEdit(null)}>
              Bekor qilish
            </Btn>
            <Btn kind="primary" busy={busy} disabled={!edit?.title?.trim()} onClick={save}>
              Saqlash
            </Btn>
          </>
        }
      >
        {edit && (
          <>
            <LangTabs value={lang} onChange={setLang} base={base} filled={(l) => !!tr(l).title} />
            <Field label={`Savol (${lang.toUpperCase()})`}>
              <Input value={tr(lang).title || ""} onChange={(e) => setTr(lang, { title: e.target.value })} placeholder={lang === base ? "Masalan: Qanday qilib o‘qishga topshiraman?" : edit.title} />
            </Field>
            <Field label={`Javob (${lang.toUpperCase()})`}>
              <Textarea rows={6} value={tr(lang).answer || ""} onChange={(e) => setTr(lang, { answer: e.target.value })} placeholder={lang === base ? "" : edit.answer} />
            </Field>
            <div className="a-grid2">
              <Field label="Kategoriya">
                <Select value={edit.category || "other"} onChange={(v) => setEdit({ ...edit, category: v })} options={FAQ_CATS} />
              </Field>
              <Field label="Holat">
                <Select value={edit.status || "published"} onChange={(v) => setEdit({ ...edit, status: v })} options={[{ value: "published", label: "Saytda ko‘rinadi" }, { value: "draft", label: "Yashirin" }]} />
              </Field>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

/* ================================================================== kafedra xodimlari */
export function FacultyStaffPage() {
  const toast = useToast();
  const [facs, setFacs] = useState<FacultyOverview[] | null>(null);
  const [sel, setSel] = useState<string>("");
  const [people, setPeople] = useState<FacultyPerson[] | null>(null);
  const [q, setQ] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const loadFacs = useCallback(
    () =>
      admin
        .facultyStaff()
        .then((r) => {
          setFacs(r.items);
          setSel((s) => s || r.items[0]?.id || "");
        })
        .catch(() => setFacs([])),
    [],
  );
  useEffect(() => {
    loadFacs();
  }, [loadFacs]);
  useEffect(() => {
    if (!sel) return;
    setPeople(null);
    setDirty(false);
    admin
      .facultyPeople(sel)
      .then((r) => setPeople(r.items))
      .catch(() => setPeople([]));
  }, [sel]);
  const fac = facs?.find((f) => f.id === sel);
  const upd = (id: string, p: Partial<FacultyPerson>) => {
    if (!people) return;
    setPeople(
      people.map((x) => {
        if (p.dean && x.id !== id) return { ...x, dean: false };
        if (x.id !== id) return x;
        const n = { ...x, ...p };
        if (p.member === false) Object.assign(n, { editor: false, dean: false });
        if (p.editor || p.dean) n.member = true;
        return n;
      }),
    );
    setDirty(true);
  };
  const members = (people || []).filter((x) => x.member);
  const others = (people || []).filter((x) => !x.member && q && x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  const save = async () => {
    if (!people) return;
    setBusy(true);
    try {
      const dean = people.find((x) => x.dean)?.id || "";
      const r = await admin.saveFacultyPeople(sel, members.map((x) => x.id), people.filter((x) => x.editor).map((x) => x.id), dean);
      setPeople(r.items);
      setDirty(false);
      toast("Kafedra xodimlari saqlandi");
      loadFacs();
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setBusy(false);
  };
  const Row = ({ x }: { x: FacultyPerson }) => (
    <div className={`fs-row ${x.member ? "on" : ""} ${x.dean ? "dean" : ""}`}>
      <Avatar name={x.name} photo={x.photo} size={38} />
      <div className="fs-who">
        <b>{x.name}</b>
        <small>
          {x.position || x.login}
          {x.role === "staff" ? " · xodim" : ""}
          {!x.staff_id ? " · saytda profili yo‘q" : ""}
        </small>
      </div>
      {x.member ? (
        <>
          <button className={`fs-tag ${x.dean ? "on" : ""}`} disabled={!x.staff_id} title={x.staff_id ? "Kafedra mudiri" : "Kafedra mudiri uchun saytda professor profili kerak"} onClick={() => upd(x.id, { dean: !x.dean })}>
            <Crown size={14} /> Mudir
          </button>
          <button className={`fs-tag ${x.editor ? "on" : ""}`} title="Kafedra sahifasini kabinetdan tahrirlay oladi" onClick={() => upd(x.id, { editor: !x.editor })}>
            ✎ Tahrirlash
          </button>
          <button className="a-icon danger" aria-label="Kafedradan chiqarish" onClick={() => upd(x.id, { member: false })}>
            <Trash2 size={14} />
          </button>
        </>
      ) : (
        <Btn size="sm" icon={<Plus size={14} />} onClick={() => upd(x.id, { member: true })}>
          Biriktirish
        </Btn>
      )}
    </div>
  );
  return (
    <div className="a-page">
      <PageHead title="Kafedra xodimlari" sub="Professor-o‘qituvchi va xodimlarni kafedraga biriktiring, kafedra mudirini belgilang. Saytda kafedra sahifasida avval mudir, so‘ng professor-o‘qituvchilar chiqadi." />
      {!facs ? (
        <Spinner />
      ) : !facs.length ? (
        <Empty icon={<Landmark size={26} />} title="Kafedralar yo‘q" />
      ) : (
        <div className="fs-layout">
          <div className="fs-facs">
            {facs.map((f) => (
              <button key={f.id} className={`fs-fac ${f.id === sel ? "on" : ""}`} style={{ ["--fc" as string]: f.accent || "var(--accent)" }} onClick={() => setSel(f.id)}>
                <b>{f.title}</b>
                <small>
                  <UsersRound size={12} /> {f.members} ta {f.dean ? `· mudir: ${f.dean}` : "· mudir belgilanmagan"}
                </small>
              </button>
            ))}
          </div>
          <Card
            title={fac?.title}
            sub={`${members.length} ta xodim biriktirilgan`}
            actions={
              <>
                {fac?.slug && (
                  <a className="a-btn ghost sm" href={`/faculties/${fac.slug}#professors`} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} /> Saytda
                  </a>
                )}
                <Btn kind="primary" size="sm" disabled={!dirty} busy={busy} onClick={save}>
                  Saqlash
                </Btn>
              </>
            }
          >
            {!people ? (
              <Spinner />
            ) : (
              <>
                <div className="fs-list">
                  {[...members].sort((a, b) => Number(!!b.dean) - Number(!!a.dean)).map((x) => (
                    <Row key={x.id} x={x} />
                  ))}
                  {!members.length && <p className="a-hint">Hali hech kim biriktirilmagan — pastdan qidirib qo‘shing.</p>}
                </div>
                <div className="fs-add">
                  <div className="a-search">
                    <Search size={15} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Xodim qo‘shish: ism bo‘yicha qidiring…" />
                  </div>
                  <div className="fs-list">
                    {others.map((x) => (
                      <Row key={x.id} x={x} />
                    ))}
                    {q && !others.length && <p className="a-hint">Topilmadi. Yangi xodim «Foydalanuvchilar» bo‘limida qo‘shiladi.</p>}
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

/* ================================================================== HEMIS */
export function HemisPage() {
  const toast = useToast();
  const run = useRun();
  const [cfg, setCfg] = useState<HemisConfig | null>(null);
  const [status, setStatus] = useState<HemisStatus | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(
    () =>
      admin
        .hemis()
        .then((r) => {
          setCfg(r.config);
          setStatus(r.status);
        })
        .catch((e) => toast(errMsg(e), "error")),
    [toast],
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!status?.running) return;
    const t = setInterval(() => admin.hemisStatus().then(setStatus).catch(() => null), 2500);
    return () => clearInterval(t);
  }, [status?.running]);
  if (!cfg) return <Spinner />;
  const set = (p: Partial<HemisConfig>) => setCfg({ ...cfg, ...p });
  const body = { ...cfg, ...(token ? { token } : {}) };
  const last = status?.last;
  return (
    <div className="a-page">
      <PageHead
        title="HEMIS integratsiyasi"
        sub="Oliy ta’lim jarayonlarini boshqarish axborot tizimi (HEMIS) bilan bog‘lanish: o‘qituvchilar, guruhlar va talabalar sinxronlanadi; talaba kabinetida HEMIS’dagi GPA, davomat, baholar va jadval ko‘rinadi."
        actions={<Pill tone={cfg.enabled ? "ok" : "muted"}>{cfg.enabled ? "Yoqilgan" : "O‘chiq"}</Pill>}
      />
      <div className="a-grid2 top">
        <Card title="Ulanish" sub="HEMIS admin panelida bir hisobga «API User» roli bering va tokenini shu yerga kiriting">
          <Toggle checked={cfg.enabled} onChange={(v) => set({ enabled: v })} label="HEMIS integratsiyasini yoqish" />
          <Field label="HEMIS API manzili" hint="institutning HEMIS talaba portali: https://student.<otm>.uz (so‘rovlar …/rest/v1/ ga yuboriladi)">
            <Input value={cfg.api_url} placeholder="https://student.example.edu" onChange={(e) => set({ api_url: e.target.value })} />
          </Field>
          <Field label="API token (Bearer)" hint={cfg.has_token ? "token saqlangan — o‘zgartirish uchun yangisini kiriting" : "HEMIS → Tizim → Foydalanuvchilar → «API User» → token"}>
            <Input type="password" value={token} placeholder={cfg.has_token ? "••••••••••••" : "token"} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="HEMIS havolasi (saytda)" hint="menyudagi va «Talabalar uchun» dagi «HEMIS» tugmasi shu manzilga olib boradi">
            <Input value={cfg.portal_url} placeholder="https://student.example.edu" onChange={(e) => set({ portal_url: e.target.value })} />
          </Field>
          <Field label="Ma’lumotlar tili">
            <Select value={cfg.lang || "uz"} onChange={(v) => set({ lang: v })} options={[{ value: "uz", label: "O‘zbekcha (uz-UZ)" }, { value: "ru", label: "Русский (ru-RU)" }, { value: "en", label: "English (en-US)" }]} />
          </Field>
          <div className="a-row">
            <Btn
              busy={busy === "test"}
              icon={<CheckCircle2 size={15} />}
              onClick={async () => {
                setBusy("test");
                const r = await run(() => admin.testHemis(body));
                if (r) toast(`Ulanish ishlayapti — HEMIS’da ${r.departments} ta bo‘linma`);
                setBusy("");
              }}
            >
              Ulanishni tekshirish
            </Btn>
            <Btn
              kind="primary"
              busy={busy === "save"}
              onClick={async () => {
                setBusy("save");
                const r = await run(() => admin.saveHemis(body), "Saqlandi");
                if (r) {
                  setCfg(r.config);
                  setStatus(r.status);
                  setToken("");
                }
                setBusy("");
              }}
            >
              Saqlash
            </Btn>
          </div>
        </Card>
        <Card title="Sinxronlash" sub="HEMIS’dagi ma’lumotlar saytga ko‘chiriladi; mavjud hisoblar HEMIS id yoki ism / ID raqam bo‘yicha moslashtiriladi, parollar o‘zgarmaydi">
          <Toggle checked={cfg.sync_groups} onChange={(v) => set({ sync_groups: v })} label="Guruhlar" hint="data/group-list" />
          <Toggle checked={cfg.sync_teachers} onChange={(v) => set({ sync_teachers: v })} label="Professor-o‘qituvchilar" hint="data/employee-list?type=teacher — lavozim, kafedra, ilmiy daraja" />
          <Toggle checked={cfg.sync_students} onChange={(v) => set({ sync_students: v })} label="Talabalar" hint="data/student-list — login = talaba ID raqami, guruh, yo‘nalish, kurs, to‘lov shakli" />
          <Toggle checked={cfg.sync_schedule} onChange={(v) => set({ sync_schedule: v })} label="Dars jadvali" hint="data/schedule-list — joriy semestr jadvaliga haftalik andoza sifatida yoziladi (fan, juftlik, xona, o‘qituvchi, toq/juft hafta); qo‘lda kiritilgan darslar saqlanadi" />
          {cfg.sync_schedule && (
            <Field label="Jadval uchun olinadigan haftalar" hint="joriy haftadan boshlab; 2 va undan ko‘p — toq/juft haftalar aniqlanadi">
              <Select value={String(cfg.schedule_weeks || 2)} onChange={(v) => set({ schedule_weeks: Number(v) })} options={[1, 2, 4, 8].map((n) => ({ value: String(n), label: `${n} hafta` }))} />
            </Field>
          )}
          <Toggle checked={cfg.student_auth} onChange={(v) => set({ student_auth: v })} label="Talabalar kabinetga HEMIS paroli bilan kira oladi" hint="sayt paroli mos kelmasa HEMIS auth/login orqali tekshiriladi; birinchi kirishda hisob yaratiladi" />
          <div className="a-grid2">
            <Field label="Avtomatik sinxronlash" hint="0 — faqat qo‘lda">
              <Select value={String(cfg.auto_hours || 0)} onChange={(v) => set({ auto_hours: Number(v) })} options={[{ value: "0", label: "O‘chiq" }, { value: "6", label: "har 6 soatda" }, { value: "12", label: "har 12 soatda" }, { value: "24", label: "har kuni" }, { value: "168", label: "har hafta" }]} />
            </Field>
            <Field label="Kabinet keshi" hint="talaba ma’lumotlari qancha saqlanadi">
              <Select value={String(cfg.cache_minutes || 60)} onChange={(v) => set({ cache_minutes: Number(v) })} options={[{ value: "15", label: "15 daqiqa" }, { value: "60", label: "1 soat" }, { value: "360", label: "6 soat" }, { value: "1440", label: "1 kun" }]} />
            </Field>
          </div>
          <div className="hemis-stats">
            <div>
              <b>{status?.linked.teacher ?? 0}</b>
              <small>o‘qituvchi HEMIS bilan bog‘langan</small>
            </div>
            <div>
              <b>{status?.linked.student ?? 0}</b>
              <small>talaba</small>
            </div>
            <div>
              <b>{status?.groups ?? 0}</b>
              <small>guruh</small>
            </div>
          </div>
          {last && (
            <div className="hemis-last">
              <small>Oxirgi sinxronlash: {last.finished ? fmtDateTime(last.finished) : "—"}</small>
              {last.groups && (
                <small>
                  Guruhlar +{last.groups[0]} / yangilandi {last.groups[1]} · O‘qituvchilar +{last.teachers?.[0] ?? 0} / {last.teachers?.[1] ?? 0} · Talabalar +{last.students?.[0] ?? 0} / {last.students?.[1] ?? 0}{last.schedule ? ` · Jadval: ${last.schedule[0]} dars` : ""}
                </small>
              )}
              {!!last.errors?.length && <small className="bad">{last.errors.join("; ")}</small>}
            </div>
          )}
          <Btn
            kind="accent"
            icon={<RefreshCw size={15} className={status?.running ? "spin" : ""} />}
            busy={status?.running}
            disabled={!cfg.enabled}
            onClick={async () => {
              const r = await run(() => admin.syncHemis());
              if (r) {
                setStatus({ ...r.status, running: true });
                toast(r.started ? "Sinxronlash boshlandi" : "Sinxronlash allaqachon ketmoqda");
              }
            }}
          >
            {status?.running ? `Sinxronlanmoqda${status.state?.step ? `: ${status.state.step}` : "…"}` : "Hozir sinxronlash"}
          </Btn>
        </Card>
      </div>
      <Card title="Talaba kabinetida" sub="HEMIS bilan bog‘langan talaba «Profil» sahifasida «HEMIS» bo‘limini ko‘radi">
        <ul className="a-checks">
          <li>Shaxsiy ma’lumotlar: fakultet, yo‘nalish, guruh, kurs, semestr, ta’lim shakli, to‘lov shakli, holati</li>
          <li>GPA (o‘quv yillari bo‘yicha), kreditlar va qarzdor fanlar</li>
          <li>Davomat: fanlar kesimida sababli / sababsiz qoldirilgan soatlar, oxirgi darslar</li>
          <li>Joriy baholar va imtihon natijalari (oraliq, yakuniy)</li>
          <li>Haftalik dars jadvali (HEMIS’dagi rasmiy jadval); o‘qituvchilar — o‘z haftalik jadvali</li>
        </ul>
      </Card>
    </div>
  );
}

/* ================================================================== S3 */
export function StoragePage() {
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [cfg, setCfg] = useState<S3Config | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(
    () =>
      admin
        .storage()
        .then((r) => {
          setInfo(r);
          setCfg(r.config);
        })
        .catch((e) => toast(errMsg(e), "error")),
    [toast],
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!info?.migration?.running) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [info?.migration?.running, load]);
  if (!cfg || !info) return <Spinner />;
  const set = (p: Partial<S3Config>) => setCfg({ ...cfg, ...p });
  const body = { ...cfg, ...(secret ? { secret_key: secret } : {}) };
  const m = info.migration || {};
  return (
    <div className="a-page">
      <PageHead
        title="Fayl saqlash (S3)"
        sub="Rasmlar, hujjatlar, profil suratlari, topshiriq fayllari va rezyumelar S3 ga mos omborda saqlanadi: AWS S3, MinIO, Cloudflare R2, Yandex Object Storage, DigitalOcean Spaces va boshqalar."
        actions={<Pill tone={cfg.enabled ? "ok" : "muted"}>{cfg.enabled ? "S3 yoqilgan" : "Lokal disk"}</Pill>}
      />
      <div className="a-grid2 top">
        <Card title="S3 ulanishi">
          <Toggle checked={cfg.enabled} onChange={(v) => set({ enabled: v })} label="Yangi fayllarni S3 ga saqlash" hint="saytdagi havolalar o‘zgarmaydi (/media/…), server S3 dagi nusxaga yo‘naltiradi" />
          <Field label="Endpoint" hint="masalan: https://s3.amazonaws.com, https://<account>.r2.cloudflarestorage.com, https://storage.yandexcloud.net, http://minio:9000">
            <Input value={cfg.endpoint} placeholder="https://s3.amazonaws.com" onChange={(e) => set({ endpoint: e.target.value })} />
          </Field>
          <div className="a-grid2">
            <Field label="Bucket">
              <Input value={cfg.bucket} placeholder="university-media" onChange={(e) => set({ bucket: e.target.value })} />
            </Field>
            <Field label="Region">
              <Input value={cfg.region} placeholder="us-east-1" onChange={(e) => set({ region: e.target.value })} />
            </Field>
          </div>
          <div className="a-grid2">
            <Field label="Access key">
              <Input value={cfg.access_key} onChange={(e) => set({ access_key: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Secret key" hint={cfg.has_secret ? "saqlangan — o‘zgartirish uchun yangisini kiriting" : undefined}>
              <Input type="password" value={secret} placeholder={cfg.has_secret ? "••••••••" : ""} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
          <div className="a-grid2">
            <Field label="Kalit prefiksi" hint="bucket ichidagi papka">
              <Input value={cfg.prefix} placeholder="university/" onChange={(e) => set({ prefix: e.target.value })} />
            </Field>
            <Field label="Ochiq manzil (CDN)" hint="bo‘sh bo‘lsa — imzolangan vaqtinchalik havola">
              <Input value={cfg.public_url} placeholder="https://cdn.example.edu" onChange={(e) => set({ public_url: e.target.value })} />
            </Field>
          </div>
          <Toggle checked={cfg.path_style} onChange={(v) => set({ path_style: v })} label="Path-style manzillar" hint="MinIO va ko‘pchilik S3-mos xizmatlar uchun yoqiq qoldiring" />
          <Toggle checked={cfg.keep_local} onChange={(v) => set({ keep_local: v })} label="Lokal nusxani ham saqlash" hint="zaxira sifatida diskda ham qoladi" />
          <div className="a-row">
            <Btn
              busy={busy === "test"}
              icon={<CheckCircle2 size={15} />}
              onClick={async () => {
                setBusy("test");
                const r = await run(() => admin.testStorage(body));
                if (r) toast(`S3 ishlayapti: «${r.bucket}» ga yozildi va o‘qildi`);
                setBusy("");
              }}
            >
              Ulanishni tekshirish
            </Btn>
            <Btn
              kind="primary"
              busy={busy === "save"}
              onClick={async () => {
                setBusy("save");
                const r = await run(() => admin.saveStorage(body), "Saqlandi");
                if (r) {
                  setInfo(r);
                  setCfg(r.config);
                  setSecret("");
                }
                setBusy("");
              }}
            >
              Saqlash
            </Btn>
          </div>
        </Card>
        <Card title="Mavjud fayllar" sub="avval yuklangan fayllarni S3 ga ko‘chirish">
          <div className="hemis-stats">
            <div>
              <b>{info.media.total}</b>
              <small>media fayl</small>
            </div>
            <div>
              <b>{info.media.local}</b>
              <small>lokal diskda</small>
            </div>
            <div>
              <b>{Math.max(0, info.media.total - info.media.local)}</b>
              <small>S3 da</small>
            </div>
          </div>
          {m.total ? (
            <div className="s3-progress">
              <div style={{ width: `${Math.round((100 * (m.done || 0)) / Math.max(1, m.total))}%` }} />
              <small>
                {m.running ? "Ko‘chirilmoqda" : "Tugadi"}: {m.done || 0} / {m.total}
                {m.failed ? ` · xato: ${m.failed} (${m.error})` : ""}
              </small>
            </div>
          ) : null}
          <Btn
            kind="accent"
            icon={<Upload size={15} />}
            disabled={!cfg.enabled || !info.media.local || m.running}
            busy={m.running}
            onClick={async () => {
              if (!(await confirm(`${info.media.local} ta faylni S3 ga ko‘chirish boshlansinmi?${cfg.keep_local ? "" : " Ko‘chirilgach lokal nusxalar o‘chiriladi."}`, false))) return;
              const r = await run(() => admin.migrateStorage());
              if (r) load();
            }}
          >
            Lokal fayllarni S3 ga ko‘chirish
          </Btn>
          <ul className="a-checks">
            <li>
              <Cloud size={14} /> Rasmlar va hujjatlar — S3 dagi <code>media/</code>
            </li>
            <li>
              <KeyRound size={14} /> Rezyumelar (yopiq) — <code>private/</code>, faqat administrator imzolangan havola bilan ochadi
            </li>
            <li>
              <Server size={14} /> S3 o‘chirilsa, yangi fayllar yana diskka yoziladi
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ================================================================== SEO */
export function SeoPage() {
  const run = useRun();
  const base = useBaseLang() || "uz";
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [lang, setLang] = useState<Lang>("uz");
  useEffect(() => {
    admin.site().then(setSite).catch(() => null);
  }, []);
  useEffect(() => setLang(base), [base]);
  const seo = useMemo(() => (site?.seo as SeoCfg | undefined) || { title: {}, keywords: {}, verify: {}, indexnow: true }, [site]);
  if (!site) return <Spinner />;
  const setSeo = (p: Partial<SeoCfg>) => setSite({ ...site, seo: { ...seo, ...p } });
  const origin = window.location.origin;
  return (
    <div className="a-page">
      <PageHead
        title="SEO va qidiruv tizimlari"
        sub="Google, Yandex, Bing: bosh sahifa sarlavhasi, kalit so‘zlar (har tilda), sayt egaligini tasdiqlash va yangi sahifalarni darhol xabar qilish (IndexNow)."
        actions={
          <Btn kind="primary" onClick={() => run(() => admin.saveSite({ seo } as Partial<SiteSettings>), "Saqlandi")}>
            Saqlash
          </Btn>
        }
      />
      <div className="a-grid2 top">
        <Card title="Bosh sahifa va kalit so‘zlar" sub="bo‘sh qoldirilsa — standart: «{abbr} — {name} | Qabul {yil}»">
          <LangTabs value={lang} onChange={setLang} base={base} filled={(l) => !!seo.title?.[l] || !!seo.keywords?.[l]?.length} />
          <Field label={`Bosh sahifa sarlavhasi (${lang.toUpperCase()})`} hint="{abbr}, {name}, {year} — avtomatik qo‘yiladi; 60–70 belgi tavsiya etiladi">
            <Input value={seo.title?.[lang] || ""} placeholder="{abbr} — {name} | Qabul {year}" onChange={(e) => setSeo({ title: { ...seo.title, [lang]: e.target.value } })} />
          </Field>
          <Field label={`Qo‘shimcha kalit so‘zlar (${lang.toUpperCase()})`} hint="vergul bilan; asosiylari (ta’lim dasturlari, qabul, fakultetlar…) avtomatik qo‘shiladi">
            <Textarea rows={4} value={(seo.keywords?.[lang] || []).join(", ")} onChange={(e) => setSeo({ keywords: { ...seo.keywords, [lang]: e.target.value.split(",").map((x) => x.trim()) } })} />
          </Field>
        </Card>
        <Card title="Qidiruv tizimlarida tasdiqlash" sub="Search Console / Webmaster panellaridagi «HTML meta teg» usuli: faqat content qiymatini kiriting">
          {(
            [
              ["google", "Google Search Console", "google-site-verification"],
              ["yandex", "Yandex Webmaster", "yandex-verification"],
              ["bing", "Bing Webmaster Tools", "msvalidate.01"],
            ] as const
          ).map(([k, label, meta]) => (
            <Field key={k} label={label} hint={<span className="mono">{`<meta name="${meta}" content="…">`}</span>}>
              <Input value={seo.verify?.[k] || ""} onChange={(e) => setSeo({ verify: { ...seo.verify, [k]: e.target.value.trim() } })} />
            </Field>
          ))}
          <Toggle checked={seo.indexnow !== false} onChange={(v) => setSeo({ indexnow: v })} label="IndexNow" hint="yangilik, e’lon, vakansiya nashr qilinganda Bing va Yandex darhol xabardor qilinadi" />
        </Card>
      </div>
      <Card
        title="Boshqa nomlar va avvalgi sayt"
        sub="Boshqa nomlar yoki qisqartmalar bilan qidirganlarga ham shu sayt chiqishi uchun: Schema.org alternateName / sameAs, kalit so‘zlar va futerdagi yozuv."
      >
        <div className="a-grid2">
          <Field label="Institutning boshqa nomlari" hint="vergul bilan">
            <Textarea rows={3} value={(seo.alt_names ?? DEFAULT_ALT).join(", ")} onChange={(e) => setSeo({ alt_names: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
          </Field>
          <Field label="Avvalgi domenlar (301 yo‘naltirish)" hint="DNS shu serverga yo‘naltirilsa, eski manzildagi har bir sahifa yangi saytdagi mos sahifaga 301 bilan o‘tadi (Sayt sozlamalarida sayt manzili ko‘rsatilgan bo‘lishi kerak)">
            <Textarea rows={3} value={(seo.old_domains ?? DEFAULT_OLD).join(", ")} onChange={(e) => setSeo({ old_domains: e.target.value.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean) })} />
          </Field>
        </div>
        <ul className="a-checks">
          <li>Google Search Console’da eski domen uchun «Manzilni o‘zgartirish» (Change of address) vositasidan foydalaning — reyting yangi saytga tezroq o‘tadi.</li>
        </ul>
      </Card>
      <Card title="Avtomatik qilinadiganlar">
        <ul className="a-checks">
          <li>Har sahifada sarlavha, tavsif, canonical, 3 til uchun hreflang, Open Graph va Twitter kartalari</li>
          <li>
            Schema.org (JSON-LD): CollegeOrUniversity, WebSite, BreadcrumbList, EducationalOccupationalProgram (kontrakt narxi — Offer), ItemList, NewsArticle, EducationEvent, Person, JobPosting, FAQPage
          </li>
          <li>Kalit so‘zlar va tuzilgan meta ma’lumotlar — har tilda alohida</li>
          <li>JavaScript bajarmaydigan botlar uchun sahifa matni va ichki havolalar</li>
          <li>
            <a href={`${origin}/sitemap.xml`} target="_blank" rel="noreferrer">
              sitemap.xml <ExternalLink size={12} />
            </a>{" "}
            (tillar, rasmlar, prioritet), <a href={`${origin}/robots.txt`} target="_blank" rel="noreferrer">robots.txt</a>,{" "}
            <a href={`${origin}/rss.xml`} target="_blank" rel="noreferrer">RSS</a>
          </li>
          <li>
            <Database size={14} /> Sitemap manzilini Google Search Console va Yandex Webmaster’ga bir marta qo‘shing
          </li>
        </ul>
      </Card>
    </div>
  );
}
type SeoCfg = {
  title: Partial<Record<Lang, string>>;
  keywords: Partial<Record<Lang, string[]>>;
  verify: Partial<Record<"google" | "yandex" | "bing", string>>;
  indexnow: boolean;
  alt_names?: string[];
  old_domains?: string[];
};
// backend seo.DEFAULT_ALT_NAMES / DEFAULT_OLD_DOMAINS bilan bir xil
const DEFAULT_ALT: string[] = [];
const DEFAULT_OLD: string[] = [];

/* ================================================================== Telegram bot */
export function TelegramPage() {
  const run = useRun();
  const toast = useToast();
  const [info, setInfo] = useState<TelegramInfo | null>(null);
  const [token, setToken] = useState("");
  const [cfg, setCfg] = useState<TelegramInfo["config"] | null>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    admin
      .telegram()
      .then((r) => {
        setInfo(r);
        setCfg(r.config);
      })
      .catch((e) => toast(errMsg(e), "error"));
  }, [toast]);
  if (!info || !cfg) return <Spinner />;
  return (
    <div className="a-page">
      <PageHead
        title="Telegram bot"
        sub="Saytdagi «Aloqa → Telegram bot» shu botga olib boradi. Bot /start bosilganda tilni, ism, telefon, email, bo‘lim va savolni inline tugmalar bilan so‘raydi — murojaat «Murojaatlar»ga tushadi, javob shu botga qaytadi."
        actions={<Pill tone={cfg.enabled && info.running ? "ok" : "muted"}>{cfg.enabled ? (info.running ? "Ishlayapti" : "Yoqilgan") : "O‘chiq"}</Pill>}
      />
      <div className="a-grid2 top">
        <Card title="Ulanish" sub="@BotFather → /newbot → bot nomi va username → token">
          <Toggle checked={cfg.enabled} onChange={(v) => setCfg({ ...cfg, enabled: v })} label="Botni yoqish" />
          <Field label="Bot tokeni" hint={info.config.has_token ? "saqlangan — o‘zgartirish uchun yangisini kiriting" : "masalan: 123456789:AAH…"}>
            <Input type="password" value={token} placeholder={info.config.has_token ? "••••••••••" : "123456789:AA…"} onChange={(e) => setToken(e.target.value.trim())} autoComplete="new-password" />
          </Field>
          <Field
            label="Ishlash rejimi"
            hint={
              info.site_https
                ? cfg.mode === "polling"
                  ? "Sayt HTTPS orqali ochiq — Webhook tavsiya etiladi: Telegram xabarni darhol saytga yuboradi"
                  : "Telegram yangilanishlarni darhol saytga yuboradi"
                : "Sayt manzili https:// emas — faqat Long polling ishlaydi"
            }
          >
            <Select
              value={cfg.mode}
              onChange={(v) => setCfg({ ...cfg, mode: v as "polling" | "webhook" })}
              options={[
                { value: "webhook", label: info.site_https ? "Webhook — eng tez (tavsiya)" : "Webhook — sayt https:// orqali ochiq bo‘lsa" },
                { value: "polling", label: "Long polling — har qanday serverda" },
              ]}
            />
          </Field>
          <Toggle
            checked={!!cfg.ipv4}
            onChange={(v) => setCfg({ ...cfg, ipv4: v })}
            label="Telegram’ga faqat IPv4 orqali ulanish"
            hint={info.net.ipv4_auto ? "IPv6 ishlamagani uchun bot o‘zi IPv4 ga o‘tgan" : "Server IPv6 tarmog‘i ishlamasa yoqing (odatda avtomatik aniqlanadi)"}
          />
          <Field label="Salomlashish matni (ixtiyoriy)" hint="standart salomlashishdan oldin chiqadi">
            <Textarea rows={3} value={cfg.welcome || ""} onChange={(e) => setCfg({ ...cfg, welcome: e.target.value })} />
          </Field>
          <div className="a-row">
            <Btn
              busy={busy === "test"}
              icon={<CheckCircle2 size={15} />}
              disabled={!token && !info.config.has_token}
              onClick={async () => {
                setBusy("test");
                const r = await run(() => admin.testTelegram(token));
                if (r) toast(`Bot topildi: @${r.username} (${r.name})`);
                setBusy("");
              }}
            >
              Tokenni tekshirish
            </Btn>
            <Btn
              kind="primary"
              busy={busy === "save"}
              onClick={async () => {
                setBusy("save");
                const r = await run(() => admin.saveTelegram({ ...cfg, ...(token ? { token } : {}) }), "Saqlandi");
                if (r) {
                  setInfo(r);
                  setCfg(r.config);
                  setToken("");
                }
                setBusy("");
              }}
            >
              Saqlash
            </Btn>
          </div>
        </Card>
        <Card title="Holat">
          <div className="hemis-stats">
            <div>
              <b>{info.config.username ? `@${info.config.username}` : "—"}</b>
              <small>bot</small>
            </div>
            <div>
              <b>{info.chats}</b>
              <small>foydalanuvchi botni ochgan</small>
            </div>
            <div>
              <b>{info.running ? "✓" : "—"}</b>
              <small>fon jarayoni</small>
            </div>
          </div>
          {info.conflict && <p className="a-hint" style={{ color: "var(--a-bad)" }}>{info.conflict}</p>}
          {info.error && info.error !== info.conflict && <p className="a-hint" style={{ color: "var(--a-bad)" }}>{info.error}</p>}
          {info.link && (
            <a className="a-btn sm" href={info.link} target="_blank" rel="noreferrer">
              <Send size={14} /> {info.link}
            </a>
          )}
          <ul className="a-checks">
            <li>Til tanlash (o‘zbek, rus, ingliz) — barcha tugmalar inline</li>
            <li>Yangi murojaat: ism → telefon → email (ixtiyoriy) → bo‘lim → mavzu → matn (rasm, hujjat, video, ovozli xabar bilan) → tasdiqlash</li>
            <li>«Mening murojaatlarim»: holati, oxirgi izoh, holat tarixi, javob yozish va baholash</li>
            <li>Murojaatlar paneli: manba «Telegram bot», javob (ilovalari bilan) va holat o‘zgarishi shu botga yuboriladi</li>
            <li>«Hal qilindi»: 1–5 yulduz bilan baholash va izoh</li>
          </ul>
        </Card>
      </div>
      <TgSpeedCard enabled={info.config.has_token} />
      <TgGroupsCard info={info} onChange={setInfo} enabled={cfg.enabled && info.config.has_token} />
    </div>
  );
}

const fmtMs = (v: number | null | undefined) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
const VERDICT_ICON = { bad: <XCircle size={16} />, warn: <AlertTriangle size={16} />, ok: <CheckCircle2 size={16} />, info: <Info size={16} /> };

/** «Tezlikni tekshirish»: serverdan Telegram'gacha tarmoq, webhook/409 holati, bot ishlovi va Bot API vaqtlari — aniq xulosa bilan. */
function TgSpeedCard({ enabled }: { enabled: boolean }) {
  const run = useRun();
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState<TelegramSpeed | null>(null);
  const check = async () => {
    setBusy(true);
    const r = await run(() => admin.tgSpeed());
    if (r) setD(r);
    setBusy(false);
  };
  const probe = (p: TelegramSpeed["net"]["ipv4"], none: string) =>
    !p ? <span className="tg-speed-muted">{none}</span> : p.ok ? <>{fmtMs(p.tcp_ms)} TCP · {fmtMs(p.tls_ms)} TLS</> : <span className="tg-speed-bad">{p.err || "ulanmadi"} ({fmtMs(p.tcp_ms)})</span>;
  const gm = (t: { ms: number; ok: boolean; err: string } | undefined) => (!t ? "—" : t.ok ? fmtMs(t.ms) : <span className="tg-speed-bad">{t.err} ({fmtMs(t.ms)})</span>);
  return (
    <Card
      title="Tezlik va tashxis"
      actions={
        <Btn kind="primary" icon={<Gauge size={15} />} busy={busy} disabled={!enabled} onClick={check}>
          Tezlikni tekshirish
        </Btn>
      }
    >
      {!d ? (
        <p className="a-hint">{enabled ? "«Tezlikni tekshirish» tugmasini bosing — 5–15 soniya davom etadi." : "Avval bot tokenini saqlang."}</p>
      ) : (
        <div className="tg-speed">
          <div className="tg-verdicts">
            {d.verdicts.map((v, i) => (
              <div key={i} className={v.level}>
                {VERDICT_ICON[v.level]}
                <b>{v.text}</b>
              </div>
            ))}
          </div>
          <div className="tg-speed-grid">
            <dl>
              <dt>Tarmoq (server → api.telegram.org)</dt>
              <div>
                <span>DNS</span>
                <b>
                  A: {d.net.dns.a.join(", ") || "—"} · {fmtMs(d.net.dns.a_ms)}
                  <br />
                  AAAA: {d.net.dns.aaaa.join(", ") || "yo‘q"}
                </b>
              </div>
              <div>
                <span>IPv4</span>
                <b>{probe(d.net.ipv4, d.net.proxy ? "proksi orqali" : "manzil yo‘q")}</b>
              </div>
              <div>
                <span>IPv6</span>
                <b>{probe(d.net.ipv6, d.net.proxy ? "proksi orqali" : "IPv6 yo‘q")}</b>
              </div>
              <div>
                <span>getMe — yangi ulanish</span>
                <b>{gm(d.net.getme.cold)}</b>
              </div>
              <div>
                <span>getMe — qayta ishlatilgan</span>
                <b>{gm(d.net.getme.warm)}</b>
              </div>
              <div>
                <span>Ulanish</span>
                <b>
                  {d.state.ipv4 ? (d.state.ipv4_forced ? "faqat IPv4 (sozlama)" : "IPv4 (IPv6 ishlamadi)") : "avtomatik (IPv6/IPv4)"}
                  {d.net.proxy && <> · proksi {d.net.proxy}</>}
                </b>
              </div>
            </dl>
            <dl>
              <dt>Bot</dt>
              <div>
                <span>Rejim</span>
                <b>
                  {d.mode === "webhook" ? "Webhook" : "Long polling"} · {d.running ? <Pill tone="ok">ishlayapti</Pill> : <Pill tone="bad">to‘xtagan</Pill>}
                </b>
              </div>
              <div>
                <span>Webhook (Telegram’da)</span>
                <b className="mono">{d.webhook_error ? <span className="tg-speed-bad">{d.webhook_error}</span> : d.webhook?.url || "o‘rnatilmagan"}</b>
              </div>
              <div>
                <span>Telegram navbatida</span>
                <b>
                  {d.webhook?.pending_update_count ?? "—"} ta yangilanish{d.webhook?.max_connections ? ` · max_connections ${d.webhook.max_connections}` : ""}
                </b>
              </div>
              {d.webhook?.last_error_message && (
                <div>
                  <span>Webhook xatosi</span>
                  <b className="tg-speed-bad">
                    {d.webhook.last_error_date ? fmtDateTime(new Date(d.webhook.last_error_date * 1000).toISOString()) + " · " : ""}
                    {d.webhook.last_error_message}
                  </b>
                </div>
              )}
              <div>
                <span>409 (boshqa server)</span>
                <b>
                  {d.state.conflict_at ? (
                    <span className={d.state.conflict_recent ? "tg-speed-bad" : ""}>{fmtDateTime(new Date(d.state.conflict_at * 1000).toISOString())}</span>
                  ) : (
                    "kuzatilmagan"
                  )}
                </b>
              </div>
              <div>
                <span>Ishlov navbati</span>
                <b>
                  {d.backlog} ta · {d.workers} ta parallel oqim
                </b>
              </div>
            </dl>
          </div>
          <div className="tg-speed-grid">
            <div>
              <h4>
                Bot ishlovi <small>oxirgi {d.stats.handlers.count} ta yangilanish</small>
              </h4>
              <div className="hemis-stats">
                <div>
                  <b>{fmtMs(d.stats.handlers.p50)}</b>
                  <small>p50</small>
                </div>
                <div>
                  <b>{fmtMs(d.stats.handlers.p95)}</b>
                  <small>p95</small>
                </div>
                <div>
                  <b>{fmtMs(d.stats.handlers.wait_p95)}</b>
                  <small>navbatda kutish p95</small>
                </div>
              </div>
              {d.stats.handlers.slowest.length ? (
                <div className="a-table-scroll">
                  <table className="a-table">
                    <thead>
                      <tr>
                        <th>Eng sekinlari</th>
                        <th className="n">Vaqt</th>
                        <th className="n">Davomiyligi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.stats.handlers.slowest.map((h, i) => (
                        <tr key={i}>
                          <td>{h.kind}</td>
                          <td className="n">{new Date(h.at * 1000).toLocaleTimeString("uz-UZ", { hour12: false })}</td>
                          <td className="n">{fmtMs(h.ms)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="a-hint">Hali yangilanish kelmagan.</p>
              )}
            </div>
            <div>
              <h4>
                Bot API chaqiruvlari <small>oxirgi {d.stats.calls.count} ta · xato: {d.stats.calls.errors}</small>
              </h4>
              {d.stats.calls.methods.length ? (
                <div className="a-table-scroll">
                  <table className="a-table">
                    <thead>
                      <tr>
                        <th>Usul</th>
                        <th className="n">Soni</th>
                        <th className="n">p50</th>
                        <th className="n">p95</th>
                        <th className="n">Xato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.stats.calls.methods.map((m) => (
                        <tr key={m.method} title={m.last_error || undefined}>
                          <td className="mono">{m.method}</td>
                          <td className="n">{m.count}</td>
                          <td className="n">{fmtMs(m.p50)}</td>
                          <td className="n">{fmtMs(m.p95)}</td>
                          <td className="n">{m.errors || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="a-hint">Hali chaqiruv yo‘q.</p>
              )}
            </div>
          </div>
          <p className="a-hint">Tekshirildi: {fmtDateTime(d.at)}. Vaqtlar server xotirasida (qayta ishga tushganda tozalanadi).</p>
        </div>
      )}
    </Card>
  );
}

const TG_KINDS: { id: TgKind; label: string }[] = [
  { id: "news", label: "Yangiliklar" },
  { id: "announce", label: "E’lonlar" },
  { id: "event", label: "Tadbirlar" },
  { id: "vacancy", label: "Vakansiyalar" },
];
const TG_TYPE: Record<string, string> = { group: "Guruh", supergroup: "Guruh", channel: "Kanal" };

/** Bot qo'shilgan guruh va kanallar: tasdiqlash, qaysi nashrlar yuborilishi, oxirgi xato. */
function TgGroupsCard({ info, onChange, enabled }: { info: TelegramInfo; onChange: (i: TelegramInfo) => void; enabled: boolean }) {
  const run = useRun();
  const confirm = useConfirm();
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState("");
  const act = async (key: string, fn: () => Promise<TelegramInfo>, done?: string) => {
    setBusy(key);
    const r = await run(fn, done);
    if (r) onChange(r);
    setBusy("");
    return r;
  };
  return (
    <Card title="Guruh va kanallar">
      <form
        className="tg-add"
        onSubmit={async (e) => {
          e.preventDefault();
          if (ref.trim() && (await act("check", () => admin.tgGroupCheck(ref.trim())))) setRef("");
        }}
      >
        <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="@kanal yoki chat id" aria-label="Kanal yoki guruh" disabled={!enabled} />
        <Btn type="submit" icon={<Search size={15} />} busy={busy === "check"} disabled={!enabled || !ref.trim()}>
          Tekshirish
        </Btn>
      </form>
      {info.groups.length ? (
        <div className="tg-groups">
          {info.groups.map((g) => {
            const gone = g.status === "left" || g.status === "kicked";
            return (
              <div key={g.chat_id} className={`tg-group ${g.confirmed ? "on" : ""}`}>
                <div className="tg-group-main">
                  <b>{g.title || g.chat_id}</b>
                  <span className="tg-group-meta">
                    {TG_TYPE[g.type] || g.type}
                    {g.username && <> · @{g.username}</>}
                    {" · "}
                    <span className="mono">{g.chat_id}</span>
                    {g.confirmed ? <> · Tasdiqlangan</> : null}
                  </span>
                  {(gone || !g.can_post) && <span className="tg-group-bad">{gone ? "Bot chatdan chiqarilgan" : "Bot bu chatga yoza olmaydi"}</span>}
                  {g.confirmed && (
                    <div className="chk-list tg-kinds">
                      {TG_KINDS.map((k) => (
                        <label key={k.id} className="chk">
                          <input
                            type="checkbox"
                            checked={g.kinds.includes(k.id)}
                            disabled={!!busy}
                            onChange={(e) => act(`k:${g.chat_id}`, () => admin.tgGroupKinds(g.chat_id, e.target.checked ? [...g.kinds, k.id] : g.kinds.filter((x) => x !== k.id)))}
                          />
                          {k.label}
                        </label>
                      ))}
                    </div>
                  )}
                  {g.last_error ? (
                    <span className="tg-group-bad">
                      {fmtDateTime(g.last_error_at)} · {g.last_error}
                    </span>
                  ) : g.last_post ? (
                    <span className="tg-group-meta">Oxirgi e’lon: {fmtDateTime(g.last_post)}</span>
                  ) : null}
                </div>
                <div className="tg-group-actions">
                  {g.last_error && g.confirmed ? (
                    <Btn size="sm" icon={<RefreshCw size={14} />} busy={busy === `r:${g.chat_id}`} onClick={() => act(`r:${g.chat_id}`, () => admin.tgGroupRetry(g.chat_id))}>
                      Qayta yuborish
                    </Btn>
                  ) : null}
                  {g.confirmed ? (
                    <Btn size="sm" busy={busy === `c:${g.chat_id}`} onClick={() => act(`c:${g.chat_id}`, () => admin.tgGroupConfirm(g.chat_id, false))}>
                      Tasdiqni bekor qilish
                    </Btn>
                  ) : (
                    <Btn size="sm" kind="primary" icon={<CheckCircle2 size={14} />} disabled={!g.can_post} busy={busy === `c:${g.chat_id}`} onClick={() => act(`c:${g.chat_id}`, () => admin.tgGroupConfirm(g.chat_id, true), "Tasdiqlandi")}>
                      Tasdiqlash
                    </Btn>
                  )}
                  <Btn
                    size="sm"
                    kind="ghost"
                    icon={<Trash2 size={14} />}
                    title="O‘chirish"
                    busy={busy === `d:${g.chat_id}`}
                    onClick={async () => {
                      if (await confirm(`«${g.title || g.chat_id}» ro‘yxatdan o‘chirilsinmi?`)) act(`d:${g.chat_id}`, () => admin.tgGroupDelete(g.chat_id));
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty title="Guruh yoki kanal yo‘q" />
      )}
    </Card>
  );
}
