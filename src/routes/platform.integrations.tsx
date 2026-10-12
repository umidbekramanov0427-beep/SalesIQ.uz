import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Loader2, Plug, ShieldAlert, Unplug } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, timeAgo } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  useAllAmoConnections,
  useOrganizations,
  usePlatformDisconnectAmoCrm,
  usePlatformSetAmoCrmCredentials,
  type OrganizationRow,
  type OwnerAmoConnectionRow,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/platform/integrations")({
  // ?org=<id> opens with that company's card first (from its company page).
  validateSearch: (search: Record<string, unknown>): { org?: string } =>
    typeof search["org"] === "string" ? { org: search["org"] } : {},
  head: () => ({
    meta: [{ title: "Integrations — SalesIQ" }],
  }),
  component: PlatformIntegrationsPage,
});

function PlatformIntegrationsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: orgs, isLoading: orgsLoading, error: orgsError } = useOrganizations();
  const {
    data: connections,
    isLoading: connectionsLoading,
    error: connectionsError,
  } = useAllAmoConnections();

  if (user && user.role !== "platform_owner") {
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

  const isLoading = orgsLoading || connectionsLoading;
  const connectionByOrg = new Map((connections ?? []).map((c) => [c.organization_id, c]));

  return (
    <>
      <PageHeader
        icon={Plug}
        tone="sky"
        title={t("platform.integrationsTitle")}
        description={t("platform.integrationsDesc")}
      />

      <SectionCard icon={Plug} tone="sky" title={t("platform.integrationsTitle")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : orgsError || connectionsError ? (
          <p className="text-sm text-destructive">
            {t("platform.loadFailed")}:{" "}
            {(orgsError ?? connectionsError) instanceof Error
              ? (orgsError ?? connectionsError)!.message
              : String(orgsError ?? connectionsError)}
          </p>
        ) : !orgs?.length ? (
          <p className="flex items-center gap-2 text-sm text-subtle">
            <Plug className="h-4 w-4" /> {t("platform.noOrgs")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {orgs.map((org) => (
              <CompanyIntegrationRow key={org.id} org={org} conn={connectionByOrg.get(org.id)} />
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

function CompanyIntegrationRow({
  org,
  conn,
}: {
  org: OrganizationRow;
  conn: OwnerAmoConnectionRow | undefined;
}) {
  const { t } = useI18n();
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const setCredentials = usePlatformSetAmoCrmCredentials();
  const disconnect = usePlatformDisconnectAmoCrm();

  async function saveCredentialsAndConnect() {
    if (!clientId.trim() || !clientSecret.trim()) return;
    try {
      await setCredentials.mutateAsync({ organizationId: org.id, clientId, clientSecret });
      toast.success(t("amocrm.credentialsSaved"));
      setClientSecret("");
      await connect();
    } catch (err) {
      toast.error(describeError(err, t("amocrm.credentialsSaveFailed")));
    }
  }

  async function connect() {
    setConnecting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      window.location.href = `/integrations/amocrm/connect?token=${encodeURIComponent(token)}&org=${encodeURIComponent(org.id)}`;
    } finally {
      setConnecting(false);
    }
  }

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{org.name}</p>
          {conn ? (
            <p className="truncate text-xs text-subtle">
              {conn.subdomain}
              {conn.last_synced_at &&
                ` · ${t("platform.lastSynced")}: ${timeAgo(conn.last_synced_at)}`}
            </p>
          ) : (
            <p className="truncate text-xs text-subtle">{t("platform.notConnected")}</p>
          )}
        </div>
        <Pill tone={conn ? (conn.last_sync_error ? "danger" : "success") : "neutral"}>
          {conn
            ? conn.last_sync_error
              ? t("platform.syncError")
              : t("platform.connected")
            : t("platform.notConnected")}
        </Pill>
        {conn ? (
          <button
            type="button"
            onClick={() => setConfirmingDisconnect(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            <Unplug className="h-4 w-4" />
            {t("amocrmImport.disconnect")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCredentialsOpen((v) => !v)}
            disabled={connecting}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {connecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            {t("amocrm.connect")}
          </button>
        )}
      </div>

      {!conn && credentialsOpen && (
        <div className="mt-3 rounded-xl border border-border bg-accent/40 p-3">
          <button
            type="button"
            onClick={() => setCredentialsOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-subtle transition-colors hover:text-foreground"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform")} />
            {t("amocrm.ownIntegrationToggle")}
          </button>
          <p className="mt-2 max-w-xl text-xs text-subtle">{t("amocrm.ownIntegrationDesc")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                {t("amocrm.fieldClientId")}
              </span>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={t("amocrm.fieldClientIdPlaceholder")}
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
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
                placeholder={t("amocrm.fieldClientSecret")}
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void saveCredentialsAndConnect()}
            disabled={
              setCredentials.isPending || connecting || !clientId.trim() || !clientSecret.trim()
            }
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {(setCredentials.isPending || connecting) && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            {t("amocrm.connect")}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmingDisconnect}
        onOpenChange={setConfirmingDisconnect}
        title={t("amocrmImport.disconnectConfirmTitle")}
        description={t("amocrmImport.disconnectConfirmDesc")}
        confirmLabel={t("amocrmImport.disconnect")}
        onConfirm={() =>
          disconnect.mutate(org.id, {
            onSuccess: () => toast.success(t("amocrmImport.disconnected")),
            onError: (err) => toast.error(describeError(err, t("amocrmImport.disconnectFailed"))),
          })
        }
      />
    </li>
  );
}
