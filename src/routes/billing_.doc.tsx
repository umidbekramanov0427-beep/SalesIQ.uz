import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, FileCheck2, FileText, Landmark, Loader2, Printer } from "lucide-react";
import { BackButton } from "@/components/layout/BackButton";
import { Party, Sign } from "@/components/invoices/DocParts";
import { useBillingDoc, type BillingDoc, type DocKind } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { amountInWords, formatMoney } from "@/lib/invoices/invoice";
import { cn, describeError } from "@/lib/utils";

type Search = { payment?: string | undefined; type: DocKind };

export const Route = createFileRoute("/billing_/doc")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    payment: typeof s["payment"] === "string" ? s["payment"] : undefined,
    type: s["type"] === "act" || s["type"] === "proforma" ? s["type"] : "invoice",
  }),
  head: () => ({ meta: [{ title: "Obuna hujjatlari — SalesIQ" }] }),
  component: BillingDocPage,
});

const dmy = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 5 * 3600_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
};

const TITLES: Record<DocKind, string> = {
  invoice: "bdoc.invoiceTitle",
  act: "bdoc.actTitle",
  proforma: "bdoc.proformaTitle",
};

// A subscription payment's documents, printed (or saved as PDF from the
// print window): the invoice and the act of services for a paid month, or
// a bill to pay the next month by bank transfer.
function BillingDocPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { payment, type } = Route.useSearch();
  const q = useBillingDoc(type, payment);
  const owner = user?.role === "platform_owner";

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="no-print mb-5 flex flex-wrap items-center gap-2.5">
        <BackButton />
        {payment && (
          <div className="flex rounded-xl border border-border bg-card p-1">
            {(["invoice", "act"] as const).map((k) => (
              <Link
                key={k}
                to="/billing/doc"
                search={{ payment, type: k }}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors",
                  type === k
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {k === "invoice" ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <FileCheck2 className="h-4 w-4" />
                )}
                {t(k === "invoice" ? "bdoc.tabInvoice" : "bdoc.tabAct")}
              </Link>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!q.data}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Printer className="h-4 w-4" /> {t("bdoc.print")}
        </button>
      </div>

      {q.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      ) : q.error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/8 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <p className="text-foreground">
            {["NOT_PAID", "NOT_FOUND", "NO_PRICE", "NO_COMPANY"].includes(
              (q.error as Error).message,
            )
              ? t(`bdoc.err.${(q.error as Error).message}`)
              : describeError(q.error, t("bdoc.err.generic"))}
          </p>
        </div>
      ) : q.data ? (
        <>
          {!q.data.sellerReady && (
            <Notice>
              {owner ? (
                <>
                  {t("bdoc.sellerMissingOwner")}{" "}
                  <Link to="/platform/revenue" className="font-semibold text-primary underline">
                    {t("bdoc.fillNow")}
                  </Link>
                </>
              ) : (
                t("bdoc.sellerMissing")
              )}
            </Notice>
          )}
          {!q.data.buyer.tin && !owner && (
            <Notice>
              {t("bdoc.buyerMissing")}{" "}
              <Link to="/admin/invoices" className="font-semibold text-primary underline">
                {t("bdoc.fillNow")}
              </Link>
            </Notice>
          )}
          <Document doc={q.data} />
        </>
      ) : null}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="no-print mb-4 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p>{children}</p>
    </div>
  );
}

function Document({ doc }: { doc: BillingDoc }) {
  const { t } = useI18n();
  const s = doc.seller;
  const b = doc.buyer;
  const vatLabel = s.has_vat ? `${s.vat_rate}%` : t("inv.noVatShort");
  const cell = "border border-neutral-300 px-1.5 py-1.5";
  const money = (n: number) => formatMoney(n);

  return (
    <article className="print-area rounded-2xl border border-border bg-white p-10 text-[13px] leading-snug text-neutral-900 shadow-sm">
      <header className="text-center">
        <h1 className="text-xl font-bold uppercase tracking-wide">{t(TITLES[doc.kind])}</h1>
        <p className="mt-1">
          № <b>{doc.number}</b> · {dmy(doc.date)}
        </p>
      </header>

      {doc.kind === "act" && (
        <p className="mt-6 text-justify">
          {t("bdoc.actIntro", {
            seller: s.company_name || "SalesIQ",
            sellerDirector: s.director || "—",
            buyer: b.name,
            buyerDirector: b.director || "—",
          })}
        </p>
      )}

      <section className="mt-8 grid grid-cols-2 gap-8">
        <Party
          title={doc.kind === "act" ? t("bdoc.executor") : t("inv.seller")}
          rows={[
            [t("inv.nameShort"), s.company_name],
            [t("inv.address"), s.address],
            [t("inv.tin"), s.tin],
            [t("inv.vatCode"), s.vat_reg_code],
            [t("inv.account"), s.account],
            [t("inv.mfo"), [s.bank_mfo, s.bank_name].filter(Boolean).join(" · ")],
          ]}
        />
        <Party
          title={doc.kind === "act" ? t("bdoc.customer") : t("inv.buyer")}
          rows={[
            [t("inv.nameShort"), b.name],
            [t("inv.address"), b.address],
            [t("inv.tin"), b.tin],
            [t("inv.vatCode"), b.vat_reg_code],
            [t("inv.account"), b.account],
            [t("inv.mfo"), [b.bank_mfo, b.bank_name].filter(Boolean).join(" · ")],
          ]}
        />
      </section>

      <table className="mt-8 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="bg-neutral-100">
            {[
              "№",
              t("bdoc.service"),
              ...(doc.kind === "invoice" ? [t("inv.mxik")] : []),
              t("inv.unit"),
              t("inv.qty"),
              t("inv.price"),
              t("inv.sumNoVat"),
              t("inv.vatRateShort"),
              t("inv.vat"),
              t("inv.total"),
            ].map((h) => (
              <th key={h} className={cn(cell, "text-center font-semibold")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={cn(cell, "text-center")}>1</td>
            <td className={cell}>{doc.line}</td>
            {doc.kind === "invoice" && (
              <td className={cn(cell, "text-center tabular-nums")}>{s.catalog_code || "—"}</td>
            )}
            <td className={cn(cell, "text-center")}>{t("bdoc.unitMonth")}</td>
            <td className={cn(cell, "text-right tabular-nums")}>1</td>
            <td className={cn(cell, "text-right tabular-nums whitespace-nowrap")}>
              {money(doc.amounts.sum)}
            </td>
            <td className={cn(cell, "text-right tabular-nums whitespace-nowrap")}>
              {money(doc.amounts.sum)}
            </td>
            <td className={cn(cell, "text-center")}>{vatLabel}</td>
            <td className={cn(cell, "text-right tabular-nums whitespace-nowrap")}>
              {money(doc.amounts.vat)}
            </td>
            <td className={cn(cell, "text-right font-semibold tabular-nums whitespace-nowrap")}>
              {money(doc.amounts.total)}
            </td>
          </tr>
          <tr className="font-bold">
            <td colSpan={doc.kind === "invoice" ? 6 : 5} className={cn(cell, "text-right")}>
              {t("inv.totalRow")}
            </td>
            <td className={cn(cell, "text-right tabular-nums whitespace-nowrap")}>
              {money(doc.amounts.sum)}
            </td>
            <td className={cell} />
            <td className={cn(cell, "text-right tabular-nums whitespace-nowrap")}>
              {money(doc.amounts.vat)}
            </td>
            <td className={cn(cell, "text-right tabular-nums whitespace-nowrap")}>
              {money(doc.amounts.total)}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-4">
        {t("inv.totalPayable")}: <b>{amountInWords(doc.amounts.total)}</b>
        {!s.has_vat && <span className="text-neutral-600"> ({t("inv.noVatNote")})</span>}
      </p>

      {doc.kind === "proforma" ? (
        <div className="mt-5 rounded-lg border border-neutral-300 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Landmark className="h-4 w-4" /> {t("bdoc.payTo")}
          </p>
          <p className="mt-2">
            {s.company_name || "—"} · {t("inv.tin")} {s.tin || "—"} · {t("inv.account")}{" "}
            {s.account || "—"} · {t("inv.mfo")} {s.bank_mfo || "—"} {s.bank_name}
          </p>
          <p className="mt-2">
            {t("bdoc.purpose")}:{" "}
            <b>{t("bdoc.purposeText", { no: doc.number, date: dmy(doc.date) })}</b>
          </p>
          <p className="mt-2 text-neutral-600">{t("bdoc.validity")}</p>
        </div>
      ) : doc.kind === "act" ? (
        <p className="mt-4">{t("bdoc.actClaims")}</p>
      ) : (
        doc.paidAt && (
          <p className="mt-2 text-neutral-600">
            {t("bdoc.paidVia", {
              provider: doc.provider === "click" ? "Click" : "Payme",
              date: dmy(doc.paidAt),
            })}
          </p>
        )
      )}

      <footer className="mt-14 grid grid-cols-2 gap-10">
        {doc.kind === "act" ? (
          <>
            <div className="space-y-6">
              <p className="font-bold uppercase text-neutral-600">{t("bdoc.executor")}</p>
              <Sign label={t("inv.director")} name={s.director} />
            </div>
            <div className="space-y-6">
              <p className="font-bold uppercase text-neutral-600">{t("bdoc.customer")}</p>
              <Sign label={t("inv.director")} name={b.director} />
            </div>
          </>
        ) : (
          <>
            <Sign label={t("inv.director")} name={s.director} />
            <Sign label={t("inv.accountant")} name={s.accountant} />
          </>
        )}
        <p className="col-span-2 text-right text-[11px] text-neutral-500">{t("inv.stamp")}</p>
      </footer>
    </article>
  );
}
