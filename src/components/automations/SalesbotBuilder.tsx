import { useState } from "react";
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
import {
  BOT_STEP_GROUPS,
  BOT_STEP_TYPES,
  END_STEP,
  type BotMediaKind,
  type BotOperator,
  type BotRule,
  MAX_INVALID_REPLIES,
  REPLY_KINDS,
  type BotStep,
  type BotStepType,
  type ReplyKind,
} from "@/lib/automation-types";

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
    case "split":
      return { id, type, percentA: 50, a: END_STEP, b: END_STEP };
    case "ai_reply":
      return { id, type, prompt: "", next: END_STEP };
    case "handoff":
      return { id, type };
    case "stop":
      return { id, type };
    case "reaction":
      return { id, type, emoji: "❤", next: END_STEP };
    case "note":
      return { id, type, text: "", next: END_STEP };
    case "validate":
      return { id, type, kind: "phone", saveAs: "phone", then: END_STEP, else: END_STEP };
    case "start_bot":
      return { id, type, botId: "" };
    case "http":
      return { id, type, method: "POST", url: "", next: END_STEP };
    case "tg_widget":
      return { id, type, chatId: "", text: "", next: END_STEP };
    case "distribute":
      return { id, type, next: END_STEP };
    case "typing":
      return { id, type, mode: "typing", next: END_STEP };
    case "save_answer":
      return { id, type, field: "", next: END_STEP };
    case "random":
      return { id, type, targets: [END_STEP, END_STEP] };
  }
}

/** The blocks in 5CRM's three groups (Suhbat / Mantiq / Sotuv uchun). */
function GroupedTypes({
  compact = false,
  onPick,
}: {
  compact?: boolean;
  onPick: (t: BotStepType) => void;
}) {
  const { t } = useI18n();
  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {BOT_STEP_GROUPS.map((g) => (
        <div key={g.key}>
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-subtle">
            {t(`sb.group.${g.key}`)}
          </p>
          <div className={compact ? "grid grid-cols-2 gap-1.5" : "space-y-1.5"}>
            {g.types.map((type) => (
              <StepTypeButton
                key={type}
                type={type}
                compact={compact}
                onClick={() => onPick(type)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
void BOT_STEP_TYPES;

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
  const [paletteOpen, setPaletteOpen] = useState(true);

  /** Adds a block after `afterId` (or after the flow's first open exit). */
  function add(type: BotStepType, afterId?: string | null) {
    const step = blankStep(type);
    const from = firstOpenPort(steps, afterId);
    onChange(insertStep(steps, step, from));
    onSelect(step.id);
  }

  return (
    // The canvas takes the whole width; the blocks list floats on its left
    // and the chosen block's settings slide in on its right.
    <div className="relative min-w-0">
      <BotCanvas
        steps={steps}
        onChange={onChange}
        selectedId={selectedId}
        onSelect={onSelect}
        makeStep={blankStep}
        makeId={newStepId}
        addOptions={BOT_STEP_TYPES}
        insetLeft={
          paletteOpen &&
          !(typeof document !== "undefined" && document.documentElement.classList.contains("phone"))
            ? 280
            : 0
        }
        className="h-[calc(100vh-250px)] min-h-[560px] phone:h-[62vh] phone:min-h-0"
      />
      {paletteOpen ? (
        <aside className="absolute top-3 bottom-14 left-3 z-10 flex w-[264px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg phone:static phone:mt-3 phone:w-full">
          <StepPalette
            steps={steps}
            onAdd={(type) => add(type, selected?.id ?? null)}
            onClose={() => setPaletteOpen(false)}
          />
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="absolute top-3 left-3 z-10 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90 phone:static phone:mt-3"
        >
          <Plus className="h-4 w-4" /> {t("sb.addBlock")}
        </button>
      )}
      {selected && (
        <aside className="absolute top-3 right-3 bottom-3 z-20 flex w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl animate-in fade-in slide-in-from-right-4 duration-150 phone:static phone:mt-3 phone:w-full">
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
        </aside>
      )}
    </div>
  );
}

/* ------------------------------ palette ------------------------------ */

function StepPalette({
  steps,
  onAdd,
  onClose,
}: {
  steps: BotStep[];
  onAdd: (t: BotStepType) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const willConnect = steps.length === 0 || !!firstOpenPort(steps);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-foreground">{t("sb.paletteTitle")}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-7 w-7 place-items-center rounded-md text-subtle hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-0.5 text-xs text-subtle">
          {willConnect ? t("sb.paletteHintChain") : t("sb.paletteHintFree")}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        <GroupedTypes onPick={onAdd} />
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
  const canContinue =
    step.type !== "handoff" &&
    step.type !== "stop" &&
    step.type !== "start_bot" &&
    step.type !== "random";
  const target = (key: "next", label: string) =>
    "next" in step ||
    step.type === "message" ||
    step.type === "action" ||
    step.type === "delay" ||
    step.type === "ai_reply" ? (
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
            {/* 5CRM: voice / audio / picture / video / file, by a link. */}
            <Field label={t("sb.media")}>
              <div className="flex gap-1.5">
                <select
                  value={step.media?.kind ?? ""}
                  onChange={(e) => {
                    const kind = e.target.value as BotMediaKind | "";
                    const { media: _m, ...rest } = step;
                    onChange(
                      kind ? { ...rest, media: { kind, url: step.media?.url ?? "" } } : rest,
                    );
                  }}
                  className={`${inputCls} w-32 shrink-0`}
                >
                  <option value="">{t("sb.mediaNone")}</option>
                  {(["photo", "video", "voice", "audio", "document"] as const).map((k) => (
                    <option key={k} value={k}>
                      {t(`sb.mediaKind.${k}`)}
                    </option>
                  ))}
                </select>
                {step.media && (
                  <input
                    value={step.media.url}
                    onChange={(e) =>
                      onChange({ ...step, media: { ...step.media!, url: e.target.value } })
                    }
                    placeholder="https://…"
                    className={inputCls}
                  />
                )}
              </div>
              {step.media && (
                <p className="mt-1 text-[11px] leading-snug text-subtle">{t("sb.mediaHint")}</p>
              )}
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
            <Field label={t("sb.validate")}>
              <select
                value={step.validate ?? ""}
                onChange={(e) => {
                  const { validate: _v, invalidText: _i, ...rest } = step;
                  const v = e.target.value as ReplyKind | "";
                  onChange(
                    v ? { ...rest, validate: v, invalidText: step.invalidText ?? "" } : rest,
                  );
                }}
                className={inputCls}
              >
                <option value="">{t("sb.validate.any")}</option>
                {REPLY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`sb.validate.${k}`)}
                  </option>
                ))}
              </select>
            </Field>
            {step.validate && (
              <Field label={t("sb.invalidText")}>
                <textarea
                  value={step.invalidText ?? ""}
                  onChange={(e) => onChange({ ...step, invalidText: e.target.value })}
                  placeholder={t("sb.invalidTextPh")}
                  rows={2}
                  className={`${inputCls} h-auto py-2`}
                />
                <p className="mt-1 text-[11px] text-subtle">
                  {t("sb.invalidHint", { n: MAX_INVALID_REPLIES })}
                </p>
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
                <option value="after_hours">{t("sb.field.afterHours")}</option>
                <option value="hour">{t("sb.field.hour")}</option>
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
                {OPERATORS.map((o) => (
                  <option key={o} value={o}>
                    {t(`sb.op.${o}`)}
                  </option>
                ))}
              </select>
            </Field>
            {step.operator !== "any" && step.operator !== "empty" && step.operator !== "phone" && (
              <Field label={t("sb.conditionValue")}>
                <input
                  value={step.value}
                  onChange={(e) => onChange({ ...step, value: e.target.value })}
                  className={inputCls}
                />
              </Field>
            )}
            {/* «+ Shart»: more conditions, every one must hold. */}
            {(step.rules ?? []).map((r, i) => (
              <RuleRow
                key={i}
                rule={r}
                customFields={options.customFields}
                onChange={(nr) =>
                  onChange({ ...step, rules: step.rules!.map((x, j) => (j === i ? nr : x)) })
                }
                onRemove={() => onChange({ ...step, rules: step.rules!.filter((_, j) => j !== i) })}
              />
            ))}
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...step,
                  rules: [
                    ...(step.rules ?? []),
                    { source: "reply", operator: "contains", value: "" },
                  ],
                })
              }
              className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
            >
              + {t("sb.addRule")}
            </button>
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
                {BOT_ACTIONS.map((a) => (
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

        {step.type === "split" && (
          <>
            <Field label={t("sb.splitShare")}>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={95}
                  step={5}
                  value={step.percentA}
                  onChange={(e) => onChange({ ...step, percentA: Number(e.target.value) })}
                  className="min-w-0 flex-1 accent-primary"
                  aria-label={t("sb.splitShare")}
                />
                <span className="shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-foreground">
                  A {step.percentA}% · B {100 - step.percentA}%
                </span>
              </div>
              <p className="mt-1 text-[11px] text-subtle">{t("sb.splitHint")}</p>
            </Field>
            <StepTarget
              value={step.a}
              steps={steps}
              self={step.id}
              label={t("sb.pathA")}
              onChange={(v) => onChange({ ...step, a: v })}
            />
            <StepTarget
              value={step.b}
              steps={steps}
              self={step.id}
              label={t("sb.pathB")}
              onChange={(v) => onChange({ ...step, b: v })}
            />
          </>
        )}

        {step.type === "ai_reply" && (
          <>
            <Field label={t("sb.aiPrompt")}>
              <textarea
                value={step.prompt}
                onChange={(e) => onChange({ ...step, prompt: e.target.value })}
                placeholder={t("sb.aiPromptPh")}
                rows={6}
                className={`${inputCls} h-auto py-2`}
              />
              <p className="mt-1 text-[11px] text-subtle">{t("sb.aiHint")}</p>
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

        {step.type === "reaction" && (
          <>
            <Field label={t("sb.reactionEmoji")}>
              <div className="flex flex-wrap gap-1.5">
                {["❤", "👍", "🔥", "🙏", "👌", "😊", "🎉", "✅"].map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={(step.emoji || "❤") === e}
                    onClick={() => onChange({ ...step, emoji: e })}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-lg border text-lg",
                      (step.emoji || "❤") === e ? "border-primary bg-primary/10" : "border-border",
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </Field>
            {target("next", t("sb.then"))}
          </>
        )}

        {step.type === "note" && (
          <>
            <Field label={t("sb.noteText")}>
              <textarea
                value={step.text}
                onChange={(e) => onChange({ ...step, text: e.target.value })}
                rows={4}
                className={`${inputCls} h-auto py-2`}
              />
              <p className="mt-1 text-[11px] text-subtle">{t("sb.noteHint")}</p>
            </Field>
            {target("next", t("sb.then"))}
          </>
        )}

        {step.type === "validate" && (
          <>
            <Field label={t("sb.validateKind")}>
              <select
                value={step.kind}
                onChange={(e) => onChange({ ...step, kind: e.target.value as typeof step.kind })}
                className={inputCls}
              >
                {(["phone", "email", "number", "name", "text"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`sb.kind.${k}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("sb.saveTo")}>
              <FieldPicker
                value={step.saveAs ?? ""}
                customFields={options.customFields}
                onChange={(v) => onChange({ ...step, saveAs: v })}
              />
            </Field>
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

        {step.type === "start_bot" && (
          <Field label={t("sb.startBotPick")}>
            <select
              value={step.botId}
              onChange={(e) => onChange({ ...step, botId: e.target.value })}
              className={inputCls}
            >
              <option value="">—</option>
              {options.bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {step.type === "http" && (
          <>
            <Field label={t("sb.httpUrl")}>
              <div className="flex gap-1.5">
                <select
                  value={step.method}
                  onChange={(e) => onChange({ ...step, method: e.target.value as "GET" | "POST" })}
                  className={`${inputCls} w-24 shrink-0`}
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                </select>
                <input
                  value={step.url}
                  onChange={(e) => onChange({ ...step, url: e.target.value })}
                  placeholder="https://…"
                  className={inputCls}
                />
              </div>
              <p className="mt-1 text-[11px] leading-snug text-subtle">{t("sb.httpHint")}</p>
            </Field>
            {target("next", t("sb.then"))}
          </>
        )}

        {step.type === "tg_widget" && (
          <>
            <Field label={t("sb.chatId")}>
              <input
                value={step.chatId}
                onChange={(e) => onChange({ ...step, chatId: e.target.value })}
                placeholder="-100…"
                className={inputCls}
              />
            </Field>
            <Field label={t("sb.tgText")}>
              <textarea
                value={step.text}
                onChange={(e) => onChange({ ...step, text: e.target.value })}
                rows={4}
                className={`${inputCls} h-auto py-2`}
              />
            </Field>
            {target("next", t("sb.then"))}
          </>
        )}

        {step.type === "distribute" && (
          <>
            <p className="text-xs text-subtle">{t("sb.distributeHint")}</p>
            {target("next", t("sb.then"))}
          </>
        )}

        {step.type === "typing" && (
          <>
            <Field label={t("sb.typingMode")}>
              <select
                value={step.mode}
                onChange={(e) => onChange({ ...step, mode: e.target.value as "typing" | "read" })}
                className={inputCls}
              >
                <option value="typing">{t("sb.typing.typing")}</option>
                <option value="read">{t("sb.typing.read")}</option>
              </select>
            </Field>
            {target("next", t("sb.then"))}
          </>
        )}

        {step.type === "save_answer" && (
          <>
            <Field label={t("sb.saveTo")}>
              <FieldPicker
                value={step.field}
                customFields={options.customFields}
                onChange={(v) => onChange({ ...step, field: v })}
              />
              <p className="mt-1 text-[11px] text-subtle">{t("sb.saveAnswerHint")}</p>
            </Field>
            {target("next", t("sb.then"))}
          </>
        )}

        {step.type === "random" && (
          <>
            <p className="text-xs text-subtle">{t("sb.randomHint")}</p>
            {(step.targets.length ? step.targets : ["", ""]).map((v, i) => (
              <StepTarget
                key={i}
                value={v || undefined}
                steps={steps}
                self={step.id}
                label={`${t("sb.path")} ${i + 1}`}
                onChange={(nv) => {
                  const targets = step.targets.length ? [...step.targets] : ["", ""];
                  targets[i] = nv;
                  onChange({ ...step, targets });
                }}
              />
            ))}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...step, targets: [...step.targets, END_STEP] })}
                className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
              >
                + {t("sb.addPath")}
              </button>
              {step.targets.length > 2 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...step, targets: step.targets.slice(0, -1) })}
                  className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent"
                >
                  − {t("sb.removePath")}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {canContinue && (
        <div className="max-h-[40%] shrink-0 overflow-y-auto border-t border-border bg-surface/60 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
            {t("sb.addNextTitle")}
          </p>
          <GroupedTypes compact onPick={onAddNext} />
        </div>
      )}
    </div>
  );
}

const OPERATORS: BotOperator[] = [
  "contains",
  "any_of",
  "eq",
  "neq",
  "gt",
  "lt",
  "any",
  "empty",
  "phone",
];

/** «Amal bajarish»: the CRM actions a bot step can run (5CRM's 23 and ours). */
const BOT_ACTIONS = [
  "set_contact",
  "create_task",
  "close_tasks",
  "distribute",
  "auto_chat",
  "assign_owner",
  "detect_phone",
  "lead_owner",
  "send_message",
  "send_card",
  "release_owner",
  "set_field",
  "add_tag",
  "quality_check",
  "remove_tag",
  "add_note",
  "move_stage",
  "move_funnel",
  "sale_congrats",
  "tg_chat_message",
  "webhook",
  "api_post",
  "close_won",
  "close_lost",
] as const;

/** Where an answer is written: the contact's name / phone / email or a lead field. */
function FieldPicker({
  value,
  customFields,
  onChange,
}: {
  value: string;
  customFields: { key: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">{t("sb.fieldPick")}</option>
      <option value="name">{t("sb.kind.name")}</option>
      <option value="phone">{t("sb.kind.phone")}</option>
      <option value="email">{t("sb.kind.email")}</option>
      <option value="budget">{t("dp.field.budget")}</option>
      {customFields.map((f) => (
        <option key={f.key} value={`custom:${f.key}`}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

/** One extra condition of a «Shart» block. */
function RuleRow({
  rule,
  customFields,
  onChange,
  onRemove,
}: {
  rule: BotRule;
  customFields: { key: string; label: string }[];
  onChange: (r: BotRule) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5 rounded-xl border border-border p-2">
      <div className="flex gap-1.5">
        <select
          value={rule.source === "reply" ? "reply" : (rule.field ?? "")}
          onChange={(e) => {
            const v = e.target.value;
            onChange(
              v === "reply"
                ? { source: "reply", operator: rule.operator, value: rule.value }
                : { ...rule, source: "field", field: v },
            );
          }}
          className={inputCls}
        >
          <option value="reply">{t("sb.lastReply")}</option>
          <option value="tags">{t("sb.fieldTags")}</option>
          <option value="name">{t("sb.kind.name")}</option>
          <option value="amount">{t("dp.field.budget")}</option>
          <option value="source">{t("dp.field.source")}</option>
          <option value="after_hours">{t("sb.field.afterHours")}</option>
          <option value="hour">{t("sb.field.hour")}</option>
          {customFields.map((f) => (
            <option key={f.key} value={`custom:${f.key}`}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("dp.remove")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-subtle hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex gap-1.5">
        <select
          value={rule.operator}
          onChange={(e) => onChange({ ...rule, operator: e.target.value as BotOperator })}
          className={inputCls}
        >
          {OPERATORS.map((o) => (
            <option key={o} value={o}>
              {t(`sb.op.${o}`)}
            </option>
          ))}
        </select>
        {rule.operator !== "any" && rule.operator !== "empty" && rule.operator !== "phone" && (
          <input
            value={rule.value}
            onChange={(e) => onChange({ ...rule, value: e.target.value })}
            className={inputCls}
          />
        )}
      </div>
    </div>
  );
}
