// Server-only. Lidlar savati: a lead a person deletes is copied into
// `leads_trash` by a database trigger (migration 20261223000000) together
// with its tasks, notes, chat, files and payments. Admin → Savat lists the
// entries, restores them (restore_trashed_lead puts every row back with
// its own id) or empties them; the 5-minute cron removes what has been
// there 30 days, files included.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { purgeBefore } from "@/lib/file-rules";

const BUCKET = "lead-files";
const missingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /leads_trash/.test(e.message ?? ""));

export type TrashedLead = {
  id: string;
  name: string;
  funnel: string | null;
  stage: string | null;
  budget: number;
  owner: string | null;
  phone: string | null;
  deletedAt: string;
  deletedBy: string | null;
};

type TrashRow = {
  id: string;
  name: string | null;
  deleted_at: string;
  deleted_by: string | null;
  funnel: string | null;
  stage_id: string | null;
  budget: string | null;
  owner_id: string | null;
  contact_id: string | null;
};

/** The company's trash, newest first; null before the migration has run. */
export async function listTrashedLeads(organizationId: string): Promise<TrashedLead[] | null> {
  const { data, error } = await supabaseAdmin
    .from("leads_trash")
    .select(
      "id, name, deleted_at, deleted_by, funnel:lead->>funnel, stage_id:lead->>stage_id, budget:lead->>budget, owner_id:lead->>owner_id, contact_id:lead->>contact_id",
    )
    .eq("organization_id", organizationId)
    .order("deleted_at", { ascending: false })
    .limit(500);
  if (error) {
    if (missingTable(error)) return null;
    throw error;
  }
  const rows = (data ?? []) as unknown as TrashRow[];
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  const people = uniq(rows.flatMap((r) => [r.deleted_by, r.owner_id]));
  const stages = uniq(rows.map((r) => r.stage_id));
  const contacts = uniq(rows.map((r) => r.contact_id));
  const [p, s, c] = await Promise.all([
    people.length
      ? supabaseAdmin.from("profiles").select("id, full_name").in("id", people)
      : { data: [] },
    stages.length
      ? supabaseAdmin.from("pipeline_stages").select("id, name").in("id", stages)
      : { data: [] },
    contacts.length
      ? supabaseAdmin.from("contacts").select("id, phone").in("id", contacts)
      : { data: [] },
  ]);
  const name = new Map((p.data ?? []).map((x) => [x.id, x.full_name as string | null]));
  const stage = new Map((s.data ?? []).map((x) => [x.id, x.name as string]));
  const phone = new Map((c.data ?? []).map((x) => [x.id, x.phone as string | null]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name || "—",
    funnel: r.funnel,
    stage: r.stage_id ? (stage.get(r.stage_id) ?? null) : null,
    budget: Number(r.budget) || 0,
    owner: r.owner_id ? (name.get(r.owner_id) ?? null) : null,
    phone: r.contact_id ? (phone.get(r.contact_id) ?? null) : null,
    deletedAt: r.deleted_at,
    deletedBy: r.deleted_by ? (name.get(r.deleted_by) ?? null) : null,
  }));
}

export type RestoreResult = { restored: number; failed: number };

/** Puts the leads back, one database call each (a lead with thousands of messages is one transaction). */
export async function restoreTrashedLeads(
  organizationId: string,
  ids: string[],
): Promise<RestoreResult> {
  let restored = 0;
  let failed = 0;
  for (const id of ids) {
    const { data, error } = await supabaseAdmin.rpc("restore_trashed_lead", {
      p_org: organizationId,
      p_id: id,
    });
    if (error) {
      if (missingTable(error)) throw new Error("MIGRATION_PENDING");
      console.error("[leads-trash] restore failed", id, error.message);
      failed += 1;
    } else if (data === "ok") restored += 1;
    else failed += 1;
  }
  return { restored, failed };
}

/** Removes trash entries for good, with the files they kept in storage. */
async function purgeRows(rows: { id: string; files: unknown }[]): Promise<number> {
  if (!rows.length) return 0;
  const paths = rows.flatMap((r) =>
    Array.isArray(r.files)
      ? r.files
          .map((f) =>
            f && typeof f === "object" ? (f as { storage_path?: unknown }).storage_path : null,
          )
          .filter((x): x is string => typeof x === "string" && !!x)
      : [],
  );
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) console.error("[leads-trash] storage remove failed", error.message);
  }
  const { error } = await supabaseAdmin
    .from("leads_trash")
    .delete()
    .in(
      "id",
      rows.map((r) => r.id),
    );
  if (error) throw error;
  return rows.length;
}

export async function purgeTrashedLeads(organizationId: string, ids: string[]): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("leads_trash")
    .select("id, files:children->lead_files")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) {
    if (missingTable(error)) throw new Error("MIGRATION_PENDING");
    throw error;
  }
  return purgeRows((data ?? []) as unknown as { id: string; files: unknown }[]);
}

/** The cron's pass: entries older than 30 days leave for good, 100 per tick. */
export async function runLeadsTrashPurge(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("leads_trash")
    .select("id, files:children->lead_files")
    .lt("deleted_at", purgeBefore())
    .limit(100);
  if (error) {
    if (missingTable(error)) return 0;
    throw error;
  }
  return purgeRows((data ?? []) as unknown as { id: string; files: unknown }[]);
}
