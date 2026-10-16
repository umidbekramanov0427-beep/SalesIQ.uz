import { Check, Monitor, Moon, Sun, SwatchBook } from "lucide-react";
import { CATALOG_PALETTES, DEFAULT_ACCENT_ID, useAccent } from "@/lib/accent";
import { useI18n } from "@/lib/i18n";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Settings → Shaxsiylashtirish → Mavzu: day / night / follow the device, and
// ready themes that set the mode and the palette in one click (the full
// palette list stays in "Platforma rangi" below).

type Look = { bg: string; panel: string; accent: string; highlight: string; text: string };

type Preset = {
  id: string;
  titleKey: string;
  descKey: string;
  mode: Exclude<ThemeMode, "system">;
  accent: string;
  look: Look;
};

const palette = (id: string) => CATALOG_PALETTES.find((p) => p.id === id)!;
const fromPalette = (id: string): Look => {
  const p = palette(id);
  return { bg: p.bg, panel: p.panel, accent: p.accent, highlight: p.highlight, text: "#ffffff" };
};

const PRESETS: Preset[] = [
  {
    id: "day",
    titleKey: "themes.day",
    descKey: "themes.dayDesc",
    mode: "light",
    accent: DEFAULT_ACCENT_ID,
    look: {
      bg: "#eef1f7",
      panel: "#ffffff",
      accent: "#0552fb",
      highlight: "#22c3ee",
      text: "#0f172a",
    },
  },
  {
    id: "night",
    titleKey: "themes.night",
    descKey: "themes.nightDesc",
    mode: "dark",
    accent: DEFAULT_ACCENT_ID,
    look: {
      bg: "#0b0f17",
      panel: "#151b26",
      accent: "#3b82f6",
      highlight: "#22c3ee",
      text: "#ffffff",
    },
  },
  {
    id: "nexora-navy",
    titleKey: "themes.navy",
    descKey: "themes.navyDesc",
    mode: "dark",
    accent: "nexora-navy",
    look: fromPalette("nexora-navy"),
  },
  {
    id: "premium-gold",
    titleKey: "themes.gold",
    descKey: "themes.goldDesc",
    mode: "dark",
    accent: "premium-gold",
    look: fromPalette("premium-gold"),
  },
];

const MODES: { mode: ThemeMode; icon: typeof Sun; key: string }[] = [
  { mode: "light", icon: Sun, key: "themes.modeLight" },
  { mode: "dark", icon: Moon, key: "themes.modeDark" },
  { mode: "system", icon: Monitor, key: "themes.modeSystem" },
];

// A tiny dashboard drawn in the theme's own colors.
function Preview({ look, glow }: { look: Look; glow: boolean }) {
  return (
    <span
      className="relative block h-24 w-full overflow-hidden rounded-xl ring-1 ring-black/10"
      style={{
        background: glow
          ? `radial-gradient(120% 90% at 10% -10%, ${look.accent}44, transparent 60%), radial-gradient(90% 80% at 100% 0%, ${look.highlight}33, transparent 60%), ${look.bg}`
          : look.bg,
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

  const activePreset = PRESETS.find(
    (p) =>
      p.accent === choice.id &&
      (p.accent !== DEFAULT_ACCENT_ID || p.mode === (dark ? "dark" : "light")),
  )?.id;

  function apply(p: Preset) {
    setMode(p.mode);
    setChoice({ id: p.accent });
  }

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

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PRESETS.map((p) => {
          const active = activePreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => apply(p)}
              aria-pressed={active}
              className={cn(
                "group relative rounded-2xl border bg-card p-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                active ? "border-primary ring-2 ring-primary/30" : "border-border",
              )}
            >
              <Preview look={p.look} glow={!!palette(p.accent)?.glow} />
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
