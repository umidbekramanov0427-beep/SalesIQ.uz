import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/Primitives";
import { DashboardDailyReport, DashboardKpiCards } from "@/components/dashboard/DailyReport";
import { useI18n } from "@/lib/i18n";
import { useFunnelNames, useProfilesRaw } from "@/hooks/use-crm-data";
import type { DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import type { AmountRangeValue } from "@/components/filters/AmountRangeFilter";

export const Route = createFileRoute("/daily-report")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    funnel?: string | undefined;
  } => ({
    funnel: typeof search["funnel"] === "string" ? search["funnel"] : undefined,
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
    </>
  );
}
