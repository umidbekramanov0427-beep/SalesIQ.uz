// The manager's "today" panel on the home page: what needs doing now, each
// count with the funnel holding most of it so a click opens the right board.
// Pure, so it is unit-tested; the data comes from useDailyWork.

export type DailyWorkLead = {
  id: string;
  funnel: string | null;
  owner_id: string | null;
  stage_id: string | null;
  budget: number | null;
  expected_revenue: number | null;
};

export type DailyWorkTask = {
  lead_id: string | null;
  due_date: string | null;
  /** The task's lead's funnel (the lead may be closed, so not in `leads`). */
  funnel?: string | null;
};

export type DailyWorkStage = { id: string; name: string; is_won: boolean; is_lost: boolean };

export type DailyWorkItem = {
  count: number;
  /** The funnel with the most of these leads ("Direct Sales" for none). */
  funnel: string | null;
  /** Money still to collect (payment stages only). */
  amount?: number;
  stageIds?: string[];
};

export type DailyWork = {
  overdue: DailyWorkItem;
  today: DailyWorkItem;
  noTask: DailyWorkItem;
  unassigned: DailyWorkItem;
  payment: DailyWorkItem;
  /** No CRM leads at all (an analytics-only company): the panel hides. */
  empty: boolean;
};

const funnelOf = (l: { funnel?: string | null }) => l.funnel || "Direct Sales";

// Prepayment and half-payment stages: the deal is agreed, money is still
// due. Matched like the rest of the app (lowercase, apostrophes stripped).
export function isPaymentStage(name: string): boolean {
  const n = name.toLowerCase().replace(/['’ʼ`]/g, "");
  return /predoplata|peredoplata|yarim|предоплат/.test(n);
}

function item(leads: { funnel?: string | null }[], extra?: Partial<DailyWorkItem>): DailyWorkItem {
  const byFunnel = new Map<string, number>();
  for (const l of leads) byFunnel.set(funnelOf(l), (byFunnel.get(funnelOf(l)) ?? 0) + 1);
  let funnel: string | null = null;
  let best = 0;
  for (const [f, n] of byFunnel) {
    if (n > best) [funnel, best] = [f, n];
  }
  return { count: leads.length, funnel, ...extra };
}

export function dailyWork(
  leads: DailyWorkLead[],
  tasks: DailyWorkTask[],
  stages: DailyWorkStage[],
  now: Date = new Date(),
): DailyWork {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const open = leads.filter((l) => {
    const s = l.stage_id ? stageById.get(l.stage_id) : undefined;
    return !s?.is_won && !s?.is_lost;
  });

  const dayEnd = new Date(now);
  dayEnd.setHours(24, 0, 0, 0);
  const overdue: DailyWorkTask[] = [];
  const today: DailyWorkTask[] = [];
  const withTask = new Set<string>();
  for (const t of tasks) {
    if (t.lead_id) withTask.add(t.lead_id);
    if (!t.due_date) continue;
    const due = new Date(t.due_date).getTime();
    if (due < now.getTime()) overdue.push(t);
    else if (due < dayEnd.getTime()) today.push(t);
  }

  const paymentStageIds = stages
    .filter((s) => !s.is_won && !s.is_lost && isPaymentStage(s.name))
    .map((s) => s.id);
  const payIds = new Set(paymentStageIds);
  const paying = open.filter((l) => l.stage_id && payIds.has(l.stage_id));
  const due = paying.reduce(
    (sum, l) => sum + (Number(l.expected_revenue) || Number(l.budget) || 0),
    0,
  );

  return {
    overdue: item(overdue),
    today: item(today),
    noTask: item(open.filter((l) => !withTask.has(l.id))),
    unassigned: item(open.filter((l) => !l.owner_id)),
    payment: item(paying, { amount: due, stageIds: paymentStageIds }),
    empty: leads.length === 0 && tasks.length === 0,
  };
}
