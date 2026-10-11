import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ROOT_DOMAIN, normalizeSubdomain, subdomainProblem } from "@/lib/subdomain";
import { attachDomain, detachDomain, domainStatus } from "@/lib/vercel-domains.server";

// GET  /org/subdomain?name=acme -> { name } of the company on acme.salesiq.uz
//      (public: its login page shows whose workspace it is), or 404.
// GET  /org/subdomain?status=1 -> { subdomain, status } of the caller's
//      company address on Vercel (see vercel-domains.server.ts); attaches it
//      if it isn't yet, so an address saved before the API token existed
//      starts working on its own. Company admins see their own;
//      platform_owner may pass organizationId.
// POST /org/subdomain { subdomain, organizationId } -> set/clear a
//      company's subdomain and attach the new address to the Vercel project
//      / detach the old one. Platform owner only: the address is part of
//      what SalesIQ hands a company when it buys the platform.

const hostOf = (sub: string) => `${sub}.${ROOT_DOMAIN}`;

async function callerOrg(
  request: Request,
  requested: unknown,
): Promise<{ orgId: string | null; userId: string | null; owner: boolean }> {
  const userId = await getRequestUserId(request);
  if (!userId) return { orgId: null, userId: null, owner: false };
  const { data: me } = await supabaseAdmin
    .from("profiles")
    .select("role, organization_id")
    .eq("id", userId)
    .maybeSingle();
  const owner = me?.role === "platform_owner";
  if (owner && typeof requested === "string" && requested) {
    return { orgId: requested, userId, owner };
  }
  if (me?.role === "super_admin" || owner) {
    return { orgId: me?.organization_id ?? null, userId, owner };
  }
  return { orgId: null, userId, owner };
}
export const Route = createFileRoute("/org/subdomain")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.has("status")) {
          const { orgId, userId } = await callerOrg(request, params.get("organizationId"));
          if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
          if (!orgId) return Response.json({ error: "Forbidden" }, { status: 403 });
          const { data: org } = await supabaseAdmin
            .from("organizations")
            .select("subdomain")
            .eq("id", orgId)
            .maybeSingle();
          const sub = org?.subdomain ?? null;
          if (!sub) return Response.json({ subdomain: null, status: null });
          let status = await domainStatus(hostOf(sub));
          if (status === "missing") status = await attachDomain(hostOf(sub));
          return Response.json({ subdomain: sub, status });
        }
        const name = normalizeSubdomain(params.get("name") ?? "");
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
        const body = (await request.json().catch(() => null)) as {
          subdomain?: unknown;
          organizationId?: unknown;
        } | null;
        const { orgId, userId, owner } = await callerOrg(request, body?.organizationId);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (!owner || !orgId) {
          return Response.json(
            { error: "Only the platform owner assigns company addresses." },
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
        const { data: before } = await supabaseAdmin
          .from("organizations")
          .select("subdomain")
          .eq("id", orgId)
          .maybeSingle();
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
        const old = before?.subdomain ?? null;
        if (old && old !== subdomain) await detachDomain(hostOf(old));
        const status = subdomain ? await attachDomain(hostOf(subdomain)) : null;
        return Response.json({ subdomain, status });
      },
    },
  },
});
