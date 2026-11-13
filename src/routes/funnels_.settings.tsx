import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useIsMutating } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  BellRing,
  Bot,
  Check,
  ChevronDown,
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
import { CrmGate } from "@/components/CrmGate";
import { EmbeddedPage } from "@/components/layout/Primitives";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { DEFAULT_FUNNEL_STAGES, defaultStageRows } from "@/lib/funnel-defaults";
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
      const created = await createPipeline.mutateAsync({
        name,
        organization_id: user.organizationId,
        position: sorted.length,
      });
      // Like amoCRM: a new funnel opens with its stages ready, the won and
      // lost ones included.
      for (const row of defaultStageRows(DEFAULT_FUNNEL_STAGES, t, {
        organization_id: user.organizationId,
        pipeline_id: created.id,
        pipeline_name: name,
        from: 0,
      }))
        await createStage.mutateAsync(row);
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
    <div className="amo-skin -mx-4 -mb-4 -mt-4 flex h-[calc(100%+2rem)] flex-col bg-background text-foreground md:-mx-6 md:-mb-6 md:h-[calc(100%+2.5rem)] phone:-mx-3 phone:-mt-3 phone:h-auto">
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
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="group flex min-w-0 items-center gap-2 rounded-[4px] py-1 pr-1 text-[15px] font-bold uppercase tracking-[0.05em] text-[var(--amo-head-fg)]"
            >
              <span className="truncate">{pipeline?.name ?? t("fs.title")}</span>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground",
                  menuOpen && "rotate-180",
                )}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="amo-skin w-72 rounded-[6px] p-1.5">
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {t("amo.funnels")}
            </p>
            {sorted.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  go(p.name, "stages");
                }}
                className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-2 text-left text-[13px] font-semibold text-foreground hover:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.archived_at && (
                  <Archive
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-label={t("fs.archive")}
                  />
                )}
                {p.id === pipeline?.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setNewFunnelOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-2 text-left text-[13px] font-semibold text-primary hover:bg-accent"
              >
                <Plus className="h-4 w-4" /> {t("fs.newFunnel")}
              </button>
            )}
            <div className="my-1.5 h-px bg-border" />
            <p className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {t("amo.moreSettings")}
            </p>
            {TABS.map(({ key, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  openTab(key);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-accent",
                  tab === key && "bg-accent/70 font-semibold",
                )}
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {key === "stages" ? t("amo.stagesAndTriggers") : tabLabel(key)}
              </button>
            ))}
            {canManage && pipeline && (
              <>
                <div className="my-1.5 h-px bg-border" />
                <button
                  type="button"
                  onClick={() => {
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
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Archive className="h-4 w-4" />
                  {pipeline.archived_at ? t("fs.unarchive") : t("fs.archive")}
                </button>
              </>
            )}
          </PopoverContent>
        </Popover>
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
