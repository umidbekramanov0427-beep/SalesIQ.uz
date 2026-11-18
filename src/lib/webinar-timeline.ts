// Marketing paneli -> Vebinar: one webinar streamed on YouTube and in a
// Telegram live at the same time, read as one timeline. Pure.
//
// - combineSamples: the viewer counts of both sources minute by minute and
//   their sum (a source's last count is carried for a few minutes, so a
//   minute where only one poller has answered yet is not a dip).
// - the stream's events (lesson start, Telegram live on, SMS sent, course
//   presentation, tariffs, timer 1/2/3, Q&A...), numbered when repeated;
// - stageLosses: how many were lost between one event and the next, and
//   the stage that lost the most; smsEffect: the rise after each SMS;
// - the webinar's scenario (planned events by minute) against what happened;
// - pairShots: the YouTube and Telegram pictures taken at the same moment.

export type SourceSample = { at: string; viewers: number; source: string };

export type TimelinePoint = {
  at: string;
  youtube: number | null;
  telegram: number | null;
  manual: number | null;
  total: number;
};

export type EventKind =
  | "lesson"
  | "tg_live_on"
  | "yt_live_on"
  | "sms_sent"
  | "presentation"
  | "price"
  | "timer"
  | "qa"
  | "intro"
  | "offer"
  | "custom";

/** Every kind a mark may have (old marks keep intro/offer). */
export const EVENT_KINDS: EventKind[] = [
  "lesson",
  "tg_live_on",
  "yt_live_on",
  "sms_sent",
  "presentation",
  "price",
  "timer",
  "qa",
  "intro",
  "offer",
  "custom",
];

/** The live console's buttons, in the order a webinar usually goes. */
export const CONSOLE_KINDS: EventKind[] = [
  "lesson",
  "tg_live_on",
  "sms_sent",
  "presentation",
  "price",
  "timer",
  "qa",
  "custom",
];

/** Kinds that happen more than once in a webinar and carry a number. */
export const NUMBERED_KINDS = new Set<EventKind>(["timer", "sms_sent"]);

/** Kinds the server records by itself. */
export const AUTO_KINDS = new Set<EventKind>(["tg_live_on", "yt_live_on", "sms_sent"]);

export const EVENT_COLOR: Record<EventKind, string> = {
  lesson: "#8b5cf6",
  tg_live_on: "#0ea5e9",
  yt_live_on: "#ef4444",
  sms_sent: "#14b8a6",
  presentation: "#6366f1",
  price: "#e11d48",
  timer: "#f59e0b",
  qa: "#10b981",
  intro: "#38bdf8",
  offer: "#f97316",
  custom: "#64748b",
};

export function isEventKind(k: string): k is EventKind {
  return (EVENT_KINDS as string[]).includes(k);
}

export type WebinarEvent = {
  id: string;
  at: string;
  kind: EventKind;
  seq: number | null;
  label: string | null;
  auto?: boolean;
  aiGuess?: boolean;
  confirmed?: boolean;
  meta?: { count?: number | null } | null;
};

const ms = (iso: string) => new Date(iso).getTime();
const minuteOf = (iso: string) => new Date(Math.floor(ms(iso) / 60_000) * 60_000).toISOString();
/** How long a source's last count still stands for it. */
const CARRY_MS = 3 * 60_000;

export function combineSamples(samples: SourceSample[]): TimelinePoint[] {
  const byMinute = new Map<string, { youtube?: number; telegram?: number; manual?: number }>();
  for (const s of [...samples].sort((a, b) => ms(a.at) - ms(b.at))) {
    const key = minuteOf(s.at);
    const row = byMinute.get(key) ?? {};
    const src = s.source === "youtube" || s.source === "telegram" ? s.source : "manual";
    row[src] = s.viewers;
    byMinute.set(key, row);
  }
  const last: Record<"youtube" | "telegram" | "manual", { v: number; t: number } | null> = {
    youtube: null,
    telegram: null,
    manual: null,
  };
  const out: TimelinePoint[] = [];
  for (const [at, row] of [...byMinute.entries()].sort((a, b) => ms(a[0]) - ms(b[0]))) {
    const t = ms(at);
    const pick = (src: "youtube" | "telegram" | "manual") => {
      const v = row[src];
      if (v != null) {
        last[src] = { v, t };
        return v;
      }
      const l = last[src];
      return l && t - l.t <= CARRY_MS ? l.v : null;
    };
    const youtube = pick("youtube");
    const telegram = pick("telegram");
    const manual = pick("manual");
    const auto = youtube != null || telegram != null;
    out.push({
      at,
      youtube,
      telegram,
      manual,
      total: auto ? (youtube ?? 0) + (telegram ?? 0) : (manual ?? 0),
    });
  }
  return out;
}

export type Peak = { viewers: number; at: string } | null;

export function peaks(points: TimelinePoint[]): {
  youtube: Peak;
  telegram: Peak;
  total: Peak;
} {
  const best = (get: (p: TimelinePoint) => number | null): Peak => {
    let b: Peak = null;
    for (const p of points) {
      const v = get(p);
      if (v != null && (b == null || v > b.viewers)) b = { viewers: v, at: p.at };
    }
    return b;
  };
  return {
    youtube: best((p) => p.youtube),
    telegram: best((p) => p.telegram),
    total: best((p) =>
      p.youtube != null || p.telegram != null || p.manual != null ? p.total : null,
    ),
  };
}

/** The total at a moment: the last point at or before it (within 5 minutes), else the nearest. */
export function totalAt(points: TimelinePoint[], iso: string): number | null {
  const t = ms(iso);
  let before: TimelinePoint | null = null;
  let nearest: TimelinePoint | null = null;
  let gap = Infinity;
  for (const p of points) {
    const pt = ms(p.at);
    if (pt <= t + 30_000) before = p;
    const g = Math.abs(pt - t);
    if (g < gap) {
      gap = g;
      nearest = p;
    }
  }
  if (before && t - ms(before.at) <= 5 * 60_000) return before.total;
  return nearest && gap <= 5 * 60_000 ? nearest.total : null;
}

/** The marks that count: confirmed ones (AI guesses wait for a person). */
export function countedEvents(events: WebinarEvent[]): WebinarEvent[] {
  return [...events].filter((e) => e.confirmed !== false).sort((a, b) => ms(a.at) - ms(b.at));
}

/** The next number for a repeated event (timer 3 after timer 2). */
export function nextSeq(events: WebinarEvent[], kind: EventKind): number {
  return events.filter((e) => e.kind === kind).reduce((m, e) => Math.max(m, e.seq ?? 0), 0) + 1;
}

export type StageLoss = {
  from: WebinarEvent;
  /** null = until the end of the stream. */
  to: WebinarEvent | null;
  start: number | null;
  end: number | null;
  /** The lowest count inside the stage. */
  low: number | null;
  change: number | null;
  /** change / start, -0.25 = lost a quarter. */
  pct: number | null;
  minutes: number;
};

export function stageLosses(
  points: TimelinePoint[],
  events: WebinarEvent[],
): { stages: StageLoss[]; worst: StageLoss | null } {
  const evs = countedEvents(events);
  const lastAt = points.length ? points[points.length - 1]!.at : null;
  const stages: StageLoss[] = evs.map((from, i) => {
    const to = evs[i + 1] ?? null;
    const endAt = to?.at ?? lastAt ?? from.at;
    const start = totalAt(points, from.at);
    const end = totalAt(points, endAt);
    const inside = points.filter((p) => ms(p.at) >= ms(from.at) && ms(p.at) <= ms(endAt));
    const low = inside.length ? Math.min(...inside.map((p) => p.total)) : null;
    const change = start != null && end != null ? end - start : null;
    return {
      from,
      to,
      start,
      end,
      low,
      change,
      pct: change != null && start ? change / start : null,
      minutes: Math.max(0, Math.round((ms(endAt) - ms(from.at)) / 60_000)),
    };
  });
  let worst: StageLoss | null = null;
  for (const s of stages) {
    if (s.change != null && s.change < 0 && (worst == null || s.change < (worst.change ?? 0)))
      worst = s;
  }
  return { stages, worst };
}

export type SmsEffect = {
  event: WebinarEvent;
  before: number | null;
  after5: number | null;
  after10: number | null;
  /** after10 (or after5) minus before. */
  delta: number | null;
};

export function smsEffect(points: TimelinePoint[], events: WebinarEvent[]): SmsEffect[] {
  return countedEvents(events)
    .filter((e) => e.kind === "sms_sent")
    .map((event) => {
      const t = ms(event.at);
      const before = totalAt(points, event.at);
      const lastT = points.length ? ms(points[points.length - 1]!.at) : -Infinity;
      const at = (min: number) =>
        t + min * 60_000 <= lastT + 60_000
          ? totalAt(points, new Date(t + min * 60_000).toISOString())
          : null;
      const after5 = at(5);
      const after10 = at(10);
      const later = after10 ?? after5;
      return {
        event,
        before,
        after5,
        after10,
        delta: before != null && later != null ? later - before : null,
      };
    });
}

/* ---- Scenario --------------------------------------------------------- */

export type PlanItem = { kind: EventKind; seq: number | null; minute: number };

/** A stored plan (jsonb) as clean items, sorted by minute. */
export function parsePlan(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const kind = typeof o["kind"] === "string" && isEventKind(o["kind"]) ? o["kind"] : null;
    const minute = Number(o["minute"]);
    if (!kind || !Number.isFinite(minute) || minute < 0 || minute > 24 * 60) continue;
    const seq = o["seq"] == null ? null : Math.max(1, Math.min(50, Math.round(Number(o["seq"]))));
    out.push({ kind, seq: Number.isFinite(seq) ? seq : null, minute: Math.round(minute) });
  }
  return out.sort((a, b) => a.minute - b.minute).slice(0, 60);
}

export type PlanRow = PlanItem & {
  actual: WebinarEvent | null;
  /** Minutes from the start when it really happened. */
  actualMinute: number | null;
  /** actual - planned; + = late. */
  diff: number | null;
};

/**
 * The plan against what happened: each planned event is matched with the
 * real one of the same kind and number, else the next unmatched one of
 * that kind.
 */
export function planVsActual(
  plan: PlanItem[],
  events: WebinarEvent[],
  startIso: string | null,
): PlanRow[] {
  const evs = countedEvents(events);
  const used = new Set<string>();
  const start = startIso ? ms(startIso) : null;
  return plan.map((p) => {
    const same = evs.filter((e) => e.kind === p.kind && !used.has(e.id));
    const actual =
      (p.seq != null ? same.find((e) => e.seq === p.seq) : undefined) ?? same[0] ?? null;
    if (actual) used.add(actual.id);
    const actualMinute =
      actual && start != null ? Math.round((ms(actual.at) - start) / 60_000) : null;
    return {
      ...p,
      actual,
      actualMinute,
      diff: actualMinute != null ? actualMinute - p.minute : null,
    };
  });
}

/* ---- Pictures --------------------------------------------------------- */

export type ShotLike = { id: string; at: string; source: string };

export type ShotPair<T extends ShotLike> = { at: string; youtube: T | null; telegram: T | null };

/**
 * YouTube and Telegram pictures side by side: a Telegram picture taken
 * within 2.5 minutes of a YouTube one is its pair; the rest stand alone.
 * Uploaded (manual) pictures are left out.
 */
export function pairShots<T extends ShotLike>(shots: T[]): ShotPair<T>[] {
  const yt = shots.filter((s) => s.source === "youtube").sort((a, b) => ms(a.at) - ms(b.at));
  const tg = shots.filter((s) => s.source === "telegram").sort((a, b) => ms(a.at) - ms(b.at));
  const used = new Set<string>();
  const pairs: ShotPair<T>[] = yt.map((y) => {
    let best: T | null = null;
    let gap = Infinity;
    for (const t of tg) {
      if (used.has(t.id)) continue;
      const g = Math.abs(ms(t.at) - ms(y.at));
      if (g <= 150_000 && g < gap) {
        gap = g;
        best = t;
      }
    }
    if (best) used.add(best.id);
    return { at: y.at, youtube: y, telegram: best };
  });
  for (const t of tg) if (!used.has(t.id)) pairs.push({ at: t.at, youtube: null, telegram: t });
  return pairs.sort((a, b) => ms(a.at) - ms(b.at));
}
