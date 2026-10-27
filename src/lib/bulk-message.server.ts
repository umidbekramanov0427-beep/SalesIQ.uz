// Server-only. Sends one message to many leads at once, over whichever
// channel is already connected for the org -- reuses every existing
// per-lead send path (SMS/Eskiz, Telegram, SMTP email) rather
// than duplicating provider logic, so a bulk send behaves identically to
// clicking "send" on each lead one at a time, just looped.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSms } from "./telephony/telephony-data.server";
import {
  sendTelegramFile,
  sendTelegramMessage,
  telegramFileKind,
  type TelegramFile,
} from "./telegram-report.server";
import { getSmtpCredentials, logLeadEmail } from "./email/email-data.server";
import { sendSmtpEmail } from "./email/smtp-client.server";

export type BulkMessageChannel = "sms" | "telegram" | "email";

export type BulkMessageResult = {
  leadId: string;
  ok: boolean;
  skippedReason?: string;
};

/** A file sent with the message (Telegram photo/document/audio, email attachment). */
export type BulkAttachment = { name: string; type: string; data: Uint8Array };

// Always within the sender's own company: the ids come from the browser.
async function contactForLead(
  organizationId: string,
  leadId: string,
): Promise<{ phone: string | null; email: string | null } | null> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("contact_id")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!lead?.contact_id) return null;
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("phone, email")
    .eq("id", lead.contact_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return contact ?? null;
}

// Sequential, not Promise.all -- a segmented blast to hundreds of leads at
// once would otherwise burst well past Eskiz/Telegram's own rate
// limits (see amocrm/client.server.ts's own comments on exactly this class
// of problem), and one slow/failing recipient must never take down the
// ones after it in the same run.
export async function sendBulkMessage(
  organizationId: string,
  sentBy: string,
  leadIds: string[],
  channel: BulkMessageChannel,
  payload: { text: string; subject?: string; attachments?: BulkAttachment[] },
): Promise<BulkMessageResult[]> {
  const results: BulkMessageResult[] = [];
  const attachments = payload.attachments ?? [];
  // Telegram: each file is uploaded once, then sent to everyone else by the
  // file_id Telegram gave back.
  const telegramFiles: TelegramFile[] = attachments.map((a) => ({
    kind: telegramFileKind(a.type, a.name),
    name: a.name,
    type: a.type,
    data: a.data,
  }));

  for (const leadId of leadIds) {
    try {
      if (channel === "sms") {
        const contact = await contactForLead(organizationId, leadId);
        const to = contact?.phone?.trim();
        if (!to) {
          results.push({ leadId, ok: false, skippedReason: "no_phone" });
          continue;
        }
        await sendSms(organizationId, sentBy, to, payload.text, leadId, null);
      } else if (channel === "email") {
        const contact = await contactForLead(organizationId, leadId);
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
          await sendSmtpEmail(creds, {
            to,
            subject,
            body: payload.text,
            ...(attachments.length > 0
              ? {
                  attachments: attachments.map((a) => ({
                    filename: a.name,
                    content: a.data,
                    contentType: a.type,
                  })),
                }
              : {}),
          });
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
        if (telegramFiles.length === 1) {
          // One file: the text rides along as its caption.
          const fileId = await sendTelegramFile(link.chat_id, telegramFiles[0]!, payload.text);
          if (fileId) telegramFiles[0] = { kind: telegramFiles[0]!.kind, fileId };
        } else {
          // Several: the text first, then the files in the order given.
          if (payload.text) await sendTelegramMessage(link.chat_id, payload.text);
          for (let i = 0; i < telegramFiles.length; i++) {
            const fileId = await sendTelegramFile(link.chat_id, telegramFiles[i]!, "");
            if (fileId) telegramFiles[i] = { kind: telegramFiles[i]!.kind, fileId };
          }
        }
        await supabaseAdmin.from("lead_telegram_messages").insert({
          organization_id: organizationId,
          lead_id: leadId,
          direction: "out",
          // The chat history names the files that went out with the text.
          text: [payload.text, ...attachments.map((a) => `📎 ${a.name}`)]
            .filter(Boolean)
            .join("\n"),
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
