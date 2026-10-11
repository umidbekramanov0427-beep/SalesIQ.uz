import { Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
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
};

const CHANNELS: MessageChannel[] = ["auto", "telegram", "sms", "email"];
const PRIORITIES: Priority[] = ["Urgent", "High", "Normal", "Low"];
const BASE_FIELDS = ["budget", "priority", "temperature", "source"] as const;

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
  }
}

/** False when a required value is still empty. */
export function actionIsComplete(a: AutomationAction): boolean {
  switch (a.type) {
    case "send_message":
      return !!a.text.trim();
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
            <p className="mb-1 text-[11px] text-subtle">{t("dp.taskDueIn")}</p>
            <DurationInput
              minutes={action.dueInMinutes ?? (action.dueInDays ?? 0) * 1440}
              onChange={(m) => {
                const { dueInDays: _d, ...rest } = action;
                onChange({ ...rest, dueInMinutes: m });
              }}
            />
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
              type={action.field === "budget" ? "number" : "text"}
              onChange={(e) => onChange({ ...action, value: e.target.value })}
              placeholder={t("dp.value")}
              className={inputCls}
            />
          )}
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
