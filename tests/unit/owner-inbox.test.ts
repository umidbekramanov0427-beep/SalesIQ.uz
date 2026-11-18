import {
  EMPTY_OWNER_FILTER,
  matchesOwnerInbox,
  presetFilter,
  slaDue,
  sortThreads,
  threadStatus,
  unreadCount,
  type CompanyThread,
} from "@/lib/owner-inbox";

const th = (o: Partial<CompanyThread>): CompanyThread => ({
  key: "o1",
  orgId: "o1",
  name: "Najot",
  plan: "analyst_iq",
  phase: "trial",
  stage: "meeting",
  leadId: null,
  status: "open",
  unread: 0,
  waitingSince: null,
  lastAt: "2027-01-10T10:00:00Z",
  lastText: "Salom",
  lastAuthor: "Ali",
  lastDirection: "in",
  count: 1,
  people: [{ id: "p", name: "Ali Valiyev", role: "super_admin" }],
  lastAskerId: "p",
  ...o,
});

describe("owner inbox", () => {
  it("filters by company facts", () => {
    expect(matchesOwnerInbox(th({}), presetFilter("trial"))).toBe(true);
    expect(matchesOwnerInbox(th({ phase: "paid" }), presetFilter("trial"))).toBe(false);
    expect(matchesOwnerInbox(th({}), presetFilter("waiting"))).toBe(false);
    expect(matchesOwnerInbox(th({ waitingSince: "x" }), presetFilter("waiting"))).toBe(true);
    expect(matchesOwnerInbox(th({}), { ...EMPTY_OWNER_FILTER, text: "valiyev" })).toBe(true);
    expect(matchesOwnerInbox(th({}), { ...EMPTY_OWNER_FILTER, plans: ["master_iq"] })).toBe(false);
    expect(matchesOwnerInbox(th({ unread: 2 }), presetFilter("unread"))).toBe(true);
  });

  it("puts the longest wait first", () => {
    const list = sortThreads([
      th({ key: "a", lastAt: "2027-01-10T12:00:00Z" }),
      th({ key: "b", waitingSince: "2027-01-10T09:00:00Z" }),
      th({ key: "c", waitingSince: "2027-01-10T08:00:00Z" }),
    ]);
    expect(list.map((t) => t.key)).toEqual(["c", "b", "a"]);
  });

  it("counts unread questions after the last reading or answer", () => {
    const msgs = [
      { direction: "in" as const, created_at: "1" },
      { direction: "out" as const, created_at: "2" },
      { direction: "in" as const, created_at: "3" },
      { direction: "in" as const, created_at: "4" },
    ];
    expect(unreadCount(msgs, null)).toBe(2);
    expect(unreadCount(msgs, "3")).toBe(1);
  });

  it("reopens a closed conversation on a new question", () => {
    expect(threadStatus("closed", "2027-01-10", "2027-01-09")).toBe("closed");
    expect(threadStatus("closed", "2027-01-10", "2027-01-11")).toBe("open");
    expect(threadStatus(null, null, null)).toBe("open");
  });
});

describe("support answer limit", () => {
  const now = new Date("2027-01-10T10:40:00Z");
  it("alerts once per wait after the limit", () => {
    expect(slaDue("2027-01-10T10:00:00Z", null, 30, now)).toBe(true);
    expect(slaDue("2027-01-10T10:20:00Z", null, 30, now)).toBe(false);
    expect(slaDue("2027-01-10T10:00:00Z", "2027-01-10T10:31:00Z", 30, now)).toBe(false);
    expect(slaDue("2027-01-10T10:00:00Z", "2027-01-09T10:00:00Z", 30, now)).toBe(true);
    expect(slaDue(null, null, 30, now)).toBe(false);
    expect(slaDue("2027-01-10T10:00:00Z", null, 0, now)).toBe(false);
  });
});
