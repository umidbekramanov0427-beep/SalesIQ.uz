import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Globe, Loader2, MousePointerClick, PhoneCall, Percent, Users } from "lucide-react";
import { SectionCard, StatCard } from "@/components/layout/Primitives";
import { ShareBars } from "@/components/marketing/ChannelCharts";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useSiteStats } from "@/hooks/use-crm-data";

// Marketing -> Umumiy -> Sayt: the company's website for the period --
// visits, visitors, how many left a phone (became leads) and the share,
// each day, and which sources bring visitors who convert. Until the line
// is on the site, how to put it there.

const nf = (n: number) => n.toLocaleString("ru-RU");

export function SiteCard({ period }: { period: { from: string; to: string } }) {
  const { t } = useI18n();
  const { data, isLoading } = useSiteStats(period);
  const [hover, setHover] = useState<number | null>(null);
  if (isLoading) {
    return (
      <div className="surface-card flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;
  const s = data.stats;
  if (!data.setup.lastVisit) {
    return (
      <SectionCard
        icon={Globe}
        tone="emerald"
        title={t("mkt.site.cardTitle")}
        description={t("mkt.site.cardEmpty")}
        actions={
          <Link
            to="/marketing/settings"
            search={{ tab: "sources" }}
            className="text-[13px] font-semibold text-primary hover:underline"
          >
            {t("mkt.site.setup")} →
          </Link>
        }
      >
        <p className="font-mono text-[12px] text-muted-foreground">{data.setup.snippet}</p>
      </SectionCard>
    );
  }
  const max = Math.max(1, ...s.days.map((d) => d.visitors));
  return (
    <SectionCard
      icon={Globe}
      tone="emerald"
      title={t("mkt.site.cardTitle")}
      description={t("mkt.site.cardDesc")}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={MousePointerClick}
          iconTone="sky"
          label={t("mkt.site.visits")}
          value={nf(s.visits)}
        />
        <StatCard
          icon={Users}
          iconTone="violet"
          label={t("mkt.site.visitors")}
          value={nf(s.visitors)}
        />
        <StatCard
          icon={PhoneCall}
          iconTone="emerald"
          label={t("mkt.site.leads")}
          value={nf(s.leads)}
        />
        <StatCard
          icon={Percent}
          iconTone="amber"
          label={t("mkt.site.conversion")}
          value={s.conversionPct != null ? `${s.conversionPct}%` : "—"}
          hint={t("mkt.site.conversionHint")}
        />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div>
          <p className="mb-2 text-[13px] font-semibold text-foreground">{t("mkt.site.byDay")}</p>
          <div
            className="flex h-[150px] items-end gap-[3px] border-b border-border"
            onMouseLeave={() => setHover(null)}
          >
            {s.days.map((d, i) => (
              <div
                key={d.day}
                className={cn(
                  "relative flex h-full flex-1 items-end",
                  hover === i && "bg-foreground/[0.04]",
                )}
                onMouseEnter={() => setHover(i)}
              >
                <div
                  className="w-full rounded-t-[3px] bg-sky-500/80"
                  style={{ height: `${(d.visitors / max) * 100}%`, minHeight: d.visitors ? 2 : 0 }}
                />
                {d.leads > 0 && (
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-emerald-500"
                    style={{ height: `${(d.leads / max) * 100}%`, minHeight: 3 }}
                  />
                )}
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[12px] shadow-md">
                    <p className="font-semibold">{d.day.slice(5).split("-").reverse().join(".")}</p>
                    <p>
                      {t("mkt.site.visitors")}: {nf(d.visitors)}
                    </p>
                    <p className="text-emerald-700 dark:text-emerald-300">
                      {t("mkt.site.leads")}: {nf(d.leads)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" />
              {t("mkt.site.visitors")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              {t("mkt.site.leads")}
            </span>
          </div>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-semibold text-foreground">{t("mkt.site.sources")}</p>
          <ShareBars
            tone="bg-sky-500"
            items={s.sources.slice(0, 6).map((x) => ({
              name: x.name === "direct" ? t("mkt.site.direct") : x.name,
              value: x.visitors,
              sub: x.visitors
                ? `${t("mkt.site.leads")}: ${x.leads} · ${Math.round((x.leads / x.visitors) * 100)}%`
                : "",
            }))}
          />
        </div>
      </div>
    </SectionCard>
  );
}
