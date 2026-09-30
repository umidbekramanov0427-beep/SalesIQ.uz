import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// The shared card shape every filter on the platform now uses: a leading
// icon, a small uppercase label naming what the filter is (not just its
// current value), the value itself in bold underneath, and a trailing
// chevron -- the same two-line tile shape as Kunlik hisobot / Lid tahlili's
// JAMOA/OPERATOR/VORONKA filters (see FilterTile), applied here so a plain
// <select>-backed filter reads identically instead of the platform having
// two different filter shapes side by side.
export function FilterSelect({
  icon: Icon,
  label,
  value,
  onChange,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-9 w-32 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-1 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40 hover:bg-accent sm:h-11 sm:w-56 sm:gap-2 sm:px-2.5 sm:py-1.5",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground sm:h-3.5 sm:w-3.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[8px] font-bold uppercase leading-tight tracking-wide text-subtle sm:text-[9px]">
          {label}
        </p>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full cursor-pointer appearance-none truncate bg-transparent text-[11px] font-bold leading-tight text-foreground outline-none sm:text-[13px]"
        >
          {children}
        </select>
      </div>
      <ChevronDown className="h-3 w-3 shrink-0 text-subtle sm:h-3.5 sm:w-3.5" />
    </div>
  );
}

// The matching tile-shaped search input, so a text filter sits visually
// consistent next to FilterSelect tiles instead of a differently-shaped
// plain rectangle.
export function FilterSearchInput({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-9 w-32 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-1 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40 sm:h-11 sm:w-56 sm:gap-2 sm:px-2.5 sm:py-1.5",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground sm:h-3.5 sm:w-3.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[8px] font-bold uppercase leading-tight tracking-wide text-subtle sm:text-[9px]">
          {label}
        </p>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[11px] font-bold leading-tight text-foreground outline-none placeholder:text-subtle placeholder:font-normal sm:text-[13px]"
        />
      </div>
    </div>
  );
}
