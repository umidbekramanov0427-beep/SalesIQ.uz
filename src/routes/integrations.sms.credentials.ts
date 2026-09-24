import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import {
  disconnectSms,
  getSmsCredentialsStatus,
  saveSmsCredentials,
} from "@/lib/sms/sms-data.server";

type Body = { email?: unknown; password?: unknown; senderName?: unknown };

export const Route = createFileRoute("/integrations/sms/credentials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const status = await getSmsCredentialsStatus(admin.organizationId);
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
          const email = typeof body.email === "string" ? body.email : "";
          const password = typeof body.password === "string" ? body.password : "";
          if (!email || !password) {
            return Response.json({ error: "Email va parol shart." }, { status: 400 });
          }
          await saveSmsCredentials(admin.organizationId, admin.id, {
            email,
            password,
            senderName: typeof body.senderName === "string" ? body.senderName : "",
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
          await disconnectSms(admin.organizationId);
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not disconnect.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
