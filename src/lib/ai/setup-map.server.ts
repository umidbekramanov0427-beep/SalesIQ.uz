// Server-only. The company's «Sozlash xaritasi» (lib/ai/setup-map.ts): which
// topics are set up, read from the data -- for the AI assistant's prompt and
// the map card in its chat (/account/setup-map).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SetupMapState } from "@/lib/ai/setup-map";

export async function loadSetupMap(orgId: string, botLinked: boolean): Promise<SetupMapState> {
  // A table missing on an older database counts as «not set up».
  const count = async (table: string) => {
    const { count: n, error } = await supabaseAdmin
      .from(table as "salesbots")
      .select("organization_id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    return error ? 0 : (n ?? 0);
  };
  const enabledBots = async () => {
    const { count: n, error } = await supabaseAdmin
      .from("salesbots")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("enabled", true);
    return error ? 0 : (n ?? 0);
  };
  const [
    business,
    people,
    pipelines,
    ownBot,
    salesbots,
    rules,
    phone,
    insta,
    pay,
    amo,
    bitrix,
    leads,
  ] = await Promise.all([
    supabaseAdmin
      .from("business_profile")
      .select("description, products_services")
      .eq("organization_id", orgId)
      .maybeSingle(),
    count("profiles"),
    count("pipelines"),
    count("org_telegram_bots"),
    enabledBots(),
    count("automation_rules"),
    count("org_telephony_credentials"),
    count("instagram_accounts"),
    count("org_payment_merchants"),
    count("amocrm_connection"),
    count("bitrix24_connection"),
    count("leads"),
  ]);
  const products = business.data?.products_services;
  return {
    business:
      !!business.data?.description?.trim() || (Array.isArray(products) && products.length > 0),
    my_telegram: botLinked,
    team: people >= 2,
    funnel: pipelines > 0,
    client_bot: ownBot > 0,
    salesbot: salesbots > 0,
    automation: rules > 0,
    telephony: phone > 0,
    instagram: insta > 0,
    payments: pay > 0,
    crm_import: amo + bitrix > 0,
    first_lead: leads > 0,
  };
}
