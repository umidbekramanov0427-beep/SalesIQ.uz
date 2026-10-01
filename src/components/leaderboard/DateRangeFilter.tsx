import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useI18n } from "@/lib/i18n";

export type DateFilterValue = { from: Date | null; to: Date | null; label: string };

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

  const presets: { key: string; label: string; range: () => { from: Date; to: Date } | null }[] = [
    {
      key: "today",
      label: t("lb.presetToday"),
      range: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }),
    },
    {
      key: "yesterday",
      label: t("lb.presetYesterday"),
      range: () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return { from: startOfDay(d), to: endOfDay(d) };
      },
    },
    {
      key: "7d",
      label: t("lb.preset7d"),
      range: () => {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 6);
        return { from: startOfDay(from), to: endOfDay(to) };
      },
    },
    {
      key: "month",
      label: t("lb.presetMonth"),
      range: () => {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 29);
        return { from: startOfDay(from), to: endOfDay(to) };
      },
    },
    { key: "all", label: t("lb.presetAll"), range: () => null },
  ];

  function applyPreset(p: (typeof presets)[number]) {
    const r = p.range();
    onChange({ from: r?.from ?? null, to: r?.to ?? null, label: p.label });
    setDraft(r ? { from: r.from, to: r.to } : undefined);
    setOpen(false);
  }

  function applyCustom() {
    if (!draft?.from) return;
    const from = startOfDay(draft.from);
    const to = endOfDay(draft.to ?? draft.from);
    const label = `${from.toLocaleDateString(lang)} – ${to.toLocaleDateString(lang)}`;
    onChange({ from, to, label });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-32 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-1 text-left outline-none transition-colors hover:bg-accent focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/40 sm:h-10 sm:w-48 sm:gap-2 sm:px-2.5 sm:py-1.5"
        >
          <CalendarDays className="h-3 w-3 shrink-0 text-muted-foreground sm:h-3.5 sm:w-3.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-bold uppercase leading-tight tracking-wide text-subtle sm:text-[9px]">
              {t("lb.dateRangeLabel")}
            </p>
            <p className="truncate text-[11px] font-bold leading-tight text-foreground sm:text-[13px]">
              {value.label}
            </p>
          </div>
          <ChevronDown className="h-3 w-3 shrink-0 text-subtle sm:h-3.5 sm:w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto gap-3 p-3">
        <div className="flex w-40 flex-col gap-1 border-r border-border pr-3">
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
