import { useEffect, useRef } from "react";
import { echarts, type EOption } from "./echarts";

/** ECharts nusxasini DOM elementga ulash; o'lcham o'zgarganda qayta chizish */
export function useEChart(option: EOption | null, deps: unknown[] = [], onInit?: (c: echarts.ECharts) => void, renderer: "canvas" | "svg" = "canvas") {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, undefined, { renderer });
    chart.current = c;
    onInit?.(c);
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (chart.current && option) chart.current.setOption(option, { notMerge: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option, ...deps]);
  return { ref, chart };
}

export function cssVar(name: string, fallback = ""): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
