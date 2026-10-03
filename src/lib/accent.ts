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
  // Catalog palettes only: their exact accent/highlight HEX (used for the
  // waves and wordmark) and the background + panel colors they were
  // designed on, applied to the theme they belong to.
  accentHex?: string;
  highlightHex?: string;
  surfaces?: { mode: "dark" | "light"; bg: string; panel: string };
};

// One palette from the "SalesIQ — Premium Color Catalog": background,
// panel, accent and highlight exactly as listed there. Ten are designed
// for the dark theme, the last two (Ivory Graphite, Arctic Platinum) for
// the light one.
export type CatalogPalette = {
  id: string;
  name: string;
  mode: "dark" | "light";
  bg: string;
  panel: string;
  accent: string;
  highlight: string;
};

export const CATALOG_PALETTES: CatalogPalette[] = [
  {
    id: "obsidian-gold",
    name: "Obsidian Gold",
    mode: "dark",
    bg: "#0a0a0a",
    panel: "#151515",
    accent: "#d4af37",
    highlight: "#ffd76a",
  },
  {
    id: "midnight-champagne",
    name: "Midnight Champagne",
    mode: "dark",
    bg: "#0b0f14",
    panel: "#151b22",
    accent: "#c9a227",
    highlight: "#f5d77a",
  },
  {
    id: "graphite-platinum",
    name: "Graphite Platinum",
    mode: "dark",
    bg: "#101214",
    panel: "#1b1f23",
    accent: "#c7cdd4",
    highlight: "#ffffff",
  },
  {
    id: "deep-navy-electric",
    name: "Deep Navy Electric",
    mode: "dark",
    bg: "#07111f",
    panel: "#101c2e",
    accent: "#4da3ff",
    highlight: "#8cc8ff",
  },
  {
    id: "royal-indigo",
    name: "Royal Indigo",
    mode: "dark",
    bg: "#0d0a1a",
    panel: "#17132b",
    accent: "#8b7cff",
    highlight: "#b9b0ff",
  },
  {
    id: "emerald-executive",
    name: "Emerald Executive",
    mode: "dark",
    bg: "#07130f",
    panel: "#102019",
    accent: "#2fcb8f",
    highlight: "#7de7ba",
  },
  {
    id: "burgundy-copper",
    name: "Burgundy Copper",
    mode: "dark",
    bg: "#160a0d",
    panel: "#211317",
    accent: "#c47a5a",
    highlight: "#f0b08e",
  },
  {
    id: "titanium-ice",
    name: "Titanium Ice",
    mode: "dark",
    bg: "#0d1117",
    panel: "#171d25",
    accent: "#8fa7bd",
    highlight: "#dcebfa",
  },
  {
    id: "carbon-sapphire",
    name: "Carbon Sapphire",
    mode: "dark",
    bg: "#080d16",
    panel: "#121b2a",
    accent: "#3d8bff",
    highlight: "#6eb1ff",
  },
  {
    id: "black-pearl-rose",
    name: "Black Pearl Rose",
    mode: "dark",
    bg: "#0f0b10",
    panel: "#1b151d",
    accent: "#c98db7",
    highlight: "#f1c4df",
  },
  {
    id: "ivory-graphite",
    name: "Ivory Graphite",
    mode: "light",
    bg: "#f5f5f2",
    panel: "#ffffff",
    accent: "#1d2430",
    highlight: "#b58a2a",
  },
  {
    id: "arctic-platinum",
    name: "Arctic Platinum",
    mode: "light",
    bg: "#f1f4f7",
    panel: "#ffffff",
    accent: "#243447",
    highlight: "#4c7ea8",
  },
];

// The original SalesIQ brand blue (#0552FB) -- what styles.css ships with,
// so "default" simply means no override at all.
const SALESIQ_DEFAULT: AccentSpec = { h: 263, c: 0.258, l: 0.525, ld: 0.65, cd: 0.22, spread: 1 };

export const DEFAULT_ACCENT_ID = "salesiq";

export type AccentChoice = { id: string; hex?: string };

const CHOICE_KEY = "salesos.accent";
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

// A catalog palette's accent is used exactly in the theme it was designed
// for. In the other theme it's pulled into a readable range -- e.g. Obsidian
// Gold's #D4AF37 becomes a deeper gold on white so button text still reads,
// and Ivory Graphite's near-black #1D2430 hands over to its gold highlight
// on a dark background, where the near-black would vanish.
export function specFromCatalog(p: CatalogPalette): AccentSpec {
  const a = hexToOklch(p.accent)!;
  const hl = hexToOklch(p.highlight)!;
  const blueish = a.h >= 225 && a.h <= 310;
  const base = {
    spread: blueish ? 1 : 0.4,
    accentHex: p.accent,
    highlightHex: p.highlight,
    surfaces: { mode: p.mode, bg: p.bg, panel: p.panel },
  };
  if (p.mode === "dark") {
    return {
      ...base,
      h: a.h,
      c: a.c,
      l: clamp(a.l, 0.4, 0.56),
      ld: a.l,
      cd: a.c,
    };
  }
  return {
    ...base,
    h: a.h,
    c: a.c,
    l: a.l,
    hd: hl.h,
    ld: clamp(hl.l, 0.66, 0.84),
    cd: hl.c,
  };
}

export function resolveAccent(choice: AccentChoice): AccentSpec {
  if (choice.id === "custom" && choice.hex) {
    const spec = specFromHex(choice.hex);
    if (spec) return spec;
  }
  const palette = CATALOG_PALETTES.find((p) => p.id === choice.id);
  return palette ? specFromCatalog(palette) : SALESIQ_DEFAULT;
}

// Swatch color for a spec (its light-mode primary).
export function accentHex(spec: AccentSpec): string {
  return oklchToHex(spec.l, spec.c, spec.h);
}

const BASE = SALESIQ_DEFAULT;
const BASE_LOGO_HSL_HUE = 221.2; // #0552FB, the logo's dominant blue

// Background/panel tokens from a catalog palette's two surface colors:
// page canvas = background, cards = panel, and the in-between steps
// (popovers, inputs, borders, sidebar) derived from them in OKLCH so they
// keep the palette's own tint.
function surfaceTokens(bg: string, panel: string, mode: "dark" | "light"): Record<string, string> {
  const b = hexToOklch(bg)!;
  const p = hexToOklch(panel)!;
  const tint = (l: number, cMul = 1) => ok(l, p.c * cMul, p.c > 0.004 ? p.h : b.h);
  if (mode === "dark") {
    return {
      "--background": bg,
      "--surface": bg,
      "--card": panel,
      "--popover": tint(p.l + 0.04),
      "--secondary": tint((b.l + p.l) / 2),
      "--muted": tint((b.l + p.l) / 2),
      "--accent": tint(p.l + 0.05),
      "--border": tint(p.l + 0.09, 1.2),
      "--input": tint(p.l + 0.05),
      "--sidebar": tint(b.l + (p.l - b.l) * 0.6),
      "--sidebar-border": tint(p.l + 0.04),
      "--sidebar-active": tint(p.l + 0.08, 1.3),
    };
  }
  const bt = (l: number, cMul = 1) => ok(l, b.c * cMul, b.h);
  return {
    "--background": panel,
    // A touch deeper than the catalog background, so white panels still
    // read as raised cards on it.
    "--surface": bt(b.l - 0.03, 1.4),
    "--card": panel,
    "--popover": panel,
    "--secondary": bt(b.l - 0.005),
    "--muted": bt(b.l - 0.005),
    "--accent": bg,
    "--border": bt(b.l - 0.11, 1.5),
    "--input": bt(b.l - 0.11, 1.5),
    "--sidebar": bt(b.l - 0.015, 1.3),
    "--sidebar-border": bt(b.l - 0.08, 1.4),
  };
}

export function buildAccentCss(spec: AccentSpec): string {
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
    "--sidebar": "#1e1e1e",
    "--sidebar-active": "oklch(0.34 0 0)",
    "--sidebar-active-foreground": "oklch(0.97 0.003 247.9)",
    "--sidebar-group": ok(0.34, 0.09 * kd, hd),
    "--shadow-glow": `0 16px 40px -18px ${ok(0.65, cd, hd, 0.32)}`,
    "--sheen-edge": ok(0.9, 0.08 * kd, hd, 0.035),
    "--sheen-core": ok(0.9, 0.08 * kd, hd, 0.09),
  };
  // Catalog palettes: their exact highlight/accent drive the waves and the
  // wordmark, and their background/panel replace the surfaces of the theme
  // they were designed for (also tinting the always-dark login backdrop).
  if (spec.accentHex && spec.highlightHex) {
    const hl = hexToOklch(spec.highlightHex)!;
    Object.assign(light, {
      "--wave-1": spec.highlightHex,
      "--wave-2": spec.accentHex,
      "--brand-wordmark": hl.l >= 0.6 ? spec.highlightHex : ok(0.68, 0.158 * k, h + 13.9 * sp),
    });
  }
  if (spec.surfaces) {
    const { mode, bg, panel } = spec.surfaces;
    Object.assign(mode === "dark" ? dark : light, surfaceTokens(bg, panel, mode));
    if (mode === "dark") {
      const b = hexToOklch(bg)!;
      Object.assign(light, {
        "--auth-from": panel,
        "--auth-via": ok((b.l + hexToOklch(panel)!.l) / 2, b.c, b.h),
        "--auth-to": bg,
      });
    }
  }

  const block = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([name, value]) => `  ${name}: ${value};`)
      .join("\n");
  // [data-accent] raises specificity above styles.css's :root / .dark, so
  // the override wins regardless of stylesheet order.
  return `:root[data-accent] {\n${block(light)}\n}\n:root[data-accent].dark {\n${block(dark)}\n}\n`;
}

// ---- applying + persisting -------------------------------------------------

// Anything that isn't a valid custom color or a current catalog palette
// (including ids saved by an older version of this list) means "default".
export function isDefaultAccent(choice: AccentChoice) {
  if (choice.id === "custom") return !choice.hex || !hexToOklch(choice.hex);
  return !CATALOG_PALETTES.some((p) => p.id === choice.id);
}

export function applyAccent(choice: AccentChoice) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (isDefaultAccent(choice)) {
    style?.remove();
    root.removeAttribute("data-accent");
    try {
      window.localStorage.removeItem(CSS_KEY);
    } catch {
      // storage unavailable -- the accent just won't survive a reload
    }
    return;
  }
  const css = buildAccentCss(resolveAccent(choice));
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
  // The attribute's value changes with every accent so observers (the
  // ECharts token hook) see a mutation and re-read the colors.
  root.setAttribute("data-accent", choice.id === "custom" ? `custom-${choice.hex}` : choice.id);
  try {
    window.localStorage.setItem(CSS_KEY, css);
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
  }, []);

  const setChoice = useCallback((next: AccentChoice) => {
    setChoiceState(next);
    try {
      window.localStorage.setItem(CHOICE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable -- still applies for this session
    }
    applyAccent(next);
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
// imports: it only replays the cached stylesheet.
export const ACCENT_BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(
  CSS_KEY,
)});if(!c)return;var s=document.createElement("style");s.id=${JSON.stringify(
  STYLE_ID,
)};s.textContent=c;document.head.appendChild(s);document.documentElement.setAttribute("data-accent","saved")}catch(e){}})();`;
