import { useId } from "react";

// SalesIQ brand mark: four ascending bars (sales growth) crossed by a
// rising arrow (the "IQ" -- a sharp read on that growth), the same mark
// as the login screen's BrandMark, just without the wordmark -- sized
// for compact use (sidebar header, favicons, mobile header).
export function Logo({ className }: { className?: string }) {
  const barGrad = useId();

  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={barGrad} x1="50" y1="84" x2="50" y2="10" gradientUnits="userSpaceOnUse">
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
  );
}
