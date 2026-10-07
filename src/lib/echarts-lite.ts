// Tree-shaken ECharts: only the line chart, the components the dashboard
// charts actually use (grid, tooltip, legend) and the canvas renderer.
// The full "echarts" entry pulls in every chart type, map and renderer
// (~1.1 MB); this keeps the lazily-loaded chunk a fraction of that. Add a
// chart/component here before using it in an option object.
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export const init = echarts.init;
export type ECharts = echarts.ECharts;
