// Turns an amoCRM Salesbot export (the .json you download from the bot
// editor) into SalesIQ salesbot steps, keeping the blocks where they were
// on amoCRM's canvas. Pure function: the browser runs it on the uploaded
// file and the result opens in the salesbot editor for review before saving.
//
// amoCRM stores the bot as model.text = JSON of { "<n>": { question: [handlers] } }
// where each handler is send_external_message / waits / goto / action /
// validations / wait_answer, and model.positions = JSON array of canvas
// blocks ({ step, x, y }).
import { END_STEP, type BotButton, type BotStep, type StepPos } from "@/lib/automation-types";

type AmoHandler = { handler: string; params?: Record<string, unknown> };
type AmoBlock = { question?: AmoHandler[] };

export type AmoImportResult = { name: string; steps: BotStep[]; warnings: string[] };

const REF = "ref:";

function convertText(text: string): string {
  return text
    .replace(/\{\{\s*message_text(\.phone)?\s*\}\}/g, "{{reply}}")
    .replace(/\{\{\s*contact\.name\s*\}\}/g, "{{name}}")
    .replace(/\{\{\s*lead\.name\s*\}\}/g, "{{name}}");
}

function parseMaybeJson<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

function gotoTarget(params: Record<string, unknown> | undefined): string {
  if (!params) return END_STEP;
  if (params["type"] === "finish") return END_STEP;
  const step = params["step"];
  return typeof step === "number" || typeof step === "string" ? `${REF}${step}` : END_STEP;
}

/** Sets the "open" exit of a step: else for a condition, next otherwise. */
function link(step: BotStep, target: string) {
  if (step.type === "condition") step.else = target;
  else if (step.type !== "handoff" && step.type !== "stop") step.next = target;
}

export function convertAmoSalesbot(
  file: unknown,
  stageByAmoStatus: Map<number, string>,
): AmoImportResult {
  const root = (file ?? {}) as Record<string, unknown>;
  const model = (parseMaybeJson<Record<string, unknown>>(root["model"]) ?? root) as Record<
    string,
    unknown
  >;
  const blocks = parseMaybeJson<Record<string, AmoBlock>>(model["text"]);
  if (!blocks) throw new Error("Not an amoCRM salesbot export");
  const name = typeof model["name"] === "string" ? model["name"] : "amoCRM salesbot";
  const positions =
    parseMaybeJson<{ step?: number; x?: number; y?: number; type?: string }[]>(
      model["positions"],
    ) ?? [];
  const posByStep = new Map<number, StepPos>();
  for (const p of positions) {
    if (typeof p.step === "number" && p.step >= 0 && p.type !== "finish") {
      posByStep.set(p.step, {
        x: Math.round((p.x ?? 0) * 0.62) + 260,
        y: Math.round((p.y ?? 0) * 0.9) + 60,
      });
    }
  }

  const warnings: string[] = [];
  const steps: BotStep[] = [];
  const entry = new Map<string, string>(); // amo step -> first SalesIQ step id
  const alias = new Map<string, string>(); // amo step with no steps -> its goto target

  const keys = Object.keys(blocks)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));

  for (const key of keys) {
    const handlers = blocks[key]?.question ?? [];
    let k = 0;
    let open: BotStep | null = null;
    const basePos = posByStep.get(Number(key));
    const add = (step: BotStep) => {
      step.id = k === 0 ? `a${key}` : `a${key}_${k}`;
      if (basePos) step.pos = { x: basePos.x, y: basePos.y + k * 170 };
      if (k === 0) entry.set(key, step.id);
      k++;
      if (open) link(open, step.id);
      steps.push(step);
      return step;
    };

    for (const h of handlers) {
      const p = (h.params ?? {}) as Record<string, unknown>;
      switch (h.handler) {
        case "send_external_message":
        case "send_message": {
          const message = (p["message"] ?? p) as Record<string, unknown>;
          const text = convertText(String(message["text"] ?? ""));
          const buttons: BotButton[] = (
            (message["buttons"] as { text?: string; url?: string }[] | undefined) ?? []
          )
            .filter((b) => b.text)
            .map((b) => (b.url ? { label: b.text!, url: b.url } : { label: b.text! }));
          if ((message["attachments"] as unknown[] | undefined)?.length) {
            warnings.push(`#${key}: rasm/fayl ilovasi ko'chirilmadi — matnga havola qo'shing.`);
          }
          open = add({
            id: "",
            type: "message",
            text,
            ...(buttons.length ? { buttons } : {}),
          });
          break;
        }
        case "goto": {
          const target = gotoTarget(p);
          if (open) link(open, target);
          else if (k === 0) alias.set(key, target);
          open = null;
          break;
        }
        case "waits": {
          const conditions =
            (p["conditions"] as {
              event?: { source?: string; action?: string; delay?: number };
              action?: Record<string, unknown>;
            }[]) ?? [];
          let onReply = END_STEP;
          let onTimeout: string | undefined;
          let timeoutMinutes = 0;
          for (const c of conditions) {
            if (c.event?.source === "message") onReply = gotoTarget(c.action);
            else if (c.event?.source === "timer") {
              onTimeout = gotoTarget(c.action);
              timeoutMinutes = Math.max(1, Math.round((c.event.delay ?? 60) / 60));
            } else {
              warnings.push(`#${key}: "${c.event?.source ?? "?"}" kutish sharti ko'chirilmadi.`);
            }
          }
          add({
            id: "",
            type: "wait_reply",
            timeoutMinutes,
            next: onReply,
            ...(onTimeout ? { onTimeout } : {}),
          });
          open = null;
          break;
        }
        case "wait_answer": {
          add({ id: "", type: "wait_reply", timeoutMinutes: 0, next: gotoTarget(p) });
          open = null;
          break;
        }
        case "validations": {
          const conditions = (p["conditions"] as { type?: string; operation?: string }[]) ?? [];
          const result = (p["result"] as AmoHandler[] | undefined) ?? [];
          const thenGoto = result.find((r) => r.handler === "goto");
          const phone = conditions.some((c) => c.type === "phone");
          if (!phone) warnings.push(`#${key}: validator turi to'liq ko'chirilmadi, tekshiring.`);
          open = add({
            id: "",
            type: "condition",
            source: "reply",
            operator: phone ? "phone" : "any",
            value: "",
            then: thenGoto ? gotoTarget(thenGoto.params) : END_STEP,
          });
          break;
        }
        case "action": {
          const actionName = p["name"];
          const ap = (p["params"] ?? {}) as Record<string, unknown>;
          if (actionName === "set_custom_fields") {
            const value = String(ap["value"] ?? "");
            const field = String(ap["custom_field"] ?? "");
            const target = /contact\.name/.test(field)
              ? "name"
              : /\.phone\}\}/.test(value) || /phone/i.test(field)
                ? "phone"
                : /email/i.test(field)
                  ? "email"
                  : null;
            if (target) {
              open = add({
                id: "",
                type: "action",
                action: { type: "set_contact", field: target, value: convertText(value) },
              });
            } else {
              warnings.push(`#${key}: "${field}" maydoniga yozish ko'chirilmadi (izoh sifatida).`);
              open = add({
                id: "",
                type: "action",
                action: { type: "add_note", text: `${field}: ${convertText(value)}` },
              });
            }
          } else if (actionName === "change_status") {
            const statusId = Number(ap["value"]);
            const stageId = stageByAmoStatus.get(statusId);
            if (stageId) {
              open = add({ id: "", type: "action", action: { type: "move_stage", stageId } });
            } else {
              warnings.push(
                `#${key}: amoCRM bosqichi ${statusId} SalesIQ'da topilmadi — bosqichni tanlang.`,
              );
              open = add({ id: "", type: "action", action: { type: "move_stage", stageId: "" } });
            }
          } else if (actionName === "set_tag" || actionName === "unset_tag") {
            const tags = (ap["value"] as string[] | undefined) ?? [];
            const type = actionName === "unset_tag" ? "remove_tag" : "add_tag";
            for (const tag of tags) open = add({ id: "", type: "action", action: { type, tag } });
          } else {
            warnings.push(`#${key}: "${String(actionName)}" amali ko'chirilmadi.`);
          }
          break;
        }
        default:
          warnings.push(`#${key}: "${h.handler}" bloki ko'chirilmadi.`);
      }
    }
    if (open) link(open, END_STEP);
  }

  // Resolve ref:<amo step> to real step ids (following goto-only blocks).
  const resolve = (target: string, depth = 0): string => {
    if (!target.startsWith(REF)) return target;
    const amoStep = target.slice(REF.length);
    const id = entry.get(amoStep);
    if (id) return id;
    const next = alias.get(amoStep);
    return depth < 20 && next ? resolve(next, depth + 1) : END_STEP;
  };
  for (const s of steps) {
    if ("next" in s && s.next) s.next = resolve(s.next);
    if (s.type === "wait_reply" && s.onTimeout) s.onTimeout = resolve(s.onTimeout);
    if (s.type === "condition") {
      if (s.then) s.then = resolve(s.then);
      if (s.else) s.else = resolve(s.else);
    }
    if (s.type === "message")
      s.buttons?.forEach((b) => {
        if (b.next) b.next = resolve(b.next);
      });
  }

  // The bot starts at amoCRM's step 0 (or wherever it aliases to).
  const startId = resolve(`${REF}0`);
  const startIdx = steps.findIndex((s) => s.id === startId);
  if (startIdx > 0) steps.unshift(...steps.splice(startIdx, 1));

  return { name, steps, warnings };
}
