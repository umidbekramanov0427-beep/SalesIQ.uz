import { Clock, Flame, Phone, Snowflake, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared "how does a lead/deal card show itself" pieces -- pulled out once
// both the kanban board and the funnel gallery needed the identical
// temperature chip, click-to-call row and follow-up chip, so every place a
// lead renders as a card reads as the same design instead of three
// almost-identical hand-rolled copies drifting apart over time.

// Same icon+color pairing as the lead workspace's own TemperatureBadge
// (Snowflake/Sun/Flame), just sized for a compact card chip.
export const TEMP_CHIP: Record<string, { icon: LucideIcon; className: string }> = {
  Cold: { icon: Snowflake, className: "bg-sky-500/10 text-sky-600" },
  Warm: { icon: Sun, className: "bg-amber-500/10 text-amber-600" },
  Hot: { icon: Flame, className: "bg-orange-500/10 text-orange-600" },
  VeryHot: { icon: Flame, className: "bg-red-500/10 text-red-600" },
};

export function TemperatureChip({ temperature }: { temperature: string }) {
  const temp = TEMP_CHIP[temperature];
  if (!temp) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[9.5px] font-bold sm:px-1.5 sm:text-[10.5px]",
        temp.className,
      )}
    >
      <temp.icon className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> {temperature}
    </span>
  );
}

// A follow-up due today or already overdue gets called out in the same
// warning color as AmoCRM's own "due today" chip -- anything further out
// stays a plain muted chip so only what actually needs attention today
// pulls the eye.
function isFollowUpUrgent(iso: string | null): boolean {
  if (!iso) return false;
  const due = new Date(iso);
  const now = new Date();
  return due.setHours(0, 0, 0, 0) <= now.setHours(0, 0, 0, 0);
}

export function FollowUpChip({ label, iso }: { label: string; iso: string | null }) {
  if (!label || label === "—") return null;
  const urgent = isFollowUpUrgent(iso);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[9.5px] font-bold sm:px-1.5 sm:text-[10.5px]",
        urgent ? "bg-warning/15 text-[oklch(0.55_0.14_70)]" : "bg-muted text-muted-foreground",
      )}
    >
      <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> {label}
    </span>
  );
}

// A plain phone-number row -- no click-to-call button. A card is something
// a rep scans while triaging a column; the actual call happens after they
// open the lead, where the real call button (and its own telephony-error
// handling) already lives. A second, card-level call button duplicated that
// affordance on every card for no benefit and added visual noise.
export function LeadPhoneChip({ phone }: { phone: string }) {
  if (!phone) return null;

  return (
    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-muted px-1.5 py-1 sm:mt-2 sm:px-2 sm:py-1.5">
      <Phone className="h-2.5 w-2.5 shrink-0 text-muted-foreground sm:h-3 sm:w-3" />
      <span className="truncate text-[10.5px] font-semibold text-foreground sm:text-[11.5px]">
        {phone}
      </span>
    </div>
  );
}
