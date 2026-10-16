import { clip, pushPayload, wantsPush } from "@/lib/push/push";

describe("wantsPush", () => {
  it("sends when there is no preference row or column", () => {
    expect(wantsPush("new_lead", null)).toBe(true);
    expect(wantsPush("message", {})).toBe(true);
    expect(wantsPush("call", { push_calls: null })).toBe(true);
  });
  it("respects a switched-off kind only", () => {
    const prefs = { push_new_lead: false, push_messages: true, push_calls: false };
    expect(wantsPush("new_lead", prefs)).toBe(false);
    expect(wantsPush("message", prefs)).toBe(true);
    expect(wantsPush("call", prefs)).toBe(false);
    expect(wantsPush("task", { task_assigned: false })).toBe(false);
  });
  it("always sends support answers and tests", () => {
    const off = {
      push_new_lead: false,
      push_messages: false,
      push_calls: false,
      task_assigned: false,
    };
    expect(wantsPush("support", off)).toBe(true);
    expect(wantsPush("test", off)).toBe(true);
  });
});

describe("pushPayload", () => {
  it("keeps the url inside the app and defaults the tag", () => {
    const p = JSON.parse(
      pushPayload({
        kind: "new_lead",
        title: "Yangi lid",
        body: "Ali",
        url: "https://evil.example",
      }),
    );
    expect(p.url).toBe("/");
    expect(p.tag).toBe("new_lead");
    expect(p.requireInteraction).toBe(false);
  });
  it("clips long text to one line", () => {
    const long = "a ".repeat(200);
    const p = JSON.parse(
      pushPayload({ kind: "message", title: "X", body: long, url: "/crm/leads/1" }),
    );
    expect(p.body.length).toBeLessThanOrEqual(140);
    expect(p.body.endsWith("…")).toBe(true);
    expect(clip("  salom \n  dunyo ")).toBe("salom dunyo");
  });
});
