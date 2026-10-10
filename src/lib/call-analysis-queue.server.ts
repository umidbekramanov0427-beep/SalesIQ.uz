// Server-only. Shared by the two things that work through the AI call
// analysis backlog: the pg_cron tick (audio-analytics.analyze-pending) and
// the external Python worker (services/ai-worker) that calls
// audio-analytics.analyze-one one call at a time.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SUBSCRIPTION_EXPIRED_MESSAGE, TRIAL_AI_LIMIT_MESSAGE } from "@/lib/org-access";

// A call that keeps failing (broken file, too long for the AI, dead link)
// is skipped after this many background attempts. Analysing it by hand
// from Audio Analytics still works.
export const MAX_ANALYSIS_ATTEMPTS = 3;

// The AI being busy says nothing about the call itself, so it doesn't use up
// an attempt; the next round simply tries again.
export const AI_BUSY = /juda band|overload|unavailable|503|429|rate limit/i;

// How long a claimed call is left alone before another runner may take it
// (a runner that died mid-analysis must not hold the call forever).
const CLAIM_TTL_MS = 10 * 60_000;

export type AnalysisFailureKind = "org_blocked" | "ai_busy" | "failed";

export function classifyAnalysisError(message: string): AnalysisFailureKind {
  if (message === SUBSCRIPTION_EXPIRED_MESSAGE || message === TRIAL_AI_LIMIT_MESSAGE) {
    return "org_blocked";
  }
  return AI_BUSY.test(message) ? "ai_busy" : "failed";
}

/**
 * Marks the call as being analysed right now, so two runners (the cron tick
 * and the worker, or two worker replicas) never pay for the same call twice.
 * False when someone else holds a fresh claim. Until
 * 20261107000000_ai_worker.sql runs the column is missing and every call
 * counts as claimable.
 */
export async function claimCall(callId: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const staleBefore = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
  let query = supabaseAdmin
    .from("amocrm_calls")
    .update({ analysis_started_at: new Date().toISOString() })
    .eq("id", callId)
    .or(`analysis_started_at.is.null,analysis_started_at.lt.${staleBefore}`);
  if (!opts.force) query = query.is("analyzed_at", null);
  const { data, error } = await query.select("id");
  if (error) return /analysis_started_at/.test(error.message);
  return (data?.length ?? 0) > 0;
}

/** Releases the claim and, unless the AI was just busy, counts the attempt. */
export async function recordAnalysisFailure(
  callId: string,
  attempts: number | undefined,
  message: string,
): Promise<void> {
  const kind = classifyAnalysisError(message);
  const patch: { analysis_error: string; analysis_started_at: null; analysis_attempts?: number } = {
    analysis_error: message.slice(0, 1000),
    analysis_started_at: null,
  };
  if (attempts !== undefined && kind === "failed") patch.analysis_attempts = attempts + 1;
  const { error } = await supabaseAdmin.from("amocrm_calls").update(patch).eq("id", callId);
  if (error && /analysis_started_at/.test(error.message)) {
    const { analysis_started_at: _drop, ...legacy } = patch;
    await supabaseAdmin.from("amocrm_calls").update(legacy).eq("id", callId);
  }
}

/** Drops the claim after a successful analysis (best effort). */
export async function releaseClaim(callId: string): Promise<void> {
  await supabaseAdmin
    .from("amocrm_calls")
    .update({ analysis_started_at: null })
    .eq("id", callId)
    .then(
      () => undefined,
      () => undefined,
    );
}
