import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArrowLeft,
  BellRing,
  Bot,
  Copy,
  Columns3,
  ListChecks,
  MessageSquareReply,
  MessagesSquare,
  Webhook,
  ChevronDown,
  FileText,
  Globe,
  Instagram,
  Lightbulb,
  Loader2,
  Lock,
  Plus,
  Send,
  Settings2,
  Sheet,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { CrmGate } from "@/components/CrmGate";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmbeddedPage, InfoTip } from "@/components/layout/Primitives";
import {
  AutomationsTab,
  RuleDialog,
  useRuleEditorOptions,
  type StageLite,
} from "@/components/funnel-settings/AutomationsTab";
import { SalesbotsTab } from "@/components/funnel-settings/SalesbotsTab";
import { WebFormsTab } from "@/components/funnel-settings/WebFormsTab";
import { LeadSourcesTab } from "@/components/funnel-settings/LeadSourcesTab";
import { DuplicatesTab } from "@/components/funnel-settings/DuplicatesTab";
import { TaskControlTab } from "@/components/funnel-settings/TaskControlTab";
import { FollowupsTab } from "@/components/funnel-settings/FollowupsTab";
import { AutoRespondersTab } from "@/components/funnel-settings/AutoRespondersTab";
import { ChatTemplatesTab } from "@/components/funnel-settings/ChatTemplatesTab";
import type { AutomationRuleRow } from "@/hooks/use-crm-data";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  useAutomationRules,
  useCreatePipeline,
  useCreateStage,
  useDeleteStage,
  useLeadCustomFieldDefs,
  useOrgGeneralSettings,
  usePipelineStagesRaw,
  usePipelines,
  useSetStageRule,
  useStageRules,
  useUpdateOrgGeneralSettings,
  useUpdatePipeline,
  useUpdateStage,
  useWebForms,
  type PipelineRow,
  type StageRow,
} from "@/hooks/use-crm-data";
import { asDedupeMode, type DedupeMode } from "@/lib/leads/funnel-dedupe";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { nextStageColor } from "@/lib/stage-colors";
import { STAGE_VALUES, stageValueOf, type StageValue } from "@/lib/stage-value";
import { cn, describeError, stageColorProps } from "@/lib/utils";

// Voronkalar → "Sozlamalar": one funnel's whole setup on one screen, the way
// amoCRM / 5CRM lay it out. Left: where its leads come from (web forms,
// Instagram, the Telegram bot, a Sheets import), what happens with repeat
// requests, and the bots. Right: one column per stage -- its name, what
// reaching it means (sale, prepayment, refused...), whether a lead there is
// qualified, a hint for the manager, the "task required" rule and the
// triggers that fire when a lead enters it; the refused stage lists the
// refusal reasons. Everything saves the moment it changes.
export const Route = createFileRoute("/funnels_/settings")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { funnel?: string | undefined; tab?: SettingsTab | undefined } => ({
    funnel: typeof search["funnel"] === "string" ? (search["funnel"] as string) : undefined,
    tab: TABS.some((x) => x.key === search["tab"]) ? (search["tab"] as SettingsTab) : undefined,
  }),
  head: () => ({ meta: [{ title: "Voronka sozlamalari — SalesIQ" }] }),
  component: () => (
    <CrmGate>
      <FunnelSettingsPage />
    </CrmGate>
  ),
});

// Everything about a funnel is set up here, one tab each -- nothing about
// funnels lives in the Admin panel any more (the old /admin/... addresses
// redirect to their tab).
const TABS = [
  { key: "stages", icon: Columns3 },
  { key: "automations", icon: Zap },
  { key: "salesbots", icon: Bot },
  { key: "forms", icon: Globe },
  { key: "sources", icon: Webhook },
  { key: "duplicates", icon: Copy },
  { key: "tasks", icon: ListChecks },
  { key: "followups", icon: BellRing },
  { key: "autoreplies", icon: MessageSquareReply },
  { key: "templates", icon: MessagesSquare },
] as const;
type SettingsTab = (typeof TABS)[number]["key"];

/** Opens the trigger editor right on the stage column (null = new trigger). */
const EditTrigger = createContext<(stage: StageLite, rule: AutomationRuleRow | null) => void>(
  () => {},
);

const VALUE_TONE: Record<StageValue, string> = {
  new: "text-sky-600 dark:text-sky-300",
  in_work: "text-muted-foreground",
  expected: "text-violet-600 dark:text-violet-300",
  advance: "text-amber-600 dark:text-amber-300",
  sale: "text-emerald-600 dark:text-emerald-300",
  refused: "text-rose-600 dark:text-rose-300",
};

function FunnelSettingsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { funnel: funnelParam, tab = "stages" } = Route.useSearch();
  const { data: pipelines = [], isLoading } = usePipelines();
  const { data: allStages = [] } = usePipelineStagesRaw();
  const createPipeline = useCreatePipeline();
  const sorted = useMemo(() => [...pipelines].sort((a, b) => a.position - b.position), [pipelines]);
  const pipeline =
    sorted.find((p) => p.name === funnelParam) ??
    sorted.find((p) => p.is_default) ??
    sorted[0] ??
    null;
  const stages = useMemo(
    () =>
      pipeline
        ? allStages
            .filter((s) => s.pipeline_id === pipeline.id)
            .sort((a, b) => a.position - b.position)
        : [],
    [allStages, pipeline],
  );
  const [newFunnelOpen, setNewFunnelOpen] = useState(false);
  const [newFunnelName, setNewFunnelName] = useState("");
  const canManage = user?.role === "super_admin" || user?.role === "platform_owner";

  const [trigger, setTrigger] = useState<{
    stage: StageLite;
    rule: AutomationRuleRow | null;
  } | null>(null);
  const ruleOptions = useRuleEditorOptions(pipeline?.name ?? "");

  function pick(name: string) {
    void navigate({ to: "/funnels/settings", search: { funnel: name, tab }, replace: true });
  }
  function openTab(next: SettingsTab) {
    void navigate({
      to: "/funnels/settings",
      search: { ...(pipeline ? { funnel: pipeline.name } : {}), tab: next },
      replace: true,
    });
  }

  async function addFunnel() {
    const name = newFunnelName.trim();
    if (!name || !user?.organizationId) return;
    try {
      await createPipeline.mutateAsync({
        name,
        organization_id: user.organizationId,
        position: sorted.length,
      });
      setNewFunnelOpen(false);
      setNewFunnelName("");
      pick(name);
      toast.success(t("fs.funnelCreated"));
    } catch (err) {
      toast.error(describeError(err, t("fs.saveFailed")));
    }
  }

  return (
    <div className="-mx-4 -mt-4 flex min-h-[calc(100dvh-4rem)] flex-col md:-mx-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-5 py-3">
        <Link
          to="/funnels"
          search={pipeline ? { funnel: pipeline.name } : {}}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t("fs.back")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Settings2 className="h-5 w-5 text-primary" />
        <h1 className="text-[17px] font-bold text-foreground">{t("fs.title")}</h1>
        <div className="relative">
          <select
            value={pipeline?.name ?? ""}
            onChange={(e) => pick(e.target.value)}
            className="h-9 appearance-none rounded-lg border border-border bg-background pl-3 pr-8 text-[13.5px] font-semibold text-foreground outline-none focus:border-primary"
          >
            {sorted.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setNewFunnelOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-[13px] font-semibold text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="h-4 w-4" /> {t("fs.newFunnel")}
          </button>
        )}
        <span className="ml-auto text-[12px] text-subtle">{t("fs.autosave")}</span>
        {pipeline && (
          <Link
            to="/funnels"
            search={{ funnel: pipeline.name }}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:brightness-110"
          >
            {t("fs.openBoard")}
          </Link>
        )}
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4 phone-tabs">
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => openTab(key)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-[13px] font-semibold transition-colors",
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("h-4 w-4", tab === key && "text-primary")} />
            {t(`fs.tab.${key}`)}
          </button>
        ))}
      </nav>

      {isLoading ? (
        <div className="grid flex-1 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !pipeline ? (
        <p className="p-8 text-sm text-muted-foreground">{t("fs.noFunnels")}</p>
      ) : tab !== "stages" ? (
        <EmbeddedPage.Provider value>
          <div className="min-w-0 flex-1 p-5 phone:p-3">
            {tab === "automations" && <AutomationsTab funnel={pipeline.name} />}
            {tab === "salesbots" && <SalesbotsTab />}
            {tab === "forms" && <WebFormsTab />}
            {tab === "sources" && <LeadSourcesTab />}
            {tab === "duplicates" && <DuplicatesTab />}
            {tab === "tasks" && <TaskControlTab />}
            {tab === "followups" && <FollowupsTab />}
            {tab === "autoreplies" && <AutoRespondersTab />}
            {tab === "templates" && <ChatTemplatesTab />}
          </div>
        </EmbeddedPage.Provider>
      ) : (
        <EditTrigger.Provider value={(stage, rule) => setTrigger({ stage, rule })}>
          <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-3 border-b border-border bg-surface/60 p-4 lg:border-b-0 lg:border-r">
              <SourcesCard pipelineId={pipeline.id} funnel={pipeline.name} />
              <DuplicatesCard pipeline={pipeline} />
            </aside>
            <StageColumns
              stages={stages}
              pipelineId={pipeline.id}
              funnel={pipeline.name}
              canManage={canManage}
            />
          </div>
        </EditTrigger.Provider>
      )}

      {pipeline && (
        <RuleDialog
          open={!!trigger}
          onOpenChange={(v) => !v && setTrigger(null)}
          rule={trigger?.rule ?? null}
          column={trigger?.stage ?? null}
          funnel={pipeline.name}
          options={ruleOptions}
        />
      )}

      <Dialog open={newFunnelOpen} onOpenChange={setNewFunnelOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>{t("fs.newFunnel")}</DialogTitle>
          <form
            className="mt-2 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void addFunnel();
            }}
          >
            <input
              autoFocus
              value={newFunnelName}
              onChange={(e) => setNewFunnelName(e.target.value)}
              placeholder={t("fs.funnelName")}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!newFunnelName.trim() || createPipeline.isPending}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {createPipeline.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("fs.create")}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------- left panel */

function PanelCard({
  title,
  info,
  children,
}: {
  title: string;
  info?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-3.5">
      <h2 className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
        {info && <InfoTip text={info} />}
      </h2>
      {children}
    </section>
  );
}

function SourcesCard({ pipelineId, funnel }: { pipelineId: string; funnel: string }) {
  const { t } = useI18n();
  const { data: forms = [] } = useWebForms();
  const [open, setOpen] = useState(false);
  const mine = forms.filter((f) => f.default_pipeline_id === pipelineId);
  const SOURCES: {
    key: string;
    icon: typeof Globe;
    to: string;
    search?: Record<string, string>;
  }[] = [
    { key: "webForm", icon: Globe, to: "/funnels/settings", search: { funnel, tab: "forms" } },
    { key: "instagram", icon: Instagram, to: "/integrations/instagram" },
    {
      key: "telegramBot",
      icon: Send,
      to: "/funnels/settings",
      search: { funnel, tab: "salesbots" },
    },
    { key: "sheets", icon: Sheet, to: "/funnels", search: { funnel } },
  ];
  return (
    <PanelCard title={t("fs.sources")} info={t("fs.sourcesInfo")}>
      {mine.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">{t("fs.noSources")}</p>
      ) : (
        <ul className="space-y-1.5">
          {mine.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2"
            >
              <Globe className="h-4 w-4 shrink-0 text-sky-500" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                {f.name}
              </span>
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  f.active ? "bg-emerald-500" : "bg-muted-foreground/40",
                )}
                title={f.active ? t("fs.on") : t("fs.off")}
              />
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[13px] font-semibold text-primary hover:border-primary/50 hover:bg-primary/5"
      >
        <Plus className="h-4 w-4" /> {t("fs.addSource")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t("fs.pickSource")}</DialogTitle>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {SOURCES.map((s) => (
              <Link
                key={s.key}
                to={s.to}
                search={s.search ?? {}}
                onClick={() => setOpen(false)}
                className="flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-primary/50"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="text-[13.5px] font-bold text-foreground">
                  {t(`fs.src.${s.key}`)}
                </span>
                <span className="text-[12px] leading-snug text-muted-foreground">
                  {t(`fs.src.${s.key}Desc`)}
                </span>
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </PanelCard>
  );
}

function DuplicatesCard({ pipeline }: { pipeline: PipelineRow }) {
  const { t } = useI18n();
  const update = useUpdatePipeline();
  const { data: settings } = useOrgGeneralSettings();
  const updateOrg = useUpdateOrgGeneralSettings();
  const auto = settings?.dedupe_auto_merge ?? false;
  // Before the 20261214 migration these columns don't exist: today's
  // behaviour (repeat) is shown and saving explains why it can't.
  const row = pipeline as PipelineRow & {
    dedupe_mode?: string;
    dedupe_reopen_lost?: boolean;
    dedupe_new_after_won?: boolean;
    dedupe_task_minutes?: number;
    archived_at?: string | null;
  };
  const mode = asDedupeMode(row.dedupe_mode);
  function save(patch: Record<string, unknown>) {
    update.mutate(
      { id: pipeline.id, patch: patch as never },
      {
        onSuccess: () => toast.success(t("fs.saved")),
        onError: (e) => toast.error(describeError(e, t("fs.saveFailed"))),
      },
    );
  }
  const modes: { key: DedupeMode; title: string; desc: string }[] = [
    { key: "repeat", title: t("fs.dup.repeat"), desc: t("fs.dup.repeatDesc") },
    { key: "merge", title: t("fs.dup.merge"), desc: t("fs.dup.mergeDesc") },
    { key: "new", title: t("fs.dup.new"), desc: t("fs.dup.newDesc") },
    { key: "off", title: t("fs.dup.off"), desc: t("fs.dup.offDesc") },
  ];
  const TASK_MINUTES = [0, 5, 15, 30, 60, 240, 1440];
  return (
    <PanelCard title={t("fs.duplicates")} info={t("fs.duplicatesInfo")}>
      <div className="space-y-1.5">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => mode !== m.key && save({ dedupe_mode: m.key })}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
              mode === m.key
                ? "border-primary bg-primary/[0.06]"
                : "border-border hover:border-primary/40",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2",
                mode === m.key ? "border-primary" : "border-muted-foreground/40",
              )}
            >
              {mode === m.key && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-foreground">{m.title}</span>
              <span className="block text-[11.5px] leading-snug text-muted-foreground">
                {m.desc}
              </span>
            </span>
          </button>
        ))}
      </div>
      {mode !== "off" && (
        <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
          {mode === "repeat" && (
            <label className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-foreground">
              {t("fs.dup.reopenLost")}
              <Switch
                checked={row.dedupe_reopen_lost ?? true}
                onCheckedChange={(v) => save({ dedupe_reopen_lost: v })}
              />
            </label>
          )}
          {mode !== "new" && (
            <>
              <label className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-foreground">
                {t("fs.dup.newAfterWon")}
                <Switch
                  checked={row.dedupe_new_after_won ?? true}
                  onCheckedChange={(v) => save({ dedupe_new_after_won: v })}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-foreground">
                {t("fs.dup.task")}
                <select
                  value={row.dedupe_task_minutes ?? 15}
                  onChange={(e) => save({ dedupe_task_minutes: Number(e.target.value) })}
                  className="h-7 rounded-md border border-border bg-background px-1.5 text-[12px]"
                >
                  {TASK_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m === 0
                        ? t("fs.dup.noTask")
                        : m < 60
                          ? t("fs.dup.min", { n: m })
                          : m < 1440
                            ? t("fs.dup.hour", { n: m / 60 })
                            : t("fs.dup.day")}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      )}
      <label className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5 text-[12.5px] font-medium text-foreground">
        {t("fs.dupAuto")}
        <Switch
          checked={auto}
          onCheckedChange={(v) =>
            updateOrg.mutate(
              { dedupe_auto_merge: v },
              {
                onSuccess: () => toast.success(t("fs.saved")),
                onError: (e) => toast.error(describeError(e, t("fs.saveFailed"))),
              },
            )
          }
        />
      </label>
      <Link
        to="/funnels/settings"
        search={{ funnel: row.name, tab: "duplicates" }}
        className="mt-2 inline-block text-[12px] font-semibold text-primary hover:underline"
      >
        {t("fs.dupRules")}
      </Link>
      <div className="mt-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => save({ archived_at: row.archived_at ? null : new Date().toISOString() })}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          <Archive className="h-3.5 w-3.5" />
          {row.archived_at ? t("fs.unarchive") : t("fs.archive")}
        </button>
        <p className="mt-1.5 text-[11.5px] leading-snug text-subtle">{t("fs.archiveHint")}</p>
      </div>
    </PanelCard>
  );
}

/* ---------------------------------------------------------- stage columns */

function StageColumns({
  stages,
  pipelineId,
  funnel,
  canManage,
}: {
  stages: StageRow[];
  pipelineId: string;
  funnel: string;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const createStage = useCreateStage();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  async function add() {
    const name = newName.trim();
    if (!name || !user?.organizationId) return;
    // A new stage goes before the won/lost ones, like on the board.
    const closedFrom = stages.findIndex((s) => s.is_won || s.is_lost);
    const position = closedFrom === -1 ? stages.length : stages[closedFrom]!.position;
    try {
      await createStage.mutateAsync({
        name,
        key: `custom-${crypto.randomUUID()}`,
        organization_id: user.organizationId,
        pipeline_id: pipelineId,
        pipeline_name: funnel,
        color: nextStageColor(stages.map((s) => s.color)),
        position,
      });
      setNewName("");
      setAdding(false);
    } catch (err) {
      toast.error(describeError(err, t("fs.saveFailed")));
    }
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <div className="flex items-start gap-3 p-4">
        {stages.map((s, i) => (
          <StageColumn key={s.id} stage={s} index={i} funnel={funnel} canManage={canManage} />
        ))}
        {canManage && (
          <div className="w-[230px] shrink-0">
            {adding ? (
              <form
                className="space-y-2 rounded-xl border border-dashed border-primary/50 bg-card p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void add();
                }}
              >
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("fs.stageName")}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!newName.trim() || createStage.isPending}
                    className="h-8 flex-1 rounded-lg bg-primary text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {t("fs.add")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdding(false)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
                    aria-label={t("fs.cancel")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-[13px] font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary"
              >
                <Plus className="h-5 w-5" /> {t("fs.addStage")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  index,
  funnel,
  canManage,
}: {
  stage: StageRow & {
    stage_value?: string | null;
    lead_quality?: string | null;
    hint?: string | null;
  };
  index: number;
  funnel: string;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const update = useUpdateStage();
  const remove = useDeleteStage();
  const { data: rules = [] } = useStageRules();
  const setRule = useSetStageRule();
  const { data: automations = [] } = useAutomationRules();
  const { data: fieldDefs = [] } = useLeadCustomFieldDefs();
  const [name, setName] = useState(stage.name);
  const [hint, setHint] = useState(stage.hint ?? "");
  const [hintOpen, setHintOpen] = useState(!!stage.hint);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setName(stage.name), [stage.name]);
  useEffect(() => setHint(stage.hint ?? ""), [stage.hint]);

  const system = stage.is_won || stage.is_lost || index === 0;
  const color = stage.is_won
    ? { className: "bg-success" }
    : stage.is_lost
      ? { className: "bg-destructive" }
      : stageColorProps(stage.color);
  // The first column is the incoming one whatever its stored position.
  const value = stageValueOf({ ...stage, position: index });
  const rule = rules.find((r) => r.stage_id === stage.id);
  const triggers = automations.filter(
    (a) => a.trigger_stage_id === stage.id && (!a.funnel || a.funnel === funnel),
  );
  const editTrigger = useContext(EditTrigger);
  const lite: StageLite = {
    id: stage.id,
    name: stage.name,
    color: stage.color,
    position: stage.position,
  };
  const lostField = stage.is_lost
    ? fieldDefs.find((d) => /lost|rad|otkaz|отказ/i.test(`${d.key} ${d.label}`))
    : undefined;
  const reasons = Array.isArray(lostField?.options) ? (lostField!.options as string[]) : [];

  function save(patch: Record<string, unknown>) {
    update.mutate(
      { id: stage.id, patch },
      {
        onError: (e) => toast.error(describeError(e, t("fs.saveFailedMigration"))),
      },
    );
  }

  return (
    <div className="flex w-[260px] shrink-0 flex-col rounded-xl border border-border bg-card">
      <span className={cn("h-[3px] rounded-t-xl", color.className)} style={color.style} />
      <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
        <span
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", color.className)}
          style={color.style}
        />
        <input
          value={name}
          disabled={!canManage}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const v = name.trim();
            if (v && v !== stage.name) save({ name: v });
            else setName(stage.name);
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] font-bold uppercase tracking-wide text-foreground outline-none focus:text-primary"
        />
        {system ? (
          <Lock className="h-3.5 w-3.5 shrink-0 text-subtle" aria-label={t("fs.systemStage")} />
        ) : (
          canManage && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label={t("fs.deleteStage")}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-subtle hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>

      <div className="space-y-2 px-3 pb-3">
        <Field label={t("fs.value")} info={t("fs.valueInfo")}>
          <select
            value={value}
            disabled={!canManage}
            onChange={(e) => save({ stage_value: e.target.value })}
            className={cn(
              "h-8 w-full rounded-lg border border-border bg-background px-2 text-[12.5px] font-semibold outline-none focus:border-primary",
              VALUE_TONE[value],
            )}
          >
            {STAGE_VALUES.map((v) => (
              <option key={v} value={v}>
                {t(`fs.v.${v}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("fs.quality")} info={t("fs.qualityInfo")}>
          <select
            value={stage.lead_quality ?? ""}
            disabled={!canManage}
            onChange={(e) => save({ lead_quality: e.target.value || null })}
            className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[12.5px] font-semibold text-foreground outline-none focus:border-primary"
          >
            <option value="">{t("fs.q.none")}</option>
            <option value="qualified">{t("fs.q.qualified")}</option>
            <option value="junk">{t("fs.q.junk")}</option>
          </select>
        </Field>

        {hintOpen ? (
          <textarea
            value={hint}
            disabled={!canManage}
            onChange={(e) => setHint(e.target.value.slice(0, 500))}
            onBlur={() => {
              const v = hint.trim();
              if (v !== (stage.hint ?? "")) save({ hint: v || null });
              if (!v) setHintOpen(false);
            }}
            rows={3}
            autoFocus={!stage.hint}
            placeholder={t("fs.hintPh")}
            className="w-full resize-none rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-2 text-[12.5px] leading-snug text-foreground outline-none placeholder:text-subtle focus:border-amber-500/60"
          />
        ) : (
          canManage && (
            <button
              type="button"
              onClick={() => setHintOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-1.5 text-[12px] font-semibold text-muted-foreground hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-300"
            >
              <Lightbulb className="h-3.5 w-3.5" /> {t("fs.addHint")}
            </button>
          )
        )}

        {!stage.is_won && !stage.is_lost && (
          <label className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2.5 py-2 text-[12.5px] font-medium text-foreground">
            <span className="flex items-center gap-1.5">
              {t("fs.taskRequired")}
              <InfoTip text={t("fs.taskRequiredInfo")} />
            </span>
            <Switch
              checked={rule?.requires_task ?? false}
              disabled={!canManage}
              onCheckedChange={(v) =>
                setRule.mutate(
                  {
                    stageId: stage.id,
                    requiresTask: v,
                    requiresNote: rule?.requires_note ?? false,
                  },
                  { onError: (e) => toast.error(describeError(e, t("fs.saveFailed"))) },
                )
              }
            />
          </label>
        )}

        {stage.amocrm_pipeline_id == null && stage.bitrix24_category_id == null && (
          <div className="rounded-lg border border-border">
            <p className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <Zap className="h-3 w-3 text-primary" /> {t("fs.onEnter")}
            </p>
            {triggers.length > 0 && (
              <ul className="space-y-0.5 p-1.5">
                {triggers.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => editTrigger(lite, a)}
                      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12px] text-foreground hover:bg-accent"
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          a.enabled ? "bg-emerald-500" : "bg-muted-foreground/40",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => editTrigger(lite, null)}
              className="flex w-full items-center justify-center gap-1 px-2.5 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary/5"
            >
              <Plus className="h-3.5 w-3.5" /> {t("fs.addTrigger")}
            </button>
          </div>
        )}

        {stage.is_lost && (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.05] p-2.5">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-300">
              {t("fs.reasons")}
            </p>
            {reasons.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">{t("fs.noReasons")}</p>
            ) : (
              <ul className="space-y-1">
                {reasons.map((r) => (
                  <li key={r} className="text-[12.5px] text-foreground">
                    {r}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t("fs.reasonsWhere")}</p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("fs.deleteStageTitle", { name: stage.name })}
        description={t("fs.deleteStageDesc")}
        confirmLabel={t("fs.delete")}
        destructive
        onConfirm={() =>
          remove.mutate(stage.id, {
            onError: (e) => toast.error(describeError(e, t("fs.saveFailed"))),
          })
        }
      />
    </div>
  );
}

function Field({ label, info, children }: { label: string; info: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
        {label}
        <InfoTip text={info} />
      </p>
      {children}
    </div>
  );
}
