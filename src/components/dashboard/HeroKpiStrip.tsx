import { Target, TrendingUp, Trophy, Users, Wallet, type LucideIcon } from "lucide-react";
import { useFunnelStats } from "@/hooks/use-crm-data";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The dashboard's headline KPI row -- four icon-chip cards plus one dark
// hero card for the number that matters most (total revenue), carrying the
// SalesIQ.uz reference dashboard's "kpi" card shape (icon chip, hover lift,
// corner glow) instead of the earlier flat divided strip. Sits above the
// existing 8-card DashboardKpiCards grid rather than replacing it -- those
// cards carry real operational detail (potential/lost/recoverable revenue,
// tasks, call time) this strip was never meant to duplicate; this is the
// "glanceable headline" row, not a replacement for the deeper breakdown
// underneath it.
export function HeroKpiStrip({ funnel }: { funnel: string | null }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const stats = useFunnelStats(funnel);

  const cells: { label: string; value: string; icon: LucideIcon }[] = [
    { label: t("dash.hero.leads"), value: String(stats.totalLeads), icon: Users },
    { label: t("dash.hero.sales"), value: String(stats.wonCount), icon: Trophy },
    {
      label: t("dash.hero.conversion"),
      value: `${stats.conversion.toFixed(1)}%`,
      icon: Target,
    },
    { label: t("dash.hero.avgCheck"), value: format(stats.avgCheck), icon: TrendingUp },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="surface-card group relative overflow-hidden px-3 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow)] sm:px-4 sm:py-4"
        >
          <div className="pointer-events-none absolute -right-10 -top-14 h-28 w-28 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--color-primary)_35%,transparent),transparent)] opacity-0 blur-2xl transition-opacity duration-200 group-hover:opacity-100" />
          <span className="relative z-[1] flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <cell.icon className="h-4 w-4" />
          </span>
          <p className="relative z-[1] mt-2.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-xs">
            {cell.label}
          </p>
          <p className="relative z-[1] mt-1 truncate font-display text-lg font-bold leading-none tracking-tight tabular-nums text-foreground sm:mt-1.5 sm:text-2xl">
            {cell.value}
          </p>
        </div>
      ))}
      <div
        className={cn(
          "hero-card col-span-2 flex flex-col justify-center px-3 py-3 transition-all duration-200 hover:-translate-y-0.5 sm:col-span-1 sm:px-4 sm:py-4",
        )}
      >
        <div className="hero-fx" />
        <div className="relative z-[1]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white">
            <Wallet className="h-4 w-4" />
          </span>
          <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wide text-white/70 sm:text-xs">
            {t("dash.hero.revenue")}
          </p>
          <p className="mt-1 truncate font-display text-lg font-bold leading-none tracking-tight tabular-nums text-white sm:mt-1.5 sm:text-2xl">
            {format(stats.totalRevenue)}
          </p>
        </div>
      </div>
    </div>
  );
}
