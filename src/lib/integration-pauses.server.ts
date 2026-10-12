import { supabaseAdmin } from "@/integrations/supabase/client.server";

// The platform owner can pause one integration of a company (platform
// owner panel -> Integrations). While a row exists in integration_pauses,
// syncs, incoming call events, SMS and outgoing webhooks of that kind do
// nothing for that company. Looked up with a short in-memory cache since
// webhooks call this on every event.

export const INTEGRATION_KINDS = ["amocrm", "bitrix24", "telephony", "sms", "webhooks"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; paused: boolean }>();

export async function isIntegrationPaused(
  organizationId: string,
  kind: IntegrationKind,
): Promise<boolean> {
  const key = `${organizationId}:${kind}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.paused;
  const { data, error } = await supabaseAdmin
    .from("integration_pauses")
    .select("kind")
    .eq("organization_id", organizationId)
    .eq("kind", kind)
    .maybeSingle();
  // Table missing (migration not run yet) or a read error: never block.
  const paused = !error && !!data;
  cache.set(key, { at: Date.now(), paused });
  return paused;
}

export function forgetIntegrationPause(organizationId: string, kind: IntegrationKind): void {
  cache.delete(`${organizationId}:${kind}`);
}

export const INTEGRATION_PAUSED_MESSAGE =
  "Bu integratsiya platforma ma'muriyati tomonidan vaqtincha to'xtatilgan.";
