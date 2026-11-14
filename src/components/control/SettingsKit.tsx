import { useEffect, useState, type ReactNode } from "react";
import { Eye, Loader2, RotateCcw, Save, Settings2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useControlSettings, useSaveControlSettings } from "@/hooks/use-crm-data";
import type { ControlSettings } from "@/lib/control-settings";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";

// Shared pieces of Nazorat's «Sozlash» panes: the Ko'rinish / Sozlash
// switch above each tab, a draft of the company's settings with a save bar,
// and small inputs.

export type PaneMode = "view" | "settings";

/** «Ko'rinish | Sozlash» above a Nazorat tab (the switch only for heads). */
export function PaneSwitch({
  mode,
  onChange,
  canManage,
}: {
  mode: PaneMode;
  onChange: (m: PaneMode) => void;
  canManage: boolean;
}) {
  const { t } = useI18n();
  if (!canManage) return null;
  return (
    <div role="tablist" className="ctl-track mb-5 inline-flex rounded-xl p-1">
      {(
        [
          ["view", Eye, t("ctl.view")],
          ["settings", Settings2, t("ctl.settings")],
        ] as const
      ).map(([m, Icon, label]) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => onChange(m)}
          className="ctl-tab inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold"
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** A draft of the company's Nazorat settings; save writes it, reset throws it away. */
export function useControlDraft() {
  const saved = useControlSettings();
  const key = JSON.stringify(saved);
  const [draft, setDraft] = useState<ControlSettings>(saved);
  useEffect(() => setDraft(JSON.parse(key) as ControlSettings), [key]);
  const saver = useSaveControlSettings();
  const { t } = useI18n();
  return {
    draft,
    setDraft,
    dirty: JSON.stringify(draft) !== key,
    reset: () => setDraft(JSON.parse(key) as ControlSettings),
    saving: saver.isPending,
    save: async () => {
      try {
        await saver.save(draft);
        toast.success(t("ctl.saved"));
      } catch (err) {
        toast.error(describeError(err, t("ctl.saveFailed")));
      }
    },
  };
}

/** The bar under a settings pane: what changed, Bekor qilish, Saqlash. */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onReset,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "sticky bottom-3 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur transition-colors",
        dirty ? "border-primary/40 bg-card/95" : "border-border bg-card/80",
      )}
    >
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <SlidersHorizontal className="h-4 w-4" />
        {dirty ? t("ctl.unsaved") : t("ctl.allSaved")}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={onReset}
          className="ctl-soft inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          {t("common.cancel")}
        </button>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={onSave}
          className="ctl-lit inline-flex h-10 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

export const fieldCls =
  "h-10 rounded-xl border border-border bg-card px-3 text-[14px] tabular-nums text-foreground outline-none transition-colors focus:border-primary disabled:opacity-60";

/** 1000000000 → "1 000 000 000" (the fraction, if any, left as typed). */
function group(raw: string): string {
  const [int = "", ...rest] = raw.split(/(?=[.,])/);
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + rest.join("");
}

/** A number field that keeps what is typed until it is a number; thousands are spaced. */
export function NumberField({
  value,
  onChange,
  min = 0,
  max,
  step,
  suffix,
  className,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string | undefined;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value == null ? "" : group(String(value)));
  useEffect(() => setText(value == null ? "" : group(String(value))), [value]);
  return (
    <span className="inline-flex items-center gap-2">
      <input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.,]/g, "");
          setText(group(raw));
          if (!raw) return onChange(null);
          const n = Number(raw.replace(",", "."));
          if (!Number.isFinite(n)) return;
          onChange(Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, n)));
        }}
        step={step}
        className={cn(fieldCls, "w-[130px]", className)}
      />
      {suffix && <span className="text-[13px] text-muted-foreground">{suffix}</span>}
    </span>
  );
}

/** Chips for a short list of words (Enter or comma adds one). */
export function TagsField({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const w = text.trim().toLowerCase();
    if (w && !value.includes(w)) onChange([...value, w].slice(0, 20));
    setText("");
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card px-2 py-1.5">
      {value.map((w) => (
        <span
          key={w}
          className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-[12.5px] font-semibold text-[var(--primary-ink)]"
        >
          {w}
          <button
            type="button"
            aria-label="×"
            onClick={() => onChange(value.filter((x) => x !== w))}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        className="h-7 min-w-[120px] flex-1 bg-transparent px-1 text-[13px] outline-none"
      />
    </div>
  );
}

/** A choice of a few options as one row of segments. */
export function Choice<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="ctl-track inline-flex flex-wrap rounded-xl p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className="ctl-tab h-8 rounded-lg px-3 text-[12.5px] font-semibold"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
