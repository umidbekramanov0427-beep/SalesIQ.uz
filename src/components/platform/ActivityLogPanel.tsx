import { History } from "lucide-react";
import { SectionCard, Pill } from "@/components/layout/Primitives";
import { useI18n } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { useAllAuditLogs } from "@/hooks/use-crm-data";

const ACTION_TONE = {
  insert: "success",
  update: "info",
  delete: "danger",
} as const;

// Every company's data changes (audit_logs), newest first -- a tab of the
// Tashriflar report, next to the visits those changes were made in.
export function ActivityLogPanel() {
  const { t } = useI18n();
  const { data: logs, isLoading } = useAllAuditLogs();

  return (
    <SectionCard
      icon={History}
      tone="amber"
      title={t("platform.activityTitle")}
      description={t("platform.activityDesc")}
    >
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
  );
}
