import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getTelegramBotUsername } from "@/lib/telegram-report.server";
import { salesbotStartUrl } from "@/lib/salesbots/start-link";
import { getDefaultSalesbotId } from "@/lib/salesbots/default-bot.server";

// GET /salesbots/link?botId=... -> { url, shortUrl? } -- the bot's public
// Telegram start link (see src/lib/salesbots/start-link.ts), for the
// salesbot page's "Test / share" panel, plus the bot's plain link when the
// platform owner made this salesbot the one it opens. Any member of the
// bot's company may ask.
export const Route = createFileRoute("/salesbots/link")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const botId = new URL(request.url).searchParams.get("botId") ?? "";
        const [{ data: me }, { data: bot }] = await Promise.all([
          supabaseAdmin.from("profiles").select("organization_id").eq("id", userId).maybeSingle(),
          supabaseAdmin.from("salesbots").select("organization_id").eq("id", botId).maybeSingle(),
        ]);
        if (!bot || !me?.organization_id || bot.organization_id !== me.organization_id) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        try {
          const [username, defaultBotId] = await Promise.all([
            getTelegramBotUsername(),
            getDefaultSalesbotId(),
          ]);
          return Response.json({
            url: salesbotStartUrl(username, botId),
            botUsername: username,
            ...(defaultBotId === botId ? { shortUrl: `https://t.me/${username}` } : {}),
          });
        } catch {
          return Response.json({ error: "telegram_not_configured" }, { status: 503 });
        }
      },
    },
  },
});
