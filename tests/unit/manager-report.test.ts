import { normalizeReportHeading } from "@/lib/manager-report";

describe("normalizeReportHeading", () => {
  it("turns a literal date and name in the first line into placeholders", () => {
    const out = normalizeReportHeading("#Hisobot Umidbek 05.10\nQo'ng'iroqlar: 12", ["Umidbek"]);
    const [heading, body] = out.split("\n");
    expect(heading).toContain("{date}");
    expect(heading).not.toContain("05.10");
    expect(heading).not.toContain("Umidbek");
    expect(body).toBe("Qo'ng'iroqlar: 12");
  });

  it("leaves dates in the body alone", () => {
    const out = normalizeReportHeading("#Hisobot {date}\nKeyingi uchrashuv 12.10", []);
    expect(out.split("\n")[1]).toBe("Keyingi uchrashuv 12.10");
  });

  it("returns an empty template unchanged", () => {
    expect(normalizeReportHeading("")).toBe("");
  });
});
