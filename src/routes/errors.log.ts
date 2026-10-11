import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { captureToSentry } from "@/lib/sentry.server";

type Body = {
  message?: string;
  stack?: string;
  source?: string;
  route?: string;
  context?: Record<string, unknown>;
};

function clamp(value: string | undefined, max: number): string | undefined {
  if (!value) return value;
  return value.length > max ? value.slice(0, max) : value;
}

export const Route = createFileRoute("/errors/log")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Body;
        const message = clamp(body.message, 2000);
        if (!message) return Response.json({ error: "message is required" }, { status: 400 });

        const userId = await getRequestUserId(request).catch(() => null);

        const stack = clamp(body.stack, 8000);
        const source = body.source ?? "client";
        const context = JSON.parse(JSON.stringify(body.context ?? {}));
        // A tab left open across a deploy asks for the old build's chunks and
        // reloads itself (error-log.ts) -- expected after every deploy, so
        // one low-level Sentry issue instead of a new alert each time.
        const staleChunk = context?.mechanism === "vite:preloadError";
        const [{ error }] = await Promise.all([
          supabaseAdmin.from("error_logs").insert({
            message,
            stack: stack ?? null,
            source,
            route: body.route ?? null,
            user_id: userId,
            context,
          }),
          captureToSentry({
            message,
            stack,
            level: staleChunk ? "warning" : "error",
            source,
            transaction: body.route,
            userId,
            extra: context,
            ...(staleChunk ? { fingerprint: ["stale_chunk_after_deploy"] } : {}),
          }),
        ]);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ ok: true });
      },
    },
  },
});
