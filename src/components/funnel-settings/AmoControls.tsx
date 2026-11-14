import { useState, type ReactNode } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// The small controls of the amoCRM-style funnel settings screen.

/** The settings switch (as in 5CRM): a filled pill in the brand colour with a white knob when on. */
export function AmoToggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean | undefined;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-primary bg-primary"
          : "border-border bg-muted-foreground/20 dark:bg-muted-foreground/25",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 h-[16px] w-[16px] -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.35)] transition-[left] duration-300 ease-[cubic-bezier(.3,1.4,.5,1)] motion-reduce:transition-none",
          checked ? "left-[18px]" : "left-[2px]",
        )}
      />
    </button>
  );
}

export type PickOption<T extends string> = {
  value: T;
  label: string;
  icon: LucideIcon;
  tone: string;
};

/** A compact field that opens a titled list with icons (stage value, lead quality). */
export function PickMenu<T extends string>({
  title,
  value,
  options,
  onChange,
  disabled,
  tinted,
}: {
  title: string;
  value: T;
  options: PickOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean | undefined;
  /** Colour the closed field like the chosen option (sale green, refused red). */
  tinted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0]!;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "group flex h-7 w-full items-center gap-1.5 rounded-[4px] border px-2 text-left text-[11.5px] font-semibold transition-colors disabled:cursor-default",
            tinted && current.tone.includes("emerald")
              ? "border-emerald-500/40 bg-emerald-500/10"
              : tinted && current.tone.includes("rose")
                ? "border-rose-500/40 bg-rose-500/10"
                : "border-border bg-card/50 hover:border-primary/40",
          )}
        >
          <current.icon className={cn("h-3.5 w-3.5 shrink-0", current.tone)} />
          <span
            className={cn("min-w-0 flex-1 truncate", tinted ? current.tone : "text-foreground")}
          >
            {current.label}
          </span>
          {!disabled && (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="amo-skin w-60 rounded-[6px] p-1.5">
        <p className="px-2 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </p>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              setOpen(false);
              if (o.value !== value) onChange(o.value);
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[4px] px-2 py-2 text-left text-[13px] font-semibold text-foreground transition-colors hover:bg-accent",
              o.value === value && "bg-accent/70",
            )}
          >
            <o.icon className={cn("h-4 w-4 shrink-0", o.tone)} />
            <span className="flex-1">{o.label}</span>
            {o.value === value && <Check className="h-4 w-4 text-muted-foreground" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** One card of the left "Lid manbalari" column. */
export function AmoCard({
  title,
  toggle,
  children,
  className,
}: {
  title: ReactNode;
  toggle?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[8px] border border-border bg-card px-4 py-3.5 shadow-[0_1px_1px_rgba(15,23,42,0.05)] transition-colors hover:border-[color-mix(in_oklab,var(--border)_60%,var(--primary))]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <h3 className="min-w-0 flex-1 text-[15px] font-normal leading-snug text-foreground">
          {title}
        </h3>
        {toggle && <span className="pt-0.5">{toggle}</span>}
      </div>
      {children}
    </section>
  );
}
