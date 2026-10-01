// Server-only. FreePBX connection test via its GraphQL API's OAuth2
// "client credentials" flow -- documented at
// wiki.freepbx.org/display/FPG/Core+Module+GraphQL+APIs and the FreePBX
// community forums: a tenant creates an API client (Client ID + Client
// Secret) under Settings -> API in its own FreePBX admin, then trades those
// for a bearer token at /admin/api/api/token. FreePBX has no single
// standardized "originate a call" GraphQL mutation across installs (it
// depends on which modules are enabled), so unlike OnlinePBX/Sipuni/
// MoiZvonki/Binotel this provider only wires up connection verification --
// initiateFreepbxCall intentionally doesn't exist, the same way
// sendSipuniSms/sendMoizvonkiSms intentionally throw instead of guessing.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type FreepbxCredentials = {
  domain: string;
  clientId: string;
  clientSecret: string;
};

async function getCredentials(organizationId: string): Promise<FreepbxCredentials> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select("api_key, api_secret, pbx_domain")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.api_key || !data?.api_secret || !data?.pbx_domain) {
    throw new Error("Telefoniya ulanmagan. Avval FreePBX ma'lumotlarini kiriting.");
  }
  return { domain: data.pbx_domain, clientId: data.api_key, clientSecret: data.api_secret };
}

/** "Ulanishni tekshirish" -- requests a real OAuth2 access token; only succeeds with a valid client id/secret pair. */
export async function testFreepbxConnection(organizationId: string): Promise<{ ok: true }> {
  const creds = await getCredentials(organizationId);
  const domain = creds.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`https://${domain}/admin/api/api/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "gql" }).toString(),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `FreePBX bilan bog'lanib bo'lmadi: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json: { access_token?: string; error_description?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`FreePBX kutilmagan javob qaytardi: ${text.slice(0, 200)}`);
  }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? `FreePBX autentifikatsiya xatosi (${res.status})`);
  }
  return { ok: true };
}
