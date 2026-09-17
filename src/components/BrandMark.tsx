import { useId } from "react";
import { cn } from "@/lib/utils";

// Full splash lockup for decorative/marketing placements (the login
// screen's branding panel): a folded ribbon "S" flowing into a rising
// arrow, in the same blue-to-cyan gradient as Logo.tsx, plus the
// "SalesIQ CRM" wordmark on one line beneath it. The small in-app icon
// used everywhere else (sidebar, compact headers) stays the simpler mark
// in Logo.tsx -- this version is only meant for a larger, decorative size.
export function BrandMark({
  className,
  iconClassName,
  wordmarkClassName,
}: {
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
}) {
  const ribbonGrad = useId();

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
            id={ribbonGrad}
            x1="25"
            y1="88"
            x2="88"
            y2="8"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#3730A3" />
            <stop offset="0.55" stopColor="#4F46E5" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
        <path
          d="M32 84 C80 84, 80 54, 52 50 C24 46, 24 18, 72 16"
          stroke={`url(#${ribbonGrad})`}
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M89 4 L74 21 L68 5 Z" fill={`url(#${ribbonGrad})`} />
      </svg>

      <p
        className={cn(
          "whitespace-nowrap text-xl font-extrabold tracking-tight text-indigo-400",
          wordmarkClassName,
        )}
      >
        SalesIQ CRM
      </p>
    </div>
  );
}
