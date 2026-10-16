// Platform owner: Platforma → Daromad (MRR, churn, LTV, payments).
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { RevenueReport } from "@/lib/revenue";

export function usePlatformRevenue() {
  return useQuery({
    queryKey: ["platform_revenue"],
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<RevenueReport> => {
      const res = await apiFetch("/platform/revenue-api");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load revenue");
      return json as RevenueReport;
    },
  });
}
