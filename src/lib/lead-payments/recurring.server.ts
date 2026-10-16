import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPush } from "@/lib/push/push.server";
import { formatSom } from "./paid-stage";
import { clickReady, loadMerchant, paymeReady } from "./merchant.server";
import { payLinkUrl, sendToLeadClient } from "./deliver.server";
import {
  REMIND_AFTER_DAYS,
  inSendingHours,
  nextMonthOn,
  paymentLinkText,
  reminderText,
  tashkentToday,
} from "./recurring";

// Run by the 5-minute Telegram cron. Each due monthly schedule is claimed
// by moving next_run_on forward first (so two overlapping ticks can't both
// send), then gets a new payment link that goes to the client; the lead's
// manager gets a push either way, saying whether the client got it.

const PER_TICK = 30;

async function notifyManager(
  organizationId: string,
  leadId: string,
  title: string,
  body: string,
): Promise<void> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("owner_id, manager_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;
  await sendPush(organizationId, [lead.owner_id, lead.manager_id], {
    kind: "payment",
    title,
    body,
    url: `/crm/leads/${leadId}`,
    tag: `payment-${leadId}`,
  });
}

export async function runRecurringPayments(
  now = Date.now(),
): Promise<{ sent: number; reminded: number }> {
  if (!inSendingHours(now)) return { sent: 0, reminded: 0 };
  const today = tashkentToday(now);
  let sent = 0;
  let reminded = 0;

  const { data: due, error } = await supabaseAdmin
    .from("lead_payment_schedules")
    .select("id, organization_id, lead_id, amount, description, day_of_month, next_run_on")
    .eq("active", true)
    .lte("next_run_on", today)
    .order("next_run_on")
    .limit(PER_TICK);
  // Before its migration has run the table doesn't exist: nothing to do.
  if (!error) {
    for (const s of due ?? []) {
      const next = nextMonthOn(s.day_of_month, s.next_run_on > today ? s.next_run_on : today);
      const { data: claimed } = await supabaseAdmin
        .from("lead_payment_schedules")
        .update({ next_run_on: next, last_run_at: new Date(now).toISOString() })
        .eq("id", s.id)
        .eq("next_run_on", s.next_run_on)
        .select("id");
      if (!claimed?.length) continue;

      const merchant = await loadMerchant(s.organization_id);
      if (!paymeReady(merchant) && !clickReady(merchant)) continue;
      const amount = Number(s.amount);
      const { data: link } = await supabaseAdmin
        .from("lead_payment_links")
        .insert({
          organization_id: s.organization_id,
          lead_id: s.lead_id,
          amount,
          description: s.description,
          schedule_id: s.id,
        })
        .select("id")
        .single();
      if (!link) continue;
      await supabaseAdmin
        .from("lead_payment_schedules")
        .update({ last_link_id: link.id })
        .eq("id", s.id);

      const url = await payLinkUrl(s.organization_id, link.id);
      const channel = await sendToLeadClient(
        s.organization_id,
        s.lead_id,
        paymentLinkText({ amount, description: s.description }, url),
      );
      if (channel) sent++;
      await supabaseAdmin.from("lead_activities").insert({
        organization_id: s.organization_id,
        lead_id: s.lead_id,
        type: "note",
        content: channel
          ? `Oylik to'lov havolasi yuborildi (${channel === "telegram" ? "Telegram" : "Instagram"}): ${formatSom(amount)} so'm`
          : `Oylik to'lov havolasi yaratildi, lekin mijozga yuborib bo'lmadi: ${formatSom(amount)} so'm — ${url}`,
      });
      await notifyManager(
        s.organization_id,
        s.lead_id,
        channel ? "Oylik to'lov havolasi yuborildi" : "Oylik to'lov havolasini mijozga yuboring",
        `${formatSom(amount)} so'm${channel ? "" : " — mijozning chati ulanmagan"}`,
      ).catch(() => undefined);
    }
  }

  // One reminder for a monthly link still unpaid after a few days.
  const cutoff = new Date(now - REMIND_AFTER_DAYS * 86_400_000).toISOString();
  const { data: unpaid, error: unpaidErr } = await supabaseAdmin
    .from("lead_payment_links")
    .select("id, organization_id, lead_id, amount, description")
    .eq("status", "pending")
    .not("schedule_id", "is", null)
    .is("reminded_at", null)
    .lte("created_at", cutoff)
    .gte("created_at", new Date(now - 30 * 86_400_000).toISOString())
    .limit(PER_TICK);
  if (unpaidErr) return { sent, reminded };
  for (const l of unpaid ?? []) {
    const { data: claimed } = await supabaseAdmin
      .from("lead_payment_links")
      .update({ reminded_at: new Date(now).toISOString() })
      .eq("id", l.id)
      .is("reminded_at", null)
      .select("id");
    if (!claimed?.length) continue;
    const amount = Number(l.amount);
    const url = await payLinkUrl(l.organization_id, l.id);
    const channel = await sendToLeadClient(
      l.organization_id,
      l.lead_id,
      reminderText({ amount, description: l.description }, url),
    );
    if (channel) reminded++;
    await notifyManager(
      l.organization_id,
      l.lead_id,
      "To'lov hali kutilmoqda",
      `${formatSom(amount)} so'm ${REMIND_AFTER_DAYS} kundan beri to'lanmagan${channel ? " — mijozga eslatma yuborildi" : ""}`,
    ).catch(() => undefined);
  }
  return { sent, reminded };
}
