// Server-only. Files for a bulk message that are too big to travel inline
// (audio, long videos, big screenshots): the browser uploads each one
// straight to the private "lead-files" bucket through a one-time signed URL,
// under <org>/bulk/, and every send request then names it by path. Paths
// are checked against the caller's own company prefix before reading.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "lead-files";
export const MAX_BULK_UPLOAD_BYTES = 20 * 1024 * 1024;

const prefixFor = (organizationId: string) => `${organizationId}/bulk/`;

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "file";
}

/** A one-time upload slot for one file of the caller's company. */
export async function signBulkUpload(
  organizationId: string,
  name: string,
): Promise<{ path: string; token: string }> {
  const path = `${prefixFor(organizationId)}${crypto.randomUUID()}-${safeName(name)}`;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Could not create an upload URL.");
  return { path: data.path, token: data.token };
}

/** The uploaded file's bytes, or null if the path isn't this company's or is missing. */
export async function readBulkUpload(
  organizationId: string,
  path: string,
): Promise<Uint8Array | null> {
  if (!path.startsWith(prefixFor(organizationId)) || path.includes("..")) return null;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  if (data.size > MAX_BULK_UPLOAD_BYTES) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** Deletes a finished send's uploads (only the caller's company's). */
export async function removeBulkUploads(organizationId: string, paths: string[]): Promise<void> {
  const own = paths.filter((p) => p.startsWith(prefixFor(organizationId)) && !p.includes(".."));
  if (own.length > 0) await supabaseAdmin.storage.from(BUCKET).remove(own);
}
