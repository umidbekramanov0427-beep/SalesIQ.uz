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
  | "message_received"
  | "owner_changed"
  | "daily";

export const TRIGGER_TYPES: AutomationTriggerType[] = [
  "lead_created",
  "stage_enter",
  "stage_stuck",
  "tag_added",
  "message_received",
  "owner_changed",
  "lead_won",
  "lead_lost",
  "daily",
];

/** Triggers that belong to one stage column; the rest are funnel-wide. */
export const STAGE_TRIGGERS: AutomationTriggerType[] = ["stage_enter", "stage_stuck", "daily"];

export type MessageChannel = "auto" | "telegram" | "sms" | "email";

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
  | { type: "set_field"; field: string; value: string; onlyEmpty?: boolean }
  | {
      type: "send_message";
      channel: MessageChannel;
      text: string;
      subject?: string;
      /** Files sent with the message (an offer PDF, a video, an audio). */
      files?: MessageFile[];
      /** Telegram buttons under the message; each can answer and tag. */
      buttons?: MessageButton[];
      /** «Har lidga faqat bir marta»: never twice to the same lead by this rule. */
      once?: boolean;
      /** «Media havolasi»: a picture / video / audio link sent with the text. */
      mediaUrl?: string;
      /** «Media turi»: send the link as a photo, video or file (Telegram). */
      mediaKind?: "photo" | "video" | "document";
    }
  | { type: "webhook"; url: string }
  /** «Telegram xabar»: to a staff member's or a group's chat (by chat id). */
  | { type: "tg_chat_message"; chatId: string; text: string }
  /** «API'ga yuborish»: the lead's fields to another system, with a key. */
  | {
      type: "api_post";
      url: string;
      auth: "bearer" | "x-api-key" | "none";
      key?: string;
      format: "fields" | "flat";
      fields: { name: string; label: string; source: string }[];
    }
  /** «Sotuv tabrigi»: a personal congratulation on the seller's / head's screen. */
  | {
      type: "sale_congrats";
      to: "owner" | "rop" | "both";
      lang: "uz" | "ru" | "en";
      text: string;
      seconds: number;
    }
  /** «Avto yozishma»: reads the chat after a wait and moves the lead. */
  | {
      type: "auto_chat";
      priceStageId: string;
      mediaStageId: string;
      waitMinutes: number;
      keywords: string[];
    }
  /** «Karta»: a picture, a text and up to 3 buttons in one message. */
  | { type: "send_card"; title: string; description?: string; image?: string; buttons: string[] }
  /** «Lid egaligi»: to the admin, a head of sales, one person or in turn. */
  | {
      type: "lead_owner";
      mode: "admin" | "rop" | "specific" | "roundrobin";
      ownerId?: string;
      onlyUnowned?: boolean;
    }
  /** «Sifat nazorati»: a tag when the closing reason is one of these. */
  | { type: "quality_check"; reasons: string[]; tag: string }
  | { type: "start_salesbot"; botId: string }
  | { type: "dedupe"; mode: "merge" | "tag" }
  /** The actions after this one run `minutes` later (queued in the outbox). */
  | { type: "delay"; minutes: number }
  /** Closes the lead's open tasks. */
  | { type: "close_tasks"; note?: string }
  /** «Umumiy bazaga qaytarish»: the lead loses its owner (back to the shared pool). */
  | { type: "release_owner" }
  /** «Lid egaligi»: to the owner of the same client's latest other lead. */
  | { type: "previous_owner" }
  /** A lead without a phone takes the number the client wrote in the chat. */
  | { type: "detect_phone"; stageId?: string }
  /** Moves the lead to another funnel's first open stage. */
  | { type: "move_funnel"; funnel: string; stageId?: string }
  /** In turn: whoever of these people has the fewest open leads gets it. */
  | {
      type: "distribute";
      ownerIds: string[];
      onlyUnowned?: boolean;
      /** «Faqat online xodimlarga» (seen in the app in the last 5 minutes). */
      onlineOnly?: boolean;
      /** Per person share (1-10, default 1): 2 gets twice as many as 1. */
      weights?: Record<string, number>;
      /** Hand on to the next person when no work is done in this many minutes (0 = never). */
      reassignMinutes?: number;
      /** Told when the second person also does nothing. */
      controller?: "rop_or_owner" | "rop" | "none";
    }
  /** Internal (outbox only): the «N daqiqada ishlanmasa» check of a distribute. */
  | {
      type: "distribute_check";
      ownerIds: string[];
      ownerId: string;
      assignedAt: string;
      round: number;
      reassignMinutes: number;
      controller?: "rop_or_owner" | "rop" | "none";
      onlineOnly?: boolean;
      weights?: Record<string, number>;
    }
  /** Internal: what was left after a delay (only ever in the outbox). */
  | { type: "run_actions"; actions: AutomationAction[] }
  // Salesbot-only: writes a (templated) value such as {{reply}} into the
  // lead's contact -- e.g. "Ismingizni kiriting" -> contact name.
  | { type: "set_contact"; field: "name" | "phone" | "email"; value: string };

/** A file attached to an automatic message, uploaded once to Storage (lead-files, <org>/bulk/). */
export type MessageFile = { path: string; name: string; type: string };

/**
 * A button under an automatic Telegram message ("O'qib chiqdim, roziman").
 * When the client presses it, `reply` is sent back (templated) and `tag`
 * is put on the lead -- e.g. an offer with "agree" / "I have objections".
 */
export type MessageButton = { label: string; reply?: string; tag?: string };

/**
 * Which button a client's message stands for: its label (Telegram sends the
 * pressed button's text), or its number ("1", "2") when they typed it.
 * -1 when it is neither.
 */
export function matchButton(labels: string[], text: string): number {
  const t = text.trim().toLowerCase();
  if (!t) return -1;
  const byLabel = labels.findIndex((l) => l.trim().toLowerCase() === t);
  if (byLabel >= 0) return byLabel;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 && n <= labels.length ? n - 1 : -1;
}

export type AutomationActionType = AutomationAction["type"];

export const ACTION_TYPES: AutomationActionType[] = [
  "send_message",
  "create_task",
  "add_tag",
  "remove_tag",
  "move_stage",
  "move_funnel",
  "assign_owner",
  "distribute",
  "delay",
  "close_tasks",
  "release_owner",
  "previous_owner",
  "detect_phone",
  "start_salesbot",
  "close_lost",
  "close_won",
  "set_field",
  "add_note",
  "dedupe",
  "webhook",
  "tg_chat_message",
  "api_post",
  "sale_congrats",
  "auto_chat",
  "send_card",
  "lead_owner",
  "quality_check",
];

/* ------------------------------ Salesbot ------------------------------ */

/** A reply option (the client answers with its number or text), or a link when `url` is set. */
export type BotButton = { label: string; next?: string; url?: string };

/** Where a step leads when the bot should finish. */
export const END_STEP = "__end__";

/** Canvas position of a step in the salesbot editor. */
export type StepPos = { x: number; y: number };

export type BotStep =
  | {
      id: string;
      type: "message";
      text: string;
      buttons?: BotButton[];
      next?: string;
      pos?: StepPos;
    }
  | {
      id: string;
      type: "wait_reply";
      /** 0 = wait without a time limit. */
      timeoutMinutes: number;
      saveAs?: string;
      /** Only accept this kind of answer; otherwise `invalidText` is sent and the bot asks again. */
      validate?: ReplyKind;
      invalidText?: string;
      next?: string;
      onTimeout?: string;
      pos?: StepPos;
    }
  | {
      id: string;
      type: "condition";
      source: "reply" | "field";
      field?: string;
      operator: "contains" | "eq" | "neq" | "gt" | "lt" | "any" | "phone";
      value: string;
      then?: string;
      else?: string;
      pos?: StepPos;
    }
  | { id: string; type: "action"; action: AutomationAction; next?: string; pos?: StepPos }
  | { id: string; type: "delay"; minutes: number; next?: string; pos?: StepPos }
  | {
      id: string;
      type: "split";
      /** Share of clients (0-100) sent down path A; the rest go to B. */
      percentA: number;
      a?: string;
      b?: string;
      pos?: StepPos;
    }
  | {
      id: string;
      type: "ai_reply";
      /** What the AI should know / how it should answer (prices, tone, the offer). */
      prompt: string;
      next?: string;
      pos?: StepPos;
    }
  | { id: string; type: "handoff"; text?: string; pos?: StepPos }
  | { id: string; type: "stop"; pos?: StepPos };

export type BotStepType = BotStep["type"];

export const BOT_STEP_TYPES: BotStepType[] = [
  "message",
  "wait_reply",
  "condition",
  "action",
  "delay",
  "split",
  "ai_reply",
  "handoff",
  "stop",
];

/** Answer kinds a "wait for reply" step can insist on. */
export type ReplyKind = "phone" | "email" | "number" | "name";

export const REPLY_KINDS: ReplyKind[] = ["phone", "email", "number", "name"];

/** How many wrong answers a validating step accepts before moving on. */
export const MAX_INVALID_REPLIES = 3;

/** True when `text` is an answer of that kind. */
export function replyIsValid(kind: ReplyKind, text: string): boolean {
  const v = text.trim();
  switch (kind) {
    case "phone": {
      const digits = v.replace(/\D/g, "");
      return /^[+\d\s()-]+$/.test(v) && digits.length >= 9 && digits.length <= 15;
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    case "number":
      return /^-?\d[\d\s]*([.,]\d+)?$/.test(v);
    case "name":
      return /\p{L}/u.test(v) && v.length >= 2 && v.length <= 60 && !/\d/.test(v);
  }
}

/** Which path of an A/B split a client takes, for a random number in [0, 1). */
export function splitPath(percentA: number, rnd: number): "a" | "b" {
  const p = Math.max(0, Math.min(100, percentA));
  return rnd * 100 < p ? "a" : "b";
}

/** Fills {{name}}, {{phone}}, {{company}}, {{manager}}, {{reply}} and any saved bot variable. */
export function renderTemplate(text: string, vars: Record<string, string | null | undefined>) {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}
