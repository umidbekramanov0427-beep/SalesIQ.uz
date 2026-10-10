import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validateInitData } from "@/lib/telegram/init-data.server";

// Polled by /tma/lead after the client shared their number: "done" once
// the bot has received the contact and created (or found) the lead. Only
// the Telegram user who started the request can read it.
export const Route = createFileRoute("/tma/lead-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["TELEGRAM_BOT_TOKEN"];
        if (!token) return Response.json({ error: "not_configured" }, { status: 503 });
        const body = (await request.json().catch(() => ({}))) as {
          initData?: string;
          requestId?: string;
        };
        const valid = validateInitData(body.initData ?? "", token);
        if (!valid || !body.requestId) return Response.json({ error: "invalid" }, { status: 401 });

        const { data: row } = await supabaseAdmin
          .from("tma_lead_requests")
          .select("status, duplicate, telegram_user_id")
          .eq("id", body.requestId)
          .maybeSingle();
        if (!row || Number(row.telegram_user_id) !== valid.user.id) {
          return Response.json({ error: "not_found" }, { status: 404 });
        }
        return Response.json({ status: row.status, duplicate: row.duplicate });
      },
    },
  },
});
