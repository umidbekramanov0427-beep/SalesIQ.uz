import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadSetupMap } from "@/lib/ai/setup-map.server";

// GET /account/setup-map -> { state } : the company's «Sozlash xaritasi»
// for the AI assistant's map card (company admin only).
export const Route = createFileRoute("/account/setup-map")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireSuperAdmin(request);
        if (!me) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("telegram_chat_id")
          .eq("id", me.id)
          .maybeSingle();
        const state = await loadSetupMap(me.organizationId, !!profile?.telegram_chat_id);
        return Response.json({ state });
      },
    },
  },
});
