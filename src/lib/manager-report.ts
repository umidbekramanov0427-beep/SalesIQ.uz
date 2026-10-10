// A sales manager's end-of-day report: the template (editable by the super
// admin / ROP) with {placeholders} filled from my_daily_report() -- the
// manager copies the text into the team's Telegram group.

export type ManagerReportData = {
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
  work_start: string | null;
  work_end: string | null;
  working_now: boolean;
};

export const DEFAULT_MANAGER_REPORT_TEMPLATE = `#report | {name} {date}

1. Call time – {call_time}

2. Kunlik conversation: {talked}/{called}

3. Lidlar soni: {leads_total}

4. Sotuvlar – {sales_today}/{sales_total}

5. Ish boshlagan vaqtim: {work_start}

6. Ish yakunlagan vaqtim: {work_end}

Holat: `;

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
  "conversion",
  "work_start",
  "work_end",
] as const;

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
  // Started: clocked in, else the first call; finished: clocked out, else
  // the last call -- or now, while the manager is still at work.
  const start = clock(data.work_start, tz) ?? clock(data.first_call, tz) ?? "—";
  const end = data.working_now
    ? clock(now.toISOString(), tz)!
    : (clock(data.work_end, tz) ?? clock(data.last_call, tz) ?? "—");
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
    conversion: data.people_talked
      ? `${Math.round((data.sales_today / data.people_talked) * 100)}%`
      : "0%",
    work_start: start,
    work_end: end,
  };
  return template.replace(/\{([a-z_]+)\}/g, (whole, key: string) =>
    key in values ? values[key as keyof typeof values] : whole,
  );
}
