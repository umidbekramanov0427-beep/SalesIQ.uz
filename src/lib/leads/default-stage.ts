// Where a lead that arrives without a stage of its own (a salesbot link, a
// Mini App request, a form with no stage set) lands. The "new" stage when
// the company has one; otherwise the first stage of its busiest own funnel
// -- companies that built their funnels by hand have no "new" key, and a
// lead with no stage at all shows up nowhere on the board.

export type StageCandidate = {
  id: string;
  pipeline_name: string | null;
  position: number | null;
  key: string | null;
};

const funnelOf = (s: StageCandidate) => s.pipeline_name ?? "";

/** `counts` = leads per funnel name; a tie goes to the funnel whose stages come first. */
export function pickDefaultStage(
  stages: StageCandidate[],
  counts: Record<string, number>,
): StageCandidate | null {
  const keyed = stages.find((s) => s.key === "new");
  if (keyed) return keyed;
  const ordered = [...stages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const first = ordered[0];
  if (!first) return null;
  let funnel = funnelOf(first);
  for (const s of ordered) {
    if ((counts[funnelOf(s)] ?? 0) > (counts[funnel] ?? 0)) funnel = funnelOf(s);
  }
  return ordered.find((s) => funnelOf(s) === funnel) ?? first;
}
