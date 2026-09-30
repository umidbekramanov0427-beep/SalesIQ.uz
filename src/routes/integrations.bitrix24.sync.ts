import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { logBitrix24SyncRun, syncDealsFromBitrix24 } from "@/lib/bitrix24/client.server";

export const Route = createFileRoute("/integrations/bitrix24/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Same defensive wrapper as integrations/amocrm/sync -- guarantees a
        // JSON body even if requireSuperAdmin or something below it throws,
        // so the client never has to parse a plain-text 500 as JSON.
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) {
            return Response.json({ error: "Only admins can trigger a sync." }, { status: 403 });
          }

          const startedAt = new Date().toISOString();
          const result = await syncDealsFromBitrix24(admin.organizationId);
          await logBitrix24SyncRun(admin.organizationId, "manual", startedAt, result);
          return Response.json(result, { status: result.error ? 500 : 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown sync error";
          return Response.json({ synced: 0, error: message }, { status: 500 });
        }
      },
    },
  },
});
