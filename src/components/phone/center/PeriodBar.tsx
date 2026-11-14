import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { PcPeriod, PcPeriodKey } from "./PhoneCenterPage";

/** A section's own period buttons (each 5TEL section offers its own set). */
export function PeriodBar({
  options,
  value,
  onChange,
  withRange = false,
  className,
}: {
  options: Exclude<PcPeriodKey, "custom">[];
  value: PcPeriod;
  onChange: (p: PcPeriod) => void;
  /** «Sana tanlash»: any from–to. */
  withRange?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.custom?.from ?? "");
  const [to, setTo] = useState(value.custom?.to ?? "");
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div role="tablist" className="ctl-track inline-flex items-center gap-0.5 rounded-xl p-0.5">
        {options.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={value.key === k}
            data-state={value.key === k ? "active" : "inactive"}
            onClick={() => onChange({ key: k })}
            className="ctl-tab h-9 rounded-lg px-3.5 text-[13px] font-semibold"
          >
            {t(`ptel.period.${k}`)}
          </button>
        ))}
      </div>
      {withRange && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-state={value.key === "custom" ? "active" : "inactive"}
              className={cn(
                "ctl-soft inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold",
                value.key === "custom" && "text-primary",
              )}
            >
              <CalendarRange className="h-4 w-4" />
              {value.key === "custom" && value.custom
                ? `${value.custom.from} — ${value.custom.to}`
                : t("ptel.period.pick")}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3 p-3">
            <label className="block text-[13px] font-semibold text-muted-foreground">
              {t("ptel.period.from")}
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2.5 text-[14px] text-foreground"
              />
            </label>
            <label className="block text-[13px] font-semibold text-muted-foreground">
              {t("ptel.period.to")}
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2.5 text-[14px] text-foreground"
              />
            </label>
            <button
              type="button"
              disabled={!from || !to || from > to}
              onClick={() => {
                onChange({ key: "custom", custom: { from, to } });
                setOpen(false);
              }}
              className="h-10 w-full rounded-lg bg-primary text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {t("ptel.apply")}
            </button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
