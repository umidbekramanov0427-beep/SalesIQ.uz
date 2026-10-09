// Server-only. OnlinePBX: click-to-call, call history and SMS for orgs
// running SalesIQ as their own CRM. Never import this from a route file or
// component that ships to the client -- it touches the org's OnlinePBX API
// key via the service-role key.
//
// The HTTP API lives at https://api.onlinepbx.ru/<your-domain>/<method>.json
// (e.g. company.onpbx.ru). auth.json trades the account's API key (Settings
// -> Integration -> API in the OnlinePBX panel) for a session key + key id;
// every other request is a form POST signed with that session key:
//   x-pbx-authentication: <key_id>:base64(hex(HMAC-SHA1(key,
//     "POST\n" + md5(body) + "\n" + content-type + "\n" + date + "\n" + url + "\n")))
// where url is "api.onlinepbx.ru/<domain>/<method>.json" without the scheme
// (as the reference client github.com/grazumkov/onlinepbx-api does).
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const API_HOST = "api.onlinepbx.ru";
const CONTENT_TYPE = "application/x-www-form-urlencoded";
const TIMEOUT_MS = 15_000;

type TelephonyCredentials = {
  organization_id: string;
  provider: string;
  api_key: string | null;
  api_secret: string | null;
  pbx_domain: string | null;
  caller_id: string | null;
  sms_sender_name: string | null;
};

type Session = { key: string; keyId: string; domain: string; at: number };
// Session keys are reused for a few minutes so a busy afternoon of clicks
// doesn't re-authenticate on every call; a rejected key re-authenticates.
const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 10 * 60_000;

async function getCredentials(organizationId: string): Promise<TelephonyCredentials> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "onlinepbx")
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.pbx_domain || !(data.api_key || data.api_secret)) {
    throw new Error("Telefoniya ulanmagan. Avval OnlinePBX domeni va API kalitini kiriting.");
  }
  return data;
}

/** "https://Company.onpbx.ru/" -> "company.onpbx.ru" */
function cleanDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

async function postForm(
  url: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": CONTENT_TYPE, accept: "application/json", ...headers },
      body,
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
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

const isOk = (json: Record<string, unknown> | null) =>
  !!json && (json["status"] === 1 || json["status"] === "1" || json["status"] === "success");

function pbxComment(json: Record<string, unknown> | null, fallback: string): string {
  const c = json?.["comment"] ?? json?.["message"] ?? json?.["errorCode"];
  return typeof c === "string" && c ? c : fallback;
}

async function authenticate(creds: TelephonyCredentials, fresh = false): Promise<Session> {
  const domain = cleanDomain(creds.pbx_domain ?? "");
  const cached = sessions.get(creds.organization_id);
  if (!fresh && cached && cached.domain === domain && Date.now() - cached.at < SESSION_TTL_MS) {
    return cached;
  }
  // Admins have put the one OnlinePBX API key into either field over time.
  const candidates = [
    ...new Set([creds.api_key, creds.api_secret].filter((v): v is string => !!v)),
  ];
  let lastError = "OnlinePBX autentifikatsiya xatosi";
  for (const authKey of candidates) {
    const r = await postForm(
      `https://${API_HOST}/${domain}/auth.json`,
      new URLSearchParams({
        auth_key: authKey.trim(),
        ...(fresh ? { new: "true" } : {}),
      }).toString(),
    );
    const data = r.json?.["data"] as { key?: string; key_id?: string } | undefined;
    if (isOk(r.json) && data?.key && data.key_id) {
      const session = { key: data.key, keyId: String(data.key_id), domain, at: Date.now() };
      sessions.set(creds.organization_id, session);
      return session;
    }
    lastError = r.json
      ? pbxComment(r.json, `OnlinePBX autentifikatsiya xatosi (${r.status})`)
      : `OnlinePBX kutilmagan javob qaytardi (${r.status}): ${r.text.slice(0, 160)}`;
  }
  throw new Error(`OnlinePBX: ${lastError}. Domen va API kalitini tekshiring.`);
}

function signedHeaders(session: Session, path: string, body: string): Record<string, string> {
  const date = new Date().toUTCString();
  const md5 = crypto.createHash("md5").update(body).digest("hex");
  const signedUrl = `${API_HOST}/${session.domain}/${path}`;
  const toSign = `POST\n${md5}\n${CONTENT_TYPE}\n${date}\n${signedUrl}\n`;
  const hex = crypto.createHmac("sha1", session.key).update(toSign).digest("hex");
  return {
    date,
    "content-md5": md5,
    "x-pbx-authentication": `${session.keyId}:${Buffer.from(hex).toString("base64")}`,
  };
}

/** A signed API call; re-authenticates once if the session key was refused. */
async function pbxRequest(
  organizationId: string,
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const creds = await getCredentials(organizationId);
  const body = new URLSearchParams(params).toString();
  let session = await authenticate(creds);
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await postForm(
      `https://${API_HOST}/${session.domain}/${path}`,
      body,
      signedHeaders(session, path, body),
    );
    if (isOk(r.json)) return r.json?.["data"] ?? null;
    const comment = r.json
      ? pbxComment(r.json, `so'rov xatosi (${r.status})`)
      : r.text.slice(0, 160);
    const authProblem =
      r.status === 401 || r.status === 403 || /auth|key|sign|ключ|автор/i.test(comment);
    if (attempt === 0 && authProblem) {
      session = await authenticate(creds, true);
      continue;
    }
    throw new Error(`OnlinePBX: ${comment}`);
  }
  throw new Error("OnlinePBX: so'rov bajarilmadi");
}

/** "Ulanishni tekshirish" -- the stored domain + API key really authenticate. */
export async function testOnlinePbxConnection(
  organizationId: string,
): Promise<{ ok: true; pbxDomain: string }> {
  const creds = await getCredentials(organizationId);
  const session = await authenticate(creds, true);
  return { ok: true, pbxDomain: session.domain };
}

/**
 * Click-to-call: the PBX first rings the salesperson's own extension (e.g.
 * 105), and once they pick up dials the client.
 */
export async function initiateClickToCall(
  organizationId: string,
  fromExtension: string,
  toNumber: string,
): Promise<{ externalCallId: string | null }> {
  const data = (await pbxRequest(organizationId, "call/now.json", {
    from: fromExtension,
    to: toNumber.replace(/[^\d+]/g, ""),
  })) as Record<string, unknown> | null;
  const id = data?.["uuid"] ?? data?.["call_id"] ?? data?.["id"];
  return { externalCallId: id != null && id !== "" ? String(id) : null };
}

/** One call from OnlinePBX's call history, in whichever field names it uses. */
export type OnlinePbxHistoryRow = Record<string, unknown>;

/** Calls between two moments (history/search.json), newest PBX data first. */
export async function fetchOnlinePbxHistory(
  organizationId: string,
  from: Date,
  to: Date,
): Promise<OnlinePbxHistoryRow[]> {
  const data = await pbxRequest(organizationId, "history/search.json", {
    date_from: from.toUTCString(),
    date_to: to.toUTCString(),
  });
  return Array.isArray(data) ? (data as OnlinePbxHistoryRow[]) : [];
}

/** Sends a plain SMS through OnlinePBX's own SMS gateway, if the tenant has one enabled. */
export async function sendOnlinePbxSms(
  organizationId: string,
  toNumber: string,
  message: string,
): Promise<{ externalMessageId: string | null }> {
  const creds = await getCredentials(organizationId);
  const data = (await pbxRequest(organizationId, "sms/send.json", {
    phone: toNumber,
    text: message,
    sender: creds.sms_sender_name || "",
  })) as { id?: string | number } | null;
  return { externalMessageId: data?.id != null ? String(data.id) : null };
}
