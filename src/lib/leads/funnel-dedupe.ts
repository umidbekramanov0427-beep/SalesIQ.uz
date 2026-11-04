// What to do with a client who comes into a funnel again (5CRM duplicate
// rules, per funnel: pipelines.dedupe_*). Pure, so it is unit-tested; the
// lead intake (lead-intake.server.ts) acts on the answer.

export const DEDUPE_MODES = ["repeat", "merge", "new", "off"] as const;
export type DedupeMode = (typeof DEDUPE_MODES)[number];

export type FunnelDedupeRule = {
  mode: DedupeMode;
  reopenLost: boolean;
  newAfterWon: boolean;
  taskMinutes: number;
};

export const DEFAULT_FUNNEL_RULE: FunnelDedupeRule = {
  mode: "repeat",
  reopenLost: true,
  newAfterWon: true,
  taskMinutes: 15,
};

export type RepeatDecision =
  | { kind: "create" }
  | { kind: "createRepeat" }
  | { kind: "absorb"; tag: boolean; reopen: boolean; taskMinutes: number };

/**
 * existing: the client's lead in this funnel (null = none).
 *  create        a plain new lead
 *  createRepeat  a new lead marked as a repeat (mode "new", or a new purchase
 *                after a won lead)
 *  absorb        the existing lead takes the request (note; tag in "repeat";
 *                reopen a lost lead in "repeat"; task for the owner)
 */
export function decideRepeat(
  rule: FunnelDedupeRule,
  existing: { won: boolean; lost: boolean } | null,
): RepeatDecision {
  if (rule.mode === "off" || !existing) return { kind: "create" };
  if (rule.mode === "new") return { kind: "createRepeat" };
  if (existing.won && rule.newAfterWon) return { kind: "createRepeat" };
  return {
    kind: "absorb",
    tag: rule.mode === "repeat",
    reopen: rule.mode === "repeat" && rule.reopenLost && existing.lost,
    taskMinutes: Math.max(0, Math.min(1440, rule.taskMinutes)),
  };
}

export function asDedupeMode(v: unknown): DedupeMode {
  return (DEDUPE_MODES as readonly string[]).includes(v as string) ? (v as DedupeMode) : "repeat";
}
