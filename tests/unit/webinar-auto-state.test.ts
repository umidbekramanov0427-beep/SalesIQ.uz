import {
  canReopen,
  endedAt,
  endsWithTelegram,
  endsWithYoutube,
  reportDue,
  silentTooLong,
  telegramStopped,
  youtubeState,
} from "@/lib/webinar-auto-state";

const now = new Date("2026-11-19T15:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

describe("webinar auto state", () => {
  it("reads YouTube's broadcast state, live also without a viewer count", () => {
    expect(youtubeState(undefined)).toBe("waiting");
    expect(youtubeState({})).toBe("waiting");
    expect(youtubeState({ actualStartTime: ago(5) })).toBe("live");
    expect(youtubeState({ actualStartTime: ago(90), actualEndTime: ago(1) })).toBe("ended");
  });

  it("counts Telegram as stopped only after the grace time", () => {
    expect(telegramStopped(null, now)).toBe(true);
    expect(telegramStopped(ago(1), now)).toBe(false);
    expect(telegramStopped(ago(2), now)).toBe(false);
    expect(telegramStopped(ago(3), now)).toBe(true);
  });

  it("keeps a webinar live while its Telegram stream outlasts YouTube", () => {
    expect(endsWithYoutube({ tracksTelegram: false, lastTelegramAt: null, now })).toBe(true);
    expect(endsWithYoutube({ tracksTelegram: true, lastTelegramAt: ago(1), now })).toBe(false);
    expect(endsWithYoutube({ tracksTelegram: true, lastTelegramAt: ago(10), now })).toBe(true);
    expect(endsWithYoutube({ tracksTelegram: true, lastTelegramAt: null, now })).toBe(true);
  });

  it("leaves a webinar with a running YouTube broadcast to YouTube", () => {
    expect(endsWithTelegram({ youtubeOpen: true, lastTelegramAt: ago(20), now })).toBe(false);
    expect(endsWithTelegram({ youtubeOpen: false, lastTelegramAt: ago(1), now })).toBe(false);
    expect(endsWithTelegram({ youtubeOpen: false, lastTelegramAt: ago(4), now })).toBe(true);
  });

  it("ends at the last sign of life", () => {
    expect(endedAt(null, undefined)).toBeNull();
    expect(endedAt(ago(10), ago(2), null)).toBe(ago(2));
  });

  it("reopens only a webinar that ended a few minutes ago", () => {
    expect(canReopen(null, now)).toBe(false);
    expect(canReopen(ago(4), now)).toBe(true);
    expect(canReopen(ago(10), now)).toBe(true);
    expect(canReopen(ago(11), now)).toBe(false);
  });

  it("closes a live webinar whose streams went silent long ago", () => {
    expect(silentTooLong(null, now)).toBe(false);
    expect(silentTooLong(ago(29), now)).toBe(false);
    expect(silentTooLong(ago(30), now)).toBe(true);
  });

  it("waits a little before the end-of-webinar report", () => {
    expect(reportDue(ago(3), now)).toBe(false);
    expect(reportDue(ago(10), now)).toBe(true);
    expect(reportDue(null, now)).toBe(true);
  });
});
