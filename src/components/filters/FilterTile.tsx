import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Shared popover-menu filter tile: an icon + small label + bold current
// value, opening a scrollable list of options. Originally built page-local
// for the Kunlik hisobot / Lid tahlili JAMOA/OPERATOR/VORONKA filters;
// pulled out here so other pages (Dashboard's page-level filter row, and
// future pages) can reuse the same look instead of re-implementing it.
export function FilterTile({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            // Sized to its content, not a fixed box -- w-64 h-14 forced
            // every tile to the same 256x56px rectangle regardless of how
            // short its label/value actually was, which is what made a
            // row of these read as oversized empty boxes. min-w keeps
            // short values (e.g. a number) from looking cramped; max-w
            // caps a long manager/funnel name instead of stretching the
            // tile to fit it (it still truncates).
            "flex h-11 min-w-[136px] max-w-[240px] shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition-colors phone:h-[54px] phone:min-w-0 phone:max-w-none phone:flex-1 phone:basis-[calc(50%-8px)] phone:rounded-2xl",
            open
              ? "border-primary ring-1 ring-primary/40"
              : "border-border bg-surface hover:bg-accent",
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground phone:h-4 phone:w-4" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-subtle">{label}</p>
            <p className="truncate text-[14px] font-bold text-foreground phone:text-[15px] phone:font-semibold">
              {value}
            </p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle phone:h-4 phone:w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-64 overflow-y-auto p-1">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function TileOption({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors",
        active ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}
