import { CollectedPaymentsCard } from "./CollectedPaymentsCard";
import { useAuth } from "@/lib/auth";
import { FirstStepsCard } from "./FirstStepsCard";
import { MyMeetingCard } from "./MyMeetingCard";
import {
  AnalyticsReport,
  reportPeriod,
  useReportItems,
} from "@/components/analytics/AnalyticsReports";
import { canOpenSection } from "@/lib/access-rules";
import { appRoleOf } from "@/lib/nav";
import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { getRouteApi } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeftRight,
  PhoneCall,
  Timer,
  Users,
  ChartColumnBig,
  ClipboardList,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Phone,
  Trophy,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  GreetingHeader,
  HomeOverviewPart,
  type KpiId,
  PeriodSegment,
} from "@/components/dashboard/HomeOverview";
import {
  CardBoard,
  type CardBoardItem,
  type BoardLayout,
  type BoardWidget,
} from "@/components/dashboard/HomeBoard";
import type { CardTone } from "@/lib/tones";
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
import {
  CONV_METRICS,
  CONV_METRIC_META,
  ConversionMetricCard,
} from "@/components/dashboard/ConversionMetricsCards";
import { DailyWorkCard } from "@/components/dashboard/DailyWorkCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/lib/i18n";
import {
  scopeOwnerIds,
  useAccessRules,
  useFunnelNames,
  useMyOrganization,
  usePeriodStats,
  usePermission,
  useProfilesRaw,
  useVisibleOwnerIds,
} from "@/hooks/use-crm-data";
import type { DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import type { DeskView } from "@/components/dashboard/desk/DeskTab";

const Leaderboard = lazy(() =>
  import("@/components/leaderboard/LeaderboardPage").then((m) => ({ default: m.Leaderboard })),
);
const Charts = {
  ConversionQualityChart: lazy(() =>
    import("@/components/dashboard/Charts").then((m) => ({ default: m.ConversionQualityChart })),
  ),
};

// Ish stoli carries the charts library; it loads on its own.
const DeskTab = lazy(() =>
  import("@/components/dashboard/desk/DeskTab").then((m) => ({ default: m.DeskTab })),
);

export const HOME_TABS = ["overview", "rating", "conversion"] as const;
export type HomeTab = (typeof HOME_TABS)[number];

const TAB_ICONS: Record<HomeTab, LucideIcon> = {
  overview: LayoutDashboard,
  rating: Trophy,
  conversion: Workflow,
};

// The filters each tab's numbers actually follow -- a tab shows only those
// (funnel always), so no filter sits there doing nothing.
const TAB_FILTERS: Record<Exclude<HomeTab, "rating" | "overview">, FilterSet> = {
  conversion: { team: true, operator: true, date: true },
};

// What the overview shows before anyone arranges it (the page as it was).
const KPI_WIDGETS: { id: KpiId; label: string; icon: LucideIcon; tone: CardTone }[] = [
  { id: "newLeads", label: "home2.kpiLeads", icon: Users, tone: "primary" },
  { id: "firstContact", label: "home2.kpiFirstContact", icon: Timer, tone: "amber" },
  { id: "attempts", label: "home2.kpiAttempts", icon: PhoneCall, tone: "sky" },
  { id: "cycle", label: "home2.kpiCycle", icon: ArrowLeftRight, tone: "violet" },
];
const KPI_WIDGET_IDS = KPI_WIDGETS.map((k) => `kpi:${k.id}`);

const BOARD_DEFAULTS: BoardLayout = {
  order: [
    // Three cards a row (two rows), then Bugun beside the revenue chart.
    ...KPI_WIDGET_IDS,
    "tasks",
    "calls",
    "dailyWork",
    "payments",
    "kpiCards",
    "attention",
  ],
  size: {
    ...Object.fromEntries(KPI_WIDGET_IDS.map((id) => [id, 4 as const])),
    tasks: 6,
    calls: 6,
  },
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
  const search = homeRoute.useSearch();
  const navigate = homeRoute.useNavigate();
  const canSeeRating = usePermission("View leaderboard");
  const { data: org } = useMyOrganization();

  // Analitika's sales reports live in these tabs now; Sozlamalar ->
  // Huquqlar can still close "Analitika" for a role, which hides them.
  const { rules: accessRules } = useAccessRules();
  const analyticsOpen = canOpenSection(accessRules, appRoleOf(me), "/analytics");
  const tabs = HOME_TABS.filter((tb) => (tb === "rating" ? canSeeRating : true));
  const tab: HomeTab =
    search.tab && tabs.includes(search.tab as HomeTab) ? (search.tab as HomeTab) : "overview";
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
  // Umumiy follows the desk's own period and funnel (its head row).
  const [deskView, setDeskView] = useState<DeskView | null>(null);
  const ov = useMemo(() => {
    const day = (s: string) => new Date(`${s}T00:00:00`);
    const next = (s: string) => new Date(day(s).getTime() + 86_400_000);
    if (!deskView) return { range: period.range, prevRange: period.prevRange, funnel: null };
    return {
      range: { from: day(deskView.from), to: next(deskView.to) },
      prevRange: { from: day(deskView.prevFrom), to: next(deskView.prevTo) },
      funnel: deskView.funnel,
    };
  }, [deskView, period.range, period.prevRange]);
  const ovScope = useMemo(
    () => ({ ownerIds: null, from: ov.range.from, to: ov.range.to }),
    [ov.range.from, ov.range.to],
  );
  const periodTab = tab === "overview";
  const periodStats = usePeriodStats(periodTab ? ov.range : null, periodTab ? ov.prevRange : null, {
    funnel: ov.funnel,
    teamId: null,
    operatorId: null,
  });
  // The reports' period: the page's own date pick (30 days by default).
  const reportRange = reportPeriod(period.range);

  // Bosh sahifa's overview as a board each person arranges (HomeBoard):
  // the overview's own blocks first, the other tabs' widgets in the list.
  const overviewProps = {
    range: ov.range,
    prevRange: ov.prevRange,
    funnel: ov.funnel,
    ownerIds: null,
    statsScope: ovScope,
  };
  const boardWidgets: BoardWidget[] = [
    // The six figure cards, each its own widget: any width from a quarter
    // of the row to the whole row (three in a row by default).
    ...KPI_WIDGETS.map((k): BoardWidget => ({
      id: `kpi:${k.id}`,
      title: t(k.label),
      icon: k.icon,
      tone: k.tone,
      sizes: [3, 4, 6, 12],
      node: <HomeOverviewPart part={`kpi:${k.id}`} {...overviewProps} />,
    })),
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
      sizes: [4, 6, 8, 12],
      node: <DailyWorkCard />,
    },
    {
      id: "payments",
      title: t("board.w.payments"),
      icon: Wallet,
      tone: "emerald",
      sizes: [4, 6, 8, 12],
      node: <CollectedPaymentsCard funnel={ov.funnel} dateRange={ov.range} />,
    },
    {
      id: "kpiCards",
      title: t("board.w.kpiCards"),
      icon: LayoutGrid,
      tone: "sky",
      sizes: [6, 8, 12],
      node: <DashboardKpiCards funnel={ov.funnel} scope={ovScope} />,
    },
    {
      id: "attention",
      title: t("board.w.attention"),
      icon: AlertTriangle,
      tone: "amber",
      sizes: [6, 8, 12],
      node: <PeriodAttentionRow stats={periodStats} funnel={ov.funnel} />,
    },
  ];

  // Konversiya as a board: the four rates, the quality chart and (with
  // Analitika open) the sales and win-loss reports' cards one by one.
  const salesReport = useReportItems(
    "sales",
    reportRange,
    funnel,
    tab === "conversion" && analyticsOpen,
  );
  const winLossReport = useReportItems(
    "winloss",
    reportRange,
    funnel,
    tab === "conversion" && analyticsOpen,
  );
  const conversionItems: CardBoardItem[] = [
    ...CONV_METRICS.map((k): CardBoardItem => ({
      id: `conv:${k}`,
      title: t(CONV_METRIC_META[k].title),
      icon: CONV_METRIC_META[k].icon,
      tone: CONV_METRIC_META[k].tone,
      node: <ConversionMetricCard metric={k} funnel={funnel} scope={statsScope} />,
    })),
    {
      id: "conv:chart",
      title: t("board.w.conversionChart"),
      icon: ChartColumnBig,
      tone: "violet",
      span: 12,
      sizes: [6, 8, 12],
      node: (
        <Suspense fallback={<ChartSkeleton height={340} />}>
          <Charts.ConversionQualityChart funnel={funnel} />
        </Suspense>
      ),
    },
    ...(analyticsOpen ? [...salesReport.items, ...winLossReport.items] : []),
  ];

  // The tabs on the left, the tab's filters on the right of the same row.
  const tabsRow = (filters?: ReactNode) => (
    <Segmented
      sticky
      centered
      className="mb-5"
      value={tab}
      onChange={setTab}
      trailing={filters}
      options={tabs.map((key) => ({
        value: key,
        label: t(`home.tab.${key}`),
        icon: TAB_ICONS[key],
      }))}
    />
  );
  const conversionFilters = (
    <DashboardFilterRow
      show={TAB_FILTERS.conversion}
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
  );

  // Umumiy brings its own head (company, period buttons, funnel, Eksport)
  // with the tabs under it; its board holds the desk's cards and the rest.
  if (tab === "overview") {
    return (
      <>
        <MyMeetingCard />
        <FirstStepsCard />
        <div key={tab} className="tab-enter">
          <Suspense
            fallback={
              <>
                {tabsRow()}
                <Loading />
              </>
            }
          >
            <DeskTab
              renderTabs={tabsRow}
              onView={setDeskView}
              extra={{ widgets: boardWidgets, layout: BOARD_DEFAULTS }}
            />
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

      <MyMeetingCard />
      <FirstStepsCard />

      {tabsRow(tab === "conversion" ? conversionFilters : undefined)}

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
          <div>
            {salesReport.notice}
            <CardBoard boardKey="home.conversion" items={conversionItems} />
          </div>
        )}
      </div>
    </>
  );
}
