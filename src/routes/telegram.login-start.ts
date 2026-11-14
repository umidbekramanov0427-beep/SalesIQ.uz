import { createFileRoute } from "@tanstack/react-router";
import { requestIp } from "@/lib/request-meta.server";
import { startTelegramLogin } from "@/lib/telegram-login.server";

// "Telegram orqali kirish": a new 5-minute request; the page keeps the
// secret and opens the t.me link (see telegram-login.server.ts).
export const Route = createFileRoute("/telegram/login-start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const r = await startTelegramLogin(requestIp(request));
        if (!r.ok) {
          const status = r.error === "too_many" ? 429 : r.error === "not_configured" ? 503 : 500;
          return Response.json({ error: r.error }, { status });
        }
        return Response.json({ secret: r.secret, url: r.url });
      },
    },
  },
});
