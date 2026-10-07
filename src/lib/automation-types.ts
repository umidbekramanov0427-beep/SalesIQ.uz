// Shared (browser + server) shapes for the digital pipeline and salesbots.
// The database executes the in-database actions (apply_automation_actions
// in 20261017000000_digital_pipeline_salesbots.sql); send_message, webhook,
// start_salesbot and dedupe are queued and run by /automations/tick.

export type AutomationTriggerType =
  | "stage_enter"
  | "lead_created"
  | "tag_added"
  | "lead_won"
  | "lead_lost"
  | "stage_stuck"
  | "message_received";

export const TRIGGER_TYPES: AutomationTriggerType[] = [
  "lead_created",
  "stage_enter",
  "stage_stuck",
  "tag_added",
  "message_received",
  "lead_won",
  "lead_lost",
];

/** Triggers that belong to one stage column; the rest are funnel-wide. */
export const STAGE_TRIGGERS: AutomationTriggerType[] = ["stage_enter", "stage_stuck"];

export type MessageChannel = "auto" | "telegram" | "whatsapp" | "sms" | "email";

export type Priority = "Urgent" | "High" | "Normal" | "Low";

export type AutomationAction =
  | { type: "assign_owner"; ownerId: string }
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string }
  | {
      type: "create_task";
      title: string;
      description?: string;
      assigneeId?: string;
      dueInDays?: number;
      dueInMinutes?: number;
      priority?: Priority;
    }
  | { type: "add_note"; text: string }
  | { type: "move_stage"; stageId: string }
  | { type: "close_won" }
  | { type: "close_lost"; reason?: string }
  | { type: "set_field"; field: string; value: string }
  | { type: "send_message"; channel: MessageChannel; text: string; subject?: string }
  | { type: "webhook"; url: string }
  | { type: "start_salesbot"; botId: string }
  | { type: "dedupe"; mode: "merge" | "tag" };

export type AutomationActionType = AutomationAction["type"];

export const ACTION_TYPES: AutomationActionType[] = [
  "send_message",
  "create_task",
  "add_tag",
  "remove_tag",
  "move_stage",
  "assign_owner",
  "start_salesbot",
  "close_lost",
  "close_won",
  "set_field",
  "add_note",
  "dedupe",
  "webhook",
];

/* ------------------------------ Salesbot ------------------------------ */

export type BotButton = { label: string; next?: string };

export type BotStep =
  | { id: string; type: "message"; text: string; buttons?: BotButton[]; next?: string }
  | {
      id: string;
      type: "wait_reply";
      timeoutMinutes: number;
      saveAs?: string;
      next?: string;
      onTimeout?: string;
    }
  | {
      id: string;
      type: "condition";
      source: "reply" | "field";
      field?: string;
      operator: "contains" | "eq" | "neq" | "gt" | "lt" | "any";
      value: string;
      then?: string;
      else?: string;
    }
  | { id: string; type: "action"; action: AutomationAction; next?: string }
  | { id: string; type: "delay"; minutes: number; next?: string }
  | { id: string; type: "handoff"; text?: string }
  | { id: string; type: "stop" };

export type BotStepType = BotStep["type"];

export const BOT_STEP_TYPES: BotStepType[] = [
  "message",
  "wait_reply",
  "condition",
  "action",
  "delay",
  "handoff",
  "stop",
];

/** Fills {{name}}, {{phone}}, {{company}}, {{manager}}, {{reply}} and any saved bot variable. */
export function renderTemplate(text: string, vars: Record<string, string | null | undefined>) {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}
