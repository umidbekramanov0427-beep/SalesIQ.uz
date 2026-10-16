import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadTrialHealth } from "@/lib/platform-insights.server";
import { sendPush } from "@/lib/push/push.server";
import { companyOrigin } from "@/lib/subdomain";
import { nudgeText, pickNudge } from "./trial-nudges";

// Runs from the 5-minute Telegram cron, but only in the first tick of each
// hour from 10:00 to 19:59 Tashkent (it reads every trial company). Each
// nudge is claimed in platform_ops_log first, so it goes out once.

const TZ = 5 * 3_600_000;

export async function runTrialNudges(now = Date.now()): Promise<{ sent: number }> {
  const local = new Date(now + TZ);
  const hour = local.getUTCHours();
  if (hour < 10 || hour >= 20 || local.getUTCMinutes() >= 5) return { sent: 0 };

  const { trials } = await loadTrialHealth();
  if (!trials.length) return { sent: 0 };
  const ids = trials.map((t) => t.org.id);
  const [{ data: owners }, { data: business }, { data: orgs }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, organization_id, telegram_chat_id")
      .in("organization_id", ids)
      .eq("role", "super_admin"),
    supabaseAdmin
      .from("business_profile")
      .select("organization_id, description")
      .in("organization_id", ids),
    supabaseAdmin.from("organizations").select("id, subdomain").in("id", ids),
  ]);
  const { sendTelegramMessage } = await import("@/lib/telegram-report.server");

  let sent = 0;
  for (const t of trials) {
    const own = (owners ?? []).filter((o) => o.organization_id === t.org.id);
    if (!own.length) continue;
    const nudge = pickNudge(
      {
        orgId: t.org.id,
        createdAt: t.org.createdAt,
        daysLeft: t.daysLeft,
        idleDays: t.idleDays,
        lastSeenAt: t.lastSeenAt,
        steps: {
          bot: own.some((o) => !!o.telegram_chat_id),
          team: t.users >= 2,
          lead: t.leads > 0,
          integration: t.integrations.length > 0,
          business: !!(business ?? [])
            .find((b) => b.organization_id === t.org.id)
            ?.description?.trim(),
        },
      },
      now,
    );
    if (!nudge) continue;
    const { error: claimErr } = await supabaseAdmin
      .from("platform_ops_log")
      .insert({ key: nudge.key });
    if (claimErr) continue; // already sent

    const sub = (orgs ?? []).find((o) => o.id === t.org.id) as
      { subdomain?: string | null } | undefined;
    const link = companyOrigin(sub?.subdomain ?? null);
    const text = nudgeText(nudge, t.org.name, link, t.daysLeft);
    for (const o of own) {
      if (!o.telegram_chat_id) continue;
      try {
        await sendTelegramMessage(Number(o.telegram_chat_id), text);
        sent++;
      } catch {
        // Bot blocked: the push below still reaches them.
      }
    }
    await sendPush(
      t.org.id,
      own.map((o) => o.id),
      {
        kind: "trial",
        title: nudge.kind === "ends" ? "Sinov davri tugayapti" : "SalesIQ",
        body: text.split("\n").filter(Boolean).slice(0, 2).join(" "),
        url: nudge.kind === "ends" ? "/billing" : "/",
        tag: `trial-${t.org.id}`,
      },
    ).catch(() => 0);
  }
  return { sent };
}
