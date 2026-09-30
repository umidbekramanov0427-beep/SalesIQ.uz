import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// pipeline_stages.color holds two different formats depending on where the
// stage came from: a Tailwind class name (e.g. "bg-primary") for stages
// created by hand in Settings, or a real hex value straight from AmoCRM's
// own status color (e.g. "#fffeb2") for AmoCRM-synced stages -- so every
// stage badge/dot/option needs to render whichever one it actually got.
export function stageColorProps(color: string | null | undefined): {
  className?: string;
  style?: { backgroundColor: string };
} {
  if (!color) return {};
  return color.startsWith("#") ? { style: { backgroundColor: color } } : { className: color };
}

// Every Tailwind class name pipeline_stages.color can actually hold --
// admin.pipelines.tsx's own COLOR_SWATCHES plus client.server.ts's
// STAGE_COLOR_ROTATION for AmoCRM-synced stages that arrive with no status
// color of their own -- mapped to its own ~10%-opacity tint. Written out
// as literal strings (not built with a template at runtime) so Tailwind's
// scanner picks up every one of these classes from this file alone.
const STAGE_TINT_CLASS: Record<string, string> = {
  "bg-primary": "bg-primary/10",
  "bg-info": "bg-info/10",
  "bg-chart-1": "bg-chart-1/10",
  "bg-chart-2": "bg-chart-2/10",
  "bg-chart-3": "bg-chart-3/10",
  "bg-chart-4": "bg-chart-4/10",
  "bg-chart-5": "bg-chart-5/10",
  "bg-success": "bg-success/10",
  "bg-warning": "bg-warning/10",
  "bg-destructive": "bg-destructive/10",
  "bg-mint-border": "bg-mint-border/10",
};

// A soft tint of a stage's own configured color, for a settings row's
// background -- so a stage reads as "this color" at a glance instead of
// every row sitting on the same plain surface fill with only a small dot
// hinting at the color underneath.
export function stageTintProps(color: string | null | undefined): {
  className?: string;
  style?: { backgroundColor: string };
} {
  if (!color) return {};
  if (color.startsWith("#")) {
    // Appends an alpha channel to a 6-digit hex (#RRGGBB -> #RRGGBBAA) --
    // ~10% opacity, same target as the Tailwind-class tints above.
    return { style: { backgroundColor: `${color}1a` } };
  }
  const tint = STAGE_TINT_CLASS[color];
  return tint ? { className: tint } : {};
}

// Full-saturation LEFT-border-color counterpart to STAGE_TINT_CLASS, same
// literal-strings-for-Tailwind's-scanner reasoning. A percentage-alpha
// background tint reads fine on a dark surface but several stage colors
// (light chart hues especially) become nearly invisible against the
// light-theme page background at the same 10% -- a solid, full-color
// accent stripe doesn't have that problem in either theme, so the Kanban
// board leans on this (paired with border-l-4) for "which color is this
// column" instead of relying on the tint alone.
const STAGE_BORDER_CLASS: Record<string, string> = {
  "bg-primary": "border-l-primary",
  "bg-info": "border-l-info",
  "bg-chart-1": "border-l-chart-1",
  "bg-chart-2": "border-l-chart-2",
  "bg-chart-3": "border-l-chart-3",
  "bg-chart-4": "border-l-chart-4",
  "bg-chart-5": "border-l-chart-5",
  "bg-success": "border-l-success",
  "bg-warning": "border-l-warning",
  "bg-destructive": "border-l-destructive",
  "bg-mint-border": "border-l-mint-border",
};

export function stageBorderProps(color: string | null | undefined): {
  className?: string;
  style?: { borderLeftColor: string };
} {
  if (!color) return {};
  if (color.startsWith("#")) return { style: { borderLeftColor: color } };
  const cls = STAGE_BORDER_CLASS[color];
  return cls ? { className: cls } : {};
}

// Supabase client errors (PostgrestError) carry a `.message` string but
// aren't `instanceof Error` — a bare `err instanceof Error` check (the
// pattern used all over this codebase's catch blocks) silently swaps the
// real reason for a generic fallback on every DB-originated failure. Use
// this wherever a caught error reaches the user (toasts, etc).
export function describeError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

/** Color-codes a role badge consistently everywhere a role Pill is shown. */
export function roleTone(role: string): "gold" | "blue" | "success" | "danger" | "neutral" {
  switch (role) {
    case "super_admin":
      return "gold";
    case "rop":
      return "blue";
    case "sotuv_menejeri":
      return "success";
    case "platform_owner":
      return "danger";
    default:
      return "neutral";
  }
}

/** "2h ago", "Yesterday", "3 days ago" — used across CRM list/detail views. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

/** "8 Aug 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** "Today, 15:00" / "Tomorrow, 11:30" / "8 Aug, 10:00" */
export function formatFollowUp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(d);
  const dayDiff = Math.round((d.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / 86400000);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  return `${formatDate(iso)}, ${time}`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "—";
}
