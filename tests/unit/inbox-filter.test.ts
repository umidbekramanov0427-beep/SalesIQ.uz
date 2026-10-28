import {
  activeCount,
  EMPTY_INBOX_FILTER,
  matchesInbox,
  presetFilter,
  readState,
  type InboxChat,
  type InboxFilter,
} from "@/lib/inbox-filter";

const chat = (over: Partial<InboxChat>): InboxChat => ({
  leadId: "l1",
  leadNumber: 103401,
  name: "Aziza",
  handle: "@aziza_uz",
  ownerId: "m1",
  funnel: "Kurs",
  stageId: "s-new",
  channel: "telegram",
  last: { direction: "in", text: "Narxi qancha?", at: "2026-10-28T10:00:00Z" },
  since: "2026-10-01T00:00:00Z",
  ...over,
});
const stages: Record<string, { funnel: string; closed: boolean }> = {
  "s-new": { funnel: "Kurs", closed: false },
  "s-paid": { funnel: "Kurs", closed: true },
  "b-new": { funnel: "B2B", closed: false },
};
const ctx = (over: Partial<{ readAt: string | null; favorite: boolean }> = {}) => ({
  readAt: null,
  favorite: false,
  stage: (id: string) => stages[id],
  ...over,
});
const f = (over: Partial<InboxFilter>): InboxFilter => ({ ...EMPTY_INBOX_FILTER, ...over });

describe("readState", () => {
  it("tells unread, read but unanswered, answered and empty apart", () => {
    expect(readState(chat({}), null)).toBe("unread");
    expect(readState(chat({}), "2026-10-28T09:00:00Z")).toBe("unread");
    expect(readState(chat({}), "2026-10-28T10:05:00Z")).toBe("read");
    expect(
      readState(chat({ last: { direction: "out", text: "", at: "2026-10-28T10:00:00Z" } }), null),
    ).toBe("answered");
    expect(readState(chat({ last: null }), null)).toBe("empty");
  });
});

describe("matchesInbox", () => {
  it("finds by number, name, handle or text", () => {
    expect(matchesInbox(chat({}), f({ text: "#103401" }), ctx())).toBe(true);
    expect(matchesInbox(chat({}), f({ text: "aziza" }), ctx())).toBe(true);
    expect(matchesInbox(chat({}), f({ text: "narxi" }), ctx())).toBe(true);
    expect(matchesInbox(chat({}), f({ text: "bobur" }), ctx())).toBe(false);
  });
  it("filters by funnel, and by its stages when some are picked", () => {
    expect(matchesInbox(chat({}), f({ funnels: ["Kurs"] }), ctx())).toBe(true);
    expect(matchesInbox(chat({}), f({ funnels: ["B2B"] }), ctx())).toBe(false);
    expect(matchesInbox(chat({}), f({ funnels: ["Kurs"], stageIds: ["s-paid"] }), ctx())).toBe(
      false,
    );
    expect(matchesInbox(chat({}), f({ funnels: ["Kurs"], stageIds: ["s-new"] }), ctx())).toBe(true);
    expect(
      matchesInbox(chat({}), f({ funnels: ["B2B", "Kurs"], stageIds: ["b-new"] }), ctx()),
    ).toBe(true);
  });
  it("filters by read state, answer state, author, status, owner, channel, favourites, date", () => {
    expect(matchesInbox(chat({}), f({ read: "unread" }), ctx())).toBe(true);
    expect(
      matchesInbox(chat({}), f({ read: "read" }), ctx({ readAt: "2026-10-28T11:00:00Z" })),
    ).toBe(true);
    expect(matchesInbox(chat({}), f({ answer: "none" }), ctx())).toBe(false);
    expect(matchesInbox(chat({}), f({ lastAuthor: "team" }), ctx())).toBe(false);
    expect(matchesInbox(chat({ stageId: "s-paid" }), f({ status: "open" }), ctx())).toBe(false);
    expect(matchesInbox(chat({ stageId: "s-paid" }), f({ status: "closed" }), ctx())).toBe(true);
    expect(matchesInbox(chat({}), f({ ownerIds: ["m2"] }), ctx())).toBe(false);
    expect(matchesInbox(chat({}), f({ channels: ["instagram"] }), ctx())).toBe(false);
    expect(matchesInbox(chat({}), f({ favorites: true }), ctx())).toBe(false);
    expect(matchesInbox(chat({}), f({ favorites: true }), ctx({ favorite: true }))).toBe(true);
    expect(matchesInbox(chat({}), f({ from: "2026-10-29T00:00:00Z" }), ctx())).toBe(false);
  });
});

describe("presets", () => {
  it("stand for the matching filter and count as active fields", () => {
    expect(presetFilter("mine", "me").ownerIds).toEqual(["me"]);
    expect(presetFilter("readUnanswered", null).read).toBe("read");
    expect(activeCount(presetFilter("all", null))).toBe(0);
    expect(activeCount(f({ text: "x", channels: ["telegram"], favorites: true }))).toBe(3);
  });
});
