// The platform's small set of icon colors. One place, so the sidebar, page
// headers and cards all give the same section the same color.
export type CardTone = "primary" | "emerald" | "sky" | "violet" | "amber" | "rose" | "slate";

/** Icon glyph color alone (sidebar items, inline icons). */
export const TONE_TEXT: Record<CardTone, string> = {
  primary: "text-primary",
  emerald: "text-emerald-600 dark:text-emerald-400",
  sky: "text-sky-600 dark:text-sky-400",
  violet: "text-violet-600 dark:text-violet-400",
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
  slate: "text-slate-600 dark:text-slate-300",
};

/** Soft tile behind an icon (IconTile). */
export const TONE_TILE: Record<CardTone, string> = {
  primary: "bg-primary/12 text-primary",
  emerald: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  sky: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  slate: "bg-muted text-foreground",
};
