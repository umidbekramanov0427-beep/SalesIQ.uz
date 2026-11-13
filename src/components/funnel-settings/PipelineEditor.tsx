import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Ban,
  Bot,
  CalendarPlus,
  CheckCheck,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  CopyCheck,
  Eraser,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Globe,
  GripVertical,
  Inbox,
  Instagram,
  ListChecks,
  Loader2,
  Lock,
  Pause,
  PencilLine,
  Phone,
  Play,
  Plus,
  Send,
  Shuffle,
  StickyNote,
  Tag,
  Timer,
  TrendingUp,
  Trophy,
  Undo2,
  ScanSearch,
  UserCog,
  Wallet,
  Waypoints,
  Webhook,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LOSS_REASON_KEYS } from "@/components/crm/RequiredTaskDialog";
import { ruleToDraft, type StageLite } from "@/components/funnel-settings/AutomationsTab";
import {
  CelebrateCard,
  MorningBoostCard,
  NotifyCenterCard,
} from "@/components/funnel-settings/ExtraSettingsCards";
import { TriggerCatalog, type SettingsTabKey } from "@/components/funnel-settings/TriggerCatalog";
import { AmoCard, AmoToggle, PickMenu, type PickOption } from "./AmoControls";
import {
  useAutomationRules,
  useCreateStage,
  useDeleteAutomationRule,
  useDeleteStage,
  useStageLeadCounts,
  useStageRules,
  useUpdatePipeline,
  useUpdateStage,
  useWebForms,
  type AutomationRuleRow,
  type PipelineRow,
  type StageRow,
} from "@/hooks/use-crm-data";
import { useSaveAutomationRule } from "@/hooks/use-automations";
import type { AutomationAction, AutomationActionType } from "@/lib/automation-types";
import { asDedupeMode, type DedupeMode } from "@/lib/leads/funnel-dedupe";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { defaultStageRows, missingDefaultStages } from "@/lib/funnel-defaults";
import { STAGE_PALETTE, nextStageColor } from "@/lib/stage-colors";
import { stageValueOf, stageValueOverrides, type StageValue } from "@/lib/stage-value";
import { cn, describeError } from "@/lib/utils";

// Voronkalar → Sozlash, laid out like amoCRM's pipeline settings: on the
// left where the funnel's leads come from (unsorted, duplicate control,
// sources) plus what 5CRM adds (sale celebration, morning boost, the
// notification center); on the right one column per stage -- its name and
// colour, what reaching it means and whether the lead is qualified (5CRM),
// a hint for the manager, and under it the triggers that fire when a lead
// enters it ("Trigger qo'shish" opens the catalog). "+" between columns
// inserts a stage there; columns are dragged by their handle. Everything
// saves the moment it changes.

export type NewTrigger = (stage: StageLite, actions: AutomationAction[]) => void;
export type EditTrigger = (stage: StageLite, rule: AutomationRuleRow) => void;

const ROW = 65; // one grid row, like amoCRM's trigger cells

const fail = (t: (k: string) => string) => (e: unknown) =>
  toast.error(describeError(e, t("fs.saveFailedMigration")));

export function PipelineEditor({
  pipeline,
  stages,
  canManage,
  onOpenTab,
  onNewTrigger,
  onEditTrigger,
}: {
  pipeline: PipelineRow;
  stages: StageRow[];
  canManage: boolean;
  onOpenTab: (tab: SettingsTabKey) => void;
  onNewTrigger: NewTrigger;
  onEditTrigger: EditTrigger;
}) {
  return (
    <div className="flex min-h-0 flex-1 phone:flex-col">
      <SourcesColumn
        pipeline={pipeline}
        stages={stages}
        canManage={canManage}
        onOpenTab={onOpenTab}
      />
      <StageGrid
        pipeline={pipeline}
        stages={stages}
        canManage={canManage}
        onOpenTab={onOpenTab}
        onNewTrigger={onNewTrigger}
        onEditTrigger={onEditTrigger}
      />
    </div>
  );
}

/* ================================================================ left */

function SourcesColumn({
  pipeline,
  stages,
  canManage,
  onOpenTab,
}: {
  pipeline: PipelineRow;
  stages: StageRow[];
  canManage: boolean;
  onOpenTab: (tab: SettingsTabKey) => void;
}) {
  const { t } = useI18n();
  const update = useUpdatePipeline();
  const { data: forms = [] } = useWebForms();
  const [dupOpen, setDupOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const mode = asDedupeMode(pipeline.dedupe_mode);
  const mine = forms.filter((f) => f.default_pipeline_id === pipeline.id);
  const save = (patch: Record<string, unknown>) =>
    update.mutate(
      { id: pipeline.id, patch: patch as never },
      { onSuccess: () => toast.success(t("fs.saved")), onError: fail(t) },
    );

  return (
    <aside className="w-[320px] shrink-0 overflow-y-auto border-r border-border bg-[var(--amo-quiet)] px-6 pb-10 pt-6 phone:w-full phone:border-b phone:border-r-0 phone:px-3">
      <ColumnHeading>{t("amo.sources")}</ColumnHeading>
      <div className="space-y-3">
        <AmoCard
          title={t("amo.unsorted")}
          toggle={
            <AmoToggle
              checked={pipeline.unsorted_enabled ?? true}
              disabled={!canManage}
              label={t("amo.unsorted")}
              onChange={(v) => save({ unsorted_enabled: v })}
            />
          }
        >
          <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
            {t("amo.unsortedDesc", { stage: stages[0]?.name ?? t("fs.def.unsorted") })}
          </p>
        </AmoCard>

        <AmoCard title={t("fs.duplicates")}>
          <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
            {t("amo.dupQuestion")}
          </p>
          <DedupeModePicker
            mode={mode}
            canManage={canManage}
            onPick={(m) => save({ dedupe_mode: m })}
          />
          {mode !== "off" && (
            <button
              type="button"
              onClick={() => setDupOpen(true)}
              className="mt-2.5 text-[13px] font-semibold text-primary underline decoration-primary/40 underline-offset-[3px] transition-colors hover:decoration-primary"
            >
              {t("amo.dupRules")}
            </button>
          )}
        </AmoCard>

        {mine.length === 0 ? (
          <p className="px-0.5 pt-1 text-[12.5px] italic text-muted-foreground">
            {t("amo.noSources")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {mine.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onOpenTab("forms")}
                  className="flex w-full items-center gap-2.5 rounded-[4px] border border-border px-3 py-2.5 text-left transition-colors hover:border-primary/50"
                >
                  <Globe className="h-4 w-4 shrink-0 text-sky-400" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                    {f.name}
                  </span>
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      f.active ? "bg-emerald-500" : "bg-muted-foreground/40",
                    )}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <button
            type="button"
            onClick={() => setPickOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[4px] border border-border px-4 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="h-4 w-4" /> {t("fs.add")}
          </button>
        )}
      </div>

      <ColumnHeading className="mt-9">{t("amo.extra")}</ColumnHeading>
      <div className="space-y-3">
        <CelebrateCard pipeline={pipeline} stages={stages} canManage={canManage} />
        <MorningBoostCard canManage={canManage} />
        <NotifyCenterCard canManage={canManage} />
      </div>

      <DuplicateRulesDialog
        open={dupOpen}
        onOpenChange={setDupOpen}
        pipeline={pipeline}
        canManage={canManage}
        onMore={() => {
          setDupOpen(false);
          onOpenTab("duplicates");
        }}
      />
      <SourcePicker
        open={pickOpen}
        onOpenChange={setPickOpen}
        funnel={pipeline.name}
        onOpenTab={(tab) => {
          setPickOpen(false);
          onOpenTab(tab);
        }}
      />
    </aside>
  );
}

/** The four duplicate modes as cards (5CRM's «Dublikat nazorati»), right in the sidebar. */
function DedupeModePicker({
  mode,
  canManage,
  onPick,
}: {
  mode: DedupeMode;
  canManage: boolean;
  onPick: (m: DedupeMode) => void;
}) {
  const { t } = useI18n();
  const modes: DedupeMode[] = ["repeat", "new", "merge", "off"];
  return (
    <div role="radiogroup" aria-label={t("fs.duplicates")} className="mt-2.5 space-y-1.5">
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          disabled={!canManage}
          onClick={() => mode !== m && onPick(m)}
          className={cn(
            "block w-full rounded-[8px] border px-3 py-2.5 text-left transition-colors disabled:cursor-default",
            mode === m
              ? "border-primary/70 bg-primary/[0.09] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
              : "border-border bg-background/40 enabled:hover:border-primary/40",
          )}
        >
          <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <span className={cn(mode === m && "text-primary")}>{t(`fs.dup.${m}`)}</span>
            {m === "repeat" && (
              <span className="rounded-[4px] bg-muted px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground">
                {t("amo.default")}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
            {t(`fs.dup.${m}Desc`)}
          </span>
        </button>
      ))}
    </div>
  );
}

function ColumnHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "mb-4 text-[13px] font-bold uppercase tracking-[0.07em] text-foreground/90",
        className,
      )}
    >
      {children}
    </h2>
  );
}

function DuplicateRulesDialog({
  open,
  onOpenChange,
  pipeline,
  canManage,
  onMore,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipeline: PipelineRow;
  canManage: boolean;
  onMore: () => void;
}) {
  const { t } = useI18n();
  const update = useUpdatePipeline();
  const mode = asDedupeMode(pipeline.dedupe_mode);
  const save = (patch: Record<string, unknown>) =>
    update.mutate(
      { id: pipeline.id, patch: patch as never },
      { onSuccess: () => toast.success(t("fs.saved")), onError: fail(t) },
    );
  const TASK_MINUTES = [0, 5, 15, 30, 60, 240, 1440];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="amo-skin max-w-lg rounded-[6px]">
        <DialogTitle>{t("fs.duplicates")}</DialogTitle>
        <p className="text-[13px] leading-snug text-muted-foreground">
          {t(`fs.dup.${mode}`)} — {t(`fs.dup.${mode}Desc`)}
        </p>
        {mode !== "off" && (
          <div className="space-y-2.5 border-t border-border pt-3">
            {mode === "repeat" && (
              <Row label={t("fs.dup.reopenLost")}>
                <AmoToggle
                  checked={pipeline.dedupe_reopen_lost ?? true}
                  disabled={!canManage}
                  label={t("fs.dup.reopenLost")}
                  onChange={(v) => save({ dedupe_reopen_lost: v })}
                />
              </Row>
            )}
            {mode !== "new" && (
              <>
                <Row label={t("fs.dup.newAfterWon")}>
                  <AmoToggle
                    checked={pipeline.dedupe_new_after_won ?? true}
                    disabled={!canManage}
                    label={t("fs.dup.newAfterWon")}
                    onChange={(v) => save({ dedupe_new_after_won: v })}
                  />
                </Row>
                <Row label={t("fs.dup.task")}>
                  <select
                    value={pipeline.dedupe_task_minutes ?? 15}
                    disabled={!canManage}
                    onChange={(e) => save({ dedupe_task_minutes: Number(e.target.value) })}
                    className="h-8 rounded-[4px] border border-border bg-background px-2 text-[12.5px] text-foreground"
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
                </Row>
              </>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={onMore}
          className="justify-self-start text-[13px] font-semibold text-primary hover:underline"
        >
          {t("fs.dupRules")}
        </button>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[13px] font-medium text-foreground">
      {label}
      {children}
    </label>
  );
}

function SourcePicker({
  open,
  onOpenChange,
  funnel,
  onOpenTab,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  funnel: string;
  onOpenTab: (tab: SettingsTabKey) => void;
}) {
  const { t } = useI18n();
  const items: {
    key: string;
    icon: LucideIcon;
    tone: string;
    tab?: SettingsTabKey;
    to?: string;
    search?: Record<string, string>;
  }[] = [
    { key: "webForm", icon: Globe, tone: "bg-sky-500/15 text-sky-400", tab: "forms" },
    { key: "telegramBot", icon: Send, tone: "bg-sky-500/15 text-sky-300", tab: "salesbots" },
    {
      key: "instagram",
      icon: Instagram,
      tone: "bg-pink-500/15 text-pink-400",
      to: "/integrations/instagram",
    },
    {
      key: "telephony",
      icon: Phone,
      tone: "bg-emerald-500/15 text-emerald-400",
      to: "/admin/telephony",
    },
    { key: "api", icon: Webhook, tone: "bg-violet-500/15 text-violet-400", tab: "sources" },
    {
      key: "sheets",
      icon: FileSpreadsheet,
      tone: "bg-emerald-500/15 text-emerald-300",
      to: "/funnels",
      search: { funnel },
    },
  ];
  const cls =
    "group flex flex-col items-center gap-2.5 rounded-[6px] border border-border bg-card px-3 pb-4 pt-5 text-center transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/60";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="amo-skin max-w-2xl rounded-[6px]">
        <DialogTitle>{t("fs.pickSource")}</DialogTitle>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((s) => {
            const body = (
              <>
                <span
                  className={cn(
                    "grid h-12 w-12 place-items-center rounded-[12px] transition-transform duration-200 group-hover:scale-105",
                    s.tone,
                  )}
                >
                  <s.icon className="h-6 w-6" />
                </span>
                <span className="text-[13.5px] font-bold text-foreground">
                  {t(`fs.src.${s.key}`)}
                </span>
                <span className="text-[11.5px] leading-snug text-muted-foreground">
                  {t(`fs.src.${s.key}Desc`)}
                </span>
              </>
            );
            return s.to ? (
              <Link key={s.key} to={s.to} search={s.search ?? {}} className={cls}>
                {body}
              </Link>
            ) : (
              <button key={s.key} type="button" className={cls} onClick={() => onOpenTab(s.tab!)}>
                {body}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =============================================================== grid */

const ACTION_ICON: Partial<Record<AutomationActionType, LucideIcon>> = {
  start_salesbot: Bot,
  create_task: CalendarPlus,
  close_tasks: CheckCheck,
  release_owner: Undo2,
  detect_phone: ScanSearch,
  distribute: Shuffle,
  assign_owner: UserCog,
  move_stage: ArrowLeftRight,
  move_funnel: Waypoints,
  close_won: Trophy,
  close_lost: CircleX,
  webhook: Webhook,
  dedupe: CopyCheck,
  delay: Timer,
  send_message: Send,
  set_field: PencilLine,
  add_tag: Tag,
  remove_tag: Eraser,
  add_note: StickyNote,
};

const isNative = (s: StageRow) => s.amocrm_pipeline_id == null && s.bitrix24_category_id == null;

function StageGrid({
  pipeline,
  stages,
  canManage,
  onOpenTab,
  onNewTrigger,
  onEditTrigger,
}: {
  pipeline: PipelineRow;
  stages: StageRow[];
  canManage: boolean;
  onOpenTab: (tab: SettingsTabKey) => void;
  onNewTrigger: NewTrigger;
  onEditTrigger: EditTrigger;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const update = useUpdateStage();
  const create = useCreateStage();
  const [pending, setPending] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [catalogFor, setCatalogFor] = useState<StageLite | null>(null);
  const native = stages.every(isNative);
  const leadCounts = useStageLeadCounts();

  const byId = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const shown = pending
    ? pending.map((id) => byId.get(id)).filter((s): s is StageRow => !!s)
    : stages;
  const closedFrom = shown.findIndex((s) => s.is_won || s.is_lost);
  const end = closedFrom === -1 ? shown.length : closedFrom;
  const movable = (i: number) => canManage && native && i > 0 && i < end;

  async function writeOrder(ids: string[]) {
    setPending(ids);
    try {
      await Promise.all(
        ids.map((id, i) => {
          const s = byId.get(id);
          return s && s.position !== i ? update.mutateAsync({ id, patch: { position: i } }) : null;
        }),
      );
    } catch (e) {
      fail(t)(e);
    } finally {
      setPending(null);
    }
  }

  function moveTo(id: string, target: number) {
    const ids = shown.map((s) => s.id);
    const from = ids.indexOf(id);
    if (from < 0) return;
    ids.splice(from, 1);
    const at = Math.max(1, Math.min(target > from ? target - 1 : target, end - 1));
    ids.splice(at, 0, id);
    if (ids.join() !== shown.map((s) => s.id).join()) void writeOrder(ids);
  }

  async function insertAt(i: number) {
    if (!user?.organizationId) return;
    try {
      await Promise.all(
        shown.map((s, k) => {
          const want = k < i ? k : k + 1;
          return s.position !== want
            ? update.mutateAsync({ id: s.id, patch: { position: want } })
            : null;
        }),
      );
      const row = await create.mutateAsync({
        name: t("amo.newStage"),
        key: `custom-${crypto.randomUUID()}`,
        organization_id: user.organizationId,
        pipeline_id: pipeline.id,
        pipeline_name: pipeline.name,
        color: nextStageColor(stages.map((s) => s.color)),
        position: i,
      });
      setEditingId(row.id);
    } catch (e) {
      fail(t)(e);
    }
  }

  // An empty funnel, or an older one without a won / lost stage: one click
  // adds what it lacks (the same stages a new funnel opens with).
  const missing = canManage && native ? missingDefaultStages(stages) : [];
  const [seeding, setSeeding] = useState(false);
  async function addMissing() {
    if (!user?.organizationId || seeding) return;
    setSeeding(true);
    try {
      const from = stages.reduce((m, s) => Math.max(m, s.position + 1), 0);
      for (const row of defaultStageRows(missing, t, {
        organization_id: user.organizationId,
        pipeline_id: pipeline.id,
        pipeline_name: pipeline.name,
        from,
      }))
        await create.mutateAsync(row);
      toast.success(t("fs.defaultsAdded"));
    } catch (e) {
      fail(t)(e);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-background">
      {!native && (
        <p className="sticky left-0 border-b border-[var(--amo-divider)] bg-amber-500/10 px-5 py-2 text-[12.5px] text-amber-300">
          {t("amo.syncedNote")}
        </p>
      )}
      {missing.length > 0 && (
        <div className="sticky left-0 flex flex-wrap items-center gap-3 border-b border-[var(--amo-divider)] bg-primary/[0.07] px-5 py-2.5 text-[13px]">
          <Trophy className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 text-foreground/90">
            {stages.length === 0 ? t("fs.noStagesYet") : t("fs.addClosingHint")}
          </span>
          <button
            type="button"
            onClick={() => void addMissing()}
            disabled={seeding}
            className="ctl-lit inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-semibold disabled:opacity-60"
          >
            {seeding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {stages.length === 0 ? t("fs.addDefaults") : t("fs.addClosing")}
          </button>
        </div>
      )}
      <div className="flex min-h-full w-max">
        {shown.map((s, i) => (
          <StageColumn
            key={s.id}
            stage={s}
            index={i}
            pipeline={pipeline}
            canManage={canManage}
            canStructure={canManage && isNative(s)}
            system={i === 0 || s.is_won || s.is_lost}
            leadCount={leadCounts.get(s.id) ?? 0}
            movable={movable(i)}
            canInsert={canManage && native && i > 0 && i <= end}
            editing={editingId === s.id}
            onEditDone={() => setEditingId(null)}
            onEdit={() => setEditingId(s.id)}
            onInsert={() => void insertAt(i)}
            dragOver={dragId !== null && overIdx === i && dragId !== s.id}
            onDragStart={() => setDragId(s.id)}
            onDragEnd={() => {
              setDragId(null);
              setOverIdx(null);
            }}
            onDragOverCol={() => setOverIdx(i)}
            onDropCol={() => {
              if (dragId) moveTo(dragId, i);
              setDragId(null);
              setOverIdx(null);
            }}
            onAddTrigger={() =>
              setCatalogFor({ id: s.id, name: s.name, color: s.color, position: s.position })
            }
            onEditTrigger={onEditTrigger}
          />
        ))}
        {canManage && native && (
          <div className="relative w-14 shrink-0">
            <button
              type="button"
              onClick={() => void insertAt(end)}
              aria-label={t("fs.addStage")}
              title={t("fs.addStage")}
              className="sticky top-0 grid h-[38px] w-full place-items-center text-muted-foreground transition-colors hover:text-primary"
            >
              <Plus className="h-5 w-5 transition-transform duration-200 hover:rotate-90" />
            </button>
          </div>
        )}
      </div>
      {(create.isPending || pending) && (
        <Loader2 className="absolute right-4 top-3 h-4 w-4 animate-spin text-muted-foreground" />
      )}
      <TriggerCatalog
        open={!!catalogFor}
        onOpenChange={(v) => !v && setCatalogFor(null)}
        stageName={catalogFor?.name ?? ""}
        onOpenTab={onOpenTab}
        onPick={(actions) => {
          const stage = catalogFor;
          setCatalogFor(null);
          if (stage) onNewTrigger(stage, actions);
        }}
      />
    </div>
  );
}

function StageColumn({
  stage,
  index,
  pipeline,
  canManage,
  canStructure,
  system,
  leadCount,
  movable,
  canInsert,
  editing,
  onEdit,
  onEditDone,
  onInsert,
  dragOver,
  onDragStart,
  onDragEnd,
  onDragOverCol,
  onDropCol,
  onAddTrigger,
  onEditTrigger,
}: {
  stage: StageRow;
  index: number;
  pipeline: PipelineRow;
  /** Value, quality, colour, hint: our own analytics settings, any funnel. */
  canManage: boolean;
  /** Name, order, hiding, deleting, triggers: only the company's own funnels. */
  canStructure: boolean;
  system: boolean;
  /** Leads now in the stage (null while loading). */
  leadCount: number | null;
  movable: boolean;
  canInsert: boolean;
  editing: boolean;
  onEdit: () => void;
  onEditDone: () => void;
  onInsert: () => void;
  dragOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverCol: () => void;
  onDropCol: () => void;
  onAddTrigger: () => void;
  onEditTrigger: EditTrigger;
}) {
  const { t } = useI18n();
  const update = useUpdateStage();
  const remove = useDeleteStage();
  const { data: automations = [] } = useAutomationRules();
  const [name, setName] = useState(stage.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setName(stage.name), [stage.name]);

  const save = (patch: Record<string, unknown>) =>
    update.mutate({ id: stage.id, patch }, { onError: fail(t) });
  const color = stage.color?.startsWith("#")
    ? stage.color
    : stage.is_won
      ? "#22c55e"
      : stage.is_lost
        ? "#94a3b8"
        : "#64748b";
  const value = stageValueOf({ ...stage, position: index });
  const triggers = automations.filter(
    (a) => a.trigger_stage_id === stage.id && (!a.funnel || a.funnel === pipeline.name),
  );
  const lite: StageLite = {
    id: stage.id,
    name: stage.name,
    color: stage.color,
    position: stage.position,
  };

  const VALUE_OPTIONS: PickOption<StageValue>[] = [
    { value: "sale", label: t("fs.v.sale"), icon: CircleCheck, tone: "text-emerald-400" },
    { value: "advance", label: t("fs.v.advance"), icon: Wallet, tone: "text-sky-400" },
    { value: "refused", label: t("fs.v.refused"), icon: CircleX, tone: "text-rose-400" },
    { value: "expected", label: t("fs.v.expected"), icon: TrendingUp, tone: "text-violet-400" },
    { value: "in_work", label: t("fs.v.in_work"), icon: Circle, tone: "text-muted-foreground" },
    { value: "new", label: t("fs.v.new"), icon: Inbox, tone: "text-foreground" },
  ];
  type Quality = "qualified" | "junk" | "none";
  const QUALITY_OPTIONS: PickOption<Quality>[] = [
    { value: "qualified", label: t("fs.q.qualified"), icon: CircleCheck, tone: "text-emerald-400" },
    { value: "junk", label: t("fs.q.junk"), icon: Ban, tone: "text-rose-400" },
    { value: "none", label: t("fs.q.none"), icon: CircleDashed, tone: "text-muted-foreground" },
  ];
  const quality = (stage.lead_quality as Quality | null) ?? "none";

  function commitName() {
    const v = name.trim();
    if (v && v !== stage.name) save({ name: v });
    else setName(stage.name);
    onEditDone();
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverCol();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropCol();
      }}
      className={cn(
        "group/col relative flex w-[305px] shrink-0 flex-col border-r border-[var(--amo-divider)] transition-[background-color,box-shadow] duration-200",
        dragOver && "bg-primary/[0.06] shadow-[inset_3px_0_0_var(--primary)]",
        stage.hidden && "opacity-60",
      )}
    >
      {/* Header: pinned while the triggers scroll under it. */}
      <div className="sticky top-0 z-10 bg-background">
        <div className="group/head relative flex h-[38px] items-center gap-1 px-2">
          {movable ? (
            <span
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", stage.id);
                onDragStart();
              }}
              onDragEnd={onDragEnd}
              title={t("amo.drag")}
              className="grid h-7 w-5 cursor-grab place-items-center text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" />
            </span>
          ) : (
            <span className="grid h-7 w-5 place-items-center text-muted-foreground/50">
              {system && <Lock className="h-3.5 w-3.5" aria-label={t("fs.systemStage")} />}
            </span>
          )}
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setName(stage.name);
                  onEditDone();
                }
              }}
              className="h-7 min-w-0 flex-1 rounded-[3px] border border-primary bg-card px-2 text-center text-[12px] font-bold uppercase tracking-[0.06em] text-foreground outline-none"
            />
          ) : (
            <button
              type="button"
              disabled={!canStructure}
              onClick={onEdit}
              title={canStructure ? t("amo.rename") : undefined}
              className="min-w-0 flex-1 truncate rounded-[3px] px-1 py-1 text-center text-[12px] font-bold uppercase tracking-[0.07em] text-foreground/90 transition-colors enabled:hover:bg-accent/60"
            >
              {stage.name}
            </button>
          )}
          <span className="flex items-center gap-0.5">
            {canManage ? (
              <ColorDot color={color} onPick={(c) => save({ color: c })} />
            ) : (
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            )}
            {canStructure && (!(stage.is_won || stage.is_lost) || stage.hidden) && (
              <button
                type="button"
                onClick={() => save({ hidden: !stage.hidden })}
                title={stage.hidden ? t("amo.show") : t("amo.hide")}
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-[3px] transition-colors hover:bg-accent",
                  stage.hidden ? "text-amber-400" : "text-muted-foreground",
                )}
              >
                {stage.hidden ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            {canStructure && !system && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                title={t("fs.deleteStage")}
                className="grid h-6 w-6 place-items-center rounded-[3px] text-muted-foreground opacity-0 transition-[opacity,color] hover:bg-destructive/10 hover:text-destructive group-hover/head:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </div>

        <div className="space-y-1 px-2.5 pb-2">
          <PickMenu
            title={t("amo.valueTitle")}
            value={value}
            options={VALUE_OPTIONS}
            disabled={!canManage}
            tinted
            onChange={(v) => save({ stage_value: v, ...stageValueOverrides(stage, v) })}
          />
          <PickMenu
            title={t("amo.qualityTitle")}
            value={quality}
            options={QUALITY_OPTIONS}
            disabled={!canManage}
            tinted
            onChange={(v) => save({ lead_quality: v === "none" ? null : v })}
          />
        </div>

        <div className="relative h-[3px]" style={{ backgroundColor: color }}>
          {canInsert && (
            <button
              type="button"
              onClick={onInsert}
              title={t("amo.insertHere")}
              aria-label={t("amo.insertHere")}
              className="absolute left-0 top-1/2 z-10 grid h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-[color,border-color,transform] duration-200 hover:scale-110 hover:border-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {(stage.is_won || stage.is_lost) && (
          <p className="flex items-center gap-1.5 px-3 pt-2 text-[11.5px] leading-snug text-muted-foreground">
            <EyeOff className="h-3 w-3 shrink-0" />
            {t("fs.closedOnBoard")}
          </p>
        )}
        <HintRow stage={stage} canManage={canManage} />
        <RuleBadges stage={stage} pipeline={pipeline} />
        <p className="border-t border-[var(--amo-divider)] px-3 py-1.5 text-[12px] font-semibold tabular-nums text-muted-foreground">
          {leadCount === null ? "…" : t("amo.leadCount", { n: leadCount })}
        </p>
      </div>

      {/* Triggers on the amoCRM row grid. */}
      <div
        className="flex-1"
        style={{
          backgroundImage: `linear-gradient(to bottom, transparent ${ROW - 1}px, var(--amo-divider) ${ROW - 1}px)`,
          backgroundSize: `100% ${ROW}px`,
        }}
      >
        {triggers.map((a) => (
          <TriggerCard
            key={a.id}
            rule={a}
            onOpen={() => onEditTrigger(lite, a)}
            canManage={canStructure}
          />
        ))}
        {canStructure && (
          <button
            type="button"
            onClick={onAddTrigger}
            style={{ height: ROW }}
            className={cn(
              "flex w-full items-center justify-center gap-2 text-[14px] text-muted-foreground transition-[opacity,color] duration-200 hover:text-foreground",
              index === 0 && triggers.length === 0
                ? "opacity-100"
                : "opacity-0 focus-visible:opacity-100 group-hover/col:opacity-100",
            )}
          >
            <span className="grid h-6 w-6 place-items-center rounded-full border border-current">
              <Plus className="h-3.5 w-3.5" />
            </span>
            {t("fs.addTrigger")}
          </button>
        )}
        {stage.is_lost && <LossReasons pipeline={pipeline} canManage={canManage} />}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("fs.deleteStageTitle", { name: stage.name })}
        description={t("fs.deleteStageDesc")}
        confirmLabel={t("fs.delete")}
        destructive
        onConfirm={() => remove.mutate(stage.id, { onError: fail(t) })}
      />
    </div>
  );
}

function ColorDot({ color, onPick }: { color: string; onPick: (c: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("amo.color")}
          className="grid h-6 w-6 place-items-center rounded-[3px] transition-colors hover:bg-accent"
        >
          <span
            className="h-2.5 w-2.5 rounded-full ring-2 ring-transparent transition-shadow hover:ring-white/30"
            style={{ backgroundColor: color }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="amo-skin w-auto rounded-[6px] p-2.5">
        <div className="grid grid-cols-5 gap-1.5">
          {STAGE_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(c);
              }}
              className={cn(
                "h-7 w-7 rounded-full transition-transform hover:scale-110",
                c.toLowerCase() === color.toLowerCase() &&
                  "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
              )}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Small marks under a column for the rules set in "⋯". */
function RuleBadges({ stage, pipeline }: { stage: StageRow; pipeline: PipelineRow }) {
  const { t } = useI18n();
  const { data: rules = [] } = useStageRules();
  const rule = rules.find((r) => r.stage_id === stage.id);
  const marks = [
    rule?.requires_task && { icon: ListChecks, label: t("fs.taskRequired") },
    rule?.requires_note && { icon: StickyNote, label: t("amo.noteRequired") },
    pipeline.celebrate_stage_id === stage.id && { icon: Zap, label: t("xs.celebrate") },
  ].filter(Boolean) as { icon: LucideIcon; label: string }[];
  if (marks.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1 border-b border-[var(--amo-divider)] px-2 py-1.5">
      {marks.map((m) => (
        <span
          key={m.label}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary"
        >
          <m.icon className="h-3 w-3" /> {m.label}
        </span>
      ))}
    </div>
  );
}

function HintRow({ stage, canManage }: { stage: StageRow; canManage: boolean }) {
  const { t } = useI18n();
  const update = useUpdateStage();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(stage.hint ?? "");
  useEffect(() => setText(stage.hint ?? ""), [stage.hint]);
  function save() {
    const v = text.trim();
    if (v !== (stage.hint ?? ""))
      update.mutate({ id: stage.id, patch: { hint: v || null } }, { onError: fail(t) });
    setOpen(false);
  }
  return (
    <Popover open={open} onOpenChange={(v) => (v ? setOpen(true) : save())}>
      <PopoverTrigger asChild disabled={!canManage}>
        <button
          type="button"
          className="flex min-h-[42px] w-full items-center justify-center border-b border-[var(--amo-divider)] px-4 py-2 text-center transition-colors enabled:hover:bg-accent/30"
        >
          {stage.hint ? (
            <span className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">
              💡 {stage.hint}
            </span>
          ) : (
            <span className="text-[13px] text-muted-foreground underline decoration-dotted underline-offset-[3px]">
              {canManage ? t("amo.addHint") : " "}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="amo-skin w-72 rounded-[6px] p-3">
        <p className="mb-1.5 text-[12px] font-semibold text-foreground">{t("fs.addHint")}</p>
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          placeholder={t("fs.hintPh")}
          className="w-full resize-none rounded-[4px] border border-border bg-background px-2.5 py-2 text-[12.5px] leading-snug text-foreground outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={save}
          className="mt-2 h-8 w-full rounded-[4px] bg-primary text-[12.5px] font-semibold text-primary-foreground"
        >
          {t("amo.saveHint")}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function TriggerCard({
  rule,
  onOpen,
  canManage,
}: {
  rule: AutomationRuleRow;
  onOpen: () => void;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const save = useSaveAutomationRule();
  const remove = useDeleteAutomationRule();
  const [confirm, setConfirm] = useState(false);
  const first = rule.actions[0];
  const Icon = (first && ACTION_ICON[first.type]) || Zap;
  const summary = rule.actions.map((a) => t(`dp.action.${a.type}`)).join(" · ");
  return (
    <div
      style={{ height: ROW }}
      className={cn("group/trg relative px-1.5 py-1", !rule.enabled && "opacity-55")}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full items-center gap-2.5 rounded-[4px] px-2 text-left transition-colors hover:bg-accent/50"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-primary/40 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] text-muted-foreground">
            {t(`dp.trigger.${rule.trigger_type}`)}
          </span>
          <span className="block truncate text-[12.5px] font-semibold text-foreground">
            {rule.name}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">{summary}</span>
        </span>
      </button>
      {canManage && (
        <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-hover/trg:opacity-100">
          <button
            type="button"
            title={rule.enabled ? t("amo.pause") : t("amo.run")}
            onClick={() =>
              save.mutate(
                { id: rule.id, draft: { ...ruleToDraft(rule), enabled: !rule.enabled } },
                { onError: fail(t) },
              )
            }
            className="grid h-7 w-7 place-items-center rounded-[3px] bg-background/80 text-muted-foreground hover:text-primary"
          >
            {rule.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            title={t("fs.delete")}
            onClick={() => setConfirm(true)}
            className="grid h-7 w-7 place-items-center rounded-[3px] bg-background/80 text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("amo.deleteTrigger", { name: rule.name })}
        confirmLabel={t("fs.delete")}
        destructive
        onConfirm={() => remove.mutate(rule.id, { onError: fail(t) })}
      />
    </div>
  );
}

/** "Rad sabablari" under the lost column: required switch and the company's list. */
function LossReasons({ pipeline, canManage }: { pipeline: PipelineRow; canManage: boolean }) {
  const { t } = useI18n();
  const update = useUpdatePipeline();
  const defaults = LOSS_REASON_KEYS.map((k) => t(`guard.loss.${k}`));
  const list = pipeline.loss_reasons?.length ? pipeline.loss_reasons : defaults;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(list);
  const [add, setAdd] = useState("");
  const save = (patch: Record<string, unknown>) =>
    update.mutate(
      { id: pipeline.id, patch: patch as never },
      { onSuccess: () => toast.success(t("fs.saved")), onError: fail(t) },
    );
  return (
    <section className="m-2 rounded-[4px] border border-border bg-background p-3.5">
      <div className="flex items-center gap-2">
        <h4 className="flex-1 text-[12px] font-bold uppercase tracking-[0.08em] text-foreground/90">
          {t("fs.reasons")}
        </h4>
        <AmoToggle
          checked={pipeline.loss_reason_required ?? true}
          disabled={!canManage}
          label={t("amo.reasonsRequired")}
          onChange={(v) => save({ loss_reason_required: v })}
        />
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
        {t("amo.reasonsDesc")}
      </p>
      {editing ? (
        <div className="mt-2.5 space-y-1.5">
          {draft.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={r}
                onChange={(e) => setDraft(draft.map((x, j) => (j === i ? e.target.value : x)))}
                className="h-8 min-w-0 flex-1 rounded-[4px] border border-border bg-card px-2 text-[12.5px] text-foreground outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                className="grid h-8 w-8 place-items-center rounded-[4px] text-muted-foreground hover:text-destructive"
                aria-label={t("fs.delete")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (add.trim()) setDraft([...draft, add.trim()]);
              setAdd("");
            }}
          >
            <input
              value={add}
              onChange={(e) => setAdd(e.target.value)}
              placeholder={t("amo.reasonAdd")}
              className="h-8 min-w-0 flex-1 rounded-[4px] border border-dashed border-border bg-transparent px-2 text-[12.5px] text-foreground outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="grid h-8 w-8 place-items-center text-primary"
              aria-label={t("fs.add")}
            >
              <Plus className="h-4 w-4" />
            </button>
          </form>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                const clean = draft.map((x) => x.trim()).filter(Boolean);
                save({ loss_reasons: clean.length ? clean : null });
                setEditing(false);
              }}
              className="h-8 flex-1 rounded-[4px] bg-primary text-[12.5px] font-semibold text-primary-foreground"
            >
              {t("amo.saveHint")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-8 rounded-[4px] px-3 text-[12.5px] text-muted-foreground hover:text-foreground"
            >
              {t("fs.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <ul className="mt-2.5 space-y-1.5">
            {list.map((r) => (
              <li key={r} className="text-[13px] text-foreground">
                {r}
              </li>
            ))}
          </ul>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setDraft(list);
                setEditing(true);
              }}
              className="mt-2.5 text-[13px] font-semibold text-primary underline decoration-primary/40 underline-offset-[3px] hover:decoration-primary"
            >
              {t("amo.configure")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
