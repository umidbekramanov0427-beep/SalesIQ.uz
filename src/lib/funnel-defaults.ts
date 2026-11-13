// The stages a new funnel opens with, as in amoCRM / 5CRM: an "unsorted"
// first stage, the working stages, then the two closing stages -- a won sale
// and closed-not-sold. The closing stages are system stages: the board shows
// them only as drop zones at the bottom while a lead is dragged (PipelineBoard)
// and Voronka sozlamalari never lets them be deleted (PipelineEditor).

export type DefaultStage = {
  /** i18n key of the stage name. */
  nameKey: string;
  color: string;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  stage_value: "new" | "in_work" | "expected" | "sale" | "refused";
};

export const DEFAULT_FUNNEL_STAGES: readonly DefaultStage[] = [
  {
    nameKey: "fs.def.unsorted",
    color: "#64748b",
    probability: 5,
    is_won: false,
    is_lost: false,
    stage_value: "new",
  },
  {
    nameKey: "fs.def.firstContact",
    color: "#3b82f6",
    probability: 15,
    is_won: false,
    is_lost: false,
    stage_value: "in_work",
  },
  {
    nameKey: "fs.def.negotiation",
    color: "#f59e0b",
    probability: 35,
    is_won: false,
    is_lost: false,
    stage_value: "in_work",
  },
  {
    nameKey: "fs.def.decision",
    color: "#8b5cf6",
    probability: 55,
    is_won: false,
    is_lost: false,
    stage_value: "expected",
  },
  {
    nameKey: "fs.def.contract",
    color: "#06b6d4",
    probability: 80,
    is_won: false,
    is_lost: false,
    stage_value: "expected",
  },
  {
    nameKey: "fs.def.won",
    color: "#22c55e",
    probability: 100,
    is_won: true,
    is_lost: false,
    stage_value: "sale",
  },
  {
    nameKey: "fs.def.lost",
    color: "#94a3b8",
    probability: 0,
    is_won: false,
    is_lost: true,
    stage_value: "refused",
  },
];

/** A closing stage (a sale or closed-not-sold): no board column, never deleted. */
export const isClosingStage = (s: { is_won: boolean; is_lost: boolean }) => s.is_won || s.is_lost;

/**
 * Which of the default stages a funnel still lacks: all of them for an empty
 * funnel, else only the closing stages it has none of (older funnels made
 * before new funnels came with stages).
 */
export function missingDefaultStages(
  existing: readonly { is_won: boolean; is_lost: boolean }[],
): DefaultStage[] {
  if (existing.length === 0) return [...DEFAULT_FUNNEL_STAGES];
  const hasWon = existing.some((s) => s.is_won);
  const hasLost = existing.some((s) => s.is_lost);
  return DEFAULT_FUNNEL_STAGES.filter((d) => (d.is_won && !hasWon) || (d.is_lost && !hasLost));
}

/** The rows to insert into pipeline_stages for `defs`, numbered from `from`. */
export function defaultStageRows(
  defs: readonly DefaultStage[],
  t: (key: string) => string,
  at: { organization_id: string; pipeline_id: string; pipeline_name: string; from: number },
) {
  return defs.map((d, i) => ({
    name: t(d.nameKey),
    key: `custom-${crypto.randomUUID()}`,
    organization_id: at.organization_id,
    pipeline_id: at.pipeline_id,
    pipeline_name: at.pipeline_name,
    color: d.color,
    probability: d.probability,
    position: at.from + i,
    is_won: d.is_won,
    is_lost: d.is_lost,
    stage_value: d.stage_value,
  }));
}
