import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, FileText, Plus, Receipt, Settings } from "lucide-react";
import { CrmGate } from "@/components/CrmGate";
import { InvoiceEditorDialog } from "@/components/invoices/InvoiceEditorDialog";
import { InvoiceStatusPill } from "@/components/invoices/InvoiceStatusPill";
import { PageHeader, SectionCard, StatCard } from "@/components/layout/Primitives";
import { useInvoices, type InvoiceRow } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/invoices/invoice";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/invoices/")({
  head: () => ({ meta: [{ title: "Hisob-fakturalar — SalesIQ" }] }),
  component: () => (
    <CrmGate>
      <InvoicesPage />
    </CrmGate>
  ),
});

type Filter = "all" | InvoiceRow["status"];
const FILTERS: Filter[] = ["all", "draft", "sent", "paid", "cancelled"];

// Every invoice of the company: totals at the top (issued, paid, waiting
// for payment), a status filter and one row per invoice that opens it.
function InvoicesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const invoices = useInvoices();
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => invoices.data ?? [], [invoices.data]);
  const shown = filter === "all" ? list : list.filter((i) => i.status === filter);
  const admin = user?.role === "super_admin" || user?.role === "platform_owner";

  const sums = useMemo(() => {
    const live = list.filter((i) => i.status !== "cancelled");
    const paid = live.filter((i) => i.status === "paid");
    return {
      issued: live.reduce((a, i) => a + Number(i.total), 0),
      paid: paid.reduce((a, i) => a + Number(i.total), 0),
      waiting: live.filter((i) => i.status !== "paid").reduce((a, i) => a + Number(i.total), 0),
      count: live.length,
    };
  }, [list]);

  return (
    <>
      <PageHeader
        icon={Receipt}
        tone="amber"
        title={t("inv.listTitle")}
        description={t("inv.listDesc")}
        actions={
          <div className="flex gap-2">
            {admin && (
              <Link
                to="/admin/invoices"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-accent"
              >
                <Settings className="h-4 w-4" /> {t("inv.settings")}
              </Link>
            )}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("inv.new")}
            </button>
          </div>
        }
      />

      {invoices.data === null ? (
        <SectionCard icon={Receipt} tone="amber" title={t("inv.notReadyTitle")}>
          <p className="text-sm text-muted-foreground">{t("inv.migrationPending")}</p>
        </SectionCard>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <StatCard
              label={t("inv.statIssued")}
              value={`${formatMoney(sums.issued)}`}
              hint={t("inv.statCount", { n: sums.count })}
              icon={FileText}
              iconTone="sky"
            />
            <StatCard
              label={t("inv.statPaid")}
              value={formatMoney(sums.paid)}
              icon={CheckCircle2}
              iconTone="emerald"
            />
            <StatCard
              label={t("inv.statWaiting")}
              value={formatMoney(sums.waiting)}
              icon={Clock}
              iconTone="amber"
            />
          </div>

          <SectionCard
            icon={Receipt}
            tone="amber"
            title={t("inv.listTitle")}
            actions={
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={cn(
                      "h-8 rounded-lg px-3 text-xs font-semibold transition-colors",
                      filter === f
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {f === "all" ? t("inv.filterAll") : t(`inv.status.${f}`)}
                  </button>
                ))}
              </div>
            }
          >
            {invoices.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : !shown.length ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Receipt className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">{t("inv.empty")}</p>
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
                >
                  <Plus className="h-4 w-4" /> {t("inv.new")}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-left text-[12px] text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-semibold">{t("inv.number")}</th>
                      <th className="py-2 pr-3 font-semibold">{t("inv.date")}</th>
                      <th className="py-2 pr-3 font-semibold">{t("inv.buyer")}</th>
                      <th className="py-2 pr-3 text-right font-semibold">{t("inv.total")}</th>
                      <th className="py-2 pr-3 font-semibold">{t("inv.statusCol")}</th>
                      <th className="py-2 font-semibold">Didox</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((inv) => (
                      <tr
                        key={inv.id}
                        className="border-b border-border last:border-0 hover:bg-accent/40"
                      >
                        <td className="py-2.5 pr-3">
                          <Link
                            to="/invoices/$invoiceId"
                            params={{ invoiceId: inv.id }}
                            className="font-bold text-primary hover:underline"
                          >
                            {inv.number}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">
                          {inv.invoice_date.split("-").reverse().join(".")}
                        </td>
                        <td className="max-w-[260px] truncate py-2.5 pr-3 text-foreground">
                          {inv.buyer_name}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">
                          {formatMoney(Number(inv.total))}
                        </td>
                        <td className="py-2.5 pr-3">
                          <InvoiceStatusPill status={inv.status} />
                        </td>
                        <td className="py-2.5 text-[12px] text-muted-foreground">
                          {inv.didox_error ? (
                            <span className="text-destructive">{t("inv.didoxFailed")}</span>
                          ) : inv.didox_id ? (
                            (inv.didox_status ?? t("inv.didoxSent"))
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      <InvoiceEditorDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
