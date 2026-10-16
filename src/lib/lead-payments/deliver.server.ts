import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { insertLeadChatMessage } from "@/lib/telegram/lead-chat.server";
import { companyOrigin } from "@/lib/subdomain";

// Sends a text to a lead's client without a person at the keyboard (the
// monthly payment links): their Telegram chat when they've linked one,
// else their Instagram conversation. The message lands in the lead's chat
// like any other. Returns the channel used, or null when the client can't
// be reached (no chat, bot blocked, Instagram's 24-hour window closed).

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendToLeadClient(
  organizationId: string,
  leadId: string,
  text: string,
): Promise<"telegram" | "instagram" | null> {
  const { data: tg } = await supabaseAdmin
    .from("lead_telegram_links")
    .select("chat_id")
    .eq("lead_id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (tg) {
    try {
      const { sendTelegramMessage } = await import("@/lib/telegram-report.server");
      await sendTelegramMessage(Number(tg.chat_id), escapeHtml(text));
      await insertLeadChatMessage({
        organization_id: organizationId,
        lead_id: leadId,
        direction: "out",
        text,
        sent_by: null,
      }).catch(() => undefined);
      return "telegram";
    } catch {
      // Blocked or gone: try Instagram below.
    }
  }

  const { data: ig } = await supabaseAdmin
    .from("lead_instagram_links")
    .select("igsid, ig_user_id")
    .eq("lead_id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!ig) return null;
  try {
    const { accountForOrg, sendInstagramText } = await import("@/lib/instagram/instagram.server");
    const account = await accountForOrg(organizationId);
    if (!account || account.ig_user_id !== ig.ig_user_id) return null;
    const mid = await sendInstagramText(account.token, ig.igsid, text);
    await insertLeadChatMessage({
      organization_id: organizationId,
      lead_id: leadId,
      direction: "out",
      text,
      sent_by: null,
      channel: "instagram",
      ext_message_id: mid,
    }).catch(() => undefined);
    return "instagram";
  } catch {
    return null;
  }
}

/** The /pay/<id> address on the company's own address when it has one. */
export async function payLinkUrl(organizationId: string, linkId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("subdomain")
    .eq("id", organizationId)
    .maybeSingle();
  return `${companyOrigin((data as { subdomain?: string | null } | null)?.subdomain ?? null)}/pay/${linkId}`;
}
