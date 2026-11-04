import { sceneFor } from "@/lib/morning-boost";

describe("sceneFor", () => {
  it("keeps a chosen scene", () => {
    expect(sceneFor("rocket")).toBe("rocket");
    expect(sceneFor("ocean")).toBe("ocean");
  });
  it("rotates daily, one scene per day", () => {
    const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n, 9));
    const week = [0, 1, 2, 3, 4].map((n) => sceneFor("daily", day(n)));
    expect(new Set(week).size).toBe(5);
    expect(sceneFor("daily", day(5))).toBe(week[0]);
  });
  it("falls back for unknown values", () => {
    expect(["sun", "rocket", "confetti", "ocean", "mountain"]).toContain(sceneFor(null));
  });
});
