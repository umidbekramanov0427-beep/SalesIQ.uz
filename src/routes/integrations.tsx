import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ClipboardList, Loader2, Plug, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, StatCard, Pill } from "@/components/layout/Primitives";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  useAmoConnectionStatus,
  useIntegrationSetting,
  usePermission,
  usePipelineStagesRaw,
  useSetAmoCrmCredentials,
  useTriggerAmoCrmSync,
} from "@/hooks/use-crm-data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    id: "telegram",
    name: "Telegram",
    category: "messaging",
    blurb: "int.blurb.telegram",
    color: "#229ED9",
  },
  {
    id: "telegram-bot",
    name: "Telegram Bot",
    category: "messaging",
    blurb: "int.blurb.telegramBot",
    color: "#0088CC",
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
    id: "sms-provider",
    name: "SMS Provider",
    category: "messaging",
    blurb: "int.blurb.smsProvider",
    color: "#F97316",
  },
  {
    id: "telephony",
    name: "Telephony",
    category: "other",
    blurb: "int.blurb.telephony",
    color: "#0EA5E9",
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "messaging",
    blurb: "int.blurb.gmail",
    color: "#EA4335",
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
    id: "webhooks",
    name: "Webhooks",
    category: "other",
    blurb: "int.blurb.webhooks",
    color: "#64748B",
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

type Installed = { id: string; active: boolean; addedAt: string; lastSync: string | null };

const STORAGE_KEY = "salesos.integrations";

const DEFAULTS: Installed[] = [
  {
    id: "telegram",
    active: true,
    addedAt: new Date().toISOString(),
    lastSync: new Date().toISOString(),
  },
  {
    id: "openai",
    active: true,
    addedAt: new Date().toISOString(),
    lastSync: new Date().toISOString(),
  },
  { id: "whatsapp", active: false, addedAt: new Date().toISOString(), lastSync: null },
];

// AmoCRM's private integrations are created inside one specific account and
// can't be installed from a different one -- a platform running several
// companies, each on their own AmoCRM account, needs to store each org's own
// client_id/secret. Most orgs never touch this (the platform-wide default
// keeps working), so it's collapsed behind a toggle instead of always shown.
function AmoCrmCredentialsForm({ currentClientId }: { currentClientId?: string | undefined }) {
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
      toast.success(t("amocrm.credentialsSaved"));
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
        {t("amocrm.ownIntegrationToggle")}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="max-w-xl text-xs text-subtle">{t("amocrm.ownIntegrationDesc")}</p>
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
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !clientId.trim() || !clientSecret.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("common.save")}
          </button>
        </div>
      )}
    </div>
  );
}

function AmoCrmCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: setting, isLoading } = useIntegrationSetting("amocrm");
  const { data: connectionStatus } = useAmoConnectionStatus();
  const { data: stages } = usePipelineStagesRaw();
  const sync = useTriggerAmoCrmSync();
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
    <SectionCard
      title={t("amocrm.settingsTitle")}
      description={t("amocrm.desc")}
      actions={
        isAdmin && (
          <Link
            to="/integrations/amocrm-checklist"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
          >
            <ClipboardList className="h-3.5 w-3.5" /> {t("amocrmChecklist.linkButton")}
          </Link>
        )
      }
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <div className="space-y-6">
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

          {isAdmin && !connected && <AmoCrmCredentialsForm currentClientId={config.client_id} />}

          {connected && (
            <div className="grid gap-4 sm:grid-cols-3">
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
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function IntegrationsPage() {
  const { t } = useI18n();
  const canManageIntegrations = usePermission("Manage integrations");
  const [installed, setInstalled] = useState<Installed[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setInstalled(raw ? (JSON.parse(raw) as Installed[]) : DEFAULTS);
    } catch {
      setInstalled(DEFAULTS);
    }
    setHydrated(true);
  }, []);

  const persist = useCallback((next: Installed[]) => {
    setInstalled(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const byId = useMemo(() => new Map(CATALOG.map((c) => [c.id, c])), []);
  const available = CATALOG.filter((c) => !installed.some((i) => i.id === c.id));

  function add(c: Catalog) {
    persist([
      ...installed,
      {
        id: c.id,
        active: true,
        addedAt: new Date().toISOString(),
        lastSync: new Date().toISOString(),
      },
    ]);
    setOpen(false);
    toast.success(t("int.connectedToast", { name: c.name }));
  }

  function toggle(id: string) {
    const item = installed.find((i) => i.id === id);
    if (!item) return;
    const active = !item.active;
    persist(
      installed.map((i) =>
        i.id === id
          ? { ...i, active, lastSync: active ? new Date().toISOString() : i.lastSync }
          : i,
      ),
    );
    const name = byId.get(id)?.name ?? id;
    toast[active ? "success" : "message"](
      t(active ? "int.connectedToast" : "int.disconnectedToast", { name }),
    );
  }

  function remove(id: string) {
    persist(installed.filter((i) => i.id !== id));
    toast.message(t("int.removedToast", { name: byId.get(id)?.name ?? id }));
  }

  return (
    <>
      <PageHeader
        title={t("int.title")}
        description={t("int.description")}
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
      />

      <div className="mb-6">
        <AmoCrmCard />
      </div>

      <SectionCard
        title={t("int.connected")}
        description={`${installed.filter((i) => i.active).length} / ${installed.length}`}
      >
        {!hydrated ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : installed.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("int.none")}</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {installed.map((item) => {
              const meta = byId.get(item.id);
              if (!meta) return null;
              return (
                <li key={item.id} className="surface-card flex flex-col gap-4 p-5">
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                      style={{ backgroundColor: meta.color }}
                      aria-hidden
                    >
                      {meta.name[0]}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{meta.name}</p>
                      <p className="text-[11px] text-subtle">
                        {t(`int.category.${meta.category}`)}
                      </p>
                    </div>
                    <span className="ml-auto">
                      <Pill tone={item.active ? "success" : "danger"}>
                        {item.active ? t("common.active") : t("common.inactive")}
                      </Pill>
                    </span>
                  </div>

                  <p className="text-xs leading-relaxed text-muted-foreground">{t(meta.blurb)}</p>

                  <p className="text-[11px] text-subtle">
                    {t("int.lastSync")}:{" "}
                    {item.lastSync ? new Date(item.lastSync).toLocaleString() : t("int.never")}
                  </p>

                  {canManageIntegrations && (
                    <div className="mt-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggle(item.id)}
                        className={cn(
                          "flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                          item.active
                            ? "border border-border bg-surface text-muted-foreground hover:bg-accent"
                            : "bg-primary text-primary-foreground hover:opacity-90",
                        )}
                      >
                        {item.active ? t("common.disconnect") : t("common.connect")}
                      </button>
                      <button
                        type="button"
                        aria-label={t("int.remove")}
                        onClick={() => remove(item.id)}
                        className="rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-primary" />
              {t("int.add")}
            </DialogTitle>
            <DialogDescription>{t("int.addDesc")}</DialogDescription>
          </DialogHeader>

          <ul className="grid gap-3 sm:grid-cols-2">
            {available.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => add(c)}
                  className="flex w-full items-start gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary/40 hover:bg-surface"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: c.color }}
                    aria-hidden
                  >
                    {c.name[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {c.name}
                    </span>
                    <span className="block text-[11px] text-subtle">{t(c.blurb)}</span>
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
