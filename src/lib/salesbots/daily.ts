// «Har kuni belgilangan vaqtda» (Telegram Salesbot): when a daily bot is due.
// The 5-minute cron starts it for the company bot's clients in the hour after
// its time (Tashkent); a client already sent it in the last 20 hours is
// skipped, so each gets it once a day even though the cron ticks often.

/** "HH:MM" → minutes after midnight, or null when it isn't a time. */
export function parseClock(v: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((v ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The window in which a daily bot keeps being sent after its time. */
export const DAILY_WINDOW_MIN = 60;

/** True from the bot's time (Tashkent) for DAILY_WINDOW_MIN minutes. */
export function dailyDue(time: string | null | undefined, now = new Date()): boolean {
  const at = parseClock(time);
  if (at == null) return false;
  const t = new Date(now.getTime() + 5 * 3_600_000);
  const cur = t.getUTCHours() * 60 + t.getUTCMinutes();
  const diff = (cur - at + 1440) % 1440;
  return diff < DAILY_WINDOW_MIN;
}
