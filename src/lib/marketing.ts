// Marketing paneli (marketing.salesiq.uz): who may use it, and the figures
// it shows -- leads, sales and AI lead quality by source and by campaign.
// Pure, so the server endpoint, the pages and the tests agree. Spend and
// cost per lead come from finance.ts (marketingBySource).

import type { FRange, FinEntry, MonthPoint, SourceRow } from "@/lib/finance";

type Who = { role: string | null | undefined; marketingAccess?: boolean } | null | undefined;

/** Admins, marketologs and anyone the admin let in. */
export function canUseMarketing(user: Who): boolean {
  if (!user) return false;
  return (
    user.role === "super_admin" ||
    user.role === "platform_owner" ||
    user.role === "marketolog" ||
    user.marketingAccess === true
  );
}

/** A marketolog works only in the marketing panel. */
export function canUseCrm(user: Who): boolean {
  return !!user && user.role !== "marketolog";
}

export type Temperature = "VeryHot" | "Hot" | "Warm" | "Cold";

export type QLead = {
  source: string | null;
  campaign: string | null;
  utm: unknown;
  created_at: string;
  stage_changed_at: string | null;
  budget: number | null;
  won: boolean;
  lost: boolean;
  /** AI / rules score 0-100; null until the lead was scored. */
  score: number | null;
  temperature: Temperature | null;
};

const inRange = (iso: string | null | undefined, r: FRange) => !!iso && iso >= r.from && iso < r.to;

/** The campaign a lead came from: its own field, else utm_campaign. */
export function campaignOf(l: Pick<QLead, "campaign" | "utm">): string | null {
  const own = l.campaign?.trim();
  if (own) return own;
  if (l.utm && typeof l.utm === "object" && !Array.isArray(l.utm)) {
    const c = (l.utm as Record<string, unknown>)["utm_campaign"];
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export type QualityRow = {
  key: string | null;
  leads: number;
  /** Of the leads, how many have a score yet. */
  scored: number;
  avgScore: number | null;
  hot: number;
  warm: number;
  cold: number;
  /** Leads that reached a sale in the period, of those that came in it. */
  won: number;
  lost: number;
  /** won / leads, percent. */
  conversion: number;
  revenue: number;
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/**
 * Leads that came in the period grouped by source or campaign: how good
 * they were (AI score, hot/warm/cold) and how many turned into sales.
 */
export function qualityBy(
  leads: QLead[],
  r: FRange,
  keyOf: (l: QLead) => string | null,
): { rows: QualityRow[]; total: QualityRow } {
  const map = new Map<string | null, QualityRow & { sum: number }>();
  const blank = (key: string | null) => ({
    key,
    leads: 0,
    scored: 0,
    avgScore: null,
    hot: 0,
    warm: 0,
    cold: 0,
    won: 0,
    lost: 0,
    conversion: 0,
    revenue: 0,
    sum: 0,
  });
  const total = blank(null);
  for (const l of leads) {
    if (!inRange(l.created_at, r)) continue;
    const k = keyOf(l)?.trim() || null;
    let x = map.get(k);
    if (!x) {
      x = blank(k);
      map.set(k, x);
    }
    for (const t of [x, total]) {
      t.leads += 1;
      if (l.score != null) {
        t.scored += 1;
        t.sum += l.score;
      }
      if (l.temperature === "VeryHot" || l.temperature === "Hot") t.hot += 1;
      else if (l.temperature === "Warm") t.warm += 1;
      else if (l.temperature === "Cold") t.cold += 1;
      if (l.won) {
        t.won += 1;
        t.revenue += Number(l.budget) || 0;
      } else if (l.lost) t.lost += 1;
    }
  }
  const done = ({ sum, ...x }: QualityRow & { sum: number }): QualityRow => ({
    ...x,
    avgScore: x.scored ? Math.round(sum / x.scored) : null,
    conversion: pct(x.won, x.leads),
  });
  return {
    rows: [...map.values()].map(done).sort((a, b) => b.leads - a.leads),
    total: done(total),
  };
}

export type DayPoint = { day: string; leads: number; hot: number };

/** New leads per Tashkent day of the period (for the overview chart). */
export function leadsByDay(leads: QLead[], r: FRange): DayPoint[] {
  const DAY = 86_400_000;
  const start = new Date(r.from).getTime();
  const end = new Date(r.to).getTime();
  const days: DayPoint[] = [];
  for (let t = start; t < end && days.length < 400; t += DAY) {
    days.push({ day: new Date(t + 5 * 3_600_000).toISOString().slice(0, 10), leads: 0, hot: 0 });
  }
  const idx = new Map(days.map((d, i) => [d.day, i]));
  for (const l of leads) {
    if (!inRange(l.created_at, r)) continue;
    const i = idx.get(
      new Date(new Date(l.created_at).getTime() + 5 * 3_600_000).toISOString().slice(0, 10),
    );
    if (i == null) continue;
    days[i]!.leads += 1;
    if (l.temperature === "VeryHot" || l.temperature === "Hot") days[i]!.hot += 1;
  }
  return days;
}

export type MarketingData = {
  sources: { rows: SourceRow[]; total: SourceRow };
  quality: { rows: QualityRow[]; total: QualityRow };
  campaigns: { rows: QualityRow[]; total: QualityRow };
  days: DayPoint[];
  months: MonthPoint[];
  spend: FinEntry[];
  sourceNames: string[];
  funnelNames: string[];
  campaignNames: string[];
  truncated: boolean;
};
