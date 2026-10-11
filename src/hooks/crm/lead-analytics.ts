// Lead Analytics tabs, per-manager funnel stats and trends.
// Split out of src/hooks/use-crm-data.ts, which re-exports everything here.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Tables } from "./core";
import { usePipelineStagesRaw, useProfilesRaw } from "./config";
import { byId, profileName } from "./crm-views";
import { isSalesStageName, localDateKey, useLeadCube } from "./dashboard";

/* ------------------------------------------------------------------ */
/* Lead Analytics — "Harakat kerak" tab. Computed entirely in SQL (see    */
/* lead_analytics_action RPC) since this runs over the org's full lead    */
/* table, not the small filtered slices useLeadsRaw()'s callers work with. */
/* ------------------------------------------------------------------ */

export type LeadAnalyticsRecoverableRow = {
  lead_id: string;
  name: string;
  manager: string;
  days_since_closed: number;
  next_follow_up: string | null;
  value: number;
  reason: string | null;
};

export type LeadAnalyticsHotRow = {
  lead_id: string;
  name: string;
  manager: string;
  score: number;
  temperature: string;
  stage: string;
  value: number;
};

export type LeadAnalyticsOperatorRow = {
  manager: string;
  won_connected: number;
  won_attempts: number;
  lost_connected: number;
  lost_attempts: number;
};

export type LeadAnalyticsActionData = {
  totalLeads: number;
  avgConversion: number;
  hotLeads: number;
  churnRisk: number;
  // Real, AI-verdict-based counterparts to the old "recoverable" list's
  // length (which included every lost lead, assessed or not) -- these two
  // are the authoritative "how many / how much is actually still
  // winnable" numbers, computed server-side from leads.recoverable = true.
  recoverableCount: number;
  recoverableRevenue: number;
  recoverable: LeadAnalyticsRecoverableRow[];
  hotPipeline: LeadAnalyticsHotRow[];
  operatorActivity: LeadAnalyticsOperatorRow[];
};

export function useLeadAnalyticsAction(
  funnel: string | null,
  manager: string | null,
  since: Date | null,
  team: string | null,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "lead_analytics_action",
      user?.organizationId,
      funnel,
      manager,
      since?.getTime(),
      team,
    ],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadAnalyticsActionData> => {
      const { data, error } = await supabase.rpc("lead_analytics_action", {
        p_funnel: funnel,
        p_manager: manager,
        p_since: since ? since.toISOString() : null,
        p_team: team,
      });
      if (error) throw error;
      return data as unknown as LeadAnalyticsActionData;
    },
  });
}

// Manager dropdown on Lead Analytics needs to cascade with the funnel
// filter too (not just the team/ROP filter it already had) -- this page
// has no client-side lead list to derive that from (everything else on
// it goes through SQL RPCs), so it's a small dedicated query instead.
export function useManagerIdsInFunnel(funnel: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["manager_ids_in_funnel", user?.organizationId, funnel],
    enabled: !!user?.organizationId && !!funnel,
    queryFn: async (): Promise<Set<string>> => {
      if (!funnel) return new Set();
      const { data, error } = await supabase
        .from("leads")
        .select("owner_id")
        .eq("funnel", funnel)
        .not("owner_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.owner_id as string));
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lead Analytics — "Lead sifati" tab. Per-tag aggregation, also SQL-side */
/* (unnest(leads.tags)) for the same scale reason as the action tab.      */
/* ------------------------------------------------------------------ */

export type LeadAnalyticsTagResultRow = {
  tag: string;
  sold: number;
  lost: number;
  open: number;
  total: number;
};

export type LeadAnalyticsTagMatrixRow = {
  tag: string;
  total: number;
  avg_score: number | null;
  conversion: number | null;
  low_sample: boolean;
};

export type LeadAnalyticsTagCategoryRow = {
  tag: string;
  cold: number;
  warm: number;
  hot: number;
  very_hot: number;
};

export type LeadAnalyticsQualityData = {
  tagResults: LeadAnalyticsTagResultRow[];
  tagMatrix: LeadAnalyticsTagMatrixRow[];
  tagCategories: LeadAnalyticsTagCategoryRow[];
};

export function useLeadAnalyticsQuality(
  funnel: string | null,
  manager: string | null,
  team: string | null,
  since: Date | null,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "lead_analytics_quality",
      user?.organizationId,
      funnel,
      manager,
      team,
      since?.getTime(),
    ],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadAnalyticsQualityData> => {
      const { data, error } = await supabase.rpc("lead_analytics_quality", {
        p_funnel: funnel,
        p_manager: manager,
        p_team: team,
        p_since: since ? since.toISOString() : null,
      });
      if (error) throw error;
      return data as unknown as LeadAnalyticsQualityData;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lead Analytics — "Hozirgi holat" tab. Same SQL-side-aggregation reasoning */
/* as the other two lead_analytics_* hooks.                                 */
/* ------------------------------------------------------------------ */

export type LeadAnalyticsStageRow = {
  stage: string;
  lead_count: number;
  avg_days: number | null;
};

export type LeadAnalyticsManagerLoadRow = {
  manager: string;
  cold: number;
  warm: number;
  hot: number;
  very_hot: number;
  total: number;
};

export type LeadAnalyticsCurrentData = {
  temperature: { cold: number; warm: number; hot: number; veryHot: number };
  stages: LeadAnalyticsStageRow[];
  managerLoad: LeadAnalyticsManagerLoadRow[];
};

export function useLeadAnalyticsCurrent(
  funnel: string | null,
  manager: string | null,
  team: string | null,
  since: Date | null,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "lead_analytics_current",
      user?.organizationId,
      funnel,
      manager,
      team,
      since?.getTime(),
    ],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadAnalyticsCurrentData> => {
      const { data, error } = await supabase.rpc("lead_analytics_current", {
        p_funnel: funnel,
        p_manager: manager,
        p_team: team,
        p_since: since ? since.toISOString() : null,
      });
      if (error) throw error;
      return data as unknown as LeadAnalyticsCurrentData;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lead Analytics — "Yo'nalish" tab. Same SQL-side-aggregation reasoning as */
/* the other three lead_analytics_* hooks.                                  */
/* ------------------------------------------------------------------ */

export type LeadAnalyticsLostReasonRow = { reason: string; count: number };

export type LeadAnalyticsChurnRow = {
  lead_id: string;
  name: string;
  manager: string;
  days_since_contact: number | null;
  risk_percent: number;
  score: number;
  temperature: string;
};

export type LeadAnalyticsDirectionData = {
  direction: { closingSoon: number; neutral: number; losingSoon: number };
  lostReasons: LeadAnalyticsLostReasonRow[];
  churnRisk: LeadAnalyticsChurnRow[];
};

export function useLeadAnalyticsDirection(
  funnel: string | null,
  manager: string | null,
  team: string | null,
  since: Date | null,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "lead_analytics_direction",
      user?.organizationId,
      funnel,
      manager,
      team,
      since?.getTime(),
    ],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadAnalyticsDirectionData> => {
      const { data, error } = await supabase.rpc("lead_analytics_direction", {
        p_funnel: funnel,
        p_manager: manager,
        p_team: team,
        p_since: since ? since.toISOString() : null,
      });
      if (error) throw error;
      return data as unknown as LeadAnalyticsDirectionData;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lead Analytics — "Marketing" tab. leads.source/campaign/utm existed    */
/* since the very first schema but nothing ever read them -- this is the */
/* first real "which channel is working" view. p_until (unlike the other */
/* 3 lead_analytics_* RPCs) lets the Oylik picker bound to exactly that   */
/* month, since CPL/ROI divides that month's leads by that month's       */
/* marketing_spend row -- an open-ended "since the 1st, to today" filter */
/* would silently inflate the lead count relative to the spend entered.  */
/* ------------------------------------------------------------------ */

export type LeadAnalyticsSourceRow = {
  source: string;
  total: number;
  won: number;
  lost: number;
  revenue: number;
  conversion: number | null;
};

export type LeadAnalyticsCampaignRow = {
  campaign: string;
  total: number;
  won: number;
  lost: number;
  revenue: number;
  conversion: number | null;
};

export type LeadAnalyticsQualityBySourceRow = {
  source: string;
  qualified: number;
  unqualified: number;
  unscored: number;
  total: number;
};

export type LeadAnalyticsLostReasonBySourceRow = {
  source: string;
  reason: string;
  count: number;
};

export type LeadAnalyticsSpeedBySourceRow = {
  source: string;
  avg_hours: number;
  sample_size: number;
};

export type LeadAnalyticsDailyTrendRow = {
  date: string;
  source: string;
  count: number;
};

export type LeadAnalyticsMarketingData = {
  bySource: LeadAnalyticsSourceRow[];
  byCampaign: LeadAnalyticsCampaignRow[];
  qualityBySource: LeadAnalyticsQualityBySourceRow[];
  lostReasonsBySource: LeadAnalyticsLostReasonBySourceRow[];
  speedBySource: LeadAnalyticsSpeedBySourceRow[];
  dailyTrend: LeadAnalyticsDailyTrendRow[];
};

export function useLeadAnalyticsMarketing(
  funnel: string | null,
  manager: string | null,
  team: string | null,
  since: Date | null,
  until: Date | null,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "lead_analytics_marketing",
      user?.organizationId,
      funnel,
      manager,
      team,
      since?.getTime(),
      until?.getTime(),
    ],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadAnalyticsMarketingData> => {
      const { data, error } = await supabase.rpc("lead_analytics_marketing", {
        p_funnel: funnel,
        p_manager: manager,
        p_team: team,
        p_since: since ? since.toISOString() : null,
        p_until: until ? until.toISOString() : null,
      });
      if (error) throw error;
      return data as unknown as LeadAnalyticsMarketingData;
    },
  });
}

export type MarketingSpendRow = Tables["marketing_spend"]["Row"];

/** One row per org/source/campaign/month — entered manually since nothing
 *  in the schema tracks ad spend automatically. Scoped to a single month
 *  when `month` is given (matches the Marketing tab's CPL/ROI section,
 *  which only ever shows one month at a time), otherwise returns every row
 *  (used by the spend-management list).
 */
export function useMarketingSpend(month?: Date | null) {
  const { user } = useAuth();
  const monthKey = month ? month.toISOString().slice(0, 10) : null;
  return useQuery({
    queryKey: ["marketing_spend", user?.organizationId, monthKey],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<MarketingSpendRow[]> => {
      let query = supabase
        .from("marketing_spend")
        .select("*")
        .eq("organization_id", user!.organizationId!);
      if (monthKey) query = query.eq("month", monthKey);
      const { data, error } = await query.order("month", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertMarketingSpend() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      source: string;
      campaign?: string;
      month: Date;
      amount: number;
    }) => {
      const monthKey = new Date(input.month.getFullYear(), input.month.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      const { error } = await supabase.from("marketing_spend").upsert(
        {
          organization_id: user!.organizationId!,
          source: input.source.trim(),
          campaign: input.campaign?.trim() ?? "",
          month: monthKey,
          amount: input.amount,
          created_by: user!.id,
        },
        { onConflict: "organization_id,source,campaign,month" },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["marketing_spend", user?.organizationId] }),
  });
}

export function useDeleteMarketingSpend() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_spend").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["marketing_spend", user?.organizationId] }),
  });
}

/**
 * "Hisobotni olish" -- an on-demand, full-page snapshot of Lid tahlili for
 * whatever funnel/team/operator/period is selected in the top filter bar,
 * as one combined report the caller can read or copy. Fetches all 5
 * lead_analytics_* RPCs in parallel with the *client's own session* (not a
 * server route on the service-role key) so each RPC's built-in
 * super_admin/rop/self scoping applies exactly as it already does for the
 * 5 tabs themselves -- a rep clicking this button gets a report of their
 * own leads only, a ROP gets their team's, matching the page they're
 * looking at.
 */
export type LeadAnalyticsFullReportData = {
  action: LeadAnalyticsActionData;
  quality: LeadAnalyticsQualityData;
  current: LeadAnalyticsCurrentData;
  direction: LeadAnalyticsDirectionData;
  marketing: LeadAnalyticsMarketingData;
};

export function useGenerateLeadAnalyticsReport() {
  return useMutation({
    mutationFn: async (input: {
      funnel: string | null;
      manager: string | null;
      team: string | null;
      since: Date | null;
      until: Date | null;
    }): Promise<LeadAnalyticsFullReportData> => {
      const sinceIso = input.since ? input.since.toISOString() : null;
      const untilIso = input.until ? input.until.toISOString() : null;
      const [actionRes, qualityRes, currentRes, directionRes, marketingRes] = await Promise.all([
        supabase.rpc("lead_analytics_action", {
          p_funnel: input.funnel,
          p_manager: input.manager,
          p_since: sinceIso,
          p_team: input.team,
        }),
        supabase.rpc("lead_analytics_quality", {
          p_funnel: input.funnel,
          p_manager: input.manager,
          p_team: input.team,
          p_since: sinceIso,
        }),
        supabase.rpc("lead_analytics_current", {
          p_funnel: input.funnel,
          p_manager: input.manager,
          p_team: input.team,
          p_since: sinceIso,
        }),
        supabase.rpc("lead_analytics_direction", {
          p_funnel: input.funnel,
          p_manager: input.manager,
          p_team: input.team,
          p_since: sinceIso,
        }),
        supabase.rpc("lead_analytics_marketing", {
          p_funnel: input.funnel,
          p_manager: input.manager,
          p_team: input.team,
          p_since: sinceIso,
          p_until: untilIso,
        }),
      ]);
      if (actionRes.error) throw actionRes.error;
      if (qualityRes.error) throw qualityRes.error;
      if (currentRes.error) throw currentRes.error;
      if (directionRes.error) throw directionRes.error;
      if (marketingRes.error) throw marketingRes.error;
      return {
        action: actionRes.data as unknown as LeadAnalyticsActionData,
        quality: qualityRes.data as unknown as LeadAnalyticsQualityData,
        current: currentRes.data as unknown as LeadAnalyticsCurrentData,
        direction: directionRes.data as unknown as LeadAnalyticsDirectionData,
        marketing: marketingRes.data as unknown as LeadAnalyticsMarketingData,
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Per-manager funnel stats (Reyting live-ranking table) — same raw-lead */
/* computation as useFunnelStats above, grouped by owner instead of      */
/* summed across the whole funnel.                                       */
/* ------------------------------------------------------------------ */

export type ManagerFunnelStats = { totalLeads: number; salesCount: number; salesRevenue: number };

export function useManagerFunnelStats(
  funnel?: string | null,
  opts?: { refetchInterval?: number | false },
): Map<string, ManagerFunnelStats> {
  // The Reyting page's "Jonli" (live) mode polls these numbers too, not
  // just leaderboard_stats.
  const { data: cube } = useLeadCube({
    funnel: funnel ?? null,
    refetchInterval: opts?.refetchInterval ?? false,
  });
  const { data: stages } = usePipelineStagesRaw();
  return useMemo(() => {
    const stagesById = byId(stages);
    const map = new Map<string, ManagerFunnelStats>();
    for (const r of cube ?? []) {
      if (!r.owner_id) continue;
      const cur = map.get(r.owner_id) ?? { totalLeads: 0, salesCount: 0, salesRevenue: 0 };
      cur.totalLeads += r.n;
      const stage = r.stage_id ? stagesById.get(r.stage_id) : undefined;
      if (isSalesStageName(stage)) {
        cur.salesCount += r.n;
        cur.salesRevenue += r.revenue;
      }
      map.set(r.owner_id, cur);
    }
    return map;
  }, [cube, stages]);
}

/* ------------------------------------------------------------------ */
/* Daily per-manager trend (Reyting charts) — conversion% and sales-     */
/* stage revenue, bucketed by day of lead creation, for every manager    */
/* with at least one lead in the funnel. "Conversion" here is each       */
/* day's cohort of created leads that are *currently* sitting in a       */
/* sales stage — there's no stored historical snapshot of conversion     */
/* itself to chart directly, so this is the closest real approximation.  */
/* ------------------------------------------------------------------ */

const DEFAULT_TREND_DAYS = 30;

// A "Butun davr" (all-time) range with years of history would otherwise
// bucket into hundreds of illegible daily points -- cap it the same way
// the chart itself is already capped for legibility.
const MAX_TREND_DAYS = 90;

export type ManagerTrendSeries = {
  id: string;
  name: string;
  conversion: (number | null)[];
  salesRevenue: number[];
};

export type ManagerDailyTrend = { dayLabels: string[]; series: ManagerTrendSeries[] };

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function useManagerDailyTrend(
  funnel?: string | null,
  from?: Date | null,
  to?: Date | null,
): ManagerDailyTrend {
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();
  const managerStats = useManagerFunnelStats(funnel);

  const fromMs = from ? startOfDay(from).getTime() : null;
  const toMs = to ? startOfDay(to).getTime() : null;
  const days = useMemo(() => {
    const rangeEnd = toMs != null ? new Date(toMs) : startOfDay(new Date());
    const rangeStart =
      fromMs != null
        ? new Date(fromMs)
        : new Date(rangeEnd.getTime() - (DEFAULT_TREND_DAYS - 1) * 86400000);
    const dayCount = Math.min(
      MAX_TREND_DAYS,
      Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1),
    );
    const dayStarts: Date[] = [];
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(rangeEnd);
      d.setDate(d.getDate() - i);
      dayStarts.push(d);
    }
    const after = new Date(rangeEnd);
    after.setDate(after.getDate() + 1);
    return { dayStarts, cubeFrom: dayStarts[0]!, cubeTo: after };
  }, [fromMs, toMs]);
  const { data: cube } = useLeadCube({
    funnel: funnel ?? null,
    from: days.cubeFrom,
    to: days.cubeTo,
    grain: "day",
  });

  return useMemo(() => {
    const { dayStarts } = days;
    const dayLabels = dayStarts.map((d) => `${d.getDate()}.${d.getMonth() + 1}`);
    const dayIndex = new Map(dayStarts.map((d, i) => [localDateKey(d), i]));

    const ownerIds = Array.from(managerStats.entries())
      .sort((a, b) => b[1].salesRevenue - a[1].salesRevenue)
      .map(([id]) => id);
    if (ownerIds.length === 0) return { dayLabels, series: [] };

    const profilesById = byId(profiles);
    const stagesById = byId(stages);

    type Bucket = { total: number; sales: number; salesRevenue: number };
    const buckets = new Map<string, Bucket[]>();
    for (const id of ownerIds) {
      buckets.set(
        id,
        dayStarts.map(() => ({ total: 0, sales: 0, salesRevenue: 0 })),
      );
    }

    for (const r of cube ?? []) {
      if (!r.owner_id || !r.period || !buckets.has(r.owner_id)) continue;
      const idx = dayIndex.get(r.period);
      if (idx === undefined) continue;
      const bucket = buckets.get(r.owner_id)![idx]!;
      bucket.total += r.n;
      const stage = r.stage_id ? stagesById.get(r.stage_id) : undefined;
      if (isSalesStageName(stage)) {
        bucket.sales += r.n;
        bucket.salesRevenue += r.revenue;
      }
    }

    const series: ManagerTrendSeries[] = ownerIds.map((id) => {
      const b = buckets.get(id)!;
      return {
        id,
        name: profileName(profilesById.get(id)),
        conversion: b.map((w) => (w.total ? (w.sales / w.total) * 100 : null)),
        salesRevenue: b.map((w) => w.salesRevenue),
      };
    });

    return { dayLabels, series };
  }, [cube, days, stages, profiles, managerStats]);
}
