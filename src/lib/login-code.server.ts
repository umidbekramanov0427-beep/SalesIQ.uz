// Server-only. Sign-in confirmation code: whether this sign-in (one
// Supabase auth session) still has to enter the code, sending it by email
// or Telegram, and checking it. getRequestUserId (auth.server.ts) asks
// sessionBlocked() so the app's API stays closed until the code is entered.
import { createHash, randomInt } from "node:crypto";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  formatCode,
  maskEmail,
  pickChannel,
  resendWait,
  type CodeChannel,
} from "@/lib/login-code";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/** The platform's own mailbox for sign-in codes (PLATFORM_SMTP_* env). */
export function platformSmtp() {
  const host = process.env["PLATFORM_SMTP_HOST"];
  const username = process.env["PLATFORM_SMTP_USER"];
  const password = process.env["PLATFORM_SMTP_PASS"];
  if (!host || !username || !password) return null;
  return {
    host,
    port: Number(process.env["PLATFORM_SMTP_PORT"] ?? 465) || 465,
    username,
    password,
    fromEmail: process.env["PLATFORM_SMTP_FROM"] || username,
    fromName: "SalesIQ",
  };
}

// The owner's switch, re-read at most once a minute.
let enabledCache: { on: boolean; at: number } | null = null;
export async function loginCodeEnabled(): Promise<boolean> {
  if (enabledCache && Date.now() - enabledCache.at < 60_000) return enabledCache.on;
  const { data, error } = await (
    await admin()
  )
    .from("platform_settings")
    .select("login_code_enabled")
    .eq("id", true)
    .maybeSingle();
  // Before the migration (or on an error) the code is simply not asked.
  const on = !error && !!data?.login_code_enabled;
  enabledCache = { on, at: Date.now() };
  return on;
}
export function forgetLoginCodeSetting() {
  enabledCache = null;
}

// Sessions already cleared (confirmed, or that need no code), so the check
// costs nothing after the first request.
const cleared = new Map<string, number>();
const CLEARED_TTL_MS = 12 * 3600_000;

type Person = {
  role: string | null;
  email: string | null;
  telegram_chat_id: string | number | null;
};

async function person(userId: string): Promise<Person | null> {
  const { data } = await (
    await admin()
  )
    .from("profiles")
    .select("role, email, telegram_chat_id")
    .eq("id", userId)
    .maybeSingle();
  return (data as Person | null) ?? null;
}

function channelFor(p: Person | null): CodeChannel | null {
  // The platform owner signs in with their authenticator (2FA) instead.
  if (!p || p.role === "platform_owner") return null;
  return pickChannel({
    smtpReady: !!platformSmtp(),
    email: p.email,
    telegramChatId: p.telegram_chat_id,
  });
}

export type LoginCodeStatus = {
  required: boolean;
  verified: boolean;
  channel: CodeChannel | null;
  to: string | null;
  wait: number;
};

// Only a password sign-in is asked for the code: the owner's "Kirish" into a
// company (a magic link), Google and the subdomain handoff are not.
export function isPasswordSignIn(methods: string[]): boolean {
  return methods.includes("password");
}

export async function loginCodeStatus(
  userId: string,
  sessionId: string | null,
  methods: string[],
): Promise<LoginCodeStatus> {
  const none = { required: false, verified: true, channel: null, to: null, wait: 0 };
  if (!sessionId || !isPasswordSignIn(methods) || !(await loginCodeEnabled())) return none;
  const p = await person(userId);
  const channel = channelFor(p);
  if (!channel) return none;
  const { data: row } = await (
    await admin()
  )
    .from("login_codes")
    .select("verified_at, sent_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  const verified = !!row?.verified_at;
  if (verified) cleared.set(sessionId, Date.now());
  return {
    required: true,
    verified,
    channel,
    to: channel === "email" && p?.email ? maskEmail(p.email) : "Telegram",
    wait: resendWait(row?.sent_at ?? null),
  };
}

/** True while this sign-in still has to enter its code (the API stays closed). */
export async function sessionBlocked(
  userId: string,
  sessionId: string | null,
  methods: string[],
): Promise<boolean> {
  if (!sessionId || !isPasswordSignIn(methods)) return false;
  const at = cleared.get(sessionId);
  if (at && Date.now() - at < CLEARED_TTL_MS) return false;
  if (!(await loginCodeEnabled())) return false;
  try {
    const s = await loginCodeStatus(userId, sessionId, methods);
    if (!s.required || s.verified) {
      cleared.set(sessionId, Date.now());
      return false;
    }
    return true;
  } catch {
    // Never lock people out on our own error.
    return false;
  }
}

function hash(code: string, sessionId: string): string {
  const secret = process.env["LOGIN_CODE_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createHash("sha256").update(`${sessionId}:${code}:${secret}`).digest("hex");
}

export async function sendLoginCode(
  userId: string,
  sessionId: string,
): Promise<{ ok: true; channel: CodeChannel } | { ok: false; error: string; wait?: number }> {
  const p = await person(userId);
  const channel = channelFor(p);
  if (!channel || !p) return { ok: false, error: "NO_CHANNEL" };
  const db = await admin();
  const { data: row } = await db
    .from("login_codes")
    .select("sent_at, verified_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (row?.verified_at) return { ok: false, error: "ALREADY" };
  const wait = resendWait(row?.sent_at ?? null);
  if (wait > 0) return { ok: false, error: "WAIT", wait };

  const code = formatCode(randomInt(0, 1_000_000));
  const now = new Date();
  const { error } = await db.from("login_codes").upsert({
    session_id: sessionId,
    user_id: userId,
    code_hash: hash(code, sessionId),
    channel,
    attempts: 0,
    sent_at: now.toISOString(),
    expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
  });
  if (error) return { ok: false, error: "SAVE_FAILED" };

  const text = `SalesIQ: kirish kodi ${code}\n\nKod 10 daqiqa amal qiladi. Agar siz kirmayotgan bo'lsangiz, parolingizni almashtiring.`;
  try {
    if (channel === "email") {
      const { sendSmtpEmail } = await import("@/lib/email/smtp-client.server");
      await sendSmtpEmail(platformSmtp()!, {
        to: p.email!,
        subject: `SalesIQ kirish kodi: ${code}`,
        body: text,
      });
    } else {
      const { sendTelegramMessage } = await import("@/lib/telegram-report.server");
      await sendTelegramMessage(Number(p.telegram_chat_id), `🔐 ${text}`);
    }
  } catch {
    return { ok: false, error: "SEND_FAILED" };
  }
  return { ok: true, channel };
}

export async function verifyLoginCode(
  userId: string,
  sessionId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: "WRONG" | "EXPIRED" | "TOO_MANY" | "NO_CODE" }> {
  const db = await admin();
  const { data: row } = await db
    .from("login_codes")
    .select("code_hash, attempts, expires_at, verified_at, user_id")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!row || row.user_id !== userId || !row.code_hash) return { ok: false, error: "NO_CODE" };
  if (row.verified_at) return { ok: true };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "TOO_MANY" };
  if (!row.expires_at || Date.parse(row.expires_at) < Date.now())
    return { ok: false, error: "EXPIRED" };
  if (hash(code.replace(/\D/g, ""), sessionId) !== row.code_hash) {
    await db
      .from("login_codes")
      .update({ attempts: row.attempts + 1 })
      .eq("session_id", sessionId);
    return { ok: false, error: row.attempts + 1 >= MAX_ATTEMPTS ? "TOO_MANY" : "WRONG" };
  }
  await db
    .from("login_codes")
    .update({ verified_at: new Date().toISOString(), code_hash: null })
    .eq("session_id", sessionId);
  cleared.set(sessionId, Date.now());
  return { ok: true };
}
