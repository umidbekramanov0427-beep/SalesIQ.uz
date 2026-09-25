import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import {
  disconnectClick,
  getClickCredentialsStatus,
  saveClickCredentials,
} from "@/lib/payments/payments-data.server";

type Body = { serviceId?: unknown; merchantId?: unknown; secretKey?: unknown };

export const Route = createFileRoute("/integrations/click/credentials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const status = await getClickCredentialsStatus(admin.organizationId);
        return Response.json(status);
      },
      POST: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as Body;
        const serviceId = typeof body.serviceId === "string" ? body.serviceId.trim() : "";
        const merchantId = typeof body.merchantId === "string" ? body.merchantId.trim() : "";
        const secretKey = typeof body.secretKey === "string" ? body.secretKey.trim() : "";
        if (!serviceId || !merchantId || !secretKey) {
          return Response.json(
            { error: "Service ID, merchant ID va secret key shart." },
            { status: 400 },
          );
        }
        try {
          await saveClickCredentials(admin.organizationId, admin.id, {
            serviceId,
            merchantId,
            secretKey,
          });
          return Response.json({ ok: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not save.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
      DELETE: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        await disconnectClick(admin.organizationId);
        return Response.json({ ok: true });
      },
    },
  },
});
