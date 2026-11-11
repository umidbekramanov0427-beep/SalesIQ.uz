import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

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
  centered = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
  className?: string;
  /** Pins the control to the top of the page while the content scrolls. */
  sticky?: boolean;
  /**
   * A page's main tabs: centred, on a card of their own (card tone, hairline
   * border, soft shadow) with the chosen tab in the brand colour.
   */
  centered?: boolean;
}) {
  // The admin console's segmented control: a hairline track, the chosen
  // segment raised one step with its own hairline (as the hub's filter).
  const { console: consoleOn } = useTheme();
  const control = (
    <div
      role="tablist"
      className={cn(
        "inline-flex max-w-full items-center overflow-x-auto [scrollbar-width:none]",
        centered
          ? "gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-[0_1px_2px_rgb(16_24_40/0.05),0_8px_24px_-12px_rgb(16_24_40/0.18)] dark:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.6)]"
          : consoleOn
            ? "gap-0.5 rounded-xl border border-border bg-input p-1"
            : "gap-0.5 rounded-[11px] bg-foreground/[0.06] p-[3px] dark:bg-white/[0.08]",
        !sticky && !centered && className,
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
            "inline-flex shrink-0 items-center whitespace-nowrap transition-[background-color,box-shadow,color] duration-200",
            centered
              ? "h-10 gap-2 rounded-xl px-4 text-[13.5px]"
              : "h-8 gap-1.5 rounded-[8px] px-3.5 text-[13px]",
            v === value
              ? centered
                ? "bg-primary font-semibold text-primary-foreground shadow-[0_4px_12px_-4px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
                : consoleOn
                  ? "bg-accent font-semibold text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                  : "bg-white font-semibold text-foreground shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)] dark:bg-[#636366] dark:text-white"
              : centered
                ? "font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {Icon && <Icon className="h-4 w-4" />}
          {label}
        </button>
      ))}
    </div>
  );
  if (!sticky) {
    return centered ? (
      <div className={cn("flex justify-center", className)}>{control}</div>
    ) : (
      control
    );
  }
  // -top-4 / phone:-top-3: browsers pin a sticky box inside the scroller's
  // padding (<main> has pt-4), so top-0 left a slit above the bar where the
  // page showed through while scrolling.
  return (
    <div
      className={cn(
        "sticky -top-4 z-20 -mx-4 bg-background/75 px-4 py-2 backdrop-blur-xl backdrop-saturate-150 md:-mx-6 md:px-6 phone:-top-3 phone:-mx-3 phone:px-3",
        centered && "flex justify-center py-2.5",
        className,
      )}
    >
      {control}
    </div>
  );
}
