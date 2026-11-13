// Each Bosh sahifa card's own settings (formula, view, target...), for the
// whole company: kept in its ui_settings (src/lib/ui-settings.ts, "home"),
// set by its super admin / head of sales -- everyone sees the same cards.
import { useCallback } from "react";
import { useUiSettings } from "@/hooks/crm/ui-settings";
import { withHomeCard } from "@/lib/ui-settings";

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
  const { settings: all, save } = useUiSettings();
  const settings = (all.home[cardId] ?? {}) as CardSettings;
  const update = useCallback(
    (patch: CardPatch) => {
      const next = cleanSettings({ ...settings, ...patch });
      void save(withHomeCard(all, cardId, next)).catch(() => undefined);
    },
    [all, save, settings, cardId],
  );
  const reset = useCallback(() => {
    void save(withHomeCard(all, cardId, {})).catch(() => undefined);
  }, [all, save, cardId]);
  const changed = Object.keys(settings).length > 0;
  return { settings, update, reset, changed };
}
