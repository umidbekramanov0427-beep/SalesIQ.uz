// Server-only. "Telegram orqali kirish" on /login, through the staff bot
// (not the Login Widget, which works for one bot on one domain -- this has
// to work on every company subdomain too):
//
// 1. The page asks /telegram/login-start for a request. It gets a random
//    secret that only it holds; the t.me link carries a hash of that
//    secret (the row's `token`), so seeing the link alone never signs
//    anyone in, and the request is bound to that one browser page.
// 2. t.me/<bot>?start=login_<token>: the bot finds the person by the chat's
//    linked telegram_chat_id (Sozlamalar -> Telegram) and asks "Kirishni
//    tasdiqlaysizmi?" with two buttons. Not linked -> it says to link first,
//    and the page shows the same.
// 3. "Tasdiqlash": the server makes a one-time magic-link token for that
//    person and stores it on the row; the page, polling with its secret,
//    takes it once (the row turns "used") and signs in with verifyOtp.
//
// Requests live 5 minutes. Starting is limited per IP, asking the bot per
// chat, and polling per request. The sign-in itself is recorded like any
// other (/account/login-event, marked "telegram_sign_in").
import { createHash, randomBytes } from "node:crypto";

export const TELEGRAM_LOGIN_TTL_MS = 5 * 60_000;
const START_LIMIT = { max: 8, windowMs: 10 * 60_000 };
const BOT_LIMIT = { max: 6, windowMs: 10 * 60_000 };
const POLL_LIMIT = 400;

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

// ---- small in-memory limits (one server process) ----------------------------

const hits = new Map<string, number[]>();
function overLimit(key: string, { max, windowMs }: { max: number; windowMs: number }): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return true;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000)
    for (const [k, v] of hits) if (!v.some((t) => now - t < 3_600_000)) hits.delete(k);
  return false;
}
const polls = new Map<string, number>();

/** The row key for a page secret (what the t.me link carries). */
export function tokenForSecret(secret: string): string {
  return createHash("sha256").update(`tglogin:${secret}`).digest("hex").slice(0, 40);
}

const TOKEN_RE = /^[a-f0-9]{40}$/;
export const LOGIN_START_RE = /^\/start login_([a-f0-9]{40})\s*$/;
const CALLBACK_RE = /^tl(ok|no):([a-f0-9]{40})$/;

async function loginBotUsername(): Promise<string | null> {
  const { botUsername, refreshBotTokens } = await import("@/lib/bot-tokens.server");
  await refreshBotTokens();
  const staff = await botUsername("staff");
  if (staff) return staff;
  const { getTelegramBotUsername } = await import("@/lib/telegram-report.server");
  return getTelegramBotUsername().catch(() => null);
}

export async function startTelegramLogin(
  ip: string | null,
): Promise<{ ok: true; secret: string; url: string } | { ok: false; error: string }> {
  if (overLimit(`start:${ip ?? "?"}`, START_LIMIT)) return { ok: false, error: "too_many" };
  const bot = await loginBotUsername();
  if (!bot) return { ok: false, error: "not_configured" };
  const secret = randomBytes(24).toString("base64url");
  const token = tokenForSecret(secret);
  const db = await admin();
  // Old requests go away as new ones come in.
  await db
    .from("telegram_login_requests")
    .delete()
    .lt("expires_at", new Date(Date.now() - 3_600_000).toISOString());
  const { error } = await db.from("telegram_login_requests").insert({
    token,
    status: "pending",
    expires_at: new Date(Date.now() + TELEGRAM_LOGIN_TTL_MS).toISOString(),
  });
  if (error) return { ok: false, error: "failed" };
  return { ok: true, secret, url: `https://t.me/${bot}?start=login_${token}` };
}

export type TelegramLoginPoll =
  | { status: "pending" | "not_linked" | "denied" | "expired" | "too_many" }
  | { status: "confirmed"; tokenHash: string };

export async function pollTelegramLogin(secret: string): Promise<TelegramLoginPoll> {
  if (typeof secret !== "string" || secret.length < 20 || secret.length > 64)
    return { status: "expired" };
  const token = tokenForSecret(secret);
  const n = (polls.get(token) ?? 0) + 1;
  polls.set(token, n);
  if (n > POLL_LIMIT) return { status: "too_many" };
  const db = await admin();
  const { data: row } = await db
    .from("telegram_login_requests")
    .select("status, token_hash, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!row || row.status === "used") return { status: "expired" };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.from("telegram_login_requests").delete().eq("token", token);
    polls.delete(token);
    return { status: "expired" };
  }
  if (row.status === "confirmed" && row.token_hash) {
    // Taken once: only the request that flips it to "used" gets the token.
    const { data: taken } = await db
      .from("telegram_login_requests")
      .update({ status: "used", token_hash: null })
      .eq("token", token)
      .eq("status", "confirmed")
      .select("token")
      .maybeSingle();
    polls.delete(token);
    return taken ? { status: "confirmed", tokenHash: row.token_hash } : { status: "expired" };
  }
  if (row.status === "not_linked" || row.status === "denied") return { status: row.status };
  return { status: "pending" };
}

// ---- the bot's side ---------------------------------------------------------------

type Profile = { id: string; email: string | null; full_name: string | null; role: string | null };

async function profileForChat(chatId: number): Promise<Profile | null> {
  const { data } = await (
    await admin()
  )
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

async function liveRequest(token: string) {
  const { data } = await (
    await admin()
  )
    .from("telegram_login_requests")
    .select("status, user_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.status !== "pending") return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

/** "/start login_<token>" from a private chat. True when it was one. */
export async function handleTelegramLoginStart(chatId: number, text: string): Promise<boolean> {
  if (!/^\/start login_/.test(text)) return false;
  const { sendTelegramMessage, sendTelegramMessageWithMarkup } =
    await import("@/lib/telegram-report.server");
  const token = text.match(LOGIN_START_RE)?.[1];
  if (overLimit(`bot:${chatId}`, BOT_LIMIT)) {
    await sendTelegramMessage(chatId, "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.");
    return true;
  }
  const req = token && TOKEN_RE.test(token) ? await liveRequest(token) : null;
  if (!token || !req) {
    await sendTelegramMessage(
      chatId,
      "⌛️ Kirish havolasining muddati tugagan. Saytda «Telegram orqali kirish»ni qaytadan bosing.",
    );
    return true;
  }
  const db = await admin();
  const who = await profileForChat(chatId);
  if (!who?.email || who.role === "platform_owner") {
    await db
      .from("telegram_login_requests")
      .update({ status: "not_linked" })
      .eq("token", token)
      .eq("status", "pending");
    await sendTelegramMessage(
      chatId,
      who?.role === "platform_owner"
        ? "Platforma egasi Telegram orqali kira olmaydi — email, parol va tasdiqlash kodi bilan kiring."
        : "Bu Telegram SalesIQ profilingizga ulanmagan. Avval saytga email va parol bilan kiring, keyin Sozlamalar → Telegram bo'limida Telegram'ni ulang.",
    );
    return true;
  }
  // The request now belongs to this person; only their chat can confirm it.
  await db
    .from("telegram_login_requests")
    .update({ user_id: who.id, email: who.email })
    .eq("token", token)
    .eq("status", "pending");
  await sendTelegramMessageWithMarkup(
    chatId,
    `🔐 <b>SalesIQ'ga kirishni tasdiqlaysizmi?</b>\n\n${escapeHtml(who.full_name ?? who.email)} sifatida kirish so'raldi. Agar bu siz bo'lmasangiz, «Rad etish»ni bosing.\n\nSo'rov 5 daqiqa amal qiladi.`,
    {
      inline_keyboard: [
        [
          { text: "✅ Tasdiqlash", callback_data: `tlok:${token}` },
          { text: "✖️ Rad etish", callback_data: `tlno:${token}` },
        ],
      ],
    },
  );
  return true;
}

/** A tap on "Tasdiqlash" / "Rad etish". True when the button was one of ours. */
export async function handleTelegramLoginCallback(cq: {
  id: string;
  data?: string;
  from?: { id?: number };
  message?: { message_id?: number; chat?: { id?: number; type?: string } };
}): Promise<boolean> {
  const m = (cq.data ?? "").match(CALLBACK_RE);
  if (!m) return false;
  const [, action, token] = m as unknown as [string, "ok" | "no", string];
  const chatId = cq.message?.chat?.id;
  const { callTelegramMethod } = await import("@/lib/telegram-report.server");
  const { sendViaChatBot } = await import("@/lib/bot-tokens.server");
  const answer = (text: string, final?: string) =>
    chatId
      ? sendViaChatBot(chatId, async (botToken) => {
          await callTelegramMethod(botToken, "answerCallbackQuery", {
            callback_query_id: cq.id,
            text,
          }).catch(() => undefined);
          if (final && cq.message?.message_id) {
            await callTelegramMethod(botToken, "editMessageText", {
              chat_id: chatId,
              message_id: cq.message.message_id,
              text: final,
            }).catch(() => undefined);
          }
        }).catch(() => undefined)
      : Promise.resolve();

  // Only the private chat the question went to, and only its own person.
  if (!chatId || cq.message?.chat?.type !== "private" || cq.from?.id !== chatId) {
    await answer("Bu tugma siz uchun emas.");
    return true;
  }
  const req = await liveRequest(token);
  const who = await profileForChat(chatId);
  if (!req || !who?.email || req.user_id !== who.id) {
    await answer(
      "So'rov eskirgan.",
      "⌛️ So'rovning muddati tugagan. Saytda qaytadan urinib ko'ring.",
    );
    return true;
  }
  const db = await admin();
  if (action === "no") {
    await db
      .from("telegram_login_requests")
      .update({ status: "denied" })
      .eq("token", token)
      .eq("status", "pending");
    await answer(
      "Rad etildi.",
      "✖️ Kirish rad etildi. Agar bu siz bo'lmasangiz, parolingizni almashtiring.",
    );
    return true;
  }
  const { data: link, error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: who.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (error || !tokenHash) {
    await answer("Xatolik. Qayta urinib ko'ring.");
    return true;
  }
  const { data: done } = await db
    .from("telegram_login_requests")
    .update({ status: "confirmed", token_hash: tokenHash })
    .eq("token", token)
    .eq("status", "pending")
    .select("token")
    .maybeSingle();
  await answer(
    done ? "Tasdiqlandi." : "So'rov eskirgan.",
    done
      ? "✅ Tasdiqlandi. Saytga qayting — sahifa o'zi ochiladi."
      : "⌛️ So'rovning muddati tugagan. Saytda qaytadan urinib ko'ring.",
  );
  return true;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
