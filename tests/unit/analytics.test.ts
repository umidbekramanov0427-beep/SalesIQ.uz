import { pageName, track } from "@/lib/analytics";

describe("analytics", () => {
  it("collapses ids in paths so each record type counts as one page", () => {
    expect(pageName("/")).toBe("/");
    expect(pageName("/crm/leads/3f2a9c1e-8b7d-4e21-9a55-0c1d2e3f4a5b")).toBe("/crm/leads/:id");
    expect(pageName("/funnels/42")).toBe("/funnels/:id");
    expect(pageName("/integrations/amocrm")).toBe("/integrations/amocrm");
  });

  it("is a silent no-op outside the browser", () => {
    expect(() => track("Viewed Home Page")).not.toThrow();
  });
});
