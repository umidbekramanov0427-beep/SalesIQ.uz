// Server-only. Kunlik zaxira Telegram'ga: at the owner's time (Tashkent) the
// 5-minute cron claims the day once (platform_ops_log "tgbackup:<day>") and
// sends every company's data to the bound channel or group -- one gzip JSON
// per company: {format, created_at, organization, tables: {name: rows}}.
// With BACKUP_PASSPHRASE set the files are encrypted the way
// `openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -md sha256` does, so they
// open on any computer with openssl. The server's nightly full database
// backup (salesiq-backup.timer) keeps running as before.
import { gzipSync } from "node:zlib";
import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTelegramFile, sendTelegramMessage } from "@/lib/telegram-report.server";
import { botToken, refreshBotTokens, withBot } from "@/lib/bot-tokens.server";
import {
  parseCompanyBackup,
  BACKUP_FORMAT,
  SKIP_TABLES,
  backupDueDay,
  backupFileName,
  errText,
  isRetryable,
  fmtBytes,
  splitParts,
  stripSecrets,
} from "@/lib/telegram-backup";

export type BackupSettings = {
  backup_enabled: boolean;
  backup_time: string;
  backup_chat_id: number | null;
  backup_chat_title: string | null;
  backup_last_at: string | null;
  backup_last_status: string | null;
};

const PBKDF2_ITER = 100_000;

/** openssl-compatible: "Salted__" + salt + AES-256-CBC (key and IV from PBKDF2-SHA256). */
export function encryptForOpenssl(data: Uint8Array, passphrase: string): Uint8Array {
  const salt = randomBytes(8);
  const kv = pbkdf2Sync(passphrase, salt, PBKDF2_ITER, 48, "sha256");
  const cipher = createCipheriv("aes-256-cbc", kv.subarray(0, 32), kv.subarray(32, 48));
  return Buffer.concat([Buffer.from("Salted__"), salt, cipher.update(data), cipher.final()]);
}

export async function readBackupSettings(): Promise<BackupSettings | null> {
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select(
      "backup_enabled, backup_time, backup_chat_id, backup_chat_title, backup_last_at, backup_last_status",
    )
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as BackupSettings;
}

let running = false;

/** From the 5-minute cron: starts the day's backup once its time has come. */
export async function runTelegramBackupIfDue(now = new Date()): Promise<void> {
  const s = await readBackupSettings();
  if (!s?.backup_enabled || s.backup_chat_id == null || running) return;
  const day = backupDueDay(s.backup_time, now);
  if (!day) return;
  const { error } = await supabaseAdmin.from("platform_ops_log").insert({ key: `tgbackup:${day}` });
  if (error) return; // already done (or being done) today
  // A big company takes a while: not waited for, so the cron answers at once.
  void runTelegramBackup(s.backup_chat_id, day).catch((err) =>
    console.error("[backup] telegram backup failed", err),
  );
}

/** A file to Telegram: up to 3 tries on network trouble (2 s, then 6 s apart). */
async function sendWithRetry<T>(send: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await send();
    } catch (err) {
      if (attempt >= 3 || !isRetryable(err)) throw err;
      console.error(`[backup] send failed (try ${attempt}), retrying:`, errText(err));
      await new Promise((r) => setTimeout(r, attempt === 1 ? 2_000 : 6_000));
    }
  }
}

/** One company's rows of every company table, secrets removed. */
async function exportCompany(
  org: Record<string, unknown> & { id: string },
  tables: string[],
): Promise<{ json: string; rows: number; failed: string[] }> {
  const out: Record<string, unknown[]> = {};
  const failed: string[] = [];
  let rows = 0;
  for (const table of tables) {
    const { data, error } = await supabaseAdmin.rpc("backup_org_table", {
      p_table: table,
      p_org: org.id,
    });
    if (error) {
      failed.push(table);
      continue;
    }
    const list = Array.isArray(data) ? data : [];
    if (!list.length) continue;
    out[table] = stripSecrets(list) as unknown[];
    rows += list.length;
  }
  const json = JSON.stringify({
    format: BACKUP_FORMAT,
    created_at: new Date().toISOString(),
    organization: stripSecrets(org),
    counts: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])),
    tables: out,
  });
  return { json, rows, failed };
}

/**
 * Sends every company's backup to the chat; "Hozir yuborish" calls it
 * directly. Through the monitoring bot when there is one (the platform
 * owner's bot), else the client bot.
 */
export async function runTelegramBackup(chatId: number, day: string): Promise<string> {
  running = true;
  await refreshBotTokens();
  if (botToken("ops")) return withBot("ops", () => doBackup(chatId, day));
  return doBackup(chatId, day);
}

async function doBackup(chatId: number, day: string): Promise<string> {
  const started = Date.now();
  try {
    const { data: tableRows, error: tErr } = await supabaseAdmin.rpc("backup_org_tables");
    if (tErr) throw new Error(`backup_org_tables: ${tErr.message}`);
    const tables = ((tableRows ?? []) as { table_name: string }[])
      .map((r) => r.table_name)
      .filter((t) => !SKIP_TABLES.has(t));
    const { data: orgs, error: oErr } = await supabaseAdmin
      .from("organizations")
      .select("*")
      .order("created_at");
    if (oErr) throw oErr;
    const pass = process.env["BACKUP_PASSPHRASE"]?.trim() || null;
    let sent = 0;
    let bytes = 0;
    const problems: string[] = [];
    for (const org of (orgs ?? []) as (Record<string, unknown> & {
      id: string;
      name: string;
      subdomain?: string | null;
    })[]) {
      try {
        const { json, rows, failed } = await exportCompany(org, tables);
        let data: Uint8Array = gzipSync(Buffer.from(json, "utf8"), { level: 9 });
        let name = backupFileName(org, day);
        if (pass) {
          data = encryptForOpenssl(data, pass);
          name += ".enc";
        }
        bytes += data.length;
        const parts = splitParts(data);
        for (let i = 0; i < parts.length; i++) {
          const partName = parts.length > 1 ? `${name}.part${i + 1}` : name;
          const caption =
            i === 0
              ? `🗂 <b>${escapeHtml(org.name)}</b> · ${day}\n${rows.toLocaleString("ru-RU")} ta yozuv · ${fmtBytes(data.length)}${parts.length > 1 ? ` · ${parts.length} qism` : ""}${failed.length ? `\n⚠️ O'qilmadi: ${failed.join(", ")}` : ""}`
              : `${escapeHtml(org.name)} · ${i + 1}/${parts.length}`;
          await sendWithRetry(() =>
            sendTelegramFile(
              chatId,
              {
                kind: "document",
                name: partName,
                type: "application/octet-stream",
                data: parts[i]!,
              },
              caption,
              { html: true },
            ),
          );
        }
        sent++;
      } catch (err) {
        console.error("[backup] company failed", org.id, err);
        problems.push(`${org.name}: ${errText(err).slice(0, 200)}`);
      }
    }
    const mins = Math.max(1, Math.round((Date.now() - started) / 60_000));
    const summary =
      `✅ <b>Zaxira ${day}</b>: ${sent}/${(orgs ?? []).length} ta kompaniya, ${fmtBytes(bytes)}, ~${mins} daq.` +
      (pass
        ? "\n🔐 Fayllar shifrlangan: <code>openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -md sha256 -in FAYL.enc -out FAYL.json.gz</code>"
        : "") +
      (problems.length ? `\n⚠️ ${problems.map(escapeHtml).join("\n⚠️ ")}` : "");
    await sendTelegramMessage(chatId, summary);
    const status = problems.length ? `partial:${sent}/${(orgs ?? []).length}` : `ok:${sent}`;
    await supabaseAdmin
      .from("platform_settings")
      .update({ backup_last_at: new Date().toISOString(), backup_last_status: status })
      .eq("id", true);
    return status;
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : "xato";
    await sendTelegramMessage(
      chatId,
      `❌ <b>Zaxira ${day}</b> bajarilmadi: ${escapeHtml(msg)}`,
    ).catch(() => undefined);
    await supabaseAdmin
      .from("platform_settings")
      .update({ backup_last_at: new Date().toISOString(), backup_last_status: `error:${msg}` })
      .eq("id", true);
    return `error:${msg}`;
  } finally {
    running = false;
  }
}

export const backupRunning = () => running;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ---- Binding the channel: "/zaxira CODE" ------------------------------ */

export const BACKUP_BIND_RE = /^\/zaxira[@\w]*\s+([A-Z0-9]{8})/i;

/** From the webhook: a "/zaxira CODE" posted in a channel or group binds it. */
export async function handleBackupBind(
  chat: { id: number; title?: string | null },
  code: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("platform_private")
    .select("backup_bind_code, backup_bind_expires_at")
    .eq("id", true)
    .maybeSingle();
  const s = data as {
    backup_bind_code: string | null;
    backup_bind_expires_at: string | null;
  } | null;
  if (
    !s?.backup_bind_code ||
    s.backup_bind_code !== code.toUpperCase() ||
    !s.backup_bind_expires_at ||
    Date.parse(s.backup_bind_expires_at) < Date.now()
  ) {
    return false;
  }
  await supabaseAdmin
    .from("platform_settings")
    .update({ backup_chat_id: chat.id, backup_chat_title: chat.title ?? null })
    .eq("id", true);
  await supabaseAdmin
    .from("platform_private")
    .update({ backup_bind_code: null, backup_bind_expires_at: null })
    .eq("id", true);
  await sendTelegramMessage(
    chat.id,
    "✅ Bu chat SalesIQ kunlik zaxiralari uchun ulandi. Har kuni belgilangan vaqtda har bir kompaniya ma'lumotlari shu yerga fayl bo'lib keladi.",
  ).catch(() => undefined);
  return true;
}

/* ---- A company's own backup (Admin -> Zaxira) --------------------------- */

/** The company tables to copy (once per run). */
async function companyTables(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.rpc("backup_org_tables");
  if (error) throw new Error(`backup_org_tables: ${error.message}`);
  return ((data ?? []) as { table_name: string }[])
    .map((r) => r.table_name)
    .filter((t) => !SKIP_TABLES.has(t));
}

/** Sends one company's backup to its own Telegram group (client bot). */
export async function sendCompanyBackup(
  orgId: string,
  chatId: number,
  day: string,
  tables?: string[],
): Promise<{ rows: number; bytes: number }> {
  const { data: org, error } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .single();
  if (error || !org) throw error ?? new Error("Kompaniya topilmadi");
  const o = org as Record<string, unknown> & {
    id: string;
    name: string;
    subdomain?: string | null;
  };
  const { json, rows, failed } = await exportCompany(o, tables ?? (await companyTables()));
  const data = gzipSync(Buffer.from(json, "utf8"), { level: 9 });
  const name = backupFileName(o, day);
  const parts = splitParts(data);
  for (let i = 0; i < parts.length; i++) {
    await sendWithRetry(() =>
      sendTelegramFile(
        chatId,
        {
          kind: "document",
          name: parts.length > 1 ? `${name}.part${i + 1}` : name,
          type: "application/gzip",
          data: parts[i]!,
        },
        i === 0
          ? `🗂 <b>SalesIQ zaxira</b> · ${escapeHtml(o.name)} · ${day}\n${rows.toLocaleString("ru-RU")} ta yozuv · ${fmtBytes(data.length)}${parts.length > 1 ? ` · ${parts.length} qism` : ""}${failed.length ? `\n⚠️ O'qilmadi: ${failed.join(", ")}` : ""}`
          : `${escapeHtml(o.name)} · ${i + 1}/${parts.length}`,
        { html: true },
      ),
    );
  }
  return { rows, bytes: data.length };
}

/**
 * From the 5-minute cron: every company whose own backup is on and whose
 * time has come today gets it once (claimed in platform_ops_log).
 */
export async function runCompanyBackupsDue(now = new Date()): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("org_general_settings")
    .select("organization_id, backup_rules");
  if (error || !data) return 0;
  const due = (data as { organization_id: string; backup_rules?: unknown }[])
    .map((r) => ({ orgId: r.organization_id, rules: parseCompanyBackup(r.backup_rules) }))
    .filter((r) => r.rules.enabled && r.rules.chatId != null)
    .map((r) => ({ ...r, day: backupDueDay(r.rules.time, now) }))
    .filter((r): r is typeof r & { day: string } => !!r.day);
  if (!due.length) return 0;
  let tables: string[] | null = null;
  let sent = 0;
  for (const r of due) {
    const { error: claimErr } = await supabaseAdmin
      .from("platform_ops_log")
      .insert({ key: `cbackup:${r.orgId}:${r.day}` });
    if (claimErr) continue;
    try {
      // Only to a chat the company itself bound with /bind.
      const { data: bound } = await supabaseAdmin
        .from("telegram_bound_chats")
        .select("chat_id")
        .eq("organization_id", r.orgId)
        .eq("chat_id", r.rules.chatId!)
        .maybeSingle();
      if (!bound) continue;
      tables ??= await companyTables();
      await sendCompanyBackup(r.orgId, r.rules.chatId!, r.day, tables);
      sent++;
    } catch (err) {
      console.error("[backup] company backup failed", r.orgId, err);
    }
  }
  return sent;
}
