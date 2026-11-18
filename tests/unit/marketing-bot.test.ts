import {
  cleanInviteName,
  consoleKeyboard,
  dropAlert,
  parseBotSettings,
  parseConsoleData,
  peakAlert,
  reportText,
  staffCodeFromStart,
  statusText,
} from "@/lib/marketing-bot/logic";
import { combineSamples, type WebinarEvent } from "@/lib/webinar-timeline";

const W = "a0000000-0000-0000-0000-000000000001";
const at = (m: number) => new Date(Date.UTC(2027, 0, 1, 9, m)).toISOString();

describe("marketing bot", () => {
  it("reads settings with safe defaults", () => {
    const s = parseBotSettings({ alerts: { dropPct: 250, peak: false }, autoApprove: true });
    expect(s.alerts.dropPct).toBe(90);
    expect(s.alerts.peak).toBe(false);
    expect(s.alerts.start).toBe(true);
    expect(s.autoApprove).toBe(true);
    expect(parseBotSettings(null).alerts.dropPct).toBe(15);
  });

  it("links staff and reads console buttons", () => {
    expect(staffCodeFromStart("/start staff_AB12CD34EF")).toBe("AB12CD34EF");
    expect(staffCodeFromStart("/start w_x")).toBeNull();
    expect(parseConsoleData(`ev:${W}:timer`)).toEqual({ webinarId: W, kind: "timer" });
    expect(parseConsoleData(`ev:${W}:custom`)).toBeNull();
    expect(parseConsoleData("ev:bad:timer")).toBeNull();
    const events: WebinarEvent[] = [{ id: "1", at: at(1), kind: "timer", seq: 1, label: null }];
    const kb = consoleKeyboard(W, events).flat();
    expect(kb.find((b) => b.callback_data.endsWith(":timer"))?.text).toBe("Timer 2");
    expect(kb.every((b) => b.callback_data.length <= 64)).toBe(true);
  });

  it("alerts on a sharp drop and on a new peak", () => {
    const pts = combineSamples(
      [400, 410, 420, 390, 330, 300].map((v, i) => ({ at: at(i), viewers: v, source: "youtube" })),
    );
    expect(dropAlert(pts, 15)).toMatchObject({ from: 420, to: 300, pct: 29 });
    expect(dropAlert(pts, 40)).toBeNull();
    expect(dropAlert(pts, 0)).toBeNull();
    expect(peakAlert(pts, null)).toBe(420);
    expect(peakAlert(pts, 400)).toBeNull();
    expect(peakAlert(pts, 300)).toBe(420);
  });

  it("writes the status and the report", () => {
    const pts = combineSamples([
      { at: at(0), viewers: 100, source: "youtube" },
      { at: at(0), viewers: 50, source: "telegram" },
      { at: at(5), viewers: 80, source: "youtube" },
      { at: at(5), viewers: 40, source: "telegram" },
    ]);
    const ev: WebinarEvent[] = [{ id: "a", at: at(0), kind: "price", seq: null, label: null }];
    expect(statusText("Vebinar <1>", pts, ev)).toContain("Vebinar &lt;1&gt;");
    expect(statusText("V", pts, ev)).toContain("Hozir: <b>120</b>");
    const r = reportText("V", pts, ev, 300);
    expect(r).toContain("Eng ko'p: <b>150</b>");
    expect(r).toContain("Ro'yxatdan o'tganlardan keldi: 50%");
    expect(r).toContain("Ta'riflar → efir oxiri: <b>-30</b>");
  });

  it("cleans invite link names", () => {
    expect(cleanInviteName(" meta kuz! ")).toBe("meta_kuz");
    expect(cleanInviteName("!!!")).toBeNull();
    expect(cleanInviteName("x".repeat(50))?.length).toBe(32);
  });
});
