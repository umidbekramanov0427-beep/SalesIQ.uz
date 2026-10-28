// The date filter's presets as pure functions, so a saved "Oxirgi 7 kun"
// means the last 7 days whenever the page is opened again, not the dates
// it covered on the day it was saved.

export const DATE_PRESET_KEYS = ["today", "yesterday", "7d", "month", "all"] as const;
export type DatePresetKey = (typeof DATE_PRESET_KEYS)[number];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** The range a preset covers today; null for "all time". */
export function datePresetRange(
  key: string,
  now: Date = new Date(),
): { from: Date; to: Date } | null {
  const daysBack = (n: number) => {
    const from = new Date(now);
    from.setDate(from.getDate() - n);
    return { from: startOfDay(from), to: endOfDay(now) };
  };
  switch (key) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return { from: startOfDay(d), to: endOfDay(d) };
    }
    case "7d":
      return daysBack(6);
    case "month":
      return daysBack(29);
    default:
      return null;
  }
}
