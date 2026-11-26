import { END_STEP, type BotMedia, type BotStep } from "@/lib/automation-types";

// «Bot ko'rinishi»: what the client would see, walked along the "yes" path
// (condition → then, check → then, A/B and random → their first way, a wait
// → the client answers with the first button of the last message). Pure, so
// the editor can show it while the bot is being built.

export type SimBubble =
  | { kind: "bot"; stepId: string; text: string; buttons: string[]; media?: BotMedia | undefined }
  | { kind: "client"; stepId: string; text: string }
  /** A step the client does not see (an action, a note, a pause…), shown as a thin line. */
  | { kind: "event"; stepId: string; step: BotStep };

const LIMIT = 40;

export function simulateBot(steps: BotStep[]): SimBubble[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const out: SimBubble[] = [];
  const seen = new Set<string>();
  let lastButtons: string[] = [];
  let cur: BotStep | undefined = steps[0];
  while (cur && out.length < LIMIT) {
    if (seen.has(cur.id)) break; // a loop back (e.g. «ask again»): the yes path never repeats
    seen.add(cur.id);
    let next: string | undefined;
    switch (cur.type) {
      case "message":
        lastButtons = (cur.buttons ?? []).map((b) => b.label).filter(Boolean);
        out.push({
          kind: "bot",
          stepId: cur.id,
          text: cur.text,
          buttons: lastButtons,
          media: cur.media,
        });
        next = cur.next;
        break;
      case "wait_reply":
        out.push({ kind: "client", stepId: cur.id, text: lastButtons[0] ?? "…" });
        lastButtons = [];
        next = cur.next;
        break;
      case "ai_reply":
        out.push({ kind: "bot", stepId: cur.id, text: "AI…", buttons: [] });
        next = cur.next;
        break;
      case "handoff":
        if (cur.text) out.push({ kind: "bot", stepId: cur.id, text: cur.text, buttons: [] });
        out.push({ kind: "event", stepId: cur.id, step: cur });
        next = undefined;
        break;
      case "condition":
      case "validate":
        out.push({ kind: "event", stepId: cur.id, step: cur });
        next = cur.then;
        break;
      case "split":
        out.push({ kind: "event", stepId: cur.id, step: cur });
        next = cur.a;
        break;
      case "random":
        out.push({ kind: "event", stepId: cur.id, step: cur });
        next = cur.targets[0];
        break;
      case "stop":
      case "start_bot":
        out.push({ kind: "event", stepId: cur.id, step: cur });
        next = undefined;
        break;
      default:
        out.push({ kind: "event", stepId: cur.id, step: cur });
        next = cur.next;
    }
    cur = next && next !== END_STEP ? byId.get(next) : undefined;
  }
  return out;
}
