import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { SectionCard, StatCard, type CardTone } from "@/components/layout/Primitives";
import { cn } from "@/lib/utils";

// Ish stoli's and Telefon's building blocks, on the platform's own
// primitives: a figure card (StatCard) and a titled block (SectionCard).

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
  change,
  prevText,
  titleExtra,
}: {
  tipKey: string;
  label: string;
  icon: LucideIcon;
  tone: CardTone;
  value: string | number;
  /** Kept for callers; the card's state follows its own value. */
  rawValue?: number;
  change?: number | null;
  prevText?: string | undefined;
  titleExtra?: ReactNode;
}) {
  // The platform's own figure card (StatCard): icon, name, "!" and ⚙,
  // the figure, its change against the period before and the hint.
  return (
    <StatCard
      label={label}
      value={String(value)}
      icon={icon}
      iconTone={tone}
      tipKey={tipKey}
      {...(change !== undefined && change !== null ? { delta: change } : {})}
      {...(prevText ? { hint: prevText } : {})}
      {...(titleExtra ? { extraTools: titleExtra } : {})}
    />
  );
}

export function DeskBlock({
  title,
  icon,
  tone,
  actions,
  children,
  className,
}: {
  /** Kept for callers; the block's "!" follows its title. */
  tipKey?: string;
  title: string;
  icon: LucideIcon;
  tone: CardTone;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  // The platform's own titled block (SectionCard).
  return (
    <SectionCard
      title={title}
      icon={icon}
      tone={tone}
      {...(actions ? { actions } : {})}
      {...(className ? { className } : {})}
    >
      {children}
    </SectionCard>
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
