// Server-only. New-Tel (new-tel.net) connection test. New-Tel's own API
// reference lives behind a Swagger UI at swagger.new-tel.net and a Russian
// PDF (public.new-tel.net/docs/newtel_API.pdf), neither reachable from this
// environment, so only the credential shape is confirmed from New-Tel's
// published PHP/Go client libraries: an API_KEY + API_SIGNATURE pair issued
// at my.new-tel.net/register, sent as query parameters on every request.
// The exact balance/account endpoint below is a best-effort guess at the
// lightest-weight authenticated GET New-Tel exposes -- same caveat as
// OnlinePBX's own path, it fails loudly with a clear message rather than
// silently if New-Tel's real path differs.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type NewtelCredentials = {
  apiKey: string;
  apiSignature: string;
};

async function getCredentials(organizationId: string): Promise<NewtelCredentials> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select("api_key, api_secret")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.api_key || !data?.api_secret) {
    throw new Error("Telefoniya ulanmagan. Avval New-Tel ma'lumotlarini kiriting.");
  }
  return { apiKey: data.api_key, apiSignature: data.api_secret };
}

/** "Ulanishni tekshirish" -- a read-only account/balance request that only succeeds with a valid key+signature. */
export async function testNewtelConnection(organizationId: string): Promise<{ ok: true }> {
  const creds = await getCredentials(organizationId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const query = new URLSearchParams({ api_key: creds.apiKey, api_signature: creds.apiSignature });
  let res: Response;
  try {
    res = await fetch(`https://api.new-tel.net/api/v1/account/balance?${query.toString()}`, {
      method: "GET",
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `New-Tel bilan bog'lanib bo'lmadi: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text.slice(0, 300) || `New-Tel so'rov xatosi (${res.status})`);
  }
  return { ok: true };
}
