// Server-only. Simple per-lead file storage -- attach a contract, screenshot
// or invoice straight to a lead's workspace. No folders, versioning or full
// document management, just a private Storage bucket ("lead-files") plus a
// metadata row per file. Clients never talk to Storage directly: every
// upload/download/delete goes through this module after the caller's org
// membership on the lead has already been checked by the route.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "lead-files";
export const MAX_LEAD_FILE_BYTES = 20 * 1024 * 1024;

export type LeadFileRow = {
  id: string;
  organization_id: string;
  lead_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140) || "file";
}

export async function listLeadFiles(
  organizationId: string,
  leadId: string,
): Promise<LeadFileRow[]> {
  const { data, error } = await supabaseAdmin
    .from("lead_files")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function uploadLeadFile(
  organizationId: string,
  leadId: string,
  uploadedBy: string,
  file: File,
): Promise<LeadFileRow> {
  if (file.size > MAX_LEAD_FILE_BYTES) {
    throw new Error("Fayl hajmi 20 MB dan oshmasligi kerak.");
  }
  const path = `${organizationId}/${leadId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  const buffer = await file.arrayBuffer();
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream" });
  if (uploadError) throw uploadError;

  const { data, error } = await supabaseAdmin
    .from("lead_files")
    .insert({
      organization_id: organizationId,
      lead_id: leadId,
      file_name: file.name.slice(-200) || "file",
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: uploadedBy,
    })
    .select("*")
    .single();
  if (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function getLeadFileDownloadUrl(
  organizationId: string,
  fileId: string,
): Promise<string> {
  const { data: row, error } = await supabaseAdmin
    .from("lead_files")
    .select("storage_path, organization_id")
    .eq("id", fileId)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.organization_id !== organizationId) {
    throw new Error("Fayl topilmadi.");
  }
  const { data, error: signError } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, 60 * 10);
  if (signError || !data) throw signError ?? new Error("Havola yaratib bo'lmadi.");
  return data.signedUrl;
}

export async function deleteLeadFile(organizationId: string, fileId: string): Promise<void> {
  const { data: row, error } = await supabaseAdmin
    .from("lead_files")
    .select("storage_path, organization_id")
    .eq("id", fileId)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.organization_id !== organizationId) {
    throw new Error("Fayl topilmadi.");
  }
  await supabaseAdmin.storage.from(BUCKET).remove([row.storage_path]);
  const { error: deleteError } = await supabaseAdmin.from("lead_files").delete().eq("id", fileId);
  if (deleteError) throw deleteError;
}
