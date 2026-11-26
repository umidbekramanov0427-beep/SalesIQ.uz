import {
  findBotToken,
  parseSetupCard,
  redactBotToken,
  splitQuickReplies,
} from "@/lib/ai/setup-cards";

describe("parseSetupCard", () => {
  it("drops unknown kinds", () => {
    expect(parseSetupCard({ kind: "delete_everything" })).toBeNull();
    expect(parseSetupCard({})).toBeNull();
  });

  it("keeps known fields, trims and caps them", () => {
    const c = parseSetupCard({
      kind: "salesbot",
      prefill: {
        name: "  Ro'yxat  ",
        questions: [
          { text: "Ismingiz?", saveTo: "name" },
          { text: "Qayerdansiz?", saveTo: "weird" },
          { text: "   " },
          "Telefoningiz?",
        ],
        secret: "x",
      },
    });
    expect(c?.kind).toBe("salesbot");
    expect(c?.prefill.name).toBe("Ro'yxat");
    expect(c?.prefill.questions).toEqual([
      { text: "Ismingiz?", saveTo: "name" },
      { text: "Qayerdansiz?", saveTo: "note" },
      { text: "Telefoningiz?", saveTo: "note" },
    ]);
    expect((c?.prefill as Record<string, unknown>)["secret"]).toBeUndefined();
  });

  it("caps the funnel stages", () => {
    const stages = Array.from({ length: 20 }, (_, i) => `S${i}`);
    expect(parseSetupCard({ kind: "funnel", prefill: { stages } })?.prefill.stages).toHaveLength(
      12,
    );
  });
});

describe("bot tokens in the chat", () => {
  const token = "1234567890:AAH9k2Lr8sQ0pXzYw3vT6uN1mB4cD7eF5gHi";
  it("finds and hides a token", () => {
    expect(findBotToken(`mana token ${token} ulab ber`)).toBe(token);
    expect(redactBotToken(`mana ${token}`)).toBe("mana [token]");
    expect(findBotToken("telefonim +998 90 123 45 67")).toBeNull();
  });
});

describe("splitQuickReplies", () => {
  it("takes [[labels]] out of the text", () => {
    const r = splitQuickReplies(
      "Qanday sozlaymiz?\n[[O'zim sozlayman]]\n[[Birga sozlaymiz]]\n[[AI o'zi qilsin]]",
    );
    expect(r.text).toBe("Qanday sozlaymiz?");
    expect(r.replies).toEqual(["O'zim sozlayman", "Birga sozlaymiz", "AI o'zi qilsin"]);
  });
  it("leaves plain text alone and drops duplicates", () => {
    expect(splitQuickReplies("Salom").replies).toEqual([]);
    expect(splitQuickReplies("a [[Tayyor]] b [[Tayyor]]").replies).toEqual(["Tayyor"]);
  });
});
