import { cn } from "@/lib/utils";

// The login/landing screen's brand waves (see LoginWaves), reused as a
// faint, always-on backdrop behind the app's whole working area. Unlike
// LoginWaves (a requestAnimationFrame loop rewriting each path every
// frame, fine for one screen but not for a backdrop that never goes away)
// these are static paths drifted by a pure CSS transform animation: each
// path spans one extra wave period past both edges and slides by exactly
// one period per cycle, so the loop is seamless and runs on the
// compositor with zero JS. Sits under every card (cards are opaque), so
// it only shows through the gaps between them and never competes with
// the numbers; reduced-motion users get the same lines, standing still.
//
// Layout: the familiar three-line brand group runs through the vertical
// middle of the screen, with two quieter echo groups above and below it so
// the waves fill the full height instead of sitting in one band. Stroke
// colors come from --wave-1/2/3, which follow the user's chosen accent
// color (see lib/accent.ts).

type Layer = {
  baseline: number;
  amplitude: number;
  period: number;
  duration: number; // seconds per period of drift
  reverse: boolean;
  tone: 1 | 2 | 3; // which --wave-N color
  strokeWidth: number;
  opacity: number;
};

const VIEW_W = 1600;
const VIEW_H = 1000;
const STEP = 8;

// One group = the same cyan / blue / violet trio as LoginWaves, with the
// same relative weights, centered on `center`.
function group(center: number, scale: number, offset: number, emphasis: number): Layer[] {
  return [
    {
      baseline: center - 32,
      amplitude: 62 * scale,
      period: 520 + offset,
      duration: 26 + offset / 20,
      reverse: false,
      tone: 1,
      strokeWidth: 2.25,
      opacity: 0.9 * emphasis,
    },
    {
      baseline: center + 8,
      amplitude: 46 * scale,
      period: 440 + offset,
      duration: 32 + offset / 20,
      reverse: true,
      tone: 2,
      strokeWidth: 1.75,
      opacity: 0.6 * emphasis,
    },
    {
      baseline: center + 46,
      amplitude: 36 * scale,
      period: 380 + offset,
      duration: 29 + offset / 20,
      reverse: false,
      tone: 3,
      strokeWidth: 1.5,
      opacity: 0.4 * emphasis,
    },
  ];
}

const LAYERS: Layer[] = [
  ...group(170, 0.85, 90, 0.5),
  ...group(480, 1, 0, 1),
  ...group(800, 0.85, 60, 0.5),
];

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
            strokeWidth={layer.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={layer.opacity}
            className="ambient-wave"
            style={
              {
                stroke: `var(--wave-${layer.tone})`,
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
