import { actionLabel, featureUsage } from "@/lib/visit-labels";

const t = (key: string) => key;

describe("featureUsage", () => {
  it("counts pages and actions per feature and leaves unused ones at zero", () => {
    const usage = featureUsage(
      [
        { path: "/funnels", count: 5 },
        { path: "/funnels/:id", count: 2 },
        { path: "/audio-analytics", count: 1 },
      ],
      [{ label: "call_analyze", count: 4 }],
    );
    const by = Object.fromEntries(usage.map((u) => [u.key, u.count]));
    expect(by["funnels"]).toBe(7);
    expect(by["audio"]).toBe(5);
    expect(by["ai"]).toBe(0);
    expect(by["reports"]).toBe(0);
  });
});

describe("actionLabel", () => {
  it("names alerts and known actions, passes others through", () => {
    expect(actionLabel("alert:new_city", t)).toBe("visits.alert.new_city");
    expect(actionLabel("report_export", t)).toBe("visits.act.report_export");
    expect(actionLabel("something", t)).toBe("something");
  });
});
