import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// macOS-style rail icon: a white glyph on a rounded tile of the section's own
// colour (the className's text colour fills the tile), with a soft top sheen.
// The chosen section's tile gets a ring.
export function RailGlyph({
  icon: Icon,
  active = false,
  className,
}: {
  icon: LucideIcon;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] transition-transform",
        active && "ring-2 ring-current ring-offset-2 ring-offset-sidebar",
        className,
      )}
    >
      <span className="absolute inset-0 rounded-[9px] bg-current" />
      <span className="absolute inset-0 rounded-[9px] bg-gradient-to-b from-white/30 to-black/10" />
      <Icon className="relative h-[17px] w-[17px] text-white" strokeWidth={2.2} />
    </span>
  );
}
