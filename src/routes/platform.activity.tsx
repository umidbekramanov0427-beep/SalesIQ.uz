import { createFileRoute } from "@tanstack/react-router";
import { History, ShieldAlert } from "lucide-react";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { useAllAuditLogs } from "@/hooks/use-crm-data";

const ACTION_TONE = {
  insert: "success",
  update: "info",
  delete: "danger",
} as const;

export const Route = createFileRoute("/platform/activity")({
  head: () => ({
    meta: [{ title: "Activity Log — SalesIQ" }],
  }),
  component: PlatformActivityPage,
});

function PlatformActivityPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: logs, isLoading } = useAllAuditLogs();

  if (user && user.role !== "platform_owner") {
    return (
      <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  return (
    <>
      <PageHeader title={t("platform.activityTitle")} description={t("platform.activityDesc")} />

      <SectionCard title={t("platform.activityTitle")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !logs?.length ? (
          <p className="flex items-center gap-2 text-sm text-subtle">
            <History className="h-4 w-4" /> {t("history.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {log.organizations?.name ?? "—"} · {t(`history.entity.${log.entity_type}`)}{" "}
                    {t(`history.action.${log.action}`)}
                  </p>
                  <p className="truncate text-xs text-subtle">{timeAgo(log.created_at)}</p>
                </div>
                <Pill tone={ACTION_TONE[log.action as keyof typeof ACTION_TONE] ?? "neutral"}>
                  {log.action}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
