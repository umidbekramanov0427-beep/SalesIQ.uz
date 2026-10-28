import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// A <select>-backed filter in the platform's one filter shape (.filter-field
// in styles.css, the same as FilterTile): an icon, the filter's name above
// its current value, and a chevron.
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
    <label className={cn("filter-field cursor-pointer", className)}>
      <span className="filter-field-icon">
        <Icon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="filter-field-label block">{label}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="filter-field-value cursor-pointer appearance-none"
        >
          {children}
        </select>
      </span>
      <ChevronDown className="filter-field-chev" />
    </label>
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
