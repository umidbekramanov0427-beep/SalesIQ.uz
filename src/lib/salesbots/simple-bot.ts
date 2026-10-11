import { END_STEP, type AutomationAction, type BotStep } from "@/lib/automation-types";

// The salesbot page's "Simple setup": a bot described as a form -- a
// greeting, a list of questions (each answer saved into the lead), a final
// message and what happens in the CRM afterwards -- instead of a canvas.
// buildSimpleSteps turns the form into ordinary BotSteps the engine runs;
// parseSimpleBot reads such steps back. The step ids follow a fixed pattern
// ("s-greet", "s-q0", "s-q0-w", ...), and parse only succeeds when building
// its result gives back exactly the same steps, so a bot edited on the canvas
// is never silently simplified.

export type SimpleSaveTo = "name" | "phone" | "email" | "note" | "none";

export type SimpleQuestion = {
  text: string;
  saveTo: SimpleSaveTo;
  /** Answer buttons; empty = the client types the answer. */
  options: string[];
};

export type SimpleBot = {
  greeting: string;
  questions: SimpleQuestion[];
  finish: string;
  /** Move the lead to this stage when the client has answered everything ("" = don't). */
  stageId: string;
  /** Tag to add ("" = none). */
  tag: string;
  /** Task title for the responsible manager; null = no task. */
  task: string | null;
};

type T = (key: string, vars?: Record<string, string | number>) => string;

/** The ready-made bot every company starts from: registers a client in three questions. */
export function registrationBot(t: T): SimpleBot {
  return {
    greeting: t("sb.tpl.greeting"),
    questions: [
      { text: t("sb.tpl.qName"), saveTo: "name", options: [] },
      { text: t("sb.tpl.qPhone"), saveTo: "phone", options: [] },
      { text: t("sb.tpl.qInterest"), saveTo: "note", options: [] },
    ],
    finish: t("sb.tpl.finish"),
    stageId: "",
    tag: t("sb.tpl.tag"),
    task: t("sb.tpl.task"),
  };
}

const qId = (i: number) => `s-q${i}`;

function saveAction(q: SimpleQuestion): AutomationAction | null {
  const value = q.options.length ? "{{button}}" : "{{reply}}";
  switch (q.saveTo) {
    case "name":
    case "phone":
    case "email":
      return { type: "set_contact", field: q.saveTo, value };
    case "note":
      return { type: "add_note", text: `${q.text}\n${value}` };
    default:
      return null;
  }
}

export function buildSimpleSteps(bot: SimpleBot): BotStep[] {
  // Collected first, then each step is pointed at the one after it.
  const steps: BotStep[] = [];
  if (bot.greeting) steps.push({ id: "s-greet", type: "message", text: bot.greeting });
  bot.questions.forEach((q, i) => {
    steps.push({
      id: qId(i),
      type: "message",
      text: q.text,
      ...(q.options.length ? { buttons: q.options.map((label) => ({ label })) } : {}),
    });
    if (!q.options.length) {
      steps.push({ id: `${qId(i)}-w`, type: "wait_reply", timeoutMinutes: 0 });
    }
    const action = saveAction(q);
    if (action) steps.push({ id: `${qId(i)}-s`, type: "action", action });
  });
  if (bot.finish) steps.push({ id: "s-done", type: "message", text: bot.finish });
  if (bot.stageId) {
    steps.push({
      id: "s-stage",
      type: "action",
      action: { type: "move_stage", stageId: bot.stageId },
    });
  }
  if (bot.tag) {
    steps.push({ id: "s-tag", type: "action", action: { type: "add_tag", tag: bot.tag } });
  }
  if (bot.task !== null) {
    steps.push({
      id: "s-task",
      type: "action",
      action: {
        type: "create_task",
        title: bot.task,
        dueInMinutes: 30,
        priority: "High",
      },
    });
  }
  return steps.map((s, i) => {
    const next = steps[i + 1]?.id ?? END_STEP;
    switch (s.type) {
      case "message":
        return s.buttons
          ? { ...s, next, buttons: s.buttons.map((b) => ({ ...b, next })) }
          : { ...s, next };
      case "wait_reply":
      case "action":
        return { ...s, next };
      default:
        return s;
    }
  });
}

/** Steps without canvas positions, for comparing what a bot does. */
function withoutPositions(steps: BotStep[]) {
  return steps.map((s) => {
    const { pos: _pos, ...rest } = s;
    return rest;
  });
}

export function parseSimpleBot(steps: BotStep[]): SimpleBot | null {
  if (steps.length === 0 || !steps.every((s) => s.id.startsWith("s-"))) return null;
  const byId = new Map(steps.map((s) => [s.id, s]));
  const message = (id: string) => {
    const s = byId.get(id);
    return s?.type === "message" ? s : null;
  };
  const action = (id: string) => {
    const s = byId.get(id);
    return s?.type === "action" ? s.action : null;
  };

  const questions: SimpleQuestion[] = [];
  for (let i = 0; message(qId(i)); i++) {
    const m = message(qId(i))!;
    const save = action(`${qId(i)}-s`);
    const saveTo: SimpleSaveTo =
      save?.type === "set_contact" ? save.field : save?.type === "add_note" ? "note" : "none";
    questions.push({
      text: m.text,
      saveTo,
      options: (m.buttons ?? []).map((b) => b.label),
    });
  }
  const stage = action("s-stage");
  const tag = action("s-tag");
  const task = action("s-task");
  const bot: SimpleBot = {
    greeting: message("s-greet")?.text ?? "",
    questions,
    finish: message("s-done")?.text ?? "",
    stageId: stage?.type === "move_stage" ? stage.stageId : "",
    tag: tag?.type === "add_tag" ? tag.tag : "",
    task: task?.type === "create_task" ? task.title : null,
  };
  const same =
    JSON.stringify(withoutPositions(buildSimpleSteps(bot))) ===
    JSON.stringify(withoutPositions(steps));
  return same ? bot : null;
}

/** What is still missing before the bot can be saved, or null. */
export function simpleBotProblem(bot: SimpleBot): "question" | "option" | "task" | null {
  if (bot.questions.length === 0 && !bot.greeting.trim()) return "question";
  if (bot.questions.some((q) => !q.text.trim())) return "question";
  if (bot.questions.some((q) => q.options.some((o) => !o.trim()))) return "option";
  if (bot.task !== null && !bot.task.trim()) return "task";
  return null;
}
