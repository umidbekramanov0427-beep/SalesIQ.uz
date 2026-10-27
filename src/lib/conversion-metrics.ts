// The Konversiya tab's four conversion rates, from lead counts per stage.
// Stage roles come from the stage's own name (amoCRM pipelines are named by
// each company), so the same keyword lists work across funnels. Pure, so it
// is unit-tested.

export type ConversionStage = {
  id: string;
  name: string;
  pipeline_name: string | null;
  position: number;
  is_won: boolean;
  is_lost: boolean;
};

export type StageRole =
  | "full" // To'liq to'lov / won
  | "partial" // Predoplata, yarim to'lov
  | "wrongNumber" // Raqami yo'q / xato raqam
  | "unreachable" // Bog'lanib bo'lmadi / javob bermadi
  | "new" // the pipeline's first stage, not worked yet
  | "lost"
  | "open";

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’ʼ`‘]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const has = (name: string, words: string[]) => words.some((w) => name.includes(w));

const FULL = ["toliq", "won", "успешно", "rop closed", "полная оплата"];
const PARTIAL = ["predoplata", "peredoplata", "предоплата", "yarim", "частичн", "половин"];
const WRONG_NUMBER = [
  "raqami yoq",
  "raqam yoq",
  "raqam xato",
  "raqami xato",
  "xato raqam",
  "notogri raqam",
  "неверный номер",
  "нет номера",
  "номер не существует",
  "wrong number",
];
const UNREACHABLE = [
  "boglanib bolmadi",
  "boglanilmadi",
  "boglana olmadik",
  "javob bermadi",
  "kotarmadi",
  "kotarmayapti",
  "недозвон",
  "не дозвон",
  "не берет",
  "не берёт",
  "не отвечает",
  "no answer",
  "unreachable",
];
const NEW = ["yangi", "неразобран", "новый", "новая", "new lead", "incoming"];

/** What a stage means for the conversion rates. `first` = the pipeline's first stage. */
export function stageRole(stage: ConversionStage, first: boolean): StageRole {
  const name = normalizeName(stage.name);
  if (stage.is_won || has(name, FULL)) return "full";
  if (has(name, PARTIAL)) return "partial";
  if (has(name, WRONG_NUMBER)) return "wrongNumber";
  if (has(name, UNREACHABLE)) return "unreachable";
  if (stage.is_lost) return "lost";
  if (first || has(name, NEW)) return "new";
  return "open";
}

/** Every stage's role; the first stage of each pipeline counts as "new". */
export function stageRoles(stages: ConversionStage[]): Map<string, StageRole> {
  const firstPos = new Map<string, number>();
  for (const s of stages) {
    if (s.is_won || s.is_lost) continue;
    const key = s.pipeline_name ?? "";
    const cur = firstPos.get(key);
    if (cur === undefined || s.position < cur) firstPos.set(key, s.position);
  }
  return new Map(
    stages.map((s) => [
      s.id,
      stageRole(s, !s.is_won && !s.is_lost && firstPos.get(s.pipeline_name ?? "") === s.position),
    ]),
  );
}

export type Rate = { num: number; den: number; pct: number };

export type ConversionMetrics = {
  /** Sales (partial or full payment) out of every lead. */
  overall: Rate;
  /** Sales out of leads that aren't "no number" or lost. */
  qualified: Rate;
  /** Sales out of leads actually reached: not wrong number, new or unreachable. */
  connected: Rate;
  /** Full payment out of leads at prepayment / half payment / full payment. */
  partialToFull: Rate;
  /** Stage names behind each exclusion, so the card can say what it left out. */
  names: Record<"wrongNumber" | "unreachable" | "new" | "lost" | "partial" | "full", string[]>;
};

const rate = (num: number, den: number): Rate => ({
  num,
  den,
  pct: den > 0 ? Math.round((num / den) * 1000) / 10 : 0,
});

export function conversionMetrics(
  counts: { stage_id: string | null; n: number }[],
  stages: ConversionStage[],
): ConversionMetrics {
  const roles = stageRoles(stages);
  const byRole: Record<StageRole, number> = {
    full: 0,
    partial: 0,
    wrongNumber: 0,
    unreachable: 0,
    new: 0,
    lost: 0,
    open: 0,
  };
  let total = 0;
  for (const c of counts) {
    total += c.n;
    const role = (c.stage_id && roles.get(c.stage_id)) || "open";
    byRole[role] += c.n;
  }
  const sales = byRole.full + byRole.partial;
  const names: ConversionMetrics["names"] = {
    wrongNumber: [],
    unreachable: [],
    new: [],
    lost: [],
    partial: [],
    full: [],
  };
  const seen = new Set<string>();
  for (const s of stages) {
    const role = roles.get(s.id);
    if (!role || role === "open") continue;
    const key = `${role}:${s.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    names[role].push(s.name);
  }
  return {
    overall: rate(sales, total),
    qualified: rate(sales, total - byRole.wrongNumber - byRole.lost),
    connected: rate(sales, total - byRole.wrongNumber - byRole.new - byRole.unreachable),
    partialToFull: rate(byRole.full, byRole.partial + byRole.full),
    names,
  };
}
