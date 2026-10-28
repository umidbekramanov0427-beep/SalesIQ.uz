// Saved filters: what a person chose on a page, kept in their browser so
// the page opens with it next time ("Saqlash" in the filter bar). Pure, so
// the encoding is unit-tested; the hook is use-saved-filters.ts.
//
// Dates are written as {"$date": iso}. A date filter picked from a preset
// ({preset: "7d", label, from, to}) is written without its dates and gets
// them again on load, so "last 7 days" keeps meaning the last 7 days.

import { datePresetRange } from "@/lib/date-presets";

const VERSION = "v1";

export function savedFiltersKey(userId: string, page: string): string {
  return `salesiq.filters.${VERSION}.${userId}.${page}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

function toJson(v: unknown): unknown {
  if (v instanceof Date) return { $date: v.toISOString() };
  if (Array.isArray(v)) return v.map(toJson);
  if (isPlainObject(v)) {
    const preset = typeof v["preset"] === "string" && v["preset"] !== "custom";
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v).sort()) {
      if (preset && (key === "from" || key === "to")) continue;
      if (v[key] === undefined) continue;
      out[key] = toJson(v[key]);
    }
    return out;
  }
  return v;
}

function fromJson(v: unknown, now: Date): unknown {
  if (Array.isArray(v)) return v.map((x) => fromJson(x, now));
  if (isPlainObject(v)) {
    if (typeof v["$date"] === "string" && Object.keys(v).length === 1) {
      const d = new Date(v["$date"]);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(v)) out[key] = fromJson(value, now);
    if (typeof out["preset"] === "string" && out["preset"] !== "custom") {
      const range = datePresetRange(out["preset"], now);
      out["from"] = range?.from ?? null;
      out["to"] = range?.to ?? null;
    }
    return out;
  }
  return v;
}

/** Stable text for a filter state (also what "has it changed?" compares). */
export function encodeFilters(value: unknown): string {
  return JSON.stringify(toJson(value));
}

/** The saved state, or null when there is none or it can't be read. */
export function decodeFilters<T>(raw: string | null, now: Date = new Date()): T | null {
  if (!raw) return null;
  try {
    return fromJson(JSON.parse(raw), now) as T;
  } catch {
    return null;
  }
}
