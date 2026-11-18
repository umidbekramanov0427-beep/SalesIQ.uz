import { createContext, useContext, type ReactNode } from "react";
import { AlertOctagon, AlertTriangle, Sparkles } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { Priority } from "@/lib/marketing-ai/metrics";

// Shared bits of the AI tahlilchi page: money in so'm or dollars (the
// Central Bank's rate of the day), percentages, the priority chip and the
// Fakt / Taxmin / Tavsiya labels.

const RateContext = createContext<number>(12_900);
export const RateProvider = ({ rate, children }: { rate: number; children: ReactNode }) => (
  <RateContext.Provider value={rate}>{children}</RateContext.Provider>
);

const spaced = (n: number) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Money from so'm: "12 400 so'm" or "$961" with today's rate. */
export function useMoney() {
  const rate = useContext(RateContext);
  const { unit } = useCurrency();
  return (uzs: number | null | undefined): string => {
    if (uzs == null) return "—";
    if (unit === "USD") {
      const usd = uzs / rate;
      return `${uzs < 0 ? "-" : ""}$${Math.abs(usd) >= 100 ? spaced(usd) : Math.abs(usd).toFixed(2)}`;
    }
    return `${uzs < 0 ? "-" : ""}${spaced(uzs)} so'm`;
  };
}

export const num = (n: number | null | undefined) => (n == null ? "—" : spaced(n));
export const pct = (x: number | null | undefined, digits = 0) =>
  x == null ? "—" : `${(x * 100).toFixed(digits)}%`;

/** Change against the previous period, as a whole percent for StatCard. */
export function deltaPct(now: number | null | undefined, before: number | null | undefined) {
  if (now == null || before == null || before === 0) return undefined;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}

const PRIORITY: Record<Priority, { cls: string; icon: typeof AlertOctagon }> = {
  critical: { cls: "bg-rose-500/12 text-rose-700 dark:text-rose-300", icon: AlertOctagon },
  warning: { cls: "bg-amber-500/14 text-amber-800 dark:text-amber-200", icon: AlertTriangle },
  opportunity: { cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300", icon: Sparkles },
};

export function PriorityChip({ p, label }: { p: Priority; label: string }) {
  const { cls, icon: Icon } = PRIORITY[p];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold",
        cls,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export const PRIORITY_STRIPE: Record<Priority, string> = {
  critical: "bg-rose-500",
  warning: "bg-amber-500",
  opportunity: "bg-emerald-500",
};

/** The small coloured word before a line: Fakt, Taxmin, Tavsiya. */
export function KindTag({ kind, label }: { kind: "fact" | "guess" | "advice"; label: string }) {
  return (
    <span
      className={cn(
        "mr-1.5 inline-block rounded px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide",
        kind === "fact" && "bg-sky-500/12 text-sky-700 dark:text-sky-300",
        kind === "guess" && "bg-amber-500/14 text-amber-800 dark:text-amber-200",
        kind === "advice" && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {label}
    </span>
  );
}

export const tashkentDay = (iso: string) =>
  new Date(new Date(iso).getTime() + 5 * 3_600_000)
    .toISOString()
    .slice(0, 10)
    .split("-")
    .reverse()
    .join(".");
