import type { StageRow } from "@/hooks/use-crm-data";

// A funnel stage's "value" (Voronka sozlamalari): what reaching it means for
// the money, set per stage. Stages saved before the column existed (or left
// unset) get their meaning from what they are: won = sale, lost = refused,
// the first stage = a new incoming lead, the rest = in work.

export const STAGE_VALUES = ["new", "in_work", "expected", "advance", "sale", "refused"] as const;
export type StageValue = (typeof STAGE_VALUES)[number];

/** A stage's value as set, or what it means by default. */
export function stageValueOf(
  s: Pick<StageRow, "is_won" | "is_lost" | "position"> & {
    stage_value?: string | null;
    counts_as_won_override?: boolean | null;
    counts_as_lost_override?: boolean | null;
  },
): StageValue {
  if (s.stage_value && (STAGE_VALUES as readonly string[]).includes(s.stage_value))
    return s.stage_value as StageValue;
  if (s.counts_as_won_override) return "sale";
  if (s.counts_as_lost_override) return "refused";
  if (s.is_won) return "sale";
  if (s.is_lost) return "refused";
  return s.position === 0 ? "new" : "in_work";
}

/**
 * What the reports read for a stage's value: «Sotuv» counts its leads as won
 * and «Rad etildi» as lost (counts_as_*_override, read by Analitika,
 * finance, marketing, fines and the weekly report); any other value on a
 * won / lost stage stops it counting as such; otherwise the stage's own
 * won / lost flag decides (null).
 */
export function stageValueOverrides(
  s: { is_won: boolean; is_lost: boolean },
  v: StageValue,
): { counts_as_won_override: boolean | null; counts_as_lost_override: boolean | null } {
  return {
    counts_as_won_override: v === "sale" ? (s.is_won ? null : true) : s.is_won ? false : null,
    counts_as_lost_override: v === "refused" ? (s.is_lost ? null : true) : s.is_lost ? false : null,
  };
}
