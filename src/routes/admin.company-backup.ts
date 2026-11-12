import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";

// Admin -> Zaxira: POST {action: "run"} sends the company's backup to its
// chosen Telegram group now (the daily one runs from the 5-minute cron).
// The settings themselves are saved in org_general_settings.backup_rules.
export const Route = createFileRoute("/admin/company-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireSuperAdmin(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { parseCompanyBackup } = await import("@/lib/telegram-backup");
        const { sendCompanyBackup } = await import("@/lib/telegram-backup.server");
        const { data } = await supabaseAdmin
          .from("org_general_settings")
          .select("backup_rules")
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        const rules = parseCompanyBackup((data as { backup_rules?: unknown } | null)?.backup_rules);
        if (rules.chatId == null) return Response.json({ error: "NO_CHAT" }, { status: 400 });
        // The chat must still be one the company bound (/bind).
        const { data: bound } = await supabaseAdmin
          .from("telegram_bound_chats")
          .select("chat_id")
          .eq("organization_id", caller.organizationId)
          .eq("chat_id", rules.chatId)
          .maybeSingle();
        if (!bound) return Response.json({ error: "NO_CHAT" }, { status: 400 });
        const day = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
        try {
          const r = await sendCompanyBackup(caller.organizationId, rules.chatId, day);
          return Response.json({ ok: true, ...r });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message.slice(0, 200) : "Xatolik" },
            { status: 400 },
          );
        }
      },
    },
  },
});
