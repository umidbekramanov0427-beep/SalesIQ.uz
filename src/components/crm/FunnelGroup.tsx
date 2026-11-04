import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageRow } from "@/hooks/use-crm-data";

// One funnel in a list of funnels and their stages (filters, stage pickers,
// bulk actions, stage rules). Collapsed by default -- an amoCRM account can
// have dozens of funnels -- with the funnel's name and a count on the row,
// and its stages opening under it. The funnel holding the current or picked
// stage is passed `defaultOpen`.

/** The stages grouped by funnel ("Direct Sales" for the CRM's own), in board order. */
export function groupStagesByFunnel(stages: StageRow[]): [string, StageRow[]][] {
  const map = new Map<string, StageRow[]>();
  for (const s of [...stages].sort((a, b) => a.position - b.position)) {
    const key = s.pipeline_name || "Direct Sales";
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  return [...map];
}

export function FunnelGroup({
  name,
  meta,
  lead,
  defaultOpen = false,
  variant = "plain",
  children,
}: {
  name: string;
  /** Right side of the row: a count, "2 / 7", a chip. */
  meta?: ReactNode;
  /** Before the name, e.g. a checkbox that picks the whole funnel. */
  lead?: ReactNode;
  defaultOpen?: boolean;
  /** "plain" inside a popover or list, "card" as a page section. */
  variant?: "plain" | "card";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={cn(
        variant === "card" && "rounded-2xl border border-border bg-card shadow-soft",
        variant === "plain" && "rounded-lg",
      )}
    >
      <div
        className={cn("flex items-center gap-2", variant === "card" ? "px-4 py-3" : "px-1 py-0.5")}
      >
        {lead}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md text-left transition-colors hover:text-primary",
            variant === "card" ? "py-1" : "px-1 py-1",
          )}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-semibold text-foreground",
              variant === "card" ? "text-[15px]" : "text-[13px]",
            )}
          >
            {name}
          </span>
          {meta != null && (
            <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-muted-foreground">
              {meta}
            </span>
          )}
        </button>
      </div>
      {open && (
        <div className={cn(variant === "card" ? "border-t border-border px-4 py-3" : "pb-1 pl-6")}>
          {children}
        </div>
      )}
    </div>
  );
}
