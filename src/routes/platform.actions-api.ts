import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";

// GET /platform/actions-api?days=7&userId=<id> -- Owner → Amallar: what the
// people with owner-panel access did, newest first: the pages they opened,
// the owner actions (any POST to /platform/*, trailed by apiFetch), failed
// attempts and the audit log rows written in their name. Platform owners
// only; read with the service role.
export const Route = createFileRoute("/platform/actions-api")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 7));
        const only = url.searchParams.get("userId");
        const since = new Date(Date.now() - days * 86_400_000).toISOString();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: owners } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email")
          .eq("role", "platform_owner");
        const people = (owners ?? []).map((p) => ({
          id: p.id,
          name: p.full_name || p.email || "—",
          email: p.email,
        }));
        const ids = people.map((p) => p.id).filter((id) => !only || id === only);
        if (ids.length === 0) return Response.json({ people, events: [] });

        const [{ data: trail }, { data: audit }] = await Promise.all([
          supabaseAdmin
            .from("user_session_events")
            .select("created_at, user_id, kind, label, path, meta")
            .in("user_id", ids)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(1500),
          supabaseAdmin
            .from("audit_logs")
            .select("created_at, actor_id, action, entity_type, meta, organization_id")
            .in("actor_id", ids)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(500),
        ]);

        // Company names for audit rows / owner actions that name a company.
        const orgIds = new Set<string>();
        for (const a of audit ?? []) if (a.organization_id) orgIds.add(a.organization_id);
        for (const e of trail ?? []) {
          const m = (e.meta ?? {}) as Record<string, unknown>;
          for (const k of ["organizationId", "orgId"]) {
            const v = m[k];
            if (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)) orgIds.add(v);
          }
        }
        const { data: orgs } = orgIds.size
          ? await supabaseAdmin
              .from("organizations")
              .select("id, name")
              .in("id", [...orgIds])
          : { data: [] as { id: string; name: string }[] };
        const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));

        const events = [
          ...(trail ?? []).map((e) => {
            const meta = (e.meta ?? {}) as Record<string, string>;
            const org = meta["organizationId"] ?? meta["orgId"];
            return {
              at: e.created_at,
              userId: e.user_id,
              kind: e.kind,
              label: e.label,
              path: e.path,
              meta,
              company: org ? (orgName.get(org) ?? null) : null,
            };
          }),
          ...(audit ?? []).map((a) => ({
            at: a.created_at,
            userId: a.actor_id,
            kind: "audit",
            label: a.action,
            path: null,
            meta: { entity: a.entity_type },
            company: a.organization_id ? (orgName.get(a.organization_id) ?? null) : null,
          })),
        ].sort((a, b) => (a.at < b.at ? 1 : -1));

        return Response.json(
          { people, events: events.slice(0, 1500) },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
