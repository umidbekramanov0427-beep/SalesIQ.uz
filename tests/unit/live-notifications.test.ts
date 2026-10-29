import {
  crmLeadUrl,
  decidePopup,
  leadIdFromLink,
  systemTag,
  type LiveRow,
} from "@/lib/live-notifications";

const LEAD = "7a43dd7f-a879-4159-8c65-5dd2d3d80bf0";
const since = Date.parse("2026-10-29T10:00:00Z");

function row(patch: Partial<LiveRow> = {}): LiveRow {
  return {
    id: "n1",
    type: "ClientMessage",
    title: "💬 Ali",
    body: "Salom",
    link: `/crm/leads/${LEAD}`,
    read: false,
    created_at: "2026-10-29T10:05:00Z",
    ...patch,
  };
}

describe("decidePopup", () => {
  const ctx = { since, path: "/funnels", shown: new Map<string, string>() };

  it("shows a new client message and task reminders", () => {
    expect(decidePopup(row(), ctx)).toBe("show");
    expect(decidePopup(row({ type: "TaskSoon" }), ctx)).toBe("show");
    expect(decidePopup(row({ type: "TaskDue" }), ctx)).toBe("show");
    expect(decidePopup(row({ type: "TaskOverdue" }), ctx)).toBe("show");
  });

  it("skips read rows, old rows and other kinds", () => {
    expect(decidePopup(row({ read: true }), ctx)).toBe("skip");
    expect(decidePopup(row({ created_at: "2026-10-29T09:59:00Z" }), ctx)).toBe("skip");
    expect(decidePopup(row({ type: "LeadStage" }), ctx)).toBe("skip");
  });

  it("shows a merged chat notification again only when it has a newer message", () => {
    const shown = new Map([["n1", "2026-10-29T10:05:00Z"]]);
    expect(decidePopup(row(), { ...ctx, shown })).toBe("skip");
    expect(decidePopup(row({ created_at: "2026-10-29T10:06:00Z" }), { ...ctx, shown })).toBe(
      "show",
    );
  });

  it("marks a message read when its chat is open", () => {
    expect(decidePopup(row(), { ...ctx, path: `/crm/leads/${LEAD}` })).toBe("mark-read");
    expect(decidePopup(row({ type: "TaskDue" }), { ...ctx, path: `/crm/leads/${LEAD}` })).toBe(
      "show",
    );
  });
});

describe("links and tags", () => {
  it("reads the lead id from a lead link", () => {
    expect(leadIdFromLink(`/crm/leads/${LEAD}`)).toBe(LEAD);
    expect(leadIdFromLink(`/crm/leads/${LEAD}?tab=chat`)).toBe(LEAD);
    expect(leadIdFromLink("/funnels?view=tasks")).toBeNull();
    expect(leadIdFromLink(null)).toBeNull();
  });

  it("uses the push's tag so a device shows the event once", () => {
    expect(systemTag(row())).toBe(`chat:${LEAD}`);
    expect(systemTag(row({ type: "TaskDue", id: "n9" }))).toBe("notif:n9");
  });

  it("opens a lead as its CRM card", () => {
    expect(crmLeadUrl(`/crm/leads/${LEAD}`)).toBe(`/crm/leads/${LEAD}?from=funnels`);
    expect(crmLeadUrl("/funnels?view=tasks")).toBe("/funnels?view=tasks");
  });
});
