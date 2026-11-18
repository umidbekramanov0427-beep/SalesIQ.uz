import crypto from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { marketingBot } from "@/lib/marketing-bot/bot.server";
import { handleMarketingUpdate, type MarketingUpdate } from "@/lib/marketing-bot/handlers.server";

// POST /telegram/marketing/<company id> -- updates from the company's
// marketing bot (Marketing -> Sozlash -> Bot): marketing people's console
// and /holat, and the channels it is an admin of (joins, leaves, join
// requests, posts, reactions). Checked by the secret given to Telegram.

export const Route = createFileRoute("/telegram/marketing/$orgId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const orgId = params.orgId;
        const bot = /^[0-9a-f-]{36}$/i.test(orgId) ? await marketingBot(orgId) : null;
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (
          !bot ||
          got.length !== bot.webhookSecret.length ||
          !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(bot.webhookSecret))
        ) {
          return Response.json({ ok: false }, { status: 401 });
        }
        const update = (await request.json().catch(() => ({}))) as MarketingUpdate;
        await handleMarketingUpdate(bot, update).catch((err) =>
          console.error("[marketing-bot] update", err),
        );
        return Response.json({ ok: true });
      },
    },
  },
});
