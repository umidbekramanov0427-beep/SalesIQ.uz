import type { SendAs } from "@/hooks/use-crm-data";

// How a file waiting in a composer should go out (a recording as a voice
// note or a file, a camera video as a round video, ...). Kept beside the
// File itself so the composers' File[] state stays as it is.
const chosen = new WeakMap<File, SendAs>();

export function tagSendAs(file: File, as: SendAs): File {
  chosen.set(file, as);
  return file;
}

export function sendAsOf(file: File): SendAs | undefined {
  return chosen.get(file);
}

/** Recordings longer than this can't be a round video (Telegram's limit). */
export const ROUND_VIDEO_MAX_SECONDS = 60;
