import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDefaultSalesbotId } from "@/lib/salesbots/default-bot.server";

// The salesbot the platform bot's plain link (t.me/<bot>) opens.
//   GET  -> { defaultId, bots: [{ id, name, enabled, organizationName }] }
//   POST { botId: string | null } -> sets or clears it
// Platform owner only.
export const Route = createFileRoute("/platform/salesbots")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request))) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        const [{ data: bots, error }, defaultId] = await Promise.all([
          supabaseAdmin
            .from("salesbots")
            .select("id, name, enabled, channel, kind, organization_id, organizations(name)")
            .order("created_at", { ascending: false })
            .limit(500),
          getDefaultSalesbotId(),
        ]);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({
          defaultId,
          bots: (bots ?? [])
            // Only bots that talk on Telegram can be opened from the bot link.
            .filter(
              (b) => ["auto", "telegram"].includes(b.channel ?? "auto") && b.kind !== "external",
            )
            .map((b) => ({
              id: b.id,
              name: b.name,
              enabled: b.enabled,
              organizationName:
                (b.organizations as { name?: string } | null)?.name ?? b.organization_id,
            })),
        });
      },
      POST: async ({ request }) => {
        if (!(await requirePlatformOwner(request))) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        const body = (await request.json().catch(() => ({}))) as { botId?: unknown };
        const botId = typeof body.botId === "string" && body.botId ? body.botId : null;
        if (botId) {
          const { data: bot } = await supabaseAdmin
            .from("salesbots")
            .select("id")
            .eq("id", botId)
            .maybeSingle();
          if (!bot) return Response.json({ error: "Not found" }, { status: 404 });
        }
        const { error } = await supabaseAdmin
          .from("platform_settings")
          .update({ default_salesbot_id: botId })
          .eq("id", true);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, defaultId: botId });
      },
    },
  },
});
