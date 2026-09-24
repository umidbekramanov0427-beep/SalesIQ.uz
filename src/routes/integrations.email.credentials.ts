import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import {
  disconnectSmtp,
  getSmtpCredentialsStatus,
  saveSmtpCredentials,
} from "@/lib/email/email-data.server";

type Body = {
  host?: unknown;
  port?: unknown;
  username?: unknown;
  password?: unknown;
  fromEmail?: unknown;
  fromName?: unknown;
};

export const Route = createFileRoute("/integrations/email/credentials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const status = await getSmtpCredentialsStatus(admin.organizationId);
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
          const host = typeof body.host === "string" ? body.host : "";
          const port = typeof body.port === "number" ? body.port : Number(body.port) || 587;
          const username = typeof body.username === "string" ? body.username : "";
          const password = typeof body.password === "string" ? body.password : "";
          const fromEmail = typeof body.fromEmail === "string" ? body.fromEmail : "";
          if (!host || !username || !password || !fromEmail) {
            return Response.json(
              { error: "Host, username, password and from address are required." },
              { status: 400 },
            );
          }
          await saveSmtpCredentials(admin.organizationId, admin.id, {
            host,
            port,
            username,
            password,
            fromEmail,
            fromName: typeof body.fromName === "string" ? body.fromName : "",
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
          await disconnectSmtp(admin.organizationId);
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not disconnect.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
