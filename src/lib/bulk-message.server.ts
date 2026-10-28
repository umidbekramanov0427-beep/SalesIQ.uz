// Server-only. Sends one message to many leads at once, over whichever
// channel is already connected for the org -- reuses every existing
// per-lead send path (SMS/Eskiz, Telegram, SMTP email) rather
// than duplicating provider logic, so a bulk send behaves identically to
// clicking "send" on each lead one at a time, just looped.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSms } from "./telephony/telephony-data.server";
import {
  sendTelegramFileAs,
  sendTelegramMessage,
  telegramFileKind,
  type TelegramFile,
  type TelegramFileKind,
} from "./telegram-report.server";
import { insertLeadChatMessage } from "./telegram/lead-chat.server";
import { getSmtpCredentials, logLeadEmail } from "./email/email-data.server";
import { sendSmtpEmail } from "./email/smtp-client.server";

export type BulkMessageChannel = "sms" | "telegram" | "email";

export type BulkMessageResult = {
  leadId: string;
  ok: boolean;
  skippedReason?: string;
};

/**
 * A file sent with the message (Telegram photo/document/audio/video, email
 * attachment); `as` picks how Telegram shows it (voice note, round video, ...).
 */
export type BulkAttachment = {
  name: string;
  type: string;
  data: Uint8Array;
  as?: TelegramFileKind | null;
};

// Telegram allows ~30 messages a second across chats; a few at a time
// keeps a blast quick without hitting it. SMS (Eskiz) and email go one by
// one.
const TELEGRAM_PARALLEL = 6;

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

// Bounded, not Promise.all -- a segmented blast to hundreds of leads at
// once would otherwise burst well past Eskiz/Telegram's own rate
// limits (see amocrm/client.server.ts's own comments on exactly this class
// of problem), and one slow/failing recipient must never take down the
// ones after it in the same run. Telegram goes a few chats at a time once
// the first send has uploaded the files.
export async function sendBulkMessage(
  organizationId: string,
  sentBy: string,
  leadIds: string[],
  channel: BulkMessageChannel,
  payload: { text: string; subject?: string; attachments?: BulkAttachment[] },
): Promise<BulkMessageResult[]> {
  const attachments = payload.attachments ?? [];
  // Telegram: each file is uploaded once, then sent to everyone else by the
  // file_id Telegram gave back.
  const telegramFiles: TelegramFile[] = attachments.map((a) => ({
    kind: a.as ?? telegramFileKind(a.type, a.name),
    name: a.name,
    type: a.type,
    data: a.data,
  }));

  async function sendOne(leadId: string): Promise<BulkMessageResult> {
    try {
      if (channel === "sms") {
        const contact = await contactForLead(organizationId, leadId);
        const to = contact?.phone?.trim();
        if (!to) {
          return { leadId, ok: false, skippedReason: "no_phone" };
        }
        await sendSms(organizationId, sentBy, to, payload.text, leadId, null);
      } else if (channel === "email") {
        const contact = await contactForLead(organizationId, leadId);
        const to = contact?.email?.trim();
        if (!to) {
          return { leadId, ok: false, skippedReason: "no_email" };
        }
        const creds = await getSmtpCredentials(organizationId);
        if (!creds) {
          return { leadId, ok: false, skippedReason: "smtp_not_connected" };
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
          return { leadId, ok: false, skippedReason: "no_telegram_link" };
        }
        const base = {
          organization_id: organizationId,
          lead_id: leadId,
          direction: "out" as const,
          sent_by: sentBy,
        };
        // One file carries the text as its caption; with several, the text
        // goes first and the files follow. Each file is its own chat
        // message, so the lead card shows the photo, video or voice itself.
        const captionOnFile = telegramFiles.length === 1;
        if (payload.text && !captionOnFile) {
          await sendTelegramMessage(link.chat_id, payload.text);
          await insertLeadChatMessage({ ...base, text: payload.text });
        }
        if (telegramFiles.length === 0 && payload.text) {
          await sendTelegramMessage(link.chat_id, payload.text);
          await insertLeadChatMessage({ ...base, text: payload.text });
        }
        for (let i = 0; i < telegramFiles.length; i++) {
          const caption = captionOnFile ? payload.text : "";
          const sent = await sendTelegramFileAs(link.chat_id, telegramFiles[i]!, caption);
          // The next chats get the same file by id, without uploading it again.
          if (sent.fileId) telegramFiles[i] = { kind: sent.kind, fileId: sent.fileId };
          await insertLeadChatMessage({
            ...base,
            text: caption,
            file_kind: sent.kind,
            file_id: sent.fileId,
            file_name: attachments[i]?.name ?? null,
          });
        }
      }
      return { leadId, ok: true };
    } catch (err) {
      return {
        leadId,
        ok: false,
        skippedReason: err instanceof Error ? err.message : "error",
      };
    }
  }

  const results: BulkMessageResult[] = new Array(leadIds.length);
  const parallel = channel === "telegram" ? TELEGRAM_PARALLEL : 1;
  let next = 0;
  // Until one Telegram send has uploaded the files, go one at a time --
  // after that every chat reuses their file_ids.
  while (
    next < leadIds.length &&
    channel === "telegram" &&
    telegramFiles.some((f) => "data" in f)
  ) {
    const i = next++;
    results[i] = await sendOne(leadIds[i]!);
  }
  await Promise.all(
    Array.from({ length: parallel }, async () => {
      while (next < leadIds.length) {
        const i = next++;
        results[i] = await sendOne(leadIds[i]!);
      }
    }),
  );
  return results;
}
