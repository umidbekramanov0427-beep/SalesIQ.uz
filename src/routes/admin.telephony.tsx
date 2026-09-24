import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Phone, PlugZap, ShieldAlert, Unplug } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, timeAgo } from "@/lib/utils";
import {
  useDisconnectTelephony,
  useSaveTelephonyCredentials,
  useTelephonyStatus,
  useTestTelephonyConnection,
  type TelephonyProvider,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/admin/telephony")({
  head: () => ({
    meta: [
      { title: "Telefoniya — SalesIQ" },
      {
        name: "description",
        content: "OnlinePBX, Sipuni yoki MoiZvonki ulanishini sozlang: qo'ng'iroq va SMS uchun.",
      },
    ],
  }),
  component: AdminTelephonyPage,
});

const PROVIDERS: TelephonyProvider[] = ["onlinepbx", "sipuni", "moizvonki"];

function TelephonySettingsPage() {
  const { t } = useI18n();
  const { data: status, isLoading } = useTelephonyStatus();
  const save = useSaveTelephonyCredentials();
  const disconnect = useDisconnectTelephony();
  const testConnection = useTestTelephonyConnection();

  const [provider, setProvider] = useState<TelephonyProvider>("onlinepbx");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [pbxDomain, setPbxDomain] = useState("");
  const [callerId, setCallerId] = useState("");
  const [smsSenderName, setSmsSenderName] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Once an existing connection loads, default the picker to match it --
  // only fires when the loaded provider value itself changes, so switching
  // the picker manually afterward (e.g. to set up a second provider before
  // saving) isn't immediately overridden.
  useEffect(() => {
    if (status?.provider) setProvider(status.provider);
  }, [status?.provider]);

  const isOnlinePbx = provider === "onlinepbx";
  const isMoizvonki = provider === "moizvonki";
  const needsDomain = isOnlinePbx || isMoizvonki;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim() || !apiSecret.trim() || (needsDomain && !pbxDomain.trim())) return;
    try {
      await save.mutateAsync({
        provider,
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        pbxDomain: pbxDomain.trim(),
        callerId: callerId.trim(),
        smsSenderName: smsSenderName.trim(),
      });
      setApiKey("");
      setApiSecret("");
      setPbxDomain("");
      setCallerId("");
      setSmsSenderName("");
      toast.success(t("telephony.saveSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    }
  }

  async function onTest() {
    try {
      const result = await testConnection.mutateAsync();
      toast.success(
        result.pbxDomain
          ? t("telephony.testSuccess", { domain: result.pbxDomain })
          : t("telephony.testSuccessGeneric"),
      );
    } catch (err) {
      toast.error(describeError(err, t("telephony.testFailed")));
    }
  }

  async function onDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success(t("telephony.disconnectSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    } finally {
      setConfirmDisconnect(false);
    }
  }

  return (
    <>
      <AdminBackLink />
      <PageHeader title={t("telephony.title")} description={t("telephony.desc")} />

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <SectionCard title={t("telephony.credentialsTitle")}>
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <div>
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("telephony.providerLabel")}
                </span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProvider(p)}
                      className={cn(
                        "rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                        provider === p
                          ? "border-primary/40 bg-mint text-mint-foreground"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {t(`telephony.provider.${p}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {needsDomain && (
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {isMoizvonki
                        ? t("telephony.moizvonkiApiUrlLabel")
                        : t("telephony.pbxDomainLabel")}
                    </span>
                    <input
                      value={pbxDomain}
                      onChange={(e) => setPbxDomain(e.target.value)}
                      placeholder={
                        isMoizvonki ? "yourcompany.moizvonki.ru" : "mycompany.onlinepbx.ru"
                      }
                      required
                      className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </label>
                )}
                {!isMoizvonki && (
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {isOnlinePbx ? t("telephony.callerIdLabel") : t("telephony.sipNumberLabel")}
                    </span>
                    <input
                      value={callerId}
                      onChange={(e) => setCallerId(e.target.value)}
                      placeholder={isOnlinePbx ? "+998901234567" : "101"}
                      className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </label>
                )}
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {isOnlinePbx
                      ? t("telephony.apiKeyLabel")
                      : isMoizvonki
                        ? t("telephony.moizvonkiApiKeyLabel")
                        : t("telephony.sipUserLabel")}
                  </span>
                  <input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    required
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {isOnlinePbx
                      ? t("telephony.apiSecretLabel")
                      : isMoizvonki
                        ? t("telephony.moizvonkiUserNameLabel")
                        : t("telephony.sipSecretLabel")}
                  </span>
                  <input
                    type={isMoizvonki ? "email" : "password"}
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    required
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
                  />
                </label>
                {isOnlinePbx ? (
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t("telephony.smsSenderLabel")}
                    </span>
                    <input
                      value={smsSenderName}
                      onChange={(e) => setSmsSenderName(e.target.value)}
                      placeholder="SalesIQ"
                      className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </label>
                ) : (
                  <p className="text-xs text-subtle sm:col-span-2">
                    {t("telephony.smsNotSupported")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={
                    save.isPending ||
                    !apiKey.trim() ||
                    !apiSecret.trim() ||
                    (needsDomain && !pbxDomain.trim())
                  }
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {save.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlugZap className="h-4 w-4" />
                  )}
                  {status?.connected ? t("telephony.updateButton") : t("telephony.connectButton")}
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title={t("telephony.statusTitle")}>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {status?.connected ? (
                  <Pill tone="success">
                    <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> {t("telephony.connected")}
                  </Pill>
                ) : (
                  <Pill tone="neutral">{t("telephony.notConnected")}</Pill>
                )}
                {status?.connected && status.provider && (
                  <Pill tone="info">{t(`telephony.provider.${status.provider}`)}</Pill>
                )}
              </div>

              {status?.connected && (
                <dl className="space-y-2 text-sm">
                  {status.pbxDomain && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{t("telephony.pbxDomainLabel")}</dt>
                      <dd className="font-medium text-foreground">{status.pbxDomain}</dd>
                    </div>
                  )}
                  {status.callerId && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">
                        {status.provider === "sipuni"
                          ? t("telephony.sipNumberLabel")
                          : t("telephony.callerIdLabel")}
                      </dt>
                      <dd className="font-medium text-foreground">{status.callerId}</dd>
                    </div>
                  )}
                  {status.smsSenderName && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{t("telephony.smsSenderLabel")}</dt>
                      <dd className="font-medium text-foreground">{status.smsSenderName}</dd>
                    </div>
                  )}
                  {status.connectedAt && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{t("telephony.connectedAtLabel")}</dt>
                      <dd className="font-medium text-foreground">{timeAgo(status.connectedAt)}</dd>
                    </div>
                  )}
                </dl>
              )}

              {status?.connected && (
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => void onTest()}
                    disabled={testConnection.isPending}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    {testConnection.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Phone className="h-3.5 w-3.5" />
                    )}
                    {t("telephony.testButton")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(true)}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Unplug className="h-3.5 w-3.5" />
                    {t("telephony.disconnectButton")}
                  </button>
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title={t("telephony.disconnectConfirmTitle")}
        description={t("telephony.disconnectConfirmDesc")}
        confirmLabel={t("telephony.disconnectButton")}
        onConfirm={() => void onDisconnect()}
      />
    </>
  );
}

function AdminTelephonyPage() {
  const { user } = useAuth();
  const { t } = useI18n();

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
          </div>
        </SectionCard>
      </>
    );
  }

  return <TelephonySettingsPage />;
}
