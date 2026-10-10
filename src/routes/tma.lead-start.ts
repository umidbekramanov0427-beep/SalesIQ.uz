import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { telegramDisplayName, validateInitData } from "@/lib/telegram/init-data.server";

// Step 1 of the client-side Mini App (/tma/lead?org=<id>): remembers that
// this Telegram user opened the Mini App of this organization, so the
// contact Telegram sends to the bot a moment later (step 2, handled in
// telegram.webhook.ts) can be turned into a lead of the right business.
export const Route = createFileRoute("/tma/lead-start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["TELEGRAM_BOT_TOKEN"];
        if (!token) return Response.json({ error: "not_configured" }, { status: 503 });
        const body = (await request.json().catch(() => ({}))) as {
          initData?: string;
          org?: string;
        };
        const valid = validateInitData(body.initData ?? "", token);
        if (!valid) return Response.json({ error: "invalid" }, { status: 401 });

        // The org may come from the page URL or from the bot's
        // t.me/<bot>/<app>?startapp=<org> deep link.
        const orgId = (body.org || valid.startParam || "").trim();
        if (!/^[0-9a-f-]{36}$/i.test(orgId)) {
          return Response.json({ error: "no_org" }, { status: 400 });
        }
        const { data: org } = await supabaseAdmin
          .from("organizations")
          .select("id, name, active")
          .eq("id", orgId)
          .maybeSingle();
        if (!org || org.active === false) {
          return Response.json({ error: "no_org" }, { status: 404 });
        }

        const { data: row, error } = await supabaseAdmin
          .from("tma_lead_requests")
          .insert({
            organization_id: org.id,
            telegram_user_id: valid.user.id,
            telegram_name: telegramDisplayName(valid.user) || null,
            telegram_username: valid.user.username ?? null,
          })
          .select("id")
          .single();
        if (error || !row) return Response.json({ error: "failed" }, { status: 500 });

        return Response.json({ requestId: row.id, orgName: org.name });
      },
    },
  },
});
