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

export async function tgStartLogin(phone: string): Promise<string> {
  const r = await json<{ loginId: string }>(await call("/v1/login/start", { phone }));
  return r.loginId;
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
