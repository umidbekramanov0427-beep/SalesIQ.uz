import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Circle,
  ClipboardList,
  Copy,
  Loader2,
  Plug,
  RefreshCw,
  ShieldAlert,
  Unplug,
  Users,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError } from "@/lib/utils";
import {
  useAmoCatalog,
  useAmoConnectionStatus,
  useDisconnectAmoCrm,
  useSaveAmoImportSettings,
  useTriggerAmoCrmSync,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/admin/amocrm-import")({
  head: () => ({
    meta: [
      { title: "AmoCRM Integratsiyasi sozlamalar — SalesIQ" },
      {
        name: "description",
        content: "AmoCRM'dan qaysi voronkalar va operatorlar sinxronlanishini tanlang.",
      },
    ],
  }),
  component: AmoImportSettingsPage,
});

function ConnectionHeader() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: status } = useAmoConnectionStatus();
  const sync = useTriggerAmoCrmSync();
  const disconnect = useDisconnectAmoCrm();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [copied, setCopied] = useState(false);
  const [callsDebug, setCallsDebug] = useState<string | null>(null);
  const [callsDebugLoading, setCallsDebugLoading] = useState(false);

  // Temporary diagnostic: "0 calls" can mean the sync is broken, or that
  // this AmoCRM account's telephony genuinely never posts call_in/call_out
  // notes -- hits AmoCRM directly to tell the two apart instead of guessing.
  async function runCallsDebug() {
    setCallsDebugLoading(true);
    setCallsDebug(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch(
        `/integrations/amocrm/connect?token=${encodeURIComponent(token)}&debug=1&calls=1`,
      );
      const text = await res.text();
      setCallsDebug(text);
    } catch (err) {
      setCallsDebug(describeError(err, "Unknown error"));
    } finally {
      setCallsDebugLoading(false);
    }
  }

  const webhookUrl =
    typeof window !== "undefined" && status && user?.organizationId
      ? `${window.location.origin}/integrations/amocrm/webhook?org=${encodeURIComponent(user.organizationId)}`
      : "";

  if (!status) return null;

  return (
    <>
      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Pill tone="success">{t("common.connected")}</Pill>
              {status.subdomain && <span className="text-xs text-subtle">{status.subdomain}</span>}
            </div>
            <p className="mt-2 text-xs text-subtle">
              {t("amocrm.lastSync")}:{" "}
              {status.last_synced_at
                ? new Date(status.last_synced_at).toLocaleString()
                : t("amocrm.never")}
            </p>
            {status.last_sync_error && (
              <p className="mt-2 max-w-md text-xs text-destructive">
                {t("amocrm.lastError")}: {status.last_sync_error}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
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
            <button
              type="button"
              onClick={() => void runCallsDebug()}
              disabled={callsDebugLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              {callsDebugLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Diagnostika (qo'ng'iroqlar)
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDisconnect(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
            >
              <Unplug className="h-4 w-4" />
              {t("amocrmImport.disconnect")}
            </button>
          </div>
        </div>
        {callsDebug && (
          <pre className="mt-4 max-h-96 overflow-auto rounded-xl border border-border bg-surface p-3 text-[11px] leading-relaxed text-foreground">
            {callsDebug}
          </pre>
        )}
      </SectionCard>

      <SectionCard
        title={t("amocrmImport.webhookUrlTitle")}
        description={t("amocrmImport.webhookUrlDesc")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground">
            {webhookUrl}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(webhookUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? t("amocrmImport.copied") : t("amocrmImport.copyLink")}
          </button>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirmingDisconnect}
        onOpenChange={setConfirmingDisconnect}
        title={t("amocrmImport.disconnectConfirmTitle")}
        description={t("amocrmImport.disconnectConfirmDesc")}
        confirmLabel={t("amocrmImport.disconnect")}
        onConfirm={() =>
          disconnect.mutate(undefined, {
            onSuccess: () => toast.success(t("amocrmImport.disconnected")),
            onError: (err) => toast.error(describeError(err, t("amocrmImport.disconnectFailed"))),
          })
        }
      />
    </>
  );
}

function NotConnectedCard() {
  const { t } = useI18n();
  return (
    <SectionCard>
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">{t("amocrmImport.notConnected")}</p>
        <Link
          to="/integrations"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plug className="h-4 w-4" /> {t("amocrmImport.goConnect")}
        </Link>
      </div>
    </SectionCard>
  );
}

function ImportSettingsPage() {
  const { t } = useI18n();
  const { data: catalog, isLoading, isError, error, refetch, isFetching } = useAmoCatalog();
  const save = useSaveAmoImportSettings();
  const notConnected = error instanceof Error && error.message === "AmoCRM is not connected yet.";

  const [pipelineIds, setPipelineIds] = useState<Set<number>>(new Set());
  const [userIds, setUserIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [pipelinesOpen, setPipelinesOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);

  useEffect(() => {
    if (!catalog) return;
    setPipelineIds(new Set(catalog.enabledPipelineIds ?? catalog.pipelines.map((p) => p.id)));
    setUserIds(new Set(catalog.enabledUserIds ?? catalog.operators.map((o) => o.id)));
  }, [catalog]);

  function toggle(set: Set<number>, setter: (v: Set<number>) => void, id: number) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  async function onSave() {
    setSaving(true);
    try {
      await save.mutateAsync({
        pipelineIds: Array.from(pipelineIds),
        userIds: Array.from(userIds),
      });
      toast.success(t("amocrmImport.saved"));
    } catch (err) {
      toast.error(describeError(err, t("amocrmImport.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AdminBackLink />
      <PageHeader
        title={t("amocrmImport.title")}
        description={t("amocrmImport.desc")}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/integrations/amocrm-checklist"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
            >
              <ClipboardList className="h-3.5 w-3.5" /> {t("amocrmChecklist.linkButton")}
            </Link>
            {catalog && (
              <>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                  {t("amocrmImport.reload")}
                </button>
                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={saving || isLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("common.save")}
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="mb-6 space-y-6">
        <ConnectionHeader />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : notConnected ? (
        <NotConnectedCard />
      ) : isError || !catalog ? (
        <SectionCard>
          <p className="text-sm text-destructive">{t("amocrmImport.loadFailed")}</p>
        </SectionCard>
      ) : (
        <div className="mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setUsersOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-soft transition-colors hover:bg-accent"
          >
            <Users className="h-4 w-4 text-primary" />
            {t("amocrmImport.operatorsTitle")}
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {userIds.size}/{catalog.operators.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPipelinesOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-soft transition-colors hover:bg-accent"
          >
            <Workflow className="h-4 w-4 text-primary" />
            {t("amocrmImport.pipelinesTitle")}
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {pipelineIds.size}/{catalog.pipelines.length}
            </span>
          </button>
        </div>
      )}

      {catalog && (
        <>
          <Dialog open={usersOpen} onOpenChange={setUsersOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t("amocrmImport.operatorsTitle")}</DialogTitle>
              </DialogHeader>
              <p className="-mt-2 text-sm text-muted-foreground">
                {t("amocrmImport.operatorsDesc")}
              </p>
              {catalog.operators.length === 0 ? (
                <p className="py-6 text-center text-sm text-subtle">{t("amocrmImport.empty")}</p>
              ) : (
                <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
                  {catalog.operators.map((o) => {
                    const checked = userIds.has(o.id);
                    return (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => toggle(userIds, setUserIds, o.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
                            checked && "bg-primary/5",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            {checked ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                            ) : (
                              <Circle className="h-4 w-4 shrink-0 text-subtle" />
                            )}
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-foreground">
                                {o.name}
                              </span>
                              {o.email && (
                                <span className="block truncate text-xs text-subtle">
                                  {o.email}
                                </span>
                              )}
                            </span>
                          </span>
                          {o.existingProfileEmail && (
                            <Pill tone="success">{t("amocrmImport.existingAccount")}</Pill>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={pipelinesOpen} onOpenChange={setPipelinesOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t("amocrmImport.pipelinesTitle")}</DialogTitle>
              </DialogHeader>
              <p className="-mt-2 text-sm text-muted-foreground">
                {t("amocrmImport.pipelinesDesc")}
              </p>
              {catalog.pipelines.length === 0 ? (
                <p className="py-6 text-center text-sm text-subtle">{t("amocrmImport.empty")}</p>
              ) : (
                <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
                  {catalog.pipelines.map((p) => {
                    const checked = pipelineIds.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => toggle(pipelineIds, setPipelineIds, p.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
                            checked && "bg-primary/5",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            {checked ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                            ) : (
                              <Circle className="h-4 w-4 shrink-0 text-subtle" />
                            )}
                            <span className="truncate font-medium text-foreground">{p.name}</span>
                          </span>
                          {p.is_main && <Pill tone="neutral">{t("amocrmImport.main")}</Pill>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}

function AmoImportSettingsPage() {
  const { user } = useAuth();
  const { t } = useI18n();

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
          </div>
        </SectionCard>
      </>
    );
  }

  return <ImportSettingsPage />;
}
