import { Flag, MousePointerClick, Plus, Trash2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  ActionEditor,
  DurationInput,
  blankAction,
  inputCls,
  type ActionEditorOptions,
} from "@/components/automations/ActionEditor";
import {
  BotCanvas,
  STEP_ICON,
  STEP_TONE,
  firstOpenPort,
  insertStep,
  removeStep,
} from "@/components/automations/BotCanvas";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BOT_STEP_TYPES, END_STEP, type BotStep, type BotStepType } from "@/lib/automation-types";

// The built-in salesbot editor: the canvas on the left, and on the right
// either the list of blocks to add (nothing selected) or the selected
// block's settings. Adding from the list continues the flow: the new block
// is connected to the first open exit of the selected block, or of the
// bot, so clicking "Xabar" → "Javob kutish" → "Shart" builds a chain.

export function newStepId() {
  return `s_${Math.random().toString(36).slice(2, 8)}`;
}

export function blankStep(type: BotStepType): BotStep {
  const id = newStepId();
  switch (type) {
    case "message":
      return { id, type, text: "", next: END_STEP };
    case "wait_reply":
      return { id, type, timeoutMinutes: 60, next: END_STEP, onTimeout: END_STEP };
    case "condition":
      return {
        id,
        type,
        source: "reply",
        operator: "contains",
        value: "",
        then: END_STEP,
        else: END_STEP,
      };
    case "action":
      return { id, type, action: blankAction("set_contact"), next: END_STEP };
    case "delay":
      return { id, type, minutes: 30, next: END_STEP };
    case "handoff":
      return { id, type };
    case "stop":
      return { id, type };
  }
}

export function SalesbotBuilder({
  steps,
  onChange,
  selectedId,
  onSelect,
  options,
}: {
  steps: BotStep[];
  onChange: (steps: BotStep[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  options: ActionEditorOptions;
}) {
  const { t } = useI18n();
  const index = steps.findIndex((s) => s.id === selectedId);
  const selected = steps[index];

  /** Adds a block after `afterId` (or after the flow's first open exit). */
  function add(type: BotStepType, afterId?: string | null) {
    const step = blankStep(type);
    const from = firstOpenPort(steps, afterId);
    onChange(insertStep(steps, step, from));
    onSelect(step.id);
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      <BotCanvas
        steps={steps}
        onChange={onChange}
        selectedId={selectedId}
        onSelect={onSelect}
        makeStep={blankStep}
        makeId={newStepId}
        addOptions={BOT_STEP_TYPES}
        className="h-[calc(100vh-280px)] min-h-[520px]"
      />
      <aside className="flex max-h-[calc(100vh-280px)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border bg-card">
        {selected ? (
          <StepEditor
            key={selected.id}
            step={selected}
            index={index}
            steps={steps}
            options={options}
            onClose={() => onSelect(null)}
            onChange={(next) => onChange(steps.map((x) => (x.id === selected.id ? next : x)))}
            onRemove={() => {
              onChange(removeStep(steps, selected.id));
              onSelect(null);
            }}
            onMakeStart={() => onChange([selected, ...steps.filter((x) => x.id !== selected.id)])}
            onAddNext={(type) => add(type, selected.id)}
          />
        ) : (
          <StepPalette steps={steps} onAdd={(type) => add(type)} />
        )}
      </aside>
    </div>
  );
}

/* ------------------------------ palette ------------------------------ */

function StepPalette({ steps, onAdd }: { steps: BotStep[]; onAdd: (t: BotStepType) => void }) {
  const { t } = useI18n();
  const willConnect = steps.length === 0 || !!firstOpenPort(steps);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-bold text-foreground">{t("sb.paletteTitle")}</p>
        <p className="mt-0.5 text-xs text-subtle">
          {willConnect ? t("sb.paletteHintChain") : t("sb.paletteHintFree")}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {BOT_STEP_TYPES.map((type) => (
          <StepTypeButton key={type} type={type} onClick={() => onAdd(type)} />
        ))}
      </div>
      <div className="space-y-2 border-t border-border bg-surface/60 px-4 py-3 text-[11.5px] leading-snug text-muted-foreground">
        <p className="flex gap-2">
          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <Plus className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
          {t("sb.guidePlus")}
        </p>
        <p className="flex gap-2">
          <MousePointerClick className="h-4 w-4 shrink-0 text-primary" />
          {t("sb.guideClick")}
        </p>
        <p className="flex gap-2">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
          {t("sb.guideDrag")}
        </p>
      </div>
    </div>
  );
}

function StepTypeButton({
  type,
  onClick,
  compact = false,
}: {
  type: BotStepType;
  onClick: () => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const Icon = STEP_ICON[type];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-border bg-background text-left transition-colors hover:border-primary/40 hover:bg-primary/5",
        compact ? "gap-2 px-2 py-1.5" : "px-3 py-2.5",
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-lg text-white",
          STEP_TONE[type][0],
          compact ? "h-6 w-6" : "h-8 w-8",
        )}
      >
        <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block font-semibold text-foreground",
            compact ? "truncate text-[12px]" : "text-[13px]",
          )}
        >
          {t(`sb.step.${type}`)}
        </span>
        {!compact && (
          <span className="block text-[11.5px] leading-snug text-subtle">
            {t(`sb.stepDesc.${type}`)}
          </span>
        )}
      </span>
      {!compact && <Plus className="h-4 w-4 shrink-0 text-subtle" />}
    </button>
  );
}

/* ------------------------------ editor ------------------------------ */

function StepTarget({
  value,
  onChange,
  steps,
  self,
  label,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  steps: BotStep[];
  self: string;
  label: string;
}) {
  const { t } = useI18n();
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium text-subtle">{label}</span>
      <select
        value={value ?? END_STEP}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      >
        <option value={END_STEP}>— {t("sb.endBot")} —</option>
        {steps.map((s, i) =>
          s.id === self ? null : (
            <option key={s.id} value={s.id}>
              #{i + 1} {t(`sb.step.${s.type}`)}
              {s.type === "message" && s.text ? ` · ${s.text.slice(0, 30)}` : ""}
            </option>
          ),
        )}
      </select>
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-medium text-subtle">{label}</p>
      {children}
    </div>
  );
}

function StepEditor({
  step,
  index,
  steps,
  onChange,
  onRemove,
  onMakeStart,
  onClose,
  onAddNext,
  options,
}: {
  step: BotStep;
  index: number;
  steps: BotStep[];
  onChange: (s: BotStep) => void;
  onRemove: () => void;
  onMakeStart: () => void;
  onClose: () => void;
  onAddNext: (type: BotStepType) => void;
  options: ActionEditorOptions;
}) {
  const { t } = useI18n();
  const Icon = STEP_ICON[step.type];
  const canContinue = step.type !== "handoff" && step.type !== "stop";
  const target = (key: "next", label: string) =>
    "next" in step || step.type === "message" || step.type === "action" || step.type === "delay" ? (
      <StepTarget
        value={(step as { next?: string }).next}
        steps={steps}
        self={step.id}
        label={label}
        onChange={(v) => onChange({ ...step, [key]: v } as BotStep)}
      />
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "flex items-center gap-2 border-b border-border px-4 py-3",
          STEP_TONE[step.type][1],
        )}
      >
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white",
            STEP_TONE[step.type][0],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{t(`sb.step.${step.type}`)}</p>
          <p className="text-[11px] text-subtle">
            #{index + 1}
            {index === 0 ? ` · ${t("sb.startBlock")}` : ""}
          </p>
        </div>
        {index > 0 && (
          <button
            type="button"
            onClick={onMakeStart}
            title={t("sb.makeStart")}
            aria-label={t("sb.makeStart")}
            className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-background hover:text-emerald-600"
          >
            <Flag className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          title={t("sb.deleteBlock")}
          aria-label={t("sb.deleteBlock")}
          className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          title={t("sb.closeEditor")}
          aria-label={t("sb.closeEditor")}
          className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-background hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {step.type === "message" && (
          <>
            <Field label={t("sb.messageText")}>
              <textarea
                autoFocus={!step.text}
                value={step.text}
                onChange={(e) => onChange({ ...step, text: e.target.value })}
                rows={5}
                placeholder={t("dp.messagePlaceholder")}
                className={`${inputCls} h-auto py-2`}
              />
              <p className="mt-1 text-[11px] leading-snug text-subtle">{t("sb.messageHint")}</p>
            </Field>
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-subtle">{t("sb.buttonsTitle")}</p>
              {(step.buttons ?? []).map((b, i) => (
                <div key={i} className="space-y-1.5 rounded-xl border border-border p-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={b.label}
                      onChange={(e) =>
                        onChange({
                          ...step,
                          buttons: step.buttons!.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x,
                          ),
                        })
                      }
                      placeholder={`${t("sb.button")} ${i + 1}`}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ ...step, buttons: step.buttons!.filter((_, j) => j !== i) })
                      }
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-subtle hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t("dp.remove")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {b.url !== undefined ? (
                    <input
                      value={b.url}
                      onChange={(e) =>
                        onChange({
                          ...step,
                          buttons: step.buttons!.map((x, j) =>
                            j === i ? { ...x, url: e.target.value } : x,
                          ),
                        })
                      }
                      placeholder="https://t.me/..."
                      className={inputCls}
                    />
                  ) : (
                    <StepTarget
                      value={b.next}
                      steps={steps}
                      self={step.id}
                      label={t("sb.goTo")}
                      onChange={(v) =>
                        onChange({
                          ...step,
                          buttons: step.buttons!.map((x, j) => (j === i ? { ...x, next: v } : x)),
                        })
                      }
                    />
                  )}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...step,
                      buttons: [...(step.buttons ?? []), { label: "", next: END_STEP }],
                    })
                  }
                  className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                >
                  + {t("sb.addButton")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...step,
                      buttons: [...(step.buttons ?? []), { label: "", url: "" }],
                    })
                  }
                  className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent"
                >
                  + {t("sb.addLinkButton")}
                </button>
              </div>
            </div>
            {target(
              "next",
              (step.buttons ?? []).some((b) => !b.url) ? t("sb.otherAnswer") : t("sb.then"),
            )}
          </>
        )}

        {step.type === "wait_reply" && (
          <>
            <label className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
              {t("sb.waitForever")}
              <Switch
                checked={step.timeoutMinutes <= 0}
                onCheckedChange={(v) =>
                  onChange(
                    v
                      ? { ...step, timeoutMinutes: 0 }
                      : { ...step, timeoutMinutes: 60, onTimeout: step.onTimeout ?? END_STEP },
                  )
                }
              />
            </label>
            {step.timeoutMinutes > 0 && (
              <Field label={t("sb.waitUpTo")}>
                <DurationInput
                  minutes={step.timeoutMinutes}
                  onChange={(m) => onChange({ ...step, timeoutMinutes: Math.max(1, m) })}
                />
              </Field>
            )}
            <Field label={t("sb.saveAs")}>
              <input
                value={step.saveAs ?? ""}
                onChange={(e) => {
                  const { saveAs: _s, ...rest } = step;
                  const v = e.target.value.replace(/[^\w]/g, "");
                  onChange(v ? { ...rest, saveAs: v } : rest);
                }}
                placeholder="budjet"
                className={inputCls}
              />
            </Field>
            {target("next", t("sb.onReply"))}
            {step.timeoutMinutes > 0 && (
              <StepTarget
                value={step.onTimeout}
                steps={steps}
                self={step.id}
                label={t("sb.onTimeout")}
                onChange={(v) => onChange({ ...step, onTimeout: v })}
              />
            )}
          </>
        )}

        {step.type === "condition" && (
          <>
            <Field label={t("sb.conditionWhat")}>
              <select
                value={step.source === "reply" ? "reply" : (step.field ?? "")}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "reply") {
                    const { field: _f, ...rest } = step;
                    onChange({ ...rest, source: "reply" });
                  } else onChange({ ...step, source: "field", field: v });
                }}
                className={inputCls}
              >
                <option value="reply">{t("sb.lastReply")}</option>
                <option value="tags">{t("sb.fieldTags")}</option>
                <option value="budget">{t("dp.field.budget")}</option>
                <option value="source">{t("dp.field.source")}</option>
                <option value="priority">{t("dp.field.priority")}</option>
                <option value="temperature">{t("dp.field.temperature")}</option>
                {options.customFields.map((f) => (
                  <option key={f.key} value={`custom:${f.key}`}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("sb.conditionHow")}>
              <select
                value={step.operator}
                onChange={(e) =>
                  onChange({ ...step, operator: e.target.value as typeof step.operator })
                }
                className={inputCls}
              >
                {(["contains", "eq", "neq", "gt", "lt", "any", "phone"] as const).map((o) => (
                  <option key={o} value={o}>
                    {t(`sb.op.${o}`)}
                  </option>
                ))}
              </select>
            </Field>
            {step.operator !== "any" && step.operator !== "phone" && (
              <Field label={t("sb.conditionValue")}>
                <input
                  value={step.value}
                  onChange={(e) => onChange({ ...step, value: e.target.value })}
                  className={inputCls}
                />
              </Field>
            )}
            <StepTarget
              value={step.then}
              steps={steps}
              self={step.id}
              label={t("sb.ifYes")}
              onChange={(v) => onChange({ ...step, then: v })}
            />
            <StepTarget
              value={step.else}
              steps={steps}
              self={step.id}
              label={t("sb.ifNo")}
              onChange={(v) => onChange({ ...step, else: v })}
            />
          </>
        )}

        {step.type === "action" && (
          <>
            <Field label={t("sb.actionWhat")}>
              <select
                value={step.action.type}
                onChange={(e) =>
                  onChange({ ...step, action: blankAction(e.target.value as never) })
                }
                className={inputCls}
              >
                {(
                  [
                    "set_contact",
                    "add_tag",
                    "remove_tag",
                    "move_stage",
                    "create_task",
                    "assign_owner",
                    "set_field",
                    "add_note",
                    "close_won",
                    "close_lost",
                    "webhook",
                  ] as const
                ).map((a) => (
                  <option key={a} value={a}>
                    {t(`dp.action.${a}`)}
                  </option>
                ))}
              </select>
            </Field>
            <ActionEditor
              action={step.action}
              options={options}
              onChange={(action) => onChange({ ...step, action })}
            />
            {target("next", t("sb.then"))}
          </>
        )}

        {step.type === "delay" && (
          <>
            <Field label={t("sb.pauseFor")}>
              <DurationInput
                minutes={step.minutes}
                onChange={(m) => onChange({ ...step, minutes: Math.max(1, m) })}
              />
            </Field>
            {target("next", t("sb.then"))}
          </>
        )}

        {step.type === "handoff" && (
          <Field label={t("sb.handoffNote")}>
            <input
              value={step.text ?? ""}
              onChange={(e) => {
                const { text: _x, ...rest } = step;
                onChange(e.target.value ? { ...rest, text: e.target.value } : rest);
              }}
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-subtle">{t("sb.handoffHint")}</p>
          </Field>
        )}

        {step.type === "stop" && <p className="text-xs text-subtle">{t("sb.stopHint")}</p>}
      </div>

      {canContinue && (
        <div className="border-t border-border bg-surface/60 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
            {t("sb.addNextTitle")}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {BOT_STEP_TYPES.map((type) => (
              <StepTypeButton key={type} type={type} compact onClick={() => onAddNext(type)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
