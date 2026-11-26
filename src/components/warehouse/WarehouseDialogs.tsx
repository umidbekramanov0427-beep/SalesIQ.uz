// Ombor dialogs: a product (add / edit), a stock document (kirim, chiqim,
// hisobdan chiqarish) and a new order for a client (lead).
import { useMemo, useState } from "react";
import { Archive, Loader2, Plus, Search, Star, Trash2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import { formatUzs } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUSES,
  useAddMoves,
  useCreateOrder,
  useSaveOrder,
  type OrderWithItems,
  useOrderLeadSearch,
  useProductStock,
  useProducts,
  useSaveProduct,
  useSaveWarehouse,
  useStockLevels,
  useWarehouses,
  type LeadBrief,
  type ProductRow,
} from "@/hooks/crm/warehouse";

const fieldCls =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-[14px] outline-none focus:border-primary/60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const num = (v: string) => {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function ProductDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: ProductRow | null;
}) {
  const { t } = useI18n();
  const save = useSaveProduct();
  const [f, setF] = useState(() => ({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? "",
    category: product?.category ?? "",
    unit: product?.unit ?? "dona",
    price: String(product?.price ?? ""),
    cost: String(product?.cost ?? ""),
    min_stock: String(product?.min_stock ?? ""),
  }));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  async function submit() {
    if (!f.name.trim()) return;
    try {
      await save.mutateAsync({
        ...(product ? { id: product.id } : {}),
        name: f.name.trim(),
        sku: f.sku.trim() || null,
        barcode: f.barcode.trim() || null,
        category: f.category.trim() || null,
        unit: f.unit.trim() || "dona",
        price: num(f.price),
        cost: num(f.cost),
        min_stock: num(f.min_stock),
      });
      toast.success(t("wh.saved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(describeError(e, t("wh.failed")));
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? t("wh.product.edit") : t("wh.product.new")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t("wh.f.name")}>
              <input className={fieldCls} value={f.name} onChange={set("name")} autoFocus />
            </Field>
          </div>
          <Field label={t("wh.f.sku")}>
            <input className={fieldCls} value={f.sku} onChange={set("sku")} />
          </Field>
          <Field label={t("wh.f.barcode")}>
            <input className={fieldCls} value={f.barcode} onChange={set("barcode")} />
          </Field>
          <Field label={t("wh.f.category")}>
            <input className={fieldCls} value={f.category} onChange={set("category")} />
          </Field>
          <Field label={t("wh.f.unit")}>
            <input className={fieldCls} value={f.unit} onChange={set("unit")} placeholder="dona" />
          </Field>
          <Field label={t("wh.f.price")}>
            <input
              className={fieldCls}
              inputMode="decimal"
              value={f.price}
              onChange={set("price")}
            />
          </Field>
          <Field label={t("wh.f.cost")}>
            <input className={fieldCls} inputMode="decimal" value={f.cost} onChange={set("cost")} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("wh.f.minStock")}>
              <input
                className={fieldCls}
                inputMode="decimal"
                value={f.min_stock}
                onChange={set("min_stock")}
              />
            </Field>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!f.name.trim() || save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Line = { productId: string; qty: string; price: string };

function ProductPicker({
  products,
  onPick,
  exclude,
}: {
  products: ProductRow[];
  onPick: (p: ProductRow) => void;
  exclude: Set<string>;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const list = products
    .filter((p) => !p.archived_at && !exclude.has(p.id))
    .filter((p) => {
      const s = q.trim().toLowerCase();
      return !s || `${p.name} ${p.sku ?? ""} ${p.barcode ?? ""}`.toLowerCase().includes(s);
    })
    .slice(0, 8);
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          className="h-10 flex-1 bg-transparent text-[14px] outline-none"
          placeholder={t("wh.pickProduct")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="max-h-44 overflow-y-auto">
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              onPick(p);
              setQ("");
            }}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-[14px] hover:bg-muted"
          >
            <span className="truncate">{p.name}</span>
            <span className="text-[12.5px] tabular-nums text-muted-foreground">
              {formatUzs(p.price)}
            </span>
          </button>
        ))}
        {!list.length && (
          <p className="px-3 py-3 text-[13px] text-muted-foreground">{t("wh.noProducts")}</p>
        )}
      </div>
    </div>
  );
}

export type MoveKind = "in" | "out" | "writeoff" | "transfer";

/** The open warehouses, the default first. */
export function useOpenWarehouses() {
  const { data = [] } = useWarehouses();
  return useMemo(
    () =>
      data
        .filter((w) => !w.archived_at)
        .sort((a, b) => Number(b.is_default) - Number(a.is_default)),
    [data],
  );
}

/** «Ombor:» — shown only when the company has more than one. */
export function WarehouseSelect({
  value,
  onChange,
  label,
  exclude,
}: {
  value: string;
  onChange: (id: string) => void;
  label: string;
  exclude?: string;
}) {
  const list = useOpenWarehouses().filter((w) => w.id !== exclude);
  return (
    <Field label={label}>
      <select className={fieldCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {list.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** «Omborlar»: the company's warehouses — add, rename, make default, archive. */
export function WarehousesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const { data: all = [] } = useWarehouses();
  const { data: levels } = useStockLevels();
  const { data: products = [] } = useProducts();
  const save = useSaveWarehouse();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const cost = new Map(products.map((p) => [p.id, p.cost]));
  const list = all.filter((w) => !w.archived_at);
  const run = async (input: Parameters<typeof save.mutateAsync>[0]) => {
    try {
      await save.mutateAsync(input);
      toast.success(t("wh.saved"));
    } catch (e) {
      toast.error(describeError(e, t("wh.failed")));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="h-4 w-4" /> {t("wh.whs.title")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-muted-foreground">{t("wh.whs.desc")}</p>
        <div className="divide-y divide-border rounded-xl border border-border">
          {list.length === 0 && (
            <p className="px-3 py-3 text-[13px] text-muted-foreground">{t("wh.whs.none")}</p>
          )}
          {list.map((w) => {
            const m = levels?.get(w.id);
            let units = 0;
            let value = 0;
            for (const [pid, q] of m ?? []) {
              units += q;
              value += q * (cost.get(pid) ?? 0);
            }
            return (
              <div key={w.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <input
                    defaultValue={w.name}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      e.target.value.trim() !== w.name &&
                      void run({ id: w.id, name: e.target.value })
                    }
                    className="w-full bg-transparent text-[14px] font-semibold outline-none focus:underline"
                  />
                  <p className="truncate text-[12px] text-muted-foreground">
                    {w.address ? `${w.address} · ` : ""}
                    {t("wh.whs.units", { n: Math.round(units) })} · {formatUzs(value)}
                  </p>
                </div>
                {w.is_default ? (
                  <span className="inline-flex h-7 items-center gap-1 rounded-full border border-amber-300 px-2.5 text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">
                    <Star className="h-3 w-3" /> {t("wh.whs.default")}
                  </span>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void run({ id: w.id, is_default: true })}
                    >
                      <Star className="h-3.5 w-3.5" /> {t("wh.whs.makeDefault")}
                    </Button>
                    <button
                      type="button"
                      title={units > 0 ? t("wh.whs.notEmpty") : t("wh.whs.archive")}
                      disabled={units > 0}
                      onClick={() => void run({ id: w.id, archived: true })}
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-destructive disabled:opacity-40"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t("wh.whs.name")}>
            <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("wh.whs.address")}>
            <input
              className={fieldCls}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>
          <Button
            disabled={!name.trim() || save.isPending}
            onClick={() =>
              void run({ name, address, is_default: list.length === 0 }).then(() => {
                setName("");
                setAddress("");
              })
            }
          >
            <Plus className="h-4 w-4" /> {t("wh.whs.add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StockDialog({
  open,
  onOpenChange,
  kind: initialKind,
  productId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: MoveKind;
  productId?: string | null;
}) {
  const { t } = useI18n();
  const { data: products = [] } = useProducts();
  const add = useAddMoves();
  const whs = useOpenWarehouses();
  const { data: levels } = useStockLevels();
  const [wh, setWh] = useState("");
  const [to, setTo] = useState("");
  const from = wh || whs[0]?.id || "";
  const dest = to || whs.find((w) => w.id !== from)?.id || "";
  const many = whs.length > 1;
  const [kind, setKind] = useState<MoveKind>(initialKind);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    productId ? [{ productId, qty: "", price: "" }] : [],
  );
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  async function submit() {
    try {
      await add.mutateAsync({
        kind,
        note,
        warehouseId: from || null,
        ...(kind === "transfer" ? { toWarehouseId: dest || null } : {}),
        lines: lines
          .map((l) => ({
            productId: l.productId,
            qty: num(l.qty),
            unitCost: kind === "in" && l.price ? num(l.price) : null,
          }))
          .filter((l) => l.qty > 0),
      });
      toast.success(t("wh.saved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(describeError(e, t("wh.failed")));
    }
  }
  const valid =
    lines.some((l) => num(l.qty) > 0) && (kind !== "transfer" || (!!dest && dest !== from));
  const have = (pid: string) => levels?.get(from)?.get(pid) ?? 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("wh.move.title")}</DialogTitle>
        </DialogHeader>
        <Segmented
          value={kind}
          onChange={setKind}
          options={(many
            ? (["in", "out", "writeoff", "transfer"] as const)
            : (["in", "out", "writeoff"] as const)
          ).map((k) => ({
            value: k,
            label: t(`wh.move.${k}`),
          }))}
        />
        {many && (
          <div className={cn("grid gap-2", kind === "transfer" && "sm:grid-cols-2")}>
            <WarehouseSelect
              value={from}
              onChange={setWh}
              label={kind === "transfer" ? t("wh.whs.from") : t("wh.whs.one")}
            />
            {kind === "transfer" && (
              <WarehouseSelect
                value={dest}
                onChange={setTo}
                label={t("wh.whs.to")}
                exclude={from}
              />
            )}
          </div>
        )}
        <div className="space-y-2">
          {lines.map((l, i) => {
            const p = byId.get(l.productId);
            return (
              <div key={l.productId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                  {p?.name}
                  {kind !== "in" && (
                    <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">
                      ({t("wh.whs.have", { n: have(l.productId) })})
                    </span>
                  )}
                </span>
                <input
                  className={`${fieldCls} w-24`}
                  inputMode="decimal"
                  placeholder={p?.unit ?? t("wh.qty")}
                  value={l.qty}
                  onChange={(e) =>
                    setLines((all) =>
                      all.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)),
                    )
                  }
                />
                {kind === "in" && (
                  <input
                    className={`${fieldCls} w-32`}
                    inputMode="decimal"
                    placeholder={t("wh.f.cost")}
                    value={l.price}
                    onChange={(e) =>
                      setLines((all) =>
                        all.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)),
                      )
                    }
                  />
                )}
                <button
                  type="button"
                  aria-label={t("common.delete")}
                  onClick={() => setLines((all) => all.filter((_, j) => j !== i))}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
        <ProductPicker
          products={products}
          exclude={new Set(lines.map((l) => l.productId))}
          onPick={(p) =>
            setLines((all) => [...all, { productId: p.id, qty: "", price: String(p.cost || "") }])
          }
        />
        <Field label={t("wh.note")}>
          <input className={fieldCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!valid || add.isPending}>
            {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type OrderDraft = {
  lead: LeadBrief | null;
  lines: { productId: string; qty: number; price: number }[];
};

export function OrderDialog({
  open,
  onOpenChange,
  initial,
  onCreated,
  order,
  leadName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: OrderDraft | undefined;
  onCreated?: () => void;
  /** An existing order: the dialog opens it for viewing and editing. */
  order?: OrderWithItems | undefined;
  leadName?: string | undefined;
}) {
  const { t } = useI18n();
  const { data: products = [] } = useProducts();
  const { data: stock } = useProductStock();
  const create = useCreateOrder();
  const save = useSaveOrder();
  const whs = useOpenWarehouses();
  const [wh, setWh] = useState("");
  // Once the goods have left the stock the lines are fixed (the stock
  // journal already holds them); everything else can still change.
  const locked = !!order?.stock_out_at;
  const [status, setStatus] = useState(order?.status ?? "new");
  const [paid, setPaid] = useState(order?.paid_status ?? "unpaid");
  const [tracking, setTracking] = useState(order?.tracking ?? "");
  const [deliveryAt, setDeliveryAt] = useState(order?.delivery_at?.slice(0, 10) ?? "");
  const [note, setNote] = useState(order?.note ?? "");
  const [lead, setLead] = useState<LeadBrief | null>(
    order
      ? order.lead_id
        ? { id: order.lead_id, name: leadName ?? "—", owner_id: null, phone: null }
        : null
      : (initial?.lead ?? null),
  );
  const [leadQ, setLeadQ] = useState("");
  const found = useOrderLeadSearch(leadQ);
  const [lines, setLines] = useState<Line[]>(
    () =>
      (order
        ? order.items.map((i) => ({ productId: i.product_id, qty: i.qty, price: i.price }))
        : initial?.lines
      )?.map((l) => ({
        productId: l.productId,
        qty: String(l.qty),
        price: String(l.price),
      })) ?? [],
  );
  const [discount, setDiscount] = useState(order?.discount_pct ? String(order.discount_pct) : "");
  const [delivery, setDelivery] = useState<"courier" | "post" | "pickup" | "">(
    (order?.delivery_method as "courier" | "post" | "pickup" | null) ?? "",
  );
  const [address, setAddress] = useState(order?.delivery_address ?? "");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const subtotal = lines.reduce((s, l) => s + num(l.qty) * num(l.price), 0);
  const total = Math.round(subtotal * (1 - Math.min(100, num(discount)) / 100));
  async function submit() {
    if (order) {
      try {
        await save.mutateAsync({
          id: order.id,
          patch: {
            lead_id: lead?.id ?? null,
            status,
            paid_status: paid,
            tracking: tracking.trim() || null,
            delivery_at: deliveryAt ? new Date(`${deliveryAt}T12:00:00`).toISOString() : null,
            note: note.trim() || null,
            delivery_method: delivery || null,
            delivery_address: address || null,
            ...(locked ? {} : { discount_pct: Math.min(100, num(discount)) }),
          },
          lines: locked
            ? undefined
            : lines.map((l) => ({ productId: l.productId, qty: num(l.qty), price: num(l.price) })),
        });
        toast.success(t("wh.order.saved"));
        onOpenChange(false);
      } catch (e) {
        toast.error(describeError(e, t("wh.failed")));
      }
      return;
    }
    try {
      await create.mutateAsync({
        leadId: lead?.id ?? null,
        lines: lines.map((l) => ({ productId: l.productId, qty: num(l.qty), price: num(l.price) })),
        discountPct: Math.min(100, num(discount)),
        deliveryMethod: delivery || null,
        deliveryAddress: address || null,
        source: "manual",
        warehouseId: wh || whs[0]?.id || null,
      });
      toast.success(t("wh.order.created"));
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      toast.error(describeError(e, t("wh.failed")));
    }
  }
  const valid = lines.some((l) => num(l.qty) > 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {order ? t("wh.order.title", { n: order.number }) : t("wh.order.new")}
          </DialogTitle>
        </DialogHeader>
        {!order && whs.length > 1 && (
          <WarehouseSelect value={wh || whs[0]!.id} onChange={setWh} label={t("wh.whs.one")} />
        )}
        {order && (
          // Where the order is: one click moves it (the lead's stage follows).
          <div className="flex flex-wrap gap-1">
            {[...ORDER_STATUSES, "cancelled" as const].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                  status === s
                    ? s === "cancelled"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-primary bg-primary/10 text-primary"
                    : "border-border text-foreground/80 hover:border-primary/40",
                )}
              >
                {t(`wh.st.${s}`)}
              </button>
            ))}
          </div>
        )}
        <Field label={t("wh.order.client")}>
          {lead ? (
            <div className="flex h-10 items-center justify-between rounded-lg border border-border px-3 text-[14px]">
              <span className="font-semibold">{lead.name}</span>
              <button
                type="button"
                className="text-[13px] font-semibold text-primary"
                onClick={() => setLead(null)}
              >
                {t("wh.change")}
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-border">
              <input
                className="h-10 w-full rounded-lg bg-transparent px-3 text-[14px] outline-none"
                placeholder={t("wh.order.findClient")}
                value={leadQ}
                onChange={(e) => setLeadQ(e.target.value)}
              />
              {(found.data ?? []).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLead(l)}
                  className="flex w-full justify-between border-t border-border px-3 py-2 text-left text-[14px] hover:bg-muted"
                >
                  <span>{l.name}</span>
                  <span className="text-[12.5px] text-muted-foreground">{l.phone}</span>
                </button>
              ))}
            </div>
          )}
        </Field>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="px-3 py-2 font-semibold">{t("wh.col.product")}</th>
                <th className="px-3 py-2 font-semibold">{t("wh.qty")}</th>
                <th className="px-3 py-2 font-semibold">{t("wh.f.price")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("wh.sum")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const p = byId.get(l.productId);
                const st = stock?.get(l.productId);
                const free = st ? st.qty - st.reserved : 0;
                const short = num(l.qty) > free;
                return (
                  <tr key={l.productId} className="border-b border-border/60">
                    <td className="px-3 py-2">
                      <div className="font-medium">{p?.name}</div>
                      <div
                        className={
                          short
                            ? "text-[12px] text-destructive"
                            : "text-[12px] text-muted-foreground"
                        }
                      >
                        {t("wh.free")}: {free} {p?.unit}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className={`${fieldCls} w-20`}
                        disabled={locked}
                        inputMode="decimal"
                        value={l.qty}
                        onChange={(e) =>
                          setLines((all) =>
                            all.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className={`${fieldCls} w-28`}
                        disabled={locked}
                        inputMode="decimal"
                        value={l.price}
                        onChange={(e) =>
                          setLines((all) =>
                            all.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {formatUzs(num(l.qty) * num(l.price))}
                    </td>
                    <td className="px-2">
                      <button
                        type="button"
                        aria-label={t("common.delete")}
                        disabled={locked}
                        onClick={() => setLines((all) => all.filter((_, j) => j !== i))}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {locked ? (
          <p className="text-[12.5px] text-muted-foreground">{t("wh.order.locked")}</p>
        ) : (
          <ProductPicker
            products={products}
            exclude={new Set(lines.map((l) => l.productId))}
            onPick={(p) =>
              setLines((all) => [...all, { productId: p.id, qty: "1", price: String(p.price) }])
            }
          />
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("wh.order.discount")}>
            <input
              className={fieldCls}
              inputMode="decimal"
              disabled={locked}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label={t("wh.order.delivery")}>
            <select
              className={fieldCls}
              value={delivery}
              onChange={(e) => setDelivery(e.target.value as typeof delivery)}
            >
              <option value="">—</option>
              <option value="courier">{t("wh.dl.courier")}</option>
              <option value="post">{t("wh.dl.post")}</option>
              <option value="pickup">{t("wh.dl.pickup")}</option>
            </select>
          </Field>
          <Field label={t("wh.order.address")}>
            <input
              className={fieldCls}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>
        </div>
        {order && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("wh.order.paid")}>
              <select className={fieldCls} value={paid} onChange={(e) => setPaid(e.target.value)}>
                <option value="unpaid">{t("wh.paid.unpaid")}</option>
                <option value="partial">{t("wh.paid.partial")}</option>
                <option value="paid">{t("wh.paid.paid")}</option>
              </select>
            </Field>
            <Field label={t("wh.order.deliveryAt")}>
              <input
                type="date"
                className={fieldCls}
                value={deliveryAt}
                onChange={(e) => setDeliveryAt(e.target.value)}
              />
            </Field>
            <Field label={t("wh.order.tracking")}>
              <input
                className={fieldCls}
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-3">
              <Field label={t("wh.note")}>
                <input
                  className={fieldCls}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="text-[20px] font-bold tabular-nums">{formatUzs(total)}</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={(!valid && !locked) || create.isPending || save.isPending}
            >
              {create.isPending || save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                !order && <Plus className="h-4 w-4" />
              )}
              {order ? t("common.save") : t("wh.order.create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
