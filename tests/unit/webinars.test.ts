import { channelGrowth, parseChannelUsername, parseYoutubeId, webinarStats } from "@/lib/webinars";

describe("webinars", () => {
  it("reads YouTube links", () => {
    expect(parseYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeId("https://youtube.com/live/dQw4w9WgXcQ?feature=share")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(parseYoutubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeId("https://vimeo.com/123")).toBeNull();
  });

  it("reads Telegram channel names", () => {
    expect(parseChannelUsername("@salesiq_uz")).toBe("salesiq_uz");
    expect(parseChannelUsername("https://t.me/salesiq_uz")).toBe("salesiq_uz");
    expect(parseChannelUsername("t.me/salesiq_uz/15")).toBe("salesiq_uz");
    expect(parseChannelUsername("t.me/+AbCdEf")).toBeNull();
  });

  it("finds the peak and the viewers at each mark", () => {
    const at = (m: number) => new Date(Date.UTC(2026, 10, 12, 14, m)).toISOString();
    const s = webinarStats(
      [
        { at: at(0), viewers: 120 },
        { at: at(5), viewers: 340 },
        { at: at(10), viewers: 410 },
        { at: at(40), viewers: 260 },
      ],
      [
        { id: "a", at: at(9), kind: "intro", label: null },
        { id: "b", at: at(41), kind: "price", label: "Kurs narxi" },
        { id: "c", at: at(70), kind: "qa", label: null },
      ],
    );
    expect(s.peak).toEqual({ viewers: 410, at: at(10) });
    expect(s.avg).toBe(283);
    expect(s.minutes).toBe(40);
    expect(s.marks.map((m) => m.viewers)).toEqual([410, 260, null]);
    expect(webinarStats([], []).peak).toBeNull();
  });

  it("counts channel growth by day", () => {
    const g = channelGrowth([
      { day: "2026-11-12", members: 1540 },
      { day: "2026-11-10", members: 1200 },
      { day: "2026-11-11", members: 1290 },
    ]);
    expect(g.days.map((d) => d.delta)).toEqual([null, 90, 250]);
    expect(g.growth).toBe(340);
    expect(g.best?.day).toBe("2026-11-12");
  });
});
