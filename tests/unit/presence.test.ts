import { presenceOf } from "@/lib/presence";

describe("presence", () => {
  const now = Date.parse("2026-11-12T10:00:00Z");
  const base = {
    online: true,
    call: null,
    lastEventAt: "2026-11-12T09:58:00Z",
    since: null,
    path: "/funnels",
    now,
  };
  it("reads what a colleague is doing", () => {
    expect(presenceOf(base)).toBe("active");
    expect(presenceOf({ ...base, path: "/crm/leads/1" })).toBe("client");
    expect(presenceOf({ ...base, path: "/inbox" })).toBe("client");
    expect(presenceOf({ ...base, lastEventAt: "2026-11-12T09:50:00Z" })).toBe("idle");
    expect(presenceOf({ ...base, online: false })).toBe("offline");
    expect(presenceOf({ ...base, online: false, call: "answered" })).toBe("call");
    expect(presenceOf({ ...base, call: "ringing" })).toBe("ringing");
  });
});
