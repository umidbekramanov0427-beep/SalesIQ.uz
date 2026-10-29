import { useCallback, useEffect, useState } from "react";

// User-chosen accent (brand) color -- Settings > Shaxsiylashtirish.
//
// Every brand-colored token in styles.css (primary/ring, the mint card
// tints, the sidebar's active/group tints, chart-1, the card glow and light
// sweep, the hero card, the backdrop/login waves, the loader mark and the
// PNG logo's tint filter) is regenerated from one accent and written as a
// small stylesheet (<style id="salesiq-accent">) that overrides the
// defaults for both themes. The defaults in styles.css stay the original
// SalesIQ sapphire, so choosing it simply removes the override.
//
// Values are written as concrete oklch(...) literals, never calc()/var()
// chains: ECharts reads --primary through getComputedStyle and paints it
// on a <canvas>, which can't resolve those.
//
// Personal, like light/dark mode: saved in this browser only. The
// generated CSS is cached in localStorage too, so an inline script in the
// document <head> (ACCENT_BOOT_SCRIPT) can apply it before first paint
// instead of flashing the default blue on every load.

export type AccentSpec = {
  h: number; // OKLCH hue
  c: number; // chroma of the light-mode primary
  l: number; // lightness of the light-mode primary
  ld: number; // lightness of the dark-mode primary
  cd: number; // chroma of the dark-mode primary
  hd?: number; // hue of the dark-mode primary, when it differs from h
  // How far the secondary brand colors (the waves' cyan/violet, the loader
  // gradient) fan out in hue around the accent. 1 = the original artwork's
  // spread, right for blues/violets; warmer and greener accents use less,
  // or a green accent's "cyan" wave would swing all the way to yellow.
  spread?: number;
};

// Ready-made palettes: a whole look for day and night, not just an accent.
// Each restates the neutral tokens too (page, cards, text, borders), so the
// app's structure stays the same and only its colors change. The status
// colors (success/warning/destructive, charts 2-5) are left alone: they
// mean something, they are not decoration.
export type Palette = {
  hex: string; // the day accent; also the swatch
  light: Record<string, string>;
  dark: Record<string, string>;
  // Extra rules, written after the token blocks (`&` stands for the
  // palette's own root selector).
  css?: string;
};

// "Sokin sage": a calm grey-green. The green is only the accent -- primary
// buttons, the active menu item, selected states and key icons; everything
// else is soft neutral sage-grey.
const SAGE: Palette = {
  hex: "#739b81",
  light: {
    "--background": "#f4f7f4",
    "--canvas": "#f4f7f4",
    "--surface": "#eff4f0",
    "--dialog": "#ffffff",
    "--card": "#ffffff",
    "--card-foreground": "#2e3c33",
    "--popover": "#ffffff",
    "--popover-foreground": "#2e3c33",
    "--foreground": "#2e3c33",
    "--secondary": "#eff4f0",
    "--secondary-foreground": "#2e3c33",
    "--muted": "#edf2ee",
    "--muted-foreground": "#718096",
    "--subtle": "#8a968f",
    "--accent": "#e8f0e9",
    "--accent-foreground": "#2e3c33",
    "--popover-border": "#c9d5cb",
    "--border": "#dee6df",
    "--input": "#dee6df",
    "--primary": "#739b81",
    "--primary-foreground": "#ffffff",
    "--primary-ink": "#4f7a5e",
    "--ring": "#739b81",
    "--chart-1": "#739b81",
    "--mint": "#e8f0e9",
    "--mint-border": "#d3e2d6",
    "--mint-foreground": "#46705a",
    "--sidebar": "#ffffff",
    "--sidebar-foreground": "#2e3c33",
    "--sidebar-muted": "#718096",
    "--sidebar-active": "#e8f0e9",
    "--sidebar-active-foreground": "#3c6a4e",
    "--sidebar-border": "#dee6df",
    "--sidebar-group": "#e8f0e9",
    "--shadow-glow": "0 14px 36px -24px rgb(46 60 51 / 0.18)",
    "--brand-wordmark": "#739b81",
    "--hero-from": "#34443a",
    "--hero-to": "#252e29",
    "--hero-fg": "#e6ece8",
    "--hero-muted": "#a8b3aa",
    "--auth-from": "#252e29",
    "--auth-via": "#2b3630",
    "--auth-to": "#1d2420",
    "--primary-ondark": "#9bc0a5",
    "--primary-ondark-foreground": "#1d2620",
  },
  dark: {
    "--background": "#252e29",
    "--canvas": "#252e29",
    "--surface": "#2a342e",
    "--dialog": "#303c35",
    "--card": "#303c35",
    "--card-foreground": "#e6ece8",
    "--popover": "#36433b",
    "--popover-foreground": "#e6ece8",
    "--foreground": "#e6ece8",
    "--secondary": "#2a342e",
    "--secondary-foreground": "#e6ece8",
    "--muted": "#3a4840",
    "--muted-foreground": "#a8b3aa",
    "--subtle": "#8c978f",
    "--accent": "#3a4c43",
    "--accent-foreground": "#e6ece8",
    "--popover-border": "#55665c",
    "--border": "#46564c",
    "--input": "#36433b",
    "--primary": "#9bc0a5",
    "--primary-foreground": "#1d2620",
    "--primary-ink": "#9bc0a5",
    "--ring": "#9bc0a5",
    "--chart-1": "#9bc0a5",
    "--mint": "#3a4c43",
    "--mint-border": "#46564c",
    "--mint-foreground": "#c4dccb",
    "--sidebar": "#2a342e",
    "--sidebar-foreground": "#e6ece8",
    "--sidebar-muted": "#a8b3aa",
    "--sidebar-active": "#3a4c43",
    "--sidebar-active-foreground": "#e6ece8",
    "--sidebar-border": "#3a4840",
    "--sidebar-group": "#3a4c43",
    "--shadow-glow": "0 16px 40px -20px rgb(0 0 0 / 0.45)",
  },
  css: `&:not(.dark) .text-primary { color: var(--primary-ink); }
`,
};

// "Grafit + qog'oz + oltin": warm graphite at night, cream paper by day,
// and a soft gold accent kept for the main buttons, the active item and
// charts. Gold text would not read on paper, so by day the text that wears
// the accent (links, active tabs, key icons) is a deep olive-gold instead,
// and the gold buttons carry dark text.
const GRAPHITE: Palette = {
  hex: "#e6cf45",
  light: {
    "--background": "#f4f0e4",
    "--canvas": "#f4f0e4",
    "--surface": "#eee9da",
    "--dialog": "#fffdf7",
    "--card": "#fffdf7",
    "--card-foreground": "#1d1e19",
    "--popover": "#fffdf7",
    "--popover-foreground": "#1d1e19",
    "--foreground": "#1d1e19",
    "--secondary": "#eee9da",
    "--secondary-foreground": "#1d1e19",
    "--muted": "#ece7d8",
    "--muted-foreground": "#6b6a5e",
    "--subtle": "#8f8c7e",
    "--accent": "#eae4d2",
    "--accent-foreground": "#1d1e19",
    "--popover-border": "#d3ccb7",
    "--border": "#e2dccb",
    "--input": "#e2dccb",
    "--primary": "#e6cf45",
    "--primary-foreground": "#1d1e19",
    "--primary-ink": "#7a6a12",
    "--ring": "#c9b232",
    "--chart-1": "#d4bc2e",
    "--mint": "#fbf5d6",
    "--mint-border": "#efe3a0",
    "--mint-foreground": "#6e5f0e",
    "--sidebar": "#fffdf7",
    "--sidebar-foreground": "#1d1e19",
    "--sidebar-muted": "#6b6a5e",
    "--sidebar-active": "#1d1e19",
    "--sidebar-active-foreground": "#f4f1e8",
    "--sidebar-border": "#e2dccb",
    "--sidebar-group": "#ece7d8",
    "--shadow-glow": "0 14px 36px -24px rgb(29 30 25 / 0.22)",
    "--brand-wordmark": "#1d1e19",
    "--hero-from": "#292a23",
    "--hero-to": "#1d1e19",
    "--hero-fg": "#f4f1e8",
    "--hero-muted": "#b8b5a8",
    "--auth-from": "#1d1e19",
    "--auth-via": "#292a23",
    "--auth-to": "#16170f",
    "--primary-ondark": "#e6cf45",
    "--primary-ondark-foreground": "#1d1e19",
  },
  dark: {
    "--background": "#1d1e19",
    "--canvas": "#1d1e19",
    "--surface": "#22231d",
    "--dialog": "#292a23",
    "--card": "#292a23",
    "--card-foreground": "#f4f1e8",
    "--popover": "#2f3029",
    "--popover-foreground": "#f4f1e8",
    "--foreground": "#f4f1e8",
    "--secondary": "#22231d",
    "--secondary-foreground": "#f4f1e8",
    "--muted": "#35362b",
    "--muted-foreground": "#b8b5a8",
    "--subtle": "#8e8b7f",
    "--accent": "#35362b",
    "--accent-foreground": "#f4f1e8",
    "--popover-border": "#4a4b3e",
    "--border": "#3a3b30",
    "--input": "#35362b",
    "--primary": "#e6cf45",
    "--primary-foreground": "#1d1e19",
    "--primary-ink": "#e6cf45",
    "--ring": "#e6cf45",
    "--chart-1": "#e6cf45",
    "--mint": "#3a3820",
    "--mint-border": "#4e4a24",
    "--mint-foreground": "#f0dd7a",
    "--sidebar": "#22231d",
    "--sidebar-foreground": "#f4f1e8",
    "--sidebar-muted": "#b8b5a8",
    "--sidebar-active": "#35362b",
    "--sidebar-active-foreground": "#f4f1e8",
    "--sidebar-border": "#2e2f27",
    "--sidebar-group": "#35362b",
    "--brand-wordmark": "#f4f1e8",
    "--shadow-glow": "0 16px 40px -20px rgb(0 0 0 / 0.5)",
  },
  css: `&:not(.dark) .text-primary { color: var(--primary-ink); }
`,
};

export const PALETTES: Record<string, Palette> = { sage: SAGE, graphite: GRAPHITE };
export const SAGE_PALETTE_ID = "sage";
export const GRAPHITE_PALETTE_ID = "graphite";

// The original SalesIQ brand blue (#0552FB) styles.css ships with -- the
// platform's own color, so "default" means no override at all. Every brand
// token's offset below was measured against it.
const SALESIQ_BLUE: AccentSpec = { h: 263, c: 0.258, l: 0.525, ld: 0.65, cd: 0.22, spread: 1 };

export const DEFAULT_ACCENT_ID = "salesiq";

export type AccentChoice = { id: string; hex?: string };

const CHOICE_KEY = "salesos.accent";
const ACCENT_EVENT = "salesiq:accent";
const CSS_KEY = "salesos.accent.css";
const STYLE_ID = "salesiq-accent";

// ---- color math (OKLab, sRGB) ---------------------------------------------

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(c: number) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function hexToOklch(hex: string): { l: number; c: number; h: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const r = srgbToLinear((n >> 16) / 255);
  const g = srgbToLinear(((n >> 8) & 255) / 255);
  const b = srgbToLinear((n & 255) / 255);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c: Math.hypot(A, B), h };
}

function oklchToLinearRgb(l: number, c: number, h: number): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

// Hex for an OKLCH color, reducing chroma until it fits in sRGB (so the
// swatch/color input shows what the browser will actually paint).
export function oklchToHex(l: number, c: number, h: number): string {
  let lo = 0;
  let hi = c;
  let rgb = oklchToLinearRgb(l, c, h);
  const inGamut = (v: [number, number, number]) => v.every((x) => x >= -0.0005 && x <= 1.0005);
  if (!inGamut(rgb)) {
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinearRgb(l, mid, h))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinearRgb(l, lo, h);
  }
  return `#${rgb
    .map((x) =>
      Math.round(Math.min(1, Math.max(0, linearToSrgb(Math.min(1, Math.max(0, x))))) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function hslHue(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

// ---- accent -> tokens -----------------------------------------------------

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const hue = (h: number) => Math.round((((h % 360) + 360) % 360) * 10) / 10;
const ok = (l: number, c: number, h: number, alpha?: number) =>
  `oklch(${r3(l)} ${r3(Math.max(0, c))} ${hue(h)}${alpha === undefined ? "" : ` / ${alpha}`})`;

// A user-picked hex becomes a full spec: its hue and chroma carry over,
// its lightness is pulled into the range where white text on a button and
// both themes still read well.
export function specFromHex(hex: string): AccentSpec | null {
  const o = hexToOklch(hex);
  if (!o) return null;
  const c = Math.min(o.c, 0.26);
  const l = clamp(o.l, 0.38, 0.6);
  const ld = clamp(Math.max(o.l, l + 0.14), 0.62, 0.84);
  const blueish = o.h >= 225 && o.h <= 310;
  return { h: o.h, c, l, ld, cd: c * 0.88, spread: blueish ? 1 : 0.4 };
}

// A valid custom color, otherwise the SalesIQ blue (also for ids saved by
// older versions, whose palettes are gone).
export function resolveAccent(choice: AccentChoice): AccentSpec {
  const palette = PALETTES[choice.id];
  if (palette) return specFromHex(palette.hex) ?? SALESIQ_BLUE;
  if (choice.id === "custom" && choice.hex) {
    const spec = specFromHex(choice.hex);
    if (spec) return spec;
  }
  return SALESIQ_BLUE;
}

// Swatch color for a spec (its light-mode primary).
export function accentHex(spec: AccentSpec): string {
  return oklchToHex(spec.l, spec.c, spec.h);
}

const BASE = SALESIQ_BLUE;
const BASE_LOGO_HSL_HUE = 221.2; // #0552FB, the logo's dominant blue

export function buildAccentCss(spec: AccentSpec, palette?: Palette): string {
  const { h, c, l, ld, cd } = spec;
  const hd = spec.hd ?? h;
  const sp = spec.spread ?? 1;
  const k = c / BASE.c; // chroma relative to the original brand blue
  const kd = cd / BASE.cd;
  const onLight = l > 0.68 ? ok(0.2, 0.02, h) : "oklch(1 0 0)";
  // Bright dark-mode primaries (emerald, bronze, graphite...) get dark
  // text on buttons; white on them would fall below readable contrast.
  const onDark = ld > 0.68 ? ok(0.18, 0.02, hd) : "oklch(1 0 0)";

  // PNG logo: rotate its hues by the gap between the logo's own blue and
  // the new primary, and pull saturation down for muted accents (graphite
  // turns the mark silver rather than leaving it blue).
  const rotate = Math.round(hslHue(accentHex(spec)) - BASE_LOGO_HSL_HUE);
  const saturate = c < 0.04 ? 0.1 : r3(clamp(0.6 + 0.4 * k, 0.6, 1.1));
  const logoFilter =
    Math.abs(rotate) < 1 && Math.abs(saturate - 1) < 0.06
      ? "none"
      : `hue-rotate(${rotate}deg) saturate(${saturate})`;

  // Offsets (lightness, relative chroma, hue shift) of each fixed brand
  // color from the brand blue, measured from the original artwork.
  const light = {
    "--primary": ok(l, c, h),
    "--primary-foreground": onLight,
    "--ring": ok(l, c, h),
    "--chart-1": ok(Math.min(l + 0.02, 0.8), c * 0.864, h),
    "--mint": ok(0.97, 0.02 * k, h),
    "--mint-border": ok(0.93, 0.05 * k, h),
    "--mint-foreground": ok(0.45, 0.16 * k, h),
    "--sidebar": ok(0.95, 0.014 * k, h),
    "--sidebar-active": ok(0.87, 0.09 * k, h),
    "--sidebar-active-foreground": ok(0.3, 0.12 * k, h),
    "--sidebar-group": ok(0.93, 0.06 * k, h),
    "--shadow-glow": `0 14px 36px -22px ${ok(l, c, h, 0.22)}`,
    "--sheen-edge": ok(0.6, 0.2 * k, h, 0.035),
    "--sheen-core": ok(0.6, 0.2 * k, h, 0.085),
    "--wave-1": ok(0.869, 0.148 * k, h - 62.3 * sp),
    "--wave-2": ok(0.525, 0.258 * k, h),
    "--wave-3": ok(0.585, 0.237 * k, h + 26.5 * sp),
    "--logo-1": ok(0.398, 0.177 * k, h + 14.4 * sp),
    "--logo-2": ok(0.511, 0.23 * k, h + 14 * sp),
    "--logo-3": ok(0.797, 0.134 * k, h - 51.5 * sp),
    "--brand-wordmark": ok(0.68, 0.158 * k, h + 13.9 * sp),
    "--hero-from": ok(0.26, 0.07 * k, h),
    "--hero-to": ok(0.13, 0.035 * k, h),
    "--hero-fg": ok(0.96, 0.015 * k, h),
    "--hero-muted": ok(0.72, 0.03 * k, h),
    "--logo-filter": logoFilter,
    "--primary-ondark": l < 0.42 ? ok(ld, cd, hd) : ok(l, c, h),
    "--primary-ondark-foreground": l < 0.42 ? onDark : onLight,
    "--auth-from": ok(0.198, 0.059 * k, h + 4.7 * sp),
    "--auth-via": ok(0.237, 0.072 * k, h + 5.1 * sp),
    "--auth-to": ok(0.155, 0.037 * k, h + 5.1 * sp),
  };
  const dark = {
    "--primary": ok(ld, cd, hd),
    "--primary-foreground": onDark,
    "--ring": ok(ld, cd, hd),
    "--mint": ok(0.28, 0.07 * kd, hd),
    "--mint-border": ok(0.34, 0.08 * kd, hd),
    "--mint-foreground": ok(0.86, 0.14 * kd, hd),
    // The light block above tints --sidebar/--sidebar-active, and its
    // [data-accent] selector outranks styles.css's plain .dark -- so the
    // dark theme's own neutral values have to be restated here or the
    // light sidebar would leak into dark mode.
    "--sidebar": "#1d1e22",
    "--sidebar-active": "#2b2e35",
    "--sidebar-active-foreground": "#ffffff",
    // The brand's blue -> violet button gradient and canvas glow belong to
    // the SalesIQ blue only.
    "--primary-gradient": "none",
    "--canvas-glow": "none",
    "--sidebar-group": ok(0.34, 0.09 * kd, hd),
    "--shadow-glow": `0 16px 40px -18px ${ok(0.65, cd, hd, 0.32)}`,
    "--sheen-edge": ok(0.9, 0.08 * kd, hd, 0.035),
    "--sheen-core": ok(0.9, 0.08 * kd, hd, 0.09),
  };
  // A full palette also restates the neutrals (page, cards, text,
  // borders), and its exact brand colors win over the generated ones.
  if (palette) {
    Object.assign(light, palette.light);
    Object.assign(dark, palette.dark);
  }
  const block = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([name, value]) => `  ${name}: ${value};`)
      .join("\n");
  // [data-accent] raises specificity above styles.css's :root / .dark, so
  // the override wins regardless of stylesheet order. The descendant
  // ":root[data-accent] .dark" form covers always-dark sections that carry
  // their own .dark class (the public landing site) -- otherwise that local
  // .dark would re-declare the default blue over the inherited accent.
  const extra = palette?.css ? palette.css.split("&").join(":root[data-accent]") : "";
  return `:root[data-accent] {\n${block(light)}\n}\n:root[data-accent].dark,\n:root[data-accent] .dark {\n${block(dark)}\n}\n${extra}`;
}
// ---- applying + persisting -------------------------------------------------

/** The SalesIQ blue, unless a palette or a valid custom color is chosen. */
export function isDefaultAccent(choice: AccentChoice) {
  if (PALETTES[choice.id]) return false;
  return !(choice.id === "custom" && !!choice.hex && !!hexToOklch(choice.hex));
}

export function applyAccent(choice: AccentChoice) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const custom = !isDefaultAccent(choice);
  // The SalesIQ blue is styles.css itself: no override stylesheet at all.
  const css = custom ? buildAccentCss(resolveAccent(choice), PALETTES[choice.id]) : "";
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
  // The attribute's value changes with every accent so observers (the
  // ECharts token hook) see a mutation and re-read the colors.
  if (custom)
    root.setAttribute("data-accent", PALETTES[choice.id] ? choice.id : `custom-${choice.hex}`);
  else root.removeAttribute("data-accent");
  try {
    if (custom) window.localStorage.setItem(CSS_KEY, css);
    else window.localStorage.removeItem(CSS_KEY);
  } catch {
    // storage unavailable -- the accent just won't survive a reload
  }
}

export function readAccentChoice(): AccentChoice {
  if (typeof window === "undefined") return { id: DEFAULT_ACCENT_ID };
  try {
    const raw = window.localStorage.getItem(CHOICE_KEY);
    if (!raw) return { id: DEFAULT_ACCENT_ID };
    const parsed = JSON.parse(raw) as AccentChoice;
    if (typeof parsed?.id !== "string") return { id: DEFAULT_ACCENT_ID };
    return parsed;
  } catch {
    return { id: DEFAULT_ACCENT_ID };
  }
}

export function useAccent() {
  // Starts from the default and reads storage after mount, so a
  // server-rendered first pass and the client's hydration agree.
  const [choice, setChoiceState] = useState<AccentChoice>({ id: DEFAULT_ACCENT_ID });
  useEffect(() => {
    setChoiceState(readAccentChoice());
    // Another picker on the page (Mavzu / Platforma rangi) changed it.
    const sync = (e: Event) => setChoiceState((e as CustomEvent<AccentChoice>).detail);
    window.addEventListener(ACCENT_EVENT, sync);
    return () => window.removeEventListener(ACCENT_EVENT, sync);
  }, []);

  const setChoice = useCallback((next: AccentChoice) => {
    setChoiceState(next);
    try {
      window.localStorage.setItem(CHOICE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable -- still applies for this session
    }
    applyAccent(next);
    window.dispatchEvent(new CustomEvent(ACCENT_EVENT, { detail: next }));
  }, []);

  return { choice, setChoice };
}

// Mounted once at the app root: re-applies the saved accent from the saved
// *choice* (not the cached CSS), so a change to the token formulas in a
// new release reaches users who picked a color before it.
export function useApplySavedAccent() {
  useEffect(() => {
    applyAccent(readAccentChoice());
  }, []);
}

// Runs in <head> before first paint (see __root.tsx). Plain ES5, no
// imports: it replays the cached custom stylesheet; with none saved the
// page keeps styles.css's SalesIQ blue.
export const ACCENT_BOOT_SCRIPT = `(function(){try{var c=null;try{c=localStorage.getItem(${JSON.stringify(
  CSS_KEY,
)})}catch(e){}if(!c)return;var s=document.createElement("style");s.id=${JSON.stringify(
  STYLE_ID,
)};s.textContent=c;document.head.appendChild(s);document.documentElement.setAttribute("data-accent","saved")}catch(e){}})();`;
