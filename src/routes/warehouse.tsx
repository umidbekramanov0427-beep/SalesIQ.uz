import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  Moon,
  Package,
  PackagePlus,
  Plus,
  RefreshCw,
  Repeat2,
  Search,
  ShoppingCart,
  Trophy,
  Truck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, StatCard } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import {
  OrderDialog,
  ProductDialog,
  StockDialog,
  type MoveKind,
  type OrderDraft,
} from "@/components/warehouse/WarehouseDialogs";
import {
  ORDER_STATUSES,
  useHasModule,
  useLeadBriefs,
  useOrders,
  useProductStock,
  useProducts,
  useRepeatTask,
  useUpdateOrder,
  type OrderWithItems,
  type ProductRow,
} from "@/hooks/crm/warehouse";
import { useI18n } from "@/lib/i18n";
import { formatUzs } from "@/lib/currency";
import { cn, describeError } from "@/lib/utils";
import { dormant, dueSoon, repeatCandidates, stockState } from "@/lib/warehouse";

type Tab = "overview" | "products" | "orders" | "repeat";
const TABS: Tab[] = ["overview", "products", "orders", "repeat"];

export const Route = createFileRoute("/warehouse")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: TABS.includes(s["tab"] as Tab) ? (s["tab"] as Tab) : undefined,
  }),
  head: () => ({ meta: [{ title: "Ombor — SalesIQ" }] }),
  component: WarehousePage,
});

const short = (n: number) =>
  Math.abs(n) >= 1e9
    ? `${(n / 1e9).toFixed(1).replace(".", ",")} mlrd`
    : Math.abs(n) >= 1e6
      ? `${(n / 1e6).toFixed(1).replace(".", ",")} mln`
      : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const STATUS_TONE: Record<string, string> = {
  new: "border-t-slate-400",
  preparing: "border-t-amber-500",
  picking: "border-t-violet-500",
  shipped: "border-t-sky-500",
  delivered: "border-t-emerald-500",
};

function WarehousePage() {
  const { t } = useI18n();
  const on = useHasModule("warehouse");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: Tab = search.tab ?? "overview";
  const [productDlg, setProductDlg] = useState<{ open: boolean; product: ProductRow | null }>({
    open: false,
    product: null,
  });
  const [stockDlg, setStockDlg] = useState<{
    open: boolean;
    kind: MoveKind;
    productId?: string | null | undefined;
  }>({ open: false, kind: "in" });
  const [orderDlg, setOrderDlg] = useState<{
    open: boolean;
    initial?: OrderDraft | undefined;
    key: number;
  }>({
    open: false,
    key: 0,
  });
  const openOrder = (initial?: OrderDraft) =>
    setOrderDlg((s) => ({ open: true, initial, key: s.key + 1 }));

  if (!on) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("nav./warehouse")} icon={Package} tone="amber" />
        <SectionCard title={t("wh.off.title")} icon={Package} tone="amber">
          <p className="text-[14px] text-muted-foreground">{t("wh.off.text")}</p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("nav./warehouse")}
        description={t("wh.subtitle")}
        icon={Package}
        tone="amber"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStockDlg({ open: true, kind: "in" })}>
              <PackagePlus className="h-4 w-4" /> {t("wh.move.btn")}
            </Button>
            <Button onClick={() => openOrder()}>
              <Plus className="h-4 w-4" /> {t("wh.order.new")}
            </Button>
          </div>
        }
      />
      <Segmented
        value={tab}
        onChange={(v) => void navigate({ search: { tab: v === "overview" ? undefined : v } })}
        options={[
          { value: "overview", label: t("wh.tab.overview"), icon: Boxes },
          { value: "products", label: t("wh.tab.products"), icon: Package },
          { value: "orders", label: t("wh.tab.orders"), icon: ShoppingCart },
          { value: "repeat", label: t("wh.tab.repeat"), icon: Repeat2 },
        ]}
      />
      {tab === "overview" && (
        <Overview onTab={(v) => void navigate({ search: { tab: v } })} onReorder={openOrder} />
      )}
      {tab === "products" && (
        <ProductsTab
          onEdit={(p) => setProductDlg({ open: true, product: p })}
          onStock={(kind, productId) => setStockDlg({ open: true, kind, productId })}
        />
      )}
      {tab === "orders" && <OrdersBoard />}
      {tab === "repeat" && <RepeatTab onReorder={openOrder} />}

      {productDlg.open && (
        <ProductDialog
          open
          product={productDlg.product}
          onOpenChange={(v) => !v && setProductDlg({ open: false, product: null })}
        />
      )}
      {stockDlg.open && (
        <StockDialog
          open
          kind={stockDlg.kind}
          productId={stockDlg.productId ?? null}
          onOpenChange={(v) => !v && setStockDlg({ open: false, kind: "in" })}
        />
      )}
      {orderDlg.open && (
        <OrderDialog
          key={orderDlg.key}
          open
          initial={orderDlg.initial}
          onOpenChange={(v) => !v && setOrderDlg((s) => ({ ...s, open: false }))}
        />
      )}
    </div>
  );
}

function useWarehouseData() {
  const products = useProducts();
  const stock = useProductStock();
  const orders = useOrders();
  const leadIds = useMemo(
    () => (orders.data ?? []).map((o) => o.lead_id).filter((x): x is string => !!x),
    [orders.data],
  );
  const leads = useLeadBriefs(leadIds);
  const repeat = useMemo(
    () =>
      repeatCandidates(
        (orders.data ?? []).map((o) => ({
          leadId: o.lead_id,
          status: o.status,
          total: o.total,
          deliveredAt: o.delivered_at,
          createdAt: o.created_at,
          productIds: o.items.map((i) => i.product_id),
        })),
      ),
    [orders.data],
  );
  return {
    products: products.data ?? [],
    stock: stock.data ?? new Map(),
    orders: orders.data ?? [],
    leads: leads.data ?? new Map(),
    repeat,
    loading: products.isLoading || orders.isLoading,
  };
}

function lastOrderDraft(
  orders: OrderWithItems[],
  leadId: string,
  lead: { id: string; name: string; owner_id: string | null; phone: string | null } | undefined,
): OrderDraft {
  const last = orders.find((o) => o.lead_id === leadId && o.status === "delivered");
  return {
    lead: lead ?? { id: leadId, name: "—", owner_id: null, phone: null },
    lines: (last?.items ?? []).map((i) => ({
      productId: i.product_id,
      qty: i.qty,
      price: i.price,
    })),
  };
}

function Overview({
  onTab,
  onReorder,
}: {
  onTab: (t: Tab) => void;
  onReorder: (d: OrderDraft) => void;
}) {
  const { t } = useI18n();
  const d = useWarehouseData();
  const value = d.products.reduce((s, p) => s + (d.stock.get(p.id)?.qty ?? 0) * (p.cost || 0), 0);
  const units = d.products.reduce((s, p) => s + (d.stock.get(p.id)?.qty ?? 0), 0);
  const low = d.products.filter(
    (p) =>
      !p.archived_at &&
      stockState(d.stock.get(p.id)?.qty ?? 0, d.stock.get(p.id)?.reserved ?? 0, p.min_stock) !==
        "ok",
  );
  const today = new Date().toDateString();
  const todayOrders = d.orders.filter(
    (o) => new Date(o.created_at).toDateString() === today && o.status !== "cancelled",
  );
  const inTransit = d.orders.filter((o) => o.status === "shipped");
  const due = dueSoon(d.repeat);
  const byStatus = (s: string) => d.orders.filter((o) => o.status === s);
  const since = Date.now() - 30 * 86_400_000;
  const sold = new Map<string, number>();
  for (const o of d.orders)
    if (o.status === "delivered" && Date.parse(o.delivered_at ?? o.created_at) > since)
      for (const i of o.items) sold.set(i.product_id, (sold.get(i.product_id) ?? 0) + i.qty);
  const top = [...sold.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const pName = new Map(d.products.map((p) => [p.id, p]));

  return (
    <div className="space-y-5">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("wh.kpi.today")}
          tipKey="wh.kpi.today"
          icon={ShoppingCart}
          iconTone="primary"
          value={`${todayOrders.length}`}
          hint={formatUzs(todayOrders.reduce((s, o) => s + o.total, 0))}
        />
        <StatCard
          label={t("wh.kpi.transit")}
          tipKey="wh.kpi.transit"
          icon={Truck}
          iconTone="sky"
          value={`${inTransit.length}`}
          hint={t("wh.kpi.transitHint", { n: byStatus("picking").length })}
        />
        <StatCard
          label={t("wh.kpi.repeat")}
          tipKey="wh.kpi.repeat"
          icon={Repeat2}
          iconTone="emerald"
          value={`${due.length}`}
          hint={`~${short(due.reduce((s, c) => s + c.avgCheck, 0))} so'm`}
        />
        <StatCard
          label={t("wh.kpi.value")}
          tipKey="wh.kpi.value"
          icon={Wallet}
          iconTone="amber"
          value={`${short(value)} so'm`}
          hint={t("wh.kpi.valueHint", { n: d.products.length, u: short(units) })}
        />
      </div>

      <SectionCard title={t("wh.path")} icon={ArrowRight} tone="primary" info={t("wh.path.info")}>
        <div className="flex flex-wrap gap-2">
          {ORDER_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onTab("orders")}
              className={cn(
                "min-w-[140px] flex-1 rounded-xl border border-border border-t-[3px] bg-card px-4 py-3 text-left transition hover:border-primary/40",
                STATUS_TONE[s],
              )}
            >
              <div className="text-[13px] font-semibold text-muted-foreground">
                {t(`wh.st.${s}`)}
              </div>
              <div className="mt-1 text-[24px] font-bold tabular-nums">{byStatus(s).length}</div>
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <SectionCard
          title={t("wh.dueToday")}
          icon={Repeat2}
          tone="emerald"
          info={t("wh.dueToday.info")}
          actions={
            <button
              type="button"
              className="text-[13px] font-semibold text-primary"
              onClick={() => onTab("repeat")}
            >
              {t("wh.all")}
            </button>
          }
        >
          {due.length === 0 ? (
            <p className="text-[14px] text-muted-foreground">{t("wh.empty.repeat")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {due.slice(0, 5).map((c) => {
                const lead = d.leads.get(c.leadId);
                return (
                  <li key={c.leadId} className="flex items-center gap-3 py-2.5 text-[14px]">
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/crm/leads/$leadId"
                        params={{ leadId: c.leadId }}
                        className="font-semibold text-primary hover:underline"
                      >
                        {lead?.name ?? "—"}
                      </Link>
                      <div className="text-[12.5px] text-muted-foreground">
                        {t("wh.every", { n: c.intervalDays ?? 0 })} · {dueLabel(t, c.dueInDays)}
                      </div>
                    </div>
                    <b className="tabular-nums">~{short(c.avgCheck)}</b>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onReorder(lastOrderDraft(d.orders, c.leadId, lead))}
                    >
                      {t("wh.reorder")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
        <SectionCard
          title={t("wh.low")}
          icon={AlertTriangle}
          tone="rose"
          info={t("wh.low.info")}
          actions={
            <button
              type="button"
              className="text-[13px] font-semibold text-primary"
              onClick={() => onTab("products")}
            >
              {t("wh.all")}
            </button>
          }
        >
          {low.length === 0 ? (
            <p className="text-[14px] text-muted-foreground">{t("wh.empty.low")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {low.slice(0, 6).map((p) => {
                const st = d.stock.get(p.id);
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-[14px]"
                  >
                    <span className="min-w-0 truncate">
                      {p.name}
                      <span className="block text-[12.5px] text-muted-foreground">
                        {t("wh.min")}: {p.min_stock} {p.unit}
                      </span>
                    </span>
                    <b className="tabular-nums text-destructive">
                      {(st?.qty ?? 0) - (st?.reserved ?? 0)} {p.unit}
                    </b>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title={t("wh.top")} icon={Trophy} tone="violet" info={t("wh.top.info")}>
        {top.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">{t("wh.empty.top")}</p>
        ) : (
          <ol className="divide-y divide-border">
            {top.map(([id, qty], i) => (
              <li key={id} className="flex items-center gap-3 py-2.5 text-[14px]">
                <span className="w-5 font-semibold text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <span className="flex-1">{pName.get(id)?.name ?? "—"}</span>
                <b className="tabular-nums">
                  {qty} {pName.get(id)?.unit}
                </b>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}

function dueLabel(t: (k: string, v?: Record<string, string | number>) => string, d: number | null) {
  if (d == null) return "—";
  if (d < 0) return t("wh.due.late", { n: -d });
  if (d === 0) return t("wh.due.today");
  return t("wh.due.in", { n: d });
}

function ProductsTab({
  onEdit,
  onStock,
}: {
  onEdit: (p: ProductRow | null) => void;
  onStock: (kind: MoveKind, productId?: string | null) => void;
}) {
  const { t } = useI18n();
  const { data: products = [], isLoading } = useProducts();
  const { data: stock } = useProductStock();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const cats = [...new Set(products.map((p) => p.category).filter(Boolean))] as string[];
  const list = products
    .filter((p) => !p.archived_at)
    .filter((p) => !cat || p.category === cat)
    .filter((p) => {
      const s = q.trim().toLowerCase();
      return !s || `${p.name} ${p.sku ?? ""} ${p.barcode ?? ""}`.toLowerCase().includes(s);
    });
  return (
    <SectionCard
      title={t("wh.tab.products")}
      icon={Package}
      tone="amber"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              className="w-52 bg-transparent text-[14px] outline-none"
              placeholder={t("wh.search")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          {cats.length > 0 && (
            <select
              className="h-9 rounded-lg border border-border bg-card px-2 text-[14px]"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
            >
              <option value="">{t("wh.allCats")}</option>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" onClick={() => onEdit(null)}>
            <Plus className="h-4 w-4" /> {t("wh.product.new")}
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <p className="text-[14px] text-muted-foreground">…</p>
      ) : list.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-[14px] text-muted-foreground">{t("wh.empty.products")}</p>
          <Button className="mt-3" onClick={() => onEdit(null)}>
            <Plus className="h-4 w-4" /> {t("wh.product.new")}
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">{t("wh.col.product")}</th>
                <th className="px-3 py-2.5 font-semibold">{t("wh.f.category")}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{t("wh.f.price")}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{t("wh.col.qty")}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{t("wh.col.reserved")}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{t("wh.free")}</th>
                <th className="px-3 py-2.5 font-semibold">{t("wh.col.state")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const st = stock?.get(p.id);
                const qty = st?.qty ?? 0;
                const res = st?.reserved ?? 0;
                const state = stockState(qty, res, p.min_stock);
                return (
                  <tr key={p.id} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => onEdit(p)} className="text-left">
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-[12.5px] text-muted-foreground">
                          {[p.sku, p.unit].filter(Boolean).join(" · ")}
                        </div>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.category ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatUzs(p.price)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{qty}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{res}</td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">{qty - res}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex h-6 items-center rounded-full border px-2.5 text-[12px] font-semibold",
                          state === "ok" &&
                            "border-emerald-300 text-emerald-700 dark:text-emerald-300",
                          state === "low" && "border-amber-300 text-amber-700 dark:text-amber-300",
                          state === "out" && "border-rose-300 text-rose-700 dark:text-rose-300",
                        )}
                      >
                        {t(`wh.state.${state}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => onStock("in", p.id)}>
                        {t("wh.move.in")}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function OrdersBoard() {
  const { t } = useI18n();
  const d = useWarehouseData();
  const update = useUpdateOrder();
  const [drag, setDrag] = useState<string | null>(null);
  // The order opened for viewing / editing (a click on its card).
  const [opened, setOpened] = useState<OrderWithItems | null>(null);
  const pName = new Map(d.products.map((p) => [p.id, p]));
  async function move(id: string, status: string) {
    try {
      await update.mutateAsync({ id, patch: { status } });
    } catch (e) {
      toast.error(describeError(e, t("wh.failed")));
    }
  }
  const recent = (o: OrderWithItems) =>
    o.status !== "delivered" ||
    Date.now() - Date.parse(o.delivered_at ?? o.updated_at) < 7 * 86_400_000;
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {ORDER_STATUSES.map((s, si) => {
        const col = d.orders.filter((o) => o.status === s && recent(o));
        return (
          <section
            key={s}
            aria-label={t(`wh.st.${s}`)}
            className="flex min-w-[215px] flex-1 flex-col gap-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag) void move(drag, s);
              setDrag(null);
            }}
          >
            <div
              className={cn(
                "rounded-xl border border-border border-t-[3px] bg-card px-3 py-2.5",
                STATUS_TONE[s],
              )}
            >
              <div className="text-[13px] font-bold uppercase tracking-wide">{t(`wh.st.${s}`)}</div>
              <div className="text-[12.5px] tabular-nums text-muted-foreground">
                {col.length} · {short(col.reduce((x, o) => x + o.total, 0))} so'm
              </div>
            </div>
            {col.map((o) => {
              const lead = o.lead_id ? d.leads.get(o.lead_id) : undefined;
              const next = ORDER_STATUSES[si + 1];
              return (
                <article
                  key={o.id}
                  draggable
                  onDragStart={() => setDrag(o.id)}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a, button")) return;
                    setOpened(o);
                  }}
                  className="cursor-pointer rounded-xl border border-border bg-card p-3 text-[13.5px] shadow-sm transition-colors hover:border-primary/50 active:cursor-grabbing"
                >
                  <div className="flex items-center justify-between">
                    <b className="tabular-nums">№{o.number}</b>
                    <span className="text-[12px] text-muted-foreground">
                      {o.delivery_method ? t(`wh.dl.${o.delivery_method}`) : ""}
                    </span>
                  </div>
                  {o.lead_id ? (
                    <Link
                      to="/crm/leads/$leadId"
                      params={{ leadId: o.lead_id }}
                      className="mt-1 block font-semibold text-primary hover:underline"
                    >
                      {lead?.name ?? "—"}
                    </Link>
                  ) : (
                    <div className="mt-1 font-semibold">—</div>
                  )}
                  <div className="mt-1 text-muted-foreground">
                    {o.items
                      .slice(0, 2)
                      .map((i) => pName.get(i.product_id)?.name)
                      .join(", ")}
                    {o.items.length > 2 ? ` +${o.items.length - 2}` : ""}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <b className="tabular-nums">{formatUzs(o.total)}</b>
                    {next && (
                      <button
                        type="button"
                        onClick={() => void move(o.id, next)}
                        className="rounded-md border border-border px-2 py-1 text-[12px] font-semibold hover:bg-muted"
                      >
                        {t(`wh.st.${next}`)} →
                      </button>
                    )}
                  </div>
                  {s !== "delivered" && (
                    <button
                      type="button"
                      onClick={() => void move(o.id, "cancelled")}
                      className="mt-1.5 text-[12px] text-muted-foreground hover:text-destructive"
                    >
                      {t("wh.cancelOrder")}
                    </button>
                  )}
                </article>
              );
            })}
            {!col.length && (
              <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">
                {t("wh.empty.col")}
              </div>
            )}
          </section>
        );
      })}
      {opened && (
        <OrderDialog
          key={opened.id}
          open
          order={opened}
          leadName={opened.lead_id ? d.leads.get(opened.lead_id)?.name : undefined}
          onOpenChange={(v) => !v && setOpened(null)}
        />
      )}
    </div>
  );
}

function RepeatTab({ onReorder }: { onReorder: (d: OrderDraft) => void }) {
  const { t } = useI18n();
  const d = useWarehouseData();
  const task = useRepeatTask();
  const [mode, setMode] = useState<"soon" | "dormant" | "all">("soon");
  const leadsWithOrders = new Set(
    d.orders.filter((o) => o.status === "delivered" && o.lead_id).map((o) => o.lead_id),
  );
  const repeaters = d.repeat.filter((c) => c.orders >= 2).length;
  const list =
    mode === "soon" ? dueSoon(d.repeat) : mode === "dormant" ? dormant(d.repeat) : d.repeat;
  const pName = new Map(d.products.map((p) => [p.id, p.name]));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const firstOrder = new Map<string, number>();
  for (const o of [...d.orders].reverse())
    if (o.lead_id && o.status === "delivered" && !firstOrder.has(o.lead_id))
      firstOrder.set(o.lead_id, Date.parse(o.created_at));
  const repeatRevenue = d.orders
    .filter(
      (o) =>
        o.status === "delivered" &&
        o.lead_id &&
        Date.parse(o.delivered_at ?? o.created_at) >= monthStart.getTime() &&
        (firstOrder.get(o.lead_id) ?? 0) < Date.parse(o.created_at),
    )
    .reduce((s, o) => s + o.total, 0);

  async function remind(leadId: string, name: string, ownerId: string | null) {
    try {
      await task.mutateAsync({ leadId, title: t("wh.repeatTask", { name }), assigneeId: ownerId });
      toast.success(t("wh.taskMade"));
    } catch (e) {
      toast.error(describeError(e, t("wh.failed")));
    }
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("wh.kpi.repeaters")}
          tipKey="wh.kpi.repeaters"
          icon={RefreshCw}
          iconTone="emerald"
          value={
            leadsWithOrders.size ? `${Math.round((repeaters / leadsWithOrders.size) * 100)}%` : "—"
          }
          hint={t("wh.kpi.repeatersHint", { n: repeaters, all: leadsWithOrders.size })}
        />
        <StatCard
          label={t("wh.kpi.soon")}
          tipKey="wh.kpi.soon"
          icon={CalendarClock}
          iconTone="primary"
          value={`${dueSoon(d.repeat).length}`}
          hint={`~${short(dueSoon(d.repeat).reduce((s, c) => s + c.avgCheck, 0))} so'm`}
        />
        <StatCard
          label={t("wh.kpi.dormant")}
          tipKey="wh.kpi.dormant"
          icon={Moon}
          iconTone="amber"
          value={`${dormant(d.repeat).length}`}
          hint={t("wh.kpi.dormantHint")}
        />
        <StatCard
          label={t("wh.kpi.repeatRevenue")}
          tipKey="wh.kpi.repeatRevenue"
          icon={Wallet}
          iconTone="violet"
          value={`${short(repeatRevenue)} so'm`}
          hint={t("wh.kpi.thisMonth")}
        />
      </div>
      <SectionCard
        title={t("wh.repeatList")}
        icon={Repeat2}
        tone="emerald"
        info={t("wh.repeatList.info")}
        actions={
          <Segmented
            value={mode}
            onChange={setMode}
            options={(["soon", "dormant", "all"] as const).map((k) => ({
              value: k,
              label: t(`wh.mode.${k}`),
            }))}
          />
        }
      >
        {list.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">{t("wh.empty.repeat")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                  <th className="px-3 py-2.5 font-semibold">{t("wh.order.client")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("wh.usual")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("wh.interval")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("wh.runsOut")}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t("wh.expected")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const lead = d.leads.get(c.leadId);
                  const late = (c.dueInDays ?? 0) < 0;
                  return (
                    <tr key={c.leadId} className="border-b border-border/60">
                      <td className="px-3 py-2.5">
                        <Link
                          to="/crm/leads/$leadId"
                          params={{ leadId: c.leadId }}
                          className="font-semibold text-primary hover:underline"
                        >
                          {lead?.name ?? "—"}
                        </Link>
                        <div className="text-[12.5px] text-muted-foreground">
                          {t("wh.ordersN", { n: c.orders })} · {short(c.totalSpent)} so'm
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {c.usualProducts
                          .slice(0, 2)
                          .map((id) => pName.get(id))
                          .filter(Boolean)
                          .join(", ")}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {t("wh.every", { n: c.intervalDays ?? 0 })}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-flex h-6 items-center rounded-full border px-2.5 text-[12px] font-semibold",
                            late
                              ? "border-rose-300 text-rose-700 dark:text-rose-300"
                              : "border-emerald-300 text-emerald-700 dark:text-emerald-300",
                          )}
                        >
                          {dueLabel(t, c.dueInDays)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        ~{short(c.avgCheck)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={task.isPending}
                            onClick={() =>
                              void remind(c.leadId, lead?.name ?? "", lead?.owner_id ?? null)
                            }
                          >
                            {t("wh.remind")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => onReorder(lastOrderDraft(d.orders, c.leadId, lead))}
                          >
                            {t("wh.reorder")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
