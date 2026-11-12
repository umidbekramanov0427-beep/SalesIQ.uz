// Eslatmalar: a person's own reminders (or ones a head of sales set for
// them) -- a line of text at a time, once or repeating. The every-minute
// cron (reminders.server.ts) sends each due one as a bell notification,
// push and Telegram message; a repeating one then moves to its next time.

export const REMINDER_REPEATS = ["none", "daily", "weekdays", "weekly", "monthly"] as const;
export type ReminderRepeat = (typeof REMINDER_REPEATS)[number];

const DAY = 86_400_000;

/** The next time a repeating reminder comes after `now` (null for a one-off). */
export function nextOccurrence(remindAt: string, repeat: ReminderRepeat, now: number): Date | null {
  if (repeat === "none") return null;
  let d = new Date(remindAt);
  for (let guard = 0; guard < 4000 && d.getTime() <= now; guard++) {
    if (repeat === "daily") d = new Date(d.getTime() + DAY);
    else if (repeat === "weekly") d = new Date(d.getTime() + 7 * DAY);
    else if (repeat === "monthly") {
      const n = new Date(d);
      n.setMonth(n.getMonth() + 1);
      d = n;
    } else {
      // weekdays: Monday to Friday
      d = new Date(d.getTime() + DAY);
      while (d.getDay() === 0 || d.getDay() === 6) d = new Date(d.getTime() + DAY);
    }
  }
  return d;
}

export type ReminderLike = { remind_at: string; done_at: string | null; sent_at: string | null };

/** Where a reminder sits on the page. */
export function reminderGroup(r: ReminderLike, now: number): "done" | "due" | "today" | "upcoming" {
  if (r.done_at) return "done";
  const at = new Date(r.remind_at).getTime();
  if (at <= now) return "due";
  const endOfToday = new Date(now);
  endOfToday.setHours(24, 0, 0, 0);
  return at < endOfToday.getTime() ? "today" : "upcoming";
}

/** The quick times on the form: in an hour, today 18:00 (or tomorrow if past), tomorrow 09:00. */
export function quickTimes(now: number): { key: "hour" | "evening" | "morning"; at: Date }[] {
  const inHour = new Date(now + 3_600_000);
  inHour.setSeconds(0, 0);
  const evening = new Date(now);
  evening.setHours(18, 0, 0, 0);
  if (evening.getTime() <= now) evening.setDate(evening.getDate() + 1);
  const morning = new Date(now);
  morning.setDate(morning.getDate() + 1);
  morning.setHours(9, 0, 0, 0);
  return [
    { key: "hour", at: inHour },
    { key: "evening", at: evening },
    { key: "morning", at: morning },
  ];
}
