// Server-only. API kalitlari: making, listing and revoking a company's keys
// (migration 20261225000000) and checking the key on every /api/v1
// request. Only the SHA-256 of a key is stored; the key is returned once.
import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  KEY_PREFIX,
  cleanScopes,
  displayPrefix,
  keyFromHeaders,
  makeRateLimiter,
  type ApiScope,
} from "@/lib/api-keys";

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
const missingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /org_api_keys/.test(e.message ?? ""));

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  createdAt: string;
  createdBy: string | null;
  lastUsedAt: string | null;
};

/** null before the migration has run. */
export async function listApiKeys(organizationId: string): Promise<ApiKeyRow[] | null> {
  const { data, error } = await supabaseAdmin
    .from("org_api_keys")
    .select("id, name, prefix, scopes, created_at, created_by, last_used_at")
    .eq("organization_id", organizationId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (missingTable(error)) return null;
    throw error;
  }
  const people = [...new Set((data ?? []).map((k) => k.created_by).filter(Boolean))] as string[];
  const { data: profs } = people.length
    ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", people)
    : { data: [] };
  const name = new Map((profs ?? []).map((p) => [p.id, p.full_name as string | null]));
  return (data ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: cleanScopes(k.scopes),
    createdAt: k.created_at,
    createdBy: k.created_by ? (name.get(k.created_by) ?? null) : null,
    lastUsedAt: k.last_used_at,
  }));
}

export async function createApiKey(
  organizationId: string,
  by: string,
  name: string,
  scopes: unknown,
): Promise<{ id: string; key: string }> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error("NAME_REQUIRED");
  const key = KEY_PREFIX + randomBytes(30).toString("base64url");
  const { data, error } = await supabaseAdmin
    .from("org_api_keys")
    .insert({
      organization_id: organizationId,
      name: clean,
      prefix: displayPrefix(key),
      key_hash: hashKey(key),
      scopes: cleanScopes(scopes),
      created_by: by,
    })
    .select("id")
    .single();
  if (error) throw missingTable(error) ? new Error("MIGRATION_PENDING") : error;
  return { id: data.id, key };
}

export async function revokeApiKey(organizationId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("org_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", id);
  if (error) throw missingTable(error) ? new Error("MIGRATION_PENDING") : error;
}

const limiter = makeRateLimiter(120);
const lastTouch = new Map<string, number>();

export type ApiCaller = { organizationId: string; keyId: string };

const fail = (status: number, error: string, message: string) =>
  Response.json({ error, message }, { status });

/**
 * The calling company for a /api/v1 request, or the error Response to send.
 * 401 without a valid key, 403 without the scope, 429 past 120 requests a minute.
 */
export async function authenticateApi(
  request: Request,
  scope: ApiScope,
): Promise<ApiCaller | Response> {
  const key = keyFromHeaders(request.headers);
  if (!key) return fail(401, "unauthorized", "Send the key as 'Authorization: Bearer sq_live_…'.");
  const { data, error } = await supabaseAdmin
    .from("org_api_keys")
    .select("id, organization_id, scopes, revoked_at")
    .eq("key_hash", hashKey(key))
    .maybeSingle();
  if (error || !data || data.revoked_at)
    return fail(401, "unauthorized", "Unknown or revoked key.");
  if (!cleanScopes(data.scopes).includes(scope) || !(data.scopes as string[]).includes(scope))
    return fail(403, "forbidden", `This key lacks the '${scope}' scope.`);
  if (!limiter(data.id)) return fail(429, "rate_limited", "Over 120 requests a minute; slow down.");
  // last_used_at at most once a minute per key.
  const now = Date.now();
  if (now - (lastTouch.get(data.id) ?? 0) > 60_000) {
    lastTouch.set(data.id, now);
    void supabaseAdmin
      .from("org_api_keys")
      .update({ last_used_at: new Date(now).toISOString() })
      .eq("id", data.id)
      .then(() => undefined);
  }
  return { organizationId: data.organization_id, keyId: data.id };
}
