import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Decorative, mouse-reactive wave graphic for the login screen's left
// panel. Three lines drift horizontally on their own (a slow sine phase
// advance, no seams to tile) and, wherever the pointer hovers over the
// graphic, rise up toward the cursor's x position -- a soft Gaussian bump
// that eases in on hover and back out on leave, computed and written
// straight to each <path>'s `d` attribute every frame (no React re-render
// in the animation loop, since this runs at 60fps for as long as the
// login screen is open).

type Layer = {
  baseline: number;
  amplitude: number;
  period: number;
  speed: number; // phase radians/sec -- sign sets drift direction
  color: string;
  strokeWidth: number;
  opacity: number;
  bumpMax: number;
};

// Every stroke color here is sampled straight from the logo artwork's own
// gradient (cyan arrow-tip highlight -> flat ".uz" blue -> the ribbon's
// indigo/violet fold) -- never a generic Tailwind gray, so the wave reads
// as the same brand, not an unrelated decoration.
const LAYERS: Layer[] = [
  {
    baseline: 145,
    amplitude: 68,
    period: 420,
    speed: 0.35,
    color: "#02F0FB",
    strokeWidth: 3,
    opacity: 0.9,
    bumpMax: 82,
  },
  {
    baseline: 190,
    amplitude: 50,
    period: 360,
    speed: -0.24,
    color: "#0552FB",
    strokeWidth: 2.5,
    opacity: 0.55,
    bumpMax: 62,
  },
  {
    baseline: 230,
    amplitude: 40,
    period: 300,
    speed: 0.3,
    color: "#8052FB",
    strokeWidth: 2,
    opacity: 0.35,
    bumpMax: 44,
  },
];

const VIEW_W = 800;
const VIEW_H = 360;
const SAMPLES = 64;
const BUMP_SIGMA = 95;
const BUMP_EASE = 0.08;

function buildPath(layer: Layer, phase: number, bumpX: number, bumpStrength: number): string {
  let d = "";
  for (let s = 0; s <= SAMPLES; s++) {
    const x = (s / SAMPLES) * VIEW_W;
    let y = layer.baseline + layer.amplitude * Math.sin((x / layer.period) * 2 * Math.PI + phase);
    if (bumpStrength > 0.001) {
      const dx = x - bumpX;
      const bump = Math.exp(-(dx * dx) / (2 * BUMP_SIGMA * BUMP_SIGMA));
      y -= bump * layer.bumpMax * bumpStrength;
    }
    d += `${s === 0 ? "M" : " L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d;
}

export function LoginWaves({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const hovering = useRef(false);
  const bumpX = useRef(VIEW_W / 2);
  const bumpStrength = useRef(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phase = LAYERS.map(() => 0);
    let last = performance.now();
    let raf = 0;

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const target = hovering.current ? 1 : 0;
      bumpStrength.current += (target - bumpStrength.current) * BUMP_EASE;

      LAYERS.forEach((layer, i) => {
        const p = ((phase[i] ?? 0) + (reduceMotion ? 0 : layer.speed * dt)) % (2 * Math.PI);
        phase[i] = p;
        const path = pathRefs.current[i];
        if (!path) return;
        path.setAttribute("d", buildPath(layer, p, bumpX.current, bumpStrength.current));
      });

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    bumpX.current = ratio * VIEW_W;
    hovering.current = true;
  }
  function handlePointerLeave() {
    hovering.current = false;
  }

  return (
    <div
      className={cn("relative shrink-0", className)}
      // A small inset keeps the wave lines from touching either edge of
      // their own box, so the graphic still reads as a contained
      // centerpiece rather than a full-bleed strip pinned to both sides,
      // while running noticeably wider than the first pass at this (0.5cm
      // instead of 1.5cm -- 1cm more of wave on each side).
      style={{ paddingInline: "0.5cm" }}
    >
      <svg
        ref={svgRef}
        aria-hidden="true"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {LAYERS.map((layer, i) => (
          <path
            key={i}
            ref={(el) => {
              pathRefs.current[i] = el;
            }}
            d={buildPath(layer, 0, VIEW_W / 2, 0)}
            fill="none"
            stroke={layer.color}
            strokeWidth={layer.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={layer.opacity}
          />
        ))}
      </svg>
    </div>
  );
}
