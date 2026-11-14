import {
  callOutcome,
  clock,
  nextToDial,
  operatorsOf,
  totalsOf,
  type PcCall,
} from "@/lib/phone-center";

const c = (over: Partial<PcCall>): PcCall => ({
  id: Math.random().toString(36),
  at: "2026-11-14T08:00:00Z",
  direction: "outgoing",
  outcome: "answered",
  seconds: 60,
  by: "a",
  phone: "+998901112233",
  name: "",
  leadId: null,
  recording: null,
  error: null,
  ...over,
});

describe("Telefon", () => {
  it("reads a PBX row's result like the call history", () => {
    expect(callOutcome("completed", "outgoing", 30)).toBe("answered");
    expect(callOutcome("completed", "incoming", 0)).toBe("missed");
    expect(callOutcome("no_answer", "outgoing", 0)).toBe("noAnswer");
    expect(callOutcome("ringing", "incoming", 0)).toBe("ringing");
    expect(callOutcome("failed", "outgoing", 0)).toBe("failed");
  });

  it("sums the calls and each operator's", () => {
    const calls = [
      c({ seconds: 120 }),
      c({ seconds: 60, direction: "incoming" }),
      c({ outcome: "missed", direction: "incoming", seconds: 0, by: "b" }),
      c({ outcome: "noAnswer", seconds: 0 }),
    ];
    expect(totalsOf(calls)).toEqual({
      total: 4,
      incoming: 2,
      outgoing: 2,
      missed: 1,
      answered: 2,
      talkSeconds: 180,
      avgSeconds: 90,
      answerRate: 50,
    });
    const ops = operatorsOf(
      calls,
      [
        {
          id: "s1",
          at: "",
          by: "a",
          score: 80,
          phone: null,
          leadId: null,
          seconds: 0,
          summary: null,
        },
        {
          id: "s2",
          at: "",
          by: "a",
          score: 70,
          phone: null,
          leadId: null,
          seconds: 0,
          summary: null,
        },
      ],
      [
        { id: "a", name: "Ali", role: "sotuv_menejeri" },
        { id: "b", name: "Bek", role: "sotuv_menejeri" },
      ],
      [{ code: "105", profileId: "a" }],
    );
    expect(ops[0]).toMatchObject({
      id: "a",
      total: 3,
      extension: "105",
      longest: 120,
      aiScore: 75,
      analyzed: 2,
    });
    expect(ops[1]).toMatchObject({ id: "b", total: 1, missed: 1, extension: null, aiScore: null });
  });

  it("walks the autodialer's queue", () => {
    const q = [
      { leadId: "1", name: "", phone: "1" },
      { leadId: "2", name: "", phone: "2" },
    ];
    expect(nextToDial(q, {})).toBe(0);
    expect(nextToDial(q, { "1": "answered" })).toBe(1);
    expect(nextToDial(q, { "1": "answered", "2": "skipped" })).toBe(-1);
  });

  it("writes durations", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65)).toBe("1:05");
    expect(clock(3723)).toBe("1:02:03");
  });
});
