// Server-only. Credentials CRUD + per-lead send/log orchestration for the
// WhatsApp module -- kept separate from whatsapp.server.ts (the actual Meta
// Graph API client) so the "read/write our own tables" half never needs to
// touch WhatsApp's API surface. Mirrors sms-data.server.ts's shape.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppMessage } from "./whatsapp.server";

export type WhatsAppCredentialsStatus = {
  connected: boolean;
  displayPhoneNumber: string | null;
  connectedAt: string | null;
};

export async function getWhatsAppCredentialsStatus(
  organizationId: string,
): Promise<WhatsAppCredentialsStatus> {
  const { data, error } = await supabaseAdmin
    .from("org_whatsapp_credentials")
    .select("phone_number_id, display_phone_number, connected_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return {
    connected: !!data?.phone_number_id,
    displayPhoneNumber: data?.display_phone_number ?? null,
    connectedAt: data?.connected_at ?? null,
  };
}

export async function saveWhatsAppCredentials(
  organizationId: string,
  connectedBy: string,
  input: { phoneNumberId: string; wabaId: string; accessToken: string },
): Promise<void> {
  const { error } = await supabaseAdmin.from("org_whatsapp_credentials").upsert(
    {
      organization_id: organizationId,
      phone_number_id: input.phoneNumberId.trim(),
      waba_id: input.wabaId.trim() || null,
      access_token: input.accessToken.trim(),
      connected_by: connectedBy,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw error;
}

export async function disconnectWhatsApp(organizationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("org_whatsapp_credentials")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw error;
}

// Only the last 9 digits are compared -- tolerates a stored number missing
// its country code (a very common way reps enter numbers) against an
// incoming wa_id that always includes one.
function phoneKey(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  return digits.slice(-9);
}

async function leadDestinationNumber(leadId: string): Promise<string | null> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("contact_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead?.contact_id) return null;
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("whatsapp, phone")
    .eq("id", lead.contact_id)
    .maybeSingle();
  return contact?.whatsapp?.trim() || contact?.phone?.trim() || null;
}

/** Sends a WhatsApp message to the lead's own contact number and logs it, regardless of whether WhatsApp itself accepts it. */
export async function sendWhatsAppToLead(
  organizationId: string,
  sentBy: string,
  leadId: string,
  text: string,
): Promise<{ id: string }> {
  const toNumber = await leadDestinationNumber(leadId);
  if (!toNumber) {
    throw new Error("Bu lidda telefon yoki WhatsApp raqami kiritilmagan.");
  }

  const { waMessageId } = await sendWhatsAppMessage(organizationId, toNumber, text);

  const { data: row, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .insert({
      organization_id: organizationId,
      lead_id: leadId,
      wa_number: toNumber.replace(/[^\d]/g, ""),
      direction: "out",
      text,
      wa_message_id: waMessageId,
      sent_by: sentBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: row.id };
}

/** Matches an inbound wa_id to this org's most recently updated lead sharing that number, if any -- used by the webhook so a customer's reply lands on the right deal instead of just floating unattached. */
export async function findLeadIdForWhatsAppNumber(
  organizationId: string,
  waNumber: string,
): Promise<string | null> {
  const key = phoneKey(waNumber);
  if (!key) return null;

  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, phone, whatsapp")
    .eq("organization_id", organizationId);
  const matchedContactId = (contacts ?? []).find(
    (c) => (c.whatsapp && phoneKey(c.whatsapp) === key) || (c.phone && phoneKey(c.phone) === key),
  )?.id;
  if (!matchedContactId) return null;

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("contact_id", matchedContactId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return lead?.id ?? null;
}

export async function logIncomingWhatsAppMessage(
  organizationId: string,
  waNumber: string,
  text: string,
  waMessageId: string | null,
): Promise<string | null> {
  if (!text.trim()) return null;
  const leadId = await findLeadIdForWhatsAppNumber(organizationId, waNumber);
  const { error } = await supabaseAdmin.from("whatsapp_messages").insert({
    organization_id: organizationId,
    lead_id: leadId,
    wa_number: waNumber.replace(/[^\d]/g, ""),
    direction: "in",
    text,
    wa_message_id: waMessageId,
  });
  if (error) throw error;
  return leadId;
}
