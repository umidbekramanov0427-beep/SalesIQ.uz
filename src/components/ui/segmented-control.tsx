import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SegmentedControl<T extends string>({
  value,
  options,
  render,
  onChange,
  size = "md",
  stretch = false,
}: {
  value: T;
  options: readonly T[];
  render?: (v: T) => ReactNode;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  /** Fill the container, options sharing the width equally. */
  stretch?: boolean;
}) {
  return (
    <div
      className={cn(
        "ctl-track items-center gap-1 rounded-xl p-1",
        stretch ? "flex w-full" : "inline-flex",
        size === "md" ? "h-11" : "h-9",
      )}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-selected={value === o}
          className={cn(
            "ctl-tab h-full rounded-lg font-semibold",
            stretch && "flex flex-1 items-center justify-center",
            size === "md" ? "px-3 text-sm" : "px-2.5 text-xs",
          )}
        >
          {render ? render(o) : o}
        </button>
      ))}
    </div>
  );
}
