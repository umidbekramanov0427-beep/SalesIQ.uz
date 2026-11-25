// The lead card's «Xaridlari» (Ombor module only): the client's orders,
// what they spend, when they will need goods again, and one click to repeat
// the last order or start a new one.
import { useMemo, useState } from "react";
import { ChevronDown, Plus, Repeat2, Star } from "lucide-react";
import { OrderDialog, type OrderDraft } from "@/components/warehouse/WarehouseDialogs";
import { useHasModule, useOrders, type OrderWithItems } from "@/hooks/crm/warehouse";
import { useI18n } from "@/lib/i18n";
import { formatUzs } from "@/lib/currency";
import { repeatCandidates } from "@/lib/warehouse";

const short = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} mln` : formatUzs(n);

export function LeadWarehouseBlock({ leadId, leadName }: { leadId: string; leadName: string }) {
  const on = useHasModule("warehouse");
  if (!on) return null;
  return <Block leadId={leadId} leadName={leadName} />;
}

function Block({ leadId, leadName }: { leadId: string; leadName: string }) {
  const { t } = useI18n();
  const { data: orders = [] } = useOrders(leadId);
  const [dlg, setDlg] = useState<{
    open: boolean;
    initial?: OrderDraft | undefined;
    order?: OrderWithItems | undefined;
    key: number;
  }>({ open: false, key: 0 });
  const [all, setAll] = useState(false);
  const delivered = orders.filter((o) => o.status === "delivered");
  const total = delivered.reduce((s, o) => s + o.total, 0);
  const forecast = useMemo(
    () =>
      repeatCandidates(
        orders.map((o) => ({
          leadId: o.lead_id,
          status: o.status,
          total: o.total,
          deliveredAt: o.delivered_at,
          createdAt: o.created_at,
          productIds: o.items.map((i) => i.product_id),
        })),
      )[0],
    [orders],
  );
  const lead = { id: leadId, name: leadName, owner_id: null, phone: null };
  const last = delivered[0];
  const open = (initial?: OrderDraft) =>
    setDlg((s) => ({ open: true, initial, order: undefined, key: s.key + 1 }));
  const view = (order: OrderWithItems) =>
    setDlg((s) => ({ open: true, initial: undefined, order, key: s.key + 1 }));
  // Two delivered orders or more: a regular client of the warehouse.
  const regular = delivered.length >= 2;
  const shown = all ? orders : orders.slice(0, 3);
  const due = forecast?.dueInDays;
  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="text-[12px] font-bold uppercase tracking-wide">
            {t("wh.lead.title")}
          </span>
          {regular && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
              <Star className="h-3 w-3" /> {t("wh.lead.regular")}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => open({ lead, lines: [] })}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> {t("wh.order.new")}
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {[
          [t("wh.lead.orders"), String(orders.filter((o) => o.status !== "cancelled").length)],
          [t("wh.lead.spent"), short(total)],
          [t("wh.lead.avg"), delivered.length ? short(Math.round(total / delivered.length)) : "—"],
        ].map(([l, v]) => (
          <div key={l} className="rounded-md border border-border/70 px-2 py-1.5">
            <div className="text-[11px] font-semibold text-muted-foreground">{l}</div>
            <div className="text-[14px] font-bold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      {forecast && due != null && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[12.5px]">
          <span
            className={
              due <= 3
                ? "font-semibold text-emerald-700 dark:text-emerald-300"
                : "text-muted-foreground"
            }
          >
            <Repeat2 className="mr-1 inline h-3.5 w-3.5" />
            {due < 0
              ? t("wh.due.late", { n: -due })
              : due === 0
                ? t("wh.due.today")
                : t("wh.due.in", { n: due })}{" "}
            · {t("wh.every", { n: forecast.intervalDays ?? 0 })}
          </span>
          {last && (
            <button
              type="button"
              onClick={() =>
                open({
                  lead,
                  lines: last.items.map((i) => ({
                    productId: i.product_id,
                    qty: i.qty,
                    price: i.price,
                  })),
                })
              }
              className="rounded-md border border-border px-2 py-1 font-semibold hover:bg-muted"
            >
              {t("wh.reorder")}
            </button>
          )}
        </div>
      )}
      {shown.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => view(o)}
          className="mt-2 flex w-full items-center justify-between gap-2 border-t border-border/60 pt-2 text-left text-[13px] hover:text-primary"
        >
          <span className="min-w-0 truncate">
            <b>№{o.number}</b> · {t(`wh.st.${o.status}`)}
            <span className="text-muted-foreground">
              {" "}
              · {new Date(o.created_at).toLocaleDateString("ru-RU")}
            </span>
          </span>
          <span className="shrink-0 tabular-nums">{formatUzs(o.total)}</span>
        </button>
      ))}
      {orders.length > 3 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
        >
          <ChevronDown className={all ? "h-3.5 w-3.5 rotate-180" : "h-3.5 w-3.5"} />
          {all ? t("wh.lead.less") : t("wh.lead.all", { n: orders.length })}
        </button>
      )}
      {dlg.open && (
        <OrderDialog
          key={dlg.key}
          open
          initial={dlg.initial}
          order={dlg.order}
          leadName={leadName}
          onOpenChange={(v) => !v && setDlg((s) => ({ ...s, open: false }))}
        />
      )}
    </div>
  );
}
