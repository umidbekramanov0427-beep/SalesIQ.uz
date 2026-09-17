import { createFileRoute } from "@tanstack/react-router";
import { Plug, ShieldAlert } from "lucide-react";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { useAllAmoConnections, useOrganizations } from "@/hooks/use-crm-data";

export const Route = createFileRoute("/platform/integrations")({
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
      <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
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
        title={t("platform.integrationsTitle")}
        description={t("platform.integrationsDesc")}
      />

      <SectionCard title={t("platform.integrationsTitle")}>
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
            {orgs.map((org) => {
              const conn = connectionByOrg.get(org.id);
              return (
                <li key={org.id} className="flex items-center gap-3 py-3">
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
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
