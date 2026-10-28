// "Kimga birinchi qo'ng'iroq": the manager's call queue. Every open CRM
// lead that needs a call now gets a priority from the reasons it has --
// a fresh lead nobody has reached yet comes first, then a client who wrote
// and is waiting for an answer, an overdue task, a payment due, today's
// task, a hot lead, a lead gone quiet -- and the list is sorted by it.
// Pure, so it is unit-tested; the data comes from useCallQueue.

export type QueueLead = {
  id: string;
  name: string;
  phone: string | null;
  ownerId: string | null;
  funnel: string | null;
  createdAt: string;
  nextFollowUp: string | null;
  /** null = nobody has called or written yet; undefined = not known (no column). */
  firstContactAt?: string | null | undefined;
  nextPaymentDate?: string | null | undefined;
  paidAmount?: number | undefined;
  budget: number;
  temperature: string | null;
  score: number | null;
  lastContactAt: string | null;
  /** The latest chat message, when known. */
  lastMessage?: { direction: string; at: string } | null | undefined;
};

export type QueueReason =
  | { kind: "new"; minutes: number }
  | { kind: "unanswered"; minutes: number }
  | { kind: "overdue"; hours: number }
  | { kind: "payment"; overdue: boolean }
  | { kind: "today" }
  | { kind: "hot"; score: number | null }
  | { kind: "silent"; days: number };

export type QueueItem = { lead: QueueLead; priority: number; reasons: QueueReason[] };

const BASE: Record<QueueReason["kind"], number> = {
  new: 100,
  unanswered: 90,
  overdue: 80,
  payment: 70,
  today: 50,
  hot: 30,
  silent: 20,
};

const MIN = 60_000;
const DAY = 86_400_000;

function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function queueReasons(l: QueueLead, now: Date): QueueReason[] {
  const t = now.getTime();
  const out: QueueReason[] = [];
  const created = new Date(l.createdAt).getTime();
  if (l.firstContactAt === null && !(l.paidAmount ?? 0) && t - created < DAY) {
    out.push({ kind: "new", minutes: Math.max(0, Math.floor((t - created) / MIN)) });
  }
  const msg = l.lastMessage;
  if (msg?.direction === "in" && t - new Date(msg.at).getTime() < 3 * DAY) {
    out.push({
      kind: "unanswered",
      minutes: Math.max(0, Math.floor((t - new Date(msg.at).getTime()) / MIN)),
    });
  }
  if (l.nextFollowUp) {
    const due = new Date(l.nextFollowUp);
    if (due.getTime() < t) {
      out.push({ kind: "overdue", hours: Math.floor((t - due.getTime()) / 3_600_000) });
    } else if (localDay(due) === localDay(now)) {
      out.push({ kind: "today" });
    }
  }
  const owes = (l.paidAmount ?? 0) === 0 || l.budget > (l.paidAmount ?? 0);
  if (l.nextPaymentDate && owes) {
    const today = localDay(now);
    const d = l.nextPaymentDate.slice(0, 10);
    if (d <= today) out.push({ kind: "payment", overdue: d < today });
  }
  if (l.temperature === "Hot" || l.temperature === "VeryHot" || (l.score ?? 0) >= 75) {
    out.push({ kind: "hot", score: l.score });
  }
  const last = new Date(l.lastContactAt ?? l.createdAt).getTime();
  if (!l.nextFollowUp && t - last >= 3 * DAY && out.length === 0) {
    out.push({ kind: "silent", days: Math.floor((t - last) / DAY) });
  }
  return out.sort((a, b) => BASE[b.kind] - BASE[a.kind]);
}

/** How urgent the lead is: its strongest reason, nudged by how long it has waited and its score. */
export function queuePriority(reasons: QueueReason[], score: number | null): number {
  if (reasons.length === 0) return 0;
  const top = reasons[0]!;
  let p = BASE[top.kind];
  if (top.kind === "new" || top.kind === "unanswered") p += Math.min(top.minutes, 600) / 60;
  if (top.kind === "overdue") p += Math.min(top.hours, 72) / 8;
  // Every extra reason and a better AI score lift it a little.
  p += (reasons.length - 1) * 2 + Math.min(Math.max(score ?? 0, 0), 100) / 50;
  return Math.round(p * 10) / 10;
}

export function callQueue(leads: QueueLead[], now: Date, limit = 30): QueueItem[] {
  const items: QueueItem[] = [];
  for (const lead of leads) {
    const reasons = queueReasons(lead, now);
    if (reasons.length === 0) continue;
    items.push({ lead, reasons, priority: queuePriority(reasons, lead.score) });
  }
  return items
    .sort((a, b) => b.priority - a.priority || a.lead.createdAt.localeCompare(b.lead.createdAt))
    .slice(0, limit);
}
