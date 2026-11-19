import { useMemo, type ReactNode } from "react";
import { GitBranch, User, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { type ProfileRow } from "@/hooks/use-crm-data";
import { FilterTile, TileOption } from "@/components/filters/FilterTile";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";

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

/* ------------------------------------------------------------------ */
/* What got worse, and the two conversion ratios of the period.        */
/* ------------------------------------------------------------------ */
