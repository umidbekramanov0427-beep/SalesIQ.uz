import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Shared popover-menu filter: the platform's one filter shape (.filter-field
// in styles.css) -- an icon, the filter's name above its current value --
// opening a scrollable list of options.
/** The round chevron of a filter card; turns over while its list is open. */
export function FilterChevron() {
  return (
    <span className="filter-field-chev" aria-hidden>
      <ChevronDown />
    </span>
  );
}

export function FilterTile({
  icon: Icon,
  label,
  value,
  active,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  /** Set to something other than "all": the card is tinted. */
  active?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" data-open={open} data-active={!!active} className="filter-field">
          <span className="filter-field-icon">
            <Icon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="filter-field-label block">{label}</span>
            <span className="filter-field-value">{value}</span>
          </span>
          <FilterChevron />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="max-h-80 w-64 overflow-y-auto rounded-xl p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)]"
        onClick={(e) => {
          // A picked option closes the list.
          if ((e.target as HTMLElement).closest(".filter-menu-option")) setOpen(false);
        }}
      >
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
    <button type="button" onClick={onClick} data-active={active} className="filter-menu-option">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && <Check className="h-4 w-4 shrink-0" />}
    </button>
  );
}
