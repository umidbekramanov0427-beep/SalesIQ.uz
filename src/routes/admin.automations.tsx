import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bot, History, Loader2, Pencil, Plus, ShieldAlert, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PlanGate } from "@/components/PlanGate";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import {
  ActionEditor,
  AddActionSelect,
  DurationInput,
  actionIsComplete,
  blankAction,
  inputCls,
  type ActionEditorOptions,
} from "@/components/automations/ActionEditor";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, timeAgo } from "@/lib/utils";
import {
  STAGE_TRIGGERS,
  TRIGGER_TYPES,
  type AutomationAction,
  type AutomationTriggerType,
} from "@/lib/automation-types";
import {
  useAutomationRuleRuns,
  useAutomationRules,
  useDeleteAutomationRule,
  useLeadCustomFieldDefs,
  useCrmStages,
  useProfilesRaw,
  type AutomationRuleRow,
} from "@/hooks/use-crm-data";
import {
  useRuleOutbox,
  useSalesbots,
  useSaveAutomationRule,
  type RuleDraft,
} from "@/hooks/use-automations";
import { CrmGate } from "@/components/CrmGate";

// Digital pipeline, amoCRM-style: one column per stage of the chosen funnel
// (plus a funnel-wide column), each listing the triggers that fire there.
// Rules execute in the database (see 20261017000000_digital_pipeline_salesbots.sql)
// so they work for leads from any source.

export const Route = createFileRoute("/admin/automations")({
  validateSearch: (search: Record<string, unknown>): { funnel?: string } =>
    typeof search["funnel"] === "string" ? { funnel: search["funnel"] } : {},
  head: () => ({
    meta: [
      { title: "Avtomatizatsiya — SalesIQ" },
      { name: "description", content: "Voronka bosqichlari bo'yicha triggerlar va salesbotlar." },
    ],
  }),
  component: () => (
    <CrmGate>
      <AdminAutomationsPage />
    </CrmGate>
  ),
});

const CONDITION_FIELDS = [
  "temperature",
  "priority",
  "source",
  "budget",
  "city",
  "region",
  "company_name",
] as const;
const CONDITION_OPERATORS = ["eq", "neq", "contains", "gt", "lt"] as const;
const GENERAL = "__general__";
const DEFAULT_FUNNEL = "Direct Sales";

type StageLite = { id: string; name: string; color: string; position: number };

function funnelOf(s: { pipeline_name: string | null }) {
  return s.pipeline_name || DEFAULT_FUNNEL;
}

function durationLabel(minutes: number, t: ReturnType<typeof useI18n>["t"]) {
  if (minutes % 1440 === 0) return t("dp.nDays", { n: minutes / 1440 });
  if (minutes % 60 === 0) return t("dp.nHours", { n: minutes / 60 });
  return t("dp.nMinutes", { n: minutes });
}

/* ------------------------------ rule card ------------------------------ */

function triggerSummary(rule: AutomationRuleRow, t: ReturnType<typeof useI18n>["t"]): string {
  const type = rule.trigger_type as AutomationTriggerType;
  switch (type) {
    case "stage_stuck":
      return t("dp.sum.stage_stuck", { time: durationLabel(rule.trigger_after_minutes ?? 0, t) });
    case "lead_created":
      return rule.trigger_source
        ? t("dp.sum.lead_created_source", { source: rule.trigger_source })
        : t("dp.trigger.lead_created");
    case "tag_added":
      return t("dp.sum.tag_added", { tag: rule.trigger_tag ?? "" });
    case "message_received":
      return rule.trigger_channel
        ? t("dp.sum.message_channel", { channel: t(`dp.channel.${rule.trigger_channel}`) })
        : t("dp.trigger.message_received");
    default:
      return t(`dp.trigger.${type}`);
  }
}

function actionSummary(
  a: AutomationAction,
  t: ReturnType<typeof useI18n>["t"],
  names: { stages: Map<string, string>; bots: Map<string, string> },
) {
  const base = t(`dp.action.${a.type}`);
  switch (a.type) {
    case "add_tag":
    case "remove_tag":
      return `${base}: ${a.tag}`;
    case "move_stage":
      return `${base}: ${names.stages.get(a.stageId) ?? "?"}`;
    case "start_salesbot":
      return `${base}: ${names.bots.get(a.botId) ?? "?"}`;
    case "send_message":
      return `${base} · ${t(`dp.channel.${a.channel}`)}`;
    case "create_task":
      return `${base}: ${a.title}`;
    default:
      return base;
  }
}

function RuleHistory({ ruleId }: { ruleId: string }) {
  const { t } = useI18n();
  const { data: runs, isLoading } = useAutomationRuleRuns(ruleId);
  const { data: outbox } = useRuleOutbox(ruleId);
  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-subtle" />;
  const failedOutbox = (outbox ?? []).filter((o) => o.status === "failed");
  return (
    <div className="space-y-1.5 border-t border-border pt-2 text-[11px]">
      {(runs ?? []).length === 0 ? (
        <p className="text-subtle">{t("dp.noRuns")}</p>
      ) : (
        (runs ?? []).slice(0, 8).map((r) => (
          <p key={r.id} className={r.error ? "text-destructive" : "text-muted-foreground"}>
            {timeAgo(r.ran_at)} · {r.error ? r.error : t("dp.ranOk")}
          </p>
        ))
      )}
      {failedOutbox.slice(0, 3).map((o) => (
        <p key={o.id} className="text-destructive">
          {t("dp.outboxFailed")}: {o.error}
        </p>
      ))}
    </div>
  );
}

function RuleCard({
  rule,
  names,
  onEdit,
}: {
  rule: AutomationRuleRow;
  names: { stages: Map<string, string>; bots: Map<string, string> };
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const save = useSaveAutomationRule();
  const remove = useDeleteAutomationRule();
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border bg-background p-3 text-sm",
        rule.enabled ? "border-border" : "border-dashed border-border opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{rule.name}</p>
          <p className="text-xs text-muted-foreground">
            {triggerSummary(rule, t)}
            {rule.delay_minutes > 0
              ? ` · ${t("dp.after", { time: durationLabel(rule.delay_minutes, t) })}`
              : ""}
          </p>
        </div>
        <Switch
          checked={rule.enabled}
          onCheckedChange={(enabled) =>
            save.mutate(
              {
                id: rule.id,
                draft: { ...ruleToDraft(rule), enabled },
              },
              { onError: (err) => toast.error(describeError(err, t("dp.saveFailed"))) },
            )
          }
        />
      </div>
      {rule.condition_field && (
        <p className="text-xs text-muted-foreground">
          {t("dp.ifShort")}: {t(`dp.cond.${rule.condition_field}`)}{" "}
          {t(`dp.op.${rule.condition_operator ?? "eq"}`)} «{rule.condition_value}»
        </p>
      )}
      <ul className="space-y-1">
        {rule.actions.map((a, i) => (
          <li
            key={i}
            className="truncate rounded-md bg-primary/[0.07] px-2 py-1 text-xs text-foreground"
          >
            {actionSummary(a, t, names)}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md p-1.5 text-subtle hover:bg-accent hover:text-foreground"
          aria-label={t("dp.edit")}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className={cn(
            "rounded-md p-1.5 hover:bg-accent hover:text-foreground",
            showHistory ? "text-primary" : "text-subtle",
          )}
          aria-label={t("dp.history")}
        >
          <History className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="ml-auto rounded-md p-1.5 text-subtle hover:bg-destructive/10 hover:text-destructive"
          aria-label={t("dp.remove")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {showHistory && <RuleHistory ruleId={rule.id} />}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("dp.deleteTitle")}
        description={rule.name}
        onConfirm={() =>
          remove.mutate(rule.id, {
            onError: (err) => toast.error(describeError(err, t("dp.saveFailed"))),
          })
        }
      />
    </div>
  );
}

/* ------------------------------ rule dialog ------------------------------ */

function ruleToDraft(rule: AutomationRuleRow): RuleDraft {
  return {
    name: rule.name,
    funnel: rule.funnel,
    trigger_type: rule.trigger_type,
    trigger_stage_id: rule.trigger_stage_id,
    trigger_source: rule.trigger_source,
    trigger_tag: rule.trigger_tag,
    trigger_channel: rule.trigger_channel,
    trigger_after_minutes: rule.trigger_after_minutes,
    delay_minutes: rule.delay_minutes,
    condition_field: rule.condition_field,
    condition_operator: rule.condition_operator,
    condition_value: rule.condition_value,
    actions: rule.actions,
    enabled: rule.enabled,
  };
}

function RuleDialog({
  open,
  onOpenChange,
  rule,
  column,
  funnel,
  options,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rule: AutomationRuleRow | null;
  column: StageLite | null; // null = funnel-wide column
  funnel: string;
  options: ActionEditorOptions;
}) {
  const { t } = useI18n();
  const save = useSaveAutomationRule();
  const allowed = column
    ? STAGE_TRIGGERS
    : TRIGGER_TYPES.filter((tt) => !STAGE_TRIGGERS.includes(tt));
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [actions, setActions] = useState<AutomationAction[]>([]);

  useEffect(() => {
    if (!open) return;
    if (rule) {
      setDraft(ruleToDraft(rule));
      setActions(rule.actions);
    } else {
      setDraft({
        name: "",
        funnel,
        trigger_type: allowed[0]!,
        trigger_stage_id: column?.id ?? null,
        trigger_source: null,
        trigger_tag: null,
        trigger_channel: null,
        trigger_after_minutes: 60,
        delay_minutes: 0,
        condition_field: null,
        condition_operator: null,
        condition_value: null,
        actions: [],
        enabled: true,
      });
      setActions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule, column?.id, funnel]);

  if (!draft) return null;
  const set = (patch: Partial<RuleDraft>) => setDraft({ ...draft, ...patch });
  const type = draft.trigger_type as AutomationTriggerType;
  const valid =
    actions.length > 0 &&
    actions.every(actionIsComplete) &&
    (type !== "tag_added" || !!draft.trigger_tag?.trim()) &&
    (type !== "stage_stuck" || (draft.trigger_after_minutes ?? 0) > 0);

  async function submit() {
    if (!draft) return;
    const fallbackName = `${t(`dp.trigger.${type}`)} → ${actions
      .map((a) => t(`dp.action.${a.type}`))
      .join(", ")}`;
    try {
      await save.mutateAsync({
        ...(rule ? { id: rule.id } : {}),
        draft: {
          ...draft,
          name: draft.name.trim() || fallbackName.slice(0, 120),
          trigger_after_minutes: type === "stage_stuck" ? draft.trigger_after_minutes : null,
          condition_value: draft.condition_field ? draft.condition_value : null,
          condition_operator: draft.condition_field ? (draft.condition_operator ?? "eq") : null,
          actions,
        },
      });
      toast.success(t("dp.saved"));
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, t("dp.saveFailed")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {rule ? t("dp.editTrigger") : t("dp.newTrigger")}
            {column ? ` · ${column.name}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-subtle">{t("dp.when")}</p>
            <select
              value={type}
              onChange={(e) => set({ trigger_type: e.target.value })}
              className={inputCls}
            >
              {allowed.map((tt) => (
                <option key={tt} value={tt}>
                  {t(`dp.trigger.${tt}`)}
                </option>
              ))}
            </select>
            {type === "stage_stuck" && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">{t("dp.stuckFor")}</p>
                <DurationInput
                  minutes={draft.trigger_after_minutes ?? 60}
                  onChange={(m) => set({ trigger_after_minutes: m })}
                />
              </div>
            )}
            {type === "lead_created" && (
              <input
                value={draft.trigger_source ?? ""}
                onChange={(e) => set({ trigger_source: e.target.value || null })}
                placeholder={t("dp.sourceFilter")}
                className={inputCls}
              />
            )}
            {type === "tag_added" && (
              <input
                value={draft.trigger_tag ?? ""}
                onChange={(e) => set({ trigger_tag: e.target.value || null })}
                placeholder={t("dp.tag")}
                className={inputCls}
              />
            )}
            {type === "message_received" && (
              <select
                value={draft.trigger_channel ?? ""}
                onChange={(e) => set({ trigger_channel: e.target.value || null })}
                className={inputCls}
              >
                <option value="">{t("dp.anyChannel")}</option>
                <option value="telegram">{t("dp.channel.telegram")}</option>
                <option value="whatsapp">{t("dp.channel.whatsapp")}</option>
              </select>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-subtle">
                {t("dp.delay")}
              </p>
              <DurationInput
                minutes={draft.delay_minutes}
                onChange={(m) => set({ delay_minutes: m })}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("dp.delayHint")}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-subtle">
                {t("dp.condition")}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                <select
                  value={draft.condition_field ?? ""}
                  onChange={(e) => set({ condition_field: e.target.value || null })}
                  className={inputCls}
                >
                  <option value="">{t("dp.noCondition")}</option>
                  {CONDITION_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {t(`dp.cond.${f}`)}
                    </option>
                  ))}
                </select>
                {draft.condition_field && (
                  <>
                    <select
                      value={draft.condition_operator ?? "eq"}
                      onChange={(e) => set({ condition_operator: e.target.value })}
                      className={inputCls}
                    >
                      {CONDITION_OPERATORS.map((o) => (
                        <option key={o} value={o}>
                          {t(`dp.op.${o}`)}
                        </option>
                      ))}
                    </select>
                    <input
                      value={draft.condition_value ?? ""}
                      onChange={(e) => set({ condition_value: e.target.value })}
                      className={inputCls}
                    />
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-subtle">{t("dp.then")}</p>
            {actions.map((a, i) => (
              <ActionEditor
                key={i}
                action={a}
                options={options}
                onChange={(next) => setActions(actions.map((x, j) => (j === i ? next : x)))}
                onRemove={() => setActions(actions.filter((_, j) => j !== i))}
              />
            ))}
            <AddActionSelect onAdd={(type) => setActions([...actions, blankAction(type)])} />
          </section>

          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={t("dp.namePlaceholder")}
            className={inputCls}
          />
        </div>

        <DialogFooter>
          <button
            type="button"
            disabled={!valid || save.isPending}
            onClick={() => void submit()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("dp.save")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ board ------------------------------ */

function DigitalPipelinePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { funnel: funnelParam } = Route.useSearch();
  const { data: stages, isLoading: stagesLoading } = useCrmStages();
  const { data: rules, isLoading: rulesLoading } = useAutomationRules();
  const { data: profiles } = useProfilesRaw();
  const { data: bots } = useSalesbots();
  const { data: customDefs } = useLeadCustomFieldDefs();

  const funnels = useMemo(() => {
    const set = new Set<string>();
    for (const s of stages ?? []) set.add(funnelOf(s));
    if (set.size === 0) set.add(DEFAULT_FUNNEL);
    return [...set];
  }, [stages]);
  const funnel = funnelParam && funnels.includes(funnelParam) ? funnelParam : funnels[0]!;

  const funnelStages: StageLite[] = useMemo(
    () =>
      (stages ?? [])
        .filter((s) => funnelOf(s) === funnel)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ id: s.id, name: s.name, color: s.color, position: s.position })),
    [stages, funnel],
  );

  const options: ActionEditorOptions = useMemo(
    () => ({
      profiles: (profiles ?? []).map((p) => ({ id: p.id, full_name: p.full_name || p.email })),
      stages: funnelStages.map((s) => ({ id: s.id, name: s.name })),
      bots: (bots ?? []).map((b) => ({ id: b.id, name: b.name })),
      customFields: (customDefs ?? []).map((d) => ({ key: d.key, label: d.label })),
    }),
    [profiles, funnelStages, bots, customDefs],
  );
  const names = useMemo(
    () => ({
      stages: new Map((stages ?? []).map((s) => [s.id, s.name])),
      bots: new Map((bots ?? []).map((b) => [b.id, b.name])),
    }),
    [stages, bots],
  );

  const stageIds = new Set(funnelStages.map((s) => s.id));
  const generalRules = (rules ?? []).filter(
    (r) =>
      !STAGE_TRIGGERS.includes(r.trigger_type as AutomationTriggerType) &&
      (r.funnel === null || r.funnel === funnel),
  );
  const rulesForStage = (id: string) =>
    (rules ?? []).filter((r) => r.trigger_stage_id === id && stageIds.has(id));

  const [dialog, setDialog] = useState<{
    rule: AutomationRuleRow | null;
    column: StageLite | null;
  } | null>(null);

  const columns: { key: string; stage: StageLite | null; title: string; color?: string }[] = [
    { key: GENERAL, stage: null, title: t("dp.colGeneral") },
    ...funnelStages.map((s) => ({ key: s.id, stage: s, title: s.name, color: s.color })),
  ];

  return (
    <>
      <AdminBackLink />
      <PageHeader
        title={t("dp.title")}
        description={t("dp.desc")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={funnel}
              onChange={(e) =>
                void navigate({ to: "/admin/automations", search: { funnel: e.target.value } })
              }
              className={`${inputCls} h-10 w-auto min-w-[180px]`}
            >
              {funnels.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <Link
              to="/admin/salesbots"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:border-primary/40"
            >
              <Bot className="h-4 w-4 text-primary" /> {t("dp.salesbots")}
            </Link>
          </div>
        }
      />

      {stagesLoading || rulesLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-subtle" />
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
          {columns.map((col) => {
            const list = col.stage ? rulesForStage(col.stage.id) : generalRules;
            return (
              <div
                key={col.key}
                className="flex w-[280px] shrink-0 flex-col gap-2 rounded-2xl border border-border bg-card p-3"
              >
                <div className="flex items-center gap-2">
                  {col.stage ? (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: col.color?.startsWith("#")
                          ? col.color
                          : "var(--color-primary)",
                      }}
                    />
                  ) : (
                    <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {col.title}
                  </p>
                  <span className="text-xs tabular-nums text-subtle">{list.length}</span>
                </div>
                {list.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    names={names}
                    onEdit={() => setDialog({ rule, column: col.stage })}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setDialog({ rule: null, column: col.stage })}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> {t("dp.addTrigger")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <RuleDialog
        open={!!dialog}
        onOpenChange={(v) => !v && setDialog(null)}
        rule={dialog?.rule ?? null}
        column={dialog?.column ?? null}
        funnel={funnel}
        options={options}
      />
    </>
  );
}

function AdminAutomationsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  if (
    user &&
    user.role !== "super_admin" &&
    user.role !== "rop" &&
    user.role !== "platform_owner"
  ) {
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
      <DigitalPipelinePage />
    </PlanGate>
  );
}
