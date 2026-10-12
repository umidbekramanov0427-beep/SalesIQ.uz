// Server-only. Eskiz.uz SMS client -- a dedicated SMS provider, independent
// of the telephony/call providers (see telephony/onlinepbx.server.ts and
// telephony/sipuni.server.ts). Endpoint shapes here come directly from
// Eskiz's own published OpenAPI spec (raw.githubusercontent.com/iota-uz/
// eskiz/main/api/openapi.yaml -- notify.eskiz.uz itself isn't reachable
// from this environment), so every field name below is authoritative, not
// guessed from a third-party wrapper.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { INTEGRATION_PAUSED_MESSAGE, isIntegrationPaused } from "@/lib/integration-pauses.server";

const ESKIZ_API_URL = "https://notify.eskiz.uz";
// Eskiz issues a token valid ~30 days; refresh a few days early so a
// borderline-expired token is never handed to a send request.
const TOKEN_REFRESH_MARGIN_MS = 3 * 24 * 60 * 60 * 1000;

type EskizCredentialsRow = {
  email: string;
  password: string;
  sender_name: string | null;
  token: string | null;
  token_expires_at: string | null;
};

async function getCredentialsRow(organizationId: string): Promise<EskizCredentialsRow> {
  const { data, error } = await supabaseAdmin
    .from("org_sms_credentials")
    .select("email, password, sender_name, token, token_expires_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.email || !data?.password) {
    throw new Error("SMS ulanmagan. Avval Eskiz ma'lumotlarini kiriting.");
  }
  return data;
}

async function eskizRequest(
  path: string,
  method: "GET" | "POST" | "PATCH",
  token: string | null,
  form?: Record<string, string>,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    const body = form
      ? Object.entries(form).reduce((fd, [k, v]) => {
          fd.append(k, v);
          return fd;
        }, new FormData())
      : undefined;
    res = await fetch(`${ESKIZ_API_URL}${path}`, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
      ...(body ? { body } : {}),
    });
  } catch (err) {
    throw new Error(
      `Eskiz bilan bog'lanib bo'lmadi: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) {
    throw new Error(json?.message ?? `Eskiz so'rov xatosi (${res.status})`);
  }
  return json;
}

async function loginEskiz(email: string, password: string): Promise<string> {
  const json = (await eskizRequest("/api/auth/login", "POST", null, { email, password })) as {
    data?: { token?: string };
  } | null;
  const token = json?.data?.token;
  if (!token) throw new Error("Eskiz tokenini olib bo'lmadi.");
  return token;
}

/** Returns a live token, logging in fresh only when the cached one is missing or close to expiring. */
async function getValidToken(organizationId: string, creds: EskizCredentialsRow): Promise<string> {
  const stillValid =
    creds.token &&
    creds.token_expires_at &&
    new Date(creds.token_expires_at).getTime() - TOKEN_REFRESH_MARGIN_MS > Date.now();
  if (stillValid) return creds.token!;

  const token = await loginEskiz(creds.email, creds.password);
  const expiresAt = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("org_sms_credentials")
    .update({ token, token_expires_at: expiresAt })
    .eq("organization_id", organizationId);
  return token;
}

/** "Ulanishni tekshirish" -- fetches this Eskiz account's own info, which only succeeds with a valid login. */
export async function testEskizConnection(
  organizationId: string,
): Promise<{ ok: true; balance: number | null }> {
  const creds = await getCredentialsRow(organizationId);
  const token = await getValidToken(organizationId, creds);
  const json = (await eskizRequest("/api/auth/user", "GET", token)) as {
    data?: { balance?: number };
  } | null;
  return { ok: true, balance: json?.data?.balance ?? null };
}

/** Sends a plain SMS through Eskiz. `from` defaults to Eskiz's shared test nickname (4546) when the org hasn't been approved for its own yet. */
export async function sendEskizSms(
  organizationId: string,
  toNumber: string,
  message: string,
): Promise<{ externalMessageId: string | null }> {
  if (await isIntegrationPaused(organizationId, "sms")) throw new Error(INTEGRATION_PAUSED_MESSAGE);
  const creds = await getCredentialsRow(organizationId);
  const token = await getValidToken(organizationId, creds);
  const json = (await eskizRequest("/api/message/sms/send", "POST", token, {
    mobile_phone: toNumber.replace(/[^\d]/g, ""),
    message,
    from: creds.sender_name || "4546",
  })) as { id?: string } | null;
  return { externalMessageId: json?.id ?? null };
}

export async function hasEskizCredentials(organizationId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("org_sms_credentials")
    .select("email")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return !!data?.email;
}
