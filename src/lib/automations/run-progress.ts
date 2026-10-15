import type { BotStep } from "@/lib/automation-types";

// How far a client has got through a salesbot (their registration), read
// from the run's log as the engine writes it (engine.server.ts logLine):
// "Bot: <text>" for what the bot sent, "Mijoz: <text>" for each answer.

export type RunLogLine = { at?: string; note?: string; step?: string };

export type RunProgress = {
  /** Answers the client has given. */
  answered: number;
  /** Questions the bot asks in all (its wait-for-reply steps), at least `answered`. */
  total: number;
  lastAnswer: string | null;
  lastQuestion: string | null;
};

const BOT = "Bot: ";
const CLIENT = "Mijoz: ";

export function runProgress(log: unknown, steps: BotStep[] | null | undefined): RunProgress {
  const lines = Array.isArray(log) ? (log as RunLogLine[]) : [];
  let answered = 0;
  let lastAnswer: string | null = null;
  let lastQuestion: string | null = null;
  for (const line of lines) {
    const note = typeof line?.note === "string" ? line.note : "";
    if (note.startsWith(CLIENT)) {
      answered++;
      lastAnswer = note.slice(CLIENT.length);
    } else if (note.startsWith(BOT)) {
      lastQuestion = note.slice(BOT.length);
    }
  }
  const asked = (steps ?? []).filter((s) => s.type === "wait_reply").length;
  return { answered, total: Math.max(asked, answered), lastAnswer, lastQuestion };
}
