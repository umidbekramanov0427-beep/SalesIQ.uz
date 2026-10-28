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
import {
  AUTO_ANALYSIS_LINKED_FILTER,
  autoAnalysisWindowFilter,
  readAutoAnalysisSettings,
  type AutoAnalysisSettings,
} from "@/lib/call-analysis-policy";
import {
  claimCall,
  MAX_ANALYSIS_ATTEMPTS,
  recordAnalysisFailure,
  releaseClaim,
} from "@/lib/call-analysis-queue.server";

// Analyzed concurrently (Promise.allSettled), not sequentially -- each call
// is a slow, independent Whisper+Gemini round trip, so running a batch in
// parallel keeps total wall time close to one call's instead of the sum of
// all of them, comfortably inside the cron job's timeout. Kept modest to
// stay within typical OpenAI/Gemini per-minute rate limits; a bigger
// backlog just clears over a few more 5-minute ticks instead of one.
// AI_ANALYSIS_BATCH (server env) lowers it for a Gemini key on the free
// tier, whose per-minute limit two requests a call x 8 calls exceeds at
// once: e.g. 2 = 2 calls every 5 minutes, up to ~24 an hour.
const BATCH_LIMIT = Math.min(
  8,
  Math.max(1, Math.round(Number(process.env["AI_ANALYSIS_BATCH"] ?? "") || 8)),
);

// A run gets ~120 s (the cron's timeout). A call still being analysed then
// (a busy AI retrying, a slow recording host) used to die silently with its
// attempt counted -- three such runs and it was never analysed. It now
// stops a bit earlier and is recorded as "AI busy", which gives the
// attempt back, so the next run tries it again.
const ANALYSIS_TIME_LIMIT_MS = 100_000;

function withinTimeLimit<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("AI xizmati hozir juda band (vaqt tugadi) — keyingi navbatda.")),
      ANALYSIS_TIME_LIMIT_MS,
    );
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

type PendingCall = { id: string; organization_id: string; analysis_attempts?: number };

// Companies' own rules (see autoAnalysisWindowFilter).
async function analysisSettingsByOrg(orgIds: string[]): Promise<Map<string, AutoAnalysisSettings>> {
  const { data } = await supabaseAdmin
    .from("integration_settings")
    .select("organization_id, config")
    .eq("key", "amocrm")
    .in("organization_id", orgIds);
  const map = new Map<string, AutoAnalysisSettings>();
  for (const row of data ?? []) {
    map.set(row.organization_id, readAutoAnalysisSettings(row.config));
  }
  return map;
}

async function loadPending(orgIds: string[]) {
  const window = autoAnalysisWindowFilter(orgIds, await analysisSettingsByOrg(orgIds), Date.now());
  const base = () =>
    supabaseAdmin
      .from("amocrm_calls")
      .select("id, organization_id, analysis_attempts")
      // Each company's window and minimum length; newest first; no
      // lead-less amoCRM calls (see call-analysis-policy.ts).
      .or(window)
      .not("recording_url", "is", null)
      .neq("recording_url", "")
      .is("analyzed_at", null)
      .lt("analysis_attempts", MAX_ANALYSIS_ATTEMPTS)
      .or(AUTO_ANALYSIS_LINKED_FILTER)
      .order("occurred_at", { ascending: false })
      .limit(BATCH_LIMIT);
  const res = await base();
  if (!res.error || !/analysis_attempts/.test(res.error.message)) {
    return { data: res.data as PendingCall[] | null, error: res.error };
  }
  // 20261018000000_call_analysis_attempts.sql not applied yet: old behaviour.
  const legacy = await supabaseAdmin
    .from("amocrm_calls")
    .select("id, organization_id")
    .or(window)
    .not("recording_url", "is", null)
    .is("analyzed_at", null)
    .order("occurred_at", { ascending: false })
    .limit(BATCH_LIMIT);
  return { data: legacy.data as PendingCall[] | null, error: legacy.error };
}

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
        // pending calls would sit at the head of the queue,
        // fail every 5 minutes, and starve every other org behind it.
        const accessByOrg = await loadAllOrgAccess();
        const eligibleOrgIds: string[] = [];
        for (const access of accessByOrg.values()) {
          if ((await canRunAiAnalysis(access)) === "ok") eligibleOrgIds.push(access.id);
        }
        if (eligibleOrgIds.length === 0) {
          return Response.json({ total: 0, analyzed: 0, failed: 0 });
        }

        const { data: pending, error } = await loadPending(eligibleOrgIds);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        // Calls the Python worker (or another tick) is already analysing
        // are left to it.
        const claimed = await Promise.all(
          (pending ?? []).map((c) => claimCall(c.id, { attempts: c.analysis_attempts })),
        );
        const calls = (pending ?? []).filter((_, i) => claimed[i]);
        const results = await Promise.allSettled(
          calls.map((call) => withinTimeLimit(analyzeCallById(call.organization_id, call.id))),
        );
        await Promise.all(
          results.map(async (r, i) => {
            const call = calls[i]!;
            if (r.status === "fulfilled") return releaseClaim(call.id);
            const reason: unknown = r.reason;
            const message = reason instanceof Error ? reason.message : String(reason);
            await recordAnalysisFailure(call.id, call.analysis_attempts, message);
          }),
        );
        const analyzed = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.length - analyzed;

        return Response.json({ total: results.length, analyzed, failed });
      },
    },
  },
});
