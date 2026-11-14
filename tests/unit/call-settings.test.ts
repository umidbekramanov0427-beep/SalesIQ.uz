import {
  DEFAULT_CALL_SETTINGS,
  compactCallSettings,
  parseCallSettings,
  sectionVisible,
} from "../../src/lib/call-settings";

describe("call settings", () => {
  it("defaults when nothing is stored", () => {
    expect(parseCallSettings(undefined)).toEqual(DEFAULT_CALL_SETTINGS);
    expect(parseCallSettings("x")).toEqual(DEFAULT_CALL_SETTINGS);
  });

  it("keeps valid values and drops bad ones", () => {
    const s = parseCallSettings({
      popup: false,
      period: "month",
      autoGap: 30,
      hiddenForReps: ["voice", "voice", "main", 3],
    });
    expect(s).toEqual({
      popup: false,
      period: "month",
      autoGap: 30,
      hiddenForReps: ["voice"],
    });
    expect(parseCallSettings({ period: "year", autoGap: 7 }).period).toBe("today");
    expect(parseCallSettings({ autoGap: 7 }).autoGap).toBe(10);
  });

  it("stores only what differs from the defaults", () => {
    expect(compactCallSettings(DEFAULT_CALL_SETTINGS)).toEqual({});
    expect(compactCallSettings({ ...DEFAULT_CALL_SETTINGS, autoGap: 60 })).toEqual({ autoGap: 60 });
  });

  it("hides sections from salespeople only", () => {
    const s = { ...DEFAULT_CALL_SETTINGS, hiddenForReps: ["auto" as const] };
    expect(sectionVisible("auto", "sotuv_menejeri", s)).toBe(false);
    expect(sectionVisible("auto", "rop", s)).toBe(true);
    expect(sectionVisible("calls", "sotuv_menejeri", s)).toBe(true);
  });
});
