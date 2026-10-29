// Bosh sahifa's headline numbers, worked out from plain rows so the rules
// can be unit-tested: six KPIs for the picked period with the same-length
// period before it, a per-day series for each (the cards' sparklines), the
// revenue-by-day chart, task discipline and the split of calls into first
// and repeat calls.

export type OverviewLead = {
  id: string;
  created_at: string;
  first_contact_at: string | null;
  stage_id: string | null;
  stage_changed_at: string | null;
  budget: number | null;
};
export type OverviewCall = { lead_id: string | null; occurred_at: string; connected: boolean };
export type OverviewTask = {
  lead_id: string | null;
  status: string;
  due_date: string | null;
  updated_at: string;
};
export type Range = { from: Date; to: Date };

export type Kpi = {
  /** null: nothing to measure in the period. */
  value: number | null;
  prev: number | null;
  /** Change against the previous period, in percent (null if not comparable). */
  deltaPct: number | null;
  /** One value per day of the period (null for days with nothing to measure). */
  series: (number | null)[];
};

export type HomeOverview = {
  newLeads: Kpi;
  revenue: Kpi & { deals: number };
  firstContactHours: Kpi;
  attemptsToContact: Kpi;
  leadToSaleDays: Kpi;
  conversion: Kpi & { sold: number; leads: number };
  daily: { date: string; revenue: number; deals: number }[];
  tasks: {
    leadsWithTaskPct: number | null;
    leadsWithTask: number;
    openLeads: number;
    onTimePct: number | null;
    onTime: number;
    done: number;
    overduePct: number | null;
    overdue: number;
    total: number;
    open: number;
  };
  callTypes: { first: number; repeat: number; other: number; total: number };
};

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const t = (iso: string) => new Date(iso).getTime();
const inRange = (ms: number, r: Range) => ms >= r.from.getTime() && ms < r.to.getTime();
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function deltaPct(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}

function dayCount(r: Range) {
  return Math.max(1, Math.round((r.to.getTime() - r.from.getTime()) / DAY));
}
function dayIndex(ms: number, r: Range) {
  return Math.floor((ms - r.from.getTime()) / DAY);
}

function kpi(cur: number | null, prev: number | null, series: (number | null)[]): Kpi {
  return { value: cur, prev, deltaPct: deltaPct(cur, prev), series };
}

/** Per-day values from items bucketed by day: sum or average. */
function bucket(
  items: { ms: number; v: number }[],
  r: Range,
  how: "sum" | "avg",
): (number | null)[] {
  const n = dayCount(r);
  const sums = new Array<number>(n).fill(0);
  const counts = new Array<number>(n).fill(0);
  for (const it of items) {
    const i = dayIndex(it.ms, r);
    if (i < 0 || i >= n) continue;
    sums[i]! += it.v;
    counts[i]! += 1;
  }
  return sums.map((s, i) => (how === "sum" ? s : counts[i] ? s / counts[i]! : null));
}

export function computeHomeOverview(input: {
  range: Range;
  prevRange: Range;
  leads: OverviewLead[];
  calls: OverviewCall[];
  tasks: OverviewTask[];
  openLeads: number;
  isSale: (stageId: string | null) => boolean;
  now?: Date;
}): HomeOverview {
  const { range, prevRange, leads, calls, tasks, isSale } = input;
  const now = (input.now ?? new Date()).getTime();

  // New leads: created in the period.
  const created = (r: Range) => leads.filter((l) => inRange(t(l.created_at), r));
  const curLeads = created(range);
  const prevLeads = created(prevRange);

  // Sales: leads that moved into a sale stage during the period.
  const sold = (r: Range) =>
    leads.filter(
      (l) => isSale(l.stage_id) && l.stage_changed_at && inRange(t(l.stage_changed_at), r),
    );
  const curSold = sold(range);
  const prevSold = sold(prevRange);
  const revenueOf = (ls: OverviewLead[]) => ls.reduce((s, l) => s + (Number(l.budget) || 0), 0);

  // Speed to lead: hours from creation to first contact, for leads created then.
  const contactHours = (ls: OverviewLead[]) =>
    ls
      .filter((l) => l.first_contact_at)
      .map((l) => ({
        ms: t(l.created_at),
        v: Math.max(0, (t(l.first_contact_at!) - t(l.created_at)) / HOUR),
      }));
  const curContact = contactHours(curLeads);
  const prevContact = contactHours(prevLeads);

  // Sales cycle: days from creation to the sale, for sales in the period.
  const cycleDays = (ls: OverviewLead[]) =>
    ls.map((l) => ({
      ms: t(l.stage_changed_at!),
      v: Math.max(0, (t(l.stage_changed_at!) - t(l.created_at)) / DAY),
    }));
  const curCycle = cycleDays(curSold);
  const prevCycle = cycleDays(prevSold);

  // Attempts to reach a lead: its calls up to and including the first one
  // that connected, for leads first reached in the period.
  const byLead = new Map<string, OverviewCall[]>();
  for (const c of calls) {
    if (!c.lead_id) continue;
    const list = byLead.get(c.lead_id) ?? [];
    list.push(c);
    byLead.set(c.lead_id, list);
  }
  for (const list of byLead.values()) list.sort((a, b) => t(a.occurred_at) - t(b.occurred_at));
  const attempts = (r: Range) => {
    const out: { ms: number; v: number }[] = [];
    for (const list of byLead.values()) {
      const firstOk = list.findIndex((c) => c.connected);
      if (firstOk < 0) continue;
      const ms = t(list[firstOk]!.occurred_at);
      if (inRange(ms, r)) out.push({ ms, v: firstOk + 1 });
    }
    return out;
  };
  const curAttempts = attempts(range);
  const prevAttempts = attempts(prevRange);

  const conv = (s: number, l: number) => (l ? (s / l) * 100 : null);

  const leadSeries = bucket(
    curLeads.map((l) => ({ ms: t(l.created_at), v: 1 })),
    range,
    "sum",
  );
  const soldItems = curSold.map((l) => ({ ms: t(l.stage_changed_at!), v: Number(l.budget) || 0 }));
  const revSeries = bucket(soldItems, range, "sum");
  const dealSeries = bucket(
    curSold.map((l) => ({ ms: t(l.stage_changed_at!), v: 1 })),
    range,
    "sum",
  );
  // Conversion: of the leads that came in the period, how many are sold.
  const soldOf = (ls: OverviewLead[]) => ls.filter((l) => isSale(l.stage_id));
  const curConverted = soldOf(curLeads);
  const prevConverted = soldOf(prevLeads);
  const convSeries = bucket(
    curLeads.map((l) => ({ ms: t(l.created_at), v: isSale(l.stage_id) ? 100 : 0 })),
    range,
    "avg",
  );

  const daily = revSeries.map((v, i) => ({
    date: new Date(range.from.getTime() + i * DAY).toISOString(),
    revenue: v ?? 0,
    deals: dealSeries[i] ?? 0,
  }));

  // Task discipline: tasks due in the period.
  const dueInRange = tasks.filter((x) => x.due_date && inRange(t(x.due_date), range));
  const isDone = (x: OverviewTask) => x.status === "Done";
  const done = dueInRange.filter(isDone);
  const onTime = done.filter((x) => t(x.updated_at) <= t(x.due_date!));
  const overdue = dueInRange.filter((x) => !isDone(x) && t(x.due_date!) < now);
  const openTasks = dueInRange.filter((x) => !isDone(x));
  const leadsWithOpenTask = new Set(
    tasks.filter((x) => !isDone(x) && x.lead_id).map((x) => x.lead_id!),
  ).size;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

  // Call types: the first call to a lead, a repeat call, or no lead at all.
  let first = 0;
  let repeat = 0;
  let other = 0;
  for (const c of calls) {
    if (!inRange(t(c.occurred_at), range)) continue;
    if (!c.lead_id) {
      other++;
      continue;
    }
    const list = byLead.get(c.lead_id)!;
    if (list[0] === c) first++;
    else repeat++;
  }

  return {
    newLeads: kpi(curLeads.length, prevLeads.length, leadSeries),
    revenue: {
      ...kpi(revenueOf(curSold), revenueOf(prevSold), revSeries),
      deals: curSold.length,
    },
    firstContactHours: kpi(
      avg(curContact.map((x) => x.v)),
      avg(prevContact.map((x) => x.v)),
      bucket(curContact, range, "avg"),
    ),
    attemptsToContact: kpi(
      avg(curAttempts.map((x) => x.v)),
      avg(prevAttempts.map((x) => x.v)),
      bucket(curAttempts, range, "avg"),
    ),
    leadToSaleDays: kpi(
      avg(curCycle.map((x) => x.v)),
      avg(prevCycle.map((x) => x.v)),
      bucket(curCycle, range, "avg"),
    ),
    conversion: {
      ...kpi(
        conv(curConverted.length, curLeads.length),
        conv(prevConverted.length, prevLeads.length),
        convSeries,
      ),
      sold: curConverted.length,
      leads: curLeads.length,
    },
    daily,
    tasks: {
      leadsWithTaskPct: input.openLeads
        ? Math.min(100, Math.round((leadsWithOpenTask / input.openLeads) * 100))
        : null,
      leadsWithTask: Math.min(leadsWithOpenTask, input.openLeads),
      openLeads: input.openLeads,
      onTimePct: pct(onTime.length, done.length),
      onTime: onTime.length,
      done: done.length,
      overduePct: pct(overdue.length, dueInRange.length),
      overdue: overdue.length,
      total: dueInRange.length,
      open: openTasks.length,
    },
    callTypes: { first, repeat, other, total: first + repeat + other },
  };
}
