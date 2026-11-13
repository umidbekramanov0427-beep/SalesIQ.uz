import { useSyncExternalStore } from "react";
import type { Tip } from "./tips";

// The explainers (!) on cards, pages and menu items are a few hundred
// texts in three languages, so they live in their own chunk (tips.ts),
// fetched once the app is idle or when the first "!" is hovered.

let TIPS: Record<string, Tip> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function loadTips(): Promise<void> {
  if (TIPS) return Promise.resolve();
  loading ??= import("./tips").then((m) => {
    TIPS = m.TIPS;
    for (const l of listeners) l();
  });
  return loading;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The explainers once loaded (null until then). */
export function useTips(): Record<string, Tip> | null {
  return useSyncExternalStore(
    subscribe,
    () => TIPS,
    () => null,
  );
}

/** The first of these keys that has an explainer. */
export function pickTip(
  tips: Record<string, Tip> | null,
  keys: (string | undefined | null)[],
): Tip | null {
  if (!tips) return null;
  for (const k of keys) if (k && tips[k]) return tips[k]!;
  return null;
}
