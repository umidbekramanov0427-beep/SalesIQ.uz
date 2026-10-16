// Server-only. Instagram Direct for a company's own Instagram professional
// account, through Meta's "Instagram API with Instagram Login" (no Facebook
// Page needed). One Meta app serves every company:
//   INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET -- the app's Instagram app id/secret
//   INSTAGRAM_WEBHOOK_VERIFY_TOKEN        -- any string, also typed into Meta
//   INSTAGRAM_REDIRECT_URI (optional)     -- defaults to <PUBLIC_APP_URL>/integrations/instagram/callback
// Each company's long-lived token (60 days, refreshed here as it ages) is
// sealed in instagram_accounts.access_token_sealed.
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { openSecret, sealSecret } from "@/lib/secret-box.server";
import { isInstagramCdnUrl } from "./events";

const GRAPH = "https://graph.instagram.com/v21.0";
const DAY = 86_400_000;

export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"];

const env = (k: string) => process.env[k]?.trim() || null;

export function instagramConfigured(): boolean {
  return !!(env("INSTAGRAM_APP_ID") && env("INSTAGRAM_APP_SECRET"));
}

export function instagramVerifyToken(): string | null {
  return env("INSTAGRAM_WEBHOOK_VERIFY_TOKEN");
}

export function instagramRedirectUri(): string {
  const app = (env("PUBLIC_APP_URL") ?? "https://salesiq.uz").replace(/\/$/, "");
  return env("INSTAGRAM_REDIRECT_URI") ?? `${app}/integrations/instagram/callback`;
}

function secret(): string {
  const s = env("INSTAGRAM_APP_SECRET");
  if (!s) throw new Error("Instagram is not configured (INSTAGRAM_APP_SECRET)");
  return s;
}

/* ---------------------------- OAuth state ----------------------------- */

export type ConnectState = { org: string; uid: string; ret: string; exp: number };

/** The OAuth `state`: who started the connection and where to return, signed. */
export function signState(state: ConnectState): string {
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(`ig-state:${body}`).digest("base64url");
  return `${body}.${mac}`;
}

export function readState(raw: string): ConnectState | null {
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  const want = crypto.createHmac("sha256", secret()).update(`ig-state:${body}`).digest("base64url");
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac)))
    return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ConnectState;
    return s.exp > Date.now() && s.org && s.uid ? s : null;
  } catch {
    return null;
  }
}

export function authorizeUrl(state: string): string {
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", env("INSTAGRAM_APP_ID") ?? "");
  u.searchParams.set("redirect_uri", instagramRedirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  u.searchParams.set("state", state);
  return u.toString();
}

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). */
export function validSignature(raw: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const want = crypto.createHmac("sha256", secret()).update(raw).digest("hex");
  const got = header.slice(7);
  return want.length === got.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

/* ------------------------------ Graph API ----------------------------- */

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number } };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const json = (await res.json().catch(() => ({}))) as T &
      GraphError & { error_message?: string };
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? json.error_message ?? `Instagram: HTTP ${res.status}`;
      throw new InstagramError(msg, json.error?.code ?? null, json.error?.error_subcode ?? null);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export class InstagramError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly subcode: number | null,
  ) {
    super(message);
  }
}

/** The person-facing reason a reply didn't go out. */
export function sendErrorMessage(err: unknown): string {
  if (err instanceof InstagramError) {
    // 10 / 2534022: outside the 24-hour window after the client's last message.
    if (err.code === 10 || err.subcode === 2534022 || /window|24/i.test(err.message))
      return "Instagram faqat mijozning oxirgi xabaridan keyin 24 soat ichida javob berishga ruxsat beradi.";
    if (err.code === 190)
      return "Instagram ulanishi eskirgan — Integratsiyalar → Instagram'da qayta ulang.";
    return `Instagram: ${err.message}`;
  }
  return err instanceof Error ? err.message : "Instagram'ga yuborib bo'lmadi.";
}

/** Code → long-lived token (60 days). */
export async function exchangeCode(code: string): Promise<{ token: string; expiresAt: string }> {
  const form = new URLSearchParams({
    client_id: env("INSTAGRAM_APP_ID") ?? "",
    client_secret: secret(),
    grant_type: "authorization_code",
    redirect_uri: instagramRedirectUri(),
    code,
  });
  const short = await call<{ access_token: string }>(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      body: form,
    },
  );
  const long = await call<{ access_token: string; expires_in?: number }>(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(secret())}&access_token=${encodeURIComponent(short.access_token)}`,
  );
  return {
    token: long.access_token,
    expiresAt: new Date(Date.now() + (long.expires_in ?? 60 * 86400) * 1000).toISOString(),
  };
}

export type IgMe = {
  user_id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
};

export async function fetchMe(token: string): Promise<IgMe> {
  const me = await call<IgMe & { user_id: string | number }>(
    `${GRAPH}/me?fields=user_id,username,name,profile_picture_url&access_token=${encodeURIComponent(token)}`,
  );
  return { ...me, user_id: String(me.user_id) };
}

/** Turns on Direct message webhooks for this account. */
export async function subscribeMessages(token: string): Promise<void> {
  await call(
    `${GRAPH}/me/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(token)}`,
    { method: "POST" },
  );
}

export type IgProfile = { name: string | null; username: string | null; photo: string | null };

/** A client's name, username and photo (allowed once they have written to us). */
export async function fetchClientProfile(token: string, igsid: string): Promise<IgProfile> {
  const p = await call<{ name?: string; username?: string; profile_pic?: string }>(
    `${GRAPH}/${encodeURIComponent(igsid)}?fields=name,username,profile_pic&access_token=${encodeURIComponent(token)}`,
  ).catch(() => ({}) as { name?: string; username?: string; profile_pic?: string });
  return { name: p.name ?? null, username: p.username ?? null, photo: p.profile_pic ?? null };
}

export async function sendInstagramText(
  token: string,
  igsid: string,
  text: string,
): Promise<string | null> {
  const r = await call<{ message_id?: string }>(`${GRAPH}/me/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipient: { id: igsid }, message: { text: text.slice(0, 1000) } }),
  });
  return r.message_id ?? null;
}

export type IgAttachmentType = "image" | "video" | "audio" | "file";

/** A file Instagram downloads from `url` (it must be publicly reachable for a while). */
export async function sendInstagramAttachment(
  token: string,
  igsid: string,
  type: IgAttachmentType,
  url: string,
): Promise<string | null> {
  const r = await call<{ message_id?: string }>(`${GRAPH}/me/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      recipient: { id: igsid },
      message: { attachment: { type, payload: { url } } },
    }),
  });
  return r.message_id ?? null;
}

/** Which Instagram attachment type a file goes as, or null when it can't. */
export function attachmentTypeFor(mime: string): IgAttachmentType | null {
  if (/^image\/(jpeg|png|gif|webp)$/.test(mime)) return "image";
  if (/^video\/(mp4|quicktime|webm|x-msvideo)$/.test(mime)) return "video";
  if (/^audio\/(mpeg|mp4|aac|wav|ogg|x-m4a)$/.test(mime)) return "audio";
  if (mime === "application/pdf") return "file";
  return null;
}

/* --------------------------- Stored accounts -------------------------- */

export type IgAccount = {
  id: string;
  organization_id: string;
  ig_user_id: string;
  username: string | null;
  token: string;
  token_expires_at: string | null;
};

type AccountRow = {
  id: string;
  organization_id: string;
  ig_user_id: string;
  username: string | null;
  access_token_sealed: string;
  token_expires_at: string | null;
  connected_at: string;
};

const ACCOUNT_COLUMNS =
  "id, organization_id, ig_user_id, username, access_token_sealed, token_expires_at, connected_at";

async function opened(row: AccountRow | null): Promise<IgAccount | null> {
  if (!row) return null;
  const token = openSecret(row.access_token_sealed);
  if (!token) return null;
  const account: IgAccount = {
    id: row.id,
    organization_id: row.organization_id,
    ig_user_id: row.ig_user_id,
    username: row.username,
    token,
    token_expires_at: row.token_expires_at,
  };
  return refreshIfAging(account, row.connected_at);
}

export async function accountForOrg(organizationId: string): Promise<IgAccount | null> {
  const { data } = await supabaseAdmin
    .from("instagram_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return opened(data as AccountRow | null);
}

export async function accountForIgUser(igUserId: string): Promise<IgAccount | null> {
  const { data } = await supabaseAdmin
    .from("instagram_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("ig_user_id", igUserId)
    .maybeSingle();
  return opened(data as AccountRow | null);
}

/** Long-lived tokens last 60 days; refresh once fewer than 20 are left. */
async function refreshIfAging(account: IgAccount, connectedAt: string): Promise<IgAccount> {
  const exp = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  // A token can only be refreshed once it is at least a day old.
  if (!exp || exp - Date.now() > 20 * DAY || Date.now() - new Date(connectedAt).getTime() < DAY)
    return account;
  try {
    const r = await call<{ access_token: string; expires_in?: number }>(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(account.token)}`,
    );
    const expiresAt = new Date(Date.now() + (r.expires_in ?? 60 * 86400) * 1000).toISOString();
    await supabaseAdmin
      .from("instagram_accounts")
      .update({ access_token_sealed: sealSecret(r.access_token), token_expires_at: expiresAt })
      .eq("id", account.id);
    return { ...account, token: r.access_token, token_expires_at: expiresAt };
  } catch {
    return account;
  }
}

export async function saveAccount(input: {
  organizationId: string;
  connectedBy: string;
  me: IgMe;
  token: string;
  expiresAt: string;
}): Promise<void> {
  // An Instagram account belongs to one company at a time.
  await supabaseAdmin
    .from("instagram_accounts")
    .delete()
    .eq("ig_user_id", input.me.user_id)
    .neq("organization_id", input.organizationId);
  const { error } = await supabaseAdmin.from("instagram_accounts").upsert(
    {
      organization_id: input.organizationId,
      ig_user_id: input.me.user_id,
      username: input.me.username ?? null,
      name: input.me.name ?? null,
      picture_url: input.me.profile_picture_url ?? null,
      access_token_sealed: sealSecret(input.token),
      token_expires_at: input.expiresAt,
      connected_by: input.connectedBy,
      connected_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "organization_id" },
  );
  if (error) throw error;
}

/* ------------------------------- Media -------------------------------- */

const MAX_MEDIA = 25 * 1024 * 1024;

/** A file from Meta's CDN (a client's photo, voice, video), or null. */
export async function fetchInstagramMedia(
  url: string,
): Promise<{ data: ArrayBuffer; type: string } | null> {
  if (!isInstagramCdnUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_MEDIA) return null;
    const data = await res.arrayBuffer();
    if (data.byteLength > MAX_MEDIA) return null;
    return { data, type: res.headers.get("content-type") ?? "application/octet-stream" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Files the team sends are kept in Storage; the chat refers to them as "storage:<path>". */
export const STORAGE_PREFIX = "storage:";
const BUCKET = "lead-files";

/** Saves an outgoing file and returns its path plus a 1-hour URL for Instagram to fetch. */
export async function stageOutgoingFile(
  organizationId: string,
  file: { name: string; type: string; data: Uint8Array },
): Promise<{ path: string; url: string }> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "file";
  const path = `${organizationId}/instagram/${crypto.randomUUID()}-${safe}`;
  const up = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file.data, { contentType: file.type, upsert: false });
  if (up.error) throw up.error;
  const signed = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (signed.error || !signed.data) throw signed.error ?? new Error("No signed URL");
  return { path, url: signed.data.signedUrl };
}

/** A file the team sent earlier (only the company's own). */
export async function readOutgoingFile(
  organizationId: string,
  path: string,
): Promise<{ data: ArrayBuffer; type: string } | null> {
  if (!path.startsWith(`${organizationId}/instagram/`) || path.includes("..")) return null;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return { data: await data.arrayBuffer(), type: data.type || "application/octet-stream" };
}
