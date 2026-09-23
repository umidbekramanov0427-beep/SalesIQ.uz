// Server-only. Backs the parts of the "Integratsiya ish maydoni" ->
// Operatsiyalar tab that aren't AmoCRM-specific: a read-only External
// Analytics API token and a single outgoing webhook per org. Kept separate
// from src/lib/amocrm/client.server.ts since neither of these touches
// AmoCRM's own API -- they're generic per-org integration surface that
// happens to live on the same screen.
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ExternalApiTokenStatus = {
  hasToken: boolean;
  createdAt: string | null;
  revokedAt: string | null;
  // Last 4 characters of the token, safe to keep showing on the settings
  // screen so an admin can tell which token is live ("token oxiri XXXX")
  // without the full secret ever being re-readable from the browser.
  tokenLast4: string | null;
};

/** Status only -- the raw token is never readable again after generateExternalApiToken's response. */
export async function getExternalApiTokenStatus(
  organizationId: string,
): Promise<ExternalApiTokenStatus> {
  const { data, error } = await supabaseAdmin
    .from("org_external_api_tokens")
    .select("created_at, revoked_at, token")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return {
    hasToken: !!data && !data.revoked_at,
    createdAt: data?.created_at ?? null,
    revokedAt: data?.revoked_at ?? null,
    tokenLast4: data && !data.revoked_at ? data.token.slice(-4) : null,
  };
}

/** Generates (or regenerates) the org's external analytics token. Returns the raw token exactly once. */
export async function generateExternalApiToken(
  organizationId: string,
  createdBy: string | null,
): Promise<string> {
  const token = `sq_${randomBytes(24).toString("hex")}`;
  const { error } = await supabaseAdmin.from("org_external_api_tokens").upsert(
    {
      organization_id: organizationId,
      token,
      created_by: createdBy,
      created_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "organization_id" },
  );
  if (error) throw error;
  return token;
}

export async function revokeExternalApiToken(organizationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("org_external_api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (error) throw error;
}

/** Resolves an organization_id from a bearer token -- used by any future external-read route. */
export async function resolveOrgByExternalApiToken(token: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("org_external_api_tokens")
    .select("organization_id, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.revoked_at) return null;
  return data.organization_id;
}

export type OutgoingWebhook = {
  name: string;
  url: string;
  headers: Record<string, string>;
  createdAt: string;
};

export async function getOutgoingWebhook(organizationId: string): Promise<OutgoingWebhook | null> {
  const { data, error } = await supabaseAdmin
    .from("org_outgoing_webhooks")
    .select("name, url, headers, created_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    name: data.name,
    url: data.url,
    headers: (data.headers as Record<string, string>) ?? {},
    createdAt: data.created_at,
  };
}

export async function saveOutgoingWebhook(
  organizationId: string,
  createdBy: string | null,
  name: string,
  url: string,
  headers: Record<string, string>,
): Promise<void> {
  new URL(url); // throws on an invalid URL -- caught by the route handler
  const { error } = await supabaseAdmin.from("org_outgoing_webhooks").upsert(
    {
      organization_id: organizationId,
      name: name.trim() || "Webhook",
      url,
      headers,
      created_by: createdBy,
    },
    { onConflict: "organization_id" },
  );
  if (error) throw error;
}

export async function deleteOutgoingWebhook(organizationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("org_outgoing_webhooks")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw error;
}
