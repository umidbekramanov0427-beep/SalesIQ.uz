// Server-only. A client talking to a company in Telegram -- through the
// shared (trial) bot (telegram.webhook.ts) or the company's own bot
// (telegram.org.$orgId.ts): opening a salesbot's link, sending a lead's link
// code, and every later message, which lands in the lead's chat.
//
// The shared bot takes new clients for a company only while
// organizations.shared_bot_until has not passed (src/lib/telegram/shared-bot.ts);
// clients already linked go on talking. Links made through a company's own
// bot are marked via_org_bot, so the replies go through that bot.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ChatMemberUpdate } from "@/lib/channel-events.server";
import { autoReplyToClient } from "@/lib/auto-reply.server";
import { handleIncomingLeadMessage, startSalesbot } from "@/lib/automations/engine.server";
import { forgetChatOrg, orgBot } from "@/lib/bot-tokens.server";
import { copyChatFile } from "@/lib/files-housekeeping.server";
import { markFollowupsReplied } from "@/lib/followups.server";
import { ingestLead, rememberLeadTelegram } from "@/lib/leads/lead-intake.server";
import { notifyClientMessage } from "@/lib/live-notifications.server";
import { sendTelegramMessage } from "@/lib/telegram-report.server";
import {
  fileLabel,
  incomingFile,
  insertLeadChatMessage,
  refreshChatPhoto,
} from "@/lib/telegram/lead-chat.server";
import { sharedBotClosedText, sharedBotOpen } from "@/lib/telegram/shared-bot";

type TgFileField = { file_id?: string; file_name?: string; title?: string; performer?: string };

export type TelegramUpdate = {
  chat_member?: ChatMemberUpdate;
  callback_query?: {
    id: string;
    data?: string;
    from?: { id?: number };
    message?: { message_id?: number; chat?: { id?: number; type?: string } };
  };
  channel_post?: { chat?: { id?: number; title?: string }; text?: string };
  message?: {
    message_id?: number;
    photo?: { file_id?: string }[];
    document?: TgFileField;
    video?: TgFileField;
    video_note?: TgFileField;
    sticker?: TgFileField & { emoji?: string };
    animation?: TgFileField;
    from?: { id?: number; first_name?: string; last_name?: string; username?: string };
    contact?: {
      phone_number?: string;
      first_name?: string;
      last_name?: string;
      user_id?: number;
    };
    text?: string;
    caption?: string;
    location?: { latitude?: number; longitude?: number; horizontal_accuracy?: number };
    forward_origin?: unknown;
    forward_date?: number;
    reply_to_message?: { message_id?: number };
    voice?: TgFileField;
    audio?: TgFileField;
    chat?: {
      id?: number;
      type?: string;
      title?: string;
      first_name?: string;
      username?: string;
    };
  };
};

export type TgMessage = NonNullable<TelegramUpdate["message"]>;

/**
 * Through the shared bot: may this company take a new client now? When not,
 * the client is told where to write instead.
 */
async function sharedBotLets(chatId: number, organizationId: string): Promise<boolean> {
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();
  if (sharedBotOpen(org as { shared_bot_until?: string | null } | null)) return true;
  const own = await orgBot(organizationId);
  await sendTelegramMessage(chatId, sharedBotClosedText(own?.username ?? null)).catch(
    () => undefined,
  );
  return false;
}

/** Binds the chat to the lead (one chat <-> one lead), through the bot it came in on. */
async function linkChat(input: {
  organizationId: string;
  leadId: string;
  chatId: number;
  firstName: string | null;
  username: string | null;
  viaOrgBot: boolean;
}): Promise<boolean> {
  await supabaseAdmin.from("lead_telegram_links").delete().eq("chat_id", input.chatId);
  await supabaseAdmin.from("lead_telegram_links").delete().eq("lead_id", input.leadId);
  const row = {
    organization_id: input.organizationId,
    lead_id: input.leadId,
    chat_id: input.chatId,
    chat_first_name: input.firstName,
    chat_username: input.username,
  };
  let { error } = await supabaseAdmin
    .from("lead_telegram_links")
    .insert({ ...row, via_org_bot: input.viaOrgBot });
  // Before the migration there is no via_org_bot column.
  if (error && /via_org_bot/.test(error.message)) {
    ({ error } = await supabaseAdmin.from("lead_telegram_links").insert(row));
  }
  forgetChatOrg(input.chatId);
  return !error;
}

/**
 * A lead's one-time link code typed into the bot: the chat is bound to that
 * lead. Replaces any previous link -- a customer switching phones, or a rep
 * re-linking the same lead, both just work.
 */
export async function redeemLeadCode(
  chatId: number,
  chatFirstName: string | null,
  chatUsername: string | null,
  pending: { lead_id: string; organization_id: string },
  viaOrgBot = false,
): Promise<void> {
  if (!viaOrgBot && !(await sharedBotLets(chatId, pending.organization_id))) return;
  const ok = await linkChat({
    organizationId: pending.organization_id,
    leadId: pending.lead_id,
    chatId,
    firstName: chatFirstName,
    username: chatUsername,
    viaOrgBot,
  });
  if (!ok) {
    await sendTelegramMessage(chatId, "Ulashda xatolik yuz berdi. Qayta urinib ko'ring.").catch(
      () => undefined,
    );
    return;
  }
  await supabaseAdmin.from("lead_telegram_link_codes").delete().eq("lead_id", pending.lead_id);
  await rememberLeadTelegram(pending.organization_id, pending.lead_id, chatUsername).catch(
    () => undefined,
  );
  await sendTelegramMessage(
    chatId,
    "✅ Ulandi! Endi yozgan xabarlaringiz to'g'ridan-to'g'ri kompaniya tizimiga tushadi.",
  ).catch(() => undefined);
}

/** A client's message in a linked chat: into the lead's chat, salesbot, auto-replies. */
export async function logIncomingLeadMessage(
  link: {
    lead_id: string;
    organization_id: string;
    chat_id: number;
    photo_checked_at?: string | null;
  },
  message: TgMessage,
): Promise<void> {
  // Text, or a file (photo, document, audio, voice, video, sticker) with
  // its caption -- everything the client sends shows in the lead's chat.
  const text = (message.text ?? message.caption ?? "").trim();
  const file = incomingFile(message);
  if (!text && !file) return;
  await insertLeadChatMessage({
    organization_id: link.organization_id,
    lead_id: link.lead_id,
    direction: "in",
    text,
    tg_message_id: message.message_id ?? null,
    file_kind: file?.kind ?? null,
    file_id: file?.fileId ?? null,
    file_name: file?.name ?? null,
  });
  // A salesbot may be waiting for exactly this answer. Only words answer
  // it: a photo or song without a caption is not a name or a phone. The
  // photo check runs alongside, so the bot's reply never waits on it.
  await Promise.all([
    refreshChatPhoto(link).catch(() => undefined),
    markFollowupsReplied(link.lead_id).catch(() => undefined),
    notifyClientMessage({
      organizationId: link.organization_id,
      leadId: link.lead_id,
      channel: "telegram",
      text: text || (file ? fileLabel(file.kind, file.name) : ""),
    }).catch(() => undefined),
    handleIncomingLeadMessage(
      link.organization_id,
      link.lead_id,
      text,
      file ? fileLabel(file.kind, file.name) : null,
    ).catch(() => undefined),
    // Admin → Fayllar: keep a copy of the file in our storage if the company wants.
    file
      ? copyChatFile({
          organizationId: link.organization_id,
          leadId: link.lead_id,
          source: "telegram",
          fileId: file.fileId,
          fileName: file.name ?? null,
          kind: file.kind,
        }).catch(() => undefined)
      : Promise.resolve(),
    // After-hours message / auto-responders (Voronka sozlamalari).
    autoReplyToClient({
      organizationId: link.organization_id,
      leadId: link.lead_id,
      channel: "telegram",
      text,
      send: async (reply) => {
        await sendTelegramMessage(link.chat_id, reply);
      },
    }).catch(() => undefined),
  ]);
}

/** A new client of the company: a lead from their Telegram name, and the chat bound to it. */
async function newClientLead(
  organizationId: string,
  chatId: number,
  message: TgMessage,
  note: string,
  viaOrgBot: boolean,
  tags: string[] = [],
): Promise<string | null> {
  const from = message.from;
  const username = from?.username ?? message.chat?.username ?? null;
  const name =
    [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim() ||
    (username ? `@${username}` : "Telegram mijoz");
  try {
    const result = await ingestLead(organizationId, {
      name,
      source: "Telegram bot",
      duplicateSource: "webhook",
      note: `${note}${username ? ` · Telegram: @${username}` : ""}`,
      tags,
      telegram: username,
    });
    await linkChat({
      organizationId,
      leadId: result.leadId,
      chatId,
      firstName: message.chat?.first_name ?? null,
      username: message.chat?.username ?? null,
      viaOrgBot,
    });
    return result.leadId;
  } catch (err) {
    console.error("[telegram] client lead failed", err);
    await sendTelegramMessage(
      chatId,
      "Xatolik yuz berdi. Birozdan so'ng qaytadan urinib ko'ring.",
    ).catch(() => undefined);
    return null;
  }
}

/**
 * Someone opened a salesbot's link (from an ad, a website, an Instagram bio,
 * or the admin testing it). They become a lead of the bot's company -- or
 * keep the lead their chat already has there -- their chat is linked to it,
 * and the bot starts the conversation. `onlyOrg`: through a company's own
 * bot only its salesbots start.
 */
export async function startSalesbotChat(
  chatId: number,
  salesbot: { id?: string; code?: string },
  message: TgMessage,
  opts: { viaOrgBot: boolean; onlyOrg?: string | null } = { viaOrgBot: false },
): Promise<void> {
  let q = supabaseAdmin.from("salesbots").select("id, organization_id, enabled, name");
  q = salesbot.id ? q.eq("id", salesbot.id) : q.eq("short_code", salesbot.code ?? "");
  const { data: bot } = await q.maybeSingle();
  if (!bot || !bot.enabled || (opts.onlyOrg && bot.organization_id !== opts.onlyOrg)) {
    await sendTelegramMessage(chatId, "Bu bot hozir ishlamayapti.").catch(() => undefined);
    return;
  }

  const { data: existing } = await supabaseAdmin
    .from("lead_telegram_links")
    .select("*")
    .eq("chat_id", chatId)
    .maybeSingle();
  const prior = existing as {
    lead_id: string;
    organization_id: string;
    via_org_bot?: boolean;
  } | null;

  let leadId = prior?.organization_id === bot.organization_id ? prior.lead_id : null;
  if (leadId && (prior?.via_org_bot ?? false) !== opts.viaOrgBot) {
    // The same client, now on the other bot: replies follow them there.
    await supabaseAdmin
      .from("lead_telegram_links")
      .update({ via_org_bot: opts.viaOrgBot })
      .eq("chat_id", chatId)
      .then(
        () => forgetChatOrg(chatId),
        () => undefined,
      );
  }
  if (!leadId) {
    if (!opts.viaOrgBot && !(await sharedBotLets(chatId, bot.organization_id))) return;
    leadId = await newClientLead(bot.organization_id, chatId, message, bot.name, opts.viaOrgBot, [
      "salesbot",
    ]);
    if (!leadId) return;
  }

  // The client's photo is looked up while the bot already greets them.
  const [started] = await Promise.all([
    startSalesbot(bot.organization_id, bot.id, leadId),
    prior?.lead_id === leadId
      ? Promise.resolve()
      : refreshChatPhoto({ lead_id: leadId, chat_id: chatId }).catch(() => undefined),
  ]);
  if ("error" in started) {
    await sendTelegramMessage(chatId, "Bu bot hozir ishlamayapti.").catch(() => undefined);
  }
}

/**
 * Through a company's own bot, someone with no salesbot to run (the plain
 * link without a main salesbot, or just a message): they become the
 * company's lead and what they wrote lands in the lead's chat.
 */
export async function orgBotNewClient(
  organizationId: string,
  chatId: number,
  message: TgMessage,
  botUsername: string,
): Promise<void> {
  const leadId = await newClientLead(organizationId, chatId, message, `@${botUsername}`, true);
  if (!leadId) return;
  const text = (message.text ?? "").trim();
  if (text && !text.startsWith("/start")) {
    await logIncomingLeadMessage(
      { lead_id: leadId, organization_id: organizationId, chat_id: chatId },
      message,
    );
    return;
  }
  await refreshChatPhoto({ lead_id: leadId, chat_id: chatId }).catch(() => undefined);
  await sendTelegramMessage(
    chatId,
    "Assalomu alaykum! Savolingizni yozing — menejerimiz tez orada javob beradi.",
  ).catch(() => undefined);
}
