// Server-only. The "API orqali ulash" card -- unlike every other provider
// here, Connect doesn't wait for this one to call in; it polls the
// client's OWN API instead, at whatever Base URL + token they configured,
// hitting the two endpoints the card's own copy promises ("health,
// managers va calls"). calls.list isn't wired to anything in this UI yet
// (no call-import pipeline exists for a generic external source), but
// health and managers back the card's real "Test qilish" and
// "Menejerlarni yangilash" buttons.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ApiPullCredentials = {
  baseUrl: string;
  token: string;
  headers: Record<string, string>;
};

async function getCredentials(organizationId: string): Promise<ApiPullCredentials> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select("pbx_domain, api_secret, caller_id")
    .eq("organization_id", organizationId)
    .eq("provider", "api_inbound")
    .maybeSingle();
  if (error) throw error;
  if (!data?.pbx_domain || !data?.api_secret) {
    throw new Error("API ulanish sozlanmagan. Avval Base URL va API tokenni kiriting.");
  }
  let headers: Record<string, string> = {};
  if (data.caller_id) {
    try {
      const parsed = JSON.parse(data.caller_id) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        headers = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(
            (e): e is [string, string] => typeof e[1] === "string",
          ),
        );
      }
    } catch {
      // Invalid JSON in the custom-headers field -- ignored rather than
      // failing the whole test, since the field is optional.
    }
  }
  return { baseUrl: data.pbx_domain.replace(/\/$/, ""), token: data.api_secret, headers };
}

async function apiPullFetch(creds: ApiPullCredentials, path: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(`${creds.baseUrl}${path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${creds.token}`, ...creds.headers },
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `Manzilga ulanib bo'lmadi: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** "Test qilish" -- a real GET {baseUrl}/health using the stored token. */
export async function testApiPullHealth(
  organizationId: string,
): Promise<{ ok: true; status: number }> {
  const creds = await getCredentials(organizationId);
  const res = await apiPullFetch(creds, "/health");
  if (!res.ok) throw new Error(`Manzil /health uchun ${res.status} xato kodi qaytardi.`);
  return { ok: true, status: res.status };
}

/** "Menejerlarni yangilash" -- a real GET {baseUrl}/managers; returns however many entries the client's API reports. */
export async function fetchApiPullManagers(organizationId: string): Promise<{ count: number }> {
  const creds = await getCredentials(organizationId);
  const res = await apiPullFetch(creds, "/managers");
  if (!res.ok) throw new Error(`Manzil /managers uchun ${res.status} xato kodi qaytardi.`);
  const json = (await res.json().catch(() => null)) as unknown;
  const list = Array.isArray(json)
    ? json
    : Array.isArray((json as { data?: unknown })?.data)
      ? (json as { data: unknown[] }).data
      : null;
  if (!list) throw new Error("Manzil /managers kutilmagan formatda javob qaytardi.");
  return { count: list.length };
}
