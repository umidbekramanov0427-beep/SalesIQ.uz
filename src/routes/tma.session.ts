import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validateInitData } from "@/lib/telegram/init-data.server";

// Signs a staff member into SalesIQ from inside the Telegram Mini App with
// no password: Telegram's signed launch data proves which Telegram user
// opened it, and that user's private chat id is exactly the
// profiles.telegram_chat_id they linked in Sozlamalar -> Telegram bot. The
// answer is a one-time magic-link token hash -- the same credential the
// "Telegram orqali kirish" button on /login already uses -- which the page
// exchanges for a normal Supabase session (verifyOtp). Seat limits and an
// expired subscription are still enforced by the app after sign-in.
export const Route = createFileRoute("/tma/session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["TELEGRAM_BOT_TOKEN"];
        if (!token) return Response.json({ error: "not_configured" }, { status: 503 });
        const body = (await request.json().catch(() => ({}))) as { initData?: string };
        const valid = validateInitData(body.initData ?? "", token);
        if (!valid) return Response.json({ error: "invalid" }, { status: 401 });

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name")
          .eq("telegram_chat_id", valid.user.id)
          .maybeSingle();
        if (!profile?.email) return Response.json({ error: "not_linked" }, { status: 404 });

        const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: profile.email,
        });
        if (error || !link?.properties?.hashed_token) {
          return Response.json({ error: "failed" }, { status: 500 });
        }
        return Response.json({
          tokenHash: link.properties.hashed_token,
          name: profile.full_name,
        });
      },
    },
  },
});
