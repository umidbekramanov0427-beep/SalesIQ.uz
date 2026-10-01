import { Wallet } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type AmountRangeValue = { min: number | null; max: number | null };

export const EMPTY_AMOUNT_RANGE: AmountRangeValue = { min: null, max: null };

export function amountInRange(value: number, range: AmountRangeValue): boolean {
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
}

// Two side-by-side number inputs — leave one blank for an open-ended range
// (e.g. only "min" set means "this amount and above"), fill both for a
// closed range, or fill just one field with the same number twist for an
// exact-amount match.
export function AmountRangeFilter({
  value,
  onChange,
  label,
  className,
}: {
  value: AmountRangeValue;
  onChange: (v: AmountRangeValue) => void;
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();

  function parse(raw: string): number | null {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <div
      className={cn(
        "flex h-10 w-48 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-1.5 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40 hover:bg-accent",
        className,
      )}
    >
      <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold uppercase leading-tight tracking-wide text-subtle">
          {label ?? t("amountFilter.label")}
        </p>
        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            value={value.min ?? ""}
            onChange={(e) => onChange({ ...value, min: parse(e.target.value) })}
            placeholder={t("amountFilter.min")}
            className="w-full min-w-0 bg-transparent text-[13px] font-bold leading-tight text-foreground outline-none placeholder:font-normal placeholder:text-subtle"
          />
          <span className="shrink-0 text-xs text-subtle">{t("amountFilter.to")}</span>
          <input
            type="number"
            inputMode="decimal"
            value={value.max ?? ""}
            onChange={(e) => onChange({ ...value, max: parse(e.target.value) })}
            placeholder={t("amountFilter.max")}
            className="w-full min-w-0 bg-transparent text-[13px] font-bold leading-tight text-foreground outline-none placeholder:font-normal placeholder:text-subtle"
          />
        </div>
      </div>
    </div>
  );
}
