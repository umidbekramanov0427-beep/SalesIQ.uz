// Server-only. Sozlamalar → Fayllar: the trash (restore within 30 days),
// copying chat files into our storage (lib/file-rules.ts decides which),
// the size count, and the clean-up the 5-minute cron runs -- the
// company's rules move files to the trash, and files trashed 30+ days ago
// leave storage for good.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { downloadChatFile } from "@/lib/telegram/lead-chat.server";
import { fetchInstagramMedia, STORAGE_PREFIX } from "@/lib/instagram/instagram.server";
import { MAX_LEAD_FILE_BYTES } from "@/lib/lead-files.server";
import {
  purgeBefore,
  retentionCutoff,
  shouldCopyChatFile,
  type ChatSource,
  kindsFilter,
  parseMoreFileRules,
} from "@/lib/file-rules";

const BUCKET = "lead-files";
const missingColumn = (e: { message?: string } | null) =>
  !!e &&
  /deleted_at|source|chat_message_id|file_autoload|file_retention|file_lost/.test(e.message ?? "");

/** Moves a file to the trash; before the migration (no column) it is deleted outright. */
export async function trashLeadFile(
  organizationId: string,
  fileId: string,
  by: string | null,
): Promise<"trashed" | "deleted"> {
  const { data: row, error } = await supabaseAdmin
    .from("lead_files")
    .select("id, storage_path, organization_id")
    .eq("id", fileId)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.organization_id !== organizationId) throw new Error("Fayl topilmadi.");
  const upd = await supabaseAdmin
    .from("lead_files")
    .update({ deleted_at: new Date().toISOString(), deleted_by: by })
    .eq("id", fileId);
  if (!upd.error) return "trashed";
  if (!missingColumn(upd.error)) throw upd.error;
  await supabaseAdmin.storage.from(BUCKET).remove([row.storage_path]);
  const del = await supabaseAdmin.from("lead_files").delete().eq("id", fileId);
  if (del.error) throw del.error;
  return "deleted";
}

export async function restoreLeadFile(organizationId: string, fileId: string): Promise<void> {
  const { error, count } = await supabaseAdmin
    .from("lead_files")
    .update({ deleted_at: null, deleted_by: null }, { count: "exact" })
    .eq("id", fileId)
    .eq("organization_id", organizationId)
    .not("deleted_at", "is", null);
  if (error) throw error;
  if (!count) throw new Error("Fayl savatda topilmadi.");
}

export type TrashedFile = {
  id: string;
  name: string;
  size: number;
  source: string;
  leadId: string;
  leadName: string;
  deletedAt: string;
  deletedBy: string | null;
};

export async function listTrashedFiles(organizationId: string): Promise<TrashedFile[]> {
  const { data, error } = await supabaseAdmin
    .from("lead_files")
    .select(
      "id, file_name, size_bytes, source, lead_id, deleted_at, lead:leads(name), by:profiles!lead_files_deleted_by_fkey(full_name, email)",
    )
    .eq("organization_id", organizationId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(500);
  if (error) {
    if (missingColumn(error)) return [];
    throw error;
  }
  type Row = {
    id: string;
    file_name: string;
    size_bytes: number;
    source: string;
    lead_id: string;
    deleted_at: string;
    lead: { name: string } | null;
    by: { full_name: string | null; email: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.file_name,
    size: r.size_bytes,
    source: r.source,
    leadId: r.lead_id,
    leadName: r.lead?.name ?? "—",
    deletedAt: r.deleted_at,
    deletedBy: r.by ? r.by.full_name || r.by.email : null,
  }));
}

export type FileUsage = {
  activeBytes: number;
  activeCount: number;
  trashBytes: number;
  trashCount: number;
  bySource: Record<string, { bytes: number; count: number }>;
};

/** The company's files by size, for the Fayllar page (up to 50 000 files). */
export async function fileUsage(organizationId: string): Promise<FileUsage> {
  const out: FileUsage = {
    activeBytes: 0,
    activeCount: 0,
    trashBytes: 0,
    trashCount: 0,
    bySource: {},
  };
  const withTrash = await supabaseAdmin
    .from("lead_files")
    .select("size_bytes, source, deleted_at")
    .eq("organization_id", organizationId)
    .limit(1);
  const cols = withTrash.error ? "size_bytes" : "size_bytes, source, deleted_at";
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("lead_files")
      .select(cols)
      .eq("organization_id", organizationId)
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as unknown as {
      size_bytes: number;
      source?: string;
      deleted_at?: string | null;
    }[];
    for (const r of rows) {
      const b = Number(r.size_bytes) || 0;
      if (r.deleted_at) {
        out.trashBytes += b;
        out.trashCount++;
        continue;
      }
      out.activeBytes += b;
      out.activeCount++;
      const s = r.source ?? "upload";
      const slot = (out.bySource[s] ??= { bytes: 0, count: 0 });
      slot.bytes += b;
      slot.count++;
    }
    if (rows.length < 1000) break;
  }
  return out;
}

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "file";

/**
 * Copies a client's chat file into our storage when the company's setting
 * says so, and lists it among the lead's files. An Instagram message is
 * pointed at the copy, since Meta's link stops working after a while.
 */
export async function copyChatFile(input: {
  organizationId: string;
  leadId: string;
  source: ChatSource;
  fileId: string;
  fileName: string | null;
  kind: string | null;
}): Promise<void> {
  const { data: settings } = await supabaseAdmin
    .from("org_general_settings")
    .select("*")
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  const policy = (settings as { file_autoload?: string | null } | null)?.file_autoload;
  if (!shouldCopyChatFile(policy, input.source)) return;

  const { data: msg } = await supabaseAdmin
    .from("lead_telegram_messages")
    .select("id")
    .eq("lead_id", input.leadId)
    .eq("file_id", input.fileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!msg) return;

  let data: ArrayBuffer;
  let type: string;
  let name = input.fileName || "";
  if (input.source === "instagram") {
    const got = await fetchInstagramMedia(input.fileId);
    if (!got) return;
    data = got.data;
    type = got.type;
  } else {
    const got = await downloadChatFile(input.fileId);
    if (!got) return;
    data = got.data;
    type = "application/octet-stream";
    name ||= got.path.split("/").pop() || "";
  }
  if (data.byteLength > MAX_LEAD_FILE_BYTES) return;
  const ext = type.split("/")[1]?.split(";")[0] ?? "bin";
  name ||= `${input.kind || "file"}.${ext}`;
  // Instagram copies live where the chat already reads stored files from.
  const path =
    input.source === "instagram"
      ? `${input.organizationId}/instagram/${crypto.randomUUID()}-${safeName(name)}`
      : `${input.organizationId}/${input.leadId}/chat-${crypto.randomUUID()}-${safeName(name)}`;
  const up = await supabaseAdmin.storage.from(BUCKET).upload(path, data, { contentType: type });
  if (up.error) return;
  const ins = await supabaseAdmin.from("lead_files").insert({
    organization_id: input.organizationId,
    lead_id: input.leadId,
    file_name: name.slice(-200),
    storage_path: path,
    mime_type: type,
    size_bytes: data.byteLength,
    source: input.source,
    chat_message_id: msg.id,
  });
  if (ins.error) {
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    return;
  }
  if (input.source === "instagram") {
    await supabaseAdmin
      .from("lead_telegram_messages")
      .update({ file_id: `${STORAGE_PREFIX}${path}` })
      .eq("id", msg.id);
  }
}

/**
 * The cron's file pass: each company's rules move files to the trash
 * (older than N days; leads lost N days ago), then files trashed 30+ days
 * ago are removed from storage and the table. Batched, so one tick stays short.
 */
export async function runFileHousekeeping(): Promise<{ trashed: number; purged: number }> {
  let trashed = 0;
  let purged = 0;
  const { data: rows, error } = await supabaseAdmin.from("org_general_settings").select("*");
  if (error) {
    if (missingColumn(error)) return { trashed, purged };
    throw error;
  }
  const orgs = (rows ?? [])
    .map((r) => ({
      organization_id: r.organization_id,
      file_retention_days: r.file_retention_days ?? null,
      file_lost_lead_days: r.file_lost_lead_days ?? null,
      more: parseMoreFileRules((r as { file_rules?: unknown }).file_rules),
    }))
    .filter(
      (o) =>
        o.file_retention_days != null ||
        o.file_lost_lead_days != null ||
        o.more.wonDays != null ||
        o.more.bigMb != null,
    );
  const now = new Date().toISOString();
  // Files of the leads that reached a won / lost stage before `before`.
  const trashClosedLeads = async (orgId: string, flag: "is_won" | "is_lost", before: string) => {
    const { data: closed } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id")
      .eq("organization_id", orgId)
      .eq(flag, true);
    const stageIds = (closed ?? []).map((st) => st.id);
    if (!stageIds.length) return;
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("organization_id", orgId)
      .in("stage_id", stageIds)
      .lt("stage_changed_at", before)
      .limit(1000);
    const ids = (leads ?? []).map((l) => l.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { count } = await supabaseAdmin
        .from("lead_files")
        .update({ deleted_at: now }, { count: "exact" })
        .is("deleted_at", null)
        .in("lead_id", ids.slice(i, i + 200));
      trashed += count ?? 0;
    }
  };
  for (const o of orgs) {
    const older = retentionCutoff(o.file_retention_days);
    if (older) {
      let q = supabaseAdmin
        .from("lead_files")
        .update({ deleted_at: now }, { count: "exact" })
        .eq("organization_id", o.organization_id)
        .is("deleted_at", null)
        .lt("created_at", older);
      // Only some kinds (video, audio...) when the company chose them.
      const kinds = kindsFilter(o.more.oldKinds);
      if (kinds) q = q.or(kinds);
      const { count } = await q;
      trashed += count ?? 0;
    }
    const lostBefore = retentionCutoff(o.file_lost_lead_days);
    if (lostBefore) await trashClosedLeads(o.organization_id, "is_lost", lostBefore);
    const wonBefore = retentionCutoff(o.more.wonDays);
    if (wonBefore) await trashClosedLeads(o.organization_id, "is_won", wonBefore);
    const bigBefore = retentionCutoff(o.more.bigDays);
    if (bigBefore && o.more.bigMb) {
      const { count } = await supabaseAdmin
        .from("lead_files")
        .update({ deleted_at: now }, { count: "exact" })
        .eq("organization_id", o.organization_id)
        .is("deleted_at", null)
        .gt("size_bytes", o.more.bigMb * 1024 * 1024)
        .lt("created_at", bigBefore);
      trashed += count ?? 0;
    }
  }

  const { data: old } = await supabaseAdmin
    .from("lead_files")
    .select("id, storage_path")
    .not("deleted_at", "is", null)
    .lt("deleted_at", purgeBefore())
    .limit(200);
  if (old?.length) {
    await supabaseAdmin.storage.from(BUCKET).remove(old.map((f) => f.storage_path));
    const { count } = await supabaseAdmin
      .from("lead_files")
      .delete({ count: "exact" })
      .in(
        "id",
        old.map((f) => f.id),
      );
    purged = count ?? 0;
  }
  return { trashed, purged };
}
