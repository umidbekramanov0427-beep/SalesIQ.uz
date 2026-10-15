import {
  amountInWords,
  buildDidoxFactura,
  didoxProblems,
  formatInvoiceNumber,
  formatMoney,
  invoiceTotals,
  isTin,
  lineTotals,
  numberToUzWords,
  type InvoiceDraft,
} from "@/lib/invoices/invoice";

const draft = (over: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  number: "HF-0001",
  date: "2026-10-16",
  hasVat: true,
  vatRate: 12,
  items: [
    { name: "CRM xizmati", quantity: 2, price: 500_000, catalogCode: "10305001001000000" },
    { name: "O'rnatish", quantity: 1, price: 250_000.5, catalogCode: "10305001001000000" },
  ],
  ...over,
});

const seller = {
  name: "SalesIQ MChJ",
  tin: "301234567",
  account: "20208000900123456001",
  bankMfo: "00873",
  address: "Toshkent",
};
const buyer = { name: "Mijoz MChJ", tin: "302222222" };

describe("totals", () => {
  it("adds VAT per line and in total", () => {
    expect(lineTotals({ name: "x", quantity: 3, price: 1000 }, true, 12)).toEqual({
      sum: 3000,
      vatRate: 12,
      vat: 360,
      total: 3360,
    });
    expect(invoiceTotals(draft())).toEqual({
      sum: 1_250_000.5,
      vat: 150_000.06,
      total: 1_400_000.56,
    });
  });
  it("has no VAT for a company without it", () => {
    expect(invoiceTotals(draft({ hasVat: false }))).toEqual({
      sum: 1_250_000.5,
      vat: 0,
      total: 1_250_000.5,
    });
  });
  it("takes a line's own VAT rate", () => {
    expect(lineTotals({ name: "x", quantity: 1, price: 100, vatRate: 0 }, true, 12).vat).toBe(0);
  });
});

describe("formatting", () => {
  it("numbers and money", () => {
    expect(formatInvoiceNumber("HF", 42)).toBe("HF-0042");
    expect(formatInvoiceNumber("", 7)).toBe("0007");
    expect(formatMoney(1_250_000.5)).toBe("1 250 000,50");
    expect(formatMoney(0)).toBe("0,00");
  });
  it("writes amounts in Uzbek words", () => {
    expect(numberToUzWords(0)).toBe("nol");
    expect(numberToUzWords(15)).toBe("o'n besh");
    expect(numberToUzWords(101)).toBe("bir yuz bir");
    expect(numberToUzWords(1_250_000)).toBe("bir million ikki yuz ellik ming");
    expect(numberToUzWords(2_000_014_400)).toBe("ikki milliard o'n to'rt ming to'rt yuz");
    expect(amountInWords(1_400_000.56)).toBe("Bir million to'rt yuz ming so'm 56 tiyin");
  });
});

describe("Didox", () => {
  it("accepts complete requisites", () => {
    expect(didoxProblems(draft(), seller, buyer)).toEqual([]);
    expect(isTin("301 234 567")).toBe(true);
    expect(isTin("12345678901234")).toBe(true);
  });
  it("names what is missing", () => {
    expect(
      didoxProblems(
        draft({ items: [{ name: "x", quantity: 1, price: 1 }] }),
        { name: "" },
        { name: "B", tin: "12" },
      ),
    ).toEqual([
      "seller_name",
      "seller_tin",
      "seller_account",
      "seller_mfo",
      "buyer_tin",
      "catalog_code",
    ]);
  });
  it("builds the doctype 002 body", () => {
    const body = buildDidoxFactura(
      draft({ contractNo: "12/A", contractDate: "2026-10-01" }),
      seller,
      buyer,
    ) as {
      FacturaDoc: unknown;
      SellerTin: string;
      ProductList: { HasVat: boolean; Products: Record<string, unknown>[] };
      ContractDoc: unknown;
    };
    expect(body.FacturaDoc).toEqual({ FacturaNo: "HF-0001", FacturaDate: "2026-10-16" });
    expect(body.SellerTin).toBe("301234567");
    expect(body.ContractDoc).toEqual({ ContractNo: "12/A", ContractDate: "2026-10-01" });
    expect(body.ProductList.HasVat).toBe(true);
    expect(body.ProductList.Products[0]).toMatchObject({
      OrdNo: 1,
      Count: 2,
      DeliverySum: 1_000_000,
      VatRate: 12,
      VatSum: 120_000,
      DeliverySumWithVat: 1_120_000,
      WithoutVat: false,
    });
  });
});
