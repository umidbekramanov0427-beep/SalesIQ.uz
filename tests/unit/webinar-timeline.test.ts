import {
  combineSamples,
  nextSeq,
  pairShots,
  parsePlan,
  peaks,
  planVsActual,
  smsEffect,
  stageLosses,
  type WebinarEvent,
} from "@/lib/webinar-timeline";
import { pairedShotDue, parseMarketingRules } from "@/lib/marketing-rules";

const at = (m: number) => new Date(Date.UTC(2027, 0, 1, 14, m)).toISOString();

describe("webinar timeline (YouTube + Telegram)", () => {
  const samples = [
    { at: at(0), viewers: 300, source: "youtube" },
    { at: at(0), viewers: 100, source: "telegram" },
    { at: at(1), viewers: 320, source: "youtube" },
    // Telegram not counted yet this minute: its last count carries.
    { at: at(2), viewers: 200, source: "youtube" },
    { at: at(2), viewers: 90, source: "telegram" },
  ];

  it("adds the two sources minute by minute", () => {
    const pts = combineSamples(samples);
    expect(pts.map((p) => p.total)).toEqual([400, 420, 290]);
    const p = peaks(pts);
    expect(p.total).toEqual({ viewers: 420, at: at(1) });
    expect(p.youtube?.viewers).toBe(320);
    expect(p.telegram?.viewers).toBe(100);
  });

  it("finds the stage that lost the most and the SMS effect", () => {
    const pts = combineSamples([
      ...[0, 5, 10, 15, 20, 25].map((m, i) => ({
        at: at(m),
        viewers: [500, 520, 400, 380, 450, 460][i]!,
        source: "youtube",
      })),
    ]);
    const ev: WebinarEvent[] = [
      { id: "a", at: at(0), kind: "lesson", seq: null, label: null },
      { id: "b", at: at(5), kind: "price", seq: null, label: null },
      { id: "c", at: at(15), kind: "sms_sent", seq: 1, label: null },
      { id: "d", at: at(16), kind: "timer", seq: 1, label: null, confirmed: false },
    ];
    const { stages, worst } = stageLosses(pts, ev);
    expect(stages).toHaveLength(3); // the unconfirmed AI guess is left out
    expect(worst?.from.id).toBe("b");
    expect(worst?.change).toBe(-140);
    const sms = smsEffect(pts, ev);
    expect(sms[0]?.before).toBe(380);
    expect(sms[0]?.delta).toBe(460 - 380);
    expect(nextSeq(ev, "timer")).toBe(2);
  });

  it("compares the scenario with what happened", () => {
    const plan = parsePlan([
      { kind: "timer", seq: 1, minute: 60 },
      { kind: "timer", seq: 2, minute: 90 },
      { kind: "nope", minute: 5 },
    ]);
    expect(plan).toHaveLength(2);
    const rows = planVsActual(
      plan,
      [{ id: "t1", at: at(67), kind: "timer", seq: 1, label: null }],
      at(0),
    );
    expect(rows[0]?.diff).toBe(7);
    expect(rows[1]?.actual).toBeNull();
  });

  it("pairs the pictures of one moment", () => {
    const pairs = pairShots([
      { id: "y1", at: at(0), source: "youtube" },
      { id: "t1", at: at(1), source: "telegram" },
      { id: "t2", at: at(20), source: "telegram" },
    ]);
    expect(pairs.map((p) => [p.youtube?.id ?? null, p.telegram?.id ?? null])).toEqual([
      ["y1", "t1"],
      [null, "t2"],
    ]);
  });

  it("takes the second source's picture together with the first", () => {
    const r = parseMarketingRules({ shots: { everyMin: 10 } });
    const now = new Date(at(10));
    expect(pairedShotDue(at(5), at(10), now, r)).toBe(true); // partner just shot
    expect(pairedShotDue(at(8), at(10), now, r)).toBe(false); // own too recent
    expect(pairedShotDue(at(5), at(2), now, r)).toBe(false);
  });
});
