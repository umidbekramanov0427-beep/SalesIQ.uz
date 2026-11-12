import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { RefundDialog } from "@/components/refunds/RefundDialog";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { useLeadRefund, useRefundMutations } from "@/hooks/use-crm-data";

// The lead card's "Pul qaytarish" switch: on, the client goes to the Pul
// qaytarish section (with the card to pay back to); while it waits, the
// switch can be turned off again (the refund is cancelled). Once the money
// went back it shows that, with the receipt sent to the client.

export function LeadRefundToggle({
  leadId,
  name,
  phone,
  paid,
}: {
  leadId: string;
  name: string;
  phone: string;
  paid: number | undefined;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { data: refund, isLoading } = useLeadRefund(leadId);
  const { update } = useRefundMutations();
  const [open, setOpen] = useState(false);
  const on = !!refund;

  async function cancel() {
    if (!refund || refund.status !== "pending") return;
    if (!window.confirm(t("refund.cancelConfirm"))) return;
    try {
      await update.mutateAsync({ id: refund.id, patch: { status: "cancelled" } });
      toast.success(t("refund.cancelled"));
    } catch (err) {
      toast.error(describeError(err, t("refund.saveFailed")));
    }
  }

  return (
    <div className="border-t border-[var(--amo-divider)] px-6 py-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
            on ? "bg-rose-500/12 text-rose-600" : "bg-muted text-muted-foreground",
          )}
        >
          <Undo2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-foreground">{t("refund.toggle")}</p>
          {refund ? (
            <p className="truncate text-[12px] text-muted-foreground">
              {format(Number(refund.amount) || 0)} ·{" "}
              <span
                className={cn(
                  "font-semibold",
                  refund.status === "refunded"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-amber-700 dark:text-amber-300",
                )}
              >
                {t(`refund.status.${refund.status}`)}
              </span>
            </p>
          ) : (
            <p className="text-[12px] text-muted-foreground">{t("refund.toggleHint")}</p>
          )}
        </div>
        {refund && (
          <Link
            to="/refunds"
            search={{ focus: refund.id } as never}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t("refund.openSection")}
          >
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        )}
        <Switch
          checked={on}
          disabled={isLoading || refund?.status === "refunded" || update.isPending}
          onCheckedChange={(v) => (v ? setOpen(true) : void cancel())}
          aria-label={t("refund.toggle")}
        />
      </div>
      {open && (
        <RefundDialog
          initial={{
            lead_id: leadId,
            client_name: name,
            phone,
            amount: paid ?? 0,
            paid_amount: paid ?? null,
            card_number: "",
            card_holder: "",
            reason: "",
            stage: "before",
            note: "",
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
