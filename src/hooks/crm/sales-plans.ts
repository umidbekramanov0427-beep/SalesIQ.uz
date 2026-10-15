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
