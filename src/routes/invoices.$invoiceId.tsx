import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Printer,
  RefreshCw,
  Send,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { BackButton } from "@/components/layout/BackButton";
import { CrmGate } from "@/components/CrmGate";
import { InvoiceStatusPill } from "@/components/invoices/InvoiceStatusPill";
import {
  useInvoice,
  useInvoiceAction,
  useInvoiceSettings,
  type InvoiceRow,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  amountInWords,
  formatMoney,
  invoiceTotals,
  lineTotals,
  type InvoiceItem,
} from "@/lib/invoices/invoice";
import { cn, describeError } from "@/lib/utils";

export const Route = createFileRoute("/invoices/$invoiceId")({
  head: () => ({ meta: [{ title: "Hisob-faktura — SalesIQ" }] }),
  component: () => (
    <CrmGate>
      <InvoicePage />
    </CrmGate>
  ),
});

const dmy = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split("-").reverse().join(".") : "";

// One invoice as the A4 document that gets printed (or saved as PDF from
// the print window), with its actions above it: mark paid, send to Didox,
// refresh the Didox status, cancel, delete a draft.
function InvoicePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { invoiceId } = Route.useParams();
  const { data: inv, isLoading } = useInvoice(invoiceId);
  const { data: cfg } = useInvoiceSettings();
  const action = useInvoiceAction();
  const s = cfg?.settings ?? null;
  const manager =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </p>
    );
  }
  if (!inv) {
    return (
      <>
        <BackButton className="mb-4" />
        <p className="text-sm text-muted-foreground">{t("inv.notFound")}</p>
      </>
    );
  }

  async function run(body: Record<string, unknown>, ok: string) {
    try {
      await action.mutateAsync({ id: inv!.id, ...body });
      toast.success(ok);
    } catch (err) {
      const e = err as Error & { problems?: string[] };
      if (e.message === "DIDOX_NOT_CONNECTED") {
        toast.error(t("inv.didoxNotConnected"), { duration: 8000 });
      } else if (e.message === "REQUISITES" && e.problems) {
        toast.error(
          `${t("inv.fixRequisites")}: ${e.problems.map((p) => t(`inv.problem.${p}`)).join(", ")}`,
          { duration: 9000 },
        );
      } else {
        toast.error(describeError(err, t("inv.actionFailed")));
      }
    }
  }

  const items = (inv.items as unknown as InvoiceItem[]) ?? [];
  const vatRate = Number(s?.vat_rate ?? 12);
  const totals = invoiceTotals({ items, hasVat: inv.has_vat, vatRate });
  const btn =
    "inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50";

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <BackButton />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <InvoiceStatusPill status={inv.status} />
          <button type="button" className={btn} onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> {t("inv.print")}
          </button>
          {inv.status !== "paid" && inv.status !== "cancelled" && (
            <button
              type="button"
              className={cn(btn, "border-emerald-500/40 text-emerald-700 dark:text-emerald-300")}
              disabled={action.isPending}
              onClick={() => void run({ action: "status", status: "paid" }, t("inv.markedPaid"))}
            >
              <CheckCircle2 className="h-4 w-4" /> {t("inv.markPaid")}
            </button>
          )}
          {inv.status === "paid" && (
            <button
              type="button"
              className={btn}
              disabled={action.isPending}
              onClick={() => void run({ action: "status", status: "sent" }, t("inv.unpaid"))}
            >
              <Undo2 className="h-4 w-4" /> {t("inv.markUnpaid")}
            </button>
          )}
          {manager && inv.status !== "cancelled" && (
            <button
              type="button"
              className={cn(btn, "border-sky-500/40 text-sky-700 dark:text-sky-300")}
              disabled={action.isPending}
              onClick={() =>
                void run(
                  { action: inv.didox_id ? "didox-refresh" : "didox-send" },
                  inv.didox_id ? t("inv.didoxRefreshed") : t("inv.didoxSentOk"),
                )
              }
            >
              {action.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : inv.didox_id ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {inv.didox_id ? t("inv.didoxRefresh") : t("inv.didoxSend")}
            </button>
          )}
          {inv.status !== "cancelled" && inv.status !== "paid" && (
            <button
              type="button"
              className={btn}
              disabled={action.isPending}
              onClick={() =>
                void run({ action: "status", status: "cancelled" }, t("inv.cancelledOk"))
              }
            >
              <XCircle className="h-4 w-4" /> {t("inv.cancel")}
            </button>
          )}
          {manager && inv.status === "draft" && !inv.didox_id && <DeleteButton invoice={inv} />}
        </div>
      </div>

      {(inv.didox_id || inv.didox_error) && (
        <div
          className={cn(
            "no-print mb-4 rounded-xl border px-4 py-3 text-[13px]",
            inv.didox_error
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-sky-500/30 bg-sky-500/10 text-foreground",
          )}
        >
          {inv.didox_error ? (
            <>
              <b>{t("inv.didoxFailed")}:</b> {inv.didox_error}
            </>
          ) : (
            <>
              {t("inv.didoxDraftNote")}{" "}
              <a
                href="https://app.didox.uz"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary underline"
              >
                Didox <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {inv.didox_status && (
                <span className="ml-2 text-muted-foreground">
                  ({t("inv.didoxStatus")}: {inv.didox_status})
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* The document itself: white paper in both themes, A4 when printed. */}
      <article className="print-area rounded-2xl border border-border bg-white p-10 text-[13px] leading-snug text-neutral-900 shadow-sm">
        <header className="text-center">
          <h1 className="text-xl font-bold uppercase tracking-wide">{t("inv.docTitle")}</h1>
          <p className="mt-1">
            № <b>{inv.number}</b> · {dmy(inv.invoice_date)}
          </p>
          {inv.contract_no && (
            <p className="mt-0.5 text-neutral-600">
              {t("inv.toContract", {
                no: inv.contract_no,
                date: dmy(inv.contract_date ?? inv.invoice_date),
              })}
            </p>
          )}
        </header>

        <section className="mt-8 grid grid-cols-2 gap-8">
          <Party
            title={t("inv.seller")}
            rows={[
              [t("inv.nameShort"), s?.company_name],
              [t("inv.address"), s?.address],
              [t("inv.tin"), s?.tin],
              [t("inv.vatCode"), s?.vat_reg_code],
              [t("inv.account"), s?.account],
              [t("inv.mfo"), [s?.bank_mfo, s?.bank_name].filter(Boolean).join(" · ")],
            ]}
          />
          <Party
            title={t("inv.buyer")}
            rows={[
              [t("inv.nameShort"), inv.buyer_name],
              [t("inv.address"), inv.buyer_address],
              [t("inv.tin"), inv.buyer_tin],
              [t("inv.vatCode"), inv.buyer_vat_reg_code],
              [t("inv.account"), inv.buyer_account],
              [t("inv.mfo"), inv.buyer_bank_mfo],
            ]}
          />
        </section>

        <table className="mt-8 w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="bg-neutral-100">
              {[
                "№",
                t("inv.itemName"),
                t("inv.mxik"),
                t("inv.unit"),
                t("inv.qty"),
                t("inv.price"),
                t("inv.sumNoVat"),
                t("inv.vatRateShort"),
                t("inv.vat"),
                t("inv.total"),
              ].map((h) => (
                <th
                  key={h}
                  className="border border-neutral-300 px-1.5 py-1.5 text-center font-semibold"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const l = lineTotals(item, inv.has_vat, vatRate);
              return (
                <tr key={i}>
                  <td className="border border-neutral-300 px-1.5 py-1 text-center">{i + 1}</td>
                  <td className="border border-neutral-300 px-1.5 py-1">{item.name}</td>
                  <td className="border border-neutral-300 px-1.5 py-1 text-center tabular-nums">
                    {item.catalogCode}
                  </td>
                  <td className="border border-neutral-300 px-1.5 py-1 text-center">
                    {item.packageName}
                  </td>
                  <td className="border border-neutral-300 px-1.5 py-1 text-right tabular-nums whitespace-nowrap">
                    {item.quantity}
                  </td>
                  <td className="border border-neutral-300 px-1.5 py-1 text-right tabular-nums whitespace-nowrap">
                    {formatMoney(Number(item.price))}
                  </td>
                  <td className="border border-neutral-300 px-1.5 py-1 text-right tabular-nums whitespace-nowrap">
                    {formatMoney(l.sum)}
                  </td>
                  <td className="border border-neutral-300 px-1.5 py-1 text-center">
                    {inv.has_vat ? `${l.vatRate}%` : t("inv.noVatShort")}
                  </td>
                  <td className="border border-neutral-300 px-1.5 py-1 text-right tabular-nums whitespace-nowrap">
                    {formatMoney(l.vat)}
                  </td>
                  <td className="border border-neutral-300 px-1.5 py-1 text-right font-semibold tabular-nums whitespace-nowrap">
                    {formatMoney(l.total)}
                  </td>
                </tr>
              );
            })}
            <tr className="font-bold">
              <td colSpan={6} className="border border-neutral-300 px-1.5 py-1.5 text-right">
                {t("inv.totalRow")}
              </td>
              <td className="border border-neutral-300 px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap">
                {formatMoney(totals.sum)}
              </td>
              <td className="border border-neutral-300" />
              <td className="border border-neutral-300 px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap">
                {formatMoney(totals.vat)}
              </td>
              <td className="border border-neutral-300 px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap">
                {formatMoney(totals.total)}
              </td>
            </tr>
          </tbody>
        </table>

        <p className="mt-4">
          {t("inv.totalPayable")}: <b>{amountInWords(totals.total)}</b>
          {!inv.has_vat && <span className="text-neutral-600"> ({t("inv.noVatNote")})</span>}
        </p>
        {inv.note && <p className="mt-2 text-neutral-700">{inv.note}</p>}

        <footer className="mt-14 grid grid-cols-2 gap-10">
          <Sign label={t("inv.director")} name={s?.director} />
          <Sign label={t("inv.accountant")} name={s?.accountant} />
          <Sign label={t("inv.received")} name={null} />
          <p className="self-end text-right text-[11px] text-neutral-500">{t("inv.stamp")}</p>
        </footer>
      </article>

      {inv.lead_id && (
        <p className="no-print mt-4 text-sm">
          <Link
            to="/crm/leads/$leadId"
            params={{ leadId: inv.lead_id }}
            className="font-semibold text-primary hover:underline"
          >
            {t("inv.openLead")}
          </Link>
        </p>
      )}
    </div>
  );
}

function Party({ title, rows }: { title: string; rows: [string, string | null | undefined][] }) {
  return (
    <div>
      <p className="mb-2 border-b border-neutral-300 pb-1 text-[12px] font-bold uppercase tracking-wide text-neutral-600">
        {title}
      </p>
      <dl className="space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
            <dt className="text-neutral-500">{k}</dt>
            <dd className="font-medium">{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Sign({ label, name }: { label: string; name: string | null | undefined }) {
  return (
    <div>
      <p className="text-neutral-600">{label}</p>
      <div className="mt-6 flex items-end gap-2">
        <span className="h-px flex-1 bg-neutral-400" />
        <span className="min-w-[120px] text-right font-medium">{name ?? ""}</span>
      </div>
    </div>
  );
}

function DeleteButton({ invoice }: { invoice: InvoiceRow }) {
  const { t } = useI18n();
  const action = useInvoiceAction();
  const navigate = Route.useNavigate();
  return (
    <button
      type="button"
      disabled={action.isPending}
      onClick={async () => {
        if (!window.confirm(t("inv.deleteConfirm", { number: invoice.number }))) return;
        try {
          await action.mutateAsync({ action: "delete", id: invoice.id });
          toast.success(t("inv.deleted"));
          void navigate({ to: "/invoices" });
        } catch (err) {
          toast.error(describeError(err, t("inv.actionFailed")));
        }
      }}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-destructive/40 px-3.5 text-sm font-semibold text-destructive hover:bg-destructive/10"
    >
      <Trash2 className="h-4 w-4" /> {t("inv.delete")}
    </button>
  );
}
