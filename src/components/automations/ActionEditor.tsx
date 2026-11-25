import { Plus, Trash2 } from "lucide-react";
import { celebrate } from "@/components/team/TeamMoments";
import {
  TASK_DUE,
  taskDueFields,
  taskDueOf,
  waitMinutes,
  waitParts,
  type TaskDue,
  type WaitUnit,
} from "@/lib/automations/trigger-kit";
import { useI18n } from "@/lib/i18n";
import { MessageExtras } from "@/components/automations/MessageExtras";
import {
  ACTION_TYPES,
  type AutomationAction,
  type AutomationActionType,
  type MessageChannel,
  type Priority,
} from "@/lib/automation-types";

// One action of a trigger or of a salesbot "action" step. Shared by the
// digital pipeline dialog (admin.automations.tsx) and the salesbot builder.

export type ActionEditorOptions = {
  profiles: { id: string; full_name: string }[];
  stages: { id: string; name: string }[];
  bots: { id: string; name: string }[];
  customFields: { key: string; label: string }[];
  /** Funnel names, for "move to another funnel". */
  funnels?: string[];
  /** Every funnel's stages, for «Qaysi voronka/bosqichga». */
  funnelStages?: { id: string; name: string; funnel: string }[];
  /** The company's closing reasons («Sifat nazorati»). */
  lossReasons?: string[];
};

const CHANNELS: MessageChannel[] = ["auto", "telegram", "sms", "email"];
const PRIORITIES: Priority[] = ["Urgent", "High", "Normal", "Low"];
const BASE_FIELDS = ["budget", "paid_amount", "priority", "temperature", "source"] as const;

const API_SOURCES = [
  "name",
  "phone",
  "email",
  "source",
  "funnel",
  "budget",
  "tags",
  "manager",
  "company",
] as const;

export const inputCls =
  "h-9 w-full min-w-0 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/50";

export function blankAction(type: AutomationActionType): AutomationAction {
  switch (type) {
    case "send_message":
      return { type, channel: "auto", text: "" };
    case "create_task":
      return { type, title: "", dueInMinutes: 60, priority: "Normal" };
    case "add_tag":
    case "remove_tag":
      return { type, tag: "" };
    case "move_stage":
      return { type, stageId: "" };
    case "assign_owner":
      return { type, ownerId: "" };
    case "start_salesbot":
      return { type, botId: "" };
    case "close_lost":
      return { type, reason: "" };
    case "close_won":
      return { type };
    case "set_field":
      return { type, field: "priority", value: "" };
    case "add_note":
      return { type, text: "" };
    case "dedupe":
      return { type, mode: "merge" };
    case "webhook":
      return { type, url: "" };
    case "set_contact":
      return { type, field: "name", value: "{{reply}}" };
    case "delay":
      return { type, minutes: 60 };
    case "close_tasks":
    case "release_owner":
    case "previous_owner":
    case "detect_phone":
      return { type };
    case "move_funnel":
      return { type, funnel: "" };
    case "distribute":
      return { type, ownerIds: [] };
    case "run_actions":
      return { type, actions: [] };
    case "tg_chat_message":
      return { type, chatId: "", text: "" };
    case "api_post":
      return {
        type,
        url: "",
        auth: "bearer",
        key: "",
        format: "fields",
        fields: [{ name: "name", label: "Ism", source: "name" }],
      };
    case "sale_congrats":
      return {
        type,
        to: "owner",
        lang: "uz",
        text: "Tabriklaymiz, {ism}! {mijoz} buyurtmasi «{bosqich}» bosqichiga yetdi — bu sizning mehnatingiz natijasi. Shunday davom eting! 🎉",
        seconds: 15,
      };
    case "auto_chat":
      return { type, priceStageId: "", mediaStageId: "", waitMinutes: 10, keywords: [] };
    case "send_card":
      return { type, title: "", description: "", image: "", buttons: [] };
    case "lead_owner":
      return { type, mode: "admin", onlyUnowned: true };
    case "quality_check":
      return { type, reasons: [], tag: "" };
  }
}

/** False when a required value is still empty. */
export function actionIsComplete(a: AutomationAction): boolean {
  switch (a.type) {
    case "send_message":
      return (
        (!!a.text.trim() || (a.files?.length ?? 0) > 0) &&
        (a.buttons ?? []).every((b) => b.label.trim())
      );
    case "create_task":
      return !!a.title.trim();
    case "add_tag":
    case "remove_tag":
      return !!a.tag.trim();
    case "move_stage":
      return !!a.stageId;
    case "assign_owner":
      return !!a.ownerId;
    case "start_salesbot":
      return !!a.botId;
    case "set_field":
      return !!a.field && a.value !== "";
    case "add_note":
      return !!a.text.trim();
    case "webhook":
      return /^https:\/\//.test(a.url.trim());
    case "delay":
      return a.minutes > 0;
    case "move_funnel":
      return !!a.funnel;
    case "distribute":
      return a.ownerIds.length > 0;
    case "tg_chat_message":
      return /^-?\d{5,}$/.test(a.chatId.trim()) && !!a.text.trim();
    case "api_post":
      return /^https:\/\//.test(a.url.trim()) && (a.auth === "none" || !!a.key?.trim());
    case "sale_congrats":
      return !!a.text.trim();
    case "auto_chat":
      return !!a.priceStageId && !!a.mediaStageId;
    case "send_card":
      return !!a.title.trim();
    case "lead_owner":
      return a.mode !== "specific" || !!a.ownerId;
    case "quality_check":
      return !!a.tag.trim();
    default:
      return true;
  }
}

const DUE_UNITS = [
  { key: "minutes", factor: 1 },
  { key: "hours", factor: 60 },
  { key: "days", factor: 1440 },
] as const;

function splitMinutes(total: number) {
  for (const u of [...DUE_UNITS].reverse()) {
    if (total > 0 && total % u.factor === 0) return { value: total / u.factor, unit: u.key };
  }
  return { value: total, unit: "minutes" as const };
}

export function DurationInput({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  const { t } = useI18n();
  const { value, unit } = splitMinutes(minutes);
  const factor = DUE_UNITS.find((u) => u.key === unit)!.factor;
  return (
    <div className="flex gap-1.5">
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0) * factor)}
        className={`${inputCls} w-20`}
      />
      <select
        value={unit}
        onChange={(e) => {
          const f = DUE_UNITS.find((u) => u.key === e.target.value)!.factor;
          onChange(value * f);
        }}
        className={inputCls}
      >
        {DUE_UNITS.map((u) => (
          <option key={u.key} value={u.key}>
            {t(`dp.unit.${u.key}`)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A field label in 5CRM's way: the name, a red * when it is required. */
function Lbl({ text, req }: { text: string; req?: boolean }) {
  return (
    <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
      {text}
      {req && <span className="ml-0.5 text-destructive">*</span>}
    </span>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function ActionEditor({
  action,
  onChange,
  onRemove,
  options,
}: {
  action: AutomationAction;
  onChange: (next: AutomationAction) => void;
  onRemove?: () => void;
  options: ActionEditorOptions;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-subtle">
          {t(`dp.action.${action.type}`)}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("dp.remove")}
            className="rounded-md p-1 text-subtle hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {action.type === "send_message" && (
        <>
          <select
            value={action.channel}
            onChange={(e) => onChange({ ...action, channel: e.target.value as MessageChannel })}
            className={inputCls}
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {t(`dp.channel.${c}`)}
              </option>
            ))}
          </select>
          {action.channel === "email" && (
            <input
              value={action.subject ?? ""}
              onChange={(e) => onChange({ ...action, subject: e.target.value })}
              placeholder={t("dp.emailSubject")}
              className={inputCls}
            />
          )}
          <textarea
            value={action.text}
            onChange={(e) => onChange({ ...action, text: e.target.value })}
            rows={3}
            placeholder={t("dp.messagePlaceholder")}
            className={`${inputCls} h-auto py-2`}
          />
          <p className="text-[11px] text-subtle">{t("dp.placeholdersHint")}</p>
          <input
            value={action.mediaUrl ?? ""}
            onChange={(e) => onChange({ ...action, mediaUrl: e.target.value })}
            placeholder={t("tk.mediaUrl")}
            className={inputCls}
          />
          <Check
            checked={!!action.once}
            onChange={(v) => onChange({ ...action, once: v })}
            label={t("tk.once")}
          />
          <MessageExtras
            files={action.files ?? []}
            buttons={action.buttons ?? []}
            onFiles={(files) => onChange({ ...action, files })}
            onButtons={(buttons) => onChange({ ...action, buttons })}
          />
        </>
      )}

      {action.type === "create_task" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={action.title}
            onChange={(e) => onChange({ ...action, title: e.target.value })}
            placeholder={t("dp.taskTitle")}
            className={`${inputCls} sm:col-span-2`}
          />
          <select
            value={action.assigneeId ?? ""}
            onChange={(e) =>
              onChange(
                e.target.value
                  ? { ...action, assigneeId: e.target.value }
                  : (({ assigneeId: _omit, ...rest }) => rest)(action),
              )
            }
            className={inputCls}
          >
            <option value="">{t("dp.taskAssigneeOwner")}</option>
            {options.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <select
            value={action.priority ?? "Normal"}
            onChange={(e) => onChange({ ...action, priority: e.target.value as Priority })}
            className={inputCls}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`dp.priority.${p}`)}
              </option>
            ))}
          </select>
          <div className="sm:col-span-2">
            <Lbl text={t("dp.taskDueIn")} />
            <div className="grid gap-1.5 sm:grid-cols-2">
              <select
                value={taskDueOf(action)}
                onChange={(e) => {
                  const { dueInDays: _d, dueInMinutes: _m, ...rest } = action;
                  onChange({ ...rest, ...taskDueFields(e.target.value as TaskDue, 60) });
                }}
                className={inputCls}
              >
                {TASK_DUE.map((d) => (
                  <option key={d} value={d}>
                    {t(`tk.due.${d}`)}
                  </option>
                ))}
              </select>
              {taskDueOf(action) === "custom" && (
                <DurationInput
                  minutes={action.dueInMinutes ?? (action.dueInDays ?? 0) * 1440}
                  onChange={(m) => {
                    const { dueInDays: _d, ...rest } = action;
                    onChange({ ...rest, dueInMinutes: m });
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {(action.type === "add_tag" || action.type === "remove_tag") && (
        <input
          value={action.tag}
          onChange={(e) => onChange({ ...action, tag: e.target.value })}
          placeholder={t("dp.tag")}
          className={inputCls}
        />
      )}

      {action.type === "move_stage" && (
        <select
          value={action.stageId}
          onChange={(e) => onChange({ ...action, stageId: e.target.value })}
          className={inputCls}
        >
          <option value="">{t("dp.chooseStage")}</option>
          {options.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {action.type === "assign_owner" && (
        <select
          value={action.ownerId}
          onChange={(e) => onChange({ ...action, ownerId: e.target.value })}
          className={inputCls}
        >
          <option value="">{t("dp.chooseEmployee")}</option>
          {options.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      )}

      {action.type === "start_salesbot" && (
        <select
          value={action.botId}
          onChange={(e) => onChange({ ...action, botId: e.target.value })}
          className={inputCls}
        >
          <option value="">{t("dp.chooseBot")}</option>
          {options.bots.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      {action.type === "close_lost" && (
        <input
          value={action.reason ?? ""}
          onChange={(e) => onChange({ ...action, reason: e.target.value })}
          placeholder={t("dp.lostReason")}
          className={inputCls}
        />
      )}

      {action.type === "set_field" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={action.field}
            onChange={(e) => onChange({ ...action, field: e.target.value, value: "" })}
            className={inputCls}
          >
            {BASE_FIELDS.map((f) => (
              <option key={f} value={f}>
                {t(`dp.field.${f}`)}
              </option>
            ))}
            {options.customFields.map((f) => (
              <option key={f.key} value={`custom:${f.key}`}>
                {f.label}
              </option>
            ))}
          </select>
          {action.field === "priority" ? (
            <select
              value={action.value}
              onChange={(e) => onChange({ ...action, value: e.target.value })}
              className={inputCls}
            >
              <option value="">—</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`dp.priority.${p}`)}
                </option>
              ))}
            </select>
          ) : action.field === "temperature" ? (
            <select
              value={action.value}
              onChange={(e) => onChange({ ...action, value: e.target.value })}
              className={inputCls}
            >
              <option value="">—</option>
              {["hot", "warm", "cold"].map((v) => (
                <option key={v} value={v}>
                  {t(`dp.temp.${v}`)}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={action.value}
              type="text"
              onChange={(e) => onChange({ ...action, value: e.target.value })}
              placeholder="{{today}}"
              className={inputCls}
            />
          )}
          <div className="sm:col-span-2">
            <Check
              checked={action.onlyEmpty ?? true}
              onChange={(v) => onChange({ ...action, onlyEmpty: v })}
              label={t("tk.onlyFirst")}
            />
          </div>
        </div>
      )}

      {action.type === "add_note" && (
        <textarea
          value={action.text}
          onChange={(e) => onChange({ ...action, text: e.target.value })}
          rows={2}
          placeholder={t("dp.noteText")}
          className={`${inputCls} h-auto py-2`}
        />
      )}

      {action.type === "dedupe" && (
        <select
          value={action.mode}
          onChange={(e) => onChange({ ...action, mode: e.target.value as "merge" | "tag" })}
          className={inputCls}
        >
          <option value="merge">{t("dp.dedupe.merge")}</option>
          <option value="tag">{t("dp.dedupe.tag")}</option>
        </select>
      )}

      {action.type === "set_contact" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={action.field}
            onChange={(e) =>
              onChange({ ...action, field: e.target.value as "name" | "phone" | "email" })
            }
            className={inputCls}
          >
            <option value="name">{t("sb.contactField.name")}</option>
            <option value="phone">{t("sb.contactField.phone")}</option>
            <option value="email">{t("sb.contactField.email")}</option>
          </select>
          <input
            value={action.value}
            onChange={(e) => onChange({ ...action, value: e.target.value })}
            placeholder="{{reply}}"
            className={inputCls}
          />
          <p className="text-[11px] text-subtle sm:col-span-2">{t("sb.setContactHint")}</p>
        </div>
      )}

      {action.type === "delay" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <Lbl text={t("tk.wait.n")} req />
              <input
                type="number"
                min={1}
                value={waitParts(action.minutes).n}
                onChange={(e) =>
                  onChange({
                    ...action,
                    minutes: waitMinutes(Number(e.target.value), waitParts(action.minutes).unit),
                  })
                }
                className={inputCls}
              />
            </label>
            <label>
              <Lbl text={t("tk.wait.unit")} req />
              <select
                value={waitParts(action.minutes).unit}
                onChange={(e) =>
                  onChange({
                    ...action,
                    minutes: waitMinutes(waitParts(action.minutes).n, e.target.value as WaitUnit),
                  })
                }
                className={inputCls}
              >
                {(["minute", "hour", "day"] as WaitUnit[]).map((u) => (
                  <option key={u} value={u}>
                    {t(`tk.wait.${u}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-subtle">{t("dp.delayActionHint")}</p>
        </>
      )}

      {action.type === "close_tasks" && (
        <p className="text-[11px] text-subtle">{t("dp.closeTasksHint")}</p>
      )}
      {action.type === "previous_owner" && (
        <p className="text-[11px] text-subtle">{t("dp.previousOwnerHint")}</p>
      )}
      {action.type === "release_owner" && (
        <p className="text-[11px] text-subtle">{t("dp.releaseOwnerHint")}</p>
      )}
      {action.type === "detect_phone" && (
        <>
          <label className="block">
            <Lbl text={t("tk.moveTo")} />
            <select
              value={action.stageId ?? ""}
              onChange={(e) =>
                onChange(
                  e.target.value
                    ? { ...action, stageId: e.target.value }
                    : { type: "detect_phone" },
                )
              }
              className={inputCls}
            >
              <option value="">{t("tk.stay")}</option>
              {options.stages.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-subtle">{t("dp.detectPhoneHint")}</p>
        </>
      )}

      {action.type === "move_funnel" && (
        <label className="block">
          <Lbl text={t("tk.funnelStage")} req />
          <select
            value={`${action.funnel}|${action.stageId ?? ""}`}
            onChange={(e) => {
              const [funnel = "", stageId = ""] = e.target.value.split("|");
              onChange(
                stageId
                  ? { type: "move_funnel", funnel, stageId }
                  : { type: "move_funnel", funnel },
              );
            }}
            className={inputCls}
          >
            <option value="|">{t("dp.chooseFunnel")}</option>
            {(options.funnels ?? []).map((f) => (
              <optgroup key={f} label={f}>
                <option value={`${f}|`}>{t("tk.firstStage", { funnel: f })}</option>
                {(options.funnelStages ?? [])
                  .filter((st) => st.funnel === f)
                  .map((st) => (
                    <option key={st.id} value={`${f}|${st.id}`}>
                      {f} → {st.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      {action.type === "distribute" && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {options.profiles.map((p) => {
              const on = action.ownerIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange({
                      ...action,
                      ownerIds: on
                        ? action.ownerIds.filter((x) => x !== p.id)
                        : [...action.ownerIds, p.id],
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.full_name}
                </button>
              );
            })}
          </div>
          <div className="flex gap-3 text-[12.5px] font-semibold">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => onChange({ ...action, ownerIds: options.profiles.map((p) => p.id) })}
            >
              {t("tk.all")}
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:underline"
              onClick={() => onChange({ ...action, ownerIds: [] })}
            >
              {t("tk.none")}
            </button>
          </div>
          <Check
            checked={action.onlyUnowned ?? true}
            onChange={(v) => onChange({ ...action, onlyUnowned: v })}
            label={t("tk.onlyUnowned")}
          />
          <p className="text-[11px] text-subtle">{t("dp.distributeHint")}</p>
        </>
      )}

      {action.type === "lead_owner" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <Lbl text={t("tk.mode")} req />
            <select
              value={action.mode}
              onChange={(e) => onChange({ ...action, mode: e.target.value as typeof action.mode })}
              className={inputCls}
            >
              {(["admin", "rop", "specific", "roundrobin"] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`tk.owner.${m}`)}
                </option>
              ))}
            </select>
          </label>
          {action.mode === "specific" && (
            <label className="block">
              <Lbl text={t("tk.operator")} req />
              <select
                value={action.ownerId ?? ""}
                onChange={(e) => onChange({ ...action, ownerId: e.target.value })}
                className={inputCls}
              >
                <option value="">{t("dp.chooseEmployee")}</option>
                {options.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="sm:col-span-2">
            <Check
              checked={action.onlyUnowned ?? true}
              onChange={(v) => onChange({ ...action, onlyUnowned: v })}
              label={t("tk.onlyUnowned")}
            />
            <p className="mt-1 text-[11px] text-subtle">{t("tk.ownerAuto")}</p>
          </div>
        </div>
      )}

      {action.type === "quality_check" && (
        <div className="space-y-2">
          <Lbl text={t("tk.reasons")} />
          {(options.lossReasons ?? []).length === 0 ? (
            <p className="text-[12px] text-amber-600 dark:text-amber-400">{t("tk.noReasons")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(options.lossReasons ?? []).map((r) => {
                const on = action.reasons.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      onChange({
                        ...action,
                        reasons: on
                          ? action.reasons.filter((x) => x !== r)
                          : [...action.reasons, r],
                      })
                    }
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          )}
          <label className="block">
            <Lbl text={t("tk.tags")} req />
            <input
              value={action.tag}
              onChange={(e) => onChange({ ...action, tag: e.target.value })}
              placeholder={t("dp.tag")}
              className={inputCls}
            />
          </label>
        </div>
      )}

      {action.type === "tg_chat_message" && (
        <div className="space-y-2">
          <label className="block">
            <Lbl text="Chat ID" req />
            <input
              value={action.chatId}
              onChange={(e) => onChange({ ...action, chatId: e.target.value })}
              placeholder="5607700179"
              className={inputCls}
            />
          </label>
          <label className="block">
            <Lbl text={t("tk.text")} req />
            <textarea
              value={action.text}
              onChange={(e) => onChange({ ...action, text: e.target.value })}
              rows={3}
              className={`${inputCls} h-auto py-2`}
            />
          </label>
          <p className="text-[11px] text-subtle">{t("tk.chatIdHint")}</p>
        </div>
      )}

      {action.type === "sale_congrats" && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block">
              <Lbl text={t("tk.to")} req />
              <select
                value={action.to}
                onChange={(e) => onChange({ ...action, to: e.target.value as typeof action.to })}
                className={inputCls}
              >
                {(["owner", "rop", "both"] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`tk.congrats.${v}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <Lbl text={t("tk.lang")} req />
              <select
                value={action.lang}
                onChange={(e) =>
                  onChange({ ...action, lang: e.target.value as typeof action.lang })
                }
                className={inputCls}
              >
                <option value="uz">O'zbekcha</option>
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block">
              <Lbl text={t("tk.seconds")} />
              <input
                type="number"
                min={3}
                max={60}
                value={action.seconds}
                onChange={(e) => onChange({ ...action, seconds: Number(e.target.value) || 15 })}
                className={inputCls}
              />
            </label>
          </div>
          <label className="block">
            <Lbl text={t("tk.congratsText")} />
            <textarea
              value={action.text}
              onChange={(e) => onChange({ ...action, text: e.target.value })}
              rows={3}
              className={`${inputCls} h-auto py-2`}
            />
          </label>
          <p className="text-[11px] text-subtle">{"{ism} {mijoz} {summa} {bosqich}"}</p>
          <button
            type="button"
            onClick={() =>
              celebrate({
                kind: "sale",
                seller: "Aziz",
                lead: action.text
                  .replace(/\{ism\}/g, "Aziz")
                  .replace(/\{mijoz\}/g, "Mijoz")
                  .replace(/\{summa\}/g, "1 200 000")
                  .replace(/\{bosqich\}/g, "Sotildi"),
              })
            }
            className="text-[12.5px] font-semibold text-primary hover:underline"
          >
            {t("tk.tryIt")}
          </button>
        </div>
      )}

      {action.type === "auto_chat" && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {(["priceStageId", "mediaStageId"] as const).map((k) => (
              <label key={k} className="block">
                <Lbl text={t(`tk.auto.${k}`)} req />
                <select
                  value={action[k]}
                  onChange={(e) => onChange({ ...action, [k]: e.target.value })}
                  className={inputCls}
                >
                  <option value="">{t("dp.chooseStage")}</option>
                  {options.stages.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label className="block">
            <Lbl text={t("tk.auto.wait")} />
            <input
              type="number"
              min={1}
              value={action.waitMinutes}
              onChange={(e) =>
                onChange({ ...action, waitMinutes: Math.max(1, Number(e.target.value) || 10) })
              }
              className={inputCls}
            />
          </label>
          <label className="block">
            <Lbl text={t("tk.auto.words")} />
            <input
              value={action.keywords.join(", ")}
              onChange={(e) =>
                onChange({
                  ...action,
                  keywords: e.target.value
                    .split(",")
                    .map((w) => w.trim())
                    .filter(Boolean),
                })
              }
              placeholder="chegirma, bo'lib to'lash"
              className={inputCls}
            />
          </label>
          <p className="text-[11px] text-subtle">{t("tk.auto.hint")}</p>
        </div>
      )}

      {action.type === "send_card" && (
        <div className="space-y-2">
          <label className="block">
            <Lbl text={t("tk.card.title")} req />
            <input
              value={action.title}
              onChange={(e) => onChange({ ...action, title: e.target.value })}
              placeholder={t("tk.card.titlePh")}
              className={inputCls}
            />
          </label>
          <input
            value={action.description ?? ""}
            onChange={(e) => onChange({ ...action, description: e.target.value })}
            placeholder={t("tk.card.desc")}
            className={inputCls}
          />
          <input
            value={action.image ?? ""}
            onChange={(e) => onChange({ ...action, image: e.target.value })}
            placeholder={t("tk.card.image")}
            className={inputCls}
          />
          <label className="block">
            <Lbl text={t("tk.card.buttons")} />
            <textarea
              value={action.buttons.join("\n")}
              onChange={(e) =>
                onChange({
                  ...action,
                  buttons: e.target.value
                    .split("\n")
                    .map((b) => b.trim())
                    .filter(Boolean)
                    .slice(0, 3),
                })
              }
              rows={3}
              className={`${inputCls} h-auto py-2`}
            />
          </label>
        </div>
      )}

      {action.type === "api_post" && (
        <div className="space-y-2">
          <label className="block">
            <Lbl text={t("tk.api.url")} req />
            <input
              value={action.url}
              onChange={(e) => onChange({ ...action, url: e.target.value })}
              placeholder="https://..."
              className={inputCls}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block">
              <Lbl text={t("tk.api.auth")} />
              <select
                value={action.auth}
                onChange={(e) =>
                  onChange({ ...action, auth: e.target.value as typeof action.auth })
                }
                className={inputCls}
              >
                <option value="bearer">Bearer token</option>
                <option value="x-api-key">X-API-Key</option>
                <option value="none">{t("tk.api.noKey")}</option>
              </select>
            </label>
            {action.auth !== "none" && (
              <label className="block">
                <Lbl text={t("tk.api.key")} req />
                <input
                  type="password"
                  autoComplete="off"
                  value={action.key ?? ""}
                  onChange={(e) => onChange({ ...action, key: e.target.value })}
                  className={inputCls}
                />
              </label>
            )}
            <label className="block">
              <Lbl text={t("tk.api.format")} />
              <select
                value={action.format}
                onChange={(e) =>
                  onChange({ ...action, format: e.target.value as typeof action.format })
                }
                className={inputCls}
              >
                <option value="fields">{'{"fields":[{type, label, value}]}'}</option>
                <option value="flat">{'{"type": "value"}'}</option>
              </select>
            </label>
          </div>
          <Lbl text={t("tk.api.fields")} />
          <div className="space-y-1.5">
            {action.fields.map((fld, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5">
                <input
                  value={fld.name}
                  onChange={(e) =>
                    onChange({
                      ...action,
                      fields: action.fields.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder={t("tk.api.name")}
                  className={inputCls}
                />
                <input
                  value={fld.label}
                  onChange={(e) =>
                    onChange({
                      ...action,
                      fields: action.fields.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder={t("tk.api.label")}
                  className={inputCls}
                />
                <select
                  value={fld.source}
                  onChange={(e) =>
                    onChange({
                      ...action,
                      fields: action.fields.map((x, j) =>
                        j === i ? { ...x, source: e.target.value } : x,
                      ),
                    })
                  }
                  className={inputCls}
                >
                  {API_SOURCES.map((src) => (
                    <option key={src} value={src}>
                      {t(`tk.src.${src}`)}
                    </option>
                  ))}
                  {options.customFields.map((cf) => (
                    <option key={cf.key} value={`custom:${cf.key}`}>
                      {cf.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={t("dp.remove")}
                  onClick={() =>
                    onChange({ ...action, fields: action.fields.filter((_, j) => j !== i) })
                  }
                  className="rounded-md p-1 text-subtle hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...action,
                  fields: [...action.fields, { name: "", label: "", source: "name" }],
                })
              }
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> {t("tk.api.addField")}
            </button>
          </div>
        </div>
      )}

      {action.type === "webhook" && (
        <>
          <input
            value={action.url}
            onChange={(e) => onChange({ ...action, url: e.target.value })}
            placeholder="https://..."
            className={inputCls}
          />
          <p className="text-[11px] text-subtle">{t("dp.webhookHint")}</p>
        </>
      )}
    </div>
  );
}

export function AddActionSelect({
  onAdd,
  exclude = [],
}: {
  onAdd: (type: AutomationActionType) => void;
  exclude?: AutomationActionType[];
}) {
  const { t } = useI18n();
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value as AutomationActionType);
      }}
      className={`${inputCls} border-dashed text-muted-foreground`}
    >
      <option value="">+ {t("dp.addAction")}</option>
      {ACTION_TYPES.filter((a) => !exclude.includes(a)).map((a) => (
        <option key={a} value={a}>
          {t(`dp.action.${a}`)}
        </option>
      ))}
    </select>
  );
}
