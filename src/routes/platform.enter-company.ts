// Server-only. The platform owner's "Kirish" on Kompaniyalar: signs the
// owner's browser in as that company's Super Admin without anyone's
// password. Supabase issues a one-time sign-in token for the Super Admin
// (generateLink sends no email); the browser trades it for a session with
// verifyOtp. Replaces the old way, which kept every Super Admin's password
// in plain text so the owner could type it in.
import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/platform/enter-company")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });

        const body = (await request.json().catch(() => ({}))) as { orgId?: string };
        const orgId = body.orgId?.trim();
        if (!orgId) return Response.json({ error: "orgId is required." }, { status: 400 });

        const { data: admin } = await supabaseAdmin
          .from("profiles")
          .select("id, email")
          .eq("organization_id", orgId)
          .eq("role", "super_admin")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!admin?.email) {
          return Response.json({ error: "Bu kompaniyada Super Admin yo'q." }, { status: 404 });
        }

        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: admin.email,
        });
        const tokenHash = data?.properties?.hashed_token;
        if (error || !tokenHash) {
          return Response.json(
            { error: error?.message ?? "Kirish havolasini yaratib bo'lmadi." },
            { status: 500 },
          );
        }

        // The company's own audit trail shows that the platform owner came in.
        await supabaseAdmin.from("audit_logs").insert({
          organization_id: orgId,
          actor_id: ownerId,
          action: "platform_owner_enter",
          entity_type: "organizations",
          entity_id: orgId,
          meta: { as_user: admin.id },
        });

        return Response.json({ tokenHash, email: admin.email });
      },
    },
  },
});
