// Server-only. Shared by the incoming-lead webhook (module 6) and the
// public web-form submit route (module 7) -- both need the exact same
// "find-or-create a contact by phone, create the lead, flag a collision"
// behavior, so it lives in one place rather than being duplicated per entry
// point.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type LeadIntakeInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  companyName?: string | null;
  source: string;
  campaign?: string | null;
  utm?: string | null;
  defaultStageId?: string | null;
  defaultOwnerId?: string | null;
  duplicateSource: "webhook" | "web_form";
};

export type LeadIntakeResult = { leadId: string; duplicate: boolean };

async function resolveDefaultStageId(organizationId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("key", "new")
    .maybeSingle();
  return data?.id ?? null;
}

/** Same phone-match rule the org's own duplicate-detection popup (module 4) uses. */
async function findContactByPhone(organizationId: string, phone: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Never silently drops an incoming lead, even a duplicate one -- it always
 * creates the lead, but a phone match against an existing contact is
 * recorded in lead_duplicate_flags so a rep can merge it later (module 46)
 * instead of the lead vanishing into an already-known contact's history.
 */
export async function ingestLead(
  organizationId: string,
  input: LeadIntakeInput,
): Promise<LeadIntakeResult> {
  const phone = input.phone?.trim() || null;
  let matchedContactId: string | null = null;
  let matchedLeadId: string | null = null;

  if (phone) {
    matchedContactId = await findContactByPhone(organizationId, phone);
    if (matchedContactId) {
      const { data: existingLead } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("contact_id", matchedContactId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      matchedLeadId = existingLead?.id ?? null;
    }
  }

  let contactId = matchedContactId;
  if (!contactId && (phone || input.email?.trim())) {
    const { data: contact, error: contactError } = await supabaseAdmin
      .from("contacts")
      .insert({
        organization_id: organizationId,
        full_name: input.name,
        phone,
        email: input.email?.trim() || null,
      })
      .select("id")
      .single();
    if (contactError) throw contactError;
    contactId = contact.id;
  }

  const stageId = input.defaultStageId ?? (await resolveDefaultStageId(organizationId));

  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .insert({
      organization_id: organizationId,
      name: input.name,
      company_name: input.companyName?.trim() || "",
      contact_id: contactId,
      source: input.source,
      campaign: input.campaign?.trim() || null,
      utm: input.utm?.trim() || null,
      stage_id: stageId,
      owner_id: input.defaultOwnerId ?? null,
      priority: "Normal",
    })
    .select("id")
    .single();
  if (leadError) throw leadError;

  const duplicate = !!matchedContactId;
  if (duplicate && phone) {
    await supabaseAdmin.from("lead_duplicate_flags").insert({
      organization_id: organizationId,
      phone,
      matched_contact_id: matchedContactId,
      matched_lead_id: matchedLeadId,
      new_lead_id: lead.id,
      source: input.duplicateSource,
    });
  }

  return { leadId: lead.id, duplicate };
}

function getByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
      obj,
    );
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

/**
 * Applies a lead_sources.field_mapping config ({ name, phone, email, company
 * -> source key or dot-path }) against an arbitrary incoming JSON payload.
 * Covers the common case of a Zapier/Make/generic webhook posting flat JSON
 * -- a full Meta Graph API OAuth handshake (subscribing a Page, exchanging
 * a token, calling back for field_data) is a separate, much larger piece of
 * infrastructure that isn't built here; "meta_lead_ads" sources still work
 * today via a Zapier/Make bridge posting to this same generic endpoint.
 */
export function mapIncomingLeadPayload(
  payload: Record<string, unknown>,
  fieldMapping: Record<string, unknown>,
): { name: string | null; phone: string | null; email: string | null; company: string | null } {
  const resolve = (target: string, fallbackKeys: string[]): string | null => {
    const mappedPath = fieldMapping[target];
    if (typeof mappedPath === "string" && mappedPath.trim()) {
      const value = asString(getByPath(payload, mappedPath));
      if (value) return value;
    }
    for (const key of fallbackKeys) {
      const value = asString(getByPath(payload, key));
      if (value) return value;
    }
    return null;
  };

  return {
    name: resolve("name", ["name", "full_name", "fullName"]),
    phone: resolve("phone", ["phone", "phone_number", "phoneNumber"]),
    email: resolve("email", ["email"]),
    company: resolve("company", ["company", "company_name", "companyName"]),
  };
}
