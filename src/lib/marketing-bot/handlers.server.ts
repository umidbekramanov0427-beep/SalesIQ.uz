// Server-only. What the marketing bot does with each Telegram update:
//   * marketing people: /start staff_<code> links them; /efir opens the live
//     console (buttons mark the webinar's events); /holat shows the viewers;
//   * channels: added as an admin, the bot binds the channel to the company
//     (or creates it); joins / leaves (chat_member), join requests (kept as
//     events, approved when the company chose so), posts and their reaction
//     counts are recorded for the channel's analytics.
// The audience does not talk to this bot.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { handleChatMemberUpdate, recordChannelEvents } from "@/lib/channel-events.server";
import { combineSamples, isEventKind, nextSeq, NUMBERED_KINDS } from "@/lib/webinar-timeline";
import {
  consoleKeyboard,
  eventLabel,
  escapeHtml,
  parseConsoleData,
  staffCodeFromStart,
  statusText,
} from "@/lib/marketing-bot/logic";
import { notifyMarketingStaff, tg, type MarketingBot } from "@/lib/marketing-bot/bot.server";
import type { ChatMemberUpdate } from "@/lib/channel-events.server";

type TgUser = { id: number; username?: string; first_name?: string; is_bot?: boolean };
type TgChat = { id: number; type?: string; title?: string; username?: string };
type TgMessage = {
  message_id: number;
  date?: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  caption?: string;
};
export type MarketingUpdate = {
  message?: TgMessage;
  channel_post?: TgMessage;
  callback_query?: {
    id: string;
    from: TgUser;
    data?: string;
    message?: { message_id: number; chat: TgChat };
  };
  my_chat_member?: ChatMemberUpdate & {
    chat?: TgChat;
    new_chat_member?: { status?: string; user?: TgUser };
  };
  chat_member?: ChatMemberUpdate;
  chat_join_request?: {
    chat: TgChat;
    from: TgUser;
    date?: number;
    invite_link?: { invite_link?: string; name?: string };
  };
  message_reaction_count?: {
    chat: TgChat;
    message_id: number;
    date?: number;
    reactions?: {
      type?: { type?: string; emoji?: string; custom_emoji_id?: string };
      total_count?: number;
    }[];
  };
};

async function reply(bot: MarketingBot, chatId: number, text: string, markup?: unknown) {
  await tg(bot.token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(markup ? { reply_markup: markup } : {}),
  });
}

/** The marketing person behind a Telegram chat, if they linked it. */
async function staffOf(bot: MarketingBot, chatId: number): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("marketing_bot_staff")
    .select("profile_id")
    .eq("organization_id", bot.orgId)
    .eq("chat_id", chatId)
    .maybeSingle();
  return data?.profile_id ?? null;
}

/** The webinar on air now (or the last one that ended today). */
async function currentWebinar(orgId: string) {
  const { data: live } = await supabaseAdmin
    .from("marketing_webinars")
    .select("id, title, status, registrations")
    .eq("organization_id", orgId)
    .eq("status", "live")
    .is("archived_at", null)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (live) return live;
  const { data: last } = await supabaseAdmin
    .from("marketing_webinars")
    .select("id, title, status, registrations")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .gte("ended_at", new Date(Date.now() - 12 * 3_600_000).toISOString())
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return last;
}

export async function webinarTimeline(webinarId: string) {
  const [{ data: samples }, { data: marks }] = await Promise.all([
    supabaseAdmin
      .from("marketing_webinar_samples")
      .select("at, viewers, source")
      .eq("webinar_id", webinarId)
      .order("at")
      .limit(5000),
    supabaseAdmin
      .from("marketing_webinar_marks")
      .select("*")
      .eq("webinar_id", webinarId)
      .order("at"),
  ]);
  const points = combineSamples(samples ?? []);
  const events = (marks ?? [])
    .filter((m) => isEventKind(m.kind))
    .map((m) => ({
      id: m.id,
      at: m.at,
      kind: m.kind as Parameters<typeof eventLabel>[0],
      seq: (m as { seq?: number | null }).seq ?? null,
      label: m.label,
      confirmed: (m as { confirmed?: boolean }).confirmed ?? true,
      meta: ((m as { meta?: unknown }).meta ?? null) as { count?: number } | null,
    }));
  return { points, events };
}

async function handlePrivate(bot: MarketingBot, m: TgMessage) {
  const chatId = m.chat.id;
  const text = (m.text ?? "").trim();
  const code = staffCodeFromStart(text);
  if (code) {
    const { data: row } = await supabaseAdmin
      .from("marketing_bot_link_codes")
      .select("organization_id, profile_id, expires_at")
      .eq("code", code)
      .maybeSingle();
    if (!row || row.organization_id !== bot.orgId || Date.parse(row.expires_at) < Date.now()) {
      await reply(bot, chatId, "Havola eskirgan. Marketing → Sozlash → Bot'dan yangisini oling.");
      return;
    }
    await supabaseAdmin.from("marketing_bot_staff").upsert(
      {
        organization_id: bot.orgId,
        profile_id: row.profile_id,
        chat_id: chatId,
        tg_username: m.from?.username ?? null,
        linked_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,profile_id" },
    );
    await supabaseAdmin.from("marketing_bot_link_codes").delete().eq("code", code);
    await reply(
      bot,
      chatId,
      "✅ Ulandingiz. Endi efir boshlanishi, auditoriya keskin tushishi, yangi peak va vebinar hisobotlari shu yerga keladi.\n\n/efir — efir pulti\n/holat — hozirgi tomoshabinlar",
    );
    return;
  }
  const staff = await staffOf(bot, chatId);
  if (!staff) {
    await reply(
      bot,
      chatId,
      "Bu bot kompaniyaning marketing jamoasi uchun. Ulanish uchun SalesIQ → Marketing → Sozlash → Bot'dagi «Telegram'ni ulash» tugmasini bosing.",
    );
    return;
  }
  if (/^\/(efir|holat|start)(@\w+)?\b/i.test(text)) {
    const w = await currentWebinar(bot.orgId);
    if (!w) {
      await reply(bot, chatId, "Hozir efirda vebinar yo'q.");
      return;
    }
    const { points, events } = await webinarTimeline(w.id);
    const markup =
      /^\/holat/i.test(text) || w.status !== "live"
        ? undefined
        : { inline_keyboard: consoleKeyboard(w.id, events) };
    await reply(bot, chatId, statusText(w.title, points, events), markup);
    return;
  }
  await reply(bot, chatId, "/efir — efir pulti\n/holat — hozirgi tomoshabinlar");
}

async function handleCallback(
  bot: MarketingBot,
  q: NonNullable<MarketingUpdate["callback_query"]>,
) {
  const answer = (text: string) =>
    tg(bot.token, "answerCallbackQuery", { callback_query_id: q.id, text: text.slice(0, 190) });
  const staff = await staffOf(bot, q.from.id);
  if (!staff) return void (await answer("Avval botga ulaning"));
  const data = q.data ?? "";
  const st = /^st:([0-9a-f-]{36})$/.exec(data);
  const ev = parseConsoleData(data);
  const webinarId = ev?.webinarId ?? st?.[1];
  if (!webinarId) return void (await answer(""));
  const { data: w } = await supabaseAdmin
    .from("marketing_webinars")
    .select("id, title, status, organization_id")
    .eq("id", webinarId)
    .maybeSingle();
  if (!w || w.organization_id !== bot.orgId) return void (await answer("Vebinar topilmadi"));
  let { points, events } = await webinarTimeline(w.id);
  if (ev) {
    const seq = NUMBERED_KINDS.has(ev.kind) ? nextSeq(events, ev.kind) : null;
    const { error } = await supabaseAdmin.from("marketing_webinar_marks").insert({
      webinar_id: w.id,
      organization_id: bot.orgId,
      kind: ev.kind,
      seq,
      meta: { via: "bot", by: staff } as never,
    });
    if (error) return void (await answer("Saqlab bo'lmadi"));
    await answer(`✓ ${eventLabel(ev.kind, seq)} belgilandi`);
    ({ points, events } = await webinarTimeline(w.id));
  } else {
    await answer("Yangilandi");
  }
  if (q.message) {
    await tg(bot.token, "editMessageText", {
      chat_id: q.message.chat.id,
      message_id: q.message.message_id,
      text: statusText(w.title, points, events),
      parse_mode: "HTML",
      ...(w.status === "live"
        ? { reply_markup: { inline_keyboard: consoleKeyboard(w.id, events) } }
        : {}),
    });
  }
}

/** The bot became (or stopped being) an admin of a channel. */
async function handleMyChatMember(
  bot: MarketingBot,
  u: NonNullable<MarketingUpdate["my_chat_member"]>,
) {
  const chat = u.chat;
  if (!chat?.id || (chat.type !== "channel" && chat.type !== "supergroup")) return;
  const status = u.new_chat_member?.status;
  const admin = status === "administrator" || status === "creator";
  const { data: existing } = await supabaseAdmin
    .from("marketing_channels")
    .select("id, archived_at")
    .eq("organization_id", bot.orgId)
    .eq("chat_id", chat.id)
    .maybeSingle();
  if (!admin) {
    if (existing)
      await supabaseAdmin
        .from("marketing_channels")
        .update({ via_marketing_bot: false })
        .eq("id", existing.id);
    if (existing)
      await notifyMarketingStaff(
        bot.orgId,
        `⚠️ Bot «${escapeHtml(chat.title ?? "kanal")}» kanalida endi admin emas — analitika to'xtadi.`,
      );
    return;
  }
  const count = await tg(bot.token, "getChatMemberCount", { chat_id: chat.id });
  const members = typeof count.result === "number" ? count.result : null;
  if (existing) {
    await supabaseAdmin
      .from("marketing_channels")
      .update({
        via_marketing_bot: true,
        bot_admin: true,
        archived_at: null,
        ...(chat.title ? { title: chat.title } : {}),
        ...(members != null ? { members, members_checked_at: new Date().toISOString() } : {}),
      })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("marketing_channels").insert({
      organization_id: bot.orgId,
      title: chat.title ?? "",
      username: chat.username ?? null,
      chat_id: chat.id,
      purpose: "webinar",
      via_marketing_bot: true,
      bot_admin: true,
      members,
      members_checked_at: members != null ? new Date().toISOString() : null,
    });
  }
  await notifyMarketingStaff(
    bot.orgId,
    `✅ Bot «${escapeHtml(chat.title ?? "kanal")}» kanaliga admin bo'ldi. Qo'shilgan va chiqqanlar, havolalar va reaksiyalar endi yoziladi.`,
  );
}

async function channelOf(orgId: string, chatId: number) {
  const { data } = await supabaseAdmin
    .from("marketing_channels")
    .select("id, organization_id, members")
    .eq("organization_id", orgId)
    .eq("chat_id", chatId)
    .is("archived_at", null)
    .maybeSingle();
  return data;
}

export async function handleMarketingUpdate(bot: MarketingBot, u: MarketingUpdate): Promise<void> {
  if (u.message && u.message.chat.type === "private") return handlePrivate(bot, u.message);
  if (u.callback_query) return handleCallback(bot, u.callback_query);
  if (u.my_chat_member) return handleMyChatMember(bot, u.my_chat_member);
  if (u.chat_member) return handleChatMemberUpdate(u.chat_member);
  if (u.chat_join_request) {
    const r = u.chat_join_request;
    const c = await channelOf(bot.orgId, r.chat.id);
    if (!c) return;
    await recordChannelEvents(
      c,
      [
        {
          at: new Date((r.date ?? Date.now() / 1000) * 1000).toISOString(),
          kind: "request",
          tgUserId: r.from.id,
          inviteLink: r.invite_link?.invite_link ?? null,
          inviteName: r.invite_link?.name ?? null,
        },
      ],
      "bot",
    ).catch(() => 0);
    if (bot.settings.autoApprove)
      await tg(bot.token, "approveChatJoinRequest", { chat_id: r.chat.id, user_id: r.from.id });
    return;
  }
  if (u.channel_post) {
    const p = u.channel_post;
    const c = await channelOf(bot.orgId, p.chat.id);
    if (!c) return;
    await supabaseAdmin.from("marketing_channel_posts").upsert(
      {
        channel_id: c.id,
        message_id: p.message_id,
        organization_id: bot.orgId,
        posted_at: new Date((p.date ?? Date.now() / 1000) * 1000).toISOString(),
        text: (p.text ?? p.caption ?? "").slice(0, 300) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel_id,message_id", ignoreDuplicates: false },
    );
    return;
  }
  if (u.message_reaction_count) {
    const r = u.message_reaction_count;
    const c = await channelOf(bot.orgId, r.chat.id);
    if (!c) return;
    const reactions: Record<string, number> = {};
    let total = 0;
    for (const x of r.reactions ?? []) {
      const key = x.type?.emoji ?? (x.type?.type === "paid" ? "⭐" : "•");
      reactions[key] = (reactions[key] ?? 0) + (x.total_count ?? 0);
      total += x.total_count ?? 0;
    }
    await supabaseAdmin.from("marketing_channel_posts").upsert(
      {
        channel_id: c.id,
        message_id: r.message_id,
        organization_id: bot.orgId,
        reactions: reactions as never,
        reactions_total: total,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel_id,message_id" },
    );
  }
}
