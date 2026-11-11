import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_PHONE_RULES, parsePhoneRules, type PhoneRules } from "@/lib/phone-rules";

/**
 * The company's phone rules (Admin -> Telefon raqamlari formati), or
 * Uzbekistan alone -- also until the phone_rules column exists.
 */
export async function getPhoneRules(organizationId: string): Promise<PhoneRules> {
  const { data, error } = await supabaseAdmin
    .from("org_general_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) return DEFAULT_PHONE_RULES;
  return parsePhoneRules((data as { phone_rules?: unknown }).phone_rules);
}
