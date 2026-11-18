// Server-only. The company's marketing bot (Marketing -> Sozlash -> Bot):
// connecting it with a token from @BotFather (sealed, never sent to the
// browser), its webhook at /telegram/marketing/<company id>, the marketing
// people who opened it (alerts, reports and the live console go to them),
// and invite links it makes in the company's channels. Separate from the
// company's CRM bot (org-bot.server.ts).
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { botToken, getMe, orgBot, publicAppUrl } from "@/lib/bot-tokens.server";
import { openSecret, sealSecret } from "@/lib/secret-box.server";
import {
  DEFAULT_BOT_SETTINGS,
  cleanInviteName,
  parseBotSettings,
  type MarketingBotSettings,
} from "@/lib/marketing-bot/logic";

const TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,}$/;
export const MARKETING_BOT_UPDATES = [
  "message",
  "callback_query",
  "chat_member",
  "my_chat_member",
  "chat_join_request",
  "message_reaction_count",
  "channel_post",
];

export type MarketingBot = {
  orgId: string;
  token: string;
  username: string;
  botUserId: number | null;
  webhookSecret: string;
  settings: MarketingBotSettings;
};

const missing = (msg: string | undefined) =>
  !!msg && /marketing_bot|does not exist|schema cache/i.test(msg);

const cache = new Map<string, { at: number; bot: MarketingBot | null }>();

/** The company's marketing bot (cached a minute), or null. */
export async function marketingBot(orgId: string): Promise<MarketingBot | null> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < 60_000) return hit.bot;
  const { data, error } = await supabaseAdmin
    .from("marketing_bots")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  const token = data ? openSecret(data.token_sealed) : null;
  const bot =
    !error && data && token
      ? {
          orgId,
          token,
          username: data.username,
          botUserId: data.bot_user_id,
          webhookSecret: data.webhook_secret,
          settings: parseBotSettings(data.settings),
        }
      : null;
  cache.set(orgId, { at: Date.now(), bot });
  return bot;
}

export function forgetMarketingBot(orgId: string) {
  cache.delete(orgId);
}

/** Every company that has a marketing bot (for the cron). */
export async function marketingBotOrgs(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from("marketing_bots").select("organization_id");
  if (error) return [];
  return (data ?? []).map((r) => r.organization_id);
}

export type TgResult = { ok: boolean; result?: unknown; description?: string; code?: number };

/** One Bot API call with the marketing bot's token; never throws. */
export async function tg(token: string, method: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: unknown;
      description?: string;
    };
    return {
      ok: !!j.ok,
      result: j.result,
      description: j.description,
      code: res.status,
    } as TgResult;
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : "network" } as TgResult;
  }
}

function webhookUrl(orgId: string) {
  return `${publicAppUrl()}/telegram/marketing/${orgId}`;
}

export type MarketingBotStatus = {
  ready: boolean;
  bot: {
    username: string;
    link: string;
    connectedAt: string;
    webhookOk: boolean;
    webhookError: string | null;
    settings: MarketingBotSettings;
  } | null;
  staff: { profileId: string; name: string; tgUsername: string | null; linkedAt: string }[];
  me: { linked: boolean };
  channels: {
    id: string;
    title: string;
    username: string | null;
    botAdmin: boolean | null;
    invites: { id: string; name: string; link: string; joins: number; leaves: number }[];
  }[];
};

/** Everything Sozlash -> Bot shows. */
export async function marketingBotStatus(
  orgId: string,
  profileId: string,
): Promise<MarketingBotStatus> {
  const { data: row, error } = await supabaseAdmin
    .from("marketing_bots")
    .select("username, connected_at, settings")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error && missing(error.message))
    return { ready: false, bot: null, staff: [], me: { linked: false }, channels: [] };
  if (error) throw error;
  const [{ data: staffRows }, { data: chans }] = await Promise.all([
    supabaseAdmin
      .from("marketing_bot_staff")
      .select("profile_id, tg_username, linked_at")
      .eq("organization_id", orgId),
    supabaseAdmin
      .from("marketing_channels")
      .select("id, title, username, bot_admin, via_marketing_bot")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .order("created_at"),
  ]);
  const ids = (staffRows ?? []).map((s) => s.profile_id);
  const { data: people } = ids.length
    ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email || "—"]));
  const chanIds = (chans ?? []).map((c) => c.id);
  const { data: invites } = chanIds.length
    ? await supabaseAdmin
        .from("marketing_channel_invites")
        .select("id, channel_id, name, link")
        .in("channel_id", chanIds)
        .is("revoked_at", null)
        .order("created_at")
    : { data: [] as { id: string; channel_id: string; name: string; link: string }[] };
  const counts = new Map<string, { joins: number; leaves: number }>();
  if (invites?.length) {
    const { data: ev } = await supabaseAdmin
      .from("marketing_channel_events")
      .select("invite_link, kind")
      .eq("organization_id", orgId)
      .in(
        "invite_link",
        invites.map((i) => i.link),
      )
      .limit(50_000);
    for (const e of ev ?? []) {
      const c = counts.get(e.invite_link ?? "") ?? { joins: 0, leaves: 0 };
      if (e.kind === "join") c.joins++;
      if (e.kind === "leave") c.leaves++;
      counts.set(e.invite_link ?? "", c);
    }
  }
  let webhookOk = false;
  let webhookError: string | null = null;
  const own = row ? await marketingBot(orgId) : null;
  if (own) {
    const info = await tg(own.token, "getWebhookInfo", {});
    const r = info.result as { url?: string; last_error_message?: string } | undefined;
    webhookOk = info.ok && r?.url === webhookUrl(orgId);
    webhookError = info.ok ? (r?.last_error_message ?? null) : (info.description ?? null);
  }
  return {
    ready: true,
    bot: row
      ? {
          username: row.username,
          link: `https://t.me/${row.username}`,
          connectedAt: row.connected_at,
          webhookOk,
          webhookError,
          settings: parseBotSettings(row.settings),
        }
      : null,
    staff: (staffRows ?? []).map((s) => ({
      profileId: s.profile_id,
      name: nameOf.get(s.profile_id) ?? "—",
      tgUsername: s.tg_username,
      linkedAt: s.linked_at,
    })),
    me: { linked: ids.includes(profileId) },
    channels: (chans ?? []).map((c) => ({
      id: c.id,
      title: c.title || (c.username ? `@${c.username}` : "Kanal"),
      username: c.username,
      botAdmin: c.via_marketing_bot ? true : (c.bot_admin ?? null),
      invites: (invites ?? [])
        .filter((i) => i.channel_id === c.id)
        .map((i) => ({
          id: i.id,
          name: i.name,
          link: i.link,
          ...(counts.get(i.link) ?? { joins: 0, leaves: 0 }),
        })),
    })),
  };
}

/** Checks the token, points the webhook at us, gives the bot its menu and saves it. */
export async function connectMarketingBot(
  orgId: string,
  rawToken: string,
  by: string,
): Promise<{ username: string }> {
  const token = rawToken.trim();
  if (!TOKEN_RE.test(token))
    throw new Error("Token noto'g'ri ko'rinishda (masalan 123456789:AA...)");
  if ([botToken("client"), botToken("staff"), botToken("ops")].includes(token))
    throw new Error("Bu platformaning boti. @BotFather'da yangi bot oching.");
  const crm = await orgBot(orgId);
  if (crm?.token === token)
    throw new Error("Bu kompaniyaning CRM boti. Marketing uchun alohida bot oching.");
  const me = await getMe(token);
  if (!me?.username)
    throw new Error("Telegram bu tokenni qabul qilmadi: @BotFather'dagi tokenni tekshiring");
  const { data: taken } = await supabaseAdmin
    .from("marketing_bots")
    .select("organization_id")
    .eq("bot_user_id", me.id ?? -1)
    .neq("organization_id", orgId)
    .maybeSingle();
  if (taken) throw new Error("Bu bot boshqa kompaniyaga ulangan.");
  const secret = crypto.randomBytes(24).toString("hex");
  const hook = await tg(token, "setWebhook", {
    url: webhookUrl(orgId),
    secret_token: secret,
    allowed_updates: MARKETING_BOT_UPDATES,
    drop_pending_updates: true,
  });
  if (!hook.ok) throw new Error(hook.description || "Telegram webhook'ni qabul qilmadi");
  await tg(token, "setMyCommands", {
    commands: [
      { command: "efir", description: "Efir pulti" },
      { command: "holat", description: "Hozirgi tomoshabinlar" },
    ],
  });
  const { data: prev } = await supabaseAdmin
    .from("marketing_bots")
    .select("settings")
    .eq("organization_id", orgId)
    .maybeSingle();
  const { error } = await supabaseAdmin.from("marketing_bots").upsert(
    {
      organization_id: orgId,
      bot_user_id: me.id,
      username: me.username,
      token_sealed: sealSecret(token),
      webhook_secret: secret,
      settings: (prev?.settings ?? DEFAULT_BOT_SETTINGS) as never,
      connected_by: by,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw error;
  forgetMarketingBot(orgId);
  return { username: me.username };
}

export async function reconnectMarketingBot(orgId: string): Promise<void> {
  const own = await marketingBot(orgId);
  if (!own) throw new Error("Bot ulanmagan");
  const hook = await tg(own.token, "setWebhook", {
    url: webhookUrl(orgId),
    secret_token: own.webhookSecret,
    allowed_updates: MARKETING_BOT_UPDATES,
  });
  if (!hook.ok) throw new Error(hook.description || "Telegram webhook'ni qabul qilmadi");
}

export async function disconnectMarketingBot(orgId: string): Promise<void> {
  const own = await marketingBot(orgId);
  if (own) await tg(own.token, "deleteWebhook", {});
  await supabaseAdmin.from("marketing_bots").delete().eq("organization_id", orgId);
  await supabaseAdmin.from("marketing_bot_staff").delete().eq("organization_id", orgId);
  await supabaseAdmin
    .from("marketing_channels")
    .update({ via_marketing_bot: false })
    .eq("organization_id", orgId);
  forgetMarketingBot(orgId);
}

export async function saveMarketingBotSettings(orgId: string, raw: unknown): Promise<void> {
  const settings = parseBotSettings(raw);
  const { error } = await supabaseAdmin
    .from("marketing_bots")
    .update({ settings: settings as never, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId);
  if (error) throw error;
  forgetMarketingBot(orgId);
}

/** A one-time link that ties this person's Telegram to the bot (15 minutes). */
export async function staffLinkFor(orgId: string, profileId: string): Promise<string> {
  const own = await marketingBot(orgId);
  if (!own) throw new Error("Avval botni ulang");
  const code = crypto.randomBytes(6).toString("hex").toUpperCase();
  const { error } = await supabaseAdmin.from("marketing_bot_link_codes").insert({
    code,
    organization_id: orgId,
    profile_id: profileId,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
  if (error) throw error;
  return `https://t.me/${own.username}?start=staff_${code}`;
}

export async function unlinkStaff(orgId: string, profileId: string): Promise<void> {
  await supabaseAdmin
    .from("marketing_bot_staff")
    .delete()
    .eq("organization_id", orgId)
    .eq("profile_id", profileId);
}

/** A message to every marketing person who opened the bot. */
export async function notifyMarketingStaff(
  orgId: string,
  text: string,
  replyMarkup?: unknown,
): Promise<number> {
  const own = await marketingBot(orgId);
  if (!own) return 0;
  const { data } = await supabaseAdmin
    .from("marketing_bot_staff")
    .select("chat_id")
    .eq("organization_id", orgId);
  let sent = 0;
  for (const s of data ?? []) {
    const r = await tg(own.token, "sendMessage", {
      chat_id: s.chat_id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    if (r.ok) sent++;
  }
  return sent;
}

/** Sends an alert once per key (marketing_bot_log). */
export async function alertOnce(orgId: string, key: string, text: string, markup?: unknown) {
  const { error } = await supabaseAdmin
    .from("marketing_bot_log")
    .insert({ organization_id: orgId, key: key.slice(0, 200) });
  if (error) return false; // already sent (or the table is missing)
  await notifyMarketingStaff(orgId, text, markup);
  return true;
}

/** A named invite link in one of the company's channels, made by its marketing bot. */
export async function createChannelInvite(
  orgId: string,
  channelId: string,
  rawName: string,
  joinRequest: boolean,
  by: string,
): Promise<{ link: string; name: string }> {
  const own = await marketingBot(orgId);
  if (!own) throw new Error("Avval marketing botini ulang");
  const name = cleanInviteName(rawName);
  if (!name) throw new Error("Havola nomini yozing (masalan meta_kuz)");
  const { data: ch } = await supabaseAdmin
    .from("marketing_channels")
    .select("chat_id, username")
    .eq("organization_id", orgId)
    .eq("id", channelId)
    .maybeSingle();
  if (!ch) throw new Error("Kanal topilmadi");
  const chat = ch.chat_id ?? (ch.username ? `@${ch.username}` : null);
  if (!chat) throw new Error("Kanal bog'lanmagan");
  const r = await tg(own.token, "createChatInviteLink", {
    chat_id: chat,
    name,
    ...(joinRequest ? { creates_join_request: true } : {}),
  });
  if (!r.ok)
    throw new Error(
      /not enough rights|administrator|CHAT_ADMIN_REQUIRED/i.test(r.description ?? "")
        ? "Bot kanalda admin emas yoki «Havola yaratish» huquqi yo'q"
        : r.description || "Telegram havola bermadi",
    );
  const link = (r.result as { invite_link?: string } | undefined)?.invite_link;
  if (!link) throw new Error("Telegram havola bermadi");
  const { error } = await supabaseAdmin.from("marketing_channel_invites").insert({
    organization_id: orgId,
    channel_id: channelId,
    name,
    link,
    join_request: joinRequest,
    created_by: by,
  });
  if (error) throw error;
  return { link, name };
}

export async function revokeChannelInvite(orgId: string, inviteId: string): Promise<void> {
  const { data: inv } = await supabaseAdmin
    .from("marketing_channel_invites")
    .select("link, channel_id")
    .eq("organization_id", orgId)
    .eq("id", inviteId)
    .maybeSingle();
  if (!inv) return;
  const own = await marketingBot(orgId);
  const { data: ch } = await supabaseAdmin
    .from("marketing_channels")
    .select("chat_id, username")
    .eq("id", inv.channel_id)
    .maybeSingle();
  const chat = ch?.chat_id ?? (ch?.username ? `@${ch.username}` : null);
  if (own && chat)
    await tg(own.token, "revokeChatInviteLink", { chat_id: chat, invite_link: inv.link });
  await supabaseAdmin
    .from("marketing_channel_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId);
}
