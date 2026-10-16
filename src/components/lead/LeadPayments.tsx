import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, CreditCard, Instagram, Loader2, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  useCancelLeadPaymentLink,
  useCreateLeadPaymentLink,
  useLeadInstagramLink,
  useLeadPaymentLinks,
  useLeadTelegramLink,
  usePaymentMerchant,
  useSendLeadInstagramMessage,
  useSendLeadTelegramMessage,
  type LeadPaymentLinkRow,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { formatSom, parseAmount } from "@/lib/lead-payments/paid-stage";
import { cn, describeError, formatDate } from "@/lib/utils";

// The lead card's "To'lovlar": payment links the client pays into the
// company's own Payme / Click cashbox. A paid link moves the lead to the
// funnel's paid stage by itself (src/lib/lead-payments/settle.server.ts).

const payUrl = (id: string) => `${window.location.origin}/pay/${id}`;

function StatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-bold",
        status === "paid"
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : status === "cancelled"
            ? "bg-muted text-muted-foreground"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      )}
    >
      {t(`lpay.status.${status}`)}
    </span>
  );
}

function linkMessage(row: { amount: number; description: string | null }, url: string): string {
  return [
    row.description || null,
    `To'lov: ${formatSom(row.amount)} so'm`,
    `Payme yoki Click orqali to'lash: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Copy / Telegram / Instagram for one payment link. */
function ShareButtons({ leadId, row }: { leadId: string; row: LeadPaymentLinkRow }) {
  const { t } = useI18n();
  const { data: tg } = useLeadTelegramLink(leadId, { poll: false });
  const { data: ig } = useLeadInstagramLink(leadId);
  const sendTg = useSendLeadTelegramMessage();
  const sendIg = useSendLeadInstagramMessage();
  const url = payUrl(row.id);
  const text = linkMessage({ amount: Number(row.amount), description: row.description }, url);
  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50";
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={btn}
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          toast.success(t("lpay.copied"));
        }}
      >
        <Copy className="h-3.5 w-3.5" /> {t("lpay.copy")}
      </button>
      {tg && (
        <button
          type="button"
          className={btn}
          disabled={sendTg.isPending}
          onClick={() =>
            sendTg.mutate(
              { leadId, text },
              {
                onSuccess: () => toast.success(t("lpay.sent")),
                onError: (e) => toast.error(describeError(e, t("amo.sendFailed"))),
              },
            )
          }
        >
          <Send className="h-3.5 w-3.5 text-sky-500" /> Telegram
        </button>
      )}
      {ig && (
        <button
          type="button"
          className={btn}
          disabled={sendIg.isPending}
          onClick={() =>
            sendIg.mutate(
              { leadId, text },
              {
                onSuccess: () => toast.success(t("lpay.sent")),
                onError: (e) => toast.error(describeError(e, t("amo.sendFailed"))),
              },
            )
          }
        >
          <Instagram className="h-3.5 w-3.5 text-pink-500" /> Instagram
        </button>
      )}
    </div>
  );
}

export function PaymentLinkDialog({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const { data: merchant, isLoading } = usePaymentMerchant(open);
  const create = useCreateLeadPaymentLink();
  const { data: links = [] } = useLeadPaymentLinks(leadId);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const created = links.find((l) => l.id === createdId) ?? null;
  const ready = !!merchant && (merchant.paymeReady || merchant.clickReady);
  const value = parseAmount(amount);

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) {
      setCreatedId(null);
      setAmount("");
      setDescription("");
    }
  }

  async function submit() {
    if (value === null) return;
    try {
      const r = await create.mutateAsync({ leadId, amount: value, description });
      setCreatedId(r.id);
    } catch (err) {
      toast.error(describeError(err, t("lpay.createFailed")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-emerald-600" /> {t("lpay.title")}
        </DialogTitle>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !ready ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
              {t("lpay.noMerchant")}
            </p>
            <Link
              to="/integrations/$slug"
              params={{ slug: "payments" }}
              className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              {t("lpay.setup")}
            </Link>
          </div>
        ) : created ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-emerald-500/10 p-3.5 text-emerald-800 dark:text-emerald-200">
              <Check className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold">
                  {t("lpay.created", { amount: formatSom(Number(created.amount)) })}
                </p>
                <p className="mt-0.5 text-xs opacity-80">{t("lpay.createdHint")}</p>
              </div>
            </div>
            <code className="block truncate rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground">
              {payUrl(created.id)}
            </code>
            <ShareButtons leadId={leadId} row={created} />
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="block">
              <span className="text-sm font-semibold text-foreground">{t("lpay.amount")}</span>
              <div className="mt-1.5 flex items-center rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-primary/30">
                <input
                  autoFocus
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                    setAmount(digits ? formatSom(Number(digits)) : "");
                  }}
                  placeholder="990 000"
                  className="h-12 min-w-0 flex-1 bg-transparent px-3.5 text-lg font-bold tabular-nums text-foreground outline-none"
                />
                <span className="px-3.5 text-sm font-semibold text-muted-foreground">so'm</span>
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-foreground">{t("lpay.purpose")}</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                placeholder={t("lpay.purposePh")}
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {[merchant.paymeReady && "Payme", merchant.clickReady && "Click"]
                .filter(Boolean)
                .join(" · ")}{" "}
              — {t("lpay.autoStage")}
            </p>
            <button
              type="submit"
              disabled={value === null || create.isPending}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("lpay.create")}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The lead panel's list of payment links. */
export function LeadPaymentsSection({
  leadId,
  onCreate,
}: {
  leadId: string;
  onCreate: () => void;
}) {
  const { t } = useI18n();
  const { data: links = [] } = useLeadPaymentLinks(leadId);
  const cancel = useCancelLeadPaymentLink(leadId);
  const [openId, setOpenId] = useState<string | null>(null);
  if (links.length === 0) return null;
  const paid = links.filter((l) => l.status === "paid").reduce((s, l) => s + Number(l.amount), 0);
  return (
    <div className="border-t border-[var(--amo-divider)] px-6 py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-[var(--amo-label)]">
          <CreditCard className="h-4 w-4 text-emerald-600" /> {t("lpay.section")}
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> {t("lpay.new")}
        </button>
      </div>
      {paid > 0 && (
        <p className="mt-1 text-[12px] text-[var(--amo-label)]">
          {t("lpay.paidTotal", { amount: formatSom(paid) })}
        </p>
      )}
      <ul className="mt-2.5 space-y-2">
        {links.map((l) => (
          <li key={l.id} className="rounded-xl border border-[var(--amo-box-line)] bg-card">
            <button
              type="button"
              onClick={() => setOpenId(openId === l.id ? null : l.id)}
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold tabular-nums text-foreground">
                  {formatSom(Number(l.amount))} so'm
                </span>
                <span className="block truncate text-[12px] text-[var(--amo-label)]">
                  {l.description || formatDate(l.created_at)}
                  {l.status === "paid" && l.provider
                    ? ` · ${l.provider === "payme" ? "Payme" : "Click"}`
                    : ""}
                </span>
              </span>
              <StatusPill status={l.status} />
            </button>
            {openId === l.id && l.status === "pending" && (
              <div className="space-y-2.5 border-t border-[var(--amo-box-line)] px-3.5 py-3">
                <ShareButtons leadId={leadId} row={l} />
                <button
                  type="button"
                  disabled={cancel.isPending}
                  onClick={() =>
                    cancel.mutate(l.id, {
                      onError: (e) => toast.error(describeError(e, t("lpay.createFailed"))),
                    })
                  }
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-destructive"
                >
                  <X className="h-3.5 w-3.5" /> {t("lpay.cancel")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
