import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callTelegramMethod } from "@/lib/telegram-report.server";
import { parseChannelUsername } from "@/lib/webinars";
import { saveShot } from "@/lib/marketing-shots.server";
import { botIsAdmin, syncChannelAccount } from "@/lib/channel-events.server";
import { channelCheckDue, pairedShotDue } from "@/lib/marketing-rules";
import { addAutoEvent, recordPeak, upsertSample } from "@/lib/webinar-events.server";
import {
  REOPEN_MIN,
  canReopen,
  endedAt,
  endsWithTelegram,
  endsWithYoutube,
  silentTooLong,
  streamSilent,
  youtubeState,
} from "@/lib/webinar-auto-state";
import { marketingBot } from "@/lib/marketing-bot/bot.server";
import { marketingRulesFor, rulesOf } from "@/lib/marketing-rules.server";
import {
  SessionRevoked,
  tgFrame,
  ytFrame,
  tgLive,
  tgLiveConfigured,
  tgMarkBroken,
  tgSessions,
} from "@/lib/tg-live.server";
import { botToken } from "@/lib/bot-tokens.server";

// Marketing paneli's live figures: the platform's Telegram bot reads each
// connected channel's subscriber count (hourly, from the 5-minute cron) and
// keeps one row per day; the every-minute cron asks YouTube how many watch
// each live webinar (YOUTUBE_API_KEY) and keeps the counts and, every few
// minutes, a frame as proof. Telegram's live streams are read through the
// company's own Telegram account (services/tg-live): a stream that starts
// in a followed channel opens a webinar by itself.

const tashkentDay = (d = new Date()) =>
  new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);

function botToken(): string | null {
  return botToken("client") ?? null;
}

async function memberCount(chat: string | number, fallback?: string | null): Promise<number> {
  const token = botToken();
  if (!token && !fallback) throw new Error("TELEGRAM_BOT_TOKEN yo'q");
  // A private channel only the company's marketing bot is in: its token.
  if (fallback) {
    const n = token
      ? await callTelegramMethod(token, "getChatMemberCount", { chat_id: chat }).catch(() => null)
      : null;
    if (typeof n === "number") return n;
    const m = await callTelegramMethod(fallback, "getChatMemberCount", { chat_id: chat });
    if (typeof m !== "number") throw new Error("Telegram sonni bermadi");
    return m;
  }
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN yo'q");
  const n = await callTelegramMethod(token, "getChatMemberCount", { chat_id: chat });
  if (typeof n !== "number") throw new Error("Telegram sonni bermadi");
  return n;
}

async function keepDay(orgId: string, channelId: string, members: number) {
  const day = tashkentDay();
  const { data: prev } = await supabaseAdmin
    .from("marketing_channel_days")
    .select("min_members, max_members")
    .eq("channel_id", channelId)
    .eq("day", day)
    .maybeSingle();
  await supabaseAdmin.from("marketing_channel_days").upsert(
    {
      channel_id: channelId,
      organization_id: orgId,
      day,
      members,
      min_members: Math.min(prev?.min_members ?? members, members),
      max_members: Math.max(prev?.max_members ?? members, members),
    },
    { onConflict: "channel_id,day" },
  );
}

export type AddChannelInput = {
  /** @username or a t.me link (public channel). */
  channel?: string;
  /** A private channel the company bound to the bot with /bind. */
  chatId?: number;
  projectId?: string | null;
  purpose?: string;
  inviteLink?: string | null;
  note?: string | null;
  trackLive?: boolean;
};

const PURPOSES = new Set(["main", "ads", "webinar"]);

/**
 * Connects a channel: a public one by its @name, a private one the company
 * bound with /bind. The bot checks it and the first count is saved; a
 * channel connected before (even archived) is updated and brought back.
 */
export async function addChannel(
  orgId: string,
  userId: string,
  input: AddChannelInput,
): Promise<{ id: string; title: string; members: number }> {
  const token = botToken();
  if (!token) throw new Error("Platformaning Telegram boti sozlanmagan.");
  let target: string | number;
  if (input.chatId != null) {
    const { data: bound } = await supabaseAdmin
      .from("telegram_bound_chats")
      .select("chat_id")
      .eq("organization_id", orgId)
      .eq("chat_id", input.chatId)
      .maybeSingle();
    if (!bound) throw new Error("Bu kanal kompaniyangizga botda /bind bilan ulanmagan.");
    target = input.chatId;
  } else {
    const username = parseChannelUsername(input.channel ?? "");
    if (!username) throw new Error("Kanalning @nomini yoki t.me/... havolasini kiriting.");
    target = `@${username}`;
  }
  let chat: { id?: number; title?: string; type?: string; username?: string } | null;
  try {
    chat = (await callTelegramMethod(token, "getChat", { chat_id: target })) as typeof chat;
  } catch {
    throw new Error(
      input.chatId != null
        ? "Bot kanalni o'qiy olmadi: botni kanalga admin qilib qo'shing."
        : "Kanal topilmadi: u ochiq (public) bo'lishi va @nomi to'g'ri bo'lishi kerak.",
    );
  }
  if (!chat?.id || (chat.type !== "channel" && chat.type !== "supergroup")) {
    throw new Error("Bu kanal yoki guruh emas.");
  }
  const members = await memberCount(chat.id);
  const username = chat.username ?? null;
  const row = {
    organization_id: orgId,
    username,
    title: chat.title ?? username ?? String(chat.id),
    chat_id: chat.id,
    members,
    members_checked_at: new Date().toISOString(),
    last_error: null,
    project_id: input.projectId ?? null,
    purpose: input.purpose && PURPOSES.has(input.purpose) ? input.purpose : "main",
    invite_link: input.inviteLink?.trim().slice(0, 200) || null,
    note: input.note?.trim().slice(0, 500) || null,
    track_live: !!input.trackLive,
    archived_at: null,
  };
  // The same channel connected before (by its chat or its @name): update it.
  const { data: existing } = await supabaseAdmin
    .from("marketing_channels")
    .select("id")
    .eq("organization_id", orgId)
    .or(username ? `chat_id.eq.${chat.id},username.eq.${username}` : `chat_id.eq.${chat.id}`)
    .limit(1)
    .maybeSingle();
  const saved = existing
    ? await supabaseAdmin
        .from("marketing_channels")
        .update(row)
        .eq("id", existing.id)
        .select("id, title")
        .single()
    : await supabaseAdmin
        .from("marketing_channels")
        .insert({ ...row, created_by: userId })
        .select("id, title")
        .single();
  if (saved.error) throw saved.error;
  await keepDay(orgId, saved.data.id, members);
  return { id: saved.data.id, title: saved.data.title, members };
}

/**
 * Re-reads one channel now (the "Yangilash" button, which also reads
 * Telegram's statistics at once) or every stale one (hourly, from the cron):
 * its subscribers, whether the bot is its admin, and -- through the
 * company's Telegram account -- its recent joins / leaves and statistics.
 */
export async function refreshChannels(opts: { orgId?: string; id?: string } = {}): Promise<number> {
  const build = (cols: string) => {
    let q = supabaseAdmin
      .from("marketing_channels")
      .select(cols)
      .is("archived_at", null)
      .limit(200);
    if (opts.id) q = q.eq("id", opts.id);
    if (opts.orgId) q = q.eq("organization_id", opts.orgId);
    if (!opts.id) {
      // The shortest interval one can choose; each company's own is checked below.
      const stale = new Date(Date.now() - 25 * 60_000).toISOString();
      q = q.or(`members_checked_at.is.null,members_checked_at.lt.${stale}`);
    }
    return q;
  };
  type Row = {
    id: string;
    organization_id: string;
    username: string | null;
    chat_id: number | null;
    members_checked_at?: string | null;
    admin_log_at?: string | null;
    tg_stats_at?: string | null;
  };
  let res = await build(
    "id, organization_id, username, chat_id, members_checked_at, admin_log_at, tg_stats_at",
  );
  // Before the channel-analytics migration: the plain columns.
  const analytics = !res.error;
  if (res.error) res = await build("id, organization_id, username, chat_id, members_checked_at");
  const rows = res.data as Row[] | null;
  if (res.error || !rows) return 0;
  const rules = await marketingRulesFor(rows.map((c) => c.organization_id));
  const now = new Date();
  const data = opts.id
    ? rows
    : rows.filter((c) =>
        channelCheckDue(c.members_checked_at ?? null, now, rulesOf(rules, c.organization_id)),
      );
  const sessions =
    analytics && tgLiveConfigured()
      ? await tgSessions([...new Set(data.map((c) => c.organization_id))]).catch(
          () => new Map<string, string>(),
        )
      : new Map<string, string>();
  let done = 0;
  for (const c of data) {
    try {
      const mbot = await marketingBot(c.organization_id).catch(() => null);
      const members = await memberCount(c.chat_id ?? `@${c.username}`, mbot?.token ?? null);
      await supabaseAdmin
        .from("marketing_channels")
        .update({ members, members_checked_at: new Date().toISOString(), last_error: null })
        .eq("id", c.id);
      await keepDay(c.organization_id, c.id, members);
      done++;
      if (!analytics) continue;
      if (c.chat_id != null) {
        let admin = await botIsAdmin(c.chat_id);
        if (!admin && mbot) {
          const viaBot = await botIsAdmin(c.chat_id, mbot.token);
          if (viaBot != null) {
            await supabaseAdmin
              .from("marketing_channels")
              .update({ via_marketing_bot: viaBot })
              .eq("id", c.id)
              .then(
                () => undefined,
                () => undefined,
              );
            admin = viaBot || admin;
          }
        }
        if (admin != null) {
          await supabaseAdmin
            .from("marketing_channels")
            .update({ bot_admin: admin })
            .eq("id", c.id);
        }
      }
      const session = sessions.get(c.organization_id);
      if (session) {
        await syncChannelAccount(
          {
            id: c.id,
            organization_id: c.organization_id,
            members,
            username: c.username,
            chat_id: c.chat_id,
            admin_log_at: c.admin_log_at ?? null,
            tg_stats_at: c.tg_stats_at ?? null,
          },
          session,
          { force: !!opts.id, rules: rulesOf(rules, c.organization_id) },
        ).catch((err) => console.error("[marketing] channel account sync", err));
      }
    } catch (err) {
      await supabaseAdmin
        .from("marketing_channels")
        .update({
          members_checked_at: new Date().toISOString(),
          last_error: err instanceof Error ? err.message.slice(0, 300) : "error",
        })
        .eq("id", c.id);
    }
  }
  return done;
}

type YtItem = {
  id: string;
  liveStreamingDetails?: {
    actualStartTime?: string;
    actualEndTime?: string;
    concurrentViewers?: string;
  };
};

/** The time of a webinar's newest automatic count (of one source, or either). */
async function lastSampleAt(
  webinarId: string,
  source?: "youtube" | "telegram",
): Promise<string | null> {
  const q = supabaseAdmin
    .from("marketing_webinar_samples")
    .select("at")
    .eq("webinar_id", webinarId)
    .in("source", source ? [source] : ["youtube", "telegram"]);
  const { data, error } = await q.order("at", { ascending: false }).limit(1).maybeSingle();
  if (error) return null;
  return data?.at ?? null;
}

/**
 * Every minute: the current viewers of each live (or about to start)
 * YouTube webinar. Its state follows the broadcast (webinar-auto-state):
 * live from the broadcast's start, ended with it -- unless its Telegram
 * stream is still on air, then it ends when Telegram stops.
 */
export async function pollYoutubeWebinars(now = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + 15 * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("marketing_webinars")
    // "*": tg_shot_at exists only after migration 20270128.
    .select("*")
    .is("archived_at", null)
    .neq("status", "ended")
    .not("youtube_video_id", "is", null)
    .limit(200);
  // Also one with a link but no time: YouTube knows when it starts.
  const due = (data ?? []).filter(
    (w) => w.status === "live" || w.starts_at == null || w.starts_at <= soon,
  );
  if (!due.length) return 0;
  const rules = await marketingRulesFor(due.map((w) => w.organization_id));
  const key = process.env["YOUTUBE_API_KEY"];
  if (!key) {
    await supabaseAdmin
      .from("marketing_webinars")
      .update({ poll_error: "no_key" })
      .in(
        "id",
        due.map((w) => w.id),
      );
    return 0;
  }
  let saved = 0;
  for (let i = 0; i < due.length; i += 50) {
    const batch = due.slice(i, i + 50);
    const ids = batch.map((w) => w.youtube_video_id).join(",");
    let items: YtItem[] = [];
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${ids}&key=${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!res.ok) throw new Error(`YouTube ${res.status}`);
      items = ((await res.json()) as { items?: YtItem[] }).items ?? [];
    } catch (err) {
      await supabaseAdmin
        .from("marketing_webinars")
        .update({ poll_error: err instanceof Error ? err.message.slice(0, 200) : "youtube" })
        .in(
          "id",
          batch.map((w) => w.id),
        );
      continue;
    }
    for (const w of batch) {
      const it = items.find((x) => x.id === w.youtube_video_id);
      const lsd = it?.liveStreamingDetails;
      if (!it) {
        await supabaseAdmin
          .from("marketing_webinars")
          .update({ poll_error: "not_found" })
          .eq("id", w.id);
        continue;
      }
      const state = youtubeState(lsd);
      if (state === "ended") {
        // Over on YouTube. Still on air in Telegram: the webinar stays live
        // and ends once Telegram stops (checked again every minute).
        const lastTg = w.channel_id ? await lastSampleAt(w.id, "telegram") : null;
        if (!endsWithYoutube({ tracksTelegram: !!w.channel_id, lastTelegramAt: lastTg, now }))
          continue;
        await supabaseAdmin
          .from("marketing_webinars")
          .update({
            status: "ended",
            ended_at: endedAt(lsd?.actualEndTime, lastTg) ?? now.toISOString(),
            poll_error: null,
          })
          .eq("id", w.id);
        continue;
      }
      if (state === "live") {
        const viewers = lsd?.concurrentViewers != null ? Number(lsd.concurrentViewers) || 0 : null;
        const at = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
        // YouTube came on just now: the webinar wasn't live yet, or it was
        // (Telegram first) but YouTube had no count in the last minutes.
        const prevYt = viewers != null ? await lastSampleAt(w.id, "youtube") : null;
        const ytStarted = w.status !== "live" || (viewers != null && streamSilent(prevYt, now));
        if (viewers != null) {
          await upsertSample({
            webinar_id: w.id,
            organization_id: w.organization_id,
            at,
            viewers,
            source: "youtube",
          });
        }
        await supabaseAdmin
          .from("marketing_webinars")
          .update({
            status: "live",
            ended_at: null,
            poll_error: null,
            ...(w.starts_at && w.status === "live"
              ? {}
              : { starts_at: lsd?.actualStartTime ?? at }),
          })
          .eq("id", w.id);
        if (viewers != null) await recordPeak(w.id, now).catch(() => undefined);
        if (ytStarted) {
          await addAutoEvent({
            webinarId: w.id,
            orgId: w.organization_id,
            kind: "yt_live_on",
            at: w.status !== "live" && lsd?.actualStartTime ? new Date(lsd.actualStartTime) : now,
          }).catch(() => false);
        }
        if (viewers == null) continue;
        saved++;
        // Every few minutes: the stream's current frame as proof. Cutting
        // a frame takes up to a minute, so it is not waited for.
        const r = rulesOf(rules, w.organization_id);
        const tgShotAt = (w as { tg_shot_at?: string | null }).tg_shot_at ?? null;
        if (pairedShotDue(w.shot_at, w.channel_id ? tgShotAt : null, now, r)) {
          await supabaseAdmin
            .from("marketing_webinars")
            .update({ shot_at: now.toISOString() })
            .eq("id", w.id);
          void youtubeShot(w, viewers, now, r.shots.youtubeFrame).catch((err) =>
            console.error("[marketing] youtube shot", err),
          );
        }
      }
    }
  }
  return saved;
}

/* ---- Screenshots (proof pictures) -------------------------------------- */

/** A picture every few minutes while a stream is live. */
// How often: Marketing -> Sozlash -> Kuzatuv (5 minutes by default).

async function youtubeShot(
  w: {
    id: string;
    organization_id: string;
    youtube_video_id: string | null;
    project_id: string | null;
  },
  viewers: number,
  now: Date,
  realFrame: boolean,
) {
  if (!w.youtube_video_id) return;
  // The stream's own current frame, cut on the VPS (yt-dlp + ffmpeg). The
  // "live" thumbnail on i.ytimg.com is the cover the host uploaded, the
  // same picture every time, so without a frame a card (time + viewers) is
  // kept instead.
  const frame =
    realFrame && tgLiveConfigured()
      ? await ytFrame(w.youtube_video_id).catch((err) => {
          console.error("[marketing] youtube frame", err);
          return null;
        })
      : null;
  const image = frame ? { data: frame, type: "image/jpeg" } : null;
  await saveShot({
    orgId: w.organization_id,
    webinarId: w.id,
    projectId: w.project_id,
    viewers,
    source: "youtube",
    image,
    at: now,
  });
}

/**
 * Every minute: each channel with "Efirlarni kuzatish" on, through its
 * company's Telegram account. A stream that started opens a webinar (its
 * project from the channel); viewers are kept each minute and a picture
 * every 5 minutes -- the stream's frame, or a card with the time and count
 * when no frame can be taken; a stream that stopped closes its webinar.
 */
export async function pollTelegramLive(now = new Date()): Promise<number> {
  if (!tgLiveConfigured()) return 0;
  const { data: channels, error } = await supabaseAdmin
    .from("marketing_channels")
    .select("id, organization_id, title, username, chat_id, project_id")
    .eq("track_live", true)
    .is("archived_at", null)
    .limit(200);
  if (error || !channels?.length) return 0;
  const sessions = await tgSessions([...new Set(channels.map((c) => c.organization_id))]);
  const rules = await marketingRulesFor(channels.map((c) => c.organization_id));
  const broken = new Set<string>();
  const at = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
  let saved = 0;
  for (const c of channels) {
    const session = sessions.get(c.organization_id);
    if (!session || broken.has(c.organization_id)) continue;
    const ref = c.username ? `@${c.username}` : c.chat_id != null ? String(c.chat_id) : null;
    if (!ref) continue;
    try {
      const state = await tgLive(session, ref);
      // The webinar this stream belongs to: one already live on this channel
      // (also a YouTube webinar streaming here at the same time), else one
      // planned on this channel around now, else a new one.
      const { data: open } = await supabaseAdmin
        .from("marketing_webinars")
        .select("*")
        .eq("organization_id", c.organization_id)
        .eq("channel_id", c.id)
        .eq("status", "live")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!state.live) {
        // A webinar with a YouTube broadcast is closed by YouTube's poller
        // (which waits for Telegram); a Telegram-only one here, once the
        // stream has been off for a few minutes (one missed look isn't the end).
        if (open) {
          const lastTg = await lastSampleAt(open.id, "telegram");
          if (
            endsWithTelegram({ youtubeOpen: !!open.youtube_video_id, lastTelegramAt: lastTg, now })
          )
            await supabaseAdmin
              .from("marketing_webinars")
              .update({ status: "ended", ended_at: endedAt(lastTg) ?? now.toISOString() })
              .eq("id", open.id);
        }
        continue;
      }
      let webinar = open;
      if (!webinar) {
        const { data: planned } = await supabaseAdmin
          .from("marketing_webinars")
          .select("*")
          .eq("organization_id", c.organization_id)
          .eq("channel_id", c.id)
          .eq("status", "planned")
          .is("archived_at", null)
          .gte("starts_at", new Date(now.getTime() - 3 * 3_600_000).toISOString())
          .lte("starts_at", new Date(now.getTime() + 3_600_000).toISOString())
          .order("starts_at")
          .limit(1)
          .maybeSingle();
        if (planned) {
          await supabaseAdmin
            .from("marketing_webinars")
            .update({ status: "live", poll_error: null })
            .eq("id", planned.id);
          webinar = { ...planned, status: "live" };
        }
      }
      if (!webinar) {
        // The stream came back a few minutes after it stopped: the same
        // webinar goes on instead of a new one.
        const { data: recent } = await supabaseAdmin
          .from("marketing_webinars")
          .select("*")
          .eq("organization_id", c.organization_id)
          .eq("channel_id", c.id)
          .eq("status", "ended")
          .is("archived_at", null)
          .gte("ended_at", new Date(now.getTime() - REOPEN_MIN * 60_000).toISOString())
          .order("ended_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recent && canReopen(recent.ended_at, now)) {
          await supabaseAdmin
            .from("marketing_webinars")
            .update({ status: "live", ended_at: null, poll_error: null })
            .eq("id", recent.id);
          webinar = { ...recent, status: "live", ended_at: null };
        }
      }
      if (!webinar) {
        const day = new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
        const { data: created, error: insErr } = await supabaseAdmin
          .from("marketing_webinars")
          .insert({
            organization_id: c.organization_id,
            title: (
              state.title?.trim() || `${c.title} — efir ${day.split("-").reverse().join(".")}`
            ).slice(0, 200),
            platform: "telegram",
            channel_id: c.id,
            project_id: c.project_id,
            status: "live",
            starts_at: now.toISOString(),
            auto_created: true,
          })
          .select("*")
          .single();
        if (insErr) throw insErr;
        webinar = created;
      }
      // The Telegram live just came on (no Telegram count in 3 minutes).
      const { data: recentTg } = await supabaseAdmin
        .from("marketing_webinar_samples")
        .select("at")
        .eq("webinar_id", webinar.id)
        .eq("source", "telegram")
        .gte("at", new Date(now.getTime() - 3 * 60_000).toISOString())
        .limit(1);
      if (!recentTg?.length) {
        await addAutoEvent({
          webinarId: webinar.id,
          orgId: c.organization_id,
          kind: "tg_live_on",
          at: now,
        }).catch(() => false);
      }
      if (state.participants != null) {
        await upsertSample({
          webinar_id: webinar.id,
          organization_id: c.organization_id,
          at,
          viewers: state.participants,
          source: "telegram",
        });
        await recordPeak(webinar.id, now).catch(() => undefined);
        saved++;
      }
      // Its own picture time after migration 20270128 (tg_shot_at), so the
      // YouTube and Telegram pictures of one webinar are both taken.
      const hasOwn = "tg_shot_at" in webinar;
      const own = hasOwn ? (webinar.tg_shot_at ?? null) : webinar.shot_at;
      const partner = hasOwn && webinar.youtube_video_id ? webinar.shot_at : null;
      if (pairedShotDue(own, partner, now, rulesOf(rules, c.organization_id))) {
        const frame = await tgFrame(session, ref).catch((e) => {
          if (e instanceof SessionRevoked) throw e;
          return null;
        });
        await saveShot({
          orgId: c.organization_id,
          webinarId: webinar.id,
          projectId: webinar.project_id ?? c.project_id,
          channelId: c.id,
          viewers: state.participants,
          source: "telegram",
          image: frame ? { data: frame, type: "image/jpeg" } : null,
          at: now,
        });
        await supabaseAdmin
          .from("marketing_webinars")
          .update(hasOwn ? { tg_shot_at: now.toISOString() } : { shot_at: now.toISOString() })
          .eq("id", webinar.id);
      }
    } catch (err) {
      if (err instanceof SessionRevoked) {
        broken.add(c.organization_id);
        await tgMarkBroken(c.organization_id, err.message);
        continue;
      }
      await supabaseAdmin
        .from("marketing_channels")
        .update({ last_error: err instanceof Error ? err.message.slice(0, 300) : "tg-live" })
        .eq("id", c.id);
    }
  }
  return saved;
}

/**
 * Every minute, after the pollers: a live webinar whose streams have all
 * been silent for half an hour (the Telegram account dropped, the end
 * signal was lost) is closed at its last count. One whose YouTube link is
 * failing to answer is left to YouTube, and one counted by hand is never
 * touched (only automatic counts are looked at).
 */
export async function closeSilentWebinars(now = new Date()): Promise<number> {
  const { data } = await supabaseAdmin
    .from("marketing_webinars")
    .select("id, youtube_video_id, poll_error")
    .eq("status", "live")
    .is("archived_at", null)
    .limit(200);
  let closed = 0;
  for (const w of data ?? []) {
    if (w.youtube_video_id && w.poll_error) continue;
    const last = await lastSampleAt(w.id);
    if (!silentTooLong(last, now)) continue;
    await supabaseAdmin
      .from("marketing_webinars")
      .update({ status: "ended", ended_at: last })
      .eq("id", w.id)
      .eq("status", "live");
    closed++;
  }
  return closed;
}
