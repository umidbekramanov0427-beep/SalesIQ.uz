import type { StageRow } from "@/hooks/use-crm-data";

// A funnel stage's "value" (Voronka sozlamalari): what reaching it means for
// the money, set per stage. Stages saved before the column existed (or left
// unset) get their meaning from what they are: won = sale, lost = refused,
// the first stage = a new incoming lead, the rest = in work.

export const STAGE_VALUES = ["new", "in_work", "expected", "advance", "sale", "refused"] as const;
export type StageValue = (typeof STAGE_VALUES)[number];

/** A stage's value as set, or what it means by default. */
export function stageValueOf(
  s: Pick<StageRow, "is_won" | "is_lost" | "position"> & { stage_value?: string | null },
): StageValue {
  if (s.stage_value && (STAGE_VALUES as readonly string[]).includes(s.stage_value))
    return s.stage_value as StageValue;
  if (s.is_won) return "sale";
  if (s.is_lost) return "refused";
  return s.position === 0 ? "new" : "in_work";
}
