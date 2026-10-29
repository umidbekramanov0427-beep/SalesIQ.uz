import { apiFetch } from "@/lib/api";
import { newThrottleState, shouldReportError } from "@/lib/error-throttle";
import { parseLastReload, shouldReloadFor, staleReloadTarget } from "@/lib/stale-build";

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
  // fails on import. Vite fires vite:preloadError for route chunks; a
  // React.lazy() component's failed import surfaces as an ordinary error or
  // rejection instead. Either way load the page the person was going to
  // with the current build (stale-build.ts).
  window.addEventListener("vite:preloadError", (event) => {
    logClientError(event.payload, { mechanism: "vite:preloadError" });
    if (reloadForNewBuild()) event.preventDefault();
  });
}

const STALE_CHUNK =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

// The navigation in progress (set by the router, see router.tsx), so a
// failed chunk sends the person on to where they clicked.
let pendingHref: string | null = null;
export function setPendingNavigation(href: string | null) {
  pendingHref = href;
}

/** True when the error is a stale-build chunk failure and a reload was started. */
export function reloadIfStaleChunk(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return STALE_CHUNK.test(message) && reloadForNewBuild();
}

function reloadForNewBuild(): boolean {
  const key = "sq_stale_build_reload";
  const here = window.location.pathname + window.location.search + window.location.hash;
  const target = staleReloadTarget(pendingHref, here);
  try {
    const last = parseLastReload(window.sessionStorage.getItem(key));
    if (!shouldReloadFor(target, last, Date.now())) return false;
    window.sessionStorage.setItem(key, JSON.stringify({ target, at: Date.now() }));
  } catch {
    // Storage blocked: still reload, the browser then has the new build.
  }
  if (target === here) window.location.reload();
  else window.location.assign(target);
  return true;
}

declare global {
  interface Window {
    __errorLoggingInstalled?: boolean;
  }
}
