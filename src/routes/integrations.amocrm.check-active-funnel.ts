import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { checkActiveFunnel } from "@/lib/amocrm/client.server";

export const Route = createFileRoute("/integrations/amocrm/check-active-funnel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) {
            return Response.json({ error: "Only admins can do this." }, { status: 403 });
          }
          const result = await checkActiveFunnel(admin.organizationId);
          return Response.json(result, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Active funnel check failed.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
