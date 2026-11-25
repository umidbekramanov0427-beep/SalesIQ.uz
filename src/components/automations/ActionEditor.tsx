import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  BadgeCheck,
  Bot,
  Braces,
  CalendarPlus,
  CheckCheck,
  CircleX,
  CopyCheck,
  Crown,
  Eraser,
  LayoutTemplate,
  ListTree,
  MessageSquare,
  MessagesSquare,
  PartyPopper,
  PencilLine,
  Plus,
  ScanSearch,
  Send,
  Shuffle,
  StickyNote,
  Tag,
  Timer,
  Trash2,
  Trophy,
  Undo2,
  UserCheck,
  UserCog,
  Waypoints,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react";
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

/** The icon on each action's row (the same ones as in the trigger catalog). */
const ACTION_ICON: Partial<Record<AutomationActionType, LucideIcon>> = {
  send_message: MessageSquare,
  create_task: CalendarPlus,
  close_tasks: CheckCheck,
  add_tag: Tag,
  remove_tag: Eraser,
  move_stage: ArrowLeftRight,
  move_funnel: Waypoints,
  assign_owner: UserCog,
  previous_owner: UserCheck,
  release_owner: Undo2,
  distribute: Shuffle,
  lead_owner: Crown,
  start_salesbot: Bot,
  close_won: Trophy,
  close_lost: CircleX,
  set_field: PencilLine,
  add_note: StickyNote,
  dedupe: CopyCheck,
  webhook: Webhook,
  api_post: Braces,
  delay: Timer,
  detect_phone: ScanSearch,
  tg_chat_message: Send,
  sale_congrats: PartyPopper,
  auto_chat: MessagesSquare,
  send_card: LayoutTemplate,
  quality_check: BadgeCheck,
  run_actions: ListTree,
};

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
      return { type, ownerIds: [], onlyUnowned: true, onlineOnly: true };
    case "run_actions":
      return { type, actions: [] };
    case "distribute_check":
      return { type, ownerIds: [], ownerId: "", assignedAt: "", round: 0, reassignMinutes: 0 };
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

/**
 * 5CRM's select with its label inside the box («Kimga:* Lid mas'uli»,
 * «Birlik:* soat», «Avtorizatsiya: Bearer token»). The select itself is bare.
 */
export function Inline({
  label,
  req,
  children,
}: {
  label: string;
  req?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex h-10 w-full min-w-0 items-center gap-2 rounded-[3px] border border-border bg-[var(--amo-quiet,var(--background))] pl-3 text-[13.5px] focus-within:border-primary/60">
      <span className="shrink-0 text-muted-foreground">
        {label}
        {req && <span className="text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}

/** The bare select inside <Inline>. */
export const bareCls = "h-full min-w-0 flex-1 bg-transparent pr-2 text-foreground outline-none";

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
  const Icon = ACTION_ICON[action.type] ?? Zap;
  return (
    <div className="space-y-3">
      {/* 5CRM: the action's own row -- icon, name, «← Boshqa amal». */}
      <div className="flex h-10 items-center gap-2 rounded-[3px] bg-[var(--amo-head,var(--accent))] px-3">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 truncate text-[13.5px] font-semibold text-foreground">
          {t(`dp.action.${action.type}`)}
        </span>
        {/* 5CRM's «← Boshqa amal»: swap this step for another kind. */}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1 text-[12px] font-semibold text-primary hover:underline">
          ← {t("tk.otherAction")}
          <select
            value=""
            aria-label={t("tk.otherAction")}
            onChange={(e) => {
              if (e.target.value) onChange(blankAction(e.target.value as AutomationActionType));
            }}
            className="sr-only"
          >
            <option value="">{t("tk.otherAction")}</option>
            {ACTION_TYPES.filter((a) => a !== action.type).map((a) => (
              <option key={a} value={a}>
                {t(`dp.action.${a}`)}
              </option>
            ))}
          </select>
        </label>
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
          <label className="block">
            <Lbl text={action.channel === "sms" ? t("tk.smsText") : t("tk.msgText")} req />
            <textarea
              value={action.text}
              onChange={(e) => onChange({ ...action, text: e.target.value })}
              rows={3}
              placeholder={t("dp.messagePlaceholder")}
              className={`${inputCls} h-auto py-2`}
            />
          </label>
          <p className="text-[11px] text-subtle">{t("dp.placeholdersHint")}</p>
          {action.channel !== "sms" && (
            <>
              <label className="block">
                <Lbl text={t("tk.mediaLink")} />
                <input
                  value={action.mediaUrl ?? ""}
                  onChange={(e) => onChange({ ...action, mediaUrl: e.target.value })}
                  placeholder="https://… (ixtiyoriy)"
                  className={inputCls}
                />
              </label>
              {!!action.mediaUrl?.trim() && (
                <Inline label={t("tk.mediaKind")}>
                  <select
                    data-bare
                    value={action.mediaKind ?? ""}
                    onChange={(e) => {
                      const { mediaKind: _k, ...rest } = action;
                      const v = e.target.value as "photo" | "video" | "document" | "";
                      onChange(v ? { ...rest, mediaKind: v } : rest);
                    }}
                    className={bareCls}
                  >
                    <option value="">{t("tk.media.link")}</option>
                    <option value="photo">{t("tk.media.photo")}</option>
                    <option value="video">{t("tk.media.video")}</option>
                    <option value="document">{t("tk.media.document")}</option>
                  </select>
                </Inline>
              )}
            </>
          )}
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
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <Lbl text={t("tk.taskText")} />
            <input
              value={action.title}
              onChange={(e) => onChange({ ...action, title: e.target.value })}
              placeholder={t("tk.taskTextPh")}
              className={inputCls}
            />
          </label>
          <label className="block sm:col-span-2">
            <Lbl text={t("tk.note")} />
            <textarea
              value={action.description ?? ""}
              onChange={(e) =>
                onChange(
                  e.target.value
                    ? { ...action, description: e.target.value }
                    : (({ description: _d, ...rest }) => rest)(action),
                )
              }
              rows={3}
              className={`${inputCls} h-auto py-2`}
            />
          </label>
          <div className="sm:col-span-2">
            <Inline label={t("tk.to") + ":"}>
              <select
                data-bare
                value={action.assigneeId ?? ""}
                onChange={(e) =>
                  onChange(
                    e.target.value
                      ? { ...action, assigneeId: e.target.value }
                      : (({ assigneeId: _omit, ...rest }) => rest)(action),
                  )
                }
                className={bareCls}
              >
                <option value="">{t("tk.leadOwner")}</option>
                {options.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </Inline>
          </div>
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
        <div className="grid gap-3">
          <Inline label={t("tk.field")} req>
            <select
              data-bare
              value={action.field}
              onChange={(e) => onChange({ ...action, field: e.target.value, value: "" })}
              className={bareCls}
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
          </Inline>
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
          <div className="grid gap-3">
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
            <Inline label={t("tk.wait.unit") + ":"} req>
              <select
                data-bare
                value={waitParts(action.minutes).unit}
                onChange={(e) =>
                  onChange({
                    ...action,
                    minutes: waitMinutes(waitParts(action.minutes).n, e.target.value as WaitUnit),
                  })
                }
                className={bareCls}
              >
                {(["minute", "hour", "day"] as WaitUnit[]).map((u) => (
                  <option key={u} value={u}>
                    {t(`tk.wait.${u}`)}
                  </option>
                ))}
              </select>
            </Inline>
          </div>
          <p className="text-[11px] text-subtle">{t("dp.delayActionHint")}</p>
        </>
      )}

      {action.type === "close_tasks" && (
        <>
          <input
            value={action.note ?? ""}
            onChange={(e) =>
              onChange(
                e.target.value ? { ...action, note: e.target.value } : { type: "close_tasks" },
              )
            }
            placeholder={t("tk.closeNote")}
            className={inputCls}
          />
          <p className="text-[11px] text-subtle">{t("dp.closeTasksHint")}</p>
        </>
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
          {action.ownerIds.length > 1 && (
            <div className="space-y-1 rounded-lg border border-border p-2">
              <p className="text-[12px] font-semibold text-muted-foreground">
                {t("tk.dist.weights")}
              </p>
              {action.ownerIds.map((id) => (
                <div key={id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate">
                    {options.profiles.find((p) => p.id === id)?.full_name ?? "—"}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={action.weights?.[id] ?? 1}
                    onChange={(e) =>
                      onChange({
                        ...action,
                        weights: {
                          ...(action.weights ?? {}),
                          [id]: Math.min(10, Math.max(1, Number(e.target.value) || 1)),
                        },
                      })
                    }
                    className={`${inputCls} h-8 w-20`}
                  />
                </div>
              ))}
            </div>
          )}
          <Check
            checked={action.onlineOnly ?? false}
            onChange={(v) => onChange({ ...action, onlineOnly: v })}
            label={t("tk.dist.online")}
          />
          <Check
            checked={action.onlyUnowned ?? true}
            onChange={(v) => onChange({ ...action, onlyUnowned: v })}
            label={t("tk.onlyUnowned")}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <Lbl text={t("tk.dist.reassign")} />
              <input
                type="number"
                min={0}
                value={action.reassignMinutes ?? 0}
                onChange={(e) =>
                  onChange({ ...action, reassignMinutes: Math.max(0, Number(e.target.value) || 0) })
                }
                className={inputCls}
              />
            </label>
            {(action.reassignMinutes ?? 0) > 0 && (
              <label className="block">
                <Lbl text={t("tk.dist.controller")} />
                <select
                  value={action.controller ?? "rop_or_owner"}
                  onChange={(e) =>
                    onChange({
                      ...action,
                      controller: e.target.value as "rop_or_owner" | "rop" | "none",
                    })
                  }
                  className={inputCls}
                >
                  <option value="rop_or_owner">{t("tk.dist.ctl.rop_or_owner")}</option>
                  <option value="rop">{t("tk.dist.ctl.rop")}</option>
                  <option value="none">{t("tk.dist.ctl.none")}</option>
                </select>
              </label>
            )}
          </div>
          <p className="text-[11px] text-subtle">{t("tk.dist.reassignHint")}</p>
          <p className="text-[11px] text-subtle">{t("dp.distributeHint")}</p>
        </>
      )}

      {action.type === "lead_owner" && (
        <div className="grid gap-3">
          <Inline label={t("tk.mode") + ":"} req>
            <select
              data-bare
              value={action.mode}
              onChange={(e) => onChange({ ...action, mode: e.target.value as typeof action.mode })}
              className={bareCls}
            >
              {(["admin", "rop", "specific", "roundrobin"] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`tk.owner.${m}`)}
                </option>
              ))}
            </select>
          </Inline>
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
        <div className="space-y-3">
          <div className="grid gap-3">
            <Inline label={t("tk.to") + ":"} req>
              <select
                data-bare
                value={action.to}
                onChange={(e) => onChange({ ...action, to: e.target.value as typeof action.to })}
                className={bareCls}
              >
                {(["owner", "rop", "both"] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`tk.congrats.${v}`)}
                  </option>
                ))}
              </select>
            </Inline>
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
          {/* 5CRM: tap a variable to add it; the card below shows the result. */}
          <div className="flex flex-wrap gap-1.5">
            {["{ism}", "{mijoz}", "{summa}", "{bosqich}"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() =>
                  onChange({
                    ...action,
                    text: `${action.text}${action.text.endsWith(" ") || !action.text ? "" : " "}${v}`,
                  })
                }
                className="rounded-full border border-border px-2.5 py-0.5 text-[12px] text-muted-foreground hover:border-primary hover:text-primary"
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex gap-2 rounded-[3px] border border-border bg-[var(--amo-quiet,var(--background))] p-3 text-[12.5px] leading-snug text-foreground">
            <PartyPopper className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              {action.text
                .replace(/\{ism\}/g, "Nodira")
                .replace(/\{mijoz\}/g, "Aziz Karimov")
                .replace(/\{summa\}/g, "1 200 000")
                .replace(/\{bosqich\}/g, "Sotildi")}
            </span>
          </div>
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
        <div className="space-y-3">
          <label className="block">
            <Lbl text={t("tk.api.url")} req />
            <input
              value={action.url}
              onChange={(e) => onChange({ ...action, url: e.target.value })}
              placeholder="https://..."
              className={inputCls}
            />
          </label>
          <div className="grid gap-3">
            <Inline label={t("tk.api.auth") + ":"}>
              <select
                data-bare
                value={action.auth}
                onChange={(e) =>
                  onChange({ ...action, auth: e.target.value as typeof action.auth })
                }
                className={bareCls}
              >
                <option value="bearer">Bearer token</option>
                <option value="x-api-key">X-API-Key</option>
                <option value="none">{t("tk.api.noKey")}</option>
              </select>
            </Inline>
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
            <Inline label={t("tk.api.format") + ":"}>
              <select
                data-bare
                value={action.format}
                onChange={(e) =>
                  onChange({ ...action, format: e.target.value as typeof action.format })
                }
                className={bareCls}
              >
                <option value="fields">{'{"fields":[{type, label, value}]}'}</option>
                <option value="flat">{'{"type": "value"}'}</option>
              </select>
            </Inline>
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
