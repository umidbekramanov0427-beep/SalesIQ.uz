// Dashboard aggregates, lead statistics and period-bounded fetches.
// Split out of src/hooks/use-crm-data.ts, which re-exports everything here.
import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";
import { RESOURCE_PAGE_SIZE, fetchAllPages, useLeadsRaw } from "./core";
import type { AmoCrmCallRow, LeadRow, StageRow, Tables } from "./core";
import { usePipelineStagesRaw, useProfilesRaw } from "./config";
import {
  byId,
  fetchLeaderboardStats,
  profileName,
  usePipelineBoardLeads,
  useVisibleOwnerIds,
} from "./crm-views";
import { SALES_STAGE_KEYWORDS, normalizeStageName } from "./team";

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

export const BROWSER_TZ = (() => {
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
  enabled?: boolean;
}) {
  const { user } = useAuth();
  const funnel = opts.funnel ?? null;
  const grain = opts.grain ?? "none";
  const fromIso = opts.from ? opts.from.toISOString() : null;
  const toIso = opts.to ? opts.to.toISOString() : null;
  const rpc = useQuery({
    queryKey: ["leads", "cube", user?.organizationId, funnel, fromIso, toIso, grain, BROWSER_TZ],
    enabled: !!user?.organizationId && (opts.enabled ?? true),
    retry: false,
    refetchInterval: opts.refetchInterval ?? false,
    // A new funnel/period keeps the previous numbers until its own arrive.
    placeholderData: keepPreviousData,
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

/**
 * Won revenue per month for the last 8 months -- the home page's "Oylik
 * tushum dinamikasi". Summed by the database (won_revenue_by_month); the
 * month-grained lead cube stands in until that function exists.
 */
export function useMonthlyWonRevenue(funnel: string | null): { label: string; revenue: number }[] {
  const { user } = useAuth();
  const { data: stages } = usePipelineStagesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const ownerIds = visibleOwnerIds ? [...visibleOwnerIds].sort() : null;
  const from = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 7, 1);
  }, []);
  const rpc = useQuery({
    queryKey: [
      "won_revenue_by_month",
      user?.organizationId,
      funnel,
      from.toISOString(),
      ownerIds?.join(","),
      BROWSER_TZ,
    ],
    enabled: !!user?.organizationId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("won_revenue_by_month", {
        p_from: from.toISOString(),
        p_funnel: funnel,
        p_owner_ids: ownerIds,
        p_tz: BROWSER_TZ,
      });
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.month, Number(r.revenue)]));
    },
  });
  const cube = useVisibleCube(
    useLeadCube({ funnel, from: rpc.isError ? from : null, grain: "month", enabled: rpc.isError })
      .data,
  );
  return useMemo(() => {
    let byMonth = rpc.data;
    if (!byMonth) {
      const stagesById = byId(stages);
      byMonth = new Map<string, number>();
      for (const r of cube) {
        if (!r.period || !(r.stage_id && stagesById.get(r.stage_id)?.is_won)) continue;
        byMonth.set(r.period, (byMonth.get(r.period) ?? 0) + r.revenue);
      }
    }
    const now = new Date();
    const out: { label: string; revenue: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ label: MONTH_LABELS[d.getMonth()]!, revenue: byMonth.get(localDateKey(d)) ?? 0 });
    }
    return out;
  }, [rpc.data, cube, stages]);
}

// A sale: the funnel's won stage (whatever it is called -- "Sotildi",
// "Muvaffaqiyatli"...) or a payment stage matched by name.
export function isSalesStageName(stage: StageRow | undefined): boolean {
  if (stage?.is_won) return true;
  const stageName = stage ? normalizeStageName(stage.name) : "";
  return SALES_STAGE_KEYWORDS.some((kw) => stageName.includes(kw));
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
  // Leads per day and scored calls per day since the cutoff, grouped by the
  // database (period_lead_summary / call_quality_by_day): 12 weeks of calls
  // were 38 MB and 25 s in the browser in the load test.
  const { user } = useAuth();
  const ownerIds = visibleOwnerIds ? [...visibleOwnerIds].sort() : null;
  const rpc = useQuery({
    queryKey: [
      "conversion_quality",
      user?.organizationId,
      funnel,
      cutoff.toISOString(),
      scoreMin,
      scoreMax,
      ownerIds?.join(","),
      BROWSER_TZ,
    ],
    enabled: !!user?.organizationId,
    retry: false,
    queryFn: async () => {
      const to = new Date(Date.now() + 86_400_000).toISOString();
      const [leadRows, callRows] = await Promise.all([
        fetchAllPages(async (from) => {
          const { data, error } = await supabase
            .rpc("period_lead_summary", {
              p_from: cutoff.toISOString(),
              p_to: to,
              p_funnel: funnel,
              p_owner_ids: ownerIds,
              p_tz: BROWSER_TZ,
            })
            .eq("period", "day")
            .order("stage_id")
            .order("day")
            .range(from, from + RESOURCE_PAGE_SIZE - 1);
          if (error) throw error;
          return data ?? [];
        }),
        supabase.rpc("call_quality_by_day", {
          p_from: cutoff.toISOString(),
          p_score_min: scoreMin,
          p_score_max: scoreMax,
          p_funnel: funnel,
          p_owner_ids: ownerIds,
          p_tz: BROWSER_TZ,
        }),
      ]);
      if (callRows.error) throw callRows.error;
      return {
        leads: leadRows.map((r) => ({ stage_id: r.stage_id, day: r.day!, n: Number(r.n) })),
        calls: (callRows.data ?? []).map((r) => ({
          day: r.day,
          scored: Number(r.scored),
          inRange: Number(r.in_range),
        })),
      };
    },
  });
  // Until the functions exist: the old browser-side path.
  const fallback = rpc.isError;
  const cube = useVisibleCube(
    useLeadCube({ funnel, from: fallback ? cutoff : null, grain: "day", enabled: fallback }).data,
  );
  const { data: calls } = useCallsWithLead(cutoff, null, fallback);

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

    if (rpc.data) {
      for (const r of rpc.data.leads) {
        const day = parsePeriod(r.day);
        const stage = r.stage_id ? stagesById.get(r.stage_id) : undefined;
        const b = bucketFor(isoWeekLabel(day), day);
        b.created += r.n;
        if (stage?.is_won) b.won += r.n;
      }
      for (const r of rpc.data.calls) {
        const day = parsePeriod(r.day);
        const b = bucketFor(isoWeekLabel(day), day);
        b.totalCalls += r.scored;
        b.inRangeCalls += r.inRange;
      }
    }

    for (const r of rpc.data ? [] : cube) {
      if (!r.period) continue;
      const day = parsePeriod(r.period);
      const stage = r.stage_id ? stagesById.get(r.stage_id) : undefined;
      const b = bucketFor(isoWeekLabel(day), day);
      b.created += r.n;
      if (stage?.is_won) b.won += r.n;
    }

    for (const c of rpc.data ? [] : (calls ?? [])) {
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
  }, [rpc.data, cube, stages, calls, funnel, scoreMin, scoreMax, cutoff, visibleOwnerIds]);
}

/* ------------------------------------------------------------------ */
/* Period stats: one aggregate over the leads/calls/stages of a date    */
/* range (plus the range before it, for comparison). Feeds the          */
/* dashboard's attention/conversion/call blocks and the Hisobot export. */
/* ------------------------------------------------------------------ */

export type PeriodScope = {
  funnel: string | null;
  teamId: string | null; // a ROP's profile id -- scopes to their whole team
  operatorId: string | null; // a single manager's profile id
};

/**
 * The funnel step whose pass-through rate fell the most against the
 * previous period: `prevPct` -> `curPct` (share of leads that reached the
 * next stage), `dropPct` = the fall in percentage points.
 */
export type PeriodStageDrop = {
  fromStage: string;
  toStage: string;
  dropPct: number;
  prevPct: number;
  curPct: number;
};

export type PeriodStats = {
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
  biggestStageDrop: PeriodStageDrop | null;
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
    leads: number;
    sold: number;
    revenue: number;
  }[];
  callFlowByDay: { label: string; connected: number; missed: number }[];
  // Only computable when a single funnel is selected, same reasoning as
  // biggestStageDrop -- stage names/positions aren't comparable across
  // different AmoCRM pipelines.
  stageBreakdown: { stage: string; count: number; pct: number }[];
};

const EMPTY_PERIOD_STATS: PeriodStats = {
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
export function useCallsWithLead(from: Date | null, to: Date | null, enabled = true) {
  const { user } = useAuth();
  const fromIso = from ? from.toISOString() : null;
  const toIso = to ? to.toISOString() : null;
  return useQuery({
    queryKey: ["amocrm_calls", "with_lead", user?.organizationId, fromIso, toIso],
    enabled: !!user?.organizationId && enabled,
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

// The grouped inputs every period figure is computed from. The database
// produces them (period_lead_summary / period_call_summary); until those
// functions exist the raw rows are grouped the same way in the browser.
type PeriodLeadGroup = {
  owner_id: string | null;
  stage_id: string | null;
  n: number;
  revenue: number;
};
type PeriodDayGroup = { stage_id: string | null; day: string; n: number; revenue: number };
type PeriodCallSummary = {
  total: number;
  connected: number;
  seconds: number;
  scored: number;
  score_sum: number;
  connected_leads: number;
  won_connected_leads: number;
  /** Connected leads by their current stage (newer database function). */
  connected_by_stage?: { stage_id: string | null; n: number }[];
  by_owner: {
    owner_id: string;
    calls: number;
    seconds: number;
    scored: number;
    score_sum: number;
  }[];
  by_day: { day: string; connected: number; missed: number }[];
};
type PeriodGroups = {
  byOwner: PeriodLeadGroup[];
  byDay: PeriodDayGroup[];
  prevByStage: { stage_id: string | null; n: number; revenue: number }[];
  calls: PeriodCallSummary;
};

/** Lead owners a scope covers: one manager, a ROP's team, or null (everyone). */
export function scopeOwnerIds(
  scope: Pick<PeriodScope, "teamId" | "operatorId">,
  profiles: ProfileLite[] | undefined,
): string[] | null {
  if (scope.operatorId) return [scope.operatorId];
  if (scope.teamId) {
    const ids = new Set<string>([scope.teamId]);
    for (const p of profiles ?? []) if (p.manager_id === scope.teamId) ids.add(p.id);
    return [...ids];
  }
  return null;
}
type ProfileLite = { id: string; manager_id: string | null };

function usePeriodGroupsRpc(
  range: { from: Date; to: Date } | null,
  prevRange: { from: Date; to: Date } | null,
  scope: PeriodScope,
  ownerIds: string[] | null,
  ready: boolean,
) {
  const { user } = useAuth();
  const key = [
    range?.from.toISOString(),
    range?.to.toISOString(),
    prevRange?.from.toISOString(),
    prevRange?.to.toISOString(),
    scope.funnel,
    ownerIds?.join(","),
    BROWSER_TZ,
  ];
  return useQuery({
    queryKey: ["period_groups", user?.organizationId, ...key],
    enabled: !!user?.organizationId && !!range && !!prevRange && ready,
    retry: false,
    queryFn: async (): Promise<PeriodGroups> => {
      const [leadRows, calls] = await Promise.all([
        fetchAllPages(async (from) => {
          const { data, error } = await supabase
            .rpc("period_lead_summary", {
              p_from: range!.from.toISOString(),
              p_to: range!.to.toISOString(),
              p_prev_from: prevRange!.from.toISOString(),
              p_prev_to: prevRange!.to.toISOString(),
              p_funnel: scope.funnel,
              p_owner_ids: ownerIds,
              p_tz: BROWSER_TZ,
            })
            .order("period")
            .order("owner_id")
            .order("stage_id")
            .order("day")
            .range(from, from + RESOURCE_PAGE_SIZE - 1);
          if (error) throw error;
          return data ?? [];
        }),
        supabase.rpc("period_call_summary", {
          p_from: range!.from.toISOString(),
          p_to: range!.to.toISOString(),
          p_funnel: scope.funnel,
          p_owner_ids: ownerIds,
          p_tz: BROWSER_TZ,
        }),
      ]);
      if (calls.error) throw calls.error;
      const groups: PeriodGroups = {
        byOwner: [],
        byDay: [],
        prevByStage: [],
        calls: calls.data as unknown as PeriodCallSummary,
      };
      for (const r of leadRows) {
        const n = Number(r.n);
        const revenue = Number(r.revenue);
        if (r.period === "owner")
          groups.byOwner.push({ owner_id: r.owner_id, stage_id: r.stage_id, n, revenue });
        else if (r.period === "day" && r.day)
          groups.byDay.push({ stage_id: r.stage_id, day: r.day, n, revenue });
        else if (r.period === "prev") groups.prevByStage.push({ stage_id: r.stage_id, n, revenue });
      }
      return groups;
    },
  });
}

/** The browser-side grouping of raw rows, used only until the RPCs exist. */
function groupPeriodRows(
  leads: LeadInPeriod[],
  calls: CallWithLead[],
  range: { from: Date; to: Date },
  prevRange: { from: Date; to: Date },
  scope: PeriodScope,
  ownerIds: string[] | null,
  stagesById: Map<string, StageRow>,
): PeriodGroups {
  const owners = ownerIds ? new Set(ownerIds) : null;
  const funnelOf = (l: { funnel: string | null }) => l.funnel || "Direct Sales";
  const keep = (l: { owner_id: string | null; funnel: string | null } | null | undefined) =>
    !!l?.owner_id &&
    (!owners || owners.has(l.owner_id)) &&
    (!scope.funnel || funnelOf(l) === scope.funnel);
  const byOwner = new Map<string, PeriodLeadGroup>();
  const byDay = new Map<string, PeriodDayGroup>();
  const prev = new Map<string, { stage_id: string | null; n: number; revenue: number }>();
  for (const l of leads) {
    if (!keep(l)) continue;
    const created = new Date(l.created_at);
    if (created >= range.from && created < range.to) {
      const ok = `${l.owner_id}|${l.stage_id}`;
      const o = byOwner.get(ok) ?? { owner_id: l.owner_id, stage_id: l.stage_id, n: 0, revenue: 0 };
      o.n += 1;
      o.revenue += l.expected_revenue;
      byOwner.set(ok, o);
      const day = localDateKey(created);
      const dk = `${l.stage_id}|${day}`;
      const d = byDay.get(dk) ?? { stage_id: l.stage_id, day, n: 0, revenue: 0 };
      d.n += 1;
      d.revenue += l.expected_revenue;
      byDay.set(dk, d);
    } else if (created >= prevRange.from && created < prevRange.to) {
      const k = String(l.stage_id);
      const p = prev.get(k) ?? { stage_id: l.stage_id, n: 0, revenue: 0 };
      p.n += 1;
      p.revenue += l.expected_revenue;
      prev.set(k, p);
    }
  }
  const summary: PeriodCallSummary = {
    total: 0,
    connected: 0,
    seconds: 0,
    scored: 0,
    score_sum: 0,
    connected_leads: 0,
    won_connected_leads: 0,
    by_owner: [],
    by_day: [],
  };
  const ownerCalls = new Map<string, PeriodCallSummary["by_owner"][number]>();
  const dayCalls = new Map<string, { day: string; connected: number; missed: number }>();
  const connectedLeads = new Set<string>();
  const wonConnected = new Set<string>();
  const connectedStage = new Map<string, string | null>();
  for (const c of calls) {
    const at = new Date(c.occurred_at);
    if (at < range.from || at >= range.to || !c.lead || !keep(c.lead)) continue;
    const owner = c.lead.owner_id!;
    summary.total += 1;
    summary.seconds += c.duration_seconds;
    if (c.score != null) {
      summary.scored += 1;
      summary.score_sum += c.score;
    }
    if (c.connected) {
      summary.connected += 1;
      connectedLeads.add(c.lead.id);
      connectedStage.set(c.lead.id, c.lead.stage_id);
      if (c.lead.stage_id && stagesById.get(c.lead.stage_id)?.is_won) wonConnected.add(c.lead.id);
    }
    const o = ownerCalls.get(owner) ?? {
      owner_id: owner,
      calls: 0,
      seconds: 0,
      scored: 0,
      score_sum: 0,
    };
    o.calls += 1;
    o.seconds += c.duration_seconds;
    if (c.score != null) {
      o.scored += 1;
      o.score_sum += c.score;
    }
    ownerCalls.set(owner, o);
    const day = localDateKey(at);
    const d = dayCalls.get(day) ?? { day, connected: 0, missed: 0 };
    if (c.connected) d.connected += 1;
    else d.missed += 1;
    dayCalls.set(day, d);
  }
  summary.connected_leads = connectedLeads.size;
  summary.won_connected_leads = wonConnected.size;
  const byConnectedStage = new Map<string | null, number>();
  for (const stageId of connectedStage.values())
    byConnectedStage.set(stageId, (byConnectedStage.get(stageId) ?? 0) + 1);
  summary.connected_by_stage = [...byConnectedStage].map(([stage_id, n]) => ({ stage_id, n }));
  summary.by_owner = [...ownerCalls.values()];
  summary.by_day = [...dayCalls.values()];
  return {
    byOwner: [...byOwner.values()],
    byDay: [...byDay.values()],
    prevByStage: [...prev.values()],
    calls: summary,
  };
}

/** Every period figure, from the grouped inputs. */
function periodStatsFrom(
  g: PeriodGroups,
  range: { from: Date; to: Date },
  scope: PeriodScope,
  stagesById: Map<string, StageRow>,
  stages: StageRow[] | undefined,
  profilesById: Map<string, Tables["profiles"]["Row"]>,
): PeriodStats {
  const stageOf = (id: string | null) => (id ? stagesById.get(id) : undefined);
  const isSales = (id: string | null) => isSalesStageName(stageOf(id));
  const isFullPayment = (id: string | null) => {
    const s = stageOf(id);
    if (s?.is_won) return true;
    const name = s ? normalizeStageName(s.name) : "";
    return FULL_PAYMENT_STAGE_KEYWORDS.some((kw) => name.includes(kw));
  };

  // Current period by stage (from the per-day groups, which cover every lead).
  const byStage = new Map<string | null, number>();
  let newLeads = 0;
  let soldLeads = 0;
  let wonLeadsCreated = 0;
  let openLeads = 0;
  let periodRevenue = 0;
  let fullPaymentCount = 0;
  const revenueByDay = new Map<string, number>();
  for (const r of g.byDay) {
    newLeads += r.n;
    byStage.set(r.stage_id, (byStage.get(r.stage_id) ?? 0) + r.n);
    const stage = stageOf(r.stage_id);
    if (isSales(r.stage_id)) {
      soldLeads += r.n;
      periodRevenue += r.revenue;
      revenueByDay.set(r.day, (revenueByDay.get(r.day) ?? 0) + r.revenue);
    }
    if (isFullPayment(r.stage_id)) fullPaymentCount += r.n;
    if (stage?.is_won) wonLeadsCreated += r.n;
    if (!stage?.is_won && !stage?.is_lost) openLeads += r.n;
  }

  let prevPeriodRevenue = 0;
  let prevFullPaymentCount = 0;
  for (const r of g.prevByStage) {
    if (isSales(r.stage_id)) prevPeriodRevenue += r.revenue;
    if (isFullPayment(r.stage_id)) prevFullPaymentCount += r.n;
  }

  const revenueTrend: PeriodStats["revenueTrend"] = [];
  const callFlowByDay: PeriodStats["callFlowByDay"] = [];
  const callsByDay = new Map(g.calls.by_day.map((d) => [d.day, d]));
  for (let d = new Date(range.from); d < range.to; d.setDate(d.getDate() + 1)) {
    const key = localDateKey(d);
    revenueTrend.push({ label: `${d.getDate()}`, revenue: revenueByDay.get(key) ?? 0 });
    const c = callsByDay.get(key);
    callFlowByDay.push({
      label: `${d.getDate()}`,
      connected: c?.connected ?? 0,
      missed: c?.missed ?? 0,
    });
  }

  let biggestStageDrop: PeriodStageDrop | null = null;
  let stageBreakdown: PeriodStats["stageBreakdown"] = [];
  if (scope.funnel) {
    const orderedStages = (stages ?? [])
      .filter((s) => s.pipeline_name === scope.funnel && !s.is_lost)
      .sort((a, b) => a.position - b.position);
    if (orderedStages.length >= 2) {
      const prevByStageId = new Map<string | null, number>();
      for (const r of g.prevByStage)
        prevByStageId.set(r.stage_id, (prevByStageId.get(r.stage_id) ?? 0) + r.n);
      // How many leads got at least as far as each stage (a lead's current
      // stage stands for how far it reached).
      const reachOf = (counts: Map<string | null, number>) =>
        orderedStages.map((s) => {
          let n = 0;
          for (const [id, count] of counts) {
            const st = stageOf(id);
            if (st && !st.is_lost && st.position >= s.position) n += count;
          }
          return n;
        });
      const cur = reachOf(byStage);
      const prev = reachOf(prevByStageId);
      // A step is compared only when both periods had enough leads at it,
      // so a handful of leads can't read as a -100% collapse.
      const MIN_LEADS = 5;
      let worst: PeriodStageDrop | null = null;
      for (let i = 0; i < orderedStages.length - 1; i++) {
        if (cur[i]! < MIN_LEADS || prev[i]! < MIN_LEADS) continue;
        const curPct = Math.round((cur[i + 1]! / cur[i]!) * 1000) / 10;
        const prevPct = Math.round((prev[i + 1]! / prev[i]!) * 1000) / 10;
        const dropPct = Math.round((prevPct - curPct) * 10) / 10;
        if (dropPct >= 5 && (!worst || dropPct > worst.dropPct)) {
          worst = {
            fromStage: orderedStages[i]!.name,
            toStage: orderedStages[i + 1]!.name,
            dropPct,
            prevPct,
            curPct,
          };
        }
      }
      biggestStageDrop = worst;
    }
    const base = newLeads || 1;
    stageBreakdown = (stages ?? [])
      .filter((s) => s.pipeline_name === scope.funnel)
      .sort((a, b) => a.position - b.position)
      .map((s) => {
        const count = byStage.get(s.id) ?? 0;
        return { stage: s.name, count, pct: Math.round((count / base) * 1000) / 10 };
      })
      .filter((s) => s.count > 0);
  }

  // Each manager's leads, sales and calls -- the report's manager table.
  type Agg = {
    calls: number;
    scoreSum: number;
    scoreCount: number;
    seconds: number;
    leads: number;
    sold: number;
    revenue: number;
  };
  const agg = new Map<string, Agg>();
  const aggFor = (id: string) => {
    let a = agg.get(id);
    if (!a) {
      a = { calls: 0, scoreSum: 0, scoreCount: 0, seconds: 0, leads: 0, sold: 0, revenue: 0 };
      agg.set(id, a);
    }
    return a;
  };
  for (const r of g.byOwner) {
    if (!r.owner_id) continue;
    const a = aggFor(r.owner_id);
    a.leads += r.n;
    if (isSales(r.stage_id)) {
      a.sold += r.n;
      a.revenue += r.revenue;
    }
  }
  for (const o of g.calls.by_owner) {
    const a = aggFor(o.owner_id);
    a.calls += Number(o.calls);
    a.seconds += Number(o.seconds);
    a.scoreSum += Number(o.score_sum);
    a.scoreCount += Number(o.scored);
  }
  const operatorBreakdown = [...agg.entries()]
    .map(([id, a]) => ({
      id,
      name: profileName(profilesById.get(id)),
      calls: a.calls,
      avgScore: a.scoreCount ? Math.round(a.scoreSum / a.scoreCount) : null,
      totalSeconds: a.seconds,
      leads: a.leads,
      sold: a.sold,
      revenue: a.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.calls - a.calls);

  const totalCalls = Number(g.calls.total);
  const connectedCalls = Number(g.calls.connected);
  const totalCallSeconds = Number(g.calls.seconds);
  const scored = Number(g.calls.scored);
  const connectedLeadsCount = Number(g.calls.connected_leads);
  // A sale is any sales stage (prepayment, half or full payment, won) --
  // the same set the period conversion counts; an older database function
  // without the per-stage list falls back to won stages only.
  const wonFromConnectedCount = g.calls.connected_by_stage
    ? g.calls.connected_by_stage.reduce(
        (sum, r) => sum + (isSales(r.stage_id) ? Number(r.n) : 0),
        0,
      )
    : Number(g.calls.won_connected_leads);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    totalCalls,
    connectedCalls,
    missedCalls: totalCalls - connectedCalls,
    contactRatePct: pct(connectedCalls, totalCalls),
    totalCallSeconds,
    avgCallSeconds: totalCalls ? Math.round(totalCallSeconds / totalCalls) : 0,
    avgCallScore: scored ? Math.round(Number(g.calls.score_sum) / scored) : null,
    newLeads,
    soldLeads,
    soldLeadsPct: pct(soldLeads, newLeads),
    openLeads,
    wonLeadsCreated,
    wonLeadsCreatedPct: pct(wonLeadsCreated, newLeads),
    connectedLeadsCount,
    wonFromConnectedCount,
    wonFromConnectedPct: pct(wonFromConnectedCount, connectedLeadsCount),
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
        ? Math.round(((fullPaymentCount - prevFullPaymentCount) / prevFullPaymentCount) * 1000) / 10
        : null,
    revenueTrend,
    operatorBreakdown,
    callFlowByDay,
    stageBreakdown,
  };
}

export function usePeriodStats(
  range: { from: Date; to: Date } | null,
  prevRange: { from: Date; to: Date } | null,
  scope: PeriodScope,
): PeriodStats {
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles, isFetched: profilesFetched } = useProfilesRaw();
  const ownerIds = useMemo(
    () => scopeOwnerIds(scope, profiles),
    [scope.operatorId, scope.teamId, profiles], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // A team's members come from the profiles list, so wait for it then.
  const rpc = usePeriodGroupsRpc(
    range,
    prevRange,
    scope,
    ownerIds,
    !scope.teamId || profilesFetched,
  );
  // Until the database functions exist: the raw rows, grouped here.
  const fallback = rpc.isError;
  const spanFrom =
    range && prevRange ? new Date(Math.min(range.from.getTime(), prevRange.from.getTime())) : null;
  const spanTo =
    range && prevRange ? new Date(Math.max(range.to.getTime(), prevRange.to.getTime())) : null;
  const { data: leads } = useLeadsCreatedBetween(
    fallback ? spanFrom : null,
    fallback ? spanTo : null,
  );
  const { data: calls } = useCallsWithLead(
    range?.from ?? null,
    range?.to ?? null,
    fallback && !!range,
  );

  return useMemo(() => {
    if (!range || !prevRange) return EMPTY_PERIOD_STATS;
    const stagesById = byId(stages);
    const groups = rpc.data
      ? rpc.data
      : fallback && leads && calls
        ? groupPeriodRows(leads, calls, range, prevRange, scope, ownerIds, stagesById)
        : null;
    if (!groups) return EMPTY_PERIOD_STATS;
    return periodStatsFrom(groups, range, scope, stagesById, stages, byId(profiles));
  }, [rpc.data, fallback, leads, calls, stages, profiles, range, prevRange, scope, ownerIds]);
}

// The dashboard's funnel widget reads real, funnel-scoped lead data and
// needs an explicit funnel: across the whole org (dozens of AmoCRM
// pipelines sharing generic stage names) a stage chart is meaningless.
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
  // null: written by the system (amoCRM sync, server jobs); "AI" for the
  // call analysis' notes.
  who: string | null;
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
        who: author ? profileName(author) : a.type === "ai_note" ? "AI" : null,
        what: a.content,
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
    queryFn: () => fetchLeaderboardStats({ from, to, funnel, stageId: null, tags: [] }),
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
