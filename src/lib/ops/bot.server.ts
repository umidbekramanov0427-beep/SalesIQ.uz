import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callTelegramMethod } from "@/lib/telegram-report.server";
import { OPS_COMMANDS } from "@/lib/ops/health";
import { botToken, publicAppUrl, refreshBotTokens, sendViaChatBot } from "@/lib/bot-tokens.server";

// How the platform owner's messages reach Telegram: the monitoring bot.
// With OPS_TELEGRAM_BOT_TOKEN set, or a token saved in Platforma -> Botlar
// (a separate bot made in @BotFather), every
// owner message -- health reports, technical alerts, security alerts,
// support questions -- goes through that bot and its commands are answered
// at /telegram/ops-webhook. Without it the shared customer bot
// (TELEGRAM_BOT_TOKEN) carries them, as before.

/** The public address used in report links and for the bot's webhook. */
export function appUrl(): string {
  return publicAppUrl();
}

/** The monitoring bot: OPS_TELEGRAM_BOT_TOKEN or the token saved in Platforma -> Botlar. */
export function opsBotToken(): string | null {
  return botToken("ops");
}

function sharedBotToken(): string | null {
  return botToken("client");
}

/** The secret Telegram sends with each update to /telegram/ops-webhook. */
export function opsWebhookSecret(): string | null {
  const token = opsBotToken();
  return token
    ? crypto.createHmac("sha256", token).update("salesiq-ops-webhook").digest("hex")
    : null;
}

/** Telegram chats of every platform owner who linked the bot. */
export async function ownerChatIds(): Promise<number[]> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("telegram_chat_id")
    .eq("role", "platform_owner")
    .not("telegram_chat_id", "is", null);
  return (data ?? []).map((o) => Number(o.telegram_chat_id)).filter(Number.isFinite);
}

export async function isOwnerChat(chatId: number): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "platform_owner")
    .eq("telegram_chat_id", chatId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Sends one message to an owner's chat and returns a reference to it
 * ("ops:<chat>:<id>" through the monitoring bot, "<chat>:<id>" through the
 * shared bot), so a reply to it can be matched later. Long texts are split
 * at line breaks (Telegram allows 4096 characters).
 */
export async function sendToOwner(chatId: number, text: string): Promise<string | null> {
  await refreshBotTokens();
  const ops = opsBotToken();
  if (!ops && !sharedBotToken()) return null;
  let lastId: number | null = null;
  for (const part of splitMessage(text)) {
    const payload = {
      chat_id: chatId,
      text: part,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    // Without a monitoring bot: the bot the owner linked through.
    const result = (await (ops
      ? callTelegramMethod(ops, "sendMessage", payload)
      : sendViaChatBot(chatId, (token) => callTelegramMethod(token, "sendMessage", payload)))) as {
      message_id?: number;
    } | null;
    lastId = result?.message_id ?? lastId;
  }
  if (!lastId) return null;
  return ops ? `ops:${chatId}:${lastId}` : `${chatId}:${lastId}`;
}

/** Sends `text` to every owner; returns the references of the copies. */
export async function notifyOwners(text: string): Promise<string[]> {
  const chats = await ownerChatIds();
  const refs = await Promise.all(chats.map((c) => sendToOwner(c, text).catch(() => null)));
  return refs.filter((r): r is string => !!r);
}

export function splitMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (current && current.length + line.length + 1 > limit) {
      parts.push(current);
      current = "";
    }
    current = current ? `${current}\n${line}` : line.slice(0, limit);
  }
  if (current) parts.push(current);
  return parts;
}

/** The token the bot was last set up with (set up again when it changes). */
let opsBotReady: string | null = null;

/**
 * Run from the 5-minute cron, once per server instance: points the
 * monitoring bot at /telegram/ops-webhook (with its secret) and gives it
 * the command menu. Without a monitoring bot the commands are added to the
 * shared bot's menu in the owners' chats only.
 */
export async function ensureOpsBot(origin = appUrl(), force = false): Promise<void> {
  await refreshBotTokens(force);
  const key = opsBotToken() ?? "shared";
  if (opsBotReady === key && !force) return;
  const commands = OPS_COMMANDS.map(([command, description]) => ({ command, description }));
  const ops = opsBotToken();
  if (ops) {
    const url = `${origin}/telegram/ops-webhook`;
    const info = (await callTelegramMethod(ops, "getWebhookInfo", {})) as { url?: string } | null;
    if (info?.url !== url || opsBotReady === null || force) {
      await callTelegramMethod(ops, "setWebhook", {
        url,
        secret_token: opsWebhookSecret(),
        // channel_post: "/zaxira CODE" posted in the backup channel.
        allowed_updates: ["message", "channel_post"],
      });
    }
    await callTelegramMethod(ops, "setMyCommands", { commands });
  } else {
    const shared = sharedBotToken();
    if (!shared) return;
    for (const chatId of await ownerChatIds()) {
      await callTelegramMethod(shared, "setMyCommands", {
        commands,
        scope: { type: "chat", chat_id: chatId },
      }).catch(() => undefined);
    }
  }
  opsBotReady = key;
}
