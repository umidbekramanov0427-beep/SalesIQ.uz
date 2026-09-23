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
