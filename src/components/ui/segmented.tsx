import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

/**
 * The platform's tab row: one plain card-coloured panel with the segments
 * as words (styles.css .ctl-track / .ctl-tab), the chosen one a solid brand
 * chip. Scrolls sideways when it doesn't fit.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  sticky = false,
  centered = false,
  trailing,
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
  /** The page's filters, on the right of the tabs (the tabs then sit left). */
  trailing?: ReactNode;
}) {
  // The admin console's segmented control: a hairline track, the chosen
  // segment raised one step with its own hairline (as the hub's filter).
  const { console: consoleOn } = useTheme();
  const control = (
    <div
      role="tablist"
      className={cn(
        "ctl-track inline-flex max-w-full items-center overflow-x-auto [scrollbar-width:none]",
        centered
          ? "gap-1.5 rounded-2xl border border-border !bg-card p-2.5 shadow-soft"
          : consoleOn
            ? "gap-1 rounded-xl p-1"
            : "gap-1 rounded-[12px] p-[3px]",
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
            "ctl-tab inline-flex shrink-0 items-center whitespace-nowrap font-medium",
            centered
              ? "h-12 gap-2 rounded-[14px] px-4 text-[13.5px]"
              : "h-8 gap-1.5 rounded-[9px] px-3.5 text-[13px]",
          )}
        >
          {Icon && <Icon className="h-4 w-4" />}
          {label}
        </button>
      ))}
    </div>
  );
  // A page's tabs with its filters: the tabs on the left, the filters on the
  // right of the same row.
  if (trailing) {
    const row = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        {control}
        <div className="min-w-0">{trailing}</div>
      </div>
    );
    if (!sticky) return <div className={className}>{row}</div>;
    return (
      <div
        className={cn(
          "sticky -top-4 z-20 -mx-4 bg-background/75 px-4 py-2.5 backdrop-blur-xl backdrop-saturate-150 md:-mx-6 md:px-6 phone:-top-3 phone:-mx-3 phone:px-3",
          className,
        )}
      >
        {row}
      </div>
    );
  }
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
