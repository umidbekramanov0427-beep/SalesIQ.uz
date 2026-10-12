import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePlan } from "@/lib/plan-gating";

type Body = {
  name?: string;
  admin_email?: string;
  admin_password?: string;
  admin_full_name?: string;
  rop_email?: string;
  rop_password?: string;
  rop_full_name?: string;
  phone?: string;
  plan?: string;
  trial_days?: number;
};

export const Route = createFileRoute("/platform/create-organization")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const name = body.name?.trim();
        const email = body.admin_email?.trim();
        const password = body.admin_password;
        const fullName = body.admin_full_name?.trim() ?? "";
        const ropEmail = body.rop_email?.trim();
        const ropPassword = body.rop_password;
        const ropFullName = body.rop_full_name?.trim() ?? "";

        if (!name || !email || !password || password.length < 8) {
          return Response.json(
            {
              error: "Company name, admin email and an 8+ character password are required.",
            },
            { status: 400 },
          );
        }
        if (!ropEmail || !ropPassword || ropPassword.length < 8) {
          return Response.json(
            { error: "A ROP (department head) email and an 8+ character password are required." },
            { status: 400 },
          );
        }

        const phone = body.phone?.trim() || null;
        const plan = normalizePlan(body.plan);
        const trialDays =
          typeof body.trial_days === "number" && body.trial_days > 0 ? body.trial_days : null;
        const trialEndsAt = trialDays
          ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()
          : null;

        const { data: org, error: orgError } = await supabaseAdmin
          .from("organizations")
          .insert({ name, created_by: ownerId, phone, plan, trial_ends_at: trialEndsAt })
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
            { error: userError?.message ?? "Could not create the admin account." },
            { status: 400 },
          );
        }

        const { data: ropData, error: ropError } = await supabaseAdmin.auth.admin.createUser({
          email: ropEmail,
          password: ropPassword,
          email_confirm: true,
          user_metadata: {
            full_name: ropFullName,
            role: "rop",
            organization_id: org.id,
          },
        });
        if (ropError || !ropData.user) {
          await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
          await supabaseAdmin.from("organizations").delete().eq("id", org.id);
          return Response.json(
            { error: ropError?.message ?? "Could not create the ROP account." },
            { status: 400 },
          );
        }

        return Response.json(
          { organizationId: org.id, adminId: userData.user.id, ropId: ropData.user.id },
          { status: 200 },
        );
      },
    },
  },
});
