import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePlan } from "@/lib/plan-gating";
import { SELF_SIGNUP_TRIAL_DAYS } from "@/lib/org-access";
import { recordReferral } from "@/lib/referral.server";
import { createSignupLead } from "@/lib/company-leads.server";
import { normalizePhone, TEAM_SIZES } from "@/lib/applications";
import { CURRENT_TOOLS } from "@/lib/company-leads";

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
  /** Taklif dasturi code from ?ref= (remembered by the browser). */
  ref?: string;
  /** The sign-up wizard's questions and the booked call (owner -> Arizalar). */
  phone?: string;
  business?: string;
  salesReps?: string;
  currentTool?: string;
  meetingAt?: string | null;
  utm?: Record<string, string>;
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
        const bonusDays = body.ref ? await recordReferral(org.id, body.ref) : 0;
        // The owner's lead for this company (with the booked call); the
        // account works even if this fails.
        const phone = normalizePhone(String(body.phone ?? "").slice(0, 40));
        const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
        const { meetingAt } = await createSignupLead({
          organizationId: org.id,
          name: fullName,
          phone: phone || "—",
          email,
          company: companyName,
          plan,
          business: clip(body.business, 300) || null,
          salesReps: (TEAM_SIZES as readonly string[]).includes(body.salesReps ?? "")
            ? body.salesReps!
            : null,
          currentTool: (CURRENT_TOOLS as readonly string[]).includes(body.currentTool ?? "")
            ? body.currentTool!
            : null,
          meetingAt: typeof body.meetingAt === "string" ? body.meetingAt : null,
          utm: Object.fromEntries(
            Object.entries(body.utm ?? {})
              .filter(([k, v]) => /^utm_[a-z]{3,10}$/.test(k) && typeof v === "string")
              .slice(0, 8)
              .map(([k, v]) => [k, String(v).slice(0, 120)]),
          ),
        }).catch((err) => {
          console.error("[signup] lead", err);
          return { meetingAt: null };
        });
        return Response.json({ ok: true, bonusDays, meetingAt }, { status: 200 });
      },
    },
  },
});
