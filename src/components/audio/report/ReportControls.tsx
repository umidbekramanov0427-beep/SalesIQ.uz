import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Grade } from "@/lib/call-grade";
import { cn } from "@/lib/utils";

// Small pieces of the "baho varag'i" look shared by the Audio tahlil page
// and a call's own report sheet. They read the --rp-* tokens, so they only
// look right inside a .report-skin wrapper.

/** A pill that opens a short list; dark while a value other than the first is picked. */
export function PillSelect({
  label,
  value,
  options,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  const on = !!options[0] && value !== options[0].value;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="rp-pill" data-on={on} aria-label={label}>
          {icon}
          <span className={cn("font-medium", on ? "opacity-70" : "rp-mute")}>{label}:</span>
          <span className="max-w-[140px] truncate">{current?.label}</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-56 overflow-y-auto p-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              onChange(o.value);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
          >
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function GradeLetter({ grade, className }: { grade: Grade | null; className?: string }) {
  return (
    <span
      className={cn(
        "rp-display select-none leading-[0.85]",
        grade ? `rp-${grade}` : "rp-mute",
        className,
      )}
    >
      {grade ?? "—"}
    </span>
  );
}

const STAMP_TONE = {
  positive: "rp-A",
  neutral: "rp-C",
  negative: "rp-D",
  info: "rp-B",
} as const;

export function Stamp({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  tone: keyof typeof STAMP_TONE;
  className?: string;
}) {
  return <span className={cn("rp-stamp", STAMP_TONE[tone], className)}>{children}</span>;
}

/** A section heading with the heavy rule under it, like a printed form. */
export function SheetHeading({
  title,
  right,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rp-rule flex items-baseline justify-between gap-3 pb-1.5", className)}>
      <h2 className="rp-display text-[21px] leading-tight phone:text-[18px]">{title}</h2>
      {right && <div className="rp-mute shrink-0 text-[13px]">{right}</div>}
    </div>
  );
}
