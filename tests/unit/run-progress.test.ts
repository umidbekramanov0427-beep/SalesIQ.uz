import { runProgress } from "@/lib/automations/run-progress";
import type { BotStep } from "@/lib/automation-types";

const steps = [
  { id: "q0", type: "message", text: "Ismingiz?" },
  { id: "w0", type: "wait_reply", timeoutMinutes: 0 },
  { id: "q1", type: "message", text: "Telefon?" },
  { id: "w1", type: "wait_reply", timeoutMinutes: 0 },
  { id: "q2", type: "message", text: "Nima qiziqtiradi?" },
  { id: "w2", type: "wait_reply", timeoutMinutes: 0 },
] as BotStep[];

describe("runProgress", () => {
  it("counts the answers against the bot's questions", () => {
    const log = [
      { note: "Bot: Assalomu alaykum!" },
      { note: "Bot: Ismingiz nima?" },
      { note: "Mijoz: Омон" },
      { note: "Amal: set_contact" },
      { note: "Bot: Telefon raqamingizni yozing" },
    ];
    expect(runProgress(log, steps)).toEqual({
      answered: 1,
      total: 3,
      lastAnswer: "Омон",
      lastQuestion: "Telefon raqamingizni yozing",
    });
  });

  it("copes with an empty or odd log", () => {
    expect(runProgress(null, steps)).toEqual({
      answered: 0,
      total: 3,
      lastAnswer: null,
      lastQuestion: null,
    });
    expect(runProgress([{ note: "Mijoz: ha" }, {}], [])).toMatchObject({ answered: 1, total: 1 });
  });
});
