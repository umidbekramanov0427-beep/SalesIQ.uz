// Server-only. Sends one message to many leads at once, over whichever
// channel is already connected for the org -- reuses every existing
// per-lead send path (SMS/Eskiz, WhatsApp, Telegram, SMTP email) rather
// than duplicating provider logic, so a bulk send behaves identically to
// clicking "send" on each lead one at a time, just looped.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSms } from "./telephony/telephony-data.server";
import { sendWhatsAppToLead } from "./whatsapp/whatsapp-data.server";
import { sendTelegramMessage } from "./telegram-report.server";
import { getSmtpCredentials, logLeadEmail } from "./email/email-data.server";
import { sendSmtpEmail } from "./email/smtp-client.server";

export type BulkMessageChannel = "sms" | "whatsapp" | "telegram" | "email";

export type BulkMessageResult = {
  leadId: string;
  ok: boolean;
  skippedReason?: string;
};

async function contactForLead(
  leadId: string,
): Promise<{ phone: string | null; whatsapp: string | null; email: string | null } | null> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("contact_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead?.contact_id) return null;
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("phone, whatsapp, email")
    .eq("id", lead.contact_id)
    .maybeSingle();
  return contact ?? null;
}

// Sequential, not Promise.all -- a segmented blast to hundreds of leads at
// once would otherwise burst well past Eskiz/WhatsApp/Telegram's own rate
// limits (see amocrm/client.server.ts's own comments on exactly this class
// of problem), and one slow/failing recipient must never take down the
// ones after it in the same run.
export async function sendBulkMessage(
  organizationId: string,
  sentBy: string,
  leadIds: string[],
  channel: BulkMessageChannel,
  payload: { text: string; subject?: string },
): Promise<BulkMessageResult[]> {
  const results: BulkMessageResult[] = [];

  for (const leadId of leadIds) {
    try {
      if (channel === "whatsapp") {
        await sendWhatsAppToLead(organizationId, sentBy, leadId, payload.text);
      } else if (channel === "sms") {
        const contact = await contactForLead(leadId);
        const to = contact?.phone?.trim() || contact?.whatsapp?.trim();
        if (!to) {
          results.push({ leadId, ok: false, skippedReason: "no_phone" });
          continue;
        }
        await sendSms(organizationId, sentBy, to, payload.text, leadId, null);
      } else if (channel === "email") {
        const contact = await contactForLead(leadId);
        const to = contact?.email?.trim();
        if (!to) {
          results.push({ leadId, ok: false, skippedReason: "no_email" });
          continue;
        }
        const creds = await getSmtpCredentials(organizationId);
        if (!creds) {
          results.push({ leadId, ok: false, skippedReason: "smtp_not_connected" });
          continue;
        }
        const subject = payload.subject?.trim() || "SalesIQ";
        try {
          await sendSmtpEmail(creds, { to, subject, body: payload.text });
          await logLeadEmail({
            organizationId,
            leadId,
            toEmail: to,
            subject,
            body: payload.text,
            sentBy,
            error: null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not send the email.";
          await logLeadEmail({
            organizationId,
            leadId,
            toEmail: to,
            subject,
            body: payload.text,
            sentBy,
            error: message,
          });
          throw err;
        }
      } else {
        // Telegram has no "message any number directly" mode -- only a
        // lead whose customer already linked their chat can receive one.
        const { data: link } = await supabaseAdmin
          .from("lead_telegram_links")
          .select("chat_id")
          .eq("lead_id", leadId)
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (!link) {
          results.push({ leadId, ok: false, skippedReason: "no_telegram_link" });
          continue;
        }
        await sendTelegramMessage(link.chat_id, payload.text);
        await supabaseAdmin.from("lead_telegram_messages").insert({
          organization_id: organizationId,
          lead_id: leadId,
          direction: "out",
          text: payload.text,
          sent_by: sentBy,
        });
      }
      results.push({ leadId, ok: true });
    } catch (err) {
      results.push({
        leadId,
        ok: false,
        skippedReason: err instanceof Error ? err.message : "error",
      });
    }
  }

  return results;
}
