import { useMemo } from "react";
import { BadgeCheck, CircleDollarSign, PhoneCall, Users, type LucideIcon } from "lucide-react";
import { InfoTip } from "@/components/layout/Primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { FitText } from "@/components/ui/fit-text";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TONE_TEXT, type CardTone } from "@/lib/tones";
import { conversionMetrics, type Rate } from "@/lib/conversion-metrics";

const FILL: Record<CardTone, string> = {
  primary: "bg-primary",
  emerald: "bg-success",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-500",
};
import {
  useLeadCube,
  usePipelineStagesRaw,
  useVisibleOwnerIds,
  type StatsScope,
} from "@/hooks/use-crm-data";

// Up to four stage names, then "+N".
function nameList(names: string[]): string {
  if (names.length === 0) return "—";
  const shown = names.slice(0, 4).join(", ");
  return names.length > 4 ? `${shown} +${names.length - 4}` : shown;
}

function MetricCard({
  icon: Icon,
  tone,
  title,
  rate,
  numLabel,
  denLabel,
  info,
  loading,
}: {
  icon: LucideIcon;
  tone: CardTone;
  title: string;
  rate: Rate;
  numLabel: string;
  denLabel: string;
  info: string;
  loading: boolean;
}) {
  return (
    <div className="surface-card flex min-w-0 flex-col p-4 sm:p-5">
      <p className="flex min-h-10 items-start gap-2 text-sm font-bold leading-snug text-foreground">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE_TEXT[tone])} />
        <span className="min-w-0 flex-1">{title}</span>
        <InfoTip text={info} />
      </p>
      {loading ? (
        <Skeleton className="mt-4 h-9 w-24" />
      ) : (
        <p
          className={cn(
            "mt-3 font-display text-3xl font-extrabold tabular-nums sm:text-4xl",
            TONE_TEXT[tone],
          )}
        >
          <FitText>{rate.pct}%</FitText>
        </p>
      )}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width] duration-700", FILL[tone])}
          style={{ width: `${Math.min(100, rate.pct)}%` }}
        />
      </div>
      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">{numLabel}</dt>
          <dd className="font-semibold tabular-nums text-foreground">{rate.num}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">{denLabel}</dt>
          <dd className="font-semibold tabular-nums text-foreground">{rate.den}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * The Konversiya tab: four conversion rates over the leads created in the
 * picked period (all time by default), for the funnel / team / operator
 * picked above. Which stages count as "no number", "unreachable", "new",
 * prepayment or full payment is read from the stage names and listed in
 * each card's "!".
 */
export function ConversionMetricsCards({
  funnel,
  scope,
}: {
  funnel: string | null;
  scope?: StatsScope;
}) {
  const { t } = useI18n();
  const { data: cube, isLoading } = useLeadCube({
    funnel,
    from: scope?.from ?? null,
    to: scope?.to ?? null,
  });
  const { data: stages, isLoading: stagesLoading } = usePipelineStagesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const ownerKey = scope?.ownerIds ? scope.ownerIds.join(",") : null;

  const m = useMemo(() => {
    const picked = ownerKey ? new Set(ownerKey.split(",")) : null;
    const counts = (cube ?? [])
      .filter(
        (r) =>
          (!visibleOwnerIds || (r.owner_id && visibleOwnerIds.has(r.owner_id))) &&
          (!picked || (r.owner_id && picked.has(r.owner_id))),
      )
      .map((r) => ({ stage_id: r.stage_id, n: r.n }));
    const pool = (stages ?? []).filter((s) => !funnel || s.pipeline_name === funnel);
    return conversionMetrics(counts, pool);
  }, [cube, stages, funnel, visibleOwnerIds, ownerKey]);

  const loading = isLoading || stagesLoading;
  const sales = t("conv.sales");
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        icon={Users}
        tone="primary"
        title={t("conv.overall")}
        rate={m.overall}
        numLabel={sales}
        denLabel={t("conv.allLeads")}
        info={t("conv.overallInfo", { sales: nameList([...m.names.partial, ...m.names.full]) })}
        loading={loading}
      />
      <MetricCard
        icon={BadgeCheck}
        tone="emerald"
        title={t("conv.qualified")}
        rate={m.qualified}
        numLabel={sales}
        denLabel={t("conv.qualifiedLeads")}
        info={t("conv.qualifiedInfo", {
          wrong: nameList(m.names.wrongNumber),
          lost: nameList(m.names.lost),
        })}
        loading={loading}
      />
      <MetricCard
        icon={PhoneCall}
        tone="sky"
        title={t("conv.connected")}
        rate={m.connected}
        numLabel={sales}
        denLabel={t("conv.connectedLeads")}
        info={t("conv.connectedInfo", {
          wrong: nameList(m.names.wrongNumber),
          fresh: nameList(m.names.new),
          unreachable: nameList(m.names.unreachable),
        })}
        loading={loading}
      />
      <MetricCard
        icon={CircleDollarSign}
        tone="amber"
        title={t("conv.partialToFull")}
        rate={m.partialToFull}
        numLabel={t("conv.fullPaid")}
        denLabel={t("conv.partialOrFull")}
        info={t("conv.partialToFullInfo", {
          partial: nameList(m.names.partial),
          full: nameList(m.names.full),
        })}
        loading={loading}
      />
    </div>
  );
}
