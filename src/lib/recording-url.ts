/**
 * Call recordings kept in our own storage live in the private
 * "call-recordings" bucket. Rows (amocrm_calls / pbx_calls.recording_url)
 * keep the bucket's public-style URL as a stable address; it only becomes a
 * short-lived signed link right before playing (useRecordingUrl) or fetching
 * it for AI analysis (fetchableRecordingUrl). Links to amoCRM or PBX servers
 * are used as they are.
 */
export const RECORDINGS_BUCKET = "call-recordings";

const OWN_RECORDING =
  /\/storage\/v1\/object\/(?:public|sign|authenticated)\/call-recordings\/([^?#]+)/;

/** The object path inside the recordings bucket when `url` points at our own storage, else null. */
export function ownRecordingPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = OWN_RECORDING.exec(url);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}
