// Kanal analitikasi: pure rules behind Marketing -> Kanallar -> a channel.
// Inputs are the channel's days (subscribers each day, joined/left from
// Telegram's own statistics when the company's account can read them) and
// the join/leave events (the platform's bot as a channel admin, or the
// account's "recent actions"). Hours and weekdays are Tashkent time.

export type TgGraph = { x: (number | string)[]; series: Record<string, (number | null)[]> };

export type TgStatsRaw = {
  period?: [number, number] | null;
  followers?: [number, number] | null;
  viewsPerPost?: [number, number] | null;
  sharesPerPost?: [number, number] | null;
  reactionsPerPost?: [number, number] | null;
  notificationsPct?: number | null;
  graphs?: Partial<
    Record<"growth" | "followers" | "mute" | "topHours" | "sources" | "languages", TgGraph | null>
  >;
};

export type StatsDay = {
  day: string;
  members: number | null;
  joined: number | null;
  left: number | null;
};

export type TgStats = {
  days: StatsDay[];
  /** Where new subscribers came from (summed over the statistics' period). */
  sources: { name: string; count: number }[];
  /** Views of posts by hour of the day (0-23). */
  viewHours: number[] | null;
  languages: { name: string; share: number }[];
  notificationsPct: number | null;
  viewsPerPost: number | null;
  sharesPerPost: number | null;
};

const TZ_MS = 5 * 3_600_000;
export const tashkentDay = (ms: number) => new Date(ms + TZ_MS).toISOString().slice(0, 10);
const tashkentHour = (ms: number) => new Date(ms + TZ_MS).getUTCHours();
/** 0 = Monday ... 6 = Sunday. */
const tashkentWeekday = (ms: number) => (new Date(ms + TZ_MS).getUTCDay() + 6) % 7;

const findSeries = (g: TgGraph | null | undefined, re: RegExp) => {
  if (!g) return null;
  const k = Object.keys(g.series).find((n) => re.test(n));
  return k ? g.series[k]! : null;
};
const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((s, v) => s + (v ?? 0), 0);

/** Telegram's statistics (as tg-live returns them) -> days, sources, hours, languages. */
export function parseTgStats(raw: TgStatsRaw | null | undefined): TgStats | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw.graphs ?? {};
  const byDay = new Map<string, StatsDay>();
  const dayOf = (x: number | string) => tashkentDay(Number(x));
  const ensure = (d: string) => {
    let row = byDay.get(d);
    if (!row) {
      row = { day: d, members: null, joined: null, left: null };
      byDay.set(d, row);
    }
    return row;
  };
  const growth = g.growth ? (Object.values(g.growth.series)[0] ?? null) : null;
  g.growth?.x.forEach((x, i) => {
    const v = growth?.[i];
    if (v != null) ensure(dayOf(x)).members = v;
  });
  const joined = findSeries(g.followers, /join/i);
  const left = findSeries(g.followers, /left|leave/i);
  g.followers?.x.forEach((x, i) => {
    const row = ensure(dayOf(x));
    if (joined?.[i] != null) row.joined = joined[i]!;
    if (left?.[i] != null) row.left = Math.abs(left[i]!);
  });
  const sources = g.sources
    ? Object.entries(g.sources.series)
        .map(([name, vals]) => ({ name, count: sum(vals) }))
        .filter((s) => s.count > 0)
        .sort((a, b) => b.count - a.count)
    : [];
  let viewHours: number[] | null = null;
  if (g.topHours) {
    viewHours = Array.from({ length: 24 }, () => 0);
    const vals = Object.values(g.topHours.series)[0] ?? [];
    const xs = g.topHours.x.map(Number);
    const asHours = xs.every((x) => x >= 0 && x < 24);
    xs.forEach((x, i) => {
      const h = asHours ? x : tashkentHour(x);
      viewHours![h] = (viewHours![h] ?? 0) + (vals[i] ?? 0);
    });
  }
  let languages: { name: string; share: number }[] = [];
  if (g.languages) {
    const totals = Object.entries(g.languages.series).map(([name, vals]) => ({
      name,
      n: vals.length ? (vals[vals.length - 1] ?? 0) : 0,
    }));
    const all = sum(totals.map((t) => t.n));
    languages = all
      ? totals
          .map((t) => ({ name: t.name, share: Math.round((t.n / all) * 1000) / 10 }))
          .filter((l) => l.share > 0)
          .sort((a, b) => b.share - a.share)
      : [];
  }
  return {
    days: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    sources,
    viewHours,
    languages,
    notificationsPct: raw.notificationsPct ?? null,
    viewsPerPost: raw.viewsPerPost?.[0] ?? null,
    sharesPerPost: raw.sharesPerPost?.[0] ?? null,
  };
}

export type ChannelEvent = {
  at: string;
  kind: "join" | "leave";
  tg_user_id: number;
  invite_link: string | null;
  invite_name: string | null;
};

export type ChannelDayRow = {
  day: string;
  members: number;
  joined?: number | null;
  left_count?: number | null;
};

export type DayPoint = {
  day: string;
  members: number | null;
  joined: number;
  left: number;
  net: number;
};

export type ChannelAnalytics = {
  days: DayPoint[];
  joined: number;
  left: number;
  net: number;
  /** left / joined, percent. */
  churnPct: number | null;
  membersStart: number | null;
  membersEnd: number | null;
  bestDay: DayPoint | null;
  worstDay: DayPoint | null;
  /** Join / leave events by hour of the day (Tashkent). */
  hours: { joins: number[]; leaves: number[] };
  /** [weekday 0=Mon][hour] */
  heat: { joins: number[][]; leaves: number[][] };
  weekdays: { joins: number[]; leaves: number[] };
  peakJoinHour: number | null;
  peakLeaveHour: number | null;
  bestWeekday: number | null;
  /** Of the people who joined in the period, how soon the ones who left did. */
  quick: {
    joined: number;
    in1h: number;
    in24h: number;
    in7d: number;
    /** Left within the company's "tez chiqib ketdi" limit. */
    inLimit: number;
    stayed: number;
  };
  links: { key: string; name: string | null; link: string | null; joined: number; left: number }[];
  /** Whether the hours/weekdays come from real events (else they are empty). */
  hasEvents: boolean;
  eventsFrom: string | null;
};

const zeros = (n: number) => Array.from({ length: n }, () => 0);
const peak = (xs: number[]) => {
  let best = -1;
  let at: number | null = null;
  xs.forEach((v, i) => {
    if (v > best && v > 0) {
      best = v;
      at = i;
    }
  });
  return at;
};

/**
 * The channel's analytics for days [from, to] ("YYYY-MM-DD", Tashkent):
 * joined / left per day (Telegram's statistics where present, else counted
 * events, else the day-to-day change of the subscriber count), when people
 * join and leave, how soon newcomers leave, and which invite links bring
 * people who stay.
 */
export function channelAnalytics(input: {
  from: string;
  to: string;
  days: ChannelDayRow[];
  events: ChannelEvent[];
  stats: TgStats | null;
  /** Hours after joining that still count as leaving quickly (24 by default). */
  quickLeaveH?: number;
}): ChannelAnalytics {
  const quickMs = (input.quickLeaveH ?? 24) * 3_600_000;
  const { from, to } = input;
  const inRange = (d: string) => d >= from && d <= to;
  const events = input.events
    .filter((e) => inRange(tashkentDay(Date.parse(e.at))))
    .sort((a, b) => a.at.localeCompare(b.at));

  // Per day: counted events.
  const evDay = new Map<string, { j: number; l: number }>();
  for (const e of events) {
    const d = tashkentDay(Date.parse(e.at));
    const row = evDay.get(d) ?? { j: 0, l: 0 };
    if (e.kind === "join") row.j++;
    else row.l++;
    evDay.set(d, row);
  }
  const statsDay = new Map((input.stats?.days ?? []).map((d) => [d.day, d]));
  const rows = new Map(input.days.map((d) => [d.day, d]));
  const allDays = [
    ...new Set([...rows.keys(), ...statsDay.keys(), ...evDay.keys()].filter(inRange)),
  ].sort();

  const days: DayPoint[] = [];
  let prevMembers: number | null = null;
  // The day before the period, for the first day's change.
  const before = [...rows.values(), ...(input.stats?.days ?? [])]
    .filter((d) => d.day < from && d.members != null)
    .sort((a, b) => b.day.localeCompare(a.day))[0];
  prevMembers = before?.members ?? null;
  for (const day of allDays) {
    const r = rows.get(day);
    const s = statsDay.get(day);
    const ev = evDay.get(day);
    const members = r?.members ?? s?.members ?? null;
    let joined: number;
    let left: number;
    if (r && (r.joined != null || r.left_count != null)) {
      joined = r.joined ?? 0;
      left = r.left_count ?? 0;
    } else if (s && (s.joined != null || s.left != null)) {
      joined = s.joined ?? 0;
      left = s.left ?? 0;
    } else if (ev) {
      joined = ev.j;
      left = ev.l;
    } else if (members != null && prevMembers != null) {
      // Only the counts are known: the change, as joined or left.
      const d = members - prevMembers;
      joined = Math.max(0, d);
      left = Math.max(0, -d);
    } else {
      joined = 0;
      left = 0;
    }
    days.push({ day, members, joined, left, net: joined - left });
    if (members != null) prevMembers = members;
  }

  const joined = sum(days.map((d) => d.joined));
  const left = sum(days.map((d) => d.left));
  const withMembers = days.filter((d) => d.members != null);
  const active = days.filter((d) => d.joined || d.left);

  const hours = { joins: zeros(24), leaves: zeros(24) };
  const heat = {
    joins: Array.from({ length: 7 }, () => zeros(24)),
    leaves: Array.from({ length: 7 }, () => zeros(24)),
  };
  const weekdays = { joins: zeros(7), leaves: zeros(7) };
  const joinedAt = new Map<number, number>();
  const quick = { joined: 0, in1h: 0, in24h: 0, in7d: 0, inLimit: 0, stayed: 0 };
  const links = new Map<
    string,
    { key: string; name: string | null; link: string | null; joined: number; left: number }
  >();
  const linkOf = new Map<number, string>();
  for (const e of events) {
    const ms = Date.parse(e.at);
    const h = tashkentHour(ms);
    const w = tashkentWeekday(ms);
    const side = e.kind === "join" ? "joins" : "leaves";
    hours[side][h]!++;
    heat[side][w]![h]!++;
    weekdays[side][w]!++;
    if (e.kind === "join") {
      joinedAt.set(e.tg_user_id, ms);
      const key = e.invite_link ?? (e.invite_name ? `name:${e.invite_name}` : "direct");
      linkOf.set(e.tg_user_id, key);
      const row = links.get(key) ?? {
        key,
        name: e.invite_name,
        link: e.invite_link,
        joined: 0,
        left: 0,
      };
      row.joined++;
      links.set(key, row);
    } else {
      const since = joinedAt.get(e.tg_user_id);
      if (since != null) {
        const after = ms - since;
        if (after <= 3_600_000) quick.in1h++;
        if (after <= 86_400_000) quick.in24h++;
        if (after <= 7 * 86_400_000) quick.in7d++;
        if (after <= quickMs) quick.inLimit++;
        joinedAt.delete(e.tg_user_id);
        const key = linkOf.get(e.tg_user_id);
        const row = key ? links.get(key) : undefined;
        if (row) row.left++;
      }
    }
  }
  quick.joined = sum(hours.joins);
  quick.stayed = joinedAt.size;

  return {
    days,
    joined,
    left,
    net: joined - left,
    churnPct: joined ? Math.round((left / joined) * 1000) / 10 : null,
    membersStart: withMembers[0]?.members ?? null,
    membersEnd: withMembers[withMembers.length - 1]?.members ?? null,
    bestDay: active.length ? active.reduce((b, d) => (d.joined > b.joined ? d : b)) : null,
    worstDay: active.length ? active.reduce((b, d) => (d.left > b.left ? d : b)) : null,
    hours,
    heat,
    weekdays,
    peakJoinHour: peak(hours.joins),
    peakLeaveHour: peak(hours.leaves),
    bestWeekday: peak(weekdays.joins),
    quick,
    links: [...links.values()].sort((a, b) => b.joined - a.joined),
    hasEvents: events.length > 0,
    eventsFrom: events[0]?.at ?? null,
  };
}
