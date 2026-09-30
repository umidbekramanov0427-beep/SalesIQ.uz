import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAmoSyncRun, syncLeadsFromAmo } from "@/lib/amocrm/client.server";
import { planHasFeature } from "@/lib/plan-gating";

// Called on a schedule (see the pg_cron job in the accompanying migration),
// not by a browser — same shared-secret pattern as
// telegram.send-daily-report.ts, since there's no logged-in super_admin
// session to check here. Syncs every organization that has an AmoCRM
// connection, one at a time so one org's failure can't take down the rest.
export const Route = createFileRoute("/integrations/amocrm/sync-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CRON_SECRET"];
        const got = request.headers.get("x-cron-secret");
        if (!expected || got !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: connections, error } = await supabaseAdmin
          .from("amocrm_connection")
          .select("organization_id");
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const { data: orgs } = await supabaseAdmin.from("organizations").select("id, plan");
        const planByOrgId = new Map((orgs ?? []).map((o) => [o.id, o.plan]));

        const results: { organizationId: string; synced?: number; error?: string }[] = [];
        for (const conn of connections ?? []) {
          // A downgraded org's connection row (and its synced data) is left
          // alone, but the cron simply stops refreshing it until the org is
          // back on a plan that includes "integrations" -- same
          // grandfathered/gated boundary as connecting in the first place.
          if (!planHasFeature(planByOrgId.get(conn.organization_id), "integrations")) {
            results.push({ organizationId: conn.organization_id, error: "plan_lacks_feature" });
            continue;
          }
          const startedAt = new Date().toISOString();
          try {
            const result = await syncLeadsFromAmo(conn.organization_id);
            await logAmoSyncRun(conn.organization_id, "cron", startedAt, result);
            results.push({ organizationId: conn.organization_id, ...result });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            await logAmoSyncRun(conn.organization_id, "cron", startedAt, {
              synced: 0,
              error: message,
            });
            results.push({ organizationId: conn.organization_id, error: message });
          }
        }

        return Response.json({ organizations: results.length, results });
      },
    },
  },
});
