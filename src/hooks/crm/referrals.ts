// Taklif dasturi: the company's invitation link (Admin panel) and the
// platform owner's partners (Platforma → Hamkorlar).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { OrgReferralView, PartnerRow, ReferralRow } from "@/lib/referral.server";

async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Failed");
  return json as T;
}

export function useMyReferrals() {
  return useQuery({
    queryKey: ["my_referrals"],
    queryFn: () => getJson<OrgReferralView>("/referral-api"),
    retry: (n, err) => n < 2 && (err as Error).message !== "MIGRATION_PENDING",
  });
}

export type PartnersOverview = {
  partners: PartnerRow[];
  referrals: ReferralRow[];
  totals: { referrals: number; paid: number; unpaid: number; topCompanies: number };
};

export function usePartnersOverview() {
  return useQuery({
    queryKey: ["platform_partners"],
    queryFn: () => getJson<PartnersOverview>("/platform/partners-api"),
    retry: (n, err) => n < 2 && (err as Error).message !== "MIGRATION_PENDING",
  });
}

export function usePartnerAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiFetch("/platform/partners-api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform_partners"] }),
  });
}
