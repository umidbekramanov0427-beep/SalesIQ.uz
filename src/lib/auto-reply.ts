// What to answer a client's message automatically (auto-reply.server.ts
// sends it): outside the company's working hours the after-hours message,
// otherwise the first active auto-responder whose keyword the message
// contains. Pure, so the rules are unit-tested.

export type WorkSchedule = {
  /** "09:00" or "09:00:00". */
  start_time: string;
  end_time: string;
  /** ISO weekdays: 1 = Monday .. 7 = Sunday. */
  work_days: number[];
};

export type Responder = {
  id: string;
  trigger_text: string;
  message: string;
  channels: string[];
  active: boolean;
};

export type ReplyChannel = "telegram" | "instagram";

export type AutoReply = { kind: "after_hours" | "responder"; key: string; text: string };

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** The company's local weekday (ISO) and minute of the day. */
export function localClock(now: Date, timeZone: string): { day: number; minute: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return localClock(now, "Asia/Tashkent");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { day, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Inside working hours: a work day, from start up to (not including) end; overnight shifts allowed. */
/**
 * The company's working hours: its main shift in Admin -> Davomat
 * (attendance_rules.shifts, the one place they are set), or -- for a company
 * that never saved its shifts -- the older work schedule it saved before.
 * Null when neither exists (then it is never "after hours").
 */
export function companyWorkHours(
  attendanceRules: unknown,
  legacy: WorkSchedule | null,
): WorkSchedule | null {
  const shifts =
    attendanceRules && typeof attendanceRules === "object"
      ? (attendanceRules as { shifts?: unknown }).shifts
      : null;
  const first = Array.isArray(shifts) ? (shifts[0] as Record<string, unknown> | undefined) : null;
  const hm = /^\d{2}:\d{2}/;
  if (
    first &&
    typeof first["start"] === "string" &&
    typeof first["end"] === "string" &&
    hm.test(first["start"]) &&
    hm.test(first["end"]) &&
    Array.isArray(first["days"])
  ) {
    return {
      start_time: first["start"],
      end_time: first["end"],
      work_days: (first["days"] as unknown[]).filter(
        (d): d is number => typeof d === "number" && d >= 1 && d <= 7,
      ),
    };
  }
  return legacy;
}

export function isWorkingTime(schedule: WorkSchedule, now: Date, timeZone: string): boolean {
  const { day, minute } = localClock(now, timeZone);
  const start = minutes(schedule.start_time);
  const end = minutes(schedule.end_time);
  if (start === end) return schedule.work_days.includes(day);
  if (start < end) return schedule.work_days.includes(day) && minute >= start && minute < end;
  // Overnight (e.g. 20:00-04:00): the shift belongs to the day it started.
  if (minute >= start) return schedule.work_days.includes(day);
  const prev = day === 1 ? 7 : day - 1;
  return minute < end && schedule.work_days.includes(prev);
}

/** A responder's channel list in our terms; empty means every channel. */
function servesChannel(channels: string[], channel: ReplyChannel): boolean {
  if (!channels.length) return true;
  return channel === "instagram"
    ? channels.includes("instagram")
    : channels.includes("telegram") || channels.includes("telegram_bot");
}

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/\s+/g, " ").trim();

/** The first active responder (in the given order) whose keyword the message contains. */
export function matchResponder(
  text: string,
  channel: ReplyChannel,
  responders: Responder[],
): Responder | null {
  const msg = norm(text);
  if (!msg) return null;
  for (const r of responders) {
    if (!r.active || !r.message.trim() || !servesChannel(r.channels, channel)) continue;
    const keys = r.trigger_text.split(/[,\n]/).map(norm).filter(Boolean);
    if (keys.some((k) => msg.includes(k))) return r;
  }
  return null;
}

export function pickAutoReply(input: {
  text: string;
  channel: ReplyChannel;
  working: boolean;
  afterHours: { enabled: boolean; text: string | null };
  responders: Responder[];
}): AutoReply | null {
  const ah = input.afterHours.text?.trim();
  if (!input.working && input.afterHours.enabled && ah) {
    return { kind: "after_hours", key: "after_hours", text: ah };
  }
  const r = matchResponder(input.text, input.channel, input.responders);
  return r ? { kind: "responder", key: r.id, text: r.message.trim() } : null;
}
