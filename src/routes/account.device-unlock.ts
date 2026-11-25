import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// «Operator qurilma qulfi»: the company admin frees a person's device, so the
// next device they sign in from becomes theirs. Only within the admin's own
// company.
export const Route = createFileRoute("/account/device-unlock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Not allowed." }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as { profileId?: unknown };
        if (typeof body.profileId !== "string")
          return Response.json({ error: "profileId required." }, { status: 400 });
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ bound_device_id: null })
          .eq("id", body.profileId)
          .eq("organization_id", admin.organizationId);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
