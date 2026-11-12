import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";

// Owner → Sozlamalar → Zaxira: the daily backup to a Telegram channel.
//   GET  -> { ready, enabled, time, chat: {id, title} | null, lastAt, lastStatus,
//             encrypted, running, botUsername }
//   POST {action: "save", enabled, time}  on/off and the time (HH:MM, Tashkent)
//   POST {action: "code"}                 a code to post as "/zaxira CODE" in the channel
//   POST {action: "unbind"}               forget the channel
//   POST {action: "run"}                  send today's backup now
function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export const Route = createFileRoute("/platform/backup-settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { readBackupSettings, backupRunning } = await import("@/lib/telegram-backup.server");
        const { botUsername, refreshBotTokens } = await import("@/lib/bot-tokens.server");
        await refreshBotTokens();
        const s = await readBackupSettings();
        return Response.json({
          ready: !!s,
          enabled: !!s?.backup_enabled,
          time: s?.backup_time ?? "03:00",
          chat:
            s?.backup_chat_id != null ? { id: s.backup_chat_id, title: s.backup_chat_title } : null,
          lastAt: s?.backup_last_at ?? null,
          lastStatus: s?.backup_last_status ?? null,
          encrypted: !!process.env["BACKUP_PASSPHRASE"]?.trim(),
          running: backupRunning(),
          // The backups come through the monitoring bot when there is one.
          botUsername: (await botUsername("ops")) ?? (await botUsername("client")),
        });
      },
      POST: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const b = (await request.json().catch(() => ({}))) as {
          action?: string;
          enabled?: unknown;
          time?: unknown;
        };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { TIME_RE } = await import("@/lib/telegram-backup");
        type Patch = {
          backup_enabled?: boolean;
          backup_time?: string;
          backup_chat_id?: number | null;
          backup_chat_title?: string | null;
        };
        const update = (patch: Patch) =>
          supabaseAdmin.from("platform_settings").update(patch).eq("id", true);
        if (b.action === "save") {
          if (typeof b.enabled !== "boolean" || typeof b.time !== "string" || !TIME_RE.test(b.time))
            return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
          const { error } = await update({ backup_enabled: b.enabled, backup_time: b.time });
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ ok: true });
        }
        if (b.action === "code") {
          const code = randomCode();
          // Server-only: everyone signed in may read platform_settings.
          const { error } = await supabaseAdmin.from("platform_private").upsert(
            {
              id: true,
              backup_bind_code: code,
              backup_bind_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            },
            { onConflict: "id" },
          );
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ code });
        }
        if (b.action === "unbind") {
          const { error } = await update({
            backup_chat_id: null,
            backup_chat_title: null,
            backup_enabled: false,
          });
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ ok: true });
        }
        if (b.action === "run") {
          const { readBackupSettings, runTelegramBackup, backupRunning } =
            await import("@/lib/telegram-backup.server");
          const s = await readBackupSettings();
          if (!s?.backup_chat_id) return Response.json({ error: "NO_CHAT" }, { status: 400 });
          if (backupRunning()) return Response.json({ error: "RUNNING" }, { status: 409 });
          const day = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
          void runTelegramBackup(s.backup_chat_id, day).catch((err) =>
            console.error("[backup] manual run failed", err),
          );
          return Response.json({ started: true });
        }
        return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
      },
    },
  },
});
