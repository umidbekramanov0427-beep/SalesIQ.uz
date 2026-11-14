import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  CardTools,
  HiddenCard,
  cardStateClass,
  useCardChrome,
  valueStateClass,
} from "@/components/layout/CardTools";
import { IconTile, type CardTone } from "@/components/layout/Primitives";
import { cn } from "@/lib/utils";

// Ish stoli's building blocks: a figure card (icon, "!" and ⚙ in the corner,
// the figure, its change and the period before) and a titled block, both on
// the platform's solid card.

export function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold tabular-nums",
        up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {up ? "+" : ""}
      {value}%
    </span>
  );
}

export function DeskKpi({
  tipKey,
  label,
  icon,
  tone,
  value,
  rawValue,
  change,
  prevText,
  titleExtra,
  children,
}: {
  tipKey: string;
  label: string;
  icon: LucideIcon;
  tone: CardTone;
  value: ReactNode;
  rawValue?: number;
  change?: number | null;
  prevText?: string | undefined;
  titleExtra?: ReactNode;
  children?: ReactNode;
}) {
  const chrome = useCardChrome({ tipKey, label, value: rawValue });
  if (chrome.hidden) return <HiddenCard chrome={chrome} label={label} />;
  return (
    <div
      className={cn(
        "stat-card flex min-w-0 flex-col rounded-[8px] border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.05)]",
        cardStateClass(chrome.state),
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <IconTile icon={icon} tone={tone} size="md" />
        <CardTools chrome={chrome} label={label} />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
        <span className="min-w-0 truncate">{label}</span>
        {titleExtra}
      </p>
      <div
        className={cn(
          "mt-1.5 font-display text-[26px] font-bold leading-tight tracking-tight tabular-nums text-foreground phone:text-[19px]",
          valueStateClass(chrome.state),
        )}
      >
        {value}
      </div>
      {children}
      {change !== undefined && (
        <p className="mt-1 text-[12.5px]">
          <Change value={change} />
        </p>
      )}
      {prevText && (
        <p className="mt-0.5 line-clamp-2 text-[12px] tabular-nums text-muted-foreground">
          {prevText}
        </p>
      )}
    </div>
  );
}

export function DeskBlock({
  tipKey,
  title,
  icon,
  tone,
  actions,
  children,
  className,
}: {
  tipKey: string;
  title: string;
  icon: LucideIcon;
  tone: CardTone;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const chrome = useCardChrome({ tipKey, label: title });
  if (chrome.hidden) return <HiddenCard chrome={chrome} label={title} />;
  return (
    <section
      className={cn(
        "stat-card min-w-0 rounded-[8px] border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.05)]",
        className,
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <IconTile icon={icon} tone={tone} size="sm" />
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">
          {title}
        </h3>
        {actions}
        <CardTools chrome={chrome} label={title} />
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Two small segments (Soat / Kun, …) in the platform's track. */
export function MiniSegment<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="tablist" className="ctl-track inline-flex items-center gap-0.5 rounded-[6px] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          data-state={o.value === value ? "active" : "inactive"}
          onClick={() => onChange(o.value)}
          className="ctl-tab h-7 rounded-[4px] px-2.5 text-[12px] font-semibold"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
