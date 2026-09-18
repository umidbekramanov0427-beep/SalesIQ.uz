import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { logAmoSyncRun, syncLeadsFromAmo } from "@/lib/amocrm/client.server";

export const Route = createFileRoute("/integrations/amocrm/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // syncLeadsFromAmo already catches its own errors and always
        // resolves to a {synced, error?} object, but requireSuperAdmin (or
        // an infra-level failure) throwing here would otherwise escape as
        // an unhandled 500 with a plain-text/HTML body — the client's
        // res.json() would then throw "Unexpected token 'I', "Internal
        // s"... is not valid JSON" instead of ever surfacing the real
        // reason. Guarantee a JSON body no matter what goes wrong.
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) {
            return Response.json({ error: "Only admins can trigger a sync." }, { status: 403 });
          }

          const startedAt = new Date().toISOString();
          const result = await syncLeadsFromAmo(admin.organizationId);
          await logAmoSyncRun(admin.organizationId, "manual", startedAt, result);
          return Response.json(result, { status: result.error ? 500 : 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown sync error";
          return Response.json({ synced: 0, error: message }, { status: 500 });
        }
      },
    },
  },
});
