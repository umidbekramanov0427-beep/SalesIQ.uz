import { useState, type ReactNode } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  ShieldAlert,
  Wallet,
  Lock,
  CreditCard,
  Send,
  CalendarDays,
  LifeBuoy,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard, Pill, StatCard } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { normalizePlan, PLAN_LABELS } from "@/lib/plan-gating";
import { TRIAL_AI_ANALYSIS_LIMIT, TRIAL_SEAT_LIMIT } from "@/lib/org-access";
import { useOrgAccess } from "@/lib/use-org-access";
import { cn, describeError, formatDate } from "@/lib/utils";
import {
  usePlatformSettings,
  useBillingStatus,
  useCreateSubscriptionPayment,
  useOrgSubscriptionPayments,
  useCreateSubscriptionRequest,
  useSubscriptionRequestsRaw,
  useProfilesRaw,
  useAnalyzedCallsCount,
  type SubscriptionPaymentProvider,
  type SubscriptionPaymentRow,
} from "@/hooks/use-crm-data";

function daysRemaining(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

// Matches RENEWAL_DAYS in billing-data.server.ts's reactivateOrgAfterPayment
// -- every renewal extends trial_ends_at by exactly this many days, so the
// current cycle's start is always derivable from its end this way.
const RENEWAL_DAYS = 30;

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
  const { data: analyzedCount } = useAnalyzedCallsCount();
  const access = useOrgAccess();
  const [sending, setSending] = useState(false);
  const [payingWith, setPayingWith] = useState<SubscriptionPaymentProvider | null>(null);

  if (!user?.organizationId) {
    return (
      <SectionCard
        icon={ShieldAlert}
        tone="rose"
        title={t("admin.restrictedTitle")}
        description={t("admin.restrictedDesc")}
      >
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
    !!billingStatus?.priceUzs && (billingStatus.paymeConnected || billingStatus.clickConnected);

  const periodEnd = user.orgTrialEndsAt ? new Date(user.orgTrialEndsAt) : null;
  const periodStart = periodEnd
    ? new Date(periodEnd.getTime() - RENEWAL_DAYS * 24 * 60 * 60 * 1000)
    : null;

  return (
    <div className="space-y-5">
      {!active && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{t("trial.frozenExplain")}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("trial.planLabel")}
          value={user.orgPlan ? PLAN_LABELS[normalizePlan(user.orgPlan)] : "—"}
          info={t("trial.planInfo")}
        />
        <StatCard
          label={t("trial.statusLabel")}
          value={
            !active
              ? t("trial.statusFrozen")
              : access.isTrial
                ? t("trial.statusTrial")
                : t("trial.statusActive")
          }
          tone={active ? "mint" : "danger"}
          info={t("trial.statusInfo")}
        />
        <StatCard
          label={t("trial.daysRemainingLabel")}
          value={remaining !== null ? String(remaining) : "—"}
          info={t("trial.daysRemainingInfo")}
          {...(user.orgTrialEndsAt
            ? { hint: t("trial.validUntilHint", { date: formatDate(user.orgTrialEndsAt) }) }
            : {})}
        />
        <StatCard label={t("trial.seatsLabel")} value={String(seats)} info={t("trial.seatsInfo")} />
      </div>

      {access.isTrial && (
        <SectionCard
          icon={Lock}
          tone="amber"
          title={t("trial.limitsTitle")}
          description={t("trial.limitsDesc")}
        >
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li className="rounded-lg border border-border bg-surface p-3 text-foreground">
              {t("trial.limitSeats", { count: String(TRIAL_SEAT_LIMIT) })}
            </li>
            <li className="rounded-lg border border-border bg-surface p-3 text-foreground">
              {t("trial.limitAi", {
                used: String(Math.min(analyzedCount ?? 0, TRIAL_AI_ANALYSIS_LIMIT)),
                limit: String(TRIAL_AI_ANALYSIS_LIMIT),
              })}
            </li>
            <li className="rounded-lg border border-border bg-surface p-3 text-foreground sm:col-span-2">
              {t("trial.limitFeatures")}
            </li>
          </ul>
        </SectionCard>
      )}

      <a
        href="/pricing#narx"
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
      >
        <ExternalLink className="h-4 w-4" />
        {t("trial.viewPricingOnSite")}
      </a>

      {canPay && (
        <SectionCard
          icon={CreditCard}
          tone="emerald"
          title={t("trial.payTitle")}
          info={t("trial.payInfo")}
        >
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3.5">
            <p className="text-sm text-muted-foreground">
              {t("trial.subscriptionPrice")}:{" "}
              <span className="font-semibold text-foreground">
                {formatCurrency(billingStatus!.priceUzs)}
              </span>
              {billingStatus!.extraSeats > 0 && (
                <span className="ml-1.5 text-xs text-subtle">
                  ({t("trial.extraSeatsIncluded", { count: String(billingStatus!.extraSeats) })})
                </span>
              )}
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
        <SectionCard icon={Send} tone="sky" title={t("trial.sendRequest")}>
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

      {periodStart && periodEnd && (
        <SectionCard
          icon={CalendarDays}
          tone="sky"
          title={t("trial.periodTitle")}
          info={t("trial.periodInfo")}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarClock className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {formatDate(periodStart.toISOString())} — {formatDate(periodEnd.toISOString())}
              </p>
              <p className="text-xs text-subtle">
                {t("trial.periodRenewalHint", { day: String(periodEnd.getDate()) })}
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard
        icon={LifeBuoy}
        tone="violet"
        title={t("trial.supportTitle")}
        description={t("trial.supportDesc")}
        info={t("trial.supportInfoTip")}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <SupportContactCard
            icon={<MessageCircle className="h-4 w-4" />}
            label="Telegram"
            value={
              settings?.support_telegram ? `@${settings.support_telegram.replace(/^@/, "")}` : null
            }
            href={
              settings?.support_telegram
                ? `https://t.me/${settings.support_telegram.replace(/^@/, "")}`
                : undefined
            }
            notSetLabel={t("trial.notSet")}
          />
          <SupportContactCard
            icon={<Phone className="h-4 w-4" />}
            label={t("trial.phone")}
            value={settings?.support_phone ?? null}
            href={settings?.support_phone ? `tel:${settings.support_phone}` : undefined}
            notSetLabel={t("trial.notSet")}
          />
          <SupportContactCard
            icon={<Mail className="h-4 w-4" />}
            label="Email"
            value={settings?.support_email ?? null}
            href={settings?.support_email ? `mailto:${settings.support_email}` : undefined}
            notSetLabel={t("trial.notSet")}
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={Receipt}
        tone="emerald"
        title={t("trial.transactionsTitle")}
        info={t("trial.transactionsInfo")}
      >
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
              {(payments ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    {t("trial.transactionsEmpty")}
                  </td>
                </tr>
              ) : (
                (payments ?? []).map((p) => (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// Always renders the card shape (icon + label + value) even when the
// platform owner hasn't configured that contact channel yet, instead of
// omitting the card entirely -- matches the fixed three-card layout of the
// reference design rather than a list that reshuffles as fields fill in.
function SupportContactCard({
  icon,
  label,
  value,
  href,
  notSetLabel,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  href: string | undefined;
  notSetLabel: string;
}) {
  const content = (
    <>
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          value ? "bg-primary/10 text-primary" : "bg-muted text-subtle",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-subtle">{label}</p>
        <p
          className={cn("truncate text-sm font-medium", value ? "text-foreground" : "text-subtle")}
        >
          {value ?? notSetLabel}
        </p>
      </div>
    </>
  );
  const className = "flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5";
  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noreferrer" : undefined}
        className={cn(className, "transition-colors hover:bg-accent")}
      >
        {content}
      </a>
    );
  }
  return <div className={className}>{content}</div>;
}
