import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Mail, MessageCircle, Phone, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import {
  usePlatformSettings,
  useCreateSubscriptionRequest,
  useSubscriptionRequestsRaw,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [{ title: "Obuna — SalesIQ" }],
  }),
  component: BillingPage,
});

function daysRemaining(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function BillingPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: settings } = usePlatformSettings();
  const { data: requests } = useSubscriptionRequestsRaw();
  const createRequest = useCreateSubscriptionRequest();
  const [sending, setSending] = useState(false);

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

  return (
    <>
      <PageHeader title={t("trial.billingTitle")} description={t("trial.billingDesc")} />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title={t("trial.planTitle")}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{t("trial.planLabel")}</p>
              <p className="font-semibold text-foreground">{user.orgPlan ?? "—"}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{t("trial.statusLabel")}</p>
              <Pill tone={active ? "success" : "danger"}>
                {active ? t("trial.statusActive") : t("trial.statusFrozen")}
              </Pill>
            </div>
            {remaining !== null && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t("trial.daysRemainingLabel")}</p>
                <p className="font-semibold tabular-nums text-foreground">{remaining}</p>
              </div>
            )}

            {!active && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                <p className="text-sm text-destructive">{t("trial.frozenExplain")}</p>
                {pendingRequest ? (
                  <p className="mt-3 flex items-center gap-2 text-sm font-medium text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    {t("trial.requestPending")}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void sendRequest()}
                    disabled={sending}
                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("trial.sendRequest")}
                  </button>
                )}
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title={t("trial.supportTitle")} description={t("trial.supportDesc")}>
          <div className="space-y-3">
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
            {!settings?.support_telegram &&
              !settings?.support_phone &&
              !settings?.support_email && (
                <p className="text-sm text-muted-foreground">{t("trial.noSupportContacts")}</p>
              )}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
