// The "baho varag'i" (report card) look of Audio tahlil: a call's 0-100
// score as a school letter, and its rubric checklist as one mark out of 5
// per sales stage. Pure, so it is unit-tested.

export type Grade = "A" | "B" | "C" | "D";

export const GRADES: readonly Grade[] = ["A", "B", "C", "D"];

/** A ≥ 80 · B 60–79 · C 40–59 · D < 40. */
export function gradeOf(score: number): Grade {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

/** The score range a grade filter keeps (inclusive). */
export function gradeRange(grade: Grade): { min: number; max: number } {
  switch (grade) {
    case "A":
      return { min: 80, max: 100 };
    case "B":
      return { min: 60, max: 79.999 };
    case "C":
      return { min: 40, max: 59.999 };
    default:
      return { min: 0, max: 39.999 };
  }
}

export type ChecklistLike = {
  stage?: string | null;
  points?: number | string | null;
  met?: boolean | null;
};

export type StageMark = {
  stage: string;
  /** 0-5, points-weighted; equal weights when the rubric has no points. */
  mark: number;
  /** 0-100, the same share as a percentage. */
  pct: number;
  met: number;
  total: number;
};

/** One mark out of 5 per stage, in the rubric's own stage order. */
export function stageMarks(checklist: readonly ChecklistLike[] | null | undefined): StageMark[] {
  if (!checklist?.length) return [];
  const order: string[] = [];
  const byStage = new Map<string, { pts: number; metPts: number; met: number; total: number }>();
  for (const item of checklist) {
    const stage = (item.stage ?? "").trim() || "—";
    let row = byStage.get(stage);
    if (!row) {
      row = { pts: 0, metPts: 0, met: 0, total: 0 };
      byStage.set(stage, row);
      order.push(stage);
    }
    const p = Number(item.points);
    const weight = Number.isFinite(p) && p > 0 ? p : 1;
    row.pts += weight;
    row.total += 1;
    if (item.met) {
      row.metPts += weight;
      row.met += 1;
    }
  }
  return order.map((stage) => {
    const r = byStage.get(stage)!;
    return {
      stage,
      mark: r.pts > 0 ? Math.round((r.metPts / r.pts) * 5) : 0,
      pct: r.pts > 0 ? Math.round((r.metPts / r.pts) * 100) : 0,
      met: r.met,
      total: r.total,
    };
  });
}

/** How many calls got each grade. */
export function gradeCounts(scores: readonly (number | null | undefined)[]): Record<Grade, number> {
  const out: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const s of scores) if (s != null && Number.isFinite(s)) out[gradeOf(s)] += 1;
  return out;
}

/** "mm:ss" or "h:mm:ss" -> seconds; null when it is not a time. */
export function timestampSeconds(ts: string | null | undefined): number | null {
  const m = /^\[?(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\]?$/.exec((ts ?? "").trim());
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
