// Bosh sahifa → «Ish stoli»: the figures computed on the server
// (/dashboard/desk), cut to what the person may see.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { DeskData } from "@/lib/desk";

export type DeskQuery = {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  funnel: string | null;
};

async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Could not load");
  return json;
}

function params(q: DeskQuery) {
  const p = new URLSearchParams({ from: q.from, to: q.to, prevFrom: q.prevFrom, prevTo: q.prevTo });
  if (q.funnel) p.set("funnel", q.funnel);
  return p;
}

export function useDesk(q: DeskQuery) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["desk", user?.organizationId, q.from, q.to, q.prevFrom, q.prevTo, q.funnel],
    enabled: !!user?.organizationId,
    staleTime: 30_000,
    refetchInterval: 120_000,
    placeholderData: keepPreviousData,
    queryFn: () => getJson<DeskData>(`/dashboard/desk?${params(q)}`),
  });
}
