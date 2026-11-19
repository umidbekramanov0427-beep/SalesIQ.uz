// The sales reports (Bosh sahifa's Konversiya and Reyting), computed on the
// server (/analytics/data) and cut to what the person may see; plus the
// manual income/expense lines Marketing -> Reklama keeps.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FinEntry } from "@/lib/finance";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AnalyticsData } from "@/lib/analytics-reports";

export type AnalyticsPeriod = { from: string; to: string };

async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Could not load analytics");
  return json;
}

export function useAnalytics(period: AnalyticsPeriod, funnel: string | null, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["analytics", user?.organizationId, period.from, period.to, funnel],
    enabled: enabled && !!user?.organizationId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => {
      const q = new URLSearchParams({ from: period.from, to: period.to });
      if (funnel) q.set("funnel", funnel);
      return getJson<AnalyticsData>(`/analytics/data?${q}`);
    },
  });
}

/** Adds or removes one income/expense line (the company's admin). */
export function useFinanceEntryMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["marketing_data"] });
  };
  const add = useMutation({
    mutationFn: async (e: Omit<FinEntry, "id"> & { project_id?: string | null }) => {
      const { error } = await supabase.from("finance_entries").insert({
        ...e,
        organization_id: user!.organizationId!,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("finance_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
  });
  return { add, remove };
}
