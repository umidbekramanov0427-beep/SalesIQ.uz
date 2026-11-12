import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Flame,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader, SectionCard, StatCard } from "@/components/layout/Primitives";
import { ListCard } from "@/components/layout/ListCard";
import { PeriodPicker, usePeriodState } from "@/components/analytics/PeriodPicker";
import { useMarketingData } from "@/hooks/use-crm-data";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DayPoint, QualityRow } from "@/lib/marketing";
import { QualityLine } from "@/components/marketing/QualityLine";
import type { SourceRow } from "@/lib/finance";

// Marketing paneli -> Umumiy: the period at a glance -- new leads (and how
// many were hot), AI lead quality, ad spend, cost per lead and ROI, leads
// per day, and the sources and campaigns behind them.

export const Route = createFileRoute("/marketing/")({
  head: () => ({ meta: [{ title: "Marketing — SalesIQ" }] }),
  component: MarketingOverview,
});

function MarketingOverview() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const ps = usePeriodState();
  const q = useMarketingData(ps.period);
  const d = q.data;
  const qt = d?.quality.total;
  const st = d?.sources.total;
  const hotPct = qt && qt.leads ? Math.round((qt.hot / qt.leads) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        back={false}
        icon={LayoutDashboard}
        tone="sky"
        title={t("mkt.overview.title")}
        description={t("mkt.overview.desc")}
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
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard
              icon={Users}
              iconTone="sky"
              label={t("fin.newLeads")}
              value={String(qt!.leads)}
            />
            <StatCard
              icon={Flame}
              iconTone="rose"
              label={t("mkt.hotLeads")}
              value={`${qt!.hot}`}
              hint={`${hotPct}%`}
              info={t("mkt.hotInfo")}
            />
            <StatCard
              icon={Sparkles}
              iconTone="violet"
              label={t("mkt.avgScore")}
              value={qt!.avgScore == null ? "—" : `${qt!.avgScore}/100`}
              info={t("mkt.avgScoreInfo")}
            />
            <StatCard
              icon={Megaphone}
              iconTone="amber"
              label={t("fin.spend")}
              value={format(st!.spend)}
            />
            <StatCard
              icon={Target}
              iconTone="emerald"
              label={t("fin.cpl")}
              value={st!.cpl == null ? "—" : format(st!.cpl)}
              info={t("fin.cplInfo")}
            />
            <StatCard
              icon={TrendingUp}
              iconTone="emerald"
              label="ROI"
              value={st!.roi == null ? "—" : `${st!.roi > 0 ? "+" : ""}${st!.roi}%`}
              info={t("fin.roiInfo")}
            />
          </div>

          <DailyLeads days={d.days} />

          <div className="grid gap-5 xl:grid-cols-2">
            <ListCard<SourceRow>
              icon={Megaphone}
              tone="rose"
              title={t("mkt.topSources")}
              description={t("mkt.topSourcesDesc")}
              items={d.sources.rows.filter((r) => r.leads || r.spend)}
              searchText={(r) => r.source ?? ""}
              actions={
                <Link
                  to="/marketing/ads"
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] font-semibold text-primary hover:underline"
                >
                  {t("mkt.nav.ads")} <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              }
              renderRow={(r) => (
                <SourceLine
                  key={r.source ?? "—"}
                  r={r}
                  max={Math.max(1, ...d.sources.rows.map((x) => x.leads))}
                />
              )}
            />
            <ListCard<QualityRow>
              icon={Wallet}
              tone="violet"
              title={t("mkt.topCampaigns")}
              description={t("mkt.topCampaignsDesc")}
              items={d.campaigns.rows}
              searchText={(r) => r.key ?? ""}
              renderRow={(r) => <QualityLine key={r.key ?? "—"} r={r} none={t("mkt.noCampaign")} />}
            />
          </div>
        </>
      )}
    </div>
  );
}

function SourceLine({ r, max }: { r: SourceRow; max: number }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  return (
    <div className="border-b border-border/60 py-2.5 last:border-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13.5px]">
        <span className="truncate font-semibold text-foreground">
          {r.source ?? t("fin.noSource")}
        </span>
        <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
          {t("mkt.leadsN", { n: r.leads })}
          {r.cpl != null && <> · {format(r.cpl)}</>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-rose-400"
          style={{ width: `${(r.leads / max) * 100}%` }}
        />
      </div>
    </div>
  );
}

// New leads per day, with the hot ones as the darker part of each bar.
function DailyLeads({ days }: { days: DayPoint[] }) {
  const { t } = useI18n();
  const max = Math.max(1, ...days.map((d) => d.leads));
  const step = days.length > 20 ? Math.ceil(days.length / 10) : 1;
  return (
    <SectionCard icon={Users} tone="sky" title={t("mkt.daily")} description={t("mkt.dailyDesc")}>
      <div className="flex h-[170px] items-end gap-[3px] border-b border-border pt-2">
        {days.map((d, i) => (
          <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
            <span className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11.5px] text-foreground shadow-sm group-hover:block">
              {d.day}: {t("mkt.leadsN", { n: d.leads })} · {t("mkt.hotN", { n: d.hot })}
            </span>
            <div
              className="relative w-full overflow-hidden rounded-t bg-sky-400/50"
              style={{ height: `${(d.leads / max) * 100}%`, minHeight: d.leads ? 3 : 0 }}
            >
              <div
                className="absolute inset-x-0 bottom-0 bg-rose-500/80"
                style={{ height: `${d.leads ? (d.hot / d.leads) * 100 : 0}%` }}
              />
            </div>
            {i % step === 0 && (
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10.5px] text-muted-foreground">
                {d.day.slice(8)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-7 flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-sm bg-sky-400/50")} /> {t("fin.newLeads")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/80" /> {t("mkt.hotLeads")}
        </span>
      </div>
    </SectionCard>
  );
}
