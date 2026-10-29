import { useMemo, type ReactNode } from "react";
import { AlarmClockOff, AlertTriangle, CalendarClock, GitBranch, User, Users } from "lucide-react";
import { SectionCard, StatCard, InfoTip } from "@/components/layout/Primitives";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  useAmoCrmTaskStats,
  useFunnelStats,
  type PeriodStats,
  type ProfileRow,
  type StatsScope,
} from "@/hooks/use-crm-data";
import { FilterTile, TileOption } from "@/components/filters/FilterTile";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import { FitText } from "@/components/ui/fit-text";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/**
 * The period the dashboard's period blocks look at: the date filter's own
 * range when one is picked, otherwise the last 30 days -- plus the range of
 * the same length right before it, for "compared with the previous period".
 */
export function usePeriodRanges(dateFilter: DateFilterValue) {
  const fromMs = dateFilter.from?.getTime() ?? null;
  const toMs = dateFilter.to?.getTime() ?? null;
  return useMemo(() => {
    const today = startOfDay(new Date());
    const to =
      toMs != null
        ? new Date(startOfDay(new Date(toMs)).getTime() + DAY_MS)
        : new Date(today.getTime() + DAY_MS);
    const from =
      fromMs != null ? startOfDay(new Date(fromMs)) : new Date(to.getTime() - 30 * DAY_MS);
    const span = Math.max(to.getTime() - from.getTime(), DAY_MS);
    return {
      range: { from, to },
      prevRange: { from: new Date(from.getTime() - span), to: from },
      isDefault: fromMs == null && toMs == null,
    };
  }, [fromMs, toMs]);
}

/* ------------------------------------------------------------------ */
/* A single ratio against 100%, matching the "Overall konversiya" /    */
/* "Bog'langanlardan" cards from the reference -- a horizontal meter   */
/* bar, not a 2-slice donut. A pie of two slices is a well-known chart */
/* mistake (see the dataviz skill's "choosing a form" table: "a single */
/* ratio against a limit" -> a meter, never a 2-slice pie) -- reading  */
/* one ratio off a ring takes real angle-estimation, where the same    */
/* number on a bar is instant, and a meter's fill color plus its own   */
/* lighter-tint track communicate state without a separate legend.     */
/* ------------------------------------------------------------------ */

function RatioMeter({
  title,
  pct,
  numeratorLabel,
  numeratorValue,
  denominatorLabel,
  denominatorValue,
  tone = "primary",
  info,
}: {
  title: string;
  pct: number;
  numeratorLabel: string;
  numeratorValue: number;
  denominatorLabel: string;
  denominatorValue: number;
  tone?: "primary" | "success";
  info: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const toneClass =
    tone === "success"
      ? { track: "bg-success/15", fill: "bg-success", text: "text-success" }
      : { track: "bg-primary/15", fill: "bg-primary", text: "text-primary" };
  return (
    <SectionCard title={title} info={info}>
      <p className={cn("font-display text-3xl font-bold tabular-nums", toneClass.text)}>
        <FitText>{pct}%</FitText>
      </p>
      <div className={cn("mt-3 h-2.5 w-full overflow-hidden rounded-full", toneClass.track)}>
        <div
          className={cn("h-full rounded-full transition-[width] duration-700", toneClass.fill)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", toneClass.fill)} />
          {numeratorLabel}
        </span>
        <span className="font-semibold tabular-nums text-foreground">{numeratorValue}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
          {denominatorLabel}
        </span>
        <span className="font-semibold tabular-nums text-foreground">{denominatorValue}</span>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* The Team/Operator/Funnel/Date/Amount filter tiles of the dashboard's */
/* filter card.                                                         */
/* ------------------------------------------------------------------ */

// Which filters a dashboard tab shows besides the funnel (see HomePage).
export type FilterSet = { team?: boolean; operator?: boolean; date?: boolean };

export function DashboardFilterRow({
  show = { team: true, operator: true, date: true },
  funnel,
  onFunnelChange,
  teamId,
  onTeamChange,
  operatorId,
  onOperatorChange,
  dateFilter,
  onDateFilterChange,
  funnelNames,
  rops,
  operators,
  extra,
}: {
  show?: FilterSet;
  funnel: string | null;
  onFunnelChange: (v: string | null) => void;
  teamId: string | null;
  onTeamChange: (v: string | null) => void;
  operatorId: string | null;
  onOperatorChange: (v: string | null) => void;
  dateFilter: DateFilterValue;
  onDateFilterChange: (v: DateFilterValue) => void;
  funnelNames: string[];
  rops: ProfileRow[];
  operators: ProfileRow[];
  /** Shown at the end of the row (the page's "Saqlash"). */
  extra?: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <div className="phone-joined flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2.5 shadow-soft phone:[--phone-cell:140px] phone:[&_svg]:hidden">
      {show.team && (
        <FilterTile
          icon={Users}
          label={t("leadAnalytics.jamoaLabel")}
          active={!!teamId}
          value={rops.find((r) => r.id === teamId)?.full_name ?? t("leadAnalytics.allTeams")}
        >
          <TileOption
            label={t("leadAnalytics.allTeams")}
            active={!teamId}
            onClick={() => {
              onTeamChange(null);
              onOperatorChange(null);
            }}
          />
          {rops.map((r) => (
            <TileOption
              key={r.id}
              label={r.full_name}
              active={teamId === r.id}
              onClick={() => {
                onTeamChange(r.id);
                onOperatorChange(null);
              }}
            />
          ))}
        </FilterTile>
      )}
      {show.operator && (
        <FilterTile
          icon={User}
          label={t("leadAnalytics.operatorLabel")}
          active={!!operatorId}
          value={
            operators.find((m) => m.id === operatorId)?.full_name ?? t("leadAnalytics.allManagers")
          }
        >
          <TileOption
            label={t("leadAnalytics.allManagers")}
            active={!operatorId}
            onClick={() => onOperatorChange(null)}
          />
          {operators.map((m) => (
            <TileOption
              key={m.id}
              label={m.full_name}
              active={operatorId === m.id}
              onClick={() => onOperatorChange(m.id)}
            />
          ))}
        </FilterTile>
      )}
      <FilterTile
        icon={GitBranch}
        label={t("leadAnalytics.funnelLabel")}
        active={!!funnel}
        value={funnel ?? t("leadFilter.allFunnels")}
      >
        <TileOption
          label={t("leadFilter.allFunnels")}
          active={!funnel}
          onClick={() => onFunnelChange(null)}
        />
        {funnelNames.map((f) => (
          <TileOption key={f} label={f} active={funnel === f} onClick={() => onFunnelChange(f)} />
        ))}
      </FilterTile>
      {show.date && <DateRangeFilter value={dateFilter} onChange={onDateFilterChange} />}
      {extra}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The overview's second row (projected sales, lost leads, tasks),       */
/* self-contained so the dashboard renders it from just a `funnel`.      */
/* ------------------------------------------------------------------ */

export function DashboardKpiCards({
  funnel,
  scope,
}: {
  funnel: string | null;
  scope?: StatsScope;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();

  // Same per-funnel computation Reyting uses (raw leads + pipeline_stages,
  // not the dashboard_kpis RPC). Only what the headline strip above doesn't
  // already show: projected sales, lost leads and today's tasks.
  const funnelStats = useFunnelStats(funnel, scope);
  const taskStats = useAmoCrmTaskStats(funnel);

  // "Kutilayotgan konversiya" -- the org's fixed expected conversion rate,
  // used only to project potential revenue below (not a real measured
  // number, so it isn't sourced from any hook).
  const EXPECTED_CONVERSION = 0.15;
  const potentialSalesCount = Math.round(funnelStats.totalLeads * EXPECTED_CONVERSION);
  const potentialRevenue = potentialSalesCount * funnelStats.avgCheck;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatCard
        label={t("dash.card.potentialSales")}
        value={String(potentialSalesCount)}
        hint={format(potentialRevenue)}
        tone="mint"
        info={t("dash.card.potentialSalesInfo")}
      />
      <StatCard
        label={t("dash.card.lostLeads")}
        value={String(funnelStats.lostCount)}
        info={t("dash.card.lostLeadsInfo")}
      />
      <div className="surface-card relative col-span-2 overflow-hidden p-2.5 sm:p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground sm:text-[13px]">
          {t("dash.card.tasks")}
          <InfoTip text={t("dash.card.tasksInfo")} />
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:gap-3">
          <div className="rounded-xl bg-success/10 p-2 sm:p-3">
            <p className="flex items-center gap-1 text-[9.5px] font-semibold text-success sm:text-[11px]">
              <CalendarClock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              {t("dash.card.tasksDueToday")}
            </p>
            <p className="mt-1.5 font-display text-lg font-bold leading-none tabular-nums text-success sm:mt-2 sm:text-[26px]">
              <FitText>{taskStats.data?.dueToday ?? 0}</FitText>
            </p>
          </div>
          <div className="rounded-xl bg-destructive/10 p-2 sm:p-3">
            <p className="flex items-center gap-1 text-[9.5px] font-semibold text-destructive sm:text-[11px]">
              <AlarmClockOff className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              {t("dash.card.tasksOverdue")}
            </p>
            <p className="mt-1.5 font-display text-lg font-bold leading-none tabular-nums text-destructive sm:mt-2 sm:text-[26px]">
              <FitText>{taskStats.data?.overdue ?? 0}</FitText>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* What got worse, and the two conversion ratios of the period.        */
/* ------------------------------------------------------------------ */

export function PeriodAttentionRow({
  stats,
  funnel,
}: {
  stats: PeriodStats;
  funnel: string | null;
}) {
  const { t } = useI18n();
  // Red only when there is something to look at; an empty alert card stays calm.
  const alert = !!stats.biggestStageDrop;
  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <div
        className={cn(
          "surface-card p-4 xl:col-span-1",
          alert && "border border-destructive/30 bg-destructive/5",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <AlertTriangle
              className={cn("h-4 w-4", alert ? "text-destructive" : "text-muted-foreground")}
            />{" "}
            {t("dash.report.needsAttention")}
            <InfoTip text={t("dash.report.needsAttentionInfo")} />
          </p>
          {alert && (
            <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
              1
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-subtle">{t("dash.report.needsAttentionDesc")}</p>
        {stats.biggestStageDrop ? (
          <div className="mt-3 rounded-xl bg-background/60 p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-destructive">
                {t("dash.report.biggestStageDrop")}
                <InfoTip text={t("dash.report.biggestStageDropInfo")} />
              </p>
              <span className="font-display text-lg font-extrabold tabular-nums text-destructive">
                -{stats.biggestStageDrop.dropPct} {t("dash.report.pp")}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {stats.biggestStageDrop.fromStage} → {stats.biggestStageDrop.toStage}
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {t("dash.report.stepPassed", {
                prev: stats.biggestStageDrop.prevPct,
                cur: stats.biggestStageDrop.curPct,
              })}
            </p>
          </div>
        ) : (
          <p className="mt-2 py-2 text-center text-xs text-subtle">
            {funnel ? t("dash.report.noAlerts") : t("dash.report.pickFunnelForAlerts")}
          </p>
        )}
      </div>

      <RatioMeter
        title={t("dash.report.overallConversion")}
        pct={stats.soldLeadsPct}
        numeratorLabel={t("dash.report.purchasedLeads")}
        numeratorValue={stats.soldLeads}
        denominatorLabel={t("dash.report.createdLeads")}
        denominatorValue={stats.newLeads}
        tone="success"
        info={t("dash.report.overallConversionInfo")}
      />
      <RatioMeter
        title={t("dash.report.fromConnected")}
        pct={stats.wonFromConnectedPct}
        numeratorLabel={t("dash.report.sales")}
        numeratorValue={stats.wonFromConnectedCount}
        denominatorLabel={t("dash.report.connectedNoSale")}
        denominatorValue={Math.max(stats.connectedLeadsCount - stats.wonFromConnectedCount, 0)}
        tone="primary"
        info={t("dash.report.fromConnectedInfo")}
      />
    </div>
  );
}
