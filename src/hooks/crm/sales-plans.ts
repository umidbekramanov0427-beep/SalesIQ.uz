// Monthly sales plans (sales_plans) and the month's won deals per owner.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { monthRange } from "@/lib/sales-plan";
import type { Tables } from "./core";

export type SalesPlanRow = Tables["sales_plans"]["Row"];

const missing = (e: { code?: string; message?: string }) =>
  e.code === "42P01" ||
  e.code === "PGRST205" ||
  e.code === "PGRST202" ||
  /schema cache|does not exist|Could not find the function/.test(e.message ?? "");

/** The month's plans (null = the database update hasn't run yet). */
export function useSalesPlans(month: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sales_plans", user?.organizationId, month],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<SalesPlanRow[] | null> => {
      const { data, error } = await supabase
        .from("sales_plans")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .eq("month", month);
      if (error) {
        if (missing(error)) return null;
        throw error;
      }
      return data;
    },
  });
}

export type PlanFact = { ownerId: string | null; deals: number; revenue: number };

export function useSalesPlanFacts(month: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sales_plan_facts", user?.organizationId, month],
    enabled: !!user?.organizationId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PlanFact[] | null> => {
      const { from, to } = monthRange(month);
      const { data, error } = await supabase.rpc("sales_plan_facts", {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) {
        if (missing(error)) return null;
        throw error;
      }
      return (data ?? []).map((r) => ({
        ownerId: r.owner_id,
        deals: Number(r.deals),
        revenue: Number(r.revenue),
      }));
    },
  });
}

/** Sets one plan (profileId null = the team's); a zero plan is removed. */
export function useSaveSalesPlan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      month: string;
      profileId: string | null;
      targetAmount: number;
      targetDeals: number;
    }) => {
      const orgId = user!.organizationId!;
      let q = supabase
        .from("sales_plans")
        .select("id")
        .eq("organization_id", orgId)
        .eq("month", input.month);
      q = input.profileId ? q.eq("profile_id", input.profileId) : q.is("profile_id", null);
      const { data: existing, error: findError } = await q.maybeSingle();
      if (findError) throw new Error(missing(findError) ? "MIGRATION_PENDING" : findError.message);
      const values = {
        target_amount: Math.max(0, input.targetAmount),
        target_deals: Math.max(0, Math.round(input.targetDeals)),
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      if (existing && values.target_amount === 0 && values.target_deals === 0) {
        const { error } = await supabase.from("sales_plans").delete().eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = existing
        ? await supabase.from("sales_plans").update(values).eq("id", existing.id)
        : await supabase.from("sales_plans").insert({
            ...values,
            organization_id: orgId,
            profile_id: input.profileId,
            month: input.month,
          });
      if (error) throw error;
    },
    onSuccess: (_d, input) =>
      void qc.invalidateQueries({ queryKey: ["sales_plans", user?.organizationId, input.month] }),
  });
}

// ---- Reja-fakt by stage and day (lead_stage_events, stage_plans) ----------

export type StageEventRow = { stage_id: string; entered_at: string; owner_id: string | null };

/**
 * Leads entering each stage during the month. Until the database update
 * has run there is no stage history: each lead then counts once, for the
 * stage it is in now (`approximate`).
 */
export function useStageEvents(month: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["lead_stage_events", user?.organizationId, month],
    enabled: !!user?.organizationId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<{ events: StageEventRow[]; approximate: boolean }> => {
      const { from, to } = monthRange(month);
      const page = async <T>(
        run: (lo: number, hi: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
      ) => {
        const out: T[] = [];
        for (let lo = 0; ; lo += 1000) {
          const { data, error } = await run(lo, lo + 999);
          if (error) throw error;
          out.push(...(data ?? []));
          if ((data ?? []).length < 1000) return out;
        }
      };
      try {
        const events = await page<StageEventRow>((lo, hi) =>
          supabase
            .from("lead_stage_events")
            .select("stage_id, entered_at, owner_id")
            .gte("entered_at", from.toISOString())
            .lt("entered_at", to.toISOString())
            .order("entered_at")
            .range(lo, hi),
        );
        return { events, approximate: false };
      } catch (e) {
        if (!missing(e as { code?: string; message?: string })) throw e;
      }
      const leads = await page<{
        stage_id: string | null;
        stage_changed_at: string | null;
        owner_id: string | null;
      }>((lo, hi) =>
        supabase
          .from("leads")
          .select("stage_id, stage_changed_at, owner_id")
          .gte("stage_changed_at", from.toISOString())
          .lt("stage_changed_at", to.toISOString())
          .order("id")
          .range(lo, hi),
      );
      return {
        events: leads
          .filter((l) => l.stage_id && l.stage_changed_at)
          .map((l) => ({
            stage_id: l.stage_id!,
            entered_at: l.stage_changed_at!,
            owner_id: l.owner_id,
          })),
        approximate: true,
      };
    },
  });
}

export type StagePlanRow = {
  id: string;
  stage_id: string;
  profile_id: string | null;
  target: number;
};

/** The month's stage plans (null = the database update hasn't run yet). */
export function useStagePlans(month: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["stage_plans", user?.organizationId, month],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<StagePlanRow[] | null> => {
      const { data, error } = await supabase
        .from("stage_plans")
        .select("id, stage_id, profile_id, target")
        .eq("organization_id", user!.organizationId!)
        .eq("month", month);
      if (error) {
        if (missing(error)) return null;
        throw error;
      }
      return data;
    },
  });
}

/** Sets one stage's plan for the month (profileId null = the team's). */
export function useSaveStagePlan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      month: string;
      stageId: string;
      profileId: string | null;
      target: number;
    }) => {
      const orgId = user!.organizationId!;
      let q = supabase
        .from("stage_plans")
        .select("id")
        .eq("organization_id", orgId)
        .eq("month", input.month)
        .eq("stage_id", input.stageId);
      q = input.profileId ? q.eq("profile_id", input.profileId) : q.is("profile_id", null);
      const { data: existing, error: findError } = await q.maybeSingle();
      if (findError) throw new Error(missing(findError) ? "MIGRATION_PENDING" : findError.message);
      const target = Math.max(0, Math.round(input.target));
      if (existing && target === 0) {
        const { error } = await supabase.from("stage_plans").delete().eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const values = { target, updated_by: user?.id ?? null, updated_at: new Date().toISOString() };
      const { error } = existing
        ? await supabase.from("stage_plans").update(values).eq("id", existing.id)
        : await supabase.from("stage_plans").insert({
            ...values,
            organization_id: orgId,
            month: input.month,
            stage_id: input.stageId,
            profile_id: input.profileId,
          });
      if (error) throw error;
    },
    onSuccess: (_d, input) =>
      void qc.invalidateQueries({ queryKey: ["stage_plans", user?.organizationId, input.month] }),
  });
}
