// Server-only. Resolves the caller's user id from a bearer JWT and checks
// their role, for server routes that must gate an action to super_admins.
import type { Database } from "@/integrations/supabase/types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export async function getUserIdFromToken(token: string): Promise<string | null> {
  if (token.split(".").length !== 3) return null;

  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (
          isNewSupabaseApiKey(SUPABASE_PUBLISHABLE_KEY) &&
          headers.get("Authorization") === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
        ) {
          headers.delete("Authorization");
        }
        headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

export async function getRequestUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return getUserIdFromToken(authHeader.replace("Bearer ", ""));
}

/** Returns the caller's user id + organization if they're a super_admin, otherwise null. */
export async function requireSuperAdmin(
  request: Request,
): Promise<{ id: string; organizationId: string } | null> {
  const userId = await getRequestUserId(request);
  return userId ? requireSuperAdminForUser(userId) : null;
}

/** Returns the caller's user id + organization for any authenticated org member, no role check -- for data routes every role is allowed to read (e.g. their own Dashboard). */
export async function requireOrgMember(
  request: Request,
): Promise<{ id: string; organizationId: string } | null> {
  const userId = await getRequestUserId(request);
  if (!userId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.organization_id) return null;
  return { id: userId, organizationId: profile.organization_id };
}

/** Same check as requireSuperAdmin, given a user id already resolved from a token. Also admits platform_owner -- a platform owner administers their own organization with at least super_admin's privileges. */
export async function requireSuperAdminForUser(
  userId: string,
): Promise<{ id: string; organizationId: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, organization_id")
    .eq("id", userId)
    .maybeSingle();
  const isOrgAdmin = profile?.role === "super_admin" || profile?.role === "platform_owner";
  if (!isOrgAdmin || !profile.organization_id) return null;
  return { id: userId, organizationId: profile.organization_id };
}

/** Returns the caller's user id if they're the platform owner, otherwise null. */
export async function requirePlatformOwner(request: Request): Promise<string | null> {
  const userId = await getRequestUserId(request);
  if (!userId) return null;
  return (await isPlatformOwner(userId)) ? userId : null;
}

/** Same role check as requirePlatformOwner, given a user id already resolved from a token (e.g. a query-param token on a plain browser navigation, which carries no Authorization header). */
export async function isPlatformOwner(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return profile?.role === "platform_owner";
}
