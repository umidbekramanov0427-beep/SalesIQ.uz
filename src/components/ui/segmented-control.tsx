import { cn } from "@/lib/utils";

export function SegmentedControl<T extends string>({
  value,
  options,
  render,
  onChange,
  size = "md",
}: {
  value: T;
  options: readonly T[];
  render?: (v: T) => string;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1",
        size === "md" ? "h-11" : "h-9",
      )}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "h-full rounded-lg font-semibold transition-colors",
            size === "md" ? "px-3 text-sm" : "px-2.5 text-xs",
            value === o
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {render ? render(o) : o}
        </button>
      ))}
    </div>
  );
}
