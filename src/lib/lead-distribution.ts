// "Lid taqsimlash": which leads of a stage to hand out and to whom. Pure
// functions over the stage's leads in board order (the order the ROP sees
// in the column), so the picture in the window is exactly what gets moved.

export const PICK_PATTERNS = [
  "start",
  "everyOtherStart",
  "startMiddleEnd",
  "middle",
  "end",
  "everyOtherMiddle",
  "everyOtherEnd",
] as const;
export type PickPattern = (typeof PICK_PATTERNS)[number];

/**
 * Positions (0-based, ascending) of the leads a pattern picks from a column
 * of `total` leads. Fewer than `count` come back only when the column is too
 * short for the pattern (e.g. every second lead of 7 gives at most 4).
 */
export function pickIndices(total: number, count: number, pattern: PickPattern): number[] {
  const n = Math.max(0, Math.min(Math.floor(count), total));
  if (n === 0) return [];
  const range = (from: number, len: number) => Array.from({ length: len }, (_, i) => from + i);
  const everyOther = (from: number) => {
    const out: number[] = [];
    for (let i = from; i < total && out.length < n; i += 2) out.push(i);
    return out;
  };
  switch (pattern) {
    case "start":
      return range(0, n);
    case "end":
      return range(total - n, n);
    case "middle":
      return range(Math.floor((total - n) / 2), n);
    case "everyOtherStart":
      return everyOther(0);
    case "everyOtherEnd": {
      const out: number[] = [];
      for (let i = total - 1; i >= 0 && out.length < n; i -= 2) out.push(i);
      return out.reverse();
    }
    case "everyOtherMiddle": {
      // A window of 2n-1 positions centred on the column, every second one.
      const span = 2 * n - 1;
      return everyOther(Math.max(0, Math.floor((total - span) / 2)));
    }
    case "startMiddleEnd": {
      if (n >= total) return range(0, total);
      // Split as evenly as possible: the start gets any remainder first.
      const a = Math.ceil(n / 3);
      const c = Math.floor((n - a) / 2);
      const b = n - a - c;
      const head = range(0, a);
      const tail = range(total - c, c);
      // The middle block is centred in what lies between head and tail.
      const gapStart = a;
      const gapLen = total - a - c;
      const mid = range(gapStart + Math.floor((gapLen - b) / 2), b);
      return [...head, ...mid, ...tail];
    }
  }
}

/** Picks the leads themselves, keeping the column's order. */
export function pickLeads<T>(list: T[], count: number, pattern: PickPattern): T[] {
  return pickIndices(list.length, count, pattern).map((i) => list[i]!);
}

/**
 * Deals `items` out to `people` in turn (1st to the first person, 2nd to the
 * second, ...), so everyone gets the same number, give or take one, and a
 * mix from the whole selection rather than one solid block.
 */
export function dealOut<T>(items: T[], people: string[]): Map<string, T[]> {
  const out = new Map<string, T[]>(people.map((p) => [p, []]));
  if (people.length === 0) return out;
  items.forEach((item, i) => out.get(people[i % people.length]!)!.push(item));
  return out;
}

export type BoardSortBy = "lastMessage" | "lastEvent" | "created" | "name" | "amount" | "score";

type Sortable = {
  lastContactIso: string | null;
  updatedAtIso: string | null;
  createdAtIso: string;
  company: string;
  name: string;
  budget: number;
  expectedRevenue: number;
  score?: number;
};

/** The funnel board's column order (newest first by default). */
export function sortLikeBoard<T extends Sortable>(items: T[], sortBy: BoardSortBy): T[] {
  const sorted = [...items];
  const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
  if (sortBy === "lastMessage") {
    sorted.sort((a, b) => time(b.lastContactIso) - time(a.lastContactIso));
  } else if (sortBy === "lastEvent") {
    sorted.sort((a, b) => time(b.updatedAtIso) - time(a.updatedAtIso));
  } else if (sortBy === "name") {
    sorted.sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name));
  } else if (sortBy === "score") {
    // Hottest first (AI lead score); ties by the latest message.
    sorted.sort(
      (a, b) => (b.score ?? 0) - (a.score ?? 0) || time(b.lastContactIso) - time(a.lastContactIso),
    );
  } else if (sortBy === "amount") {
    sorted.sort((a, b) => (b.budget || b.expectedRevenue) - (a.budget || a.expectedRevenue));
  } else {
    sorted.sort((a, b) => time(b.createdAtIso) - time(a.createdAtIso));
  }
  return sorted;
}

// "Lidlarga xabar yuborish": each step takes one slice of a stage's column --
// the first N leads, or the 1st / 2nd / 3rd / any group of N (leads 1-N,
// N+1-2N, ...).
export const STEP_PICKS = ["first", "g1", "g2", "g3", "gN"] as const;
export type StepPick = (typeof STEP_PICKS)[number];

/** The slice [start, end) of a column of `total` leads a step takes. */
export function stepRange(
  total: number,
  pick: StepPick,
  size: number,
  groupN = 1,
): { start: number; end: number } {
  const n = Math.max(1, Math.floor(size) || 1);
  const group =
    pick === "first" || pick === "g1"
      ? 1
      : pick === "g2"
        ? 2
        : pick === "g3"
          ? 3
          : Math.max(1, Math.floor(groupN) || 1);
  const start = Math.min(total, (group - 1) * n);
  return { start, end: Math.min(total, start + n) };
}
