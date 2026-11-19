// When a webinar goes on air and when it is over, decided from its streams
// alone (Marketing paneli -> Vebinarlar). The pollers (marketing-live.server)
// call these rules every minute; nothing here touches the database.
//
// - A webinar is "Efirda" as soon as any of its streams is live: the
//   YouTube broadcast it links to, or the Telegram channel it is tied to.
// - It is "Tugagan" only when every stream it has is off: YouTube says the
//   broadcast ended, and Telegram has been silent for a few minutes (one
//   missed check is not the end of a stream).
// - A Telegram stream that comes back soon after reopens the same webinar
//   instead of starting a new one.
// - A live webinar whose streams have all gone silent for a long time is
//   closed at its last count, so a lost end signal never leaves it "live".

/** Telegram must be silent this long before its stream counts as stopped. */
export const TG_OFF_GRACE_MIN = 3;
/** A stream back on the same channel within this long reopens the webinar. */
export const REOPEN_MIN = 10;
/** Every stream silent this long: the webinar is closed at its last count. */
export const SILENT_END_MIN = 30;
/** The end-of-webinar report waits this long, so a reopened stream isn't reported early. */
export const REPORT_DELAY_MIN = REOPEN_MIN;

const MIN = 60_000;
const t = (d: Date | string | null | undefined) =>
  d == null ? null : typeof d === "string" ? new Date(d).getTime() : d.getTime();

export type YoutubeState = "waiting" | "live" | "ended";

/**
 * The broadcast's state from YouTube's liveStreamingDetails. It is live from
 * its actual start until its actual end -- also when its owner hides the
 * viewer count (no concurrentViewers then).
 */
export function youtubeState(
  lsd: { actualStartTime?: string; actualEndTime?: string } | null | undefined,
): YoutubeState {
  if (lsd?.actualEndTime) return "ended";
  if (lsd?.actualStartTime) return "live";
  return "waiting";
}

/** A stream counts as stopped: no count from it for the grace time. */
export function streamSilent(lastAt: Date | string | null, now: Date): boolean {
  const last = t(lastAt);
  return last == null || now.getTime() - last >= TG_OFF_GRACE_MIN * MIN;
}

/** Telegram's stream counts as stopped: no Telegram count for the grace time. */
export const telegramStopped = streamSilent;

/**
 * YouTube said the broadcast ended. The webinar ends with it unless its
 * Telegram stream is still going; then it ends when Telegram stops.
 */
export function endsWithYoutube(input: {
  tracksTelegram: boolean;
  lastTelegramAt: Date | string | null;
  now: Date;
}): boolean {
  return !input.tracksTelegram || telegramStopped(input.lastTelegramAt, input.now);
}

/**
 * Telegram's stream is off. The webinar ends unless a YouTube broadcast
 * still has to finish (YouTube's poller closes it then), and only once
 * Telegram has been silent for the grace time.
 */
export function endsWithTelegram(input: {
  youtubeOpen: boolean;
  lastTelegramAt: Date | string | null;
  now: Date;
}): boolean {
  return !input.youtubeOpen && telegramStopped(input.lastTelegramAt, input.now);
}

/** When the webinar ended: the later of the streams' last signs of life. */
export function endedAt(...times: (Date | string | null | undefined)[]): string | null {
  const ms = times.map(t).filter((x): x is number => x != null);
  return ms.length ? new Date(Math.max(...ms)).toISOString() : null;
}

/** An ended webinar a returning stream reopens (ended a few minutes ago). */
export function canReopen(ended: Date | string | null, now: Date): boolean {
  const e = t(ended);
  return e != null && now.getTime() - e >= 0 && now.getTime() - e <= REOPEN_MIN * MIN;
}

/** A live webinar whose streams have all been silent too long (it had counts). */
export function silentTooLong(lastSampleAt: Date | string | null, now: Date): boolean {
  const last = t(lastSampleAt);
  return last != null && now.getTime() - last >= SILENT_END_MIN * MIN;
}

/** The end-of-webinar report is due (a short wait in case the stream returns). */
export function reportDue(ended: Date | string | null, now: Date): boolean {
  const e = t(ended);
  return e == null || now.getTime() - e >= REPORT_DELAY_MIN * MIN;
}
