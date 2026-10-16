import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CircleSlash, Loader2, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { useI18n } from "@/lib/i18n";
import { formatSom } from "@/lib/lead-payments/paid-stage";

// /pay/<link id> -- the page a company's client opens from a payment link
// the manager sent: who is asking, how much, for what, and Payme / Click
// buttons into the company's own cashbox. Public (see AuthGate). Coming
// back from the gateway it keeps checking until the payment shows up.
export const Route = createFileRoute("/pay/$linkId")({
  head: () => ({
    meta: [{ title: "To'lov — SalesIQ" }, { name: "robots", content: "noindex" }],
  }),
  component: PayPage,
});

type Bill = {
  company: string;
  amount: number;
  description: string | null;
  status: "pending" | "paid" | "cancelled";
  paidAt: string | null;
  provider: string | null;
  payme: string | null;
  click: string | null;
};

function PayPage() {
  const { t } = useI18n();
  const { linkId } = Route.useParams();
  const [bill, setBill] = useState<Bill | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stop = false;
    let tries = 0;
    async function load() {
      const res = await fetch(`/lead-payments/public?id=${encodeURIComponent(linkId)}`).catch(
        () => null,
      );
      if (stop) return;
      if (!res?.ok) {
        if (res?.status === 404) setMissing(true);
        return;
      }
      const next = (await res.json()) as Bill;
      setBill(next);
      // Back from Payme / Click the callback can land a few seconds later:
      // an open bill is checked again for a few minutes.
      if (next.status === "pending" && tries++ < 36) setTimeout(() => void load(), 5000);
    }
    void load();
    return () => {
      stop = true;
    };
  }, [linkId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md phone:max-w-none">
        <BrandMark className="mb-6" iconClassName="h-12 w-12" wordmarkClassName="text-lg" />
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-[0_30px_60px_-30px_rgba(15,23,42,0.35)]">
          {missing ? (
            <div className="p-8 text-center">
              <CircleSlash className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-base font-semibold text-foreground">{t("pay.notFound")}</p>
            </div>
          ) : !bill ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="border-b border-border bg-surface px-7 py-6">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t("pay.billFrom")}
                </p>
                <p className="mt-1 text-lg font-bold text-foreground">{bill.company}</p>
                {bill.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{bill.description}</p>
                )}
                <p className="mt-5 flex items-baseline gap-2">
                  <span className="text-[40px] font-extrabold leading-none tabular-nums text-foreground">
                    {formatSom(bill.amount)}
                  </span>
                  <span className="text-base font-semibold text-muted-foreground">so'm</span>
                </p>
              </div>
              <div className="px-7 py-6">
                {bill.status === "paid" ? (
                  <div className="flex items-start gap-3 rounded-2xl bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
                    <div>
                      <p className="text-base font-bold">{t("pay.paid")}</p>
                      <p className="text-sm opacity-80">{t("pay.paidHint")}</p>
                    </div>
                  </div>
                ) : bill.status === "cancelled" ? (
                  <div className="flex items-start gap-3 rounded-2xl bg-muted p-4 text-muted-foreground">
                    <CircleSlash className="mt-0.5 h-6 w-6 shrink-0" />
                    <p className="text-sm font-semibold">{t("pay.cancelled")}</p>
                  </div>
                ) : !bill.payme && !bill.click ? (
                  <p className="text-sm text-muted-foreground">{t("pay.unavailable")}</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground">{t("pay.choose")}</p>
                    {bill.payme && (
                      <a
                        href={bill.payme}
                        className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#00b9b9] text-[17px] font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5"
                      >
                        {t("pay.with", { name: "Payme" })}
                      </a>
                    )}
                    {bill.click && (
                      <a
                        href={bill.click}
                        className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#0a74ff] text-[17px] font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5"
                      >
                        {t("pay.with", { name: "Click" })}
                      </a>
                    )}
                    <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" /> {t("pay.secure")}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
