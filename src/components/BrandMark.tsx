import { useId } from "react";
import { cn } from "@/lib/utils";

// Full splash lockup for decorative/marketing placements (the login
// screen's branding panel): four ascending bars crossed by a rising
// arrow, in the same green gradient as Logo.tsx, plus the "SalesIQ CRM"
// wordmark on one line beneath it. The small in-app icon used everywhere
// else (sidebar, compact headers) stays the simpler mark in Logo.tsx --
// this version is only meant for a larger, decorative size.
export function BrandMark({
  className,
  iconClassName,
  wordmarkClassName,
}: {
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
}) {
  const barGrad = useId();

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <svg
        viewBox="0 0 100 100"
        fill="none"
        className={cn("h-16 w-16", iconClassName)}
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={barGrad}
            x1="50"
            y1="84"
            x2="50"
            y2="10"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#14532D" />
            <stop offset="0.55" stopColor="#16A34A" />
            <stop offset="1" stopColor="#4ADE80" />
          </linearGradient>
        </defs>
        <rect x="13" y="62" width="14" height="22" rx="4" fill={`url(#${barGrad})`} />
        <rect x="33" y="48" width="14" height="36" rx="4" fill={`url(#${barGrad})`} />
        <rect x="53" y="32" width="14" height="52" rx="4" fill={`url(#${barGrad})`} />
        <rect x="73" y="14" width="14" height="70" rx="4" fill={`url(#${barGrad})`} />
        <path d="M10 76 L77 19" stroke="#FBBF24" strokeWidth="7" strokeLinecap="round" />
        <path d="M88 10 L82 24 L73 14 Z" fill="#FBBF24" />
      </svg>

      <p
        className={cn(
          "whitespace-nowrap text-xl font-extrabold tracking-tight text-emerald-400",
          wordmarkClassName,
        )}
      >
        SalesIQ CRM
      </p>
    </div>
  );
}
