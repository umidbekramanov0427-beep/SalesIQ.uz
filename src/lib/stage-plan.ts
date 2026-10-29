// Reja-fakt by stage and day: for each stage of a funnel, how many leads
// entered it on each day of the month against the plan. The month's plan
// is spread evenly over its days; for the days still ahead each cell shows
// how many a day are now needed to reach the plan. Pure, so it is tested.

export type StageEvent = { stage_id: string; entered_at: string };

export type StageCell = {
  day: number;
  kind: "past" | "today" | "future";
  fact: number;
  /** The day's share of the month's plan. */
  plan: number;
  /** Future days: how many a day are needed from now to reach the plan. */
  needed: number;
};

export type StageRow = {
  stageId: string;
  name: string;
  target: number;
  total: number;
  pct: number | null;
  forecast: number;
  forecastPct: number | null;
  cells: StageCell[];
};

/** The plan for day `d` (1-based) when `target` is spread over `days`. */
export function dailyShare(target: number, days: number, d: number): number {
  return Math.round((target * d) / days) - Math.round((target * (d - 1)) / days);
}

export function computeStageGrid(input: {
  monthStart: Date;
  days: number;
  stages: { id: string; name: string }[];
  events: StageEvent[];
  targets: Map<string, number>;
  now?: Date;
}): StageRow[] {
  const { monthStart, days, stages, events, targets } = input;
  const now = input.now ?? new Date();
  const start = monthStart.getTime();
  const DAY = 86_400_000;
  // Days into the month: 0 before it starts, days+1 once it is over.
  const todayIdx =
    now.getTime() < start ? 0 : Math.min(days + 1, Math.floor((now.getTime() - start) / DAY) + 1);

  const counts = new Map<string, number[]>();
  for (const s of stages) counts.set(s.id, new Array<number>(days).fill(0));
  for (const e of events) {
    const row = counts.get(e.stage_id);
    if (!row) continue;
    const i = Math.floor((new Date(e.entered_at).getTime() - start) / DAY);
    if (i >= 0 && i < days) row[i]! += 1;
  }

  return stages.map((s) => {
    const row = counts.get(s.id)!;
    const target = targets.get(s.id) ?? 0;
    const total = row.reduce((a, b) => a + b, 0);
    const doneDays = Math.min(days, Math.max(0, todayIdx - 1));
    const factSoFar = row.slice(0, Math.min(days, todayIdx)).reduce((a, b) => a + b, 0);
    const daysAhead = Math.max(0, days - Math.max(todayIdx, 0));
    const needed = daysAhead > 0 ? Math.max(0, Math.ceil((target - factSoFar) / daysAhead)) : 0;
    const elapsed = Math.max(1, Math.min(days, todayIdx));
    const forecast = todayIdx === 0 ? 0 : Math.round((total / elapsed) * days);
    return {
      stageId: s.id,
      name: s.name,
      target,
      total,
      pct: target > 0 ? Math.round((total / target) * 100) : null,
      forecast,
      forecastPct: target > 0 ? Math.round((forecast / target) * 100) : null,
      cells: row.map((fact, i) => {
        const day = i + 1;
        const kind: StageCell["kind"] =
          day < todayIdx ? "past" : day === todayIdx ? "today" : "future";
        return {
          day,
          kind: day <= doneDays ? "past" : kind,
          fact,
          plan: dailyShare(target, days, day),
          needed: kind === "future" ? needed : 0,
        };
      }),
    };
  });
}
