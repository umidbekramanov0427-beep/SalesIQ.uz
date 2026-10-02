import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import {
  createOutgoingWebhook,
  deleteOutgoingWebhook,
  listOutgoingWebhooks,
  toggleOutgoingWebhook,
  type OutgoingWebhookEvent,
} from "@/lib/webhooks/outgoing-webhooks.server";

const VALID_EVENTS: OutgoingWebhookEvent[] = [
  "call_created",
  "recording_ready",
  "ai_analysis_done",
];

type Body = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  enabled?: unknown;
  events?: unknown;
  headers?: unknown;
};

function parseEvents(raw: unknown): OutgoingWebhookEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is OutgoingWebhookEvent => VALID_EVENTS.includes(e as never));
}

function parseHeaders(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === "string" && typeof v === "string" && k.trim()) out[k.trim()] = v;
  }
  return out;
}

export const Route = createFileRoute("/integrations/webhook-destinations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const webhooks = await listOutgoingWebhooks(admin.organizationId);
          return Response.json({ webhooks }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not load destinations.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const body = (await request.json().catch(() => ({}))) as Body;

          // Toggling an existing destination's enabled flag only sends {id, enabled}.
          if (typeof body.id === "string" && typeof body.enabled === "boolean" && !body.url) {
            await toggleOutgoingWebhook(admin.organizationId, body.id, body.enabled);
            return Response.json({ ok: true }, { status: 200 });
          }

          const name = typeof body.name === "string" ? body.name.trim() : "";
          const url = typeof body.url === "string" ? body.url.trim() : "";
          if (!name || !url) {
            return Response.json({ error: "Nomi va manzil majburiy." }, { status: 400 });
          }
          try {
            new URL(url);
          } catch {
            return Response.json({ error: "Noto'g'ri URL manzil." }, { status: 400 });
          }
          await createOutgoingWebhook(admin.organizationId, admin.id, {
            name,
            url,
            enabled: body.enabled !== false,
            events: parseEvents(body.events),
            headers: parseHeaders(body.headers),
          });
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not save destination.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const id = new URL(request.url).searchParams.get("id");
          if (!id) return Response.json({ error: "id majburiy." }, { status: 400 });
          await deleteOutgoingWebhook(admin.organizationId, id);
          return Response.json({ ok: true }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not delete destination.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
