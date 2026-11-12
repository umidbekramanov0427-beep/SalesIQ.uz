import { createFileRoute } from "@tanstack/react-router";
import { Download, LayoutDashboard, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { useMarketingData } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import {
  DailyLeads,
  OverviewKpis,
  OverviewLists,
  exportOverview,
} from "@/components/marketing/OverviewParts";
import { MarketingFilterBar, useMarketingFilters } from "@/components/marketing/MarketingFilters";

// Marketing paneli -> Umumiy: the period at a glance -- new leads (and how
// many were hot), AI lead quality, ad spend, cost per lead and ROI, leads
// per day, and the sources and campaigns behind them. Follows the project
// and period filters; Excel exports all of it.

export const Route = createFileRoute("/marketing/")({
  head: () => ({ meta: [{ title: "Marketing — SalesIQ" }] }),
  component: MarketingOverview,
});

function MarketingOverview() {
  const { t } = useI18n();
  const f = useMarketingFilters();
  const q = useMarketingData(f.period, f.projectId);
  const d = q.data;

  return (
    <div className="space-y-5">
      <PageHeader
        back={false}
        icon={LayoutDashboard}
        tone="sky"
        title={t("mkt.overview.title")}
        description={t("mkt.overview.desc")}
        actions={
          <Button
            variant="outline"
            disabled={!d}
            onClick={() =>
              d && exportOverview(d, t, f.project ? `marketing-${f.project.name}` : "marketing")
            }
          >
            <Download className="h-4 w-4" />
            Excel
          </Button>
        }
      />
      <MarketingFilterBar>
        {q.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </MarketingFilterBar>

      {!d ? (
        <div className="flex justify-center py-16">
          {q.isError ? (
            <p className="text-sm text-muted-foreground">{t("an.loadError")}</p>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          )}
        </div>
      ) : (
        <>
          <OverviewKpis d={d} />
          <DailyLeads days={d.days} />
          <OverviewLists d={d} />
        </>
      )}
    </div>
  );
}
