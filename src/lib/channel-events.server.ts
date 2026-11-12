// Server-only. Who joins and who leaves a marketing channel, and when:
//   * the platform's bot, once it is an admin of the channel, is told about
//     every join / leave (chat_member updates, telegram.webhook.ts);
//   * the company's Telegram account, when it is an admin, reads the
//     channel's "recent actions" (last 48 hours) every hour and Telegram's
//     own statistics (subscribers, joined / left each day, sources, hours)
//     every 6 hours.
// Events land in marketing_channel_events (only the Telegram user id, no
// names); joined / left per day in marketing_channel_days (Telegram's
// statistics win over counted events for the days they cover).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { callTelegramMethod } from "@/lib/telegram-report.server";
import { DEFAULT_MARKETING_RULES, type MarketingRules } from "@/lib/marketing-rules";
import { parseTgStats, tashkentDay, type TgStatsRaw } from "@/lib/channel-analytics";
import {
  AdminRequired,
  SessionRevoked,
  tgAdminLog,
  tgChannelStats,
  tgMarkBroken,
} from "@/lib/tg-live.server";

type EventIn = {
  at: string;
  kind: "join" | "leave";
  tgUserId: number;
  inviteLink?: string | null;
  inviteName?: string | null;
};

type ChannelRef = { id: string; organization_id: string; members: number | null };

const LOG_KEEP_MS = 48 * 3_600_000;

/** Saves events (duplicates ignored) and recounts the days they fall on. */
export async function recordChannelEvents(
  c: ChannelRef,
  events: EventIn[],
  source: "bot" | "account",
): Promise<number> {
  if (!events.length) return 0;
  const rows = events.map((e) => ({
    organization_id: c.organization_id,
    channel_id: c.id,
    at: e.at,
    kind: e.kind,
    tg_user_id: e.tgUserId,
    invite_link: e.inviteLink?.slice(0, 200) ?? null,
    invite_name: e.inviteName?.slice(0, 120) ?? null,
    source,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin
      .from("marketing_channel_events")
      .upsert(rows.slice(i, i + 500), {
        onConflict: "channel_id,tg_user_id,kind,at",
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }
  const days = [...new Set(events.map((e) => tashkentDay(Date.parse(e.at))))];
  for (const day of days) await recountDay(c, day);
  return rows.length;
}

/** joined / left of one day from the events, unless Telegram's statistics cover it. */
async function recountDay(c: ChannelRef, day: string) {
  const { data: row } = await supabaseAdmin
    .from("marketing_channel_days")
    .select("counts_source")
    .eq("channel_id", c.id)
    .eq("day", day)
    .maybeSingle();
  if (row?.counts_source === "stats") return;
  const start = new Date(`${day}T00:00:00+05:00`).toISOString();
  const end = new Date(Date.parse(start) + 86_400_000).toISOString();
  const count = async (kind: "join" | "leave") => {
    const { count: n } = await supabaseAdmin
      .from("marketing_channel_events")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", c.id)
      .eq("kind", kind)
      .gte("at", start)
      .lt("at", end);
    return n ?? 0;
  };
  const [joined, left] = await Promise.all([count("join"), count("leave")]);
  if (row) {
    await supabaseAdmin
      .from("marketing_channel_days")
      .update({ joined, left_count: left, counts_source: "events" })
      .eq("channel_id", c.id)
      .eq("day", day);
  } else if (c.members != null) {
    await supabaseAdmin.from("marketing_channel_days").insert({
      channel_id: c.id,
      organization_id: c.organization_id,
      day,
      members: c.members,
      min_members: c.members,
      max_members: c.members,
      joined,
      left_count: left,
      counts_source: "events",
    });
  }
}

/* ---- The bot: chat_member updates ------------------------------------- */

type ChatMemberStatus = {
  status?: string;
  is_member?: boolean;
  user?: { id?: number; is_bot?: boolean };
};
export type ChatMemberUpdate = {
  chat?: { id?: number; type?: string };
  date?: number;
  old_chat_member?: ChatMemberStatus;
  new_chat_member?: ChatMemberStatus;
  invite_link?: { invite_link?: string; name?: string };
  via_chat_folder_invite_link?: boolean;
};

const inChat = (m: ChatMemberStatus | undefined) =>
  !!m &&
  (m.status === "member" ||
    m.status === "administrator" ||
    m.status === "creator" ||
    (m.status === "restricted" && m.is_member === true));

/** A join or a leave in a channel the bot is an admin of; null when it is neither. */
export function chatMemberKind(u: ChatMemberUpdate): "join" | "leave" | null {
  const was = inChat(u.old_chat_member);
  const is = inChat(u.new_chat_member);
  if (!was && is) return "join";
  if (was && !is) return "leave";
  return null;
}

/** From the webhook: records the join/leave for every company following the channel. */
export async function handleChatMemberUpdate(u: ChatMemberUpdate): Promise<void> {
  const chatId = u.chat?.id;
  const user = u.new_chat_member?.user;
  const kind = chatMemberKind(u);
  if (!chatId || !kind || !user?.id || user.is_bot) return;
  const { data: channels } = await supabaseAdmin
    .from("marketing_channels")
    .select("id, organization_id, members")
    .eq("chat_id", chatId)
    .is("archived_at", null);
  for (const c of channels ?? []) {
    await recordChannelEvents(
      c,
      [
        {
          at: new Date((u.date ?? Date.now() / 1000) * 1000).toISOString(),
          kind,
          tgUserId: user.id,
          inviteLink: u.invite_link?.invite_link ?? null,
          inviteName: u.invite_link?.name ?? (u.via_chat_folder_invite_link ? "Papka" : null),
        },
      ],
      "bot",
    );
  }
}

let botId: number | null = null;

/** Whether the platform's bot is an admin of the chat (it then hears joins / leaves). */
export async function botIsAdmin(chatId: number): Promise<boolean | null> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return null;
  try {
    if (botId == null) {
      const me = (await callTelegramMethod(token, "getMe", {})) as { id?: number } | null;
      botId = me?.id ?? null;
    }
    if (botId == null) return null;
    const m = (await callTelegramMethod(token, "getChatMember", {
      chat_id: chatId,
      user_id: botId,
    })) as { status?: string } | null;
    return m?.status === "administrator" || m?.status === "creator";
  } catch {
    return false;
  }
}

/* ---- The account: recent actions + Telegram's statistics -------------- */

/**
 * For one channel with the company's account: the last hours' joins and
 * leaves (hourly) and Telegram's statistics (every 6 hours, or now when
 * `force`). Errors are kept on the channel (tg_stats_error).
 */
export async function syncChannelAccount(
  c: ChannelRef & {
    username: string | null;
    chat_id: number | null;
    admin_log_at: string | null;
    tg_stats_at: string | null;
  },
  session: string,
  opts: { force?: boolean; now?: Date; rules?: MarketingRules } = {},
): Promise<void> {
  const rules = opts.rules ?? DEFAULT_MARKETING_RULES;
  const now = opts.now ?? new Date();
  const ref = c.username ? `@${c.username}` : c.chat_id != null ? String(c.chat_id) : null;
  if (!ref) return;
  const patch: {
    admin_log_at?: string;
    tg_stats?: Json;
    tg_stats_at?: string;
    tg_stats_error?: string | null;
  } = {};
  if (rules.channels.recentActions) {
    try {
      const last = c.admin_log_at ? Date.parse(c.admin_log_at) - 10 * 60_000 : 0;
      const since = Math.max(last, now.getTime() - LOG_KEEP_MS) / 1000;
      const log = await tgAdminLog(session, ref, since);
      await recordChannelEvents(
        c,
        log.map((e) => ({
          at: new Date(e.at * 1000).toISOString(),
          kind: e.kind,
          tgUserId: e.user,
          inviteLink: e.link,
          inviteName: e.name ?? (e.chatlist ? "Papka" : null),
        })),
        "account",
      );
      patch.admin_log_at = now.toISOString();
      patch.tg_stats_error = null;
    } catch (err) {
      if (err instanceof SessionRevoked) {
        await tgMarkBroken(c.organization_id, err.message);
        return;
      }
      patch.tg_stats_error =
        err instanceof AdminRequired ? "admin_required" : String(err).slice(0, 300);
    }
  }
  const statsDue =
    opts.force ||
    !c.tg_stats_at ||
    now.getTime() - Date.parse(c.tg_stats_at) >=
      rules.channels.statsEveryH * 3_600_000 - 10 * 60_000;
  if (statsDue && patch.tg_stats_error !== "admin_required") {
    try {
      const raw = (await tgChannelStats(session, ref)) as TgStatsRaw;
      patch.tg_stats = raw as unknown as Json;
      patch.tg_stats_at = now.toISOString();
      if (!("tg_stats_error" in patch)) patch.tg_stats_error = null;
      await saveStatsDays(c, raw);
    } catch (err) {
      if (err instanceof SessionRevoked) {
        await tgMarkBroken(c.organization_id, err.message);
        return;
      }
      patch.tg_stats_error =
        err instanceof AdminRequired ? "stats_unavailable" : String(err).slice(0, 300);
    }
  }
  if (Object.keys(patch).length) {
    await supabaseAdmin.from("marketing_channels").update(patch).eq("id", c.id);
  }
}

/** Telegram's per-day subscribers and joined / left into marketing_channel_days. */
async function saveStatsDays(c: ChannelRef, raw: TgStatsRaw) {
  const stats = parseTgStats(raw);
  if (!stats?.days.length) return;
  const { data: existing } = await supabaseAdmin
    .from("marketing_channel_days")
    .select("day")
    .eq("channel_id", c.id)
    .gte("day", stats.days[0]!.day);
  const have = new Set((existing ?? []).map((d) => d.day));
  const today = tashkentDay(Date.now());
  for (const d of stats.days) {
    if (d.joined == null && d.left == null && d.members == null) continue;
    // Today's figures are not final in Telegram's statistics: the events count it.
    const counts =
      d.day < today && (d.joined != null || d.left != null)
        ? { joined: d.joined ?? 0, left_count: d.left ?? 0, counts_source: "stats" as const }
        : {};
    if (have.has(d.day)) {
      if (Object.keys(counts).length) {
        await supabaseAdmin
          .from("marketing_channel_days")
          .update(counts)
          .eq("channel_id", c.id)
          .eq("day", d.day);
      }
    } else if (d.members != null) {
      await supabaseAdmin.from("marketing_channel_days").insert({
        channel_id: c.id,
        organization_id: c.organization_id,
        day: d.day,
        members: d.members,
        min_members: d.members,
        max_members: d.members,
        ...counts,
      });
    }
  }
}
