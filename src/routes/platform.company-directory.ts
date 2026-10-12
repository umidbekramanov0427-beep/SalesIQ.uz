// Server-only. Backs the platform owner's "Kompaniyalar" switcher screen —
// the screen an owner lands on right after logging in, before ever
// reaching a single company's data. Returns the owner's own profile plus,
// per organization: its employee count and its Super Admin's login/
// password (password is null when no organization_admin_credentials row
// exists yet, e.g. an org created before this feature or whose password
// has never been reset since).
import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/platform/company-directory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });

        const [ownerRes, orgsRes, profilesRes, credsRes] = await Promise.all([
          supabaseAdmin
            .from("profiles")
            .select("id, full_name, email")
            .eq("id", ownerId)
            .maybeSingle(),
          supabaseAdmin
            .from("organizations")
            .select("id, name, active, plan, created_at, frozen_at")
            .order("created_at", { ascending: true }),
          supabaseAdmin
            .from("profiles")
            .select("id, organization_id, role, email")
            .not("organization_id", "is", null),
          supabaseAdmin.from("organization_admin_credentials").select("*"),
        ]);

        const orgs = orgsRes.data ?? [];
        const profiles = profilesRes.data ?? [];
        const creds = credsRes.data ?? [];
        const credsByOrg = new Map(creds.map((c) => [c.organization_id, c]));

        const companies = orgs.map((org) => {
          const orgProfiles = profiles.filter((p) => p.organization_id === org.id);
          const superAdmin = orgProfiles.find((p) => p.role === "super_admin");
          const cred = credsByOrg.get(org.id);
          return {
            id: org.id,
            name: org.name,
            active: org.active,
            frozen: org.frozen_at != null,
            plan: org.plan,
            createdAt: org.created_at,
            employeeCount: orgProfiles.length,
            superAdminId: superAdmin?.id ?? null,
            login: superAdmin?.email ?? cred?.super_admin_email ?? null,
            password: cred?.super_admin_password_plaintext ?? null,
          };
        });

        return Response.json({
          owner: {
            id: ownerId,
            name: ownerRes.data?.full_name || ownerRes.data?.email || "",
            email: ownerRes.data?.email ?? "",
          },
          companies,
        });
      },
    },
  },
});
