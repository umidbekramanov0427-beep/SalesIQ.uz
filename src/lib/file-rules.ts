// Sozlamalar → Fayllar (amoCRM's "Automatic download of large files" and
// "File deletion"): which chat files we copy into our own storage, and how
// long a trashed file can still be restored. Pure, so it is unit-tested.

export type FileAutoload = "none" | "all" | "smart";
export const FILE_AUTOLOAD: FileAutoload[] = ["none", "all", "smart"];
export type ChatSource = "telegram" | "instagram";

/** A trashed file stays restorable this long, then leaves storage for good. */
export const TRASH_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

/** "smart" (the default): copy only from sources that don't keep files -- Instagram links expire, Telegram keeps them. */
export function shouldCopyChatFile(policy: string | null | undefined, source: ChatSource): boolean {
  const p = FILE_AUTOLOAD.includes(policy as FileAutoload) ? (policy as FileAutoload) : "smart";
  if (p === "none") return false;
  if (p === "all") return true;
  return source === "instagram";
}

/** Whole days left before a trashed file is gone (0 = it goes on the next clean-up). */
export function trashDaysLeft(deletedAt: string, now = Date.now()): number {
  const left = new Date(deletedAt).getTime() + TRASH_DAYS * DAY - now;
  return Math.max(0, Math.ceil(left / DAY));
}

/** Trashed before this moment: removed from storage for good. */
export function purgeBefore(now = Date.now()): string {
  return new Date(now - TRASH_DAYS * DAY).toISOString();
}

/** Files created before this moment go to the trash under an "older than N days" rule. */
export function retentionCutoff(days: number | null | undefined, now = Date.now()): string | null {
  return days && days > 0 ? new Date(now - days * DAY).toISOString() : null;
}

export function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(b > 0 ? 1 : 0, Math.round(b / 1024))} KB`;
}
