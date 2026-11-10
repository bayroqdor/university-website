// ECharts: faqat kerakli qismlar (bundle hajmi kichik bo'lishi uchun)
import { BarChart, GaugeChart, HeatmapChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";

echarts.use([
  LineChart, BarChart, ScatterChart, PieChart, GaugeChart, HeatmapChart,
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, ToolboxComponent, MarkLineComponent, MarkAreaComponent, TitleComponent, VisualMapComponent,
  CanvasRenderer, SVGRenderer,
]);

export { echarts };
export type { EChartsCoreOption as EOption } from "echarts/core";
