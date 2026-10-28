import { callQueue, queueReasons, type QueueLead } from "@/lib/call-queue";

const now = new Date(2026, 9, 28, 12, 0, 0);
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
const lead = (over: Partial<QueueLead>): QueueLead => ({
  id: over.id ?? "x",
  name: "Mijoz",
  phone: "+998901234567",
  ownerId: "m1",
  funnel: "Kurs",
  createdAt: ago(10 * 24 * 60),
  nextFollowUp: ago(-60 * 24),
  firstContactAt: ago(9 * 24 * 60),
  budget: 0,
  temperature: "Warm",
  score: 40,
  lastContactAt: ago(60),
  ...over,
});

describe("queueReasons", () => {
  it("flags a fresh lead nobody has reached", () => {
    expect(queueReasons(lead({ createdAt: ago(7), firstContactAt: null }), now)[0]).toEqual({
      kind: "new",
      minutes: 7,
    });
    // Unknown (no column) is not "nobody reached it".
    expect(queueReasons(lead({ createdAt: ago(7), firstContactAt: undefined }), now)).toEqual([]);
  });
  it("flags an unanswered client message, overdue and today's tasks", () => {
    expect(queueReasons(lead({ lastMessage: { direction: "in", at: ago(30) } }), now)[0]).toEqual({
      kind: "unanswered",
      minutes: 30,
    });
    expect(queueReasons(lead({ nextFollowUp: ago(180) }), now)[0]).toEqual({
      kind: "overdue",
      hours: 3,
    });
    expect(queueReasons(lead({ nextFollowUp: ago(-60) }), now)[0]).toEqual({ kind: "today" });
  });
  it("flags a payment due today or before, only while money is owed", () => {
    expect(
      queueReasons(lead({ nextPaymentDate: "2026-10-27", budget: 3e6, paidAmount: 1e6 }), now),
    ).toContainEqual({
      kind: "payment",
      overdue: true,
    });
    expect(
      queueReasons(lead({ nextPaymentDate: "2026-10-27", budget: 3e6, paidAmount: 3e6 }), now),
    ).toEqual([]);
  });
  it("flags a hot lead and one gone quiet", () => {
    expect(queueReasons(lead({ temperature: "VeryHot" }), now)[0]?.kind).toBe("hot");
    expect(
      queueReasons(lead({ nextFollowUp: null, lastContactAt: ago(4 * 24 * 60) }), now),
    ).toEqual([{ kind: "silent", days: 4 }]);
  });
});

describe("callQueue", () => {
  it("puts the fresh lead first, then the waiting client, the overdue task, today's task", () => {
    const q = callQueue(
      [
        lead({ id: "today", nextFollowUp: ago(-60) }),
        lead({ id: "calm" }),
        lead({ id: "overdue", nextFollowUp: ago(300) }),
        lead({ id: "new", createdAt: ago(3), firstContactAt: null, nextFollowUp: null }),
        lead({ id: "wrote", lastMessage: { direction: "in", at: ago(15) } }),
      ],
      now,
    );
    expect(q.map((i) => i.lead.id)).toEqual(["new", "wrote", "overdue", "today"]);
  });
});
