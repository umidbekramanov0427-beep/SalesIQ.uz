// Each Bosh sahifa card's own settings (formula, view, target...), per
// person, kept in this browser like the page's saved filters. One small
// store so every card re-renders when any of them changes.
import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";

export type CardView = "card" | "chart" | "list";

/** Everything any card may keep; each card reads only its own keys. */
export type CardSettings = {
  formula?: string;
  view?: string;
  /** Compare against the period before (default on). */
  compare?: boolean;
  /** Goal for the number; colours it and draws a progress bar. */
  target?: number | null;
  group?: "auto" | "day" | "week" | "month";
  showDeals?: boolean;
  limit?: number;
  filter?: string;
  hide?: string[];
  /** A percent the card's formula uses (e.g. expected conversion). */
  rate?: number;
};

/** A change: undefined (or null) puts that setting back to its default. */
export type CardPatch = { [K in keyof CardSettings]?: CardSettings[K] | undefined };

type All = Record<string, CardSettings>;

const listeners = new Set<() => void>();
const cache = new Map<string, All>();
const EMPTY: All = {};

function read(key: string): All {
  const hit = cache.get(key);
  if (hit) return hit;
  let v: All = EMPTY;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) v = JSON.parse(raw) as All;
  } catch {
    v = EMPTY;
  }
  cache.set(key, v);
  return v;
}

function write(key: string, v: All) {
  cache.set(key, v);
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // Private mode or full storage: the setting still applies until reload.
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Drops keys equal to the default, so "reset" and an untouched card look alike. */
export function cleanSettings(s: CardPatch): CardSettings {
  const out: CardSettings = {};
  for (const [k, v] of Object.entries(s) as [keyof CardSettings, unknown][]) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && !v.length) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function useCardSettings(cardId: string) {
  const { user } = useAuth();
  const key = `salesiq.home.cards.v1.${user?.id ?? "anon"}`;
  const all = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY,
  );
  const settings = all[cardId] ?? {};
  const update = useCallback(
    (patch: CardPatch) => {
      const cur = read(key);
      const next = cleanSettings({ ...(cur[cardId] ?? {}), ...patch });
      const rest = { ...cur };
      if (Object.keys(next).length) rest[cardId] = next;
      else delete rest[cardId];
      write(key, rest);
    },
    [key, cardId],
  );
  const reset = useCallback(() => {
    const rest = { ...read(key) };
    delete rest[cardId];
    write(key, rest);
  }, [key, cardId]);
  const changed = Object.keys(settings).length > 0;
  return { settings, update, reset, changed };
}
