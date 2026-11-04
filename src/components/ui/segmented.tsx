import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Apple-style segmented control: a gray capsule track, the chosen segment a
 * raised white pill. Scrolls sideways when it doesn't fit.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  sticky = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
  className?: string;
  /** Pins the control to the top of the page while the content scrolls. */
  sticky?: boolean;
}) {
  const control = (
    <div
      role="tablist"
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[11px] bg-foreground/[0.06] p-[3px] [scrollbar-width:none] dark:bg-white/[0.08]",
        !sticky && className,
      )}
    >
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === value}
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 text-[13px] transition-[background-color,box-shadow,color] duration-200",
            v === value
              ? "bg-white font-semibold text-foreground shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)] dark:bg-[#636366] dark:text-white"
              : "font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {Icon && <Icon className="h-4 w-4" />}
          {label}
        </button>
      ))}
    </div>
  );
  if (!sticky) return control;
  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-4 bg-background/75 px-4 py-2 backdrop-blur-xl backdrop-saturate-150 md:-mx-6 md:px-6 phone:-mx-3 phone:px-3",
        className,
      )}
    >
      {control}
    </div>
  );
}
