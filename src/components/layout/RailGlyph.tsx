import type { ReactNode } from "react";
import { AudioLines, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The icon rail's glyphs in two tones: the line drawing over a soft fill of
// its own shape in the same colour, so each icon reads as a solid, crisp
// mark rather than a thin outline. Glyphs drawn only with open lines (the
// audio bars) get a small rounded backdrop instead, since filling their
// strokes would leave nothing to see.
const BACKDROPS = new Map<LucideIcon, ReactNode>([
  [AudioLines, <rect key="b" x="1.5" y="3.5" width="21" height="17" rx="5" />],
]);

export function RailGlyph({
  icon: Icon,
  active = false,
  className,
}: {
  icon: LucideIcon;
  active?: boolean;
  className?: string;
}) {
  const backdrop = BACKDROPS.get(Icon);
  const fillOpacity = active ? 0.32 : 0.22;
  return (
    <span aria-hidden className={cn("relative inline-block h-[26px] w-[26px] shrink-0", className)}>
      {backdrop ? (
        <svg
          viewBox="0 0 24 24"
          className="absolute inset-0 h-full w-full"
          fill="currentColor"
          opacity={fillOpacity}
        >
          {backdrop}
        </svg>
      ) : (
        <Icon
          className="absolute inset-0 h-full w-full"
          fill="currentColor"
          stroke="none"
          opacity={fillOpacity}
        />
      )}
      <Icon className="relative h-full w-full" strokeWidth={active ? 2.1 : 1.8} />
    </span>
  );
}
