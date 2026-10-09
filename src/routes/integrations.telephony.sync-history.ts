import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncOnlinePbxHistory } from "@/lib/telephony/telephony-data.server";

// The phone widget calls this when it opens: OnlinePBX's call history for
// the last hours is pulled into pbx_calls, so incoming and missed calls
// (and calls dialled straight from a desk phone) show up even where the
// PBX webhook isn't configured. Throttled server-side; never fails the UI.
export const Route = createFileRoute("/integrations/telephony/sync-history")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const member = await requireOrgMember(request);
        if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as {
          force?: unknown;
          hours?: unknown;
        };
        const { data: me } = await supabaseAdmin
          .from("profiles")
          .select("role")
          .eq("id", member.id)
          .maybeSingle();
        const isAdmin = ["super_admin", "rop", "platform_owner"].includes(me?.role ?? "");
        try {
          const result = await syncOnlinePbxHistory(member.organizationId, {
            force: isAdmin && body.force === true,
            ...(isAdmin && typeof body.hours === "number"
              ? { hours: Math.min(Math.max(body.hours, 1), 24 * 31) }
              : {}),
          });
          return Response.json(result);
        } catch (err) {
          return Response.json({
            synced: 0,
            error: err instanceof Error ? err.message : "Sinxronlab bo'lmadi",
          });
        }
      },
    },
  },
});
