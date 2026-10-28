// Server-only. The every-minute speed-to-lead check: fresh CRM leads nobody
// has called or written to yet. At 5 minutes the lead's manager is
// reminded (bell, push, Telegram); at 15 the head of sales hears too. Each
// level is said once (leads.speed_alert_level), and the first contact is
// stamped on the lead (leads.first_contact_at) so the funnel card's timer
// stops. The rules themselves are in speed-to-lead.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { orgManagers, sendPush } from "@/lib/push/push.server";
import { sendTelegramMessage } from "@/lib/telegram-report.server";
import { alertDue, ESCALATE_MINUTES, WATCH_HOURS, WARN_MINUTES } from "@/lib/speed-to-lead";

type Candidate = {
  id: string;
  organization_id: string;
  name: string;
  owner_id: string | null;
  created_at: string;
  speed_alert_level: number;
  stage: { is_won: boolean; is_lost: boolean } | null;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The first time each lead was called (any call) or written to by a person, if ever. */
async function firstContacts(leadIds: string[]): Promise<Map<string, string>> {
  const first = new Map<string, string>();
  const note = (leadId: string | null, at: string | null) => {
    if (!leadId || !at) return;
    const prev = first.get(leadId);
    if (!prev || at < prev) first.set(leadId, at);
  };
  const [pbx, calls, messages] = await Promise.all([
    supabaseAdmin.from("pbx_calls").select("lead_id, created_at").in("lead_id", leadIds),
    supabaseAdmin.from("amocrm_calls").select("lead_id, occurred_at").in("lead_id", leadIds),
    // Written by a person (sent_by set): the bot's automatic greeting is not contact.
    supabaseAdmin
      .from("lead_telegram_messages")
      .select("lead_id, created_at")
      .in("lead_id", leadIds)
      .eq("direction", "out")
      .not("sent_by", "is", null),
  ]);
  for (const r of pbx.data ?? []) note(r.lead_id, r.created_at);
  for (const r of calls.data ?? []) note(r.lead_id, r.occurred_at);
  for (const r of messages.data ?? []) note(r.lead_id, r.created_at);
  return first;
}

async function telegramChats(profileIds: string[]): Promise<number[]> {
  if (profileIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("telegram_chat_id")
    .in("id", profileIds)
    .not("telegram_chat_id", "is", null);
  return (data ?? []).map((p) => p.telegram_chat_id).filter((c): c is number => c != null);
}

/** Who hears about a lead at each level: the manager, then their head of sales. */
async function recipients(
  organizationId: string,
  ownerId: string | null,
  level: 1 | 2,
): Promise<string[]> {
  if (!ownerId) return orgManagers(organizationId);
  if (level === 1) return [ownerId];
  const { data: owner } = await supabaseAdmin
    .from("profiles")
    .select("manager_id")
    .eq("id", ownerId)
    .maybeSingle();
  const heads = owner?.manager_id ? [owner.manager_id] : await orgManagers(organizationId);
  return [...new Set([ownerId, ...heads])];
}

export async function runSpeedToLead(
  now = new Date(),
): Promise<{ checked: number; alerts: number }> {
  const since = new Date(now.getTime() - WATCH_HOURS * 3_600_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select(
      "id, organization_id, name, owner_id, created_at, speed_alert_level, stage:pipeline_stages(is_won, is_lost)",
    )
    // The platform's own leads only: amoCRM/Bitrix24 leads are analytics.
    .is("amocrm_id", null)
    .is("bitrix24_deal_id", null)
    .is("first_contact_at", null)
    .lt("speed_alert_level", 2)
    .gte("created_at", since)
    .limit(1000);
  if (error) {
    // Before migration 20261207000000 the columns are missing: nothing to do.
    if (/column|does not exist/i.test(error.message)) return { checked: 0, alerts: 0 };
    throw error;
  }
  const leads = (data ?? []) as unknown as Candidate[];
  if (leads.length === 0) return { checked: 0, alerts: 0 };

  const contacted = await firstContacts(leads.map((l) => l.id));
  let alerts = 0;
  for (const lead of leads) {
    const firstAt = contacted.get(lead.id);
    if (firstAt && firstAt >= lead.created_at) {
      await supabaseAdmin.from("leads").update({ first_contact_at: firstAt }).eq("id", lead.id);
      continue;
    }
    const level = alertDue(
      {
        createdAt: new Date(lead.created_at),
        contacted: false,
        closed: !!(lead.stage?.is_won || lead.stage?.is_lost),
        alertedLevel: lead.speed_alert_level,
      },
      now,
    );
    if (!level) continue;

    // Claim the level first, so a slow send can't make two runs say it twice.
    const { data: claimed } = await supabaseAdmin
      .from("leads")
      .update({ speed_alert_level: level })
      .eq("id", lead.id)
      .lt("speed_alert_level", level)
      .select("id");
    if (!claimed?.length) continue;
    alerts++;

    const minutes = Math.floor((now.getTime() - new Date(lead.created_at).getTime()) / 60_000);
    const to = await recipients(lead.organization_id, lead.owner_id, level === 2 ? 2 : 1);
    const title =
      level === 2
        ? `🚨 ${minutes} daqiqadan beri javobsiz lid`
        : `⏱ Yangi lidga qo'ng'iroq qiling (${minutes} daq)`;
    const body =
      level === 2
        ? `${lead.name}: ${ESCALATE_MINUTES} daqiqadan oshdi, hali hech kim qo'ng'iroq qilmadi va yozmadi.`
        : `${lead.name}: ${WARN_MINUTES} daqiqa o'tdi. Tezroq bog'laning — birinchi daqiqalar sotuvni hal qiladi.`;
    const link = `/crm/leads/${lead.id}?from=funnels`;

    await supabaseAdmin.from("notifications").insert(
      to.map((userId) => ({
        organization_id: lead.organization_id,
        user_id: userId,
        type: "SpeedToLead",
        title,
        body,
        link,
      })),
    );
    await sendPush(lead.organization_id, to, {
      kind: "new_lead",
      title,
      body,
      url: link,
      tag: `speed:${lead.id}`,
    });
    for (const chat of await telegramChats(to)) {
      await sendTelegramMessage(chat, `<b>${esc(title)}</b>\n${esc(body)}`).catch((err) =>
        console.error("[speed-to-lead] telegram", err),
      );
    }
  }
  return { checked: leads.length, alerts };
}
