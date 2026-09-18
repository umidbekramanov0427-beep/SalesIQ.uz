import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyOnboardingProposal, type OnboardingProposal } from "@/lib/ai-onboarding.server";

export const Route = createFileRoute("/onboarding/ai-setup/apply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) {
            return Response.json({ error: "Only admins can apply this." }, { status: 403 });
          }

          const { data: row } = await supabaseAdmin
            .from("org_ai_onboarding")
            .select("status, proposal")
            .eq("organization_id", admin.organizationId)
            .maybeSingle();

          if (!row?.proposal || row.status === "applied") {
            return Response.json({ error: "No pending proposal to apply." }, { status: 400 });
          }

          await applyOnboardingProposal(
            admin.organizationId,
            row.proposal as unknown as OnboardingProposal,
            admin.id,
          );

          return Response.json({ applied: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
