import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Bell, Building2, CreditCard, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { timeAgo, describeError } from "@/lib/utils";
import {
  useErrorLogsRaw,
  useOrganizations,
  usePlatformSettings,
  usePlatformPaymentCredentials,
  useSavePlatformPaymentSettings,
  useUpdatePlatformSettings,
  useSubscriptionRequestsRaw,
  useResolveSubscriptionRequest,
} from "@/hooks/use-crm-data";

const NEW_ORG_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const Route = createFileRoute("/platform/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — SalesIQ" }],
  }),
  component: PlatformNotificationsPage,
});

function SupportContactsCard() {
  const { t } = useI18n();
  const { data: settings } = usePlatformSettings();
  const update = useUpdatePlatformSettings();
  const [telegram, setTelegram] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (settings === undefined || hydrated) return;
    setTelegram(settings?.support_telegram ?? "");
    setPhone(settings?.support_phone ?? "");
    setEmail(settings?.support_email ?? "");
    setHydrated(true);
  }, [settings, hydrated]);

  async function save() {
    try {
      await update.mutateAsync({
        support_telegram: telegram.trim() || null,
        support_phone: phone.trim() || null,
        support_email: email.trim() || null,
      });
      toast.success(t("common.saved"));
    } catch (err) {
      toast.error(describeError(err, t("common.saveFailed")));
    }
  }

  return (
    <SectionCard
      title={t("platform.supportContactsTitle")}
      description={t("platform.supportContactsDesc")}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Telegram</span>
          <input
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            placeholder="@sizning_bot"
            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">{t("trial.phone")}</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998901234567"
            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="support@salesiq.uz"
            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={update.isPending}
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {t("common.save")}
      </button>
    </SectionCard>
  );
}

// The platform's own Payme/Click merchant account, used by every tenant
// org to pay for its SalesIQ subscription (see /billing) -- one shared
// account, not the per-org kind other integrations on this platform have.
function PlatformPaymentSettingsCard() {
  const { t } = useI18n();
  const { data: creds } = usePlatformPaymentCredentials();
  const save = useSavePlatformPaymentSettings();
  const [priceUzs, setPriceUzs] = useState("");
  const [paymeMerchantId, setPaymeMerchantId] = useState("");
  const [paymeSecretKey, setPaymeSecretKey] = useState("");
  const [clickServiceId, setClickServiceId] = useState("");
  const [clickMerchantId, setClickMerchantId] = useState("");
  const [clickSecretKey, setClickSecretKey] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (creds === undefined || hydrated) return;
    setPriceUzs(creds.priceUzs ? String(creds.priceUzs) : "");
    setPaymeMerchantId(creds.paymeMerchantId);
    setClickServiceId(creds.clickServiceId);
    setClickMerchantId(creds.clickMerchantId);
    setHydrated(true);
  }, [creds, hydrated]);

  async function saveSettings() {
    try {
      await save.mutateAsync({
        priceUzs: priceUzs ? Number(priceUzs) : 0,
        paymeMerchantId,
        paymeSecretKey: paymeSecretKey.trim() || undefined,
        clickServiceId,
        clickMerchantId,
        clickSecretKey: clickSecretKey.trim() || undefined,
      });
      setPaymeSecretKey("");
      setClickSecretKey("");
      toast.success(t("common.saved"));
    } catch (err) {
      toast.error(describeError(err, t("common.saveFailed")));
    }
  }

  return (
    <SectionCard
      title={t("platform.paymentSettingsTitle")}
      description={t("platform.paymentSettingsDesc")}
    >
      <div className="space-y-4">
        <label className="block max-w-xs">
          <span className="text-xs font-medium text-muted-foreground">
            {t("platform.subscriptionPriceLabel")}
          </span>
          <input
            type="number"
            value={priceUzs}
            onChange={(e) => setPriceUzs(e.target.value)}
            placeholder="0"
            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Payme merchant ID</span>
            <input
              value={paymeMerchantId}
              onChange={(e) => setPaymeMerchantId(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Payme secret key{creds?.paymeSecretKeySet ? ` (${t("common.saved")})` : ""}
            </span>
            <input
              type="password"
              value={paymeSecretKey}
              onChange={(e) => setPaymeSecretKey(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Click service ID</span>
            <input
              value={clickServiceId}
              onChange={(e) => setClickServiceId(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Click merchant ID</span>
            <input
              value={clickMerchantId}
              onChange={(e) => setClickMerchantId(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">
              Click secret key{creds?.clickSecretKeySet ? ` (${t("common.saved")})` : ""}
            </span>
            <input
              type="password"
              value={clickSecretKey}
              onChange={(e) => setClickSecretKey(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={save.isPending}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("common.save")}
        </button>
      </div>
    </SectionCard>
  );
}

function SubscriptionRequestsCard() {
  const { t } = useI18n();
  const { data: requests, isLoading } = useSubscriptionRequestsRaw();
  const resolve = useResolveSubscriptionRequest();
  const pending = (requests ?? []).filter((r) => r.status === "pending");

  async function markResolved(id: string) {
    try {
      await resolve.mutateAsync(id);
      toast.success(t("trial.requestResolved"));
    } catch (err) {
      toast.error(describeError(err, t("common.saveFailed")));
    }
  }

  return (
    <SectionCard
      title={t("trial.pendingRequestsTitle")}
      description={t("trial.pendingRequestsDesc")}
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : pending.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-subtle">
          <CreditCard className="h-4 w-4" /> {t("trial.noPendingRequests")}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {pending.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CreditCard className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  to="/platform/organizations/$orgId"
                  params={{ orgId: r.organization_id }}
                  className="truncate text-sm font-medium text-foreground hover:underline"
                >
                  {r.organizations?.name ?? "—"}
                </Link>
                <p className="truncate text-xs text-subtle">{timeAgo(r.created_at)}</p>
              </div>
              <button
                type="button"
                onClick={() => void markResolved(r.id)}
                disabled={resolve.isPending}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                {t("trial.markResolved")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function PlatformNotificationsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: errors, isLoading: errorsLoading } = useErrorLogsRaw({
    orderBy: "created_at",
    ascending: false,
  });
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();

  if (user && user.role !== "platform_owner") {
    return (
      <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  const isLoading = errorsLoading || orgsLoading;
  const unresolvedErrors = (errors ?? []).filter((e) => !e.resolved);
  const recentOrgs = (orgs ?? []).filter(
    (o) => Date.now() - new Date(o.created_at).getTime() < NEW_ORG_WINDOW_MS,
  );

  type Feed = { id: string; icon: typeof Bell; text: string; at: string };
  const feed: Feed[] = [
    ...unresolvedErrors.map((e) => ({
      id: `err-${e.id}`,
      icon: AlertTriangle,
      text: `${t("platform.notifNewError")}: ${e.message}`,
      at: e.created_at,
    })),
    ...recentOrgs.map((o) => ({
      id: `org-${o.id}`,
      icon: Building2,
      text: `${t("platform.notifNewOrg")}: ${o.name}`,
      at: o.created_at,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <>
      <PageHeader
        title={t("platform.notificationsTitle")}
        description={t("platform.notificationsDesc")}
      />

      <div className="space-y-5">
        <SubscriptionRequestsCard />
        <PlatformPaymentSettingsCard />
        <SupportContactsCard />

        <SectionCard title={t("platform.notificationsTitle")}>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : feed.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-subtle">
              <Bell className="h-4 w-4" /> {t("platform.noNotifications")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {feed.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.text}</p>
                    <p className="truncate text-xs text-subtle">{timeAgo(item.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
