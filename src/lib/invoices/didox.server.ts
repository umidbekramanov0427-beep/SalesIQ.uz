import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { openSecret, sealSecret } from "@/lib/secret-box.server";

// Didox (didox.uz), the e-document operator: the company logs in with its
// TIN and Didox password (stored encrypted, org_didox_credentials); the
// session token is cached until it expires. An invoice goes in as a draft
// of document type 002, which the company signs with its E-IMZO key in
// Didox itself (signing needs the company's own key, never the server's).
//
// DIDOX_API_URL overrides the address; DIDOX_PARTNER_TOKEN is sent as
// Partner-Authorization when SalesIQ has a partner agreement with Didox.

const BASE = () =>
  (process.env["DIDOX_API_URL"] || "https://api-partners.didox.uz").replace(/\/$/, "");
const TOKEN_TTL_MS = 50 * 60_000;

export class DidoxError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  userKey?: string,
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (userKey) headers["user-key"] = userKey;
  const partner = process.env["DIDOX_PARTNER_TOKEN"];
  if (partner) headers["Partner-Authorization"] = partner;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(`${BASE()}${path}`, {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new DidoxError(
      err instanceof Error && err.name === "AbortError"
        ? "Didox javob bermadi (20 soniya)"
        : "Didox bilan bog'lanib bo'lmadi",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const j = (json ?? {}) as { message?: unknown; error?: unknown; errors?: unknown };
    const msg =
      (typeof j.message === "string" && j.message) ||
      (typeof j.error === "string" && j.error) ||
      (j.errors ? JSON.stringify(j.errors).slice(0, 300) : "") ||
      text.slice(0, 300) ||
      `HTTP ${res.status}`;
    throw new DidoxError(msg, res.status);
  }
  return json as T;
}

/** Logs in with TIN + password; the session token. */
export async function didoxLogin(tin: string, password: string): Promise<string> {
  const data = await call<{ token?: string }>(
    "POST",
    `/v1/auth/${encodeURIComponent(tin)}/password/ru`,
    { password },
  );
  if (!data?.token) throw new DidoxError("Didox token bermadi", 500);
  return data.token;
}

/** Saves the company's Didox login after checking it works. */
export async function connectDidox(orgId: string, userId: string, tin: string, password: string) {
  const token = await didoxLogin(tin, password);
  const { error } = await supabaseAdmin.from("org_didox_credentials").upsert({
    organization_id: orgId,
    tin,
    password_enc: sealSecret(password),
    token_enc: sealSecret(token),
    token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    last_error: null,
    connected_by: userId,
    connected_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function didoxStatus(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from("org_didox_credentials")
    .select("tin, connected_at, last_error")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) return { ready: false as const, connected: false };
  return {
    ready: true as const,
    connected: !!data,
    tin: data?.tin ?? null,
    connectedAt: data?.connected_at ?? null,
    lastError: data?.last_error ?? null,
  };
}

/** A working session token for the company (cached, renewed when stale). */
async function tokenFor(orgId: string, forceNew = false): Promise<string> {
  const { data: cred } = await supabaseAdmin
    .from("org_didox_credentials")
    .select("tin, password_enc, token_enc, token_expires_at")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!cred) throw new DidoxError("Didox ulanmagan", 400);
  if (
    !forceNew &&
    cred.token_expires_at &&
    Date.parse(cred.token_expires_at) > Date.now() + 60_000
  ) {
    const cached = openSecret(cred.token_enc);
    if (cached) return cached;
  }
  const password = openSecret(cred.password_enc);
  if (!password)
    throw new DidoxError("Didox parolini qayta kiriting (Admin panel → Hisob-faktura)", 400);
  const token = await didoxLogin(cred.tin, password);
  await supabaseAdmin
    .from("org_didox_credentials")
    .update({
      token_enc: sealSecret(token),
      token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
      last_error: null,
    })
    .eq("organization_id", orgId);
  return token;
}

/** Calls Didox as the company, logging in again once if the token was refused. */
async function asCompany<T>(orgId: string, fn: (token: string) => Promise<T>): Promise<T> {
  try {
    return await fn(await tokenFor(orgId));
  } catch (err) {
    if (err instanceof DidoxError && (err.status === 401 || err.status === 403)) {
      return fn(await tokenFor(orgId, true));
    }
    throw err;
  }
}

const pickId = (d: unknown): string | null => {
  if (!d || typeof d !== "object") return null;
  const r = d as Record<string, unknown>;
  const id = r["_id"] ?? r["id"] ?? r["doc_id"] ?? r["document_id"] ?? r["documentId"];
  if (typeof id === "string" || typeof id === "number") return String(id);
  const inner = r["data"] ?? r["document"];
  return inner && inner !== d ? pickId(inner) : null;
};

/** Puts the invoice into Didox as a draft (type 002); the Didox document id. */
export async function createDidoxInvoice(orgId: string, body: unknown): Promise<string | null> {
  const data = await asCompany(orgId, (token) =>
    call<unknown>("POST", "/v1/documents/002/create", body, token),
  );
  return pickId(data);
}

/** The document's status text in Didox (e.g. draft, waiting, signed, rejected). */
export async function didoxDocumentStatus(orgId: string, id: string): Promise<string | null> {
  const data = await asCompany(orgId, (token) =>
    call<Record<string, unknown>>(
      "GET",
      `/v1/documents/${encodeURIComponent(id)}?owner=1`,
      undefined,
      token,
    ),
  );
  const doc = (data?.["document"] ?? data?.["data"] ?? data) as Record<string, unknown> | null;
  const status = doc?.["doc_status"] ?? doc?.["status"] ?? doc?.["state"];
  return status === undefined || status === null ? null : String(status);
}

export async function recordDidoxError(orgId: string, message: string) {
  await supabaseAdmin
    .from("org_didox_credentials")
    .update({ last_error: message.slice(0, 500) })
    .eq("organization_id", orgId);
}
