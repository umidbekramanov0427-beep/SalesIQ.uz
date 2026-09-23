import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import {
  generateExternalApiToken,
  getExternalApiTokenStatus,
  revokeExternalApiToken,
} from "@/lib/integrations/operations-workspace.server";

export const Route = createFileRoute("/integrations/external-api-token")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const status = await getExternalApiTokenStatus(admin.organizationId);
          return Response.json(status, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not load token status.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const token = await generateExternalApiToken(admin.organizationId, admin.id);
          return Response.json({ token }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not generate token.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          await revokeExternalApiToken(admin.organizationId);
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not revoke token.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
