import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useInvoiceAction, useInvoiceSettings, type NewInvoice } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import {
  amountInWords,
  formatMoney,
  invoiceTotals,
  isTin,
  type InvoiceItem,
} from "@/lib/invoices/invoice";
import { cn, describeError } from "@/lib/utils";

const today = () => new Date().toISOString().slice(0, 10);

type Line = InvoiceItem & { key: number };
let lineKey = 0;

// A new invoice: buyer, contract, lines (with MXIK code and unit for
// Didox), VAT on/off, live totals and the amount in words. Opened from a
// lead (buyer and amount filled in) or from the invoice list.
export function InvoiceEditorDialog({
  open,
  onOpenChange,
  leadId = null,
  defaultBuyer = "",
  defaultItemName = "",
  defaultAmount = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string | null;
  defaultBuyer?: string;
  defaultItemName?: string;
  defaultAmount?: number;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: cfg } = useInvoiceSettings();
  const settings = cfg?.settings ?? null;
  const create = useInvoiceAction();

  const blankLine = (name = "", price = 0): Line => ({
    key: ++lineKey,
    name,
    quantity: 1,
    price,
    catalogCode: settings?.default_catalog_code ?? "",
    catalogName: settings?.default_catalog_name ?? "",
    packageCode: settings?.default_package_code ?? "",
    packageName: settings?.default_package_name ?? t("inv.unitDefault"),
  });

  const [form, setForm] = useState({
    date: today(),
    contractNo: "",
    contractDate: "",
    buyerName: defaultBuyer,
    buyerTin: "",
    buyerAddress: "",
    buyerAccount: "",
    buyerBankMfo: "",
    note: "",
  });
  const [hasVat, setHasVat] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);

  // Fresh form each time it opens, with the lead's data and the company's defaults.
  useEffect(() => {
    if (!open) return;
    setForm({
      date: today(),
      contractNo: "",
      contractDate: "",
      buyerName: defaultBuyer,
      buyerTin: "",
      buyerAddress: "",
      buyerAccount: "",
      buyerBankMfo: "",
      note: "",
    });
    setHasVat(settings?.has_vat ?? true);
    setLines([blankLine(defaultItemName, defaultAmount)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const vatRate = Number(settings?.vat_rate ?? 12);
  const totals = useMemo(
    () => invoiceTotals({ items: lines, hasVat, vatRate }),
    [lines, hasVat, vatRate],
  );
  const setLine = (key: number, patch: Partial<InvoiceItem>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const valid = form.buyerName.trim() && lines.some((l) => l.name.trim() && l.quantity > 0);

  async function submit() {
    if (!valid || create.isPending) return;
    const body: NewInvoice & { action: "create" } = {
      action: "create",
      leadId,
      date: form.date,
      contractNo: form.contractNo,
      contractDate: form.contractDate || undefined,
      buyerName: form.buyerName,
      buyerTin: form.buyerTin,
      buyerAddress: form.buyerAddress,
      buyerAccount: form.buyerAccount,
      buyerBankMfo: form.buyerBankMfo,
      hasVat,
      note: form.note,
      items: lines
        .filter((l) => l.name.trim())
        .map(({ key: _k, ...item }) => ({
          ...item,
          quantity: Number(item.quantity),
          price: Number(item.price),
        })),
    };
    try {
      const { invoice } = await create.mutateAsync(body);
      toast.success(t("inv.created", { number: invoice?.number ?? "" }));
      onOpenChange(false);
      if (invoice) void navigate({ to: "/invoices/$invoiceId", params: { invoiceId: invoice.id } });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      toast.error(
        code === "MIGRATION_PENDING"
          ? t("inv.migrationPending")
          : describeError(err, t("inv.createFailed")),
      );
    }
  }

  const input =
    "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary/50";
  const label = "mb-1 block text-[12px] font-semibold text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-amber-600" /> {t("inv.newTitle")}
          </DialogTitle>
        </DialogHeader>

        {cfg && !cfg.ready ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            {t("inv.migrationPending")}
          </p>
        ) : (
          <div className="space-y-5">
            {!settings?.company_name && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-foreground">
                {t("inv.noRequisites")}
              </p>
            )}

            <section className="grid gap-3 sm:grid-cols-3">
              <div>
                <span className={label}>{t("inv.date")}</span>
                <input
                  type="date"
                  className={input}
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <span className={label}>{t("inv.contractNo")}</span>
                <input
                  className={input}
                  value={form.contractNo}
                  onChange={(e) => setForm({ ...form, contractNo: e.target.value })}
                />
              </div>
              <div>
                <span className={label}>{t("inv.contractDate")}</span>
                <input
                  type="date"
                  className={input}
                  value={form.contractDate}
                  onChange={(e) => setForm({ ...form, contractDate: e.target.value })}
                />
              </div>
            </section>

            <section className="rounded-xl border border-border p-4">
              <p className="mb-3 text-sm font-bold text-foreground">{t("inv.buyer")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <span className={label}>{t("inv.buyerName")} *</span>
                  <input
                    className={input}
                    value={form.buyerName}
                    onChange={(e) => setForm({ ...form, buyerName: e.target.value })}
                  />
                </div>
                <div>
                  <span className={label}>{t("inv.tin")}</span>
                  <input
                    className={cn(
                      input,
                      form.buyerTin && !isTin(form.buyerTin) && "border-destructive/60",
                    )}
                    inputMode="numeric"
                    value={form.buyerTin}
                    onChange={(e) => setForm({ ...form, buyerTin: e.target.value })}
                    placeholder="123456789"
                  />
                </div>
                <div>
                  <span className={label}>{t("inv.address")}</span>
                  <input
                    className={input}
                    value={form.buyerAddress}
                    onChange={(e) => setForm({ ...form, buyerAddress: e.target.value })}
                  />
                </div>
                <div>
                  <span className={label}>{t("inv.account")}</span>
                  <input
                    className={input}
                    inputMode="numeric"
                    value={form.buyerAccount}
                    onChange={(e) => setForm({ ...form, buyerAccount: e.target.value })}
                  />
                </div>
                <div>
                  <span className={label}>{t("inv.mfo")}</span>
                  <input
                    className={input}
                    inputMode="numeric"
                    value={form.buyerBankMfo}
                    onChange={(e) => setForm({ ...form, buyerBankMfo: e.target.value })}
                  />
                </div>
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-foreground">{t("inv.items")}</p>
                <label className="flex items-center gap-2 text-[13px] text-foreground">
                  <Switch checked={hasVat} onCheckedChange={setHasVat} />
                  {hasVat ? t("inv.withVat", { rate: vatRate }) : t("inv.withoutVat")}
                </label>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-surface text-[12px] text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold">{t("inv.itemName")}</th>
                      <th className="w-[150px] px-2 py-2 text-left font-semibold">
                        {t("inv.mxik")}
                      </th>
                      <th className="w-[90px] px-2 py-2 text-left font-semibold">
                        {t("inv.unit")}
                      </th>
                      <th className="w-[80px] px-2 py-2 text-right font-semibold">
                        {t("inv.qty")}
                      </th>
                      <th className="w-[130px] px-2 py-2 text-right font-semibold">
                        {t("inv.price")}
                      </th>
                      <th className="w-[130px] px-2 py-2 text-right font-semibold">
                        {t("inv.lineTotal")}
                      </th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const lineSum = (Number(l.quantity) || 0) * (Number(l.price) || 0);
                      return (
                        <tr key={l.key} className="border-t border-border">
                          <td className="p-1.5">
                            <input
                              className={input}
                              value={l.name}
                              onChange={(e) => setLine(l.key, { name: e.target.value })}
                              placeholder={t("inv.itemPlaceholder")}
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              className={input}
                              inputMode="numeric"
                              value={l.catalogCode ?? ""}
                              onChange={(e) => setLine(l.key, { catalogCode: e.target.value })}
                              placeholder="17 xona"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              className={input}
                              value={l.packageName ?? ""}
                              onChange={(e) => setLine(l.key, { packageName: e.target.value })}
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              className={cn(input, "text-right tabular-nums")}
                              value={l.quantity}
                              onChange={(e) => setLine(l.key, { quantity: Number(e.target.value) })}
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              className={cn(input, "text-right tabular-nums")}
                              value={l.price}
                              onChange={(e) => setLine(l.key, { price: Number(e.target.value) })}
                            />
                          </td>
                          <td className="px-2 text-right tabular-nums text-foreground">
                            {formatMoney(lineSum)}
                          </td>
                          <td className="p-1.5">
                            <button
                              type="button"
                              disabled={lines.length === 1}
                              onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                              aria-label={t("inv.removeLine")}
                              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
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
              <button
                type="button"
                onClick={() => setLines((ls) => [...ls, blankLine()])}
                className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-primary hover:bg-primary/10"
              >
                <Plus className="h-4 w-4" /> {t("inv.addLine")}
              </button>
            </section>

            <section className="flex flex-wrap items-end justify-between gap-4 rounded-xl bg-surface p-4">
              <div className="min-w-0 flex-1">
                <span className={label}>{t("inv.note")}</span>
                <input
                  className={input}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
                <p className="mt-2 text-[12.5px] italic text-muted-foreground">
                  {amountInWords(totals.total)}
                </p>
              </div>
              <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
                <dt className="text-muted-foreground">{t("inv.sumNoVat")}</dt>
                <dd className="text-right">{formatMoney(totals.sum)}</dd>
                <dt className="text-muted-foreground">{t("inv.vat")}</dt>
                <dd className="text-right">{formatMoney(totals.vat)}</dd>
                <dt className="font-bold text-foreground">{t("inv.total")}</dt>
                <dd className="text-right text-base font-bold text-foreground">
                  {formatMoney(totals.total)} {t("inv.som")}
                </dd>
              </dl>
            </section>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-10 rounded-xl border border-border px-4 text-sm font-medium hover:bg-accent"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!valid || create.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("inv.create")}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
