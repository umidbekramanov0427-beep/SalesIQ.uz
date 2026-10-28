// The coaching cycle: find each manager's weakest step of the sales script
// in their analysed calls, give them a practice task on it, then measure
// the same step in the calls made since -- before vs after. Pure, so it is
// unit-tested; the data comes from /coaching (coaching.server.ts).

export type CoachingCall = {
  ownerId: string | null;
  at: string;
  /** Script stage -> done in this call (a stage counts once per call). */
  stages: Record<string, boolean>;
};

export type Rate = { met: number; total: number; rate: number };

/** Turns a call's checklist into one done/not-done per stage. */
export function stagesOf(
  checklist: { stage?: string | null; step?: string | null; met: boolean }[],
) {
  const out: Record<string, boolean> = {};
  for (const item of checklist) {
    const stage = (item.stage || item.step || "").trim();
    if (!stage) continue;
    out[stage] = (out[stage] ?? false) || !!item.met;
  }
  return out;
}

const rateOf = (met: number, total: number): Rate => ({
  met,
  total,
  rate: total > 0 ? Math.round((met / total) * 100) : 0,
});

/** Each stage's success rate over the given calls. */
export function stageRates(calls: CoachingCall[]): Map<string, Rate> {
  const acc = new Map<string, { met: number; total: number }>();
  for (const c of calls) {
    for (const [stage, met] of Object.entries(c.stages)) {
      const a = acc.get(stage) ?? { met: 0, total: 0 };
      a.total += 1;
      if (met) a.met += 1;
      acc.set(stage, a);
    }
  }
  return new Map([...acc].map(([k, v]) => [k, rateOf(v.met, v.total)]));
}

export type WeakSpot = {
  ownerId: string;
  calls: number;
  stage: string;
  rate: number;
  teamRate: number;
  /** All of this manager's stages, weakest first. */
  stages: { stage: string; rate: number; total: number; teamRate: number }[];
};

/**
 * Per manager: the stage where they fall furthest below the team (and are
 * under 70% themselves). Managers with fewer than `minCalls` analysed
 * calls are left out -- too little to judge.
 */
export function weakSpots(calls: CoachingCall[], minCalls = 5): WeakSpot[] {
  const team = stageRates(calls);
  const byOwner = new Map<string, CoachingCall[]>();
  for (const c of calls) {
    if (!c.ownerId) continue;
    const list = byOwner.get(c.ownerId) ?? [];
    list.push(c);
    byOwner.set(c.ownerId, list);
  }
  const out: WeakSpot[] = [];
  for (const [ownerId, list] of byOwner) {
    if (list.length < minCalls) continue;
    const stages = [...stageRates(list)]
      .filter(([, r]) => r.total >= Math.min(minCalls, 3))
      .map(([stage, r]) => ({
        stage,
        rate: r.rate,
        total: r.total,
        teamRate: team.get(stage)?.rate ?? r.rate,
      }))
      .sort((a, b) => a.rate - a.teamRate - (b.rate - b.teamRate) || a.rate - b.rate);
    const weakest = stages.find((s) => s.rate < 70);
    if (!weakest) continue;
    out.push({
      ownerId,
      calls: list.length,
      stage: weakest.stage,
      rate: weakest.rate,
      teamRate: weakest.teamRate,
      stages,
    });
  }
  return out.sort((a, b) => a.rate - a.teamRate - (b.rate - b.teamRate));
}

/** One manager's rate on one stage in [from, to). */
export function rateFor(
  calls: CoachingCall[],
  ownerId: string,
  stage: string,
  from: string | null,
  to: string | null,
): Rate {
  let met = 0;
  let total = 0;
  for (const c of calls) {
    if (c.ownerId !== ownerId || !(stage in c.stages)) continue;
    if (from && c.at < from) continue;
    if (to && c.at >= to) continue;
    total += 1;
    if (c.stages[stage]) met += 1;
  }
  return rateOf(met, total);
}

/** "Before -> after" for a task: improved, worse, or too few calls yet to say. */
export function coachingVerdict(
  before: number | null,
  after: Rate,
  minCalls = 3,
): "pending" | "better" | "same" | "worse" {
  if (after.total < minCalls || before == null) return "pending";
  const d = after.rate - before;
  return d >= 10 ? "better" : d <= -10 ? "worse" : "same";
}

/** The ready practice text for a stage, in the company's language. */
export function practiceText(stage: string, lang: string): string {
  if (lang === "ru")
    return `Отработайте этап «${stage}»: прослушайте 2 лучших звонка команды, выпишите фразы и примените их в следующих 10 звонках.`;
  if (lang === "en")
    return `Practise the "${stage}" step: listen to 2 of the team's best calls, write down their phrases and use them in your next 10 calls.`;
  return `"${stage}" bosqichini mashq qiling: jamoaning 2 ta eng yaxshi qo'ng'irog'ini tinglang, iboralarini yozib oling va keyingi 10 ta qo'ng'iroqda qo'llang.`;
}
