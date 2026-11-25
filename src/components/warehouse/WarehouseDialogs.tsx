// Ombor dialogs: a product (add / edit), a stock document (kirim, chiqim,
// hisobdan chiqarish) and a new order for a client (lead).
import { useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import { formatUzs } from "@/lib/currency";
import {
  useAddMoves,
  useCreateOrder,
  useOrderLeadSearch,
  useProductStock,
  useProducts,
  useSaveProduct,
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

export type MoveKind = "in" | "out" | "writeoff";

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
  const valid = lines.some((l) => num(l.qty) > 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("wh.move.title")}</DialogTitle>
        </DialogHeader>
        <Segmented
          value={kind}
          onChange={setKind}
          options={(["in", "out", "writeoff"] as const).map((k) => ({
            value: k,
            label: t(`wh.move.${k}`),
          }))}
        />
        <div className="space-y-2">
          {lines.map((l, i) => {
            const p = byId.get(l.productId);
            return (
              <div key={l.productId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{p?.name}</span>
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: OrderDraft | undefined;
  onCreated?: () => void;
}) {
  const { t } = useI18n();
  const { data: products = [] } = useProducts();
  const { data: stock } = useProductStock();
  const create = useCreateOrder();
  const [lead, setLead] = useState<LeadBrief | null>(initial?.lead ?? null);
  const [leadQ, setLeadQ] = useState("");
  const found = useOrderLeadSearch(leadQ);
  const [lines, setLines] = useState<Line[]>(
    () =>
      initial?.lines.map((l) => ({
        productId: l.productId,
        qty: String(l.qty),
        price: String(l.price),
      })) ?? [],
  );
  const [discount, setDiscount] = useState("");
  const [delivery, setDelivery] = useState<"courier" | "post" | "pickup" | "">("");
  const [address, setAddress] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const subtotal = lines.reduce((s, l) => s + num(l.qty) * num(l.price), 0);
  const total = Math.round(subtotal * (1 - Math.min(100, num(discount)) / 100));
  async function submit() {
    try {
      await create.mutateAsync({
        leadId: lead?.id ?? null,
        lines: lines.map((l) => ({ productId: l.productId, qty: num(l.qty), price: num(l.price) })),
        discountPct: Math.min(100, num(discount)),
        deliveryMethod: delivery || null,
        deliveryAddress: address || null,
        source: "manual",
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
          <DialogTitle>{t("wh.order.new")}</DialogTitle>
        </DialogHeader>
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
                        onClick={() => setLines((all) => all.filter((_, j) => j !== i))}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
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
        <ProductPicker
          products={products}
          exclude={new Set(lines.map((l) => l.productId))}
          onPick={(p) =>
            setLines((all) => [...all, { productId: p.id, qty: "1", price: String(p.price) }])
          }
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("wh.order.discount")}>
            <input
              className={fieldCls}
              inputMode="decimal"
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="text-[20px] font-bold tabular-nums">{formatUzs(total)}</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void submit()} disabled={!valid || create.isPending}>
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {t("wh.order.create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
