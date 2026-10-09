// Server-only. Real merge logic for module 4's duplicate-detection flags
// (lead_duplicate_flags) -- every child record that pointed at the loser
// lead is repointed at the survivor before the loser itself is deleted, so
// none of its history (activities, tasks, calls, SMS) is lost.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

export async function mergeLeads(
  organizationId: string,
  survivorLeadId: string,
  loserLeadId: string,
): Promise<MergeLeadsResult> {
  if (survivorLeadId === loserLeadId) {
    throw new Error("Cannot merge a lead into itself.");
  }

  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("organization_id", organizationId)
    .in("id", [survivorLeadId, loserLeadId]);
  if (!leads || leads.length !== 2) {
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

  return { survivorLeadId };
}

/** Marks a duplicate flag as reviewed-and-kept-separate, without merging or deleting anything. */
export async function dismissDuplicateFlag(organizationId: string, flagId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("lead_duplicate_flags")
    .update({ overridden: true })
    .eq("id", flagId)
    .eq("organization_id", organizationId);
  if (error) throw error;
}

const last9 = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-9);

/**
 * Collapses one client's leads within one funnel into the oldest of them --
 * the per-funnel "one client, one lead" rule applied to leads that were
 * created before it existed. Every lead must be in the same funnel with the
 * same phone (last 9 digits); anything else is refused rather than merged.
 */
export async function mergeFunnelGroup(
  organizationId: string,
  leadIds: string[],
): Promise<{ survivorLeadId: string; merged: number }> {
  const ids = [...new Set(leadIds)];
  if (ids.length < 2) throw new Error("Nothing to merge.");
  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select("id, name, funnel, created_at, tags, repeat_count, contact:contacts(phone)")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw error;
  if (!leads || leads.length !== ids.length) {
    throw new Error("Every lead must belong to this organization.");
  }
  const funnelOf = (l: (typeof leads)[number]) => l.funnel || "Direct Sales";
  const phones = new Set(leads.map((l) => last9(l.contact?.phone)));
  const funnels = new Set(leads.map(funnelOf));
  if (phones.size !== 1 || funnels.size !== 1 || [...phones][0]!.length < 7) {
    throw new Error("Leads are not the same client in the same funnel.");
  }
  const sorted = [...leads].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const survivor = sorted[0]!;
  const losers = sorted.slice(1);
  for (const loser of losers) {
    await mergeLeads(organizationId, survivor.id, loser.id);
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
