import { useEffect, useState } from "react";
import { Check, Palette, Pipette, RotateCcw } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SpectrumColorPicker } from "@/components/ui/spectrum-color-picker";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import {
  CATALOG_PALETTES,
  DEFAULT_ACCENT_ID,
  accentHex,
  hexToOklch,
  isDefaultAccent,
  resolveAccent,
  useAccent,
  type CatalogPalette,
} from "@/lib/accent";

// Settings > Shaxsiylashtirish > "Platforma rangi": the curated accent
// palette plus a free color picker. Applies live (lib/accent.ts rewrites
// the brand tokens), so the whole app -- buttons, charts, sidebar, logo,
// background waves -- recolors as you click, and the small preview here
// is just a focused sample of the same tokens.

// A miniature of the palette as the catalog presents it: the page
// background, a panel on it, and the accent + highlight on that panel.
function PaletteSwatch({ palette }: { palette: CatalogPalette }) {
  return (
    <span
      className="relative block h-16 w-full overflow-hidden rounded-lg ring-1 ring-black/10"
      style={{ background: palette.bg }}
    >
      <span
        className="absolute inset-x-2.5 bottom-0 top-2.5 rounded-t-md"
        style={{ background: palette.panel, boxShadow: "0 0 0 1px rgb(127 127 127 / 0.14)" }}
      >
        <span
          className="absolute left-2 top-2 h-1.5 w-10 rounded-full"
          style={{ background: palette.accent }}
        />
        <span
          className="absolute left-2 top-5 h-1 w-6 rounded-full opacity-40"
          style={{ background: palette.mode === "dark" ? "#ffffff" : "#000000" }}
        />
        <span
          className="absolute bottom-2 right-2 h-4 w-4 rounded-full"
          style={{ background: palette.accent }}
        />
        <span
          className="absolute bottom-2 right-7 h-4 w-4 rounded-full"
          style={{ background: palette.highlight }}
        />
      </span>
    </span>
  );
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function AccentColorPicker() {
  const { t } = useI18n();
  const { choice, setChoice } = useAccent();
  const { setDark } = useTheme();
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

      <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-subtle">
        {t("accent.recommended")}
      </p>
      <div className="mt-2 grid grid-cols-4 gap-3">
        {CATALOG_PALETTES.map((palette) => {
          const active = choice.id === palette.id;
          return (
            <button
              key={palette.id}
              type="button"
              onClick={() => {
                setChoice({ id: palette.id });
                // Each palette was designed for one theme (ten dark, two
                // light) -- switch to it so it looks like the catalog.
                setDark(palette.mode === "dark");
              }}
              aria-pressed={active}
              className={cn(
                "group relative flex flex-col gap-2 rounded-xl border bg-card p-2 text-left transition-all",
                active
                  ? "border-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-primary)_18%,transparent)]"
                  : "border-border hover:-translate-y-0.5 hover:border-primary/40",
              )}
            >
              <PaletteSwatch palette={palette} />
              <span className="flex min-w-0 items-center justify-between gap-2 px-0.5">
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold text-foreground">
                    {palette.name}
                  </span>
                  <span className="block truncate text-[10.5px] text-subtle">
                    {t(palette.mode === "dark" ? "accent.modeDark" : "accent.modeLight")}
                  </span>
                </span>
                {active && (
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

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
