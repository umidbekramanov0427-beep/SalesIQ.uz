import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { useErrorLogsRaw, useResolveErrorLog } from "@/hooks/use-crm-data";

export const Route = createFileRoute("/platform/errors")({
  head: () => ({
    meta: [{ title: "Errors — SalesIQ" }],
  }),
  component: PlatformErrorsPage,
});

function PlatformErrorsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: errors, isLoading } = useErrorLogsRaw({ orderBy: "created_at", ascending: false });
  const resolveError = useResolveErrorLog();

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

  async function toggle(id: string, resolved: boolean) {
    try {
      await resolveError.mutateAsync({ id, patch: { resolved: !resolved } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("platform.errorUpdateFailed"));
    }
  }

  return (
    <>
      <PageHeader
        icon={AlertTriangle}
        tone="rose"
        title={t("platform.errorsTitle")}
        description={t("platform.errorsDesc")}
      />

      <SectionCard icon={AlertTriangle} tone="rose" title={t("platform.errorsTitle")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !errors?.length ? (
          <p className="flex items-center gap-2 text-sm text-subtle">
            <AlertTriangle className="h-4 w-4" /> {t("platform.noErrors")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {errors.map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{e.message}</p>
                  <p className="truncate text-xs text-subtle">
                    {e.source}
                    {e.route && ` · ${e.route}`} · {timeAgo(e.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggle(e.id, e.resolved)}
                  className="shrink-0"
                >
                  <Pill tone={e.resolved ? "success" : "danger"}>
                    {e.resolved ? t("platform.resolved") : t("platform.unresolved")}
                  </Pill>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
