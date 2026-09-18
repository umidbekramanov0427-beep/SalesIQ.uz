import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getTelegramBotUsername } from "@/lib/telegram-report.server";

// Public, unauthenticated by design -- this IS the sign-in mechanism, so
// there's no session yet to check. Issues a short-lived, single-use
// opaque token the browser embeds in a t.me deep link; the bot's webhook
// (telegram.webhook.ts) is the only thing that can ever mark it confirmed.
export const Route = createFileRoute("/telegram/login-start")({
  server: {
    handlers: {
      POST: async () => {
        let botUsername: string;
        try {
          botUsername = await getTelegramBotUsername();
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Telegram bot orqali kirish sozlanmagan.";
          return Response.json({ error: message }, { status: 500 });
        }

        const token = crypto.randomUUID().replace(/-/g, "");
        const { error } = await supabaseAdmin.from("telegram_login_requests").insert({ token });
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ token, botUsername });
      },
    },
  },
});
