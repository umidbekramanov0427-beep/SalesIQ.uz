import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlarmClockOff,
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  ListChecks,
  PhoneCall,
  PhoneMissed,
  User,
  Users,
} from "lucide-react";
import { SectionCard, StatCard, InfoTip } from "@/components/layout/Primitives";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  useAmoCrmTaskStats,
  useDailyReportStats,
  useFunnelCallStats,
  useFunnelStats,
  type DailyReportScope,
  type DailyReportStats,
  type ProfileRow,
} from "@/hooks/use-crm-data";
import { useEChartsTokens, withAlpha } from "@/hooks/use-echarts-theme";
import { FilterTile, TileOption } from "@/components/filters/FilterTile";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import { AmountRangeFilter, type AmountRangeValue } from "@/components/filters/AmountRangeFilter";

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-popover)",
  boxShadow: "var(--shadow-elevated)",
  fontSize: 12,
};

type Period = "daily" | "weekly" | "monthly";

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function startOfWeek(d: Date): Date {
  const c = startOfDay(d);
  const day = c.getDay();
  c.setDate(c.getDate() - ((day + 6) % 7)); // Monday-start week
  return c;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
const DAY_LABELS_SHORT = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const MONTH_LABELS_SHORT = [
  "Yan",
  "Fev",
  "Mar",
  "Apr",
  "May",
  "Iyun",
  "Iyul",
  "Avg",
  "Sen",
  "Okt",
  "Noy",
  "Dek",
];

/* ------------------------------------------------------------------ */
/* Period strip -- a navigable row of day/week/month tiles, one        */
/* selected at a time. Same dark-tile treatment as Lid tahlili's        */
/* month-strip (bg-surface), generalized to day/week granularity too.  */
/* ------------------------------------------------------------------ */

function PeriodStrip({
  period,
  selected,
  onSelect,
  t,
}: {
  period: Period;
  selected: Date;
  onSelect: (d: Date) => void;
  t: (k: string) => string;
}) {
  const today = startOfDay(new Date());
  const [pageAnchor, setPageAnchor] = useState<Date>(() => {
    if (period === "daily") return startOfWeek(selected);
    if (period === "weekly") return startOfWeek(selected);
    return new Date(selected.getFullYear(), 0, 1);
  });

  const tiles = useMemo(() => {
    if (period === "daily") {
      return Array.from({ length: 7 }, (_, i) => addDays(pageAnchor, i));
    }
    if (period === "weekly") {
      return Array.from({ length: 8 }, (_, i) => addDays(pageAnchor, (i - 7) * 7));
    }
    return Array.from({ length: 12 }, (_, i) => new Date(pageAnchor.getFullYear(), i, 1));
  }, [period, pageAnchor]);

  function shiftPage(dir: 1 | -1) {
    if (period === "daily") setPageAnchor((p) => addDays(p, dir * 7));
    else if (period === "weekly") setPageAnchor((p) => addDays(p, dir * 8 * 7));
    else setPageAnchor((p) => new Date(p.getFullYear() + dir, 0, 1));
  }

  function goToday() {
    const wk = startOfWeek(today);
    setPageAnchor(period === "monthly" ? new Date(today.getFullYear(), 0, 1) : wk);
    onSelect(period === "weekly" ? wk : today);
  }

  const headerLabel = useMemo(() => {
    if (period === "daily") {
      const end = addDays(pageAnchor, 6);
      return `${pageAnchor.getDate()} ${MONTH_LABELS_SHORT[pageAnchor.getMonth()]} – ${end.getDate()} ${MONTH_LABELS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
    }
    if (period === "weekly") {
      const start = tiles[0]!;
      const end = tiles[tiles.length - 1]!;
      return `${MONTH_LABELS_SHORT[start.getMonth()]}–${MONTH_LABELS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
    }
    return `${pageAnchor.getFullYear()}`;
  }, [period, pageAnchor, tiles]);

  const nextDisabled =
    period === "monthly"
      ? pageAnchor.getFullYear() >= today.getFullYear()
      : pageAnchor >= startOfWeek(today);

  return (
    <div className="surface-card mt-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-foreground">{headerLabel}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => shiftPage(-1)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-bold text-foreground transition-colors hover:bg-accent"
          >
            {t("dash.report.today")}
          </button>
          <button
            type="button"
            onClick={() => shiftPage(1)}
            disabled={nextDisabled}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        className={cn(
          // Capped track width (not a plain grid-cols-N, which stretches
          // every cell to fill whatever width the row happens to have) --
          // on a wide desktop these tiles only hold 2-3 short characters,
          // so letting them fill the full content width is what produced
          // the oversized, mostly-empty day boxes.
          "mt-3 grid gap-2",
          period === "daily" && "grid-cols-4 sm:grid-cols-[repeat(7,minmax(0,92px))]",
          period === "weekly" && "grid-cols-4 sm:grid-cols-[repeat(8,minmax(0,92px))]",
          period === "monthly" &&
            "grid-cols-4 sm:grid-cols-[repeat(6,minmax(0,92px))] xl:grid-cols-[repeat(12,minmax(0,92px))]",
        )}
      >
        {tiles.map((tile) => {
          const isFuture =
            period === "monthly"
              ? (tile > today && tile.getMonth() !== today.getMonth()) || tile > today
              : tile > today;
          const isSelected =
            period === "monthly"
              ? tile.getFullYear() === selected.getFullYear() &&
                tile.getMonth() === selected.getMonth()
              : startOfDay(tile).getTime() === startOfDay(selected).getTime();
          const topLabel =
            period === "daily"
              ? DAY_LABELS_SHORT[(tile.getDay() + 6) % 7]
              : period === "weekly"
                ? `${MONTH_LABELS_SHORT[tile.getMonth()]}`
                : `${tile.getFullYear()}`;
          const mainLabel =
            period === "daily"
              ? `${tile.getDate()}`
              : period === "weekly"
                ? `${tile.getDate()}–${addDays(tile, 6).getDate()}`
                : MONTH_LABELS_SHORT[tile.getMonth()];
          return (
            <button
              key={tile.toISOString()}
              type="button"
              disabled={isFuture}
              onClick={() => onSelect(tile)}
              className={cn(
                "rounded-xl border px-2 py-2.5 text-center transition-colors",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : isFuture
                    ? "cursor-not-allowed border-border/50 bg-surface/50 text-subtle/50"
                    : "border-border bg-surface text-foreground hover:bg-accent",
              )}
            >
              <p
                className={cn(
                  "text-[10px]",
                  isSelected ? "text-primary-foreground/80" : "text-subtle",
                )}
              >
                {topLabel}
              </p>
              <p className="text-sm font-bold">{mainLabel}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A single ratio against 100%, matching the "Overall konversiya" /    */
/* "Bog'langanlardan" cards from the reference -- a horizontal meter   */
/* bar, not a 2-slice donut. A pie of two slices is a well-known chart */
/* mistake (see the dataviz skill's "choosing a form" table: "a single */
/* ratio against a limit" -> a meter, never a 2-slice pie) -- reading  */
/* one ratio off a ring takes real angle-estimation, where the same    */
/* number on a bar is instant, and a meter's fill color plus its own   */
/* lighter-tint track communicate state without a separate legend.     */
/* ------------------------------------------------------------------ */

function RatioMeter({
  title,
  pct,
  numeratorLabel,
  numeratorValue,
  denominatorLabel,
  denominatorValue,
  tone = "primary",
  info,
}: {
  title: string;
  pct: number;
  numeratorLabel: string;
  numeratorValue: number;
  denominatorLabel: string;
  denominatorValue: number;
  tone?: "primary" | "success";
  info: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const toneClass =
    tone === "success"
      ? { track: "bg-success/15", fill: "bg-success", text: "text-success" }
      : { track: "bg-primary/15", fill: "bg-primary", text: "text-primary" };
  return (
    <SectionCard title={title} info={info}>
      <p className={cn("font-display text-3xl font-bold tabular-nums", toneClass.text)}>{pct}%</p>
      <div className={cn("mt-3 h-2.5 w-full overflow-hidden rounded-full", toneClass.track)}>
        <div
          className={cn("h-full rounded-full transition-[width] duration-700", toneClass.fill)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", toneClass.fill)} />
          {numeratorLabel}
        </span>
        <span className="font-semibold tabular-nums text-foreground">{numeratorValue}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
          {denominatorLabel}
        </span>
        <span className="font-semibold tabular-nums text-foreground">{denominatorValue}</span>
      </div>
    </SectionCard>
  );
}

// Single-series ECharts area, matching the Dashboard's own RevenueChart --
// smooth gradient line instead of Recharts' flat stroke, same live
// re-theming via useEChartsTokens.
function RevenueTrendChart({
  data,
  format,
}: {
  data: { label: string; revenue: number }[];
  format: (v: number) => string;
}) {
  const tokens = useEChartsTokens();
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chartRef.current;
    if (!el || !tokens.success) return;
    let cancelled = false;
    let chart: import("echarts").ECharts | undefined;
    let observer: ResizeObserver | undefined;
    void import("echarts").then((echarts) => {
      if (cancelled || !el) return;
      chart = echarts.init(el);
      chart.setOption({
        animationDuration: 700,
        animationEasing: "cubicOut",
        textStyle: { fontFamily: "Geist, system-ui, sans-serif", color: tokens.mutedForeground },
        grid: { left: 8, right: 12, top: 12, bottom: 24, containLabel: true },
        tooltip: {
          trigger: "axis",
          backgroundColor: tokens.popover,
          borderColor: tokens.border,
          textStyle: { color: tokens.foreground, fontSize: 12 },
          extraCssText: "border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12)",
          valueFormatter: (v: unknown) => format(v as number),
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
          axisLabel: {
            color: tokens.subtle,
            fontSize: 11,
            formatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`),
          },
        },
        series: [
          {
            type: "line",
            smooth: 0.35,
            symbol: "circle",
            symbolSize: 6,
            showSymbol: false,
            data: data.map((d) => d.revenue),
            lineStyle: { width: 2.5, color: tokens.success },
            itemStyle: { color: tokens.success },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: withAlpha(tokens.success, 0.22) },
                  { offset: 1, color: withAlpha(tokens.success, 0) },
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
  }, [data, tokens, format]);

  return <div ref={chartRef} className="h-[200px] w-full" />;
}

/* ------------------------------------------------------------------ */
/* The Team/Operator/Funnel/Date/Amount filter tiles, shared between    */
/* DashboardDailyReport (below) and dashboard.tsx's own filter card --  */
/* both pages need the same row, just wired to their own separate       */
/* filter state.                                                        */
/* ------------------------------------------------------------------ */

export function DashboardFilterRow({
  funnel,
  onFunnelChange,
  teamId,
  onTeamChange,
  operatorId,
  onOperatorChange,
  dateFilter,
  onDateFilterChange,
  amountRange,
  onAmountRangeChange,
  funnelNames,
  rops,
  operators,
}: {
  funnel: string | null;
  onFunnelChange: (v: string | null) => void;
  teamId: string | null;
  onTeamChange: (v: string | null) => void;
  operatorId: string | null;
  onOperatorChange: (v: string | null) => void;
  dateFilter: DateFilterValue;
  onDateFilterChange: (v: DateFilterValue) => void;
  amountRange: AmountRangeValue;
  onAmountRangeChange: (v: AmountRangeValue) => void;
  funnelNames: string[];
  rops: ProfileRow[];
  operators: ProfileRow[];
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2">
      <FilterTile
        icon={Users}
        label={t("leadAnalytics.jamoaLabel")}
        value={rops.find((r) => r.id === teamId)?.full_name ?? t("leadAnalytics.allTeams")}
      >
        <TileOption
          label={t("leadAnalytics.allTeams")}
          active={!teamId}
          onClick={() => {
            onTeamChange(null);
            onOperatorChange(null);
          }}
        />
        {rops.map((r) => (
          <TileOption
            key={r.id}
            label={r.full_name}
            active={teamId === r.id}
            onClick={() => {
              onTeamChange(r.id);
              onOperatorChange(null);
            }}
          />
        ))}
      </FilterTile>
      <FilterTile
        icon={User}
        label={t("leadAnalytics.operatorLabel")}
        value={
          operators.find((m) => m.id === operatorId)?.full_name ?? t("leadAnalytics.allManagers")
        }
      >
        <TileOption
          label={t("leadAnalytics.allManagers")}
          active={!operatorId}
          onClick={() => onOperatorChange(null)}
        />
        {operators.map((m) => (
          <TileOption
            key={m.id}
            label={m.full_name}
            active={operatorId === m.id}
            onClick={() => onOperatorChange(m.id)}
          />
        ))}
      </FilterTile>
      <FilterTile
        icon={GitBranch}
        label={t("leadAnalytics.funnelLabel")}
        value={funnel ?? t("leadFilter.allFunnels")}
      >
        <TileOption
          label={t("leadFilter.allFunnels")}
          active={!funnel}
          onClick={() => onFunnelChange(null)}
        />
        {funnelNames.map((f) => (
          <TileOption key={f} label={f} active={funnel === f} onClick={() => onFunnelChange(f)} />
        ))}
      </FilterTile>
      <DateRangeFilter value={dateFilter} onChange={onDateFilterChange} />
      <AmountRangeFilter value={amountRange} onChange={onAmountRangeChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The 8 headline KPI cards, self-contained (runs its own funnel/call/  */
/* task stats hooks) so both dashboard.tsx and daily-report.tsx can     */
/* render the same block from just a `funnel` value, without either     */
/* page having to compute or pass down the underlying stats itself.     */
/* ------------------------------------------------------------------ */

export function DashboardKpiCards({ funnel }: { funnel: string | null }) {
  const { t } = useI18n();
  const { format } = useCurrency();

  // Same per-funnel computation Reyting uses (raw leads + pipeline_stages,
  // not the dashboard_kpis RPC) -- these 8 cards are all about one funnel's
  // real pipeline shape, which that RPC was never built to answer.
  const funnelStats = useFunnelStats(funnel);
  const callStats = useFunnelCallStats(funnel);
  const taskStats = useAmoCrmTaskStats(funnel);

  // "Kutilayotgan konversiya" -- the org's fixed expected conversion rate,
  // used only to project potential revenue below (not a real measured
  // number, so it isn't sourced from any hook).
  const EXPECTED_CONVERSION = 0.15;
  const potentialSalesCount = Math.round(funnelStats.totalLeads * EXPECTED_CONVERSION);
  const potentialRevenue = potentialSalesCount * funnelStats.avgCheck;

  function formatCallDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="space-y-3 sm:space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 xl:grid-cols-6">
        <StatCard
          label={t("dash.card.totalLeads")}
          value={String(funnelStats.totalLeads)}
          info={t("dash.card.totalLeadsInfo")}
        />
        <StatCard
          label={t("dash.card.totalRevenue")}
          value={format(funnelStats.totalRevenue)}
          tone="mint"
          info={t("dash.card.totalRevenueInfo")}
        />
        <StatCard
          label={t("dash.card.conversion")}
          value={`${funnelStats.conversion.toFixed(1)}%`}
          hint={t("dash.card.expectedConversion")}
          info={t("dash.card.conversionInfo")}
        />
        <StatCard
          label={t("dash.card.potentialSales")}
          value={String(potentialSalesCount)}
          hint={format(potentialRevenue)}
          tone="mint"
          info={t("dash.card.potentialSalesInfo")}
        />
        <StatCard
          label={t("dash.card.lostLeads")}
          value={String(funnelStats.lostCount)}
          info={t("dash.card.lostLeadsInfo")}
        />
        <StatCard
          label={t("dash.card.recoverableRevenue")}
          value={format(funnelStats.recoverableRevenue)}
          hint={t("dash.card.recoverableRevenueHint", { count: funnelStats.recoverableCount })}
          tone="mint"
          info={t("dash.card.recoverableRevenueInfo")}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
        <div className="surface-card relative overflow-hidden p-2.5 sm:p-6">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground sm:text-[13px]">
            {t("dash.card.tasks")}
            <InfoTip text={t("dash.card.tasksInfo")} />
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:gap-3">
            <div className="rounded-xl bg-success/10 p-2 sm:p-3">
              <p className="flex items-center gap-1 text-[9.5px] font-semibold text-success sm:text-[11px]">
                <CalendarClock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                {t("dash.card.tasksDueToday")}
              </p>
              <p className="mt-1.5 font-display text-lg font-bold leading-none tabular-nums text-success sm:mt-2 sm:text-[26px]">
                {taskStats.data?.dueToday ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-destructive/10 p-2 sm:p-3">
              <p className="flex items-center gap-1 text-[9.5px] font-semibold text-destructive sm:text-[11px]">
                <AlarmClockOff className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                {t("dash.card.tasksOverdue")}
              </p>
              <p className="mt-1.5 font-display text-lg font-bold leading-none tabular-nums text-destructive sm:mt-2 sm:text-[26px]">
                {taskStats.data?.overdue ?? 0}
              </p>
            </div>
          </div>
        </div>

        <div className="surface-card relative overflow-hidden p-2.5 sm:p-6">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground sm:text-[13px]">
            <PhoneCall className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            {t("dash.card.callTime")}
            <InfoTip text={t("dash.card.callTimeInfo")} />
          </p>
          <p className="mt-1 text-[10px] font-medium text-subtle sm:text-xs">
            {t("dash.card.callTimeManagers", { count: callStats.managerCount })}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5 sm:mt-3 sm:gap-2">
            <div>
              <p className="font-display text-sm font-bold leading-none tabular-nums text-foreground sm:text-lg">
                {formatCallDuration(callStats.totalSeconds)}
              </p>
              <p className="mt-1 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wide text-subtle sm:mt-1.5 sm:text-[10px]">
                {t("dash.card.callTimeTotal")}
              </p>
            </div>
            <div>
              <p className="font-display text-sm font-bold leading-none tabular-nums text-foreground sm:text-lg">
                {formatCallDuration(callStats.avgSecondsPerManager)}
              </p>
              <p className="mt-1 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wide text-subtle sm:mt-1.5 sm:text-[10px]">
                {t("dash.card.callTimeAvg")}
              </p>
            </div>
            <div>
              <p className="font-display text-sm font-bold leading-none tabular-nums text-foreground sm:text-lg">
                {callStats.avgContactsPerManager}
              </p>
              <p className="mt-1 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wide text-subtle sm:mt-1.5 sm:text-[10px]">
                {t("dash.card.callTimeContacts")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main export -- wired into daily-report.tsx (moved out of            */
/* dashboard.tsx so it's its own sidebar page).                        */
/* ------------------------------------------------------------------ */

// The whole page's filter state (funnel/team/operator/date/amount)
// lives one level up in dashboard.tsx, since funnel also drives
// the 8 KPI cards and charts elsewhere on the page — but the filter *tiles*
// themselves render here, inside this one card at the top of the page, so
// there's exactly one filter row instead of it being split across two
// places.
export function DashboardDailyReport({
  funnel,
  onFunnelChange,
  teamId,
  onTeamChange,
  operatorId,
  onOperatorChange,
  dateFilter,
  onDateFilterChange,
  amountRange,
  onAmountRangeChange,
  funnelNames,
  rops,
  operators,
  kpiCards,
}: {
  funnel: string | null;
  onFunnelChange: (v: string | null) => void;
  teamId: string | null;
  onTeamChange: (v: string | null) => void;
  operatorId: string | null;
  onOperatorChange: (v: string | null) => void;
  dateFilter: DateFilterValue;
  onDateFilterChange: (v: DateFilterValue) => void;
  amountRange: AmountRangeValue;
  onAmountRangeChange: (v: AmountRangeValue) => void;
  funnelNames: string[];
  rops: ProfileRow[];
  operators: ProfileRow[];
  // The page's 8 headline KPI cards -- callers pass <DashboardKpiCards
  // funnel={funnel} /> (declared above), rendered here right below the
  // day-strip so they visually sit inside this card instead of appearing
  // far down the page after the whole report body.
  kpiCards: ReactNode;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();

  const [period, setPeriod] = useState<Period>("daily");
  const [selected, setSelected] = useState<Date>(() => startOfDay(new Date()));

  const scope: DailyReportScope = useMemo(
    () => ({ funnel, teamId, operatorId }),
    [funnel, teamId, operatorId],
  );

  const { range, prevRange } = useMemo(() => {
    if (period === "daily") {
      const from = startOfDay(selected);
      return {
        range: { from, to: addDays(from, 1) },
        prevRange: { from: addDays(from, -1), to: from },
      };
    }
    if (period === "weekly") {
      const from = startOfWeek(selected);
      return {
        range: { from, to: addDays(from, 7) },
        prevRange: { from: addDays(from, -7), to: from },
      };
    }
    const from = startOfMonth(selected);
    return {
      range: { from, to: addMonths(from, 1) },
      prevRange: { from: addMonths(from, -1), to: from },
    };
  }, [period, selected]);

  const stats = useDailyReportStats(range, prevRange, scope);
  const taskStats = useAmoCrmTaskStats(scope.funnel);

  return (
    <div className="mt-6">
      <SectionCard
        actions={
          <div className="inline-flex items-center gap-1 rounded-2xl border border-border bg-card p-1">
            {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {t(`dash.report.period.${p}`)}
              </button>
            ))}
          </div>
        }
      >
        <DashboardFilterRow
          funnel={funnel}
          onFunnelChange={onFunnelChange}
          teamId={teamId}
          onTeamChange={onTeamChange}
          operatorId={operatorId}
          onOperatorChange={onOperatorChange}
          dateFilter={dateFilter}
          onDateFilterChange={onDateFilterChange}
          amountRange={amountRange}
          onAmountRangeChange={onAmountRangeChange}
          funnelNames={funnelNames}
          rops={rops}
          operators={operators}
        />

        <PeriodStrip period={period} selected={selected} onSelect={setSelected} t={t} />
      </SectionCard>

      <div className="mt-6">{kpiCards}</div>

      <div className="mt-6">
        <h3 className="text-[13px] font-bold text-foreground">{t("dash.report.summaryTitle")}</h3>
        <p className="mt-0.5 text-xs text-subtle">{t("dash.report.summaryDesc")}</p>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="surface-card border border-destructive/30 bg-destructive/5 p-4 xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <AlertTriangle className="h-4 w-4 text-destructive" />{" "}
              {t("dash.report.needsAttention")}
              <InfoTip text={t("dash.report.needsAttentionInfo")} />
            </p>
            <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
              {stats.biggestStageDrop ? 1 : 0}
            </span>
          </div>
          <p className="mt-1 text-xs text-subtle">{t("dash.report.needsAttentionDesc")}</p>
          {stats.biggestStageDrop ? (
            <div className="mt-3 rounded-xl bg-background/60 p-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-destructive">
                  {t("dash.report.biggestStageDrop")}
                  <InfoTip text={t("dash.report.biggestStageDropInfo")} />
                </p>
                <span className="font-display text-lg font-extrabold tabular-nums text-destructive">
                  -{stats.biggestStageDrop.dropPct}%
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {stats.biggestStageDrop.fromStage} → {stats.biggestStageDrop.toStage}
              </p>
            </div>
          ) : (
            <p className="mt-3 py-4 text-center text-xs text-subtle">
              {funnel ? t("dash.report.noAlerts") : t("dash.report.pickFunnelForAlerts")}
            </p>
          )}
        </div>

        <RatioMeter
          title={t("dash.report.overallConversion")}
          pct={stats.wonLeadsCreatedPct}
          numeratorLabel={t("dash.report.purchasedLeads")}
          numeratorValue={stats.wonLeadsCreated}
          denominatorLabel={t("dash.report.createdLeads")}
          denominatorValue={stats.newLeads}
          tone="success"
          info={t("dash.report.overallConversionInfo")}
        />
        <RatioMeter
          title={t("dash.report.fromConnected")}
          pct={stats.wonFromConnectedPct}
          numeratorLabel={t("dash.report.sales")}
          numeratorValue={stats.wonFromConnectedCount}
          denominatorLabel={t("dash.report.connectedNoSale")}
          denominatorValue={Math.max(stats.connectedLeadsCount - stats.wonFromConnectedCount, 0)}
          tone="primary"
          info={t("dash.report.fromConnectedInfo")}
        />
      </div>

      <div className="mt-6">
        <h3 className="text-[13px] font-bold text-foreground">{t("dash.report.financeTitle")}</h3>
        <p className="mt-0.5 text-xs text-subtle">{t("dash.report.financeDesc")}</p>
      </div>

      <div className="mt-4">
        <SectionCard title={t("dash.report.revenueTrend")} info={t("dash.report.revenueTrendInfo")}>
          <RevenueTrendChart data={stats.revenueTrend} format={format} />
        </SectionCard>
      </div>

      <div className="mt-6">
        <h3 className="text-[13px] font-bold text-foreground">{t("dash.report.activityTitle")}</h3>
        <p className="mt-0.5 text-xs text-subtle">{t("dash.report.activityDesc")}</p>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SectionCard
          title={t("dash.report.operatorRanking")}
          info={t("dash.report.operatorRankingInfo")}
        >
          {stats.operatorBreakdown.length === 0 ? (
            <p className="py-8 text-center text-sm text-subtle">
              {t("dash.report.noOperatorData")}
            </p>
          ) : (
            <OperatorRankingList operators={stats.operatorBreakdown} />
          )}
        </SectionCard>

        <div className="surface-card p-2.5 sm:p-5">
          <p className="flex items-center gap-2 text-xs font-bold text-foreground sm:text-sm">
            <ListChecks className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />{" "}
            {t("dash.report.amoTasks")}
            <InfoTip text={t("dash.report.amoTasksInfo")} />
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
            <div className="rounded-xl bg-success/10 p-2 sm:p-3">
              <p className="flex items-center gap-1 text-[9.5px] font-semibold text-success sm:text-[11px]">
                <CalendarClock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />{" "}
                {t("dash.card.tasksDueToday")}
              </p>
              <p className="mt-1.5 font-display text-lg font-bold leading-none tabular-nums text-success sm:mt-2 sm:text-2xl">
                {taskStats.data?.dueToday ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-destructive/10 p-2 sm:p-3">
              <p className="flex items-center gap-1 text-[9.5px] font-semibold text-destructive sm:text-[11px]">
                <PhoneMissed className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> {t("dash.card.tasksOverdue")}
              </p>
              <p className="mt-1.5 font-display text-lg font-bold leading-none tabular-nums text-destructive sm:mt-2 sm:text-2xl">
                {taskStats.data?.overdue ?? 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <SectionCard title={t("dash.report.talkTime")} description={t("dash.report.talkTimeDesc")}>
          {stats.operatorBreakdown.length === 0 ? (
            <p className="py-8 text-center text-sm text-subtle">
              {t("dash.report.noOperatorData")}
            </p>
          ) : (
            <TalkTimeBars operators={stats.operatorBreakdown} />
          )}
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t("dash.report.avgCallScore")}
          value={stats.avgCallScore != null ? `${stats.avgCallScore}/100` : "—"}
          info={t("dash.report.avgCallScoreInfo")}
        />
        <StatCard
          label={t("dash.report.newLeadsPeriod")}
          value={String(stats.newLeads)}
          info={t("dash.report.newLeadsPeriodInfo")}
          tone="mint"
        />
        <StatCard
          label={t("dash.report.openLeadsPeriod")}
          value={String(stats.openLeads)}
          info={t("dash.report.openLeadsPeriodInfo")}
          tone="danger-soft"
        />
      </div>

      <div className="mt-6">
        <h3 className="text-[13px] font-bold text-foreground">{t("dash.report.callsTitle")}</h3>
        <p className="mt-0.5 text-xs text-subtle">{t("dash.report.callsDesc")}</p>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <SectionCard
          title={t("dash.report.callFlow")}
          info={t("dash.report.callFlowInfo")}
          className="xl:col-span-2"
        >
          <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>
              {t("dash.report.totalCallsLabel")}:{" "}
              <b className="text-foreground">{stats.totalCalls}</b>
            </span>
            <span className="text-success">
              {t("audio.connected")}: <b>{stats.connectedCalls}</b>
            </span>
            <span className="text-destructive">
              {t("dash.report.missedLabel")}: <b>{stats.missedCalls}</b>
            </span>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.callFlowByDay} margin={{ left: -14, right: 8, top: 8 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--color-subtle)"
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--color-subtle)"
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  name={t("audio.connected")}
                  dataKey="connected"
                  stackId="a"
                  fill="var(--color-success)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  name={t("dash.report.missedLabel")}
                  dataKey="missed"
                  stackId="a"
                  fill="var(--color-destructive)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <div className="surface-card p-2.5 sm:p-5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-foreground sm:text-sm">
            {t("dash.report.contactRate")}
            <InfoTip text={t("dash.report.contactRateInfo")} />
          </p>
          <p className="mt-1 text-[11px] text-subtle sm:text-xs">
            {t("dash.report.contactRateDesc")}
          </p>
          <p className="mt-2.5 font-display text-2xl font-extrabold tabular-nums text-primary sm:mt-4 sm:text-4xl">
            {stats.contactRatePct}%
          </p>
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted sm:mt-3">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, stats.contactRatePct)}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] text-subtle sm:text-[11px]">
            {t("dash.report.targetHint", { pct: 80 })}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-[13px] font-bold text-foreground">{t("dash.report.funnelTitle")}</h3>
        <p className="mt-0.5 text-xs text-subtle">{t("dash.report.funnelDesc")}</p>
      </div>

      <div className="mt-4">
        <SectionCard
          title={t("dash.report.stageBreakdown")}
          info={t("dash.report.stageBreakdownInfo")}
        >
          {!funnel ? (
            <p className="py-10 text-center text-sm text-subtle">
              {t("dash.report.pickFunnelForStages")}
            </p>
          ) : stats.stageBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-subtle">{t("funnels.noLeads")}</p>
          ) : (
            <StageBreakdownList rows={stats.stageBreakdown} />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function OperatorRankingList({ operators }: { operators: DailyReportStats["operatorBreakdown"] }) {
  const { t } = useI18n();
  const max = Math.max(...operators.map((o) => o.calls), 1);
  const top = operators.slice(0, 3);
  const bottom = operators.length > 3 ? operators.slice(-3) : [];
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-subtle">
          {t("dash.report.topPerformers")}
        </p>
        <div className="space-y-2.5">
          {top.map((o, i) => (
            <OperatorRankRow key={o.id} rank={i + 1} operator={o} max={max} />
          ))}
        </div>
      </div>
      {bottom.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-subtle">
            {t("dash.report.bottomPerformers")}
          </p>
          <div className="space-y-2.5">
            {bottom.map((o, i) => (
              <OperatorRankRow key={o.id} rank={top.length + i + 1} operator={o} max={max} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OperatorRankRow({
  rank,
  operator,
  max,
}: {
  rank: number;
  operator: DailyReportStats["operatorBreakdown"][number];
  max: number;
}) {
  const scoreTone =
    operator.avgScore == null
      ? "text-subtle"
      : operator.avgScore >= 75
        ? "text-success"
        : operator.avgScore >= 50
          ? "text-warning"
          : "text-destructive";
  return (
    <div className="flex items-center gap-3">
      <span className="w-4 shrink-0 text-xs font-bold text-subtle">{rank}</span>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mint text-[11px] font-bold text-mint-foreground">
        {operator.name.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{operator.name}</p>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(operator.calls / max) * 100}%` }}
          />
        </div>
      </div>
      <span className="shrink-0 text-right text-xs font-semibold text-foreground">
        {operator.calls}
      </span>
      <span className={cn("w-9 shrink-0 text-right text-sm font-bold", scoreTone)}>
        {operator.avgScore ?? "—"}
      </span>
    </div>
  );
}

function TalkTimeBars({ operators }: { operators: DailyReportStats["operatorBreakdown"] }) {
  const sorted = [...operators].sort((a, b) => b.totalSeconds - a.totalSeconds);
  const max = Math.max(...sorted.map((o) => o.totalSeconds), 1);
  const totalSeconds = sorted.reduce((s, o) => s + o.totalSeconds, 0);
  const totalCalls = sorted.reduce((s, o) => s + o.calls, 0);
  const { t } = useI18n();

  function fmt(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${h}h` : `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2 border-b border-border pb-3 text-center sm:mb-4 sm:gap-3 sm:pb-4">
        <div>
          <p className="font-display text-base font-bold tabular-nums text-foreground sm:text-lg">
            {fmt(totalSeconds)}
          </p>
          <p className="text-[9px] uppercase tracking-wide text-subtle sm:text-[10px]">
            {t("dash.report.totalTalkTime")}
          </p>
        </div>
        <div>
          <p className="font-display text-base font-bold tabular-nums text-foreground sm:text-lg">
            {totalCalls ? fmt(Math.round(totalSeconds / totalCalls)) : "0:00"}
          </p>
          <p className="text-[9px] uppercase tracking-wide text-subtle sm:text-[10px]">
            {t("dash.report.avgTalkTime")}
          </p>
        </div>
        <div>
          <p className="font-display text-base font-bold tabular-nums text-foreground sm:text-lg">
            {totalCalls}
          </p>
          <p className="text-[9px] uppercase tracking-wide text-subtle sm:text-[10px]">
            {t("dash.report.totalCallsLabel")}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {sorted.map((o) => (
          <div key={o.id} className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-xs font-medium text-foreground">
              {o.name}
            </span>
            <div className="h-5 flex-1 overflow-hidden rounded-lg bg-muted">
              <div
                className="h-full rounded-lg bg-primary/70"
                style={{ width: `${(o.totalSeconds / max) * 100}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-xs font-semibold text-foreground">
              {fmt(o.totalSeconds)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageBreakdownList({ rows }: { rows: DailyReportStats["stageBreakdown"] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.stage} className="flex items-center gap-3">
          <span
            className="w-40 shrink-0 truncate text-xs font-medium text-foreground"
            title={r.stage}
          >
            {r.stage}
          </span>
          <div className="h-6 flex-1 overflow-hidden rounded-lg bg-muted">
            <div
              className="flex h-full items-center rounded-lg bg-primary/70 px-2"
              style={{ width: `${(r.count / max) * 100}%` }}
            >
              <span className="text-[10px] font-bold text-primary-foreground">{r.count}</span>
            </div>
          </div>
          <span className="w-12 shrink-0 text-right text-xs font-semibold text-subtle">
            {r.pct}%
          </span>
        </li>
      ))}
    </ul>
  );
}
