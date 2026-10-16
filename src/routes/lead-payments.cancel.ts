import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// POST /lead-payments/cancel { id } -> closes an unpaid link (the client
// can no longer pay it).
export const Route = createFileRoute("/lead-payments/cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const id = typeof body["id"] === "string" ? body["id"] : "";
        const { data, error } = await supabaseAdmin
          .from("lead_payment_links")
          .update({ status: "cancelled" })
          .eq("id", id)
          .eq("organization_id", caller.organizationId)
          .eq("status", "pending")
          .select("id");
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!data?.length)
          return Response.json({ error: "Bu havolani bekor qilib bo'lmaydi." }, { status: 400 });
        return Response.json({ ok: true });
      },
    },
  },
});
