import { useEffect, useState } from "react";
import { Check, Palette, Pipette, RotateCcw } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SpectrumColorPicker } from "@/components/ui/spectrum-color-picker";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  BRAND_PALETTE,
  DEFAULT_ACCENT_ID,
  accentHex,
  hexToOklch,
  isDefaultAccent,
  resolveAccent,
  useAccent,
} from "@/lib/accent";

// Settings > Shaxsiylashtirish > "Platforma rangi": the platform's own
// So'znavbat palette or any color of the user's choice. Applies live
// (lib/accent.ts rewrites the brand tokens), so the whole app -- buttons,
// charts, sidebar, logo, background waves -- recolors as you pick, and the
// small preview here is a sample of the same tokens.

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function AccentColorPicker() {
  const { t } = useI18n();
  const { choice, setChoice } = useAccent();
  const isCustom = choice.id === "custom" && !!choice.hex;
  const [hexInput, setHexInput] = useState(() =>
    isCustom ? choice.hex! : accentHex(resolveAccent(choice)),
  );

  // Keep the custom field showing the active color when a preset is picked.
  useEffect(() => {
    if (!isCustom) setHexInput(accentHex(resolveAccent(choice)));
  }, [choice, isCustom]);

  function applyCustom(hex: string) {
    if (!HEX_RE.test(hex) || !hexToOklch(hex)) return;
    setChoice({ id: "custom", hex: hex.toLowerCase() });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Palette className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-foreground">{t("accent.title")}</p>
            <p className="text-xs text-subtle">{t("accent.desc")}</p>
          </div>
        </div>
        {!isDefaultAccent(choice) && (
          <button
            type="button"
            onClick={() => setChoice({ id: DEFAULT_ACCENT_ID })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("accent.reset")}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setChoice({ id: DEFAULT_ACCENT_ID })}
        aria-pressed={!isCustom}
        className={cn(
          "mt-4 flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
          !isCustom ? "border-primary" : "border-border hover:border-primary/40",
        )}
      >
        <span className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10">
          {[BRAND_PALETTE.bg, BRAND_PALETTE.accent, BRAND_PALETTE.highlight].map((c) => (
            <span key={c} className="h-9 w-7" style={{ background: c }} />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-foreground">
            {BRAND_PALETTE.name}
          </span>
          <span className="block text-xs text-subtle">{t("accent.defaultHint")}</span>
        </span>
        {!isCustom && (
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3 w-3" />
          </span>
        )}
      </button>

      <div className="mt-4 grid grid-cols-[1fr_auto] items-stretch gap-4">
        <div
          className={cn(
            "rounded-xl border bg-card p-3",
            isCustom ? "border-primary" : "border-border",
          )}
        >
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <Pipette className="h-3.5 w-3.5 text-primary" />
            {t("accent.custom")}
          </p>
          <p className="mt-0.5 text-xs text-subtle">{t("accent.customHint")}</p>
          <div className="mt-3">
            <SpectrumColorPicker
              value={hexInput}
              active={isCustom}
              label={t("accent.pickColor")}
              setLabel={t("accent.set")}
              onSet={(hex) => {
                setHexInput(hex);
                applyCustom(hex);
              }}
            />
          </div>
        </div>

        {/* Live sample of the same tokens the rest of the app now uses. */}
        <div className="flex w-64 flex-col justify-between gap-3 rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-[13px] font-extrabold tracking-tight text-[var(--brand-wordmark)]">
              SalesIQ
            </span>
            <span className="ml-auto rounded-md bg-mint px-1.5 py-0.5 text-[10px] font-semibold text-mint-foreground">
              {t("accent.preview")}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-2/3 rounded-full bg-primary" />
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              {t("accent.sampleButton")}
            </span>
            <span className="flex gap-1">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className="h-3 w-3 rounded-full"
                  style={{ background: `var(--wave-${n})` }}
                />
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
