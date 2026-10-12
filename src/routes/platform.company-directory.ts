// Server-only. Backs the platform owner's "Kompaniyalar" switcher screen —
// the screen an owner lands on right after logging in, before ever
// reaching a single company's data. Returns the owner's own profile plus,
// per organization: its employee count and its Super Admin's login. No
// passwords: "Kirish" signs in through /platform/enter-company.
import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/platform/company-directory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });

        const [ownerRes, orgsRes, profilesRes] = await Promise.all([
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
            .select("id, organization_id, role, email, created_at")
            .not("organization_id", "is", null)
            .order("created_at", { ascending: true }),
        ]);

        const orgs = orgsRes.data ?? [];
        const profiles = profilesRes.data ?? [];

        const companies = orgs.map((org) => {
          const orgProfiles = profiles.filter((p) => p.organization_id === org.id);
          const superAdmin = orgProfiles.find((p) => p.role === "super_admin");
          return {
            id: org.id,
            name: org.name,
            active: org.active,
            frozen: org.frozen_at != null,
            plan: org.plan,
            createdAt: org.created_at,
            employeeCount: orgProfiles.length,
            superAdminId: superAdmin?.id ?? null,
            login: superAdmin?.email ?? null,
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
