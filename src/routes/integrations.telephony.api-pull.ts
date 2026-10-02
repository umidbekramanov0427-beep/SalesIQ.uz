import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { fetchApiPullManagers, testApiPullHealth } from "@/lib/telephony/api-pull.server";

export const Route = createFileRoute("/integrations/telephony/api-pull")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const body = (await request.json().catch(() => ({}))) as { action?: unknown };
          if (body.action === "managers") {
            const result = await fetchApiPullManagers(admin.organizationId);
            return Response.json(result, { status: 200 });
          }
          const result = await testApiPullHealth(admin.organizationId);
          return Response.json(result, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "So'rov bajarilmadi.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
