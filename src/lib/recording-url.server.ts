import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { RECORDINGS_BUCKET, ownRecordingPath } from "@/lib/recording-url";

/** A URL the server can download: our own recordings get a 10-minute signed link, others pass through. */
export async function fetchableRecordingUrl(url: string): Promise<string> {
  const path = ownRecordingPath(url);
  if (!path) return url;
  const { data, error } = await supabaseAdmin.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrl(path, 10 * 60);
  if (error || !data) {
    throw new Error(`Ovoz yozuviga havola yaratib bo'lmadi: ${error?.message ?? "unknown error"}`);
  }
  return data.signedUrl;
}
