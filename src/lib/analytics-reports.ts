// Analitika (amoCRM's "Аналитика"): the reports computed from plain rows,
// so the rules are unit-tested and the server only gathers data.
//   summaryByOwner -- Сводный отчёт: one row per manager
//   winLoss        -- Win-Loss: why leads were lost, where wins come from

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
  /** The stage's «Lid sifati» (Voronka sozlamalari): qualified / junk. */
  quality?: string | null;
};

const inRange = (iso: string | null | undefined, r: Range) => !!iso && iso >= r.from && iso < r.to;
const money = (n: number | null | undefined) => Number(n) || 0;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/** Won/lost in the period: the lead sits in a won/lost stage it entered in the period. */
function closedIn(lead: ALead, stage: AStage | undefined, r: Range): "won" | "lost" | null {
  if (!stage || !inRange(lead.stage_changed_at, r)) return null;
  return stage.is_won ? "won" : stage.is_lost ? "lost" : null;
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

// ---- What /analytics/data answers ------------------------------------------

export type AnalyticsData = {
  range: Range;
  funnels: string[];
  funnel: string | null;
  scope: "all" | "group" | "own";
  people: { id: string; name: string; role: string | null }[];
  summary: OwnerRow[];
  winLoss: WinLoss;
  truncated: boolean;
};
