import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callTelegramMethod } from "@/lib/telegram-report.server";
import { OPS_COMMANDS } from "@/lib/ops/health";

// How the platform owner's messages reach Telegram: the monitoring bot.
// With OPS_TELEGRAM_BOT_TOKEN set (a separate bot made in @BotFather) every
// owner message -- health reports, technical alerts, security alerts,
// support questions -- goes through that bot and its commands are answered
// at /telegram/ops-webhook. Without it the shared customer bot
// (TELEGRAM_BOT_TOKEN) carries them, as before.

/** The public address used in report links and for the bot's webhook. */
export function appUrl(): string {
  return (process.env["PUBLIC_APP_URL"] ?? "https://salesiq.uz").replace(/\/$/, "");
}

export function opsBotToken(): string | null {
  return process.env["OPS_TELEGRAM_BOT_TOKEN"] || null;
}

function sharedBotToken(): string | null {
  return process.env["TELEGRAM_BOT_TOKEN"] || null;
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
  const ops = opsBotToken();
  const token = ops ?? sharedBotToken();
  if (!token) return null;
  let lastId: number | null = null;
  for (const part of splitMessage(text)) {
    const result = (await callTelegramMethod(token, "sendMessage", {
      chat_id: chatId,
      text: part,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    })) as { message_id?: number } | null;
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

let opsBotReady = false;

/**
 * Run from the 5-minute cron, once per server instance: points the
 * monitoring bot at /telegram/ops-webhook (with its secret) and gives it
 * the command menu. Without a monitoring bot the commands are added to the
 * shared bot's menu in the owners' chats only.
 */
export async function ensureOpsBot(origin = appUrl()): Promise<void> {
  if (opsBotReady) return;
  const commands = OPS_COMMANDS.map(([command, description]) => ({ command, description }));
  const ops = opsBotToken();
  if (ops) {
    const url = `${origin}/telegram/ops-webhook`;
    const info = (await callTelegramMethod(ops, "getWebhookInfo", {})) as { url?: string } | null;
    if (info?.url !== url) {
      await callTelegramMethod(ops, "setWebhook", {
        url,
        secret_token: opsWebhookSecret(),
        allowed_updates: ["message"],
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
  opsBotReady = true;
}
