import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";

// Sign-in confirmation code for this sign-in (the token's session):
//   GET                     { required, verified, channel, to, wait }
//   POST {action: "send"}   send (or re-send) the code
//   POST {action: "verify", code}
export const Route = createFileRoute("/account/login-code")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { authMethods, authSessionId } = await import("@/lib/request-meta.server");
        const { loginCodeStatus } = await import("@/lib/login-code.server");
        const status = await loginCodeStatus(userId, authSessionId(request), authMethods(request));
        return Response.json(status, {
          headers: { "cache-control": "no-store" },
        });
      },
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { authSessionId } = await import("@/lib/request-meta.server");
        const sessionId = authSessionId(request);
        if (!sessionId) return Response.json({ error: "NO_SESSION" }, { status: 400 });
        const b = (await request.json().catch(() => ({}))) as { action?: unknown; code?: unknown };
        const { sendLoginCode, verifyLoginCode } = await import("@/lib/login-code.server");
        if (b.action === "send") {
          const r = await sendLoginCode(userId, sessionId);
          return Response.json(r, { status: r.ok ? 200 : r.error === "WAIT" ? 429 : 400 });
        }
        if (b.action === "verify" && typeof b.code === "string") {
          const r = await verifyLoginCode(userId, sessionId, b.code);
          return Response.json(r, { status: r.ok ? 200 : 400 });
        }
        return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
      },
    },
  },
});
