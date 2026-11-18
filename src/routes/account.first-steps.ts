import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadFirstSteps } from "@/lib/first-steps.server";
import { orgPhase } from "@/lib/org-access";
import { loadOrgAccess } from "@/lib/org-access.server";
import { showFirstSteps } from "@/lib/first-steps";

// GET /account/first-steps -> { show, steps }: the company owner's
// "Birinchi qadamlar" checklist (src/lib/first-steps.ts). Only super
// admins get one; for everyone else show is false.
export const Route = createFileRoute("/account/first-steps")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const orgId = caller.organizationId;
        const { data: me } = await supabaseAdmin
          .from("profiles")
          .select("role, telegram_chat_id")
          .eq("id", caller.id)
          .maybeSingle();
        if (me?.role !== "super_admin") return Response.json({ show: false });

        const [access, { steps, createdAt }] = await Promise.all([
          loadOrgAccess(orgId),
          loadFirstSteps(orgId, !!me.telegram_chat_id),
        ]);
        const show = showFirstSteps({
          phase: access ? orgPhase(access) : "active",
          createdAt,
          state: steps,
        });
        return Response.json({ show, steps });
      },
    },
  },
});
