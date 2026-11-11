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

// ---- More file rules (Admin -> Fayllar va xotira), in org_general_settings.file_rules ----

export type FileKind = "image" | "video" | "audio" | "document";
export const FILE_KINDS: FileKind[] = ["image", "video", "audio", "document"];

/** The platform's own ceiling for one upload; a company can only go lower. */
export const MAX_UPLOAD_MB = 20;

/** Files a company usually doesn't want on a lead: programs and scripts. */
export const RISKY_EXTENSIONS = [
  "exe",
  "msi",
  "bat",
  "cmd",
  "com",
  "scr",
  "vbs",
  "js",
  "jar",
  "apk",
  "ps1",
  "sh",
];

export type MoreFileRules = {
  /** Files of leads won this many days ago go to the trash. */
  wonDays: number | null;
  /** Files bigger than this many MB ... */
  bigMb: number | null;
  /** ... go to the trash once they are this many days old. */
  bigDays: number | null;
  /** Kinds the "older than N days" rule touches; empty = every file. */
  oldKinds: FileKind[];
  /** Largest file a person may upload, MB (at most MAX_UPLOAD_MB). */
  maxUploadMb: number | null;
  /** Extensions that can't be uploaded, lower case without the dot. */
  blockedExt: string[];
};

export const DEFAULT_MORE_FILE_RULES: MoreFileRules = {
  wonDays: null,
  bigMb: null,
  bigDays: null,
  oldKinds: [],
  maxUploadMb: null,
  blockedExt: [],
};

const whole = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null;

export function parseMoreFileRules(raw: unknown): MoreFileRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_MORE_FILE_RULES;
  const o = raw as Record<string, unknown>;
  const kinds = Array.isArray(o["oldKinds"])
    ? FILE_KINDS.filter((k) => (o["oldKinds"] as unknown[]).includes(k))
    : [];
  const ext = Array.isArray(o["blockedExt"])
    ? [
        ...new Set(
          (o["blockedExt"] as unknown[])
            .filter((e): e is string => typeof e === "string")
            .map((e) => e.trim().toLowerCase().replace(/^\./, ""))
            .filter((e) => /^[a-z0-9]{1,10}$/.test(e)),
        ),
      ]
    : [];
  const bigMb = whole(o["bigMb"], 1, 1000);
  const bigDays = whole(o["bigDays"], 1, 3650);
  return {
    wonDays: whole(o["wonDays"], 1, 3650),
    bigMb: bigMb && bigDays ? bigMb : null,
    bigDays: bigMb && bigDays ? bigDays : null,
    oldKinds: kinds,
    maxUploadMb: whole(o["maxUploadMb"], 1, MAX_UPLOAD_MB),
    blockedExt: ext,
  };
}

/** What kind of file it is, by its type, else by its name. */
export function fileKindOf(mime: string | null | undefined, name = ""): FileKind {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "bmp"].includes(ext)) return "image";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "video";
  if (["mp3", "ogg", "oga", "wav", "m4a", "aac", "opus"].includes(ext)) return "audio";
  return "document";
}

/** Why an upload is refused under the company's rules, or null. */
export function uploadRefusal(
  rules: MoreFileRules,
  file: { name: string; size: number },
): { reason: "size"; limitMb: number } | { reason: "type"; ext: string } | null {
  const limitMb = rules.maxUploadMb ?? MAX_UPLOAD_MB;
  if (file.size > limitMb * 1024 * 1024) return { reason: "size", limitMb };
  const ext = file.name.toLowerCase().includes(".")
    ? file.name.toLowerCase().split(".").pop()!
    : "";
  if (ext && rules.blockedExt.includes(ext)) return { reason: "type", ext };
  return null;
}

/** PostgREST filter matching the mime types of these kinds (for the "older than" rule). */
export function kindsFilter(kinds: FileKind[]): string | null {
  if (kinds.length === 0 || kinds.length === FILE_KINDS.length) return null;
  const media = ["image", "video", "audio"] as const;
  const parts = kinds.map((k) =>
    k === "document"
      ? `and(${media.map((m) => `mime_type.not.like.${m}/*`).join(",")}),mime_type.is.null`
      : `mime_type.like.${k}/*`,
  );
  return parts.join(",");
}
