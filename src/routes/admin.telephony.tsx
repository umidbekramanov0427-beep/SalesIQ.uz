import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Copy,
  Loader2,
  Phone,
  PhoneCall,
  PlugZap,
  RefreshCw,
  Server,
  ShieldAlert,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PlanGate } from "@/components/PlanGate";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, timeAgo } from "@/lib/utils";
import {
  TELEPHONY_PROVIDERS,
  getTelephonyProviderMeta,
  useDisconnectTelephony,
  useSaveTelephonyCredentials,
  useTelephonyStatus,
  useTestTelephonyConnection,
  type TelephonyFieldKey,
  type TelephonyProvider,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/admin/telephony")({
  head: () => ({
    meta: [
      { title: "Integratsiyalar — SalesIQ" },
      {
        name: "description",
        content:
          "Telefoniya provayderlarini ulang: OnlinePBX, Sipuni, MoiZvonki, Binotel, FreePBX, Issabel, New-Tel yoki API orqali.",
      },
    ],
  }),
  component: AdminTelephonyPage,
});

const PROVIDER_ICONS: Record<TelephonyProvider, React.ComponentType<{ className?: string }>> = {
  onlinepbx: PhoneCall,
  sipuni: Phone,
  moizvonki: PhoneCall,
  binotel: PhoneCall,
  freepbx: Server,
  issabel: Server,
  newtel: Phone,
  api_inbound: ArrowDownToLine,
  api_outbound: ArrowUpFromLine,
};

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const EMPTY_FORM: Record<TelephonyFieldKey, string> = {
  apiKey: "",
  apiSecret: "",
  pbxDomain: "",
  callerId: "",
  smsSenderName: "",
};

function ProviderCard({
  provider,
  selected,
  connected,
  onSelect,
}: {
  provider: TelephonyProvider;
  selected: boolean;
  connected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const meta = getTelephonyProviderMeta(provider);
  const Icon = PROVIDER_ICONS[provider];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "surface-card relative flex flex-col items-start gap-2 p-3.5 text-left transition-colors sm:p-4",
        selected ? "border-primary ring-1 ring-primary/40" : "hover:bg-accent",
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            connected ? "bg-success/15 text-success" : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
        {connected && (
          <span className="shrink-0">
            <Pill tone="success">
              <CheckCircle2 className="mr-1 inline h-3 w-3" /> {t("telephony.connected")}
            </Pill>
          </span>
        )}
      </div>
      <div>
        <p className="text-[13px] font-bold leading-tight text-foreground sm:text-sm">
          {t(meta.labelKey)}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {t(meta.descriptionKey)}
        </p>
      </div>
    </button>
  );
}

function CredentialsForm({
  provider,
  status,
}: {
  provider: TelephonyProvider;
  status: ReturnType<typeof useTelephonyStatus>["data"];
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const meta = getTelephonyProviderMeta(provider);
  const save = useSaveTelephonyCredentials();
  const disconnect = useDisconnectTelephony();
  const testConnection = useTestTelephonyConnection();
  const [form, setForm] = useState<Record<TelephonyFieldKey, string>>(EMPTY_FORM);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const isActiveProvider = status?.provider === provider;
  const isConnected = isActiveProvider && !!status?.connected;

  useEffect(() => {
    setForm({
      ...EMPTY_FORM,
      pbxDomain: isActiveProvider ? (status?.pbxDomain ?? "") : "",
      callerId: isActiveProvider ? (status?.callerId ?? "") : "",
      smsSenderName: isActiveProvider ? (status?.smsSenderName ?? "") : "",
    });
    setRevealedSecret(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  function setField(key: TelephonyFieldKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const missingRequired = meta.fields.some((f) => f.required && !form[f.key].trim());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (missingRequired) return;
    try {
      await save.mutateAsync({
        provider,
        apiKey: form.apiKey.trim(),
        apiSecret: form.apiSecret.trim(),
        pbxDomain: form.pbxDomain.trim(),
        callerId: form.callerId.trim(),
        smsSenderName: form.smsSenderName.trim(),
      });
      toast.success(t("telephony.saveSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    }
  }

  async function onGenerateInboundKey() {
    const token = generateToken();
    try {
      await save.mutateAsync({
        provider: "api_inbound",
        apiKey: token,
        apiSecret: "",
        pbxDomain: "",
        callerId: "",
        smsSenderName: "",
      });
      setRevealedSecret(token);
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

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success(t("telephony.copied"));
  }

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/integrations/telephony/webhook?org=${user?.organizationId ?? ""}`
      : "";

  if (meta.kind === "generic-inbound") {
    return (
      <SectionCard title={t(meta.labelKey)} description={t(meta.descriptionKey)}>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Pill tone="success">
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> {t("telephony.connected")}
              </Pill>
            ) : (
              <Pill tone="neutral">{t("telephony.notConnected")}</Pill>
            )}
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("telephony.webhookUrlLabel")}
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs text-foreground">{webhookUrl}</code>
              <button
                type="button"
                onClick={() => void copy(webhookUrl)}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-subtle">{t("telephony.inboundHint")}</p>
          </div>

          {revealedSecret && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                {t("telephony.inboundKeyLabel")}
              </span>
              <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
                <code className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {revealedSecret}
                </code>
                <button
                  type="button"
                  onClick={() => void copy(revealedSecret)}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-destructive">{t("telephony.inboundKeyOnceHint")}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void onGenerateInboundKey()}
              disabled={save.isPending}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isConnected ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <PlugZap className="h-4 w-4" />
              )}
              {isConnected ? t("telephony.regenerateKeyButton") : t("telephony.generateKeyButton")}
            </button>
            {isConnected && (
              <button
                type="button"
                onClick={() => setConfirmDisconnect(true)}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Unplug className="h-3.5 w-3.5" />
                {t("telephony.disconnectButton")}
              </button>
            )}
          </div>
        </div>

        <ConfirmDialog
          open={confirmDisconnect}
          onOpenChange={setConfirmDisconnect}
          title={t("telephony.disconnectConfirmTitle")}
          description={t("telephony.disconnectConfirmDesc")}
          confirmLabel={t("telephony.disconnectButton")}
          onConfirm={() => void onDisconnect()}
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t(meta.labelKey)} description={t(meta.descriptionKey)}>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {meta.fields.map((field) => (
              <label
                key={field.key}
                className={cn(
                  "space-y-1.5",
                  field.key === "smsSenderName" && "sm:col-span-2",
                  meta.kind === "generic-outbound" && field.key === "pbxDomain" && "sm:col-span-2",
                )}
              >
                <span className="text-xs font-semibold text-muted-foreground">
                  {t(field.labelKey)}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type={field.inputType ?? "text"}
                    value={form[field.key]}
                    onChange={(e) => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    className="h-10 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
                  />
                  {meta.kind === "generic-outbound" && field.key === "apiSecret" && (
                    <button
                      type="button"
                      onClick={() => setField("apiSecret", generateToken())}
                      className="shrink-0 whitespace-nowrap rounded-xl border border-border px-2.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                    >
                      {t("telephony.generateButton")}
                    </button>
                  )}
                </div>
              </label>
            ))}
          </div>
          {!meta.supportsSms && meta.kind === "pbx" && (
            <p className="text-xs text-subtle">{t("telephony.smsNotSupported")}</p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={save.isPending || missingRequired}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlugZap className="h-4 w-4" />
              )}
              {isConnected ? t("telephony.updateButton") : t("telephony.connectButton")}
            </button>
          </div>
        </form>

        <div className="space-y-4 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Pill tone="success">
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> {t("telephony.connected")}
              </Pill>
            ) : (
              <Pill tone="neutral">{t("telephony.notConnected")}</Pill>
            )}
          </div>

          {isConnected && (
            <dl className="space-y-2 text-sm">
              {status?.pbxDomain && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("telephony.pbxDomainLabel")}</dt>
                  <dd className="truncate font-medium text-foreground">{status.pbxDomain}</dd>
                </div>
              )}
              {status?.callerId && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("telephony.callerIdLabel")}</dt>
                  <dd className="font-medium text-foreground">{status.callerId}</dd>
                </div>
              )}
              {status?.connectedAt && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("telephony.connectedAtLabel")}</dt>
                  <dd className="font-medium text-foreground">{timeAgo(status.connectedAt)}</dd>
                </div>
              )}
            </dl>
          )}

          {isConnected && (
            <div className="flex flex-col gap-2">
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
      </div>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title={t("telephony.disconnectConfirmTitle")}
        description={t("telephony.disconnectConfirmDesc")}
        confirmLabel={t("telephony.disconnectButton")}
        onConfirm={() => void onDisconnect()}
      />
    </SectionCard>
  );
}

function TelephonySettingsPage() {
  const { t } = useI18n();
  const { data: status, isLoading } = useTelephonyStatus();
  const [selected, setSelected] = useState<TelephonyProvider>("onlinepbx");

  useEffect(() => {
    if (status?.provider) setSelected(status.provider);
  }, [status?.provider]);

  return (
    <>
      <AdminBackLink />
      <PageHeader title={t("telephony.title")} description={t("telephony.desc")} />

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {TELEPHONY_PROVIDERS.map((meta) => (
              <ProviderCard
                key={meta.id}
                provider={meta.id}
                selected={selected === meta.id}
                connected={status?.connected === true && status.provider === meta.id}
                onSelect={() => setSelected(meta.id)}
              />
            ))}
          </div>

          <CredentialsForm provider={selected} status={status} />
        </div>
      )}
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

  return (
    <PlanGate feature="telephony">
      <TelephonySettingsPage />
    </PlanGate>
  );
}
