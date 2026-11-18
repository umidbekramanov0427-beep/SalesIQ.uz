// Owner -> Arizalar: the platform's own CRM of companies. Pure rules shared
// by the sign-up wizard, the owner's pages and the server -- the stages'
// look, the sign-up questions, free call slots and a company's health.
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/applications";

/** Stages in pipeline order (without "lost"), each with its color. */
export const PIPELINE_STAGES = APPLICATION_STATUSES.filter((s) => s !== "lost");

export const STAGE_TONE: Record<ApplicationStatus, { dot: string; chip: string; bar: string }> = {
  new: {
    dot: "bg-sky-500",
    chip: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
    bar: "from-sky-400 to-sky-600",
  },
  taken: {
    dot: "bg-indigo-500",
    chip: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
    bar: "from-indigo-400 to-indigo-600",
  },
  informed: {
    dot: "bg-violet-500",
    chip: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    bar: "from-violet-400 to-violet-600",
  },
  meeting: {
    dot: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    bar: "from-amber-400 to-amber-600",
  },
  contract: {
    dot: "bg-teal-500",
    chip: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
    bar: "from-teal-400 to-teal-600",
  },
  installed: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    bar: "from-emerald-400 to-emerald-600",
  },
  lost: {
    dot: "bg-rose-500",
    chip: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    bar: "from-rose-400 to-rose-600",
  },
};

/** Sign-up question 1: what the company sells (chips; free text also allowed). */
export const BUSINESS_KINDS = [
  "realty",
  "education",
  "auto",
  "retail",
  "services",
  "b2b",
  "medical",
  "other",
] as const;

/** Sign-up question 3: what the team works in today. */
export const CURRENT_TOOLS = [
  "excel",
  "telegram",
  "amocrm",
  "bitrix24",
  "other_crm",
  "none",
] as const;
export type CurrentTool = (typeof CURRENT_TOOLS)[number];

export const LOST_REASONS = [
  "price",
  "no_need",
  "competitor",
  "no_answer",
  "later",
  "other",
] as const;

// ---------------------------------------------------------------- slots

export type MeetingSettings = {
  /** ISO weekdays the owner takes calls on (1 = Monday). */
  days: number[];
  /** "HH:MM" in Tashkent time. */
  from: string;
  to: string;
  /** Length of one call, minutes. */
  minutes: number;
  /** How many days ahead can be booked. */
  horizonDays: number;
  /** No booking sooner than this many hours from now. */
  leadHours: number;
};

export const DEFAULT_MEETING_SETTINGS: MeetingSettings = {
  days: [1, 2, 3, 4, 5, 6],
  from: "10:00",
  to: "18:00",
  minutes: 30,
  horizonDays: 7,
  leadHours: 2,
};

/** Tashkent is UTC+5 all year (no daylight saving). */
const TZ_MS = 5 * 3_600_000;

const hm = (v: unknown, fallback: string) =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback;
const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(hi, Math.max(lo, Math.round(v)))
    : fallback;

/** platform_settings.meeting_settings, cleaned; defaults for anything missing. */
export function parseMeetingSettings(raw: unknown): MeetingSettings {
  const o: Partial<Record<keyof MeetingSettings, unknown>> =
    raw && typeof raw === "object" ? (raw as Partial<Record<keyof MeetingSettings, unknown>>) : {};
  const d = DEFAULT_MEETING_SETTINGS;
  const days = Array.isArray(o.days)
    ? [
        ...new Set(o.days.filter((x): x is number => Number.isInteger(x) && x >= 1 && x <= 7)),
      ].sort()
    : d.days;
  return {
    days: days.length ? days : d.days,
    from: hm(o.from, d.from),
    to: hm(o.to, d.to),
    minutes: num(o.minutes, 15, 120, d.minutes),
    horizonDays: num(o.horizonDays, 1, 30, d.horizonDays),
    leadHours: num(o.leadHours, 0, 72, d.leadHours),
  };
}

export type SlotDay = { day: string; slots: string[] };

/**
 * The free call slots from `now` on, grouped by Tashkent day: every
 * `minutes` between from..to on the working days, minus the booked ones
 * (`busy`, ISO times) and anything sooner than leadHours.
 */
export function freeSlots(settings: MeetingSettings, busy: string[], now: Date): SlotDay[] {
  const taken = new Set(busy.map((b) => new Date(b).getTime()));
  const earliest = now.getTime() + settings.leadHours * 3_600_000;
  const [fh, fm] = settings.from.split(":").map(Number) as [number, number];
  const [th, tm] = settings.to.split(":").map(Number) as [number, number];
  const step = settings.minutes * 60_000;
  // Tashkent midnight of today, as a UTC instant.
  const local = new Date(now.getTime() + TZ_MS);
  const day0 = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TZ_MS;
  const out: SlotDay[] = [];
  for (let i = 0; i <= settings.horizonDays; i++) {
    const midnight = day0 + i * 86_400_000;
    const localDay = new Date(midnight + TZ_MS);
    const iso = localDay.getUTCDay() || 7;
    if (!settings.days.includes(iso)) continue;
    const start = midnight + (fh * 60 + fm) * 60_000;
    const end = midnight + (th * 60 + tm) * 60_000;
    const slots: string[] = [];
    for (let t = start; t + step <= end; t += step) {
      if (t < earliest || taken.has(t)) continue;
      slots.push(new Date(t).toISOString());
    }
    if (slots.length) out.push({ day: localDay.toISOString().slice(0, 10), slots });
  }
  return out;
}

/** Is this exact time one of the free slots (the server re-checks a booking)? */
export function isFreeSlot(
  settings: MeetingSettings,
  busy: string[],
  now: Date,
  at: string,
): boolean {
  const t = new Date(at).getTime();
  if (!Number.isFinite(t)) return false;
  return freeSlots(settings, busy, now).some((d) =>
    d.slots.some((s) => new Date(s).getTime() === t),
  );
}

/** "14:30" in Tashkent time. */
export function tashkentTime(iso: string): string {
  return new Date(new Date(iso).getTime() + TZ_MS).toISOString().slice(11, 16);
}

/** "2027-01-10" in Tashkent time. */
export function tashkentDay(iso: string): string {
  return new Date(new Date(iso).getTime() + TZ_MS).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- health

export type CompanyFacts = {
  /** People who signed in during the last 7 days. */
  activeUsers: number;
  /** All the company's people. */
  users: number;
  /** Seat limit, null = unlimited. */
  seatLimit: number | null;
  /** Days until the trial/paid period ends (negative = ended), null = unknown. */
  daysLeft: number | null;
  /** Problems not solved yet. */
  openIssues: number;
  /** Days since anyone of the company signed in, null = never. */
  idleDays: number | null;
  frozen: boolean;
};

export type Health = "good" | "watch" | "risk";
export type HealthReason =
  "frozen" | "expired" | "endsSoon" | "idle" | "neverIn" | "lowUse" | "issues" | "seatsFull";

/** How the company is doing, and why (the lead card's colored dot). */
export function companyHealth(f: CompanyFacts): { level: Health; reasons: HealthReason[] } {
  const risk: HealthReason[] = [];
  const watch: HealthReason[] = [];
  if (f.frozen) risk.push("frozen");
  if (f.daysLeft != null && f.daysLeft < 0) risk.push("expired");
  else if (f.daysLeft != null && f.daysLeft <= 3) watch.push("endsSoon");
  if (f.idleDays == null) (f.users > 0 ? watch : risk).push("neverIn");
  else if (f.idleDays >= 7) risk.push("idle");
  else if (f.idleDays >= 3) watch.push("idle");
  if (f.users >= 2 && f.activeUsers / f.users < 0.5) watch.push("lowUse");
  if (f.openIssues >= 3) risk.push("issues");
  else if (f.openIssues > 0) watch.push("issues");
  if (f.seatLimit != null && f.users >= f.seatLimit) watch.push("seatsFull");
  const level: Health = risk.length ? "risk" : watch.length ? "watch" : "good";
  return { level, reasons: [...risk, ...watch] };
}

/** Owner tasks: due now, not done, not sent yet. */
export function dueTasks<
  T extends { due_at: string | null; done_at: string | null; notified_at: string | null },
>(tasks: T[], now: Date): T[] {
  return tasks.filter(
    (t) =>
      !t.done_at && !t.notified_at && t.due_at && new Date(t.due_at).getTime() <= now.getTime(),
  );
}

const UZ_MONTHS = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

/** "19-noyabr" / "19 ноября" / "Nov 19" -- a Tashkent day for people. */
export function callDay(iso: string, lang: string): string {
  const d = new Date(new Date(iso).getTime() + TZ_MS);
  if (lang === "uz") return `${d.getUTCDate()}-${UZ_MONTHS[d.getUTCMonth()]}`;
  return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
