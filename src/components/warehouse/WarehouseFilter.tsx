// The funnel filter's "Ombor" group: shown only in a warehouse funnel of a
// company with the module. Three ready presets go under the funnel's own
// presets (left column), the order fields on top of the lead properties
// (middle column); the state lives in the URL as `wh` (lib/warehouse.ts).
import { useMemo } from "react";
import { Boxes, CalendarClock, MoonStar, PackageX } from "lucide-react";
import { useOrders, useProducts, ORDER_STATUSES } from "@/hooks/crm/warehouse";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { whLeadFacts, type WhFilter, type WhLeadFacts, type WhPreset } from "@/lib/warehouse";

/** The facts the filter reads, from the company's orders (null while off). */
export function useWarehouseLeadFacts(enabled: boolean): WhLeadFacts | null {
  const { data: orders } = useOrders();
  return useMemo(() => {
    if (!enabled || !orders) return null;
    return whLeadFacts(
      orders.map((o) => ({
        leadId: o.lead_id,
        status: o.status,
        total: o.total,
        deliveredAt: o.delivered_at,
        createdAt: o.created_at,
        productIds: o.items.map((i) => i.product_id),
      })),
    );
  }, [enabled, orders]);
}

const rowClass = (active: boolean) =>
  cn(
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
    active
      ? "bg-primary/10 font-semibold text-primary"
      : "text-foreground/85 hover:bg-accent hover:text-foreground",
  );

export function WarehousePresets({
  value,
  onChange,
  facts,
}: {
  value: WhFilter;
  onChange: (v: WhFilter) => void;
  facts: WhLeadFacts | null;
}) {
  const { t } = useI18n();
  const rows: { key: WhPreset; icon: typeof Boxes; n: number | null }[] = [
    { key: "due", icon: CalendarClock, n: facts?.due.size ?? null },
    { key: "dormant", icon: MoonStar, n: facts?.dormant.size ?? null },
    { key: "noOrder", icon: PackageX, n: null },
  ];
  return (
    <>
      <p className="mb-1 mt-4 flex items-center gap-1.5 px-2.5 text-[11px] font-bold uppercase tracking-wider text-subtle">
        <Boxes className="h-3.5 w-3.5" /> {t("whf.group")}
      </p>
      <div className="space-y-0.5">
        {rows.map(({ key, icon: Icon, n }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange({ ...value, preset: value.preset === key ? "" : key })}
            className={rowClass(value.preset === key)}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{t(`whf.preset.${key}`)}</span>
            {n != null && n > 0 && (
              <span className="shrink-0 tabular-nums text-[11.5px] text-muted-foreground">{n}</span>
            )}
          </button>
        ))}
      </div>
    </>
  );
}

const FIELD =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-subtle hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/15";

export function WarehouseProperties({
  value,
  onChange,
}: {
  value: WhFilter;
  onChange: (v: WhFilter) => void;
}) {
  const { t } = useI18n();
  const { data: products = [] } = useProducts();
  const set = (p: Partial<WhFilter>) => onChange({ ...value, ...p });
  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));
  const statuses = [...ORDER_STATUSES, "cancelled"] as const;
  return (
    <div className="mb-4 space-y-2.5 rounded-xl border border-border p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-subtle">
        <Boxes className="h-3.5 w-3.5" /> {t("whf.group")}
      </p>
      <div>
        <p className="mb-1 text-[12px] text-muted-foreground">{t("whf.status")}</p>
        <div className="flex flex-wrap gap-1">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={value.statuses.includes(s)}
              onClick={() => set({ statuses: toggle(value.statuses, s) })}
              className={cn(
                "rounded-md border px-2 py-1 text-[12px] transition-colors",
                value.statuses.includes(s)
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border text-foreground/85 hover:border-primary/40",
              )}
            >
              {t(`wh.st.${s}`)}
            </button>
          ))}
        </div>
      </div>
      {products.length > 0 && (
        <div>
          <p className="mb-1 text-[12px] text-muted-foreground">{t("whf.product")}</p>
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {products
              .filter((p) => !p.archived_at)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={value.productIds.includes(p.id)}
                  onClick={() => set({ productIds: toggle(value.productIds, p.id) })}
                  className={cn(
                    "max-w-full truncate rounded-md border px-2 py-1 text-[12px] transition-colors",
                    value.productIds.includes(p.id)
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-border text-foreground/85 hover:border-primary/40",
                  )}
                >
                  {p.name}
                </button>
              ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-1 text-[12px] text-muted-foreground">{t("whf.spent")}</p>
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={value.spentMin ?? ""}
            onChange={(e) => set({ spentMin: num(e.target.value) })}
            placeholder={t("whf.from")}
            className={FIELD}
          />
          <span className="text-muted-foreground">–</span>
          <input
            inputMode="numeric"
            value={value.spentMax ?? ""}
            onChange={(e) => set({ spentMax: num(e.target.value) })}
            placeholder={t("whf.to")}
            className={FIELD}
          />
        </div>
      </div>
    </div>
  );
}
