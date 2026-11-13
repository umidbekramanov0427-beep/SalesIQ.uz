// Server-only. Real merge logic for module 4's duplicate-detection flags
// (lead_duplicate_flags) -- every child record that pointed at the loser
// lead is repointed at the survivor before the loser itself is deleted, so
// none of its history (activities, tasks, calls, SMS) is lost.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { phoneKey } from "@/lib/phone-key";

// Every table with a plain `lead_id` column that should follow the merged
// lead rather than vanish with it. call_logs/deals aren't wired into any UI
// yet, but repointing them too costs nothing and keeps this list correct if
// they ever are.
const LEAD_ID_TABLES = [
  "lead_activities",
  "tasks",
  "pbx_calls",
  "sms_log",
  "amocrm_calls",
  "training_recommendations",
  "call_logs",
  "deals",
] as const;

export type MergeLeadsResult = { survivorLeadId: string };

export type MergeKind = "manual" | "funnel" | "repeat" | "kept";

/**
 * One line of Dublikatlar tarixi (lead_merge_history). Never fails the
 * merge it describes: until the table exists, or if the write fails, the
 * merge still goes through.
 */
export async function recordMergeHistory(row: {
  organizationId: string;
  kind: MergeKind;
  survivorLeadId: string | null;
  survivorName: string | null;
  mergedLeadId?: string | null;
  mergedName?: string | null;
  phone?: string | null;
  funnel?: string | null;
  source?: string | null;
  actorId?: string | null;
  snapshot?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from("lead_merge_history").insert({
      organization_id: row.organizationId,
      kind: row.kind,
      survivor_lead_id: row.survivorLeadId,
      survivor_name: row.survivorName,
      merged_lead_id: row.mergedLeadId ?? null,
      merged_name: row.mergedName ?? null,
      phone: row.phone ?? null,
      funnel: row.funnel ?? null,
      source: row.source ?? null,
      actor_id: row.actorId ?? null,
      snapshot: (row.snapshot ?? {}) as Json,
    });
  } catch {
    // History is a record of the merge, not part of it.
  }
}

// What the merged-away lead was, kept in the history after it is deleted.
type LeadSnapshot = {
  id: string;
  name: string;
  funnel: string | null;
  phone: string | null;
  snapshot: Record<string, unknown>;
};

async function snapshotLeads(
  organizationId: string,
  ids: string[],
): Promise<Map<string, LeadSnapshot>> {
  const { data } = await supabaseAdmin
    .from("leads")
    .select(
      "id, name, funnel, budget, tags, source, created_at, owner_id, stage_id, contact:contacts(full_name, phone, email)",
    )
    .eq("organization_id", organizationId)
    .in("id", ids);
  const leads = data ?? [];
  const ownerIds = [...new Set(leads.map((l) => l.owner_id).filter((v): v is string => !!v))];
  const stageIds = [...new Set(leads.map((l) => l.stage_id).filter((v): v is string => !!v))];
  const [{ data: owners }, { data: stages }] = await Promise.all([
    ownerIds.length
      ? supabaseAdmin.from("profiles").select("id, full_name").in("id", ownerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    stageIds.length
      ? supabaseAdmin.from("pipeline_stages").select("id, name").in("id", stageIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const ownerName = new Map((owners ?? []).map((o) => [o.id, o.full_name]));
  const stageName = new Map((stages ?? []).map((st) => [st.id, st.name]));
  const out = new Map<string, LeadSnapshot>();
  for (const l of leads) {
    const contact = l.contact;
    out.set(l.id, {
      id: l.id,
      name: l.name,
      funnel: l.funnel,
      phone: contact?.phone ?? null,
      snapshot: {
        name: l.name,
        funnel: l.funnel,
        stage: l.stage_id ? (stageName.get(l.stage_id) ?? null) : null,
        owner: l.owner_id ? (ownerName.get(l.owner_id) ?? null) : null,
        budget: l.budget ?? 0,
        tags: l.tags ?? [],
        source: l.source,
        contact: contact?.full_name ?? null,
        phone: contact?.phone ?? null,
        email: contact?.email ?? null,
        createdAt: l.created_at,
      },
    });
  }
  return out;
}

export async function mergeLeads(
  organizationId: string,
  survivorLeadId: string,
  loserLeadId: string,
  history: { kind: "manual" | "funnel"; actorId: string | null } = {
    kind: "manual",
    actorId: null,
  },
): Promise<MergeLeadsResult> {
  if (survivorLeadId === loserLeadId) {
    throw new Error("Cannot merge a lead into itself.");
  }

  const snaps = await snapshotLeads(organizationId, [survivorLeadId, loserLeadId]);
  if (snaps.size !== 2) {
    throw new Error("Both leads must belong to this organization.");
  }

  for (const table of LEAD_ID_TABLES) {
    const { error } = await supabaseAdmin
      .from(table)
      .update({ lead_id: survivorLeadId })
      .eq("lead_id", loserLeadId);
    if (error) throw error;
  }

  // lead_duplicate_flags names a lead in two different columns depending on
  // which side of the collision it was on -- both need repointing, or a
  // stale row in the merge queue below would reference a lead id that no
  // longer exists once the loser is deleted.
  await supabaseAdmin
    .from("lead_duplicate_flags")
    .update({ matched_lead_id: survivorLeadId })
    .eq("matched_lead_id", loserLeadId);
  await supabaseAdmin
    .from("lead_duplicate_flags")
    .update({ new_lead_id: survivorLeadId })
    .eq("new_lead_id", loserLeadId);
  await supabaseAdmin
    .from("incoming_lead_log")
    .update({ created_lead_id: survivorLeadId })
    .eq("created_lead_id", loserLeadId);
  await supabaseAdmin
    .from("web_form_submissions")
    .update({ created_lead_id: survivorLeadId })
    .eq("created_lead_id", loserLeadId);

  const { error: deleteError } = await supabaseAdmin
    .from("leads")
    .delete()
    .eq("id", loserLeadId)
    .eq("organization_id", organizationId);
  if (deleteError) throw deleteError;

  const survivor = snaps.get(survivorLeadId)!;
  const loser = snaps.get(loserLeadId)!;
  await recordMergeHistory({
    organizationId,
    kind: history.kind,
    survivorLeadId,
    survivorName: survivor.name,
    mergedLeadId: loserLeadId,
    mergedName: loser.name,
    phone: loser.phone ?? survivor.phone,
    funnel: loser.funnel ?? survivor.funnel,
    actorId: history.actorId,
    snapshot: loser.snapshot,
  });
  return { survivorLeadId };
}

/** Marks a duplicate flag as reviewed-and-kept-separate, without merging or deleting anything. */
export async function dismissDuplicateFlag(
  organizationId: string,
  flagId: string,
  actorId: string | null = null,
): Promise<void> {
  const { data: flag, error } = await supabaseAdmin
    .from("lead_duplicate_flags")
    .update({ overridden: true })
    .eq("id", flagId)
    .eq("organization_id", organizationId)
    .select("matched_lead_id, new_lead_id")
    .maybeSingle();
  if (error) throw error;
  const ids = [flag?.matched_lead_id, flag?.new_lead_id].filter((v): v is string => !!v);
  if (ids.length === 2) {
    const snaps = await snapshotLeads(organizationId, ids);
    const a = snaps.get(ids[0]!);
    const b = snaps.get(ids[1]!);
    await recordMergeHistory({
      organizationId,
      kind: "kept",
      survivorLeadId: a?.id ?? null,
      survivorName: a?.name ?? null,
      mergedLeadId: b?.id ?? null,
      mergedName: b?.name ?? null,
      phone: b?.phone ?? a?.phone ?? null,
      funnel: b?.funnel ?? a?.funnel ?? null,
      actorId,
      snapshot: b?.snapshot ?? {},
    });
  }
}

/**
 * Collapses one client's leads within one funnel into the oldest of them --
 * the per-funnel "one client, one lead" rule applied to leads that were
 * created before it existed. Every lead must be in the same funnel with the
 * same phone number; anything else is refused rather than merged.
 */
export async function mergeFunnelGroup(
  organizationId: string,
  leadIds: string[],
  actorId: string | null = null,
): Promise<{ survivorLeadId: string; merged: number }> {
  const ids = [...new Set(leadIds)];
  if (ids.length < 2) throw new Error("Nothing to merge.");
  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select(
      "id, name, funnel, created_at, tags, repeat_count, amocrm_id, bitrix24_deal_id, contact:contacts(phone)",
    )
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw error;
  if (!leads || leads.length !== ids.length) {
    throw new Error("Every lead must belong to this organization.");
  }
  // amoCRM/Bitrix24 leads are synced for analytics only; the CRM never merges them.
  if (leads.some((l) => l.amocrm_id != null || l.bitrix24_deal_id != null)) {
    throw new Error("Leads synced from amoCRM or Bitrix24 are not merged.");
  }
  const funnelOf = (l: (typeof leads)[number]) => l.funnel || "Direct Sales";
  const phones = new Set(leads.map((l) => phoneKey(l.contact?.phone)));
  const funnels = new Set(leads.map(funnelOf));
  if (phones.size !== 1 || funnels.size !== 1 || ![...phones][0]) {
    throw new Error("Leads are not the same client in the same funnel.");
  }
  const sorted = [...leads].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const survivor = sorted[0]!;
  const losers = sorted.slice(1);
  for (const loser of losers) {
    await mergeLeads(organizationId, survivor.id, loser.id, { kind: "funnel", actorId });
  }
  const tags = [...new Set([...sorted.flatMap((l) => l.tags ?? []), "Qayta murojaat"])];
  await supabaseAdmin
    .from("leads")
    .update({
      tags,
      repeat_count: sorted.reduce((sum, l) => sum + (l.repeat_count ?? 0), 0) + losers.length,
      last_repeat_at: losers[losers.length - 1]!.created_at,
    })
    .eq("id", survivor.id);
  await supabaseAdmin.from("lead_activities").insert({
    organization_id: organizationId,
    lead_id: survivor.id,
    type: "note",
    content: `🔁 Dublikatlar birlashtirildi (${funnelOf(survivor)}): ${losers
      .map((l) => l.name)
      .join(", ")}`,
  });
  return { survivorLeadId: survivor.id, merged: losers.length };
}
