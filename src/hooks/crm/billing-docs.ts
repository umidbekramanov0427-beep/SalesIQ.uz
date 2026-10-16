// Subscription documents (invoice, act, bill for bank transfer) and
// SalesIQ's own legal details printed on them.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Requisites } from "@/lib/subscription-billing/documents";
import type { BillingDoc, DocKind } from "@/lib/subscription-billing/documents.server";

export type { BillingDoc, DocKind };

export function useBillingDoc(kind: DocKind, paymentId: string | undefined) {
  return useQuery({
    queryKey: ["billing_doc", kind, paymentId ?? null],
    enabled: kind === "proforma" || !!paymentId,
    retry: false,
    queryFn: async (): Promise<BillingDoc> => {
      const q = new URLSearchParams({ type: kind });
      if (paymentId) q.set("payment", paymentId);
      const res = await apiFetch(`/billing/documents?${q}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json as BillingDoc;
    },
  });
}

export function usePlatformRequisites(enabled = true) {
  return useQuery({
    queryKey: ["platform_requisites"],
    enabled,
    queryFn: async (): Promise<Requisites> => {
      const res = await apiFetch("/billing/documents?requisites=1");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json as Requisites;
    },
  });
}

export function useSavePlatformRequisites() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requisites: Requisites) => {
      const res = await apiFetch("/billing/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requisites }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json as Requisites;
    },
    onSuccess: (data) => qc.setQueryData(["platform_requisites"], data),
  });
}
