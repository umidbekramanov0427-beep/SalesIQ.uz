import { END_STEP, tashkentClock, type BotStep } from "@/lib/automation-types";
import { botTemplate, TEMPLATE_KEYS } from "@/lib/salesbots/templates";
import { simulateBot } from "@/lib/salesbots/simulate";

const t = (k: string) => k;

function links(s: BotStep): string[] {
  const o = s as Record<string, unknown>;
  const out: string[] = [];
  for (const k of ["next", "then", "else", "a", "b", "onTimeout"]) {
    if (typeof o[k] === "string") out.push(o[k] as string);
  }
  if (s.type === "random") out.push(...s.targets);
  if (s.type === "message") for (const b of s.buttons ?? []) if (b.next) out.push(b.next);
  return out;
}

describe("salesbot templates (5CRM)", () => {
  it("has the six templates with their step counts", () => {
    const counts = Object.fromEntries(
      TEMPLATE_KEYS.map((k) => [k, botTemplate(k, t).steps.length]),
    );
    expect(counts).toEqual({
      greeter: 3,
      handoff: 6,
      emailOffer: 3,
      keyword: 4,
      collectEmail: 5,
      afterHours: 3,
    });
  });

  it("links every step to a real step or the end", () => {
    for (const k of TEMPLATE_KEYS) {
      const { steps } = botTemplate(k, t);
      const ids = new Set(steps.map((s) => s.id));
      expect(ids.size).toBe(steps.length);
      for (const s of steps)
        for (const l of links(s)) expect(l === END_STEP || ids.has(l)).toBe(true);
    }
  });
});

describe("bot preview", () => {
  it("walks the yes path and answers with the first button", () => {
    const sim = simulateBot(botTemplate("handoff", t).steps);
    expect(sim.map((b) => b.kind)).toEqual(["bot", "client", "event", "event"]);
    expect(sim[0]).toMatchObject({ buttons: ["sb.t6.handoff.sales", "sb.t6.handoff.help"] });
    expect(sim[1]).toMatchObject({ text: "sb.t6.handoff.sales" });
  });

  it("stops on a loop back", () => {
    const sim = simulateBot([
      { id: "a", type: "message", text: "hi", next: "b" },
      { id: "b", type: "delay", minutes: 5, next: "a" },
    ]);
    expect(sim).toHaveLength(2);
  });

  it("is empty for an empty bot", () => {
    expect(simulateBot([])).toEqual([]);
  });
});

describe("working hours clock", () => {
  it("uses Tashkent time", () => {
    // 2026-11-24 is a Tuesday; 04:00 UTC = 09:00 Tashkent.
    expect(tashkentClock(new Date("2026-11-24T04:00:00Z"))).toEqual({ hour: 9, afterHours: false });
    expect(tashkentClock(new Date("2026-11-24T13:30:00Z"))).toEqual({ hour: 18, afterHours: true });
    expect(tashkentClock(new Date("2026-11-23T03:00:00Z")).afterHours).toBe(true);
    // Sunday noon
    expect(tashkentClock(new Date("2026-11-29T07:00:00Z")).afterHours).toBe(true);
  });
});

import { dailyDue, parseClock } from "@/lib/salesbots/daily";

describe("daily salesbot window", () => {
  it("parses HH:MM", () => {
    expect(parseClock("09:30")).toBe(570);
    expect(parseClock("24:00")).toBe(null);
    expect(parseClock(null)).toBe(null);
  });
  it("is due for an hour after its Tashkent time", () => {
    // 04:00 UTC = 09:00 Tashkent
    expect(dailyDue("09:00", new Date("2026-11-24T04:00:00Z"))).toBe(true);
    expect(dailyDue("09:00", new Date("2026-11-24T04:59:00Z"))).toBe(true);
    expect(dailyDue("09:00", new Date("2026-11-24T05:00:00Z"))).toBe(false);
    expect(dailyDue("09:00", new Date("2026-11-24T03:59:00Z"))).toBe(false);
    // across midnight: 23:30 Tashkent, now 00:10 Tashkent = 19:10 UTC
    expect(dailyDue("23:30", new Date("2026-11-24T19:10:00Z"))).toBe(true);
  });
});
