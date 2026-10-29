import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Copy,
  History,
  Loader2,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldAlert,
  Trash2,
  Unplug,
  Webhook,
  X,
  PhoneMissed,
  PhoneForwarded,
  Timer,
  Clock3,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill, StatCard } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PlanGate } from "@/components/PlanGate";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, timeAgo } from "@/lib/utils";
import { CatalogGroupSection, useAdminCatalog } from "@/components/admin/AdminCatalog";
import {
  TELEPHONY_PROVIDERS,
  getTelephonyProviderMeta,
  useCreateWebhookDestination,
  useDeleteWebhookDestination,
  useDisconnectTelephony,
  useWebhookDestinationHistory,
  useWebhookDestinations,
  useProfilesRaw,
  useMissedCallSummary,
  useSaveTelephonyCredentials,
  useSaveTelephonyExtensionLinks,
  useSyncPbxHistory,
  useTelephonyStatus,
  useTestTelephonyConnection,
  useToggleWebhookDestination,
  type OutgoingWebhookEvent,
  type ProfileRow,
  type TelephonyCredentialsStatus,
  type TelephonyExtensionLink,
  type TelephonyFieldKey,
  type TelephonyProvider,
} from "@/hooks/use-crm-data";
import { CrmGate } from "@/components/CrmGate";
import { TelegramRosterPanel } from "@/components/telegram/TelegramRoster";
import { copyText } from "@/lib/clipboard";

export const Route = createFileRoute("/admin/telephony")({
  // ?provider=onlinepbx (etc.) opens just that provider's setup -- each one
  // is its own card on the Admin panel. "webhooks" is the outgoing webhooks.
  validateSearch: (search: Record<string, unknown>): { provider?: string | undefined } => ({
    provider: typeof search["provider"] === "string" ? search["provider"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Integratsiyalar — SalesIQ" },
      {
        name: "description",
        content: "Qo'ng'iroqlar, yozuvlar va xabarlar qaysi manbalardan kelishini boshqaring.",
      },
    ],
  }),
  component: () => (
    <CrmGate>
      <AdminTelephonyPage />
    </CrmGate>
  ),
});

const PROVIDER_ICONS: Record<TelephonyProvider, React.ComponentType<{ className?: string }>> = {
  telegram: Send,
  moizvonki: PhoneCall,
  onlinepbx: PhoneCall,
  sipuni: Phone,
};

const EMPTY_FORM: Record<TelephonyFieldKey, string> = {
  apiKey: "",
  apiSecret: "",
  pbxDomain: "",
  callerId: "",
  smsSenderName: "",
};

/* ------------------------------------------------------------------ */
/* OnlinePBX "extension -> manager" mapping panel.                      */
/* ------------------------------------------------------------------ */

function ExtensionLinksPanel({
  provider,
  links,
  codeLabel,
  codePlaceholder,
  title,
  description,
  profiles,
}: {
  provider: TelephonyProvider;
  links: TelephonyExtensionLink[];
  codeLabel: string;
  codePlaceholder: string;
  title: string;
  description: string;
  profiles: ProfileRow[];
}) {
  const { t } = useI18n();
  const save = useSaveTelephonyExtensionLinks();
  const [code, setCode] = useState("");
  const [profileId, setProfileId] = useState("");

  async function onAdd() {
    if (!code.trim() || !profileId) return;
    const next = [...links.filter((l) => l.code !== code.trim()), { code: code.trim(), profileId }];
    try {
      await save.mutateAsync({ provider, extensionLinks: next });
      setCode("");
      setProfileId("");
      toast.success(t("telephony.saveSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    }
  }

  async function onRemove(linkCode: string) {
    try {
      await save.mutateAsync({
        provider,
        extensionLinks: links.filter((l) => l.code !== linkCode),
      });
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    }
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <Pill tone="neutral">{links.length}</Pill>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={codePlaceholder}
          className="h-9 w-36 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
        />
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          className="h-9 min-w-[200px] rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">{t("telephony.pickManager")}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void onAdd()}
          disabled={!code.trim() || !profileId || save.isPending}
          className="inline-flex h-9 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" /> {t("telephony.addLink")}
        </button>
      </div>
      {links.length > 0 ? (
        <ul className="space-y-1.5">
          {links.map((link) => {
            const profile = profiles.find((p) => p.id === link.profileId);
            return (
              <li
                key={link.code}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-foreground">{link.code}</span>
                <span className="flex-1 truncate text-foreground">
                  {profile?.full_name ?? t("telephony.unknownManager")}
                </span>
                <button
                  type="button"
                  onClick={() => void onRemove(link.code)}
                  className="shrink-0 text-destructive/70 transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border py-3 text-center text-xs text-subtle">
          {codeLabel}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel: form-based providers (OnlinePBX/Sipuni inline, MoiZvonki/       */
/* gated behind "Yoqish").                                               */
/* ------------------------------------------------------------------ */

function CredentialsFormPanel({
  provider,
  status,
  gated,
}: {
  provider: TelephonyProvider;
  status: TelephonyCredentialsStatus | undefined;
  gated: boolean;
}) {
  const { t } = useI18n();
  const meta = getTelephonyProviderMeta(provider);
  const save = useSaveTelephonyCredentials();
  const disconnect = useDisconnectTelephony();
  const testConnection = useTestTelephonyConnection();
  const [form, setForm] = useState<Record<TelephonyFieldKey, string>>(EMPTY_FORM);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isConnected = !!status?.connected;

  useEffect(() => {
    setForm({
      ...EMPTY_FORM,
      pbxDomain: status?.pbxDomain ?? "",
      callerId: status?.callerId ?? "",
      smsSenderName: status?.smsSenderName ?? "",
    });
    setRevealed(false);
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
      await save.mutateAsync({ provider, ...form });
      toast.success(t("telephony.saveSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    }
  }

  async function onTest() {
    try {
      const result = await testConnection.mutateAsync(provider);
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
      await disconnect.mutateAsync(provider);
      toast.success(t("telephony.disconnectSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.saveFailed")));
    } finally {
      setConfirmDisconnect(false);
    }
  }

  if (gated && !isConnected && !revealed) {
    const Icon = PROVIDER_ICONS[provider];
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </span>
        <p className="text-sm font-bold text-foreground">{t(`telephony.gateTitle.${provider}`)}</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {t(`telephony.gateDesc.${provider}`)}
        </p>
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t("telephony.enableButton")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {meta.fields.map((field) => (
            <label
              key={field.key}
              className={cn("space-y-1.5", field.key === "smsSenderName" && "sm:col-span-2")}
            >
              <span className="text-xs font-semibold text-muted-foreground">
                {t(field.labelKey)}
              </span>
              <input
                type={field.inputType ?? "text"}
                value={form[field.key]}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={save.isPending || missingRequired}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Settings2 className="h-4 w-4" />
            )}
            {t("telephony.testAndConnectButton")}
          </button>
          {isConnected && (
            <button
              type="button"
              onClick={() => void onTest()}
              disabled={testConnection.isPending}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              {testConnection.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Phone className="h-3.5 w-3.5" />
              )}
              {t("telephony.testButton")}
            </button>
          )}
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
      </form>

      {isConnected && status?.connectedAt && (
        <p className="text-xs text-subtle">
          {t("telephony.connectedAtLabel")}: {timeAgo(status.connectedAt)}
        </p>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title={t("telephony.disconnectConfirmTitle")}
        description={t("telephony.disconnectConfirmDesc")}
        confirmLabel={t("telephony.disconnectButton")}
        onConfirm={() => void onDisconnect()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* OnlinePBX: where every call comes from -- the webhook, each           */
/* salesperson's extension, and pulling the PBX's own history.          */
/* ------------------------------------------------------------------ */

function OnlinePbxCallsPanel({
  status,
  profiles,
}: {
  status: TelephonyCredentialsStatus | undefined;
  profiles: ProfileRow[];
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const sync = useSyncPbxHistory();
  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/integrations/telephony/webhook?org=${user?.organizationId ?? ""}&provider=onlinepbx`
      : "";
  const [result, setResult] = useState<string | null>(null);

  async function pull() {
    const r = await sync.mutateAsync({ force: true, hours: 24 * 7 });
    if (r.error) toast.error(r.error);
    else toast.success(t("tel.pulledFromPbx", { n: r.synced ?? 0 }));
    setResult(r.error ?? t("tel.pulled", { n: r.synced ?? 0 }));
  }

  return (
    <div className="mt-6 space-y-5 border-t border-border pt-5">
      <div className="space-y-2">
        <p className="text-[13px] font-bold text-foreground">{t("tel.step1")}</p>
        <p className="text-xs text-muted-foreground">{t("tel.step1Hint")}</p>
      </div>
      <ExtensionLinksPanel
        provider="onlinepbx"
        links={status?.extensionLinks ?? []}
        codeLabel="Hali ichki raqamlar bog'lanmagan."
        codePlaceholder="105"
        title={t("tel.extensionsTitle")}
        description={t("tel.extensionsDesc")}
        profiles={profiles}
      />

      <div className="space-y-2">
        <p className="text-[13px] font-bold text-foreground">{t("tel.step2")}</p>
        <p className="text-xs text-muted-foreground">{t("tel.step2Hint")}</p>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-[12px] text-foreground">{webhookUrl}</code>
          <button
            type="button"
            onClick={() => {
              void copyText(webhookUrl).then(
                () => toast.success(t("tel.copied")),
                () => toast.error(t("common.copyFailed")),
              );
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-bold text-foreground">{t("tel.step3")}</p>
        <p className="text-xs text-muted-foreground">{t("tel.step3Hint")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={sync.isPending || !status?.connected}
            onClick={() => void pull()}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", sync.isPending && "animate-spin")} />
            {t("tel.loadHistory")}
          </button>
          {result && <span className="text-xs text-muted-foreground">{result}</span>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                              */
/* ------------------------------------------------------------------ */

function DetailPanel({
  provider,
  status,
  profiles,
}: {
  provider: TelephonyProvider;
  status: TelephonyCredentialsStatus | undefined;
  profiles: ProfileRow[];
}) {
  const meta = getTelephonyProviderMeta(provider);
  switch (meta.kind) {
    case "roster-telegram":
      return <TelegramRosterPanel profiles={profiles} />;
    case "pbx-inline":
      return (
        <>
          <CredentialsFormPanel provider={provider} status={status} gated={false} />
          {provider === "onlinepbx" && <OnlinePbxCallsPanel status={status} profiles={profiles} />}
        </>
      );
    case "pbx-gated":
      return <CredentialsFormPanel provider={provider} status={status} gated />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Chiquvchi integratsiyalar (Outgoing integrations) tab -- pushes OUT   */
/* to amoCRM/Bitrix24 (real CRM sync, same cards as /integrations) and   */
/* to an org's own arbitrary webhook destinations (new, built here).    */
/* ------------------------------------------------------------------ */

const OUTGOING_EVENT_OPTIONS: { key: OutgoingWebhookEvent; labelKey: string }[] = [
  { key: "call_created", labelKey: "telephony.webhookEventCallCreated" },
  { key: "recording_ready", labelKey: "telephony.webhookEventRecordingReady" },
  { key: "ai_analysis_done", labelKey: "telephony.webhookEventAiAnalysisDone" },
];

function WebhookDestinationsPanel() {
  const { t } = useI18n();
  const { data: webhooks, isLoading } = useWebhookDestinations();
  const { data: history } = useWebhookDestinationHistory();
  const create = useCreateWebhookDestination();
  const toggle = useToggleWebhookDestination();
  const del = useDeleteWebhookDestination();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<OutgoingWebhookEvent>>(new Set());
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function toggleEvent(key: OutgoingWebhookEvent) {
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onAdd() {
    if (!name.trim() || !url.trim()) return;
    try {
      await create.mutateAsync({
        name: name.trim(),
        url: url.trim(),
        enabled: true,
        events: Array.from(events),
        headers: Object.fromEntries(
          headers.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value]),
        ),
      });
      setName("");
      setUrl("");
      setEvents(new Set());
      setHeaders([]);
      toast.success(t("telephony.webhookSaveSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.webhookSaveFailed")));
    }
  }

  async function onToggle(id: string, enabled: boolean) {
    try {
      await toggle.mutateAsync({ id, enabled });
    } catch (err) {
      toast.error(describeError(err, t("telephony.webhookToggleFailed")));
    }
  }

  async function onDelete(id: string) {
    try {
      await del.mutateAsync(id);
      toast.success(t("telephony.webhookDeleteSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("telephony.webhookDeleteFailed")));
    } finally {
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border border-border p-4">
        <p className="text-[13px] font-bold text-foreground">{t("telephony.webhookAddTitle")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("telephony.webhookNameLabel")}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("telephony.webhookNamePlaceholder")}
              className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("telephony.webhookDestUrlLabel")}
            </span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {t("telephony.webhookEventsLabel")}
          </span>
          <div className="flex flex-wrap gap-3">
            {OUTGOING_EVENT_OPTIONS.map((opt) => (
              <label
                key={opt.key}
                className="flex items-center gap-2 text-xs font-medium text-foreground"
              >
                <Switch
                  checked={events.has(opt.key)}
                  onCheckedChange={() => toggleEvent(opt.key)}
                />
                {t(opt.labelKey)}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("telephony.webhookHeadersLabel")}
            </span>
            <button
              type="button"
              onClick={() => setHeaders((hs) => [...hs, { key: "", value: "" }])}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="h-3 w-3" /> {t("telephony.webhookAddHeader")}
            </button>
          </div>
          {headers.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={h.key}
                onChange={(e) =>
                  setHeaders((hs) =>
                    hs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)),
                  )
                }
                placeholder={t("telephony.webhookHeaderKeyPlaceholder")}
                className="h-9 w-1/2 rounded-xl border border-border bg-surface px-3 text-xs text-foreground outline-none focus:border-primary"
              />
              <input
                value={h.value}
                onChange={(e) =>
                  setHeaders((hs) =>
                    hs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                  )
                }
                placeholder={t("telephony.webhookHeaderValuePlaceholder")}
                className="h-9 w-1/2 rounded-xl border border-border bg-surface px-3 text-xs text-foreground outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setHeaders((hs) => hs.filter((_, j) => j !== i))}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void onAdd()}
          disabled={!name.trim() || !url.trim() || create.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {create.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {t("telephony.webhookAddButton")}
        </button>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-[13px] font-bold text-foreground">{t("telephony.webhookListTitle")}</p>
        {isLoading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : !webhooks?.length ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            {t("telephony.webhookListEmpty")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {webhooks.map((w) => (
              <li
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{w.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{w.url}</p>
                  {w.events.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {w.events.map((ev) => (
                        <Pill key={ev} tone="info">
                          {t(
                            `telephony.webhookEvent${ev === "call_created" ? "CallCreated" : ev === "recording_ready" ? "RecordingReady" : "AiAnalysisDone"}`,
                          )}
                        </Pill>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch checked={w.enabled} onCheckedChange={(v) => void onToggle(w.id, v)} />
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(w.id)}
                    className="text-destructive/70 transition-colors hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
          <History className="h-3.5 w-3.5" /> {t("telephony.webhookHistoryTitle")}
        </p>
        {!history?.length ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            {t("telephony.webhookHistoryEmpty")}
          </p>
        ) : (
          <ul className="space-y-1">
            {history.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs"
              >
                <span className="font-mono text-foreground">{d.event}</span>
                <span className="text-muted-foreground">{timeAgo(d.createdAt)}</span>
                <Pill tone={d.status === "sent" ? "success" : "danger"}>
                  {d.status === "sent"
                    ? t("telephony.webhookStatusSent")
                    : t("telephony.webhookStatusFailed")}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(v) => !v && setConfirmDeleteId(null)}
        title={t("telephony.webhookDeleteConfirmTitle")}
        description={t("telephony.webhookDeleteConfirmDesc")}
        onConfirm={() => confirmDeleteId && void onDelete(confirmDeleteId)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                  */
/* ------------------------------------------------------------------ */

function MissedCallsCard() {
  const { t } = useI18n();
  const { data } = useMissedCallSummary(7);
  // Hidden until the missed-calls migration has run (the view is absent).
  if (!data) return null;
  const pct = (n: number) => (data.missed > 0 ? `${Math.round((n / data.missed) * 100)}%` : "—");
  return (
    <SectionCard
      title={t("missed.title")}
      icon={PhoneMissed}
      tone="rose"
      description={t("missed.desc")}
      className="mb-5"
    >
      {data.missed === 0 ? (
        <p className="text-sm text-muted-foreground">{t("missed.none")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("missed.count")}
            value={String(data.missed)}
            icon={PhoneMissed}
            iconTone="rose"
          />
          <StatCard
            label={t("missed.calledBack")}
            value={`${data.calledBack} · ${pct(data.calledBack)}`}
            icon={PhoneForwarded}
            iconTone="emerald"
          />
          <StatCard
            label={t("missed.within15")}
            value={`${data.calledBack15m} · ${pct(data.calledBack15m)}`}
            icon={Timer}
            iconTone="sky"
          />
          <StatCard
            label={t("missed.avgWait")}
            value={
              data.avgCallbackSeconds == null
                ? "—"
                : t("missed.minutes", {
                    n: String(Math.max(1, Math.round(data.avgCallbackSeconds / 60))),
                  })
            }
            icon={Clock3}
            iconTone="amber"
          />
        </div>
      )}
    </SectionCard>
  );
}

// One provider's page: its header and only its own setup panel.
function ProviderPage({ provider }: { provider: TelephonyProvider | "webhooks" }) {
  const { t } = useI18n();
  const { data: statusMap, isLoading } = useTelephonyStatus();
  const { data: profiles } = useProfilesRaw();

  if (provider === "webhooks") {
    return (
      <>
        <PageHeader
          title={t("telephony.outgoingWebhooksLabel")}
          icon={Webhook}
          tone="slate"
          description={t("telephony.outgoingWebhooksDesc")}
        />
        <SectionCard>
          <WebhookDestinationsPanel />
        </SectionCard>
      </>
    );
  }

  const meta = getTelephonyProviderMeta(provider);
  return (
    <>
      <PageHeader
        title={t(`hub.item.tel_${provider}.title`)}
        icon={Phone}
        tone="sky"
        description={t(`hub.item.tel_${provider}.desc`)}
      />
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <SectionCard title={t(meta.labelKey)} icon={Phone} tone="sky">
          <DetailPanel
            provider={provider}
            status={statusMap?.[provider]}
            profiles={profiles ?? []}
          />
        </SectionCard>
      )}
    </>
  );
}

// Telefoniya without a provider picked: missed calls of the week, and every
// provider as a card -- each opens its own page.
function IntegrationsPage() {
  const { t } = useI18n();
  const groups = useAdminCatalog();
  const providers = groups.find((g) => g.key === "telephony");
  return (
    <>
      <PageHeader
        title={t("telephony.title")}
        icon={Phone}
        tone="sky"
        description={t("hub.telephonyDesc")}
      />
      <MissedCallsCard />
      {providers && <CatalogGroupSection group={providers} />}
    </>
  );
}

function AdminTelephonyPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { provider } = Route.useSearch();

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
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
      </>
    );
  }

  const known = TELEPHONY_PROVIDERS.some((p) => p.id === provider) || provider === "webhooks";
  return (
    <PlanGate feature="telephony">
      {provider && known ? (
        <ProviderPage provider={provider as TelephonyProvider | "webhooks"} />
      ) : (
        <IntegrationsPage />
      )}
    </PlanGate>
  );
}
