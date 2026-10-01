import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, FileSpreadsheet, Filter } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import { currency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import {
  useCallPickupByHour,
  useConversionQualityWeekly,
  useDealFlowWeekly,
  useFunnelFlow,
  useLostReasonsSummary,
  usePipelineStageStats,
  useRevenueSeries,
  useSalesAnalyticsSummary,
} from "@/hooks/use-crm-data";
import { useEChartsTokens, withAlpha } from "@/hooks/use-echarts-theme";
import { useI18n } from "@/lib/i18n";

function ChooseFunnelPrompt() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <Filter className="h-5 w-5 text-subtle" />
      <p className="text-sm font-medium text-muted-foreground">{t("charts.chooseFunnel")}</p>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-popover)",
  boxShadow: "var(--shadow-elevated)",
  fontSize: 12,
};

// Currency Y-axis labels used to always divide by 1000 ("15000k" for a
// revenue in the tens of millions), which ran wider than the chart's
// margin allowed for and got clipped down to "0000k" on the left edge for
// any account with enough revenue. Step up to "M" once a value crosses a
// million so the label stays short regardless of scale.
function abbreviateAxisValue(v: number): string {
  if (v >= 1_000_000) return `${Math.round(v / 1_000_000)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return `${v}`;
}

export function RevenueChart() {
  const { t } = useI18n();
  const data = useRevenueSeries();
  const tokens = useEChartsTokens();
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chartRef.current;
    if (!el || !tokens.primary) return;
    // ECharts is a large, standalone library (1MB+) that nothing else in
    // this already-lazy-loaded chart bundle needs -- a dynamic import here
    // (rather than a static one at the top of the file) puts it in its own
    // chunk, fetched only once this one chart actually mounts, instead of
    // weighing down every other chart in this file on a phone connection.
    let cancelled = false;
    let chart: import("echarts").ECharts | undefined;
    let observer: ResizeObserver | undefined;
    void import("echarts").then((echarts) => {
      if (cancelled || !el) return;
      chart = echarts.init(el);
      chart.setOption({
        animationDuration: 700,
        animationEasing: "cubicOut",
        textStyle: { fontFamily: "Onest, system-ui, sans-serif", color: tokens.mutedForeground },
        grid: { left: 8, right: 12, top: 16, bottom: 28, containLabel: true },
        tooltip: {
          trigger: "axis",
          backgroundColor: tokens.popover,
          borderColor: tokens.border,
          textStyle: { color: tokens.foreground, fontSize: 12 },
          extraCssText: "border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12)",
          valueFormatter: (v: unknown) => currency(v as number),
        },
        legend: {
          data: [t("charts.revenue.legendRevenue"), t("charts.revenue.legendPipeline")],
          top: 0,
          right: 0,
          icon: "circle",
          itemWidth: 8,
          itemHeight: 8,
          textStyle: { color: tokens.mutedForeground, fontSize: 12 },
        },
        xAxis: {
          type: "category",
          data: data.map((d) => d.label),
          boundaryGap: false,
          axisLine: { lineStyle: { color: tokens.border } },
          axisTick: { show: false },
          axisLabel: { color: tokens.subtle, fontSize: 11 },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: tokens.border, type: "dashed" } },
          axisLabel: { color: tokens.subtle, fontSize: 11, formatter: abbreviateAxisValue },
        },
        series: [
          {
            name: t("charts.revenue.legendPipeline"),
            type: "line",
            smooth: 0.35,
            symbol: "circle",
            symbolSize: 6,
            showSymbol: false,
            data: data.map((d) => d.pipeline),
            lineStyle: { width: 2, color: tokens.success },
            itemStyle: { color: tokens.success },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: withAlpha(tokens.success, 0.18) },
                  { offset: 1, color: withAlpha(tokens.success, 0) },
                ],
              },
            },
          },
          {
            name: t("charts.revenue.legendRevenue"),
            type: "line",
            smooth: 0.35,
            symbol: "circle",
            symbolSize: 6,
            showSymbol: false,
            data: data.map((d) => d.revenue),
            lineStyle: { width: 2.5, color: tokens.primary },
            itemStyle: { color: tokens.primary },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: withAlpha(tokens.primary, 0.26) },
                  { offset: 1, color: withAlpha(tokens.primary, 0) },
                ],
              },
            },
          },
        ],
      });
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(el);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      chart?.dispose();
    };
  }, [data, tokens, t]);

  return (
    <SectionCard
      title={t("charts.revenue.title")}
      description={t("charts.revenue.desc")}
      info={t("charts.revenue.info")}
      className="xl:col-span-2"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => toast.success(t("charts.revenue.pdfQueued"))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" /> {t("charts.pdf")}
          </button>
          <button
            onClick={() => toast.success(t("charts.revenue.excelQueued"))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> {t("charts.excel")}
          </button>
        </div>
      }
    >
      <div ref={chartRef} className="h-[260px] w-full sm:h-[300px]" />
    </SectionCard>
  );
}

export function PipelineChart({ funnel }: { funnel: string | null }) {
  const { t } = useI18n();
  const stats = usePipelineStageStats(funnel);
  if (!funnel) {
    return (
      <SectionCard
        title={t("charts.pipeline.title")}
        description={t("charts.pipeline.desc")}
        info={t("charts.pipeline.info")}
      >
        <ChooseFunnelPrompt />
      </SectionCard>
    );
  }
  return (
    <SectionCard
      title={t("charts.pipeline.title")}
      description={t("charts.pipeline.desc")}
      info={t("charts.pipeline.info")}
    >
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats} margin={{ left: -18, right: 8, top: 4 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="stage"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              stroke="var(--color-subtle)"
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={abbreviateAxisValue}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              stroke="var(--color-subtle)"
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => currency(v)}
              cursor={{ fill: "var(--color-accent)" }}
            />
            <Bar dataKey="value" radius={[8, 8, 4, 4]} animationDuration={700}>
              {stats.map((s) => (
                <Cell
                  key={s.stage}
                  fill={
                    s.stage === "Lost"
                      ? "var(--color-destructive)"
                      : s.stage === "Won"
                        ? "var(--color-success)"
                        : "var(--color-primary)"
                  }
                  fillOpacity={s.stage === "Won" || s.stage === "Lost" ? 0.85 : 0.75}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">
        {stats.slice(0, 3).map((s) => (
          <div key={s.stage}>
            <dt className="text-[11px] text-subtle">{s.stage}</dt>
            <dd className="mt-1 text-sm font-semibold text-foreground">
              {t("charts.pipeline.deals", { count: s.deals })}
            </dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

export function SalesFunnel({ funnel }: { funnel: string | null }) {
  const { t } = useI18n();
  const flow = useFunnelFlow(funnel);
  // Bar width is each stage's count relative to the largest stage — not
  // flow[0], which broke whenever the first stage in pipeline order (e.g.
  // an unused "Неразобранное") happened to have 0 leads: dividing by that
  // 0 made every other bar's width Infinity/NaN, rendering full-width
  // regardless of the stage's real share.
  const max = Math.max(1, ...flow.map((s) => s.count));
  if (!funnel) {
    return (
      <SectionCard
        title={t("charts.funnel.title")}
        description={t("charts.funnel.desc")}
        info={t("charts.funnel.info")}
      >
        <ChooseFunnelPrompt />
      </SectionCard>
    );
  }
  return (
    <SectionCard
      title={t("charts.funnel.title")}
      description={t("charts.funnel.desc")}
      info={t("charts.funnel.info")}
    >
      <ol className="space-y-3">
        {flow.map((s) => (
          <li key={s.stage}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">{s.stage}</span>
              <span className="text-xs text-subtle">
                {s.count.toLocaleString()} · {s.conversion}%
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700 ease-out",
                  s.stage === "Lost"
                    ? "bg-destructive"
                    : s.stage === "Won"
                      ? "bg-success"
                      : "bg-primary",
                )}
                style={{ width: `${(s.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

export function MonthlyRevenueTrendChart({ funnel }: { funnel: string | null }) {
  const { t } = useI18n();
  const { monthlyTrend } = useSalesAnalyticsSummary(funnel);

  return (
    <SectionCard
      title={t("dash.card.monthlyTrend")}
      description={t("dash.card.monthlyTrendDesc")}
      info={t("dash.card.monthlyTrendInfo")}
    >
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={monthlyTrend} margin={{ left: -14, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="var(--color-subtle)"
            />
            <YAxis
              tickFormatter={abbreviateAxisValue}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="var(--color-subtle)"
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => currency(v)} />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-primary)"
              strokeWidth={2.5}
              dot={false}
              animationDuration={700}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

export function RevenueByOwnerChart({
  funnel,
  dateRange,
}: {
  funnel: string | null;
  dateRange?: { from: Date | null; to: Date | null };
}) {
  const { t } = useI18n();
  const { perOwner } = useSalesAnalyticsSummary(funnel, dateRange);

  if (perOwner.length === 0) {
    return (
      <SectionCard
        title={t("dash.card.revenueByOwner")}
        description={t("dash.card.revenueByOwnerDesc")}
        info={t("dash.card.revenueByOwnerInfo")}
      >
        <p className="py-10 text-center text-sm text-subtle">{t("audio.chart.noData")}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={t("dash.card.revenueByOwner")}
      description={t("dash.card.revenueByOwnerDesc")}
      info={t("dash.card.revenueByOwnerInfo")}
    >
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={perOwner} margin={{ left: -14, right: 8, top: 8, bottom: 24 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              stroke="var(--color-subtle)"
              interval="preserveStartEnd"
              angle={-20}
              textAnchor="end"
              height={50}
              tickFormatter={(name: string) => (name.length > 14 ? `${name.slice(0, 14)}…` : name)}
            />
            <YAxis
              tickFormatter={abbreviateAxisValue}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="var(--color-subtle)"
            />
            <Tooltip
              cursor={{ fill: "var(--color-accent)" }}
              contentStyle={tooltipStyle}
              formatter={(v: number) => currency(v)}
            />
            <Bar
              dataKey="revenue"
              fill="var(--color-primary)"
              radius={[8, 8, 0, 0]}
              maxBarSize={44}
              animationDuration={700}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

export function LostReasonsChart({
  funnel,
  dateRange,
}: {
  funnel: string | null;
  dateRange?: { from: Date | null; to: Date | null };
}) {
  const { t } = useI18n();
  const reasons = useLostReasonsSummary(funnel, dateRange);

  if (reasons.length === 0) {
    return (
      <SectionCard
        title={t("dash.card.lostReasons")}
        description={t("dash.card.lostReasonsDesc")}
        info={t("dash.card.lostReasonsInfo")}
      >
        <p className="py-10 text-center text-sm text-subtle">{t("audio.chart.noData")}</p>
      </SectionCard>
    );
  }

  // A reason string can run long ("Mijoz narxdan voz kechdi" etc.) -- a
  // horizontal layout keeps the full label readable instead of truncating
  // or rotating it under a vertical bar.
  const chartHeight = Math.max(180, reasons.length * 40);

  return (
    <SectionCard
      title={t("dash.card.lostReasons")}
      description={t("dash.card.lostReasonsDesc")}
      info={t("dash.card.lostReasonsInfo")}
    >
      <div className="w-full" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={reasons}
            layout="vertical"
            margin={{ left: 8, right: 24, top: 8, bottom: 8 }}
          >
            <CartesianGrid stroke="var(--color-border)" horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="var(--color-subtle)"
            />
            <YAxis
              type="category"
              dataKey="reason"
              width={160}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="var(--color-subtle)"
            />
            <Tooltip cursor={{ fill: "var(--color-accent)" }} contentStyle={tooltipStyle} />
            <Bar
              dataKey="count"
              fill="var(--color-destructive)"
              radius={[0, 8, 8, 0]}
              maxBarSize={22}
              animationDuration={700}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

export function DealFlowChart({ funnel }: { funnel: string | null }) {
  const { t } = useI18n();
  const data = useDealFlowWeekly(funnel);

  if (data.length === 0) {
    return (
      <SectionCard
        title={t("dash.card.dealFlow")}
        description={t("dash.card.dealFlowDesc")}
        info={t("dash.card.dealFlowInfo")}
      >
        <p className="py-10 text-center text-sm text-subtle">{t("audio.chart.noData")}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={t("dash.card.dealFlow")}
      description={t("dash.card.dealFlowDesc")}
      info={t("dash.card.dealFlowInfo")}
    >
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ left: -14, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="var(--color-subtle)"
            />
            <YAxis
              yAxisId="count"
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="var(--color-subtle)"
              label={{
                value: t("dash.card.dealFlowDeals"),
                angle: -90,
                position: "insideLeft",
                fontSize: 11,
                fill: "var(--color-subtle)",
              }}
            />
            <YAxis
              yAxisId="revenue"
              orientation="right"
              tickFormatter={abbreviateAxisValue}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="var(--color-subtle)"
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number, name: string) =>
                name === t("dash.card.dealFlowRevenue") ? currency(v) : v
              }
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              yAxisId="count"
              dataKey="created"
              name={t("dash.card.dealFlowCreated")}
              fill="var(--color-muted)"
              stroke="var(--color-border)"
              strokeDasharray="4 3"
              radius={[6, 6, 0, 0]}
              maxBarSize={40}
              animationDuration={700}
            />
            <Bar
              yAxisId="count"
              dataKey="won"
              name={t("dash.card.dealFlowWon")}
              stackId="outcome"
              fill="var(--color-success)"
              maxBarSize={40}
              animationDuration={700}
            />
            <Bar
              yAxisId="count"
              dataKey="lost"
              name={t("dash.card.dealFlowLost")}
              stackId="outcome"
              fill="var(--color-destructive)"
              radius={[6, 6, 0, 0]}
              maxBarSize={40}
              animationDuration={700}
            />
            <Line
              yAxisId="revenue"
              type="monotone"
              dataKey="revenue"
              name={t("dash.card.dealFlowRevenue")}
              stroke="var(--color-warning)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5 }}
              animationDuration={700}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

export function ConversionQualityChart({ funnel }: { funnel: string | null }) {
  const { t } = useI18n();
  const [scoreMin, setScoreMin] = useState(70);
  const [scoreMax, setScoreMax] = useState(100);
  const { rows, correlation } = useConversionQualityWeekly(funnel, scoreMin, scoreMax);

  return (
    <SectionCard
      title={t("dash.card.conversionQuality")}
      description={t("dash.card.conversionQualityDesc")}
      info={t("dash.card.conversionQualityInfo")}
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-subtle">{t("dash.card.scoreRange")}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={scoreMin}
            onChange={(e) => setScoreMin(Math.min(Number(e.target.value), scoreMax))}
            className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          />
          <span className="text-xs text-subtle">–</span>
          <input
            type="number"
            min={0}
            max={100}
            value={scoreMax}
            onChange={(e) => setScoreMax(Math.max(Number(e.target.value), scoreMin))}
            className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          />
          {correlation != null && (
            <span className="ml-2 rounded-lg bg-accent px-2 py-1 text-xs font-semibold text-foreground">
              {t("dash.card.correlation")}:{" "}
              <span className={correlation >= 0 ? "text-success" : "text-destructive"}>
                {correlation >= 0 ? "+" : ""}
                {correlation}
              </span>
            </span>
          )}
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-subtle">{t("audio.chart.noData")}</p>
      ) : (
        <>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ left: -14, right: 8, top: 8 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="week"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  stroke="var(--color-subtle)"
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}`}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  stroke="var(--color-subtle)"
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="conversionPct"
                  name={t("dash.card.conversionPct")}
                  stroke="var(--color-success)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                  connectNulls
                  animationDuration={700}
                />
                <Line
                  type="monotone"
                  dataKey="inRangePct"
                  name={t("dash.card.inRangePct", {
                    min: String(scoreMin),
                    max: String(scoreMax),
                  })}
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={{ r: 5 }}
                  connectNulls
                  animationDuration={700}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-subtle">{t("dash.card.conversionQualityHint")}</p>
        </>
      )}
    </SectionCard>
  );
}

function hourLabel(h: number): string {
  return `${String(h % 24).padStart(2, "0")}:00`;
}

// Shared by Boshqaruv paneli and Lid tahlili -- shows what hour of the day
// customers actually pick up the phone, so reps know the most effective
// window to be calling in instead of guessing.
export function CallPickupByHourChart({
  dateRange,
}: {
  dateRange?: { from: Date | null; to: Date | null };
}) {
  const { t } = useI18n();
  const { rows, bestHour, isLoading } = useCallPickupByHour(dateRange ?? null);
  const totalLabel = t("callPickup.total");
  const connectedLabel = t("callPickup.connected");
  const data = rows.map((r) => ({
    hour: hourLabel(r.hour),
    [totalLabel]: r.total,
    [connectedLabel]: r.connected,
  }));
  const hasData = rows.some((r) => r.total > 0);

  return (
    <SectionCard
      title={t("callPickup.title")}
      description={t("callPickup.desc")}
      info={t("callPickup.info")}
    >
      {!isLoading && bestHour && bestHour.total > 0 && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-success/10 px-3 py-1.5 text-sm font-semibold text-success">
          {t("callPickup.bestWindow")}: {hourLabel(bestHour.hour)}–{hourLabel(bestHour.hour + 1)}
          <span className="text-xs font-normal text-success/80">({bestHour.rate}%)</span>
        </div>
      )}
      {!isLoading && !hasData ? (
        <p className="py-10 text-center text-sm text-subtle">{t("audio.chart.noData")}</p>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: -14, right: 8, top: 8 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="hour"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                stroke="var(--color-subtle)"
                interval={1}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                stroke="var(--color-subtle)"
                allowDecimals={false}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey={totalLabel}
                fill="var(--color-mint-border)"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
              <Bar
                dataKey={connectedLabel}
                fill="var(--color-primary)"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}
