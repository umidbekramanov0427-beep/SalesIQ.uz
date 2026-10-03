import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// A visual color picker for people who don't know (or care about) HEX
// codes: a flower-of-dots button opens a spectrum -- hue left to right,
// vivid at the top fading to white at the bottom -- with a draggable
// handle, a live preview circle, and a "Set" button. Brightness isn't a
// control on purpose: the accent system (lib/accent.ts) normalizes
// lightness per theme anyway, so hue + saturation are the only choices
// that actually change the result.

// ---- HSV <-> hex ----------------------------------------------------------

function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)]
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

// Yellows through cyans stay bright at full value, so white text on them
// would be unreadable.
function isLightHue(h: number) {
  return h >= 40 && h <= 200;
}

const HUE_GRADIENT =
  "linear-gradient(to right, #ff0000 0%, #ffff00 16.66%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.66%, #ff00ff 83.33%, #ff0000 100%)";

// Seven dots in a ring around a center -- the "pick a color" glyph.
export function ColorFlowerIcon({ className }: { className?: string }) {
  const colors = ["#e0719e", "#f0932b", "#e9b949", "#7cc35a", "#5aa2f0", "#8f7cf0"];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {colors.map((c, i) => {
        const a = (i * 60 - 90) * (Math.PI / 180);
        return (
          <circle key={c} cx={12 + Math.cos(a) * 7} cy={12 + Math.sin(a) * 7} r={2.6} fill={c} />
        );
      })}
      <circle cx={12} cy={12} r={2.6} fill="#d9472b" />
    </svg>
  );
}

export function SpectrumColorPicker({
  value,
  onSet,
  label,
  setLabel,
  active = false,
}: {
  value: string;
  onSet: (hex: string) => void;
  label: string;
  setLabel: string;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Hue 0-360 along x, saturation 1 -> 0 down y (value fixed at 1).
  const [pos, setPos] = useState({ h: 220, s: 0.8 });
  const areaRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Each time it opens, start from the color currently in use.
  useEffect(() => {
    if (!open) return;
    const hsv = hexToHsv(value);
    if (hsv) setPos({ h: hsv.h, s: hsv.s });
  }, [open, value]);

  const hex = hsvToHex(pos.h, pos.s, 1);

  function pick(e: PointerEvent<HTMLDivElement>) {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setPos({ h: Math.min(359.9, x * 360), s: 1 - y });
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") setPos((p) => ({ ...p, h: Math.max(0, p.h - step) }));
    else if (e.key === "ArrowRight") setPos((p) => ({ ...p, h: Math.min(359.9, p.h + step) }));
    else if (e.key === "ArrowUp") setPos((p) => ({ ...p, s: Math.min(1, p.s + step / 100) }));
    else if (e.key === "ArrowDown") setPos((p) => ({ ...p, s: Math.max(0, p.s - step / 100) }));
    else if (e.key === "Enter") {
      onSet(hex);
      setOpen(false);
      return;
    } else return;
    e.preventDefault();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-11 items-center gap-2.5 rounded-xl border bg-background pl-2 pr-3.5 text-[13px] font-semibold text-foreground transition-colors hover:border-primary/50",
            active ? "border-primary" : "border-border",
          )}
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#1b222c]">
            <ColorFlowerIcon className="h-6 w-6" />
          </span>
          {label}
          <span
            className="ml-1 h-5 w-5 rounded-full ring-2 ring-background ring-offset-1 ring-offset-border"
            style={{ background: value }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[360px] overflow-hidden rounded-2xl border-border p-0 shadow-elevated"
      >
        <div className="flex items-center gap-3 p-3">
          <span
            className="h-10 w-10 shrink-0 rounded-full border-[3px] border-popover"
            style={{ background: hex, boxShadow: `0 0 0 2px ${hex}` }}
          />
          <span className="flex h-10 min-w-0 flex-1 items-center rounded-full bg-muted px-4 font-mono text-sm uppercase tracking-wide text-foreground">
            {hex}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={areaRef}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuetext={hex}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            pick(e);
          }}
          onPointerMove={(e) => {
            if (dragging.current) pick(e);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          className="relative h-48 w-full cursor-crosshair touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          style={{
            background: `linear-gradient(to bottom, rgba(255,255,255,0) 0%, #ffffff 100%), ${HUE_GRADIENT}`,
          }}
        >
          <span
            className="pointer-events-none absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
            style={{
              left: `${(pos.h / 360) * 100}%`,
              top: `${(1 - pos.s) * 100}%`,
              background: hex,
            }}
          />
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={() => {
              onSet(hex);
              setOpen(false);
            }}
            // Painted in the color being picked, so the button itself is
            // the last preview before committing.
            className="h-11 w-full rounded-full text-sm font-semibold shadow-soft transition-opacity hover:opacity-90"
            style={{
              background: hex,
              color: pos.s < 0.45 || isLightHue(pos.h) ? "#111827" : "#ffffff",
            }}
          >
            {setLabel}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
