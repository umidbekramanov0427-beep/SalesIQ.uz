import { useMemo, useState } from "react";
import { OwnerHeader, OwnerStat } from "@/components/owner/OwnerPage";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardPlus,
  Layers,
  Loader2,
  MonitorX,
  ServerCrash,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import { groupErrors, kindOf, type ErrorGroup, type ErrorKind } from "@/lib/error-groups";
import { useCompanyDirectory, useErrorLogsRaw, useResolveErrorLog } from "@/hooks/use-crm-data";

// Platforma -> Xatoliklar: the same error seen many times is one row (how
// often, in how many companies, first / last time, how many still open --
// lib/error-groups.ts). Filter by kind, company and open-only; open a row
// for each occurrence; mark a whole group fixed; turn it into an issue on
// the company's lead card in Arizalar.

export const Route = createFileRoute("/platform/errors")({
  head: () => ({
    meta: [{ title: "Errors — SalesIQ" }],
  }),
  component: PlatformErrorsPage,
});

const FILTERS = ["all", "server_error", "slow_request", "client"] as const;
type Filter = (typeof FILTERS)[number];

const BADGE: Record<ErrorKind, string> = {
  server_error: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  slow_request: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  client: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
};

function badgeText(g: ErrorGroup) {
  const ctx = (g.items[0]?.context ?? {}) as { status?: number; durationMs?: number };
  return g.kind === "server_error"
    ? String(ctx.status ?? 500)
    : g.kind === "slow_request"
      ? `${((ctx.durationMs ?? 0) / 1000).toFixed(1)}s`
      : "JS";
}

function PlatformErrorsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: errors, isLoading } = useErrorLogsRaw({ orderBy: "created_at", ascending: false });
  const { data: dir } = useCompanyDirectory();
  const resolveError = useResolveErrorLog();
  const [filter, setFilter] = useState<Filter>("all");
  const [org, setOrg] = useState<string>("");
  const [openOnly, setOpenOnly] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const orgName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of dir?.companies ?? []) m.set(c.id, c.name);
    return m;
  }, [dir]);

  // Last 24 hours, per kind.
  const counts = useMemo(() => {
    const since = Date.now() - 24 * 60 * 60_000;
    const c = { server_error: 0, slow_request: 0, client: 0 };
    for (const e of errors ?? []) {
      if (new Date(e.created_at).getTime() < since) continue;
      c[kindOf(e.source)]++;
    }
    return c;
  }, [errors]);

  const groups = useMemo(() => {
    const rows = (errors ?? []).filter(
      (e) =>
        (filter === "all" || kindOf(e.source) === filter) && (!org || e.organization_id === org),
    );
    const all = groupErrors(rows);
    return openOnly ? all.filter((g) => g.open > 0) : all;
  }, [errors, filter, org, openOnly]);

  // Companies that ran into errors, most errors first (for the filter).
  const errorOrgs = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of errors ?? [])
      if (e.organization_id) n.set(e.organization_id, (n.get(e.organization_id) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]);
  }, [errors]);

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

  async function resolveGroup(g: ErrorGroup, resolved: boolean) {
    setBusy(`r:${g.key}`);
    try {
      const ids = g.items.filter((e) => e.resolved !== resolved).map((e) => e.id);
      for (let i = 0; i < ids.length; i += 20)
        await Promise.all(
          ids.slice(i, i + 20).map((id) => resolveError.mutateAsync({ id, patch: { resolved } })),
        );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("platform.errorUpdateFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function toIssue(g: ErrorGroup) {
    const sample = g.items.find((e) => e.organization_id);
    if (!sample) return;
    setBusy(`i:${g.key}`);
    try {
      const res = await apiFetch("/platform/applications-api", {
        method: "POST",
        body: JSON.stringify({ action: "issueFromError", errorId: sample.id, count: g.count }),
      });
      const json = (await res.json().catch(() => ({}))) as { appId?: string; error?: string };
      if (!res.ok || !json.appId) throw new Error(json.error ?? t("errs.issueFailed"));
      toast.success(t("errs.issueDone"));
      void navigate({ to: "/platform/applications/$appId", params: { appId: json.appId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errs.issueFailed"));
    } finally {
      setBusy(null);
    }
  }

  const select =
    "h-10 min-w-[200px] rounded-xl border border-border bg-card px-3 text-[13.5px] text-foreground";

  return (
    <>
      <OwnerHeader
        icon={AlertTriangle}
        title={t("platform.errorsTitle")}
        desc={t("platform.errorsDesc")}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <OwnerStat
          label={t("monitoring.serverErrors24h")}
          tipKey="monitoring.serverErrors24h"
          value={String(counts.server_error)}
          icon={ServerCrash}
          tone="rose"
        />
        <OwnerStat
          label={t("monitoring.slowRequests24h")}
          tipKey="monitoring.slowRequests24h"
          value={String(counts.slow_request)}
          icon={Timer}
          tone="amber"
        />
        <OwnerStat
          label={t("monitoring.clientErrors24h")}
          tipKey="monitoring.clientErrors24h"
          value={String(counts.client)}
          icon={MonitorX}
          tone="blue"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ value: f, label: t(`monitoring.filter.${f}`) }))}
        />
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <select value={org} onChange={(e) => setOrg(e.target.value)} className={select}>
            <option value="">{t("errs.allCompanies")}</option>
            {errorOrgs.map(([id, n]) => (
              <option key={id} value={id}>
                {orgName.get(id) ?? id.slice(0, 8)} · {n}
              </option>
            ))}
          </select>
        </label>
        <Segmented
          value={openOnly ? "open" : "all"}
          onChange={(v) => setOpenOnly(v === "open")}
          options={[
            { value: "open", label: t("errs.openOnly") },
            { value: "all", label: t("errs.showAll") },
          ]}
        />
      </div>

      <SectionCard
        icon={Layers}
        tone="rose"
        title={t("errs.groups", { n: groups.length })}
        description={t("errs.groupsDesc")}
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !groups.length ? (
          <p className="flex items-center gap-2 py-6 text-sm text-subtle">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t("platform.noErrors")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {groups.map((g) => {
              const open = expanded === g.key;
              return (
                <li key={g.key} className="py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 min-w-[44px] rounded-md px-1.5 py-1 text-center font-mono text-[11px] font-semibold",
                        BADGE[g.kind],
                      )}
                    >
                      {badgeText(g)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : g.key)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="line-clamp-2 text-[14px] font-semibold text-foreground">
                        {g.message}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {t("errs.times", { n: g.count })}
                        </span>
                        {g.orgs.length > 0 && (
                          <span>{t("errs.companies", { n: g.orgs.length })}</span>
                        )}
                        {g.route && <span className="font-mono text-[11.5px]">{g.route}</span>}
                        <span>
                          {t("errs.lastSeen")}: {timeAgo(g.last)}
                        </span>
                        {g.count > 1 && (
                          <span>
                            {t("errs.firstSeen")}: {timeAgo(g.first)}
                          </span>
                        )}
                        <ChevronDown
                          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
                        />
                      </p>
                    </button>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {g.orgs.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => void toIssue(g)}
                          title={t("errs.toIssueHint")}
                        >
                          {busy === `i:${g.key}` ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <ClipboardPlus />
                          )}
                          {t("errs.toIssue")}
                        </Button>
                      )}
                      <Button
                        variant={g.open > 0 ? "default" : "outline"}
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => void resolveGroup(g, g.open > 0)}
                      >
                        {busy === `r:${g.key}` ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <CheckCircle2 />
                        )}
                        {g.open > 0
                          ? g.open === g.count
                            ? t("errs.resolve")
                            : t("errs.resolveN", { n: g.open })
                          : t("errs.reopen")}
                      </Button>
                    </div>
                  </div>
                  {open && (
                    <ul className="ml-[56px] mt-3 space-y-1.5 rounded-xl border border-border bg-muted/40 p-3 text-[12.5px]">
                      {g.items.slice(0, 50).map((e) => (
                        <li key={e.id} className="flex flex-wrap items-baseline gap-x-3">
                          <span className="w-[120px] shrink-0 tabular-nums text-muted-foreground">
                            {new Date(e.created_at).toLocaleString("ru-RU", {
                              timeZone: "Asia/Tashkent",
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="font-semibold text-foreground">
                            {e.organization_id
                              ? (orgName.get(e.organization_id) ?? e.organization_id.slice(0, 8))
                              : t("errs.noCompany")}
                          </span>
                          {e.route && (
                            <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                              {e.route}
                            </span>
                          )}
                          {e.resolved && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {t("platform.resolved")}
                            </span>
                          )}
                        </li>
                      ))}
                      {g.items.length > 50 && (
                        <li className="text-muted-foreground">
                          {t("errs.more", { n: g.items.length - 50 })}
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
