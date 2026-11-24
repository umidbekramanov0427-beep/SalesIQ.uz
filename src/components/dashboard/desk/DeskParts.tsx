import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CardTools, useCardChrome } from "@/components/layout/CardTools";
import {
  FigureCard,
  FigureDelta,
  FigureLine,
  SectionCard,
  type CardTone,
} from "@/components/layout/Primitives";

// Ish stoli's and Telefon's building blocks, on the platform's own
// primitives: a figure card (StatCard) and a titled block (SectionCard).

export function Change({ value }: { value: number | null }) {
  return <FigureDelta value={value} />;
}

// The big figure card (icon tile on top, the name, a large figure, its
// change and the period before) -- the owner's pick for Ish stoli, and the
// shape every figure card on the platform now has (FigureCard).
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
  const chrome = useCardChrome({ tipKey, label });
  return (
    <FigureCard
      icon={icon}
      tone={tone}
      label={label}
      labelExtra={titleExtra}
      tools={
        <>
          {change !== undefined && <DeltaChip value={change} />}
          <CardTools chrome={chrome} label={label} />
        </>
      }
      value={value}
    >
      {children}
      {prevText && <FigureLine className="tabular-nums">{prevText}</FigureLine>}
    </FigureCard>
  );
}

/** The change against the period before as a small pill (top right of a card). */
export function DeltaChip({
  value,
  lowerIsBetter = false,
}: {
  value: number | null;
  lowerIsBetter?: boolean;
}) {
  if (value === null)
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold text-muted-foreground">
        —
      </span>
    );
  const good = lowerIsBetter ? value <= 0 : value >= 0;
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums " +
        (good
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
          : "bg-rose-500/12 text-rose-700 dark:text-rose-300")
      }
    >
      {value >= 0 ? "↑" : "↓"} {Math.abs(value)}%
    </span>
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
