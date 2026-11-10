import { AreaChart, BarChart3, Gauge, LineChart, PieChart, Plus, ScatterChart, Sigma, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Btn, Field, Input, Modal, Toggle } from "../admin/ui";
import { compile, unknownVars } from "../lib/expr";
import { defaultConfig, type ChartConfig, type ChartSeries, type ChartType } from "../rich/chart";
import { ChartView } from "../rich/ChartView";

const TYPES: { id: ChartType; label: string; icon: ReactNode; hint: string }[] = [
  { id: "line", label: "Chiziqli", icon: <LineChart size={20} />, hint: "o‘lchov natijalari" },
  { id: "area", label: "Maydonli", icon: <AreaChart size={20} />, hint: "to‘ldirilgan chiziq" },
  { id: "bar", label: "Ustunli", icon: <BarChart3 size={20} />, hint: "toifalar bo‘yicha" },
  { id: "scatter", label: "Nuqtali", icon: <ScatterChart size={20} />, hint: "tarqoqlik, korrelyatsiya" },
  { id: "function", label: "Funksiya", icon: <Sigma size={20} />, hint: "y = f(x), parametrlar" },
  { id: "gauge", label: "Shkala", icon: <Gauge size={20} />, hint: "ko‘rsatkich, strelka" },
  { id: "pie", label: "Doiraviy", icon: <PieChart size={20} />, hint: "ulushlar" },
];

/** CSV / Excel dan nusxalangan jadvalni qatorlarga aylantirish (birinchi qator — sarlavha) */
export function parseTable(text: string, categorical: boolean): ChartSeries[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const head = lines[0].split(sep).map((s) => s.trim());
  const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));
  const series: ChartSeries[] = head.slice(1).map((name) => ({ name: name || "Qator", data: [] }));
  for (const line of lines.slice(1)) {
    const cells = line.split(sep).map((s) => s.trim());
    const x = categorical ? cells[0] : num(cells[0]);
    if (!categorical && !Number.isFinite(x as number)) continue;
    series.forEach((s, i) => {
      const y = num(cells[i + 1] ?? "");
      if (Number.isFinite(y)) s.data.push([x, y]);
    });
  }
  return series;
}

export function toTable(series: ChartSeries[] | undefined, xName = "x"): string {
  if (!series?.length) return `${xName},y\n`;
  const xs: (string | number)[] = [];
  series.forEach((s) => s.data.forEach(([x]) => !xs.includes(x) && xs.push(x)));
  const rows = [[xName, ...series.map((s) => s.name)].join(",")];
  xs.forEach((x) => rows.push([x, ...series.map((s) => s.data.find((d) => d[0] === x)?.[1] ?? "")].join(",")));
  return rows.join("\n");
}

function NumIn({ value, onChange, placeholder = "avto", step = "any" }: { value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string; step?: string }) {
  return <Input type="number" step={step} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
}

export function ChartEditor({ open, initial, onClose, onSave }: { open: boolean; initial: ChartConfig | null; onClose: () => void; onSave: (c: ChartConfig) => void }) {
  const [c, setC] = useState<ChartConfig>(initial || defaultConfig());
  const [tab, setTab] = useState<"type" | "data" | "axes" | "look">("data");
  const [table, setTable] = useState("");
  useEffect(() => {
    if (!open) return;
    const cfg = initial || defaultConfig();
    setC(cfg);
    setTable(toTable(cfg.series, cfg.xLabel || "x"));
    setTab(initial ? "data" : "type");
  }, [open, initial]);
  const set = (p: Partial<ChartConfig>) => setC((x) => ({ ...x, ...p }));
  const categorical = c.type === "pie" || (c.type === "bar" ? c.categorical !== false : !!c.categorical);
  const applyTable = (text: string) => {
    setTable(text);
    set({ series: parseTable(text, categorical) });
  };
  const chooseType = (t: ChartType) => {
    const d = defaultConfig(t);
    const keep = { title: c.title, caption: c.caption, xLabel: c.xLabel, yLabel: c.yLabel, height: c.height };
    const needsData = ["line", "area", "bar", "scatter"].includes(t) && ["line", "area", "bar", "scatter"].includes(c.type);
    const next: ChartConfig = { ...d, ...keep, ...(needsData ? { series: c.series } : {}), type: t };
    if (t === "bar" && needsData) next.categorical = c.categorical ?? true;
    setC(next);
    setTable(toTable(next.series, next.xLabel || "x"));
    setTab("data");
  };
  const paramNames = (c.params || []).map((p) => p.name);
  const preview = useMemo(() => ({ ...c }), [c]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Grafik"
      width={1180}
      footer={
        <>
          <Btn onClick={onClose}>Bekor qilish</Btn>
          <Btn kind="primary" onClick={() => onSave(c)}>
            Saqlash
          </Btn>
        </>
      }
    >
      <div className="ce">
        <div className="ce-side">
          <div className="a-tabs">
            {(
              [
                ["type", "Tur"],
                ["data", "Ma’lumot"],
                ["axes", "O‘qlar"],
                ["look", "Ko‘rinish"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          {tab === "type" && (
            <div className="ce-types">
              {TYPES.map((t) => (
                <button key={t.id} className={`ce-type ${c.type === t.id ? "on" : ""}`} onClick={() => chooseType(t.id)}>
                  {t.icon}
                  <b>{t.label}</b>
                  <small>{t.hint}</small>
                </button>
              ))}
            </div>
          )}
          {tab === "data" && (
            <div className="ce-form">
              {["line", "area", "bar", "scatter", "pie"].includes(c.type) && (
                <>
                  {c.type !== "pie" && (
                    <Toggle
                      checked={categorical}
                      onChange={(v) => {
                        set({ categorical: v });
                        setC((x) => ({ ...x, categorical: v, series: parseTable(table, v) }));
                      }}
                      label="X — toifalar (matn)"
                      hint="masalan, yillar yoki namunalar nomi"
                    />
                  )}
                  <Field label="Jadval" hint="Birinchi qator — sarlavhalar (x, qator1, qator2…). Excel dan nusxalab qo‘yish mumkin; ajratgich: vergul, nuqtali vergul yoki Tab.">
                    <textarea className="a-input mono" rows={12} value={table} onChange={(e) => applyTable(e.target.value)} spellCheck={false} />
                  </Field>
                  <p className="a-hint">
                    {(c.series || []).length} ta qator, {(c.series || []).reduce((a, s) => a + s.data.length, 0)} ta nuqta
                  </p>
                </>
              )}
              {c.type === "function" && (
                <>
                  <div className="a-label">Funksiyalar (x o‘zgaruvchisi bo‘yicha)</div>
                  {(c.functions || []).map((f, i) => {
                    const comp = compile(f.expr);
                    const unk = comp.error ? [] : unknownVars(f.expr, paramNames);
                    return (
                      <div key={i} className="ce-fn">
                        <Input value={f.name || ""} placeholder="nomi" onChange={(e) => set({ functions: c.functions!.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} style={{ width: 110 }} />
                        <span className="mono">=</span>
                        <Input className={`mono ${comp.error || unk.length ? "bad" : ""}`} value={f.expr} onChange={(e) => set({ functions: c.functions!.map((x, j) => (j === i ? { ...x, expr: e.target.value } : x)) })} />
                        <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} onClick={() => set({ functions: c.functions!.filter((_, j) => j !== i) })} title="O‘chirish" />
                        {(comp.error || unk.length > 0) && <span className="ce-err">{comp.error || `Noma’lum: ${unk.join(", ")} — parametr sifatida qo‘shing`}</span>}
                      </div>
                    );
                  })}
                  <Btn size="sm" icon={<Plus size={14} />} onClick={() => set({ functions: [...(c.functions || []), { expr: "x^2", name: `f${(c.functions || []).length + 1}(x)` }] })}>
                    Funksiya qo‘shish
                  </Btn>
                  <p className="a-hint">
                    Amallar: + − * / ^, funksiyalar: sin, cos, tan, exp, ln, log, sqrt, abs, min, max…; konstantalar: pi, e. Misol: <code>a*exp(-k*x)</code>
                  </p>
                  <div className="a-label" style={{ marginTop: 10 }}>
                    Parametrlar (o‘quvchi slayder bilan o‘zgartiradi)
                  </div>
                  {(c.params || []).map((p, i) => (
                    <div key={i} className="ce-param">
                      <Input className="mono" value={p.name} onChange={(e) => set({ params: c.params!.map((x, j) => (j === i ? { ...x, name: e.target.value.replace(/[^A-Za-z_α-ω0-9]/g, "") } : x)) })} placeholder="nomi" />
                      <Input value={p.label || ""} onChange={(e) => set({ params: c.params!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="yorliq" />
                      {(["value", "min", "max", "step"] as const).map((k) => (
                        <label key={k} className="ce-mini">
                          <small>{{ value: "qiymat", min: "min", max: "max", step: "qadam" }[k]}</small>
                          <Input type="number" step="any" value={p[k]} onChange={(e) => set({ params: c.params!.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value) } : x)) })} />
                        </label>
                      ))}
                      <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} onClick={() => set({ params: c.params!.filter((_, j) => j !== i) })} title="O‘chirish" />
                    </div>
                  ))}
                  <Btn size="sm" icon={<Plus size={14} />} onClick={() => set({ params: [...(c.params || []), { name: "k", value: 1, min: 0, max: 10, step: 0.1 }] })}>
                    Parametr qo‘shish
                  </Btn>
                  <div className="a-grid3" style={{ marginTop: 12 }}>
                    <Field label="x dan">
                      <NumIn value={c.domain?.[0] ?? -10} onChange={(v) => set({ domain: [v ?? -10, c.domain?.[1] ?? 10] })} />
                    </Field>
                    <Field label="x gacha">
                      <NumIn value={c.domain?.[1] ?? 10} onChange={(v) => set({ domain: [c.domain?.[0] ?? -10, v ?? 10] })} />
                    </Field>
                    <Field label="Nuqtalar soni">
                      <NumIn value={c.samples ?? 400} onChange={(v) => set({ samples: v ?? 400 })} />
                    </Field>
                  </div>
                </>
              )}
              {c.type === "gauge" && c.gauge && (
                <>
                  <div className="a-grid3">
                    <Field label="Qiymat">
                      <NumIn value={c.gauge.value} onChange={(v) => set({ gauge: { ...c.gauge!, value: v ?? 0 } })} />
                    </Field>
                    <Field label="Min">
                      <NumIn value={c.gauge.min} onChange={(v) => set({ gauge: { ...c.gauge!, min: v ?? 0 } })} />
                    </Field>
                    <Field label="Max">
                      <NumIn value={c.gauge.max} onChange={(v) => set({ gauge: { ...c.gauge!, max: v ?? 100 } })} />
                    </Field>
                  </div>
                  <div className="a-grid2">
                    <Field label="Birlik">
                      <Input value={c.gauge.unit || ""} onChange={(e) => set({ gauge: { ...c.gauge!, unit: e.target.value } })} />
                    </Field>
                    <Field label="Yorliq">
                      <Input value={c.gauge.label || ""} onChange={(e) => set({ gauge: { ...c.gauge!, label: e.target.value } })} />
                    </Field>
                  </div>
                  <div className="a-label">Rang zonalari (shkala ulushi 0…1 gacha)</div>
                  {(c.gauge.bands || []).map((b, i) => (
                    <div key={i} className="ce-band">
                      <Input type="number" step="0.05" min={0} max={1} value={b.to} onChange={(e) => set({ gauge: { ...c.gauge!, bands: c.gauge!.bands!.map((x, j) => (j === i ? { ...x, to: Number(e.target.value) } : x)) } })} />
                      <input type="color" value={b.color} onChange={(e) => set({ gauge: { ...c.gauge!, bands: c.gauge!.bands!.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) } })} />
                      <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} onClick={() => set({ gauge: { ...c.gauge!, bands: c.gauge!.bands!.filter((_, j) => j !== i) } })} title="O‘chirish" />
                    </div>
                  ))}
                  <Btn size="sm" icon={<Plus size={14} />} onClick={() => set({ gauge: { ...c.gauge!, bands: [...(c.gauge!.bands || []), { to: 1, color: "#4E8F3A" }] } })}>
                    Zona qo‘shish
                  </Btn>
                  <Toggle checked={!!c.gauge.interactive} onChange={(v) => set({ gauge: { ...c.gauge!, interactive: v } })} label="O‘quvchi slayder bilan o‘zgartira olsin" />
                </>
              )}
            </div>
          )}
          {tab === "axes" && (
            <div className="ce-form">
              {c.type === "gauge" || c.type === "pie" ? (
                <p className="a-hint">Bu grafik turida o‘qlar yo‘q.</p>
              ) : (
                <>
                  <div className="a-grid2">
                    <Field label="X o‘qi nomi">
                      <Input value={c.xLabel || ""} onChange={(e) => set({ xLabel: e.target.value })} />
                    </Field>
                    <Field label="Y o‘qi nomi">
                      <Input value={c.yLabel || ""} onChange={(e) => set({ yLabel: e.target.value })} />
                    </Field>
                  </div>
                  <div className="a-grid4">
                    <Field label="X min">
                      <NumIn value={c.xMin} onChange={(v) => set({ xMin: v })} />
                    </Field>
                    <Field label="X max">
                      <NumIn value={c.xMax} onChange={(v) => set({ xMax: v })} />
                    </Field>
                    <Field label="Y min">
                      <NumIn value={c.yMin} onChange={(v) => set({ yMin: v })} />
                    </Field>
                    <Field label="Y max">
                      <NumIn value={c.yMax} onChange={(v) => set({ yMax: v })} />
                    </Field>
                  </div>
                  <Toggle checked={!!c.xLog} onChange={(v) => set({ xLog: v })} label="X — logarifmik shkala (boshlang‘ich holat)" />
                  <Toggle checked={!!c.yLog} onChange={(v) => set({ yLog: v })} label="Y — logarifmik shkala (boshlang‘ich holat)" />
                  <div className="a-label" style={{ marginTop: 8 }}>
                    Chegara chizig‘i (masalan, me’yor)
                  </div>
                  <div className="a-grid3">
                    <Field label="y =">
                      <NumIn value={c.markLine?.y} placeholder="yo‘q" onChange={(v) => set({ markLine: { ...(c.markLine || {}), y: v } })} />
                    </Field>
                    <Field label="x =">
                      <NumIn value={c.markLine?.x} placeholder="yo‘q" onChange={(v) => set({ markLine: { ...(c.markLine || {}), x: v } })} />
                    </Field>
                    <Field label="Yozuv">
                      <Input value={c.markLine?.label || ""} onChange={(e) => set({ markLine: { ...(c.markLine || {}), label: e.target.value } })} />
                    </Field>
                  </div>
                </>
              )}
            </div>
          )}
          {tab === "look" && (
            <div className="ce-form">
              <Field label="Sarlavha">
                <Input value={c.title || ""} onChange={(e) => set({ title: e.target.value })} />
              </Field>
              <Field label="Izoh (grafik ostida)">
                <Input value={c.caption || ""} onChange={(e) => set({ caption: e.target.value })} />
              </Field>
              <Field label={`Balandlik: ${c.height || 360}px`}>
                <input type="range" min={220} max={640} step={10} value={c.height || 360} onChange={(e) => set({ height: Number(e.target.value) })} />
              </Field>
              <Toggle checked={c.zoom !== false} onChange={(v) => set({ zoom: v })} label="Masshtablash va surish" hint="g‘ildirak, slayderlar, sohani belgilab kattalashtirish" />
              <Toggle checked={c.controls !== false} onChange={(v) => set({ controls: v })} label="O‘quvchi uchun boshqaruv paneli" hint="log/chiziqli shkala, hosila, integral, o‘qlarni almashtirish" />
              <Toggle checked={!!c.smooth} onChange={(v) => set({ smooth: v })} label="Silliq chiziq" />
              <Toggle checked={c.showPoints !== false} onChange={(v) => set({ showPoints: v })} label="Nuqtalarni ko‘rsatish" />
              <Toggle checked={c.legend !== false} onChange={(v) => set({ legend: v })} label="Legenda" />
            </div>
          )}
        </div>
        <div className="ce-preview">
          <div className="a-label">Ko‘rinishi (o‘quvchi shunday ko‘radi)</div>
          <div className="prose">
            <ChartView config={preview} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
