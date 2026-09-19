import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { analyzeCallById } from "@/routes/audio-analytics.analyze";

// One-time backfill: the auto-analysis cron (audio-analysis-auto-5min) only
// ever picks up calls with analyzed_at is null, so a call that was already
// analyzed under an older, shallower schema (before timestamps, quotes-
// with-speaker, or the customer-profile extraction existed) never gets
// upgraded automatically. This re-analyzes EVERY call with a recording,
// analyzed or not, a page at a time -- visit repeatedly with an increasing
// `offset` until `done: true`.
//   https://<your-domain>/admin/reanalyze-all-calls?secret=<MIGRATION_SECRET>&offset=0&limit=10
export const Route = createFileRoute("/admin/reanalyze-all-calls")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        const expected = process.env["MIGRATION_SECRET"];
        if (!expected || secret !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
        // Each call is a full download+transcribe+score round trip run
        // concurrently with the rest of the page -- a limit of 10 timed out
        // the serverless function in practice (504), so this is capped much
        // lower than the /admin/run-migrations-style batch sizes elsewhere.
        const limit = Math.min(4, Math.max(1, Number(url.searchParams.get("limit") ?? "3") || 3));

        const { data: calls, error } = await supabaseAdmin
          .from("amocrm_calls")
          .select("id, organization_id")
          .not("recording_url", "is", null)
          .order("occurred_at", { ascending: true })
          .range(offset, offset + limit - 1);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const results = await Promise.allSettled(
          (calls ?? []).map((c) => analyzeCallById(c.organization_id, c.id)),
        );
        const analyzed = results.filter((r) => r.status === "fulfilled").length;
        const failures = results
          .map((r, i) =>
            r.status === "rejected" ? { id: calls![i]!.id, error: String(r.reason) } : null,
          )
          .filter((f): f is { id: string; error: string } => f !== null);

        return Response.json({
          offset,
          limit,
          returned: calls?.length ?? 0,
          analyzed,
          failed: failures.length,
          failures,
          done: (calls?.length ?? 0) < limit,
          nextOffset: offset + limit,
        });
      },
    },
  },
});
