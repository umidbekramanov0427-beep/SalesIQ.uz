// Nazorat → «Xodim vazifalari»: how often a task repeats, the next due time
// of a repeating one, and the deadline quick choices (5CRM's date picker).
// Pure, unit-tested.

export const RECURRENCES = ["once", "daily", "weekly", "monthly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export function nextDue(iso: string, rec: Recurrence): string {
  const d = new Date(iso);
  if (rec === "daily") d.setDate(d.getDate() + 1);
  else if (rec === "weekly") d.setDate(d.getDate() + 7);
  else if (rec === "monthly") d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export const DUE_PRESETS = [
  "m15",
  "m30",
  "h1",
  "today",
  "tomorrow",
  "weekEnd",
  "week",
  "month",
  "year",
] as const;
export type DuePreset = (typeof DUE_PRESETS)[number];

const pad = (n: number) => String(n).padStart(2, "0");
/** A local `YYYY-MM-DDTHH:mm`, the value a datetime-local input takes. */
export const localValue = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function presetDue(p: DuePreset, now = new Date()): string {
  const d = new Date(now);
  d.setSeconds(0, 0);
  switch (p) {
    case "m15":
      d.setMinutes(d.getMinutes() + 15);
      break;
    case "m30":
      d.setMinutes(d.getMinutes() + 30);
      break;
    case "h1":
      d.setHours(d.getHours() + 1);
      break;
    case "today":
      d.setHours(18, 0);
      break;
    case "tomorrow":
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0);
      break;
    case "weekEnd": {
      // This week's Friday 18:00 (next week's when it is already past).
      const add = (5 - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + add);
      d.setHours(18, 0);
      if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 7);
      break;
    }
    case "week":
      d.setDate(d.getDate() + 7);
      break;
    case "month":
      d.setMonth(d.getMonth() + 1);
      break;
    case "year":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return localValue(d);
}
