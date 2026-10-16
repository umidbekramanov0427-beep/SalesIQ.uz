// The company owner's Monday Telegram report: last week's leads, sales,
// money collected, calls and overdue tasks, each against the week before.
// Pure, so the wording and the week boundaries are unit-tested;
// weekly-report.server.ts gathers the facts and sends it.

import { formatSom } from "@/lib/lead-payments/paid-stage";

const TASHKENT_OFFSET_MS = 5 * 3600_000;
const DAY = 86_400_000;

/**
 * Last full Monday–Sunday week in Tashkent, as UTC instants:
 * [from, to) plus the week before it, and the Monday the report is for.
 */
export function lastWeek(now: number): {
  from: number;
  to: number;
  prevFrom: number;
  monday: string;
} {
  const local = new Date(now + TASHKENT_OFFSET_MS);
  const dow = (local.getUTCDay() + 6) % 7; // Monday = 0
  const todayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const thisMonday = todayStart - dow * DAY;
  const to = thisMonday - TASHKENT_OFFSET_MS;
  return {
    from: to - 7 * DAY,
    to,
    prevFrom: to - 14 * DAY,
    monday: new Date(thisMonday).toISOString().slice(0, 10),
  };
}

/** Monday from 09:00 Tashkent. */
export function isReportTime(now: number): boolean {
  const local = new Date(now + TASHKENT_OFFSET_MS);
  return local.getUTCDay() === 1 && local.getUTCHours() >= 9;
}

export type WeekNumbers = {
  newLeads: number;
  won: number;
  wonAmount: number;
  collected: number;
  calls: number;
  missedCalls: number;
};

export type WeeklyFacts = {
  company: string;
  week: WeekNumbers;
  prev: WeekNumbers;
  topManager: { name: string; won: number } | null;
  overdueTasks: number;
  appUrl: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "▲ 20%" / "▼ 5%" / "" -- against the week before. */
export function trend(now: number, before: number): string {
  if (before <= 0) return now > 0 ? " · yangi" : "";
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return " · o'zgarishsiz";
  return pct > 0 ? ` · ▲ ${pct}%` : ` · ▼ ${Math.abs(pct)}%`;
}

const pad = (n: number) => String(n).padStart(2, "0");
function dayMonth(ms: number): string {
  const d = new Date(ms + TASHKENT_OFFSET_MS);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`;
}

export function weeklyReportText(f: WeeklyFacts, range: { from: number; to: number }): string {
  const w = f.week;
  const p = f.prev;
  const conv = w.newLeads > 0 ? Math.round((w.won / w.newLeads) * 1000) / 10 : 0;
  const lines = [
    `📊 <b>${esc(f.company)}</b> — haftalik hisobot`,
    `${dayMonth(range.from)}–${dayMonth(range.to - 1)}`,
    "",
    `🆕 Yangi lidlar: <b>${w.newLeads}</b>${trend(w.newLeads, p.newLeads)}`,
    `🏆 Sotuvlar: <b>${w.won}</b>${trend(w.won, p.won)}${w.wonAmount > 0 ? ` · ${formatSom(w.wonAmount)} so'm` : ""}`,
    `📈 Konversiya: <b>${conv}%</b>`,
  ];
  if (w.collected > 0 || p.collected > 0)
    lines.push(
      `💳 Yig'ilgan to'lovlar: <b>${formatSom(w.collected)} so'm</b>${trend(w.collected, p.collected)}`,
    );
  if (w.calls > 0 || p.calls > 0)
    lines.push(
      `📞 Qo'ng'iroqlar: <b>${w.calls}</b>${trend(w.calls, p.calls)}${w.missedCalls > 0 ? ` · o'tkazib yuborilgan: ${w.missedCalls}` : ""}`,
    );
  if (f.topManager && f.topManager.won > 0)
    lines.push(
      `🥇 Haftaning eng yaxshisi: <b>${esc(f.topManager.name)}</b> — ${f.topManager.won} ta sotuv`,
    );
  if (f.overdueTasks > 0) lines.push(`⏰ Muddati o'tgan vazifalar: <b>${f.overdueTasks}</b>`);
  lines.push("", `Batafsil: ${f.appUrl}`);
  return lines.join("\n");
}
