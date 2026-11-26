import { END_STEP, type BotStep } from "@/lib/automation-types";

// The six ready-made salesbots of the «Yangi bot» window (5CRM's template
// list). Each is ordinary BotSteps the engine runs; a bot made from one
// starts switched off and in test mode, so nothing reaches a real client
// until the company has looked at it. Texts come from the dictionaries
// (keys sb.t6.*), so the bot speaks the language its company works in.

export type TemplateKey =
  "greeter" | "handoff" | "emailOffer" | "keyword" | "collectEmail" | "afterHours";

/** The trigger each template is meant for (the editor's «Ishga tushish sharti»). */
export type TemplateTrigger = "message" | "stage_enter";

export type BotTemplate = {
  key: TemplateKey;
  trigger: TemplateTrigger;
  steps: BotStep[];
};

type T = (key: string, vars?: Record<string, string | number>) => string;

export const TEMPLATE_KEYS: TemplateKey[] = [
  "greeter",
  "handoff",
  "emailOffer",
  "keyword",
  "collectEmail",
  "afterHours",
];

/** Lay steps out left to right (the canvas reads them in that order). */
function placed(steps: BotStep[]): BotStep[] {
  return steps.map((s, i) => ({ ...s, pos: { x: 60 + i * 300, y: 80 } }));
}

export function botTemplate(key: TemplateKey, t: T): BotTemplate {
  switch (key) {
    case "greeter":
      return {
        key,
        trigger: "stage_enter",
        steps: placed([
          { id: "g1", type: "message", text: t("sb.t6.greeter.msg"), next: "g2" },
          {
            id: "g2",
            type: "action",
            action: { type: "add_tag", tag: t("sb.t6.greeter.tag") },
            next: "g3",
          },
          { id: "g3", type: "note", text: t("sb.t6.greeter.note"), next: END_STEP },
        ]),
      };
    case "handoff":
      return {
        key,
        trigger: "message",
        steps: placed([
          {
            id: "h1",
            type: "message",
            text: t("sb.t6.handoff.ask"),
            buttons: [{ label: t("sb.t6.handoff.sales") }, { label: t("sb.t6.handoff.help") }],
            next: "h2",
          },
          { id: "h2", type: "wait_reply", timeoutMinutes: 60, next: "h3", onTimeout: "h6" },
          {
            id: "h3",
            type: "condition",
            source: "reply",
            operator: "contains",
            value: t("sb.t6.handoff.sales"),
            then: "h4",
            else: "h5",
          },
          { id: "h4", type: "distribute", next: END_STEP },
          { id: "h5", type: "note", text: t("sb.t6.handoff.note"), next: "h6" },
          { id: "h6", type: "handoff", text: t("sb.t6.handoff.bye") },
        ]),
      };
    case "emailOffer":
      return {
        key,
        trigger: "stage_enter",
        steps: placed([
          {
            id: "e1",
            type: "action",
            action: {
              type: "send_message",
              channel: "email",
              subject: t("sb.t6.emailOffer.subject"),
              text: t("sb.t6.emailOffer.body"),
            },
            next: "e2",
          },
          { id: "e2", type: "message", text: t("sb.t6.emailOffer.msg"), next: "e3" },
          { id: "e3", type: "note", text: t("sb.t6.emailOffer.note"), next: END_STEP },
        ]),
      };
    case "keyword":
      return {
        key,
        trigger: "message",
        steps: placed([
          {
            id: "k1",
            type: "condition",
            source: "reply",
            operator: "any_of",
            value: t("sb.t6.keyword.words"),
            then: "k2",
            else: "k4",
          },
          { id: "k2", type: "message", text: t("sb.t6.keyword.msg"), next: "k3" },
          {
            id: "k3",
            type: "action",
            action: { type: "add_tag", tag: t("sb.t6.keyword.tag") },
            next: END_STEP,
          },
          { id: "k4", type: "stop" },
        ]),
      };
    case "collectEmail":
      return {
        key,
        trigger: "stage_enter",
        steps: placed([
          { id: "c1", type: "message", text: t("sb.t6.collectEmail.ask"), next: "c2" },
          { id: "c2", type: "wait_reply", timeoutMinutes: 1440, next: "c3" },
          { id: "c3", type: "validate", kind: "email", saveAs: "email", then: "c4", else: "c5" },
          { id: "c4", type: "message", text: t("sb.t6.collectEmail.thanks"), next: END_STEP },
          { id: "c5", type: "message", text: t("sb.t6.collectEmail.again"), next: "c2" },
        ]),
      };
    case "afterHours":
      return {
        key,
        trigger: "message",
        steps: placed([
          {
            id: "a1",
            type: "condition",
            source: "field",
            field: "after_hours",
            operator: "eq",
            value: "1",
            then: "a2",
            else: END_STEP,
          },
          { id: "a2", type: "message", text: t("sb.t6.afterHours.msg"), next: "a3" },
          {
            id: "a3",
            type: "action",
            action: { type: "create_task", title: t("sb.t6.afterHours.task"), dueInDays: 1 },
            next: END_STEP,
          },
        ]),
      };
  }
}
