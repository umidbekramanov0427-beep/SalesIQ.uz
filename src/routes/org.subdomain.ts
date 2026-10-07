import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeSubdomain, subdomainProblem } from "@/lib/subdomain";

// GET  /org/subdomain?name=acme -> { name } of the company on acme.salesiq.uz
//      (public: its login page shows whose workspace it is), or 404.
// POST /org/subdomain { subdomain } -> set/clear the caller's company
//      subdomain (super_admin; platform_owner may pass organizationId).
export const Route = createFileRoute("/org/subdomain")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const name = normalizeSubdomain(new URL(request.url).searchParams.get("name") ?? "");
        if (!name || subdomainProblem(name)) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        const { data } = await supabaseAdmin
          .from("organizations")
          .select("name")
          .eq("subdomain", name)
          .maybeSingle();
        if (!data) return Response.json({ error: "Not found" }, { status: 404 });
        return Response.json(
          { name: data.name },
          { headers: { "cache-control": "public, max-age=300" } },
        );
      },
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data: me } = await supabaseAdmin
          .from("profiles")
          .select("role, organization_id")
          .eq("id", userId)
          .maybeSingle();
        const body = (await request.json().catch(() => null)) as {
          subdomain?: unknown;
          organizationId?: unknown;
        } | null;

        let orgId: string | null = null;
        if (me?.role === "platform_owner" && typeof body?.organizationId === "string") {
          orgId = body.organizationId;
        } else if (me?.role === "super_admin" || me?.role === "platform_owner") {
          orgId = me.organization_id;
        }
        if (!orgId) {
          return Response.json(
            { error: "Only the company admin can change this." },
            { status: 403 },
          );
        }

        const raw = typeof body?.subdomain === "string" ? body.subdomain : "";
        const subdomain = raw.trim() ? normalizeSubdomain(raw) : null;
        if (subdomain) {
          const problem = subdomainProblem(subdomain);
          if (problem) return Response.json({ error: problem }, { status: 400 });
          const { data: taken } = await supabaseAdmin
            .from("organizations")
            .select("id")
            .eq("subdomain", subdomain)
            .neq("id", orgId)
            .maybeSingle();
          if (taken) return Response.json({ error: "taken" }, { status: 409 });
        }
        const { error } = await supabaseAdmin
          .from("organizations")
          .update({ subdomain })
          .eq("id", orgId);
        if (error) {
          return Response.json(
            { error: error.code === "23505" ? "taken" : error.message },
            { status: error.code === "23505" ? 409 : 500 },
          );
        }
        return Response.json({ subdomain });
      },
    },
  },
});
