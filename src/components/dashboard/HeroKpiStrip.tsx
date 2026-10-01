import { useFunnelStats } from "@/hooks/use-crm-data";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The dashboard's single-row "kstrip" from the SalesIQ jonli bo'limlar
// mockup: four plain metric cells plus one dark hero cell for the number
// that matters most (total revenue). Sits above the existing 8-card
// DashboardKpiCards grid rather than replacing it -- those cards carry
// real operational detail (potential/lost/recoverable revenue, tasks, call
// time) this strip was never meant to duplicate; this is the "glanceable
// headline" row the mockup opens every section with, not a replacement for
// the deeper breakdown underneath it.
export function HeroKpiStrip({ funnel }: { funnel: string | null }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const stats = useFunnelStats(funnel);

  const cells: { label: string; value: string; delta?: string }[] = [
    { label: t("dash.hero.leads"), value: String(stats.totalLeads) },
    { label: t("dash.hero.sales"), value: String(stats.wonCount) },
    {
      label: t("dash.hero.conversion"),
      value: `${stats.conversion.toFixed(1)}%`,
    },
    { label: t("dash.hero.avgCheck"), value: format(stats.avgCheck) },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border shadow-card sm:grid-cols-5">
      {cells.map((cell) => (
        <div key={cell.label} className="bg-card px-3 py-3 sm:px-5 sm:py-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-xs">
            {cell.label}
          </p>
          <p className="mt-1 truncate font-display text-lg font-bold leading-none tracking-tight tabular-nums text-foreground sm:mt-1.5 sm:text-2xl">
            {cell.value}
          </p>
        </div>
      ))}
      <div
        className={cn(
          "hero-card col-span-2 flex flex-col justify-center px-3 py-3 sm:col-span-1 sm:px-5 sm:py-4",
        )}
      >
        <div className="hero-fx" />
        <div className="relative z-[1]">
          <p className="text-[10px] font-bold uppercase tracking-wide text-white/70 sm:text-xs">
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
