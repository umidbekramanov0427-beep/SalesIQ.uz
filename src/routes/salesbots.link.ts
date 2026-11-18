import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getTelegramBotUsername } from "@/lib/telegram-report.server";
import { salesbotShortUrl, salesbotStartUrl } from "@/lib/salesbots/start-link";
import { orgBot } from "@/lib/bot-tokens.server";
import { getDefaultSalesbotId } from "@/lib/salesbots/default-bot.server";

// GET /salesbots/link?botId=... -> { url, shortUrl?, botUsername, ownBot } --
// the salesbot's public Telegram start link (src/lib/salesbots/start-link.ts)
// for the salesbot page's "Test / share" panel: through the company's own
// bot when it has one (the plain t.me/<bot> for its main salesbot), else the
// shared trial bot; shortUrl is the short form. Any member of the bot's
// company may ask.
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
        const { data: row } = await supabaseAdmin
          .from("salesbots")
          .select("*")
          .eq("id", botId)
          .maybeSingle();
        const shortCode = (row as { short_code?: string | null } | null)?.short_code ?? null;
        // The company's own bot when it has one; else the shared (trial) bot.
        const own = await orgBot(me.organization_id);
        if (own) {
          const isMain = own.defaultSalesbotId === botId;
          return Response.json({
            url: salesbotStartUrl(own.username, botId),
            shortUrl: salesbotShortUrl(own.username, shortCode, isMain),
            botUsername: own.username,
            ownBot: true,
          });
        }
        try {
          const [username, defaultBotId] = await Promise.all([
            getTelegramBotUsername(),
            getDefaultSalesbotId(),
          ]);
          return Response.json({
            url: salesbotStartUrl(username, botId),
            shortUrl:
              defaultBotId === botId
                ? `https://t.me/${username}`
                : salesbotShortUrl(username, shortCode),
            botUsername: username,
            ownBot: false,
          });
        } catch {
          return Response.json({ error: "telegram_not_configured" }, { status: 503 });
        }
      },
    },
  },
});
