// Bayram bezaklari: O'zbekiston bayramlari, har biri uchun necha kun oldin boshlanib, necha kun keyin tugashi,
// oy taqvimidagi bayramlar sanasi (har yil uchun), tabrik matni, o'z tadbirlaringiz va effektlar.
import { CalendarClock, ChevronDown, Eye, PartyPopper, Plus, RotateCcw, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Lang } from "../../lib/api";
import { getAdminLang } from "../i18n";
import { FestIcon } from "../../site/festive/Festive";
import { themeOf } from "../../site/festive/themes";
import { admin, errMsg, type FestiveCustom, type FestiveHoliday, type FestiveHolidayCfg, type FestiveOverview, type FestiveSettings } from "../api";
import { Btn, Card, Field, ImageField, Input, LangTabs, PageHead, Pill, Select, Spinner, Toggle, useBaseLang, useToast } from "../ui";

export const STYLE_LABEL: Record<string, string> = {
  newyear: "Yangi yil — qor, chiroqlar, salyut",
  navruz: "Navro‘z — gulbarglar, lolalar",
  flowers: "Gullar — 8-mart",
  remembrance: "Xotira — sokin, salyutsiz",
  independence: "Mustaqillik — bayroq ranglari, salyut",
  teachers: "Ustozlar — yulduzlar, qog‘oz samolyotlar",
  constitution: "Konstitutsiya — oltin uchqunlar",
  eid: "Hayit — oy, yulduzlar, fonuslar",
  children: "Bolalar — sharlar, konfetti",
};

const EFFECT_LABEL: Record<string, [string, string]> = {
  particles: ["Havodagi zarrachalar", "qor, gulbarglar, konfetti, harflar…"],
  garland: ["Sarlavhadagi gulchambar", "chiroqlar, bayroqchalar, fonuslar"],
  banner: ["Tabrik banneri", "kirganda chiqadigan tabrik va teskari sanoq"],
  click: ["Bosganda portlash", "sahifaning istalgan joyini bosganda"],
  cursor: ["Sichqoncha izi", "kompyuterda kursor ortidan uchqunlar"],
  fireworks: ["Salyut", "Yangi yil, Mustaqillik va boshqa bayramlarda"],
  buttons: ["Tugmalar yaltirashi", "asosiy tugmalarda nur o‘tadi"],
};

const INTENSITY = [
  { v: 1, label: "Yengil" },
  { v: 2, label: "O‘rtacha" },
  { v: 3, label: "Kuchli" },
];

// sanali qatorlar admin tilida to'liq jumla bo'lib chiqadi (runtime tarjimon bo'laklarni to'g'ri tartibga keltira olmaydi)
const AL = getAdminLang();
const MONTHS: Record<string, string[]> = {
  uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
function human(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  if (AL === "uz") return `${d}-${MONTHS.uz[(m || 1) - 1]}`;
  return AL === "en" ? `${d} ${MONTHS.en[(m || 1) - 1]}` : `${d} ${MONTHS.ru[(m || 1) - 1]}`;
}
const days = (n: number) => (AL === "en" ? `${n} ${n === 1 ? "day" : "days"}` : AL === "ru" ? `${n} дн.` : `${n} kun`);
const TX = {
  live: (a: string, b: string, d: string) =>
    ({ uz: `${a} — ${b} · bayram kuni ${d}`, ru: `${a} — ${b} · праздник ${d}`, en: `${a} — ${b} · holiday on ${d}` })[AL],
  starts: (a: string, n: number) =>
    ({ uz: `${a} dan boshlanadi · ${days(n)} qoldi`, ru: `Начнётся ${a} · через ${days(n)}`, en: `Starts ${a} · in ${days(n)}` })[AL],
  next: (name: string) => ({ uz: `Keyingisi: ${name}`, ru: `Следующий: ${name}`, en: `Next: ${name}` })[AL],
  row: (d: string, a: string, b: string, n: number, lunar: boolean) =>
    ({
      uz: `${d} · bezak ${a} — ${b} (${days(n)})${lunar ? " · oy taqvimi" : ""}`,
      ru: `${d} · оформление ${a} — ${b} (${days(n)})${lunar ? " · лунный календарь" : ""}`,
      en: `${d} · decorations ${a} — ${b} (${days(n)})${lunar ? " · lunar calendar" : ""}`,
    })[AL],
  inDays: (n: number) => ({ uz: `${n} kundan keyin`, ru: `через ${days(n)}`, en: `in ${days(n)}` })[AL],
  year: (y: number) => ({ uz: `${y}-yil`, ru: `${y} год`, en: `${y}` })[AL],
  calc: (d: string) => ({ uz: `Hisoblangan: ${d}`, ru: `Расчётная дата: ${d}`, en: `Calculated: ${d}` })[AL],
};
const nm = (m: Partial<Record<Lang, string>>) => m[AL as Lang] || m.uz || "";
function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 864e5);
}
function openPreview(id: string) {
  window.open(`/?festive=${encodeURIComponent(id)}`, "_blank", "noopener");
}

function Chip({ style }: { style: string }) {
  const t = themeOf(style);
  return (
    <span className="fx-chip">
      <FestIcon name={t.icon} />
    </span>
  );
}

export function FestivePage() {
  const toast = useToast();
  const base = useBaseLang() || "uz";
  const [ov, setOv] = useState<FestiveOverview | null>(null);
  const [s, setS] = useState<FestiveSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("uz");
  useEffect(() => setLang(base), [base]);

  useEffect(() => {
    admin
      .festive()
      .then((r) => {
        setOv(r);
        setS(r.settings);
      })
      .catch((e) => toast(errMsg(e), "error"));
  }, [toast]);

  const upd = (patch: Partial<FestiveSettings>) => {
    setS((x) => (x ? { ...x, ...patch } : x));
    setDirty(true);
  };
  const updH = (id: string, patch: Partial<FestiveHolidayCfg>) => {
    if (!s) return;
    upd({ holidays: { ...s.holidays, [id]: { ...(s.holidays[id] || {}), ...patch } } });
  };
  const updC = (i: number, patch: Partial<FestiveCustom>) => {
    if (!s) return;
    upd({ custom: s.custom.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  };

  const save = async () => {
    if (!s) return;
    setBusy(true);
    try {
      const r = await admin.saveFestive(s);
      setOv(r);
      setS(r.settings);
      setDirty(false);
      toast("Saqlandi");
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setBusy(false);
  };

  const upcoming = useMemo(() => {
    if (!ov) return null;
    return ov.holidays
      .filter((h) => h.next && !h.next.now && (s?.holidays[h.id]?.enabled ?? true))
      .sort((a, b) => a.next!.start.localeCompare(b.next!.start))[0];
  }, [ov, s]);

  if (!ov || !s) return <Spinner />;
  const groups: [string, FestiveHoliday[]][] = [
    ["O‘zbekiston bayramlari", ov.holidays.filter((h) => h.region === "uz")],
  ];
  const forceOpts = [{ value: "", label: "Avtomatik — sana bo‘yicha" }, ...ov.holidays.map((h) => ({ value: h.id, label: nm(h.name) || h.id })), ...s.custom.filter((c) => c.id).map((c) => ({ value: c.id!, label: nm(c.name) || c.id! }))];

  return (
    <div className="a-page fx-page">
      <PageHead
        title="Bayram bezaklari"
        sub="Sayt bayramlarga mos ravishda o‘zi bezaladi: Yangi yilda qor va salyut, Navro‘zda gulbarglar, Hayitda fonuslar, Mustaqillik kunida bayroq ranglari. Har bir bayram qancha kun turishini shu yerda belgilaysiz."
        actions={
          <Btn kind="primary" busy={busy} disabled={!dirty} onClick={save}>
            Saqlash
          </Btn>
        }
      />

      {/* hozirgi holat */}
      <div className={`fx-hero ${ov.active && s.enabled ? "live" : ""}`}>
        <div className="fx-hero-main">
          {ov.active && s.enabled ? (
            <>
              <Chip style={ov.active.style} />
              <div>
                <small>Hozir saytda</small>
                <b data-no-tr>{ov.holidays.find((h) => h.id === ov.active!.id)?.name[AL as Lang] || ov.active.name}</b>
                <span data-no-tr>{TX.live(human(ov.active.start), human(ov.active.end), human(ov.active.day))}</span>
              </div>
            </>
          ) : (
            <>
              <span className="fx-chip idle">
                <CalendarClock size={24} />
              </span>
              <div>
                <small>{s.enabled ? "Hozir bezak yo‘q" : "Bezaklar o‘chirilgan"}</small>
                {upcoming ? <b data-no-tr>{TX.next(nm(upcoming.name))}</b> : <b>Yaqin bayram topilmadi</b>}
                {upcoming?.next && <span data-no-tr>{TX.starts(human(upcoming.next.start), daysBetween(ov.today, upcoming.next.start))}</span>}
              </div>
            </>
          )}
        </div>
        <div className="fx-hero-tools">
          {ov.active && s.enabled && (
            <Btn icon={<Eye size={15} />} onClick={() => openPreview(ov.active!.id)}>
              Saytda ko‘rish
            </Btn>
          )}
          {!ov.active && upcoming && (
            <Btn icon={<Eye size={15} />} onClick={() => openPreview(upcoming.id)}>
              Oldindan ko‘rish
            </Btn>
          )}
        </div>
      </div>

      <div className="fx-grid">
        <Card title="Umumiy sozlamalar">
          <Toggle checked={s.enabled} onChange={(v) => upd({ enabled: v })} label="Bayram bezaklari yoqilgan" hint="O‘chirilsa, hech qaysi bayramda bezak chiqmaydi" />
          <span className="a-label" style={{ display: "block", margin: "18px 0 8px" }}>
            Effektlar kuchi
          </span>
          <div className="fx-seg">
            {INTENSITY.map((x) => (
              <button key={x.v} className={s.intensity === x.v ? "on" : ""} onClick={() => upd({ intensity: x.v })}>
                {Array.from({ length: x.v }, (_, i) => (
                  <Sparkles key={i} size={13} />
                ))}
                {x.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 18 }}>
            <Field label="Majburan ko‘rsatish" hint="Masalan, institut tadbiri uchun bezakni sanadan qat’i nazar hozir yoqish">
              <Select value={s.force || ""} onChange={(v) => upd({ force: v || null })} options={forceOpts} />
            </Field>
          </div>
        </Card>
        <Card title="Effektlar" sub="Foydalanuvchi o‘zi ham bezaklarni pastki chap burchakdagi tugma bilan o‘chira oladi">
          <div className="fx-effects">
            {ov.effects.map((e) => (
              <Toggle key={e} checked={s.effects[e] !== false} onChange={(v) => upd({ effects: { ...s.effects, [e]: v } })} label={EFFECT_LABEL[e]?.[0] || e} hint={EFFECT_LABEL[e]?.[1]} />
            ))}
          </div>
        </Card>
      </div>

      {groups.map(([title, list]) => (
        <Card key={title} title={title} pad={false}>
          <div className="fx-list">
            {list.map((h) => {
              const cfg = s.holidays[h.id] || {};
              const on = cfg.enabled ?? true;
              const isOpen = open === h.id;
              const nx = h.next;
              const until = nx ? daysBetween(ov.today, nx.start) : null;
              return (
                <div key={h.id} className={`fx-row ${on ? "" : "off"} ${isOpen ? "open" : ""}`}>
                  <div className="fx-row-head">
                    <Chip style={h.style} />
                    <button className="fx-row-info" onClick={() => setOpen(isOpen ? null : h.id)}>
                      <b data-no-tr>{nm(h.name)}</b>
                      {nx ? <span data-no-tr>{TX.row(human(nx.day), human(nx.start), human(nx.end), daysBetween(nx.start, nx.end) + 1, !h.fixed)}</span> : <span>Sana kiritilmagan</span>}
                    </button>
                    <div className="fx-row-tools">
                      {!on ? <Pill tone="muted">O‘chirilgan</Pill> : nx?.now ? <Pill tone="ok">Hozir saytda</Pill> : until !== null ? <Pill tone="info">
                          <span data-no-tr>{TX.inDays(until)}</span>
                        </Pill> : null}
                      <Btn size="sm" kind="ghost" icon={<Eye size={14} />} title="Saytda ko‘rish" onClick={() => openPreview(h.id)} />
                      <Toggle checked={on} onChange={(v) => updH(h.id, { enabled: v })} label="" />
                      <button className={`fx-exp ${isOpen ? "on" : ""}`} onClick={() => setOpen(isOpen ? null : h.id)} aria-label="Sozlash">
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  </div>
                  {isOpen && <HolidayEditor h={h} cfg={cfg} lang={lang} setLang={setLang} base={base} onChange={(p) => updH(h.id, p)} />}
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <Card
        title="O‘z tadbirlaringiz"
        sub="Institut kuni, bitiruv kechasi, ochiq eshiklar kuni… — istalgan uslubni tanlab, davrini belgilang"
        actions={
          <Btn
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => {
              const d = new Date();
              const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
              const e = new Date(d.getTime() + 3 * 864e5);
              upd({ custom: [...s.custom, { enabled: true, style: "independence", start: iso(d), end: iso(e), name: { uz: "Institut kuni" }, greeting: {} }] });
            }}
          >
            Tadbir qo‘shish
          </Btn>
        }
      >
        {!s.custom.length && <p className="a-hint">Hali tadbir qo‘shilmagan.</p>}
        {s.custom.map((c, i) => (
          <div key={c.id || i} className={`fx-custom ${c.enabled ? "" : "off"}`}>
            <Chip style={c.style} />
            <div className="fx-custom-body">
              <div className="a-form-grid">
                <Field label={`Nomi (${lang.toUpperCase()})`}>
                  <Input value={c.name[lang] || ""} onChange={(e) => updC(i, { name: { ...c.name, [lang]: e.target.value } })} placeholder={c.name.uz || ""} />
                </Field>
                <Field label="Uslub">
                  <Select value={c.style} onChange={(v) => updC(i, { style: v })} options={ov.styles.map((x) => ({ value: x, label: STYLE_LABEL[x] || x }))} />
                </Field>
                <Field label="Boshlanishi">
                  <Input type="date" value={c.start} onChange={(e) => updC(i, { start: e.target.value })} required />
                </Field>
                <Field label="Tugashi">
                  <Input type="date" value={c.end} min={c.start} onChange={(e) => updC(i, { end: e.target.value })} required />
                </Field>
              </div>
              <Field label={`Tabrik matni (${lang.toUpperCase()})`} wide>
                <Input value={c.greeting[lang] || ""} onChange={(e) => updC(i, { greeting: { ...c.greeting, [lang]: e.target.value } })} maxLength={200} placeholder={c.greeting.uz || "Masalan: Institutimizga 10 yil!"} />
              </Field>
              <Field label="Sahna surati" hint="Bo‘sh qoldirilsa — tanlangan uslubning tayyor fotosurati" wide>
                <div style={{ maxWidth: 420 }}>
                  <ImageField value={c.image || ""} onChange={(v) => updC(i, { image: v || null })} aspect="16 / 9" />
                </div>
              </Field>
              <div className="fx-custom-tools">
                <LangTabs value={lang} onChange={setLang} base={base} filled={(l) => !!c.name[l]} />
                <Toggle checked={c.enabled} onChange={(v) => updC(i, { enabled: v })} label="Yoqilgan" />
                {c.id ? (
                  <Btn size="sm" icon={<Eye size={14} />} onClick={() => openPreview(c.id!)}>
                    Ko‘rish
                  </Btn>
                ) : (
                  <Btn size="sm" icon={<Eye size={14} />} onClick={() => openPreview(c.style)} title="Saqlangach aniq ko‘rinadi">
                    Uslubni ko‘rish
                  </Btn>
                )}
                <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} title="O‘chirish" onClick={() => upd({ custom: s.custom.filter((_, j) => j !== i) })} />
              </div>
            </div>
          </div>
        ))}
      </Card>

      <Card title="Uslublar galereyasi" sub="Har bir uslub qanday ko‘rinishini yangi oynada sinab ko‘ring">
        <div className="fx-styles">
          {ov.styles.map((x) => (
            <button key={x} className="fx-style" onClick={() => openPreview(x)}>
              <Chip style={x} />
              <span>{STYLE_LABEL[x] || x}</span>
              <Wand2 size={14} />
            </button>
          ))}
        </div>
      </Card>

      {dirty && (
        <div className="fx-savebar">
          <PartyPopper size={16} /> O‘zgarishlar saqlanmagan
          <Btn kind="primary" busy={busy} onClick={save}>
            Saqlash
          </Btn>
        </div>
      )}
    </div>
  );
}

function HolidayEditor({ h, cfg, lang, setLang, base, onChange }: { h: FestiveHoliday; cfg: FestiveHolidayCfg; lang: Lang; setLang: (l: Lang) => void; base: Lang; onChange: (p: Partial<FestiveHolidayCfg>) => void }) {
  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y, y + 1, y + 2];
  }, []);
  const dates = cfg.dates || {};
  return (
    <div className="fx-edit">
      <div className="a-form-grid">
        <Field label="Necha kun oldin boshlanadi" hint={`Odatda: ${h.default_before} kun`}>
          <Input type="number" min={0} max={60} value={cfg.before ?? h.default_before} onChange={(e) => onChange({ before: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} />
        </Field>
        <Field label="Necha kun keyin tugaydi" hint={`Odatda: ${h.default_after} kun`}>
          <Input type="number" min={0} max={60} value={cfg.after ?? h.default_after} onChange={(e) => onChange({ after: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} />
        </Field>
      </div>
      {!h.fixed && (
        <div className="fx-years">
          <span className="a-label">Bayram kuni (oy taqvimi bo‘yicha har yili o‘zgaradi)</span>
          <p className="a-hint">Sanalar taxminiy hisoblangan. Rasmiy e’lon qilingach, kerak bo‘lsa shu yerda tuzating.</p>
          <div className="a-grid3">
            {years.map((y) => {
              const def = h.table?.[String(y)];
              const v = dates[String(y)] || def;
              return (
                <Field key={y} label={<span data-no-tr>{TX.year(y)}</span>} hint={dates[String(y)] && def ? <span data-no-tr>{TX.calc(human(`${y}-${def}`))}</span> : undefined}>
                  <Input type="date" value={v ? `${y}-${v}` : ""} min={`${y}-01-01`} max={`${y}-12-31`} onChange={(e) => onChange({ dates: { ...dates, [String(y)]: e.target.value ? e.target.value.slice(5) : "" } })} />
                </Field>
              );
            })}
          </div>
        </div>
      )}
      <div className="fx-years">
        <span className="a-label">Aniq davr (ixtiyoriy)</span>
        <p className="a-hint">Shu davr berilsa, bezak aynan shu kunlarda turadi — yuqoridagi «necha kun oldin/keyin» o‘rniga.</p>
        <div className="a-form-grid">
          <Field label="Boshlanishi">
            <Input type="date" value={cfg.start || ""} onChange={(e) => onChange({ start: e.target.value || null })} />
          </Field>
          <Field label="Tugashi">
            <Input type="date" value={cfg.end || ""} min={cfg.start || undefined} onChange={(e) => onChange({ end: e.target.value || null })} />
          </Field>
        </div>
      </div>
      <div className="fx-years">
        <span className="a-label">Tabrik matni</span>
        <div style={{ margin: "8px 0" }}>
          <LangTabs value={lang} onChange={setLang} base={base} filled={(l) => !!cfg.greeting?.[l]} />
        </div>
        <Input value={cfg.greeting?.[lang] || ""} maxLength={200} onChange={(e) => onChange({ greeting: { ...(cfg.greeting || {}), [lang]: e.target.value } })} placeholder={h.greeting[lang] || h.greeting.uz || ""} />
        <p className="a-hint">Bo‘sh qoldirilsa, tayyor tabrik ishlatiladi: «{h.greeting[lang] || h.greeting.uz}»</p>
      </div>
      <div className="fx-years">
        <span className="a-label">Sahna surati</span>
        <p className="a-hint" style={{ margin: "4px 0 8px" }}>
          Bosh sahifadagi bayram sahnasi uchun o‘z suratingiz (masalan, institutdagi bayram tadbiri). Bo‘sh qoldirilsa — tayyor fotosurat. Gorizontal, kamida 1600 px kenglikdagi surat tavsiya etiladi.
        </p>
        <div style={{ maxWidth: 420 }}>
          <ImageField value={cfg.image || ""} onChange={(v) => onChange({ image: v || null })} aspect="16 / 9" />
        </div>
      </div>
      <Btn size="sm" kind="ghost" icon={<RotateCcw size={14} />} onClick={() => onChange({ before: undefined, after: undefined, dates: {}, start: null, end: null, greeting: {}, image: null })}>
        Asl holiga qaytarish
      </Btn>
    </div>
  );
}
