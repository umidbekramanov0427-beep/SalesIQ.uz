import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Public liveness check for the external uptime monitor
// (.github/workflows/uptime.yml): the app answers and the database replies
// within 5 seconds. 200 = healthy, 503 = something is down. Says nothing
// about the data.
export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        let db: "ok" | "down" = "down";
        try {
          const probe = supabaseAdmin.from("platform_settings").select("id").limit(1);
          const timeout = new Promise<{ error: Error }>((resolve) =>
            setTimeout(() => resolve({ error: new Error("timeout") }), 5_000),
          );
          const { error } = await Promise.race([probe, timeout]);
          db = error ? "down" : "ok";
        } catch {
          db = "down";
        }
        const ok = db === "ok";
        return Response.json(
          {
            ok,
            db,
            dbMs: Date.now() - started,
            env: process.env["VERCEL_ENV"] ?? "development",
            version: (process.env["VERCEL_GIT_COMMIT_SHA"] ?? "local").slice(0, 7),
            time: new Date().toISOString(),
          },
          { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
