import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquareText,
  Phone,
  Plug,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
  Users,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, StatCard, Pill } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { BRAND_ICONS } from "@/lib/brand-icons";
import {
  useAmoCallsCount,
  useAmoConnectionStatus,
  useAmoSyncLog,
  useBitrix24ConnectionStatus,
  useBitrix24SyncLog,
  useConnectBitrix24,
  useCreateLeadSource,
  useDisconnectBitrix24,
  useDisconnectSms,
  useDisconnectSmtp,
  useIntegrationSetting,
  useLeadSources,
  usePermission,
  usePipelineStagesRaw,
  useRefreshAmoManagers,
  useDisconnectWhatsapp,
  useSaveSmsCredentials,
  useSaveSmtpCredentials,
  useSaveWhatsappCredentials,
  useSetAmoCrmCredentials,
  useSmsStatus,
  useSmtpStatus,
  useTelephonyStatus,
  useTestSmsConnection,
  useTestWhatsappConnection,
  useTriggerAmoCrmSync,
  useTriggerBitrix24Sync,
  useWhatsappStatus,
  type AmoSyncLogRow,
  type Bitrix24SyncLogRow,
} from "@/hooks/use-crm-data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PlanGate } from "@/components/PlanGate";
import { useCrmEnabled } from "@/lib/use-org-access";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — SalesIQ CRM" },
      {
        name: "description",
        content:
          "Connect Salesforce, HubSpot, Slack, Google Sheets, Telegram and more to your SalesIQ workspace.",
      },
      { property: "og:title", content: "Integrations — SalesIQ CRM" },
      {
        property: "og:description",
        content: "Connect and manage the tools your revenue team uses every day.",
      },
    ],
  }),
  component: IntegrationsPage,
});

type Catalog = {
  id: string;
  name: string;
  category: "crm" | "messaging" | "data" | "ai" | "other";
  blurb: string;
  color: string;
};

const CATALOG: Catalog[] = [
  {
    id: "salesforce",
    name: "Salesforce",
    category: "crm",
    blurb: "int.blurb.salesforce",
    color: "#00A1E0",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "crm",
    blurb: "int.blurb.hubspot",
    color: "#FF7A59",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    category: "data",
    blurb: "int.blurb.googleSheets",
    color: "#0F9D58",
  },
  {
    id: "google-docs",
    name: "Google Docs",
    category: "data",
    blurb: "int.blurb.googleDocs",
    color: "#4285F4",
  },
  {
    id: "google-forms",
    name: "Google Forms",
    category: "data",
    blurb: "int.blurb.googleForms",
    color: "#673AB7",
  },
  {
    id: "slack",
    name: "Slack",
    category: "messaging",
    blurb: "int.blurb.slack",
    color: "#611F69",
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    category: "messaging",
    blurb: "int.blurb.whatsapp",
    color: "#25D366",
  },
  {
    id: "instagram",
    name: "Instagram Business",
    category: "messaging",
    blurb: "int.blurb.instagram",
    color: "#E1306C",
  },
  {
    id: "messenger",
    name: "Facebook Messenger",
    category: "messaging",
    blurb: "int.blurb.messenger",
    color: "#0084FF",
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "ai",
    blurb: "int.blurb.openai",
    color: "#10A37F",
  },
  {
    id: "twilio",
    name: "Twilio",
    category: "other",
    blurb: "int.blurb.twilio",
    color: "#F22F46",
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "other",
    blurb: "int.blurb.stripe",
    color: "#635BFF",
  },
  {
    id: "anthropic-claude",
    name: "Anthropic Claude",
    category: "ai",
    blurb: "int.blurb.claude",
    color: "#D97757",
  },
  {
    id: "google-gemini",
    name: "Google Gemini",
    category: "ai",
    blurb: "int.blurb.gemini",
    color: "#8E75B2",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "data",
    blurb: "int.blurb.googleCalendar",
    color: "#4285F4",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    category: "data",
    blurb: "int.blurb.googleDrive",
    color: "#FBBC04",
  },
  {
    id: "outlook",
    name: "Outlook / Microsoft 365",
    category: "messaging",
    blurb: "int.blurb.outlook",
    color: "#0078D4",
  },
  {
    id: "ms-teams",
    name: "Microsoft Teams",
    category: "messaging",
    blurb: "int.blurb.msTeams",
    color: "#6264A7",
  },
  {
    id: "aws-s3",
    name: "AWS S3",
    category: "data",
    blurb: "int.blurb.awsS3",
    color: "#FF9900",
  },
  {
    id: "cloudinary",
    name: "Cloudinary",
    category: "data",
    blurb: "int.blurb.cloudinary",
    color: "#3448C5",
  },
  {
    id: "zoom",
    name: "Zoom",
    category: "messaging",
    blurb: "int.blurb.zoom",
    color: "#2D8CFF",
  },
  {
    id: "firebase",
    name: "Firebase / Push",
    category: "other",
    blurb: "int.blurb.firebase",
    color: "#FFCA28",
  },
  {
    id: "custom-api",
    name: "Custom Integration (API)",
    category: "other",
    blurb: "int.blurb.customApi",
    color: "#334155",
  },
];

// Renders a catalog entry's actual brand mark (see brand-icons.tsx) --
// falls back to the old first-letter badge only for entries with no real
// logo on file (there are none today; this only guards a future addition)
// or if a hotlinked logo image fails to load at runtime.
function IntegrationLogo({
  id,
  name,
  color,
  size = "lg",
}: {
  id: string;
  name: string;
  color: string;
  size?: "sm" | "lg";
}) {
  const icon = BRAND_ICONS[id];
  const [imgFailed, setImgFailed] = useState(false);
  const boxClass = size === "lg" ? "h-14 w-14 rounded-2xl" : "h-12 w-12 rounded-xl";

  if (icon?.kind === "svg") {
    return (
      <span
        className={cn("flex shrink-0 items-center justify-center", boxClass)}
        style={{ backgroundColor: color }}
        aria-hidden
      >
        <svg viewBox={icon.viewBox} className={size === "lg" ? "h-7 w-7" : "h-6 w-6"} fill="#fff">
          <path d={icon.path} />
        </svg>
      </span>
    );
  }

  if (icon?.kind === "img" && !imgFailed) {
    return (
      <span
        className={cn("flex shrink-0 items-center justify-center bg-white p-2", boxClass)}
        aria-hidden
      >
        <img
          src={icon.src}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center font-bold text-white",
        boxClass,
        size === "lg" ? "text-lg" : "text-base",
      )}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {name[0]}
    </span>
  );
}

// The catalog below covers services this platform doesn't have a live
// connection to yet (each would need its own OAuth app registration or
// provider account) -- rather than faking an instant "Connected" toggle
// that does nothing (the exact complaint that prompted this rework),
// clicking one just records interest so the team building this platform
// knows what to prioritize next. The genuinely working integrations
// (AmoCRM, webhooks, email, telephony) get their own real cards above,
// never this fake-connect flow.
type Requested = { id: string; requestedAt: string };

const STORAGE_KEY = "salesos.integrations.requested";

// AmoCRM's private integrations are created inside one specific account and
// can't be installed from a different one -- a platform running several
// companies, each on their own AmoCRM account, needs to store each org's own
// client_id/secret. Most orgs never touch this (the platform-wide default
// keeps working), so it's collapsed behind a toggle instead of always shown.
function AmoCrmCredentialsForm({
  currentClientId,
  connected,
}: {
  currentClientId?: string | undefined;
  connected: boolean;
}) {
  const { t } = useI18n();
  const setCredentials = useSetAmoCrmCredentials();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(currentClientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSaving(true);
    try {
      await setCredentials.mutateAsync({ clientId, clientSecret });
      toast.success(
        connected ? t("amocrm.credentialsSavedReconnect") : t("amocrm.credentialsSaved"),
      );
      setClientSecret("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("amocrm.credentialsSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-subtle transition-colors hover:text-foreground"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
        {connected ? t("amocrm.updateCredentialsToggle") : t("amocrm.ownIntegrationToggle")}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="max-w-xl text-xs text-subtle">
            {connected ? t("amocrm.updateCredentialsDesc") : t("amocrm.ownIntegrationDesc")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                {t("amocrm.fieldClientId")}
              </span>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={t("amocrm.fieldClientIdPlaceholder")}
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                {t("amocrm.fieldClientSecret")}
              </span>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={
                  currentClientId
                    ? t("amocrm.fieldClientSecretSaved")
                    : t("amocrm.fieldClientSecret")
                }
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !clientId.trim() || !clientSecret.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("common.save")}
            </button>
            {connected && (
              <button
                type="button"
                onClick={async () => {
                  const { data } = await supabase.auth.getSession();
                  const token = data.session?.access_token;
                  if (!token) return;
                  window.location.href = `/integrations/amocrm/connect?token=${encodeURIComponent(token)}`;
                }}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
              >
                <Plug className="h-3.5 w-3.5" /> {t("amocrm.reconnect")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AmoCrmCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: setting, isLoading } = useIntegrationSetting("amocrm");
  const { data: connectionStatus } = useAmoConnectionStatus();
  const { data: stages } = usePipelineStagesRaw();
  const { data: callsCount } = useAmoCallsCount();
  const { data: syncLog } = useAmoSyncLog();
  const sync = useTriggerAmoCrmSync();
  const refreshManagers = useRefreshAmoManagers();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";

  // integration_settings.enabled is set true by the OAuth callback but
  // nothing clears it if the amocrm_connection row is later removed (token
  // revoked, row deleted, etc.) — the two can drift, and when they do, this
  // stayed stuck showing "Sinxronlash" instead of "Ulash" with no way back
  // to reconnect. amocrm_connection is the actual source of truth for
  // whether a live connection exists; only fall back to the settings flag
  // for non-admins, who don't get connectionStatus loaded at all (RLS/query
  // gates it to super_admin) but also never see these buttons anyway.
  const connected = isAdmin ? !!connectionStatus : (setting?.enabled ?? false);
  const config =
    (setting?.config as {
      subdomain?: string;
      last_synced_at?: string;
      lead_count?: number;
      client_id?: string;
    } | null) ?? {};

  const amoStages = (stages ?? []).filter((s) => s.amocrm_status_id != null);
  const pipelineCount = new Set(amoStages.map((s) => s.amocrm_pipeline_id)).size;

  // amocrm_connection.last_synced_at (via connectionStatus) refetches every
  // 3s, so it reflects the pg_cron auto-sync's writes live; the
  // integration_settings.config copy only updates on this page's own
  // queries, so non-admins (who don't load connectionStatus) fall back to it.
  const lastSyncedAt = isAdmin ? connectionStatus?.last_synced_at : config.last_synced_at;

  return (
    <SectionCard title={t("amocrm.settingsTitle")} description={t("amocrm.desc")}>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Pill tone={connected ? "success" : "neutral"}>
                  {connected ? t("common.connected") : t("common.notConnected")}
                </Pill>
                {connected && config.subdomain && (
                  <span className="text-xs text-subtle">{config.subdomain}</span>
                )}
              </div>
              {connected && (
                <p className="mt-2 text-xs text-subtle">
                  {t("amocrm.lastSync")}:{" "}
                  {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : t("amocrm.never")}
                </p>
              )}
              {isAdmin && connected && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                  </span>
                  {t("amocrm.autoSyncActive")}
                </p>
              )}
              {isAdmin &&
                connected &&
                !connectionStatus?.last_sync_error &&
                connectionStatus?.initial_sync_page != null && (
                  <p className="mt-2 max-w-md text-xs text-warning-foreground">
                    {t("amocrm.initialSyncInProgress", {
                      page: String(connectionStatus.initial_sync_page),
                    })}
                  </p>
                )}
              {!isAdmin && <p className="mt-2 text-xs text-subtle">{t("amocrm.adminOnly")}</p>}
              {isAdmin && connectionStatus?.last_sync_error && (
                <p className="mt-2 max-w-md text-xs text-destructive">
                  {t("amocrm.lastError")}: {connectionStatus.last_sync_error}
                </p>
              )}
            </div>

            {isAdmin && connected && (
              <button
                type="button"
                onClick={() =>
                  sync.mutate(undefined, {
                    onSuccess: () => toast.success(t("amocrm.syncStarted")),
                    onError: (err) =>
                      toast.error(err instanceof Error ? err.message : t("amocrm.syncFailed")),
                  })
                }
                disabled={sync.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {sync.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t("amocrm.syncNow")}
              </button>
            )}
            {isAdmin && connected && (
              <button
                type="button"
                onClick={() =>
                  refreshManagers.mutate(undefined, {
                    onSuccess: (data) =>
                      toast.success(t("amocrm.managersRefreshed", { count: String(data.mapped) })),
                    onError: (err) =>
                      toast.error(describeError(err, t("amocrm.managersRefreshFailed"))),
                  })
                }
                disabled={refreshManagers.isPending}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                {refreshManagers.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                {t("amocrm.refreshManagers")}
              </button>
            )}
            {isAdmin && !connected && (
              <button
                type="button"
                onClick={async () => {
                  const { data } = await supabase.auth.getSession();
                  const token = data.session?.access_token;
                  if (!token) return;
                  window.location.href = `/integrations/amocrm/connect?token=${encodeURIComponent(token)}`;
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Plug className="h-4 w-4" /> {t("amocrm.connect")}
              </button>
            )}
            {isAdmin && !connected && (
              <button
                type="button"
                onClick={async () => {
                  const { data } = await supabase.auth.getSession();
                  const token = data.session?.access_token;
                  if (!token) return;
                  window.location.href = `/integrations/amocrm/connect?token=${encodeURIComponent(token)}&debug=1`;
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
              >
                Diagnostika
              </button>
            )}
          </div>

          {isAdmin && (
            <AmoCrmCredentialsForm currentClientId={config.client_id} connected={connected} />
          )}

          {connected && (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <StatCard
                label={t("amocrm.statPipelines")}
                value={String(pipelineCount)}
                info={t("amocrm.statPipelinesInfo")}
              />
              <StatCard
                label={t("amocrm.statStages")}
                value={String(amoStages.length)}
                info={t("amocrm.statStagesInfo")}
              />
              <StatCard
                label={t("amocrm.statLeads")}
                value={String(config.lead_count ?? 0)}
                info={t("amocrm.statLeadsInfo")}
                tone="mint"
              />
              <StatCard
                label={t("amocrm.statCallsImported")}
                value={String(callsCount ?? 0)}
                info={t("amocrm.statCallsImportedInfo")}
              />
            </div>
          )}

          {isAdmin && connected && <AmoSyncHistory rows={syncLog} />}
        </div>
      )}
    </SectionCard>
  );
}

function AmoSyncHistory({ rows }: { rows: AmoSyncLogRow[] | undefined }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t("amocrm.syncHistory")}</h3>
        <p className="text-xs text-subtle">{t("amocrm.syncHistoryDesc")}</p>
      </div>
      {!rows || rows.length === 0 ? (
        <p className="text-xs text-subtle">{t("amocrm.syncHistoryEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <Pill tone={row.trigger === "manual" ? "info" : "neutral"}>
                  {row.trigger === "manual" ? t("amocrm.triggerManual") : t("amocrm.triggerCron")}
                </Pill>
                <span className="text-subtle">{new Date(row.finished_at).toLocaleString()}</span>
              </div>
              {row.skipped ? (
                <Pill tone="warning">{t("amocrm.syncSkipped")}</Pill>
              ) : row.error ? (
                <span className="max-w-xs truncate text-destructive" title={row.error}>
                  {row.error}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {t("amocrm.syncResultSummary", {
                    leads: String(row.synced_count),
                    calls: String(row.calls_synced ?? 0),
                  })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function webhookUrlFor(token: string): string {
  if (typeof window === "undefined") return `/leads/incoming/${token}`;
  return `${window.location.origin}/leads/incoming/${token}`;
}

// Self-service webhook creation, right on the main Integrations page --
// previously the only way to get a lead-capture webhook URL was asking
// for one to be built by hand; the full source (name/type/default owner
// & stage/log) still lives at /admin/lead-sources, this is just the fast
// path for "give me a URL to paste into Zapier/Make right now".
function WebhookQuickCreateCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: sources } = useLeadSources();
  const create = useCreateLeadSource();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function onCreate() {
    if (!name.trim()) return;
    try {
      await create.mutateAsync({
        name: name.trim(),
        source_type: "webhook",
        organization_id: user!.organizationId!,
        created_by: user!.id,
      });
      setName("");
      setDialogOpen(false);
      toast.success(t("leadSources.createSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("leadSources.saveFailed")));
    }
  }

  async function copyUrl(token: string) {
    try {
      await navigator.clipboard.writeText(webhookUrlFor(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 1500);
    } catch {
      toast.error(t("leadSources.copyFailed"));
    }
  }

  return (
    <SectionCard
      title={t("int.webhookCardTitle")}
      description={t("int.webhookCardDesc")}
      actions={
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> {t("int.createWebhook")}
        </button>
      }
    >
      {(sources ?? []).length === 0 ? (
        <p className="text-sm text-subtle">{t("leadSources.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {(sources ?? []).map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2.5"
            >
              <Webhook className="h-4 w-4 shrink-0 text-subtle" />
              <span className="shrink-0 text-sm font-medium text-foreground">{s.name}</span>
              <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {webhookUrlFor(s.webhook_token)}
              </code>
              <button
                type="button"
                onClick={() => void copyUrl(s.webhook_token)}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {copiedToken === s.webhook_token ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copiedToken === s.webhook_token
                  ? t("leadSources.copied")
                  : t("leadSources.copyUrl")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/admin/lead-sources"
        className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
      >
        {t("int.webhookAdvancedSettings")}
      </Link>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("int.createWebhook")}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("leadSources.namePlaceholder")}
              className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => void onCreate()}
              disabled={create.isPending || !name.trim()}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {t("leadSources.addButton")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// Real per-lead email sending, via any provider's SMTP (a Gmail app
// password works fine) -- no exotic paid email API needed. Same
// collapsed-form-once-connected UX as AmoCrmCredentialsForm above.
function SmtpEmailCard() {
  const { t } = useI18n();
  const { data: status, isLoading } = useSmtpStatus();
  const save = useSaveSmtpCredentials();
  const disconnect = useDisconnectSmtp();
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function onSave() {
    try {
      await save.mutateAsync({
        host,
        port: Number(port) || 587,
        username,
        password,
        fromEmail,
        fromName,
      });
      toast.success(t("email.savedToast"));
      setPassword("");
      setOpen(false);
    } catch (err) {
      toast.error(describeError(err, t("email.saveFailed")));
    }
  }

  async function onDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success(t("email.disconnectedToast"));
    } catch (err) {
      toast.error(describeError(err, t("email.saveFailed")));
    } finally {
      setConfirmDisconnect(false);
    }
  }

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" /> {t("email.settingsTitle")}
        </span>
      }
      description={t("email.desc")}
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Pill tone={status?.connected ? "success" : "neutral"}>
                {status?.connected ? t("common.connected") : t("common.notConnected")}
              </Pill>
              {status?.connected && (
                <p className="mt-2 text-xs text-subtle">
                  {status.fromName ? `${status.fromName} <${status.fromEmail}>` : status.fromEmail}{" "}
                  · {status.host}:{status.port}
                </p>
              )}
            </div>
            {status?.connected && (
              <button
                type="button"
                onClick={() => setConfirmDisconnect(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
              >
                {t("email.disconnect")}
              </button>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-subtle transition-colors hover:text-foreground"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")}
              />
              {status?.connected ? t("email.updateToggle") : t("email.setupToggle")}
            </button>
            {open && (
              <div className="mt-3 space-y-3">
                <p className="max-w-xl text-xs text-subtle">{t("email.setupDesc")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("email.fieldHost")}
                    </span>
                    <input
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="smtp.gmail.com"
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("email.fieldPort")}
                    </span>
                    <input
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="587"
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("email.fieldUsername")}
                    </span>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("email.fieldPassword")}
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={status?.connected ? t("email.fieldPasswordSaved") : undefined}
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("email.fieldFromEmail")}
                    </span>
                    <input
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("email.fieldFromName")}
                    </span>
                    <input
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={
                    save.isPending ||
                    !host.trim() ||
                    !username.trim() ||
                    !password.trim() ||
                    !fromEmail.trim()
                  }
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("common.save")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title={t("email.disconnectConfirmTitle")}
        description={t("email.disconnectConfirmDesc")}
        confirmLabel={t("email.disconnect")}
        onConfirm={() => void onDisconnect()}
      />
    </SectionCard>
  );
}

// Real WhatsApp Business messaging via Meta's own Cloud API -- unlike
// Telegram (one shared platform bot), every org connects its own WhatsApp
// Business number here. Same collapsed-form-once-connected UX as
// SmtpEmailCard/SmsProviderCard.
function WhatsAppBusinessCard() {
  const { t } = useI18n();
  const { data: status, isLoading } = useWhatsappStatus();
  const save = useSaveWhatsappCredentials();
  const disconnect = useDisconnectWhatsapp();
  const testConnection = useTestWhatsappConnection();
  const [open, setOpen] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/whatsapp/webhook` : "";

  async function copyWebhookUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 1500);
    } catch {
      toast.error(t("leadSources.copyFailed"));
    }
  }

  async function onSave() {
    try {
      await save.mutateAsync({ phoneNumberId, wabaId, accessToken });
      toast.success(t("whatsapp.savedToast"));
      setAccessToken("");
      setOpen(false);
    } catch (err) {
      toast.error(describeError(err, t("whatsapp.saveFailed")));
    }
  }

  async function onTest() {
    try {
      const result = await testConnection.mutateAsync();
      toast.success(
        result.displayPhoneNumber
          ? t("whatsapp.testSuccess", { number: result.displayPhoneNumber })
          : t("whatsapp.testSuccessGeneric"),
      );
    } catch (err) {
      toast.error(describeError(err, t("whatsapp.testFailed")));
    }
  }

  async function onDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success(t("whatsapp.disconnectedToast"));
    } catch (err) {
      toast.error(describeError(err, t("whatsapp.saveFailed")));
    } finally {
      setConfirmDisconnect(false);
    }
  }

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" /> {t("whatsapp.settingsTitle")}
        </span>
      }
      description={t("whatsapp.desc")}
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Pill tone={status?.connected ? "success" : "neutral"}>
                {status?.connected ? t("common.connected") : t("common.notConnected")}
              </Pill>
              {status?.connected && status.displayPhoneNumber && (
                <p className="mt-2 text-xs text-subtle">{status.displayPhoneNumber}</p>
              )}
            </div>
            {status?.connected && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void onTest()}
                  disabled={testConnection.isPending}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
                >
                  {testConnection.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("whatsapp.testButton")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                >
                  {t("whatsapp.disconnect")}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-subtle transition-colors hover:text-foreground"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")}
              />
              {status?.connected ? t("whatsapp.updateToggle") : t("whatsapp.setupToggle")}
            </button>
            {open && (
              <div className="mt-3 space-y-3">
                <p className="max-w-xl text-xs text-subtle">{t("whatsapp.setupDesc")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("whatsapp.fieldPhoneNumberId")}
                    </span>
                    <input
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("whatsapp.fieldWabaId")}
                    </span>
                    <input
                      value={wabaId}
                      onChange={(e) => setWabaId(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("whatsapp.fieldAccessToken")}
                    </span>
                    <input
                      type="password"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
                    />
                  </label>
                </div>

                <div className="rounded-xl border border-dashed border-border bg-surface p-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("whatsapp.webhookUrlLabel")}
                  </span>
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {webhookUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyWebhookUrl()}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {copiedWebhook ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-subtle">{t("whatsapp.webhookUrlHint")}</p>
                </div>

                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={save.isPending || !phoneNumberId.trim() || !accessToken.trim()}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("common.save")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title={t("whatsapp.disconnectConfirmTitle")}
        description={t("whatsapp.disconnectConfirmDesc")}
        confirmLabel={t("whatsapp.disconnect")}
        onConfirm={() => void onDisconnect()}
      />
    </SectionCard>
  );
}

// Real SMS sending via Eskiz.uz -- independent of the telephony providers
// above, so an org can be on OnlinePBX or Sipuni for calls and still route
// SMS through Eskiz specifically (the cheapest, most reliable option for
// Uzbek numbers, and the only one of the three with a real SMS API at
// all). Same collapsed-form-once-connected UX as SmtpEmailCard above.
function SmsProviderCard() {
  const { t } = useI18n();
  const { data: status, isLoading } = useSmsStatus();
  const save = useSaveSmsCredentials();
  const disconnect = useDisconnectSms();
  const testConnection = useTestSmsConnection();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [senderName, setSenderName] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function onSave() {
    try {
      await save.mutateAsync({ email, password, senderName });
      toast.success(t("sms.savedToast"));
      setPassword("");
      setOpen(false);
    } catch (err) {
      toast.error(describeError(err, t("sms.saveFailed")));
    }
  }

  async function onTest() {
    try {
      const result = await testConnection.mutateAsync();
      toast.success(
        result.balance != null
          ? t("sms.testSuccessBalance", { balance: String(result.balance) })
          : t("sms.testSuccess"),
      );
    } catch (err) {
      toast.error(describeError(err, t("sms.testFailed")));
    }
  }

  async function onDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success(t("sms.disconnectedToast"));
    } catch (err) {
      toast.error(describeError(err, t("sms.saveFailed")));
    } finally {
      setConfirmDisconnect(false);
    }
  }

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-primary" /> {t("sms.settingsTitle")}
        </span>
      }
      description={t("sms.desc")}
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Pill tone={status?.connected ? "success" : "neutral"}>
                {status?.connected ? t("common.connected") : t("common.notConnected")}
              </Pill>
              {status?.connected && (
                <p className="mt-2 text-xs text-subtle">
                  {status.email}
                  {status.senderName ? ` · ${status.senderName}` : ""}
                </p>
              )}
            </div>
            {status?.connected && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void onTest()}
                  disabled={testConnection.isPending}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
                >
                  {testConnection.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("sms.testButton")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                >
                  {t("sms.disconnect")}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-subtle transition-colors hover:text-foreground"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")}
              />
              {status?.connected ? t("sms.updateToggle") : t("sms.setupToggle")}
            </button>
            {open && (
              <div className="mt-3 space-y-3">
                <p className="max-w-xl text-xs text-subtle">{t("sms.setupDesc")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("sms.fieldEmail")}
                    </span>
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.uz"
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("sms.fieldPassword")}
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("sms.fieldSenderName")}
                    </span>
                    <input
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="4546"
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
                    />
                    <span className="mt-1 block text-[11px] text-subtle">
                      {t("sms.fieldSenderNameHint")}
                    </span>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={save.isPending || !email.trim() || !password.trim()}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("common.save")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title={t("sms.disconnectConfirmTitle")}
        description={t("sms.disconnectConfirmDesc")}
        confirmLabel={t("sms.disconnect")}
        onConfirm={() => void onDisconnect()}
      />
    </SectionCard>
  );
}

// Telephony (OnlinePBX click-to-call/SMS) already has its own full settings
// page (/admin/telephony) -- this is just a status summary + link, so it
// shows up alongside the other real integrations instead of only being
// reachable from the admin panel.
function TelephonyLinkCard() {
  const { t } = useI18n();
  const { data: statusMap, isLoading } = useTelephonyStatus();
  const connectedStatus = Object.values(statusMap ?? {}).find((s) => s?.connected);

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mint text-mint-foreground">
          <Phone className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{t("int.telephonyCardTitle")}</p>
          {isLoading ? (
            <p className="text-xs text-subtle">{t("common.loading")}</p>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <Pill tone={connectedStatus ? "success" : "neutral"}>
                {connectedStatus ? t("common.connected") : t("common.notConnected")}
              </Pill>
              {connectedStatus?.pbxDomain && (
                <span className="text-xs text-subtle">{connectedStatus.pbxDomain}</span>
              )}
            </div>
          )}
        </div>
      </div>
      <Link
        to="/admin/telephony"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
      >
        <Settings className="h-3.5 w-3.5" /> {t("int.telephonyCardManage")}
      </Link>
    </div>
  );
}

// Bitrix24 continuous sync -- an org's own admin generates an "inbound
// webhook" URL+token from their Bitrix24 portal (CRM -> Settings ->
// Developer resources -> Other -> Inbound webhook) and pastes it here; no
// OAuth app, no client secret, unlike AmoCrmCard above. Once connected, a
// pg_cron job (every 5 min) plus Bitrix24's own event.bind push keep deals,
// contacts and pipeline stages synced automatically -- same continuous-sync
// shape as AmoCRM, simpler auth. The one-time CSV import still exists at
// /onboarding/data-import for orgs that prefer a single migration instead.
export function Bitrix24Card() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: connectionStatus, isLoading } = useBitrix24ConnectionStatus();
  const { data: syncLog } = useBitrix24SyncLog();
  const connect = useConnectBitrix24();
  const disconnect = useDisconnectBitrix24();
  const sync = useTriggerBitrix24Sync();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const connected = !!connectionStatus;
  const [webhookUrl, setWebhookUrl] = useState("");

  return (
    <SectionCard title={t("bitrix24.settingsTitle")} description={t("bitrix24.desc")}>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Pill tone={connected ? "success" : "neutral"}>
                  {connected ? t("common.connected") : t("common.notConnected")}
                </Pill>
                {connected && connectionStatus.portal_domain && (
                  <span className="text-xs text-subtle">{connectionStatus.portal_domain}</span>
                )}
              </div>
              {connected && (
                <p className="mt-2 text-xs text-subtle">
                  {t("bitrix24.lastSync")}:{" "}
                  {connectionStatus.last_synced_at
                    ? new Date(connectionStatus.last_synced_at).toLocaleString()
                    : t("bitrix24.never")}
                </p>
              )}
              {isAdmin && connected && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                  </span>
                  {t("bitrix24.autoSyncActive")}
                </p>
              )}
              {!isAdmin && <p className="mt-2 text-xs text-subtle">{t("bitrix24.adminOnly")}</p>}
              {isAdmin && connectionStatus?.last_sync_error && (
                <p className="mt-2 max-w-md text-xs text-destructive">
                  {t("bitrix24.lastError")}: {connectionStatus.last_sync_error}
                </p>
              )}
            </div>

            {isAdmin && connected && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    sync.mutate(undefined, {
                      onSuccess: () => toast.success(t("bitrix24.syncStarted")),
                      onError: (err) =>
                        toast.error(err instanceof Error ? err.message : t("bitrix24.syncFailed")),
                    })
                  }
                  disabled={sync.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {sync.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {t("bitrix24.syncNow")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    disconnect.mutate(undefined, {
                      onSuccess: () => toast.success(t("bitrix24.disconnected")),
                      onError: (err) =>
                        toast.error(describeError(err, t("bitrix24.disconnectFailed"))),
                    })
                  }
                  disabled={disconnect.isPending}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
                >
                  {disconnect.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {t("bitrix24.disconnect")}
                </button>
              </div>
            )}
          </div>

          {isAdmin && !connected && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                connect.mutate(webhookUrl, {
                  onSuccess: () => {
                    toast.success(t("bitrix24.connected"));
                    setWebhookUrl("");
                  },
                  onError: (err) => toast.error(describeError(err, t("bitrix24.connectFailed"))),
                });
              }}
              className="space-y-2 rounded-xl border border-border p-4"
            >
              <label className="text-xs font-semibold text-foreground">
                {t("bitrix24.fieldWebhookUrl")}
              </label>
              <p className="text-xs text-subtle">{t("bitrix24.webhookHelp")}</p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="url"
                  required
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://your-portal.bitrix24.com/rest/1/xxxxxxxxxxxxxxxx/"
                  className="h-9 min-w-[280px] flex-1 rounded-lg border border-border bg-background px-3 text-xs text-foreground"
                />
                <button
                  type="submit"
                  disabled={connect.isPending || !webhookUrl.trim()}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {connect.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plug className="h-4 w-4" />
                  )}
                  {t("bitrix24.connect")}
                </button>
              </div>
            </form>
          )}

          {isAdmin && connected && <Bitrix24SyncHistory rows={syncLog} />}
        </div>
      )}
    </SectionCard>
  );
}

function Bitrix24SyncHistory({ rows }: { rows: Bitrix24SyncLogRow[] | undefined }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t("bitrix24.syncHistory")}</h3>
        <p className="text-xs text-subtle">{t("bitrix24.syncHistoryDesc")}</p>
      </div>
      {!rows || rows.length === 0 ? (
        <p className="text-xs text-subtle">{t("bitrix24.syncHistoryEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <Pill tone={row.trigger === "manual" ? "info" : "neutral"}>
                  {row.trigger === "manual"
                    ? t("bitrix24.triggerManual")
                    : row.trigger === "webhook"
                      ? t("bitrix24.triggerWebhook")
                      : t("bitrix24.triggerCron")}
                </Pill>
                <span className="text-subtle">{new Date(row.finished_at).toLocaleString()}</span>
              </div>
              {row.skipped ? (
                <Pill tone="warning">{t("bitrix24.syncSkipped")}</Pill>
              ) : row.error ? (
                <span className="max-w-xs truncate text-destructive" title={row.error}>
                  {row.error}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {t("bitrix24.syncResultSummary", { count: String(row.synced_count) })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IntegrationsPage() {
  const { t } = useI18n();
  const canManageIntegrations = usePermission("Manage integrations");
  const crmEnabled = useCrmEnabled();
  const [requested, setRequested] = useState<Requested[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<Catalog["category"] | "all">("all");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setRequested(raw ? (JSON.parse(raw) as Requested[]) : []);
    } catch {
      setRequested([]);
    }
    setHydrated(true);
  }, []);

  const persist = useCallback((next: Requested[]) => {
    setRequested(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const byId = useMemo(() => new Map(CATALOG.map((c) => [c.id, c])), []);
  const requestedIds = useMemo(() => new Set(requested.map((r) => r.id)), [requested]);
  const available = CATALOG.filter(
    (c) => !requestedIds.has(c.id) && (categoryFilter === "all" || c.category === categoryFilter),
  );

  function request(c: Catalog) {
    persist([...requested, { id: c.id, requestedAt: new Date().toISOString() }]);
    setOpen(false);
    toast.success(t("int.requestedToast", { name: c.name }));
  }

  function cancelRequest(id: string) {
    persist(requested.filter((r) => r.id !== id));
    toast.message(t("int.requestCancelledToast", { name: byId.get(id)?.name ?? id }));
  }

  return (
    <>
      <AdminBackLink />
      <PageHeader
        title={t("int.title")}
        description={t("int.description")}
        actions={
          canManageIntegrations && (
            <Link
              to="/onboarding/ai-setup"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
            >
              <Sparkles className="h-3.5 w-3.5" /> {t("aiOnboarding.navLink")}
            </Link>
          )
        }
      />

      <SectionCard title={t("int.workingTitle")} description={t("int.workingDesc")}>
        <div className="space-y-6">
          <PlanGate feature="integrations">
            <AmoCrmCard />
            <div className="mt-6">
              <Bitrix24Card />
            </div>
          </PlanGate>
          {/* Messengers, email, SMS, webhooks and telephony belong to the CRM
              module -- analytics-only companies just connect amoCRM/Bitrix24. */}
          {crmEnabled && canManageIntegrations && (
            <div className="grid gap-6 lg:grid-cols-2">
              <WhatsAppBusinessCard />
              <WebhookQuickCreateCard />
              <SmtpEmailCard />
              <SmsProviderCard />
            </div>
          )}
          {crmEnabled && (
            <PlanGate feature="telephony">
              <TelephonyLinkCard />
            </PlanGate>
          )}
        </div>
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title={t("int.catalogTitle")}
          description={t("int.catalogDesc")}
          actions={
            canManageIntegrations && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                {t("int.add")}
              </button>
            )
          }
        >
          {!hydrated ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : requested.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("int.none")}</p>
          ) : (
            <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {requested.map((item) => {
                const meta = byId.get(item.id);
                if (!meta) return null;
                return (
                  <li key={item.id} className="surface-card flex flex-col gap-4 p-6">
                    <div className="flex items-start gap-4">
                      <IntegrationLogo id={meta.id} name={meta.name} color={meta.color} size="lg" />
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-foreground">
                          {meta.name}
                        </p>
                        <p className="text-xs text-subtle">{t(`int.category.${meta.category}`)}</p>
                      </div>
                      <span className="ml-auto">
                        <Pill tone="warning">{t("int.requested")}</Pill>
                      </span>
                    </div>

                    <p className="text-sm leading-relaxed text-muted-foreground">{t(meta.blurb)}</p>

                    <p className="text-[11px] text-subtle">
                      {t("int.requestedAt")}: {new Date(item.requestedAt).toLocaleDateString()}
                    </p>

                    {canManageIntegrations && (
                      <button
                        type="button"
                        onClick={() => cancelRequest(item.id)}
                        className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t("int.cancelRequest")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-primary" />
              {t("int.add")}
            </DialogTitle>
            <DialogDescription>{t("int.addDesc")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-1.5">
            {(["all", "crm", "messaging", "data", "ai", "other"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                  categoryFilter === cat
                    ? "border-primary/40 bg-mint text-mint-foreground"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {cat === "all" ? t("int.categoryAll") : t(`int.category.${cat}`)}
              </button>
            ))}
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {available.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => request(c)}
                  className="flex w-full items-start gap-4 rounded-2xl border border-border p-5 text-left transition-colors hover:border-primary/40 hover:bg-surface"
                >
                  <IntegrationLogo id={c.id} name={c.name} color={c.color} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {c.name}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-subtle">
                      {t(c.blurb)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {available.length === 0 && <li className="text-sm text-muted-foreground">—</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
