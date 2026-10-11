import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertOctagon, AlertTriangle, Check, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Pill, SectionCard } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, timeAgo } from "@/lib/utils";
import { useErrorLogsRaw, useResolveErrorLog, type ErrorLogRow } from "@/hooks/use-crm-data";

// Errors caught in this company's own pages and syncs, newest first.
export const Route = createFileRoute("/admin/errors")({
  head: () => ({ meta: [{ title: "Errors — SalesIQ" }] }),
  component: () => (
    <>
      <AdminBackLink />
      <ErrorLogsSection />
    </>
  ),
});

function ErrorLogRowItem({ log }: { log: ErrorLogRow }) {
  const { t } = useI18n();
  const resolveLog = useResolveErrorLog();
  const [expanded, setExpanded] = useState(false);

  async function onResolve() {
    try {
      await resolveLog.mutateAsync({ id: log.id, patch: { resolved: true } });
    } catch (err) {
      toast.error(describeError(err, t("admin.errors.resolveFailed")));
    }
  }

  return (
    <li
      className={cn(
        "rounded-xl border px-4 py-3",
        log.resolved ? "border-border bg-surface" : "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-subtle transition-transform",
              expanded && "rotate-180",
            )}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{log.message}</p>
            <p className="mt-1 text-xs text-subtle">
              {log.source} · {log.route ?? "—"} · {timeAgo(log.created_at)}
            </p>
          </div>
        </button>
        {!log.resolved && (
          <button
            onClick={onResolve}
            disabled={resolveLog.isPending}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
          >
            {resolveLog.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {t("admin.errors.resolve")}
          </button>
        )}
      </div>
      {expanded && log.stack && (
        <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-background p-3 text-xs text-muted-foreground">
          {log.stack}
        </pre>
      )}
    </li>
  );
}

function ErrorLogsSection() {
  const { t } = useI18n();
  const { data: logs, isLoading } = useErrorLogsRaw();
  const [showResolved, setShowResolved] = useState(false);

  const rows = logs ?? [];
  const unresolved = rows.filter((l) => !l.resolved);
  const visible = showResolved ? rows : unresolved;

  return (
    <SectionCard
      icon={AlertTriangle}
      tone="rose"
      title={t("admin.errors.title")}
      description={t("admin.errors.desc")}
      actions={
        <div className="flex items-center gap-2">
          <Pill tone={unresolved.length > 0 ? "danger" : "success"}>
            {t("admin.errors.unresolvedCount", { count: unresolved.length })}
          </Pill>
          <button
            onClick={() => setShowResolved((s) => !s)}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-accent"
          >
            {showResolved ? t("admin.errors.hideResolved") : t("admin.errors.showAll")}
          </button>
        </div>
      }
    >
      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}
      {!isLoading && visible.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
          <AlertOctagon className="mx-auto h-5 w-5 text-success" />
          <p className="mx-auto">{t("admin.errors.none")}</p>
        </div>
      )}
      <ul className="space-y-2">
        {visible.slice(0, 50).map((log) => (
          <ErrorLogRowItem key={log.id} log={log} />
        ))}
      </ul>
    </SectionCard>
  );
}
