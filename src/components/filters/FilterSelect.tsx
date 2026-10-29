import { Children, isValidElement, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { FilterChevron } from "@/components/filters/FilterTile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// A choice filter in the platform's one filter shape (.filter-field in
// styles.css, the same as FilterTile): an icon, the filter's name above its
// current value, and a round chevron. Takes <option> children like a
// <select>, but opens the platform's own list rather than the browser's;
// the first option is "all", so any other value tints the card.
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
  const [open, setOpen] = useState(false);
  const options = Children.toArray(children).flatMap((c) =>
    isValidElement<{ value?: string; children?: ReactNode }>(c)
      ? [{ value: String(c.props.value ?? ""), label: c.props.children }]
      : [],
  );
  const current = options.find((o) => o.value === value) ?? options[0];
  const active = !!options[0] && value !== options[0].value;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-open={open}
          data-active={active}
          aria-label={label}
          className={cn("filter-field", className)}
        >
          <span className="filter-field-icon">
            <Icon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="filter-field-label block">{label}</span>
            <span className="filter-field-value">{current?.label}</span>
          </span>
          <FilterChevron />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="max-h-80 w-[var(--radix-popover-trigger-width)] min-w-56 overflow-y-auto rounded-xl p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)]"
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            data-active={o.value === value}
            onClick={() => {
              onChange(o.value);
              setOpen(false);
            }}
            className="filter-menu-option"
          >
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.value === value && <Check className="h-4 w-4 shrink-0" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// A text filter in the same shape.
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
    <label className={cn("filter-field cursor-text", className)}>
      <span className="filter-field-icon">
        <Icon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="filter-field-label block">{label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="filter-field-value"
        />
      </span>
    </label>
  );
}
