import type { ReactNode } from "react";
import type { Grade } from "@/lib/call-grade";
import { cn } from "@/lib/utils";

// Small pieces shared by the Audio tahlil cards and a call's own report
// sheet. They read the --rp-* tokens (styles.css maps them to the
// platform's), so they belong inside a .report-skin wrapper.

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
