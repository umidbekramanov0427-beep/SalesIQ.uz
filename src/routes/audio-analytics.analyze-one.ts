import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { analyzeCallById } from "@/routes/audio-analytics.analyze";
import {
  claimCall,
  classifyAnalysisError,
  recordAnalysisFailure,
  releaseClaim,
} from "@/lib/call-analysis-queue.server";

// Analyses exactly ONE call -- the unit of work for the Python AI worker
// (services/ai-worker). One call per request keeps every request short, so
// the serverless time limit that cut off bigger batches (see
// admin.reanalyze-all-calls.ts) never applies: the worker, which has no
// such limit, does the queueing, pacing and retries. The analysis itself
// (prompts, scoring, writing results) stays here, in one place.
//
// Auth: header x-worker-secret must equal the WORKER_SECRET env var.
// Body: { "callId": "<amocrm_calls.id>", "force": false }
//   force = re-analyse a call that already has an analysis.
// Answer (always 200 once authorised, so the worker can read `status`):
//   { status: "done" | "skipped" | "org_blocked" | "ai_busy" | "failed", error? }
function authorised(request: Request): boolean {
  const expected = process.env["WORKER_SECRET"];
  const got = request.headers.get("x-worker-secret");
  if (!expected || !got || got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export const Route = createFileRoute("/audio-analytics/analyze-one")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorised(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = (await request.json().catch(() => ({}))) as {
          callId?: string;
          force?: boolean;
        };
        if (!body.callId) return Response.json({ error: "callId is required" }, { status: 400 });

        const { data: call } = await supabaseAdmin
          .from("amocrm_calls")
          .select("id, organization_id, analysis_attempts, analyzed_at, recording_url")
          .eq("id", body.callId)
          .maybeSingle();
        if (!call || !call.recording_url) return Response.json({ status: "skipped" });
        if (call.analyzed_at && !body.force) return Response.json({ status: "skipped" });
        if (!(await claimCall(call.id, { force: !!body.force }))) {
          return Response.json({ status: "skipped" });
        }

        try {
          await analyzeCallById(call.organization_id, call.id);
          await releaseClaim(call.id);
          return Response.json({ status: "done" });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await recordAnalysisFailure(call.id, call.analysis_attempts, message);
          return Response.json({ status: classifyAnalysisError(message), error: message });
        }
      },
    },
  },
});
