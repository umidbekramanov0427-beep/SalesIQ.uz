// Davomat qoidalari (Nazorat -> Davomat -> Qoidalar): where the office is
// and how close a Telegram check-in must be, how late counts as late, the
// automatic break, the shifts and who works which, and when the evening
// report goes out. Stored in org_general_settings.attendance_rules; pure,
// so the page, the bot and the report agree. Times are the company's wall
// clock (Asia/Tashkent unless the company set another zone).

export type Shift = {
  id: string;
  name: string;
  /** "09:00" */
  start: string;
  /** "18:00" */
  end: string;
  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  days: number[];
};

export type AttendanceRules = {
  office: { lat: number; lng: number; radiusM: number } | null;
  /** Minutes after the shift start that still count as on time. */
  graceMin: number;
  /** A break of this many minutes is taken off a day longer than breakAfterMin. */
  breakMin: number;
  breakAfterMin: number;
  shifts: Shift[];
  /** profile id -> shift id; everyone else works the first shift. */
  assign: Record<string, string>;
  /** Check-in from the site's button and/or the Telegram bot with location. */
  methods: { web: boolean; telegram: boolean };
  report: { enabled: boolean; time: string };
  /**
   * When the working day starts: the check-in (site button / Telegram),
   * the first contact with a client, or whichever comes first.
   */
  startMode: StartMode;
  /** What counts as the first contact. */
  contact: { calls: boolean; messages: boolean };
  /** Telegram reminders to each person around their shift (see dueReminders). */
  reminders: ReminderRules;
};

/**
 * Davomat eslatmalari: before the shift starts (to those not checked in),
 * every few minutes while late, and before / at the shift's end (to those
 * still checked in). Nothing after the end. Texts take {left}, {late},
 * {start}, {end} and {name}.
 */
export type ReminderRules = {
  enabled: boolean;
  /** Minutes before the start, e.g. [60, 45, 30, 15, 5]. */
  before: number[];
  /** Every this many minutes while late and not checked in; 0 = off. */
  lateEvery: number;
  /** Stop the late reminders after this many minutes. */
  lateUntil: number;
  /** Minutes before the end, e.g. [30, 5]. */
  endBefore: number[];
  /** "Ish vaqti tugadi" at the end itself. */
  endAt: boolean;
  texts: { before: string; late: string; endBefore: string; end: string };
};

export const DEFAULT_REMINDER_TEXTS: ReminderRules["texts"] = {
  before:
    "⏰ {name}, ish vaqti boshlanishiga {left} qoldi ({start}). Kelganingizda «📍 Ishga keldim» tugmasini bosing.",
  late: "⚠️ {name}, siz {late} kechikyapsiz — ish {start} da boshlangan. Kelgan bo'lsangiz «📍 Ishga keldim» tugmasini bosing.",
  endBefore:
    "🕕 Ish vaqti tugashiga {left} qoldi ({end}). Ketishda «🏁 Ishdan ketdim» tugmasini bosish esingizdan chiqmasin.",
  end: "🏁 Ish vaqti tugadi ({end}). «🏁 Ishdan ketdim» tugmasini bosing.",
};

export const DEFAULT_REMINDERS: ReminderRules = {
  enabled: false,
  before: [60, 45, 30, 15, 5],
  lateEvery: 20,
  lateUntil: 180,
  endBefore: [30, 5],
  endAt: true,
  texts: DEFAULT_REMINDER_TEXTS,
};

export type StartMode = "both" | "button" | "contact";

export const DEFAULT_SHIFT: Shift = {
  id: "main",
  name: "Asosiy",
  start: "09:00",
  end: "18:00",
  days: [1, 2, 3, 4, 5],
};

export const DEFAULT_ATTENDANCE_RULES: AttendanceRules = {
  office: null,
  graceMin: 10,
  breakMin: 60,
  breakAfterMin: 300,
  shifts: [DEFAULT_SHIFT],
  assign: {},
  methods: { web: true, telegram: true },
  report: { enabled: true, time: "18:30" },
  startMode: "both",
  contact: { calls: true, messages: true },
  reminders: DEFAULT_REMINDERS,
};

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : fallback;

export function parseAttendanceRules(raw: unknown): AttendanceRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_ATTENDANCE_RULES;
  const o = raw as Record<string, unknown>;
  const d = DEFAULT_ATTENDANCE_RULES;
  const off = o["office"] as Record<string, unknown> | null | undefined;
  const office =
    off &&
    typeof off["lat"] === "number" &&
    typeof off["lng"] === "number" &&
    Math.abs(off["lat"]) <= 90 &&
    Math.abs(off["lng"]) <= 180
      ? { lat: off["lat"], lng: off["lng"], radiusM: num(off["radiusM"], 20, 5000, 150) }
      : null;
  const shifts = Array.isArray(o["shifts"])
    ? (o["shifts"] as unknown[]).flatMap((s): Shift[] => {
        if (!s || typeof s !== "object") return [];
        const x = s as Record<string, unknown>;
        if (typeof x["id"] !== "string" || !x["id"]) return [];
        const start = typeof x["start"] === "string" && HM.test(x["start"]) ? x["start"] : null;
        const end = typeof x["end"] === "string" && HM.test(x["end"]) ? x["end"] : null;
        if (!start || !end) return [];
        const days = Array.isArray(x["days"])
          ? [
              ...new Set(
                (x["days"] as unknown[]).filter(
                  (n): n is number => typeof n === "number" && n >= 1 && n <= 7,
                ),
              ),
            ].sort()
          : [];
        return [
          {
            id: x["id"],
            name:
              typeof x["name"] === "string" && x["name"].trim() ? x["name"].slice(0, 40) : "Smena",
            start,
            end,
            days,
          },
        ];
      })
    : [];
  const assign: Record<string, string> = {};
  if (o["assign"] && typeof o["assign"] === "object") {
    for (const [k, v] of Object.entries(o["assign"] as Record<string, unknown>)) {
      if (typeof v === "string" && shifts.some((s) => s.id === v)) assign[k] = v;
    }
  }
  const methods = (o["methods"] ?? {}) as Record<string, unknown>;
  const contact = (o["contact"] ?? {}) as Record<string, unknown>;
  const startMode: StartMode =
    o["startMode"] === "button" || o["startMode"] === "contact" ? o["startMode"] : "both";
  const report = (o["report"] ?? {}) as Record<string, unknown>;
  return {
    office,
    graceMin: num(o["graceMin"], 0, 180, d.graceMin),
    breakMin: num(o["breakMin"], 0, 240, d.breakMin),
    breakAfterMin: num(o["breakAfterMin"], 0, 900, d.breakAfterMin),
    shifts: shifts.length ? shifts : d.shifts,
    assign,
    methods: {
      web: methods["web"] !== false,
      telegram: methods["telegram"] !== false,
    },
    report: {
      enabled: report["enabled"] !== false,
      time:
        typeof report["time"] === "string" && HM.test(report["time"])
          ? report["time"]
          : d.report.time,
    },
    startMode,
    contact: { calls: contact["calls"] !== false, messages: contact["messages"] !== false },
    reminders: parseReminders(o["reminders"]),
  };
}

const minutesList = (v: unknown, max: number, fallback: number[]): number[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v.filter(
            (n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= max,
          ),
        ),
      ]
        .sort((a, b) => b - a)
        .slice(0, 10)
    : fallback;

export function parseReminders(raw: unknown): ReminderRules {
  const d = DEFAULT_REMINDERS;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  const o = raw as Record<string, unknown>;
  const tx = (o["texts"] ?? {}) as Record<string, unknown>;
  const text = (k: keyof ReminderRules["texts"]) =>
    typeof tx[k] === "string" && (tx[k] as string).trim()
      ? (tx[k] as string).trim().slice(0, 500)
      : d.texts[k];
  return {
    enabled: o["enabled"] === true,
    before: minutesList(o["before"], 240, d.before),
    lateEvery: num(o["lateEvery"], 0, 240, d.lateEvery),
    lateUntil: num(o["lateUntil"], 10, 720, d.lateUntil),
    endBefore: minutesList(o["endBefore"], 240, d.endBefore),
    endAt: o["endAt"] !== false,
    texts: {
      before: text("before"),
      late: text("late"),
      endBefore: text("endBefore"),
      end: text("end"),
    },
  };
}

/** "1 soat 20 daqiqa", "45 daqiqa". */
export function minutesText(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} daqiqa`;
  return m ? `${h} soat ${m} daqiqa` : `${h} soat`;
}

export type DueReminder = {
  /** Once per person and day: "before:30", "late:2", "end-5", "end". */
  key: string;
  kind: "before" | "late" | "endBefore" | "end";
  text: string;
};

/** How long a reminder stays due after its moment (the cron ticks every 5 minutes). */
const WINDOW = 10;

/**
 * The reminder due for one person now, if any (at most one per tick: the
 * latest of those whose moment has come). `checkedIn`: they started the day
 * (button or, under the rule, a first contact); `open`: their day is still
 * open (they haven't pressed "Ishdan ketdim").
 */
export function dueReminder(
  r: ReminderRules,
  shift: Shift,
  now: { minutes: number; weekday: number },
  state: { checkedIn: boolean; open: boolean; name: string | null },
): DueReminder | null {
  if (!r.enabled || !shift.days.includes(now.weekday)) return null;
  const start = toMin(shift.start);
  const end = toMin(shift.end);
  if (end <= start) return null;
  const t = now.minutes;
  const fill = (tpl: string, vars: Record<string, string>) =>
    tpl.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all);
  const vars = {
    start: shift.start,
    end: shift.end,
    name: state.name?.split(" ")[0] || "Hurmatli xodim",
  };

  if (!state.checkedIn) {
    // Before the start: the closest moment that has come.
    const before = r.before.filter((m) => t >= start - m && t < start - m + WINDOW);
    if (before.length && t < start) {
      const m = Math.min(...before);
      return {
        key: `before:${m}`,
        kind: "before",
        text: fill(r.texts.before, { ...vars, left: minutesText(m) }),
      };
    }
    // Late: every lateEvery minutes after the start, until lateUntil or the end.
    if (r.lateEvery > 0 && t >= start + r.lateEvery && t - start <= r.lateUntil && t < end) {
      const k = Math.floor((t - start) / r.lateEvery);
      if (t - (start + k * r.lateEvery) < WINDOW)
        return {
          key: `late:${k}`,
          kind: "late",
          text: fill(r.texts.late, { ...vars, late: minutesText(t - start) }),
        };
    }
    return null;
  }

  if (!state.open) return null;
  if (r.endAt && t >= end && t < end + WINDOW)
    return { key: "end", kind: "end", text: fill(r.texts.end, vars) };
  const endBefore = r.endBefore.filter((m) => t >= end - m && t < end - m + WINDOW && t < end);
  if (endBefore.length) {
    const m = Math.min(...endBefore);
    return {
      key: `end-${m}`,
      kind: "endBefore",
      text: fill(r.texts.endBefore, { ...vars, left: minutesText(m) }),
    };
  }
  return null;
}

/** Metres between two points (haversine). */
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** The person's shift (the first one when nobody assigned them). */
export function shiftFor(rules: AttendanceRules, profileId: string): Shift {
  const id = rules.assign[profileId];
  return rules.shifts.find((s) => s.id === id) ?? rules.shifts[0] ?? DEFAULT_SHIFT;
}

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** The company's wall clock for a moment: minutes since midnight, ISO weekday, "YYYY-MM-DD". */
export function localClock(
  at: Date,
  timeZone = "Asia/Tashkent",
): { minutes: number; weekday: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return {
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    weekday: wd,
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** Minutes late for a check-in (0 when within the grace or on a day off). */
export function lateMinutes(
  clockIn: Date,
  shift: Shift,
  graceMin: number,
  timeZone?: string,
): number {
  const c = localClock(clockIn, timeZone);
  if (!shift.days.includes(c.weekday)) return 0;
  const late = c.minutes - toMin(shift.start);
  return late > graceMin ? late : 0;
}

/** Minutes worked: the session minus the automatic break on a long enough day. */
export function workedMinutes(
  clockIn: Date,
  clockOut: Date | null,
  rules: Pick<AttendanceRules, "breakMin" | "breakAfterMin">,
  now = new Date(),
): number {
  const end = clockOut ?? now;
  const total = Math.max(0, Math.round((end.getTime() - clockIn.getTime()) / 60_000));
  return total > rules.breakAfterMin && rules.breakMin > 0
    ? Math.max(0, total - rules.breakMin)
    : total;
}

/** Whether the person is expected at work on this day. */
export function isWorkday(shift: Shift, at: Date, timeZone?: string): boolean {
  return shift.days.includes(localClock(at, timeZone).weekday);
}

/** "8 soat 20 daq" */
export function hoursText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} soat${m ? ` ${m} daq` : ""}` : `${m} daq`;
}

export type ReportPerson = {
  name: string;
  /** "HH:MM" local, null when they didn't come. */
  clockIn: string | null;
  method: "web" | "telegram" | "calls" | "messages" | null;
  lateMin: number;
  workedMin: number;
  /** Not their workday (their shift has the day off). */
  dayOff: boolean;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The evening Telegram report (HTML): who came, who was late, who didn't come. */
export function attendanceReportText(
  company: string,
  dateLabel: string,
  people: ReportPerson[],
): string {
  const expected = people.filter((p) => !p.dayOff);
  const came = people.filter((p) => p.clockIn);
  const late = came.filter((p) => p.lateMin > 0).sort((a, b) => b.lateMin - a.lateMin);
  const absent = expected.filter((p) => !p.clockIn);
  const mark = { telegram: "📍", web: "💻", calls: "📞", messages: "💬" } as const;
  const lines = [
    `🕘 <b>Davomat — ${esc(company)}</b>`,
    `${esc(dateLabel)}`,
    "",
    `✅ Keldi: <b>${came.length}/${expected.length}</b>`,
    `⏰ Kechikdi: <b>${late.length}</b>`,
    `❌ Kelmadi: <b>${absent.length}</b>`,
  ];
  if (late.length) {
    lines.push("", "<b>Kechikkanlar</b>");
    for (const p of late) lines.push(`• ${esc(p.name)} — ${p.clockIn} (+${p.lateMin} daq)`);
  }
  if (absent.length) {
    lines.push("", "<b>Kelmaganlar</b>");
    for (const p of absent) lines.push(`• ${esc(p.name)}`);
  }
  if (came.length) {
    lines.push("", "<b>Ish vaqti</b>");
    for (const p of [...came].sort((a, b) => b.workedMin - a.workedMin)) {
      lines.push(
        `${p.method ? mark[p.method] : "•"} ${esc(p.name)} — ${p.clockIn}, ${hoursText(p.workedMin)}`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * When the day started under the company's rule: the check-in, the first
 * contact (ISO times, null when none), or the earlier of the two.
 */
export function dayStart(
  rules: Pick<AttendanceRules, "startMode">,
  checkIn: string | null,
  firstContact: string | null,
): { at: string | null; by: "checkin" | "contact" | null } {
  const c = rules.startMode === "button" ? null : firstContact;
  const b = rules.startMode === "contact" ? null : checkIn;
  if (b && (!c || b <= c)) return { at: b, by: "checkin" };
  if (c) return { at: c, by: "contact" };
  return { at: null, by: null };
}

/**
 * The first contact with a client that counts under the company's rule
 * (calls, messages or both), as an ISO time, with what it was.
 */
export function firstContact(
  rules: Pick<AttendanceRules, "contact">,
  firstCall: string | null,
  firstMessage: string | null,
): { at: string; kind: "call" | "message" } | null {
  const call = rules.contact.calls ? firstCall : null;
  const msg = rules.contact.messages ? firstMessage : null;
  if (call && (!msg || call <= msg)) return { at: call, kind: "call" };
  if (msg) return { at: msg, kind: "message" };
  return null;
}
