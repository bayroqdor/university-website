// Sayt menyusi: yuqori menyu va futer ustunlari. Bo'limlar, ichki havolalar (ustunlarga guruhlash), 3 tilda nomlar (uz / ru / en).
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ExternalLink, Languages, Plus, RotateCcw, Save, Trash2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Item, MenuItem, MenuLink, SiteSettings } from "../../lib/api";
import { admin } from "../api";
import { Btn, Card, Empty, Field, Input, PageHead, Pill, Spinner, useConfirm, useRun } from "../ui";

type Opt = { value: string; label: string; group: string };
const LANGS = [
  { id: "ru", label: "RU" },
  { id: "en", label: "EN" },
] as const;

/** Standart menyu — sayt tuzilmasi (backend seed.MENU bilan bir xil); shundan boshlab tahrirlash qulay */
function defaultMenu(): MenuItem[] {
  const L = (label: string, url: string, group: string, ru: string, en: string): MenuLink => ({ label, url, group, labels: { ru, en } });
  const M = (label: string, url: string, ru: string, en: string, children: MenuLink[]): MenuItem => ({ label, url, labels: { ru, en }, children });
  return [
    M("Institut haqida", "/about/institut-haqida", "Об институте", "About", [
      L("Institut haqida", "/about/institut-haqida", "Institut", "Об институте", "About the institute"),
      L("Rektor murojaati", "/about/rektor-murojaati", "Institut", "Обращение ректора", "Rector’s address"),
      L("Kafedralar", "/faculties", "Institut", "Кафедры", "Departments"),
      L("Tuzilma", "/structure", "Institut", "Структура", "Structure"),
      L("Hujjatlar", "/documents", "Institut", "Документы", "Documents"),
      L("Yashil institut", "/about/yashil-institut", "Kampus", "Зелёный институт", "Green institute"),
      L("Laboratoriyalar", "/about/laboratoriyalar", "Kampus", "Лаборатории", "Laboratories"),
      L("Kutubxona", "/about/kutubxona", "Kampus", "Библиотека", "Library"),
      L("Korrupsiyaga qarshi kurashish", "/about/korrupsiyaga-qarshi", "Kampus", "Противодействие коррупции", "Anti-corruption"),
    ]),
    M("Abituriyent", "/admission", "Абитуриенту", "Admissions", [
      L("Qabul", "/admission", "Qabul", "Приём", "Admission"),
      L("Ta’lim yo‘nalishlari", "/programs", "Qabul", "Направления обучения", "Programmes"),
      L("Xorijiy fuqarolar uchun", "/about/xorijiy-fuqarolar", "Qabul", "Иностранным гражданам", "International applicants"),
      L("Savol-javob", "/contact#faq", "Qabul", "Вопросы и ответы", "FAQ"),
      L("Bakalavriat", "/about/bakalavriat", "Bosqichlar", "Бакалавриат", "Bachelor’s"),
      L("Magistratura", "/about/magistratura", "Bosqichlar", "Магистратура", "Master’s"),
      L("1+1 qo‘shma magistratura", "/about/qoshma-magistratura", "Bosqichlar", "Совместная магистратура 1+1", "1+1 joint master’s"),
      L("Tayanch doktorantura", "/about/tayanch-doktorantura", "Bosqichlar", "Базовая докторантура", "Doctoral programme"),
    ]),
    M("Talabalar uchun", "/students", "Студентам", "Students", [
      L("Shaxsiy kabinet", "/login", "O‘qish", "Личный кабинет", "Student portal"),
      L("Dars jadvali", "/schedule", "O‘qish", "Расписание", "Timetable"),
      L("Elektron kutubxona", "/library", "O‘qish", "Электронная библиотека", "Online library"),
      L("Talabalar hayoti", "/about/talabalar-hayoti", "Hayot", "Студенческая жизнь", "Student life"),
      L("Eko faol talabalar", "/about/eko-faol-talabalar", "Hayot", "Экоактивные студенты", "Eco-active students"),
      L("Yotoqxona", "/about/yotoqxona", "Hayot", "Общежитие", "Residence"),
    ]),
    M("Tadqiqot", "/about/ilmiy-faoliyat", "Наука", "Research", [
      L("Ilmiy faoliyat", "/about/ilmiy-faoliyat", "Fan", "Научная деятельность", "Research"),
      L("Tayanch doktorantura", "/about/tayanch-doktorantura", "Fan", "Базовая докторантура", "Doctoral programme"),
      L("Laboratoriyalar", "/about/laboratoriyalar", "Fan", "Лаборатории", "Laboratories"),
      L("Barqaror rivojlanish maqsadlari", "/upgoals", "Barqarorlik", "Цели устойчивого развития", "Sustainable development goals"),
      L("Yashil institut", "/about/yashil-institut", "Barqarorlik", "Зелёный институт", "Green institute"),
    ]),
    M("Xalqaro hamkorlik", "/partners", "Международные связи", "International", [
      L("1+1 qo‘shma magistratura", "/about/qoshma-magistratura", "Dasturlar", "Совместная магистратура 1+1", "1+1 joint master’s"),
      L("Akademik mobillik", "/about/akademik-mobillik", "Dasturlar", "Академическая мобильность", "Academic mobility"),
      L("Hamkorlar", "/partners", "Hamkorlik", "Партнёры", "Partners"),
      L("Xorijiy fuqarolar uchun", "/about/xorijiy-fuqarolar", "Hamkorlik", "Иностранным гражданам", "International applicants"),
    ]),
    M("Axborot xizmati", "/news", "Пресс-служба", "Newsroom", [
      L("Yangiliklar", "/news", "Matbuot", "Новости", "News"),
      L("E’lonlar", "/announcements", "Matbuot", "Объявления", "Announcements"),
      L("Tadbirlar", "/events", "Matbuot", "Мероприятия", "Events"),
      L("Aloqa", "/contact", "Murojaat", "Контакты", "Contact"),
      L("Vakansiyalar", "/careers", "Murojaat", "Вакансии", "Careers"),
    ]),
  ];
}

function LinkPicker({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: Opt[] }) {
  const known = opts.some((o) => o.value === value);
  const [custom, setCustom] = useState(!known && !!value);
  const groups = [...new Set(opts.map((o) => o.group))];
  return (
    <div className="menu-link">
      <select
        className="a-input"
        value={custom ? "__custom" : value}
        onChange={(e) => {
          if (e.target.value === "__custom") {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(e.target.value);
        }}
      >
        <option value="">— havola tanlang —</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {opts
              .filter((o) => o.group === g)
              .map((o) => (
                <option key={o.group + o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </optgroup>
        ))}
        <option value="__custom">Boshqa manzil (qo‘lda yozish)…</option>
      </select>
      {custom && <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="/sahifa yoki https://…" />}
    </div>
  );
}

function Labels({ v, onChange }: { v: MenuLink; onChange: (l: MenuLink["labels"]) => void }) {
  return (
    <div className="menu-tr">
      {LANGS.map((l) => (
        <label key={l.id}>
          <span>{l.label}</span>
          <Input value={v.labels?.[l.id] || ""} placeholder={v.label} onChange={(e) => onChange({ ...(v.labels || {}), [l.id]: e.target.value })} />
        </label>
      ))}
    </div>
  );
}

export function MenuPage() {
  const run = useRun();
  const confirm = useConfirm();
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [opts, setOpts] = useState<Opt[]>([]);
  const [open, setOpen] = useState<number | null>(0);
  const [tr, setTr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    admin.site().then((s) => {
      setSite(s);
      setMenu(s.menu || []);
    });
    Promise.all([admin.items("page"), admin.items("faculty"), admin.items("department"), admin.items("program")]).then(([p, f, d, pr]) => {
      const pub = (x: Item) => x.status === "published";
      setOpts([
        ...[
          ["/", "Bosh sahifa"], ["/about", "Institut haqida"], ["/programs", "Ta’lim yo‘nalishlari"], ["/faculties", "Kafedralar"], ["/structure", "Tuzilma (bo‘limlar, markazlar)"],
          ["/staff", "Professor-o‘qituvchilar"], ["/staff?kind=leadership", "Rahbariyat"], ["/admission", "Qabul"], ["/students", "Talabalarga"], ["/news", "Yangiliklar"],
          ["/announcements", "E’lonlar"], ["/events", "Tadbirlar"], ["/documents", "Hujjatlar"], ["/partners", "Hamkorlar"], ["/links", "Foydali havolalar"], ["/contact", "Aloqa"],
          ["/login", "Shaxsiy kabinet (kirish)"], ["/schedule", "Dars jadvali"], ["/library", "Elektron kutubxona"], ["/careers", "Vakansiyalar"], ["/faq", "Savol-javob"],
        ].map(([value, label]) => ({ value, label, group: "Sayt bo‘limlari" })),
        ...p.items.filter(pub).map((x) => ({ value: `/about/${x.slug}`, label: x.title, group: "Sahifalar" })),
        ...f.items.filter(pub).map((x) => ({ value: `/faculties/${x.slug}`, label: x.title, group: "Kafedralar" })),
        ...d.items.filter(pub).map((x) => ({ value: `/structure/${x.slug}`, label: x.title, group: "Tuzilma: bo‘limlar va markazlar" })),
        ...pr.items.filter(pub).map((x) => ({ value: `/programs/${x.slug}`, label: x.title, group: "Yo‘nalishlar" })),
      ]);
    });
  }, []);

  const set = (m: MenuItem[]) => {
    setMenu(m);
    setDirty(true);
  };
  const upd = (i: number, patch: Partial<MenuItem>) => set(menu.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const updChild = (i: number, k: number, patch: Partial<MenuLink>) => upd(i, { children: menu[i].children.map((c, j) => (j === k ? { ...c, ...patch } : c)) });
  const move = <T,>(arr: T[], i: number, d: number): T[] => {
    const a = [...arr];
    const j = i + d;
    if (j < 0 || j >= a.length) return a;
    [a[i], a[j]] = [a[j], a[i]];
    return a;
  };
  const groupsOf = (m: MenuItem) => [...new Set(m.children.map((c) => c.group || "").filter(Boolean))];
  const colsOf = (m: MenuItem) => [...new Set(m.children.map((c) => c.group || ""))];
  const preview = useMemo(() => menu, [menu]);

  if (!site) return <Spinner />;
  const save = async () => {
    setBusy(true);
    const r = await run(() => admin.saveSite({ ...site, menu }), "Menyu saqlandi");
    if (r) {
      setSite(r);
      setMenu(r.menu || []);
      setDirty(false);
    }
    setBusy(false);
  };
  const auto = menu.length === 0;
  return (
    <div className="a-page narrow">
      <PageHead
        title="Menyu"
        sub="Saytning yuqori menyusi va futer ustunlari. Asosiy bo‘limlar yuqorida, qolgan sahifalar ularning ichida (kerak bo‘lsa ustunlarga guruhlanadi)."
        actions={
          <>
            <Btn icon={<Languages size={15} />} onClick={() => setTr(!tr)} kind={tr ? "accent" : "default"}>
              Tarjimalar
            </Btn>
            <Btn kind="primary" icon={<Save size={16} />} busy={busy} disabled={!dirty} onClick={save}>
              Saqlash
            </Btn>
          </>
        }
      />
      {auto ? (
        <Card>
          <Empty icon={<Wand2 size={28} />} title="Hozir menyu avtomatik tuziladi">
            <p className="a-hint">Sayt tarkibiga qarab (sahifalar, kafedralar, bo‘limlar…) menyu o‘zi yaratiladi. Qo‘lda boshqarish uchun tayyor tuzilmadan boshlang.</p>
            <Btn kind="primary" icon={<Wand2 size={15} />} onClick={() => set(defaultMenu())}>
              Standart menyudan boshlash
            </Btn>
          </Empty>
        </Card>
      ) : (
        <>
          <Card title="Ko‘rinishi" sub="Saytda shunday chiqadi (sichqonchani bo‘lim ustiga olib boring)">
            <div className="menu-preview">
              {preview.map((m, i) => (
                <div key={i} className="mp-item">
                  <span>
                    {m.label} {m.children.length ? <ChevronDown size={12} /> : null}
                  </span>
                  {m.children.length > 0 && (
                    <div className="mp-drop" style={{ ["--cols" as string]: colsOf(m).length }}>
                      {colsOf(m).map((g) => (
                        <div key={g || "-"} className="mp-col">
                          {g && colsOf(m).length > 1 && <b>{g}</b>}
                          {m.children
                            .filter((c) => (c.group || "") === g)
                            .map((c, k) => (
                              <span key={k}>{c.label || "—"}</span>
                            ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
          {menu.map((m, i) => (
            <Card key={i} className="menu-card" pad>
              <div className="menu-row top">
                <button className="a-icon" onClick={() => setOpen(open === i ? null : i)} title={open === i ? "Yopish" : "Ochish"}>
                  {open === i ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <span className="menu-idx">{i + 1}</span>
                <Input value={m.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="Bo‘lim nomi" />
                <LinkPicker value={m.url} onChange={(v) => upd(i, { url: v })} opts={opts} />
                <Pill tone="muted">{m.children.length} ta ichki</Pill>
                <button className="a-icon" onClick={() => set(move(menu, i, -1))} disabled={i === 0} title="Yuqoriga">
                  <ArrowUp size={15} />
                </button>
                <button className="a-icon" onClick={() => set(move(menu, i, 1))} disabled={i === menu.length - 1} title="Pastga">
                  <ArrowDown size={15} />
                </button>
                <button
                  className="a-icon danger"
                  onClick={async () => {
                    if (await confirm(`«${m.label}» bo‘limi menyudan olib tashlansinmi?`)) set(menu.filter((_, j) => j !== i));
                  }}
                  title="O‘chirish"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {tr && <Labels v={m} onChange={(labels) => upd(i, { labels })} />}
              {open === i && (
                <div className="menu-children">
                  {m.children.length === 0 && <p className="a-hint">Ichki havola yo‘q — bo‘lim nomini bosganda to‘g‘ridan-to‘g‘ri havolaga o‘tadi.</p>}
                  {m.children.map((c, k) => (
                    <div key={k} className="menu-child">
                      <div className="menu-row">
                        <Input value={c.label} onChange={(e) => updChild(i, k, { label: e.target.value })} placeholder="Havola nomi" />
                        <LinkPicker value={c.url} onChange={(v) => updChild(i, k, { url: v })} opts={opts} />
                        <Input value={c.group || ""} onChange={(e) => updChild(i, k, { group: e.target.value })} placeholder="Ustun (ixtiyoriy)" list={`groups-${i}`} />
                        <button className="a-icon" onClick={() => upd(i, { children: move(m.children, k, -1) })} disabled={k === 0}>
                          <ArrowUp size={14} />
                        </button>
                        <button className="a-icon" onClick={() => upd(i, { children: move(m.children, k, 1) })} disabled={k === m.children.length - 1}>
                          <ArrowDown size={14} />
                        </button>
                        <button className="a-icon danger" onClick={() => upd(i, { children: m.children.filter((_, j) => j !== k) })}>
                          <Trash2 size={14} />
                        </button>
                        {/^https?:/.test(c.url) && <ExternalLink size={14} className="muted" />}
                      </div>
                      {tr && <Labels v={c} onChange={(labels) => updChild(i, k, { labels })} />}
                    </div>
                  ))}
                  <datalist id={`groups-${i}`}>
                    {groupsOf(m).map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                  <Btn size="sm" icon={<Plus size={14} />} onClick={() => upd(i, { children: [...m.children, { label: "", url: "", group: "", labels: {} }] })}>
                    Ichki havola qo‘shish
                  </Btn>
                </div>
              )}
            </Card>
          ))}
          <div className="menu-actions">
            <Btn
              icon={<Plus size={15} />}
              disabled={menu.length >= 9}
              onClick={() => {
                set([...menu, { label: "Yangi bo‘lim", url: "", labels: {}, children: [] }]);
                setOpen(menu.length);
              }}
            >
              Bo‘lim qo‘shish
            </Btn>
            <Btn
              kind="ghost"
              icon={<RotateCcw size={15} />}
              onClick={async () => {
                if (await confirm("Qo‘lda tuzilgan menyu o‘chirilib, avtomatik menyuga qaytilsinmi?")) set([]);
              }}
            >
              Avtomatik menyuga qaytish
            </Btn>
          </div>
          <Field label="Maslahat">
            <p className="a-hint">
              Bitta bo‘limga 6–8 tadan ko‘p havola qo‘ymang. Ko‘p bo‘lsa, «Ustun» maydoniga nom yozib ularni 2–3 ustunga ajrating (masalan: «Institut», «Kampus»). Futerda har bo‘limdan 5 ta havola va «Barchasi →» chiqadi.
            </p>
          </Field>
        </>
      )}
    </div>
  );
}
