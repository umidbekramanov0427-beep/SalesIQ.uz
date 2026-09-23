import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  Copy,
  Globe2,
  KeyRound,
  Loader2,
  Plug,
  PlugZap,
  RefreshCw,
  ShieldAlert,
  Unplug,
  Users,
  Webhook,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, StatCard, Pill } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError } from "@/lib/utils";
import {
  useActiveFunnelCheck,
  useAiOnboarding,
  useAmoCatalog,
  useAmoCallsCount,
  useAmoConnectionStatus,
  useAmoSyncLog,
  useDisconnectAmoCrm,
  useExternalApiTokenStatus,
  useGenerateExternalApiToken,
  useOutgoingWebhook,
  useDeleteOutgoingWebhook,
  useRecordingTrimSetting,
  useRefreshAmoManagers,
  useRevokeExternalApiToken,
  useRunActiveFunnelCheck,
  useSaveAmoImportSettings,
  useSaveOutgoingWebhook,
  useSetRecordingTrim,
  useTestAmoConnection,
  useTriggerAmoCrmSync,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/admin/amocrm-import")({
  head: () => ({
    meta: [
      { title: "Integratsiya ish maydoni — SalesIQ" },
      {
        name: "description",
        content: "AmoCRM integratsiyasini sozlash va operatsion holatini boshqarish.",
      },
    ],
  }),
  component: AmoImportSettingsPage,
});

/* ------------------------------------------------------------------ */
/* Sozlash tab — a computed 6-step onboarding checklist                */
/* ------------------------------------------------------------------ */

type SetupStep = { key: string; done: boolean; title: string; desc: string; cta?: ReactNode };

function useSetupSteps(): SetupStep[] {
  const { t } = useI18n();
  const { data: onboarding } = useAiOnboarding();
  const { data: amoStatus } = useAmoConnectionStatus();
  const { data: catalog } = useAmoCatalog();

  const connected = !!amoStatus?.subdomain;
  const managersAdded = (catalog?.enabledUserIds?.length ?? 0) > 0;

  return [
    {
      key: "interview",
      done: !!onboarding?.started_at,
      title: t("amoWorkspace.step1Title"),
      desc: t("amoWorkspace.step1Desc"),
    },
    {
      key: "connect",
      done: connected,
      title: t("amoWorkspace.step2Title"),
      desc: t("amoWorkspace.step2Desc"),
      cta: !connected && (
        <Link
          to="/integrations"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plug className="h-3.5 w-3.5" /> {t("amocrmImport.goConnect")}
        </Link>
      ),
    },
    {
      key: "managers",
      done: managersAdded,
      title: t("amoWorkspace.step3Title"),
      desc: t("amoWorkspace.step3Desc"),
    },
    {
      key: "calibration",
      done: !!onboarding?.proposal_generated_at,
      title: t("amoWorkspace.step4Title"),
      desc: t("amoWorkspace.step4Desc"),
    },
    {
      key: "proposal",
      done: !!onboarding?.applied_at,
      title: t("amoWorkspace.step5Title"),
      desc: t("amoWorkspace.step5Desc"),
      cta: !!onboarding?.proposal_generated_at && !onboarding?.applied_at && (
        <Link
          to="/onboarding/ai-setup"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <ClipboardList className="h-3.5 w-3.5" /> {t("amoWorkspace.step5Title")}
        </Link>
      ),
    },
    {
      key: "bootstrap",
      done: !!amoStatus?.last_synced_at,
      title: t("amoWorkspace.step6Title"),
      desc: t("amoWorkspace.step6Desc"),
    },
  ];
}

function SetupStepsCard() {
  const { t } = useI18n();
  const steps = useSetupSteps();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = steps[Math.min(activeIndex, steps.length - 1)]!;
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <SectionCard title={t("amoWorkspace.tabSetup")}>
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>
            {doneCount}/{steps.length} {t("amoWorkspace.stepsProgress")}
          </span>
          <span>{Math.round((doneCount / steps.length) * 100)}%</span>
        </div>
        <Progress value={(doneCount / steps.length) * 100} />
      </div>
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <ul className="space-y-1">
          {steps.map((step, i) => (
            <li key={step.key}>
              <button
                type="button"
                onClick={() => setActiveIndex(i)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
                  i === activeIndex && "bg-primary/5",
                )}
              >
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-subtle" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {i + 1}. {step.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-2 flex items-center gap-2">
            <Pill tone={active.done ? "success" : "neutral"}>
              {active.done ? t("amoWorkspace.stepDone") : t("amoWorkspace.stepPending")}
            </Pill>
          </div>
          <h3 className="text-base font-bold text-foreground">{active.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{active.desc}</p>
          {active.cta && <div className="mt-4">{active.cta}</div>}
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              disabled={activeIndex === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> {t("amoWorkspace.stepPrev")}
            </button>
            <button
              type="button"
              onClick={() => setActiveIndex((i) => Math.min(steps.length - 1, i + 1))}
              disabled={activeIndex === steps.length - 1}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-40"
            >
              {t("amoWorkspace.stepNext")} <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function ExternalApiTokenCard() {
  const { t } = useI18n();
  const { data: status } = useExternalApiTokenStatus();
  const generate = useGenerateExternalApiToken();
  const revoke = useRevokeExternalApiToken();
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  return (
    <SectionCard
      title={t("amoWorkspace.apiTokenTitle")}
      description={t("amoWorkspace.apiTokenDesc")}
    >
      {freshToken ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground">
              {freshToken}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(freshToken);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
            >
              <Copy className="h-3.5 w-3.5" />{" "}
              {copied ? t("amoWorkspace.apiTokenCopied") : t("amoWorkspace.apiTokenCopy")}
            </button>
          </div>
          <p className="text-xs text-warning-foreground">
            {t("amoWorkspace.apiTokenGeneratedOnce")}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {status?.hasToken ? (
              <>
                <Pill tone="success">{t("amoWorkspace.apiTokenActive")}</Pill>
                {status.createdAt && (
                  <span className="ml-2 text-xs text-subtle">
                    {t("amoWorkspace.apiTokenCreatedAt")}:{" "}
                    {new Date(status.createdAt).toLocaleDateString()}
                  </span>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("amoWorkspace.apiTokenNone")}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status?.hasToken && (
              <button
                type="button"
                onClick={() => setConfirmingRevoke(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
              >
                {t("amoWorkspace.apiTokenRevoke")}
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                generate.mutate(undefined, {
                  onSuccess: (res) => setFreshToken(res.token),
                  onError: (err) =>
                    toast.error(describeError(err, t("amoWorkspace.apiTokenGenerateFailed"))),
                })
              }
              disabled={generate.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {generate.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <KeyRound className="h-3.5 w-3.5" />
              {status?.hasToken
                ? t("amoWorkspace.apiTokenRegenerate")
                : t("amoWorkspace.apiTokenGenerate")}
            </button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmingRevoke}
        onOpenChange={setConfirmingRevoke}
        title={t("amoWorkspace.apiTokenRevokeConfirmTitle")}
        description={t("amoWorkspace.apiTokenRevokeConfirmDesc")}
        confirmLabel={t("amoWorkspace.apiTokenRevoke")}
        onConfirm={() =>
          revoke.mutate(undefined, {
            onSuccess: () => setFreshToken(null),
            onError: (err) =>
              toast.error(describeError(err, t("amoWorkspace.apiTokenRevokeFailed"))),
          })
        }
      />
    </SectionCard>
  );
}

function parseHeadersText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function headersToText(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function OutgoingWebhookCard() {
  const { t } = useI18n();
  const { data: webhook } = useOutgoingWebhook();
  const save = useSaveOutgoingWebhook();
  const del = useDeleteOutgoingWebhook();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [headersText, setHeadersText] = useState("");

  useEffect(() => {
    if (webhook) {
      setName(webhook.name);
      setUrl(webhook.url);
      setHeadersText(headersToText(webhook.headers));
    }
  }, [webhook]);

  return (
    <SectionCard title={t("amoWorkspace.webhookTitle")} description={t("amoWorkspace.webhookDesc")}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            {t("amoWorkspace.webhookNameLabel")}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            {t("amoWorkspace.webhookUrlLabel")}
          </label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            {t("amoWorkspace.webhookHeadersLabel")}
          </label>
          <textarea
            value={headersText}
            onChange={(e) => setHeadersText(e.target.value)}
            rows={3}
            placeholder="Authorization: Bearer ..."
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              save.mutate(
                { name, url, headers: parseHeadersText(headersText) },
                {
                  onSuccess: () => toast.success(t("amoWorkspace.webhookSaved")),
                  onError: (err) =>
                    toast.error(describeError(err, t("amoWorkspace.webhookSaveFailed"))),
                },
              )
            }
            disabled={save.isPending || !url}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <Webhook className="h-3.5 w-3.5" /> {t("amoWorkspace.webhookSave")}
          </button>
          {webhook && (
            <button
              type="button"
              onClick={() =>
                del.mutate(undefined, {
                  onSuccess: () => {
                    toast.success(t("amoWorkspace.webhookDeleted"));
                    setName("");
                    setUrl("");
                    setHeadersText("");
                  },
                  onError: (err) =>
                    toast.error(describeError(err, t("amoWorkspace.webhookDeleteFailed"))),
                })
              }
              className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
            >
              {t("amoWorkspace.webhookDelete")}
            </button>
          )}
        </div>
        {!webhook && <p className="text-xs text-subtle">{t("amoWorkspace.webhookNone")}</p>}
      </div>
    </SectionCard>
  );
}

function SetupTab() {
  return (
    <div className="space-y-6">
      <SetupStepsCard />
      <ExternalApiTokenCard />
      <OutgoingWebhookCard />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Operatsiyalar tab                                                   */
/* ------------------------------------------------------------------ */

function CrmConnectionCard() {
  const { t } = useI18n();
  const { data: status } = useAmoConnectionStatus();
  const { data: catalog } = useAmoCatalog();
  const sync = useTriggerAmoCrmSync();
  const refreshManagers = useRefreshAmoManagers();
  const testConnection = useTestAmoConnection();
  const disconnect = useDisconnectAmoCrm();
  const saveSettings = useSaveAmoImportSettings();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [pipelinesOpen, setPipelinesOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [pipelineIds, setPipelineIds] = useState<Set<number>>(new Set());
  const [userIds, setUserIds] = useState<Set<number>>(new Set());
  const [savingSelection, setSavingSelection] = useState(false);

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

  async function onSaveSelection() {
    setSavingSelection(true);
    try {
      await saveSettings.mutateAsync({
        pipelineIds: Array.from(pipelineIds),
        userIds: Array.from(userIds),
      });
      toast.success(t("amocrmImport.saved"));
    } catch (err) {
      toast.error(describeError(err, t("amocrmImport.saveFailed")));
    } finally {
      setSavingSelection(false);
    }
  }

  if (!status) return null;

  return (
    <SectionCard
      title={t("amoWorkspace.crmConnectionTitle")}
      description={t("amoWorkspace.crmConnectionDesc")}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("amoWorkspace.crmType")}:
            </span>
            <Pill tone="info">AmoCRM</Pill>
            <Pill tone="success">{t("common.connected")}</Pill>
          </div>
          {status.subdomain && (
            <p className="text-xs text-subtle">
              {t("amoWorkspace.crmUrl")}: {status.subdomain}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {catalog && (
            <>
              <button
                type="button"
                onClick={() => setUsersOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-soft transition-colors hover:bg-accent"
              >
                <Users className="h-3.5 w-3.5 text-primary" />
                {t("amocrmImport.operatorsTitle")}
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {userIds.size}/{catalog.operators.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPipelinesOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-soft transition-colors hover:bg-accent"
              >
                <Workflow className="h-3.5 w-3.5 text-primary" />
                {t("amocrmImport.pipelinesTitle")}
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {pipelineIds.size}/{catalog.pipelines.length}
                </span>
              </button>
            </>
          )}
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
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {t("amocrm.syncNow")}
          </button>
          <button
            type="button"
            onClick={() =>
              refreshManagers.mutate(undefined, {
                onSuccess: (res) =>
                  toast.success(t("amocrm.managersRefreshed", { count: String(res.mapped) })),
                onError: (err) =>
                  toast.error(describeError(err, t("amocrm.managersRefreshFailed"))),
              })
            }
            disabled={refreshManagers.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
          >
            {refreshManagers.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Users className="h-3.5 w-3.5" />
            )}
            {t("amocrm.refreshManagers")}
          </button>
          <button
            type="button"
            onClick={() =>
              testConnection.mutate(undefined, {
                onSuccess: () => toast.success(t("amoWorkspace.testSuccess")),
                onError: (err) => toast.error(describeError(err, t("amoWorkspace.testFailed"))),
              })
            }
            disabled={testConnection.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
          >
            {testConnection.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlugZap className="h-3.5 w-3.5" />
            )}
            {t("amoWorkspace.testConnection")}
          </button>
          <Link
            to="/integrations"
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {t("amocrm.reconnect")}
          </Link>
          <button
            type="button"
            onClick={() => setConfirmingDisconnect(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            <Unplug className="h-3.5 w-3.5" />
            {t("amocrmImport.disconnect")}
          </button>
        </div>
      </div>
      {status.last_sync_error && (
        <p className="mt-3 text-xs text-destructive">
          {t("amocrm.lastError")}: {status.last_sync_error}
        </p>
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
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => void onSaveSelection().then(() => setUsersOpen(false))}
                  disabled={savingSelection}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {savingSelection && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("common.save")}
                </button>
              </div>
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
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => void onSaveSelection().then(() => setPipelinesOpen(false))}
                  disabled={savingSelection}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {savingSelection && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("common.save")}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

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
    </SectionCard>
  );
}

function TrafficLocationCard() {
  const { t } = useI18n();
  return (
    <SectionCard
      title={t("amoWorkspace.trafficLocationTitle")}
      description={t("amoWorkspace.trafficLocationDesc")}
    >
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Globe2 className="h-4 w-4 text-primary" />
        {t("amoWorkspace.trafficLocationValue")}
      </div>
    </SectionCard>
  );
}

function OperationalStatusCard() {
  const { t } = useI18n();
  const { data: status } = useAmoConnectionStatus();
  const { data: onboarding } = useAiOnboarding();
  const { data: callsCount } = useAmoCallsCount();
  const steps = useSetupSteps();
  const currentStep = steps.find((s) => !s.done) ?? steps[steps.length - 1]!;

  return (
    <SectionCard
      title={t("amoWorkspace.operationalStatusTitle")}
      description={t("amoWorkspace.operationalStatusDesc")}
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">
            {t("amoWorkspace.currentStageLabel")}
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{currentStep.title}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">
            {t("amoWorkspace.callsImportedLabel")}
          </dt>
          <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
            {callsCount ?? 0}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">
            {t("amoWorkspace.statLastSync")}
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {status?.last_synced_at
              ? new Date(status.last_synced_at).toLocaleString()
              : t("amocrm.never")}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">
            {t("amoWorkspace.statSetupStatus")}
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{onboarding?.status ?? "—"}</dd>
        </div>
      </dl>
    </SectionCard>
  );
}

function ActiveFunnelCard() {
  const { t } = useI18n();
  const { data: lastCheck } = useActiveFunnelCheck();
  const run = useRunActiveFunnelCheck();

  return (
    <SectionCard
      title={t("amoWorkspace.activeFunnelTitle")}
      description={t("amoWorkspace.activeFunnelDesc")}
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-subtle">
          {lastCheck
            ? `${t("amoWorkspace.activeFunnelLastCheck")}: ${new Date(lastCheck.checkedAt).toLocaleString()}`
            : t("amoWorkspace.activeFunnelNever")}
        </p>
        <button
          type="button"
          onClick={() =>
            run.mutate(undefined, {
              onError: (err) =>
                toast.error(describeError(err, t("amoWorkspace.activeFunnelFailed"))),
            })
          }
          disabled={run.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {run.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Activity className="h-3.5 w-3.5" />
          )}
          {t("amoWorkspace.activeFunnelRun")}
        </button>
      </div>
      {(run.data ?? lastCheck) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: t("amoWorkspace.activeFunnelChecked"),
              value: (run.data ?? lastCheck)!.checkedStages,
            },
            {
              label: t("amoWorkspace.activeFunnelMoved"),
              value: (run.data ?? lastCheck)!.movedOrChanged,
            },
            {
              label: t("amoWorkspace.activeFunnelBackfilled"),
              value: (run.data ?? lastCheck)!.backfilled,
            },
            {
              label: t("amoWorkspace.activeFunnelMissing"),
              value: (run.data ?? lastCheck)!.missingInCrm,
            },
          ].map((tile) => (
            <div
              key={tile.label}
              className="rounded-xl border border-border bg-surface p-3 text-center"
            >
              <p className="text-lg font-bold tabular-nums text-foreground">{tile.value}</p>
              <p className="mt-0.5 text-[11px] font-medium text-subtle">{tile.label}</p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function SyncLogCard() {
  const { t } = useI18n();
  const { data: rows } = useAmoSyncLog(10);
  return (
    <SectionCard title={t("amocrm.syncHistory")} description={t("amocrm.syncHistoryDesc")}>
      {!rows || rows.length === 0 ? (
        <p className="text-xs text-subtle">{t("amocrm.syncHistoryEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <Pill tone={row.trigger === "manual" ? "info" : "neutral"}>
                  {row.trigger === "manual" ? t("amocrm.triggerManual") : t("amocrm.triggerCron")}
                </Pill>
                <span className="text-subtle">{new Date(row.finished_at).toLocaleString()}</span>
              </div>
              {row.skipped ? (
                <Pill tone="warning">{t("amocrm.syncSkipped")}</Pill>
              ) : row.error ? (
                <span className="max-w-xs truncate text-destructive" title={row.error}>
                  {row.error}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {t("amocrm.syncResultSummary", {
                    leads: String(row.synced_count),
                    calls: String(row.calls_synced ?? 0),
                  })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function RecordingTrimCard() {
  const { t } = useI18n();
  const { data: enabled } = useRecordingTrimSetting();
  const setTrim = useSetRecordingTrim();
  return (
    <SectionCard
      title={t("amoWorkspace.recordingTrimTitle")}
      description={t("amoWorkspace.recordingTrimDesc")}
    >
      <div className="flex items-center gap-3">
        <Switch
          checked={!!enabled}
          onCheckedChange={(v) =>
            setTrim.mutate(v, {
              onError: (err) => toast.error(describeError(err, t("common.save"))),
            })
          }
          disabled={setTrim.isPending}
        />
        <span className="text-sm text-foreground">
          {enabled ? t("amoWorkspace.stepDone") : t("amoWorkspace.stepPending")}
        </span>
      </div>
    </SectionCard>
  );
}

function TechnicalDetailsCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: status } = useAmoConnectionStatus();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [callsDebug, setCallsDebug] = useState<string | null>(null);
  const [callsDebugLoading, setCallsDebugLoading] = useState(false);

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
      setCallsDebug(await res.text());
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

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SectionCard
        title={
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left">
            {t("amoWorkspace.technicalDetailsTitle")}
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </CollapsibleTrigger>
        }
      >
        <CollapsibleContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">
                {t("amoWorkspace.technicalDetailsSubdomain")}
              </dt>
              <dd className="mt-1 text-sm text-foreground">{status?.subdomain ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">
                {t("amoWorkspace.technicalDetailsConnectedAt")}
              </dt>
              <dd className="mt-1 text-sm text-foreground">
                {status?.connected_at ? new Date(status.connected_at).toLocaleString() : "—"}
              </dd>
            </div>
          </dl>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              {t("amocrmImport.webhookUrlTitle")}
            </p>
            <p className="mb-2 text-xs text-subtle">{t("amocrmImport.webhookUrlDesc")}</p>
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
                <Copy className="h-3.5 w-3.5" />{" "}
                {copied ? t("amocrmImport.copied") : t("amocrmImport.copyLink")}
              </button>
            </div>
          </div>
          <div>
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
            {callsDebug && (
              <pre className="mt-3 max-h-96 overflow-auto rounded-xl border border-border bg-surface p-3 text-[11px] leading-relaxed text-foreground">
                {callsDebug}
              </pre>
            )}
          </div>
        </CollapsibleContent>
      </SectionCard>
    </Collapsible>
  );
}

function OperationsTab() {
  return (
    <div className="space-y-6">
      <CrmConnectionCard />
      <div className="grid gap-6 md:grid-cols-2">
        <OperationalStatusCard />
        <TrafficLocationCard />
      </div>
      <ActiveFunnelCard />
      <SyncLogCard />
      <RecordingTrimCard />
      <TechnicalDetailsCard />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared shell                                                        */
/* ------------------------------------------------------------------ */

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

function IntegrationWorkspace() {
  const { t } = useI18n();
  const { data: status, isLoading: statusLoading } = useAmoConnectionStatus();
  const {
    data: catalog,
    isLoading: catalogLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useAmoCatalog();
  const steps = useSetupSteps();
  const [tab, setTab] = useState<"setup" | "operations">("setup");

  const notConnected = error instanceof Error && error.message === "AmoCRM is not connected yet.";
  const isLoading = statusLoading || catalogLoading;
  const doneSteps = steps.filter((s) => s.done).length;
  const enabledCount =
    (catalog?.enabledPipelineIds?.length ?? catalog?.pipelines.length ?? 0) +
    (catalog?.enabledUserIds?.length ?? catalog?.operators.length ?? 0);
  const totalCount = (catalog?.pipelines.length ?? 0) + (catalog?.operators.length ?? 0);

  return (
    <>
      <AdminBackLink />
      <PageHeader
        title={t("amoWorkspace.title")}
        description={t("amocrmImport.desc")}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/integrations/amocrm-checklist"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
            >
              <ClipboardList className="h-3.5 w-3.5" /> {t("amocrmChecklist.linkButton")}
            </Link>
            {catalog && !notConnected && (
              <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                {t("amoWorkspace.refresh")}
              </button>
            )}
          </div>
        }
      />

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
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label={t("amoWorkspace.statSetupStatus")}
              value={`${doneSteps}/${steps.length}`}
              info={t("amoWorkspace.statSetupInfo")}
            />
            <StatCard
              label={t("amoWorkspace.statConnectionStatus")}
              value={status?.subdomain ? t("common.connected") : "—"}
              info={t("amoWorkspace.statConnectionInfo")}
            />
            <StatCard
              label={t("amoWorkspace.statLastSync")}
              value={
                status?.last_synced_at
                  ? new Date(status.last_synced_at).toLocaleDateString()
                  : t("amocrm.never")
              }
              info={t("amoWorkspace.statLastSyncInfo")}
            />
            <StatCard
              label={t("amoWorkspace.statConfigured")}
              value={totalCount > 0 ? `${enabledCount}/${totalCount}` : "—"}
              info={t("amoWorkspace.statConfiguredInfo")}
            />
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "setup" | "operations")}>
            <TabsList className="mb-6">
              <TabsTrigger value="setup">{t("amoWorkspace.tabSetup")}</TabsTrigger>
              <TabsTrigger value="operations">{t("amoWorkspace.tabOperations")}</TabsTrigger>
            </TabsList>
            <TabsContent value="setup">
              <SetupTab />
            </TabsContent>
            <TabsContent value="operations">
              <OperationsTab />
            </TabsContent>
          </Tabs>
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

  return <IntegrationWorkspace />;
}
