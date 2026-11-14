import {
  DEFAULT_CONTROL_SETTINGS,
  fillTemplate,
  kpiScore,
  paceStatus,
  parseCelebrationLink,
  parseControlSettings,
  partsReached,
  planParts,
  shortMoney,
  workDaysInMonth,
} from "@/lib/control-settings";

describe("control settings", () => {
  it("falls back to the defaults for anything missing or wrong", () => {
    expect(parseControlSettings(null)).toEqual(DEFAULT_CONTROL_SETTINGS);
    const s = parseControlSettings({
      normativ: { onTrack: 80, atRisk: 95, basis: "deals" },
      celebrations: { team: { style: "lasers", text: "  " }, seconds: 99 },
      fines: { monthlyCap: "" },
    });
    expect(s.normativ.onTrack).toBe(80);
    expect(s.normativ.atRisk).toBe(80); // never above «Rejada»
    expect(s.normativ.basis).toBe("deals");
    expect(s.celebrations.team.style).toBe("confetti");
    expect(s.celebrations.team.text).toBe(DEFAULT_CONTROL_SETTINGS.celebrations.team.text);
    expect(s.celebrations.seconds).toBe(15);
    expect(s.fines.monthlyCap).toBeNull();
  });

  it("cuts a plan into parts and counts the parts reached", () => {
    const quarters = planParts(1_000_000_000, 4);
    expect(quarters.map((p) => p.amount)).toEqual([
      250_000_000, 500_000_000, 750_000_000, 1_000_000_000,
    ]);
    expect(quarters.map((p) => p.pct)).toEqual([25, 50, 75, 100]);
    expect(partsReached(249_999_999, 1_000_000_000, 4)).toBe(0);
    expect(partsReached(250_000_000, 1_000_000_000, 4)).toBe(1);
    expect(partsReached(2_000_000_000, 1_000_000_000, 4)).toBe(4);
    expect(partsReached(300, 1000, 8)).toBe(2);
    expect(partsReached(5, 0, 4)).toBe(0);
  });

  it("writes money short and fills the text", () => {
    expect(shortMoney(1_250_000_000)).toBe("1,25 mlrd");
    expect(shortMoney(1_000_000_000)).toBe("1 mlrd");
    expect(shortMoney(50_000_000)).toBe("50 mln");
    expect(shortMoney(85_000)).toBe("85 ming");
    expect(
      fillTemplate("Biz {pct}% · {fact} / {target} {x}", {
        pct: 25,
        fact: "250 mln",
        target: "1 mlrd",
      }),
    ).toBe("Biz 25% · 250 mln / 1 mlrd {x}");
  });

  it("counts working days in a month", () => {
    // November 2026: 30 days, starts on a Sunday -> 21 weekdays.
    expect(workDaysInMonth("2026-11-01", [1, 2, 3, 4, 5])).toBe(21);
    expect(workDaysInMonth("2026-11-01", [1, 2, 3, 4, 5, 6])).toBe(25);
  });

  it("scores KPI against targets and weights", () => {
    const k = parseControlSettings({
      kpi: {
        targets: { salesCount: 10, revenue: 100 },
        weights: { salesCount: 1, revenue: 1, callsMade: 0 },
      },
    }).kpi;
    expect(kpiScore({ salesCount: 10, revenue: 100 }, k)).toBe(100);
    expect(kpiScore({ salesCount: 5, revenue: 50 }, k)).toBe(50);
    expect(kpiScore({ salesCount: 100, revenue: 0 }, k)).toBe(75); // capped at 150%
    expect(kpiScore({}, DEFAULT_CONTROL_SETTINGS.kpi)).toBeNull();
  });

  it("decides the Normativ status by the company's limits", () => {
    const n = { onTrack: 90, atRisk: 60 };
    expect(paceStatus(95, n)).toBe("onTrack");
    expect(paceStatus(70, n)).toBe("atRisk");
    expect(paceStatus(10, n)).toBe("behind");
  });

  it("reads a celebration notification's link", () => {
    expect(parseCelebrationLink("/attendance?tab=reja&c=part&s=rocket&pct=25")).toEqual({
      kind: "part",
      style: "rocket",
      pct: 25,
    });
    expect(parseCelebrationLink("/crm/leads/x?c=first&s=bogus").style).toBe("confetti");
    expect(parseCelebrationLink("/crm/leads/x?c=first").pct).toBeNull();
  });
});
