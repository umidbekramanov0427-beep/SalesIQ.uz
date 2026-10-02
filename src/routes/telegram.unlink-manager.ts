import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Admin-side counterpart to /telegram/link (which only a user can run for
// their OWN account, by messaging the bot a one-time code -- Telegram has
// no API for an admin to link someone else's chat for them). An admin can,
// however, clear a manager's existing link from the roster shown on the
// Telegram integration card, the same "ulanishni olib tashlash" action the
// reference page's copy describes.
export const Route = createFileRoute("/telegram/unlink-manager")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const body = (await request.json().catch(() => ({}))) as { profileId?: unknown };
          if (typeof body.profileId !== "string") {
            return Response.json({ error: "profileId shart." }, { status: 400 });
          }
          const { error } = await supabaseAdmin
            .from("profiles")
            .update({ telegram_chat_id: null, telegram_link_code: null })
            .eq("id", body.profileId)
            .eq("organization_id", admin.organizationId);
          if (error) return Response.json({ error: error.message }, { status: 400 });
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not unlink.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
