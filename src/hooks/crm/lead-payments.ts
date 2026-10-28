// Payments from a company's clients into its own Payme / Click cashbox:
// the cashbox settings (Admin → Mijozlardan to'lov) and a lead's payment
// links (lead card). Server side: src/lib/lead-payments/.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api";
import type { Tables } from "./core";
import type { CollectedRow } from "@/lib/lead-payments/collected";

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
    mutationFn: (input: {
      leadId: string;
      amount: number;
      description: string;
      /** 1..28: also send it automatically on this day every month. */
      monthlyDay?: number;
    }) =>
      send<{ id: string; url: string; scheduleId: string | null }>("/lead-payments/create", input),
    onSuccess: (_d, { leadId }) => {
      void qc.invalidateQueries({ queryKey: ["lead_payment_links", leadId] });
      void qc.invalidateQueries({ queryKey: ["lead_payment_schedules", leadId] });
    },
  });
}

export type LeadPaymentScheduleRow = Tables["lead_payment_schedules"]["Row"];

/** The lead's active monthly payment links (empty before migration 20261201000000). */
export function useLeadPaymentSchedules(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead_payment_schedules", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<LeadPaymentScheduleRow[]> => {
      const { data, error } = await supabase
        .from("lead_payment_schedules")
        .select("*")
        .eq("lead_id", leadId!)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) return [];
      return data ?? [];
    },
  });
}

export function useStopLeadPaymentSchedule(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send<{ ok: true }>("/lead-payments/schedule-stop", { id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lead_payment_schedules", leadId] }),
  });
}

export function useCancelLeadPaymentLink(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send<{ ok: true }>("/lead-payments/cancel", { id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lead_payment_links", leadId] }),
  });
}

export type LeadPaymentRow = Tables["lead_payments"]["Row"];

/** The lead's payments ledger, newest first (null before migration 20261207000000). */
export function useLeadLedger(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead_payments", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<LeadPaymentRow[] | null> => {
      const { data, error } = await supabase
        .from("lead_payments")
        .select("*")
        .eq("lead_id", leadId!)
        .order("paid_at", { ascending: false })
        .limit(200);
      if (error) return null;
      return data ?? [];
    },
  });
}

function useLedgerMutation<T>(leadId: string, run: (input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["lead_payments", leadId] });
      // paid_amount, next_payment_date and maybe the stage changed.
      void qc.invalidateQueries({ queryKey: ["lead_detail", leadId] });
      void qc.invalidateQueries({ queryKey: ["lead_activities", leadId] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useAddLeadPayment(leadId: string) {
  return useLedgerMutation(
    leadId,
    (input: { amount: number; method: string; paidAt?: string | undefined; note?: string }) =>
      send<{ ok: true; id: string }>("/lead-payments/ledger", { action: "add", leadId, ...input }),
  );
}

export function useDeleteLeadPayment(leadId: string) {
  return useLedgerMutation(leadId, (id: string) =>
    send<{ ok: true }>("/lead-payments/ledger", { action: "delete", id }),
  );
}

export function useSetNextPaymentDate(leadId: string) {
  return useLedgerMutation(leadId, (date: string | null) =>
    send<{ ok: true }>("/lead-payments/ledger", { action: "next", leadId, date }),
  );
}

/**
 * The company's payment links of the last year for the dashboard's
 * "Yig'ilgan to'lovlar" (summed by summarizeCollected); one funnel's only
 * when a funnel is picked. Empty before migration 20261130010000.
 */
export function useCollectedPayments(funnel: string | null) {
  return useQuery({
    queryKey: ["collected_payments", funnel],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<CollectedRow[]> => {
      const since = new Date(Date.now() - 365 * 86_400_000).toISOString();
      let q = supabase
        .from("lead_payment_links")
        .select(
          "id, lead_id, amount, status, provider, paid_at, created_at, lead:leads!inner(name, funnel)",
        )
        .neq("status", "cancelled")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (funnel) q = q.eq("lead.funnel", funnel);
      const { data, error } = await q;
      if (error) return [];
      return (data ?? []).map((r) => {
        const lead = r.lead as unknown as { name: string | null } | null;
        return {
          id: r.id,
          lead_id: r.lead_id,
          amount: Number(r.amount),
          status: r.status,
          provider: r.provider,
          paid_at: r.paid_at,
          created_at: r.created_at,
          lead_name: lead?.name ?? null,
        };
      });
    },
  });
}
