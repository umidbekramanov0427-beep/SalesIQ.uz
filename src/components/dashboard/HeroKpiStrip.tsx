import { useFunnelStats } from "@/hooks/use-crm-data";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";

// The dashboard's single-row "kstrip": five plain metric cells, all on the
// same card background (no per-cell color) per the user's explicit request
// to stop tinting cards differently -- the revenue cell used to get a dark
// blue "hero" gradient treatment, dropped in favor of the same flat cell
// as its neighbors. Sits above the existing 8-card DashboardKpiCards grid
// rather than replacing it -- those cards carry real operational detail
// (potential/lost/recoverable revenue, tasks, call time) this strip was
// never meant to duplicate; this is the "glanceable headline" row, not a
// replacement for the deeper breakdown underneath it.
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
    { label: t("dash.hero.revenue"), value: format(stats.totalRevenue) },
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
    </div>
  );
}
