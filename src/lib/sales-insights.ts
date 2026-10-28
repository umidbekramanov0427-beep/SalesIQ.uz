// What the AI's call analysis says about real sales: do higher-scored
// leads actually buy (conversion by score band), which step of the sales
// script is skipped in the deals that were lost, and the objection
// library -- the objections clients raise, grouped, with the best answers
// the team's own managers gave. Pure, so it is unit-tested; the data comes
// from /insights/sales (sales-insights.server.ts).

export type InsightCall = {
  leadId: string | null;
  score: number | null;
  checklist: { stage?: string | null; step?: string | null; met: boolean }[];
  objections: {
    objection: string;
    managerResponse: string;
    handled: boolean;
    betterResponse: string;
  }[];
};

export type InsightLead = { id: string; ownerId: string | null; outcome: "won" | "lost" | "open" };

export const SCORE_BANDS = [
  { key: "0-39", from: 0, to: 39 },
  { key: "40-59", from: 40, to: 59 },
  { key: "60-79", from: 60, to: 79 },
  { key: "80-100", from: 80, to: 100 },
] as const;

export type ScoreBand = {
  key: string;
  leads: number;
  won: number;
  lost: number;
  open: number;
  /** won / (won + lost), in %; null while none of them is closed yet. */
  conversion: number | null;
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

/** Leads by their average call score, and how many of each band were sold. */
export function scoreBands(calls: InsightCall[], leads: InsightLead[]): ScoreBand[] {
  const byLead = new Map<string, { sum: number; n: number }>();
  for (const c of calls) {
    if (!c.leadId || c.score == null || !Number.isFinite(c.score)) continue;
    const acc = byLead.get(c.leadId) ?? { sum: 0, n: 0 };
    acc.sum += c.score;
    acc.n += 1;
    byLead.set(c.leadId, acc);
  }
  const outcome = new Map(leads.map((l) => [l.id, l.outcome]));
  const bands = SCORE_BANDS.map((b) => ({ key: b.key, leads: 0, won: 0, lost: 0, open: 0 }));
  for (const [leadId, { sum, n }] of byLead) {
    const o = outcome.get(leadId);
    if (!o) continue;
    const avg = Math.round(sum / n);
    const i = SCORE_BANDS.findIndex((b) => avg >= b.from && avg <= b.to);
    const band = bands[i < 0 ? 0 : i]!;
    band.leads += 1;
    band[o] += 1;
  }
  return bands.map((b) => ({ ...b, conversion: pct(b.won, b.won + b.lost) }));
}

export type StageGap = {
  stage: string;
  /** How often the step was done in calls of leads that were sold / lost, in %. */
  wonRate: number;
  lostRate: number;
  /** wonRate - lostRate: the bigger, the more this step decides the sale. */
  gap: number;
  wonCalls: number;
  lostCalls: number;
};

/**
 * Script steps that were done in the won deals' calls but skipped in the
 * lost ones -- "where the sale is lost". Steps with too few calls on
 * either side are left out, since a rate from one call says nothing.
 */
export function stageGaps(calls: InsightCall[], leads: InsightLead[], minCalls = 3): StageGap[] {
  const outcome = new Map(leads.map((l) => [l.id, l.outcome]));
  const acc = new Map<string, { wonMet: number; won: number; lostMet: number; lost: number }>();
  for (const c of calls) {
    const o = c.leadId ? outcome.get(c.leadId) : undefined;
    if (o !== "won" && o !== "lost") continue;
    // One vote per stage per call: a stage is "done" when any of its steps was.
    const stageMet = new Map<string, boolean>();
    for (const item of c.checklist) {
      const stage = (item.stage || item.step || "").trim();
      if (!stage) continue;
      stageMet.set(stage, (stageMet.get(stage) ?? false) || !!item.met);
    }
    for (const [stage, met] of stageMet) {
      const a = acc.get(stage) ?? { wonMet: 0, won: 0, lostMet: 0, lost: 0 };
      if (o === "won") {
        a.won += 1;
        if (met) a.wonMet += 1;
      } else {
        a.lost += 1;
        if (met) a.lostMet += 1;
      }
      acc.set(stage, a);
    }
  }
  const out: StageGap[] = [];
  for (const [stage, a] of acc) {
    if (a.won < minCalls || a.lost < minCalls) continue;
    const wonRate = pct(a.wonMet, a.won) ?? 0;
    const lostRate = pct(a.lostMet, a.lost) ?? 0;
    out.push({
      stage,
      wonRate,
      lostRate,
      gap: wonRate - lostRate,
      wonCalls: a.won,
      lostCalls: a.lost,
    });
  }
  return out.sort((x, y) => y.gap - x.gap || x.stage.localeCompare(y.stage));
}

export const OBJECTION_KINDS = [
  "price",
  "think",
  "trust",
  "competitor",
  "consult",
  "time",
  "need",
  "other",
] as const;
export type ObjectionKind = (typeof OBJECTION_KINDS)[number];

// Uzbek (Latin and Cyrillic), Russian and English words for each kind.
// Order matters: "o'ylab ko'raman, qimmat" is a price objection first.
const KIND_PATTERNS: [ObjectionKind, RegExp][] = [
  [
    "price",
    /(qimmat|narx|pul|chegirma|arzon|to'lov|tolov|qimmat|дорог|цен|скидк|денег|деньг|price|expensive|discount|қиммат|нарх)/i,
  ],
  [
    "competitor",
    /(boshqa (kurs|joy|kompaniya|markaz)|raqobat|boshqalar|конкурент|у других|в другом|competitor|бошқа)/i,
  ],
  [
    "trust",
    /(ishon|kafolat|natija|sifat|отзыв|гарант|довер|результат|trust|guarantee|review|ишон|кафолат)/i,
  ],
  [
    "consult",
    /(maslahat|oila|turmush|\ber(im)?\b|xotin|ota-?ona|rahbar|direktor|посовет|муж|жен|родител|руковод|consult|spouse|boss|маслаҳат)/i,
  ],
  [
    "think",
    /(o'ylab|oylab|o‘ylab|keyinroq|keyin (aytaman|qo'ng'iroq)|подума|позже|перезвон|think|later|ўйлаб)/i,
  ],
  ["time", /(vaqt(im)? yo'q|band(man)?|ulgurmay|uzoq|некогда|занят|нет времени|time|busy|вақт)/i],
  [
    "need",
    /(kerak emas|kerakmas|qiziq(ma|tir)|не нужн|не интерес|not interested|don't need|керак эмас)/i,
  ],
];

export function objectionKind(text: string): ObjectionKind {
  const s = text.toLowerCase();
  for (const [kind, re] of KIND_PATTERNS) if (re.test(s)) return kind;
  return "other";
}

export type ObjectionAnswer = {
  objection: string;
  response: string;
  ownerId: string | null;
  score: number | null;
  won: boolean;
};

export type ObjectionGroup = {
  kind: ObjectionKind;
  count: number;
  /** Share answered well, in %. */
  handledRate: number;
  /** Of these leads now closed, how many were sold, in % (null: none closed yet). */
  wonRate: number | null;
  /** The team's best answers: answered well, sold first, higher call score first. */
  best: ObjectionAnswer[];
  /** The AI's suggested answer for one this team did not handle. */
  suggestion: string | null;
  /** A few of the clients' own words, to recognise the objection by. */
  samples: string[];
};

export function objectionLibrary(
  calls: InsightCall[],
  leads: InsightLead[],
  bestPerKind = 3,
): ObjectionGroup[] {
  const lead = new Map(leads.map((l) => [l.id, l]));
  type Row = ObjectionAnswer & { handled: boolean; better: string; closed: boolean };
  const groups = new Map<ObjectionKind, Row[]>();
  for (const c of calls) {
    const l = c.leadId ? lead.get(c.leadId) : undefined;
    for (const o of c.objections) {
      const objection = (o.objection ?? "").trim();
      if (!objection) continue;
      const kind = objectionKind(objection);
      const rows = groups.get(kind) ?? [];
      rows.push({
        objection,
        response: (o.managerResponse ?? "").trim(),
        handled: !!o.handled,
        better: (o.betterResponse ?? "").trim(),
        ownerId: l?.ownerId ?? null,
        score: c.score,
        won: l?.outcome === "won",
        closed: l?.outcome === "won" || l?.outcome === "lost",
      });
      groups.set(kind, rows);
    }
  }
  const out: ObjectionGroup[] = [];
  for (const [kind, rows] of groups) {
    const seen = new Set<string>();
    const best = rows
      .filter((r) => r.handled && r.response.length >= 8)
      .sort((a, b) => Number(b.won) - Number(a.won) || (b.score ?? 0) - (a.score ?? 0))
      .filter((r) => {
        const k = r.response.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, bestPerKind)
      .map(({ objection, response, ownerId, score, won }) => ({
        objection,
        response,
        ownerId,
        score,
        won,
      }));
    const closed = rows.filter((r) => r.closed);
    out.push({
      kind,
      count: rows.length,
      handledRate: pct(rows.filter((r) => r.handled).length, rows.length) ?? 0,
      wonRate: pct(closed.filter((r) => r.won).length, closed.length),
      best,
      suggestion:
        rows.find((r) => !r.handled && r.better)?.better ??
        rows.find((r) => r.better)?.better ??
        null,
      samples: [...new Set(rows.map((r) => r.objection))].slice(0, 3),
    });
  }
  return out.sort((a, b) => b.count - a.count);
}
