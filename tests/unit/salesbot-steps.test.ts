import { replyIsValid, splitPath } from "@/lib/automation-types";

describe("salesbot reply validation", () => {
  it("accepts phones with 9-15 digits", () => {
    expect(replyIsValid("phone", "+998 90 123 45 67")).toBe(true);
    expect(replyIsValid("phone", "901234567")).toBe(true);
    expect(replyIsValid("phone", "12345")).toBe(false);
    expect(replyIsValid("phone", "salom 901234567")).toBe(false);
  });

  it("checks emails, numbers and names", () => {
    expect(replyIsValid("email", "ali@mail.uz")).toBe(true);
    expect(replyIsValid("email", "ali@mail")).toBe(false);
    expect(replyIsValid("number", "1 500 000")).toBe(true);
    expect(replyIsValid("number", "2,5")).toBe(true);
    expect(replyIsValid("number", "ikki")).toBe(false);
    expect(replyIsValid("name", "Dilnoza")).toBe(true);
    expect(replyIsValid("name", "Ali 2")).toBe(false);
    expect(replyIsValid("name", "👍")).toBe(false);
  });
});

describe("salesbot A/B split", () => {
  it("sends the given share down path A", () => {
    expect(splitPath(30, 0.1)).toBe("a");
    expect(splitPath(30, 0.5)).toBe("b");
    expect(splitPath(0, 0)).toBe("b");
    expect(splitPath(100, 0.99)).toBe("a");
  });
});
