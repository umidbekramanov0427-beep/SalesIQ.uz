import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { followupText, inWorkingHours, renderFollowup } from "@/lib/followups";
import { insertLeadChatMessage } from "@/lib/telegram/lead-chat.server";

// Automatic follow-up (org_followup_settings): run by the 5-minute Telegram
// cron. Each due lead (followup_candidates: the company wrote last and the
// client has been silent long enough) gets the company's reminder in its
// Telegram chat, inside the company's working hours; the message shows in
// the lead's chat and timeline and is counted in lead_followups.

const PER_TICK = 40;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Candidate = {
  organization_id: string;
  lead_id: string;
  chat_id: number;
  lead_name: string | null;
  attempts: number;
};

export async function runFollowUps(now = Date.now()): Promise<{ sent: number; failed: number }> {
  const { data, error } = await supabaseAdmin.rpc("followup_candidates", { p_limit: PER_TICK });
  // Before its migration has run the function doesn't exist: nothing to do.
  if (error || !data?.length) return { sent: 0, failed: 0 };
  const candidates = data as Candidate[];

  const orgIds = [...new Set(candidates.map((c) => c.organization_id))];
  const { data: settingsRows } = await supabaseAdmin
    .from("org_followup_settings")
    .select("organization_id, message, second_message, work_start, work_end, max_attempts")
    .in("organization_id", orgIds);
  const settings = new Map((settingsRows ?? []).map((s) => [s.organization_id, s]));
  const { sendTelegramMessage } = await import("@/lib/telegram-report.server");

  let sent = 0;
  let failed = 0;
  for (const c of candidates) {
    const s = settings.get(c.organization_id);
    if (!s || !inWorkingHours(now, s.work_start, s.work_end)) continue;
    const attempt = c.attempts + 1;
    const text = renderFollowup(followupText(s, attempt), c.lead_name);
    if (!text) continue;
    try {
      await sendTelegramMessage(Number(c.chat_id), escapeHtml(text));
    } catch {
      // The client blocked the bot or the chat is gone: count it, so the
      // lead isn't retried every 5 minutes, and move on.
      failed++;
      await supabaseAdmin.from("lead_followups").insert({
        organization_id: c.organization_id,
        lead_id: c.lead_id,
        attempt: s.max_attempts,
        message: `[yuborilmadi] ${text}`,
      });
      continue;
    }
    sent++;
    await Promise.all([
      insertLeadChatMessage({
        organization_id: c.organization_id,
        lead_id: c.lead_id,
        direction: "out",
        text,
        sent_by: null,
      }).catch(() => undefined),
      supabaseAdmin.from("lead_followups").insert({
        organization_id: c.organization_id,
        lead_id: c.lead_id,
        attempt,
        message: text,
      }),
      supabaseAdmin.from("lead_activities").insert({
        organization_id: c.organization_id,
        lead_id: c.lead_id,
        type: "note",
        content: `Avtomatik eslatma yuborildi (${attempt}/${s.max_attempts}): ${text}`,
      }),
    ]);
  }
  return { sent, failed };
}

/** The client wrote: the follow-ups waiting for an answer count as answered. */
export async function markFollowupsReplied(leadId: string): Promise<void> {
  await supabaseAdmin
    .from("lead_followups")
    .update({ replied_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .is("replied_at", null)
    .gte("sent_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
}
