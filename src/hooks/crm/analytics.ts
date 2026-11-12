// Analitika (/analytics): the reports and the events log, computed on the
// server (/analytics/data, /analytics/events) and cut to what the person may see.
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FinEntry, FinanceData } from "@/lib/finance";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AnalyticsData, EventKind, LogEvent } from "@/lib/analytics-reports";

export type AnalyticsPeriod = { from: string; to: string };

async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Could not load analytics");
  return json;
}

export function useAnalytics(period: AnalyticsPeriod, funnel: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["analytics", user?.organizationId, period.from, period.to, funnel],
    enabled: !!user?.organizationId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => {
      const q = new URLSearchParams({ from: period.from, to: period.to });
      if (funnel) q.set("funnel", funnel);
      return getJson<AnalyticsData>(`/analytics/data?${q}`);
    },
  });
}

export function useAnalyticsEvents(
  period: AnalyticsPeriod,
  kind: EventKind | null,
  actor: string | null,
) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: ["analytics_events", user?.organizationId, period.from, period.to, kind, actor],
    enabled: !!user?.organizationId,
    initialPageParam: 0,
    staleTime: 30_000,
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams({ from: period.from, to: period.to, page: String(pageParam) });
      if (kind) q.set("kind", kind);
      if (actor) q.set("actor", actor);
      return getJson<{ events: LogEvent[]; hasMore: boolean }>(`/analytics/events?${q}`);
    },
    getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
  });
}

/** Reklama / Moliya / Prognoz figures (admins and heads of sales only). */
export function useFinance(period: AnalyticsPeriod, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["analytics_finance", user?.organizationId, period.from, period.to],
    enabled: enabled && !!user?.organizationId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () =>
      getJson<FinanceData>(
        `/analytics/finance?${new URLSearchParams({ from: period.from, to: period.to })}`,
      ),
  });
}

/** Adds or removes one income/expense line (the company's admin). */
export function useFinanceEntryMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["analytics_finance"] });
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
