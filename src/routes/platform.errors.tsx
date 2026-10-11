import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, MonitorX, ServerCrash, ShieldAlert, Timer } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill, StatCard } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import { useErrorLogsRaw, useResolveErrorLog } from "@/hooks/use-crm-data";

export const Route = createFileRoute("/platform/errors")({
  head: () => ({
    meta: [{ title: "Errors — SalesIQ" }],
  }),
  component: PlatformErrorsPage,
});

const FILTERS = ["all", "server_error", "slow_request", "client"] as const;
type Filter = (typeof FILTERS)[number];

function kindOf(source: string): "server_error" | "slow_request" | "client" {
  return source === "server_error" || source === "slow_request" ? source : "client";
}

function PlatformErrorsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: errors, isLoading } = useErrorLogsRaw({ orderBy: "created_at", ascending: false });
  const resolveError = useResolveErrorLog();
  const [filter, setFilter] = useState<Filter>("all");

  // Last 24 hours, per kind: server errors and slow requests come from
  // src/server.ts (lib/monitoring.server.ts); everything else is the
  // browser's own error handlers.
  const counts = useMemo(() => {
    const since = Date.now() - 24 * 60 * 60_000;
    const c = { server_error: 0, slow_request: 0, client: 0 };
    for (const e of errors ?? []) {
      if (new Date(e.created_at).getTime() < since) continue;
      c[kindOf(e.source)]++;
    }
    return c;
  }, [errors]);
  const shown = (errors ?? []).filter((e) => filter === "all" || kindOf(e.source) === filter);

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

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t("monitoring.serverErrors24h")}
          value={String(counts.server_error)}
          icon={ServerCrash}
          iconTone="rose"
          {...(counts.server_error > 0 ? { tone: "danger" as const } : {})}
        />
        <StatCard
          label={t("monitoring.slowRequests24h")}
          value={String(counts.slow_request)}
          icon={Timer}
          iconTone="amber"
        />
        <StatCard
          label={t("monitoring.clientErrors24h")}
          value={String(counts.client)}
          icon={MonitorX}
          iconTone="sky"
        />
      </div>

      <SectionCard
        icon={AlertTriangle}
        tone="rose"
        title={t("platform.errorsTitle")}
        description={t("monitoring.desc")}
        actions={
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "h-8 rounded-lg px-3 text-xs font-semibold transition-colors",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {t(`monitoring.filter.${f}`)}
              </button>
            ))}
          </div>
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !shown.length ? (
          <p className="flex items-center gap-2 text-sm text-subtle">
            <AlertTriangle className="h-4 w-4" /> {t("platform.noErrors")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((e) => {
              const ctx = (e.context ?? {}) as { status?: number; durationMs?: number };
              const kind = kindOf(e.source);
              return (
                <li key={e.id} className="flex items-start gap-3 py-3">
                  <span
                    className={cn(
                      "mt-0.5 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold",
                      kind === "server_error" && "bg-rose-500/12 text-rose-600 dark:text-rose-400",
                      kind === "slow_request" &&
                        "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                      kind === "client" && "bg-sky-500/12 text-sky-600 dark:text-sky-400",
                    )}
                  >
                    {kind === "server_error"
                      ? (ctx.status ?? 500)
                      : kind === "slow_request"
                        ? `${((ctx.durationMs ?? 0) / 1000).toFixed(1)}s`
                        : "JS"}
                  </span>
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
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
