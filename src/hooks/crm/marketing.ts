// Marketing paneli: its figures from /marketing/data (src/lib/marketing.server.ts).
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { MarketingData } from "@/lib/marketing";

export function useMarketingData(period: { from: string; to: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing_data", user?.organizationId, period.from, period.to],
    enabled: !!user?.organizationId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<MarketingData> => {
      const res = await apiFetch(
        `/marketing/data?${new URLSearchParams({ from: period.from, to: period.to })}`,
      );
      const json = (await res.json().catch(() => ({}))) as MarketingData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load marketing data");
      return json;
    },
  });
}
