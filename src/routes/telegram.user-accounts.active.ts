import { createFileRoute } from "@tanstack/react-router";
import { isTgLiveRequest } from "@/lib/tg-live.server";
import { activeWorkAccounts } from "@/lib/telegram-user/work-account.server";

// For services/tg-live only (x-tglive-secret, on the same machine): the
// work Telegram accounts to keep online, with their sessions.
export const Route = createFileRoute("/telegram/user-accounts/active")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isTgLiveRequest(request))
          return Response.json({ error: "Forbidden" }, { status: 403 });
        return Response.json({ accounts: await activeWorkAccounts() });
      },
    },
  },
});
