import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { disconnectAmoCrm } from "@/lib/amocrm/client.server";

// Platform-scoped counterpart to /admin/amocrm-disconnect: that route
// disconnects the caller's own org (requireSuperAdmin), while a platform
// owner has no org of their own and instead names the target company
// explicitly in the request body.
export const Route = createFileRoute("/platform/amocrm-disconnect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });

        const body = (await request.json().catch(() => null)) as {
          organizationId?: string;
        } | null;
        if (!body?.organizationId) {
          return Response.json({ error: "Missing organizationId" }, { status: 400 });
        }

        try {
          await disconnectAmoCrm(body.organizationId);
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not disconnect.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
