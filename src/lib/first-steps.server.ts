// Server-only. Which of the "Birinchi qadamlar" a company has done
// (src/lib/first-steps.ts): read by the home page's checklist
// (/account/first-steps) and by the AI assistant, so it can name the next step.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { FirstStepsState } from "@/lib/first-steps";

export async function loadFirstSteps(
  orgId: string,
  botLinked: boolean,
): Promise<{ steps: FirstStepsState; createdAt: string | null; ownBot: boolean | null }> {
  const one = (table: string) =>
    supabaseAdmin
      .from(table as "amocrm_connection")
      .select("organization_id", { count: "exact", head: true })
      .eq("organization_id", orgId);
  const [org, people, leads, business, ownBot, ...integrations] = await Promise.all([
    supabaseAdmin.from("organizations").select("created_at").eq("id", orgId).maybeSingle(),
    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabaseAdmin
      .from("business_profile")
      .select("description, products_services")
      .eq("organization_id", orgId)
      .maybeSingle(),
    one("org_telegram_bots"),
    one("amocrm_connection"),
    one("bitrix24_connection"),
    one("org_telephony_credentials"),
    one("instagram_accounts"),
  ]);
  const products = business.data?.products_services;
  return {
    steps: {
      bot: botLinked,
      team: (people.count ?? 0) >= 2,
      lead: (leads.count ?? 0) > 0,
      integration: integrations.some((r) => (r.count ?? 0) > 0),
      business:
        !!business.data?.description?.trim() || (Array.isArray(products) && products.length > 0),
    },
    createdAt: org.data?.created_at ?? null,
    // null = the table isn't there yet (before its migration).
    ownBot: ownBot.error ? null : (ownBot.count ?? 0) > 0,
  };
}
