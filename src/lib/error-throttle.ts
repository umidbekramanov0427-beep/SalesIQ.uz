// Keeps one crashing page from flooding error_logs: a page stuck in a
// render loop once sent the same error 38,000 times in a week. The same
// error (message + page) goes out at most once a minute, a page load sends
// at most MAX_PER_PAGE reports, and harmless browser notices are skipped.

const REPEAT_MS = 60_000;
export const MAX_PER_PAGE = 30;

// The browser's own notice that a resize handler ran late -- not a bug.
const BENIGN = /ResizeObserver loop (completed|limit exceeded)/i;

export type ThrottleState = { lastSent: Map<string, number>; sent: number };

export function newThrottleState(): ThrottleState {
  return { lastSent: new Map(), sent: 0 };
}

/** Whether this error should be reported now; records it when it is. */
export function shouldReportError(
  state: ThrottleState,
  message: string,
  route: string,
  now: number,
): boolean {
  if (BENIGN.test(message)) return false;
  if (state.sent >= MAX_PER_PAGE) return false;
  const key = `${route}\u0000${message}`;
  const last = state.lastSent.get(key);
  if (last !== undefined && now - last < REPEAT_MS) return false;
  state.lastSent.set(key, now);
  state.sent++;
  return true;
}
