// Pul qaytarish (src/lib/refunds.ts): the company's refunds (what the person
// may see), the lead card's own open refund, and adding / editing / importing.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ImportedRefund, RefundRow } from "@/lib/refunds";

const missing = (msg: string) => /lead_refunds|does not exist|schema cache/i.test(msg);

export function useRefunds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["lead_refunds", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<{ rows: RefundRow[]; missing: boolean }> => {
      const { data, error } = await supabase
        .from("lead_refunds")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) {
        if (missing(error.message)) return { rows: [], missing: true };
        throw error;
      }
      return { rows: (data ?? []) as RefundRow[], missing: false };
    },
  });
}

/** The lead's open refund (pending or refunded), if any. */
export function useLeadRefund(leadId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["lead_refunds", user?.organizationId, "lead", leadId],
    enabled: !!user?.organizationId && !!leadId,
    queryFn: async (): Promise<RefundRow | null> => {
      const { data, error } = await supabase
        .from("lead_refunds")
        .select("*")
        .eq("lead_id", leadId!)
        .neq("status", "cancelled")
        .maybeSingle();
      if (error) {
        if (missing(error.message)) return null;
        throw error;
      }
      return (data as RefundRow | null) ?? null;
    },
  });
}

type NewRefund = Omit<ImportedRefund, "stage"> & {
  stage: ImportedRefund["stage"];
  lead_id?: string | null;
  paid_amount?: number | null;
  note?: string | null;
};

export function useRefundMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const done = () => void qc.invalidateQueries({ queryKey: ["lead_refunds"] });
  const add = useMutation({
    mutationFn: async (rows: NewRefund[]) => {
      if (!rows.length) return;
      const { error } = await supabase.from("lead_refunds").insert(
        rows.map((r) => ({
          ...r,
          organization_id: user!.organizationId!,
          created_by: user!.id,
          status: "pending",
        })),
      );
      if (error) throw error;
    },
    onSuccess: done,
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<RefundRow> }) => {
      const { error } = await supabase
        .from("lead_refunds")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_refunds").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
  });
  /** Uploads the transfer's receipt: marks it refunded and the bot tells the client. */
  const receipt = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.set("id", id);
      form.set("file", file);
      const res = await apiFetch("/refunds/receipt", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        notified?: boolean;
        notifyError?: string | null;
      };
      if (!res.ok) throw new Error(json.error ?? "Chekni yuklab bo'lmadi");
      return json;
    },
    onSuccess: done,
  });
  return { add, update, remove, receipt };
}

/** A short-lived link to the uploaded receipt. */
export async function openRefundReceipt(id: string): Promise<void> {
  const res = await apiFetch(`/refunds/receipt?id=${encodeURIComponent(id)}`);
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? "Chek topilmadi");
  window.open(json.url, "_blank", "noopener");
}
