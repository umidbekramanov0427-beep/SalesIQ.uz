// Server-only. WhatsApp Business Cloud API client (Meta's official API,
// graph.facebook.com) -- unlike Telegram's own simple bot API, WhatsApp has
// no "shared bot" concept: every organization needs its own WhatsApp
// Business Account (WABA), phone number and access token from Meta's own
// developer console, entered here the same way OnlinePBX/Sipuni/Eskiz
// credentials are. Endpoint shapes below are Meta's own published Cloud API
// contract (developers.facebook.com/docs/whatsapp/cloud-api), which is
// stable and versioned, not guessed from a wrapper library.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH_API_VERSION = "v21.0";

type WhatsAppCredentials = {
  phoneNumberId: string;
  accessToken: string;
};

async function getCredentials(organizationId: string): Promise<WhatsAppCredentials> {
  const { data, error } = await supabaseAdmin
    .from("org_whatsapp_credentials")
    .select("phone_number_id, access_token")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.phone_number_id || !data?.access_token) {
    throw new Error("WhatsApp ulanmagan. Avval WhatsApp Business ma'lumotlarini kiriting.");
  }
  return { phoneNumberId: data.phone_number_id, accessToken: data.access_token };
}

async function graphRequest(
  path: string,
  accessToken: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`, {
      method: init?.method ?? "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `WhatsApp bilan bog'lanib bo'lmadi: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `WhatsApp so'rov xatosi (${res.status})`);
  }
  return json;
}

/** "Ulanishni tekshirish" -- fetches this WABA phone number's own profile, which only succeeds with a valid token. */
export async function testWhatsAppConnection(
  organizationId: string,
): Promise<{ ok: true; displayPhoneNumber: string | null }> {
  const creds = await getCredentials(organizationId);
  const json = (await graphRequest(
    `${creds.phoneNumberId}?fields=display_phone_number,verified_name`,
    creds.accessToken,
  )) as { display_phone_number?: string } | null;
  return { ok: true, displayPhoneNumber: json?.display_phone_number ?? null };
}

/** Sends a free-form text message. Meta only allows this within 24h of the customer's last message -- outside that window it silently fails with an error the caller surfaces as-is. */
export async function sendWhatsAppMessage(
  organizationId: string,
  toNumber: string,
  text: string,
): Promise<{ waMessageId: string | null }> {
  const creds = await getCredentials(organizationId);
  const json = (await graphRequest(`${creds.phoneNumberId}/messages`, creds.accessToken, {
    method: "POST",
    body: {
      messaging_product: "whatsapp",
      to: toNumber.replace(/[^\d]/g, ""),
      type: "text",
      text: { body: text },
    },
  })) as { messages?: { id?: string }[] } | null;
  return { waMessageId: json?.messages?.[0]?.id ?? null };
}

export async function hasWhatsAppCredentials(organizationId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("org_whatsapp_credentials")
    .select("phone_number_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return !!data?.phone_number_id;
}
