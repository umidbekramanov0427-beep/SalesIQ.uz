// Speed to lead: a new lead nobody has called or written to yet. After
// WARN_MINUTES the lead's manager is reminded; after ESCALATE_MINUTES the
// head of sales is told too. The rules are pure (unit-tested); the cron
// route and the funnel card both use them.

export const WARN_MINUTES = 5;
export const ESCALATE_MINUTES = 15;
/** Older leads are not chased any more -- the alarm is for fresh ones. */
export const WATCH_HOURS = 24;

/** 0 = nothing to say yet, 1 = remind the manager, 2 = tell the head of sales. */
export type SpeedLevel = 0 | 1 | 2;

export function speedLevel(createdAt: Date, now: Date): SpeedLevel {
  const minutes = (now.getTime() - createdAt.getTime()) / 60_000;
  if (minutes >= ESCALATE_MINUTES) return 2;
  if (minutes >= WARN_MINUTES) return 1;
  return 0;
}

/**
 * The alert a lead needs now: the level it has reached and not been told
 * about yet, or null. A contacted, closed or old lead needs none.
 */
export function alertDue(
  lead: { createdAt: Date; contacted: boolean; closed: boolean; alertedLevel: number },
  now: Date,
): SpeedLevel | null {
  if (lead.contacted || lead.closed) return null;
  if (now.getTime() - lead.createdAt.getTime() > WATCH_HOURS * 3_600_000) return null;
  const level = speedLevel(lead.createdAt, now);
  return level > lead.alertedLevel ? level : null;
}

/** The funnel card's timer: "4 daq" / "1 soat 12 daq" and how urgent it is. */
export function waitingBadge(
  createdAt: Date,
  now: Date,
): { minutes: number; tone: "calm" | "warn" | "late" } {
  const minutes = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 60_000));
  const level = speedLevel(createdAt, now);
  return { minutes, tone: level === 2 ? "late" : level === 1 ? "warn" : "calm" };
}
