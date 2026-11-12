import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/lib/i18n";

// The period row shared by Analitika, Bosh sahifa's reports and the
// marketing panel: today / this week / month / quarter / year, or two dates.

export type Period = { from: string; to: string };
export type Preset = "today" | "week" | "month" | "quarter" | "year" | "custom";
export const PRESETS: Preset[] = ["today", "week", "month", "quarter", "year", "custom"];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function presetPeriod(p: Exclude<Preset, "custom">): Period {
  const now = new Date();
  const to = ymd(now);
  const d = new Date(now);
  if (p === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (p === "month") d.setDate(1);
  if (p === "quarter") d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
  if (p === "year") d.setMonth(0, 1);
  return { from: ymd(d), to };
}

export function PeriodPicker({
  preset,
  period,
  onPreset,
  onPeriod,
}: {
  preset: Preset;
  period: Period;
  onPreset: (p: Preset) => void;
  onPeriod: (p: Period) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Segmented
        value={preset}
        onChange={(p) => {
          onPreset(p);
          if (p !== "custom") onPeriod(presetPeriod(p));
        }}
        options={PRESETS.map((p) => ({ value: p, label: t(`an.period.${p}`) }))}
      />
      {preset === "custom" && (
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={period.from}
            max={period.to}
            onChange={(e) => e.target.value && onPeriod({ ...period, from: e.target.value })}
            className="h-8 bg-transparent text-[13px] text-foreground outline-none"
            aria-label={t("an.from")}
          />
          <span className="text-muted-foreground">—</span>
          <input
            type="date"
            value={period.to}
            min={period.from}
            onChange={(e) => e.target.value && onPeriod({ ...period, to: e.target.value })}
            className="h-8 bg-transparent text-[13px] text-foreground outline-none"
            aria-label={t("an.to")}
          />
        </div>
      )}
    </div>
  );
}

/** The picker's state: this month to begin with. */
export function usePeriodState(initial: Exclude<Preset, "custom"> = "month") {
  const [preset, setPreset] = useState<Preset>(initial);
  const [period, setPeriod] = useState<Period>(() => presetPeriod(initial));
  return { preset, setPreset, period, setPeriod };
}
