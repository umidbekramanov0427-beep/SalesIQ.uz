import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import {
  disconnectPayme,
  getPaymeCredentialsStatus,
  savePaymeCredentials,
} from "@/lib/payments/payments-data.server";

type Body = { merchantId?: unknown; secretKey?: unknown };

export const Route = createFileRoute("/integrations/payme/credentials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const status = await getPaymeCredentialsStatus(admin.organizationId);
        return Response.json(status);
      },
      POST: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as Body;
        const merchantId = typeof body.merchantId === "string" ? body.merchantId.trim() : "";
        const secretKey = typeof body.secretKey === "string" ? body.secretKey.trim() : "";
        if (!merchantId || !secretKey) {
          return Response.json({ error: "Merchant ID va secret key shart." }, { status: 400 });
        }
        try {
          await savePaymeCredentials(admin.organizationId, admin.id, { merchantId, secretKey });
          return Response.json({ ok: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not save.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
      DELETE: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        await disconnectPayme(admin.organizationId);
        return Response.json({ ok: true });
      },
    },
  },
});
