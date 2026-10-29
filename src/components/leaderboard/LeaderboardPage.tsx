// The signed-in "/" screen (Reyting). Lives outside routes/index.tsx so
// the public landing page served on the same route never downloads it (or
// recharts) -- index.tsx loads this lazily, only for a real session.
import { DailyWorkCard } from "@/components/dashboard/DailyWorkCard";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  GitBranch,
  Play,
  RefreshCw,
  Search,
  Tag as TagIcon,
  Trophy,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { PageHeader, SectionCard, StatCard, InfoTip } from "@/components/layout/Primitives";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import {
  useAsOfSnapshot,
  useRevenueChangeSince,
  useFunnelNames,
  useFunnelStats,
  useLeaderboardView,
  useManagerFunnelStats,
  useManagerDailyTrend,
  useTagsSummary,
  type LeadRow,
} from "@/hooks/use-crm-data";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import {
  AmountRangeFilter,
  amountInRange,
  type AmountRangeValue,
} from "@/components/filters/AmountRangeFilter";
import { FilterSelect, FilterSearchInput } from "@/components/filters/FilterSelect";
import { Skeleton } from "@/components/ui/skeleton";
import { Podium } from "@/components/leaderboard/Podium";

const Route = getRouteApi("/");

// "Jonli" rejim: 15s is live enough for a ranking and keeps the database
// and the browser idle most of the time (it used to poll every 3s).
const LIVE_REFRESH_MS = 15_000;

// Fixed categorical order, never cycled — matches the app's own --color-chart-*
// ramp (styles.css), which exists for exactly this (multi-series charts).
const MANAGER_CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const chartTooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-popover)",
  boxShadow: "var(--shadow-elevated)",
  fontSize: 12,
};

function pct(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}

function TagFilter({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  function toggle(tag: string) {
    onChange(selected.includes(tag) ? selected.filter((t2) => t2 !== tag) : [...selected, tag]);
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-open={open}
        onClick={() => setOpen((v) => !v)}
        className="filter-field"
      >
        <span className="filter-field-icon">
          <TagIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="filter-field-label block">{t("lb.tagsFilter")}</span>
          <span className="filter-field-value">
            {selected.length === 0
              ? t("common.all")
              : selected.length === 1
                ? selected[0]
                : t("lb.tagsSelected", { n: selected.length })}
          </span>
        </span>
        <ChevronDown className="filter-field-chev" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label={t("common.close")}
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-20 mt-2 max-h-64 w-56 space-y-1 overflow-y-auto rounded-xl border border-border bg-popover p-2 shadow-card">
            {options.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-subtle">{t("common.none")}</p>
            )}
            {options.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggle(tag)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  selected.includes(tag) && "bg-primary/10 text-primary",
                )}
              >
                <span className="truncate">{tag}</span>
                {selected.includes(tag) && <span>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// #1 gets a trophy (no number needed -- there's only one #1). #2 and #3 get
// a bigger, filled rank-colored circle with the actual place number inside,
// which reads at a glance instead of asking the viewer to decode a generic
// medal icon's color.
// `embedded`: shown as Bosh sahifa's Reyting tab -- that page already has
// its own header, so only this view's controls render there.
export function Leaderboard({
  embedded = false,
  extraFilter,
}: {
  embedded?: boolean;
  /** Shown at the end of the filter row (the home page's "Saqlash"). */
  extraFilter?: ReactNode;
} = {}) {
  const { t, lang } = useI18n();
  const { format, formatCompact } = useCurrency();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === "platform_owner")
      void navigate({ to: "/platform/companies", replace: true });
  }, [user, navigate]);

  const routeSearch = Route.useSearch();
  const routeNavigate = Route.useNavigate();

  // Filters live in the URL, not local state, so refresh/back-navigation
  // returns you to exactly the same filtered leaderboard instead of
  // resetting it. Live-refresh toggle and as-of-date stay local -- they're
  // modes, not filters someone expects to come back to.
  const dateFilter: DateFilterValue = useMemo(
    () => ({
      from: routeSearch.from ? new Date(routeSearch.from) : null,
      to: routeSearch.to ? new Date(routeSearch.to) : null,
      label: routeSearch.label ?? t("lb.presetAll"),
      ...(routeSearch.preset ? { preset: routeSearch.preset } : {}),
    }),
    [routeSearch.from, routeSearch.to, routeSearch.label, routeSearch.preset, t],
  );
  const search = routeSearch.q ?? "";
  const funnel = routeSearch.funnel ?? null;
  const selectedTags = useMemo(
    () => (routeSearch.tags ? routeSearch.tags.split(",").filter(Boolean) : []),
    [routeSearch.tags],
  );
  const revenueRange: AmountRangeValue = useMemo(
    () => ({
      min: routeSearch.min !== undefined ? Number(routeSearch.min) : null,
      max: routeSearch.max !== undefined ? Number(routeSearch.max) : null,
    }),
    [routeSearch.min, routeSearch.max],
  );

  function patchSearch(patch: Record<string, string | undefined>) {
    void routeNavigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  }
  function setDateFilter(v: DateFilterValue) {
    patchSearch({
      from: v.from ? v.from.toISOString() : undefined,
      to: v.to ? v.to.toISOString() : undefined,
      label: v.label || undefined,
      preset: v.preset || undefined,
    });
  }
  function setSearch(v: string) {
    patchSearch({ q: v || undefined });
  }
  function setFunnel(v: string | null) {
    patchSearch({ funnel: v ?? undefined });
  }
  function setSelectedTags(v: string[]) {
    patchSearch({ tags: v.length ? v.join(",") : undefined });
  }
  function setRevenueRange(v: AmountRangeValue) {
    patchSearch({
      min: v.min != null ? String(v.min) : undefined,
      max: v.max != null ? String(v.max) : undefined,
    });
  }

  const [live, setLive] = useState(true);

  const { names: funnelNames } = useFunnelNames();
  const { tags: tagSummary } = useTagsSummary(funnel);

  const filters = useMemo(
    () => ({
      from: dateFilter.from ? dateFilter.from.toISOString() : null,
      to: dateFilter.to ? dateFilter.to.toISOString() : null,
      search,
      stageId: null,
      funnel,
      tags: selectedTags,
    }),
    [dateFilter, search, funnel, selectedTags],
  );
  const {
    rows: allRows,
    isLoading: rowsLoading,
    isFetching,
    refetch,
  } = useLeaderboardView(filters, {
    refetchInterval: live ? LIVE_REFRESH_MS : false,
  });
  const isLoading = rowsLoading;
  const rows = useMemo(
    () => allRows.filter((r) => amountInRange(r.revenue, revenueRange)),
    [allRows, revenueRange],
  );

  async function handleManualRefresh() {
    await refetch();
    toast.success(t("lb.refreshed"));
  }

  // Computed straight from the raw leads table (see useFunnelStats), not
  // summed across the per-manager leaderboard rows above -- a lead with no
  // (or an unmatched) owner still counted toward the funnel's real totals,
  // but never showed up in any manager's row, so summing `rows` silently
  // undercounted both totalLeads and revenue whenever that happened.
  const funnelStats = useFunnelStats(funnel);

  // "Bugungi tushum" (today's revenue) — the funnel's total revenue right
  // now minus a time-travel snapshot of the same funnel as it stood at the
  // start of today, i.e. how much revenue this funnel picked up today.
  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const revenueChange = useRevenueChangeSince(startOfToday, funnel);
  // Until 20261018030000_lead_revenue_change.sql is applied: the old way
  // (every lead as it stood at the start of today, summed here).
  const todayStartSnapshot = useAsOfSnapshot<LeadRow>(
    "leads",
    revenueChange.isError ? startOfToday : null,
  );
  const todayRevenue = useMemo(() => {
    if (revenueChange.data != null) return revenueChange.data;
    if (!revenueChange.isError) return 0;
    const before = (todayStartSnapshot.data ?? []).reduce((s, l) => {
      const f = l.funnel || "Direct Sales";
      if (funnel && f !== funnel) return s;
      return s + l.expected_revenue;
    }, 0);
    return funnelStats.totalRevenue - before;
  }, [
    revenueChange.data,
    revenueChange.isError,
    todayStartSnapshot.data,
    funnel,
    funnelStats.totalRevenue,
  ]);

  // Same period as the ranking. Tags can't be applied to these per-stage
  // sums, so with tags picked the ranking keeps its own numbers.
  const managerStats = useManagerFunnelStats(funnel, {
    refetchInterval: live ? LIVE_REFRESH_MS : false,
    from: dateFilter.from,
    to: dateFilter.to,
  });
  const overlayStats = selectedTags.length === 0;
  const [trendRange, setTrendRange] = useState<DateFilterValue>({
    from: null,
    to: null,
    label: t("lb.presetAll"),
  });
  const managerTrend = useManagerDailyTrend(funnel, trendRange.from, trendRange.to);
  // The charts draw the top earners only: past MANAGER_CHART_COLORS.length
  // lines the colors would repeat and two managers would look like one.
  const chartSeries = useMemo(
    () =>
      [...managerTrend.series]
        .map((s) => ({ s, total: s.salesRevenue.reduce((a, b) => a + (b ?? 0), 0) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, MANAGER_CHART_COLORS.length)
        .map((x) => x.s),
    [managerTrend.series],
  );
  const chartsTrimmed = managerTrend.series.length > chartSeries.length;
  const conversionChartData = useMemo(
    () =>
      managerTrend.dayLabels.map((label, i) => {
        const row: Record<string, string | number | null> = { label };
        for (const s of chartSeries) row[s.id] = s.conversion[i] ?? null;
        return row;
      }),
    [managerTrend, chartSeries],
  );
  const revenueChartData = useMemo(
    () =>
      managerTrend.dayLabels.map((label, i) => {
        const row: Record<string, string | number | null> = { label };
        for (const s of chartSeries) row[s.id] = s.salesRevenue[i] ?? 0;
        return row;
      }),
    [managerTrend, chartSeries],
  );

  // The live-ranking table below reads its per-manager numbers from
  // managerStats (sales-stage based: predoplata/yarim/toliq/won -- see
  // SALES_STAGE_KEYWORDS), not from `rows`' own wonLeads/revenue (WON-stage
  // only, via the leaderboard_stats RPC). Overlaying managerStats here keeps
  // the top/bottom-3 cards showing the exact same numbers as that table
  // instead of a narrower, WON-only slice of them.
  const enrichedRows = useMemo(
    () =>
      rows
        .map((row) => {
          const stats = overlayStats ? managerStats.get(row.id) : undefined;
          const totalLeads = stats?.totalLeads ?? row.totalLeads;
          const wonLeads = stats?.salesCount ?? row.wonLeads;
          const revenue = stats?.salesRevenue ?? row.revenue;
          return {
            ...row,
            totalLeads,
            wonLeads,
            revenue,
            conversion: totalLeads ? (wonLeads / totalLeads) * 100 : 0,
          };
        })
        // `rows` arrives pre-sorted by its own (narrower, WON-only) revenue
        // field, but the revenue substituted above can reorder the true
        // ranking -- re-sort by what's actually displayed so "#1" always is
        // the highest number on screen, not just the highest by the RPC's
        // original figure.
        .sort((a, b) => b.revenue - a.revenue),
    [rows, managerStats, overlayStats],
  );
  const controls = (
    <>
      <button
        type="button"
        onClick={() => setLive((v) => !v)}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          live
            ? "border-success/30 bg-success/10 text-success"
            : "border-border bg-background text-muted-foreground hover:bg-accent",
        )}
      >
        {live ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        {live ? t("lb.live") : t("lb.paused")}
      </button>
      <button
        type="button"
        onClick={() => void handleManualRefresh()}
        disabled={isFetching}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        {t("common.refresh")}
      </button>
    </>
  );

  return (
    <>
      {embedded ? (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">{controls}</div>
      ) : (
        <PageHeader
          icon={Trophy}
          tone="amber"
          title={t("lb.title")}
          description={t("lb.description2")}
          actions={controls}
        />
      )}
      {/* A rep's home: today's work first, then the ranking. */}
      {!embedded && <DailyWorkCard />}

      <SectionCard>
        <div className="flex flex-wrap items-center gap-2.5">
          <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
          <FilterSelect
            icon={GitBranch}
            label={t("leadFilter.funnelLabel")}
            value={funnel ?? ""}
            onChange={(v) => setFunnel(v || null)}
          >
            <option value="">{t("leadFilter.allFunnels")}</option>
            {funnelNames.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </FilterSelect>
          <TagFilter
            options={tagSummary.map((tg) => tg.name)}
            selected={selectedTags}
            onChange={setSelectedTags}
          />
          <AmountRangeFilter value={revenueRange} onChange={setRevenueRange} />
          <FilterSearchInput
            icon={Search}
            label={t("leadFilter.searchLabel")}
            value={search}
            onChange={setSearch}
            placeholder={t("lb.searchPlaceholder")}
          />
          {extraFilter}
        </div>
      </SectionCard>

      <Podium rows={enrichedRows} loading={isLoading} live={live} />

      {/* Inside Bosh sahifa these totals are already in the Umumiy tab. */}
      {!embedded && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 xl:grid-cols-5">
          <StatCard
            label={t("lb.totalLeadsCount")}
            value={String(funnelStats.totalLeads)}
            tone="mint"
            info={t("lb.info.totalLeadsCount")}
          />
          <StatCard
            label={t("lb.avgConversion")}
            value={pct(funnelStats.conversion)}
            info={t("lb.info.avgConversion")}
          />
          <StatCard
            label={t("lb.sales")}
            value={String(funnelStats.wonCount)}
            hint={t("lb.salesHint", {
              revenue: format(funnelStats.wonRevenue),
              n: String(funnelStats.salesStageCount),
            })}
            info={t("lb.info.sales")}
          />
          <StatCard
            label={t("lb.totalRevenue")}
            value={format(funnelStats.totalRevenue)}
            info={t("lb.info.totalRevenue")}
            tone="hero"
          />
          <StatCard
            label={t("lb.todayRevenue")}
            value={format(todayRevenue)}
            tone="mint"
            info={t("lb.info.todayRevenue")}
          />
        </div>
      )}

      <div className="mt-6">
        <SectionCard icon={Trophy} tone="amber" title={t("lb.liveRanking2")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
                  <th className="py-2.5 pr-4">{t("lb.colManager")}</th>
                  <th className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1.5">
                      {t("lb.colTotalLeads")}
                      <InfoTip text={t("lb.info.colTotalLeads")} />
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1.5">
                      {t("lb.colSales")}
                      <InfoTip text={t("lb.info.colSales")} />
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {t("lb.colRevenue")}
                      <InfoTip text={t("lb.info.colRevenue")} />
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1.5">
                      {t("lb.colConversion")}
                      <InfoTip text={t("lb.info.colConversion")} />
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1.5">
                      {t("lb.colKpi")}
                      <InfoTip text={t("lb.info.colKpi")} />
                    </span>
                  </th>
                  <th className="py-2.5 pl-4 text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {t("lb.colKpiMonthly")}
                      <InfoTip text={t("lb.info.colKpiMonthly")} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading &&
                  enrichedRows.length === 0 &&
                  Array.from({ length: 5 }, (_, i) => (
                    <tr key={`sk-${i}`}>
                      <td colSpan={7} className="py-3">
                        <Skeleton className="h-6 w-full rounded-lg" />
                      </td>
                    </tr>
                  ))}
                {enrichedRows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="py-3.5 pr-4">
                      <div className="flex items-center gap-3">
                        <span className="w-7 shrink-0 text-right text-sm font-bold text-amber-500">
                          #{i + 1}
                        </span>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mint text-[11px] font-bold text-mint-foreground">
                          {r.initials}
                        </span>
                        <span className="truncate font-bold text-foreground">{r.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center tabular-nums">{r.totalLeads}</td>
                    <td className="px-4 py-3.5 text-center tabular-nums">{r.wonLeads}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-foreground">
                      {format(r.revenue)}
                    </td>
                    <td className="px-4 py-3.5 text-center tabular-nums">{pct(r.conversion)}</td>
                    <td className="px-4 py-3.5 text-center tabular-nums text-primary">
                      {pct(r.kpiPercent)}
                    </td>
                    <td className="py-3.5 pl-4 text-right tabular-nums font-medium text-success">
                      {format(r.revenue * 0.05)}
                    </td>
                  </tr>
                ))}
                {enrichedRows.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-subtle">
                      {t("lb.noManagers")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 space-y-6">
        <SectionCard
          title={t("lb.chartConversion")}
          info={t("lb.info.chartConversion")}
          {...(chartsTrimmed ? { description: t("lb.chartTopManagers") } : {})}
          actions={<DateRangeFilter value={trendRange} onChange={setTrendRange} />}
        >
          {managerTrend.series.length === 0 ? (
            <p className="py-10 text-center text-sm text-subtle">{t("lb.noManagers")}</p>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={conversionChartData} margin={{ left: -14, right: 8, top: 8 }}>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    stroke="var(--color-subtle)"
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    stroke="var(--color-subtle)"
                  />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {chartSeries.map((s, idx) => (
                    <Line
                      key={s.id}
                      name={s.name}
                      dataKey={s.id}
                      type="monotone"
                      stroke={MANAGER_CHART_COLORS[idx % MANAGER_CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                      connectNulls
                      animationDuration={700}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={t("lb.chartRevenue")}
          info={t("lb.info.chartRevenue")}
          {...(chartsTrimmed ? { description: t("lb.chartTopManagers") } : {})}
        >
          {managerTrend.series.length === 0 ? (
            <p className="py-10 text-center text-sm text-subtle">{t("lb.noManagers")}</p>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueChartData} margin={{ left: -14, right: 8, top: 8 }}>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    stroke="var(--color-subtle)"
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    stroke="var(--color-subtle)"
                    tickFormatter={(v: number) => formatCompact(v, lang)}
                    width={64}
                  />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => format(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {chartSeries.map((s, idx) => (
                    <Line
                      key={s.id}
                      name={s.name}
                      dataKey={s.id}
                      type="monotone"
                      stroke={MANAGER_CHART_COLORS[idx % MANAGER_CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                      animationDuration={700}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
