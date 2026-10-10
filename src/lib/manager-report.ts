// A sales manager's end-of-day report: the template (editable by the super
// admin / ROP) with {placeholders} filled from my_daily_report() -- the
// manager copies the text into the team's Telegram group.

export type ManagerReportData = {
  /** "team": a super admin / ROP's whole-funnel totals; "me": a manager's own. */
  scope?: "team" | "me";
  timezone: string;
  day: string;
  name: string | null;
  template: string | null;
  calls: number;
  answered: number;
  missed: number;
  people_called: number;
  people_talked: number;
  talk_seconds: number;
  first_call: string | null;
  last_call: string | null;
  leads_total: number;
  leads_new_today: number;
  sales_total: number;
  sales_today: number;
  /** The whole funnel's sales today (every manager); absent before the 2nd migration run. */
  sales_today_all?: number;
  work_start: string | null;
  work_end: string | null;
  working_now: boolean;
  /** "HH:MM" -- when the work day ends, and when it's taken as finished. */
  work_day_end?: string;
  auto_close?: string;
};

export const DEFAULT_MANAGER_REPORT_TEMPLATE = `#Report {name} {date}

1. Call time – {call_time}

2. Kunlik conversation: {talked}/{called}

3. Lidlar soni: {leads_total}

4. Sotuvlar – {sales_today}/{sales_total}

5. Ish boshlagan vaqtim: {work_start}

6. Ish yakunlagan vaqtim: {work_end}

Holat: {sales_today_all}`;

/** Every placeholder a template may use, with what it stands for (i18n key). */
export const MANAGER_REPORT_VARIABLES = [
  "name",
  "full_name",
  "date",
  "funnel",
  "call_time",
  "talked",
  "called",
  "calls",
  "answered",
  "missed",
  "leads_total",
  "leads_new",
  "sales_today",
  "sales_total",
  "sales_today_all",
  "conversion",
  "work_start",
  "work_end",
  "work_day_end",
] as const;

/** Default working hours: a 19:00 work day, closed automatically at 20:00. */
export const DEFAULT_REPORT_HOURS = { workDayEnd: "19:00", autoClose: "20:00" };

const pad = (n: number) => String(n).padStart(2, "0");

export function hhmmss(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function clock(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** The template with every {placeholder} filled; unknown ones stay as typed. */
export function fillManagerReport(
  template: string,
  data: ManagerReportData,
  funnel: string,
  now: Date = new Date(),
): string {
  const tz = data.timezone || "Asia/Tashkent";
  const [, month, day] = data.day.split("-");
  const fullName = (data.name ?? "").trim();
  // The work day starts with the day's first call in the CRM. It ends when
  // the report is taken -- or, once the auto-close time has passed (e.g.
  // 20:00 for a 19:00 work day), at that time. No calls: no work day.
  const start = clock(data.first_call, tz);
  const autoClose = data.auto_close || DEFAULT_REPORT_HOURS.autoClose;
  const nowClock = clock(now.toISOString(), tz)!;
  const end = start ? (nowClock >= autoClose ? autoClose : nowClock) : null;
  const values: Record<(typeof MANAGER_REPORT_VARIABLES)[number], string> = {
    name: fullName.split(/\s+/)[0] || fullName,
    full_name: fullName,
    date: day && month ? `${day}.${month}` : data.day,
    funnel,
    call_time: hhmmss(data.talk_seconds),
    talked: String(data.people_talked),
    called: String(data.people_called),
    calls: String(data.calls),
    answered: String(data.answered),
    missed: String(data.missed),
    leads_total: String(data.leads_total),
    leads_new: String(data.leads_new_today),
    sales_today: String(data.sales_today),
    sales_total: String(data.sales_total),
    sales_today_all: String(data.sales_today_all ?? data.sales_today),
    conversion: data.people_talked
      ? `${Math.round((data.sales_today / data.people_talked) * 100)}%`
      : "0%",
    work_start: start ?? "—",
    work_end: end ?? "—",
    work_day_end: data.work_day_end || DEFAULT_REPORT_HOURS.workDayEnd,
  };
  return template.replace(/\{([a-z_]+)\}/g, (whole, key: string) =>
    key in values ? values[key as keyof typeof values] : whole,
  );
}
