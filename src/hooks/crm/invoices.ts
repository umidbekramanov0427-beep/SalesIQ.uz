// Invoices (hisob-faktura) and the company's requisites / Didox login.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { InvoiceItem } from "@/lib/invoices/invoice";
import type { Tables } from "./core";

export type InvoiceRow = Tables["invoices"]["Row"];
export type InvoiceSettingsRow = Tables["org_invoice_settings"]["Row"];

const missing = (e: { code?: string; message?: string }) =>
  e.code === "42P01" ||
  e.code === "PGRST205" ||
  /schema cache|does not exist/.test(e.message ?? "");

/** The company's requisites; `ready: false` until the invoices migration runs. */
export function useInvoiceSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org_invoice_settings", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<{ ready: boolean; settings: InvoiceSettingsRow | null }> => {
      const { data, error } = await supabase
        .from("org_invoice_settings")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) {
        if (missing(error)) return { ready: false, settings: null };
        throw error;
      }
      return { ready: true, settings: data };
    },
  });
}

export function useSaveInvoiceSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<InvoiceSettingsRow>) => {
      const { organization_id: _o, next_number: _n, updated_at: _u, ...rest } = patch;
      const { error } = await supabase.from("org_invoice_settings").upsert(
        {
          ...rest,
          organization_id: user!.organizationId!,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" },
      );
      if (error) throw new Error(missing(error) ? "MIGRATION_PENDING" : error.message);
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org_invoice_settings", user?.organizationId] }),
  });
}

/** The company's invoices, newest first (one lead's when `leadId` is given). */
export function useInvoices(leadId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["invoices", user?.organizationId, leadId ?? null],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<InvoiceRow[] | null> => {
      let q = supabase
        .from("invoices")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (leadId) q = q.eq("lead_id", leadId);
      const { data, error } = await q;
      if (error) {
        if (missing(error)) return null;
        throw error;
      }
      return data;
    },
  });
}

export function useInvoice(id: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["invoice", id],
    enabled: !!user?.organizationId && !!id,
    queryFn: async (): Promise<InvoiceRow | null> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type NewInvoice = {
  leadId?: string | null;
  date: string;
  contractNo?: string | undefined;
  contractDate?: string | undefined;
  buyerName: string;
  buyerTin?: string | undefined;
  buyerAddress?: string | undefined;
  buyerAccount?: string | undefined;
  buyerBankMfo?: string | undefined;
  buyerVatRegCode?: string | undefined;
  hasVat: boolean;
  items: InvoiceItem[];
  note?: string | undefined;
};

type ApiError = Error & { problems?: string[] };

async function invoiceApi<T>(body: Record<string, unknown>): Promise<T> {
  const res = await apiFetch("/invoice-api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error ?? "Failed") as ApiError;
    if (Array.isArray(json.problems)) err.problems = json.problems;
    throw err;
  }
  return json as T;
}

/** Create / status / delete / Didox actions; refreshes the invoice lists. */
export function useInvoiceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      invoiceApi<{ invoice?: InvoiceRow; ok?: boolean }>(body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["org_invoice_settings"] });
      if (data.invoice) qc.setQueryData(["invoice", data.invoice.id], data.invoice);
    },
  });
}

export type DidoxStatus = {
  ready: boolean;
  connected: boolean;
  tin?: string | null;
  connectedAt?: string | null;
  lastError?: string | null;
};

export function useDidoxStatus() {
  return useQuery({
    queryKey: ["didox_status"],
    queryFn: async (): Promise<DidoxStatus> => {
      const res = await apiFetch("/invoice-api");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
  });
}

export function useDidoxConnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body:
        { action: "didox-connect"; tin: string; password: string } | { action: "didox-disconnect" },
    ) => invoiceApi<DidoxStatus>(body),
    onSuccess: (status) => qc.setQueryData(["didox_status"], status),
  });
}
