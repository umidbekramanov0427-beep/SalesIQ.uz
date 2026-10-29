import { Check, Monitor, Moon, Sun, SwatchBook } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_ACCENT_ID, GRAPHITE_PALETTE_ID, SAGE_PALETTE_ID, useAccent } from "@/lib/accent";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Settings → Shaxsiylashtirish → Mavzu: a color set (the platform's own
// SalesIQ colors, the calm "Sokin sage" or warm graphite + paper + gold),
// each by day or by night, or
// following the device. The set is saved like the accent (lib/accent.ts),
// the day/night mode like before (lib/theme.tsx).

type Look = { bg: string; panel: string; accent: string; highlight: string; text: string };
type PaletteLooks = { light: Look; dark: Look };

const PALETTE_LOOKS: Record<string, PaletteLooks> = {
  [DEFAULT_ACCENT_ID]: {
    light: {
      bg: "#e4e7ee",
      panel: "#ffffff",
      accent: "#0552fb",
      highlight: "#02f0fb",
      text: "#111827",
    },
    dark: {
      bg: "#070e1f",
      panel: "#0a142b",
      accent: "#1f6bff",
      highlight: "#5b2efa",
      text: "#ffffff",
    },
  },
  [SAGE_PALETTE_ID]: {
    light: {
      bg: "#f4f7f4",
      panel: "#ffffff",
      accent: "#739b81",
      highlight: "#a9c4b0",
      text: "#2e3c33",
    },
    dark: {
      bg: "#252e29",
      panel: "#303c35",
      accent: "#9bc0a5",
      highlight: "#6f8f79",
      text: "#e6ece8",
    },
  },
  [GRAPHITE_PALETTE_ID]: {
    light: {
      bg: "#f4f0e4",
      panel: "#fffdf7",
      accent: "#e6cf45",
      highlight: "#1d1e19",
      text: "#1d1e19",
    },
    dark: {
      bg: "#1d1e19",
      panel: "#292a23",
      accent: "#e6cf45",
      highlight: "#8e8b7f",
      text: "#f4f1e8",
    },
  },
};

const PALETTE_OPTIONS = [
  {
    id: DEFAULT_ACCENT_ID,
    titleKey: "themes.paletteSalesiq",
    descKey: "themes.paletteSalesiqDesc",
  },
  { id: SAGE_PALETTE_ID, titleKey: "themes.paletteSage", descKey: "themes.paletteSageDesc" },
  {
    id: GRAPHITE_PALETTE_ID,
    titleKey: "themes.paletteGraphite",
    descKey: "themes.paletteGraphiteDesc",
  },
];

const LOOKS: {
  mode: Exclude<ThemeMode, "system">;
  titleKey: string;
  descKey: string;
}[] = [
  { mode: "light", titleKey: "themes.day", descKey: "themes.dayDesc" },
  { mode: "dark", titleKey: "themes.night", descKey: "themes.nightDesc" },
];

const MODES: { mode: ThemeMode; icon: typeof Sun; key: string }[] = [
  { mode: "light", icon: Sun, key: "themes.modeLight" },
  { mode: "dark", icon: Moon, key: "themes.modeDark" },
  { mode: "system", icon: Monitor, key: "themes.modeSystem" },
];

// A tiny dashboard drawn in the theme's own colors.
function Preview({ look }: { look: Look }) {
  return (
    <span
      className="relative block h-24 w-full overflow-hidden rounded-xl ring-1 ring-black/10"
      style={{
        background: look.bg,
      }}
    >
      <span
        className="absolute inset-y-2 left-2 w-3 rounded-md"
        style={{ background: look.panel }}
      />
      <span className="absolute left-7 right-2 top-2 grid grid-cols-3 gap-1.5">
        {[0.55, 0.8, 0.4].map((w, i) => (
          <span key={i} className="block h-7 rounded-md p-1.5" style={{ background: look.panel }}>
            <span
              className="block h-1 rounded-full"
              style={{ width: `${w * 100}%`, background: i === 1 ? look.highlight : look.accent }}
            />
            <span
              className="mt-1.5 block h-1.5 w-1/2 rounded-full opacity-60"
              style={{ background: look.text }}
            />
          </span>
        ))}
      </span>
      <span
        className="absolute bottom-2 left-7 right-2 flex h-9 items-end gap-1 rounded-md px-2 pb-1.5"
        style={{ background: look.panel }}
      >
        {[0.45, 0.7, 0.55, 0.9, 0.6, 0.75].map((h, i) => (
          <span
            key={i}
            className="block flex-1 rounded-t-sm"
            style={{
              height: `${h * 100}%`,
              background: i === 3 ? look.highlight : look.accent,
              opacity: i === 3 ? 1 : 0.75,
            }}
          />
        ))}
      </span>
    </span>
  );
}

export function ThemePicker() {
  const { t } = useI18n();
  const { mode, dark, setMode } = useTheme();
  const { choice, setChoice } = useAccent();
  // A custom accent keeps the SalesIQ neutrals, so it previews as SalesIQ.
  const paletteId = PALETTE_LOOKS[choice.id] ? choice.id : DEFAULT_ACCENT_ID;
  const looks = PALETTE_LOOKS[paletteId]!;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SwatchBook className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-foreground">{t("themes.title")}</p>
            <p className="text-xs text-muted-foreground">{t("themes.desc")}</p>
          </div>
        </div>
        {/* Day / night / device */}
        <div role="radiogroup" className="flex rounded-xl border border-border bg-background p-1">
          {MODES.map(({ mode: m, icon: Icon, key }) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t(key)}
            </button>
          ))}
        </div>
      </div>

      {/* Color set: each card shows its day and night halves. */}
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("themes.palette")}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {PALETTE_OPTIONS.map((o) => {
          const active = choice.id === o.id;
          const l = PALETTE_LOOKS[o.id]!;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setChoice({ id: o.id })}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
                active
                  ? "border-primary ring-2 ring-primary/25"
                  : "border-border hover:border-primary/40",
              )}
            >
              <span className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10">
                {[l.light.bg, l.light.accent, l.dark.panel, l.dark.accent].map((c, i) => (
                  <span key={i} className="h-10 w-6" style={{ background: c }} />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-foreground">
                  {t(o.titleKey)}
                </span>
                <span className="block text-xs text-muted-foreground">{t(o.descKey)}</span>
              </span>
              {active && (
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {LOOKS.map((p) => {
          const active = mode !== "system" && (p.mode === "dark") === dark;
          return (
            <button
              key={p.mode}
              type="button"
              onClick={() => setMode(p.mode)}
              aria-pressed={active}
              className={cn(
                "group relative rounded-2xl border bg-card p-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                active ? "border-primary ring-2 ring-primary/30" : "border-border",
              )}
            >
              <Preview look={looks[p.mode]} />
              <span className="mt-2.5 flex items-center justify-between gap-2 px-0.5">
                <span className="text-sm font-semibold text-foreground">{t(p.titleKey)}</span>
                {active && (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </span>
              <span className="block px-0.5 text-xs text-muted-foreground">{t(p.descKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
