import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember, requireSuperAdmin } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { instagramConfigured, instagramRedirectUri } from "@/lib/instagram/instagram.server";

// GET /integrations/instagram/account -> the company's Instagram connection
// (never the token). DELETE -> disconnects it; leads and their chat history
// stay.
export const Route = createFileRoute("/integrations/instagram/account")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data, error } = await supabaseAdmin
          .from("instagram_accounts")
          .select(
            "username, name, picture_url, connected_at, last_event_at, last_error, token_expires_at",
          )
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        const app = (process.env["PUBLIC_APP_URL"] ?? "https://salesiq.uz").replace(/\/$/, "");
        return Response.json({
          configured: instagramConfigured(),
          // The table arrives with migration 20261130000000.
          ready: !error,
          account: data ?? null,
          redirectUri: instagramRedirectUri(),
          webhookUrl: `${app}/integrations/instagram/webhook`,
        });
      },
      DELETE: async ({ request }) => {
        const caller = await requireSuperAdmin(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { error } = await supabaseAdmin
          .from("instagram_accounts")
          .delete()
          .eq("organization_id", caller.organizationId);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
