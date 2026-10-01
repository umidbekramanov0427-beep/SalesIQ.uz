import { useEffect, useState } from "react";

// ECharts draws to canvas, so it can't read CSS custom properties the way
// the rest of the app's styling does -- every color has to be resolved to
// a literal string up front. getComputedStyle happily returns our oklch(...)
// tokens as-is (they're valid CSS color syntax), so no hex conversion is
// needed; this just re-reads them whenever the light/dark class on <html>
// flips, so a live chart re-colors itself on theme toggle instead of
// freezing at whatever theme was active when it first mounted.
export interface EChartsTokens {
  primary: string;
  success: string;
  destructive: string;
  warning: string;
  border: string;
  mutedForeground: string;
  subtle: string;
  card: string;
  popover: string;
  foreground: string;
}

function readTokens(): EChartsTokens {
  const s = getComputedStyle(document.documentElement);
  const g = (name: string) => s.getPropertyValue(name).trim();
  return {
    primary: g("--primary"),
    success: g("--success"),
    destructive: g("--destructive"),
    warning: g("--warning"),
    border: g("--border"),
    mutedForeground: g("--muted-foreground"),
    subtle: g("--subtle"),
    card: g("--card"),
    popover: g("--popover"),
    foreground: g("--foreground"),
  };
}

// ECharts draws to <canvas>, whose fillStyle parser accepts oklch(...) but
// not every CSS color function -- color-mix() support there lags behind
// plain oklch, so a translucent gradient stop is built by splicing an
// alpha channel into our existing oklch(...) token string instead of
// reaching for color-mix. Tokens are always "oklch(l c h)"; anything else
// (a literal hex, e.g.) is returned unchanged since it has no safe generic
// way to add alpha here.
export function withAlpha(oklchColor: string, alpha: number): string {
  const match = /^oklch\(([^/)]+)\)$/.exec(oklchColor.trim());
  if (!match) return oklchColor;
  return `oklch(${match[1]} / ${alpha})`;
}

export function useEChartsTokens(): EChartsTokens {
  const [tokens, setTokens] = useState<EChartsTokens>(() =>
    typeof document === "undefined" ? ({} as EChartsTokens) : readTokens(),
  );

  useEffect(() => {
    setTokens(readTokens());
    const observer = new MutationObserver(() => setTokens(readTokens()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return tokens;
}
