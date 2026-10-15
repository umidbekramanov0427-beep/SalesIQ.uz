// The platform owner's monitoring bot page (/platform/bot).
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { CompanyFacts, Issue, Level, PlatformFacts } from "@/lib/ops/health";

export type OpsCompany = CompanyFacts & { issues: Issue[]; status: Level | "ok" };

export type OpsOverview = {
  linked: boolean;
  sharedBot: string | null;
  opsBot: string | null;
  opsBotConfigured: boolean;
  alertsReady: boolean;
  recent: { key: string; created_at: string }[];
  platform: PlatformFacts;
  platformIssues: Issue[];
  companies: OpsCompany[];
};

export function usePlatformOps() {
  return useQuery({
    queryKey: ["platform_ops"],
    // Faster while waiting for the owner to press Start in the bot.
    refetchInterval: (q) => (q.state.data && !q.state.data.linked ? 5000 : 60_000),
    queryFn: async (): Promise<OpsOverview> => {
      const res = await apiFetch("/platform/ops-api");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Holatni yuklab bo'lmadi");
      return json;
    },
  });
}

export function useSendOpsReport() {
  return useMutation({
    mutationFn: async (): Promise<{ sent: number }> => {
      const res = await apiFetch("/platform/ops-api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send-report" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Yuborib bo'lmadi");
      return json;
    },
  });
}
