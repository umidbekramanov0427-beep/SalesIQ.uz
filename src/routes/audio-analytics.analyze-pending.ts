// Called on a schedule (see the pg_cron job in the accompanying migration),
// not by a browser -- same shared-secret pattern as
// integrations.amocrm.sync-all.ts and telegram.send-daily-report.ts, since
// there's no logged-in user session to check here.
//
// Root cause this exists to fix: AmoCRM call sync (syncCallsFromAmo, on its
// own 5-minute cron) reliably populates amocrm_calls.recording_url, but
// nothing ever called Gemini/Whisper on those recordings automatically --
// analyzeCallById only ever ran from the "Tahlil qilish" button a human has
// to click on Audio Analytics, one call at a time. At real call volume,
// virtually nothing ever gets analyzed this way, so lead_quality_stage_id
// (and everything downstream that depends on it -- Lid sifati, the
// Marketing tab, the daily report) stays empty. This job finds calls with a
// recording but no analysis yet and analyzes them in the background.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { analyzeCallById } from "@/routes/audio-analytics.analyze";
import { canRunAiAnalysis, loadAllOrgAccess } from "@/lib/org-access.server";

// Analyzed concurrently (Promise.allSettled), not sequentially -- each call
// is a slow, independent Whisper+Gemini round trip, so running a batch in
// parallel keeps total wall time close to one call's instead of the sum of
// all of them, comfortably inside the cron job's timeout. Kept modest to
// stay within typical OpenAI/Gemini per-minute rate limits; a bigger
// backlog just clears over a few more 5-minute ticks instead of one.
const BATCH_LIMIT = 8;

export const Route = createFileRoute("/audio-analytics/analyze-pending")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CRON_SECRET"];
        const got = request.headers.get("x-cron-secret");
        if (!expected || got !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Only orgs that may still spend AI analysis right now -- an expired
        // org or a trial that's used its allowance is skipped up front. If
        // they weren't filtered here, their (possibly large) backlog of
        // pending calls would sit at the head of this oldest-first queue,
        // fail every 5 minutes, and starve every other org behind it.
        const accessByOrg = await loadAllOrgAccess();
        const eligibleOrgIds: string[] = [];
        for (const access of accessByOrg.values()) {
          if ((await canRunAiAnalysis(access)) === "ok") eligibleOrgIds.push(access.id);
        }
        if (eligibleOrgIds.length === 0) {
          return Response.json({ total: 0, analyzed: 0, failed: 0 });
        }

        const { data: pending, error } = await supabaseAdmin
          .from("amocrm_calls")
          .select("id, organization_id")
          .in("organization_id", eligibleOrgIds)
          .not("recording_url", "is", null)
          .is("analyzed_at", null)
          .order("occurred_at", { ascending: true })
          .limit(BATCH_LIMIT);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const results = await Promise.allSettled(
          (pending ?? []).map((call) => analyzeCallById(call.organization_id, call.id)),
        );
        const analyzed = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.length - analyzed;

        return Response.json({ total: results.length, analyzed, failed });
      },
    },
  },
});
