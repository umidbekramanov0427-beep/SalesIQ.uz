import { useState, type ReactNode } from "react";
import { Check, RotateCcw, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The sliders button in a Bosh sahifa card's corner and the panel it
// opens: the card's own formula, view and rules (lib/home-card-settings.ts
// keeps them). Each card fills the panel with the sections that make sense
// for its number.

export function CardSettingsButton({
  title,
  changed,
  onReset,
  children,
  className,
}: {
  title: string;
  /** Something differs from the default: a dot on the button, "reset" enabled. */
  changed: boolean;
  onReset: () => void;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("cardset.open", { name: title })}
          title={t("cardset.title")}
          className={cn(
            "relative grid h-7 w-7 shrink-0 place-items-center rounded-lg text-subtle transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground",
            className,
          )}
        >
          <SlidersHorizontal className="h-[17px] w-[17px]" />
          {changed && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className="w-[340px] bg-popover/95 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-primary/12 text-[var(--primary-ink)]">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle">
              {t("cardset.title")}
            </p>
            <p className="truncate text-[14px] font-bold text-foreground">{title}</p>
          </div>
        </div>
        <div className="max-h-[min(70vh,560px)] space-y-4 overflow-y-auto px-4 py-3.5">
          {children}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
          <button
            type="button"
            disabled={!changed}
            onClick={onReset}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {t("cardset.reset")}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-8 rounded-lg bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110"
          >
            {t("cardset.done")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SettingSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section>
      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </p>
      {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-subtle">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Radio rows: a label and what exactly it counts. */
export function OptionList<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; desc?: string | undefined }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="space-y-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors",
              on
                ? "border-primary/60 bg-primary/[0.08]"
                : "border-border hover:border-primary/35 hover:bg-accent/50",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border",
              )}
            >
              {on && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-foreground">{o.label}</span>
              {o.desc && (
                <span className="mt-0.5 block text-[11.5px] leading-snug text-subtle">
                  {o.desc}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Card / chart / list -- tiles with a picture of each. */
export function ViewPicker<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon: LucideIcon }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-[12px] font-semibold transition-colors",
              on
                ? "border-primary/60 bg-primary/[0.08] text-foreground"
                : "border-border text-muted-foreground hover:border-primary/35 hover:text-foreground",
            )}
          >
            <Icon className={cn("h-5 w-5", on && "text-[var(--primary-ink)]")} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-foreground">{label}</span>
        {hint && <span className="block text-[11.5px] leading-snug text-subtle">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

/** A goal for the number: empty clears it. */
export function TargetInput({
  value,
  unit,
  onChange,
}: {
  value: number | null | undefined;
  unit: string;
  onChange: (v: number | null) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  function commit(raw: string) {
    const n = Number(raw.replace(/\s/g, "").replace(",", "."));
    onChange(raw.trim() && Number.isFinite(n) && n >= 0 ? n : null);
  }
  return (
    <div className="flex h-9 items-center rounded-xl border border-border bg-background focus-within:border-primary">
      <input
        inputMode="decimal"
        value={draft}
        placeholder={t("cardset.targetPh")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
        }}
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-[13px] font-semibold tabular-nums text-foreground outline-none placeholder:font-normal placeholder:text-subtle"
      />
      <span className="shrink-0 pr-3 text-[12px] text-subtle">{unit}</span>
    </div>
  );
}
