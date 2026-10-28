import { buildCallNote, tashkentDate } from "@/lib/ai-call-note";

const base = {
  analysedAt: new Date("2026-10-18T10:00:00Z"),
  intake: [],
  facts: [],
  objections: [],
  summary: "",
  agreements: [],
  nextStep: null,
};

describe("tashkentDate", () => {
  it("formats in Tashkent time", () => {
    // 20:30 UTC is already the next day in Tashkent (UTC+5).
    expect(tashkentDate(new Date("2026-10-17T20:30:00Z"))).toBe("18.10.2026");
  });
});

describe("buildCallNote", () => {
  it("puts the date first, one line per answer and the agreement last", () => {
    const note = buildCallNote({
      ...base,
      intake: [
        { question: "Mijoz ismi?", answer: "Aziza" },
        { question: "Mijoz yoshi", answer: "24" },
        { question: "Qayerdan va qaysi sohada ishlaydi?", answer: "Toshkent, bank" },
        { question: "O'rganishga to'siq", answer: "" },
      ],
      objections: ["Narxi qimmat", "Vaqti yo'q"],
      nextStep: "Ertaga 15:00 da qayta qo'ng'iroq",
    });
    expect(note).toBe(
      [
        "Tahlil qilindi: 18.10.2026",
        "Mijoz ismi: Aziza",
        "Mijoz yoshi: 24",
        "Qayerdan va qaysi sohada ishlaydi: Toshkent, bank",
        "E'tirozlari: Narxi qimmat; Vaqti yo'q",
        "",
        "Kelishuv / keyingi qadam: Ertaga 15:00 da qayta qo'ng'iroq",
      ].join("\n"),
    );
  });

  it("adds profile facts after the intake answers without repeating a label", () => {
    const note = buildCallNote({
      ...base,
      intake: [{ question: "Maqsadi", answer: "IT ga o'tish" }],
      facts: [
        { label: "Maqsadi", value: "boshqa" },
        { label: "Byudjet", value: "3 mln" },
        { label: "Joylashuvi", value: null },
      ],
    });
    expect(note.split("\n").slice(1, 3)).toEqual(["Maqsadi: IT ga o'tish", "Byudjet: 3 mln"]);
  });

  it("uses the summary when nothing about the client is known", () => {
    const note = buildCallNote({ ...base, summary: "Mijoz javob bermadi." });
    expect(note).toContain("Qisqacha: Mijoz javob bermadi.");
    expect(note.endsWith("Kelishuv / keyingi qadam: —")).toBe(true);
  });

  it("joins agreements with the next step once", () => {
    const note = buildCallNote({
      ...base,
      agreements: ["Shartnoma yuboriladi"],
      nextStep: "shartnoma yuboriladi",
    });
    expect(note.endsWith("Kelishuv / keyingi qadam: Shartnoma yuboriladi")).toBe(true);
  });
});
