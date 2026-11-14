import { createFileRoute } from "@tanstack/react-router";
import { pollTelegramLogin } from "@/lib/telegram-login.server";

// The page asks (with its own secret, in the body) whether its Telegram
// sign-in was confirmed; the one-time token is handed out once.
export const Route = createFileRoute("/telegram/login-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { secret?: unknown };
        const r = await pollTelegramLogin(typeof body.secret === "string" ? body.secret : "");
        return Response.json(r, {
          status: r.status === "too_many" ? 429 : 200,
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
