import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { appUrl, notifyOwners, opsBotToken } from "@/lib/ops/bot.server";
import { buildHealthReport, companyIssues, platformIssues, worstLevel } from "@/lib/ops/health";
import { gatherHealth } from "@/lib/ops/health.server";
import { callTelegramMethod, getTelegramBotUsername } from "@/lib/telegram-report.server";

// The platform owner's "Nazoratchi bot" page (/platform/bot):
//   GET  -> whether the caller's Telegram is linked, which bot carries the
//           owner messages, and the same health facts the bot reports;
//   POST {action: "send-report"} -> sends the health report to the owners now.

let opsUsername: string | null = null;
async function opsBotUsername(): Promise<string | null> {
  const token = opsBotToken();
  if (!token) return null;
  if (opsUsername) return opsUsername;
  const me = (await callTelegramMethod(token, "getMe", {}).catch(() => null)) as {
    username?: string;
  } | null;
  opsUsername = me?.username ?? null;
  return opsUsername;
}

export const Route = createFileRoute("/platform/ops-api")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        try {
          const [{ companies, platform }, me, sharedBot, opsBot, log] = await Promise.all([
            gatherHealth(),
            supabaseAdmin.from("profiles").select("telegram_chat_id").eq("id", ownerId).single(),
            getTelegramBotUsername().catch(() => null),
            opsBotUsername(),
            supabaseAdmin
              .from("platform_ops_log")
              .select("key, created_at")
              .order("created_at", { ascending: false })
              .limit(20),
          ]);
          return Response.json({
            linked: me.data?.telegram_chat_id != null,
            sharedBot,
            opsBot,
            opsBotConfigured: !!opsBotToken(),
            alertsReady: !log.error,
            recent: log.error ? [] : log.data,
            platform,
            platformIssues: platformIssues(platform),
            companies: companies
              .filter((c) => !c.frozen)
              .map((c) => {
                const issues = companyIssues(c);
                return { ...c, issues, status: worstLevel(issues) };
              }),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to load";
          return Response.json({ error: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as { action?: string };
        if (body.action !== "send-report") {
          return Response.json({ error: "Unknown action" }, { status: 400 });
        }
        const { companies, platform } = await gatherHealth();
        const refs = await notifyOwners(
          buildHealthReport({ companies, platform, url: `${appUrl()}/platform/bot` }),
        );
        return Response.json({ sent: refs.length });
      },
    },
  },
});
