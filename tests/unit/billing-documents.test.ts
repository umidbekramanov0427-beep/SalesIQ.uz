import {
  docNumber,
  parseRequisites,
  proformaNumber,
  requisitesReady,
  serviceLine,
  splitAmount,
} from "@/lib/subscription-billing/documents";

describe("subscription documents", () => {
  it("cleans the stored details", () => {
    const r = parseRequisites({
      company_name: "  SalesIQ MChJ ",
      tin: "305 123 456",
      account: "2020 8000 1234 5678 9012",
      bank_mfo: "00440",
      has_vat: true,
      vat_rate: "12",
      evil: "<script>",
    });
    expect(r.company_name).toBe("SalesIQ MChJ");
    expect(r.tin).toBe("305123456");
    expect(r.account).toBe("20208000123456789012");
    expect(r.has_vat).toBe(true);
    expect(r.vat_rate).toBe(12);
    expect(requisitesReady(r)).toBe(true);
    expect(requisitesReady(parseRequisites(null))).toBe(false);
    expect(parseRequisites({ vat_rate: 500 }).vat_rate).toBe(12);
  });

  it("splits VAT out of a paid amount", () => {
    expect(splitAmount(399_000, false, 12)).toEqual({ sum: 399_000, vat: 0, total: 399_000 });
    const v = splitAmount(448_000, true, 12);
    expect(v.vat).toBe(48_000);
    expect(v.sum).toBe(400_000);
    expect(v.sum + v.vat).toBe(v.total);
    const odd = splitAmount(399_000, true, 12);
    expect(Math.round((odd.sum + odd.vat) * 100) / 100).toBe(399_000);
  });

  it("numbers documents", () => {
    expect(docNumber(123, "abcdef12-0000")).toBe("SIQ-000123");
    expect(docNumber(null, "abcdef12-0000")).toBe("SIQ-ABCDEF12");
    expect(proformaNumber("aaaaaaaa-0000", new Date("2026-10-16T20:00:00Z"))).toBe("H-AAAA-261017");
  });

  it("describes the service month in Tashkent dates", () => {
    expect(serviceLine("analyst_iq", new Date("2026-10-16T06:00:00Z"))).toBe(
      "SalesIQ CRM obunasi — Analyst IQ tarifi, 30 kun (16.10.2026 – 14.11.2026)",
    );
  });
});
