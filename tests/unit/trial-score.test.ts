import { buildTrialDigest, scoreTrial, stoppedAt, type TrialActivity } from "@/lib/trial-score";

const NOW = new Date("2026-10-12T06:00:00Z").getTime();
const base: TrialActivity = {
  sessions7d: 0,
  activeUsers7d: 0,
  users: 1,
  leads: 0,
  integrations: 0,
  lastSeenAt: null,
};

describe("scoreTrial", () => {
  it("rates an untouched trial cold with every gap named", () => {
    const s = scoreTrial(base, NOW);
    expect(s.score).toBe(0);
    expect(s.temp).toBe("cold");
    expect(s.gaps).toEqual(["no_visits", "no_leads", "no_integration"]);
  });

  it("rates a busy team with leads and an integration hot", () => {
    const s = scoreTrial(
      {
        sessions7d: 12,
        activeUsers7d: 3,
        users: 4,
        leads: 40,
        integrations: 1,
        lastSeenAt: new Date(NOW - 3_600_000).toISOString(),
      },
      NOW,
    );
    expect(s.score).toBe(100);
    expect(s.temp).toBe("hot");
    expect(s.gaps).toEqual([]);
  });

  it("is warm for one person trying it out, and flags going idle", () => {
    const s = scoreTrial(
      {
        ...base,
        sessions7d: 4,
        activeUsers7d: 1,
        leads: 3,
        lastSeenAt: new Date(NOW - 3 * 86_400_000).toISOString(),
      },
      NOW,
    );
    expect(s.score).toBe(12 + 10 + 12);
    expect(s.temp).toBe("warm");
    expect(s.gaps).toEqual(["one_user", "no_integration", "idle"]);
  });
});

describe("stoppedAt", () => {
  it("names the first step not reached", () => {
    expect(
      stoppedAt({
        signed_up: true,
        bot_linked: true,
        first_lead: false,
        integration: true,
        paid: false,
      }),
    ).toBe("first_lead");
    expect(
      stoppedAt({
        signed_up: true,
        bot_linked: true,
        first_lead: true,
        integration: true,
        paid: true,
      }),
    ).toBeNull();
  });
});

describe("buildTrialDigest", () => {
  const company = {
    score: 70,
    temp: "hot" as const,
    daysLeft: 3,
    idleDays: 0,
    sessions7d: 9,
    activeUsers7d: 2,
    leads: 15,
    integrations: 1,
  };

  it("says nothing when there is nothing to say", () => {
    expect(buildTrialDigest([], { newSignups: 0, expiredUnpaid: [], url: "u" })).toBeNull();
  });

  it("lists who to call, who is ending and who went quiet", () => {
    const text = buildTrialDigest(
      [
        { ...company, name: "Acme <Ltd>" },
        { ...company, name: "Beta", temp: "warm", score: 40, daysLeft: 1 },
        { ...company, name: "Gamma", temp: "cold", score: 5, idleDays: null },
      ],
      { newSignups: 2, expiredUnpaid: ["Delta"], url: "https://salesiq.uz/platform/sessions" },
    )!;
    expect(text).toContain("Jami: 3 · 🔥 1 · 🌤 1 · ❄️ 1");
    expect(text).toContain("Kecha ro'yxatdan o'tdi: 2");
    expect(text).toContain("Acme &lt;Ltd&gt;: 9 kirish, 2 xodim, 15 lid, integratsiya ulangan");
    expect(text).toContain("Beta — ertaga (iliq)");
    expect(text).toContain("Gamma — umuman kirmagan");
    expect(text).toContain("• Delta");
    expect(text).toContain("https://salesiq.uz/platform/sessions");
  });
});
