import { hintLevelOf, stageHintFor, guessDefaultStage, defaultHints } from "@/lib/stage-hints";

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 24);

describe("hintLevelOf", () => {
  it("trainees and the first 30 days are beginners", () => {
    expect(hintLevelOf({ role: "sotuv_menejeri", isIntern: true }, now)).toBe("novice");
    const joined = new Date(now - 10 * DAY).toISOString();
    expect(hintLevelOf({ role: "sotuv_menejeri", joinedAt: joined }, now)).toBe("novice");
  });
  it("up to six months is experienced, then master", () => {
    const m3 = new Date(now - 90 * DAY).toISOString();
    const y1 = new Date(now - 365 * DAY).toISOString();
    expect(hintLevelOf({ role: "sotuv_menejeri", joinedAt: m3 }, now)).toBe("experienced");
    expect(hintLevelOf({ role: "sotuv_menejeri", joinedAt: y1 }, now)).toBe("master");
  });
  it("admins and heads of sales are masters", () => {
    expect(hintLevelOf({ role: "rop", isIntern: true }, now)).toBe("master");
    expect(hintLevelOf({ role: "super_admin" }, now)).toBe("master");
  });
});

describe("stageHintFor", () => {
  it("shows the person's own level", () => {
    const s = { hint: "M", hint_novice: "N", hint_experienced: "E" };
    expect(stageHintFor(s, "novice")).toBe("N");
    expect(stageHintFor(s, "experienced")).toBe("E");
    expect(stageHintFor(s, "master")).toBe("M");
  });
  it("falls back to a more experienced level, then any filled one", () => {
    expect(stageHintFor({ hint: "M", hint_novice: null, hint_experienced: "" }, "novice")).toBe(
      "M",
    );
    expect(stageHintFor({ hint: null, hint_novice: "N" }, "master")).toBe("N");
    expect(stageHintFor({}, "novice")).toBe("");
  });
});

describe("default hints", () => {
  const t = (k: string) => (k === "fs.def.negotiation" ? "Muzokaralar" : k);
  it("match a default stage by name, else by kind", () => {
    expect(guessDefaultStage({ name: "muzokaralar" }, t)).toBe("negotiation");
    expect(guessDefaultStage({ name: "Yangi", stage_value: "new" }, t)).toBe("unsorted");
    expect(guessDefaultStage({ name: "To'lov kutilmoqda", stage_value: "expected" }, t)).toBe(
      "contract",
    );
    expect(guessDefaultStage({ name: "Sotildi", stage_value: "sale" }, t)).toBeNull();
  });
  it("give all three levels for the open default stages only", () => {
    expect(defaultHints("firstContact", t)).toEqual({
      novice: "fs.hint.firstContact.novice",
      experienced: "fs.hint.firstContact.experienced",
      master: "fs.hint.firstContact.master",
    });
    expect(defaultHints("won", t)).toBeNull();
  });
});
