import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callTelegramMethod } from "@/lib/telegram-report.server";
import { parseChannelUsername } from "@/lib/webinars";
import { saveShot } from "@/lib/marketing-shots.server";
import {
  SessionRevoked,
  tgFrame,
  tgLive,
  tgLiveConfigured,
  tgMarkBroken,
  tgSessions,
} from "@/lib/tg-live.server";

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
  return process.env["TELEGRAM_BOT_TOKEN"] ?? null;
}

async function memberCount(chat: string | number): Promise<number> {
  const token = botToken();
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

/** Re-reads one channel now (the "Yangilash" button) or every stale one (cron). */
export async function refreshChannels(opts: { orgId?: string; id?: string } = {}): Promise<number> {
  let q = supabaseAdmin
    .from("marketing_channels")
    .select("id, organization_id, username, chat_id")
    .is("archived_at", null)
    .limit(200);
  if (opts.id) q = q.eq("id", opts.id);
  if (opts.orgId) q = q.eq("organization_id", opts.orgId);
  if (!opts.id) {
    const stale = new Date(Date.now() - 55 * 60_000).toISOString();
    q = q.or(`members_checked_at.is.null,members_checked_at.lt.${stale}`);
  }
  const { data, error } = await q;
  if (error || !data) return 0;
  let done = 0;
  for (const c of data) {
    try {
      const members = await memberCount(c.chat_id ?? `@${c.username}`);
      await supabaseAdmin
        .from("marketing_channels")
        .update({ members, members_checked_at: new Date().toISOString(), last_error: null })
        .eq("id", c.id);
      await keepDay(c.organization_id, c.id, members);
      done++;
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

/** Every minute: the current viewers of each live (or about to start) YouTube webinar. */
export async function pollYoutubeWebinars(now = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + 15 * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("marketing_webinars")
    .select("id, organization_id, youtube_video_id, status, starts_at, project_id, shot_at")
    .eq("platform", "youtube")
    .is("archived_at", null)
    .neq("status", "ended")
    .not("youtube_video_id", "is", null)
    .limit(200);
  const due = (data ?? []).filter(
    (w) => w.status === "live" || (w.starts_at != null && w.starts_at <= soon),
  );
  if (!due.length) return 0;
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
      if (lsd?.actualEndTime) {
        await supabaseAdmin
          .from("marketing_webinars")
          .update({ status: "ended", ended_at: lsd.actualEndTime, poll_error: null })
          .eq("id", w.id);
        continue;
      }
      if (lsd?.concurrentViewers != null) {
        const viewers = Number(lsd.concurrentViewers) || 0;
        const at = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
        await supabaseAdmin.from("marketing_webinar_samples").upsert(
          {
            webinar_id: w.id,
            organization_id: w.organization_id,
            at,
            viewers,
            source: "youtube",
          },
          { onConflict: "webinar_id,at" },
        );
        await supabaseAdmin
          .from("marketing_webinars")
          .update({
            status: "live",
            poll_error: null,
            ...(w.starts_at ? {} : { starts_at: lsd.actualStartTime ?? at }),
          })
          .eq("id", w.id);
        saved++;
        // Every few minutes: the stream's current frame as proof.
        if (shotDue(w.shot_at, now)) {
          await youtubeShot(w, viewers, now).catch((err) =>
            console.error("[marketing] youtube shot", err),
          );
        }
      }
    }
  }
  return saved;
}

/* ---- Screenshots (proof pictures) -------------------------------------- */

/** A picture every 5 minutes while a stream is live. */
export const SHOT_EVERY_MS = 5 * 60_000;

const shotDue = (last: string | null, now: Date) =>
  !last || now.getTime() - new Date(last).getTime() >= SHOT_EVERY_MS - 20_000;

async function youtubeShot(
  w: {
    id: string;
    organization_id: string;
    youtube_video_id: string | null;
    project_id: string | null;
  },
  viewers: number,
  now: Date,
) {
  if (!w.youtube_video_id) return;
  let image: { data: Uint8Array; type: string } | null = null;
  // YouTube keeps the live stream's current frame as its "live" thumbnail.
  for (const name of ["maxresdefault_live.jpg", "hqdefault_live.jpg"]) {
    const res = await fetch(
      `https://i.ytimg.com/vi/${w.youtube_video_id}/${name}?t=${now.getTime()}`,
      {
        signal: AbortSignal.timeout(15_000),
      },
    ).catch(() => null);
    if (res?.ok) {
      image = { data: new Uint8Array(await res.arrayBuffer()), type: "image/jpeg" };
      break;
    }
  }
  await saveShot({
    orgId: w.organization_id,
    webinarId: w.id,
    projectId: w.project_id,
    viewers,
    source: "youtube",
    image,
    at: now,
  });
  await supabaseAdmin
    .from("marketing_webinars")
    .update({ shot_at: now.toISOString() })
    .eq("id", w.id);
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
      const { data: open } = await supabaseAdmin
        .from("marketing_webinars")
        .select("id, project_id, shot_at")
        .eq("organization_id", c.organization_id)
        .eq("platform", "telegram")
        .eq("channel_id", c.id)
        .eq("status", "live")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!state.live) {
        if (open) {
          await supabaseAdmin
            .from("marketing_webinars")
            .update({ status: "ended", ended_at: now.toISOString() })
            .eq("id", open.id);
        }
        continue;
      }
      let webinar = open;
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
          .select("id, project_id, shot_at")
          .single();
        if (insErr) throw insErr;
        webinar = created;
      }
      if (state.participants != null) {
        await supabaseAdmin.from("marketing_webinar_samples").upsert(
          {
            webinar_id: webinar.id,
            organization_id: c.organization_id,
            at,
            viewers: state.participants,
            source: "telegram",
          },
          { onConflict: "webinar_id,at" },
        );
        saved++;
      }
      if (shotDue(webinar.shot_at, now)) {
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
          .update({ shot_at: now.toISOString() })
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
