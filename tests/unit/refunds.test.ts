import {
  cardBrand,
  cleanCardNumber,
  formatCard,
  parseRefundSheet,
  refundMessage,
  refundSummary,
} from "@/lib/refunds";

describe("refunds", () => {
  it("cleans and formats card numbers", () => {
    expect(cleanCardNumber("8600 4954 7331 6023")).toBe("8600495473316023");
    expect(cleanCardNumber("12-34")).toBeNull();
    expect(formatCard("8600495473316023")).toBe("8600 4954 7331 6023");
    expect(cardBrand("8600495473316023")).toBe("Uzcard");
    expect(cardBrand("9860100123456780")).toBe("Humo");
    expect(cardBrand("4111111111111111")).toBe("Visa");
  });

  it("sums up what is owed and paid back", () => {
    const s = refundSummary([
      { status: "pending", amount: 3_000_000, stage: "before" },
      { status: "pending", amount: 2_000_000, stage: "after" },
      { status: "refunded", amount: 1_500_000, stage: "before" },
      { status: "cancelled", amount: 9e9, stage: "before" },
    ]);
    expect(s).toEqual({
      total: 3,
      pending: 2,
      refunded: 1,
      cancelled: 1,
      toPay: 5_000_000,
      paidBack: 1_500_000,
      before: 2,
      after: 1,
    });
  });

  it("writes the client's message", () => {
    expect(refundMessage("Aziza", "2 000 000 so'm")).toContain("Assalomu alaykum, Aziza!");
    expect(refundMessage("", "1 so'm")).toContain("Pulingiz qaytarildi: 1 so'm.");
  });

  it("reads an imported sheet in Uzbek or Russian", () => {
    const uz = parseRefundSheet([
      ["Ism", "Telefon", "Summa", "Karta raqami", "Karta egasi", "Sabab", "Bosqich"],
      [
        "Aziza Karimova",
        "+998901234567",
        "2 500 000",
        "8600 4954 7331 6023",
        "AZIZA KARIMOVA",
        "Vaqti yo'q",
        "qabul qilingandan keyin",
      ],
      ["", "", "", "", "", "", ""],
      ["Nomsiz", "", "0", "", "", "", ""],
    ]);
    expect(uz.skipped).toBe(1);
    expect(uz.rows).toEqual([
      {
        client_name: "Aziza Karimova",
        phone: "+998901234567",
        amount: 2_500_000,
        card_number: "8600495473316023",
        card_holder: "AZIZA KARIMOVA",
        reason: "Vaqti yo'q",
        stage: "after",
      },
    ]);
    const ru = parseRefundSheet([
      ["Имя", "Сумма", "Номер карты", "Владелец"],
      ["Иван", "1000000", "9860100123456780", "IVAN"],
    ]);
    expect(ru.rows[0]).toMatchObject({
      client_name: "Иван",
      amount: 1_000_000,
      card_holder: "IVAN",
      stage: "before",
    });
  });
});
