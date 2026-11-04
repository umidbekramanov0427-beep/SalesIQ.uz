import { DEFAULT_FUNNEL_RULE, decideRepeat } from "@/lib/leads/funnel-dedupe";

const rule = (p = {}) => ({ ...DEFAULT_FUNNEL_RULE, ...p });
const open = { won: false, lost: false };

describe("funnel duplicate rules", () => {
  it("creates when there is no earlier lead or the funnel checks nothing", () => {
    expect(decideRepeat(rule(), null)).toEqual({ kind: "create" });
    expect(decideRepeat(rule({ mode: "off" }), open)).toEqual({ kind: "create" });
  });

  it("repeat mode absorbs, tags, reopens a lost lead and sets a task", () => {
    expect(decideRepeat(rule(), open)).toEqual({
      kind: "absorb",
      tag: true,
      reopen: false,
      taskMinutes: 15,
    });
    expect(decideRepeat(rule(), { won: false, lost: true })).toMatchObject({ reopen: true });
    expect(decideRepeat(rule({ reopenLost: false }), { won: false, lost: true })).toMatchObject({
      reopen: false,
    });
  });

  it("merge mode adds without tag or reopening", () => {
    expect(
      decideRepeat(rule({ mode: "merge", taskMinutes: 0 }), { won: false, lost: true }),
    ).toEqual({ kind: "absorb", tag: false, reopen: false, taskMinutes: 0 });
  });

  it("a won lead makes the next request a new purchase", () => {
    expect(decideRepeat(rule(), { won: true, lost: false })).toEqual({ kind: "createRepeat" });
    expect(decideRepeat(rule({ newAfterWon: false }), { won: true, lost: false })).toMatchObject({
      kind: "absorb",
    });
    expect(decideRepeat(rule({ mode: "new" }), open)).toEqual({ kind: "createRepeat" });
  });
});
