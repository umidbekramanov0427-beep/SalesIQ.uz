import { lazy, Suspense, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ListChecks,
  PhoneCall,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { DashboardFilterRow, DashboardKpiCards } from "@/components/dashboard/DailyReport";
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
import { useFunnelNames, useProfilesRaw, useVisibleOwnerIds } from "@/hooks/use-crm-data";
import type { DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import type { AmountRangeValue } from "@/components/filters/AmountRangeFilter";

const RevenueChart = lazy(() =>
  import("@/components/dashboard/Charts").then((m) => ({ default: m.RevenueChart })),
);
const PipelineChart = lazy(() =>
  import("@/components/dashboard/Charts").then((m) => ({ default: m.PipelineChart })),
);
const SalesFunnel = lazy(() =>
  import("@/components/dashboard/Charts").then((m) => ({ default: m.SalesFunnel })),
);
const MonthlyRevenueTrendChart = lazy(() =>
  import("@/components/dashboard/Charts").then((m) => ({ default: m.MonthlyRevenueTrendChart })),
);
const RevenueByOwnerChart = lazy(() =>
  import("@/components/dashboard/Charts").then((m) => ({ default: m.RevenueByOwnerChart })),
);
const LostReasonsChart = lazy(() =>
  import("@/components/dashboard/Charts").then((m) => ({ default: m.LostReasonsChart })),
);
const DealFlowChart = lazy(() =>
  import("@/components/dashboard/Charts").then((m) => ({ default: m.DealFlowChart })),
);
const ConversionQualityChart = lazy(() =>
  import("@/components/dashboard/Charts").then((m) => ({ default: m.ConversionQualityChart })),
);
const CallPickupByHourChart = lazy(() =>
  import("@/components/dashboard/Charts").then((m) => ({ default: m.CallPickupByHourChart })),
);

type DashTab = "overview" | "revenue" | "losses" | "conversion" | "calls" | "activity" | "ai";

const DASH_TABS: {
  key: DashTab;
  icon: typeof LayoutDashboard;
  labelKey: string;
  iconColor: string;
}[] = [
  {
    key: "overview",
    icon: LayoutDashboard,
    labelKey: "dash.tabOverview",
    iconColor: "text-blue-500",
  },
  { key: "revenue", icon: TrendingUp, labelKey: "dash.tabRevenue", iconColor: "text-emerald-500" },
  { key: "losses", icon: TrendingDown, labelKey: "dash.tabLosses", iconColor: "text-rose-500" },
  {
    key: "conversion",
    icon: Workflow,
    labelKey: "dash.tabConversion",
    iconColor: "text-amber-500",
  },
  { key: "calls", icon: PhoneCall, labelKey: "dash.tabCalls", iconColor: "text-teal-500" },
  { key: "activity", icon: ListChecks, labelKey: "dash.tabActivity", iconColor: "text-orange-500" },
  { key: "ai", icon: Sparkles, labelKey: "dash.tabAi", iconColor: "text-violet-500" },
];

export const Route = createFileRoute("/dashboard")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    funnel?: string | undefined;
  } => ({
    funnel: typeof search["funnel"] === "string" ? search["funnel"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Dashboard — SalesIQ" },
      {
        name: "description",
        content:
          "Revenue, pipeline, leaderboard, tasks and AI insights — the operating center of your sales team.",
      },
      { property: "og:title", content: "Dashboard — SalesIQ" },
      {
        property: "og:description",
        content: "Revenue, pipeline, leaderboard, tasks and AI insights in one command center.",
      },
    ],
  }),
  component: Dashboard,
});

function ChartSkeleton({ height = 300, className }: { height?: number; className?: string }) {
  return (
    <div className={`surface-card p-6 ${className ?? ""}`}>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-2 h-3 w-56" />
      <Skeleton className="mt-6 w-full rounded-xl" style={{ height }} />
    </div>
  );
}

function Dashboard() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // Funnel lives in the URL (not local state) so refreshing the page or
  // navigating back keeps whatever was picked instead of resetting to
  // "nothing selected" -- same pattern used across Funnels/AmoCRM/Reyting.
  // The 5-section Kunlik hisobot report moved out to its own sidebar page
  // (/daily-report), but this page keeps its own filter row and the 8 KPI
  // cards -- they drive the charts below, independent of daily-report's
  // own filter state.
  const funnel = search.funnel ?? null;
  const [teamId, setTeamId] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({
    from: null,
    to: null,
    label: t("lb.presetAll"),
  });
  const [amountRange, setAmountRange] = useState<AmountRangeValue>({ min: null, max: null });

  function setFunnel(v: string | null) {
    void navigate({ search: (prev) => ({ ...prev, funnel: v ?? undefined }), replace: true });
  }

  const { names: funnelNames } = useFunnelNames();
  const { data: profiles } = useProfilesRaw();
  // Unscoped, these dropdowns handed a rep the full company roster to pick
  // through -- the same "sees everyone" leak as the charts below, just in
  // filter-picker form instead of a chart. A rep's own visibleOwnerIds is
  // just themself, so both lists collapse to "only me" for that role.
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
  const [tab, setTab] = useState<DashTab>("overview");

  return (
    <>
      <PageHeader title={t("dash.title")} description={t("dash.desc")} />

      <div className="mb-6 inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-soft">
        {DASH_TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl bg-surface px-3.5 py-2 text-sm font-semibold ring-1 ring-transparent transition-colors",
              tab === tb.key
                ? "bg-primary/10 text-primary ring-primary/50"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <tb.icon className={cn("h-4 w-4", tb.iconColor)} />
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <SectionCard title={t("lb.filters")}>
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
      </div>

      {tab === "overview" && (
        <>
          <div className="mt-6">
            <DashboardKpiCards funnel={funnel} />
          </div>
          <div className="mt-6 space-y-6">
            <Suspense fallback={<ChartSkeleton />}>
              <RevenueChart />
            </Suspense>
            <Suspense fallback={<ChartSkeleton height={180} />}>
              <PipelineChart funnel={funnel} />
            </Suspense>
            <Suspense fallback={<ChartSkeleton height={220} />}>
              <SalesFunnel funnel={funnel} />
            </Suspense>
          </div>
        </>
      )}

      {tab === "revenue" && (
        <div className="mt-6 space-y-6">
          <Suspense fallback={<ChartSkeleton />}>
            <MonthlyRevenueTrendChart funnel={funnel} />
          </Suspense>
          <Suspense fallback={<ChartSkeleton />}>
            <RevenueByOwnerChart funnel={funnel} dateRange={dateRange} />
          </Suspense>
        </div>
      )}

      {tab === "losses" && (
        <div className="mt-6">
          <Suspense fallback={<ChartSkeleton />}>
            <LostReasonsChart funnel={funnel} dateRange={dateRange} />
          </Suspense>
        </div>
      )}

      {tab === "conversion" && (
        <div className="mt-6 space-y-6">
          <Suspense fallback={<ChartSkeleton height={320} />}>
            <DealFlowChart funnel={funnel} />
          </Suspense>
          <Suspense fallback={<ChartSkeleton height={340} />}>
            <ConversionQualityChart funnel={funnel} />
          </Suspense>
        </div>
      )}

      {tab === "calls" && (
        <div className="mt-6">
          <Suspense fallback={<ChartSkeleton />}>
            <CallPickupByHourChart dateRange={dateRange} />
          </Suspense>
        </div>
      )}

      {tab === "activity" && (
        <>
          <div className="mt-6 space-y-6">
            <LeadTasksWidget funnel={funnel} />
          </div>
          <div className="mt-6 space-y-6">
            <InboxWidget />
            <ActivityWidget funnel={funnel} />
            <AudioPreviewWidget funnel={funnel} />
          </div>
        </>
      )}

      {tab === "ai" && (
        <div className="mt-6">
          <AiInsightsWidget funnel={funnel} dateRange={dateRange} />
        </div>
      )}

      <QuickActions />
    </>
  );
}
