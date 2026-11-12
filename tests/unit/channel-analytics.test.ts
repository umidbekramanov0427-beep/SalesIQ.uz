import { channelAnalytics, parseTgStats, type ChannelEvent } from "@/lib/channel-analytics";
import {
  DEFAULT_MARKETING_RULES,
  channelCheckDue,
  parseMarketingRules,
  shotIsDue,
} from "@/lib/marketing-rules";
import { chatMemberKind } from "@/lib/channel-events.server";

const ev = (at: string, kind: "join" | "leave", user: number, link: string | null = null) =>
  ({ at, kind, tg_user_id: user, invite_link: link, invite_name: null }) as ChannelEvent;

describe("channelAnalytics", () => {
  it("prefers the stored counts, then events, then the member change", () => {
    const a = channelAnalytics({
      from: "2026-11-10",
      to: "2026-11-12",
      days: [
        { day: "2026-11-09", members: 100 },
        { day: "2026-11-10", members: 104, joined: 6, left_count: 2 },
        { day: "2026-11-11", members: 101 },
        { day: "2026-11-12", members: 103 },
      ],
      events: [ev("2026-11-12T05:00:00Z", "join", 1), ev("2026-11-12T06:00:00Z", "join", 2)],
      stats: null,
    });
    expect(a.days.map((d) => [d.joined, d.left])).toEqual([
      [6, 2],
      [0, 3],
      [2, 0],
    ]);
    expect(a.joined).toBe(8);
    expect(a.left).toBe(5);
    expect(a.net).toBe(3);
    expect(a.churnPct).toBe(62.5);
    expect(a.membersStart).toBe(104);
    expect(a.membersEnd).toBe(103);
  });

  it("finds the hours, weekdays, quick leavers and links (Tashkent time)", () => {
    const a = channelAnalytics({
      from: "2026-11-09",
      to: "2026-11-15",
      days: [],
      // 2026-11-09 is a Monday; 15:00Z = 20:00 Tashkent.
      events: [
        ev("2026-11-09T15:00:00Z", "join", 1, "https://t.me/+ads"),
        ev("2026-11-09T15:20:00Z", "join", 2, "https://t.me/+ads"),
        ev("2026-11-09T15:40:00Z", "leave", 1),
        ev("2026-11-10T04:00:00Z", "join", 3),
        ev("2026-11-12T04:00:00Z", "leave", 3),
      ],
      stats: null,
      quickLeaveH: 1,
    });
    expect(a.peakJoinHour).toBe(20);
    expect(a.hours.joins[20]).toBe(2);
    expect(a.heat.joins[0]![20]).toBe(2);
    expect(a.bestWeekday).toBe(0);
    expect(a.quick).toEqual({ joined: 3, in1h: 1, in24h: 1, in7d: 2, inLimit: 1, stayed: 1 });
    expect(a.links[0]).toMatchObject({ link: "https://t.me/+ads", joined: 2, left: 1 });
    expect(a.links[1]).toMatchObject({ key: "direct", joined: 1, left: 1 });
  });
});

describe("parseTgStats", () => {
  it("reads Telegram's graphs into days, sources and hours", () => {
    const day = Date.parse("2026-11-10T00:00:00Z");
    const s = parseTgStats({
      followers: [23501, 23400],
      notificationsPct: 41.5,
      graphs: {
        growth: { x: [day, day + 86_400_000], series: { "Total followers": [23400, 23501] } },
        followers: { x: [day, day + 86_400_000], series: { Joined: [150, 160], Left: [-40, 59] } },
        sources: { x: [day], series: { URL: [90], Search: [20], Ads: [0] } },
        topHours: { x: [0, 1, 20], series: { Views: [5, 2, 99] } },
      },
    });
    expect(s!.days).toEqual([
      { day: "2026-11-10", members: 23400, joined: 150, left: 40 },
      { day: "2026-11-11", members: 23501, joined: 160, left: 59 },
    ]);
    expect(s!.sources).toEqual([
      { name: "URL", count: 90 },
      { name: "Search", count: 20 },
    ]);
    expect(s!.viewHours![20]).toBe(99);
    expect(s!.notificationsPct).toBe(41.5);
    expect(parseTgStats(null)).toBeNull();
  });
});

describe("marketing rules", () => {
  it("keeps only the offered values", () => {
    const r = parseMarketingRules({
      shots: { everyMin: 10, enabled: "yes" },
      channels: { statsEveryH: 7 },
    });
    expect(r.shots.everyMin).toBe(10);
    expect(r.shots.enabled).toBe(true);
    expect(r.channels.statsEveryH).toBe(DEFAULT_MARKETING_RULES.channels.statsEveryH);
    expect(parseMarketingRules(null)).toEqual(DEFAULT_MARKETING_RULES);
  });

  it("says when a picture and a channel count are due", () => {
    const now = new Date("2026-11-12T10:00:00Z");
    const r = parseMarketingRules({ shots: { everyMin: 10 }, channels: { checkEveryMin: 180 } });
    expect(shotIsDue(null, now, r)).toBe(true);
    expect(shotIsDue("2026-11-12T09:55:00Z", now, r)).toBe(false);
    expect(shotIsDue("2026-11-12T09:50:10Z", now, r)).toBe(true);
    expect(shotIsDue(null, now, parseMarketingRules({ shots: { enabled: false } }))).toBe(false);
    expect(channelCheckDue("2026-11-12T08:00:00Z", now, r)).toBe(false);
    expect(channelCheckDue("2026-11-12T07:00:00Z", now, r)).toBe(true);
  });
});

describe("chatMemberKind", () => {
  it("tells a join from a leave", () => {
    expect(
      chatMemberKind({
        old_chat_member: { status: "left" },
        new_chat_member: { status: "member" },
      }),
    ).toBe("join");
    expect(
      chatMemberKind({
        old_chat_member: { status: "member" },
        new_chat_member: { status: "kicked" },
      }),
    ).toBe("leave");
    expect(
      chatMemberKind({
        old_chat_member: { status: "member" },
        new_chat_member: { status: "administrator" },
      }),
    ).toBeNull();
  });
});
