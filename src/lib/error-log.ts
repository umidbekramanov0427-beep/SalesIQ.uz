import { apiFetch } from "@/lib/api";
import { newThrottleState, shouldReportError } from "@/lib/error-throttle";

// Client-side error capture. Fire-and-forget POST to /errors/log so any
// crash, anywhere in the app, ends up in Admin Panel -> Xatoliklar instead
// of only in the browser console -- throttled (error-throttle.ts) so a
// crash loop can't flood the table.
const throttle = newThrottleState();

export function logClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  if (!shouldReportError(throttle, message, window.location.pathname, Date.now())) return;

  void apiFetch("/errors/log", {
    method: "POST",
    body: JSON.stringify({
      message,
      stack,
      source: "client",
      route: window.location.pathname,
      context,
    }),
  }).catch(() => undefined);
}

export function installGlobalErrorLogging() {
  if (typeof window === "undefined" || window.__errorLoggingInstalled) return;
  window.__errorLoggingInstalled = true;

  window.addEventListener("error", (event) => {
    const err = event.error ?? event.message;
    logClientError(err, { mechanism: "window.onerror" });
    reloadIfStaleChunk(err);
  });
  window.addEventListener("unhandledrejection", (event) => {
    logClientError(event.reason, { mechanism: "unhandledrejection" });
    reloadIfStaleChunk(event.reason);
  });

  // A tab left open across a new deploy still holds references to the old
  // build's chunk filenames -- navigating to a route whose JS changed then
  // 404s on import. Vite fires vite:preloadError for route chunks; a
  // React.lazy() component's failed import surfaces as an ordinary error or
  // rejection instead. Either way reload to pick up the current build --
  // at most once a minute, so a genuinely broken deploy can't reload-loop
  // (the old once-per-session guard also skipped every later deploy).
  window.addEventListener("vite:preloadError", (event) => {
    logClientError(event.payload, { mechanism: "vite:preloadError" });
    if (reloadForNewBuild()) event.preventDefault();
  });
}

const STALE_CHUNK =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

/** True when the error is a stale-build chunk failure and a reload was started. */
export function reloadIfStaleChunk(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return STALE_CHUNK.test(message) && reloadForNewBuild();
}

function reloadForNewBuild(): boolean {
  const key = "sq_stale_build_reload_at";
  let last = 0;
  try {
    last = Number(window.sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 60_000) return false;
    window.sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // Storage blocked: still reload, the browser cache then has the new build.
  }
  window.location.reload();
  return true;
}

declare global {
  interface Window {
    __errorLoggingInstalled?: boolean;
  }
}
