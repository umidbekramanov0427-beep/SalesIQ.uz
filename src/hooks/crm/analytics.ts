// Analitika (/analytics): the reports and the events log, computed on the
// server (/analytics/data, /analytics/events) and cut to what the person may see.
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
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
