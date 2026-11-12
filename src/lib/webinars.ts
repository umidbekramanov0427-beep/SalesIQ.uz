// Marketing paneli -> Vebinarlar va Kanallar: how many watched a live
// webinar minute by minute (YouTube counted automatically, Telegram typed
// in), what the moments the host marked looked like (intro, lesson, price),
// the peak, and how a Telegram channel's subscribers grew day by day. Pure.

export type MarkKind = "intro" | "lesson" | "price" | "offer" | "qa" | "custom";
export const MARK_KINDS: MarkKind[] = ["intro", "lesson", "price", "offer", "qa", "custom"];

export type Sample = { at: string; viewers: number };
export type Mark = { id: string; at: string; kind: MarkKind; label: string | null };

/** The video id from a YouTube link (watch, live, youtu.be, shorts) or a bare id. */
export function parseYoutubeId(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1, 12) || null;
    if (host === "youtube.com" || host === "music.youtube.com") {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/^\/(?:live|shorts|embed)\/([\w-]{11})/);
      if (m) return m[1]!;
    }
  } catch {
    return null;
  }
  return null;
}

/** "@kanal", "t.me/kanal", "https://t.me/kanal" -> "kanal" (public channels). */
export function parseChannelUsername(input: string | null | undefined): string | null {
  const s = (input ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^(t\.me|telegram\.me)\//, "");
  const name = s.replace(/^@/, "").split(/[/?#]/)[0] ?? "";
  return /^[A-Za-z][\w]{3,31}$/.test(name) ? name : null;
}

export type MarkStat = Mark & { viewers: number | null };

export type WebinarStats = {
  peak: { viewers: number; at: string } | null;
  avg: number | null;
  first: number | null;
  last: number | null;
  /** Minutes from the first to the last count. */
  minutes: number;
  marks: MarkStat[];
};

const t = (iso: string) => new Date(iso).getTime();

/** The count closest to a moment (within 10 minutes), for a mark. */
function viewersAt(samples: Sample[], at: string): number | null {
  let best: Sample | null = null;
  let bestGap = Infinity;
  for (const s of samples) {
    const gap = Math.abs(t(s.at) - t(at));
    if (gap < bestGap) {
      best = s;
      bestGap = gap;
    }
  }
  return best && bestGap <= 10 * 60_000 ? best.viewers : null;
}

export function webinarStats(samplesIn: Sample[], marksIn: Mark[]): WebinarStats {
  const samples = [...samplesIn].sort((a, b) => t(a.at) - t(b.at));
  const marks = [...marksIn].sort((a, b) => t(a.at) - t(b.at));
  if (!samples.length) {
    return {
      peak: null,
      avg: null,
      first: null,
      last: null,
      minutes: 0,
      marks: marks.map((m) => ({ ...m, viewers: null })),
    };
  }
  let peak = samples[0]!;
  for (const s of samples) if (s.viewers > peak.viewers) peak = s;
  return {
    peak: { viewers: peak.viewers, at: peak.at },
    avg: Math.round(samples.reduce((a, s) => a + s.viewers, 0) / samples.length),
    first: samples[0]!.viewers,
    last: samples[samples.length - 1]!.viewers,
    minutes: Math.round((t(samples[samples.length - 1]!.at) - t(samples[0]!.at)) / 60_000),
    marks: marks.map((m) => ({ ...m, viewers: viewersAt(samples, m.at) })),
  };
}

export type ChannelDay = { day: string; members: number };
export type GrowthDay = ChannelDay & { delta: number | null };

/** Subscribers by day with the change from the day before. */
export function channelGrowth(daysIn: ChannelDay[]): {
  days: GrowthDay[];
  growth: number;
  best: GrowthDay | null;
} {
  const days = [...daysIn].sort((a, b) => a.day.localeCompare(b.day));
  const out: GrowthDay[] = days.map((d, i) => ({
    ...d,
    delta: i === 0 ? null : d.members - days[i - 1]!.members,
  }));
  const growth = days.length > 1 ? days[days.length - 1]!.members - days[0]!.members : 0;
  const best = out.reduce<GrowthDay | null>(
    (b, d) => (d.delta != null && (b == null || d.delta > (b.delta ?? -Infinity)) ? d : b),
    null,
  );
  return { days: out, growth, best };
}
