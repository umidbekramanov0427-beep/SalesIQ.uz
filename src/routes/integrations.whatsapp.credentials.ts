import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import {
  disconnectWhatsApp,
  getWhatsAppCredentialsStatus,
  saveWhatsAppCredentials,
} from "@/lib/whatsapp/whatsapp-data.server";

type Body = { phoneNumberId?: unknown; wabaId?: unknown; accessToken?: unknown };

export const Route = createFileRoute("/integrations/whatsapp/credentials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const status = await getWhatsAppCredentialsStatus(admin.organizationId);
          return Response.json(status, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not load status.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const body = (await request.json().catch(() => ({}))) as Body;
          const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId : "";
          const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
          if (!phoneNumberId || !accessToken) {
            return Response.json(
              { error: "Phone number ID va access token shart." },
              { status: 400 },
            );
          }
          await saveWhatsAppCredentials(admin.organizationId, admin.id, {
            phoneNumberId,
            wabaId: typeof body.wabaId === "string" ? body.wabaId : "",
            accessToken,
          });
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not save.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          await disconnectWhatsApp(admin.organizationId);
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not disconnect.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
