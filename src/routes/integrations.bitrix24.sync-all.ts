import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logBitrix24SyncRun, syncDealsFromBitrix24 } from "@/lib/bitrix24/client.server";
import { orgHasFeature } from "@/lib/org-access";
import { loadAllOrgAccess } from "@/lib/org-access.server";

// Called on a schedule (see the pg_cron job in
// 20261011010000_bitrix24_auto_sync_cron.sql), not by a browser -- same
// shared-secret pattern as integrations/amocrm/sync-all. Syncs every
// organization with a Bitrix24 connection, one at a time so one org's
// failure can't take down the rest.
export const Route = createFileRoute("/integrations/bitrix24/sync-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CRON_SECRET"];
        const got = request.headers.get("x-cron-secret");
        if (!expected || got !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: connections, error } = await supabaseAdmin
          .from("bitrix24_connection")
          .select("organization_id");
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const accessByOrg = await loadAllOrgAccess();

        const results: { organizationId: string; synced?: number; error?: string }[] = [];
        for (const conn of connections ?? []) {
          // Same downgrade behavior as amocrm/sync-all: leave the
          // connection/data alone, just stop refreshing it once the org's
          // plan no longer includes "integrations".
          // Also covers an expired (unpaid) org -- its data stays, the cron
          // just stops spending API calls on it until it's paid up again.
          const access = accessByOrg.get(conn.organization_id);
          if (!access || !orgHasFeature(access, "integrations")) {
            results.push({ organizationId: conn.organization_id, error: "plan_lacks_feature" });
            continue;
          }
          const startedAt = new Date().toISOString();
          try {
            const result = await syncDealsFromBitrix24(conn.organization_id);
            await logBitrix24SyncRun(conn.organization_id, "cron", startedAt, result);
            results.push({ organizationId: conn.organization_id, ...result });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            await logBitrix24SyncRun(conn.organization_id, "cron", startedAt, {
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
