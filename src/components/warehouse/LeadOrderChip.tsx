// Ombor module on the funnel board: in a warehouse funnel each lead card
// gets one more line -- its latest order's number, status and sum. Other
// funnels (and companies without the module) see the board unchanged.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useHasModule, useOrders, type OrderWithItems } from "@/hooks/crm/warehouse";
import { useI18n } from "@/lib/i18n";
import { formatUzs } from "@/lib/currency";
import { cn } from "@/lib/utils";

const LeadOrders = createContext<Map<string, OrderWithItems> | null>(null);

export function WarehouseOrdersScope({
  isWarehouseFunnel,
  children,
}: {
  isWarehouseFunnel: boolean;
  children: ReactNode;
}) {
  const on = useHasModule("warehouse");
  if (!on || !isWarehouseFunnel) return <>{children}</>;
  return <Scope>{children}</Scope>;
}

function Scope({ children }: { children: ReactNode }) {
  const { data: orders = [] } = useOrders();
  const map = useMemo(() => {
    const m = new Map<string, OrderWithItems>();
    // Newest first: keep the first (latest) order per lead.
    for (const o of orders) if (o.lead_id && !m.has(o.lead_id)) m.set(o.lead_id, o);
    return m;
  }, [orders]);
  return <LeadOrders.Provider value={map}>{children}</LeadOrders.Provider>;
}

const TONE: Record<string, string> = {
  new: "border-slate-300 text-slate-700 dark:text-slate-300",
  preparing: "border-amber-300 text-amber-700 dark:text-amber-300",
  picking: "border-violet-300 text-violet-700 dark:text-violet-300",
  shipped: "border-sky-300 text-sky-700 dark:text-sky-300",
  delivered: "border-emerald-300 text-emerald-700 dark:text-emerald-300",
  cancelled: "border-rose-300 text-rose-700 dark:text-rose-300",
};

export function LeadOrderChip({ leadId }: { leadId: string }) {
  const map = useContext(LeadOrders);
  const { t } = useI18n();
  const o = map?.get(leadId);
  if (!o) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[12px]">
      <span
        className={cn(
          "inline-flex h-5 items-center rounded-full border bg-card px-2 font-semibold",
          TONE[o.status],
        )}
      >
        №{o.number} · {t(`wh.st.${o.status}`)}
      </span>
      <span className="tabular-nums text-muted-foreground">{formatUzs(o.total)}</span>
    </div>
  );
}
