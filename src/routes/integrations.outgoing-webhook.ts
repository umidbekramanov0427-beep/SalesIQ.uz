import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import {
  deleteOutgoingWebhook,
  getOutgoingWebhook,
  saveOutgoingWebhook,
} from "@/lib/integrations/operations-workspace.server";

type Body = { name?: unknown; url?: unknown; headers?: unknown };

function toHeaders(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof k === "string" && typeof v === "string" && k.trim()) out[k.trim()] = v;
  }
  return out;
}

export const Route = createFileRoute("/integrations/outgoing-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const webhook = await getOutgoingWebhook(admin.organizationId);
          return Response.json({ webhook }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not load webhook.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const body = (await request.json().catch(() => ({}))) as Body;
          const name = typeof body.name === "string" ? body.name : "";
          const url = typeof body.url === "string" ? body.url : "";
          if (!url) return Response.json({ error: "URL is required." }, { status: 400 });
          await saveOutgoingWebhook(
            admin.organizationId,
            admin.id,
            name,
            url,
            toHeaders(body.headers),
          );
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not save webhook.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          await deleteOutgoingWebhook(admin.organizationId);
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not delete webhook.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
