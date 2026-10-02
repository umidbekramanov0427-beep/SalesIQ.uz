// Server-only. The two generic, vendor-less telephony integrations: an
// inbound API key (external systems push call events into our own
// /integrations/telephony/webhook) and an outbound webhook (we push a
// signed test ping to a URL the org configures). Unlike every provider
// above, these never call a third-party vendor's API -- they only exercise
// our own webhook endpoint, so they're fully real and fully testable
// without depending on any outside provider's documentation being correct.
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type OutboundCredentials = {
  url: string;
  signingSecret: string;
};

async function getOutboundCredentials(organizationId: string): Promise<OutboundCredentials> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select("pbx_domain, api_secret")
    .eq("organization_id", organizationId)
    .eq("provider", "api_outbound")
    .maybeSingle();
  if (error) throw error;
  if (!data?.pbx_domain || !data?.api_secret) {
    throw new Error("Chiquvchi webhook sozlanmagan. Avval manzil va imzo kalitini kiriting.");
  }
  return { url: data.pbx_domain, signingSecret: data.api_secret };
}

/** Signs a payload the same way a real call-event push would, so the test ping is representative of what the org's endpoint will actually receive. */
function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/** "Ulanishni tekshirish" for the outbound webhook card -- fires a real signed POST to the configured URL and reports the endpoint's actual HTTP response. */
export async function testOutboundWebhook(
  organizationId: string,
): Promise<{ ok: true; status: number }> {
  const creds = await getOutboundCredentials(organizationId);
  const payload = JSON.stringify({
    event: "test.ping",
    organization_id: organizationId,
    sent_at: new Date().toISOString(),
  });
  const signature = signPayload(payload, creds.signingSecret);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(creds.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-salesiq-signature": signature },
      body: payload,
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `Manzilga ulanib bo'lmadi: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`Manzil ${res.status} xato kodi bilan javob qaytardi.`);
  }
  return { ok: true, status: res.status };
}
