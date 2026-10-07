import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ALLOWED_ROLES = new Set(["super_admin", "rop", "sotuv_menejeri", "amaliyotchi"]);
// "amaliyotchi" (intern) is stored as a Sotuv menejeri with is_intern = true
// (see 20261016000000_intern_mentor.sql); every other role clears it.
function tashkentToday(): string {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type Body = {
  organization_id?: string;
  email?: string;
  password?: string;
  full_name?: string;
  role?: string;
};

export const Route = createFileRoute("/platform/add-employee")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const organizationId = body.organization_id?.trim();
        const email = body.email?.trim();
        const password = body.password;
        const fullName = body.full_name?.trim() ?? "";
        const role = body.role;

        if (!organizationId || !email || !password || password.length < 8) {
          return Response.json(
            { error: "Company, email and an 8+ character password are required." },
            { status: 400 },
          );
        }
        if (!role || !ALLOWED_ROLES.has(role)) {
          return Response.json({ error: "A valid role is required." }, { status: 400 });
        }

        const { data: org } = await supabaseAdmin
          .from("organizations")
          .select("id")
          .eq("id", organizationId)
          .maybeSingle();
        if (!org) return Response.json({ error: "Company not found." }, { status: 404 });

        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            role: role === "amaliyotchi" ? "sotuv_menejeri" : role,
            organization_id: organizationId,
          },
        });
        if (userError || !userData.user) {
          return Response.json(
            { error: userError?.message ?? "Could not create the account." },
            { status: 400 },
          );
        }

        if (role === "amaliyotchi") {
          await supabaseAdmin
            .from("profiles")
            .update({
              is_intern: true,
              internship_start_date: tashkentToday(),
              internship_days: 14,
            })
            .eq("id", userData.user.id);
        }

        return Response.json({ id: userData.user.id }, { status: 200 });
      },
    },
  },
});
