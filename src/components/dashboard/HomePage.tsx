import { lazy, Suspense, useMemo, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ListChecks,
  PhoneCall,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { AiOnboardingBanner } from "@/components/dashboard/AiOnboardingBanner";
import {
  DashboardFilterRow,
  DashboardKpiCards,
  PeriodAttentionRow,
  PeriodCallBlocks,
  usePeriodRanges,
} from "@/components/dashboard/DashboardBlocks";
import { ReportExportDialog } from "@/components/dashboard/ReportExportDialog";
import { HeroKpiStrip } from "@/components/dashboard/HeroKpiStrip";
import {
  LeadTasksWidget,
  InboxWidget,
  ActivityWidget,
  AudioPreviewWidget,
  AiInsightsWidget,
} from "@/components/dashboard/Widgets";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  useFunnelNames,
  usePeriodStats,
  usePermission,
  useProfilesRaw,
  useVisibleOwnerIds,
} from "@/hooks/use-crm-data";
import type { DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import type { AmountRangeValue } from "@/components/filters/AmountRangeFilter";

const Leaderboard = lazy(() =>
  import("@/components/leaderboard/LeaderboardPage").then((m) => ({ default: m.Leaderboard })),
);
const Charts = {
  RevenueChart: lazy(() =>
    import("@/components/dashboard/Charts").then((m) => ({ default: m.RevenueChart })),
  ),
  PipelineChart: lazy(() =>
    import("@/components/dashboard/Charts").then((m) => ({ default: m.PipelineChart })),
  ),
  SalesFunnel: lazy(() =>
    import("@/components/dashboard/Charts").then((m) => ({ default: m.SalesFunnel })),
  ),
  MonthlyRevenueTrendChart: lazy(() =>
    import("@/components/dashboard/Charts").then((m) => ({
      default: m.MonthlyRevenueTrendChart,
    })),
  ),
  RevenueByOwnerChart: lazy(() =>
    import("@/components/dashboard/Charts").then((m) => ({ default: m.RevenueByOwnerChart })),
  ),
  LostReasonsChart: lazy(() =>
    import("@/components/dashboard/Charts").then((m) => ({ default: m.LostReasonsChart })),
  ),
  DealFlowChart: lazy(() =>
    import("@/components/dashboard/Charts").then((m) => ({ default: m.DealFlowChart })),
  ),
  ConversionQualityChart: lazy(() =>
    import("@/components/dashboard/Charts").then((m) => ({ default: m.ConversionQualityChart })),
  ),
  CallPickupByHourChart: lazy(() =>
    import("@/components/dashboard/Charts").then((m) => ({ default: m.CallPickupByHourChart })),
  ),
};

export const HOME_TABS = [
  "overview",
  "rating",
  "revenue",
  "losses",
  "conversion",
  "calls",
  "activity",
  "ai",
] as const;
export type HomeTab = (typeof HOME_TABS)[number];

const TAB_ICONS: Record<HomeTab, LucideIcon> = {
  overview: LayoutDashboard,
  rating: Trophy,
  revenue: TrendingUp,
  losses: TrendingDown,
  conversion: Workflow,
  calls: PhoneCall,
  activity: ListChecks,
  ai: Sparkles,
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
  const search = homeRoute.useSearch();
  const navigate = homeRoute.useNavigate();
  const canSeeRating = usePermission("View leaderboard");

  const tabs = HOME_TABS.filter((tb) => tb !== "rating" || canSeeRating);
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
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({
    from: null,
    to: null,
    label: t("lb.presetAll"),
  });
  const [amountRange, setAmountRange] = useState<AmountRangeValue>({ min: null, max: null });

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
  const period = usePeriodRanges(dateFilter);
  const periodTab = tab === "overview" || tab === "calls";
  const periodStats = usePeriodStats(
    periodTab ? period.range : null,
    periodTab ? period.prevRange : null,
    { funnel, teamId: teamId || null, operatorId: operatorId || null },
  );
  const periodCaption = period.isDefault
    ? t("home.periodDefault")
    : t("home.periodPicked", { label: dateFilter.label });

  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        tone="primary"
        title={t("home.title")}
        description={t("home.desc")}
        actions={
          tab !== "rating" && (
            <ReportExportDialog
              funnelNames={funnelNames}
              rops={rops}
              operators={operators}
              initialFunnel={funnel}
              initialTeamId={teamId || null}
              initialOperatorId={operatorId || null}
            />
          )
        }
      />

      <AiOnboardingBanner />

      <div className="mb-5 inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-soft">
        {tabs.map((key) => {
          const Icon = TAB_ICONS[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl bg-surface px-3.5 py-2 text-sm font-semibold ring-1 ring-transparent transition-colors",
                tab === key
                  ? "bg-primary/10 text-primary ring-primary/50"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t(`home.tab.${key}`)}
            </button>
          );
        })}
      </div>

      {tab === "rating" ? (
        <Suspense fallback={<Loading />}>
          <Leaderboard embedded />
        </Suspense>
      ) : (
        <>
          <SectionCard>
            <DashboardFilterRow
              funnel={funnel}
              onFunnelChange={setFunnel}
              teamId={teamId || null}
              onTeamChange={(v) => setTeamId(v ?? "")}
              operatorId={operatorId || null}
              onOperatorChange={(v) => setOperatorId(v ?? "")}
              dateFilter={dateFilter}
              onDateFilterChange={setDateFilter}
              amountRange={amountRange}
              onAmountRangeChange={setAmountRange}
              funnelNames={funnelNames}
              rops={rops}
              operators={operators}
            />
          </SectionCard>

          {tab === "overview" && (
            <>
              <div className="mt-6">
                <HeroKpiStrip funnel={funnel} />
              </div>
              <div className="mt-6">
                <DashboardKpiCards funnel={funnel} />
              </div>
              <p className="mb-2 mt-6 text-xs font-semibold text-subtle">{periodCaption}</p>
              <PeriodAttentionRow stats={periodStats} funnel={funnel} />
              <div className="mt-6 space-y-6">
                <Suspense fallback={<ChartSkeleton />}>
                  <Charts.RevenueChart />
                </Suspense>
                <Suspense fallback={<ChartSkeleton height={180} />}>
                  <Charts.PipelineChart funnel={funnel} />
                </Suspense>
                <Suspense fallback={<ChartSkeleton height={220} />}>
                  <Charts.SalesFunnel funnel={funnel} />
                </Suspense>
              </div>
            </>
          )}

          {tab === "revenue" && (
            <div className="mt-6 space-y-6">
              <Suspense fallback={<ChartSkeleton />}>
                <Charts.MonthlyRevenueTrendChart funnel={funnel} />
              </Suspense>
              <Suspense fallback={<ChartSkeleton />}>
                <Charts.RevenueByOwnerChart funnel={funnel} dateRange={dateRange} />
              </Suspense>
            </div>
          )}

          {tab === "losses" && (
            <div className="mt-6">
              <Suspense fallback={<ChartSkeleton />}>
                <Charts.LostReasonsChart funnel={funnel} dateRange={dateRange} />
              </Suspense>
            </div>
          )}

          {tab === "conversion" && (
            <div className="mt-6 space-y-6">
              <Suspense fallback={<ChartSkeleton height={320} />}>
                <Charts.DealFlowChart funnel={funnel} />
              </Suspense>
              <Suspense fallback={<ChartSkeleton height={340} />}>
                <Charts.ConversionQualityChart funnel={funnel} />
              </Suspense>
            </div>
          )}

          {tab === "calls" && (
            <div className="mt-6 space-y-6">
              <div>
                <p className="mb-2 text-xs font-semibold text-subtle">{periodCaption}</p>
                <PeriodCallBlocks stats={periodStats} />
              </div>
              <Suspense fallback={<ChartSkeleton />}>
                <Charts.CallPickupByHourChart dateRange={dateRange} />
              </Suspense>
            </div>
          )}

          {tab === "activity" && (
            <div className="mt-6 space-y-6">
              <LeadTasksWidget funnel={funnel} />
              <InboxWidget />
              <ActivityWidget funnel={funnel} />
              <AudioPreviewWidget funnel={funnel} />
            </div>
          )}

          {tab === "ai" && (
            <div className="mt-6">
              <AiInsightsWidget funnel={funnel} dateRange={dateRange} />
            </div>
          )}
        </>
      )}
    </>
  );
}
