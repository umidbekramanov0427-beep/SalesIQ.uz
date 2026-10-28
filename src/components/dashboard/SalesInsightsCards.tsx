import { Gauge, Loader2, TrendingDown } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useSalesInsights } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ScoreBand, StageGap } from "@/lib/sales-insights";

// The home page's "AI tahlil" tab: does the AI's call score match real
// sales (conversion by score band), and which step of the sales script is
// skipped in the deals that were lost. Sums: src/lib/sales-insights.ts.

const BAND_COLOR: Record<string, string> = {
  "0-39": "bg-red-500",
  "40-59": "bg-amber-500",
  "60-79": "bg-sky-500",
  "80-100": "bg-emerald-500",
};

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function ScoreBands({ bands }: { bands: ScoreBand[] }) {
  const { t } = useI18n();
  const top = bands[bands.length - 1];
  const low = bands[0];
  return (
    <div className="space-y-3">
      {top?.conversion != null && low?.conversion != null && (
        <p className="rounded-xl bg-primary/8 px-3.5 py-2.5 text-[13px] font-medium text-foreground">
          {t("insights.bandsLead", { top: String(top.conversion), low: String(low.conversion) })}
        </p>
      )}
      {[...bands].reverse().map((b) => (
        <div key={b.key} className="grid grid-cols-[88px_1fr_52px] items-center gap-3">
          <span className="text-[13px] font-bold tabular-nums text-foreground">
            {t("insights.band", { band: b.key.replace("-", "–") })}
          </span>
          <div className="min-w-0">
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", BAND_COLOR[b.key])}
                style={{ width: `${b.conversion ?? 0}%` }}
              />
            </div>
            <p className="mt-1 truncate text-[12px] text-muted-foreground">
              {t("insights.bandCounts", {
                leads: String(b.leads),
                won: String(b.won),
                lost: String(b.lost),
                open: String(b.open),
              })}
            </p>
          </div>
          <span className="text-right text-[15px] font-extrabold tabular-nums text-foreground">
            {b.conversion == null ? "—" : `${b.conversion}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

function StageGaps({ gaps }: { gaps: StageGap[] }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3.5">
      {gaps[0] && gaps[0].gap >= 15 && (
        <p className="rounded-xl bg-destructive/8 px-3.5 py-2.5 text-[13px] font-medium text-foreground">
          {t("insights.gapLead", {
            stage: gaps[0].stage,
            won: String(gaps[0].wonRate),
            lost: String(gaps[0].lostRate),
          })}
        </p>
      )}
      {gaps.map((g, i) => (
        <div key={g.stage}>
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[13px] font-bold text-foreground">
              {g.stage}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                i === 0 && g.gap >= 15
                  ? "bg-destructive/12 text-destructive"
                  : "bg-foreground/[0.06] text-muted-foreground",
              )}
            >
              {g.gap > 0 ? `+${g.gap}` : g.gap}
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-[64px_1fr_40px] items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">{t("insights.won")}</span>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${g.wonRate}%` }}
              />
            </div>
            <span className="text-right font-semibold tabular-nums text-foreground">
              {g.wonRate}%
            </span>
            <span className="text-muted-foreground">{t("insights.lost")}</span>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-red-500" style={{ width: `${g.lostRate}%` }} />
            </div>
            <span className="text-right font-semibold tabular-nums text-foreground">
              {g.lostRate}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SalesInsightsCards({
  funnel,
  dateRange,
}: {
  funnel: string | null;
  dateRange: { from: Date | null; to: Date | null };
}) {
  const { t } = useI18n();
  const { data, isLoading, error } = useSalesInsights({
    funnel,
    from: dateRange.from,
    to: dateRange.to,
  });
  const loading = (
    <div className="flex justify-center py-10">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
  const closed = (data?.bands ?? []).reduce((s, b) => s + b.won + b.lost, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard
        icon={Gauge}
        tone="sky"
        title={t("insights.bandsTitle")}
        description={t("insights.bandsDesc")}
      >
        {isLoading ? (
          loading
        ) : error ? (
          <Empty text={t("insights.failed")} />
        ) : !data || closed === 0 ? (
          <Empty text={t("insights.bandsEmpty")} />
        ) : (
          <ScoreBands bands={data.bands} />
        )}
      </SectionCard>
      <SectionCard
        icon={TrendingDown}
        tone="rose"
        title={t("insights.gapsTitle")}
        description={t("insights.gapsDesc")}
      >
        {isLoading ? (
          loading
        ) : error ? (
          <Empty text={t("insights.failed")} />
        ) : !data || data.gaps.length === 0 ? (
          <Empty text={t("insights.gapsEmpty")} />
        ) : (
          <StageGaps gaps={data.gaps} />
        )}
      </SectionCard>
    </div>
  );
}
