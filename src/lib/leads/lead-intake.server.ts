// Server-only. Shared by the incoming-lead webhook (module 6) and the
// public web-form submit route (module 7) -- both need the exact same
// "find-or-create a contact by phone, create the lead, flag a collision"
// behavior, so it lives in one place rather than being duplicated per entry
// point.
import { cleanLeadName, cleanPhone } from "@/lib/leads/intake-clean";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { orgManagers, sendPush } from "@/lib/push/push.server";
import { pickDefaultStage } from "@/lib/leads/default-stage";

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
  /** A free-text message field from the sender (webhook payload or web-form submission), logged as the lead's first note. */
  note?: string | null;
  /** Tags stamped on the new lead, e.g. a web form's own configured tag -- lets leads captured through one form be found by that tag afterward. */
  tags?: string[];
  /** The client's Telegram username (without "@"), when they came through the bot. */
  telegram?: string | null;
};

/** "@name" from a Telegram username, or null. */
export function telegramHandle(username: string | null | undefined): string | null {
  const u = (username ?? "").trim().replace(/^@+/, "");
  return /^[A-Za-z0-9_]{3,64}$/.test(u) ? `@${u}` : null;
}

// Fills the contact's Telegram field when it is still empty -- a manager's
// own entry is never overwritten.
async function rememberTelegram(
  organizationId: string,
  contactId: string | null,
  handle: string | null,
): Promise<void> {
  if (!contactId || !handle) return;
  await supabaseAdmin
    .from("contacts")
    .update({ telegram: handle })
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .or("telegram.is.null,telegram.eq.");
}

/** The lead's contact (creating an empty one if it has none) gets the handle. */
export async function rememberLeadTelegram(
  organizationId: string,
  leadId: string,
  username: string | null | undefined,
): Promise<void> {
  const handle = telegramHandle(username);
  if (!handle) return;
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("contact_id, name")
    .eq("organization_id", organizationId)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;
  if (lead.contact_id) {
    await rememberTelegram(organizationId, lead.contact_id, handle);
    return;
  }
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .insert({ organization_id: organizationId, full_name: lead.name, telegram: handle })
    .select("id")
    .single();
  if (contact)
    await supabaseAdmin
      .from("leads")
      .update({ contact_id: contact.id })
      .eq("organization_id", organizationId)
      .eq("id", leadId);
}

export type LeadIntakeResult = { leadId: string; duplicate: boolean; merged: boolean };

/**
 * Resolves both the stage a new lead lands in AND the pipeline (funnel)
 * name it's stamped with, from the exact same row -- the funnel board
 * (Voronkalar's "AmoCRM" kanban view) groups a lead into a column purely
 * by stage_id, but its own funnel switcher and usePipelineBoardLeadsRaw
 * filter the underlying lead list by the separate `funnel` text column.
 * Resolving them independently let a lead's stage_id point at one
 * pipeline while `funnel` said another (or the column's own default,
 * "Direct Sales") -- exactly why a webhook/web-form-created lead could
 * show up in Gallery (which doesn't care about the mismatch) but never
 * appear on its own kanban board at all.
 */
async function resolveStageAndFunnel(
  organizationId: string,
  explicitStageId: string | null | undefined,
): Promise<{ stageId: string | null; funnel: string | null }> {
  if (explicitStageId) {
    const { data } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id, pipeline_name")
      .eq("organization_id", organizationId)
      .eq("id", explicitStageId)
      .maybeSingle();
    return { stageId: data?.id ?? explicitStageId, funnel: data?.pipeline_name ?? null };
  }
  // The company's own stages (amoCRM/Bitrix24 ones are analytics-only).
  const { data: stages } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, pipeline_name, position, key")
    .eq("organization_id", organizationId)
    .is("amocrm_pipeline_id", null)
    .is("bitrix24_category_id", null);
  const list = stages ?? [];
  const counts: Record<string, number> = {};
  if (!list.some((s) => s.key === "new")) {
    const names = [...new Set(list.map((s) => s.pipeline_name ?? ""))];
    if (names.length > 1) {
      await Promise.all(
        names.map(async (name) => {
          const { count } = await supabaseAdmin
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("funnel", name);
          counts[name] = count ?? 0;
        }),
      );
    }
  }
  const stage = pickDefaultStage(list, counts);
  return { stageId: stage?.id ?? null, funnel: stage?.pipeline_name ?? null };
}

type DedupeSettings = {
  matchPhone: boolean;
  matchName: boolean;
  matchEmail: boolean;
  /** One client = one lead per funnel (org_general_settings.dedupe_funnel_merge). */
  funnelMerge: boolean;
};

/** org_general_settings.dedupe_match_* -- configured from /admin/duplicates' own settings dialog. Phone-only matching is the default every org already had before these were configurable. */
async function getDedupeSettings(organizationId: string): Promise<DedupeSettings> {
  const { data } = await supabaseAdmin
    .from("org_general_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return {
    matchPhone: data?.dedupe_match_phone ?? true,
    matchName: data?.dedupe_match_name ?? false,
    matchEmail: data?.dedupe_match_email ?? false,
    funnelMerge: data?.dedupe_funnel_merge ?? true,
  };
}

/** Checks each enabled criterion in turn (phone, then email, then name) -- the first hit wins, since any one of them matching is enough to call this a duplicate. */
async function findMatchingContact(
  organizationId: string,
  input: { phone: string | null; email: string | null; name: string },
  settings: DedupeSettings,
): Promise<string | null> {
  if (settings.matchPhone && input.phone) {
    // Stored numbers come in every format ("90 123 45 67", "+998901234567"),
    // so the last 9 digits decide; the last 4 narrow the search first.
    const last9 = input.phone.replace(/\D/g, "").slice(-9);
    if (last9.length === 9) {
      const { data } = await supabaseAdmin
        .from("contacts")
        .select("id, phone")
        .eq("organization_id", organizationId)
        .like("phone", `%${last9.slice(-2)}`)
        .limit(500);
      const hit = (data ?? []).find((c) => (c.phone ?? "").replace(/\D/g, "").endsWith(last9));
      if (hit) return hit.id;
    }
  }
  if (settings.matchEmail && input.email) {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("email", input.email)
      .maybeSingle();
    if (data) return data.id;
  }
  if (settings.matchName && input.name.trim()) {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("full_name", input.name.trim())
      .maybeSingle();
    if (data) return data.id;
  }
  return null;
}

/** The client's existing lead in this funnel (last 9 phone digits, or email when the org matches by email), if any. */
export async function findFunnelLead(
  organizationId: string,
  funnel: string | null,
  phone: string | null,
  email: string | null,
): Promise<string | null> {
  if (!phone && !email) return null;
  const { data, error } = await supabaseAdmin.rpc("funnel_lead_for_client", {
    p_org: organizationId,
    p_funnel: funnel,
    p_phone: phone,
    p_email: email,
  });
  if (error) {
    // Until the per-funnel migration is applied the function doesn't exist;
    // the lead is then simply created as before rather than lost.
    console.error("[lead-intake] funnel_lead_for_client failed", error.message);
    return null;
  }
  return data ?? null;
}

export const REPEAT_TAG = "Qayta murojaat";

/**
 * A client registering again into a funnel they're already a lead in: the
 * existing lead stays the only one there -- the new registration becomes a
 * note on it, its tags are added, repeat_count goes up and the owner is told,
 * instead of a second lead landing with another manager.
 */
async function absorbRepeat(
  organizationId: string,
  leadId: string,
  input: LeadIntakeInput,
): Promise<void> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, name, owner_id, tags, repeat_count")
    .eq("id", leadId)
    .single();
  if (!lead) return;
  const count = (lead.repeat_count ?? 0) + 1;
  const tags = [...new Set([...(lead.tags ?? []), ...(input.tags ?? []), REPEAT_TAG])];
  await supabaseAdmin
    .from("leads")
    .update({ repeat_count: count, last_repeat_at: new Date().toISOString(), tags })
    .eq("id", leadId);

  const lines = [
    `🔁 Qayta ro'yxatdan o'tdi (${count + 1}-marta) — ${input.source}`,
    input.name && input.name !== lead.name ? `Ism: ${input.name}` : null,
    input.phone ? `Telefon: ${input.phone}` : null,
    input.email ? `Email: ${input.email}` : null,
    input.campaign ? `Kampaniya: ${input.campaign}` : null,
    input.utm ? `UTM: ${input.utm}` : null,
    input.note?.trim() || null,
  ].filter(Boolean);
  await supabaseAdmin.from("lead_activities").insert({
    organization_id: organizationId,
    lead_id: leadId,
    type: "note",
    content: lines.join("\n"),
  });

  if (lead.owner_id) {
    await supabaseAdmin.from("notifications").insert({
      organization_id: organizationId,
      user_id: lead.owner_id,
      type: "LeadRepeat",
      title: "Mijoz qayta ro'yxatdan o'tdi",
      body: `${lead.name} · ${input.source} · ${count + 1}-marta`,
      link: `/crm/leads/${leadId}`,
    });
  }
  await sendPush(
    organizationId,
    lead.owner_id ? [lead.owner_id] : await orgManagers(organizationId),
    {
      kind: "new_lead",
      title: "🔁 Mijoz qayta ro'yxatdan o'tdi",
      body: `${lead.name} · ${input.source} · ${count + 1}-marta`,
      url: `/crm/leads/${leadId}`,
      tag: `lead:${leadId}`,
    },
  );
}

/**
 * Never silently drops an incoming lead. Within one funnel a client is only
 * ever one lead: registering there again is added to that lead (see
 * absorbRepeat). In any other funnel a new lead is created. When the org
 * has turned per-funnel merging off, an org-wide match is still recorded
 * in lead_duplicate_flags so a rep can merge it later (module 46).
 */
export async function ingestLead(
  organizationId: string,
  input: LeadIntakeInput,
): Promise<LeadIntakeResult> {
  // One phone format, made-up numbers dropped (kept in the first note so
  // nothing is lost), and a message typed into the name field moved out.
  const rawPhone = input.phone?.trim() || null;
  const phone = cleanPhone(rawPhone);
  const email = input.email?.trim() || null;
  const telegram = telegramHandle(input.telegram);
  const cleaned = cleanLeadName(input.name, phone);
  const noteParts = [
    cleaned.movedText,
    rawPhone && !phone ? `⚠️ Noto'g'ri yoki soxta raqam rad etildi: ${rawPhone}` : null,
    input.note?.trim() || null,
  ].filter(Boolean);
  input = { ...input, name: cleaned.name, note: noteParts.length ? noteParts.join("\n\n") : null };
  let matchedContactId: string | null = null;
  let matchedLeadId: string | null = null;

  const dedupeSettings = await getDedupeSettings(organizationId);
  const { stageId, funnel } = await resolveStageAndFunnel(organizationId, input.defaultStageId);

  if (dedupeSettings.funnelMerge) {
    const existing = await findFunnelLead(
      organizationId,
      funnel ?? "Direct Sales",
      phone,
      dedupeSettings.matchEmail ? email : null,
    );
    if (existing) {
      await absorbRepeat(organizationId, existing, { ...input, phone, email });
      if (telegram) await rememberLeadTelegram(organizationId, existing, telegram);
      return { leadId: existing, duplicate: true, merged: true };
    }
  }

  matchedContactId = await findMatchingContact(
    organizationId,
    { phone, email, name: input.name },
    dedupeSettings,
  );
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

  let contactId = matchedContactId;
  if (contactId) await rememberTelegram(organizationId, contactId, telegram);
  if (!contactId && (phone || email || telegram)) {
    const { data: contact, error: contactError } = await supabaseAdmin
      .from("contacts")
      .insert({
        organization_id: organizationId,
        full_name: input.name,
        phone,
        email,
        telegram,
      })
      .select("id")
      .single();
    if (contactError) throw contactError;
    contactId = contact.id;
  }

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
      funnel,
      owner_id: input.defaultOwnerId ?? null,
      priority: "Normal",
      tags: input.tags ?? [],
    })
    .select("id, owner_id")
    .single();
  if (leadError) throw leadError;

  if (input.note?.trim()) {
    await supabaseAdmin.from("lead_activities").insert({
      organization_id: organizationId,
      lead_id: lead.id,
      type: "note",
      content: input.note.trim(),
    });
  }

  // A known client starting in another funnel is intended (one lead per
  // funnel), so it's only flagged for the merge queue when per-funnel
  // merging is off. lead_duplicate_flags.phone is NOT NULL (it started as a
  // phone-only table) -- a match found by name or email is still logged,
  // just without a real phone value.
  const duplicate = !!matchedContactId && !dedupeSettings.funnelMerge;
  if (duplicate) {
    await supabaseAdmin.from("lead_duplicate_flags").insert({
      organization_id: organizationId,
      phone: phone ?? "",
      matched_contact_id: matchedContactId,
      matched_lead_id: matchedLeadId,
      new_lead_id: lead.id,
      source: input.duplicateSource,
    });
  }

  // The owner the lead got (also by the distribution rules), else the
  // company's admins and heads of sales.
  await sendPush(
    organizationId,
    lead.owner_id ? [lead.owner_id] : await orgManagers(organizationId),
    {
      kind: "new_lead",
      title: "🆕 Yangi lid",
      body: [input.name, phone, input.source].filter(Boolean).join(" · "),
      url: `/crm/leads/${lead.id}`,
      tag: `lead:${lead.id}`,
    },
  );

  return { leadId: lead.id, duplicate, merged: false };
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
): {
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  message: string | null;
} {
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
    message: resolve("message", ["message", "comment", "notes"]),
  };
}
