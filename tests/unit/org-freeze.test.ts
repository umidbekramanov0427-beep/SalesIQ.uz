import { freezePatch, unfreezePatch } from "@/lib/org-access";

const DAY = 86_400_000;

describe("freezing a company", () => {
  it("freezes with a trimmed reason", () => {
    const now = new Date("2026-10-10T10:00:00Z");
    expect(freezePatch("  to'lov kutilmoqda ", now)).toEqual({
      active: false,
      frozen_at: now.toISOString(),
      frozen_reason: "to'lov kutilmoqda",
    });
    expect(freezePatch("   ", now).frozen_reason).toBeNull();
  });

  it("gives the frozen days back on unfreeze", () => {
    const frozenAt = new Date("2026-10-01T00:00:00Z");
    const endsAt = new Date("2026-10-05T00:00:00Z");
    const now = new Date(frozenAt.getTime() + 6 * DAY);
    const patch = unfreezePatch(
      { frozen_at: frozenAt.toISOString(), trial_ends_at: endsAt.toISOString() },
      now,
    );
    expect(patch.active).toBe(true);
    expect(patch.frozen_at).toBeNull();
    expect(patch.trial_ends_at).toBe(new Date(endsAt.getTime() + 6 * DAY).toISOString());
  });

  it("doesn't extend a term that had already ended when it was frozen", () => {
    const patch = unfreezePatch(
      { frozen_at: "2026-10-10T00:00:00Z", trial_ends_at: "2026-10-01T00:00:00Z" },
      new Date("2026-10-20T00:00:00Z"),
    );
    expect(patch).not.toHaveProperty("trial_ends_at");
  });
});
