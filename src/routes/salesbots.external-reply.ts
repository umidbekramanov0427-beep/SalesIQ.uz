import { createFileRoute } from "@tanstack/react-router";
import { handleExternalReply } from "@/lib/automations/engine.server";

// An external salesbot (n8n, Make, your own server...) answers here:
// POST { run_id, text?, actions?, finish? } with header
// x-salesiq-signature = HMAC-SHA256(bot secret, raw body).
export const Route = createFileRoute("/salesbots/external-reply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const result = await handleExternalReply(raw, request.headers.get("x-salesiq-signature"));
        if ("error" in result) {
          return Response.json({ error: result.error }, { status: result.status });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
