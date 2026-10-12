import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncOrgAdminCredentials } from "@/lib/organization-admin-credentials.server";
import { normalizePlan } from "@/lib/plan-gating";
import { SELF_SIGNUP_TRIAL_DAYS } from "@/lib/org-access";

// New companies self-provisioning here always land on this fixed trial --
// same idea as the platform owner's own trial_days field on
// platform.create-organization.ts, just with no choice exposed publicly.
// The length is SELF_SIGNUP_TRIAL_DAYS (org-access.ts).

type Body = {
  companyName?: string;
  fullName?: string;
  email?: string;
  password?: string;
  plan?: string;
};

// Public, unauthenticated by design -- this IS how a brand-new company
// gets its first account, without the platform owner ever touching
// Supabase's own Authentication dashboard or the Platform panel. Creates
// the organization, its first super_admin, and nothing else (no ROP --
// the super_admin adds their team from inside the app once they're in).
export const Route = createFileRoute("/signup/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Body;
        const companyName = body.companyName?.trim();
        const fullName = body.fullName?.trim();
        const email = body.email?.trim();
        const password = body.password;

        if (!companyName || !fullName || !email || !password || password.length < 8) {
          return Response.json(
            {
              error:
                "Company name, full name, a valid email and an 8+ character password are required.",
            },
            { status: 400 },
          );
        }

        const trialEndsAt = new Date(
          Date.now() + SELF_SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString();

        const plan = normalizePlan(body.plan);
        const { data: org, error: orgError } = await supabaseAdmin
          .from("organizations")
          .insert({ name: companyName, plan, trial_ends_at: trialEndsAt, active: true })
          .select()
          .single();
        if (orgError || !org) {
          return Response.json(
            { error: orgError?.message ?? "Could not create the organization." },
            { status: 400 },
          );
        }

        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            role: "super_admin",
            organization_id: org.id,
          },
        });
        if (userError || !userData.user) {
          await supabaseAdmin.from("organizations").delete().eq("id", org.id);
          return Response.json(
            { error: userError?.message ?? "Could not create the account." },
            { status: 400 },
          );
        }
        await syncOrgAdminCredentials(org.id, userData.user.id, email, password);

        return Response.json({ ok: true }, { status: 200 });
      },
    },
  },
});
