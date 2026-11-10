import { ArrowLeftRight, RotateCcw } from "lucide-react";
import { useContext, useEffect, useMemo, useState } from "react";
import type { Transform } from "../lib/expr";
import { cssVar, useEChart } from "../lib/useEChart";
import { buildOption, initialState, type ChartConfig, type ChartState } from "./chart";
import { ChartLabels } from "./labels";
import { PrintMode } from "./print";


function useThemeTick(): number {
  // mavzu (yorug'/qorong'i) o'zgarsa grafik ranglarini yangilash
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const mo = new MutationObserver(() => setTick((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
    return () => mo.disconnect();
  }, []);
  return tick;
}

const num = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

export function ChartView({ config }: { config: ChartConfig }) {
  const t = useContext(ChartLabels);
  const print = useContext(PrintMode);
  const [st, setSt] = useState<ChartState>(() => initialState(config));
  const tick = useThemeTick();
  useEffect(() => setSt(initialState(config)), [config]);
  const option = useMemo(() => {
    try {
      const o = buildOption(config, st, {
        ink: cssVar("--ink", "#161512"),
        muted: cssVar("--muted", "#7a746a"),
        line: cssVar("--line", "#e4ded3"),
        surface: cssVar("--surface", "#ffffff"),
        accent: cssVar("--accent", "#C8812A"),
        font: cssVar("--font-sans", "Inter, sans-serif"),
      });
      if (!print) return o;
      // bosma: animatsiya, asboblar paneli, maslahat oynasi va zoom slayderlari kerak emas
      const grid = (o as { grid?: Record<string, unknown> }).grid;
      return { ...o, animation: false, toolbox: undefined, tooltip: undefined, dataZoom: undefined, ...(grid ? { grid: { ...grid, right: 18, bottom: 30 } } : {}) };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, st, tick, print]);
  const { ref, chart } = useEChart(option, [], undefined, print ? "svg" : "canvas");
  useEffect(() => {
    // PDF tayyorlovchi grafik chizilganini shu belgi orqali biladi
    if (print && option && chart.current) ref.current?.setAttribute("data-rendered", "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option, print]);
  const interactive = config.controls !== false && !print;
  const numeric = !["gauge", "pie"].includes(config.type) && !(config.type === "bar" && config.categorical !== false) && !config.categorical;
  const g = config.gauge;
  const reset = () => {
    setSt(initialState(config));
    chart.current?.dispatchAction({ type: "restore" });
  };
  return (
    <div className="chart-block">
      {(config.title || interactive) && (
        <div className="chart-head">
          {config.title && <div className="chart-title">{config.title}</div>}
          {interactive && numeric && (
            <div className="chart-tools" role="toolbar">
              <div className="seg" title="X">
                <span>X</span>
                <button className={!st.xLog ? "on" : ""} onClick={() => setSt({ ...st, xLog: false })}>{t.chart_linear}</button>
                <button className={st.xLog ? "on" : ""} onClick={() => setSt({ ...st, xLog: true })}>{t.chart_log}</button>
              </div>
              <div className="seg" title="Y">
                <span>Y</span>
                <button className={!st.yLog ? "on" : ""} onClick={() => setSt({ ...st, yLog: false })}>{t.chart_linear}</button>
                <button className={st.yLog ? "on" : ""} onClick={() => setSt({ ...st, yLog: true })}>{t.chart_log}</button>
              </div>
              <select value={st.transform} onChange={(e) => setSt({ ...st, transform: e.target.value as Transform })} aria-label={t.chart_transform}>
                <option value="none">{config.type === "function" ? t.chart_t_none : "y"}</option>
                <option value="derivative">{t.chart_t_derivative}</option>
                <option value="integral">{t.chart_t_integral}</option>
                <option value="normalize">{t.chart_t_normalize}</option>
                <option value="cumsum">{t.chart_t_cumsum}</option>
              </select>
              <button className="icon" onClick={() => setSt({ ...st, swap: !st.swap })} title={t.chart_swap} aria-label={t.chart_swap}>
                <ArrowLeftRight size={14} />
              </button>
              <button className="icon" onClick={reset} title={t.chart_reset} aria-label={t.chart_reset}>
                <RotateCcw size={14} />
              </button>
            </div>
          )}
        </div>
      )}
      {print && config.params && config.params.length > 0 && config.type === "function" && (
        <div className="chart-params-print">
          {config.params.map((p) => (
            <span key={p.name}>
              <i>{p.label || p.name}</i> = {num(p.value)}
            </span>
          ))}
          <small>{t.p_interactive}</small>
        </div>
      )}
      {!print && config.params && config.params.length > 0 && config.type === "function" && (
        <div className="chart-params">
          {config.params.map((p) => (
            <label key={p.name} className="param">
              <span className="param-name">{p.label || p.name}</span>
              <input type="range" min={p.min} max={p.max} step={p.step || (p.max - p.min) / 100} value={st.params[p.name] ?? p.value} onChange={(e) => setSt({ ...st, params: { ...st.params, [p.name]: Number(e.target.value) } })} />
              <output>{num(st.params[p.name] ?? p.value)}</output>
            </label>
          ))}
        </div>
      )}
      {!print && config.type === "gauge" && g?.interactive && (
        <div className="chart-params">
          <label className="param">
            <span className="param-name">{g.label || "value"}</span>
            <input type="range" min={g.min} max={g.max} step={(g.max - g.min) / 200} value={st.gaugeValue ?? g.value} onChange={(e) => setSt({ ...st, gaugeValue: Number(e.target.value) })} />
            <output>{num(st.gaugeValue ?? g.value)}</output>
          </label>
        </div>
      )}
      <div ref={ref} className="chart-canvas" style={{ height: config.height || 360 }} />
      {(config.caption || (interactive && numeric && config.zoom !== false)) && (
        <div className="chart-caption">
          {config.caption}
          {interactive && numeric && config.zoom !== false && <span className="hint">{t.chart_zoom_hint}</span>}
        </div>
      )}
    </div>
  );
}
