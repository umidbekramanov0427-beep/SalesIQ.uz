import { useId } from "react";

// SalesIQ brand mark: a folded ribbon forming an "S" that flows into a
// rising arrow (growth, read by an intelligent system -- the "IQ").
// Drawn as two overlapping strokes -- a back layer (the lower loop) and a
// front layer (the upper loop + arrow) -- with a dark seam stroke under
// the front layer so a visible fold line shows where the ribbon crosses
// over itself, instead of the two loops just meeting flat. The seam is a
// fixed dark color (not a background match) so it reads as a shadow at
// the fold on any surface the icon sits on. The same mark as the login
// screen's BrandMark, just without the wordmark -- sized for compact use
// (sidebar header, favicons, mobile header).
export function Logo({ className }: { className?: string }) {
  const ribbonGrad = useId();
  const backPath = "M170,245 C260,255 315,275 315,320 C315,400 120,437 20,437";
  const frontPath = "M160,235 C100,225 20,180 20,140 C20,60 250,60 295,20";

  return (
    <svg viewBox="-15 -15 365 480" fill="none" className={className} aria-hidden="true">
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
  );
}
