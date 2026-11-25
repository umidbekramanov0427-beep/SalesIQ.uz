import { defaultHints } from "@/lib/stage-hints";

// The stages a new funnel opens with, as in amoCRM (Неразобранное,
// Первичный контакт, Переговоры, Принимают решение, Успешно / Закрыто): an "unsorted"
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
    color: "#eab308",
    probability: 35,
    is_won: false,
    is_lost: false,
    stage_value: "in_work",
  },
  {
    nameKey: "fs.def.decision",
    color: "#f97316",
    probability: 55,
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
  return defs.map((d, i) => {
    const hints = d.is_won || d.is_lost ? null : defaultHints(d.nameKey.split(".").pop() ?? "", t);
    return {
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
      // The stage's ready-made hints for new / experienced / other staff.
      ...(hints
        ? { hint: hints.master, hint_novice: hints.novice, hint_experienced: hints.experienced }
        : {}),
    };
  });
}

/**
 * Inserts stage rows one by one; before 20270201 (no hint_novice /
 * hint_experienced columns yet) a row is retried without those two.
 */
export async function createStageRows<R extends Record<string, unknown>>(
  rows: R[],
  create: (row: R) => Promise<unknown>,
): Promise<void> {
  for (const row of rows) {
    try {
      await create(row);
    } catch (err) {
      const msg = String((err as { message?: unknown })?.message ?? err);
      if (!/hint_(novice|experienced)/.test(msg)) throw err;
      const { hint_novice: _n, hint_experienced: _e, ...rest } = row;
      await create(rest as R);
    }
  }
}
