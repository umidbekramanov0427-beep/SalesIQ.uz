import {
  TRIAL_SEAT_LIMIT,
  featureLockReason,
  orgHasFeature,
  orgPhase,
  orgSeatLimit,
  type OrgAccessInput,
} from "@/lib/org-access";

const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

const org = (o: Partial<OrgAccessInput>): OrgAccessInput => ({
  plan: "master_iq",
  active: true,
  trial_ends_at: null,
  is_trial: false,
  ...o,
});

describe("org-access", () => {
  it("derives the phase", () => {
    expect(orgPhase(org({}))).toBe("paid");
    expect(orgPhase(org({ is_trial: true, trial_ends_at: future }))).toBe("trial");
    expect(orgPhase(org({ is_trial: true, trial_ends_at: past }))).toBe("expired");
    expect(orgPhase(org({ active: false }))).toBe("expired");
  });

  it("says why a feature is locked", () => {
    expect(featureLockReason(org({ active: false }), "analytics")).toBe("expired");
    expect(featureLockReason(org({ plan: "start_iq" }), "telephony")).toBe("plan");
    expect(featureLockReason(org({ is_trial: true, trial_ends_at: future }), "telephony")).toBe(
      "trial",
    );
    expect(orgHasFeature(org({ plan: "analyst_iq" }), "telephony")).toBe(true);
  });

  it("caps seats during the trial and keeps unlimited orgs unlimited", () => {
    expect(orgSeatLimit(org({ plan: "analyst_iq" }), 0)).toBe(25);
    expect(
      orgSeatLimit(org({ plan: "analyst_iq", is_trial: true, trial_ends_at: future }), 0),
    ).toBe(TRIAL_SEAT_LIMIT);
    expect(orgSeatLimit(org({ unlimited_seats: true }), 0)).toBeNull();
  });
});
