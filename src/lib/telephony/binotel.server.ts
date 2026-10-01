// Server-only. Binotel (binotel.ua) click-to-call client -- a fourth
// telephony provider. Binotel's own docs (developers.binotel.ua) require a
// logged-in account to browse the full reference, so the exact method path
// below is taken from its publicly documented call-type list (REST API
// "internal-number-to-external-number" call type) and the credential shape
// used by community client libraries (key+secret embedded in the URL path,
// mirroring OnlinePBX's own scheme) -- like OnlinePBX, the one detail that
// can only be confirmed against a real account is the literal method file
// name, so testBinotelConnection() exists to surface a wrong path as a clear
// "Ulanishni tekshirish" failure instead of a silent no-op.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type BinotelCredentials = {
  apiKey: string;
  apiSecret: string;
  internalNumber: string | null;
};

async function getCredentials(organizationId: string): Promise<BinotelCredentials> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select("api_key, api_secret, caller_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.api_key || !data?.api_secret) {
    throw new Error("Telefoniya ulanmagan. Avval Binotel ma'lumotlarini kiriting.");
  }
  return { apiKey: data.api_key, apiSecret: data.api_secret, internalNumber: data.caller_id };
}

async function binotelRequest(creds: BinotelCredentials, path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(
      `https://api.binotel.com/api/4.0/${creds.apiKey}/${creds.apiSecret}/${path}`,
      {
        method: "GET",
        signal: controller.signal,
      },
    );
  } catch (err) {
    throw new Error(
      `Binotel bilan bog'lanib bo'lmadi: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json: { status?: string; messages?: unknown; errorCode?: number } & Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Binotel kutilmagan javob qaytardi: ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.status === "error") {
    throw new Error(
      typeof json.messages === "string" ? json.messages : `Binotel so'rov xatosi (${res.status})`,
    );
  }
  return json;
}

/** "Ulanishni tekshirish" -- a side-effect-free employees list that only succeeds with valid key+secret. */
export async function testBinotelConnection(organizationId: string): Promise<{ ok: true }> {
  const creds = await getCredentials(organizationId);
  await binotelRequest(creds, "stats/employees/get-employees-list.json");
  return { ok: true };
}

/** Click-to-call: rings the configured internal extension first, then bridges it to the external number once answered. */
export async function initiateBinotelClickToCall(
  organizationId: string,
  toNumber: string,
): Promise<{ externalCallId: string | null }> {
  const creds = await getCredentials(organizationId);
  if (!creds.internalNumber) {
    throw new Error("Qo'ng'iroq qilish uchun ichki raqam (extension) sozlanmagan.");
  }
  const data = (await binotelRequest(
    creds,
    `calls/internal-number-to-external-number.json?internal-number=${encodeURIComponent(
      creds.internalNumber,
    )}&external-number=${encodeURIComponent(toNumber)}`,
  )) as { generalCallID?: string | number } | null;
  return { externalCallId: data?.generalCallID != null ? String(data.generalCallID) : null };
}
