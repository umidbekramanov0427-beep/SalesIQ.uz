import {
  clickCheckoutUrl,
  formatSom,
  parseAmount,
  paymeCheckoutUrl,
  pickPaidStage,
} from "@/lib/lead-payments/paid-stage";

const stages = [
  { id: "a1", pipeline_name: "Sotuv", position: 1, is_won: false, is_lost: false },
  { id: "a2", pipeline_name: "Sotuv", position: 7, is_won: true, is_lost: false },
  { id: "a3", pipeline_name: "Sotuv", position: 8, is_won: false, is_lost: true },
  { id: "b1", pipeline_name: "Ta'lim", position: 1, is_won: false, is_lost: false },
];

describe("pickPaidStage", () => {
  it("uses the stage the company picked for the funnel", () => {
    expect(pickPaidStage(stages, "Sotuv", { Sotuv: "a1" })).toBe("a1");
  });
  it("falls back to the funnel's won stage", () => {
    expect(pickPaidStage(stages, "Sotuv", {})).toBe("a2");
  });
  it("ignores a stage from another funnel and funnels without a won stage", () => {
    expect(pickPaidStage(stages, "Sotuv", { Sotuv: "b1" })).toBe("a2");
    expect(pickPaidStage(stages, "Ta'lim", {})).toBeNull();
  });
});

describe("amounts", () => {
  it("parses whole so'm within limits", () => {
    expect(parseAmount("990 000")).toBe(990000);
    expect(parseAmount(500)).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount(200_000_000)).toBeNull();
  });
  it("formats with spaces", () => {
    expect(formatSom(1234567)).toBe("1 234 567");
  });
});

describe("checkout URLs", () => {
  it("encodes Payme's params with the amount in tiyin", () => {
    const url = paymeCheckoutUrl("M1", "L1", 990000, "https://x.uz/pay/L1");
    const raw = atob(url.replace("https://checkout.paycom.uz/", ""));
    expect(raw).toBe("m=M1;ac.order_id=L1;a=99000000;l=uz;c=https://x.uz/pay/L1");
  });
  it("passes the link id as Click's transaction_param", () => {
    const u = new URL(clickCheckoutUrl("S1", "M1", "L1", 5000, "https://x.uz/pay/L1"));
    expect(u.searchParams.get("transaction_param")).toBe("L1");
    expect(u.searchParams.get("amount")).toBe("5000");
  });
});
