import { createFileRoute } from "@tanstack/react-router";
import { parseInstagramWebhook } from "@/lib/instagram/events";
import {
  instagramConfigured,
  instagramVerifyToken,
  validSignature,
} from "@/lib/instagram/instagram.server";
import { handleInstagramMessage } from "@/lib/instagram/inbound.server";

// Meta's webhook for Instagram Direct (one URL for every company; the
// entry id says whose account a message is for).
// GET: the subscription check (hub.verify_token = INSTAGRAM_WEBHOOK_VERIFY_TOKEN).
// POST: messages, signed with X-Hub-Signature-256 by the app secret.
export const Route = createFileRoute("/integrations/instagram/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const expected = instagramVerifyToken();
        if (
          q.get("hub.mode") === "subscribe" &&
          expected &&
          q.get("hub.verify_token") === expected
        ) {
          return new Response(q.get("hub.challenge") ?? "", {
            headers: { "content-type": "text/plain" },
          });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        if (!instagramConfigured()) return new Response("Not configured", { status: 503 });
        const raw = await request.text();
        if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) {
          return new Response("Bad signature", { status: 401 });
        }
        let body: unknown = null;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        // In order: a new client's first messages must not race to create
        // two leads.
        for (const m of parseInstagramWebhook(body)) {
          await handleInstagramMessage(m).catch((err) =>
            console.error("[instagram webhook] message failed", err),
          );
        }
        // Always 200 once verified: Meta retries non-200s and eventually
        // turns the subscription off.
        return new Response("ok");
      },
    },
  },
});
