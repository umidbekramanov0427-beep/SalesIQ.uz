// Analitika (amoCRM's "Аналитика"): the reports computed from plain rows,
// so the rules are unit-tested and the server only gathers data.
//   salesAnalysis  -- Анализ продаж: the funnel stage by stage for a period
//   summaryByOwner -- Сводный отчёт: one row per manager
//   winLoss        -- Win-Loss: why leads were lost, where wins come from
//   activity       -- Отчёт по сотрудникам: who did what, day by day
//   forecast       -- Прогноз: open leads weighted by stage probability

export type Range = { from: string; to: string };

/** "YYYY-MM-DD".."YYYY-MM-DD" (inclusive, Tashkent days) -> an instant range. */
export function parseRange(from: string | null, to: string | null): Range | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!from || !to || !re.test(from) || !re.test(to)) return null;
  const a = Date.parse(`${from}T00:00:00+05:00`);
  const b = Date.parse(`${to}T00:00:00+05:00`) + 86_400_000;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > 367 * 86_400_000) return null;
  return { from: new Date(a).toISOString(), to: new Date(b).toISOString() };
}

export type ALead = {
  id: string;
  owner_id: string | null;
  stage_id: string | null;
  budget: number | null;
  created_at: string;
  stage_changed_at: string | null;
  loss_reason: string | null;
  source: string | null;
};
export type AStage = {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  probability: number | null;
};
export type AStageEvent = { lead_id: string; stage_id: string; entered_at: string };

const inRange = (iso: string | null | undefined, r: Range) => !!iso && iso >= r.from && iso < r.to;
const money = (n: number | null | undefined) => Number(n) || 0;
const DAY = 86_400_000;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/** Won/lost in the period: the lead sits in a won/lost stage it entered in the period. */
function closedIn(lead: ALead, stage: AStage | undefined, r: Range): "won" | "lost" | null {
  if (!stage || !inRange(lead.stage_changed_at, r)) return null;
  return stage.is_won ? "won" : stage.is_lost ? "lost" : null;
}

export type SalesAnalysis = {
  stages: {
    id: string;
    name: string;
    kind: "open" | "won" | "lost";
    entered: number;
    now: number;
    nowSum: number;
    /** % of the leads that entered the previous open stage that also entered this one. */
    passRate: number | null;
  }[];
  newLeads: number;
  won: { count: number; sum: number };
  lost: { count: number; sum: number };
  conversion: number;
  avgCheck: number;
  avgCycleDays: number | null;
};

export function salesAnalysis(
  leads: ALead[],
  stages: AStage[],
  events: AStageEvent[],
  r: Range,
): SalesAnalysis {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const ordered = [...stages].sort(
    (a, b) =>
      Number(a.is_won || a.is_lost) - Number(b.is_won || b.is_lost) || a.position - b.position,
  );
  const enteredBy = new Map<string, Set<string>>();
  for (const e of events) {
    if (!inRange(e.entered_at, r)) continue;
    const set = enteredBy.get(e.stage_id) ?? new Set<string>();
    set.add(e.lead_id);
    enteredBy.set(e.stage_id, set);
  }
  const nowCount = new Map<string, { n: number; sum: number }>();
  for (const l of leads) {
    if (!l.stage_id) continue;
    const c = nowCount.get(l.stage_id) ?? { n: 0, sum: 0 };
    c.n += 1;
    c.sum += money(l.budget);
    nowCount.set(l.stage_id, c);
  }
  let prevOpen: number | null = null;
  const rows = ordered.map((s) => {
    const entered = enteredBy.get(s.id)?.size ?? 0;
    const kind = s.is_won ? "won" : s.is_lost ? "lost" : "open";
    const passRate = kind === "open" && prevOpen !== null ? pct(entered, prevOpen) : null;
    if (kind === "open") prevOpen = entered;
    return {
      id: s.id,
      name: s.name,
      kind,
      entered,
      now: nowCount.get(s.id)?.n ?? 0,
      nowSum: nowCount.get(s.id)?.sum ?? 0,
      passRate,
    } as SalesAnalysis["stages"][number];
  });

  const newLeads = leads.filter((l) => inRange(l.created_at, r)).length;
  const won = { count: 0, sum: 0 };
  const lost = { count: 0, sum: 0 };
  let cycleDays = 0;
  for (const l of leads) {
    const c = closedIn(l, l.stage_id ? byId.get(l.stage_id) : undefined, r);
    if (c === "won") {
      won.count += 1;
      won.sum += money(l.budget);
      cycleDays += (Date.parse(l.stage_changed_at!) - Date.parse(l.created_at)) / DAY;
    } else if (c === "lost") {
      lost.count += 1;
      lost.sum += money(l.budget);
    }
  }
  return {
    stages: rows,
    newLeads,
    won,
    lost,
    conversion: pct(won.count, won.count + lost.count),
    avgCheck: won.count ? Math.round(won.sum / won.count) : 0,
    avgCycleDays: won.count ? Math.round((cycleDays / won.count) * 10) / 10 : null,
  };
}

export type OwnerRow = {
  ownerId: string | null;
  newLeads: number;
  open: number;
  openSum: number;
  won: number;
  wonSum: number;
  lost: number;
  conversion: number;
  avgCheck: number;
  tasksDone: number;
  calls: number;
  messages: number;
};

export function summaryByOwner(
  leads: ALead[],
  stages: AStage[],
  r: Range,
  extra: {
    tasksDone?: Map<string, number>;
    calls?: Map<string, number>;
    messages?: Map<string, number>;
  } = {},
): OwnerRow[] {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const rows = new Map<string | null, OwnerRow>();
  const row = (id: string | null) => {
    let x = rows.get(id);
    if (!x) {
      x = {
        ownerId: id,
        newLeads: 0,
        open: 0,
        openSum: 0,
        won: 0,
        wonSum: 0,
        lost: 0,
        conversion: 0,
        avgCheck: 0,
        tasksDone: 0,
        calls: 0,
        messages: 0,
      };
      rows.set(id, x);
    }
    return x;
  };
  for (const l of leads) {
    const s = l.stage_id ? byId.get(l.stage_id) : undefined;
    const x = row(l.owner_id);
    if (inRange(l.created_at, r)) x.newLeads += 1;
    if (s && !s.is_won && !s.is_lost) {
      x.open += 1;
      x.openSum += money(l.budget);
    }
    const c = closedIn(l, s, r);
    if (c === "won") {
      x.won += 1;
      x.wonSum += money(l.budget);
    } else if (c === "lost") x.lost += 1;
  }
  for (const [key, map] of [
    ["tasksDone", extra.tasksDone],
    ["calls", extra.calls],
    ["messages", extra.messages],
  ] as const) {
    for (const [id, n] of map ?? []) row(id)[key] = n;
  }
  return [...rows.values()]
    .map((x) => ({
      ...x,
      conversion: pct(x.won, x.won + x.lost),
      avgCheck: x.won ? Math.round(x.wonSum / x.won) : 0,
    }))
    .filter((x) => x.newLeads || x.open || x.won || x.lost || x.tasksDone || x.calls || x.messages)
    .sort((a, b) => b.wonSum - a.wonSum || b.won - a.won || b.newLeads - a.newLeads);
}

export type WinLoss = {
  lostByReason: { reason: string | null; count: number; sum: number }[];
  bySource: { source: string | null; won: number; lost: number; winRate: number }[];
  byOwner: { ownerId: string | null; won: number; lost: number; winRate: number }[];
  won: number;
  lost: number;
};

export function winLoss(leads: ALead[], stages: AStage[], r: Range): WinLoss {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const reasons = new Map<string | null, { count: number; sum: number }>();
  const sources = new Map<string | null, { won: number; lost: number }>();
  const owners = new Map<string | null, { won: number; lost: number }>();
  let won = 0;
  let lost = 0;
  for (const l of leads) {
    const c = closedIn(l, l.stage_id ? byId.get(l.stage_id) : undefined, r);
    if (!c) continue;
    const src = l.source?.trim() || null;
    const s = sources.get(src) ?? { won: 0, lost: 0 };
    const o = owners.get(l.owner_id) ?? { won: 0, lost: 0 };
    s[c] += 1;
    o[c] += 1;
    sources.set(src, s);
    owners.set(l.owner_id, o);
    if (c === "won") won += 1;
    else {
      lost += 1;
      const key = l.loss_reason?.trim() || null;
      const x = reasons.get(key) ?? { count: 0, sum: 0 };
      x.count += 1;
      x.sum += money(l.budget);
      reasons.set(key, x);
    }
  }
  return {
    lostByReason: [...reasons]
      .map(([reason, x]) => ({ reason, ...x }))
      .sort((a, b) => b.count - a.count),
    bySource: [...sources]
      .map(([source, x]) => ({ source, ...x, winRate: pct(x.won, x.won + x.lost) }))
      .sort((a, b) => b.won + b.lost - (a.won + a.lost)),
    byOwner: [...owners]
      .map(([ownerId, x]) => ({ ownerId, ...x, winRate: pct(x.won, x.won + x.lost) }))
      .sort((a, b) => b.won - a.won),
    won,
    lost,
  };
}

export const ACTIVITY_KINDS = ["leads", "moves", "notes", "tasks", "calls", "messages"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export type ActivityEvent = { actor: string | null; kind: ActivityKind; at: string };

/** Local calendar day "YYYY-MM-DD" of an instant, in the given offset (minutes east of UTC). */
export function dayKey(iso: string, offsetMinutes = 300): string {
  return new Date(Date.parse(iso) + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

export type Activity = {
  days: string[];
  people: {
    actor: string | null;
    totals: Record<ActivityKind, number>;
    perDay: Record<string, number>;
  }[];
};

export function activity(events: ActivityEvent[], r: Range, offsetMinutes = 300): Activity {
  const days: string[] = [];
  for (let t = Date.parse(r.from); t < Date.parse(r.to) && days.length < 62; t += DAY) {
    const k = dayKey(new Date(t).toISOString(), offsetMinutes);
    if (!days.includes(k)) days.push(k);
  }
  const people = new Map<string | null, Activity["people"][number]>();
  for (const e of events) {
    if (!inRange(e.at, r)) continue;
    let p = people.get(e.actor);
    if (!p) {
      p = {
        actor: e.actor,
        totals: Object.fromEntries(ACTIVITY_KINDS.map((k) => [k, 0])) as Record<
          ActivityKind,
          number
        >,
        perDay: {},
      };
      people.set(e.actor, p);
    }
    p.totals[e.kind] += 1;
    const d = dayKey(e.at, offsetMinutes);
    p.perDay[d] = (p.perDay[d] ?? 0) + 1;
  }
  const total = (p: Activity["people"][number]) =>
    ACTIVITY_KINDS.reduce((s, k) => s + p.totals[k], 0);
  return { days, people: [...people.values()].sort((a, b) => total(b) - total(a)) };
}

export type Forecast = {
  stages: {
    id: string;
    name: string;
    count: number;
    sum: number;
    probability: number;
    weighted: number;
  }[];
  byOwner: { ownerId: string | null; count: number; sum: number; weighted: number }[];
  total: { count: number; sum: number; weighted: number };
};

/** Open leads: their budget times the stage's chance to close. */
export function forecast(leads: ALead[], stages: AStage[]): Forecast {
  const open = stages
    .filter((s) => !s.is_won && !s.is_lost)
    .sort((a, b) => a.position - b.position);
  const byId = new Map(open.map((s) => [s.id, s]));
  const rows = new Map(
    open.map((s) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        count: 0,
        sum: 0,
        probability: Math.max(0, Math.min(100, s.probability ?? 0)),
        weighted: 0,
      },
    ]),
  );
  const owners = new Map<
    string | null,
    { ownerId: string | null; count: number; sum: number; weighted: number }
  >();
  for (const l of leads) {
    const s = l.stage_id ? byId.get(l.stage_id) : undefined;
    if (!s) continue;
    const row = rows.get(s.id)!;
    const b = money(l.budget);
    const w = (b * row.probability) / 100;
    row.count += 1;
    row.sum += b;
    row.weighted += w;
    const o = owners.get(l.owner_id) ?? { ownerId: l.owner_id, count: 0, sum: 0, weighted: 0 };
    o.count += 1;
    o.sum += b;
    o.weighted += w;
    owners.set(l.owner_id, o);
  }
  const stageRows = [...rows.values()].map((x) => ({ ...x, weighted: Math.round(x.weighted) }));
  return {
    stages: stageRows,
    byOwner: [...owners.values()]
      .map((x) => ({ ...x, weighted: Math.round(x.weighted) }))
      .sort((a, b) => b.weighted - a.weighted),
    total: {
      count: stageRows.reduce((s, x) => s + x.count, 0),
      sum: stageRows.reduce((s, x) => s + x.sum, 0),
      weighted: stageRows.reduce((s, x) => s + x.weighted, 0),
    },
  };
}

// ---- What /analytics/data and /analytics/events answer -----------------------

export type AnalyticsData = {
  range: Range;
  funnels: string[];
  funnel: string | null;
  scope: "all" | "group" | "own";
  people: { id: string; name: string; role: string | null }[];
  sales: SalesAnalysis;
  summary: OwnerRow[];
  winLoss: WinLoss;
  activity: Activity;
  forecast: Forecast;
  truncated: boolean;
};

export const EVENT_KINDS = ["lead", "stage", "note", "task", "call", "message", "payment"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export type LogEvent = {
  at: string;
  kind: EventKind;
  actor: string | null;
  leadId: string | null;
  leadName: string | null;
  text: string;
};
