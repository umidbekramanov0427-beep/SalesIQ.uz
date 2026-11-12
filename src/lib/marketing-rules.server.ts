// Server-only: each company's Marketing -> Kuzatuv settings, the defaults
// when they were never set (or before the migration added the column).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DEFAULT_MARKETING_RULES,
  parseMarketingRules,
  type MarketingRules,
} from "@/lib/marketing-rules";

export async function marketingRulesFor(orgIds: string[]): Promise<Map<string, MarketingRules>> {
  const out = new Map<string, MarketingRules>();
  const ids = [...new Set(orgIds)];
  if (!ids.length) return out;
  const { data, error } = await supabaseAdmin
    .from("org_general_settings")
    .select("organization_id, marketing_rules")
    .in("organization_id", ids);
  if (!error) {
    for (const r of (data ?? []) as { organization_id: string; marketing_rules?: unknown }[]) {
      out.set(r.organization_id, parseMarketingRules(r.marketing_rules));
    }
  }
  return out;
}

export const rulesOf = (m: Map<string, MarketingRules>, orgId: string) =>
  m.get(orgId) ?? DEFAULT_MARKETING_RULES;

/** Saves the company's settings (only the known keys, normalized). */
export async function saveMarketingRules(orgId: string, userId: string, raw: unknown) {
  const rules = parseMarketingRules(raw);
  const { error } = await supabaseAdmin
    .from("org_general_settings")
    .upsert(
      { organization_id: orgId, marketing_rules: rules, updated_by: userId },
      { onConflict: "organization_id" },
    );
  if (error) throw error;
  return rules;
}
