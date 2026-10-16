import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// POST /lead-payments/schedule-stop { id } -> stops a lead's monthly
// payment link; links already sent stay as they are.
export const Route = createFileRoute("/lead-payments/schedule-stop")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const id = typeof body["id"] === "string" ? body["id"] : "";
        const { data, error } = await supabaseAdmin
          .from("lead_payment_schedules")
          .update({ active: false })
          .eq("id", id)
          .eq("organization_id", caller.organizationId)
          .eq("active", true)
          .select("id");
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!data?.length)
          return Response.json({ error: "Oylik to'lov topilmadi." }, { status: 404 });
        return Response.json({ ok: true });
      },
    },
  },
});
