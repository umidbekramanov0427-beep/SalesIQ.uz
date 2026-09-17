import { useId } from "react";

// SalesIQ brand mark: a folded ribbon forming an "S" that flows into a
// rising arrow (growth, read by an intelligent system -- the "IQ"), the
// same mark as the login screen's BrandMark, just without the wordmark --
// sized for compact use (sidebar header, favicons, mobile header).
export function Logo({ className }: { className?: string }) {
  const ribbonGrad = useId();

  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
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
  );
}
