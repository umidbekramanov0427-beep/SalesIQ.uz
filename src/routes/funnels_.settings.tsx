import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useFunnelSkin } from "@/lib/funnel-skin";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useIsMutating } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  BellRing,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  Globe,
  ListChecks,
  Loader2,
  MessageSquareReply,
  MessagesSquare,
  Plus,
  Webhook,
  Zap,
  Palette,
} from "lucide-react";
import { toast } from "sonner";
import { EmbeddedPage } from "@/components/layout/Primitives";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { LeadColorsTab } from "@/components/funnel-settings/LeadColorsTab";
import { PipelineEditor } from "@/components/funnel-settings/PipelineEditor";
import type { AutomationAction } from "@/lib/automation-types";
import {
  useCreatePipeline,
  useCreateStage,
  usePipelineStagesRaw,
  usePipelines,
  useUpdatePipeline,
  type AutomationRuleRow,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { DEFAULT_FUNNEL_STAGES, defaultStageRows, createStageRows } from "@/lib/funnel-defaults";
import { WAREHOUSE_STAGES } from "@/lib/warehouse";
import { useHasModule } from "@/hooks/crm/warehouse";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";

// Voronkalar → "Sozlash": one funnel's whole setup on one screen, laid out
// like amoCRM's pipeline settings (components/funnel-settings/PipelineEditor):
// sources and duplicate control on the left, one column per stage with its
// triggers on the right, plus what 5CRM adds. The funnel's other pages
// (salesbots, web forms, follow-ups...) open from the funnel menu, the
// trigger catalog and the source picker, with a way back.
export const Route = createFileRoute("/funnels_/settings")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { funnel?: string | undefined; tab?: SettingsTab | undefined; bot?: string | undefined } => ({
    funnel: typeof search["funnel"] === "string" ? (search["funnel"] as string) : undefined,
    // Salesbots tab: open this bot ("new" = the «Yangi bot» chooser).
    bot: typeof search["bot"] === "string" ? (search["bot"] as string) : undefined,
    tab: TABS.some((x) => x.key === search["tab"]) ? (search["tab"] as SettingsTab) : undefined,
  }),
  head: () => ({ meta: [{ title: "Voronka sozlamalari — SalesIQ" }] }),
  component: () => <FunnelSettingsPage />,
});

// The old /admin/... addresses redirect to their tab.
const TABS = [
  { key: "stages", icon: Columns3 },
  { key: "automations", icon: Zap },
  { key: "salesbots", icon: Bot },
  { key: "forms", icon: Globe },
  { key: "sources", icon: Webhook },
  { key: "duplicates", icon: Copy },
  { key: "tasks", icon: ListChecks },
  { key: "colors", icon: Palette },
  { key: "followups", icon: BellRing },
  { key: "autoreplies", icon: MessageSquareReply },
  { key: "templates", icon: MessagesSquare },
] as const;
type SettingsTab = (typeof TABS)[number]["key"];

function FunnelSettingsPage() {
  useFunnelSkin();
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { funnel: funnelParam, tab = "stages" } = Route.useSearch();
  const { data: pipelines = [], isLoading } = usePipelines();
  const { data: allStages = [] } = usePipelineStagesRaw();
  const createPipeline = useCreatePipeline();
  const createStage = useCreateStage();
  const updatePipeline = useUpdatePipeline();
  const saving = useIsMutating() > 0;
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
  // Ombor module: a funnel is ordinary sales or warehouse orders.
  const hasWarehouse = useHasModule("warehouse");
  const [newFunnelKind, setNewFunnelKind] = useState<"sales" | "warehouse">("sales");
  const [menuOpen, setMenuOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const canManage = user?.role === "super_admin" || user?.role === "platform_owner";

  const [trigger, setTrigger] = useState<{
    stage: StageLite;
    rule: AutomationRuleRow | null;
    preset?: AutomationAction[];
  } | null>(null);
  const ruleOptions = useRuleEditorOptions(pipeline?.name ?? "");

  function go(funnel: string | undefined, next: SettingsTab) {
    void navigate({
      to: "/funnels/settings",
      search: { ...(funnel ? { funnel } : {}), ...(next !== "stages" ? { tab: next } : {}) },
      replace: true,
    });
  }
  const openTab = (next: SettingsTab) => go(pipeline?.name, next);

  async function addFunnel() {
    const name = newFunnelName.trim();
    if (!name || !user?.organizationId) return;
    try {
      const warehouse = hasWarehouse && newFunnelKind === "warehouse";
      const created = await createPipeline.mutateAsync({
        name,
        organization_id: user.organizationId,
        position: sorted.length,
        ...(warehouse ? { kind: "warehouse" } : {}),
      });
      // Like amoCRM: a new funnel opens with its stages ready, the won and
      // lost ones included. A warehouse funnel's stages stand for order
      // statuses (moving a lead moves its order, see 20270207).
      await createStageRows(
        warehouse
          ? WAREHOUSE_STAGES.map((st, i) => ({
              name: st.name,
              key: `custom-${crypto.randomUUID()}`,
              organization_id: user.organizationId!,
              pipeline_id: created.id,
              pipeline_name: name,
              color: st.color,
              probability: st.probability,
              position: i,
              is_won: !!st.isWon,
              is_lost: !!st.isLost,
              stage_value: st.stageValue,
              order_status: st.orderStatus,
            }))
          : defaultStageRows(DEFAULT_FUNNEL_STAGES, t, {
              organization_id: user.organizationId,
              pipeline_id: created.id,
              pipeline_name: name,
              from: 0,
            }),
        (row) => createStage.mutateAsync(row),
      );
      setNewFunnelOpen(false);
      setNewFunnelName("");
      go(name, "stages");
      toast.success(t("fs.funnelCreated"));
    } catch (err) {
      toast.error(describeError(err, t("fs.saveFailed")));
    }
  }

  // "Nusxalash": a new funnel with the same stages (names, colours, values,
  // hints). Triggers and leads stay with the original.
  async function copyFunnel() {
    if (!pipeline || !user?.organizationId) return;
    const taken = new Set(sorted.map((p) => p.name));
    let name = `${pipeline.name} (${t("amo.copySuffix")})`;
    for (let n = 2; taken.has(name); n++) name = `${pipeline.name} (${t("amo.copySuffix")} ${n})`;
    setCopying(true);
    try {
      const copy = await createPipeline.mutateAsync({
        name,
        organization_id: user.organizationId,
        position: sorted.length,
      });
      for (const s of stages) {
        await createStage.mutateAsync({
          name: s.name,
          key: `custom-${crypto.randomUUID()}`,
          organization_id: user.organizationId,
          pipeline_id: copy.id,
          pipeline_name: name,
          color: s.color,
          position: s.position,
          is_won: s.is_won,
          is_lost: s.is_lost,
          hint: s.hint,
          stage_value: s.stage_value,
          lead_quality: s.lead_quality,
        });
      }
      toast.success(t("amo.copied", { name }));
      go(name, "stages");
    } catch (err) {
      toast.error(describeError(err, t("fs.saveFailed")));
    } finally {
      setCopying(false);
    }
  }

  const tabLabel = (k: SettingsTab) => t(`fs.tab.${k}`);

  return (
    <div className="amo-skin fs-skin -mx-4 -mb-4 -mt-4 flex h-[calc(100%+2rem)] flex-col bg-background text-foreground md:-mx-6 md:-mb-6 md:h-[calc(100%+2.5rem)] phone:-mx-3 phone:-mt-3 phone:h-auto">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-[var(--amo-head)] px-6 phone:h-auto phone:flex-wrap phone:px-3 phone:py-2">
        {tab !== "stages" && (
          <button
            type="button"
            onClick={() => openTab("stages")}
            className="group grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="group flex min-w-0 items-center gap-2 rounded-[4px] py-1 pr-1 text-[15px] font-bold uppercase tracking-[0.05em] text-[var(--amo-head-fg)]"
        >
          <span className="truncate">{pipeline?.name ?? t("fs.title")}</span>
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        </button>
        {menuOpen && (
          <FunnelSwitchPanel
            pipelines={sorted}
            current={pipeline?.id ?? null}
            tab={tab}
            canManage={canManage}
            onClose={() => setMenuOpen(false)}
            onPick={(name) => {
              setMenuOpen(false);
              go(name, "stages");
            }}
            onTab={(key) => {
              setMenuOpen(false);
              openTab(key);
            }}
            onNew={() => {
              setMenuOpen(false);
              setNewFunnelOpen(true);
            }}
            onArchive={
              canManage && pipeline
                ? () => {
                    setMenuOpen(false);
                    updatePipeline.mutate(
                      {
                        id: pipeline.id,
                        patch: {
                          archived_at: pipeline.archived_at ? null : new Date().toISOString(),
                        },
                      },
                      {
                        onSuccess: () => toast.success(t("fs.saved")),
                        onError: (e) => toast.error(describeError(e, t("fs.saveFailed"))),
                      },
                    );
                  }
                : undefined
            }
            archivedNow={!!pipeline?.archived_at}
          />
        )}
        {tab !== "stages" && (
          <span className="truncate text-[14px] text-muted-foreground">/ {tabLabel(tab)}</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {canManage && pipeline && tab === "stages" && (
            <button
              type="button"
              disabled={copying}
              onClick={() => void copyFunnel()}
              className="inline-flex h-9 items-center gap-2 rounded-[4px] border border-border px-4 text-[13px] font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:opacity-60"
            >
              {copying && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("amo.copy")}
            </button>
          )}
          <Link
            to="/funnels"
            search={pipeline ? { funnel: pipeline.name } : {}}
            className="inline-flex h-9 items-center rounded-[4px] px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("common.back")}
          </Link>
          <button
            type="button"
            onClick={() => toast.success(t("amo.allSaved"))}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-[4px] px-4 text-[13px] font-semibold transition-colors",
              saving
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? t("amo.saving") : t("amo.save")}
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="grid flex-1 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !pipeline ? (
        <p className="p-8 text-sm text-muted-foreground">{t("fs.noFunnels")}</p>
      ) : tab === "stages" ? (
        <PipelineEditor
          pipeline={pipeline}
          stages={stages}
          canManage={canManage}
          onOpenTab={openTab}
          onNewTrigger={(stage, actions) => setTrigger({ stage, rule: null, preset: actions })}
          onEditTrigger={(stage, rule) => setTrigger({ stage, rule })}
        />
      ) : (
        <EmbeddedPage.Provider value>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full min-w-0 max-w-[1240px] p-6 phone:p-3">
              {tab === "automations" && <AutomationsTab funnel={pipeline.name} />}
              {tab === "salesbots" && <SalesbotsTab />}
              {tab === "forms" && <WebFormsTab />}
              {tab === "sources" && <LeadSourcesTab />}
              {tab === "duplicates" && <DuplicatesTab />}
              {tab === "tasks" && <TaskControlTab />}
              {tab === "followups" && <FollowupsTab />}
              {tab === "autoreplies" && <AutoRespondersTab />}
              {tab === "templates" && <ChatTemplatesTab />}
              {tab === "colors" && <LeadColorsTab funnel={pipeline.name} />}
            </div>
          </div>
        </EmbeddedPage.Provider>
      )}

      {pipeline && (
        <RuleDialog
          open={!!trigger}
          onOpenChange={(v) => !v && setTrigger(null)}
          rule={trigger?.rule ?? null}
          column={trigger?.stage ?? null}
          funnel={pipeline.name}
          options={ruleOptions}
          preset={trigger?.preset}
        />
      )}

      <Dialog open={newFunnelOpen} onOpenChange={setNewFunnelOpen}>
        <DialogContent className="amo-skin max-w-sm rounded-[6px]">
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
              className="h-10 w-full rounded-[4px] border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            {hasWarehouse && (
              <div
                className="grid grid-cols-2 gap-2"
                role="radiogroup"
                aria-label={t("fs.funnelKind")}
              >
                {(["sales", "warehouse"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={newFunnelKind === k}
                    onClick={() => setNewFunnelKind(k)}
                    className={cn(
                      "rounded-[4px] border px-3 py-2.5 text-left text-[13px]",
                      newFunnelKind === k ? "border-primary bg-primary/5" : "border-border",
                    )}
                  >
                    <span className="block font-semibold">{t(`fs.kind.${k}`)}</span>
                    <span className="block text-[12px] text-muted-foreground">
                      {t(`fs.kind.${k}.desc`)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="submit"
              disabled={!newFunnelName.trim() || createPipeline.isPending || createStage.isPending}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[4px] bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {(createPipeline.isPending || createStage.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {t("fs.create")}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * 5CRM's funnel switcher in the settings: a full-height panel beside the
 * rail -- the funnels (the open one in blue), «Voronka qo'shish», the
 * archived funnels on an inner screen, then the funnel's other settings.
 */
function FunnelSwitchPanel({
  pipelines,
  current,
  tab,
  canManage,
  onClose,
  onPick,
  onTab,
  onNew,
  onArchive,
  archivedNow,
}: {
  pipelines: { id: string; name: string; archived_at?: string | null }[];
  current: string | null;
  tab: SettingsTab;
  canManage: boolean;
  onClose: () => void;
  onPick: (name: string) => void;
  onTab: (key: SettingsTab) => void;
  onNew: () => void;
  onArchive: (() => void) | undefined;
  archivedNow: boolean;
}) {
  const { t } = useI18n();
  const [archiveView, setArchiveView] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const live = pipelines.filter((p) => !p.archived_at);
  const archived = pipelines.filter((p) => p.archived_at);
  const ROW =
    "flex w-full items-center gap-2 border-b border-[var(--amo-divider)] px-6 py-3.5 text-left text-[14px] transition-colors hover:bg-accent/50";
  const rows = (list: typeof pipelines) =>
    list.map((p) => (
      <button key={p.id} type="button" onClick={() => onPick(p.name)} className={ROW}>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            p.id === current ? "font-medium text-primary" : "text-foreground",
          )}
        >
          {p.name}
        </span>
        {p.id === current && <Check className="h-4 w-4 text-primary" />}
      </button>
    ));
  return createPortal(
    <>
      <div className="fixed inset-0 z-[59]" onClick={onClose} aria-hidden />
      <aside className="amo-skin fs-skin fixed bottom-0 left-[72px] top-0 z-[60] flex w-[290px] flex-col border-r border-border bg-[var(--amo-quiet)] text-foreground shadow-[8px_0_24px_-12px_rgba(0,0,0,0.5)] motion-safe:animate-in motion-safe:slide-in-from-left-2 phone:left-0 phone:w-full">
        <button
          type="button"
          onClick={() => (archiveView ? setArchiveView(false) : onClose())}
          className="flex h-16 shrink-0 items-center gap-2 px-6 text-left text-[15px] font-bold uppercase tracking-[0.05em] text-foreground"
        >
          {archiveView && <ChevronLeft className="h-4 w-4" />}
          {archiveView ? t("salesp.archiveTitle") : t("amo.funnels")}
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--amo-divider)]">
          {archiveView ? (
            archived.length ? (
              rows(archived)
            ) : (
              <p className="px-6 py-4 text-[13px] text-muted-foreground">
                {t("salesp.archiveEmpty")}
              </p>
            )
          ) : (
            <>
              {rows(live)}
              {canManage && (
                <button type="button" onClick={onNew} className={cn(ROW, "text-muted-foreground")}>
                  <span className="flex-1">{t("salesp.add")}</span>
                  <Plus className="h-4 w-4" />
                </button>
              )}
              <button type="button" onClick={() => setArchiveView(true)} className={ROW}>
                <span className="flex-1">{t("salesp.archiveTitle")}</span>
                <span className="text-[12px] tabular-nums text-muted-foreground">
                  {archived.length}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <p className="px-6 pb-2 pt-6 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                {t("amo.moreSettings")}
              </p>
              {TABS.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onTab(key)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-6 py-2 text-left text-[13.5px] text-foreground transition-colors hover:bg-accent/50",
                    tab === key && "font-semibold text-primary",
                  )}
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {key === "stages" ? t("amo.stagesAndTriggers") : t(`fs.tab.${key}`)}
                </button>
              ))}
              {onArchive && (
                <button
                  type="button"
                  onClick={onArchive}
                  className="mt-2 flex w-full items-center gap-2.5 border-t border-[var(--amo-divider)] px-6 py-3 text-left text-[13.5px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                >
                  <Archive className="h-4 w-4" />
                  {archivedNow ? t("fs.unarchive") : t("fs.archive")}
                </button>
              )}
            </>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}
