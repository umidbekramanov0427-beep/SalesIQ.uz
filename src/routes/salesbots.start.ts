import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { startSalesbot } from "@/lib/automations/engine.server";

// "Salesbotni ishga tushirish" from a lead page: runs the chosen bot for
// one lead right now, as the signed-in user.
export const Route = createFileRoute("/salesbots/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => null)) as {
          botId?: unknown;
          leadId?: unknown;
        } | null;
        const botId = typeof body?.botId === "string" ? body.botId : "";
        const leadId = typeof body?.leadId === "string" ? body.leadId : "";
        if (!botId || !leadId) {
          return Response.json({ error: "botId and leadId are required" }, { status: 400 });
        }
        const [{ data: me }, { data: lead }] = await Promise.all([
          supabaseAdmin.from("profiles").select("organization_id").eq("id", userId).maybeSingle(),
          supabaseAdmin.from("leads").select("organization_id").eq("id", leadId).maybeSingle(),
        ]);
        if (!me?.organization_id || lead?.organization_id !== me.organization_id) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        const result = await startSalesbot(me.organization_id, botId, leadId, userId);
        if ("error" in result) return Response.json(result, { status: 400 });
        return Response.json(result);
      },
    },
  },
});
