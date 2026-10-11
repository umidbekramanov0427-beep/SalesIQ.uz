// Dashboard aggregates, lead statistics and period-bounded fetches.
// Split out of src/hooks/use-crm-data.ts, which re-exports everything here.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";
import { RESOURCE_PAGE_SIZE, fetchAllPages, useLeadsRaw } from "./core";
import type { AmoCrmCallRow, LeadRow, StageRow, Tables } from "./core";
import { usePipelineStagesRaw, useProfilesRaw } from "./config";
import {
  byId,
  profileName,
  useFunnelScopedLeads,
  usePipelineBoardLeads,
  useVisibleOwnerIds,
} from "./crm-views";
import { SALES_STAGE_KEYWORDS, normalizeStageName } from "./team";
import { startOfDay } from "./lead-analytics";

/* ------------------------------------------------------------------ */
/* Dashboard aggregates — KPIs, revenue series, pipeline & funnel       */
/* stats and recent activity, all computed from real CRM rows.         */
/* ------------------------------------------------------------------ */

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Used to read `deals`, which this AmoCRM-synced setup never populates
// (leads carry the real revenue) -- so this chart permanently showed a flat
// $0 line for every AmoCRM org. Rebuilt on leads + pipeline_stages, same
// source and "won"/"lost"/"open" resolution as useSalesAnalyticsSummary.
/* ------------------------------------------------------------------ */
/* Lead statistics, grouped in the database (lead_stats_cube RPC).     */
/* One row per (owner, funnel, stage[, day/month][, recoverable]) with */
/* a lead count and revenue sum -- the stats hooks below add these up  */
/* instead of every lead row. Until 20261018020000_lead_stats_rpcs.sql */
/* is applied the same rows are built in the browser from all leads.   */
/* ------------------------------------------------------------------ */

export type LeadCubeRow = {
  owner_id: string | null;
  funnel: string;
  stage_id: string | null;
  /** "YYYY-MM-DD" (day, or first day of the month); null for grain "none". */
  period: string | null;
  recoverable: boolean | null;
  n: number;
  revenue: number;
};

type CubeGrain = "none" | "day" | "month";

const BROWSER_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
})();

/** Local calendar date of an instant, as "YYYY-MM-DD". */
export function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "YYYY-MM-DD" back to local midnight. */
function parsePeriod(period: string): Date {
  const [y, m, d] = period.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Cube rows of leads the current user may see (same scoping as useVisibleOwnerIds). */
export function useVisibleCube(rows: LeadCubeRow[] | undefined): LeadCubeRow[] {
  const visibleOwnerIds = useVisibleOwnerIds();
  return useMemo(
    () =>
      visibleOwnerIds
        ? (rows ?? []).filter((r) => !!r.owner_id && visibleOwnerIds.has(r.owner_id))
        : (rows ?? []),
    [rows, visibleOwnerIds],
  );
}

function cubeFromLeads(
  leads: LeadRow[],
  opts: { funnel: string | null; from: Date | null; to: Date | null; grain: CubeGrain },
): LeadCubeRow[] {
  const groups = new Map<string, LeadCubeRow>();
  for (const l of leads) {
    const funnel = l.funnel || "Direct Sales";
    if (opts.funnel && funnel !== opts.funnel) continue;
    const created = new Date(l.created_at);
    if (opts.from && created < opts.from) continue;
    if (opts.to && created >= opts.to) continue;
    let period: string | null = null;
    if (opts.grain === "day") period = localDateKey(created);
    else if (opts.grain === "month")
      period = localDateKey(new Date(created.getFullYear(), created.getMonth(), 1));
    const key = `${l.owner_id}|${funnel}|${l.stage_id}|${period}|${l.recoverable}`;
    const cur = groups.get(key);
    if (cur) {
      cur.n += 1;
      cur.revenue += l.expected_revenue;
    } else {
      groups.set(key, {
        owner_id: l.owner_id,
        funnel,
        stage_id: l.stage_id,
        period,
        recoverable: l.recoverable,
        n: 1,
        revenue: l.expected_revenue,
      });
    }
  }
  return Array.from(groups.values());
}

export function useLeadCube(opts: {
  funnel?: string | null | undefined;
  from?: Date | null | undefined;
  to?: Date | null | undefined;
  grain?: CubeGrain;
  refetchInterval?: number | false | undefined;
}) {
  const { user } = useAuth();
  const funnel = opts.funnel ?? null;
  const grain = opts.grain ?? "none";
  const fromIso = opts.from ? opts.from.toISOString() : null;
  const toIso = opts.to ? opts.to.toISOString() : null;
  const rpc = useQuery({
    queryKey: ["leads", "cube", user?.organizationId, funnel, fromIso, toIso, grain, BROWSER_TZ],
    enabled: !!user?.organizationId,
    retry: false,
    refetchInterval: opts.refetchInterval ?? false,
    queryFn: () =>
      fetchAllPages(async (from): Promise<LeadCubeRow[]> => {
        const { data, error } = await supabase
          .rpc("lead_stats_cube", {
            p_funnel: funnel,
            p_from: fromIso,
            p_to: toIso,
            p_grain: grain,
            p_tz: BROWSER_TZ,
          })
          .order("owner_id")
          .order("funnel")
          .order("stage_id")
          .order("period")
          .order("recoverable")
          .range(from, from + RESOURCE_PAGE_SIZE - 1);
        if (error) throw error;
        return (data ?? []).map((r) => ({ ...r, n: Number(r.n), revenue: Number(r.revenue) }));
      }),
  });
  const fallback = useLeadsRaw({ enabled: rpc.isError });
  const fallbackRows = useMemo(
    () =>
      rpc.isError && fallback.data
        ? cubeFromLeads(fallback.data, {
            funnel,
            from: fromIso ? new Date(fromIso) : null,
            to: toIso ? new Date(toIso) : null,
            grain,
          })
        : undefined,
    [rpc.isError, fallback.data, funnel, fromIso, toIso, grain],
  );
  return {
    data: rpc.data ?? fallbackRows,
    isLoading: rpc.isLoading || (rpc.isError && fallback.isLoading),
  };
}

export function isSalesStageName(stage: StageRow | undefined): boolean {
  const stageName = stage ? normalizeStageName(stage.name) : "";
  return SALES_STAGE_KEYWORDS.some((kw) => stageName.includes(kw));
}

export function useRevenueSeries() {
  const { data: stages } = usePipelineStagesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const since = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 7, 1);
  }, []);
  const { data: cube } = useLeadCube({ from: since, grain: "month" });

  return useMemo(() => {
    const stagesById = byId(stages);
    const now = new Date();
    const months: { label: string; revenue: number; pipeline: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = localDateKey(d);
      let revenue = 0;
      let pipeline = 0;
      for (const r of cube ?? []) {
        if (r.period !== key) continue;
        if (visibleOwnerIds && !(r.owner_id && visibleOwnerIds.has(r.owner_id))) continue;
        const stage = r.stage_id ? stagesById.get(r.stage_id) : undefined;
        if (stage?.is_won) revenue += r.revenue;
        else if (!stage?.is_lost) pipeline += r.revenue;
      }
      months.push({ label: MONTH_LABELS[d.getMonth()]!, revenue, pipeline });
    }
    return months;
  }, [cube, stages, visibleOwnerIds]);
}

export type SalesAnalyticsSummary = {
  forecast: number;
  ytdRevenue: number;
  ytdDelta: number;
  avgDealSize: number;
  lossRate: number;
  lossRateDelta: number;
  monthlyTrend: { label: string; revenue: number }[];
  perOwner: { name: string; revenue: number }[];
};

// Real-data replacement for the old static "Sales Analytics" mock page --
// same four headline numbers and two charts, computed straight from leads
// + pipeline_stages (this AmoCRM-synced setup never populates the deals
// table, so useRevenueSeries above would just read zeros here).
export function useSalesAnalyticsSummary(
  funnel?: string | null,
  // Only bounds perOwner (RevenueByOwnerChart) -- the other figures here
  // (YTD, 90d avg deal size, loss-rate delta, the 8-month trend) are each
  // already their own fixed window by definition, so an externally picked
  // range has no sound meaning for them.
  dateRange?: { from: Date | null; to: Date | null },
): SalesAnalyticsSummary {
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();
  const windows = useMemo(() => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const eightMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 7, 1);
    const ninetyDaysAgo = startOfDay(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const oneEightyDaysAgo = startOfDay(now);
    oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);
    const monthsFrom = lastYearStart < eightMonthsAgo ? lastYearStart : eightMonthsAgo;
    return { now, yearStart, lastYearStart, ninetyDaysAgo, oneEightyDaysAgo, monthsFrom };
  }, []);
  const fromMs = dateRange?.from?.getTime() ?? null;
  const toMs = dateRange?.to?.getTime() ?? null;
  // Open-stage forecast: every lead, grouped (same query as the KPI cards).
  const all = useVisibleCube(useLeadCube({ funnel: funnel ?? null }).data);
  // YTD / last year / 8-month trend: by month.
  const monthly = useVisibleCube(
    useLeadCube({ funnel: funnel ?? null, from: windows.monthsFrom, grain: "month" }).data,
  );
  // Deal size and loss rate over the last 90 / 180 days: by day.
  const daily = useVisibleCube(
    useLeadCube({ funnel: funnel ?? null, from: windows.oneEightyDaysAgo, grain: "day" }).data,
  );
  // Revenue per owner inside the picked range.
  const inRange = useVisibleCube(
    useLeadCube({
      funnel: funnel ?? null,
      from: fromMs != null ? new Date(fromMs) : null,
      to: toMs != null ? new Date(toMs + 1) : null,
    }).data,
  );

  return useMemo(() => {
    const stagesById = byId(stages);
    const profilesById = byId(profiles);
    const { now, yearStart, lastYearStart, ninetyDaysAgo, oneEightyDaysAgo } = windows;

    let forecast = 0;
    for (const r of all) {
      const stage = r.stage_id ? stagesById.get(r.stage_id) : undefined;
      if (stage && !stage.is_won && !stage.is_lost) {
        forecast += r.revenue * (stage.probability / 100);
      }
    }

    let ytdRevenue = 0;
    let lastYearRevenue = 0;
    const monthlyRevenue = new Map<string, number>();
    for (const r of monthly) {
      const stage = r.stage_id ? stagesById.get(r.stage_id) : undefined;
      if (!stage?.is_won || !r.period) continue;
      const month = parsePeriod(r.period);
      if (month >= yearStart) ytdRevenue += r.revenue;
      else if (month >= lastYearStart) lastYearRevenue += r.revenue;
      monthlyRevenue.set(r.period, (monthlyRevenue.get(r.period) ?? 0) + r.revenue);
    }

    let dealCount90d = 0;
    let dealSum90d = 0;
    let recentLost = 0;
    let recentClosed = 0;
    let prevLost = 0;
    let prevClosed = 0;
    for (const r of daily) {
      if (!r.period) continue;
      const stage = r.stage_id ? stagesById.get(r.stage_id) : undefined;
      if (!stage?.is_won && !stage?.is_lost) continue;
      const day = parsePeriod(r.period);
      if (day >= ninetyDaysAgo) {
        recentClosed += r.n;
        if (stage.is_lost) recentLost += r.n;
        if (stage.is_won) {
          dealCount90d += r.n;
          dealSum90d += r.revenue;
        }
      } else if (day >= oneEightyDaysAgo) {
        prevClosed += r.n;
        if (stage.is_lost) prevLost += r.n;
      }
    }

    const revenueByOwner = new Map<string, number>();
    for (const r of inRange) {
      const stage = r.stage_id ? stagesById.get(r.stage_id) : undefined;
      if (!stage?.is_won) continue;
      const ownerName = profileName(r.owner_id ? profilesById.get(r.owner_id) : undefined);
      revenueByOwner.set(ownerName, (revenueByOwner.get(ownerName) ?? 0) + r.revenue);
    }

    const avgDealSize = dealCount90d ? dealSum90d / dealCount90d : 0;
    const ytdDelta =
      lastYearRevenue > 0 ? ((ytdRevenue - lastYearRevenue) / lastYearRevenue) * 100 : 0;
    const lossRate = recentClosed ? (recentLost / recentClosed) * 100 : 0;
    const prevLossRate = prevClosed ? (prevLost / prevClosed) * 100 : 0;

    const monthlyTrend: { label: string; revenue: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyTrend.push({
        label: MONTH_LABELS[d.getMonth()]!,
        revenue: monthlyRevenue.get(localDateKey(d)) ?? 0,
      });
    }

    // Full owner names: this org's reps are named like "Rus tili 117 |
    // Fotima Axmedova", so a first-word label collapsed them all to "Rus".
    // RevenueByOwnerChart's XAxis truncates long labels itself.
    const perOwner = Array.from(revenueByOwner.entries())
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    return {
      forecast,
      ytdRevenue,
      ytdDelta,
      avgDealSize,
      lossRate,
      lossRateDelta: lossRate - prevLossRate,
      monthlyTrend,
      perOwner,
    };
  }, [all, monthly, daily, inRange, stages, profiles, windows]);
}

export type LostReasonBucket = { reason: string; count: number };

// AmoCRM's own "Причина отказа" (loss reason) catalog, synced onto
// leads.loss_reason -- real data that until now was only surfaced deep
// inside Lead Analytics' Yo'nalish tab, not on the Dashboard itself.
export function useLostReasonsSummary(
  funnel?: string | null,
  dateRange?: { from: Date | null; to: Date | null },
): LostReasonBucket[] {
  const { user } = useAuth();
  const visibleOwnerIds = useVisibleOwnerIds();
  const fromIso = dateRange?.from ? dateRange.from.toISOString() : null;
  const toIso = dateRange?.to ? dateRange.to.toISOString() : null;
  const rpc = useQuery({
    queryKey: ["leads", "loss_reasons", user?.organizationId, funnel ?? null, fromIso, toIso],
    enabled: !!user?.organizationId,
    retry: false,
    queryFn: () =>
      fetchAllPages(async (offset) => {
        const { data, error } = await supabase
          .rpc("lead_loss_reasons", { p_funnel: funnel ?? null, p_from: fromIso, p_to: toIso })
          .order("owner_id")
          .order("reason")
          .range(offset, offset + RESOURCE_PAGE_SIZE - 1);
        if (error) throw error;
        return data ?? [];
      }),
  });
  // Until 20261018020000_lead_stats_rpcs.sql is applied: count in the browser.
  const { data: leads } = useFunnelScopedLeads(funnel ?? null, rpc.isError);
  const { data: stages } = usePipelineStagesRaw();

  return useMemo(() => {
    const counts = new Map<string, number>();
    if (rpc.data) {
      for (const r of rpc.data) {
        if (visibleOwnerIds && !(r.owner_id && visibleOwnerIds.has(r.owner_id))) continue;
        counts.set(r.reason, (counts.get(r.reason) ?? 0) + Number(r.n));
      }
    } else {
      const stagesById = byId(stages);
      for (const l of leads ?? []) {
        const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
        if (!stage?.is_lost) continue;
        const createdAt = new Date(l.created_at);
        if (fromIso && createdAt < new Date(fromIso)) continue;
        if (toIso && createdAt > new Date(toIso)) continue;
        const reason = l.loss_reason?.trim() || "—";
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([reason, count]): LostReasonBucket => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [rpc.data, leads, stages, visibleOwnerIds, fromIso, toIso]);
}

// ISO 8601 week number (Monday-start, week 1 = the week containing the
// year's first Thursday) -- the standard definition, matching what "W31",
// "W32" etc. conventionally mean.
function isoWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `W${weekNo}`;
}

export type DealFlowWeek = {
  week: string;
  created: number;
  won: number;
  lost: number;
  revenue: number;
};

/* ------------------------------------------------------------------ */
/* Dashboard — "Sotuv dinamikasi": weekly deal flow (created vs. their   */
/* current won/lost outcome) plus revenue. Since there's no per-lead     */
/* stage-visit history in this schema (same limitation as the daily      */
/* report's biggestStageDrop), "won this week"/"lost this week" really   */
/* means "created this week, and currently sitting in a won/lost stage"  */
/* -- a cohort-outcome view, not a true week-by-week transition ledger.  */
/* ------------------------------------------------------------------ */
export function useDealFlowWeekly(funnel: string | null, weeks = 8): DealFlowWeek[] {
  const { data: stages } = usePipelineStagesRaw();
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - weeks * 7);
    return d;
  }, [weeks]);
  const cube = useVisibleCube(useLeadCube({ funnel, from: cutoff, grain: "day" }).data);

  return useMemo(() => {
    const stagesById = byId(stages);
    const byWeek = new Map<
      string,
      { created: number; won: number; lost: number; revenue: number; weekStart: Date }
    >();

    for (const r of cube) {
      if (!r.period) continue;
      const day = parsePeriod(r.period);
      const stage = r.stage_id ? stagesById.get(r.stage_id) : undefined;
      const label = isoWeekLabel(day);
      const bucket = byWeek.get(label) ?? {
        created: 0,
        won: 0,
        lost: 0,
        revenue: 0,
        weekStart: day,
      };
      bucket.created += r.n;
      if (stage?.is_won) {
        bucket.won += r.n;
        bucket.revenue += r.revenue;
      } else if (stage?.is_lost) {
        bucket.lost += r.n;
      }
      if (day < bucket.weekStart) bucket.weekStart = day;
      byWeek.set(label, bucket);
    }

    return Array.from(byWeek.entries())
      .sort((a, b) => a[1].weekStart.getTime() - b[1].weekStart.getTime())
      .map(([week, b]) => ({
        week,
        created: b.created,
        won: b.won,
        lost: b.lost,
        revenue: b.revenue,
      }));
  }, [cube, stages]);
}

export type ConversionQualityWeek = {
  week: string;
  conversionPct: number | null;
  inRangePct: number | null;
};

/* ------------------------------------------------------------------ */
/* Dashboard — "Konversiya va qo'ng'iroq sifati": does a higher share of */
/* good-scoring calls in a week line up with a higher conversion rate    */
/* for leads created that week? Correlation is Pearson's r over the      */
/* weeks where both series have a value.                                 */
/* ------------------------------------------------------------------ */
export function useConversionQualityWeekly(
  funnel: string | null,
  scoreMin: number,
  scoreMax: number,
  weeks = 12,
): { rows: ConversionQualityWeek[]; correlation: number | null } {
  const { data: stages } = usePipelineStagesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - weeks * 7);
    return d;
  }, [weeks]);
  // Leads created and calls made in the window only, grouped / with their lead.
  const cube = useVisibleCube(useLeadCube({ funnel, from: cutoff, grain: "day" }).data);
  const { data: calls } = useCallsWithLead(cutoff, null);

  return useMemo(() => {
    const stagesById = byId(stages);

    type Bucket = {
      created: number;
      won: number;
      totalCalls: number;
      inRangeCalls: number;
      weekStart: Date;
    };
    const byWeek = new Map<string, Bucket>();
    const bucketFor = (label: string, start: Date): Bucket => {
      let b = byWeek.get(label);
      if (!b) {
        b = { created: 0, won: 0, totalCalls: 0, inRangeCalls: 0, weekStart: start };
        byWeek.set(label, b);
      }
      return b;
    };

    for (const r of cube) {
      if (!r.period) continue;
      const day = parsePeriod(r.period);
      const stage = r.stage_id ? stagesById.get(r.stage_id) : undefined;
      const b = bucketFor(isoWeekLabel(day), day);
      b.created += r.n;
      if (stage?.is_won) b.won += r.n;
    }

    for (const c of calls ?? []) {
      if (c.score == null) continue;
      const visible =
        !visibleOwnerIds || (!!c.lead?.owner_id && visibleOwnerIds.has(c.lead.owner_id));
      const lead = visible ? (c.lead ?? undefined) : undefined;
      const leadFunnel = lead ? lead.funnel || "Direct Sales" : null;
      if (funnel && leadFunnel !== funnel) continue;
      const occurredAt = new Date(c.occurred_at);
      if (occurredAt < cutoff) continue;
      const b = bucketFor(isoWeekLabel(occurredAt), occurredAt);
      b.totalCalls += 1;
      if (c.score >= scoreMin && c.score <= scoreMax) b.inRangeCalls += 1;
    }

    const rows = Array.from(byWeek.entries())
      .sort((a, b) => a[1].weekStart.getTime() - b[1].weekStart.getTime())
      .map(([week, b]) => ({
        week,
        conversionPct: b.created > 0 ? Math.round((b.won / b.created) * 1000) / 10 : null,
        inRangePct:
          b.totalCalls > 0 ? Math.round((b.inRangeCalls / b.totalCalls) * 1000) / 10 : null,
      }));

    const pairs = rows.filter(
      (r): r is { week: string; conversionPct: number; inRangePct: number } =>
        r.conversionPct != null && r.inRangePct != null,
    );
    let correlation: number | null = null;
    if (pairs.length >= 2) {
      const xs = pairs.map((p) => p.conversionPct);
      const ys = pairs.map((p) => p.inRangePct);
      const n = xs.length;
      const meanX = xs.reduce((s, v) => s + v, 0) / n;
      const meanY = ys.reduce((s, v) => s + v, 0) / n;
      let num = 0;
      let denX = 0;
      let denY = 0;
      for (let i = 0; i < n; i++) {
        const dx = xs[i]! - meanX;
        const dy = ys[i]! - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
      }
      const den = Math.sqrt(denX * denY);
      correlation = den > 0 ? Math.round((num / den) * 100) / 100 : null;
    }

    return { rows, correlation };
  }, [cube, stages, calls, funnel, scoreMin, scoreMax, cutoff, visibleOwnerIds]);
}

/* ------------------------------------------------------------------ */
/* Kunlik/Haftalik/Oylik hisobot (Boshqaruv paneli's report section) — */
/* a single period-scoped aggregate over leads/calls/stages, all       */
/* already cached elsewhere in the app. Mirrors the "biggest picture"  */
/* daily-report tools like metrixme produce, computed from our own     */
/* real CRM data rather than a separate reporting backend.             */
/* ------------------------------------------------------------------ */

export type DailyReportScope = {
  funnel: string | null;
  teamId: string | null; // a ROP's profile id -- scopes to their whole team
  operatorId: string | null; // a single manager's profile id
};

export type DailyReportStageDrop = { fromStage: string; toStage: string; dropPct: number };

export type DailyReportStats = {
  totalCalls: number;
  connectedCalls: number;
  missedCalls: number;
  contactRatePct: number;
  totalCallSeconds: number;
  avgCallSeconds: number;
  avgCallScore: number | null;
  newLeads: number;
  soldLeads: number;
  soldLeadsPct: number;
  openLeads: number;
  wonLeadsCreated: number;
  wonLeadsCreatedPct: number;
  connectedLeadsCount: number;
  wonFromConnectedCount: number;
  wonFromConnectedPct: number;
  // Only computable when a single funnel is selected -- stage positions
  // aren't comparable across different AmoCRM pipelines. This reads each
  // lead's *current* stage as how far it "reached" in the funnel (there's
  // no per-lead stage-visit history to replay), so it's a snapshot
  // approximation of a true cohort waterfall, not an exact one.
  biggestStageDrop: DailyReportStageDrop | null;
  periodRevenue: number;
  prevPeriodRevenue: number;
  revenueDeltaPct: number | null;
  fullPaymentCount: number;
  prevFullPaymentCount: number;
  fullPaymentDeltaPct: number | null;
  revenueTrend: { label: string; revenue: number }[];
  operatorBreakdown: {
    id: string;
    name: string;
    calls: number;
    avgScore: number | null;
    totalSeconds: number;
  }[];
  callFlowByDay: { label: string; connected: number; missed: number }[];
  // Only computable when a single funnel is selected, same reasoning as
  // biggestStageDrop -- stage names/positions aren't comparable across
  // different AmoCRM pipelines.
  stageBreakdown: { stage: string; count: number; pct: number }[];
};

const EMPTY_DAILY_REPORT_STATS: DailyReportStats = {
  totalCalls: 0,
  connectedCalls: 0,
  missedCalls: 0,
  contactRatePct: 0,
  totalCallSeconds: 0,
  avgCallSeconds: 0,
  avgCallScore: null,
  newLeads: 0,
  soldLeads: 0,
  soldLeadsPct: 0,
  openLeads: 0,
  wonLeadsCreated: 0,
  wonLeadsCreatedPct: 0,
  connectedLeadsCount: 0,
  wonFromConnectedCount: 0,
  wonFromConnectedPct: 0,
  biggestStageDrop: null,
  periodRevenue: 0,
  prevPeriodRevenue: 0,
  revenueDeltaPct: null,
  fullPaymentCount: 0,
  prevFullPaymentCount: 0,
  fullPaymentDeltaPct: null,
  revenueTrend: [],
  operatorBreakdown: [],
  callFlowByDay: [],
  stageBreakdown: [],
};

// A narrower match than SALES_STAGE_KEYWORDS -- "full payment" specifically
// (won or fully-paid), not prepayment/half-payment stages too.
export const FULL_PAYMENT_STAGE_KEYWORDS = ["toliq", "won", "успешно", "rop closed"];

/* ------------------------------------------------------------------ */
/* Period-bounded fetches for the dashboard: only the rows inside the   */
/* selected period, with just the columns the stats need, instead of    */
/* every lead and call of the org.                                      */
/* ------------------------------------------------------------------ */

type LeadRef = Pick<LeadRow, "id" | "owner_id" | "funnel" | "stage_id">;

type LeadInPeriod = LeadRef & Pick<LeadRow, "created_at" | "expected_revenue">;

export type CallWithLead = Pick<
  AmoCrmCallRow,
  "id" | "lead_id" | "occurred_at" | "connected" | "duration_seconds" | "score"
> & { lead: LeadRef | null };

/**
 * Rows of `table` whose `column` falls in [from, to] (or [from, to) with
 * exclusiveTo), only the listed columns. Either bound may be null.
 */
export function useRowsBetween<Row>(opts: {
  table: keyof Tables;
  column: string;
  columns: string;
  from: Date | null;
  to: Date | null;
  exclusiveTo?: boolean;
  enabled?: boolean;
}) {
  const { user } = useAuth();
  const fromIso = opts.from ? opts.from.toISOString() : null;
  const toIso = opts.to ? opts.to.toISOString() : null;
  const exclusiveTo = opts.exclusiveTo ?? false;
  return useQuery({
    queryKey: [
      opts.table,
      "between",
      user?.organizationId,
      opts.column,
      opts.columns,
      fromIso,
      toIso,
      exclusiveTo,
    ],
    enabled: !!user?.organizationId && (opts.enabled ?? true),
    queryFn: () =>
      fetchAllPages(async (offset): Promise<Row[]> => {
        type Pager = {
          gte: (c: string, v: string) => Pager;
          lt: (c: string, v: string) => Pager;
          lte: (c: string, v: string) => Pager;
          order: (c: string, o: { ascending: boolean }) => Pager;
          range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
        };
        let q = supabase.from(opts.table).select(opts.columns) as unknown as Pager;
        if (fromIso) q = q.gte(opts.column, fromIso);
        if (toIso) q = exclusiveTo ? q.lt(opts.column, toIso) : q.lte(opts.column, toIso);
        const { data, error } = await q
          .order(opts.column, { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + RESOURCE_PAGE_SIZE - 1);
        if (error) throw error;
        return (data ?? []) as Row[];
      }),
  });
}

/** Leads created in [from, to). */
function useLeadsCreatedBetween(from: Date | null, to: Date | null) {
  const { user } = useAuth();
  const fromIso = from ? from.toISOString() : null;
  const toIso = to ? to.toISOString() : null;
  return useQuery({
    queryKey: ["leads", "created_between", user?.organizationId, fromIso, toIso],
    enabled: !!user?.organizationId && !!fromIso,
    queryFn: () =>
      fetchAllPages(async (offset): Promise<LeadInPeriod[]> => {
        let q = supabase
          .from("leads")
          .select("id, owner_id, funnel, stage_id, created_at, expected_revenue")
          .gte("created_at", fromIso!);
        if (toIso) q = q.lt("created_at", toIso);
        const { data, error } = await q
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + RESOURCE_PAGE_SIZE - 1);
        if (error) throw error;
        return data ?? [];
      }),
  });
}

/** Calls that happened in [from, to), each with its lead's owner / funnel / stage. */
export function useCallsWithLead(from: Date | null, to: Date | null) {
  const { user } = useAuth();
  const fromIso = from ? from.toISOString() : null;
  const toIso = to ? to.toISOString() : null;
  return useQuery({
    queryKey: ["amocrm_calls", "with_lead", user?.organizationId, fromIso, toIso],
    enabled: !!user?.organizationId,
    queryFn: () =>
      fetchAllPages(async (offset): Promise<CallWithLead[]> => {
        let q = supabase
          .from("amocrm_calls")
          .select(
            "id, lead_id, occurred_at, connected, duration_seconds, score, lead:leads(id, owner_id, funnel, stage_id)",
          );
        if (fromIso) q = q.gte("occurred_at", fromIso);
        if (toIso) q = q.lt("occurred_at", toIso);
        const { data, error } = await q
          .order("occurred_at", { ascending: false })
          .order("id", { ascending: true })
          .range(offset, offset + RESOURCE_PAGE_SIZE - 1);
        if (error) throw error;
        return (data ?? []) as unknown as CallWithLead[];
      }),
  });
}

export function useDailyReportStats(
  range: { from: Date; to: Date } | null,
  prevRange: { from: Date; to: Date } | null,
  scope: DailyReportScope,
): DailyReportStats {
  const spanFrom =
    range && prevRange ? new Date(Math.min(range.from.getTime(), prevRange.from.getTime())) : null;
  const spanTo =
    range && prevRange ? new Date(Math.max(range.to.getTime(), prevRange.to.getTime())) : null;
  const { data: leads } = useLeadsCreatedBetween(spanFrom, spanTo);
  const { data: calls } = useCallsWithLead(range?.from ?? null, range?.to ?? null);
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();

  return useMemo(() => {
    if (!range || !prevRange) return EMPTY_DAILY_REPORT_STATS;

    const stagesById = byId(stages);
    // Leads of the period plus every lead a call in the period belongs to.
    const leadsById = new Map<string, LeadRef>();
    for (const c of calls ?? []) if (c.lead) leadsById.set(c.lead.id, c.lead);
    for (const l of leads ?? []) leadsById.set(l.id, l);
    const leadFunnelOf = (l: Pick<LeadRow, "funnel">) => l.funnel || "Direct Sales";

    let visibleOwnerIds: Set<string> | null = null;
    if (scope.operatorId) {
      visibleOwnerIds = new Set([scope.operatorId]);
    } else if (scope.teamId) {
      const ids = new Set<string>([scope.teamId]);
      for (const p of profiles ?? []) if (p.manager_id === scope.teamId) ids.add(p.id);
      visibleOwnerIds = ids;
    }
    const inScope = (ownerId: string | null): boolean => {
      if (!ownerId) return false;
      return !visibleOwnerIds || visibleOwnerIds.has(ownerId);
    };

    function leadsCreatedIn(r: { from: Date; to: Date }): LeadInPeriod[] {
      return (leads ?? []).filter((l) => {
        if (scope.funnel && leadFunnelOf(l) !== scope.funnel) return false;
        if (!inScope(l.owner_id)) return false;
        const created = new Date(l.created_at);
        return created >= r.from && created < r.to;
      });
    }

    const leadsInRange = leadsCreatedIn(range);

    let soldLeads = 0;
    let wonLeadsCreated = 0;
    let openLeads = 0;
    let periodRevenue = 0;
    let fullPaymentCount = 0;
    const revenueByDay = new Map<string, number>();
    for (const l of leadsInRange) {
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      const stageName = stage ? normalizeStageName(stage.name) : "";
      const isSalesStage = SALES_STAGE_KEYWORDS.some((kw) => stageName.includes(kw));
      if (isSalesStage) {
        soldLeads += 1;
        periodRevenue += l.expected_revenue;
        const dayKey = new Date(l.created_at).toDateString();
        revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + l.expected_revenue);
      }
      if (FULL_PAYMENT_STAGE_KEYWORDS.some((kw) => stageName.includes(kw))) fullPaymentCount += 1;
      if (stage?.is_won) wonLeadsCreated += 1;
      if (!stage?.is_won && !stage?.is_lost) openLeads += 1;
    }

    const revenueTrend: DailyReportStats["revenueTrend"] = [];
    for (let d = new Date(range.from); d < range.to; d.setDate(d.getDate() + 1)) {
      revenueTrend.push({
        label: `${d.getDate()}`,
        revenue: revenueByDay.get(d.toDateString()) ?? 0,
      });
    }

    const prevLeadsInRange = leadsCreatedIn(prevRange);
    let prevPeriodRevenue = 0;
    let prevFullPaymentCount = 0;
    for (const l of prevLeadsInRange) {
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      const stageName = stage ? normalizeStageName(stage.name) : "";
      if (SALES_STAGE_KEYWORDS.some((kw) => stageName.includes(kw))) {
        prevPeriodRevenue += l.expected_revenue;
      }
      if (FULL_PAYMENT_STAGE_KEYWORDS.some((kw) => stageName.includes(kw))) {
        prevFullPaymentCount += 1;
      }
    }

    const callsInRange = (calls ?? []).filter((c) => {
      const occurred = new Date(c.occurred_at);
      if (occurred < range.from || occurred >= range.to) return false;
      const lead = c.lead_id ? leadsById.get(c.lead_id) : undefined;
      if (scope.funnel && (lead ? leadFunnelOf(lead) : null) !== scope.funnel) return false;
      return inScope(lead?.owner_id ?? null);
    });

    const totalCalls = callsInRange.length;
    const connectedCalls = callsInRange.filter((c) => c.connected).length;
    const totalCallSeconds = callsInRange.reduce((s, c) => s + c.duration_seconds, 0);
    const scoredCalls = callsInRange.filter((c) => c.score != null);
    const avgCallScore = scoredCalls.length
      ? Math.round(scoredCalls.reduce((s, c) => s + (c.score ?? 0), 0) / scoredCalls.length)
      : null;

    const connectedLeadIds = new Set(
      callsInRange.filter((c) => c.connected && c.lead_id).map((c) => c.lead_id!),
    );
    let wonFromConnectedCount = 0;
    for (const id of connectedLeadIds) {
      const lead = leadsById.get(id);
      const stage = lead?.stage_id ? stagesById.get(lead.stage_id) : undefined;
      if (stage?.is_won) wonFromConnectedCount += 1;
    }

    let biggestStageDrop: DailyReportStageDrop | null = null;
    if (scope.funnel) {
      const orderedStages = (stages ?? [])
        .filter((s) => s.pipeline_name === scope.funnel && !s.is_lost)
        .sort((a, b) => a.position - b.position);
      if (orderedStages.length >= 2) {
        const reach = orderedStages.map(
          (s) =>
            leadsInRange.filter((l) => {
              const st = l.stage_id ? stagesById.get(l.stage_id) : undefined;
              return st && !st.is_lost && st.position >= s.position;
            }).length,
        );
        let worstIdx = -1;
        let worstDrop = -Infinity;
        for (let i = 0; i < reach.length - 1; i++) {
          if (reach[i] === 0) continue;
          const drop = 100 - (reach[i + 1]! / reach[i]!) * 100;
          if (drop > worstDrop) {
            worstDrop = drop;
            worstIdx = i;
          }
        }
        if (worstIdx >= 0) {
          biggestStageDrop = {
            fromStage: orderedStages[worstIdx]!.name,
            toStage: orderedStages[worstIdx + 1]!.name,
            dropPct: Math.round(worstDrop),
          };
        }
      }
    }

    const profilesById = byId(profiles);
    type OperatorAgg = { calls: number; scoreSum: number; scoreCount: number; seconds: number };
    const operatorAgg = new Map<string, OperatorAgg>();
    for (const c of callsInRange) {
      const lead = c.lead_id ? leadsById.get(c.lead_id) : undefined;
      if (!lead?.owner_id) continue;
      const cur = operatorAgg.get(lead.owner_id) ?? {
        calls: 0,
        scoreSum: 0,
        scoreCount: 0,
        seconds: 0,
      };
      cur.calls += 1;
      cur.seconds += c.duration_seconds;
      if (c.score != null) {
        cur.scoreSum += c.score;
        cur.scoreCount += 1;
      }
      operatorAgg.set(lead.owner_id, cur);
    }
    const operatorBreakdown = Array.from(operatorAgg.entries())
      .map(([id, a]) => ({
        id,
        name: profileName(profilesById.get(id)),
        calls: a.calls,
        avgScore: a.scoreCount ? Math.round(a.scoreSum / a.scoreCount) : null,
        totalSeconds: a.seconds,
      }))
      .sort((a, b) => b.calls - a.calls);

    const callFlowByDay: DailyReportStats["callFlowByDay"] = [];
    const connectedByDay = new Map<string, number>();
    const missedByDay = new Map<string, number>();
    for (const c of callsInRange) {
      const dayKey = new Date(c.occurred_at).toDateString();
      if (c.connected) connectedByDay.set(dayKey, (connectedByDay.get(dayKey) ?? 0) + 1);
      else missedByDay.set(dayKey, (missedByDay.get(dayKey) ?? 0) + 1);
    }
    for (let d = new Date(range.from); d < range.to; d.setDate(d.getDate() + 1)) {
      const dayKey = d.toDateString();
      callFlowByDay.push({
        label: `${d.getDate()}`,
        connected: connectedByDay.get(dayKey) ?? 0,
        missed: missedByDay.get(dayKey) ?? 0,
      });
    }

    let stageBreakdown: DailyReportStats["stageBreakdown"] = [];
    if (scope.funnel) {
      const funnelStages = (stages ?? [])
        .filter((s) => s.pipeline_name === scope.funnel)
        .sort((a, b) => a.position - b.position);
      const base = leadsInRange.length || 1;
      stageBreakdown = funnelStages
        .map((s) => {
          const count = leadsInRange.filter((l) => l.stage_id === s.id).length;
          return { stage: s.name, count, pct: Math.round((count / base) * 1000) / 10 };
        })
        .filter((s) => s.count > 0);
    }

    return {
      totalCalls,
      connectedCalls,
      missedCalls: totalCalls - connectedCalls,
      contactRatePct: totalCalls ? Math.round((connectedCalls / totalCalls) * 1000) / 10 : 0,
      totalCallSeconds,
      avgCallSeconds: totalCalls ? Math.round(totalCallSeconds / totalCalls) : 0,
      avgCallScore,
      newLeads: leadsInRange.length,
      soldLeads,
      soldLeadsPct: leadsInRange.length
        ? Math.round((soldLeads / leadsInRange.length) * 1000) / 10
        : 0,
      openLeads,
      wonLeadsCreated,
      wonLeadsCreatedPct: leadsInRange.length
        ? Math.round((wonLeadsCreated / leadsInRange.length) * 1000) / 10
        : 0,
      connectedLeadsCount: connectedLeadIds.size,
      wonFromConnectedCount,
      wonFromConnectedPct: connectedLeadIds.size
        ? Math.round((wonFromConnectedCount / connectedLeadIds.size) * 1000) / 10
        : 0,
      biggestStageDrop,
      periodRevenue,
      prevPeriodRevenue,
      revenueDeltaPct:
        prevPeriodRevenue > 0
          ? Math.round(((periodRevenue - prevPeriodRevenue) / prevPeriodRevenue) * 1000) / 10
          : null,
      fullPaymentCount,
      prevFullPaymentCount,
      fullPaymentDeltaPct:
        prevFullPaymentCount > 0
          ? Math.round(((fullPaymentCount - prevFullPaymentCount) / prevFullPaymentCount) * 1000) /
            10
          : null,
      revenueTrend,
      operatorBreakdown,
      callFlowByDay,
      stageBreakdown,
    };
  }, [
    leads,
    calls,
    stages,
    profiles,
    range,
    prevRange,
    scope.funnel,
    scope.teamId,
    scope.operatorId,
  ]);
}

// Both dashboard funnel widgets used to aggregate the deals table (which
// this AmoCRM-synced setup never actually populates -- real revenue lives
// on leads) and/or every pipeline_stages row across the whole org (~60
// AmoCRM pipelines here, all sharing generic stage names like
// "Неразобранное") with no funnel filter, producing a chart with dozens of
// duplicate-labeled all-zero bars. Both now require an explicit funnel
// selection and read real, funnel-scoped lead data -- the funnel-scoped
// fetch is shared (same react-query key) between the two widgets, so
// selecting a funnel costs one request, not two.
export function usePipelineStageStats(funnel: string | null) {
  const board = usePipelineBoardLeads(funnel);
  return useMemo(() => {
    if (!funnel) return [];
    const funnelStages = board.stages
      .filter((s) => s.pipeline_name === funnel)
      .sort((a, b) => a.position - b.position);
    return funnelStages.map((s) => {
      const inStage = board.rows.filter((l) => l.stageId === s.id);
      return {
        stage: s.name,
        value: inStage.reduce((sum, l) => sum + l.expectedRevenue, 0),
        deals: inStage.length,
      };
    });
  }, [funnel, board.stages, board.rows]);
}

export function useFunnelFlow(funnel: string | null) {
  const board = usePipelineBoardLeads(funnel);
  return useMemo(() => {
    if (!funnel) return [];
    const funnelStages = board.stages
      .filter((s) => s.pipeline_name === funnel)
      .sort((a, b) => a.position - b.position);
    const base = board.rows.length || 1;
    return funnelStages.map((s) => {
      const count = board.rows.filter((l) => l.stageId === s.id).length;
      return { stage: s.name, count, conversion: Math.round((count / base) * 1000) / 10 };
    });
  }, [funnel, board.stages, board.rows]);
}

export type ActivityItem = {
  id: string;
  who: string;
  what: string;
  when: string;
  leadName: string | null;
};

export function useRecentActivity(limit = 6, funnel?: string | null) {
  const { user } = useAuth();
  const { data: profiles } = useProfilesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const ownerKey = visibleOwnerIds ? Array.from(visibleOwnerIds).sort().join(",") : null;

  // The funnel / owner scope is applied in the database through the lead
  // join, before the limit -- so "6 most recent" means 6 matching ones, and
  // no lead list has to be downloaded to build the filter.
  const activityQuery = useQuery({
    queryKey: ["recent-activity", limit, funnel ?? null, ownerKey],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from("lead_activities")
        .select("*, lead:leads!inner(name, company_name, funnel, owner_id)");
      query = scopeByLead(query, funnel ?? null, visibleOwnerIds);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo<ActivityItem[]>(() => {
    const profilesById = byId(profiles);
    return (activityQuery.data ?? []).map((a) => {
      const author = a.created_by ? profilesById.get(a.created_by) : undefined;
      return {
        id: a.id,
        who: author ? profileName(author) : "Someone",
        what: `${a.type}: ${a.content}`,
        when: timeAgo(a.created_at),
        leadName: a.lead?.company_name || a.lead?.name || null,
      };
    });
  }, [activityQuery.data, profiles]);

  return { rows, isLoading: activityQuery.isLoading };
}

/**
 * Narrows a query embedding `lead:leads!inner(...)` to one funnel and/or
 * the leads of the given owners. "Direct Sales" also matches leads with
 * no funnel, as everywhere else.
 */
export function scopeByLead<Q>(query: Q, funnel: string | null, ownerIds: Set<string> | null): Q {
  type Scopable = {
    eq: (column: string, value: string) => Scopable;
    or: (filters: string, opts: { referencedTable: string }) => Scopable;
    in: (column: string, values: string[]) => Scopable;
  };
  let q = query as unknown as Scopable;
  if (funnel === "Direct Sales") {
    q = q.or('funnel.is.null,funnel.in.("","Direct Sales")', { referencedTable: "lead" });
  } else if (funnel) {
    q = q.eq("lead.funnel", funnel);
  }
  if (ownerIds) q = q.in("lead.owner_id", Array.from(ownerIds));
  return q as unknown as Q;
}

// Used to read the (essentially unused, since this is an AmoCRM-synced
// setup where real revenue lives on leads) deals table -- always 0. Reuses
// the same leaderboard_stats RPC the Reyting page itself uses, so this
// widget's numbers actually match the full leaderboard.
export function useTopPerformers(
  limit = 5,
  funnel: string | null = null,
  dateRange?: { from: Date | null; to: Date | null },
) {
  const { user } = useAuth();
  const { data: profiles } = useProfilesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const from = dateRange?.from ? dateRange.from.toISOString() : null;
  const to = dateRange?.to ? dateRange.to.toISOString() : null;
  const statsQuery = useQuery({
    queryKey: ["leaderboard_stats", from, to, funnel, null, ""],
    enabled: !!user?.organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leaderboard_stats", {
        p_from: from,
        p_to: to,
        p_funnel: funnel,
        p_stage_id: null,
        p_tags: null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  return useMemo(() => {
    const statsByOwner = new Map((statsQuery.data ?? []).map((r) => [r.owner_id, r]));
    // Unscoped, this named every colleague + their revenue to a rep on the
    // Dashboard's "AI Insights" widget -- the same full-team reveal Reyting
    // is deliberately for, but this one isn't Reyting.
    const people = visibleOwnerIds
      ? (profiles ?? []).filter((p) => visibleOwnerIds.has(p.id))
      : (profiles ?? []);
    return people
      .map((p) => {
        const stats = statsByOwner.get(p.id);
        return {
          id: p.id,
          name: p.full_name || p.email,
          department: p.department,
          deals: stats?.won_leads ?? 0,
          revenue: stats?.revenue ?? 0,
          // null (not a fake "1") when no real target is set — dividing
          // revenue by a placeholder target of 1 produced nonsensical
          // percentages in the millions (e.g. "7,399,960%") for anyone
          // without a monthly_target configured.
          target: p.monthly_target || null,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }, [statsQuery.data, profiles, visibleOwnerIds, limit]);
}
