import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { refreshAmoManagerMapping } from "@/lib/amocrm/client.server";

export const Route = createFileRoute("/integrations/amocrm/sync-users")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) {
            return Response.json({ error: "Only admins can do this." }, { status: 403 });
          }
          const mapped = await refreshAmoManagerMapping(admin.organizationId);
          return Response.json({ mapped }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
