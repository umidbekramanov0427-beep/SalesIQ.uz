import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, History, Loader2, Plus, ShieldAlert, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PlanGate } from "@/components/PlanGate";
import { Switch } from "@/components/ui/switch";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, timeAgo } from "@/lib/utils";
import {
  useAutomationRuleRuns,
  useAutomationRules,
  useCreateAutomationRule,
  useDeleteAutomationRule,
  useFunnelNames,
  usePipelineStagesRaw,
  useProfilesRaw,
  useUpdateAutomationRule,
  type AutomationAction,
  type AutomationConditionOperator,
  type AutomationRuleRow,
} from "@/hooks/use-crm-data";

// A fixed, curated set rather than every leads column -- these are the
// fields a condition realistically needs (matches what AmoCRM's own
// Triggers widget offers: a handful of well-known deal properties, not
// the entire schema).
const CONDITION_FIELDS = [
  "temperature",
  "priority",
  "source",
  "budget",
  "expected_revenue",
  "city",
  "region",
  "company_name",
] as const;
const CONDITION_OPERATORS: AutomationConditionOperator[] = ["eq", "neq", "contains", "gt", "lt"];

export const Route = createFileRoute("/admin/automations")({
  head: () => ({
    meta: [
      { title: "Avtomatlashtirish — SalesIQ" },
      {
        name: "description",
        content: "Lid bosqichi o'zgarganda avtomatik ishlaydigan qoidalarni sozlang.",
      },
    ],
  }),
  component: AdminAutomationsPage,
});

const PRIORITIES = ["Urgent", "High", "Normal", "Low"] as const;
type Priority = (typeof PRIORITIES)[number];
const ACTION_TYPES = ["assign_owner", "add_tag", "create_task", "add_note"] as const;
type ActionType = (typeof ACTION_TYPES)[number];

type DraftAction =
  | { type: "assign_owner"; ownerId: string }
  | { type: "add_tag"; tag: string }
  | {
      type: "create_task";
      title: string;
      description: string;
      assigneeId: string;
      dueInDays: string;
      priority: Priority;
    }
  | { type: "add_note"; text: string };

function blankDraft(type: ActionType): DraftAction {
  if (type === "assign_owner") return { type, ownerId: "" };
  if (type === "add_tag") return { type, tag: "" };
  if (type === "add_note") return { type, text: "" };
  return { type, title: "", description: "", assigneeId: "", dueInDays: "", priority: "Normal" };
}

function draftToAction(d: DraftAction): AutomationAction | null {
  if (d.type === "assign_owner")
    return d.ownerId ? { type: "assign_owner", ownerId: d.ownerId } : null;
  if (d.type === "add_tag") return d.tag.trim() ? { type: "add_tag", tag: d.tag.trim() } : null;
  if (d.type === "add_note")
    return d.text.trim() ? { type: "add_note", text: d.text.trim() } : null;
  if (!d.title.trim()) return null;
  return {
    type: "create_task",
    title: d.title.trim(),
    ...(d.description.trim() ? { description: d.description.trim() } : {}),
    ...(d.assigneeId ? { assigneeId: d.assigneeId } : {}),
    ...(d.dueInDays.trim() ? { dueInDays: Number(d.dueInDays) } : {}),
    priority: d.priority,
  };
}

function ActionEditor({
  draft,
  onChange,
  onRemove,
  profiles,
}: {
  draft: DraftAction;
  onChange: (next: DraftAction) => void;
  onRemove: () => void;
  profiles: { id: string; full_name: string }[];
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-xl border border-border bg-background p-3">
      <Pill tone="info">{t(`automations.actionType.${draft.type}`)}</Pill>

      {draft.type === "assign_owner" && (
        <select
          value={draft.ownerId}
          onChange={(e) => onChange({ ...draft, ownerId: e.target.value })}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary/40"
        >
          <option value="">{t("automations.ownerPlaceholder")}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      )}

      {draft.type === "add_tag" && (
        <input
          value={draft.tag}
          onChange={(e) => onChange({ ...draft, tag: e.target.value })}
          placeholder={t("automations.tagPlaceholder")}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary/40"
        />
      )}

      {draft.type === "add_note" && (
        <textarea
          value={draft.text}
          onChange={(e) => onChange({ ...draft, text: e.target.value })}
          placeholder={t("automations.noteTextPlaceholder")}
          rows={2}
          className="h-16 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary/40"
        />
      )}

      {draft.type === "create_task" && (
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          <input
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            placeholder={t("automations.taskTitlePlaceholder")}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary/40 sm:col-span-2"
          />
          <select
            value={draft.assigneeId}
            onChange={(e) => onChange({ ...draft, assigneeId: e.target.value })}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary/40"
          >
            <option value="">{t("automations.taskAssigneeSameOwner")}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <select
            value={draft.priority}
            onChange={(e) => onChange({ ...draft, priority: e.target.value as Priority })}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary/40"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={draft.dueInDays}
            onChange={(e) => onChange({ ...draft, dueInDays: e.target.value })}
            placeholder={t("automations.taskDueInDaysPlaceholder")}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary/40"
          />
          <input
            value={draft.description}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
            placeholder={t("automations.taskDescPlaceholder")}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary/40"
          />
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label={t("automations.removeAction")}
        className="shrink-0 rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function CreateRuleCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();
  const { names: funnels } = useFunnelNames();
  const create = useCreateAutomationRule();

  const [name, setName] = useState("");
  const [funnel, setFunnel] = useState("");
  const [stageId, setStageId] = useState("");
  const [actions, setActions] = useState<DraftAction[]>([]);
  const [newActionType, setNewActionType] = useState<ActionType>("assign_owner");
  const [conditionField, setConditionField] = useState("");
  const [conditionOperator, setConditionOperator] = useState<AutomationConditionOperator>("eq");
  const [conditionValue, setConditionValue] = useState("");
  const [delayMinutes, setDelayMinutes] = useState("");

  const grouped = new Map<string, { id: string; name: string }[]>();
  for (const s of stages ?? []) {
    const key = s.pipeline_name || t("automations.defaultPipeline");
    grouped.set(key, [...(grouped.get(key) ?? []), { id: s.id, name: s.name }]);
  }

  function addAction() {
    setActions((a) => [...a, blankDraft(newActionType)]);
  }

  async function onSubmit() {
    const built = actions.map(draftToAction).filter((a): a is AutomationAction => a !== null);
    if (!name.trim() || !stageId || built.length === 0) return;
    try {
      await create.mutateAsync({
        organizationId: user!.organizationId!,
        name: name.trim(),
        funnel: funnel || null,
        triggerStageId: stageId,
        actions: built,
        createdBy: user!.id,
        conditionField: conditionField || null,
        conditionOperator: conditionField ? conditionOperator : null,
        conditionValue: conditionField ? conditionValue.trim() : null,
        delayMinutes: Math.max(0, Number(delayMinutes) || 0),
      });
      setName("");
      setFunnel("");
      setStageId("");
      setActions([]);
      setConditionField("");
      setConditionValue("");
      setDelayMinutes("");
      toast.success(t("automations.createSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("automations.saveFailed")));
    }
  }

  const canSubmit =
    name.trim().length > 0 &&
    !!stageId &&
    actions.map(draftToAction).some((a) => a !== null) &&
    !create.isPending;

  return (
    <SectionCard title={t("automations.createTitle")} description={t("automations.createDesc")}>
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("automations.namePlaceholder")}
            className="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
          />
          <select
            value={funnel}
            onChange={(e) => setFunnel(e.target.value)}
            className="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
          >
            <option value="">{t("automations.funnelAll")}</option>
            {funnels.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <select
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
        >
          <option value="">{t("automations.triggerStagePlaceholder")}</option>
          {[...grouped.entries()].map(([pipeline, list]) => (
            <optgroup key={pipeline} label={pipeline}>
              {list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <div className="rounded-xl border border-dashed border-border bg-background p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            {t("automations.conditionLabel")}
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              value={conditionField}
              onChange={(e) => setConditionField(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary/40"
            >
              <option value="">{t("automations.conditionFieldAny")}</option>
              {CONDITION_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {t(`automations.conditionField.${f}`)}
                </option>
              ))}
            </select>
            <select
              value={conditionOperator}
              onChange={(e) => setConditionOperator(e.target.value as AutomationConditionOperator)}
              disabled={!conditionField}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary/40 disabled:opacity-50"
            >
              {CONDITION_OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {t(`automations.conditionOperator.${op}`)}
                </option>
              ))}
            </select>
            <input
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value)}
              disabled={!conditionField}
              placeholder={t("automations.conditionValuePlaceholder")}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary/40 disabled:opacity-50"
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            {t("automations.delayLabel")}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={delayMinutes}
              onChange={(e) => setDelayMinutes(e.target.value)}
              placeholder="0"
              className="h-9 w-28 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary/40"
            />
            <span className="text-xs text-subtle">{t("automations.delayHint")}</span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            {t("automations.actionsLabel")}
          </p>
          {actions.map((draft, i) => (
            <ActionEditor
              key={i}
              draft={draft}
              onChange={(next) => setActions((a) => a.map((d, j) => (j === i ? next : d)))}
              onRemove={() => setActions((a) => a.filter((_, j) => j !== i))}
              profiles={profiles ?? []}
            />
          ))}
          <div className="flex items-center gap-2">
            <select
              value={newActionType}
              onChange={(e) => setNewActionType(e.target.value as ActionType)}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary/40"
            >
              {ACTION_TYPES.map((at) => (
                <option key={at} value={at}>
                  {t(`automations.actionType.${at}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addAction}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5" /> {t("automations.addAction")}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={!canSubmit}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("automations.createButton")}
        </button>
      </div>
    </SectionCard>
  );
}

function actionSummary(
  t: (k: string, vars?: Record<string, string>) => string,
  a: AutomationAction,
): string {
  if (a.type === "assign_owner") return t("automations.summary.assignOwner");
  if (a.type === "add_tag") return t("automations.summary.addTag", { tag: a.tag });
  if (a.type === "add_note") return t("automations.summary.addNote");
  return t("automations.summary.createTask", { title: a.title });
}

function RuleRuns({ ruleId }: { ruleId: string }) {
  const { t } = useI18n();
  const { data: runs, isLoading } = useAutomationRuleRuns(ruleId);
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("common.loading")}
      </div>
    );
  }
  if (!runs || runs.length === 0) {
    return <p className="py-3 text-xs text-subtle">{t("automations.runsEmpty")}</p>;
  }
  return (
    <ul className="mt-2 space-y-1.5">
      {runs.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-subtle">{timeAgo(r.ran_at)}</span>
          {r.error ? (
            <span className="max-w-xs truncate text-destructive" title={r.error}>
              {r.error}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t("automations.runActionsCount", {
                count: String((r.actions_applied as unknown[] | null)?.length ?? 0),
              })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function RuleRow({ rule }: { rule: AutomationRuleRow }) {
  const { t } = useI18n();
  const { data: stages } = usePipelineStagesRaw();
  const update = useUpdateAutomationRule();
  const remove = useDeleteAutomationRule();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const stage = (stages ?? []).find((s) => s.id === rule.trigger_stage_id);

  async function toggleEnabled(enabled: boolean) {
    try {
      await update.mutateAsync({ id: rule.id, patch: { enabled } });
    } catch (err) {
      toast.error(describeError(err, t("automations.saveFailed")));
    }
  }

  async function confirmRemove() {
    try {
      await remove.mutateAsync(rule.id);
    } catch (err) {
      toast.error(describeError(err, t("automations.saveFailed")));
    } finally {
      setConfirmDelete(false);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{rule.name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
            <Pill tone="info">{stage?.name ?? t("automations.unknownStage")}</Pill>
            {rule.funnel ? <span>{rule.funnel}</span> : <span>{t("automations.funnelAll")}</span>}
            {rule.condition_field && (
              <Pill tone="neutral">
                {t(`automations.conditionField.${rule.condition_field}`)}{" "}
                {t(`automations.conditionOperator.${rule.condition_operator}`)}{" "}
                {rule.condition_value}
              </Pill>
            )}
            {rule.delay_minutes > 0 && (
              <Pill tone="warning">
                {t("automations.delayBadge", { minutes: String(rule.delay_minutes) })}
              </Pill>
            )}
          </p>
        </div>
        <Switch checked={rule.enabled} onCheckedChange={(v) => void toggleEnabled(v)} />
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label={t("automations.delete")}
          className="shrink-0 rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {rule.actions.map((a, i) => (
          <Pill key={i} tone="neutral">
            {actionSummary(t, a)}
          </Pill>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowRuns((v) => !v)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <History className="h-3.5 w-3.5" />
        {t("automations.viewRuns")}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showRuns && "rotate-180")} />
      </button>
      {showRuns && <RuleRuns ruleId={rule.id} />}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("automations.deleteConfirmTitle")}
        description={t("automations.deleteConfirmDesc")}
        confirmLabel={t("automations.delete")}
        onConfirm={() => void confirmRemove()}
      />
    </li>
  );
}

function AutomationsSettingsPage() {
  const { t } = useI18n();
  const { data: rules, isLoading } = useAutomationRules();

  return (
    <>
      <AdminBackLink />
      <PageHeader title={t("automations.title")} description={t("automations.desc")} />

      <div className="space-y-5">
        <CreateRuleCard />

        <SectionCard title={t("automations.listTitle")}>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </div>
          )}
          {!isLoading && (rules ?? []).length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Zap className="h-6 w-6 text-subtle" />
              <p className="text-sm text-subtle">{t("automations.empty")}</p>
            </div>
          )}
          <ul className="space-y-2">
            {(rules ?? []).map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}

function AdminAutomationsPage() {
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

  return (
    <PlanGate feature="automation">
      <AutomationsSettingsPage />
    </PlanGate>
  );
}
