// amoCRM, Bitrix24, outgoing webhooks, telephony, SMS, email, lead sources, automations, bulk messaging, Telegram, lead files, web forms.
// Split out of src/hooks/use-crm-data.ts, which re-exports everything here.
import { useMemo } from "react";
import type { AutomationAction } from "@/lib/automation-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  getTelephonyProviderMeta,
  TELEPHONY_PROVIDERS,
  type TelephonyFieldKey,
  type TelephonyProvider,
} from "@/lib/telephony/provider-meta";
import {
  automationRulesResource,
  leadCustomFieldDefsResource,
  leadFieldGroupsResource,
  leadSourcesResource,
  webFormsResource,
} from "./core";
import type { Tables } from "./core";

/* ------------------------------------------------------------------ */
/* AmoCRM integration — status readout + manual sync trigger.          */
/* ------------------------------------------------------------------ */

export type IntegrationSettingRow = Database["public"]["Tables"]["integration_settings"]["Row"];

export function useIntegrationSetting(key: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["integration_settings", key, user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<IntegrationSettingRow | null> => {
      const { data, error } = await supabase
        .from("integration_settings")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Builds a deep link to a lead's record in the connected AmoCRM account, or null if not connected/synced. */
export function useAmoCrmLink() {
  const { data: setting } = useIntegrationSetting("amocrm");
  const subdomain = (setting?.config as { subdomain?: string } | null)?.subdomain;
  return (amocrmId: number | null): string | null => {
    if (!subdomain || !amocrmId) return null;
    return `https://${subdomain}/leads/detail/${amocrmId}`;
  };
}

export type AmoConnectionStatus = {
  subdomain: string;
  connected_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  // Set while the initial full historical backfill is still in progress
  // (paused by its per-run time budget, resuming on the next 5-minute
  // cron tick) -- null once that backfill has fully completed.
  initial_sync_page: number | null;
  active_funnel_ignore_missing: boolean;
  sync_in_progress: boolean;
  sync_started_at: string | null;
};

/** The connected org's own AmoCRM sync status/error — super_admin only (RLS). Polls every 3s so the Integrations page reflects a sync as it happens, without a manual refresh. */
export function useAmoConnectionStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["amocrm_connection_status", user?.organizationId],
    enabled:
      !!user?.organizationId && (user.role === "super_admin" || user.role === "platform_owner"),
    // Was 3s -- a continuous query every 3 seconds for as long as this page
    // stays open is unnecessarily aggressive for a status field that only
    // changes once every few minutes (a sync run, a connect/disconnect).
    refetchInterval: 15_000,
    queryFn: async (): Promise<AmoConnectionStatus | null> => {
      const { data, error } = await supabase
        .from("amocrm_connection")
        .select(
          "subdomain, connected_at, last_synced_at, last_sync_error, initial_sync_page, active_funnel_ignore_missing, sync_in_progress, sync_started_at",
        )
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type AmoSyncLogRow = Tables["amocrm_sync_log"]["Row"];

/** The connected org's own recent sync runs (manual + cron), newest first — for the Integrations page's sync-history panel. */
export function useAmoSyncLog(limit = 10) {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["amocrm_sync_log", user?.organizationId, limit],
    enabled: !!user?.organizationId && isAdmin,
    refetchInterval: 15_000,
    queryFn: async (): Promise<AmoSyncLogRow[]> => {
      const { data, error } = await supabase
        .from("amocrm_sync_log")
        .select("*")
        .order("finished_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Total AmoCRM-sourced call recordings imported for the current org so far. */
export function useAmoCallsCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["amocrm_calls_count", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("amocrm_calls")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Calls with a real AI analysis attached -- the ones actually usable as calibration/training material ("Yaroqli qo'ng'iroqlar"), as opposed to every imported call regardless of whether it ever got analyzed. */
export function useAnalyzedCallsCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["amocrm_calls_analyzed_count", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("amocrm_calls")
        .select("id", { count: "exact", head: true })
        .not("analyzed_at", "is", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useTriggerAmoCrmSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ synced: number; error?: string }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/amocrm/sync", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const text = await res.text();
      let json: { synced: number; error?: string };
      try {
        json = JSON.parse(text);
      } catch {
        // Platform-level failure (timeout, crash) returned a non-JSON body
        // — surface the raw text rather than letting JSON.parse's own
        // error ("Unexpected token ... is not valid JSON") stand in for it.
        throw new Error(text || `Sync failed (${res.status})`);
      }
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      return json;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["amocrm_calls"] });
      void qc.invalidateQueries({ queryKey: ["integration_settings", "amocrm"] });
      void qc.invalidateQueries({ queryKey: ["amocrm_connection_status"] });
    },
  });
}

/** Refreshes AmoCRM manager -> employee mapping on its own, without a full lead sync. */
export function useRefreshAmoManagers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ mapped: number }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/amocrm/sync-users", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to refresh managers");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

// Per-organization progress on the "connect AmoCRM" onboarding checklist
// (integrations.amocrm-checklist.tsx) -- stored as a {itemKey: true} map so
// toggling one item never needs to read or overwrite the rest.
export function useAmoOnboardingChecklist() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["amocrm_onboarding_checklist", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await supabase
        .from("amocrm_onboarding_checklist")
        .select("checked")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.checked as Record<string, boolean> | null) ?? {};
    },
  });
}

export function useToggleAmoOnboardingChecklistItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      itemKey,
      checked,
    }: {
      itemKey: string;
      checked: boolean;
    }): Promise<Record<string, boolean>> => {
      const orgId = user!.organizationId!;
      const current =
        qc.getQueryData<Record<string, boolean>>(["amocrm_onboarding_checklist", orgId]) ?? {};
      const next = { ...current, [itemKey]: checked };
      const { error } = await supabase
        .from("amocrm_onboarding_checklist")
        .upsert(
          { organization_id: orgId, checked: next, updated_by: user!.id },
          { onConflict: "organization_id" },
        );
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      qc.setQueryData(["amocrm_onboarding_checklist", user?.organizationId], next);
    },
  });
}

export function useDisconnectAmoCrm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/admin/amocrm-disconnect", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not disconnect.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["integration_settings", "amocrm"] });
      void qc.invalidateQueries({ queryKey: ["amocrm_connection_status"] });
      void qc.invalidateQueries({ queryKey: ["amocrm_catalog"] });
    },
  });
}

/** "Ulanishni tekshirish" -- pings AmoCRM's own API with the stored token, without running a sync. */
export function useTestAmoConnection() {
  return useMutation({
    mutationFn: async (): Promise<{ ok: true; subdomain: string; accountName: string | null }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/amocrm/test-connection", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Connection test failed.");
      return json;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Bitrix24 integration -- continuous sync via a pasted-in webhook URL, */
/* the same "status readout + manual sync trigger" shape as AmoCRM     */
/* above but without OAuth (see src/lib/bitrix24/client.server.ts).    */
/* ------------------------------------------------------------------ */

export type Bitrix24ConnectionStatus = {
  portal_domain: string;
  connected_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  sync_in_progress: boolean;
  sync_started_at: string | null;
  events_registered: boolean;
};

/** The connected org's own Bitrix24 sync status/error — super_admin only (RLS). Polls every 15s. */
export function useBitrix24ConnectionStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["bitrix24_connection_status", user?.organizationId],
    enabled:
      !!user?.organizationId && (user.role === "super_admin" || user.role === "platform_owner"),
    refetchInterval: 15_000,
    queryFn: async (): Promise<Bitrix24ConnectionStatus | null> => {
      const { data, error } = await supabase
        .from("bitrix24_connection")
        .select(
          "portal_domain, connected_at, last_synced_at, last_sync_error, sync_in_progress, sync_started_at, events_registered",
        )
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type Bitrix24SyncLogRow = Tables["bitrix24_sync_log"]["Row"];

/** The connected org's own recent Bitrix24 sync runs (manual + cron), newest first. */
export function useBitrix24SyncLog(limit = 10) {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["bitrix24_sync_log", user?.organizationId, limit],
    enabled: !!user?.organizationId && isAdmin,
    refetchInterval: 15_000,
    queryFn: async (): Promise<Bitrix24SyncLogRow[]> => {
      const { data, error } = await supabase
        .from("bitrix24_sync_log")
        .select("*")
        .order("finished_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Pastes in the org's Bitrix24 inbound-webhook URL -- validated server-side against the real API before it's saved. */
export function useConnectBitrix24() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (webhookUrl: string): Promise<{ ok: true; portalDomain: string }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/bitrix24/connect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ webhookUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not connect to Bitrix24.");
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bitrix24_connection_status"] });
    },
  });
}

export function useDisconnectBitrix24() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/bitrix24/disconnect", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not disconnect.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bitrix24_connection_status"] });
    },
  });
}

export function useTriggerBitrix24Sync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ synced: number; error?: string }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/bitrix24/sync", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const text = await res.text();
      let json: { synced: number; error?: string };
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(text || `Sync failed (${res.status})`);
      }
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      return json;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["bitrix24_connection_status"] });
      void qc.invalidateQueries({ queryKey: ["bitrix24_sync_log"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Outgoing webhooks -- "Tashqi webhooklar" card on the Chiquvchi       */
/* integratsiyalar tab. Multiple destination URLs per org, each        */
/* subscribed to a subset of real platform events, with a delivery log. */
/* ------------------------------------------------------------------ */

export type OutgoingWebhookEvent = "call_created" | "recording_ready" | "ai_analysis_done";

// Named *WebhookDestination*, not *OutgoingWebhook* -- that name is already
// taken by the single-webhook-per-org hooks below (useOutgoingWebhook /
// useSaveOutgoingWebhook), which back a different, older feature.
export type WebhookDestination = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  events: OutgoingWebhookEvent[];
  headers: Record<string, string>;
  createdAt: string;
};

export function useWebhookDestinations() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["webhook_destinations", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<WebhookDestination[]> => {
      const res = await apiFetch("/integrations/webhook-destinations");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load destinations.");
      return json.webhooks;
    },
  });
}

export function useCreateWebhookDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      url: string;
      enabled: boolean;
      events: OutgoingWebhookEvent[];
      headers: Record<string, string>;
    }): Promise<void> => {
      const res = await apiFetch("/integrations/webhook-destinations", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save destination.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["webhook_destinations"] }),
  });
}

export function useToggleWebhookDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; enabled: boolean }): Promise<void> => {
      const res = await apiFetch("/integrations/webhook-destinations", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not update destination.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["webhook_destinations"] }),
  });
}

export function useDeleteWebhookDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await apiFetch(
        `/integrations/webhook-destinations?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not delete destination.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["webhook_destinations"] }),
  });
}

export type WebhookDestinationDelivery = {
  id: string;
  event: string;
  status: "sent" | "failed";
  responseCode: number | null;
  error: string | null;
  createdAt: string;
};

export function useWebhookDestinationHistory() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["webhook_destination_history", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    refetchInterval: 15_000,
    queryFn: async (): Promise<WebhookDestinationDelivery[]> => {
      const res = await apiFetch("/integrations/webhook-destinations/history");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load history.");
      return json.deliveries;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Telephony (OnlinePBX) -- module 5, for orgs running SalesIQ as their */
/* primary CRM instead of (or alongside) AmoCRM.                       */
/* ------------------------------------------------------------------ */

export type { TelephonyFieldKey, TelephonyProvider };

export { TELEPHONY_PROVIDERS, getTelephonyProviderMeta };

export type TelephonyExtensionLink = { code: string; profileId: string };

export type TelephonyCredentialsStatus = {
  provider: TelephonyProvider;
  connected: boolean;
  apiKeySet: boolean;
  apiSecretSet: boolean;
  pbxDomain: string | null;
  callerId: string | null;
  smsSenderName: string | null;
  connectedAt: string | null;
  lastEventAt: string | null;
  extensionLinks: TelephonyExtensionLink[];
};

export type TelephonyStatusMap = Partial<Record<TelephonyProvider, TelephonyCredentialsStatus>>;

/** Every configured integration for this org -- a provider missing from the map just hasn't been set up yet (its card shows "O'chirilgan"/"Sozlanmagan"). */
export function useTelephonyStatus() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["telephony_status", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<TelephonyStatusMap> => {
      const res = await apiFetch("/integrations/telephony/credentials");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load status.");
      return json;
    },
  });
}

export function useSaveTelephonyCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      provider: TelephonyProvider;
      apiKey: string;
      apiSecret: string;
      pbxDomain: string;
      callerId: string;
      smsSenderName: string;
    }): Promise<void> => {
      const res = await apiFetch("/integrations/telephony/credentials", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telephony_status"] }),
  });
}

export function useSaveTelephonyExtensionLinks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      provider: TelephonyProvider;
      extensionLinks: TelephonyExtensionLink[];
    }): Promise<void> => {
      const res = await apiFetch("/integrations/telephony/credentials", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telephony_status"] }),
  });
}

export function useDisconnectTelephony() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (provider: TelephonyProvider): Promise<void> => {
      const res = await apiFetch(
        `/integrations/telephony/credentials?provider=${encodeURIComponent(provider)}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not disconnect.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telephony_status"] }),
  });
}

export function useTestTelephonyConnection() {
  return useMutation({
    mutationFn: async (
      provider: TelephonyProvider,
    ): Promise<{ ok: true; pbxDomain: string | null }> => {
      const res = await apiFetch("/integrations/telephony/test-connection", {
        method: "POST",
        body: JSON.stringify({ provider }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Connection test failed.");
      return json;
    },
  });
}

export function useTestApiPullHealth() {
  return useMutation({
    mutationFn: async (): Promise<{ ok: true; status: number }> => {
      const res = await apiFetch("/integrations/telephony/api-pull", {
        method: "POST",
        body: JSON.stringify({ action: "test" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Test muvaffaqiyatsiz.");
      return json;
    },
  });
}

export function useRefreshApiPullManagers() {
  return useMutation({
    mutationFn: async (): Promise<{ count: number }> => {
      const res = await apiFetch("/integrations/telephony/api-pull", {
        method: "POST",
        body: JSON.stringify({ action: "managers" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Menejerlarni yangilab bo'lmadi.");
      return json;
    },
  });
}

export function useUnlinkManagerTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profileId: string): Promise<void> => {
      const res = await apiFetch("/telegram/unlink-manager", {
        method: "POST",
        body: JSON.stringify({ profileId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not unlink.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

/* ------------------------------------------------------------------ */
/* Real SMS sending via a dedicated provider (Eskiz.uz) -- independent   */
/* of the telephony/call providers above: an org can be on OnlinePBX or  */
/* Sipuni for calls and still want SMS sent through Eskiz specifically.  */
/* ------------------------------------------------------------------ */

export type SmsCredentialsStatus = {
  connected: boolean;
  email: string | null;
  senderName: string | null;
  connectedAt: string | null;
};

export function useSmsStatus() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["sms_status", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<SmsCredentialsStatus> => {
      const res = await apiFetch("/integrations/sms/credentials");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load status.");
      return json;
    },
  });
}

export function useSaveSmsCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      senderName: string;
    }): Promise<void> => {
      const res = await apiFetch("/integrations/sms/credentials", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sms_status"] }),
  });
}

export function useDisconnectSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await apiFetch("/integrations/sms/credentials", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not disconnect.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sms_status"] }),
  });
}

export function useTestSmsConnection() {
  return useMutation({
    mutationFn: async (): Promise<{ ok: true; balance: number | null }> => {
      const res = await apiFetch("/integrations/sms/test-connection", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Connection test failed.");
      return json;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Real email sending per lead, via each org's own SMTP credentials.    */
/* Same shape as the telephony module just above.                       */
/* ------------------------------------------------------------------ */

export type SmtpCredentialsStatus = {
  connected: boolean;
  host: string | null;
  port: number | null;
  fromEmail: string | null;
  fromName: string | null;
  connectedAt: string | null;
};

export function useSmtpStatus() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["smtp_status", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<SmtpCredentialsStatus> => {
      const res = await apiFetch("/integrations/email/credentials");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load status.");
      return json;
    },
  });
}

export function useSaveSmtpCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      host: string;
      port: number;
      username: string;
      password: string;
      fromEmail: string;
      fromName: string;
    }): Promise<void> => {
      const res = await apiFetch("/integrations/email/credentials", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["smtp_status"] }),
  });
}

export function useDisconnectSmtp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await apiFetch("/integrations/email/credentials", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not disconnect.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["smtp_status"] }),
  });
}

export type LeadEmailRow = Tables["lead_emails"]["Row"];

export function useLeadEmails(leadId: string | undefined, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["lead_emails", leadId],
    enabled: !!leadId && (opts?.enabled ?? true),
    queryFn: async (): Promise<LeadEmailRow[]> => {
      const { data, error } = await supabase
        .from("lead_emails")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSendLeadEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leadId: string; to: string; subject: string; body: string }) => {
      const res = await apiFetch("/integrations/email/send", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send the email");
      return json;
    },
    onSuccess: (_data, { leadId }) =>
      void qc.invalidateQueries({ queryKey: ["lead_emails", leadId] }),
  });
}

export function useStartCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      toNumber: string;
      leadId?: string;
      contactId?: string;
    }): Promise<{ id: string }> => {
      const res = await apiFetch("/integrations/telephony/call", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Qo'ng'iroq qilib bo'lmadi.");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pbx_calls"] }),
  });
}

export function useSendTelephonySms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      toNumber: string;
      message: string;
      leadId?: string;
      contactId?: string;
    }): Promise<{ id: string }> => {
      const res = await apiFetch("/integrations/telephony/sms", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "SMS yuborib bo'lmadi.");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sms_log"] }),
  });
}

export type MissedCallSummary = {
  missed: number;
  calledBack: number;
  calledBack15m: number;
  avgCallbackSeconds: number | null;
};

/** Missed incoming calls over the last `days` days (missed_call_stats view, 20261105000000). Null until that migration runs. */
export function useMissedCallSummary(days = 7) {
  return useQuery({
    queryKey: ["pbx_calls", "missed_summary", days],
    queryFn: async (): Promise<MissedCallSummary | null> => {
      const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("missed_call_stats")
        .select("missed, called_back, called_back_15m, avg_callback_seconds")
        .gte("day", since);
      if (error) return null;
      const rows = data ?? [];
      const sum = (k: "missed" | "called_back" | "called_back_15m") =>
        rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
      const calledBack = sum("called_back");
      const weighted = rows.reduce(
        (a, r) => a + (Number(r.avg_callback_seconds) || 0) * (Number(r.called_back) || 0),
        0,
      );
      return {
        missed: sum("missed"),
        calledBack,
        calledBack15m: sum("called_back_15m"),
        avgCallbackSeconds: calledBack > 0 ? Math.round(weighted / calledBack) : null,
      };
    },
  });
}

export type PbxCallRow = Tables["pbx_calls"]["Row"];

/** A single lead/contact's own click-to-call history -- for the call timeline on its detail page. */
export function usePbxCalls(input: { leadId?: string; contactId?: string } | undefined) {
  return useQuery({
    queryKey: ["pbx_calls", input?.leadId, input?.contactId],
    enabled: !!(input?.leadId || input?.contactId),
    queryFn: async (): Promise<PbxCallRow[]> => {
      let query = supabase.from("pbx_calls").select("*").order("created_at", { ascending: false });
      query = input?.leadId
        ? query.eq("lead_id", input.leadId)
        : query.eq("contact_id", input!.contactId!);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type CallOutcome = "answered" | "missed" | "noAnswer" | "ringing" | "failed";

export type CallHistoryItem = {
  id: string;
  at: string;
  direction: "incoming" | "outgoing";
  name: string;
  phone: string;
  durationSeconds: number;
  outcome: CallOutcome;
  leadId: string | null;
  contactId: string | null;
  recordingUrl: string | null;
  /** Why the PBX refused the call ("Ulanmadi"), when it did. */
  error: string | null;
};

/**
 * The phone widget's call history: the last month of calls through the
 * platform's own telephony (pbx_calls) -- clicked here, dialled from a desk
 * phone, incoming, missed -- newest first. RLS decides whose calls show.
 */
export function useCallHistory(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["call_history", user?.organizationId],
    enabled: enabled && !!user?.organizationId,
    refetchInterval: enabled ? 15_000 : false,
    queryFn: async (): Promise<CallHistoryItem[]> => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("pbx_calls")
        .select(
          "id, created_at, direction, from_number, to_number, status, duration_seconds, recording_url, error, lead_id, contact_id, lead:leads(id, name), contact:contacts(full_name)",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((c) => {
        const lead = c.lead as { id: string; name: string } | null;
        const contact = c.contact as { full_name: string } | null;
        const incoming = c.direction === "incoming";
        const outcome: CallOutcome =
          c.status === "answered" || (c.status === "completed" && c.duration_seconds > 0)
            ? "answered"
            : c.status === "initiated" || c.status === "ringing"
              ? "ringing"
              : c.status === "failed"
                ? "failed"
                : incoming
                  ? "missed"
                  : "noAnswer";
        const phone = (incoming ? c.from_number : c.to_number) ?? "";
        return {
          id: c.id,
          at: c.created_at,
          direction: incoming ? "incoming" : "outgoing",
          name: contact?.full_name || lead?.name || "",
          phone: phone === "-" ? "" : phone,
          durationSeconds: c.duration_seconds,
          outcome,
          leadId: c.lead_id,
          contactId: c.contact_id,
          recordingUrl: c.recording_url,
          error: c.error,
        };
      });
    },
  });
}

/** Pulls the PBX's own call history in (throttled server-side); never throws. */
export function useSyncPbxHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { force?: boolean; hours?: number } = {}) => {
      const res = await apiFetch("/integrations/telephony/sync-history", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return (await res.json().catch(() => ({}))) as {
        synced?: number;
        skipped?: boolean;
        error?: string;
      };
    },
    onSuccess: (r) => {
      if (r.synced) {
        void qc.invalidateQueries({ queryKey: ["call_history"] });
        void qc.invalidateQueries({ queryKey: ["call_stats"] });
      }
    },
  });
}

type CallCounts = {
  attempts: number;
  outgoing: number;
  incoming: number;
  people: number;
  answered: number;
  talked: number;
  missed: number;
  failed: number;
  talk_seconds: number;
  missed_seconds: number;
};

export type CallStats = {
  totals: CallCounts & { missed_incoming: number; missed_estimated: number };
  reps: (CallCounts & { profile_id: string | null })[];
  hours: { hour: number; attempts: number; answered: number }[];
  weekdays: { day: number; attempts: number; answered: number }[];
  days: { day: string; attempts: number; answered: number; talk_seconds: number }[];
};

/** A call that lasted at least this long counts as a real conversation. */
export const CALL_TALK_SECONDS = 30;

/** Ringing time assumed for an unanswered call whose PBX didn't report one. */
export const CALL_RING_GUESS_SECONDS = 30;

/**
 * The phone widget's call analytics: totals, every salesperson's numbers
 * (everyone sees the whole team), and when clients pick up -- computed in
 * the call_stats RPC (migration 20261025000000).
 */
export function useCallStats(input: {
  from: Date;
  to: Date;
  profileIds: string[];
  direction: "incoming" | "outgoing" | null;
}) {
  const { user } = useAuth();
  const fromIso = input.from.toISOString();
  const toIso = input.to.toISOString();
  return useQuery({
    queryKey: [
      "call_stats",
      user?.organizationId,
      fromIso,
      toIso,
      input.profileIds.join(","),
      input.direction,
    ],
    enabled: !!user?.organizationId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<CallStats> => {
      const { data, error } = await supabase.rpc("call_stats", {
        p_from: fromIso,
        p_to: toIso,
        p_profiles: input.profileIds.length ? input.profileIds : null,
        p_direction: input.direction,
        p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tashkent",
        p_talk_seconds: CALL_TALK_SECONDS,
        p_ring_guess: CALL_RING_GUESS_SECONDS,
      });
      if (error) throw error;
      return data as unknown as CallStats;
    },
  });
}

/** One click-to-call while it's live -- polled until the PBX reports how it ended. */
export function usePbxCall(id: string | null) {
  return useQuery({
    queryKey: ["pbx_calls", "live", id],
    enabled: !!id,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status && ["completed", "failed", "no_answer"].includes(status) ? false : 2000;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pbx_calls")
        .select("id, status, duration_seconds, created_at, updated_at")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lead sources (webhook ingestion) -- module 6, for orgs capturing      */
/* leads directly into SalesIQ instead of (or alongside) AmoCRM.        */
/* ------------------------------------------------------------------ */

export type LeadSourceRow = Tables["lead_sources"]["Row"];

export const useLeadSources = leadSourcesResource.useList;

export const useCreateLeadSource = leadSourcesResource.useCreate;

export const useUpdateLeadSource = leadSourcesResource.useUpdate;

export const useDeleteLeadSource = leadSourcesResource.useRemove;

export type LeadCustomFieldDefRow = Tables["lead_custom_field_defs"]["Row"];

// Ordered "positions" managed from the lead card's "Sozlamalar" tab: readable by every org
// member (rendered on every rep's lead workspace), writable by admins/managers only.
export const useLeadCustomFieldDefs = (
  opts?: Parameters<typeof leadCustomFieldDefsResource.useList>[0],
) => leadCustomFieldDefsResource.useList({ orderBy: "position", ascending: true, ...opts });

export const useCreateLeadCustomFieldDef = leadCustomFieldDefsResource.useCreate;

export const useUpdateLeadCustomFieldDef = leadCustomFieldDefsResource.useUpdate;

export const useDeleteLeadCustomFieldDef = leadCustomFieldDefsResource.useRemove;

// Named groups of lead fields (amoCRM's field-group tabs): each is a card
// of its own on the lead. Deleting one leaves its fields ungrouped.
export type LeadFieldGroupRow = Tables["lead_field_groups"]["Row"];

export const useLeadFieldGroups = (opts?: Parameters<typeof leadFieldGroupsResource.useList>[0]) =>
  leadFieldGroupsResource.useList({ orderBy: "position", ascending: true, ...opts });

export const useCreateLeadFieldGroup = leadFieldGroupsResource.useCreate;

export const useUpdateLeadFieldGroup = leadFieldGroupsResource.useUpdate;

export const useDeleteLeadFieldGroup = leadFieldGroupsResource.useRemove;

/* ------------------------------------------------------------------ */
/* Automation / workflow builder — rules that fire when a lead enters a */
/* pipeline stage. Execution itself lives in a DB trigger (see the      */
/* 20260927000000 migration) so it fires for every path that can change */
/* a lead's stage_id, not just the app code that happens to call these  */
/* hooks; this file only manages the rule definitions + reads the log.  */
/* ------------------------------------------------------------------ */

export type { AutomationAction };

export type AutomationRuleRow = Omit<Tables["automation_rules"]["Row"], "actions"> & {
  actions: AutomationAction[];
};

export function useAutomationRules(opts?: Parameters<typeof automationRulesResource.useList>[0]) {
  const query = automationRulesResource.useList({ orderBy: "created_at", ...opts });
  return {
    ...query,
    data: query.data?.map((r) => ({ ...r, actions: (r.actions as AutomationAction[]) ?? [] })),
  };
}

/* ------------------------------------------------------------------ */
/* Bulk messaging -- one message to many selected leads at once, over    */
/* whichever channel is connected (SMS/Eskiz, Telegram,                  */
/* SMTP email). See bulk-message.server.ts.                             */
/* ------------------------------------------------------------------ */

export type BulkMessageChannel = "sms" | "telegram" | "email";

/** A bulk message file: small ones inline, big ones uploaded first (uploadBulkFile). */
export type BulkFileInput =
  { name: string; type: string; base64: string } | { name: string; type: string; path: string };

/** Uploads one big attachment straight to Storage; returns its path for the send. */
export async function uploadBulkFile(file: File): Promise<string> {
  const res = await apiFetch("/bulk-message/upload", {
    method: "POST",
    body: JSON.stringify({ action: "sign", name: file.name, size: file.size }),
  });
  const json = (await res.json()) as { path?: string; token?: string; error?: string };
  if (!res.ok || !json.path || !json.token) throw new Error(json.error ?? "Upload failed");
  const { error } = await supabase.storage
    .from("lead-files")
    .uploadToSignedUrl(json.path, json.token, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (error) throw error;
  return json.path;
}

/** Clears a finished send's uploaded attachments. */
export async function removeBulkFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await apiFetch("/bulk-message/upload", {
    method: "POST",
    body: JSON.stringify({ action: "remove", paths }),
  }).catch(() => {});
}

export function useSendBulkMessage() {
  return useMutation({
    mutationFn: async (input: {
      leadIds: string[];
      channel: BulkMessageChannel;
      text: string;
      subject?: string;
      file?: { name: string; type: string; base64: string };
      files?: BulkFileInput[];
    }): Promise<{
      sent: number;
      failed: number;
      results?: { leadId: string; ok: boolean; skippedReason?: string }[];
    }> => {
      const res = await apiFetch("/bulk-message/send", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send");
      return json;
    },
  });
}

export type AutomationConditionOperator = "eq" | "neq" | "contains" | "gt" | "lt";

export function useCreateAutomationRule() {
  const create = automationRulesResource.useCreate();
  return {
    ...create,
    mutateAsync: (input: {
      organizationId: string;
      name: string;
      funnel: string | null;
      triggerStageId: string;
      actions: AutomationAction[];
      createdBy: string;
      conditionField?: string | null;
      conditionOperator?: AutomationConditionOperator | null;
      conditionValue?: string | null;
      delayMinutes?: number;
    }) =>
      create.mutateAsync({
        organization_id: input.organizationId,
        name: input.name,
        funnel: input.funnel,
        trigger_stage_id: input.triggerStageId,
        actions: input.actions as unknown as Json,
        created_by: input.createdBy,
        condition_field: input.conditionField || null,
        condition_operator: input.conditionOperator || null,
        condition_value: input.conditionValue || null,
        delay_minutes: input.delayMinutes ?? 0,
      }),
  };
}

export function useUpdateAutomationRule() {
  const update = automationRulesResource.useUpdate();
  return {
    ...update,
    mutateAsync: (input: {
      id: string;
      patch: Partial<{
        name: string;
        funnel: string | null;
        triggerStageId: string;
        actions: AutomationAction[];
        enabled: boolean;
      }>;
    }) =>
      update.mutateAsync({
        id: input.id,
        patch: {
          ...(input.patch.name !== undefined ? { name: input.patch.name } : {}),
          ...(input.patch.funnel !== undefined ? { funnel: input.patch.funnel } : {}),
          ...(input.patch.triggerStageId !== undefined
            ? { trigger_stage_id: input.patch.triggerStageId }
            : {}),
          ...(input.patch.actions !== undefined
            ? { actions: input.patch.actions as unknown as Json }
            : {}),
          ...(input.patch.enabled !== undefined ? { enabled: input.patch.enabled } : {}),
        },
      }),
  };
}

export const useDeleteAutomationRule = automationRulesResource.useRemove;

/* ------------------------------------------------------------------ */
/* Real Telegram messaging per lead -- built on the platform's existing */
/* shared bot. See the 20260928000000 migration + telegram.webhook.ts.  */
/* ------------------------------------------------------------------ */

export type LeadTelegramLinkRow = Tables["lead_telegram_links"]["Row"];

export type LeadTelegramMessageRow = Tables["lead_telegram_messages"]["Row"];

export function useLeadTelegramLink(
  leadId: string | undefined,
  opts?: { enabled?: boolean; poll?: boolean },
) {
  return useQuery({
    queryKey: ["lead_telegram_link", leadId],
    enabled: !!leadId && (opts?.enabled ?? true),
    refetchInterval: opts?.enabled === false || opts?.poll === false ? false : 4000,
    queryFn: async (): Promise<LeadTelegramLinkRow | null> => {
      const { data, error } = await supabase
        .from("lead_telegram_links")
        .select("*")
        .eq("lead_id", leadId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useLeadTelegramMessages(leadId: string | undefined, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["lead_telegram_messages", leadId],
    enabled: !!leadId && (opts?.enabled ?? true),
    // A client's message shows in the chat within ~1.5 s (only while the
    // tab is visible -- React Query pauses polling in the background).
    refetchInterval: opts?.enabled === false ? false : 1500,
    queryFn: async (): Promise<LeadTelegramMessageRow[]> => {
      const { data, error } = await supabase
        .from("lead_telegram_messages")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type BoardLastMessage = {
  direction: string;
  text: string;
  fileKind: string | null;
  fileName: string | null;
  at: string;
};

/**
 * For the funnel board: each lead's latest chat message, which leads'
 * clients have a Telegram photo, and the leads' short numbers. Empty until migration 20261126000000 has
 * run (the function is missing then).
 */
export function useBoardChatInfo(leadIds: string[]) {
  const key = useMemo(() => [...leadIds].sort().join(","), [leadIds]);
  return useQuery({
    queryKey: ["board_chat_info", key],
    enabled: leadIds.length > 0,
    refetchInterval: 15_000,
    staleTime: 10_000,
    queryFn: async () => {
      const last = new Map<string, BoardLastMessage>();
      const photos = new Set<string>();
      const numbers = new Map<string, number>();
      for (let i = 0; i < leadIds.length; i += 300) {
        const ids = leadIds.slice(i, i + 300);
        const [msgs, links, igLinks, nums] = await Promise.all([
          supabase.rpc("lead_last_messages", { p_lead_ids: ids }),
          supabase
            .from("lead_telegram_links")
            .select("lead_id, photo_file_id")
            .in("lead_id", ids)
            .not("photo_file_id", "is", null),
          // Instagram clients' photos (table from migration 20261130000000).
          supabase
            .from("lead_instagram_links")
            .select("lead_id")
            .in("lead_id", ids)
            .not("photo_url", "is", null),
          // lead_number arrives with migration 20261127000000.
          supabase.from("leads").select("id, lead_number").in("id", ids),
        ]);
        for (const n of (nums.data ?? []) as { id: string; lead_number: number | null }[]) {
          if (n.lead_number) numbers.set(n.id, n.lead_number);
        }
        for (const m of msgs.data ?? []) {
          last.set(m.lead_id, {
            direction: m.direction,
            text: m.text,
            fileKind: m.file_kind,
            fileName: m.file_name,
            at: m.created_at,
          });
        }
        for (const l of links.data ?? []) photos.add(l.lead_id);
        for (const l of igLinks.data ?? []) photos.add(l.lead_id);
      }
      return { last, photos, numbers };
    },
  });
}

/**
 * A blob URL for a server-streamed file (a chat file, a client's photo),
 * fetched with the session's token and kept for the session. null while
 * loading or when there is no file (404).
 */
function useAuthedBlobUrl(key: unknown[], path: string | null) {
  return useQuery({
    queryKey: key,
    enabled: !!path,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
    queryFn: async (): Promise<string | null> => {
      const res = await apiFetch(path!);
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    },
  });
}

/** The file of one lead chat message (photo, voice, document, ...). */
export function useChatFileUrl(messageId: string, enabled = true) {
  return useAuthedBlobUrl(
    ["chat_file", messageId],
    enabled ? `/telegram/lead-file?messageId=${encodeURIComponent(messageId)}` : null,
  );
}

/** The client's Telegram profile photo, when the chat link has one. */
export function useLeadAvatarUrl(leadId: string, enabled = true) {
  return useAuthedBlobUrl(
    ["lead_avatar", leadId],
    enabled ? `/telegram/lead-avatar?leadId=${encodeURIComponent(leadId)}` : null,
  );
}

/** Puts (or with null, takes off) the team's reaction on a client's message. */
export function useReactToChatMessage(leadId: string) {
  const qc = useQueryClient();
  const key = ["lead_telegram_messages", leadId];
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string | null }) => {
      const res = await apiFetch("/telegram/react", {
        method: "POST",
        body: JSON.stringify({ messageId, emoji }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to react");
    },
    onMutate: async ({ messageId, emoji }) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<LeadTelegramMessageRow[]>(key);
      qc.setQueryData<LeadTelegramMessageRow[]>(key, (rows) =>
        rows?.map((r) => (r.id === messageId ? { ...r, reaction: emoji } : r)),
      );
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(key, ctx.before);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

export function useGenerateLeadTelegramLinkCode() {
  return useMutation({
    mutationFn: async (
      leadId: string,
    ): Promise<{ code: string; botUsername: string | null; expiresAt: string }> => {
      const res = await apiFetch("/telegram/link-lead", {
        method: "POST",
        body: JSON.stringify({ leadId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate a link code");
      return json;
    },
  });
}

export function useUnlinkLeadTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase.from("lead_telegram_links").delete().eq("lead_id", leadId);
      if (error) throw error;
    },
    onSuccess: (_data, leadId) =>
      void qc.invalidateQueries({ queryKey: ["lead_telegram_link", leadId] }),
  });
}

export function useSendLeadTelegramMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      text,
      files,
    }: {
      leadId: string;
      text: string;
      files?: BulkFileInput[];
    }) => {
      const res = await apiFetch("/telegram/send-lead-message", {
        method: "POST",
        body: JSON.stringify({ leadId, text, ...(files?.length ? { files } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send the message");
      return json;
    },
    onSuccess: (_data, { leadId }) =>
      void qc.invalidateQueries({ queryKey: ["lead_telegram_messages", leadId] }),
  });
}

/* ------------------------------------------------------------------ */
/* Instagram Direct (src/lib/instagram/). The company's connection is    */
/* read through the server (the token never reaches the browser); a     */
/* lead's Instagram chat shares lead_telegram_messages, channel =        */
/* "instagram".                                                          */
/* ------------------------------------------------------------------ */

export type InstagramAccountInfo = {
  configured: boolean;
  ready: boolean;
  account: {
    username: string | null;
    name: string | null;
    picture_url: string | null;
    connected_at: string;
    last_event_at: string | null;
    last_error: string | null;
    token_expires_at: string | null;
  } | null;
  redirectUri: string;
  webhookUrl: string;
};

export function useInstagramAccount(enabled = true) {
  return useQuery({
    queryKey: ["instagram_account"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<InstagramAccountInfo> => {
      const res = await apiFetch("/integrations/instagram/account");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load Instagram");
      return json as InstagramAccountInfo;
    },
  });
}

/** Opens Instagram's sign-in page; it comes back to /integrations/instagram. */
export function useConnectInstagram() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/integrations/instagram/connect", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Could not start connecting");
      window.location.assign(json.url);
    },
  });
}

export function useDisconnectInstagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/integrations/instagram/account", { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not disconnect");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["instagram_account"] }),
  });
}

export type LeadInstagramLinkRow = Tables["lead_instagram_links"]["Row"];

/** The lead's Instagram chat, or null (also before migration 20261130000000). */
export function useLeadInstagramLink(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead_instagram_link", leadId],
    enabled: !!leadId,
    staleTime: 60_000,
    queryFn: async (): Promise<LeadInstagramLinkRow | null> => {
      const { data, error } = await supabase
        .from("lead_instagram_links")
        .select("*")
        .eq("lead_id", leadId!)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });
}

export function useSendLeadInstagramMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      text,
      files,
    }: {
      leadId: string;
      text: string;
      files?: BulkFileInput[];
    }) => {
      const res = await apiFetch("/integrations/instagram/send", {
        method: "POST",
        body: JSON.stringify({ leadId, text, ...(files?.length ? { files } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send the message");
      return json;
    },
    onSuccess: (_data, { leadId }) =>
      void qc.invalidateQueries({ queryKey: ["lead_telegram_messages", leadId] }),
  });
}

/* ------------------------------------------------------------------ */
/* Per-lead file storage. Simple attachments (contract, screenshot,     */
/* invoice) on a lead's workspace -- see the 20261003000000 migration + */
/* src/lib/lead-files.server.ts. The "lead_files" table itself is       */
/* readable directly (RLS scopes it to the caller's org), but the       */
/* actual bytes live in a private Storage bucket, so upload/download/   */
/* delete all go through service-role routes.                           */
/* ------------------------------------------------------------------ */

export type LeadFileRow = Tables["lead_files"]["Row"];

export function useLeadFiles(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead_files", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<LeadFileRow[]> => {
      const { data, error } = await supabase
        .from("lead_files")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUploadLeadFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, file }: { leadId: string; file: File }) => {
      const form = new FormData();
      form.append("leadId", leadId);
      form.append("file", file);
      const res = await apiFetch("/lead-files/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Faylni yuklab bo'lmadi.");
      return json.file as LeadFileRow;
    },
    onSuccess: (_data, { leadId }) =>
      void qc.invalidateQueries({ queryKey: ["lead_files", leadId] }),
  });
}

export function useDeleteLeadFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fileId }: { fileId: string; leadId: string }) => {
      const res = await apiFetch("/lead-files/delete", {
        method: "POST",
        body: JSON.stringify({ fileId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Faylni o'chirib bo'lmadi.");
      return json;
    },
    onSuccess: (_data, { leadId }) =>
      void qc.invalidateQueries({ queryKey: ["lead_files", leadId] }),
  });
}

export async function fetchLeadFileDownloadUrl(fileId: string): Promise<string> {
  const res = await apiFetch(`/lead-files/download?fileId=${encodeURIComponent(fileId)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Havola yaratib bo'lmadi.");
  return json.url as string;
}

export type AutomationRuleRunRow = Tables["automation_rule_runs"]["Row"];

export function useAutomationRuleRuns(ruleId: string | undefined) {
  return useQuery({
    queryKey: ["automation_rule_runs", ruleId],
    enabled: !!ruleId,
    queryFn: async (): Promise<AutomationRuleRunRow[]> => {
      const { data, error } = await supabase
        .from("automation_rule_runs")
        .select("*")
        .eq("rule_id", ruleId!)
        .order("ran_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type IncomingLeadLogRow = Tables["incoming_lead_log"]["Row"];

/** Every hit on a lead source's webhook, successful or not -- for debugging a sender whose payload doesn't match. */
export function useIncomingLeadLog(sourceId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["incoming_lead_log", user?.organizationId, sourceId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<IncomingLeadLogRow[]> => {
      let query = supabase
        .from("incoming_lead_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (sourceId) query = query.eq("lead_source_id", sourceId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ------------------------------------------------------------------ */
/* Web forms -- module 7, the platform's own embeddable lead-capture     */
/* forms (org's website -> POST /forms/:slug/submit -> a new lead).      */
/* ------------------------------------------------------------------ */

export type WebFormRow = Tables["web_forms"]["Row"];

export const useWebForms = webFormsResource.useList;

export const useCreateWebForm = webFormsResource.useCreate;

export const useUpdateWebForm = webFormsResource.useUpdate;

export const useDeleteWebForm = webFormsResource.useRemove;

export type WebFormSubmissionRow = Tables["web_form_submissions"]["Row"];

/** A single form's own submission history -- for the admin builder page's log view. */
export function useWebFormSubmissions(formId: string | undefined) {
  return useQuery({
    queryKey: ["web_form_submissions", formId],
    enabled: !!formId,
    queryFn: async (): Promise<WebFormSubmissionRow[]> => {
      const { data, error } = await supabase
        .from("web_form_submissions")
        .select("*")
        .eq("form_id", formId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}
