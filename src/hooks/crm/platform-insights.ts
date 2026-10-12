// Platform owner: the visits report's other views (trial health, customer
// path, online now, one company's usage) and its actions.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { FunnelStep, TrialTemp } from "@/lib/trial-score";
import type { PlatformVisit } from "./duplicates-billing";

async function getInsight<T>(query: string, fallback: string): Promise<T> {
  const res = await apiFetch(`/platform/insights?${query}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? fallback);
  return json as T;
}

export type PlatformTrialHealth = {
  org: { id: string; name: string; createdAt: string; trialEndsAt: string | null };
  score: number;
  temp: TrialTemp;
  gaps: string[];
  daysLeft: number | null;
  idleDays: number | null;
  sessions7d: number;
  activeUsers7d: number;
  users: number;
  leads: number;
  integrations: string[];
  lastSeenAt: string | null;
};

export function usePlatformTrialHealth(enabled = true) {
  return useQuery({
    queryKey: ["platform_insights", "trials"],
    enabled,
    queryFn: () =>
      getInsight<{
        trials: PlatformTrialHealth[];
        expiredUnpaid: { id: string; name: string; trialEndsAt: string | null }[];
        newSignupsYesterday: number;
      }>("view=trials", "Sinovdagi kompaniyalarni yuklab bo'lmadi"),
  });
}

export type PlatformFunnelCompany = {
  id: string;
  name: string;
  createdAt: string;
  phase: "trial" | "paid" | "expired";
  frozen: boolean;
  done: Record<FunnelStep, boolean>;
  stoppedAt: FunnelStep | null;
};

export function usePlatformFunnel(days: 30 | 90 | null, enabled = true) {
  return useQuery({
    queryKey: ["platform_insights", "funnel", days],
    enabled,
    queryFn: () =>
      getInsight<{
        total: number;
        steps: { step: FunnelStep; reached: number; stoppedHere: number }[];
        companies: PlatformFunnelCompany[];
      }>(`view=funnel&days=${days ?? "all"}`, "Mijoz yo'lini yuklab bo'lmadi"),
  });
}

export type PlatformOnlineSession = PlatformVisit & { currentPath: string | null };

export function usePlatformOnline(enabled = true) {
  return useQuery({
    queryKey: ["platform_insights", "online"],
    enabled,
    refetchInterval: 30_000,
    queryFn: () =>
      getInsight<{ sessions: PlatformOnlineSession[] }>(
        "view=online",
        "Onlayn foydalanuvchilarni yuklab bo'lmadi",
      ),
  });
}

export type PlatformOrgUsage = {
  org: {
    id: string;
    name: string;
    phase: "trial" | "paid" | "expired";
    trialEndsAt: string | null;
    createdAt: string;
  };
  days: number;
  daily: { date: string; sessions: number; users: number }[];
  pages: { path: string; count: number }[];
  actions: { label: string; count: number }[];
  employees: {
    id: string;
    name: string;
    email: string;
    role: string;
    isIntern: boolean;
    sessions: number;
    pages: number;
    changes: number;
    lastSeenAt: string | null;
  }[];
};

export function usePlatformOrgUsage(orgId: string) {
  return useQuery({
    queryKey: ["platform_insights", "usage", orgId],
    queryFn: () =>
      getInsight<PlatformOrgUsage>(
        `view=usage&org=${encodeURIComponent(orgId)}`,
        "Foydalanish tahlilini yuklab bo'lmadi",
      ),
  });
}

export function usePlatformInsightAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: { action: "digest" } | { action: "close"; id: string },
    ): Promise<{ ok: boolean; sent?: boolean; scope?: "session" | "all" }> => {
      const res = await apiFetch("/platform/insights", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Amalni bajarib bo'lmadi");
      return json;
    },
    onSuccess: (_data, input) => {
      if (input.action !== "close") return;
      void queryClient.invalidateQueries({ queryKey: ["platform_visit", input.id] });
      void queryClient.invalidateQueries({ queryKey: ["platform_visits"] });
      void queryClient.invalidateQueries({ queryKey: ["platform_insights", "online"] });
    },
  });
}
