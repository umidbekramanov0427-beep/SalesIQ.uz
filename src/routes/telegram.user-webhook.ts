import { createFileRoute } from "@tanstack/react-router";
import { isTgLiveRequest } from "@/lib/tg-live.server";
import { handleWorkWebhook, type WorkWebhook } from "@/lib/telegram-user/work-account.server";

// From services/tg-live (x-tglive-secret): a message in a salesperson's work
// Telegram account, or that the account stopped working.
export const Route = createFileRoute("/telegram/user-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isTgLiveRequest(request))
          return Response.json({ error: "Forbidden" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as WorkWebhook;
        try {
          await handleWorkWebhook(body);
        } catch (err) {
          console.error("[telegram-user] webhook", err);
          return Response.json({ ok: false }, { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
