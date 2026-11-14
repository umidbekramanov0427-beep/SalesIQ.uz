import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CardTools,
  HiddenCard,
  cardStateClass,
  useCardChrome,
  valueStateClass,
} from "@/components/layout/CardTools";
import {
  FigureCard,
  FigureDelta,
  FigureLine,
  SectionCard,
  type CardTone,
} from "@/components/layout/Primitives";
import { cn } from "@/lib/utils";

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
  const chrome = useCardChrome({ tipKey, label, value: rawValue });
  if (chrome.hidden) return <HiddenCard chrome={chrome} label={label} />;
  return (
    <FigureCard
      icon={icon}
      tone={tone}
      label={label}
      labelExtra={titleExtra}
      tools={<CardTools chrome={chrome} label={label} />}
      value={value}
      valueClassName={valueStateClass(chrome.state)}
      className={cardStateClass(chrome.state)}
    >
      {children}
      {change !== undefined && (
        <FigureLine>
          <Change value={change} />
        </FigureLine>
      )}
      {prevText && <FigureLine className="tabular-nums">{prevText}</FigureLine>}
    </FigureCard>
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
