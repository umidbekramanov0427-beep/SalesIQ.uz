// Server-only. Issabel connection test via its own REST API module
// (ccmanual.issabel.com/en/api) -- a JWT bearer scheme where the PBX's own
// admin user/password is exchanged for an access token at
// /pbxapi/authenticate, then used as `Authorization: Bearer <token>` on
// every subsequent call. As with FreePBX, Issabel's management endpoints
// vary enough between installs (which modules/queues/extensions exist) that
// there's no single safe "originate a call" request to wire up here --
// testIssabelConnection only confirms the stored username/password actually
// authenticates.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type IssabelCredentials = {
  domain: string;
  username: string;
  password: string;
};

async function getCredentials(organizationId: string): Promise<IssabelCredentials> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select("api_key, api_secret, pbx_domain")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.api_key || !data?.api_secret || !data?.pbx_domain) {
    throw new Error("Telefoniya ulanmagan. Avval Issabel ma'lumotlarini kiriting.");
  }
  return { domain: data.pbx_domain, username: data.api_key, password: data.api_secret };
}

/** "Ulanishni tekshirish" -- a real login against Issabel's own auth endpoint; only succeeds with a valid username/password. */
export async function testIssabelConnection(organizationId: string): Promise<{ ok: true }> {
  const creds = await getCredentials(organizationId);
  const domain = creds.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`https://${domain}/pbxapi/authenticate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: creds.username, password: creds.password }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `Issabel bilan bog'lanib bo'lmadi: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json: { access_token?: string; message?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Issabel kutilmagan javob qaytardi: ${text.slice(0, 200)}`);
  }
  if (!res.ok || !json.access_token) {
    throw new Error(json.message ?? `Issabel autentifikatsiya xatosi (${res.status})`);
  }
  return { ok: true };
}
