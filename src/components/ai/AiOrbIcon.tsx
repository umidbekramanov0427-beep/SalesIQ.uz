import { cn } from "@/lib/utils";

// SalesIQ's own mark for its AI assistant (not a stock icon): a speech
// bubble that is also an orbit -- a ring open at the top right, where a
// small spark sits -- with a voice waveform inside, since the assistant
// is the one that listens to the calls. Static on purpose: a moving icon
// keeps pulling the eye away from the work.
export function AiOrbIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn("ai-orb", className)}>
      {/* Bubble ring, open at the top right where the spark rides, with a
          short tail at the bottom left. */}
      <path
        d="M26.34 12.24A11 11 0 1 1 19.76 5.66"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M9.4 24.4L6.2 27.8L11.8 26.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Voice waveform. */}
      <g fill="currentColor">
        <rect x="9.1" y="13.5" width="2.4" height="5" rx="1.2" />
        <rect x="12.9" y="10.5" width="2.4" height="11" rx="1.2" />
        <rect x="16.7" y="12" width="2.4" height="8" rx="1.2" />
        <rect x="20.5" y="14.25" width="2.4" height="3.5" rx="1.2" />
      </g>
      {/* The spark: a four-point star in the ring's opening. */}
      <path
        d="M23.8 4.6L24.8 7.2L27.4 8.2L24.8 9.2L23.8 11.8L22.8 9.2L20.2 8.2L22.8 7.2Z"
        fill="currentColor"
      />
    </svg>
  );
}
