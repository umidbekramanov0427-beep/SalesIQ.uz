import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { disconnectBitrix24 } from "@/lib/bitrix24/client.server";

export const Route = createFileRoute("/integrations/bitrix24/disconnect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });

        try {
          await disconnectBitrix24(admin.organizationId);
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not disconnect.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
