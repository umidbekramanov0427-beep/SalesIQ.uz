import { matchButton } from "@/lib/automation-types";

describe("automatic message buttons", () => {
  const labels = ["O'qib chiqdim, roziman", "E'tirozim bor"];

  it("matches the pressed button's text, whatever the case and spaces", () => {
    expect(matchButton(labels, "O'qib chiqdim, roziman")).toBe(0);
    expect(matchButton(labels, "  e'tirozim BOR ")).toBe(1);
  });

  it("matches a typed number", () => {
    expect(matchButton(labels, "2")).toBe(1);
    expect(matchButton(labels, "3")).toBe(-1);
    expect(matchButton(labels, "0")).toBe(-1);
  });

  it("ignores anything else", () => {
    expect(matchButton(labels, "salom")).toBe(-1);
    expect(matchButton(labels, "")).toBe(-1);
    expect(matchButton([], "1")).toBe(-1);
  });
});
