import { apiFetch } from "@/lib/api";

// Client-side error capture. Fire-and-forget POST to /errors/log so any
// crash, anywhere in the app, ends up in Admin Panel -> Xatoliklar instead
// of only in the browser console.
export function logClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

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
    logClientError(event.error ?? event.message, { mechanism: "window.onerror" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    logClientError(event.reason, { mechanism: "unhandledrejection" });
  });

  // A tab left open across a new deploy still holds references to the old
  // build's chunk filenames -- navigating to a route whose JS changed then
  // 404s on import and Vite fires this event. Left unhandled, that surfaces
  // as the router's bare unstyled fallback ("Something went wrong!") since
  // a failed module import happens outside any component's render, so our
  // own styled error boundary never gets a chance to catch it. Reload once
  // (guarded, so a genuinely broken deploy doesn't reload-loop) to pick up
  // the current build instead.
  window.addEventListener("vite:preloadError", (event) => {
    logClientError(event.payload, { mechanism: "vite:preloadError" });
    const key = "sq_reloaded_after_preload_error";
    if (!window.sessionStorage.getItem(key)) {
      window.sessionStorage.setItem(key, "1");
      event.preventDefault();
      window.location.reload();
    }
  });
}

declare global {
  interface Window {
    __errorLoggingInstalled?: boolean;
  }
}
