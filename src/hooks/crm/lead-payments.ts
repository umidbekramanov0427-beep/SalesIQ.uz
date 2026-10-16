// Payments from a company's clients into its own Payme / Click cashbox:
// the cashbox settings (Admin → Mijozlardan to'lov) and a lead's payment
// links (lead card). Server side: src/lib/lead-payments/.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api";
import type { Tables } from "./core";

async function send<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(
    path,
    body === undefined ? {} : { method: "POST", body: JSON.stringify(body) },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed");
  return json as T;
}

export type PaymentMerchantInfo = {
  paymeMerchantId: string;
  paymeKeySet: boolean;
  paymeReady: boolean;
  clickServiceId: string;
  clickMerchantId: string;
  clickKeySet: boolean;
  clickReady: boolean;
  paidStages: Record<string, string>;
  paymeEndpoint: string;
  clickEndpoint: string;
};

export function usePaymentMerchant(enabled = true) {
  return useQuery({
    queryKey: ["payment_merchant"],
    enabled,
    staleTime: 30_000,
    queryFn: () => send<PaymentMerchantInfo>("/lead-payments/merchant"),
  });
}

export type PaymentMerchantPatch = {
  paymeMerchantId?: string;
  paymeKey?: string;
  clickServiceId?: string;
  clickMerchantId?: string;
  clickKey?: string;
  paidStages?: Record<string, string>;
};

export function useSavePaymentMerchant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PaymentMerchantPatch) =>
      send<{ ok: true }>("/lead-payments/merchant", patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["payment_merchant"] }),
  });
}

export type LeadPaymentLinkRow = Tables["lead_payment_links"]["Row"];

/** The lead's payment links, newest first (empty before migration 20261130010000). */
export function useLeadPaymentLinks(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead_payment_links", leadId],
    enabled: !!leadId,
    // A link the client is paying right now turns "paid" without a reload.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.status === "pending") ? 10_000 : false,
    queryFn: async (): Promise<LeadPaymentLinkRow[]> => {
      const { data, error } = await supabase
        .from("lead_payment_links")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return [];
      return data ?? [];
    },
  });
}

export function useCreateLeadPaymentLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { leadId: string; amount: number; description: string }) =>
      send<{ id: string; url: string }>("/lead-payments/create", input),
    onSuccess: (_d, { leadId }) =>
      void qc.invalidateQueries({ queryKey: ["lead_payment_links", leadId] }),
  });
}

export function useCancelLeadPaymentLink(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send<{ ok: true }>("/lead-payments/cancel", { id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lead_payment_links", leadId] }),
  });
}
