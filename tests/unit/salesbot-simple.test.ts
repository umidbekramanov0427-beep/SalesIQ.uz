import { END_STEP } from "@/lib/automation-types";
import {
  buildSimpleSteps,
  parseSimpleBot,
  simpleBotProblem,
  type SimpleBot,
} from "@/lib/salesbots/simple-bot";
import {
  salesbotIdFromStart,
  salesbotStartPayload,
  salesbotStartUrl,
} from "@/lib/salesbots/start-link";

const bot: SimpleBot = {
  greeting: "Salom!",
  questions: [
    { text: "Ismingiz?", saveTo: "name", options: [] },
    { text: "Qaysi kurs?", saveTo: "note", options: ["IELTS", "SAT"] },
    { text: "Izoh?", saveTo: "none", options: [] },
  ],
  finish: "Rahmat, {{name}}!",
  stageId: "stage-1",
  tag: "ro'yxat",
  task: "Bog'laning",
};

describe("simple salesbot", () => {
  it("builds a linear chain that ends the bot", () => {
    const steps = buildSimpleSteps(bot);
    expect(steps.map((s) => s.id)).toEqual([
      "s-greet",
      "s-q0",
      "s-q0-w",
      "s-q0-s",
      "s-q1",
      "s-q1-s",
      "s-q2",
      "s-q2-w",
      "s-done",
      "s-stage",
      "s-tag",
      "s-task",
    ]);
    const last = steps.at(-1)!;
    expect(last.type === "action" && last.next).toBe(END_STEP);
    const q1 = steps.find((s) => s.id === "s-q1")!;
    expect(q1.type === "message" && q1.buttons?.every((b) => b.next === "s-q1-s")).toBe(true);
    const save = steps.find((s) => s.id === "s-q1-s")!;
    expect(save.type === "action" && save.action).toEqual({
      type: "add_note",
      text: "Qaysi kurs?\n{{button}}",
    });
  });

  it("reads its own steps back, also with canvas positions", () => {
    expect(parseSimpleBot(buildSimpleSteps(bot))).toEqual(bot);
    const placed = buildSimpleSteps(bot).map((s, i) => ({ ...s, pos: { x: i, y: i } }));
    expect(parseSimpleBot(placed)).toEqual(bot);
    const minimal: SimpleBot = {
      ...bot,
      greeting: "",
      finish: "",
      stageId: "",
      tag: "",
      task: null,
    };
    expect(parseSimpleBot(buildSimpleSteps(minimal))).toEqual(minimal);
  });

  it("keeps half-typed questions while editing", () => {
    const draft: SimpleBot = { ...bot, questions: [{ text: "", saveTo: "phone", options: [""] }] };
    expect(parseSimpleBot(buildSimpleSteps(draft))).toEqual(draft);
    expect(simpleBotProblem(draft)).toBe("question");
  });

  it("refuses steps changed on the canvas", () => {
    const steps = buildSimpleSteps(bot);
    steps.splice(2, 0, { id: "x1", type: "delay", minutes: 5 });
    expect(parseSimpleBot(steps)).toBeNull();
    const rewired = buildSimpleSteps(bot).map((s) =>
      s.id === "s-greet" && s.type === "message" ? { ...s, next: "s-done" } : s,
    );
    expect(parseSimpleBot(rewired)).toBeNull();
    expect(parseSimpleBot([])).toBeNull();
  });

  it("flags what is missing", () => {
    expect(simpleBotProblem(bot)).toBeNull();
    expect(simpleBotProblem({ ...bot, task: " " })).toBe("task");
    expect(
      simpleBotProblem({ ...bot, questions: [{ text: "a", saveTo: "none", options: ["x", ""] }] }),
    ).toBe("option");
  });
});

describe("salesbot start link", () => {
  const id = "0f8e2a1c-1234-4abc-9def-0123456789ab";
  it("fits Telegram's start parameter and round-trips", () => {
    const payload = salesbotStartPayload(id);
    expect(payload).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(salesbotIdFromStart(`/start ${payload}`)).toBe(id);
    expect(salesbotStartUrl("salesiq_bot", id)).toBe(`https://t.me/salesiq_bot?start=${payload}`);
  });
  it("ignores other start commands", () => {
    expect(salesbotIdFromStart("/start login_abc")).toBeNull();
    expect(salesbotIdFromStart("/start")).toBeNull();
    expect(salesbotIdFromStart("salom")).toBeNull();
  });
});
