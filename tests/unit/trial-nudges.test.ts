import { pickNudge, nudgeText } from "@/lib/trial-nudges";
import { firstStepLink, nextFirstStep, showFirstSteps } from "@/lib/first-steps";

const all = { bot: true, team: true, lead: true, integration: true, business: true };
const base = {
  orgId: "o1",
  createdAt: "2026-10-15T10:00:00Z",
  daysLeft: 5 as number | null,
  idleDays: 0 as number | null,
  lastSeenAt: "2026-10-16T08:00:00Z" as string | null,
  steps: { ...all, lead: false, integration: false },
};
const now = Date.parse("2026-10-16T09:00:00Z"); // 23h after sign-up

describe("trial nudges", () => {
  it("day one names the next step", () => {
    const n = pickNudge(base, now)!;
    expect(n.kind).toBe("day1");
    expect(n.step).toBe("lead");
    expect(nudgeText(n, "Acme", "https://acme.salesiq.uz", 5)).toContain("birinchi lidni");
  });

  it("nothing on day one when setup is done", () => {
    expect(pickNudge({ ...base, steps: all }, now)).toBeNull();
  });

  it("idle beats day one, keyed by the last visit", () => {
    const n = pickNudge({ ...base, idleDays: 3, lastSeenAt: "2026-10-13T08:00:00Z" }, now)!;
    expect(n.kind).toBe("idle");
    expect(n.key).toBe("nudge:o1:idle:2026-10-13");
  });

  it("the trial ending beats everything", () => {
    const n = pickNudge({ ...base, daysLeft: 1, idleDays: 5 }, now)!;
    expect(n.kind).toBe("ends");
    expect(nudgeText(n, "Acme", "https://x", 1)).toContain("ertaga");
    expect(nudgeText(n, "Acme", "https://x", 0)).toContain("bugun");
    expect(nudgeText(n, "Acme", "https://x", 0)).toContain("https://x/billing");
  });
});

describe("first steps", () => {
  it("picks the first missing step and splits links", () => {
    expect(nextFirstStep({ ...all, team: false, business: false })).toBe("team");
    expect(nextFirstStep(all)).toBeNull();
    expect(firstStepLink("business")).toEqual({ to: "/settings", search: { section: "business" } });
    expect(firstStepLink("lead")).toEqual({ to: "/funnels" });
  });

  it("shows on trial or in the first 14 days, never when done", () => {
    const state = { ...all, lead: false };
    expect(showFirstSteps({ phase: "trial", createdAt: null, state })).toBe(true);
    expect(showFirstSteps({ phase: "paid", createdAt: "2026-10-10T00:00:00Z", state, now })).toBe(
      true,
    );
    expect(showFirstSteps({ phase: "paid", createdAt: "2026-09-01T00:00:00Z", state, now })).toBe(
      false,
    );
    expect(showFirstSteps({ phase: "trial", createdAt: null, state: all })).toBe(false);
  });
});
