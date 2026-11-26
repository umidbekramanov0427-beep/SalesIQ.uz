import {
  SETUP_TOPICS,
  nextSetupTopic,
  setupDone,
  setupMapPrompt,
  type SetupMapState,
} from "@/lib/ai/setup-map";

const all = (v: boolean) => Object.fromEntries(SETUP_TOPICS.map((k) => [k, v])) as SetupMapState;
const labels = Object.fromEntries(SETUP_TOPICS.map((k) => [k, k.toUpperCase()])) as Record<
  (typeof SETUP_TOPICS)[number],
  string
>;

describe("setup map", () => {
  it("suggests required topics before optional ones", () => {
    const s = { ...all(true), instagram: false, telephony: false };
    expect(nextSetupTopic(s)).toBe("telephony");
    expect(nextSetupTopic({ ...all(true), instagram: false })).toBe("instagram");
    expect(nextSetupTopic(all(true))).toBeNull();
  });

  it("counts what is done", () => {
    expect(setupDone({ ...all(false), business: true, team: true })).toEqual({
      done: 2,
      total: SETUP_TOPICS.length,
    });
  });

  it("tells the model what it can do with a card and what together", () => {
    const text = setupMapPrompt({ ...all(false), business: true }, labels);
    expect(text).toContain("BUSINESS");
    expect(text).toContain("DONE");
    expect(text).toContain("show_setup_card kind salesbot");
    expect(text).toContain("TELEPHONY");
    expect(text).toMatch(/next topic to suggest: MY_TELEGRAM/);
  });
});
