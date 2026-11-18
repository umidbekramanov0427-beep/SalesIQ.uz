// Marketing AI tahlilchi: the figures, worked out from the company's own
// data -- never by the AI. Pure, so they are tested. Money is in so'm.
//
// A period's leads are a cohort: the leads created in the period and what
// became of them (picked up, watched the webinar, qualified, prepaid, paid
// in full, how much money came in). Spend is what was spent in the period.
// Whatever is missing is said, never shown as 0.
import { qualOf, type NotQualReason } from "@/lib/marketing-ai/qual";

export type MLead = {
  createdAt: string;
  campaign: string | null;
  source: string | null;
  phone: string | null;
  answered: number;
  unanswered: number;
  watched: boolean | null;
  qualStatus: "qualified" | "not_qualified" | null;
  notQualReason: NotQualReason | null;
  /** Reached a prepayment (a payment, or the funnel's "advance" stage). */
  advance: boolean;
  /** Paid in full (paid >= deal sum, or the funnel's "sale" stage). */
  full: boolean;
  /** Money really received (lead_payments), so'm. */
  paid: number;
};

export type MSpend = {
  day: string;
  campaign: string | null;
  source: string | null;
  amount: number;
};

export type MWebinar = {
  id: string;
  title: string;
  startsAt: string | null;
  peak: number | null;
  avg: number | null;
  registrations: number | null;
  /** Share lost from the peak to the end (0.3 = 30%). */
  dropFromPeak: number | null;
  worst: { label: string; change: number; pct: number | null } | null;
};

export type MChannel = { title: string; start: number | null; end: number | null };

export type MetricsInput = {
  from: string;
  to: string;
  leads: MLead[];
  spend: MSpend[];
  /** Whether any spend source is connected or typed in at all. */
  spendKnown: boolean;
  webinars: MWebinar[];
  channels: MChannel[];
};

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const per = (money: number, n: number) => (n > 0 && money > 0 ? Math.round(money / n) : null);

/** The campaign a lead is counted under. */
export function campaignKey(l: { campaign: string | null; source: string | null }): string {
  return (l.campaign?.trim() || l.source?.trim() || "—").slice(0, 80);
}
const norm = (s: string) => s.trim().toLowerCase();

export type FunnelCounts = {
  leads: number;
  pickedUp: number;
  watched: number;
  qualified: number;
  notQualified: number;
  pending: number;
  advance: number;
  full: number;
  revenue: number;
  reasons: Record<NotQualReason, number>;
};

export function funnelOf(leads: MLead[]): FunnelCounts {
  const reasons: Record<NotQualReason, number> = {
    wrong_number: 0,
    no_number: 0,
    no_answer: 0,
    no_webinar: 0,
    other: 0,
  };
  const c: FunnelCounts = {
    leads: leads.length,
    pickedUp: 0,
    watched: 0,
    qualified: 0,
    notQualified: 0,
    pending: 0,
    advance: 0,
    full: 0,
    revenue: 0,
    reasons,
  };
  for (const l of leads) {
    if (l.answered > 0) c.pickedUp++;
    if (l.watched) c.watched++;
    const v = qualOf({
      phone: l.phone,
      answeredCalls: l.answered,
      unansweredCalls: l.unanswered,
      watched: l.watched,
      manualStatus: l.qualStatus,
      manualReason: l.notQualReason,
    });
    if (v.status === "qualified") c.qualified++;
    else if (v.status === "not_qualified") {
      c.notQualified++;
      reasons[v.reason ?? "other"]++;
    } else c.pending++;
    if (l.advance || l.full) c.advance++;
    if (l.full) c.full++;
    c.revenue += l.paid;
  }
  return c;
}

export type Efficiency = {
  spend: number | null;
  cpl: number | null;
  cpql: number | null;
  cac: number | null;
  roas: number | null;
  roi: number | null;
};

export function efficiencyOf(f: FunnelCounts, spend: number | null): Efficiency {
  if (spend == null || spend <= 0)
    return { spend: spend ?? null, cpl: null, cpql: null, cac: null, roas: null, roi: null };
  return {
    spend,
    cpl: per(spend, f.leads),
    cpql: per(spend, f.qualified),
    cac: per(spend, f.full),
    roas: Math.round((f.revenue / spend) * 100) / 100,
    roi: Math.round(((f.revenue - spend) / spend) * 100),
  };
}

export type CampaignRow = FunnelCounts & Efficiency & { name: string; qualRate: number | null };

export type Metrics = {
  period: { from: string; to: string };
  basis: { leads: number; webinars: number; spendRows: number; channels: number };
  missing: string[];
  funnel: FunnelCounts;
  rates: {
    pickUp: number | null;
    qual: number | null;
    leadToAdvance: number | null;
    advanceToFull: number | null;
    leadToFull: number | null;
  };
  efficiency: Efficiency;
  audience: {
    subscribers: number | null;
    subscribersDelta: number | null;
    webinars: number;
    registrations: number | null;
    peakAvg: number | null;
    attendance: number | null;
    dropAvg: number | null;
    worst: { webinar: string; label: string; change: number; pct: number | null } | null;
  };
  campaigns: CampaignRow[];
  sources: { name: string; leads: number; qualified: number }[];
};

export function computeMetrics(input: MetricsInput): Metrics {
  const f = funnelOf(input.leads);
  const spendTotal = input.spend.reduce((a, s) => a + s.amount, 0);
  const spend = input.spendKnown ? spendTotal : null;
  const missing: string[] = [];
  if (!input.leads.length) missing.push("leads");
  if (!input.spendKnown) missing.push("spend");
  else if (spendTotal <= 0) missing.push("spend_zero");
  if (!input.leads.some((l) => l.answered > 0 || l.unanswered > 0)) missing.push("calls");
  if (!input.leads.some((l) => l.watched != null)) missing.push("watched");
  if (!input.leads.some((l) => l.paid > 0 || l.advance || l.full)) missing.push("payments");
  if (!input.webinars.length) missing.push("webinars");

  // Campaigns: leads by campaign; spend matched by the same name.
  const byName = new Map<string, MLead[]>();
  for (const l of input.leads) {
    const k = campaignKey(l);
    byName.set(k, [...(byName.get(k) ?? []), l]);
  }
  const spendBy = new Map<string, number>();
  for (const s of input.spend) {
    const k = norm(s.campaign || s.source || "—");
    spendBy.set(k, (spendBy.get(k) ?? 0) + s.amount);
  }
  const campaigns: CampaignRow[] = [...byName.entries()]
    .map(([name, ls]) => {
      const fc = funnelOf(ls);
      const sp = spendBy.get(norm(name)) ?? (input.spendKnown ? 0 : null);
      return { name, ...fc, ...efficiencyOf(fc, sp), qualRate: ratio(fc.qualified, fc.leads) };
    })
    .sort((a, b) => b.leads - a.leads);
  // Spend on campaigns that brought no lead at all.
  for (const [k, amount] of spendBy) {
    if (!campaigns.some((c) => norm(c.name) === k) && amount > 0) {
      const fc = funnelOf([]);
      campaigns.push({ name: k, ...fc, ...efficiencyOf(fc, amount), qualRate: null });
    }
  }

  const sourcesMap = new Map<string, { leads: number; qualified: number }>();
  for (const l of input.leads) {
    const k = l.source?.trim() || "—";
    const row = sourcesMap.get(k) ?? { leads: 0, qualified: 0 };
    row.leads++;
    if (funnelOf([l]).qualified) row.qualified++;
    sourcesMap.set(k, row);
  }

  const ws = input.webinars;
  const withPeak = ws.filter((w) => w.peak != null);
  const regs = ws.reduce((a, w) => a + (w.registrations ?? 0), 0);
  const peakSum = withPeak.reduce((a, w) => a + (w.peak ?? 0), 0);
  const drops = ws.filter((w) => w.dropFromPeak != null).map((w) => w.dropFromPeak!);
  let worst: Metrics["audience"]["worst"] = null;
  for (const w of ws)
    if (w.worst && (worst == null || w.worst.change < worst.change))
      worst = { webinar: w.title, ...w.worst };
  const chStart = input.channels.reduce((a, c) => a + (c.start ?? 0), 0);
  const chEnd = input.channels.reduce((a, c) => a + (c.end ?? 0), 0);
  const chKnown = input.channels.some((c) => c.end != null);

  return {
    period: { from: input.from, to: input.to },
    basis: {
      leads: input.leads.length,
      webinars: ws.length,
      spendRows: input.spend.length,
      channels: input.channels.length,
    },
    missing,
    funnel: f,
    rates: {
      pickUp: ratio(f.pickedUp, f.leads),
      qual: ratio(f.qualified, f.leads),
      leadToAdvance: ratio(f.advance, f.leads),
      advanceToFull: ratio(f.full, f.advance),
      leadToFull: ratio(f.full, f.leads),
    },
    efficiency: efficiencyOf(f, spend),
    audience: {
      subscribers: chKnown ? chEnd : null,
      subscribersDelta:
        chKnown && input.channels.some((c) => c.start != null) ? chEnd - chStart : null,
      webinars: ws.length,
      registrations: regs || null,
      peakAvg: withPeak.length ? Math.round(peakSum / withPeak.length) : null,
      attendance: regs > 0 && withPeak.length ? peakSum / regs : null,
      dropAvg: drops.length ? drops.reduce((a, b) => a + b, 0) / drops.length : null,
      worst,
    },
    campaigns,
    sources: [...sourcesMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.leads - a.leads),
  };
}

/** Change from the previous period: +0.25 = 25% more; null when not comparable. */
export function change(now: number | null, before: number | null): number | null {
  if (now == null || before == null || before === 0) return null;
  return (now - before) / Math.abs(before);
}

/* ---- Alerts the numbers raise by themselves (no AI) -------------------- */

export type Priority = "critical" | "warning" | "opportunity";
export type RuleAlert = {
  key: string;
  priority: Priority;
  /** i18n key + vars for the title and the evidence line. */
  title: string;
  vars: Record<string, string | number>;
  metric: string;
  value: number;
};

const pct = (x: number) => Math.round(x * 100);

export function ruleAlerts(m: Metrics, prev: Metrics | null): RuleAlert[] {
  const out: RuleAlert[] = [];
  const f = m.funnel;
  if (f.leads >= 20 && m.rates.qual != null && m.rates.qual < 0.3)
    out.push({
      key: "low_qual",
      priority: m.rates.qual < 0.15 ? "critical" : "warning",
      title: "ai.alert.lowQual",
      vars: { pct: pct(m.rates.qual), q: f.qualified, n: f.leads },
      metric: "qual_rate",
      value: m.rates.qual,
    });
  const bad = f.reasons.wrong_number + f.reasons.no_number;
  if (f.leads >= 20 && bad / f.leads >= 0.15)
    out.push({
      key: "bad_numbers",
      priority: bad / f.leads >= 0.3 ? "critical" : "warning",
      title: "ai.alert.badNumbers",
      vars: { pct: pct(bad / f.leads), n: bad },
      metric: "bad_number_rate",
      value: bad / f.leads,
    });
  if (
    f.leads >= 20 &&
    m.rates.pickUp != null &&
    m.rates.pickUp < 0.5 &&
    !m.missing.includes("calls")
  )
    out.push({
      key: "low_pickup",
      priority: "warning",
      title: "ai.alert.lowPickup",
      vars: { pct: pct(m.rates.pickUp) },
      metric: "pickup_rate",
      value: m.rates.pickUp,
    });
  if (m.audience.attendance != null && m.audience.attendance < 0.3)
    out.push({
      key: "low_attendance",
      priority: "warning",
      title: "ai.alert.lowAttendance",
      vars: { pct: pct(m.audience.attendance) },
      metric: "attendance",
      value: m.audience.attendance,
    });
  if (m.audience.dropAvg != null && m.audience.dropAvg > 0.35)
    out.push({
      key: "audience_drop",
      priority: "warning",
      title: "ai.alert.audienceDrop",
      vars: { pct: pct(m.audience.dropAvg) },
      metric: "drop_from_peak",
      value: m.audience.dropAvg,
    });
  if (m.efficiency.roas != null && m.efficiency.roas < 1)
    out.push({
      key: "roas_below_1",
      priority: "critical",
      title: "ai.alert.roasLow",
      vars: { roas: m.efficiency.roas },
      metric: "roas",
      value: m.efficiency.roas,
    });
  const cplChange = change(m.efficiency.cpl, prev?.efficiency.cpl ?? null);
  if (cplChange != null && cplChange > 0.25)
    out.push({
      key: "cpl_up",
      priority: "warning",
      title: "ai.alert.cplUp",
      vars: { pct: pct(cplChange) },
      metric: "cpl",
      value: m.efficiency.cpl ?? 0,
    });
  // The best campaign by cost per qualified lead: room to grow.
  const ranked = m.campaigns.filter((c) => c.cpql != null && c.qualified >= 5);
  if (ranked.length >= 2) {
    const best = [...ranked].sort((a, b) => a.cpql! - b.cpql!)[0]!;
    const avg = ranked.reduce((a, c) => a + c.cpql!, 0) / ranked.length;
    if (best.cpql! < avg * 0.7)
      out.push({
        key: `best_campaign:${best.name}`,
        priority: "opportunity",
        title: "ai.alert.bestCampaign",
        vars: { name: best.name, pct: pct(1 - best.cpql! / avg) },
        metric: "cpql",
        value: best.cpql!,
      });
  }
  const order: Record<Priority, number> = { critical: 0, warning: 1, opportunity: 2 };
  return out.sort((a, b) => order[a.priority] - order[b.priority]);
}

/** The value of a tracked metric (for recommendations: before / after). */
export function metricValue(m: Metrics, key: string): number | null {
  switch (key) {
    case "qual_rate":
      return m.rates.qual;
    case "pickup_rate":
      return m.rates.pickUp;
    case "bad_number_rate":
      return m.funnel.leads
        ? (m.funnel.reasons.wrong_number + m.funnel.reasons.no_number) / m.funnel.leads
        : null;
    case "attendance":
      return m.audience.attendance;
    case "drop_from_peak":
      return m.audience.dropAvg;
    case "roas":
      return m.efficiency.roas;
    case "cpl":
      return m.efficiency.cpl;
    case "cpql":
      return m.efficiency.cpql;
    case "cac":
      return m.efficiency.cac;
    case "lead_to_advance":
      return m.rates.leadToAdvance;
    case "advance_to_full":
      return m.rates.advanceToFull;
    case "leads":
      return m.funnel.leads;
    default:
      return null;
  }
}
