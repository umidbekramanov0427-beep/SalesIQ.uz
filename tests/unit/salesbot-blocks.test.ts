import { botCompare, randomTarget, BOT_STEP_GROUPS, BOT_STEP_TYPES } from "@/lib/automation-types";
import { portsOf, setPortTarget, normalizeSteps } from "@/components/automations/BotCanvas";
import type { BotStep } from "@/lib/automation-types";

describe("salesbot condition operators (5CRM)", () => {
  it("covers every operator", () => {
    expect(botCompare("Narxi qancha?", "contains", "narx")).toBe(true);
    expect(botCompare("to'lov qilsam", "any_of", "narx, to'lov, chegirma")).toBe(true);
    expect(botCompare("salom", "any_of", "narx, to'lov")).toBe(false);
    expect(botCompare("Ha", "eq", "ha")).toBe(true);
    expect(botCompare("ha", "neq", "yo'q")).toBe(true);
    expect(botCompare("1 500 000", "gt", "1000000")).toBe(true);
    expect(botCompare("5", "lt", "3")).toBe(false);
    expect(botCompare(" ", "empty", "")).toBe(true);
    expect(botCompare("x", "any", "")).toBe(true);
    expect(botCompare("+998 90 123 45 67", "phone", "")).toBe(true);
  });

  it("picks a random path", () => {
    expect(randomTarget(["a", "b", "c"], 0)).toBe("a");
    expect(randomTarget(["a", "b", "c"], 0.99)).toBe("c");
    expect(randomTarget([], 0.5)).toBe(null);
  });

  it("groups every block once", () => {
    const grouped = BOT_STEP_GROUPS.flatMap((g) => g.types);
    expect(new Set(grouped).size).toBe(grouped.length);
    for (const t of grouped) expect(BOT_STEP_TYPES).toContain(t);
  });
});

describe("canvas exits of the new blocks", () => {
  const t = (k: string) => k;
  it("validator has yes/no, random has one per path, simple blocks have next", () => {
    const v: BotStep = { id: "v", type: "validate", kind: "phone", then: "a", else: "b" };
    expect(portsOf(v, t).map((p) => p.key)).toEqual(["then", "else"]);
    const r: BotStep = { id: "r", type: "random", targets: ["a", "b", "c"] };
    expect(portsOf(r, t).map((p) => p.key)).toEqual(["r:0", "r:1", "r:2"]);
    const r2 = setPortTarget(r, "r:1", "z");
    expect(r2.type === "random" && r2.targets[1]).toBe("z");
    const n: BotStep = { id: "n", type: "note", text: "x" };
    expect(portsOf(n, t).map((p) => p.key)).toEqual(["next"]);
    const s: BotStep = { id: "s", type: "start_bot", botId: "b" };
    expect(portsOf(s, t)).toEqual([]);
  });

  it("normalize links an implicit next for new blocks", () => {
    const steps = normalizeSteps([
      { id: "a", type: "typing", mode: "typing" },
      { id: "b", type: "stop" },
    ]);
    const a = steps[0]!;
    expect(a.type === "typing" && a.next).toBe("b");
  });
});
