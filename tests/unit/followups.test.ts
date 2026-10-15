import { followupText, inWorkingHours, renderFollowup, tashkentHour } from "@/lib/followups";

describe("renderFollowup", () => {
  it("fills the client's first name", () => {
    expect(renderFollowup("Assalomu alaykum, {ism}! Savolingiz qoldimi?", "Dilnoza Karimova")).toBe(
      "Assalomu alaykum, Dilnoza! Savolingiz qoldimi?",
    );
    expect(renderFollowup("Hi {name}!", "Aziz")).toBe("Hi Aziz!");
  });
  it("drops the name cleanly when it is unknown or not a name", () => {
    expect(renderFollowup("Assalomu alaykum, {ism}! Savolingiz qoldimi?", "")).toBe(
      "Assalomu alaykum! Savolingiz qoldimi?",
    );
    expect(renderFollowup("Salom {ism}, yordam kerakmi?", "+998901112233")).toBe(
      "Salom, yordam kerakmi?",
    );
  });
});

describe("working hours", () => {
  // 2026-10-16 04:00 UTC = 09:00 Tashkent
  const at = (utcHour: number) => Date.UTC(2026, 9, 16, utcHour, 0);
  it("uses Tashkent time", () => {
    expect(tashkentHour(at(4))).toBe(9);
    expect(inWorkingHours(at(4), 9, 20)).toBe(true);
    expect(inWorkingHours(at(3), 9, 20)).toBe(false);
    expect(inWorkingHours(at(15), 9, 20)).toBe(false); // 20:00
    expect(inWorkingHours(at(19), 22, 2)).toBe(true); // 00:00, overnight range
  });
});

describe("followupText", () => {
  const s = { message: "first", second_message: "second" };
  it("switches to the second text from the second attempt", () => {
    expect(followupText(s, 1)).toBe("first");
    expect(followupText(s, 2)).toBe("second");
    expect(followupText({ message: "only", second_message: " " }, 3)).toBe("only");
  });
});
