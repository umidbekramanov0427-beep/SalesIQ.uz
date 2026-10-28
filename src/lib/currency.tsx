import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export const CURRENCIES = ["USD", "UZS"] as const;
export type CurrencyUnit = (typeof CURRENCIES)[number];

// Fixed approximate rate — good enough for in-app display, not for real FX.
const UZS_PER_USD = 12900;

const STORAGE_KEY = "salesos.currency";

type CurrencyValue = {
  unit: CurrencyUnit;
  setUnit: (u: CurrencyUnit) => void;
  format: (nativeAmount: number) => string;
  // Short form for chart axes: "14 mln", "$1.1K".
  formatCompact: (nativeAmount: number, lang: string) => string;
};

const CurrencyContext = createContext<CurrencyValue | null>(null);

// So'm unless the person picked dollars: the amounts are the companies' own
// so'm figures, and a dollar view is a rough conversion.
function readInitial(): CurrencyUnit {
  if (typeof window === "undefined") return "UZS";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "USD" ? "USD" : "UZS";
  } catch {
    return "UZS";
  }
}

/** "4 460 526 so'm" -- the way prices are written in Uzbekistan. */
export function formatUzs(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const digits = String(Math.round(Math.abs(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${digits} so'm`;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<CurrencyUnit>(readInitial);

  const setUnit = useCallback((u: CurrencyUnit) => {
    setUnitState(u);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, u);
  }, []);

  // Every amount flowing through this app now comes straight from AmoCRM's
  // lead price field, which is denominated in the org's own currency (UZS
  // for an Uzbek business) -- there's no USD-native source data anymore.
  // This used to treat every stored amount as USD and multiply by
  // UZS_PER_USD for UZS display, which took a real e.g. 5,000,000 so'm
  // deal and displayed it as 64,500,000,000,000 so'm. UZS display is now
  // the raw AmoCRM amount as-is; USD display converts it down for anyone
  // who prefers to see figures in dollars.
  const format = useCallback(
    (nativeAmount: number) => {
      if (unit === "USD") {
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(nativeAmount / UZS_PER_USD);
      }
      return formatUzs(nativeAmount);
    },
    [unit],
  );

  const formatCompact = useCallback(
    (nativeAmount: number, lang: string) => {
      const usd = unit === "USD";
      // Browsers have no Uzbek compact words (Chromium prints "1.3G"), so
      // so'm amounts in Uzbek spell them out: "1,3 mlrd", "796 mln".
      if (!usd && lang === "uz") return compactUz(nativeAmount);
      return new Intl.NumberFormat(usd ? "en-US" : lang, {
        notation: "compact",
        maximumFractionDigits: 1,
        ...(usd ? { style: "currency", currency: "USD" } : {}),
      }).format(usd ? nativeAmount / UZS_PER_USD : nativeAmount);
    },
    [unit],
  );

  const value = useMemo(
    () => ({ unit, setUnit, format, formatCompact }),
    [unit, setUnit, format, formatCompact],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

function compactUz(n: number): string {
  const abs = Math.abs(n);
  const [div, word] =
    abs >= 1e12
      ? [1e12, "trln"]
      : abs >= 1e9
        ? [1e9, "mlrd"]
        : abs >= 1e6
          ? [1e6, "mln"]
          : abs >= 1e3
            ? [1e3, "ming"]
            : [1, ""];
  const v = (n / div).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  return word ? `${v} ${word}` : v;
}

export function useCurrency(): CurrencyValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside <CurrencyProvider>");
  return ctx;
}
