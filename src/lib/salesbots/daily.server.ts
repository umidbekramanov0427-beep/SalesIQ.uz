// Server-only. Starts the «Har kuni belgilangan vaqtda» salesbots (trigger
// tg_daily, migration 20270210) for the clients of the company's own
// Telegram bot. Run from the 5-minute /telegram/send-daily-report cron.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { startSalesbot } from "@/lib/automations/engine.server";
import { dailyDue } from "@/lib/salesbots/daily";

const PER_TICK = 150;
const REPEAT_MS = 20 * 60 * 60_000;

export async function runDailySalesbots(now = new Date()): Promise<number> {
  const { data: bots, error } = await supabaseAdmin
    .from("salesbots")
    .select("id, organization_id, trigger_time")
    .eq("enabled", true)
    .eq("trigger", "tg_daily");
  if (error || !bots?.length) return 0; // before the migration: no column
  let sent = 0;
  for (const bot of bots) {
    if (!dailyDue(bot.trigger_time, now)) continue;
    // The clients who talk to the company through its own bot.
    const { data: links } = await supabaseAdmin
      .from("lead_telegram_links")
      .select("lead_id")
      .eq("organization_id", bot.organization_id)
      .eq("via_org_bot", true)
      .limit(5000);
    const leads = [...new Set((links ?? []).map((l) => l.lead_id))];
    if (!leads.length) continue;
    const since = new Date(now.getTime() - REPEAT_MS).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("salesbot_runs")
      .select("lead_id")
      .eq("bot_id", bot.id)
      .gte("started_at", since)
      .limit(10000);
    const done = new Set((recent ?? []).map((r) => r.lead_id));
    let n = 0;
    for (const leadId of leads) {
      if (done.has(leadId)) continue;
      if (n >= PER_TICK) break; // the rest go out on the next ticks of the hour
      const res = await startSalesbot(bot.organization_id, bot.id, leadId).catch(() => null);
      if (res && "runId" in res) n++;
    }
    sent += n;
  }
  return sent;
}
