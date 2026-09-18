import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { setAmoAppCredentialsDirect } from "@/lib/amocrm/client.server";

// Lets the platform owner set a target company's AmoCRM app credentials
// (client_id/client_secret) before that company has its own super_admin
// do it -- otherwise /integrations/amocrm/connect?org=<id> has nothing to
// authorize against for a brand-new company.
export const Route = createFileRoute("/platform/amocrm-credentials")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });

        const body = (await request.json().catch(() => null)) as {
          organizationId?: string;
          clientId?: string;
          clientSecret?: string;
        } | null;
        if (!body?.organizationId || !body.clientId?.trim() || !body.clientSecret?.trim()) {
          return Response.json({ error: "Missing fields" }, { status: 400 });
        }

        try {
          await setAmoAppCredentialsDirect(body.organizationId, body.clientId, body.clientSecret);
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not save credentials.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
