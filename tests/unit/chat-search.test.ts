import { chatMatches, splitMatches } from "@/lib/chat-search";

describe("chat search", () => {
  const msgs = [
    { id: "1", text: "Narxi qancha?" },
    { id: "2", text: null },
    { id: "3", text: "NARXI 3 mln, chegirma bor" },
    { id: "4", text: "Rahmat" },
  ];

  it("finds messages in chat order, any case", () => {
    expect(chatMatches(msgs, "narx")).toEqual(["1", "3"]);
    expect(chatMatches(msgs, "  ")).toEqual([]);
  });

  it("cuts text into marked pieces", () => {
    expect(splitMatches("Narxi narx", "narx")).toEqual([
      { text: "Narx", hit: true },
      { text: "i ", hit: false },
      { text: "narx", hit: true },
    ]);
    expect(splitMatches("abc", "")).toEqual([{ text: "abc", hit: false }]);
  });
});
