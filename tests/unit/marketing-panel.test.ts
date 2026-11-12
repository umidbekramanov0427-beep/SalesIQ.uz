import {
  companyOrigin,
  isPlatformHost,
  panelFromHost,
  subdomainFromHost,
  subdomainProblem,
} from "@/lib/subdomain";

describe("marketing panel addresses", () => {
  it("knows which panel an address serves", () => {
    expect(panelFromHost("salesiq.uz")).toBe("crm");
    expect(panelFromHost("demo.salesiq.uz")).toBe("crm");
    expect(panelFromHost("marketing.salesiq.uz")).toBe("marketing");
    expect(panelFromHost("demo.marketing.salesiq.uz")).toBe("marketing");
    expect(panelFromHost("marketing.localhost:8080")).toBe("marketing");
    expect(panelFromHost("evilmarketing.salesiq.uz")).toBe("crm");
  });

  it("reads the company from either panel's address", () => {
    expect(subdomainFromHost("acme.salesiq.uz")).toBe("acme");
    expect(subdomainFromHost("acme.marketing.salesiq.uz")).toBe("acme");
    expect(subdomainFromHost("marketing.salesiq.uz")).toBeNull();
    expect(subdomainFromHost("a.b.marketing.salesiq.uz")).toBeNull();
    expect(subdomainProblem("marketing")).toBe("reserved");
  });

  it("builds each panel's origin", () => {
    expect(companyOrigin("demo")).toBe("https://demo.salesiq.uz");
    expect(companyOrigin("demo", "marketing")).toBe("https://demo.marketing.salesiq.uz");
    expect(companyOrigin(null, "marketing")).toBe("https://marketing.salesiq.uz");
    expect(isPlatformHost("demo.marketing.salesiq.uz")).toBe(true);
    expect(isPlatformHost("localhost:8080")).toBe(false);
  });
});
