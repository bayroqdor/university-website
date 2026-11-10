// Maqoladagi grafik bloki: sozlama turi va ECharts opsiyasini qurish
import type { EOption } from "../lib/echarts";
import { sample, transform, type Transform } from "../lib/expr";

export type ChartType = "line" | "area" | "bar" | "scatter" | "function" | "gauge" | "pie";

export interface ChartSeries {
  name: string;
  data: [number | string, number][];
  color?: string;
}
export interface ChartParam {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  label?: string;
}
export interface ChartConfig {
  type: ChartType;
  title?: string;
  caption?: string;
  xLabel?: string;
  yLabel?: string;
  xLog?: boolean;
  yLog?: boolean;
  xMin?: number | null;
  xMax?: number | null;
  yMin?: number | null;
  yMax?: number | null;
  categorical?: boolean;
  series?: ChartSeries[];
  functions?: { expr: string; name?: string; color?: string }[];
  params?: ChartParam[];
  domain?: [number, number];
  samples?: number;
  gauge?: { value: number; min: number; max: number; unit?: string; label?: string; bands?: { to: number; color: string }[]; interactive?: boolean };
  zoom?: boolean;
  smooth?: boolean;
  showPoints?: boolean;
  legend?: boolean;
  height?: number;
  markLine?: { y?: number | null; x?: number | null; label?: string };
  controls?: boolean;
}

export interface ChartState {
  xLog: boolean;
  yLog: boolean;
  transform: Transform;
  params: Record<string, number>;
  swap: boolean;
  gaugeValue?: number;
}

export const PALETTE = ["#C8812A", "#2F6F73", "#7A5CC0", "#C2463D", "#4E8F3A", "#D4A017", "#3D6FB6", "#9C5B3B"];

export function defaultConfig(type: ChartType = "line"): ChartConfig {
  const base: ChartConfig = { type, title: "", caption: "", xLabel: "x", yLabel: "y", zoom: true, smooth: false, showPoints: true, legend: true, height: 360, controls: true };
  if (type === "function")
    return { ...base, title: "y = a·sin(b·x)", functions: [{ expr: "a*sin(b*x)", name: "f(x)" }], params: [{ name: "a", value: 1, min: 0, max: 5, step: 0.1 }, { name: "b", value: 1, min: 0.1, max: 5, step: 0.1 }], domain: [-10, 10], samples: 400, showPoints: false };
  if (type === "gauge") return { ...base, title: "", gauge: { value: 62, min: 0, max: 100, unit: "%", label: "Ko‘rsatkich", interactive: true, bands: [{ to: 0.3, color: "#C2463D" }, { to: 0.7, color: "#D4A017" }, { to: 1, color: "#4E8F3A" }] } };
  if (type === "pie") return { ...base, series: [{ name: "Ulush", data: [["A", 40], ["B", 30], ["C", 20], ["D", 10]] }] };
  if (type === "bar") return { ...base, categorical: true, series: [{ name: "Qator 1", data: [["2022", 12], ["2023", 18], ["2024", 25], ["2025", 31]] }] };
  return { ...base, series: [{ name: "Qator 1", data: [[0, 1], [1, 3], [2, 2.5], [3, 5], [4, 4.2], [5, 7]] }] };
}

export function initialState(c: ChartConfig): ChartState {
  return {
    xLog: !!c.xLog,
    yLog: !!c.yLog,
    transform: "none",
    params: Object.fromEntries((c.params || []).map((p) => [p.name, p.value])),
    swap: false,
    gaugeValue: c.gauge?.value,
  };
}

interface Theme {
  ink: string;
  muted: string;
  line: string;
  surface: string;
  accent: string;
  font: string;
}

const fmt = (v: number) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(2) : String(+v.toFixed(4)));

export function buildOption(c: ChartConfig, s: ChartState, th: Theme): EOption {
  const colors = [th.accent, ...PALETTE.slice(1)];
  const base = {
    color: colors,
    textStyle: { fontFamily: th.font, color: th.muted },
    animationDuration: 500,
    animationEasing: "cubicOut" as const,
  };
  if (c.type === "gauge" && c.gauge) {
    const g = c.gauge;
    const v = s.gaugeValue ?? g.value;
    const bands = (g.bands && g.bands.length ? g.bands : [{ to: 1, color: th.accent }]).map((b) => [b.to, b.color]);
    return {
      ...base,
      series: [
        {
          type: "gauge", min: g.min, max: g.max, startAngle: 210, endAngle: -30, radius: "92%", center: ["50%", "58%"],
          progress: { show: true, width: 14, itemStyle: { color: th.accent } },
          axisLine: { lineStyle: { width: 14, color: bands } },
          axisTick: { distance: -22, length: 6, lineStyle: { color: th.muted, width: 1 } },
          splitLine: { distance: -26, length: 12, lineStyle: { color: th.muted, width: 1.5 } },
          axisLabel: { distance: -8, color: th.muted, fontSize: 11 },
          pointer: { length: "62%", width: 5, itemStyle: { color: th.ink } },
          anchor: { show: true, size: 14, itemStyle: { color: th.ink, borderWidth: 3, borderColor: th.surface } },
          title: { offsetCenter: [0, "38%"], color: th.muted, fontSize: 13 },
          detail: { valueAnimation: true, offsetCenter: [0, "68%"], fontSize: 30, fontWeight: 600, color: th.ink, formatter: (x: number) => `${fmt(x)}${g.unit ? " " + g.unit : ""}` },
          data: [{ value: v, name: g.label || "" }],
        },
      ],
    };
  }
  if (c.type === "pie") {
    const d = (c.series?.[0]?.data || []).map(([n, v]) => ({ name: String(n), value: v }));
    return {
      ...base,
      tooltip: { trigger: "item", backgroundColor: th.surface, borderColor: th.line, textStyle: { color: th.ink } },
      legend: c.legend === false ? undefined : { bottom: 0, textStyle: { color: th.muted } },
      series: [{ type: "pie", radius: ["42%", "72%"], center: ["50%", "46%"], itemStyle: { borderColor: th.surface, borderWidth: 2, borderRadius: 6 }, label: { color: th.ink, formatter: "{b}: {d}%" }, data: d }],
    };
  }

  // qatorlar
  type S = { name: string; data: [number | string, number][]; color?: string };
  let series: S[] = [];
  const cat = c.type === "bar" && c.categorical !== false ? true : !!c.categorical;
  if (c.type === "function") {
    const [x0, x1] = c.domain || [-10, 10];
    series = (c.functions || []).map((f, i) => ({ name: f.name || `f${i + 1}(x)`, data: sample(f.expr, s.params, x0, x1, c.samples || 400), color: f.color }));
  } else {
    series = (c.series || []).map((x) => ({ ...x, data: x.data.map(([a, b]) => [cat ? String(a) : Number(a), Number(b)] as [number | string, number]) }));
  }
  if (s.transform !== "none" && !cat) {
    series = series.map((x) => ({ ...x, data: transform(x.data as [number, number][], s.transform) }));
  }
  if (s.xLog && !cat) series = series.map((x) => ({ ...x, data: x.data.filter(([a]) => (a as number) > 0) }));
  if (s.yLog) series = series.map((x) => ({ ...x, data: x.data.filter(([, b]) => b > 0) }));
  if (s.swap && !cat) series = series.map((x) => ({ ...x, data: x.data.map(([a, b]) => [b, a as number] as [number, number]) }));

  const xLabel = s.swap ? c.yLabel : c.xLabel;
  const yLabel = s.swap ? c.xLabel : c.yLabel;
  const axisCommon = {
    nameTextStyle: { color: th.muted, fontSize: 12 },
    axisLine: { lineStyle: { color: th.line } },
    axisTick: { lineStyle: { color: th.line } },
    axisLabel: { color: th.muted, fontSize: 11, formatter: (v: number | string) => (typeof v === "number" ? fmt(v) : v) },
    splitLine: { lineStyle: { color: th.line, type: "dashed" as const } },
  };
  const xType = cat ? "category" : s.xLog ? "log" : "value";
  const yType = s.yLog ? "log" : "value";
  const zoom = c.zoom !== false;
  const kind = c.type === "function" || c.type === "area" ? "line" : c.type;
  const ml = c.markLine;
  const markLine =
    ml && ((ml.y !== null && ml.y !== undefined) || (ml.x !== null && ml.x !== undefined))
      ? {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#C2463D", type: "dashed" as const, width: 1.5 },
          label: { color: "#C2463D", formatter: ml.label || "{c}", position: "insideEndTop" as const },
          data: [
            ...(ml.y !== null && ml.y !== undefined ? [{ [s.swap ? "xAxis" : "yAxis"]: ml.y }] : []),
            ...(ml.x !== null && ml.x !== undefined ? [{ [s.swap ? "yAxis" : "xAxis"]: ml.x }] : []),
          ],
        }
      : undefined;
  return {
    ...base,
    grid: { left: 12, right: zoom ? 44 : 18, top: c.legend !== false && series.length > 1 ? 40 : 20, bottom: zoom && !cat ? 58 : 30, containLabel: true },
    legend: c.legend !== false && series.length > 1 ? { top: 0, left: 0, textStyle: { color: th.muted }, itemWidth: 14, itemHeight: 8 } : undefined,
    tooltip: {
      trigger: c.type === "scatter" ? "item" : "axis",
      axisPointer: { type: "cross", label: { backgroundColor: th.ink }, lineStyle: { color: th.muted }, crossStyle: { color: th.muted } },
      backgroundColor: th.surface,
      borderColor: th.line,
      textStyle: { color: th.ink, fontSize: 12 },
      valueFormatter: (v: unknown) => (typeof v === "number" ? fmt(v) : String(v)),
    },
    toolbox: {
      right: 0,
      top: -4,
      itemSize: 13,
      iconStyle: { borderColor: th.muted },
      feature: { dataZoom: { yAxisIndex: 0, title: { zoom: "Zoom", back: "Back" } }, restore: { title: "Reset" }, saveAsImage: { title: "PNG", backgroundColor: th.surface, pixelRatio: 2 } },
    },
    xAxis: { type: xType, name: xLabel, nameLocation: "middle", nameGap: 28, min: s.swap ? c.yMin ?? undefined : c.xMin ?? undefined, max: s.swap ? c.yMax ?? undefined : c.xMax ?? undefined, ...axisCommon, splitLine: { show: !cat, ...axisCommon.splitLine } },
    yAxis: { type: yType, name: yLabel, nameLocation: "middle", nameGap: 46, min: s.swap ? c.xMin ?? undefined : c.yMin ?? undefined, max: s.swap ? c.xMax ?? undefined : c.yMax ?? undefined, scale: true, ...axisCommon },
    dataZoom: zoom
      ? [
          { type: "inside", xAxisIndex: 0, filterMode: "none" },
          { type: "inside", yAxisIndex: 0, filterMode: "none", zoomOnMouseWheel: "shift", moveOnMouseMove: "shift" },
          ...(cat ? [] : [{ type: "slider", xAxisIndex: 0, filterMode: "none", height: 16, bottom: 8, borderColor: th.line, fillerColor: th.accent + "22", handleStyle: { color: th.accent }, textStyle: { color: th.muted } }]),
          { type: "slider", yAxisIndex: 0, filterMode: "none", width: 14, right: 6, borderColor: th.line, fillerColor: th.accent + "22", handleStyle: { color: th.accent }, textStyle: { color: th.muted } },
        ]
      : undefined,
    series: series.map((x, i) => ({
      name: x.name,
      type: kind,
      data: x.data,
      smooth: c.type === "function" ? true : !!c.smooth,
      showSymbol: c.type === "scatter" ? true : c.showPoints !== false && c.type !== "function",
      symbolSize: c.type === "scatter" ? 9 : 6,
      lineStyle: { width: 2.4 },
      areaStyle: c.type === "area" ? { opacity: 0.16 } : undefined,
      itemStyle: { color: x.color || colors[i % colors.length], borderRadius: kind === "bar" ? [5, 5, 0, 0] : 0 },
      barMaxWidth: 42,
      connectNulls: false,
      markLine: i === 0 ? markLine : undefined,
      emphasis: { focus: "series" },
    })),
  };
}
