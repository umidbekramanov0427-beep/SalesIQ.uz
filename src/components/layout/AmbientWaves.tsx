import { cn } from "@/lib/utils";

// The login/landing screen's brand waves (see LoginWaves), reused as a
// faint, always-on backdrop behind the app's working area. Unlike
// LoginWaves (a requestAnimationFrame loop rewriting each path every
// frame, fine for one screen but not for a backdrop that never goes away)
// these are static paths drifted by a pure CSS transform animation: each
// path spans one extra wave period past both edges and slides by exactly
// one period per cycle, so the loop is seamless and runs on the
// compositor with zero JS. Sits under every card (cards are opaque), so
// it only shows through the gaps between them and never competes with
// the numbers; reduced-motion users get the same lines, standing still.

type Layer = {
  baseline: number;
  amplitude: number;
  period: number;
  duration: number; // seconds per period of drift
  reverse: boolean;
  color: string;
  strokeWidth: number;
  opacity: number;
};

// Same brand colors, order and relative weights as LoginWaves.
const LAYERS: Layer[] = [
  {
    baseline: 150,
    amplitude: 62,
    period: 520,
    duration: 26,
    reverse: false,
    color: "#02F0FB",
    strokeWidth: 2.5,
    opacity: 0.9,
  },
  {
    baseline: 190,
    amplitude: 46,
    period: 440,
    duration: 32,
    reverse: true,
    color: "#0552FB",
    strokeWidth: 2,
    opacity: 0.6,
  },
  {
    baseline: 228,
    amplitude: 36,
    period: 380,
    duration: 29,
    reverse: false,
    color: "#8052FB",
    strokeWidth: 1.75,
    opacity: 0.4,
  },
];

const VIEW_W = 1600;
const VIEW_H = 360;
const STEP = 8;

function buildPath(layer: Layer): string {
  let d = "";
  for (let x = -layer.period; x <= VIEW_W + layer.period; x += STEP) {
    const y = layer.baseline + layer.amplitude * Math.sin((x / layer.period) * 2 * Math.PI);
    d += `${d ? " L" : "M"}${x},${y.toFixed(1)}`;
  }
  return d;
}

const PATHS = LAYERS.map(buildPath);

export function AmbientWaves({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("ambient-waves pointer-events-none overflow-hidden", className)}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="h-full w-full">
        {LAYERS.map((layer, i) => (
          <path
            key={i}
            d={PATHS[i]}
            fill="none"
            stroke={layer.color}
            strokeWidth={layer.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={layer.opacity}
            className="ambient-wave"
            style={
              {
                "--wave-shift": `${layer.reverse ? layer.period : -layer.period}px`,
                animationDuration: `${layer.duration}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </svg>
    </div>
  );
}
