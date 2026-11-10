// Kontrakt narxlari: barcha yo'nalishlar narxini bitta jadvalda (ta'lim shakli bo'yicha) tahrirlash, foizga oshirish/kamaytirish,
// chegirmadan oldingi narx, o'quv yili, izoh va imtiyozlar (3 tilda), dollar kursi, saytda ko'rsatish.
import { AlertTriangle, ExternalLink, Percent, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Lang } from "../../lib/api";
import { req } from "../../lib/api";
import { errMsg } from "../api";
import { Btn, Card, Field, Input, LangTabs, PageHead, Spinner, Textarea, Toggle, useBaseLang, useToast } from "../ui";

type Form = "day" | "extramural" | "evening" | "distance" | "second";
interface Fee {
  form: Form;
  amount: number;
  old?: number;
}
interface Prog {
  id: string;
  title: string;
  slug: string;
  status: string;
  faculty: string;
  fees: Fee[];
  fee_note: string;
  fee_note_i18n: Partial<Record<Lang, string>>;
}
interface Settings {
  show: boolean;
  demo: boolean;
  year: string;
  usd_rate: number | null;
  note: Partial<Record<Lang, string>>;
  highlights: Partial<Record<Lang, string[]>>;
}
interface Overview {
  settings: Settings;
  programs: Prog[];
  forms: Form[];
  academic_year: string;
  defaults: { note: Record<Lang, string>; highlights: Record<Lang, string[]> };
}

const FORM_LABEL: Record<Form, string> = { day: "Kunduzgi", extramural: "Sirtqi", evening: "Kechki", distance: "Masofaviy", second: "Ikkinchi oliy" };
const fmt = (n?: number) => (n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") : "");
const parse = (s: string) => {
  const n = parseInt(s.replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function Money({ value, onChange, placeholder, small }: { value?: number; onChange: (n: number) => void; placeholder?: string; small?: boolean }) {
  return (
    <div className={`tu-money ${small ? "sm" : ""}`}>
      <input className="a-input" inputMode="numeric" value={fmt(value)} placeholder={placeholder} onChange={(e) => onChange(parse(e.target.value))} />
      <span>so‘m</span>
    </div>
  );
}

export function TuitionPage() {
  const toast = useToast();
  const base = useBaseLang() || "uz";
  const [ov, setOv] = useState<Overview | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [rows, setRows] = useState<Prog[]>([]);
  const [cols, setCols] = useState<Form[]>(["day"]);
  const [lang, setLang] = useState<Lang>("uz");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pct, setPct] = useState("");
  const [discounts, setDiscounts] = useState(false);

  const load = (r: Overview) => {
    setOv(r);
    setS(r.settings);
    setRows(r.programs);
    const used = new Set(r.programs.flatMap((p) => p.fees.map((f) => f.form)));
    setCols(r.forms.filter((f) => f === "day" || used.has(f)));
    setDiscounts(r.programs.some((p) => p.fees.some((f) => f.old)));
    setDirty(false);
  };
  useEffect(() => {
    req<Overview>("GET", "/api/admin/tuition")
      .then(load)
      .catch((e) => toast(errMsg(e), "error"));
  }, [toast]);
  useEffect(() => setLang(base), [base]);

  const range = useMemo(() => {
    const v = rows.flatMap((p) => p.fees.map((f) => f.amount)).filter(Boolean);
    return v.length ? [Math.min(...v), Math.max(...v)] : null;
  }, [rows]);

  if (!ov || !s) return <Spinner />;

  const up = (patch: Partial<Settings>) => {
    setS({ ...s, ...patch });
    setDirty(true);
  };
  const setFee = (pid: string, form: Form, patch: Partial<Fee>) => {
    setRows((rs) =>
      rs.map((p) => {
        if (p.id !== pid) return p;
        const cur = p.fees.find((f) => f.form === form) || { form, amount: 0 };
        const next = { ...cur, ...patch };
        const others = p.fees.filter((f) => f.form !== form);
        return { ...p, fees: next.amount ? [...others, next].sort((a, b) => ov.forms.indexOf(a.form) - ov.forms.indexOf(b.form)) : others };
      }),
    );
    setDirty(true);
  };
  const setNote = (pid: string, v: string) => {
    setRows((rs) => rs.map((p) => (p.id !== pid ? p : lang === base ? { ...p, fee_note: v } : { ...p, fee_note_i18n: { ...p.fee_note_i18n, [lang]: v } })));
    setDirty(true);
  };
  const applyPct = () => {
    const k = parseFloat(pct.replace(",", "."));
    if (!Number.isFinite(k) || k === 0 || k <= -90 || k > 300) {
      toast("Foizni kiriting, masalan 10 yoki -5", "error");
      return;
    }
    setRows((rs) => rs.map((p) => ({ ...p, fees: p.fees.map((f) => ({ ...f, amount: Math.round((f.amount * (1 + k / 100)) / 1000) * 1000 })) })));
    setDirty(true);
    toast(`Barcha narxlar ${k > 0 ? "+" : ""}${k}% o‘zgartirildi — saqlashni unutmang`);
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await req<Overview>("PUT", "/api/admin/tuition", { settings: s, programs: rows });
      load(r);
      toast("Saqlandi");
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setBusy(false);
  };
  const hl = (s.highlights[lang] || []).join("\n");

  return (
    <div className="a-page tu-adm">
      <PageHead
        title="Kontrakt narxlari"
        sub="Har bir yo‘nalish uchun bir o‘quv yili to‘lovi (so‘m) — ta’lim shakli bo‘yicha. Narxlar yo‘nalish kartalarida, yo‘nalish sahifasida, narxlar jadvalida va qidiruv tizimlari uchun ma’lumotlarda chiqadi."
        actions={
          <>
            <a className="a-btn ghost md" href="/programs#tuition" target="_blank" rel="noreferrer">
              <ExternalLink size={15} />
              <span>Saytda ko‘rish</span>
            </a>
            <Btn kind="primary" busy={busy} disabled={!dirty} onClick={save}>
              Saqlash
            </Btn>
          </>
        }
      />
      {s.demo && (
        <div className="tu-adm-warn">
          <AlertTriangle size={20} />
          <div>
            <b>Narxlar namunaviy</b>
            <span>
              Boshlang‘ich qiymatlar namuna sifatida qo‘yilgan va rasmiy narx emas. Har bir yo‘nalish narxini institutning tasdiqlangan
              buyrug‘i bo‘yicha tekshirib, «Saqlash»ni bosing.
            </span>
          </div>
        </div>
      )}
      <div className="a-grid2 top">
        <Card title="Umumiy sozlamalar">
          <Toggle checked={s.show} onChange={(v) => up({ show: v })} label="Narxlarni saytda ko‘rsatish" hint="O‘chirilsa — kartalar, sahifa va qidiruv ma’lumotlarida narx chiqmaydi" />
          <div className="a-form-grid" style={{ marginTop: 14 }}>
            <Field label="O‘quv yili" hint={`Bo‘sh — avtomatik: ${ov.academic_year}`}>
              <Input value={s.year} placeholder={ov.academic_year} onChange={(e) => up({ year: e.target.value })} />
            </Field>
            <Field label="Dollar kursi (ixtiyoriy)" hint="Kiritilsa, narx yonida ≈ $ ko‘rsatiladi">
              <Input type="number" value={s.usd_rate ?? ""} placeholder="12 800" onChange={(e) => up({ usd_rate: e.target.value ? Number(e.target.value) : null })} />
            </Field>
          </div>
          {range && (
            <div className="tu-adm-range">
              <Wallet size={16} /> Hozirgi oraliq: <b>{fmt(range[0])}</b> — <b>{fmt(range[1])}</b> so‘m
            </div>
          )}
        </Card>
        <Card title="Izoh va imtiyozlar" sub="Yo‘nalish sahifasidagi narx bloki yonida chiqadi">
          <LangTabs value={lang} onChange={setLang} base={base} filled={(l) => !!s.note[l] || !!s.highlights[l]?.length} />
          <Field label={`Imtiyozlar (${lang.toUpperCase()}) — har biri yangi qatorda, 4 tagacha`}>
            <Textarea
              rows={4}
              value={hl}
              placeholder={ov.defaults.highlights[lang]?.join("\n")}
              onChange={(e) => up({ highlights: { ...s.highlights, [lang]: e.target.value.split("\n") } })}
            />
          </Field>
          <Field label={`Izoh (${lang.toUpperCase()})`}>
            <Textarea rows={2} value={s.note[lang] || ""} placeholder={ov.defaults.note[lang]} onChange={(e) => up({ note: { ...s.note, [lang]: e.target.value } })} />
          </Field>
        </Card>
      </div>

      <Card
        title="Yo‘nalishlar bo‘yicha narxlar"
        sub="so‘m / bir o‘quv yili. Bo‘sh katak — bu shaklda o‘qish yo‘q."
        actions={
          <div className="tu-adm-tools">
            <div className="tu-adm-pct">
              <Percent size={14} />
              <input className="a-input" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="+10" />
              <Btn size="sm" onClick={applyPct}>
                Hammasiga qo‘llash
              </Btn>
            </div>
          </div>
        }
      >
        <div className="tu-adm-forms">
          <span>Ta’lim shakllari:</span>
          {ov.forms.map((f) => (
            <button
              key={f}
              className={cols.includes(f) ? "on" : ""}
              onClick={() => setCols(cols.includes(f) ? cols.filter((x) => x !== f) : ov.forms.filter((x) => x === f || cols.includes(x)))}
            >
              {FORM_LABEL[f]}
            </button>
          ))}
          <Toggle checked={discounts} onChange={setDiscounts} label="Chegirmadan oldingi narx" />
        </div>
        <div className="tu-adm-table" style={{ ["--cols" as string]: cols.length }}>
          <div className="tu-adm-tr th">
            <span>Yo‘nalish</span>
            {cols.map((f) => (
              <span key={f}>{FORM_LABEL[f]}</span>
            ))}
            <span>Izoh ({lang.toUpperCase()})</span>
          </div>
          {rows.map((p) => (
            <div key={p.id} className={`tu-adm-tr ${p.status !== "published" ? "off" : ""}`}>
              <span className="tu-adm-prog" data-no-tr>
                <b>{p.title}</b>
                <small>{p.faculty}</small>
              </span>
              {cols.map((f) => {
                const fee = p.fees.find((x) => x.form === f);
                return (
                  <span key={f} className="tu-adm-cell">
                    <Money value={fee?.amount} placeholder="—" onChange={(n) => setFee(p.id, f, { amount: n })} />
                    {discounts && fee?.amount ? <Money small value={fee.old} placeholder="eski narx" onChange={(n) => setFee(p.id, f, { old: n || undefined })} /> : null}
                  </span>
                );
              })}
              <span>
                <input
                  className="a-input"
                  value={lang === base ? p.fee_note : p.fee_note_i18n[lang] || ""}
                  placeholder={lang === base ? "masalan: Grant o‘rinlari mavjud" : p.fee_note}
                  maxLength={200}
                  onChange={(e) => setNote(p.id, e.target.value)}
                />
              </span>
            </div>
          ))}
        </div>
      </Card>
      {dirty && (
        <div className="fx-savebar">
          <Wallet size={16} /> O‘zgarishlar saqlanmagan
          <Btn kind="primary" busy={busy} onClick={save}>
            Saqlash
          </Btn>
        </div>
      )}
    </div>
  );
}

/** Yo'nalish muharriridagi ixcham narx maydoni (ta'lim shakli bo'yicha) */
export function FeesField({ value, onChange }: { value: Fee[] | undefined; onChange: (v: Fee[]) => void }) {
  const fees = value || [];
  const forms: Form[] = ["day", "extramural", "evening", "distance", "second"];
  const set = (form: Form, amount: number) => {
    const others = fees.filter((f) => f.form !== form);
    const cur = fees.find((f) => f.form === form);
    onChange((amount ? [...others, { ...cur, form, amount }] : others).sort((a, b) => forms.indexOf(a.form) - forms.indexOf(b.form)));
  };
  return (
    <div className="a-field wide">
      <span className="a-label">
        Kontrakt narxi (so‘m / yil){" "}
        <a href="/admin/tuition" className="tu-adm-link">
          barcha yo‘nalishlar →
        </a>
      </span>
      <div className="tu-adm-fees">
        {forms.map((f) => (
          <label key={f}>
            <small>{FORM_LABEL[f]}</small>
            <Money value={fees.find((x) => x.form === f)?.amount} placeholder="—" onChange={(n) => set(f, n)} />
          </label>
        ))}
      </div>
    </div>
  );
}
