import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getTelegramBotUsername } from "@/lib/telegram-report.server";
import { botUsername as platformBotUsername, refreshBotTokens } from "@/lib/bot-tokens.server";

function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export const Route = createFileRoute("/telegram/link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const code = randomCode();
        const { data: caller, error } = await supabaseAdmin
          .from("profiles")
          .update({ telegram_link_code: code, telegram_chat_id: null })
          .eq("id", userId)
          .select("organization_id")
          .single();
        if (error) return Response.json({ error: error.message }, { status: 400 });

        // People link to the platform's companies' bot (Platforma -> Botlar),
        // else the clients' bot -- whatever is set there now. (An old
        // per-company bot name in integration_settings is no longer used.)
        await refreshBotTokens();
        const botUsername =
          (await platformBotUsername("staff")) ??
          (await getTelegramBotUsername().catch(() => null));

        return Response.json({ code, botUsername });
      },
    },
  },
});
