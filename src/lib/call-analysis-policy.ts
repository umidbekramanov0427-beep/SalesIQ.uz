// Which calls the background AI analysis picks up on its own. Connecting
// amoCRM brings in up to a year of call recordings; analysing all of them
// automatically would cost a year's worth of AI and keep today's calls
// waiting behind them for days. So the queue takes the newest first, only
// from the last AUTO_ANALYSIS_DAYS, and skips amoCRM calls too short to be
// a conversation or not tied to an imported lead (another pipeline's
// call). Anything older can still be analysed by hand from the call. Pure,
// so the rule is unit-tested.

export const AUTO_ANALYSIS_DAYS = 30;
export const MIN_AUTO_ANALYSIS_SECONDS = 15;

/** ISO time: calls before this are left for manual analysis. */
export function autoAnalysisSince(now: number): string {
  return new Date(now - AUTO_ANALYSIS_DAYS * 86_400_000).toISOString();
}

/** The same rule for one call (uploaded and telephony calls have no amoCRM duration). */
export function autoAnalysable(
  call: {
    source: string | null;
    duration_seconds: number | null;
    occurred_at: string;
    lead_id: string | null;
  },
  now: number,
): boolean {
  if (call.occurred_at < autoAnalysisSince(now)) return false;
  if ((call.source ?? "amocrm") !== "amocrm") return true;
  return !!call.lead_id && (call.duration_seconds ?? 0) >= MIN_AUTO_ANALYSIS_SECONDS;
}

/** PostgREST `or` filters for autoAnalysable's amoCRM parts (both apply). */
export const AUTO_ANALYSIS_DURATION_FILTER = `source.neq.amocrm,duration_seconds.gte.${MIN_AUTO_ANALYSIS_SECONDS}`;
export const AUTO_ANALYSIS_LINKED_FILTER = "source.neq.amocrm,lead_id.not.is.null";

/**
 * PostgREST `or` filter for the queue's companies and their windows. A
 * company can set its own start date (integration_settings amocrm
 * config.analysis_since, e.g. "analyse from 6 October"); it only narrows
 * the rolling window, never widens it. A fixed date rather than "last N
 * days" because the queue works newest first: with a sliding window the
 * oldest calls of a big backlog would slide out before their turn.
 */
export function autoAnalysisWindowFilter(
  orgIds: string[],
  sinceByOrg: Map<string, string>,
  now: number,
): string {
  const rolling = autoAnalysisSince(now);
  return orgIds
    .map((id) => {
      const own = sinceByOrg.get(id);
      const from = own && own > rolling ? own : rolling;
      return `and(organization_id.eq.${id},occurred_at.gte.${from})`;
    })
    .join(",");
}
