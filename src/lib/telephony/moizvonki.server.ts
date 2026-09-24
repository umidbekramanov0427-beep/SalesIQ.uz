// Server-only. MoiZvonki (moizvonki.ru) click-to-call client -- a third
// telephony provider alongside OnlinePBX and Sipuni. moizvonki.ru's own
// docs pages (moizvonki.ru/guide/api/, /help/) are not reachable from this
// environment, so the exact endpoint/param shape here is taken from their
// published Yii2 PHP client (github.com/IIISpikerIII/yii2-moizvonki),
// verified field-for-field: one JSON-RPC-style endpoint per tenant
// subdomain, an `action` field selecting the operation, `user_name` +
// `api_key` in every request body for auth.
//
// Like Sipuni, MoiZvonki's documented API surface (calls.list,
// calls.make_call, calls.get_crm_event) has no SMS-sending action -- SMS
// stays unsupported for orgs on this provider.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type MoizvonkiCredentials = {
  userName: string;
  apiKey: string;
  apiUrl: string;
};

// MoiZvonki needs three values (login email, API key, per-tenant API
// subdomain) but org_telephony_credentials only has two generic secret
// slots plus pbx_domain -- reuses api_secret for the login email (it has
// no real "secret" of its own) the same way Sipuni reuses api_key/
// api_secret for its own, differently-shaped pair, and pbx_domain for the
// api_url subdomain the same way OnlinePBX does for its own tenant domain.
async function getCredentials(organizationId: string): Promise<MoizvonkiCredentials> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select("api_key, api_secret, pbx_domain")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.api_key || !data?.api_secret || !data?.pbx_domain) {
    throw new Error("Telefoniya ulanmagan. Avval MoiZvonki ma'lumotlarini kiriting.");
  }
  return { userName: data.api_secret, apiKey: data.api_key, apiUrl: data.pbx_domain };
}

async function moizvonkiRequest(
  creds: MoizvonkiCredentials,
  action: string,
  params: Record<string, string | number | boolean>,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const domain = creds.apiUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`https://${domain}/api/v1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_name: creds.userName,
        api_key: creds.apiKey,
        action,
        ...params,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `MoiZvonki bilan bog'lanib bo'lmadi: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (res.status !== 200) {
    throw new Error(text.slice(0, 300) || `MoiZvonki so'rov xatosi (${res.status})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** "Ulanishni tekshirish" -- a side-effect-free call.list (last minute, capped to 1 result) that only succeeds with valid credentials. */
export async function testMoizvonkiConnection(
  organizationId: string,
): Promise<{ ok: true; pbxDomain: string }> {
  const creds = await getCredentials(organizationId);
  await moizvonkiRequest(creds, "calls.list", {
    from_date: Math.floor(Date.now() / 1000) - 60,
    max_results: 1,
  });
  return { ok: true, pbxDomain: creds.apiUrl };
}

/** Click-to-call: rings the account's own configured phone first, then bridges it to the external number once answered -- MoiZvonki's calls.make_call has no separate "from" parameter to pick a specific extension. */
export async function initiateMoizvonkiClickToCall(
  organizationId: string,
  toNumber: string,
): Promise<{ externalCallId: string | null }> {
  const creds = await getCredentials(organizationId);
  const data = (await moizvonkiRequest(creds, "calls.make_call", { to: toNumber })) as {
    id?: string | number;
    call_id?: string | number;
  } | null;
  const id = data?.id ?? data?.call_id;
  return { externalCallId: id != null ? String(id) : null };
}

export async function sendMoizvonkiSms(): Promise<{ externalMessageId: string | null }> {
  throw new Error("MoiZvonki SMS yuborishni qo'llab-quvvatlamaydi.");
}
