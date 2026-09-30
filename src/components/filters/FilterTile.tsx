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
            "flex h-9 w-32 shrink-0 items-center gap-1.5 rounded-xl border px-2 py-1 text-left transition-colors sm:h-14 sm:w-64 sm:gap-2.5 sm:rounded-2xl sm:px-3.5 sm:py-2.5",
            open
              ? "border-primary ring-1 ring-primary/40"
              : "border-border bg-surface hover:bg-accent",
          )}
        >
          <Icon className="h-3 w-3 shrink-0 text-muted-foreground sm:h-4 sm:w-4" />
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-bold uppercase tracking-wide text-subtle sm:text-[10px]">
              {label}
            </p>
            <p className="truncate text-[11px] font-bold text-foreground sm:text-sm">{value}</p>
          </div>
          <ChevronRight className="h-3 w-3 shrink-0 text-subtle sm:h-4 sm:w-4" />
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
