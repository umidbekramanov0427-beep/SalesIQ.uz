import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, History, Loader2, Pencil, Plus, ShieldAlert, Trash2, X, Zap } from "lucide-react";
import {
  CONDITION_OPS,
  conditionsToRule,
  ruleToConditions,
  type TriggerCondition,
} from "@/lib/automations/trigger-kit";
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
  Inline,
  actionIsComplete,
  bareCls,
  blankAction,
  inputCls,
  type ActionEditorOptions,
} from "@/components/automations/ActionEditor";
import { useI18n } from "@/lib/i18n";
import { LOSS_REASON_KEYS } from "@/components/crm/RequiredTaskDialog";
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
  usePipelines,
  useProfilesRaw,
  type AutomationRuleRow,
} from "@/hooks/use-crm-data";
import {
  useRuleOutbox,
  useSalesbots,
  useApplyRuleToStage,
  useSaveAutomationRule,
  type RuleDraft,
} from "@/hooks/use-automations";

// Digital pipeline, amoCRM-style: one column per stage of the chosen funnel
// (plus a funnel-wide column), each listing the triggers that fire there.
// Rules execute in the database (see 20261017000000_digital_pipeline_salesbots.sql)
// so they work for leads from any source.

// «Barcha lidlar uchun, qaysiki:» -- the guide's list, then company fields.
const CONDITION_FIELDS = [
  "budget",
  "paid_amount",
  "owner_id",
  "tags",
  "phone",
  "alt_phone",
  "source",
  "funnel",
  "region",
  "city",
  "temperature",
  "priority",
  "company_name",
] as const;
const GENERAL = "__general__";
const DEFAULT_FUNNEL = "Direct Sales";

export type StageLite = { id: string; name: string; color: string; position: number };

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
    case "daily":
      return t("dp.sum.daily", { time: (rule.trigger_time ?? "09:00").slice(0, 5) });
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
      return [
        `${base} · ${t(`dp.channel.${a.channel}`)}`,
        a.files?.length ? t("dp.sumFiles", { n: a.files.length }) : "",
        a.buttons?.length ? t("dp.sumButtons", { n: a.buttons.length }) : "",
      ]
        .filter(Boolean)
        .join(" · ");
    case "create_task":
      return `${base}: ${a.title}`;
    case "delay":
      return `${base}: ${durationLabel(a.minutes, t)}`;
    case "move_funnel":
      return `${base}: ${a.funnel}`;
    case "distribute":
      return `${base}: ${t("dp.nPeople", { n: a.ownerIds.length })}`;
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
          {t("dp.ifShort")}:{" "}
          {ruleToConditions(rule)
            .map(
              (c) =>
                `${c.field.startsWith("custom:") ? c.field.slice(7) : t(`dp.cond.${c.field}`)} ${t(`dp.op.${c.operator}`)} «${c.value}»`,
            )
            .join(" · ")}
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

export function ruleToDraft(rule: AutomationRuleRow): RuleDraft {
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
    // Sent only once written (the column is newer than the rest).
    note: rule.note ?? undefined,
    // Only sent for daily rules, so saving works before the column exists.
    ...(rule.trigger_type === "daily" ? { trigger_time: rule.trigger_time ?? "09:00" } : {}),
  };
}

export function RuleDialog({
  open,
  onOpenChange,
  rule,
  column,
  funnel,
  options,
  preset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rule: AutomationRuleRow | null;
  column: StageLite | null; // null = funnel-wide column
  funnel: string;
  options: ActionEditorOptions;
  /** A new trigger's first actions, picked in the trigger catalog. */
  preset?: AutomationAction[] | undefined;
}) {
  const { t } = useI18n();
  const save = useSaveAutomationRule();
  const applyExisting = useApplyRuleToStage();
  const [toExisting, setToExisting] = useState(false);
  // 5CRM's «Har kuni soatda (Toshkent)»: the same steps again every day for
  // the leads still in this stage (saved as a companion daily trigger).
  const [dailyAt, setDailyAt] = useState("");
  // 5CRM's «Bajarish:» in a stage column: on entering the stage (default)
  // or when the lead's owner changes there; our other stage events follow.
  const allowed: AutomationTriggerType[] = column
    ? ["stage_enter", "owner_changed", ...STAGE_TRIGGERS.filter((tt) => tt !== "stage_enter")]
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
      setActions(preset ?? []);
    }
    setToExisting(false);
    setDailyAt("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule, column?.id, funnel, preset]);

  const [noteOpen, setNoteOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isPhone =
    typeof document !== "undefined" && document.documentElement.classList.contains("phone");
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || isPhone) return;
    const el = column ? document.querySelector(`[data-stage-col="${column.id}"]`) : null;
    const r = el?.getBoundingClientRect();
    const W = 470;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(12, Math.min(r ? r.left : (vw - W) / 2, vw - W - 12));
    const top = Math.max(12, Math.min(r ? r.top + 44 : 80, vh - 320));
    setPos({ left, top, maxH: vh - top - 12 });
  }, [open, isPhone, column]);
  // Closes on a click outside it (not on the selects' own pop-ups) or Esc.
  useEffect(() => {
    if (!open || isPhone) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (!el || panelRef.current?.contains(el)) return;
      if (el.closest("[data-radix-popper-content-wrapper], [role=dialog], [role=alertdialog]"))
        return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, isPhone, onOpenChange]);
  useEffect(() => {
    if (open) setNoteOpen(false);
  }, [open]);

  if (!draft) return null;
  const set = (patch: Partial<RuleDraft>) => setDraft({ ...draft, ...patch });
  const type = draft.trigger_type as AutomationTriggerType;
  const conds = ruleToConditions(draft);
  const setConds = (list: TriggerCondition[]) => set(conditionsToRule(list));
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
      const id = await save.mutateAsync({
        ...(rule ? { id: rule.id } : {}),
        draft: {
          ...draft,
          name: draft.name.trim() || fallbackName.slice(0, 120),
          trigger_after_minutes: type === "stage_stuck" ? draft.trigger_after_minutes : null,
          ...(type === "daily"
            ? { trigger_time: draft.trigger_time ?? "09:00" }
            : { trigger_time: undefined }),
          // Rows left without a value are dropped.
          ...conditionsToRule(ruleToConditions(draft).filter((c) => c.value.trim() !== "")),
          // «Lidda mas'ul almashganda» in a stage column is that stage's.
          trigger_stage_id:
            column && (STAGE_TRIGGERS.includes(type) || type === "owner_changed")
              ? column.id
              : draft.trigger_stage_id,
          actions,
        },
      });
      if (dailyAt && column && type === "stage_enter") {
        await save.mutateAsync({
          draft: {
            ...draft,
            name: `${(draft.name.trim() || fallbackName).slice(0, 100)} · ${t("tk.daily.suffix")}`,
            trigger_type: "daily",
            trigger_time: dailyAt,
            trigger_stage_id: column.id,
            trigger_after_minutes: null,
            ...conditionsToRule(ruleToConditions(draft).filter((c) => c.value.trim() !== "")),
            actions,
          },
        });
      }
      toast.success(t("dp.saved"));
      if (toExisting && type === "stage_enter" && id) {
        const n = await applyExisting.mutateAsync(id);
        toast.success(t("dp.appliedExisting", { n }));
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, t("dp.saveFailed")));
    }
  }

  // 5CRM: the form floats beside the column that was clicked, the board
  // stays in view behind it; it can be pulled bigger by its corner.
  const body = (
    <div className="text-[13.5px] text-foreground">
      <section className="space-y-2 bg-[var(--amo-quiet,var(--muted))] px-4 py-4">
        <p className="text-[14px] text-foreground">{t("tk.forAll")}</p>
        {conds.map((c, i) => (
          <div key={i} className="grid grid-cols-[1.2fr_1fr_1.2fr_auto] gap-1.5">
            <select
              value={c.field}
              onChange={(e) =>
                setConds(
                  conds.map((x, j) => (j === i ? { ...x, field: e.target.value, value: "" } : x)),
                )
              }
              className={inputCls}
            >
              {CONDITION_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {t(`dp.cond.${f}`)}
                </option>
              ))}
              {options.customFields.map((cf) => (
                <option key={cf.key} value={`custom:${cf.key}`}>
                  {cf.label}
                </option>
              ))}
            </select>
            <select
              value={c.operator}
              onChange={(e) =>
                setConds(conds.map((x, j) => (j === i ? { ...x, operator: e.target.value } : x)))
              }
              className={inputCls}
            >
              {CONDITION_OPS.map((o) => (
                <option key={o} value={o}>
                  {t(`dp.op.${o}`)}
                </option>
              ))}
            </select>
            {c.field === "owner_id" ? (
              <select
                value={c.value}
                onChange={(e) =>
                  setConds(conds.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                }
                className={inputCls}
              >
                <option value="">{t("dp.chooseEmployee")}</option>
                {options.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={c.value}
                type={["budget", "paid_amount"].includes(c.field) ? "number" : "text"}
                onChange={(e) =>
                  setConds(conds.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                }
                placeholder={t("dp.value")}
                className={inputCls}
              />
            )}
            <button
              type="button"
              aria-label={t("dp.remove")}
              onClick={() => setConds(conds.filter((_, j) => j !== i))}
              className="grid h-10 w-8 place-items-center rounded-md text-subtle hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setConds([...conds, { field: "budget", operator: "eq", value: "" }])}
          className="flex h-10 w-full items-center rounded-[3px] border border-border bg-background/40 px-3 text-left text-muted-foreground hover:text-foreground"
        >
          {t("tk.addCond")}
        </button>
      </section>

      <div className="space-y-3 px-4 py-4">
        <Inline label={t("tk.run")}>
          <select
            data-bare
            value={type}
            onChange={(e) => set({ trigger_type: e.target.value })}
            className={bareCls}
          >
            {allowed.slice(0, column ? 2 : allowed.length).map((tt) => (
              <option key={tt} value={tt}>
                {t(`dp.trigger.${tt}`)}
              </option>
            ))}
            {column && (
              <optgroup label={t("tk.otherEvents")}>
                {allowed.slice(2).map((tt) => (
                  <option key={tt} value={tt}>
                    {t(`dp.trigger.${tt}`)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Inline>
        {type === "stage_stuck" && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">{t("dp.stuckFor")}</p>
            <DurationInput
              minutes={draft.trigger_after_minutes ?? 60}
              onChange={(m) => set({ trigger_after_minutes: m })}
            />
          </div>
        )}
        {type === "daily" && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">{t("dp.dailyAt")}</p>
            <input
              type="time"
              value={(draft.trigger_time ?? "09:00").slice(0, 5)}
              onChange={(e) => set({ trigger_time: e.target.value || "09:00" })}
              className={`${inputCls} w-32`}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("dp.dailyHint")}</p>
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
          </select>
        )}
        {draft.delay_minutes > 0 && (
          <div>
            <p className="mb-1 text-[12.5px] text-muted-foreground">{t("dp.delay")}</p>
            <DurationInput
              minutes={draft.delay_minutes}
              onChange={(m) => set({ delay_minutes: m })}
            />
          </div>
        )}

        {actions.map((a, i) => (
          <ActionEditor
            key={i}
            action={a}
            options={options}
            onChange={(next) => setActions(actions.map((x, j) => (j === i ? next : x)))}
            {...(actions.length > 1
              ? { onRemove: () => setActions(actions.filter((_, j) => j !== i)) }
              : {})}
          />
        ))}
        {actions.length === 0 ? (
          <AddActionSelect onAdd={(type) => setActions([blankAction(type)])} />
        ) : (
          <label className="relative inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline">
            <Plus className="h-3.5 w-3.5" /> {t("tk.addAction")}
            <span className="absolute inset-0 opacity-0">
              <AddActionSelect onAdd={(type) => setActions([...actions, blankAction(type)])} />
            </span>
          </label>
        )}

        {noteOpen || draft.note ? (
          <textarea
            value={draft.note ?? ""}
            onChange={(e) => set({ note: e.target.value.slice(0, 500) })}
            rows={2}
            placeholder={t("tk.notePh")}
            className={`${inputCls} h-auto py-2`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="ml-4 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
          >
            + {t("tk.addNote")}
          </button>
        )}

        {column && type === "stage_enter" && (
          <label className="flex items-center gap-2.5 pt-1">
            <input
              type="checkbox"
              checked={toExisting}
              onChange={(e) => setToExisting(e.target.checked)}
            />
            {t("tk.applyExisting")}
          </label>
        )}
        {column && type === "stage_enter" && !rule && (
          <div className="flex items-center justify-between gap-3">
            <span className="whitespace-nowrap">{t("tk.daily.label")}</span>
            <input
              type="time"
              value={dailyAt}
              onChange={(e) => setDailyAt(e.target.value)}
              className="h-8 w-[104px] shrink-0 rounded-[3px] border border-border bg-[var(--amo-quiet,var(--background))] px-2 text-[13px] text-foreground outline-none focus:border-primary/60"
            />
          </div>
        )}

        <div className="flex items-center gap-4 pt-2">
          <button
            type="button"
            disabled={!valid || save.isPending || applyExisting.isPending}
            onClick={() => void submit()}
            className="inline-flex h-10 items-center gap-2 rounded-[4px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("tk.done")}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-[14px] font-semibold text-muted-foreground hover:text-foreground"
          >
            {t("tk.cancel")}
          </button>
        </div>
      </div>
    </div>
  );

  // Phones: the same form as a sheet over the page.
  if (isPhone) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="amo-skin tf-form max-h-[90dvh] overflow-y-auto p-0">
          <DialogTitle className="sr-only">
            {rule ? t("dp.editTrigger") : t("dp.newTrigger")}
          </DialogTitle>
          {body}
        </DialogContent>
      </Dialog>
    );
  }
  if (!open || !pos) return null;
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={rule ? t("dp.editTrigger") : t("dp.newTrigger")}
      style={{ left: pos.left, top: pos.top, maxHeight: pos.maxH }}
      className="amo-skin tf-form fixed z-[65] w-[470px] min-w-[380px] max-w-[92vw] resize overflow-auto rounded-[4px] border border-border bg-card shadow-[0_18px_48px_-12px_rgba(0,0,0,0.55)] motion-safe:animate-in motion-safe:fade-in-0"
    >
      {body}
    </div>,
    document.body,
  );
}

/* ------------------------------ board ------------------------------ */

/** What the action editor offers for one funnel: people, its stages, bots, fields, other funnels. */
export function useRuleEditorOptions(funnel: string): ActionEditorOptions {
  const { data: stages } = useCrmStages();
  const { data: profiles } = useProfilesRaw();
  const { data: bots } = useSalesbots();
  const { data: customDefs } = useLeadCustomFieldDefs();
  const { data: pipelines } = usePipelines();
  const { t } = useI18n();
  return useMemo(() => {
    const all = stages ?? [];
    const own = (pipelines ?? []).find((p) => p.name === funnel);
    return {
      profiles: (profiles ?? []).map((p) => ({ id: p.id, full_name: p.full_name || p.email })),
      stages: all
        .filter((s) => funnelOf(s) === funnel)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ id: s.id, name: s.name })),
      bots: (bots ?? []).map((b) => ({ id: b.id, name: b.name })),
      customFields: (customDefs ?? []).map((d) => ({ key: d.key, label: d.label })),
      funnels: [...new Set(all.map(funnelOf))].filter((f) => f !== funnel),
      funnelStages: all
        .filter((s) => funnelOf(s) !== funnel)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ id: s.id, name: s.name, funnel: funnelOf(s) })),
      // «Sifat nazorati»: the funnel's own closing reasons, else the defaults.
      lossReasons: own?.loss_reasons?.length
        ? own.loss_reasons
        : LOSS_REASON_KEYS.map((k) => t(`guard.loss.${k}`)),
    };
  }, [stages, profiles, bots, customDefs, pipelines, funnel, t]);
}

function DigitalPipelinePage({ funnel: funnelParam }: { funnel: string }) {
  const { t } = useI18n();
  const { data: stages, isLoading: stagesLoading } = useCrmStages();
  const { data: rules, isLoading: rulesLoading } = useAutomationRules();
  const { data: bots } = useSalesbots();

  const funnels = useMemo(() => {
    const set = new Set<string>();
    for (const s of stages ?? []) set.add(funnelOf(s));
    if (set.size === 0) set.add(DEFAULT_FUNNEL);
    return [...set];
  }, [stages]);
  const funnel = funnelParam && funnels.includes(funnelParam) ? funnelParam : funnels[0]!;
  // An amoCRM / Bitrix24 funnel is analytics only: its automation lives there.
  const synced = !stagesLoading && !!funnelParam && !funnels.includes(funnelParam);

  const funnelStages: StageLite[] = useMemo(
    () =>
      (stages ?? [])
        .filter((s) => funnelOf(s) === funnel)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ id: s.id, name: s.name, color: s.color, position: s.position })),
    [stages, funnel],
  );

  const options = useRuleEditorOptions(funnel);
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
      !(r.trigger_type === "owner_changed" && r.trigger_stage_id) &&
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

  if (synced) return <p className="text-sm text-muted-foreground">{t("dp.syncedFunnel")}</p>;

  return (
    <>
      <PageHeader title={t("dp.title")} icon={Zap} tone="rose" description={t("dp.desc")} />

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

export function AutomationsTab({ funnel }: { funnel: string }) {
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
      </>
    );
  }
  return (
    <PlanGate feature="automation">
      <DigitalPipelinePage funnel={funnel} />
    </PlanGate>
  );
}
