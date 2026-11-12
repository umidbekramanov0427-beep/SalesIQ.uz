// Kunlik zaxira Telegram'ga: pure rules (telegram-backup.server.ts runs it).
// Every day at the owner's time (Tashkent) each company's rows go to the
// bound Telegram channel as one gzip JSON file. Secrets (tokens, sealed
// keys, password hashes) never leave the server, at any depth of a row;
// telemetry tables (visits, login events, error logs) are left out.

export const BACKUP_FORMAT = "salesiq-backup/1";

/** Telegram lets a bot send files up to 50 MB; a little less, to be safe. */
export const PART_BYTES = 45 * 1024 * 1024;

/** Company tables not worth a daily copy (telemetry) or that hold only secrets. */
export const SKIP_TABLES = new Set([
  "user_session_events",
  "user_login_events",
  "error_logs",
  "telegram_bind_codes",
  "marketing_tg_accounts",
  "marketing_meta_accounts",
  "org_payment_merchants",
]);

const SECRET_KEY =
  /(token|secret|sealed|password|passwd|api_?key|private_?key|p256dh|_hash$|^hash$|_enc$|^auth$|credential)/i;

export const isSecretKey = (k: string) => SECRET_KEY.test(k);

/** A copy of a value without any secret-looking keys, at any depth. */
export function stripSecrets(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripSecrets);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (!isSecretKey(k)) out[k] = stripSecrets(x);
    }
    return out;
  }
  return v;
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const TZ_MS = 5 * 3_600_000;

/**
 * The Tashkent day whose backup is due at `now`, or null: due once the
 * day's chosen time has passed (the 5-minute cron then claims it once).
 */
export function backupDueDay(time: string, now: Date): string | null {
  if (!TIME_RE.test(time)) return null;
  const local = new Date(now.getTime() + TZ_MS);
  const [h, m] = time.split(":").map(Number) as [number, number];
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minutes < h * 60 + m) return null;
  return local.toISOString().slice(0, 10);
}

/** A file name safe for Telegram and every OS: salesiq-<company>-<day>.json.gz */
export function backupFileName(org: { name: string; subdomain?: string | null }, day: string) {
  const base =
    (org.subdomain || org.name)
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "kompaniya";
  return `salesiq-${base}-${day}.json.gz`;
}

/** Splits a file into Telegram-sized parts (one part when it fits). */
export function splitParts(data: Uint8Array, max = PART_BYTES): Uint8Array[] {
  if (data.length <= max) return [data];
  const parts: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += max) parts.push(data.subarray(i, i + max));
  return parts;
}

export const fmtBytes = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : n >= 1024
      ? `${Math.round(n / 1024)} KB`
      : `${n} B`;

/* ---- A company's own backup (Admin -> Zaxira) --------------------------- */

export type CompanyBackupRules = { enabled: boolean; time: string; chatId: number | null };

export const DEFAULT_COMPANY_BACKUP: CompanyBackupRules = {
  enabled: false,
  time: "03:30",
  chatId: null,
};

export function parseCompanyBackup(raw: unknown): CompanyBackupRules {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const chat =
    typeof o["chatId"] === "number" && Number.isFinite(o["chatId"])
      ? (o["chatId"] as number)
      : null;
  return {
    enabled: o["enabled"] === true && chat != null,
    time:
      typeof o["time"] === "string" && TIME_RE.test(o["time"])
        ? (o["time"] as string)
        : DEFAULT_COMPANY_BACKUP.time,
    chatId: chat,
  };
}
