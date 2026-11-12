// Marketing -> Sozlash -> Kuzatuv (org_general_settings.marketing_rules):
// how often a live stream is pictured as proof and how often channels are
// re-read. Unknown or missing values fall back to the defaults, so a
// company that never opened the tab gets the same behaviour as before.

export const SHOT_EVERY_OPTIONS = [1, 2, 3, 5, 10, 15, 30] as const;
export const CHECK_EVERY_OPTIONS = [30, 60, 180, 360] as const;
export const STATS_EVERY_OPTIONS = [3, 6, 12, 24] as const;
export const QUICK_LEAVE_OPTIONS = [1, 24, 72, 168] as const;
export const RANGE_OPTIONS = [7, 30, 90] as const;

export type MarketingRules = {
  shots: {
    /** Take pictures of live streams at all. */
    enabled: boolean;
    /** Minutes between two pictures of one stream. */
    everyMin: number;
    /** YouTube: cut a real frame from the stream (else only the time + viewers card). */
    youtubeFrame: boolean;
  };
  channels: {
    /** Minutes between two subscriber counts. */
    checkEveryMin: number;
    /** Hours between two reads of Telegram's own statistics. */
    statsEveryH: number;
    /** Read the channel's recent actions (joins / leaves) through the account. */
    recentActions: boolean;
    /** Leaving within this many hours of joining counts as "tez chiqib ketdi". */
    quickLeaveH: number;
    /** The period the channel pages open with (days). */
    defaultRange: number;
  };
};

export const DEFAULT_MARKETING_RULES: MarketingRules = {
  shots: { enabled: true, everyMin: 5, youtubeFrame: true },
  channels: {
    checkEveryMin: 60,
    statsEveryH: 6,
    recentActions: true,
    quickLeaveH: 24,
    defaultRange: 30,
  },
};

const pick = (v: unknown, allowed: readonly number[], dflt: number) =>
  typeof v === "number" && allowed.includes(v) ? v : dflt;
const bool = (v: unknown, dflt: boolean) => (typeof v === "boolean" ? v : dflt);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function parseMarketingRules(raw: unknown): MarketingRules {
  const r = obj(raw);
  const s = obj(r["shots"]);
  const c = obj(r["channels"]);
  const d = DEFAULT_MARKETING_RULES;
  return {
    shots: {
      enabled: bool(s["enabled"], d.shots.enabled),
      everyMin: pick(s["everyMin"], SHOT_EVERY_OPTIONS, d.shots.everyMin),
      youtubeFrame: bool(s["youtubeFrame"], d.shots.youtubeFrame),
    },
    channels: {
      checkEveryMin: pick(c["checkEveryMin"], CHECK_EVERY_OPTIONS, d.channels.checkEveryMin),
      statsEveryH: pick(c["statsEveryH"], STATS_EVERY_OPTIONS, d.channels.statsEveryH),
      recentActions: bool(c["recentActions"], d.channels.recentActions),
      quickLeaveH: pick(c["quickLeaveH"], QUICK_LEAVE_OPTIONS, d.channels.quickLeaveH),
      defaultRange: pick(c["defaultRange"], RANGE_OPTIONS, d.channels.defaultRange),
    },
  };
}

/** Whether a stream's next picture is due (a little early, so a minute's cron never skips one). */
export function shotIsDue(last: string | null, now: Date, rules: MarketingRules): boolean {
  if (!rules.shots.enabled) return false;
  if (!last) return true;
  return now.getTime() - Date.parse(last) >= rules.shots.everyMin * 60_000 - 20_000;
}

/** Whether a channel's subscriber count is due again. */
export function channelCheckDue(lastChecked: string | null, now: Date, rules: MarketingRules) {
  if (!lastChecked) return true;
  return (
    now.getTime() - Date.parse(lastChecked) >= rules.channels.checkEveryMin * 60_000 - 5 * 60_000
  );
}
