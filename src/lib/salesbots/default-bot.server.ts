// Server-only. The salesbot the platform bot's plain link (t.me/<bot>,
// no ?start= payload) opens -- platform_settings.default_salesbot_id, set
// by the platform owner. null before the column exists or when unset.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getDefaultSalesbotId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select("default_salesbot_id")
    .eq("id", true)
    .maybeSingle();
  if (error) return null;
  return data?.default_salesbot_id ?? null;
}
