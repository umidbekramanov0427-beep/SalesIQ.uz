import { Check, Monitor, Moon, Sun, SwatchBook } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Settings → Shaxsiylashtirish → Mavzu: the platform's So'znavbat palette
// by day or by night, or following the device.

type Look = { bg: string; panel: string; accent: string; highlight: string; text: string };

const LOOKS: {
  mode: Exclude<ThemeMode, "system">;
  titleKey: string;
  descKey: string;
  look: Look;
}[] = [
  {
    mode: "light",
    titleKey: "themes.day",
    descKey: "themes.dayDesc",
    look: {
      bg: "#f3efe4",
      panel: "#fffdf7",
      accent: "#1f4a33",
      highlight: "#a7c957",
      text: "#1c2a22",
    },
  },
  {
    mode: "dark",
    titleKey: "themes.night",
    descKey: "themes.nightDesc",
    look: {
      bg: "#0f1813",
      panel: "#17231c",
      accent: "#a7c957",
      highlight: "#5f8f4a",
      text: "#ffffff",
    },
  },
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
              <Preview look={p.look} />
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
