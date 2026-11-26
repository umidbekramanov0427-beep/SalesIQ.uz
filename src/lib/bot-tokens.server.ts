// Server-only. The platform's three Telegram bots and which one carries a
// message:
//   client -- talks to leads and clients (salesbots, lead chats, payment
//             links, receipts to clients). The token saved in Platforma ->
//             Botlar, else TELEGRAM_BOT_TOKEN.
//   staff  -- talks to the companies' people (tasks, reminders,
//             reports, sign-in codes). STAFF_TELEGRAM_BOT_TOKEN or the token
//             saved in Platforma -> Botlar (sealed in platform_private, server-only).
//   ops    -- talks to the platform owner (monitoring, alerts, backups).
//             OPS_TELEGRAM_BOT_TOKEN or the saved token.
// A company may also connect its own bot (org_telegram_bots, Integratsiyalar
// -> Telegram bot): its clients talk to that bot, and every message to a
// chat linked through it (lead_telegram_links.via_org_bot) goes through it.
// Without a staff / ops token everything keeps going through the client
// bot, as before. A person who linked Telegram through the staff bot is
// remembered in telegram_chat_bots, so every later message to their chat
// goes through that bot -- the senders need not know which bot it is.
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { openSecret, sealSecret } from "@/lib/secret-box.server";
import { webhookBase } from "@/lib/bot-tokens-url";
import { pickToken, tokenSource, type TokenSource } from "@/lib/bot-token-pick";

export type BotKind = "client" | "staff" | "ops";

const ENV: Record<BotKind, string> = {
  client: "TELEGRAM_BOT_TOKEN",
  staff: "STAFF_TELEGRAM_BOT_TOKEN",
  ops: "OPS_TELEGRAM_BOT_TOKEN",
};

const saved: { client: string | null; staff: string | null; ops: string | null; at: number } = {
  client: null,
  staff: null,
  ops: null,
  at: 0,
};

const COLUMN: Record<BotKind, string> = {
  client: "client_bot_token_sealed",
  staff: "staff_bot_token_sealed",
  ops: "ops_bot_token_sealed",
};

const envToken = (kind: BotKind) => process.env[ENV[kind]]?.trim() || null;

/** The bot's token: the one saved in the panel first, then the server setting. */
export function botToken(kind: BotKind): string | null {
  // Re-read the saved tokens now and then (never blocks the caller).
  if (Date.now() - saved.at > 60_000) void refreshBotTokens();
  return pickToken(saved[kind], envToken(kind));
}

export function botTokenSource(kind: BotKind): TokenSource {
  return tokenSource(saved[kind], envToken(kind));
}

/** Whether a server setting exists under the panel token (shown on the Botlar page). */
export function botHasEnvToken(kind: BotKind): boolean {
  return !!envToken(kind);
}

let refreshing: Promise<void> | null = null;

/** Reads the tokens saved in Platforma -> Botlar (at most once a minute unless forced). */
export async function refreshBotTokens(force = false): Promise<void> {
  if (!force && Date.now() - saved.at < 60_000) return;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      // "*": the client column is newer (20270211) and may not exist yet.
      const { data, error } = await supabaseAdmin
        .from("platform_private")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (!error) {
        const row = (data ?? {}) as Record<string, string | null | undefined>;
        for (const k of ["client", "staff", "ops"] as const) {
          const sealed = row[COLUMN[k]];
          saved[k] = sealed ? openSecret(sealed) : null;
        }
      }
    } catch {
      // Before the migration: no saved tokens.
    } finally {
      saved.at = Date.now();
      refreshing = null;
    }
  })();
  return refreshing;
}

const TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,}$/;

/** Checks a token with Telegram and saves it sealed (null removes it). */
export async function saveBotToken(
  kind: BotKind,
  token: string | null,
): Promise<{ username: string | null }> {
  let username: string | null = null;
  if (token) {
    const t = token.trim();
    if (!TOKEN_RE.test(t)) throw new Error("Token noto'g'ri ko'rinishda (masalan 123456789:AA...)");
    const me = await getMe(t);
    if (!me)
      throw new Error("Telegram bu tokenni qabul qilmadi: @BotFather'dagi tokenni tekshiring");
    const others = (["client", "staff", "ops"] as const).filter((k) => k !== kind);
    if (others.some((k) => botToken(k) === t)) {
      throw new Error(
        "Bu token boshqa bot uchun ishlatilyapti: avval u botning tokenini almashtiring yoki har bot uchun alohida bot oching",
      );
    }
    username = me.username;
    token = t;
  }
  const column = COLUMN[kind];
  const { error } = await supabaseAdmin.from("platform_private").upsert(
    {
      id: true,
      [column]: token ? sealSecret(token) : null,
      updated_at: new Date().toISOString(),
    } as never,
    {
      onConflict: "id",
    },
  );
  if (error) {
    if (/column|schema cache/i.test(error.message ?? ""))
      throw new Error("Bu imkoniyat bazani yangilagandan keyin ishlaydi (migratsiya 20270211).");
    throw error;
  }
  await refreshBotTokens(true);
  return { username };
}

/**
 * The secret Telegram sends with every update of the client bot (header
 * X-Telegram-Bot-Api-Secret-Token): TELEGRAM_WEBHOOK_SECRET when set, else
 * derived from the client bot's token -- so a new token from the panel
 * gets its own secret, set by ensureClientBot.
 */
export function clientWebhookSecret(): string | null {
  const explicit = process.env["TELEGRAM_WEBHOOK_SECRET"];
  if (explicit) return explicit;
  const token = botToken("client");
  if (!token) return null;
  return crypto.createHmac("sha256", token).update("salesiq-telegram-webhook").digest("hex");
}

const meCache = new Map<string, { username: string | null; id: number | null; at: number }>();

export async function getMe(
  token: string,
): Promise<{ username: string | null; id: number | null } | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: { username?: string; id?: number } };
    return { username: j.result?.username ?? null, id: j.result?.id ?? null };
  } catch {
    return null;
  }
}

/** The bot's @username (cached for an hour), null when it has no token or Telegram refuses it. */
export async function botUsername(kind: BotKind): Promise<string | null> {
  const token = botToken(kind);
  if (!token) return null;
  const hit = meCache.get(token);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.username;
  const me = await getMe(token);
  meCache.set(token, { username: me?.username ?? null, id: me?.id ?? null, at: Date.now() });
  return me?.username ?? null;
}

/* ---- Which bot is speaking ------------------------------------------- */

/** A company's own bot answering an update from its webhook. */
export type OrgBotScope = { org: string; token: string };

const scope = new AsyncLocalStorage<BotKind | OrgBotScope>();

/** Runs `fn` as `kind`: replies inside a staff-bot update go through the staff bot. */
export function withBot<T>(kind: BotKind, fn: () => Promise<T>): Promise<T> {
  return scope.run(kind, fn);
}

/** Runs `fn` as a company's own bot: replies inside its update go through it. */
export function withOrgBot<T>(org: string, token: string, fn: () => Promise<T>): Promise<T> {
  return scope.run({ org, token }, fn);
}

export function currentBot(): BotKind {
  const s = scope.getStore();
  return typeof s === "string" ? s : "client";
}

/** The company whose own bot is answering this update, or null. */
export function currentOrgBot(): string | null {
  const s = scope.getStore();
  return s && typeof s === "object" ? s.org : null;
}

/* ---- A company's own bot ---------------------------------------------- */

export type OrgBot = {
  organizationId: string;
  token: string;
  username: string;
  webhookSecret: string;
  defaultSalesbotId: string | null;
  /** «Yangi obunachiga lid ochilsin»: /start alone makes a lead (migration 20270210; on before it). */
  newSubscriberLead: boolean;
};

const orgBots = new Map<string, { bot: OrgBot | null; at: number }>();
const ORG_TTL = 2 * 60_000;

/** The company's own bot (cached two minutes), null when it has none. */
export async function orgBot(orgId: string): Promise<OrgBot | null> {
  const hit = orgBots.get(orgId);
  if (hit && Date.now() - hit.at < ORG_TTL) return hit.bot;
  let bot: OrgBot | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("org_telegram_bots")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle();
    const token = data ? openSecret(data.token_sealed) : null;
    bot =
      data && token
        ? {
            organizationId: data.organization_id,
            token,
            username: data.username,
            webhookSecret: data.webhook_secret,
            defaultSalesbotId: data.default_salesbot_id,
            newSubscriberLead:
              (data as { new_subscriber_lead?: boolean | null }).new_subscriber_lead !== false,
          }
        : null;
  } catch {
    // Before the migration: no company bots.
  }
  orgBots.set(orgId, { bot, at: Date.now() });
  return bot;
}

/** Drops the cached company bot (after connecting, changing or removing it). */
export function forgetOrgBot(orgId: string): void {
  orgBots.delete(orgId);
}

const chatOrgs = new Map<number, { org: string | null; at: number }>();

/** The company whose own bot this chat talks to, or null. */
async function orgOfChat(chatId: number): Promise<string | null> {
  const hit = chatOrgs.get(chatId);
  if (hit && Date.now() - hit.at < CHAT_TTL) return hit.org;
  let org: string | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("lead_telegram_links")
      .select("organization_id, via_org_bot")
      .eq("chat_id", chatId)
      .maybeSingle();
    const row = data as { organization_id: string; via_org_bot?: boolean } | null;
    org = row?.via_org_bot ? row.organization_id : null;
  } catch {
    org = null;
  }
  chatOrgs.set(chatId, { org, at: Date.now() });
  return org;
}

/** A chat was (re)linked: forget what bot it used. */
export function forgetChatOrg(chatId: number): void {
  chatOrgs.delete(chatId);
}

/** The secret Telegram sends with each staff-bot update (same webhook URL as the client bot). */
export function staffWebhookSecret(): string | null {
  const token = botToken("staff");
  return token
    ? crypto.createHmac("sha256", token).update("salesiq-staff-webhook").digest("hex")
    : null;
}

/* ---- Which bot a chat belongs to ------------------------------------- */

const chatBots = new Map<number, { bot: BotKind | null; at: number }>();
const CHAT_TTL = 10 * 60_000;

async function chatBot(chatId: number): Promise<BotKind | null> {
  const hit = chatBots.get(chatId);
  if (hit && Date.now() - hit.at < CHAT_TTL) return hit.bot;
  let bot: BotKind | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("telegram_chat_bots")
      .select("bot")
      .eq("chat_id", chatId)
      .maybeSingle();
    bot = (data?.bot as BotKind | undefined) ?? null;
  } catch {
    bot = null;
  }
  chatBots.set(chatId, { bot, at: Date.now() });
  return bot;
}

/** Remembers that a chat talks to the staff bot (from the staff bot's updates). */
export async function rememberChatBot(chatId: number, bot: "staff"): Promise<void> {
  if (chatBots.get(chatId)?.bot === bot) return;
  chatBots.set(chatId, { bot, at: Date.now() });
  await supabaseAdmin
    .from("telegram_chat_bots")
    .upsert(
      { chat_id: chatId, bot, updated_at: new Date().toISOString() },
      { onConflict: "chat_id" },
    )
    .then(
      () => undefined,
      () => undefined,
    );
}

/** The staff bot can no longer write to the chat (blocked): back to the client bot. */
export async function forgetChatBot(chatId: number): Promise<void> {
  chatBots.set(chatId, { bot: null, at: Date.now() });
  await supabaseAdmin
    .from("telegram_chat_bots")
    .delete()
    .eq("chat_id", chatId)
    .then(
      () => undefined,
      () => undefined,
    );
}

/**
 * The token for a message to `chatId`: the bot of the update being answered,
 * else the company's own bot when the client talks to it, else the staff bot
 * when that chat linked through it, else the client bot.
 */
export async function tokenForChat(
  chatId: number,
): Promise<{ token: string; bot: BotKind; routed: boolean }> {
  const inScope = scope.getStore();
  if (inScope && typeof inScope === "object") {
    return { token: inScope.token, bot: "client", routed: false };
  }
  if (inScope && inScope !== "client") {
    const t = botToken(inScope);
    if (t) return { token: t, bot: inScope, routed: false };
  }
  // A client who writes to the company's own bot hears back from it.
  if (!inScope) {
    const org = await orgOfChat(chatId);
    const own = org ? await orgBot(org) : null;
    if (own) return { token: own.token, bot: "client", routed: false };
  }
  if (!inScope && botToken("staff") && (await chatBot(chatId)) === "staff") {
    return { token: botToken("staff")!, bot: "staff", routed: true };
  }
  const client = botToken("client");
  if (!client) throw new Error("Missing environment variable: TELEGRAM_BOT_TOKEN");
  return { token: client, bot: "client", routed: false };
}

/**
 * Sends through the chat's bot; when the staff bot was chosen only because
 * the chat linked through it and Telegram refuses (the person blocked it),
 * the chat goes back to the client bot and the message is sent through it.
 */
export async function sendViaChatBot<T>(
  chatId: number,
  send: (token: string) => Promise<T>,
): Promise<T> {
  const { token, routed } = await tokenForChat(chatId);
  try {
    return await send(token);
  } catch (err) {
    const client = botToken("client");
    if (!routed || !client || !/\((403|400)\)/.test(String(err))) throw err;
    await forgetChatBot(chatId);
    return send(client);
  }
}

/** How many people talk to the staff bot. */
export async function staffChatCount(): Promise<number> {
  const { count } = await supabaseAdmin
    .from("telegram_chat_bots")
    .select("chat_id", { count: "exact", head: true })
    .eq("bot", "staff");
  return count ?? 0;
}

/* ---- Setting the staff bot up ------------------------------------------ */

let staffReady: string | null = null;
let clientReady: string | null = null;

/**
 * The platform's public address, for webhooks: Telegram accepts only a
 * public https:// URL. Never the incoming request's own origin -- behind
 * Caddy that is the app's internal http://127.0.0.1:3000.
 */
export function publicAppUrl(): string {
  return webhookBase(process.env["PUBLIC_APP_URL"]);
}

export type BotHookResult = { ok: boolean; url: string | null; error: string | null };

/**
 * Points the client bot at /telegram/webhook with its secret and the update
 * types the platform reads (channel joins included), after its token is
 * saved in the panel, from "Qayta ulash" and from the 5-minute cron. Once
 * per token and server instance unless `force`.
 */
export async function ensureClientBot(force = false): Promise<BotHookResult> {
  await refreshBotTokens(force);
  const token = botToken("client");
  const secret = clientWebhookSecret();
  if (!token) return { ok: false, url: null, error: null };
  if (clientReady === token && !force) return { ok: true, url: null, error: null };
  const url = `${publicAppUrl()}/telegram/webhook`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        ...(secret ? { secret_token: secret } : {}),
        allowed_updates: [
          "message",
          "edited_message",
          "channel_post",
          "edited_channel_post",
          "callback_query",
          "my_chat_member",
          "chat_member",
          "chat_join_request",
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Telegram setWebhook failed (${res.status}): ${await res.text()}`);
  } catch (err) {
    clientReady = null;
    return {
      ok: false,
      url: null,
      error: err instanceof Error ? err.message.slice(0, 300) : "xato",
    };
  }
  clientReady = token;
  const hook = await botWebhook("client");
  return { ok: hook.url === url, url: hook.url, error: hook.error };
}

/**
 * From the 5-minute cron, right after the token is saved and from "Qayta
 * ulash": points the staff bot at /telegram/webhook with its own secret and
 * gives it a short command menu, then reads back what Telegram has. Once
 * per token and server instance unless `force`; a failure is retried on the
 * next tick.
 */
export async function ensureStaffBot(force = false): Promise<BotHookResult> {
  await refreshBotTokens(force);
  const token = botToken("staff");
  if (!token) return { ok: false, url: null, error: null };
  if (staffReady === token && !force) return { ok: true, url: null, error: null };
  const url = `${publicAppUrl()}/telegram/webhook`;
  const call = async (method: string, body: Record<string, unknown>) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Telegram ${method} failed (${res.status}): ${await res.text()}`);
  };
  try {
    await call("setWebhook", {
      url,
      secret_token: staffWebhookSecret(),
      allowed_updates: ["message", "callback_query", "my_chat_member", "channel_post"],
    });
  } catch (err) {
    staffReady = null;
    return {
      ok: false,
      url: null,
      error: err instanceof Error ? err.message.slice(0, 300) : "xato",
    };
  }
  await call("setMyCommands", {
    commands: [{ command: "start", description: "SalesIQ'ga ulash" }],
  }).catch(() => undefined);
  staffReady = token;
  const hook = await botWebhook("staff");
  return { ok: hook.url === url, url: hook.url, error: hook.error };
}

/** The webhook Telegram has for the bot (for the Botlar page). */
export async function botWebhook(
  kind: BotKind,
): Promise<{ url: string | null; error: string | null }> {
  const token = botToken(kind);
  if (!token) return { url: null, error: null };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await res.json()) as { result?: { url?: string; last_error_message?: string } };
    return { url: j.result?.url || null, error: j.result?.last_error_message ?? null };
  } catch {
    return { url: null, error: "Telegram javob bermadi" };
  }
}
