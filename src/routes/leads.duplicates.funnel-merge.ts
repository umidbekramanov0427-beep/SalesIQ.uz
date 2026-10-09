import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mergeFunnelGroup } from "@/lib/leads/lead-merge.server";

// Merges groups of one client's leads within one funnel into the oldest
// lead of each group. Admins and ROPs only.
export const Route = createFileRoute("/leads/duplicates/funnel-merge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("role")
          .eq("id", caller.id)
          .maybeSingle();
        if (!["super_admin", "rop", "platform_owner"].includes(profile?.role ?? "")) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = (await request.json().catch(() => ({}))) as { groups?: unknown };
        const groups = Array.isArray(body.groups)
          ? body.groups
              .filter((g): g is unknown[] => Array.isArray(g))
              .map((g) => g.filter((id): id is string => typeof id === "string"))
              .filter((g) => g.length > 1)
              .slice(0, 500)
          : [];
        if (groups.length === 0) {
          return Response.json({ error: "groups is required." }, { status: 400 });
        }

        let merged = 0;
        let groupsDone = 0;
        const errors: string[] = [];
        for (const g of groups) {
          try {
            const r = await mergeFunnelGroup(caller.organizationId, g);
            merged += r.merged;
            groupsDone++;
          } catch (err) {
            errors.push(err instanceof Error ? err.message : String(err));
          }
        }
        return Response.json({ ok: true, groups: groupsDone, merged, errors: errors.slice(0, 5) });
      },
    },
  },
});
