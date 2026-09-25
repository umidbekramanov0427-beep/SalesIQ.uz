import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/Primitives";
import { DashboardDailyReport, DashboardKpiCards } from "@/components/dashboard/DailyReport";
import { ReportBuilderPanel } from "@/components/reports/ReportBuilderPanel";
import { PermissionGate } from "@/components/PermissionGate";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useFunnelNames, useProfilesRaw } from "@/hooks/use-crm-data";
import type { DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import type { AmountRangeValue } from "@/components/filters/AmountRangeFilter";

const DAILY_REPORT_TABS = ["report", "builder"] as const;
type DailyReportTab = (typeof DAILY_REPORT_TABS)[number];

export const Route = createFileRoute("/daily-report")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    funnel?: string | undefined;
    tab?: DailyReportTab | undefined;
  } => ({
    funnel: typeof search["funnel"] === "string" ? search["funnel"] : undefined,
    tab: DAILY_REPORT_TABS.includes(search["tab"] as DailyReportTab)
      ? (search["tab"] as DailyReportTab)
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Daily Report — SalesIQ" },
      {
        name: "description",
        content: "The day/week/month breakdown that used to live on the Dashboard, on its own.",
      },
    ],
  }),
  component: DailyReportPage,
});

// This whole page used to be a card embedded at the top of /dashboard
// (DashboardDailyReport) -- moved out to its own sidebar entry, so it
// keeps its own independent funnel/team/operator/date/amount filter
// state instead of sharing the Dashboard page's.
function DailyReportPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const funnel = search.funnel ?? null;
  const tab = search.tab ?? "report";
  function setTab(v: DailyReportTab) {
    void navigate({ search: (prev) => ({ ...prev, tab: v }), replace: true });
  }
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
  const rops = useMemo(
    () =>
      (profiles ?? [])
        .filter((p) => p.role === "rop")
        .slice()
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles],
  );
  const operators = useMemo(() => {
    const all = (profiles ?? []).slice().sort((a, b) => a.full_name.localeCompare(b.full_name));
    if (!teamId) return all;
    return all.filter((p) => p.id === teamId || p.manager_id === teamId);
  }, [profiles, teamId]);

  return (
    <>
      <PageHeader title={t("dailyReport.title")} description={t("dailyReport.desc")} />

      <div className="mb-5 flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1">
        {DAILY_REPORT_TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              tab === tb
                ? "bg-background text-foreground shadow-soft"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {t(`dailyReport.tab.${tb}`)}
          </button>
        ))}
      </div>

      {tab === "report" && (
        <DashboardDailyReport
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
          kpiCards={<DashboardKpiCards funnel={funnel} />}
        />
      )}

      {tab === "builder" && (
        <PermissionGate action="View leads">
          <ReportBuilderPanel />
        </PermissionGate>
      )}
    </>
  );
}
