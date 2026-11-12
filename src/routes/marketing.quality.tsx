import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Flame,
  Loader2,
  Megaphone,
  Sparkles,
  Target,
  ThermometerSnowflake,
  Wallet,
} from "lucide-react";
import { PageHeader, SectionCard, StatCard } from "@/components/layout/Primitives";
import { ListCard } from "@/components/layout/ListCard";
import { PeriodPicker, usePeriodState } from "@/components/analytics/PeriodPicker";
import { useMarketingData } from "@/hooks/use-crm-data";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { QualityRow } from "@/lib/marketing";
import { QualityLine } from "@/components/marketing/QualityLine";

// Marketing paneli -> Lid sifati: how good the leads from each source and
// campaign were. The score is the AI's (and the rules') reading of the
// client's chat or call with the manager (src/lib/lead-scoring*.ts):
// hot / warm / cold, the average score, and how many became sales.

export const Route = createFileRoute("/marketing/quality")({
  head: () => ({ meta: [{ title: "Lid sifati — SalesIQ Marketing" }] }),
  component: MarketingQuality,
});

function MarketingQuality() {
  const { t } = useI18n();
  const ps = usePeriodState();
  const q = useMarketingData(ps.period);
  const d = q.data;
  const tot = d?.quality.total;
  return (
    <div className="space-y-5">
      <PageHeader
        back={false}
        icon={Sparkles}
        tone="violet"
        title={t("mkt.nav.quality")}
        description={t("mkt.qualityDesc")}
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
      {!d || !tot ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Sparkles}
              iconTone="violet"
              label={t("mkt.avgScore")}
              value={tot.avgScore == null ? "—" : `${tot.avgScore}/100`}
              hint={t("mkt.scoredOf", { n: tot.scored, total: tot.leads })}
              info={t("mkt.avgScoreInfo")}
            />
            <StatCard
              icon={Flame}
              iconTone="rose"
              label={t("mkt.hotLeads")}
              value={String(tot.hot)}
              info={t("mkt.hotInfo")}
            />
            <StatCard
              icon={ThermometerSnowflake}
              iconTone="sky"
              label={t("mkt.coldLeads")}
              value={String(tot.cold)}
            />
            <StatCard
              icon={Target}
              iconTone="emerald"
              label={t("mkt.convTitle")}
              value={`${tot.conversion}%`}
              info={t("mkt.convInfo")}
            />
          </div>

          <ListCard<QualityRow>
            icon={Megaphone}
            tone="rose"
            title={t("mkt.bySourceQuality")}
            description={t("mkt.bySourceQualityDesc")}
            items={d.quality.rows}
            limit={5}
            searchText={(r) => r.key ?? ""}
            renderRow={(r) => <QualityLine key={r.key ?? "—"} r={r} none={t("fin.noSource")} />}
            renderFull={(rows) => <QualityTable rows={rows} none={t("fin.noSource")} />}
          />
          <ListCard<QualityRow>
            icon={Wallet}
            tone="violet"
            title={t("mkt.byCampaignQuality")}
            description={t("mkt.byCampaignQualityDesc")}
            items={d.campaigns.rows}
            limit={5}
            searchText={(r) => r.key ?? ""}
            renderRow={(r) => <QualityLine key={r.key ?? "—"} r={r} none={t("mkt.noCampaign")} />}
            renderFull={(rows) => <QualityTable rows={rows} none={t("mkt.noCampaign")} />}
          />
          <SectionCard icon={Sparkles} tone="slate" title={t("mkt.howScored")}>
            <ul className="grid gap-3 text-[13px] leading-relaxed text-muted-foreground sm:grid-cols-3">
              <Legend tone="bg-rose-500" title={t("mkt.tHot")} text={t("mkt.tHotDesc")} />
              <Legend tone="bg-amber-400" title={t("mkt.tWarm")} text={t("mkt.tWarmDesc")} />
              <Legend tone="bg-sky-400" title={t("mkt.tCold")} text={t("mkt.tColdDesc")} />
            </ul>
            <p className="mt-3 text-[12.5px] text-muted-foreground">{t("mkt.howScoredDesc")}</p>
          </SectionCard>
        </>
      )}
    </div>
  );
}

function Legend({ tone, title, text }: { tone: string; title: string; text: ReactNode }) {
  return (
    <li className="rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 font-semibold text-foreground">
        <span className={cn("h-2.5 w-2.5 rounded-full", tone)} />
        {title}
      </p>
      <p className="mt-1">{text}</p>
    </li>
  );
}

function QualityTable({ rows, none }: { rows: QualityRow[]; none: string }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const th = "px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-subtle";
  const td = "whitespace-nowrap px-2.5 py-2.5 text-[13px] tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse">
        <thead className="border-b border-border">
          <tr>
            <th className={cn(th, "text-left")}>{t("fin.source")}</th>
            <th className={cn(th, "text-right")}>{t("fin.leads")}</th>
            <th className={cn(th, "text-right")}>{t("mkt.scoreShort")}</th>
            <th className={cn(th, "text-right")}>{t("mkt.tHot")}</th>
            <th className={cn(th, "text-right")}>{t("mkt.tWarm")}</th>
            <th className={cn(th, "text-right")}>{t("mkt.tCold")}</th>
            <th className={cn(th, "text-right")}>{t("fin.sales")}</th>
            <th className={cn(th, "text-right")}>{t("mkt.conv")}</th>
            <th className={cn(th, "text-right")}>{t("fin.revenue")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key ?? "—"} className="border-b border-border/60 last:border-0">
              <td className={cn(td, "font-semibold text-foreground")}>{r.key ?? none}</td>
              <td className={cn(td, "text-right")}>{r.leads}</td>
              <td className={cn(td, "text-right font-semibold")}>{r.avgScore ?? "—"}</td>
              <td className={cn(td, "text-right text-rose-700 dark:text-rose-300")}>{r.hot}</td>
              <td className={cn(td, "text-right text-amber-700 dark:text-amber-300")}>{r.warm}</td>
              <td className={cn(td, "text-right text-sky-700 dark:text-sky-300")}>{r.cold}</td>
              <td className={cn(td, "text-right")}>{r.won}</td>
              <td className={cn(td, "text-right")}>{r.conversion}%</td>
              <td className={cn(td, "text-right")}>{r.revenue ? format(r.revenue) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
