import { Clock, Flame, Loader2, Phone, Snowflake, Sun, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn, describeError } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useStartCall } from "@/hooks/use-crm-data";

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
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold",
        temp.className,
      )}
    >
      <temp.icon className="h-3 w-3" /> {temperature}
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
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold",
        urgent ? "bg-warning/15 text-[oklch(0.55_0.14_70)]" : "bg-muted text-muted-foreground",
      )}
    >
      <Clock className="h-3 w-3" /> {label}
    </span>
  );
}

// The phone-number row with an inline click-to-call button -- reuses the
// same useStartCall mutation the lead workspace's own call button fires,
// so dialing straight from a card behaves identically (toast on success,
// error surfaced if telephony isn't configured for the org).
export function LeadPhoneChip({ phone, leadId }: { phone: string; leadId: string }) {
  const { t } = useI18n();
  const startCall = useStartCall();
  if (!phone) return null;

  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-muted px-2 py-1.5">
      <span className="truncate text-[11.5px] font-semibold text-foreground">{phone}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (startCall.isPending) return;
          startCall.mutate(
            { toNumber: phone, leadId },
            {
              onSuccess: () => toast.success(t("lead.callStarted")),
              onError: (err) => toast.error(describeError(err, t("lead.callFailed"))),
            },
          );
        }}
        disabled={startCall.isPending}
        aria-label={t("lead.actionCall")}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {startCall.isPending ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
        ) : (
          <Phone className="h-2.5 w-2.5" />
        )}
      </button>
    </div>
  );
}
