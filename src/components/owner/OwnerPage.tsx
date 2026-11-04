import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { InfoTip } from "@/components/layout/Primitives";
import { cn } from "@/lib/utils";

// The owner panel's building blocks, in one calm style: a page header with a
// one-line "what this page is for", small KPI tiles (coloured icon, label,
// big number, a quiet note) and plain bordered panels. Used by the owner
// pages so they all read the same.

const TILE_TONES = {
  blue: "bg-sky-500/12 text-sky-600 dark:text-sky-300",
  green: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
  amber: "bg-amber-500/14 text-amber-600 dark:text-amber-300",
  rose: "bg-rose-500/12 text-rose-600 dark:text-rose-300",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-300",
  slate: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
} as const;
export type OwnerTone = keyof typeof TILE_TONES;

export function OwnerHeader({
  icon: Icon,
  title,
  desc,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-[20px] font-bold leading-tight tracking-[-0.01em] text-foreground">
          {title}
        </h1>
        {desc && <p className="mt-0.5 text-[13px] text-muted-foreground">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function OwnerStat({
  icon: Icon,
  tone,
  label,
  value,
  note,
  info,
}: {
  icon: LucideIcon;
  tone: OwnerTone;
  label: string;
  value: ReactNode;
  note?: string;
  info?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center gap-2">
        <span
          className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", TILE_TONES[tone])}
        >
          <Icon className="h-[15px] w-[15px]" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-muted-foreground">
          {label}
        </span>
        {info && <InfoTip text={info} />}
      </div>
      <p className="mt-2 text-[22px] font-bold leading-none tabular-nums text-foreground">
        {value}
      </p>
      {note && <p className="mt-1.5 truncate text-[11.5px] text-subtle">{note}</p>}
    </div>
  );
}

export function OwnerPanel({
  title,
  info,
  actions,
  children,
  className,
  flush,
}: {
  title?: string;
  info?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No inner padding (tables, lists that run edge to edge). */
  flush?: boolean;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      {(title || actions) && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          {title && (
            <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px] font-semibold text-foreground">
              <span className="truncate">{title}</span>
              {info && <InfoTip text={info} />}
            </h2>
          )}
          {actions}
        </div>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/** An empty state: icon, what will appear here, and the first action. */
export function OwnerEmpty({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-[14px] font-semibold text-foreground">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A small segmented switch (period, kind...). */
export function OwnerSegment({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border bg-background p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-md px-2.5 text-[12px] font-semibold transition-colors",
            value === o.value
              ? "bg-sidebar-active text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
