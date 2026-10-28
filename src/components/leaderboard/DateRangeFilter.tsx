import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useI18n } from "@/lib/i18n";
import { datePresetRange } from "@/lib/date-presets";

// `preset` names the preset the range came from ("7d", ...; "custom" for
// picked dates), so a saved filter can recompute it (see saved-filters.ts).
export type DateFilterValue = {
  from: Date | null;
  to: Date | null;
  label: string;
  preset?: string;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateFilterValue;
  onChange: (v: DateFilterValue) => void;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(
    value.from && value.to ? { from: value.from, to: value.to } : undefined,
  );

  const presets: { key: string; label: string }[] = [
    { key: "today", label: t("lb.presetToday") },
    { key: "yesterday", label: t("lb.presetYesterday") },
    { key: "7d", label: t("lb.preset7d") },
    { key: "month", label: t("lb.presetMonth") },
    { key: "all", label: t("lb.presetAll") },
  ];

  function applyPreset(p: (typeof presets)[number]) {
    const r = datePresetRange(p.key);
    onChange({ from: r?.from ?? null, to: r?.to ?? null, label: p.label, preset: p.key });
    setDraft(r ? { from: r.from, to: r.to } : undefined);
    setOpen(false);
  }

  function applyCustom() {
    if (!draft?.from) return;
    const from = startOfDay(draft.from);
    const to = endOfDay(draft.to ?? draft.from);
    const label = `${from.toLocaleDateString(lang)} – ${to.toLocaleDateString(lang)}`;
    onChange({ from, to, label, preset: "custom" });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-32 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-1 text-left outline-none transition-colors hover:bg-accent focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/40 sm:h-11 sm:w-48 sm:gap-2 sm:px-2.5 sm:py-1.5 phone:h-[54px] phone:w-auto phone:min-w-0 phone:flex-1 phone:basis-[calc(50%-8px)] phone:gap-2 phone:rounded-2xl phone:px-3"
        >
          <CalendarDays className="h-3 w-3 shrink-0 text-muted-foreground sm:h-3.5 sm:w-3.5 phone:h-4 phone:w-4" />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase leading-tight tracking-wide text-subtle sm:text-[10px] phone:text-[10px]">
              {t("lb.dateRangeLabel")}
            </p>
            <p className="truncate text-[11px] font-bold leading-tight text-foreground sm:text-[14px] phone:text-[15px] phone:font-semibold">
              {value.label}
            </p>
          </div>
          <ChevronDown className="h-3 w-3 shrink-0 text-subtle sm:h-3.5 sm:w-3.5 phone:h-4 phone:w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto gap-3 p-3 phone:flex-col">
        <div className="flex w-40 flex-col gap-1 border-r border-border pr-3 phone:w-full phone:flex-row phone:flex-wrap phone:border-b phone:border-r-0 phone:pb-3 phone:pr-0">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div>
          <Calendar mode="range" selected={draft} onSelect={setDraft} numberOfMonths={1} />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!draft?.from}
            className="mt-2 w-full rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {t("lb.applyRange")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
