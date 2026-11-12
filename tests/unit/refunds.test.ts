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
        paid_amount: null,
        note: null,
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

describe("refund import matching", () => {
  it("finds the header under a title and guesses the columns", async () => {
    const { guessHeaderRow, guessRefundMapping } = await import("@/lib/refunds");
    const table = [
      ["Noyabr oyi qaytarishlar", "", "", ""],
      ["", "", "", ""],
      [
        "№",
        "F.I.Sh",
        "Tel raqami",
        "Qaytariladigan summa",
        "To'langan summa",
        "Plastik karta",
        "Karta egasi",
      ],
      ["1", "Aziza", "+998901234567", "2 500 000", "3 000 000", "8600 4954 7331 6023", "AZIZA K"],
    ];
    const h = guessHeaderRow(table);
    expect(h).toBe(2);
    expect(guessRefundMapping(table[h]!)).toEqual({
      client_name: 1,
      phone: 2,
      amount: 3,
      paid_amount: 4,
      card_number: 5,
      card_holder: 6,
    });
  });

  it("reads rows through a hand-made matching", async () => {
    const { buildRefundRows } = await import("@/lib/refunds");
    const table = [
      ["Kim", "Pul", "Izohlar", "Qayer"],
      ["Jasur", "1 200 000 so'm", "Kurs boshlanmadi", "x"],
      ["", "500000", "", ""],
      ["Bekzod", "", "", ""],
      ["", "", "", ""],
    ];
    const r = buildRefundRows(
      table,
      0,
      { client_name: 0, amount: 1, reason: 2 },
      { stage: "after" },
    );
    expect(r.rows).toEqual([
      {
        client_name: "Jasur",
        phone: null,
        amount: 1_200_000,
        card_number: null,
        card_holder: null,
        reason: "Kurs boshlanmadi",
        stage: "after",
        paid_amount: null,
        note: null,
      },
    ]);
    expect(r).toMatchObject({ skipped: 2, noName: 1, noAmount: 1 });
  });
});

describe("refund settings and analytics", () => {
  it("reads settings and fills the client's text", async () => {
    const { parseRefundRules, clientRefundText, DEFAULT_REFUND_RULES } =
      await import("@/lib/refunds");
    expect(parseRefundRules(null)).toEqual(DEFAULT_REFUND_RULES);
    const r = parseRefundRules({
      chatId: -100123,
      notifyClient: false,
      clientText: "Hurmatli {name}, {amount} qaytarildi",
    });
    expect(r).toEqual({
      chatId: -100123,
      notifyGroup: true,
      notifyClient: false,
      clientText: "Hurmatli {name}, {amount} qaytarildi",
      beforeDays: 3,
      afterDays: 7,
      remind: true,
    });
    expect(parseRefundRules({ beforeDays: 0, afterDays: 400, remind: false })).toMatchObject({
      beforeDays: 1,
      afterDays: 60,
      remind: false,
    });
    expect(clientRefundText(r, "Aziza", "1 000 so'm")).toBe(
      "Hurmatli Aziza, 1 000 so'm qaytarildi",
    );
    expect(clientRefundText(DEFAULT_REFUND_RULES, "Aziza", "1 so'm")).toContain(
      "Pulingiz qaytarildi",
    );
  });

  it("writes the group's message with the CRM link", async () => {
    const { groupRefundText } = await import("@/lib/refunds");
    const text = groupRefundText({
      name: "Aziza <K>",
      phone: "+998901234567",
      amountText: "2 500 000 so'm",
      card: "8600495473316023",
      holder: "AZIZA K",
      reason: null,
      stage: "after",
      by: "Umidbek",
      link: "https://demo.salesiq.uz/crm/leads/1",
      notified: true,
    });
    expect(text).toContain("Aziza &lt;K&gt;");
    expect(text).toContain("8600 4954 7331 6023 — AZIZA K");
    expect(text).toContain("Qabuldan keyin otkaz");
    expect(text).toContain('<a href="https://demo.salesiq.uz/crm/leads/1">');
  });

  it("groups refunds and counts them by week", async () => {
    const { groupRefunds, weeklyRefunds } = await import("@/lib/refunds");
    const rows = [
      {
        status: "pending" as const,
        amount: 100,
        reason: "Narx",
        created_at: "2026-11-10T08:00:00Z",
        refunded_at: null,
      },
      {
        status: "refunded" as const,
        amount: 200,
        reason: "Narx",
        created_at: "2026-11-03T08:00:00Z",
        refunded_at: "2026-11-11T08:00:00Z",
      },
      {
        status: "cancelled" as const,
        amount: 900,
        reason: "Narx",
        created_at: "2026-11-10T08:00:00Z",
        refunded_at: null,
      },
      {
        status: "pending" as const,
        amount: 50,
        reason: null,
        created_at: "2026-11-11T08:00:00Z",
        refunded_at: null,
      },
    ];
    expect(groupRefunds(rows, (r) => r.reason)).toEqual([
      { key: "Narx", count: 2, amount: 300, refunded: 1, refundedAmount: 200 },
      { key: null, count: 1, amount: 50, refunded: 0, refundedAmount: 0 },
    ]);
    const weeks = weeklyRefunds(rows, new Date("2026-11-12T08:00:00Z"), 2);
    expect(weeks).toEqual([
      { week: "2026-11-02", requested: 1, refunded: 0 },
      { week: "2026-11-09", requested: 2, refunded: 1 },
    ]);
  });
});

describe("refund deadlines", () => {
  it("gives 7 days after acceptance and fewer before, and reminds once a day near the end", async () => {
    const {
      refundDue,
      refundNeedsReminder,
      DEFAULT_REFUND_RULES: R,
    } = await import("@/lib/refunds");
    const now = new Date("2026-11-12T07:00:00Z");
    const after = {
      created_at: "2026-11-10T07:00:00Z",
      stage: "after" as const,
      status: "pending" as const,
    };
    const before = { ...after, stage: "before" as const };
    expect(refundDue(after, R, now)).toMatchObject({ kind: "left", days: 5 });
    expect(refundDue(before, R, now)).toMatchObject({ kind: "left", days: 1 });
    expect(refundDue({ ...before, created_at: "2026-11-09T07:00:00Z" }, R, now)).toMatchObject({
      kind: "today",
    });
    expect(refundDue({ ...before, created_at: "2026-11-05T07:00:00Z" }, R, now)).toMatchObject({
      kind: "overdue",
      days: 4,
    });
    expect(refundDue({ ...after, status: "refunded" as const }, R, now)).toEqual({ kind: "done" });

    expect(refundNeedsReminder({ ...after, reminded_at: null }, R, now)).toBe(false);
    expect(refundNeedsReminder({ ...before, reminded_at: null }, R, now)).toBe(true);
    expect(refundNeedsReminder({ ...before, reminded_at: "2026-11-12T01:00:00Z" }, R, now)).toBe(
      false,
    );
    expect(refundNeedsReminder({ ...before, reminded_at: "2026-11-11T07:00:00Z" }, R, now)).toBe(
      true,
    );
    expect(
      refundNeedsReminder({ ...before, reminded_at: null }, { ...R, remind: false }, now),
    ).toBe(false);
  });
});
