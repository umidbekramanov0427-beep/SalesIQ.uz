import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/layout/Primitives";
import { PeriodPicker, usePeriodState } from "@/components/analytics/PeriodPicker";
import { MarketingTab } from "@/components/analytics/FinanceTabs";
import { useMarketingData } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";

// Marketing paneli -> Reklama: ad spend per lead source against the leads,
// sales and revenue it brought (cost per lead, per sale, ROI). Moved here
// from the CRM's Analitika. Spend lines are kept in finance_entries.

export const Route = createFileRoute("/marketing/ads")({
  head: () => ({ meta: [{ title: "Reklama — SalesIQ Marketing" }] }),
  component: MarketingAds,
});

function MarketingAds() {
  const { t } = useI18n();
  const ps = usePeriodState();
  const q = useMarketingData(ps.period);
  const d = q.data;
  return (
    <div className="space-y-5">
      <PageHeader
        back={false}
        icon={Megaphone}
        tone="rose"
        title={t("mkt.nav.ads")}
        description={t("mkt.adsDesc")}
      />
      <div className="flex items-center gap-3">
        <PeriodPicker
          preset={ps.preset}
          period={ps.period}
          onPreset={ps.setPreset}
          onPeriod={ps.setPeriod}
        />
        {q.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {d ? (
        <MarketingTab
          data={{ marketing: d.sources, entries: d.spend, sources: d.sourceNames }}
          canEdit
        />
      ) : (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
