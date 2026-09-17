import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Bell, Building2, ShieldAlert } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { useErrorLogsRaw, useOrganizations } from "@/hooks/use-crm-data";

const NEW_ORG_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const Route = createFileRoute("/platform/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — SalesIQ" }],
  }),
  component: PlatformNotificationsPage,
});

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
    </>
  );
}
