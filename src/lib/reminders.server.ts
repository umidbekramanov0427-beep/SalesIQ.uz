// Server-only. The every-minute reminder pass (from /crm/speed-to-lead):
// each due reminder is claimed (sent_at), told to its person -- bell,
// push, Telegram -- and a repeating one moves on to its next time. Rules
// in src/lib/reminders.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPush } from "@/lib/push/push.server";
import { sendTelegramMessage } from "@/lib/telegram-report.server";
import { nextOccurrence, type ReminderRepeat } from "@/lib/reminders";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function runReminders(now = new Date()): Promise<{ sent: number }> {
  const nowIso = now.toISOString();
  const { data, error } = await supabaseAdmin
    .from("reminders")
    .select(
      "id, organization_id, profile_id, created_by, lead_id, text, remind_at, repeat, sent_at",
    )
    .is("done_at", null)
    .lte("remind_at", nowIso)
    .limit(500);
  if (error) {
    // Before migration 20261231000000 the table is missing: nothing to do.
    if (/reminders|does not exist|schema cache/i.test(error.message)) return { sent: 0 };
    throw error;
  }
  let sent = 0;
  for (const r of data ?? []) {
    // Already told about this time (a one-off stays until marked done).
    if (r.sent_at && r.sent_at >= r.remind_at) continue;
    const next = nextOccurrence(r.remind_at, r.repeat as ReminderRepeat, now.getTime());
    // Claim first, so two overlapping runs can't send it twice.
    let claim = supabaseAdmin
      .from("reminders")
      .update({ sent_at: nowIso, ...(next ? { remind_at: next.toISOString() } : {}) })
      .eq("id", r.id)
      .eq("remind_at", r.remind_at);
    claim = r.sent_at ? claim.eq("sent_at", r.sent_at) : claim.is("sent_at", null);
    const { data: claimed } = await claim.select("id");
    if (!claimed?.length) continue;
    sent++;

    const link = r.lead_id ? `/crm/leads/${r.lead_id}` : "/reminders";
    let from = "";
    if (r.created_by && r.created_by !== r.profile_id) {
      const { data: author } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", r.created_by)
        .maybeSingle();
      if (author?.full_name) from = ` (${author.full_name})`;
    }
    const title = `⏰ Eslatma${from}`;
    await supabaseAdmin.from("notifications").insert({
      organization_id: r.organization_id,
      user_id: r.profile_id,
      type: "Reminder",
      title,
      body: r.text,
      link,
    });
    await sendPush(r.organization_id, [r.profile_id], {
      kind: "reminder",
      title,
      body: r.text,
      url: link,
      tag: `reminder:${r.id}`,
    });
    const { data: person } = await supabaseAdmin
      .from("profiles")
      .select("telegram_chat_id")
      .eq("id", r.profile_id)
      .maybeSingle();
    if (person?.telegram_chat_id) {
      await sendTelegramMessage(
        person.telegram_chat_id,
        `<b>${esc(title)}</b>\n${esc(r.text)}`,
      ).catch((err) => console.error("[reminders] telegram", err));
    }
  }
  return { sent };
}
