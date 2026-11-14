import {
  answerRate,
  byManager,
  dailyOf,
  daysBetween,
  filterCalls,
  filterJournal,
  heatmapOf,
  hourlyOf,
  journalOf,
  journalTotalsOf,
  operatorStatus,
  operatorsOf,
  type PcCall,
} from "@/lib/phone-center";

// 2026-11-16 is a Monday. 04:30Z = 09:30 Tashkent.
const call = (p: Partial<PcCall>): PcCall => ({
  id: Math.random().toString(36).slice(2),
  at: "2026-11-16T04:30:00Z",
  direction: "outgoing",
  outcome: "answered",
  seconds: 60,
  by: "a",
  phone: "+998901112233",
  name: "",
  leadId: null,
  recording: null,
  error: null,
  ...p,
});

describe("Telefon (5TEL) figures", () => {
  it("answer rate is answered out of all, rounded; nothing -> 0", () => {
    expect(answerRate(1, 3)).toBe(33);
    expect(answerRate(2, 3)).toBe(67);
    expect(answerRate(0, 0)).toBe(0);
  });

  it("hours and the load map use Tashkent time, Monday first", () => {
    const calls = [
      call({}),
      call({ direction: "incoming", at: "2026-11-16T04:59:00Z" }),
      // 20:10Z Sunday = 01:10 Monday in Tashkent
      call({ at: "2026-11-15T20:10:00Z" }),
    ];
    const h = hourlyOf(calls);
    expect(h).toHaveLength(24);
    expect(h[9]).toEqual({ hour: 9, incoming: 1, outgoing: 1 });
    expect(h[1]!.outgoing).toBe(1);
    const heat = heatmapOf(calls);
    expect(heat).toHaveLength(7);
    expect(heat[0]![9]).toBe(2);
    expect(heat[0]![1]).toBe(1);
    expect(heat.flat().reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("days: answered vs missed per Tashkent day, only the period's days", () => {
    const days = daysBetween("2026-11-15", "2026-11-16");
    expect(days).toEqual(["2026-11-15", "2026-11-16"]);
    const d = dailyOf(
      [
        call({}),
        call({ outcome: "missed", direction: "incoming" }),
        call({ outcome: "ringing" }),
        call({ at: "2026-11-10T04:30:00Z" }),
      ],
      days,
    );
    expect(d[1]).toEqual({ date: "2026-11-16", answered: 1, missed: 1, total: 3 });
    expect(d[0]!.total).toBe(0);
  });

  it("journal groups by number (last 9 digits) and counts the eight figures", () => {
    const rows = journalOf([
      call({ phone: "+998 90 111 22 33", name: "Ali", at: "2026-11-16T05:00:00Z" }),
      call({ phone: "901112233", direction: "incoming", outcome: "missed" }),
      call({ phone: "+998935556677", outcome: "noAnswer" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.name).toBe("Ali");
    expect(rows[0]).toMatchObject({ total: 2, incoming: 1, outgoing: 1, answered: 1 });
    expect(journalTotalsOf(rows)).toEqual({
      numbers: 2,
      incomingNumbers: 1,
      outgoingNumbers: 2,
      unansweredNumbers: 1,
      ops: 3,
      incomingOps: 1,
      outgoingOps: 2,
      answeredOps: 1,
    });
    expect(filterJournal(rows, "unanswered", "")).toHaveLength(1);
    expect(filterJournal(rows, "all", "ali")).toHaveLength(1);
    expect(filterJournal(rows, "all", "5556")).toHaveLength(1);
  });

  it("the calls filter: managers, duration range, status", () => {
    const calls = [
      call({ seconds: 10 }),
      call({ seconds: 200, by: "b" }),
      call({ outcome: "missed", direction: "incoming", seconds: 0 }),
    ];
    expect(
      filterCalls(calls, { managers: ["a"], minSeconds: null, maxSeconds: null, status: "all" }),
    ).toHaveLength(2);
    expect(
      filterCalls(calls, { managers: [], minSeconds: 30, maxSeconds: 300, status: "all" }),
    ).toHaveLength(1);
    expect(
      filterCalls(calls, { managers: [], minSeconds: null, maxSeconds: null, status: "missed" }),
    ).toHaveLength(1);
    const m = byManager(calls, new Map([["a", "Aziz"]]));
    expect(m[0]).toMatchObject({ id: "a", name: "Aziz", outCount: 1, inCount: 1, outSeconds: 10 });
  });

  it("operator status: no extension, on a call, online, offline", () => {
    const now = Date.parse("2026-11-16T10:00:00Z");
    const recent = "2026-11-16T09:59:00Z";
    expect(operatorStatus({ extension: null, onCall: true, seenAt: recent, now })).toBe(
      "unconfigured",
    );
    expect(operatorStatus({ extension: "101", onCall: true, seenAt: null, now })).toBe("onCall");
    expect(operatorStatus({ extension: "101", onCall: false, seenAt: recent, now })).toBe("free");
    expect(
      operatorStatus({ extension: "101", onCall: false, seenAt: "2026-11-16T09:00:00Z", now }),
    ).toBe("offline");
  });

  it("operators split outgoing / incoming results", () => {
    const [op] = operatorsOf(
      [
        call({}),
        call({ outcome: "noAnswer" }),
        call({ direction: "incoming" }),
        call({ direction: "incoming", outcome: "missed" }),
      ],
      [],
      [{ id: "a", name: "Aziz", role: null }],
      [{ code: "101", profileId: "a" }],
    );
    expect(op).toMatchObject({
      outAnswered: 1,
      outNoAnswer: 1,
      inAnswered: 1,
      inMissed: 1,
      extension: "101",
      answerRate: 50,
    });
  });
});
