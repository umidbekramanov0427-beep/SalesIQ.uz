// Server-only. Builds the daily team report text and sends it via the
// Telegram Bot API. Used by both the scheduled send and the "send test"
// button, so the two never drift apart.
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { orgPhase } from "@/lib/org-access";
import { loadAllOrgAccess } from "@/lib/org-access.server";
import { buildFullDailyReport, buildPersonalDailyReport } from "@/lib/daily-report-builder.server";
import { appendRowToGoogleSheet } from "@/lib/google-sheets.server";

function requireBotToken(): string {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("Missing environment variable: TELEGRAM_BOT_TOKEN");
  return token;
}

// The platform runs exactly one Telegram bot (TELEGRAM_BOT_TOKEN) shared by
// every org -- Telegram Login needs that bot's own @username for the deep
// link (t.me/<username>?start=...), which Telegram never hands you at
// token-creation time, only via getMe. Cached in memory for the life of
// this server instance since a bot's username essentially never changes.
let cachedBotUsername: string | null = null;

export async function getTelegramBotUsername(): Promise<string> {
  if (cachedBotUsername) return cachedBotUsername;
  const token = requireBotToken();
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  if (!res.ok) throw new Error(`Telegram getMe failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { ok?: boolean; result?: { username?: string } };
  const username = json.result?.username;
  if (!username) throw new Error("Telegram bot has no username.");
  cachedBotUsername = username;
  return username;
}

// No default timeout on fetch() -- a stalled connection to Telegram used
// to hang this call indefinitely, which is worse than it looks here since
// this runs in a loop over every recipient in the scheduled daily-report
// job (see sendDailyReportToLinkedManagers below): one stuck request could
// stall the report for every remaining org/recipient behind it.
export async function callTelegramMethod(
  token: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Telegram ${method} failed (${res.status}): ${await res.text()}`);
  const json = (await res.json().catch(() => null)) as { result?: unknown } | null;
  return json?.result ?? null;
}

/**
 * The secret Telegram must send with every webhook delivery (header
 * X-Telegram-Bot-Api-Secret-Token). TELEGRAM_WEBHOOK_SECRET when set,
 * otherwise derived from the bot token, so it exists without extra setup.
 * Without it anyone could post a forged update to /telegram/webhook --
 * e.g. a fake "/start login_<token>" from someone else's chat id, which
 * would sign the forger in as that person.
 */
export function telegramWebhookSecret(): string | null {
  const explicit = process.env["TELEGRAM_WEBHOOK_SECRET"];
  if (explicit) return explicit;
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return null;
  return crypto.createHmac("sha256", token).update("salesiq-telegram-webhook").digest("hex");
}

let webhookSecretRegistered = false;

/**
 * Makes sure Telegram sends telegramWebhookSecret() with every delivery:
 * re-registers the bot's current webhook URL (or `${origin}/telegram/webhook`
 * when none is set) with that secret. Run from the 5-minute cron, once per
 * server instance, so a deploy that starts enforcing the secret heals
 * itself within minutes -- Telegram retries the deliveries refused meanwhile.
 * A webhook pointing anywhere other than our /telegram/webhook is left alone.
 */
export async function ensureTelegramWebhookSecret(origin: string): Promise<void> {
  if (webhookSecretRegistered) return;
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const secret = telegramWebhookSecret();
  if (!token || !secret) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  if (!res.ok) return;
  const info = (await res.json()) as { result?: { url?: string } };
  const url = info.result?.url || `${origin}/telegram/webhook`;
  if (new URL(url).pathname !== "/telegram/webhook") return;
  // allowed_updates is left out on purpose: Telegram then keeps the
  // previous setting.
  await callTelegramMethod(token, "setWebhook", { url, secret_token: secret });
  webhookSecretRegistered = true;
}

async function sendViaBotToken(token: string, chatId: number, text: string): Promise<void> {
  await callTelegramMethod(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}

export async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  await sendViaBotToken(requireBotToken(), chatId, text);
}

/** Same as sendTelegramMessage, returning the sent message's id (for matching replies to it). */
export async function sendTelegramMessageForReply(
  chatId: number,
  text: string,
): Promise<number | null> {
  const result = (await callTelegramMethod(requireBotToken(), "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  })) as { message_id?: number } | null;
  return result?.message_id ?? null;
}

/** A photo or document for sendTelegramFile: the file itself, or a file_id Telegram already has. */
export type TelegramFileKind = "photo" | "document" | "audio" | "voice";
export type TelegramFile =
  | { kind: TelegramFileKind; name: string; type: string; data: Uint8Array }
  | { kind: TelegramFileKind; fileId: string };

const FILE_METHOD: Record<TelegramFileKind, string> = {
  photo: "sendPhoto",
  document: "sendDocument",
  audio: "sendAudio",
  voice: "sendVoice",
};

/** How Telegram should show a file: a photo, a music/audio track, a voice note or a document. */
export function telegramFileKind(type: string, name: string): TelegramFileKind {
  const t = type.toLowerCase();
  // Recorded in the lead chat ("voice-....ogg/.m4a"): a voice note.
  if (name.startsWith("voice-") && t.startsWith("audio/")) return "voice";
  if (/^image\/(jpeg|png|webp)$/.test(t)) return "photo";
  if (t === "audio/ogg" || /\.(ogg|oga|opus)$/i.test(name)) return "voice";
  if (/^audio\/(mpeg|mp3|mp4|x-m4a|m4a|aac)$/.test(t) || /\.(mp3|m4a)$/i.test(name)) return "audio";
  return "document";
}

const CAPTION_LIMIT = 1024;

/**
 * Sends a file (photo, document, audio track or voice note), with the text
 * as its caption when it fits
 * (Telegram allows 1024 characters; longer text follows as its own
 * message). Returns the file_id, so the same file goes to the next chat
 * without being uploaded again.
 */
export async function sendTelegramFile(
  chatId: number,
  file: TelegramFile,
  text: string,
): Promise<string | null> {
  const token = requireBotToken();
  const method = FILE_METHOD[file.kind];
  const withCaption = text.length > 0 && text.length <= CAPTION_LIMIT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    if ("fileId" in file) {
      res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          [file.kind]: file.fileId,
          ...(withCaption ? { caption: text } : {}),
        }),
        signal: controller.signal,
      });
    } else {
      const form = new FormData();
      form.set("chat_id", String(chatId));
      if (withCaption) form.set("caption", text);
      form.set(file.kind, new Blob([new Uint8Array(file.data)], { type: file.type }), file.name);
      res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    }
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Telegram ${method} failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as {
    result?: {
      photo?: { file_id: string }[];
      document?: { file_id: string };
      audio?: { file_id: string };
      voice?: { file_id: string };
    };
  };
  if (text && !withCaption) await sendTelegramMessage(chatId, text);
  const r = json.result;
  const photos = r?.photo;
  return photos?.length
    ? photos[photos.length - 1]!.file_id
    : (r?.document?.file_id ?? r?.audio?.file_id ?? r?.voice?.file_id ?? null);
}

/** A message with a reply keyboard or inline buttons (Telegram reply_markup). */
export async function sendTelegramMessageWithMarkup(
  chatId: number,
  text: string,
  replyMarkup: Record<string, unknown>,
): Promise<void> {
  await callTelegramMethod(requireBotToken(), "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

// Every org's send time is entered and shown as a Tashkent wall-clock time
// (the platform's one supported business timezone, same assumption the
// original fixed 23:50 cron already made) -- these convert between that and
// the UTC clock this server actually runs on.
function tashkentNow(): Date {
  return new Date(Date.now() + 5 * 60 * 60 * 1000);
}

function tashkentDateString(): string {
  return tashkentNow().toISOString().slice(0, 10);
}

// The scheduler (see the pg_cron migration) polls this endpoint every few
// minutes rather than once at a single fixed time, so every org's own
// configured send_time can be honored -- this is true once `nowMinutes`
// lands inside [target, target + windowMinutes) of that org's send_time,
// wrapping past midnight.
function isWithinSendWindow(sendTime: string, windowMinutes: number): boolean {
  const [h, m] = sendTime.split(":").map(Number);
  const targetMinutes = (h ?? 0) * 60 + (m ?? 0);
  const now = tashkentNow();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const diff = (nowMinutes - targetMinutes + 1440) % 1440;
  return diff < windowMinutes;
}

/**
 * Builds and delivers one org's full daily report unconditionally --
 * ignores send_enabled/send_time/"already sent today" entirely (those
 * gates live in the scheduled caller below). Saves it into
 * daily_report_history (overwriting today's row if one exists), pushes it
 * to the org's Google Sheet if configured, and sends each linked recipient
 * a report scoped to their own role: Super Admin gets the full,
 * company-wide report plus the marketing/lead-quality section; ROP gets
 * the same report shape but scoped to just themself and their direct
 * reports (never the whole company); Sotuv menejeri gets their own
 * personal report with nothing else mixed in. Shared by the scheduled
 * sender and the "Hisobotni hoziroq yaratish" manual-trigger route, so the
 * two can never drift apart.
 */
export async function sendDailyReportForOrg(
  organizationId: string,
): Promise<{ sent: number; failed: number }> {
  const { text: fullText } = await buildFullDailyReport(organizationId, {
    includeMarketingSection: true,
  });
  const reportDate = tashkentDateString();

  await supabaseAdmin
    .from("daily_report_history")
    .upsert(
      { organization_id: organizationId, report_date: reportDate, report_text: fullText },
      { onConflict: "organization_id,report_date" },
    );

  // Auto-push the same full report into the org's own Google Sheet, if its
  // super_admin has entered one -- appendRowToGoogleSheet silently no-ops
  // until a Google service account is configured on the server, so this
  // is safe to always attempt.
  const { data: reportSettings } = await supabaseAdmin
    .from("daily_report_settings")
    .select("google_sheets_url")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (reportSettings?.google_sheets_url) {
    try {
      await appendRowToGoogleSheet(reportSettings.google_sheets_url, [reportDate, fullText]);
    } catch {
      // Sheets push failing must never block the Telegram sends below.
    }
  }

  const { data: recipients } = await supabaseAdmin
    .from("profiles")
    .select("id, telegram_chat_id, role")
    .eq("organization_id", organizationId)
    .not("telegram_chat_id", "is", null)
    .in("role", ["super_admin", "rop", "sotuv_menejeri"]);

  // Only needed to build each ROP's team scope -- skip the extra query
  // entirely when nobody in this org is actually going to use it.
  let reportsByManagerId: Map<string, string[]> | null = null;
  if ((recipients ?? []).some((r) => r.role === "rop")) {
    const { data: reps } = await supabaseAdmin
      .from("profiles")
      .select("id, manager_id")
      .eq("organization_id", organizationId)
      .eq("role", "sotuv_menejeri");
    reportsByManagerId = new Map();
    for (const rep of reps ?? []) {
      if (!rep.manager_id) continue;
      reportsByManagerId.set(rep.manager_id, [
        ...(reportsByManagerId.get(rep.manager_id) ?? []),
        rep.id,
      ]);
    }
  }

  let sent = 0;
  let failed = 0;
  for (const r of recipients ?? []) {
    if (!r.telegram_chat_id) continue;
    try {
      const text =
        r.role === "sotuv_menejeri"
          ? await buildPersonalDailyReport(organizationId, r.id)
          : r.role === "rop"
            ? (
                await buildFullDailyReport(organizationId, {
                  ownerScope: [r.id, ...(reportsByManagerId?.get(r.id) ?? [])],
                })
              ).text
            : fullText;
      await sendTelegramMessage(r.telegram_chat_id, text);
      sent++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}

/**
 * Polled every few minutes (see the pg_cron migration); actually sends for
 * an org only once its own configured send_time comes around, and at most
 * once per org per day (daily_report_history doubles as the "already sent
 * today" guard).
 */
export async function sendDailyReportToLinkedManagers(): Promise<{ sent: number; failed: number }> {
  // Not just the stored `active` flag: an org whose trial/paid period lapsed
  // stays active=true until something flips it, but is locked out of the app
  // and shouldn't keep receiving reports either.
  const accessByOrg = await loadAllOrgAccess();
  const orgs = [...accessByOrg.values()].filter((org) => orgPhase(org) !== "expired");

  let sent = 0;
  let failed = 0;
  const reportDate = tashkentDateString();
  for (const org of orgs) {
    const { data: reportSettings } = await supabaseAdmin
      .from("daily_report_settings")
      .select("send_enabled, send_time")
      .eq("organization_id", org.id)
      .maybeSingle();
    if (!(reportSettings?.send_enabled ?? true)) continue;

    const { data: alreadySent } = await supabaseAdmin
      .from("daily_report_history")
      .select("id")
      .eq("organization_id", org.id)
      .eq("report_date", reportDate)
      .maybeSingle();
    if (alreadySent) continue;

    if (!isWithinSendWindow(reportSettings?.send_time ?? "23:50:00", 5)) continue;

    const result = await sendDailyReportForOrg(org.id);
    sent += result.sent;
    failed += result.failed;
  }
  return { sent, failed };
}
