// Server-only. The app's side of services/tg-live: the company's Telegram
// account (MTProto) reads how many people watch a channel's live stream and
// takes a frame -- things a bot is not told. The service runs on the VPS at
// TGLIVE_URL with TGLIVE_SECRET; the account's session is kept sealed in
// marketing_tg_accounts and passed along on each call.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { openSecret, sealSecret } from "@/lib/secret-box.server";

export function tgLiveConfigured(): boolean {
  return !!process.env["TGLIVE_URL"] && !!process.env["TGLIVE_SECRET"];
}

async function call(path: string, body: Record<string, unknown>, timeoutMs = 25_000) {
  const base = process.env["TGLIVE_URL"];
  const secret = process.env["TGLIVE_SECRET"];
  if (!base || !secret) throw new Error("tg-live sozlanmagan");
  return fetch(`${base.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tglive-secret": secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function json<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { detail?: string };
  if (!res.ok)
    throw new Error(typeof data.detail === "string" ? data.detail : `tg-live ${res.status}`);
  return data;
}

/** Where Telegram sent the sign-in code (app / sms / call / email / ...) and where a resend goes. */
export type CodeInfo = { via: string; next: string | null; timeout: number | null };

export async function tgStartLogin(phone: string): Promise<{ loginId: string } & CodeInfo> {
  const r = await json<{ loginId: string } & Partial<CodeInfo>>(
    await call("/v1/login/start", { phone }),
  );
  return {
    loginId: r.loginId,
    via: r.via ?? "app",
    next: r.next ?? null,
    timeout: r.timeout ?? null,
  };
}

/** Asks Telegram to send the code again, the next way it offers. */
export async function tgResendCode(loginId: string): Promise<CodeInfo> {
  const r = await json<Partial<CodeInfo>>(await call("/v1/login/resend", { login_id: loginId }));
  return { via: r.via ?? "other", next: r.next ?? null, timeout: r.timeout ?? null };
}

/** Finishes the sign-in; on success the sealed session is saved for the company. */
export async function tgFinishLogin(input: {
  orgId: string;
  userId: string;
  loginId: string;
  code: string;
  password?: string | undefined;
  phone: string;
}): Promise<{ needPassword: boolean; user?: string }> {
  const r = await json<{ needPassword?: boolean; session?: string; user?: string }>(
    await call("/v1/login/code", {
      login_id: input.loginId,
      code: input.code,
      ...(input.password ? { password: input.password } : {}),
    }),
  );
  if (r.needPassword) return { needPassword: true };
  if (!r.session) throw new Error("Telegram sessiyani bermadi");
  const digits = input.phone.replace(/\D/g, "");
  const masked = digits.length > 6 ? `+${digits.slice(0, 5)}***${digits.slice(-4)}` : null;
  const { error } = await supabaseAdmin.from("marketing_tg_accounts").upsert(
    {
      organization_id: input.orgId,
      session_sealed: sealSecret(r.session),
      phone_masked: masked,
      tg_user: r.user ?? null,
      status: "ok",
      last_error: null,
      connected_by: input.userId,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw error;
  return { needPassword: false, ...(r.user ? { user: r.user } : {}) };
}

export type LiveState = { live: boolean; participants: number | null; title: string | null };

export async function tgLive(session: string, channel: string): Promise<LiveState> {
  const res = await call("/v1/live", { session, channel });
  if (res.status === 401) throw new SessionRevoked();
  return json<LiveState>(res);
}

export async function tgFrame(session: string, channel: string): Promise<Uint8Array | null> {
  const res = await call("/v1/frame", { session, channel }, 40_000);
  if (res.status === 401) throw new SessionRevoked();
  if (res.status !== 200) return null;
  return new Uint8Array(await res.arrayBuffer());
}

/** A YouTube live stream's current frame (yt-dlp + ffmpeg on the VPS); null when none. */
export async function ytFrame(videoId: string): Promise<Uint8Array | null> {
  const res = await call("/v1/youtube-frame", { video_id: videoId }, 90_000);
  if (res.status !== 200) return null;
  const data = new Uint8Array(await res.arrayBuffer());
  return data.length > 1000 ? data : null;
}

/** The account is not an admin of the channel (or Telegram has no statistics for it). */
export class AdminRequired extends Error {}

async function adminCall<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await call(path, body, 60_000);
  if (res.status === 401) throw new SessionRevoked();
  if (res.status === 403) {
    const d = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new AdminRequired(d.detail ?? "admin_required");
  }
  return json<T>(res);
}

/** Telegram's own statistics of the channel (what its admins see). */
export function tgChannelStats(session: string, channel: string): Promise<unknown> {
  return adminCall("/v1/channel-stats", { session, channel });
}

export type AdminLogEvent = {
  at: number;
  kind: "join" | "leave";
  user: number;
  link: string | null;
  name: string | null;
  chatlist: boolean;
};

/** Joins and leaves from the channel's recent actions since a moment (seconds). */
export async function tgAdminLog(
  session: string,
  channel: string,
  since: number,
): Promise<AdminLogEvent[]> {
  const r = await adminCall<{ events: AdminLogEvent[] }>("/v1/admin-log", {
    session,
    channel,
    since,
  });
  return r.events ?? [];
}

export class SessionRevoked extends Error {
  constructor() {
    super("Telegram sessiyasi bekor qilingan: akkauntni qayta ulang.");
  }
}

/** The companies' connected accounts: org -> session. */
export async function tgSessions(orgIds?: string[]): Promise<Map<string, string>> {
  let q = supabaseAdmin
    .from("marketing_tg_accounts")
    .select("organization_id, session_sealed")
    .eq("status", "ok");
  if (orgIds) q = q.in("organization_id", orgIds);
  const { data } = await q;
  const out = new Map<string, string>();
  for (const a of data ?? []) {
    const s = openSecret(a.session_sealed);
    if (s) out.set(a.organization_id, s);
  }
  return out;
}

export async function tgMarkBroken(orgId: string, message: string) {
  await supabaseAdmin
    .from("marketing_tg_accounts")
    .update({ status: "error", last_error: message.slice(0, 300) })
    .eq("organization_id", orgId);
}
