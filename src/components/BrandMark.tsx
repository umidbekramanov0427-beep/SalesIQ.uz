import { useId } from "react";
import { cn } from "@/lib/utils";

// Full splash lockup for decorative/marketing placements (the login
// screen's branding panel): the same folded-ribbon "S" + arrow mark as
// Logo.tsx, plus the "SalesIQ" wordmark on one line beneath it. The
// small in-app icon used everywhere else (sidebar, compact headers) stays
// Logo.tsx -- this version is only meant for a larger, decorative size.
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
  const backPath = "M170,245 C260,255 315,275 315,320 C315,400 120,437 20,437";
  const frontPath = "M160,235 C100,225 20,180 20,140 C20,60 250,60 295,20";

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <svg
        viewBox="-15 -15 365 480"
        fill="none"
        className={cn("h-16 w-16", iconClassName)}
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={ribbonGrad}
            x1="345"
            y1="-6"
            x2="20"
            y2="437"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#20C7F3" />
            <stop offset="20%" stopColor="#1595F7" />
            <stop offset="45%" stopColor="#1769F4" />
            <stop offset="65%" stopColor="#303FEF" />
            <stop offset="82%" stopColor="#5234F5" />
            <stop offset="100%" stopColor="#7430F5" />
          </linearGradient>
        </defs>
        <path
          d={backPath}
          stroke={`url(#${ribbonGrad})`}
          strokeWidth="55"
          strokeLinecap="butt"
          strokeLinejoin="round"
        />
        <path
          d={frontPath}
          stroke="#1E1B4B"
          strokeWidth="66"
          strokeLinecap="butt"
          strokeLinejoin="round"
        />
        <path
          d={frontPath}
          stroke={`url(#${ribbonGrad})`}
          strokeWidth="55"
          strokeLinecap="butt"
          strokeLinejoin="round"
        />
        <path d="M350,-10 L316,48 L282,4 Z" fill={`url(#${ribbonGrad})`} />
      </svg>

      <p
        className={cn(
          "whitespace-nowrap text-xl font-extrabold tracking-tight text-indigo-400",
          wordmarkClassName,
        )}
      >
        SalesIQ
      </p>
    </div>
  );
}
