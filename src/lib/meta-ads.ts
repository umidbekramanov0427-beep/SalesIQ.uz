// Meta reklama (Facebook / Instagram): what the Marketing API's campaign
// insights mean for the panel. Pure, shared by the sync and the tests.

/** Approximate rates to so'm (the app's own display rate for USD). */
const UZS_PER: Record<string, number> = { UZS: 1, USD: 12_900, EUR: 14_000, RUB: 140 };

export function toUzs(amount: number, currency: string): number {
  return Math.round(amount * (UZS_PER[currency.toUpperCase()] ?? UZS_PER["USD"]!));
}

const LEAD_ACTIONS = new Set([
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.messaging_conversation_started_7d",
]);

export type InsightRow = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  date_start?: string;
  actions?: { action_type?: string; value?: string }[];
};

export type SpendRow = {
  day: string;
  campaign_id: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
};

/** One row per campaign per day; a lead form fill or a started chat counts as a lead. */
export function parseInsights(rows: InsightRow[]): SpendRow[] {
  const out: SpendRow[] = [];
  for (const r of rows) {
    if (!r.campaign_id || !r.date_start) continue;
    const leads = (r.actions ?? [])
      .filter((a) => a.action_type && LEAD_ACTIONS.has(a.action_type))
      .reduce((s, a) => s + (Number(a.value) || 0), 0);
    out.push({
      day: r.date_start.slice(0, 10),
      campaign_id: r.campaign_id,
      campaign_name: (r.campaign_name ?? "").slice(0, 200),
      spend: Math.round((Number(r.spend) || 0) * 100) / 100,
      impressions: Math.round(Number(r.impressions) || 0),
      clicks: Math.round(Number(r.clicks) || 0),
      leads: Math.round(leads),
    });
  }
  return out;
}

export type MetaCampaign = {
  campaign: string;
  /** So'm. */
  spend: number;
  impressions: number;
  clicks: number;
  /** Leads Meta counted. */
  metaLeads: number;
  /** Leads in the CRM with this campaign (utm_campaign / campaign). */
  crmLeads: number;
  /** Spend per CRM lead (so'm), else per Meta lead. */
  cpl: number | null;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Meta campaigns for a period, joined with the CRM's leads by campaign name. */
export function metaCampaigns(
  rows: (SpendRow & { currency: string })[],
  crmLeadsByCampaign: Map<string, number>,
): MetaCampaign[] {
  const by = new Map<string, MetaCampaign>();
  for (const r of rows) {
    const key = norm(r.campaign_name || r.campaign_id);
    const c = by.get(key) ?? {
      campaign: r.campaign_name || r.campaign_id,
      spend: 0,
      impressions: 0,
      clicks: 0,
      metaLeads: 0,
      crmLeads: 0,
      cpl: null,
    };
    c.spend += toUzs(r.spend, r.currency);
    c.impressions += r.impressions;
    c.clicks += r.clicks;
    c.metaLeads += r.leads;
    by.set(key, c);
  }
  for (const [key, c] of by) {
    c.crmLeads = crmLeadsByCampaign.get(key) ?? 0;
    const n = c.crmLeads || c.metaLeads;
    c.cpl = n ? Math.round(c.spend / n) : null;
  }
  return [...by.values()].sort((a, b) => b.spend - a.spend);
}

export const normCampaign = norm;

/** The source name Meta spend is filed under in the panel. */
export const META_SOURCE = "Meta (Facebook/Instagram)";
