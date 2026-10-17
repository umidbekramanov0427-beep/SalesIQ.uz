import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAmoSyncRun, SYNC_TIME_BUDGET_MS, syncLeadsFromAmo } from "@/lib/amocrm/client.server";
import { orgHasFeature } from "@/lib/org-access";
import { loadAllOrgAccess } from "@/lib/org-access.server";

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

        // One request syncs every company and Vercel stops it at 120 s:
        // the least recently synced go first, all share one deadline, and
        // whoever doesn't fit waits for the next 5-minute run.
        const deadline = Date.now() + SYNC_TIME_BUDGET_MS;
        const { data: connections, error } = await supabaseAdmin
          .from("amocrm_connection")
          .select("organization_id, last_synced_at")
          .order("last_synced_at", { ascending: true, nullsFirst: true });
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const accessByOrg = await loadAllOrgAccess();

        const results: { organizationId: string; synced?: number; error?: string }[] = [];
        for (const conn of connections ?? []) {
          // A downgraded org's connection row (and its synced data) is left
          // alone, but the cron simply stops refreshing it until the org is
          // back on a plan that includes "integrations" -- same
          // grandfathered/gated boundary as connecting in the first place.
          // Also covers an expired (unpaid) org -- its data stays, the cron
          // just stops spending API calls on it until it's paid up again.
          const access = accessByOrg.get(conn.organization_id);
          if (!access || !orgHasFeature(access, "integrations")) {
            results.push({ organizationId: conn.organization_id, error: "plan_lacks_feature" });
            continue;
          }
          if (Date.now() > deadline - 30_000) {
            results.push({ organizationId: conn.organization_id, error: "deferred_no_time" });
            continue;
          }
          const startedAt = new Date().toISOString();
          try {
            const result = await syncLeadsFromAmo(conn.organization_id, { deadline });
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
