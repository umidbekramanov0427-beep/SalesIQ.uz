import {
  chatTranscript,
  heuristicScore,
  parseAiScore,
  temperatureOf,
  type ChatMessage,
} from "@/lib/lead-scoring";

const NOW = Date.parse("2026-10-16T10:00:00Z");
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
const msg = (direction: "in" | "out", text: string, hoursAgo: number): ChatMessage => ({
  direction,
  text,
  created_at: at(hoursAgo),
});

describe("heuristicScore", () => {
  it("rates an asking, active client hot", () => {
    const r = heuristicScore({
      now: NOW,
      budget: 5_000_000,
      messages: [
        msg("in", "Salom, narxi qancha?", 3),
        msg("out", "390 000 so'm", 2.9),
        msg("in", "Bugun buyurtma bersam ertaga yetkazasizmi?", 1),
        msg("in", "Payme orqali to'lov bo'ladimi?", 0.9),
        msg("in", "Manzil Yunusobod", 0.8),
        msg("in", "Shartnoma kerak", 0.5),
      ],
    });
    expect(r.temperature).toBe("Hot");
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.reasons).toContain("Narx, to'lov yoki buyurtma haqida so'radi");
    expect(r.nextAction).toMatch(/qo'ng'iroq/i);
  });

  it("rates a pushing-back, silent client cold", () => {
    const r = heuristicScore({
      now: NOW,
      messages: [
        msg("in", "Qimmat ekan, keyinroq o'ylab ko'raman", 100),
        msg("out", "Chegirma bor", 99),
      ],
    });
    expect(r.temperature).toBe("Cold");
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        "E'tiroz bildirdi (qimmat / keyinroq / kerak emas)",
        "3 kundan beri javob yo'q",
      ]),
    );
  });

  it("understands Russian and Cyrillic Uzbek", () => {
    const ru = heuristicScore({ now: NOW, messages: [msg("in", "Сколько стоит доставка?", 1)] });
    expect(ru.reasons).toContain("Narx, to'lov yoki buyurtma haqida so'radi");
    const cyr = heuristicScore({ now: NOW, messages: [msg("in", "Нархи қанча?", 1)] });
    expect(cyr.reasons).toContain("Narx, to'lov yoki buyurtma haqida so'radi");
  });

  it("notes a lead that never wrote", () => {
    const r = heuristicScore({ now: NOW, messages: [msg("out", "Salom!", 30)] });
    expect(r.temperature).toBe("Cold");
    expect(r.reasons).toContain("Hali birorta xabar yozmagan");
  });

  it("keeps the score within 0-100", () => {
    const r = heuristicScore({
      now: NOW,
      stageProbability: 100,
      budget: 1,
      messages: Array.from({ length: 30 }, (_, i) => msg("in", "narx to'lov buyurtma", i * 0.01)),
    });
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("helpers", () => {
  it("maps scores to temperature", () => {
    expect(temperatureOf(70)).toBe("Hot");
    expect(temperatureOf(69)).toBe("Warm");
    expect(temperatureOf(40)).toBe("Warm");
    expect(temperatureOf(39)).toBe("Cold");
  });
  it("writes the transcript for the AI", () => {
    expect(chatTranscript([msg("in", "Salom\n  narx?", 1), msg("out", "390k", 0)])).toBe(
      "Mijoz: Salom narx?\nBiz: 390k",
    );
  });
  it("reads the AI answer and rejects junk", () => {
    expect(
      parseAiScore({ score: 82.4, reasons: ["a", 3, ""], next_action: " qo'ng'iroq " }),
    ).toEqual({
      score: 82,
      temperature: "Hot",
      reasons: ["a"],
      nextAction: "qo'ng'iroq",
    });
    expect(parseAiScore({ score: "x" })).toBeNull();
    expect(parseAiScore(null)).toBeNull();
    expect(parseAiScore({ score: 140 })?.score).toBe(100);
  });
});
