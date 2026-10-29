// Duplicate detection and merge, self-signup and platform subscription billing.
// Split out of src/hooks/use-crm-data.ts, which re-exports everything here.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LeadRow, ProfileRow, Tables } from "./core";

/* ------------------------------------------------------------------ */
/* Duplicate detection & merge -- module 4. Rows land in                */
/* lead_duplicate_flags whenever a webhook or web-form intake matches an */
/* existing contact's phone (see lead-intake.server.ts); this queue lets */
/* a rep resolve each one by merging or dismissing it.                   */
/* ------------------------------------------------------------------ */

export type LeadDuplicateFlagRow = Tables["lead_duplicate_flags"]["Row"];

/** The org's unresolved duplicate queue (overridden = false). */
export function useDuplicateFlags() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["lead_duplicate_flags", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadDuplicateFlagRow[]> => {
      const { data, error } = await supabase
        .from("lead_duplicate_flags")
        .select("*")
        .eq("overridden", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type DuplicateFlagLeadSummary = Pick<
  LeadRow,
  "id" | "name" | "company_name" | "created_at" | "owner_id" | "stage_id"
>;

/** Just enough to render each side of a flagged pair -- avoids pulling the org's entire (possibly thousands-of-rows) leads table just to label a handful of flags. */
export function useDuplicateFlagLeads(leadIds: string[]) {
  const key = [...new Set(leadIds)].sort().join(",");
  return useQuery({
    queryKey: ["lead_duplicate_flags_leads", key],
    enabled: leadIds.length > 0,
    queryFn: async (): Promise<DuplicateFlagLeadSummary[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, company_name, created_at, owner_id, stage_id")
        .in("id", [...new Set(leadIds)]);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMergeLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      survivorLeadId: string;
      loserLeadId: string;
    }): Promise<{ survivorLeadId: string }> => {
      const res = await apiFetch("/leads/merge", { method: "POST", body: JSON.stringify(input) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not merge leads.");
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["lead_duplicate_flags"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useDismissDuplicateFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (flagId: string): Promise<void> => {
      const res = await apiFetch("/leads/duplicates/dismiss", {
        method: "POST",
        body: JSON.stringify({ flagId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not dismiss flag.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lead_duplicate_flags"] }),
  });
}

export type ActiveFunnelCheckResult = {
  checkedAt: string;
  checkedStages: number;
  movedOrChanged: number;
  backfilled: number;
  missingInCrm: number;
  ignoreMissing: boolean;
};

/** The connected org's own last "Aktiv voronka solishtiruvi" run, if any. */
export function useActiveFunnelCheck() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["amocrm_active_funnel_check", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<ActiveFunnelCheckResult | null> => {
      const { data, error } = await supabase
        .from("amocrm_connection")
        .select("active_funnel_last_check")
        .maybeSingle();
      if (error) throw error;
      return (data?.active_funnel_last_check as ActiveFunnelCheckResult | null) ?? null;
    },
  });
}

/** Runs a fresh "Aktiv voronka solishtiruvi" pass and stores the result. */
export function useRunActiveFunnelCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ActiveFunnelCheckResult> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/amocrm/check-active-funnel", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Active funnel check failed.");
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["amocrm_active_funnel_check"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

/** Whether call-recording playback trims to the first answer -- see "Operatsiyalar" tab. */
export function useRecordingTrimSetting() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["amocrm_recording_trim", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("amocrm_connection")
        .select("recording_trim_before_answer")
        .maybeSingle();
      if (error) throw error;
      return data?.recording_trim_before_answer ?? false;
    },
  });
}

export function useSetRecordingTrim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean): Promise<void> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/amocrm/recording-trim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["amocrm_recording_trim"] }),
  });
}

/** Toggles checkActiveFunnel's "CRMda yo'q kartalarni sanamaslik" setting (amocrm_connection.active_funnel_ignore_missing). */
export function useSetActiveFunnelIgnoreMissing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ignoreMissing: boolean): Promise<void> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/amocrm/active-funnel-settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ignoreMissing }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["amocrm_connection_status"] }),
  });
}

export type ExternalApiTokenStatus = {
  hasToken: boolean;
  createdAt: string | null;
  revokedAt: string | null;
  tokenLast4: string | null;
};

export function useExternalApiTokenStatus() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["external_api_token_status", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<ExternalApiTokenStatus> => {
      const res = await apiFetch("/integrations/external-api-token");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load token status.");
      return json;
    },
  });
}

export function useGenerateExternalApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ token: string }> => {
      const res = await apiFetch("/integrations/external-api-token", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not generate token.");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["external_api_token_status"] }),
  });
}

export function useRevokeExternalApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await apiFetch("/integrations/external-api-token", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not revoke token.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["external_api_token_status"] }),
  });
}

export type OutgoingWebhook = {
  name: string;
  url: string;
  headers: Record<string, string>;
  createdAt: string;
};

export function useOutgoingWebhook() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["outgoing_webhook", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<OutgoingWebhook | null> => {
      const res = await apiFetch("/integrations/outgoing-webhook");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load webhook.");
      return json.webhook ?? null;
    },
  });
}

export function useSaveOutgoingWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      url: string;
      headers: Record<string, string>;
    }): Promise<void> => {
      const res = await apiFetch("/integrations/outgoing-webhook", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save webhook.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["outgoing_webhook"] }),
  });
}

export function useDeleteOutgoingWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await apiFetch("/integrations/outgoing-webhook", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not delete webhook.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["outgoing_webhook"] }),
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      full_name: string;
    }): Promise<{ id: string }> => {
      const res = await apiFetch("/admin/create-employee", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create employee");
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await apiFetch("/admin/delete-employee", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete employee");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

export function useSetEmployeePassword() {
  return useMutation({
    mutationFn: async (input: { id: string; password: string }): Promise<void> => {
      const res = await apiFetch("/admin/set-employee-password", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to set password");
    },
  });
}

export type CompanyDirectoryEntry = {
  id: string;
  name: string;
  active: boolean;
  frozen?: boolean;
  plan: string;
  createdAt: string;
  employeeCount: number;
  superAdminId: string | null;
  login: string | null;
};

export type CompanyDirectory = {
  owner: { id: string; name: string; email: string };
  companies: CompanyDirectoryEntry[];
};

/** Platform owner's company switcher: own profile + every organization's employee count and Super Admin login. */
export function useCompanyDirectory() {
  return useQuery({
    queryKey: ["company_directory"],
    queryFn: async (): Promise<CompanyDirectory> => {
      const res = await apiFetch("/platform/company-directory");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Kompaniyalar ro'yxatini yuklab bo'lmadi");
      return json;
    },
  });
}

/** A one-time sign-in token for a company's Super Admin (platform owner only). */
export async function requestCompanyEntry(orgId: string): Promise<{ tokenHash: string }> {
  const res = await apiFetch("/platform/enter-company", {
    method: "POST",
    body: JSON.stringify({ orgId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Kompaniyaga kirib bo'lmadi");
  return json;
}

export type OrganizationRow = Tables["organizations"]["Row"];

export function useOrganizations() {
  return useQuery({
    queryKey: ["organizations"],
    queryFn: async (): Promise<OrganizationRow[]> => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ------------------------------------------------------------------ */
/* Self-signup subscription flow -- one platform-wide row of support     */
/* contact info (Telegram/phone/email, set once by the platform owner,   */
/* shown on every org's own "Obuna" page) and a request queue an org's   */
/* own admin uses to tell the platform owner "we paid, please            */
/* reactivate us" until a real payment processor is wired up.            */
/* ------------------------------------------------------------------ */

export type PlatformSettingsRow = Tables["platform_settings"]["Row"];

export function usePlatformSettings() {
  return useQuery({
    queryKey: ["platform_settings"],
    queryFn: async (): Promise<PlatformSettingsRow | null> => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdatePlatformSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: {
      support_telegram?: string | null;
      support_phone?: string | null;
      support_email?: string | null;
    }) => {
      const { error } = await supabase.from("platform_settings").update(patch).eq("id", true);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform_settings"] }),
  });
}

export function useCreateSubscriptionRequest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note?: string) => {
      const { error } = await supabase.from("subscription_requests").insert({
        organization_id: user!.organizationId!,
        requested_by: user!.id,
        note: note?.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["subscription_requests"] }),
  });
}

export type SubscriptionRequestRow = Tables["subscription_requests"]["Row"] & {
  organizations: { name: string } | null;
};

/** Platform-owner-only feed of pending renewal requests, newest first. */
export function useSubscriptionRequestsRaw() {
  return useQuery({
    queryKey: ["subscription_requests"],
    queryFn: async (): Promise<SubscriptionRequestRow[]> => {
      const { data, error } = await supabase
        .from("subscription_requests")
        .select("*, organizations(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SubscriptionRequestRow[];
    },
  });
}

export function useResolveSubscriptionRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("subscription_requests")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["subscription_requests"] }),
  });
}

/* ------------------------------------------------------------------ */
/* Platform subscription billing -- a tenant org pays the PLATFORM       */
/* owner (via one shared Payme/Click merchant account) to renew its own  */
/* subscription. See the 20261008000000 migration +                      */
/* src/lib/subscription-billing/*.server.ts. Not to be confused with     */
/* the per-lead messaging/payment features elsewhere in this file --     */
/* this is the org itself paying, not one of its own leads.              */
/* ------------------------------------------------------------------ */
export type SubscriptionPaymentProvider = "payme" | "click";

export type SubscriptionPaymentRow = Tables["platform_subscription_payments"]["Row"];

export type BillingStatus = {
  plan: string;
  priceUzs: number;
  extraSeats: number;
  extraSeatPriceUzs: number;
  paymeConnected: boolean;
  clickConnected: boolean;
};

export function useBillingStatus() {
  return useQuery({
    queryKey: ["billing_status"],
    queryFn: async (): Promise<BillingStatus> => {
      const res = await apiFetch("/subscription-payments/status");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load status");
      return json;
    },
  });
}

export function useOrgSubscriptionPayments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org_subscription_payments", user?.organizationId],
    enabled: !!user?.organizationId,
    // Fast only while a payment is under way (its status flips by itself).
    refetchInterval: (q) => (q.state.data?.some((p) => p.status === "pending") ? 5000 : 60_000),
    queryFn: async (): Promise<SubscriptionPaymentRow[]> => {
      const { data, error } = await supabase
        .from("platform_subscription_payments")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateSubscriptionPayment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      provider: SubscriptionPaymentProvider,
    ): Promise<{ id: string; payUrl: string }> => {
      const res = await apiFetch("/subscription-payments/create", {
        method: "POST",
        body: JSON.stringify({ provider }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create the payment link.");
      return json;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org_subscription_payments", user?.organizationId] }),
  });
}

export type PlatformPaymentCredentials = {
  priceStartIqUzs: number;
  priceAnalystIqUzs: number;
  priceMasterIqUzs: number;
  extraSeatPriceUzs: number;
  paymeMerchantId: string;
  paymeSecretKeySet: boolean;
  clickServiceId: string;
  clickMerchantId: string;
  clickSecretKeySet: boolean;
};

export function usePlatformPaymentCredentials() {
  return useQuery({
    queryKey: ["platform_payment_credentials"],
    queryFn: async (): Promise<PlatformPaymentCredentials> => {
      const res = await apiFetch("/platform/payment-credentials");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      return json;
    },
  });
}

export function useSavePlatformPaymentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      priceStartIqUzs?: number | undefined;
      priceAnalystIqUzs?: number | undefined;
      priceMasterIqUzs?: number | undefined;
      extraSeatPriceUzs?: number | undefined;
      paymeMerchantId?: string | undefined;
      paymeSecretKey?: string | undefined;
      clickServiceId?: string | undefined;
      clickMerchantId?: string | undefined;
      clickSecretKey?: string | undefined;
    }) => {
      const res = await apiFetch("/platform/payment-credentials", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform_payment_credentials"] }),
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      admin_email: string;
      admin_password: string;
      admin_full_name: string;
      rop_email: string;
      rop_password: string;
      rop_full_name: string;
      phone?: string | undefined;
      plan?: string | undefined;
      trial_days?: number | undefined;
    }): Promise<{ organizationId: string }> => {
      const res = await apiFetch("/platform/create-organization", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create organization");
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["organizations"] });
      void qc.invalidateQueries({ queryKey: ["company_directory"] });
    },
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<
          OrganizationRow,
          | "name"
          | "phone"
          | "plan"
          | "active"
          | "trial_ends_at"
          | "extra_seats"
          | "is_trial"
          | "crm_enabled"
          | "unlimited_seats"
        >
      >;
    }) => {
      const { error } = await supabase.from("organizations").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["organizations"] }),
  });
}

export function useDeactivateExpiredTrials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiFetch("/platform/deactivate-expired-trials", { method: "POST" });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["organizations"] }),
  });
}

/** Platform owner: delete any company member's account, from any organization. */
export function useDeleteUserAsOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await apiFetch("/platform/delete-user", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete user");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["owner_all_profiles"] }),
  });
}

/** Platform owner: edit any company member's name, role, and/or reset their password. */
export function useUpdateUserAsOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      full_name?: string;
      role?: "super_admin" | "rop" | "sotuv_menejeri" | "amaliyotchi";
      password?: string;
      email?: string;
    }): Promise<void> => {
      const res = await apiFetch("/platform/update-user", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update user");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["owner_all_profiles"] }),
  });
}

/** Platform owner: add a ROP/Sotuv menejeri/Super Admin account to an existing company. */
export function useAddOrgEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      organization_id: string;
      email: string;
      password: string;
      full_name: string;
      role: "super_admin" | "rop" | "sotuv_menejeri" | "amaliyotchi";
    }): Promise<{ id: string }> => {
      const res = await apiFetch("/platform/add-employee", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add employee");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["owner_all_profiles"] }),
  });
}

/** Platform owner: permanently delete a company and every row/account tied to it. */
export function useDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await apiFetch("/platform/delete-organization", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete company");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["organizations"] });
      void qc.invalidateQueries({ queryKey: ["owner_all_profiles"] });
    },
  });
}

// Cross-org visibility for the platform owner only — RLS on each of these
// tables grants read access to is_platform_owner() (see migration
// 20260812130000_owner_panel.sql); every other role's queries stay scoped
// to their own organization_id as before.

export type OwnerProfileRow = ProfileRow & { organizations: { name: string } | null };

export function useAllProfiles() {
  return useQuery({
    queryKey: ["owner_all_profiles"],
    queryFn: async (): Promise<OwnerProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, organizations(name)")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OwnerProfileRow[];
    },
  });
}

export type OwnerAmoConnectionRow = {
  organization_id: string;
  subdomain: string;
  connected_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  organizations: { name: string } | null;
};

export function useAllAmoConnections() {
  return useQuery({
    queryKey: ["owner_all_amo_connections"],
    queryFn: async (): Promise<OwnerAmoConnectionRow[]> => {
      // Deliberately not selecting access_token/refresh_token — the owner
      // overview only needs connection status, never the live OAuth secrets.
      const { data, error } = await supabase
        .from("amocrm_connection")
        .select(
          "organization_id, subdomain, connected_at, last_synced_at, last_sync_error, organizations(name)",
        );
      if (error) throw error;
      return (data ?? []) as OwnerAmoConnectionRow[];
    },
  });
}

/** Platform-owner counterpart to useDisconnectAmoCrm — names the target company explicitly, since the owner has no organizationId of their own to imply one. */
export function usePlatformDisconnectAmoCrm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (organizationId: string): Promise<void> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/platform/amocrm-disconnect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ organizationId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not disconnect.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["owner_all_amo_connections"] });
    },
  });
}

/** Lets the platform owner set a target company's AmoCRM client_id/client_secret before that company has its own super_admin do it. */
export function usePlatformSetAmoCrmCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      organizationId: string;
      clientId: string;
      clientSecret: string;
    }): Promise<void> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/platform/amocrm-credentials", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save credentials.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["owner_all_amo_connections"] });
    },
  });
}

export type OwnerAiAgentRow = Tables["ai_agents"]["Row"] & {
  organizations: { name: string } | null;
};

export function useAllAiAgents() {
  return useQuery({
    queryKey: ["owner_all_ai_agents"],
    queryFn: async (): Promise<OwnerAiAgentRow[]> => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*, organizations(name)")
        .order("organization_id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OwnerAiAgentRow[];
    },
  });
}

export type OwnerAuditLogRow = Tables["audit_logs"]["Row"] & {
  organizations: { name: string } | null;
};

export function useAllAuditLogs() {
  return useQuery({
    queryKey: ["owner_all_audit_logs"],
    queryFn: async (): Promise<OwnerAuditLogRow[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*, organizations(name)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as OwnerAuditLogRow[];
    },
  });
}

export function useAiAssistantChat() {
  return useMutation({
    mutationFn: async (input: {
      messages: { role: "user" | "assistant"; content: string }[];
      asOf?: Date | null;
      // The page the user is on -- the assistant then answers from that
      // page's guide (see ai-assistant.chat.ts).
      page?: string;
      // Asked from a lead card: the chat is about this lead.
      leadId?: string;
      // Called with the whole answer so far as the words arrive.
      onText?: (textSoFar: string) => void;
      // Called when the assistant is looking something up with its tools.
      onWorking?: () => void;
    }): Promise<string> => {
      // The answer streams in (newline-delimited JSON events). fetch() has
      // no timeout of its own, so the request is aborted after 60 s
      // without any new data -- a stalled connection then shows an error
      // instead of an endless "thinking" state.
      const controller = new AbortController();
      let idle = setTimeout(() => controller.abort(), 60_000);
      const touch = () => {
        clearTimeout(idle);
        idle = setTimeout(() => controller.abort(), 60_000);
      };
      try {
        const res = await apiFetch("/ai-assistant/chat", {
          method: "POST",
          body: JSON.stringify({
            messages: input.messages,
            asOf: input.asOf ? input.asOf.toISOString() : null,
            page: input.page ?? null,
            leadId: input.leadId ?? null,
            stream: true,
          }),
          signal: controller.signal,
        });
        const type = res.headers.get("content-type") ?? "";
        if (!type.includes("ndjson") || !res.body) {
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "AI assistant failed");
          return json.reply as string;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          touch();
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            const event = JSON.parse(line) as
              | { t: "delta"; text: string }
              | { t: "status" }
              | { t: "done" }
              | { t: "error"; error: string };
            if (event.t === "delta") {
              text += event.text;
              input.onText?.(text);
            } else if (event.t === "status") {
              input.onWorking?.();
            } else if (event.t === "error") {
              throw new Error(event.error);
            }
          }
        }
        if (!text.trim()) throw new Error("AI assistant failed");
        return text;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error("TIMEOUT");
        }
        throw err;
      } finally {
        clearTimeout(idle);
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/* Platform owner: every company's integrations (overview + actions).   */
/* ------------------------------------------------------------------ */

export type PlatformSyncLog = {
  started_at: string;
  finished_at: string;
  synced_count: number;
  error: string | null;
  skipped: boolean;
  trigger: string;
};

export type PlatformIntegrationsCompany = {
  id: string;
  name: string;
  plan: string;
  active: boolean;
  frozen: boolean;
  amocrm: {
    subdomain: string;
    connected_at: string;
    last_synced_at: string | null;
    last_sync_error: string | null;
    sync_in_progress: boolean;
    token_expires_at: string;
  } | null;
  amocrmLogs: PlatformSyncLog[];
  bitrix24: {
    portal_domain: string;
    connected_at: string;
    last_synced_at: string | null;
    last_sync_error: string | null;
    sync_in_progress: boolean;
  } | null;
  bitrix24Logs: PlatformSyncLog[];
  telephony: {
    provider: string;
    connected_at: string | null;
    last_event_at: string | null;
    pbx_domain: string | null;
    caller_id: string | null;
    hasApiKey: boolean;
    hasApiSecret: boolean;
  }[];
  sms: {
    provider: string;
    email: string;
    sender_name: string | null;
    connected_at: string;
  } | null;
  webhooks: { id: string; name: string; url: string; enabled: boolean; created_at: string }[];
  pauses: { kind: string; pausedAt: string; reason: string | null }[];
};

export function usePlatformIntegrationsOverview() {
  return useQuery({
    queryKey: ["platform_integrations_overview"],
    queryFn: async (): Promise<PlatformIntegrationsCompany[]> => {
      const res = await apiFetch("/platform/integrations/overview");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Integratsiyalarni yuklab bo'lmadi");
      return json.companies;
    },
  });
}

export type PlatformIntegrationAction = {
  organizationId: string;
  kind: "amocrm" | "bitrix24" | "telephony" | "sms" | "webhooks";
  action: "pause" | "resume" | "test" | "sync" | "edit" | "disconnect" | "toggle" | "delete";
  provider?: string | undefined;
  webhookId?: string | undefined;
  enabled?: boolean | undefined;
  reason?: string | undefined;
  fields?: Record<string, string> | undefined;
};

export function usePlatformIntegrationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PlatformIntegrationAction): Promise<Record<string, unknown>> => {
      const res = await apiFetch("/platform/integrations/action", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Amalni bajarib bo'lmadi");
      return json;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform_integrations_overview"] });
      void queryClient.invalidateQueries({ queryKey: ["owner_all_amo_connections"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Platform owner: visits report (sign-in sessions and their timeline). */
/* ------------------------------------------------------------------ */

export type PlatformVisit = {
  id: string;
  kind: string;
  createdAt: string;
  lastSeenAt: string | null;
  device: string | null;
  userAgent: string | null;
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  emailAttempted: string | null;
  online?: boolean;
  revokedAt?: string | null;
  user: { id: string; name: string; email: string; role: string; isIntern: boolean } | null;
  org: {
    id: string;
    name: string;
    plan: string;
    trial: boolean;
    frozen: boolean;
    active: boolean;
  } | null;
  counts?: { pages: number; actions: number; failed: number; blocked: number; alerts?: number };
};

export type PlatformVisitFilters = {
  org: string;
  type: "all" | "trial" | "paid" | "failed";
  days: 1 | 7 | 30;
  q: string;
};

export function usePlatformVisits(filters: PlatformVisitFilters) {
  return useInfiniteQuery({
    queryKey: ["platform_visits", filters],
    initialPageParam: null as string | null,
    queryFn: async ({
      pageParam,
    }): Promise<{ sessions: PlatformVisit[]; nextBefore: string | null }> => {
      const params = new URLSearchParams({
        type: filters.type,
        days: String(filters.days),
        ...(filters.org ? { org: filters.org } : {}),
        ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
        ...(pageParam ? { before: pageParam } : {}),
      });
      const res = await apiFetch(`/platform/visits?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Tashriflarni yuklab bo'lmadi");
      return json;
    },
    getNextPageParam: (last) => last.nextBefore,
  });
}

export type PlatformVisitTimelineItem = {
  at: string;
  kind: "page" | "action" | "failed" | "blocked" | "error" | "change";
  label: string;
  path: string | null;
  meta: Record<string, unknown>;
};

export function usePlatformVisit(id: string) {
  return useQuery({
    queryKey: ["platform_visit", id],
    queryFn: async (): Promise<{
      session: PlatformVisit;
      timeline: PlatformVisitTimelineItem[];
      authSessionKnown?: boolean;
    }> => {
      const res = await apiFetch(`/platform/visits?id=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Tashrifni yuklab bo'lmadi");
      return json;
    },
  });
}
