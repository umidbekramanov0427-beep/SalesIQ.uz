import { createFileRoute } from "@tanstack/react-router";
import { Download, Loader2, Megaphone, MousePointerClick } from "lucide-react";
import { PageHeader } from "@/components/layout/Primitives";
import { ListCard } from "@/components/layout/ListCard";
import { Button } from "@/components/ui/button";
import { MarketingTab } from "@/components/analytics/FinanceTabs";
import { useMarketingData } from "@/hooks/use-crm-data";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { downloadXlsx } from "@/lib/xlsx-write";
import type { MetaCampaign } from "@/lib/meta-ads";
import { MarketingFilterBar, useMarketingFilters } from "@/components/marketing/MarketingFilters";

// Marketing paneli -> Reklama: ad spend per lead source against the leads,
// sales and revenue it brought (cost per lead, per sale, ROI), and -- once a
// Meta ad account is connected -- each Facebook/Instagram campaign's spend,
// clicks and leads (Meta's count and the CRM's). Follows the project and
// period filters; manual spend lines go to the chosen project; Excel.

export const Route = createFileRoute("/marketing/ads")({
  head: () => ({ meta: [{ title: "Reklama — SalesIQ Marketing" }] }),
  component: MarketingAds,
});

function MarketingAds() {
  const { t } = useI18n();
  const f = useMarketingFilters();
  const q = useMarketingData(f.period, f.projectId);
  const d = q.data;

  function exportXlsx() {
    if (!d) return;
    downloadXlsx(`reklama-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: t("mkt.exp.sources"),
        rows: [
          [
            t("mkt.exp.source"),
            t("fin.spend"),
            t("fin.newLeads"),
            t("fin.cpl"),
            t("mkt.exp.won"),
            t("mkt.exp.revenue"),
            "ROI %",
          ],
          ...d.sources.rows.map((r) => [
            r.source ?? t("fin.noSource"),
            r.spend,
            r.leads,
            r.cpl,
            r.won,
            r.revenue,
            r.roi,
          ]),
        ],
      },
      {
        name: "Meta",
        rows: [
          [
            t("mkt.exp.campaign"),
            t("fin.spend"),
            t("mkt.meta.impressions"),
            t("mkt.meta.clicks"),
            t("mkt.meta.metaLeads"),
            t("mkt.meta.crmLeads"),
            t("fin.cpl"),
          ],
          ...(d.metaCampaigns ?? []).map((c) => [
            c.campaign,
            c.spend,
            c.impressions,
            c.clicks,
            c.metaLeads,
            c.crmLeads,
            c.cpl,
          ]),
        ],
      },
      {
        name: t("fin.spendLines"),
        rows: [
          [t("mkt.exp.day"), t("mkt.exp.source"), t("fin.spend"), t("mkt.p.note")],
          ...d.spend.map((e) => [e.entry_date, e.source, e.amount, e.note]),
        ],
      },
    ]);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        back={false}
        icon={Megaphone}
        tone="rose"
        title={t("mkt.nav.ads")}
        description={t("mkt.adsDesc")}
        actions={
          <Button variant="outline" onClick={exportXlsx} disabled={!d}>
            <Download className="h-4 w-4" />
            Excel
          </Button>
        }
      />
      <MarketingFilterBar>
        {q.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </MarketingFilterBar>
      {d ? (
        <>
          <MarketingTab
            data={{
              marketing: d.sources,
              // Meta lines come from the sync; only manual ones can be edited.
              entries: d.spend.filter((e) => !e.id.startsWith("meta-")),
              sources: d.sourceNames,
            }}
            canEdit
            projectId={f.projectId}
          />
          {(d.metaCampaigns ?? []).length > 0 && <MetaCampaigns rows={d.metaCampaigns} />}
        </>
      ) : (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function MetaCampaigns({ rows }: { rows: MetaCampaign[] }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const max = Math.max(1, ...rows.map((r) => r.spend));
  return (
    <ListCard<MetaCampaign>
      icon={MousePointerClick}
      tone="sky"
      title={t("mkt.meta.campaigns")}
      description={t("mkt.meta.campaignsDesc")}
      items={rows}
      limit={6}
      searchText={(r) => r.campaign}
      renderRow={(r) => (
        <div key={r.campaign} className="border-b border-border/60 py-3 last:border-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[14px] font-semibold text-foreground">{r.campaign}</span>
            <span className="shrink-0 text-[14px] font-bold tabular-nums text-foreground">
              {format(r.spend)}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-sky-500"
              style={{ width: `${(r.spend / max) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-3 text-[12px] tabular-nums text-muted-foreground">
            <span>
              {t("mkt.meta.clicks")}: {r.clicks.toLocaleString("ru-RU")}
            </span>
            <span>
              {t("mkt.meta.metaLeads")}: {r.metaLeads}
            </span>
            <span>
              {t("mkt.meta.crmLeads")}: <b className="text-foreground">{r.crmLeads}</b>
            </span>
            <span>
              {t("fin.cpl")}:{" "}
              <b className="text-foreground">{r.cpl == null ? "—" : format(r.cpl)}</b>
            </span>
          </p>
        </div>
      )}
    />
  );
}
