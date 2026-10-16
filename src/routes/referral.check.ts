import { createFileRoute } from "@tanstack/react-router";
import { checkCode } from "@/lib/referral.server";

// Public: the sign-up page asks whether the invitation it came with is real
// (to show "+N days" and send it along). Says nothing about who owns it.
export const Route = createFileRoute("/referral/check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const code = new URL(request.url).searchParams.get("code");
        return Response.json(await checkCode(code), {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
