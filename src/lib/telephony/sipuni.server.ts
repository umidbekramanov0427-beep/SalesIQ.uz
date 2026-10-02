// Server-only. Sipuni click-to-call client -- a second telephony provider
// alongside OnlinePBX (see onlinepbx.server.ts), so orgs already using
// Sipuni's virtual PBX don't have to switch providers to get click-to-call
// out of this CRM. Sipuni's API is simpler than OnlinePBX's: no
// session/auth handshake, just an MD5-signed request per call. The exact
// endpoint/param/signature shape here is taken from Sipuni's own published
// PHP/Python/Go API clients (doc.sipuni.com and help.sipuni.com are not
// reachable from this environment), specifically the Python client at
// github.com/bzdvdn/sipuni-api-wrapper, which was verified field-for-field.
//
// Sipuni has no SMS-sending endpoint in its API (only calls, TTS "voice
// calls", and call-tracking statistics) -- SMS stays unsupported for orgs
// on this provider; sendSipuniSms always throws a clear error instead of
// silently no-op'ing.
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SIPUNI_API_URL = "https://sipuni.com/api/";

type SipuniCredentials = {
  user: string;
  secret: string;
  defaultSipNumber: string | null;
};

async function getCredentials(organizationId: string): Promise<SipuniCredentials> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select("api_key, api_secret, caller_id")
    .eq("organization_id", organizationId)
    .eq("provider", "sipuni")
    .maybeSingle();
  if (error) throw error;
  if (!data?.api_key || !data?.api_secret) {
    throw new Error("Telefoniya ulanmagan. Avval Sipuni ma'lumotlarini kiriting.");
  }
  return { user: data.api_key, secret: data.api_secret, defaultSipNumber: data.caller_id };
}

// Every Sipuni request is signed as md5(values joined by "+", lowercased,
// secret last) -- computed over the exact same field order the request
// itself sends. Get the order wrong and Sipuni just rejects the call with
// no useful error, so this always takes the non-secret values in the
// caller's intended order and appends the secret itself, rather than
// trusting each call site to remember to include it.
function sign(values: (string | number)[], secret: string): string {
  const joined = [...values, secret].map((v) => String(v).toLowerCase()).join("+");
  return crypto.createHash("md5").update(joined, "utf8").digest("hex");
}

async function sipuniRequest(
  path: string,
  params: Record<string, string | number>,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  );
  let res: Response;
  try {
    res = await fetch(`${SIPUNI_API_URL}${path}?${query.toString()}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `Sipuni bilan bog'lanib bo'lmadi: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  // Mirrors Sipuni's own client libraries: any status over 204 is an error,
  // and the body (often plain text, not always JSON) is the best available
  // error detail.
  if (res.status > 204) {
    throw new Error(text.slice(0, 300) || `Sipuni so'rov xatosi (${res.status})`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** "Ulanishni tekshirish" -- a side-effect-free call (this org's operator list) that only succeeds with valid credentials. */
export async function testSipuniConnection(organizationId: string): Promise<{ ok: true }> {
  const creds = await getCredentials(organizationId);
  const hash = sign([creds.user], creds.secret);
  await sipuniRequest("statistic/operators", { user: creds.user, hash });
  return { ok: true };
}

/** Click-to-call: rings the given SIP number/extension first, then bridges it to the external number once answered. */
export async function initiateSipuniClickToCall(
  organizationId: string,
  fromSipNumber: string,
  toNumber: string,
): Promise<{ externalCallId: string | null }> {
  const creds = await getCredentials(organizationId);
  const sipnumber = fromSipNumber || creds.defaultSipNumber || "";
  if (!sipnumber) {
    throw new Error(
      "Qo'ng'iroq qilish uchun SIP raqami sozlanmagan (o'zingizga yoki tashkilotga standart SIP raqamini biriktiring).",
    );
  }
  const antion = 0;
  const reverse = 0;
  const hash = sign([antion, toNumber, reverse, sipnumber, creds.user], creds.secret);
  const data = (await sipuniRequest("callback/call_number", {
    antion,
    phone: toNumber,
    reverse,
    sipnumber,
    user: creds.user,
    hash,
  })) as { id?: string | number; data?: { id?: string | number } } | null;
  const id = data?.id ?? data?.data?.id;
  return { externalCallId: id != null ? String(id) : null };
}

export async function sendSipuniSms(): Promise<{ externalMessageId: string | null }> {
  throw new Error("Sipuni SMS yuborishni qo'llab-quvvatlamaydi.");
}
