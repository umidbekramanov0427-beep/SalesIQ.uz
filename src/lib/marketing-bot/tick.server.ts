// Server-only. Every minute (crm.speed-to-lead cron): for each company with
// a marketing bot and linked marketing people, the alerts of its live
// webinars -- went live (with the console), the Telegram live stopped while
// the webinar goes on, the audience fell sharply, a new peak -- and the
// report once a webinar has ended. Each alert is sent once (marketing_bot_log).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { alertOnce, marketingBot, marketingBotOrgs } from "@/lib/marketing-bot/bot.server";
import { webinarTimeline } from "@/lib/marketing-bot/handlers.server";
import { consoleKeyboard, dropAlert, escapeHtml, reportText } from "@/lib/marketing-bot/logic";
import { peaks } from "@/lib/webinar-timeline";

const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/\u00a0/g, " ");

export async function runMarketingBotTick(now = new Date()): Promise<number> {
  const orgs = await marketingBotOrgs();
  if (!orgs.length) return 0;
  const { data: staff } = await supabaseAdmin
    .from("marketing_bot_staff")
    .select("organization_id")
    .in("organization_id", orgs);
  const withStaff = [...new Set((staff ?? []).map((s) => s.organization_id))];
  if (!withStaff.length) return 0;
  const since = new Date(now.getTime() - 3 * 3_600_000).toISOString();
  const { data: webinars } = await supabaseAdmin
    .from("marketing_webinars")
    .select(
      "id, organization_id, title, status, ended_at, youtube_video_id, channel_id, registrations",
    )
    .in("organization_id", withStaff)
    .is("archived_at", null)
    .or(`status.eq.live,ended_at.gte.${since}`)
    .limit(100);
  let sent = 0;
  for (const w of webinars ?? []) {
    const bot = await marketingBot(w.organization_id);
    if (!bot) continue;
    const a = bot.settings.alerts;
    const { points, events } = await webinarTimeline(w.id);
    const title = escapeHtml(w.title);
    if (w.status === "live") {
      if (a.start)
        sent += +(await alertOnce(
          w.organization_id,
          `start:${w.id}`,
          `🔴 <b>Efir boshlandi:</b> ${title}\nBelgilash uchun tugmalar 👇`,
          { inline_keyboard: consoleKeyboard(w.id, events) },
        ));
      const drop = dropAlert(points, a.dropPct);
      if (drop) {
        const bucket = Math.floor(new Date(drop.at).getTime() / 600_000);
        sent += +(await alertOnce(
          w.organization_id,
          `drop:${w.id}:${bucket}`,
          `📉 <b>Auditoriya tushdi</b> — ${title}\n5 daqiqada ${fmt(drop.from)} → ${fmt(drop.to)} (−${drop.pct}%)`,
        ));
      }
      const pk = peaks(points).total;
      if (a.peak && pk && pk.viewers >= 50) {
        const bucket = Math.floor(Math.log(pk.viewers) / Math.log(1.1));
        sent += +(await alertOnce(
          w.organization_id,
          `peak:${w.id}:${bucket}`,
          `⭐ <b>Yangi peak:</b> ${fmt(pk.viewers)} — ${title}`,
        ));
      }
      if (a.tgStop && w.youtube_video_id && w.channel_id) {
        const lastTg = [...points].reverse().find((p) => p.telegram != null);
        const gap = lastTg ? now.getTime() - new Date(lastTg.at).getTime() : 0;
        if (lastTg && gap > 4 * 60_000 && gap < 40 * 60_000)
          sent += +(await alertOnce(
            w.organization_id,
            `tgstop:${w.id}:${lastTg.at}`,
            `⚠️ <b>Telegram efir to'xtadi</b> — ${title}\nYouTube davom etmoqda. Oxirgi Telegram soni: ${fmt(lastTg.telegram ?? 0)}`,
          ));
      }
    } else if (w.status === "ended" && a.report && points.length > 1) {
      sent += +(await alertOnce(
        w.organization_id,
        `report:${w.id}`,
        reportText(w.title, points, events, w.registrations),
      ));
    }
  }
  return sent;
}
