// Marketing -> Sayt: the website counter. A company puts one line on its
// site (public/siq.js with its key); every page view is counted with a
// random visitor id, the page, the referrer and UTM tags, and a form with a
// phone on the site becomes a lead. Pure rules here; the endpoints are
// /t/visit and /t/lead, the figures /marketing-api/site.

export const KEY_RE = /^[A-Za-z0-9]{16,40}$/;
export const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const clip = (v: unknown, n: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null;

export type VisitIn = {
  key: string;
  visitorId: string;
  sessionId: string | null;
  path: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  device: "mobile" | "desktop" | "tablet" | null;
};

/** A page view as the snippet sends it; null when it is not one. */
export function parseVisit(body: unknown): VisitIn | null {
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const key = clip(o["k"], 40);
  const vid = clip(o["v"], 64);
  if (!key || !KEY_RE.test(key) || !vid || !ID_RE.test(vid)) return null;
  const sid = clip(o["s"], 64);
  let path: string | null = null;
  try {
    const u = new URL(String(o["u"] ?? ""));
    path = u.pathname.slice(0, 300) || "/";
  } catch {
    path = clip(o["u"], 300);
  }
  let referrer: string | null = null;
  try {
    const r = clip(o["r"], 500);
    referrer = r ? new URL(r).hostname.replace(/^www\./, "").slice(0, 120) : null;
  } catch {
    referrer = null;
  }
  const d = o["d"];
  return {
    key,
    visitorId: vid,
    sessionId: sid && ID_RE.test(sid) ? sid : null,
    path,
    referrer,
    utmSource: clip(o["us"], 120),
    utmMedium: clip(o["um"], 120),
    utmCampaign: clip(o["uc"], 160),
    device: d === "mobile" || d === "desktop" || d === "tablet" ? d : null,
  };
}

/** Where a visit came from, for the report: UTM source, else the referrer site, else direct. */
export function visitSource(v: { utm_source: string | null; referrer: string | null }): string {
  return v.utm_source?.trim() || v.referrer?.trim() || "direct";
}

export type SiteVisitRow = {
  at: string;
  visitor_id: string;
  session_id: string | null;
  utm_source: string | null;
  referrer: string | null;
  path: string | null;
  lead_id: string | null;
};

export type SiteStats = {
  visits: number;
  visitors: number;
  sessions: number;
  leads: number;
  /** Visitors who left a phone ÷ visitors, percent. */
  conversionPct: number | null;
  days: { day: string; visits: number; visitors: number; leads: number }[];
  sources: { name: string; visitors: number; leads: number }[];
  pages: { path: string; visits: number }[];
};

const day = (iso: string) => new Date(Date.parse(iso) + 5 * 3_600_000).toISOString().slice(0, 10);

/** The figures for the marketing panel from the period's page views. */
export function siteStats(rows: SiteVisitRow[]): SiteStats {
  const visitors = new Set<string>();
  const sessions = new Set<string>();
  const leadVisitors = new Set<string>();
  const leadIds = new Set<string>();
  const byDay = new Map<string, { visits: number; v: Set<string>; l: Set<string> }>();
  // A visitor's source is where they first came from in the period.
  const firstSource = new Map<string, string>();
  const pages = new Map<string, number>();
  for (const r of [...rows].sort((a, b) => a.at.localeCompare(b.at))) {
    visitors.add(r.visitor_id);
    sessions.add(r.session_id ?? `${r.visitor_id}:${day(r.at)}`);
    if (r.lead_id) {
      leadVisitors.add(r.visitor_id);
      leadIds.add(r.lead_id);
    }
    if (!firstSource.has(r.visitor_id)) firstSource.set(r.visitor_id, visitSource(r));
    const d = byDay.get(day(r.at)) ?? { visits: 0, v: new Set(), l: new Set() };
    d.visits++;
    d.v.add(r.visitor_id);
    if (r.lead_id) d.l.add(r.lead_id);
    byDay.set(day(r.at), d);
    if (r.path) pages.set(r.path, (pages.get(r.path) ?? 0) + 1);
  }
  const src = new Map<string, { visitors: number; leads: number }>();
  for (const [vid, s] of firstSource) {
    const x = src.get(s) ?? { visitors: 0, leads: 0 };
    x.visitors++;
    if (leadVisitors.has(vid)) x.leads++;
    src.set(s, x);
  }
  return {
    visits: rows.length,
    visitors: visitors.size,
    sessions: sessions.size,
    leads: leadIds.size,
    conversionPct: visitors.size
      ? Math.round((leadVisitors.size / visitors.size) * 1000) / 10
      : null,
    days: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, x]) => ({ day: d, visits: x.visits, visitors: x.v.size, leads: x.l.size })),
    sources: [...src.entries()]
      .map(([name, x]) => ({ name, ...x }))
      .sort((a, b) => b.visitors - a.visitors),
    pages: [...pages.entries()]
      .map(([path, visits]) => ({ path, visits }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 50),
  };
}

/** The line a company puts on its site. */
export function snippet(origin: string, key: string): string {
  return `<script async src="${origin}/siq.js" data-key="${key}"></script>`;
}
