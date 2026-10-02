// Server-only. The "Tashqi webhooklar" (external webhooks) card on the
// Chiquvchi integratsiyalar (Outgoing integrations) tab: an org registers
// one or more destination URLs, each subscribed to a subset of real
// platform events, and every delivery attempt -- sent or failed -- is
// logged so "Yuborish tarixi" is a real record instead of a cosmetic
// placeholder.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

export type OutgoingWebhookEvent = "call_created" | "recording_ready" | "ai_analysis_done";

export type OutgoingWebhook = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  events: OutgoingWebhookEvent[];
  headers: Record<string, string>;
  createdAt: string;
};

function parseEvents(raw: Json): OutgoingWebhookEvent[] {
  if (!Array.isArray(raw)) return [];
  const valid: OutgoingWebhookEvent[] = ["call_created", "recording_ready", "ai_analysis_done"];
  return raw.filter((e): e is OutgoingWebhookEvent => valid.includes(e as OutgoingWebhookEvent));
}

function parseHeaders(raw: Json): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
}

export async function listOutgoingWebhooks(organizationId: string): Promise<OutgoingWebhook[]> {
  const { data, error } = await supabaseAdmin
    .from("org_webhook_destinations")
    .select("id, name, url, enabled, events, headers, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    enabled: row.enabled,
    events: parseEvents(row.events),
    headers: parseHeaders(row.headers),
    createdAt: row.created_at,
  }));
}

export async function createOutgoingWebhook(
  organizationId: string,
  createdBy: string,
  input: {
    name: string;
    url: string;
    enabled: boolean;
    events: OutgoingWebhookEvent[];
    headers: Record<string, string>;
  },
): Promise<void> {
  const { error } = await supabaseAdmin.from("org_webhook_destinations").insert({
    organization_id: organizationId,
    name: input.name.trim(),
    url: input.url.trim(),
    enabled: input.enabled,
    events: input.events as unknown as Json,
    headers: input.headers as unknown as Json,
    created_by: createdBy,
  });
  if (error) throw error;
}

export async function toggleOutgoingWebhook(
  organizationId: string,
  webhookId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("org_webhook_destinations")
    .update({ enabled })
    .eq("organization_id", organizationId)
    .eq("id", webhookId);
  if (error) throw error;
}

export async function deleteOutgoingWebhook(
  organizationId: string,
  webhookId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("org_webhook_destinations")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", webhookId);
  if (error) throw error;
}

export type OutgoingWebhookDelivery = {
  id: string;
  event: string;
  status: "sent" | "failed";
  responseCode: number | null;
  error: string | null;
  createdAt: string;
};

export async function listOutgoingWebhookDeliveries(
  organizationId: string,
  limit = 20,
): Promise<OutgoingWebhookDelivery[]> {
  const { data, error } = await supabaseAdmin
    .from("org_webhook_deliveries")
    .select("id, event, status, response_code, error, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    event: row.event,
    status: row.status as "sent" | "failed",
    responseCode: row.response_code,
    error: row.error,
    createdAt: row.created_at,
  }));
}

/** Fires every enabled webhook subscribed to `event` -- called from the real places that event actually happens (a PBX call logged, a recording becoming available, AI call analysis finishing), never on a timer or a fake trigger. Never throws: a destination's own failure is logged, not propagated to the caller whose real work (saving the call, finishing the analysis) must still succeed. */
export async function dispatchOutgoingWebhooks(
  organizationId: string,
  event: OutgoingWebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: webhooks, error } = await supabaseAdmin
    .from("org_webhook_destinations")
    .select("id, url, enabled, events, headers")
    .eq("organization_id", organizationId)
    .eq("enabled", true);
  if (error || !webhooks?.length) return;

  const body = JSON.stringify({ event, organization_id: organizationId, ...payload });

  await Promise.all(
    webhooks
      .filter((w) => parseEvents(w.events).includes(event))
      .map(async (w) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        try {
          const res = await fetch(w.url, {
            method: "POST",
            headers: { "content-type": "application/json", ...parseHeaders(w.headers) },
            body,
            signal: controller.signal,
          });
          await supabaseAdmin.from("org_webhook_deliveries").insert({
            webhook_id: w.id,
            organization_id: organizationId,
            event,
            status: res.ok ? "sent" : "failed",
            response_code: res.status,
            error: res.ok ? null : `HTTP ${res.status}`,
          });
        } catch (err) {
          await supabaseAdmin.from("org_webhook_deliveries").insert({
            webhook_id: w.id,
            organization_id: organizationId,
            event,
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          clearTimeout(timer);
        }
      }),
  );
}
