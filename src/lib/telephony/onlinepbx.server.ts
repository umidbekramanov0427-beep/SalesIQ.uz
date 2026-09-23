// Server-only. OnlinePBX click-to-call + SMS for orgs running SalesIQ as
// their primary CRM (module 5 -- "Telefoniya va Aloqa"). Never import this
// from a route file or component that ships to the client -- it touches the
// org's OnlinePBX api_key/api_secret via the service-role key.
//
// Endpoint shapes here follow OnlinePBX's own documented REST API (a
// two-step auth handshake against the tenant's own PBX domain, then a
// session-scoped call/SMS request) -- the one detail that can only be
// confirmed against a real account is the exact path OnlinePBX's own
// dashboard shows under Settings -> API for that tenant, since some
// self-hosted OnlinePBX deployments version this slightly differently.
// testOnlinePbxConnection() exists specifically so a wrong path surfaces as
// a clear "Ulanishni tekshirish" failure instead of a silent no-op.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type TelephonyCredentials = {
  organization_id: string;
  provider: string;
  api_key: string | null;
  api_secret: string | null;
  pbx_domain: string | null;
  caller_id: string | null;
  sms_sender_name: string | null;
};

async function getCredentials(organizationId: string): Promise<TelephonyCredentials> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.api_key || !data.api_secret || !data.pbx_domain) {
    throw new Error("Telefoniya ulanmagan. Avval OnlinePBX ma'lumotlarini kiriting.");
  }
  return data;
}

// A fresh auth_key is requested per call rather than cached across
// invocations -- OnlinePBX session keys are short-lived and this endpoint
// is only hit on a manual click-to-call / SMS-send / connection-test, never
// in a hot loop, so the extra round trip is not worth the complexity of a
// cross-request cache here.
async function authenticate(creds: TelephonyCredentials): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`https://${creds.pbx_domain}/${creds.api_key}/auth.json`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ auth_key: creds.api_secret ?? "" }).toString(),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `OnlinePBX bilan bog'lanib bo'lmadi: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json: { data?: { key?: string }; status?: string; comment?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`OnlinePBX kutilmagan javob qaytardi: ${text.slice(0, 200)}`);
  }
  if (!res.ok || !json.data?.key) {
    throw new Error(json.comment ?? `OnlinePBX autentifikatsiya xatosi (${res.status})`);
  }
  return json.data.key;
}

async function pbxFetch(
  creds: TelephonyCredentials,
  sessionKey: string,
  path: string,
  body: Record<string, string>,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`https://${creds.pbx_domain}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-pbx-authentication": `${creds.api_key}:${sessionKey}`,
      },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json: { status?: string; comment?: string; data?: unknown };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`OnlinePBX kutilmagan javob qaytardi: ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.status === "error") {
    throw new Error(json.comment ?? `OnlinePBX so'rov xatosi (${res.status})`);
  }
  return json.data;
}

/** "Ulanishni tekshirish" -- confirms the stored credentials actually authenticate against OnlinePBX. */
export async function testOnlinePbxConnection(
  organizationId: string,
): Promise<{ ok: true; pbxDomain: string }> {
  const creds = await getCredentials(organizationId);
  await authenticate(creds);
  return { ok: true, pbxDomain: creds.pbx_domain! };
}

/** Click-to-call: rings the given internal extension first, then bridges it to the external number once answered. */
export async function initiateClickToCall(
  organizationId: string,
  fromExtension: string,
  toNumber: string,
): Promise<{ externalCallId: string | null }> {
  const creds = await getCredentials(organizationId);
  const sessionKey = await authenticate(creds);
  const data = (await pbxFetch(creds, sessionKey, `/${creds.api_key}/callback.json`, {
    extension: fromExtension || creds.caller_id || "",
    phone: toNumber,
  })) as { call_id?: string | number } | null;
  return { externalCallId: data?.call_id != null ? String(data.call_id) : null };
}

/** Sends a plain SMS through OnlinePBX's own SMS gateway, if the tenant has one enabled. */
export async function sendOnlinePbxSms(
  organizationId: string,
  toNumber: string,
  message: string,
): Promise<{ externalMessageId: string | null }> {
  const creds = await getCredentials(organizationId);
  const sessionKey = await authenticate(creds);
  const data = (await pbxFetch(creds, sessionKey, `/${creds.api_key}/sms/send.json`, {
    phone: toNumber,
    text: message,
    sender: creds.sms_sender_name || "",
  })) as { id?: string | number } | null;
  return { externalMessageId: data?.id != null ? String(data.id) : null };
}
