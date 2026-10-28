import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Shared popover-menu filter: the platform's one filter shape (.filter-field
// in styles.css) -- an icon, the filter's name above its current value --
// opening a scrollable list of options.
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
        <button type="button" data-open={open} className="filter-field">
          <span className="filter-field-icon">
            <Icon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="filter-field-label block">{label}</span>
            <span className="filter-field-value">{value}</span>
          </span>
          <ChevronDown className="filter-field-chev" />
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
