import { CollectedPaymentsCard } from "./CollectedPaymentsCard";
import { useAuth } from "@/lib/auth";
import { FirstStepsCard } from "./FirstStepsCard";
import { AnalyticsReport, reportPeriod } from "@/components/analytics/AnalyticsReports";
import { MonthForecastCard, PnlTab } from "@/components/analytics/FinanceTabs";
import { canOpenSection } from "@/lib/access-rules";
import { appRoleOf } from "@/lib/nav";
import { lazy, Suspense, useMemo, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BriefcaseBusiness,
  CalendarCheck,
  ChartColumnBig,
  ChartSpline,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Phone,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  GreetingHeader,
  HomeOverviewPart,
  PeriodSegment,
} from "@/components/dashboard/HomeOverview";
import { HomeBoard, type BoardLayout, type BoardWidget } from "@/components/dashboard/HomeBoard";
import {
  DashboardFilterRow,
  type FilterSet,
  DashboardKpiCards,
  PeriodAttentionRow,
  usePeriodRanges,
} from "@/components/dashboard/DashboardBlocks";
import { ReportExportDialog } from "@/components/dashboard/ReportExportDialog";
import { SaveFiltersButton } from "@/components/filters/SaveFiltersButton";
import { useSavedFilters } from "@/hooks/use-saved-filters";
import { ConversionMetricsCards } from "@/components/dashboard/ConversionMetricsCards";
import { SalesInsightsCards } from "@/components/dashboard/SalesInsightsCards";
import { DailyWorkCard } from "@/components/dashboard/DailyWorkCard";
import { LeadTasksWidget, ActivityWidget, AiInsightsWidget } from "@/components/dashboard/Widgets";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/lib/i18n";
import {
  scopeOwnerIds,
  useAccessRules,
  useFinance,
  useFunnelNames,
  useMyOrganization,
  usePeriodStats,
  usePermission,
  useProfilesRaw,
  useVisibleOwnerIds,
} from "@/hooks/use-crm-data";
import type { DateFilterValue } from "@/components/leaderboard/DateRangeFilter";

const Leaderboard = lazy(() =>
  import("@/components/leaderboard/LeaderboardPage").then((m) => ({ default: m.Leaderboard })),
);
const Charts = {
  MonthlyRevenueTrendChart: lazy(() =>
    import("@/components/dashboard/Charts").then((m) => ({
      default: m.MonthlyRevenueTrendChart,
    })),
  ),
  ConversionQualityChart: lazy(() =>
    import("@/components/dashboard/Charts").then((m) => ({ default: m.ConversionQualityChart })),
  ),
};

// Ish stoli carries the charts library; it loads on its own.
const DeskTab = lazy(() =>
  import("@/components/dashboard/desk/DeskTab").then((m) => ({ default: m.DeskTab })),
);

export const HOME_TABS = [
  "desk",
  "overview",
  "rating",
  "conversion",
  "activity",
  "ai",
  "forecast",
  "finance",
] as const;
export type HomeTab = (typeof HOME_TABS)[number];

const TAB_ICONS: Record<HomeTab, LucideIcon> = {
  desk: BriefcaseBusiness,
  overview: LayoutDashboard,
  rating: Trophy,
  conversion: Workflow,
  activity: ListChecks,
  ai: Sparkles,
  forecast: TrendingUp,
  finance: Wallet,
};

// The filters each tab's numbers actually follow -- a tab shows only those
// (funnel always), so no filter sits there doing nothing.
const TAB_FILTERS: Record<Exclude<HomeTab, "rating" | "desk">, FilterSet> = {
  overview: { team: true, operator: true, date: true },
  conversion: { team: true, operator: true, date: true },
  activity: {},
  ai: { date: true },
  forecast: { date: true },
  finance: { date: true },
};

// What the overview shows before anyone arranges it (the page as it was).
const BOARD_DEFAULTS: BoardLayout = {
  order: [
    "kpis",
    "revenue",
    "today",
    "tasks",
    "calls",
    "dailyWork",
    "payments",
    "kpiCards",
    "attention",
    "trend",
  ],
  size: { revenue: 8, today: 4, tasks: 6, calls: 6 },
};

const homeRoute = getRouteApi("/");

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div className="surface-card p-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-2 h-3 w-56" />
      <Skeleton className="mt-6 w-full rounded-xl" style={{ height }} />
    </div>
  );
}

function Loading() {
  return <ChartSkeleton />;
}

// Bosh sahifa for heads of sales and admins: the dashboard's tabs with the
// leaderboard (Reyting) as one of them, all under one page.
export function HomePage() {
  const { t } = useI18n();
  const { user: me } = useAuth();
  const canManageHome = me?.role === "super_admin" || me?.role === "platform_owner";
  const search = homeRoute.useSearch();
  const navigate = homeRoute.useNavigate();
  const canSeeRating = usePermission("View leaderboard");
  const { data: org } = useMyOrganization();

  // Analitika's sales reports live in these tabs now; Sozlamalar ->
  // Huquqlar can still close "Analitika" for a role, which hides them.
  const { rules: accessRules } = useAccessRules();
  const analyticsOpen = canOpenSection(accessRules, appRoleOf(me), "/analytics");
  const tabs = HOME_TABS.filter((tb) =>
    tb === "rating"
      ? canSeeRating
      : tb === "forecast"
        ? analyticsOpen
        : tb === "finance"
          ? canManageHome
          : true,
  );
  const tab: HomeTab =
    search.tab && tabs.includes(search.tab as HomeTab) ? (search.tab as HomeTab) : "desk";
  function setTab(next: HomeTab) {
    void navigate({ search: (prev) => ({ ...prev, tab: next }), replace: true });
  }

  // Funnel lives in the URL so a refresh keeps it -- the same parameter
  // the Reyting tab reads, so switching tabs keeps the funnel too.
  const funnel = search.funnel ?? null;
  function setFunnel(v: string | null) {
    void navigate({ search: (prev) => ({ ...prev, funnel: v ?? undefined }), replace: true });
  }
  const [teamId, setTeamId] = useState("");
  const [operatorId, setOperatorId] = useState("");
  // The period lives in the URL too, the same from/to/label the Reyting
  // tab reads, so every tab of the page uses one date selection.
  const dateFilter: DateFilterValue = useMemo(
    () => ({
      from: search.from ? new Date(search.from) : null,
      to: search.to ? new Date(search.to) : null,
      label: search.label ?? t("lb.presetAll"),
      ...(search.preset ? { preset: search.preset } : {}),
    }),
    [search.from, search.to, search.label, search.preset, t],
  );
  function setDateFilter(v: DateFilterValue) {
    void navigate({
      search: (prev) => ({
        ...prev,
        from: v.from ? v.from.toISOString() : undefined,
        to: v.to ? v.to.toISOString() : undefined,
        label: v.label || undefined,
        preset: v.preset || undefined,
      }),
      replace: true,
    });
  }

  // "Saqlash": the page's filters (shared by every tab, Reyting's too)
  // open as saved next time -- per person, in this browser.
  const homeFilters = {
    funnel: funnel ?? "",
    date: dateFilter.from || dateFilter.to ? dateFilter : { preset: dateFilter.preset ?? "all" },
    team: teamId,
    operator: operatorId,
    tags: search.tags ?? "",
    min: search.min ?? "",
    max: search.max ?? "",
  };
  const homeDefaults = useMemo(
    () => ({
      funnel: "",
      date: { preset: "all" },
      team: "",
      operator: "",
      tags: "",
      min: "",
      max: "",
    }),
    [],
  );
  const saved = useSavedFilters("home", homeFilters, homeDefaults, (v) => {
    const d = (v.date ?? {}) as Partial<DateFilterValue>;
    void navigate({
      search: (prev) => ({
        ...prev,
        funnel: v.funnel || undefined,
        from: d.from ? new Date(d.from).toISOString() : undefined,
        to: d.to ? new Date(d.to).toISOString() : undefined,
        label: d.label || undefined,
        preset: d.preset && d.preset !== "all" ? d.preset : undefined,
        tags: v.tags || undefined,
        min: v.min || undefined,
        max: v.max || undefined,
      }),
      replace: true,
    });
    setTeamId(v.team ?? "");
    setOperatorId(v.operator ?? "");
  });
  const saveButton = (
    <SaveFiltersButton
      changed={saved.changed}
      saved={saved.saved}
      onSave={saved.save}
      onForget={saved.forget}
    />
  );

  const { names: funnelNames } = useFunnelNames();
  const { data: profiles } = useProfilesRaw();
  // A rep's own visibleOwnerIds is just themself, so both pickers collapse
  // to "only me" for that role instead of listing the whole company.
  const visibleOwnerIds = useVisibleOwnerIds();
  const rops = useMemo(
    () =>
      (profiles ?? [])
        .filter((p) => p.role === "rop" && (!visibleOwnerIds || visibleOwnerIds.has(p.id)))
        .slice()
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles, visibleOwnerIds],
  );
  const operators = useMemo(() => {
    const all = (profiles ?? [])
      .filter((p) => !visibleOwnerIds || visibleOwnerIds.has(p.id))
      .slice()
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
    if (!teamId) return all;
    return all.filter((p) => p.id === teamId || p.manager_id === teamId);
  }, [profiles, teamId, visibleOwnerIds]);

  const dateRange = { from: dateFilter.from, to: dateFilter.to };
  // Every overview card follows the same team / operator / date picks as
  // the period blocks below, not just the funnel.
  const ownerIds = useMemo(
    () => scopeOwnerIds({ teamId: teamId || null, operatorId: operatorId || null }, profiles),
    [teamId, operatorId, profiles],
  );
  const statsScope = useMemo(() => {
    const day = 24 * 60 * 60 * 1000;
    const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return {
      ownerIds,
      from: dateFilter.from ? start(dateFilter.from) : null,
      to: dateFilter.to ? new Date(start(dateFilter.to).getTime() + day) : null,
    };
  }, [ownerIds, dateFilter.from, dateFilter.to]);
  const period = usePeriodRanges(dateFilter);
  const periodTab = tab === "overview";
  const periodStats = usePeriodStats(
    periodTab ? period.range : null,
    periodTab ? period.prevRange : null,
    { funnel, teamId: teamId || null, operatorId: operatorId || null },
  );
  // The reports' period: the page's own date pick (30 days by default).
  const reportRange = reportPeriod(period.range);
  const canFinance = canManageHome || me?.role === "rop";
  const finance = useFinance(reportRange, canFinance && (tab === "forecast" || tab === "finance"));
  const periodCaption = period.isDefault
    ? t("home.periodDefault")
    : t("home.periodPicked", { label: dateFilter.label });

  // Bosh sahifa's overview as a board each person arranges (HomeBoard):
  // the overview's own blocks first, the other tabs' widgets in the list.
  const [editingBoard, setEditingBoard] = useState(false);
  const overviewProps = {
    range: period.range,
    prevRange: period.prevRange,
    funnel,
    ownerIds,
    statsScope,
  };
  const boardWidgets: BoardWidget[] = [
    {
      id: "kpis",
      title: t("board.w.kpis"),
      icon: Gauge,
      tone: "primary",
      sizes: [12],
      node: <HomeOverviewPart part="kpis" {...overviewProps} />,
    },
    {
      id: "revenue",
      title: t("board.w.revenue"),
      icon: TrendingUp,
      tone: "emerald",
      sizes: [6, 8, 12],
      node: <HomeOverviewPart part="revenue" {...overviewProps} />,
    },
    {
      id: "today",
      title: t("board.w.today"),
      icon: CalendarCheck,
      tone: "sky",
      sizes: [4, 6, 12],
      node: <HomeOverviewPart part="today" {...overviewProps} />,
    },
    {
      id: "tasks",
      title: t("board.w.tasks"),
      icon: ListChecks,
      tone: "violet",
      sizes: [4, 6, 8, 12],
      node: <HomeOverviewPart part="tasks" {...overviewProps} />,
    },
    {
      id: "calls",
      title: t("board.w.calls"),
      icon: Phone,
      tone: "rose",
      sizes: [4, 6, 8, 12],
      node: <HomeOverviewPart part="calls" {...overviewProps} />,
    },
    {
      id: "dailyWork",
      title: t("board.w.dailyWork"),
      icon: ClipboardList,
      tone: "amber",
      sizes: [6, 8, 12],
      node: <DailyWorkCard />,
    },
    {
      id: "payments",
      title: t("board.w.payments"),
      icon: Wallet,
      tone: "emerald",
      sizes: [6, 8, 12],
      node: <CollectedPaymentsCard funnel={funnel} dateRange={dateRange} />,
    },
    {
      id: "kpiCards",
      title: t("board.w.kpiCards"),
      icon: LayoutGrid,
      tone: "sky",
      sizes: [12],
      node: <DashboardKpiCards funnel={funnel} scope={statsScope} />,
    },
    {
      id: "attention",
      title: t("board.w.attention"),
      icon: AlertTriangle,
      tone: "amber",
      sizes: [12],
      node: <PeriodAttentionRow stats={periodStats} funnel={funnel} />,
    },
    {
      id: "trend",
      title: t("board.w.trend"),
      icon: ChartSpline,
      tone: "primary",
      sizes: [6, 8, 12],
      node: (
        <Suspense fallback={<ChartSkeleton />}>
          <Charts.MonthlyRevenueTrendChart funnel={funnel} />
        </Suspense>
      ),
    },
    {
      id: "conversionMetrics",
      title: t("board.w.conversionMetrics"),
      icon: Target,
      tone: "violet",
      sizes: [12],
      node: <ConversionMetricsCards funnel={funnel} scope={statsScope} />,
    },
    {
      id: "conversionChart",
      title: t("board.w.conversionChart"),
      icon: ChartColumnBig,
      tone: "violet",
      sizes: [6, 8, 12],
      node: (
        <Suspense fallback={<ChartSkeleton height={340} />}>
          <Charts.ConversionQualityChart funnel={funnel} />
        </Suspense>
      ),
    },
    {
      id: "leadTasks",
      title: t("board.w.leadTasks"),
      icon: ListChecks,
      tone: "sky",
      sizes: [6, 12],
      node: <LeadTasksWidget funnel={funnel} />,
    },
    {
      id: "activity",
      title: t("board.w.activity"),
      icon: Activity,
      tone: "amber",
      sizes: [6, 12],
      node: <ActivityWidget funnel={funnel} />,
    },
    {
      id: "aiInsights",
      title: t("board.w.aiInsights"),
      icon: Sparkles,
      tone: "violet",
      sizes: [6, 12],
      node: <AiInsightsWidget funnel={funnel} dateRange={dateRange} />,
    },
    {
      id: "salesInsights",
      title: t("board.w.salesInsights"),
      icon: Lightbulb,
      tone: "amber",
      sizes: [12],
      node: <SalesInsightsCards funnel={funnel} dateRange={dateRange} />,
    },
  ];

  const tabsNode = (
    <Segmented
      sticky
      centered
      className="mb-5"
      value={tab}
      onChange={setTab}
      options={tabs.map((key) => ({
        value: key,
        label: t(`home.tab.${key}`),
        icon: TAB_ICONS[key],
      }))}
    />
  );

  // Ish stoli brings its own head (company, period buttons, Telegram,
  // Tarix, Eksport) with the tabs under it.
  if (tab === "desk") {
    return (
      <>
        <FirstStepsCard />
        <div key={tab} className="tab-enter">
          <Suspense
            fallback={
              <>
                {tabsNode}
                <Loading />
              </>
            }
          >
            <DeskTab tabs={tabsNode} />
          </Suspense>
        </div>
      </>
    );
  }

  return (
    <>
      <GreetingHeader
        orgName={org?.name ?? undefined}
        actions={
          <>
            <PeriodSegment value={dateFilter} onChange={setDateFilter} />
            {/* The one export on the page -- the Reyting tab included (its
              manager table is in the report). */}
            <ReportExportDialog
              funnelNames={funnelNames}
              rops={rops}
              operators={operators}
              initialFunnel={funnel}
              initialTeamId={teamId || null}
              initialOperatorId={operatorId || null}
            />
          </>
        }
      />

      <FirstStepsCard />

      {tabsNode}

      {/* Keyed by tab so switching tabs plays .tab-enter (styles.css). */}
      <div key={tab} className="tab-enter">
        {tab === "rating" ? (
          <>
            <Suspense fallback={<Loading />}>
              <Leaderboard embedded extraFilter={saveButton} />
            </Suspense>
            {analyticsOpen && (
              <div className="mt-6">
                <AnalyticsReport report="summary" period={reportRange} funnel={funnel} />
              </div>
            )}
          </>
        ) : (
          <>
            <DashboardFilterRow
              show={TAB_FILTERS[tab]}
              funnel={funnel}
              onFunnelChange={setFunnel}
              teamId={teamId || null}
              onTeamChange={(v) => setTeamId(v ?? "")}
              operatorId={operatorId || null}
              onOperatorChange={(v) => setOperatorId(v ?? "")}
              dateFilter={dateFilter}
              onDateFilterChange={setDateFilter}
              funnelNames={funnelNames}
              rops={rops}
              operators={operators}
              extra={saveButton}
            />

            {tab === "overview" && (
              <>
                <div className="mb-3 mt-5 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-subtle">{periodCaption}</p>
                  {!editingBoard && (
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingBoard(true)}
                        className="inline-flex h-9 items-center gap-2 rounded-xl ctl-soft px-3.5 text-[13px] font-semibold text-foreground phone:hidden hover:text-primary"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        {t("board.customize")}
                      </button>
                    </span>
                  )}
                </div>
                <HomeBoard
                  widgets={boardWidgets}
                  defaults={BOARD_DEFAULTS}
                  editing={editingBoard}
                  onEditingChange={setEditingBoard}
                />
              </>
            )}

            {tab === "conversion" && (
              <div className="mt-6 space-y-6">
                <ConversionMetricsCards funnel={funnel} scope={statsScope} />
                <Suspense fallback={<ChartSkeleton height={340} />}>
                  <Charts.ConversionQualityChart funnel={funnel} />
                </Suspense>
                {analyticsOpen && (
                  <>
                    <AnalyticsReport report="sales" period={reportRange} funnel={funnel} />
                    <AnalyticsReport report="winloss" period={reportRange} funnel={funnel} />
                  </>
                )}
              </div>
            )}

            {tab === "activity" && (
              <div className="mt-6 space-y-6">
                <LeadTasksWidget funnel={funnel} />
                <ActivityWidget funnel={funnel} />
                {analyticsOpen && (
                  <>
                    <AnalyticsReport report="staff" period={reportRange} funnel={funnel} />
                    <AnalyticsReport report="events" period={reportRange} funnel={funnel} />
                  </>
                )}
              </div>
            )}

            {tab === "forecast" && (
              <div className="mt-6 space-y-6">
                {finance.data && (
                  <MonthForecastCard
                    forecast={finance.data.forecast}
                    months={finance.data.months}
                  />
                )}
                <AnalyticsReport report="forecast" period={reportRange} funnel={funnel} />
              </div>
            )}

            {tab === "finance" && (
              <div className="mt-6">
                {finance.data ? <PnlTab data={finance.data} /> : <Loading />}
              </div>
            )}

            {tab === "ai" && (
              <div className="mt-6 space-y-6">
                <AiInsightsWidget funnel={funnel} dateRange={dateRange} />
                <SalesInsightsCards funnel={funnel} dateRange={dateRange} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
