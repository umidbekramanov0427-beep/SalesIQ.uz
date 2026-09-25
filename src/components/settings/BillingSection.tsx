import { useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard, Pill, StatCard } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { describeError, formatDate } from "@/lib/utils";
import {
  usePlatformSettings,
  useBillingStatus,
  useCreateSubscriptionPayment,
  useOrgSubscriptionPayments,
  useCreateSubscriptionRequest,
  useSubscriptionRequestsRaw,
  useProfilesRaw,
  type SubscriptionPaymentProvider,
  type SubscriptionPaymentRow,
} from "@/hooks/use-crm-data";

function daysRemaining(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function txStatusTone(status: SubscriptionPaymentRow["status"]): "success" | "warning" | "danger" {
  if (status === "paid") return "success";
  if (status === "cancelled") return "danger";
  return "warning";
}

// The actual "Reja/Holat/Qolgan kunlar + qo'llab-quvvatlash" content of the
// subscription page -- pulled out of the /billing route so the same panel
// can also render in-place as a Settings tab (see settings.tsx's "billing"
// section), instead of only existing behind a separate page navigation that
// drops out of the Settings sub-nav.
export function BillingSection() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { format: formatCurrency } = useCurrency();
  const { data: settings } = usePlatformSettings();
  const { data: requests } = useSubscriptionRequestsRaw();
  const createRequest = useCreateSubscriptionRequest();
  const { data: billingStatus } = useBillingStatus();
  const { data: payments } = useOrgSubscriptionPayments();
  const createPayment = useCreateSubscriptionPayment();
  const { data: profiles } = useProfilesRaw();
  const [sending, setSending] = useState(false);
  const [payingWith, setPayingWith] = useState<SubscriptionPaymentProvider | null>(null);

  if (!user?.organizationId) {
    return (
      <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  const active = user.orgActive !== false;
  const remaining = daysRemaining(user.orgTrialEndsAt);
  const pendingRequest = (requests ?? []).find(
    (r) => r.organization_id === user.organizationId && r.status === "pending",
  );
  const pendingPayment = (payments ?? []).find((p) => p.status === "pending");
  const seats = (profiles ?? []).length;

  async function sendRequest() {
    setSending(true);
    try {
      await createRequest.mutateAsync(undefined);
      toast.success(t("trial.requestSent"));
    } catch (err) {
      toast.error(describeError(err, t("trial.requestFailed")));
    } finally {
      setSending(false);
    }
  }

  async function payWith(provider: SubscriptionPaymentProvider) {
    setPayingWith(provider);
    try {
      const { payUrl } = await createPayment.mutateAsync(provider);
      window.open(payUrl, "_blank", "noreferrer");
    } catch (err) {
      toast.error(describeError(err, t("trial.paymentFailed")));
    } finally {
      setPayingWith(null);
    }
  }

  const canPay =
    !active &&
    !!billingStatus?.priceUzs &&
    (billingStatus.paymeConnected || billingStatus.clickConnected);

  return (
    <div className="space-y-5">
      {!active && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{t("trial.frozenExplain")}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("trial.planLabel")} value={user.orgPlan ?? "—"} />
        <StatCard
          label={t("trial.statusLabel")}
          value={active ? t("trial.statusActive") : t("trial.statusFrozen")}
          tone={active ? "mint" : "danger"}
        />
        <StatCard
          label={t("trial.daysRemainingLabel")}
          value={remaining !== null ? String(remaining) : "—"}
          {...(user.orgTrialEndsAt
            ? { hint: t("trial.validUntilHint", { date: formatDate(user.orgTrialEndsAt) }) }
            : {})}
        />
        <StatCard label={t("trial.seatsLabel")} value={String(seats)} />
      </div>

      {canPay && (
        <SectionCard title={t("trial.payTitle")}>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3.5">
            <p className="text-sm text-muted-foreground">
              {t("trial.subscriptionPrice")}:{" "}
              <span className="font-semibold text-foreground">
                {formatCurrency(billingStatus!.priceUzs)}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {billingStatus!.paymeConnected && (
                <button
                  type="button"
                  onClick={() => void payWith("payme")}
                  disabled={payingWith !== null}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {payingWith === "payme" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wallet className="h-4 w-4" />
                  )}
                  Payme
                </button>
              )}
              {billingStatus!.clickConnected && (
                <button
                  type="button"
                  onClick={() => void payWith("click")}
                  disabled={payingWith !== null}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {payingWith === "click" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wallet className="h-4 w-4" />
                  )}
                  Click
                </button>
              )}
            </div>
          </div>
          {pendingPayment && (
            <p className="mt-2 text-xs text-subtle">{t("trial.paymentPending")}</p>
          )}

          <div className="mt-3 flex items-center gap-2">
            {pendingRequest ? (
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" />
                {t("trial.requestPending")}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void sendRequest()}
                disabled={sending}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("trial.sendRequest")}
              </button>
            )}
          </div>
        </SectionCard>
      )}

      {!active && !canPay && (
        <SectionCard title={t("trial.sendRequest")}>
          {pendingRequest ? (
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              {t("trial.requestPending")}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void sendRequest()}
              disabled={sending}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("trial.sendRequest")}
            </button>
          )}
        </SectionCard>
      )}

      <SectionCard title={t("trial.supportTitle")} description={t("trial.supportDesc")}>
        <div className="grid gap-3 sm:grid-cols-3">
          {settings?.support_telegram && (
            <a
              href={`https://t.me/${settings.support_telegram.replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:bg-accent"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MessageCircle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-subtle">Telegram</p>
                <p className="truncate text-sm font-medium text-foreground">
                  @{settings.support_telegram.replace(/^@/, "")}
                </p>
              </div>
            </a>
          )}
          {settings?.support_phone && (
            <a
              href={`tel:${settings.support_phone}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:bg-accent"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Phone className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-subtle">{t("trial.phone")}</p>
                <p className="truncate text-sm font-medium text-foreground">
                  {settings.support_phone}
                </p>
              </div>
            </a>
          )}
          {settings?.support_email && (
            <a
              href={`mailto:${settings.support_email}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:bg-accent"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Mail className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-subtle">Email</p>
                <p className="truncate text-sm font-medium text-foreground">
                  {settings.support_email}
                </p>
              </div>
            </a>
          )}
          {!settings?.support_telegram && !settings?.support_phone && !settings?.support_email && (
            <p className="text-sm text-muted-foreground">{t("trial.noSupportContacts")}</p>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t("trial.transactionsTitle")}>
        {(payments ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("trial.transactionsEmpty")}</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-subtle">
                  <th className="pb-2 pr-3">{t("trial.txDate")}</th>
                  <th className="pb-2 pr-3">{t("trial.txProvider")}</th>
                  <th className="pb-2 pr-3">{t("trial.txAmount")}</th>
                  <th className="pb-2">{t("trial.txStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(payments ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3 text-foreground">{formatDate(p.created_at)}</td>
                    <td className="py-2.5 pr-3 capitalize text-foreground">{p.provider}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-foreground">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="py-2.5">
                      <Pill tone={txStatusTone(p.status)}>{t(`trial.txStatus.${p.status}`)}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
