// Funnel stage colors: one palette of clearly different hues, so stages
// next to each other never look alike, and a new stage always gets a color
// none of its siblings has.

export const STAGE_PALETTE = [
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#84cc16", // lime
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#eab308", // yellow
  "#a855f7", // purple
  "#0ea5e9", // sky
  "#f43f5e", // rose
  "#22c55e", // green
  "#d946ef", // fuchsia
  "#78716c", // stone
  "#b45309", // brown
  "#64748b", // slate
] as const;

/**
 * The stage menu's 30 swatches in 5CRM's order: light, pastel, warm and
 * muted tones on top, the deep ones under them. New stages still take their
 * colour from STAGE_PALETTE (the 20 that tell neighbours apart best).
 */
export const STAGE_SWATCHES = [
  "#c4c4cc",
  "#93c5fd",
  "#7dd3fc",
  "#a78bfa",
  "#f0abfc",
  "#f5d0fe",
  "#86efac",
  "#5eead4",
  "#fef08a",
  "#fcd34d",
  "#fdba74",
  "#fca5a5",
  "#ef4444",
  "#d9f99d",
  "#94a3b8",
  "#1d4ed8",
  "#4338ca",
  "#6d28d9",
  "#a21caf",
  "#be185d",
  "#b91c1c",
  "#c2410c",
  "#b45309",
  "#4d7c0f",
  "#15803d",
  "#0f766e",
  "#0e7490",
  "#475569",
  "#92400e",
  "#9f1239",
] as const;

const norm = (c: string | null | undefined) => (c ?? "").trim().toLowerCase();

/** The first palette color none of `used` has (after all 20, the least used one). */
export function nextStageColor(used: (string | null | undefined)[]): string {
  const taken = used.map(norm);
  const free = STAGE_PALETTE.find((c) => !taken.includes(c));
  if (free) return free;
  let best: string = STAGE_PALETTE[0];
  let bestCount = Infinity;
  for (const c of STAGE_PALETTE) {
    const n = taken.filter((t) => t === c).length;
    if (n < bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

/** True when two or more stages share a color. */
export function hasRepeatedColors(colors: (string | null | undefined)[]): boolean {
  const seen = new Set<string>();
  for (const c of colors.map(norm)) {
    if (!c) continue;
    if (seen.has(c)) return true;
    seen.add(c);
  }
  return false;
}

/** A distinct color for each of `count` stages, in palette order. */
export function spreadStageColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => STAGE_PALETTE[i % STAGE_PALETTE.length]!);
}

export function isHexColor(v: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(v);
}
